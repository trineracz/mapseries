package cz.mzk.mapseries.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

import cz.mzk.mapseries.admin.DataRepoService;
import cz.mzk.mapseries.admin.DataRepoService.GridUse;
import cz.mzk.mapseries.admin.DataRepoService.Serie;
import cz.mzk.mapseries.admin.DataRepoService.Work;
import cz.mzk.mapseries.github.GithubWriteService;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Admin → Mřížky: the grids (klady listů, geojson/*.json). A grid is used by
 * díla of the catalogue and by série of the web; the page says which before
 * anything is changed.
 */
@Controller
public class GridsController {

    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");
    private static final Pattern ATTR = Pattern.compile("\"attr\"\\s*:\\s*\"([^\"]+)\"");

    private final AdminGate gate;
    private final DataRepoService data;
    private final GithubWriteService github;

    public GridsController(AdminGate gate, DataRepoService data, GithubWriteService github) {
        this.gate = gate;
        this.data = data;
        this.github = github;
    }

    public record GridRow(String name, GridUse use) {
        /** What people call it: the dílo (or série) that uses it; the file name otherwise. */
        public String label() {
            return GridsController.label(name, use);
        }
    }

    private static String czech(int n, String one, String few, String many) {
        return n == 1 ? one : n >= 2 && n <= 4 ? few : many;
    }

    static String label(String name, GridUse use) {
        if (!use.works().isEmpty()) {
            return use.works().get(0).name();
        }
        if (!use.series().isEmpty()) {
            return use.series().get(0).prettyName();
        }
        return name;
    }

    @GetMapping("/admin/grids")
    public String list(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            gate.signIn(code);
            return "redirect:/admin/grids";
        }
        if (!gate.open(model, request, "grids")) {
            return "admin/grids-list";
        }
        List<Work> works = data.works();
        List<Serie> series = data.series();
        List<GridRow> rows = new ArrayList<>();
        for (String g : data.grids()) {
            rows.add(new GridRow(g, data.gridUse(g, works, series)));
        }
        model.addAttribute("grids", rows);
        return "admin/grids-list";
    }

    @GetMapping("/admin/grids/edit")
    public String edit(@RequestParam(required = false) String name, @RequestParam(required = false) String code,
                       Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            gate.signIn(code);
            return name != null ? "redirect:/admin/grids/edit?name=" + AdminGate.enc(name) : "redirect:/admin/grids";
        }
        if (!gate.open(model, request, "grids")) {
            return "admin/grid-edit";
        }
        boolean isNew = name == null || name.isBlank();
        if (!isNew && !data.exists("geojson/" + name + ".json")) {
            model.addAttribute("error", "Mřížka „" + name + "“ neexistuje.");
            return "admin/grid-edit";
        }
        model.addAttribute("mode", isNew ? "new" : "edit");
        model.addAttribute("gridName", isNew ? "" : name);
        if (!isNew) {
            List<Work> works = data.works();
            GridUse use = data.gridUse(name, works, data.series());
            model.addAttribute("use", use);
            model.addAttribute("gridLabel", label(name, use));
            int w = use.works().size(), x = use.series().size();
            model.addAttribute("useSummary", "Tuto mřížku používá " + w + " " + czech(w, "dílo", "díla", "děl") + " pro katalogizaci a "
                    + x + " " + czech(x, "série", "série", "sérií") + " na webu — změna se projeví u všech");
            // the sheet attributes the templates of its díla read ({"attr": "…"}), for the column manager
            Set<String> attrs = new LinkedHashSet<>();
            for (String t : data.readAll(use.works().stream().map(Work::templatePath).toList()).values()) {
                Matcher m = ATTR.matcher(t);
                while (m.find()) {
                    attrs.add(m.group(1));
                }
            }
            model.addAttribute("attrs", String.join(",", attrs));
        }
        return "admin/grid-edit";
    }

    @GetMapping(value = "/admin/grids/data", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    public ResponseEntity<String> gridData(@RequestParam String name) {
        if (!gate.isAdmin()) {
            return ResponseEntity.status(403).build();
        }
        String path = "geojson/" + name + ".json";
        if (!data.exists(path)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(data.read(path));
    }

    public record SaveGrid(String mode, String name, String geojson) {
    }

    @PostMapping("/admin/grids/save")
    @ResponseBody
    public Map<String, Object> save(@RequestBody SaveGrid req) {
        if (!gate.isAdmin()) {
            return Map.of("success", false, "message", "Nejste přihlášen jako správce.");
        }
        String name = req.name() == null ? "" : req.name().trim();
        if (!SLUG.matcher(name).matches()) {
            return Map.of("success", false, "message", "Název mřížky smí obsahovat jen malá písmena bez diakritiky, číslice a pomlčky.");
        }
        String path = "geojson/" + name + ".json";
        boolean exists = data.exists(path);
        if ("new".equals(req.mode()) && exists) {
            return Map.of("success", false, "message", "Mřížka „" + name + "“ už existuje.");
        }
        if (!"new".equals(req.mode()) && !exists) {
            return Map.of("success", false, "message", "Mřížka „" + name + "“ neexistuje.");
        }
        try {
            JSONObject gj = new JSONObject(req.geojson());
            if (!"FeatureCollection".equals(gj.optString("type")) || gj.optJSONArray("features") == null
                    || gj.getJSONArray("features").isEmpty()) {
                return Map.of("success", false, "message", "Mřížka musí mít alespoň jeden list.");
            }
        } catch (Exception e) {
            return Map.of("success", false, "message", "Neplatný geojson: " + e.getMessage());
        }
        GithubWriteService.SaveResult result;
        try {
            result = github.saveFiles(gate.token(), ("new".equals(req.mode()) ? "Create grid: " : "Edit grid: ") + name,
                    Map.of(path, req.geojson()));
        } catch (Exception e) {
            return Map.of("success", false, "message", "Uložení na GitHub selhalo: " + e.getMessage());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("redirect", "/admin/grids/edit?name=" + AdminGate.enc(name));
        out.put("message", result.userMessage());
        if (result.prUrl() != null) {
            out.put("prUrl", result.prUrl());
        }
        return out;
    }
}
