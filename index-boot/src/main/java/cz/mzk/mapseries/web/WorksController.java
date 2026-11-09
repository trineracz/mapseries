package cz.mzk.mapseries.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import cz.mzk.mapseries.admin.DataRepoService;
import cz.mzk.mapseries.admin.DataRepoService.Field490;
import cz.mzk.mapseries.admin.DataRepoService.Serie;
import cz.mzk.mapseries.admin.DataRepoService.Work;
import cz.mzk.mapseries.github.GithubWriteService;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Admin → Mapová díla: the díla of the catalogue (config.js), each with its
 * cataloguing template, and a guide that creates a new dílo (catalogue entry,
 * template, grid and, if wanted, the série that shows it on the web).
 */
@Controller
public class WorksController {

    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");

    private final AdminGate gate;
    private final DataRepoService data;
    private final GithubWriteService github;

    public WorksController(AdminGate gate, DataRepoService data, GithubWriteService github) {
        this.gate = gate;
        this.data = data;
        this.github = github;
    }

    /** One row of the list. */
    public record WorkRow(Work work, Field490 field490, boolean templateExists) {
    }

    @GetMapping("/admin/works")
    public String list(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            gate.signIn(code);
            return "redirect:/admin/works";
        }
        if (!gate.open(model, request, "works")) {
            return "admin/works-list";
        }
        List<Work> works = data.works();
        List<Serie> series = data.series();
        Map<String, String> templates = data.readAll(works.stream().map(Work::templatePath).toList());
        // grouped as in the catalogue: region, then klad listů
        Map<String, List<WorkRow>> groups = new LinkedHashMap<>();
        for (Work w : works) {
            String t = templates.get(w.templatePath());
            String group = (w.region().isEmpty() ? "" : w.region() + " · ") + w.klad();
            groups.computeIfAbsent(group, k -> new ArrayList<>())
                    .add(new WorkRow(w, data.field490(t, series), t != null));
        }
        model.addAttribute("groups", groups);
        model.addAttribute("count", works.size());
        return "admin/works-list";
    }

    @GetMapping("/admin/works/edit")
    public String edit(@RequestParam(required = false) String layer, @RequestParam(required = false) String code,
                       Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            gate.signIn(code);
            return layer != null ? "redirect:/admin/works/edit?layer=" + AdminGate.enc(layer) : "redirect:/admin/works";
        }
        if (!gate.open(model, request, "works")) {
            return "admin/work-edit";
        }
        Work work = layer == null ? null : data.work(layer);
        if (work == null) {
            model.addAttribute("error", "Mapové dílo „" + layer + "“ neexistuje.");
            return "admin/work-edit";
        }
        List<Serie> series = data.series();
        String template = data.exists(work.templatePath()) ? data.read(work.templatePath()) : null;
        Field490 f490 = data.field490(template, series);
        model.addAttribute("work", work);
        List<Work> works = data.works();
        model.addAttribute("regions", works.stream().map(Work::region).filter(r -> !r.isEmpty()).distinct().toList());
        model.addAttribute("klady", works.stream().map(Work::klad).filter(r -> !r.isEmpty()).distinct().toList());
        model.addAttribute("field490", f490);
        model.addAttribute("templateExists", template != null);
        return "admin/work-edit";
    }

    @GetMapping(value = "/admin/works/template/data", produces = "text/plain;charset=UTF-8")
    @ResponseBody
    public ResponseEntity<String> templateData(@RequestParam String layer) {
        if (!gate.isAdmin()) {
            return ResponseEntity.status(403).build();
        }
        Work work = data.work(layer);
        if (work == null || !data.exists(work.templatePath())) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(data.read(work.templatePath()));
    }

    public record SaveTemplate(String layer, String template) {
    }

    @PostMapping("/admin/works/save")
    @ResponseBody
    public Map<String, Object> save(@RequestBody SaveTemplate req) {
        if (!gate.isAdmin()) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        Work work = req.layer() == null ? null : data.work(req.layer());
        if (work == null) {
            return Map.of("success", false, "message", "Mapové dílo neexistuje.");
        }
        if (req.template() == null || req.template().isBlank()) {
            return Map.of("success", false, "message", "Šablona je prázdná.");
        }
        String err = SeriesEditorController.validateTemplate(req.template());
        if (err != null) {
            return Map.of("success", false, "message", "Šablona: " + err);
        }
        Map<String, String> files = new LinkedHashMap<>();
        files.put(work.templatePath(), req.template());
        return saved(files, "Edit template: " + work.name(), "/admin/works/edit?layer=" + AdminGate.enc(work.layer()));
    }

    // ---- a new dílo ------------------------------------------------------------------

    public record Rename(String layer, String region, String klad, String name) {
    }

    /** New title of a dílo (region; klad; name) in config.js — the files keep their names. */
    @PostMapping("/admin/works/rename")
    @ResponseBody
    public Map<String, Object> rename(@RequestBody Rename req) {
        if (!gate.isAdmin()) {
            return Map.of("success", false, "message", "Nejste přihlášen(a) jako správce.");
        }
        Work work = req.layer() == null ? null : data.work(req.layer());
        if (work == null) {
            return Map.of("success", false, "message", "Mapové dílo neexistuje.");
        }
        String region = trim(req.region()), klad = trim(req.klad()), name = trim(req.name());
        if (region.isEmpty() || klad.isEmpty() || name.isEmpty()) {
            return Map.of("success", false, "message", "Vyplňte region, klad listů i název díla.");
        }
        if ((region + klad + name).contains(";")) {
            return Map.of("success", false, "message", "Středník v názvu použít nejde – odděluje v seznamu region, klad a název.");
        }
        String config = withTitle(data.read(DataRepoService.CONFIG), work.layer(), region + "; " + klad + "; " + name);
        if (config == null) {
            return Map.of("success", false, "message", "Seznam mapových děl (config.js) se nepodařilo upravit.");
        }
        return saved(Map.of(DataRepoService.CONFIG, config), "Rename map work: " + work.name() + " -> " + name,
                "/admin/works/edit?layer=" + AdminGate.enc(work.layer()));
    }

    /** config.js with a new title of the dílo with this layer (only that string changes), or null. */
    static String withTitle(String config, String layer, String title) {
        int at = config.indexOf("layer: " + jsString(layer));
        int t = at < 0 ? -1 : config.lastIndexOf("title:", at);
        if (t < 0 || t < config.lastIndexOf('}', at)) {
            return null;
        }
        int open = config.indexOf('"', t);
        int close = open + 1;
        while (close < config.length() && config.charAt(close) != '"') {
            close += config.charAt(close) == '\\' ? 2 : 1;
        }
        if (open < 0 || close >= at) {
            return null;
        }
        return config.substring(0, open) + jsString(title) + config.substring(close + 1);
    }

    @GetMapping("/admin/works/new")
    public String create(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            gate.signIn(code);
            return "redirect:/admin/works/new";
        }
        if (!gate.open(model, request, "works")) {
            return "admin/work-new";
        }
        List<Work> works = data.works();
        model.addAttribute("works", works);
        model.addAttribute("grids", data.gridOptions(works, data.series()));
        model.addAttribute("regions", works.stream().map(Work::region).filter(r -> !r.isEmpty()).distinct().toList());
        model.addAttribute("klady", works.stream().map(Work::klad).filter(r -> !r.isEmpty()).distinct().toList());
        return "admin/work-new";
    }

    public record NewWork(String region, String klad, String name, String slug, String grid, String copyFrom,
                          String name490, boolean createSerie, String descCs, String descEn, String thumbnailUrl) {
    }

    @PostMapping("/admin/works/create")
    @ResponseBody
    public Map<String, Object> createWork(@RequestBody NewWork req) {
        if (!gate.isAdmin()) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        String region = trim(req.region()), klad = trim(req.klad()), name = trim(req.name());
        String slug = trim(req.slug()), grid = trim(req.grid()), name490 = trim(req.name490());
        if (name.isEmpty() || klad.isEmpty() || region.isEmpty()) {
            return Map.of("success", false, "message", "Vyplňte region, klad listů a název díla.");
        }
        if (!SLUG.matcher(slug).matches()) {
            return Map.of("success", false, "message", "Název souborů smí obsahovat jen malá písmena bez diakritiky, číslice a pomlčky.");
        }
        List<Work> works = data.works();
        if (works.stream().anyMatch(w -> w.layer().equals(slug)) || data.exists("template/" + slug + ".txt")
                || data.exists("geojson/" + slug + ".json")) {
            return Map.of("success", false, "message", "Soubory „" + slug + "“ už existují — zvolte jiný název souborů.");
        }
        if (!data.exists("geojson/" + grid + ".json")) {
            return Map.of("success", false, "message", "Vyberte mřížku listů.");
        }
        if (name490.isEmpty()) {
            return Map.of("success", false, "message", "Vyplňte jméno díla v poli 490.");
        }
        if (req.createSerie() && trim(req.thumbnailUrl()).isEmpty()) {
            return Map.of("success", false, "message", "Série na webu potřebuje náhledový obrázek (URL).");
        }

        // the template: a copy of another dílo's (or the base template), writing the new 490
        Work source = req.copyFrom() == null || req.copyFrom().isBlank() ? null : data.work(req.copyFrom());
        String template = source != null ? data.read(source.templatePath()) : data.read("template/template.txt");
        template = with490(template, name490);
        String err = SeriesEditorController.validateTemplate(template);
        if (err != null) {
            return Map.of("success", false, "message", "Šablona: " + err);
        }

        String config = data.read(DataRepoService.CONFIG);
        String title = region + "; " + klad + "; " + name;
        String newConfig = addWork(config, title, slug, source == null ? null : formatFunctionsOf(config, source.layer()));
        if (newConfig == null) {
            return Map.of("success", false, "message", "Seznam mapových děl (config.js) se nepodařilo upravit.");
        }

        Map<String, String> files = new LinkedHashMap<>();
        files.put(DataRepoService.CONFIG, newConfig);
        files.put("template/" + slug + ".txt", template);
        // the dílo gets its own copy of the grid (as every dílo of the catalogue has)
        files.put("geojson/" + slug + ".json", data.read("geojson/" + grid + ".json"));
        if (req.createSerie()) {
            JSONArray defs = new JSONArray(data.read(DataRepoService.CONTENT_DEFINITION));
            for (Object o : defs) {
                if (name490.equals(((JSONObject) o).optString("name").trim())) {
                    return Map.of("success", false, "message", "Série „" + name490 + "“ na webu už je.");
                }
            }
            JSONObject desc = new JSONObject();
            if (!trim(req.descCs()).isEmpty()) desc.put("cs", trim(req.descCs()));
            if (!trim(req.descEn()).isEmpty()) desc.put("en", trim(req.descEn()));
            defs.put(new JSONObject().put("field", "490a").put("name", name490).put("grid", slug)
                    .put("sheets", "490v").put("groupby", "field.substring(0,4)")
                    .put("thumbnailUrl", trim(req.thumbnailUrl())).put("description", desc));
            List<JSONObject> items = new ArrayList<>();
            for (Object o : defs) {
                items.add((JSONObject) o);
            }
            files.put(DataRepoService.CONTENT_DEFINITION, SeriesEditorController.serialize(items));
        }
        return saved(files, "Create map work: " + name, "/admin/works");
    }

    /** The template with field 490 $a replaced (the first 490 line). */
    static String with490(String template, String name490) {
        Matcher m = Pattern.compile("(?m)^(490.{1,3}L \\$\\$a)([^\\n]*?)(\\s*(\\$\\$|\\{)|$)").matcher(template);
        if (!m.find()) {
            return template;
        }
        String rest = m.group(3).isEmpty() ? "" : " " + m.group(3).trim();
        return template.substring(0, m.start(2)) + name490 + rest + template.substring(m.end(3));
    }

    /** config.js with a new dílo at the end of mapseries.config.series, or null. */
    static String addWork(String config, String title, String slug, String formatFunctions) {
        int s = config.indexOf("series:");
        int open = s < 0 ? -1 : config.indexOf('[', s);
        int close = open < 0 ? -1 : matching(config, open);
        if (close < 0) {
            return null;
        }
        int last = close - 1;
        while (last > open && Character.isWhitespace(config.charAt(last))) {
            last--;
        }
        String entry = "{\n      title: " + jsString(title) + ",\n      layer: " + jsString(slug)
                + ",\n      template: " + jsString(slug + ".txt")
                + (formatFunctions != null ? ",\n      formatFunctions: " + formatFunctions : "") + "\n    }";
        String sep = config.charAt(last) == '[' ? "\n    " : ",\n    ";
        return config.substring(0, last + 1) + sep + entry + "\n  " + config.substring(close);
    }

    /** The "formatFunctions: {…}" object of a dílo in config.js (its JS text), or null. */
    static String formatFunctionsOf(String config, String layer) {
        int at = config.indexOf("layer: \"" + layer + "\"");
        if (at < 0) {
            return null;
        }
        int end = config.indexOf("title:", at);
        int ff = config.indexOf("formatFunctions:", at);
        if (ff < 0 || (end >= 0 && ff > end)) {
            return null;
        }
        int open = config.indexOf('{', ff);
        int close = matching(config, open);
        return close < 0 ? null : config.substring(open, close + 1);
    }

    /** Index of the bracket closing the one at {@code open} (strings and comments skipped). */
    private static int matching(String js, int open) {
        char o = js.charAt(open), c = o == '[' ? ']' : '}';
        int depth = 0;
        for (int i = open; i < js.length(); i++) {
            char ch = js.charAt(i);
            if (ch == '"' || ch == '\'') {
                for (i++; i < js.length() && js.charAt(i) != ch; i++) {
                    if (js.charAt(i) == '\\') i++;
                }
            } else if (ch == '/' && i + 1 < js.length() && js.charAt(i + 1) == '/') {
                i = js.indexOf('\n', i);
                if (i < 0) return -1;
            } else if (ch == '/' && i + 1 < js.length() && js.charAt(i + 1) == '*') {
                i = js.indexOf("*/", i);
                if (i < 0) return -1;
                i++;
            } else if (ch == o) {
                depth++;
            } else if (ch == c && --depth == 0) {
                return i;
            }
        }
        return -1;
    }

    private static String jsString(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private Map<String, Object> saved(Map<String, String> files, String message, String redirect) {
        GithubWriteService.SaveResult result;
        try {
            result = github.saveFiles(gate.token(), message, files);
        } catch (Exception e) {
            return Map.of("success", false, "message", "Uložení na GitHub selhalo: " + e.getMessage());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("redirect", redirect);
        out.put("message", result.userMessage());
        if (result.prUrl() != null) {
            out.put("prUrl", result.prUrl());
        }
        return out;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
