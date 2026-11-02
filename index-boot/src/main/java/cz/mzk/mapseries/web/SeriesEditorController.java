package cz.mzk.mapseries.web;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;
import cz.mzk.mapseries.github.GithubWriteService;
import jakarta.servlet.http.HttpServletRequest;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Modern, server-rendered series editor (Phase 1): list series, create/edit a
 * series' definition, and commit it back to the data repo server-side — reusing
 * the admin's GitHub OAuth ({@link AuthService}) and {@link GithubWriteService},
 * so there is no browser-side token dance. Replaces the legacy /edit frontend's
 * definition-editing role. Per-sheet map/table editing follows in Phase 2.
 */
@Controller
public class SeriesEditorController {

    private static final String CONTENT_DEFINITION_PATH = "content-definition.json";

    private final AuthService authService;
    private final GithubWriteService githubWriteService;
    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public SeriesEditorController(AuthService authService, GithubWriteService githubWriteService,
                                  MapseriesProperties props) {
        this.authService = authService;
        this.githubWriteService = githubWriteService;
        this.props = props;
    }

    @GetMapping("/admin/series")
    public String list(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series";
        }
        if (!gate(model, request)) {
            return "admin/series-list";
        }
        List<SeriesRow> rows = new ArrayList<>();
        for (JSONObject o : readContentDefinition()) {
            rows.add(new SeriesRow(o.getString("name"), prettyName(o.getString("name")), o.optString("grid", "")));
        }
        model.addAttribute("series", rows);
        return "admin/series-list";
    }

    /** New-series workspace: one page for the whole series (basics + grid + template + wiring). */
    @GetMapping("/admin/series/new")
    public String newSeries(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/new";
        }
        if (!gate(model, request)) {
            return "admin/series-workspace";
        }
        model.addAttribute("mode", "new");
        model.addAttribute("originalName", "");
        model.addAttribute("f_name", "");
        model.addAttribute("f_grid", "");
        model.addAttribute("f_sheets", "490v");     // sensible defaults — 100% of series use these
        model.addAttribute("f_field", "490a");
        model.addAttribute("f_groupby", "field.substring(0,4)");
        model.addAttribute("f_thumbnailUrl", "");
        model.addAttribute("f_descCs", "");
        model.addAttribute("f_descEn", "");
        return "admin/series-workspace";
    }

    /** Edit-series workspace (same page as new; prefilled; grid/template loaded via AJAX).
     *  Opened by name from the list, or by grid from the catalogue ("Přidat do šablony"). */
    @GetMapping("/admin/series/edit")
    public String editSeries(@RequestParam(required = false) String name, @RequestParam(required = false) String grid,
                             @RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            // GitHub returns without the original query: back to the list then
            // (it forwards a pending "Přidat do šablony" to the right series)
            return name != null ? "redirect:/admin/series/edit?name=" + enc(name)
                    : grid != null ? "redirect:/admin/series/edit?grid=" + enc(grid)
                    : "redirect:/admin/series";
        }
        if (!gate(model, request)) {
            return "admin/series-workspace";
        }
        List<JSONObject> items = readContentDefinition();
        JSONObject item = name != null ? findByName(items, name) : findByGrid(items, grid);
        if (item == null) {
            model.addAttribute("error", "Série \"" + (name != null ? name : grid) + "\" nebyla nalezena.");
            return "admin/series-workspace";
        }
        name = item.getString("name");
        model.addAttribute("mode", "edit");
        model.addAttribute("originalName", name);
        model.addAttribute("prettyName", prettyName(item.getString("name")));
        model.addAttribute("f_name", item.getString("name"));
        model.addAttribute("f_grid", item.optString("grid", ""));
        model.addAttribute("f_sheets", item.optString("sheets", ""));
        model.addAttribute("f_field", item.optString("field", ""));
        model.addAttribute("f_groupby", item.optString("groupby", ""));
        model.addAttribute("f_thumbnailUrl", item.optString("thumbnailUrl", ""));
        JSONObject desc = item.optJSONObject("description");
        model.addAttribute("f_descCs", desc != null ? desc.optString("cs", "") : "");
        model.addAttribute("f_descEn", desc != null ? desc.optString("en", "") : "");
        return "admin/series-workspace";
    }

    /** Atomic save from the workspace: definition + (optional) geojson + (optional) template,
     *  all committed in ONE commit. Called via JSON from series-workspace.html. */
    @PostMapping("/admin/series/save")
    @ResponseBody
    public Map<String, Object> save(@RequestBody SaveRequest req) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        String mode = req.mode() == null ? "new" : req.mode();
        String name = trim(req.name()), grid = trim(req.grid());
        String field = trim(req.field()), sheets = trim(req.sheets()), groupby = trim(req.groupby());
        String thumb = trim(req.thumbnailUrl());
        String descCs = req.descCs() == null ? "" : req.descCs();
        String descEn = req.descEn() == null ? "" : req.descEn();

        String err = validate(name, grid, sheets, field, groupby, thumb);
        if (err == null && req.geojson() != null) {
            try { new JSONObject(req.geojson()); } catch (Exception e) { err = "Neplatný geojson: " + e.getMessage(); }
        }
        boolean hasTemplate = req.template() != null && !req.template().isBlank();
        if (err == null && hasTemplate) {
            String terr = validateTemplate(req.template());
            if (terr != null) err = "Šablona: " + terr;
        }
        if (err == null && "new".equals(mode) && req.geojson() == null) {
            err = "Nová série musí mít mřížku listů.";
        }
        if (err != null) {
            return Map.of("success", false, "message", err);
        }

        List<JSONObject> items = readContentDefinition();
        JSONObject entry = buildEntry(name, grid, sheets, field, groupby, thumb, descCs, descEn);
        String locate = "edit".equals(mode) && req.originalName() != null && !req.originalName().isBlank()
                ? req.originalName() : name;
        int idx = indexOfName(items, locate);
        if (idx >= 0) { items.set(idx, entry); } else { items.add(entry); }

        Map<String, String> files = new LinkedHashMap<>();
        files.put(CONTENT_DEFINITION_PATH, serialize(items));
        if (req.geojson() != null) { files.put("geojson/" + grid + ".json", req.geojson()); }
        if (hasTemplate) { files.put("template/" + grid + ".txt", req.template()); }

        GithubWriteService.SaveResult result;
        try {
            String msg = ("edit".equals(mode) ? "Edit series: " : "Create series: ") + prettyName(name);
            result = githubWriteService.saveFiles(authService.getToken(), msg, files);
        } catch (Exception e) {
            return Map.of("success", false, "message", "Uložení na GitHub selhalo: " + e.getMessage());
        }
        String message = dryRun() || !result.committed()
                ? "Uloženo (testovací režim — nevytvořen návrh změny)."
                : "Vytvořen návrh změny (PR" + (result.prNumber() > 0 ? " #" + result.prNumber() : "")
                        + ") — čeká na schválení správcem.";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("redirect", "/admin/series");
        out.put("message", message);
        if (result.prUrl() != null) { out.put("prUrl", result.prUrl()); }
        return out;
    }

    public record SaveRequest(String mode, String originalName, String name, String descCs, String descEn,
                              String thumbnailUrl, String field, String sheets, String groupby, String grid,
                              String geojson, String template) {
    }

    /** Remove a series from content-definition.json (the grid geojson is left as an
     *  orphan; harmless — nothing references it once the definition is gone). */
    @PostMapping("/admin/series/delete")
    public String delete(@RequestParam String name, RedirectAttributes flash) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return "redirect:/admin/series";
        }
        List<JSONObject> items = readContentDefinition();
        int idx = indexOfName(items, name);
        if (idx >= 0) {
            items.remove(idx);
            try {
                GithubWriteService.SaveResult result = githubWriteService.saveFile(authService.getToken(),
                        "Delete series: " + prettyName(name), CONTENT_DEFINITION_PATH, serialize(items));
                flash.addFlashAttribute("saved", result.committed()
                        ? prettyName(name) + " — vytvořen návrh změny (PR" + (result.prNumber() > 0 ? " #" + result.prNumber() : "") + ")"
                        : prettyName(name) + " — smazáno (testovací režim)");
            } catch (Exception e) {
                flash.addFlashAttribute("saveError", "Smazání selhalo: " + e.getMessage());
            }
        }
        return "redirect:/admin/series";
    }

    /** The standalone sheets page is folded into the workspace; keep the URL working. */
    @GetMapping("/admin/series/sheets")
    public String sheetsRedirect(@RequestParam String name, @RequestParam(required = false) String code) {
        if (code != null && !code.isBlank()) { authService.authenticate(code); }
        return "redirect:/admin/series/edit?name=" + enc(name);
    }

    /** Admin loads the grid geojson from the WRITE repo (its own edits), fresh — the map
     *  editor can't use /server/data (that proxies the READ repo and misses fork edits). */
    @GetMapping(value = "/admin/series/sheets/data", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<String> sheetData(@RequestParam String grid) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return ResponseEntity.status(403).build();
        }
        try {
            return ResponseEntity.ok(readRaw("geojson/" + grid + ".json"));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** The standalone template page is folded into the workspace; keep the URL working. */
    @GetMapping("/admin/series/template")
    public String templateRedirect(@RequestParam String name, @RequestParam(required = false) String code) {
        if (code != null && !code.isBlank()) { authService.authenticate(code); }
        return "redirect:/admin/series/edit?name=" + enc(name);
    }

    /** Admin loads the MARC21 template text from the WRITE repo (its own edits), fresh. */
    @GetMapping(value = "/admin/series/template/data", produces = "text/plain;charset=UTF-8")
    @ResponseBody
    public ResponseEntity<String> templateData(@RequestParam String grid) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return ResponseEntity.status(403).build();
        }
        try {
            return ResponseEntity.ok(readRaw("template/" + grid + ".txt"));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** Every {...} field definition in the template must be valid JSON — otherwise the
     *  catalogue silently leaves it as literal text and that field breaks. Fail fast with
     *  the offending line so the user fixes it before it reaches production. Mirrors the
     *  catalogue's block finder: smallest brace span that parses is the block. */
    static String validateTemplate(String content) {
        int cursor = 0, n = content.length();
        for (int i = 0; i < n; i++) {
            if (i < cursor || content.charAt(i) != '{') continue;
            boolean ok = false;
            for (int j = i + 1; j < n; j++) {
                if (content.charAt(j) != '}') continue;
                try {
                    new JSONObject(content.substring(i, j + 1));
                    ok = true; cursor = j + 1; i = j; break;
                } catch (Exception ignore) { /* not a complete object yet — try next } */ }
            }
            if (!ok) {
                int line = 1;
                for (int k = 0; k < i; k++) if (content.charAt(k) == '\n') line++;
                return "Neplatný JSON blok začínající na řádku " + line + " — neuzavřený nebo chybný „{ … }\".";
            }
        }
        return null;
    }

    // ---- helpers -----------------------------------------------------------

    private boolean dryRun() {
        return props.editor() != null && props.editor().dryRun();
    }

    /** Sets the standard admin model attrs; returns true if the user is an admin. */
    private boolean gate(Model model, HttpServletRequest request) {
        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "series");
        model.addAttribute("authUrl", authUrl(request));
        model.addAttribute("login", authService.getLogin() != null ? authService.getLogin() : "");
        return admin;
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }

    private static String validate(String name, String grid, String sheets, String field,
                                   String groupby, String thumbnailUrl) {
        if (name == null || name.isBlank()) return "Vyplň název série.";
        if (grid == null || grid.isBlank()) return "Vyplň název mřížky (grid).";
        if (field == null || field.isBlank()) return "Vyplň párovací pole (field).";
        if (sheets == null || sheets.isBlank()) return "Vyplň pole listů (sheets).";
        if (groupby == null || groupby.isBlank()) return "Vyplň pravidlo groupby.";
        if (thumbnailUrl == null || thumbnailUrl.isBlank()) return "Vyplň URL náhledu.";
        return null;
    }

    private List<JSONObject> readContentDefinition() {
        JSONArray arr = new JSONArray(readRaw(CONTENT_DEFINITION_PATH));
        List<JSONObject> out = new ArrayList<>();
        for (Object o : arr) {
            out.add((JSONObject) o);
        }
        return out;
    }

    /** The admin edits the WRITE repo, so it must READ from there too — otherwise a series
     *  it just created (which only exists in the write repo/fork) reads back as "not found".
     *  Uses the authenticated contents API, not raw.githubusercontent.com, whose CDN caches
     *  ~5 min and would hide a fresh commit. In production read == write, so this is a no-op. */
    private String readRaw(String path) {
        String repo = props.repo().writeUser() + "/" + props.repo().writeName();
        String url = "https://api.github.com/repos/" + repo + "/contents/" + path + "?ref=master";
        String token = authService.getToken();
        return http.get().uri(url)
                .headers(h -> {
                    h.set("Accept", "application/vnd.github.raw");
                    if (token != null && !token.isBlank()) { h.setBearerAuth(token); }
                })
                .retrieve().body(String.class);
    }

    private static JSONObject findByGrid(List<JSONObject> items, String grid) {
        if (grid == null) {
            return null;
        }
        return items.stream().filter(o -> grid.equals(o.optString("grid", ""))).findFirst().orElse(null);
    }

    private static JSONObject findByName(List<JSONObject> items, String name) {
        int i = indexOfName(items, name);
        return i >= 0 ? items.get(i) : null;
    }

    private static int indexOfName(List<JSONObject> items, String name) {
        for (int i = 0; i < items.size(); i++) {
            if (name.equals(items.get(i).optString("name", null))) {
                return i;
            }
        }
        return -1;
    }

    private static JSONObject buildEntry(String name, String grid, String sheets, String field,
                                         String groupby, String thumbnailUrl, String descCs, String descEn) {
        JSONObject desc = new JSONObject();
        if (!descCs.isBlank()) desc.put("cs", descCs);
        if (!descEn.isBlank()) desc.put("en", descEn);
        return new JSONObject()
                .put("field", field).put("name", name).put("grid", grid)
                .put("sheets", sheets).put("groupby", groupby).put("thumbnailUrl", thumbnailUrl)
                .put("description", desc);
    }

    /** Serialize with a stable key order (matches the repo's layout) to keep diffs clean. */
    private static String serialize(List<JSONObject> items) {
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < items.size(); i++) {
            JSONObject o = items.get(i);
            sb.append(" {\n");
            sb.append("  \"field\": ").append(JSONObject.quote(o.optString("field", ""))).append(",\n");
            sb.append("  \"name\": ").append(JSONObject.quote(o.optString("name", ""))).append(",\n");
            sb.append("  \"grid\": ").append(JSONObject.quote(o.optString("grid", ""))).append(",\n");
            sb.append("  \"sheets\": ").append(JSONObject.quote(o.optString("sheets", ""))).append(",\n");
            sb.append("  \"groupby\": ").append(JSONObject.quote(o.optString("groupby", ""))).append(",\n");
            sb.append("  \"thumbnailUrl\": ").append(JSONObject.quote(o.optString("thumbnailUrl", ""))).append(",\n");
            sb.append("  \"description\": {\n");
            JSONObject d = o.optJSONObject("description");
            List<String> lines = new ArrayList<>();
            if (d != null) {
                if (d.has("cs")) lines.add("   \"cs\": " + JSONObject.quote(d.optString("cs", "")));
                if (d.has("en")) lines.add("   \"en\": " + JSONObject.quote(d.optString("en", "")));
            }
            sb.append(String.join(",\n", lines)).append(lines.isEmpty() ? "" : "\n");
            sb.append("  }\n");
            sb.append(" }");
            sb.append(i < items.size() - 1 ? ",\n" : "\n");
        }
        sb.append("]\n");
        return sb.toString();
    }

    private static String prettyName(String name) {
        int b = name.indexOf("["), e = name.lastIndexOf("]");
        return (b >= 0 && e > b) ? name.substring(b + 1, e) : name;
    }

    private String authUrl(HttpServletRequest request) {
        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + enc(props.github().clientId())
                + "&redirect_uri=" + enc(request.getRequestURL().toString())
                + "&scope=" + enc("user:email repo");
    }

    private static String enc(String v) {
        return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8);
    }

    public record SeriesRow(String name, String prettyName, String grid) {
    }
}
