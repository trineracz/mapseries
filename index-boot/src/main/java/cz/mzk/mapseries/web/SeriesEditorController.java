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
import org.springframework.web.multipart.MultipartFile;
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
    private static final int SHEET_PREVIEW_LIMIT = 60;

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

    @GetMapping("/admin/series/new")
    public String newForm(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/new";
        }
        if (!gate(model, request)) {
            return "admin/series-editor";
        }
        model.addAttribute("mode", "new");
        model.addAttribute("originalName", "");
        return "admin/series-editor";
    }

    @GetMapping("/admin/series/edit")
    public String editForm(@RequestParam String name, @RequestParam(required = false) String code,
                           Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/edit?name=" + enc(name);
        }
        if (!gate(model, request)) {
            return "admin/series-editor";
        }
        JSONObject item = findByName(readContentDefinition(), name);
        if (item == null) {
            model.addAttribute("error", "Série \"" + name + "\" nebyla nalezena.");
            model.addAttribute("mode", "new");
            model.addAttribute("originalName", "");
            return "admin/series-editor";
        }
        model.addAttribute("mode", "edit");
        model.addAttribute("originalName", name);
        model.addAttribute("f_name", item.getString("name"));
        model.addAttribute("f_grid", item.optString("grid", ""));
        model.addAttribute("f_sheets", item.optString("sheets", ""));
        model.addAttribute("f_field", item.optString("field", ""));
        model.addAttribute("f_groupby", item.optString("groupby", ""));
        model.addAttribute("f_thumbnailUrl", item.optString("thumbnailUrl", ""));
        JSONObject desc = item.optJSONObject("description");
        model.addAttribute("f_descCs", desc != null ? desc.optString("cs", "") : "");
        model.addAttribute("f_descEn", desc != null ? desc.optString("en", "") : "");
        addSheetPreview(model, item.optString("grid", ""));
        return "admin/series-editor";
    }

    @PostMapping("/admin/series/save")
    public String save(@RequestParam String mode,
                       @RequestParam String originalName,
                       @RequestParam String name,
                       @RequestParam String grid,
                       @RequestParam String sheets,
                       @RequestParam String field,
                       @RequestParam String groupby,
                       @RequestParam String thumbnailUrl,
                       @RequestParam(required = false, defaultValue = "") String descCs,
                       @RequestParam(required = false, defaultValue = "") String descEn,
                       @RequestParam(value = "gridFile", required = false) MultipartFile gridFile,
                       @RequestParam(required = false, defaultValue = "false") boolean drawGrid,
                       @RequestParam(value = "templateFile", required = false) MultipartFile templateFile,
                       @RequestParam(required = false, defaultValue = "false") boolean createTemplate,
                       Model model, HttpServletRequest request, RedirectAttributes flash) {

        if (!gate(model, request)) {
            return "admin/series-editor";
        }

        // Re-populate the form so validation errors don't wipe the user's input.
        fillForm(model, mode, originalName, name, grid, sheets, field, groupby, thumbnailUrl, descCs, descEn);

        String err = validate(name, grid, sheets, field, groupby, thumbnailUrl);
        boolean hasUpload = gridFile != null && !gridFile.isEmpty();
        // A new series always needs a grid — either uploaded now, or drawn on the
        // map right after (drawGrid), which is committed on the sheets page.
        if (err == null && "new".equals(mode) && !hasUpload && !drawGrid) {
            err = "Nová série musí mít mřížku — nahraj geojson, nebo zaškrtni nakreslení na mapě.";
        }

        String gridJson = null;
        if (err == null && hasUpload) {
            try {
                gridJson = new String(gridFile.getBytes(), StandardCharsets.UTF_8);
                new JSONObject(gridJson); // validate it parses as JSON
            } catch (Exception e) {
                err = "Nahraný soubor mřížky není platný JSON: " + e.getMessage();
            }
        }

        String templateContent = null;
        boolean hasTemplateUpload = templateFile != null && !templateFile.isEmpty();
        if (err == null && hasTemplateUpload) {
            try {
                templateContent = new String(templateFile.getBytes(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                err = "Nahraný soubor šablony nejde přečíst: " + e.getMessage();
            }
            if (err == null) {
                String terr = validateTemplate(templateContent);
                if (terr != null) err = "Šablona: " + terr;
            }
        }
        if (err != null) {
            model.addAttribute("error", err);
            return "admin/series-editor";
        }

        // Build/replace the entry and re-serialize the whole content-definition.
        List<JSONObject> items = readContentDefinition();
        JSONObject entry = buildEntry(name, grid, sheets, field, groupby, thumbnailUrl, descCs, descEn);
        String locate = "edit".equals(mode) && !originalName.isBlank() ? originalName : name;
        int idx = indexOfName(items, locate);
        if (idx >= 0) {
            items.set(idx, entry);
        } else {
            items.add(entry);
        }

        Map<String, String> files = new LinkedHashMap<>();
        files.put(CONTENT_DEFINITION_PATH, serialize(items));
        if (gridJson != null) {
            files.put("geojson/" + grid + ".json", gridJson);
        }
        if (templateContent != null) {
            files.put("template/" + grid + ".txt", templateContent);
        }

        try {
            String msg = ("edit".equals(mode) ? "Edit series: " : "Create series: ") + prettyName(name);
            githubWriteService.saveFiles(authService.getToken(), msg, files);
        } catch (Exception e) {
            model.addAttribute("error", "Uložení na GitHub selhalo: " + e.getMessage());
            return "admin/series-editor";
        }

        // New series that opted to draw its grid → straight to the map to draw + save it.
        // (Grid is foundational; a "create template" choice is then reachable from the
        // definition toolbar afterwards.)
        if ("new".equals(mode) && drawGrid && !hasUpload) {
            return "redirect:/admin/series/sheets?name=" + enc(name);
        }
        flash.addFlashAttribute("saved", prettyName(name) + (dryRun() ? " (testovací režim)" : ""));
        // Opted to author the template now → open the template editor.
        if ("new".equals(mode) && createTemplate && !hasTemplateUpload) {
            return "redirect:/admin/series/template?name=" + enc(name);
        }
        // Otherwise a freshly created series lands on its own edit page, where the toolbar
        // offers the sheet editor and the cataloguing template.
        if ("new".equals(mode)) {
            return "redirect:/admin/series/edit?name=" + enc(name);
        }
        return "redirect:/admin/series";
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
                githubWriteService.saveFile(authService.getToken(),
                        "Delete series: " + prettyName(name), CONTENT_DEFINITION_PATH, serialize(items));
                flash.addFlashAttribute("saved", prettyName(name) + " — smazáno");
            } catch (Exception e) {
                flash.addFlashAttribute("saveError", "Smazání selhalo: " + e.getMessage());
            }
        }
        return "redirect:/admin/series";
    }

    /** Phase 2: interactive map + per-sheet property editing for one series' grid. */
    @GetMapping("/admin/series/sheets")
    public String sheets(@RequestParam String name, @RequestParam(required = false) String code,
                         Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/sheets?name=" + enc(name);
        }
        if (!gate(model, request)) {
            return "admin/series-sheets";
        }
        JSONObject item = findByName(readContentDefinition(), name);
        if (item == null) {
            model.addAttribute("error", "Série \"" + name + "\" nebyla nalezena.");
            return "admin/series-sheets";
        }
        model.addAttribute("seriesName", name);
        model.addAttribute("prettyName", prettyName(name));
        model.addAttribute("grid", item.optString("grid", ""));
        return "admin/series-sheets";
    }

    /** AJAX save of the edited grid geojson (commits geojson/<grid>.json). */
    @PostMapping("/admin/series/sheets/save")
    @ResponseBody
    public Map<String, Object> saveSheets(@RequestParam String name, @RequestParam String grid,
                                          @RequestBody String geojson) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        try {
            new JSONObject(geojson); // validate JSON
        } catch (Exception e) {
            return Map.of("success", false, "message", "Neplatný geojson: " + e.getMessage());
        }
        try {
            githubWriteService.saveFile(authService.getToken(),
                    "Edit sheets: " + prettyName(name), "geojson/" + grid + ".json", geojson);
            return Map.of("success", true, "message",
                    dryRun() ? "OK — testovací režim (necommitnuto)." : "Uloženo.");
        } catch (Exception e) {
            return Map.of("success", false, "message", String.valueOf(e.getMessage()));
        }
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

    /** Load the series' MARC21 cataloguing template (template/<grid>.txt) for editing. */
    @GetMapping("/admin/series/template")
    public String template(@RequestParam String name, @RequestParam(required = false) String code,
                           Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/series/template?name=" + enc(name);
        }
        if (!gate(model, request)) {
            return "admin/series-template";
        }
        JSONObject item = findByName(readContentDefinition(), name);
        if (item == null) {
            model.addAttribute("error", "Série \"" + name + "\" nebyla nalezena.");
            return "admin/series-template";
        }
        String grid = item.optString("grid", "");
        model.addAttribute("seriesName", name);
        model.addAttribute("prettyName", prettyName(name));
        model.addAttribute("grid", grid);
        model.addAttribute("templatePath", "template/" + grid + ".txt");
        try {
            model.addAttribute("templateContent", readRaw("template/" + grid + ".txt"));
        } catch (Exception e) {
            model.addAttribute("templateContent", "");
            model.addAttribute("templateMissing", true);
        }
        return "admin/series-template";
    }

    /** AJAX save of the edited MARC21 template (commits template/<grid>.txt). */
    @PostMapping("/admin/series/template/save")
    @ResponseBody
    public Map<String, Object> saveTemplate(@RequestParam String name, @RequestParam String grid,
                                            @RequestBody String content) {
        if (!(authService.isAuthenticated() && authService.isAdmin())) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        String err = validateTemplate(content);
        if (err != null) {
            return Map.of("success", false, "message", err);
        }
        try {
            githubWriteService.saveFile(authService.getToken(),
                    "Edit template: " + prettyName(name), "template/" + grid + ".txt", content);
            return Map.of("success", true, "message",
                    dryRun() ? "OK — testovací režim (necommitnuto)." : "Uloženo.");
        } catch (Exception e) {
            return Map.of("success", false, "message", String.valueOf(e.getMessage()));
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

    private void fillForm(Model m, String mode, String originalName, String name, String grid, String sheets,
                          String field, String groupby, String thumbnailUrl, String descCs, String descEn) {
        m.addAttribute("mode", mode);
        m.addAttribute("originalName", originalName);
        m.addAttribute("f_name", name);
        m.addAttribute("f_grid", grid);
        m.addAttribute("f_sheets", sheets);
        m.addAttribute("f_field", field);
        m.addAttribute("f_groupby", groupby);
        m.addAttribute("f_thumbnailUrl", thumbnailUrl);
        m.addAttribute("f_descCs", descCs);
        m.addAttribute("f_descEn", descEn);
    }

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

    private void addSheetPreview(Model model, String grid) {
        if (grid == null || grid.isBlank()) {
            return;
        }
        try {
            String raw = readRaw("geojson/" + grid + ".json");
            JSONArray features = new JSONObject(raw).getJSONArray("features");
            List<SheetRow> preview = new ArrayList<>();
            for (int i = 0; i < features.length() && i < SHEET_PREVIEW_LIMIT; i++) {
                JSONObject p = features.getJSONObject(i).optJSONObject("properties");
                if (p == null) continue;
                preview.add(new SheetRow(p.optString("SHEET", ""), p.optString("TITLE", ""),
                        p.optString("KOLONNE", "")));
            }
            model.addAttribute("sheetCount", features.length());
            model.addAttribute("sheetPreview", preview);
        } catch (Exception e) {
            model.addAttribute("sheetError", "Mřížku se nepodařilo načíst: " + e.getMessage());
        }
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

    public record SheetRow(String sheet, String title, String kolonne) {
    }
}
