package cz.mzk.mapseries.web;

import cz.mzk.mapseries.admin.DataRepoService;
import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;
import cz.mzk.mapseries.github.GithubWriteService;
import jakarta.servlet.http.HttpServletRequest;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
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

    private final DataRepoService data;

    public SeriesEditorController(AuthService authService, GithubWriteService githubWriteService,
                                  MapseriesProperties props, DataRepoService data) {
        this.authService = authService;
        this.githubWriteService = githubWriteService;
        this.props = props;
        this.data = data;
    }

    /** What the workspace shows about a série besides its own fields: the grids to
     *  choose from, the díla of the catalogue that fill it (their template writes
     *  this name into field 490) and the other séries drawn on the same grid. */
    private void related(Model model, String name, String grid) {
        List<DataRepoService.Work> works = data.works();
        List<DataRepoService.Serie> series = data.series();
        model.addAttribute("grids", data.gridOptions(works, series));
        Map<String, String> templates = data.readAll(works.stream().map(DataRepoService.Work::templatePath).toList());
        List<DataRepoService.Work> filling = new ArrayList<>();
        for (DataRepoService.Work w : works) {
            DataRepoService.Field490 f = data.field490(templates.get(w.templatePath()), series);
            if (f != null && name != null && f.value().equals(name.trim())) {
                filling.add(w);
            }
        }
        model.addAttribute("fillingWorks", filling);
        model.addAttribute("sameGrid", series.stream()
                .filter(x -> grid != null && x.grid().equals(grid) && !x.name().equals(name)).toList());
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
    public String newSeries(@RequestParam(required = false) String code, @RequestParam(required = false) String name,
                            @RequestParam(required = false) String grid, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/new";
        }
        if (!gate(model, request)) {
            return "admin/series-workspace";
        }
        // prefilled from a dílo whose 490 has no série yet ("Založit sérii s tímto názvem")
        related(model, null, grid);
        model.addAttribute("mode", "new");
        model.addAttribute("originalName", "");
        model.addAttribute("f_name", name == null ? "" : name);
        model.addAttribute("f_grid", grid == null ? "" : grid);
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
        related(model, name, item.optString("grid", ""));
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
        if (err == null && !data.exists("geojson/" + grid + ".json")) {
            err = "Vyberte mřížku listů (nová se zakládá v Mřížkách).";
        }
        if (err != null) {
            return Map.of("success", false, "message", err);
        }

        List<JSONObject> items = readContentDefinition();
        JSONObject entry = buildEntry(name, grid, sheets, field, groupby, thumb, descCs, descEn);
        String locate = "edit".equals(mode) && req.originalName() != null && !req.originalName().isBlank()
                ? req.originalName() : name;
        int idx = indexOfName(items, locate);
        if (idx >= 0) {
            keepEmptyDescriptions(items.get(idx), entry);
            items.set(idx, entry);
        } else {
            items.add(entry);
        }

        Map<String, String> files = new LinkedHashMap<>();
        files.put(CONTENT_DEFINITION_PATH, serialize(items));

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
                              String thumbnailUrl, String field, String sheets, String groupby, String grid) {
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
        if (name == null || name.isBlank()) return "Vyplňte název série.";
        if (grid == null || grid.isBlank()) return "Vyberte mřížku listů.";
        if (field == null || field.isBlank()) return "Chybí pole s názvem série (490a).";
        if (sheets == null || sheets.isBlank()) return "Chybí pole s číslem listu (490v).";
        if (groupby == null || groupby.isBlank()) return "Vyplňte pravidlo pro číslo listu.";
        if (thumbnailUrl == null || thumbnailUrl.isBlank()) return "Vyplňte adresu náhledového obrázku.";
        return null;
    }

    private List<JSONObject> readContentDefinition() {
        JSONArray arr = new JSONArray(data.read(CONTENT_DEFINITION_PATH));
        List<JSONObject> out = new ArrayList<>();
        for (Object o : arr) {
            out.add((JSONObject) o);
        }
        return out;
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

    /** A language left empty in the form keeps the original's empty value (null or ""),
     *  so saving a series does not rewrite its untouched description lines. */
    private static void keepEmptyDescriptions(JSONObject original, JSONObject entry) {
        JSONObject was = original.optJSONObject("description");
        JSONObject now = entry.getJSONObject("description");
        if (was == null) {
            return;
        }
        for (String lang : List.of("cs", "en")) {
            Object old = was.opt(lang);
            if (!now.has(lang) && was.has(lang) && (JSONObject.NULL.equals(old) || "".equals(old))) {
                now.put(lang, old);
            }
        }
    }

    /** Serialize with a stable key order (matches the repo's layout) to keep diffs clean. */
    static String serialize(List<JSONObject> items) {
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < items.size(); i++) {
            JSONObject o = items.get(i);
            sb.append(" {\n");
            for (String key : List.of("field", "name", "grid", "sheets", "groupby", "thumbnailUrl")) {
                sb.append("  \"").append(key).append("\": ").append(jsonValue(o, key)).append(",\n");
            }
            sb.append("  \"description\": {\n");
            JSONObject d = o.optJSONObject("description");
            List<String> lines = new ArrayList<>();
            if (d != null) {
                if (d.has("cs")) lines.add("   \"cs\": " + jsonValue(d, "cs"));
                if (d.has("en")) lines.add("   \"en\": " + jsonValue(d, "en"));
            }
            sb.append(String.join(",\n", lines)).append(lines.isEmpty() ? "" : "\n");
            sb.append("  }\n");
            sb.append(" }");
            sb.append(i < items.size() - 1 ? ",\n" : "\n");
        }
        // the library's file has no newline at the end
        sb.append("]");
        return sb.toString();
    }

    /** A value as the data repo writes it: null stays null, and text is escaped only
     *  where JSON requires it, so unchanged entries produce no diff. */
    private static String jsonValue(JSONObject o, String key) {
        Object v = o.opt(key);
        if (v == null || JSONObject.NULL.equals(v)) {
            return o.has(key) ? "null" : "\"\"";
        }
        String text = v.toString();
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
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
