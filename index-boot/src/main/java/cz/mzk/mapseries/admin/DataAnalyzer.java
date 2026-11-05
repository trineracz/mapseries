package cz.mzk.mapseries.admin;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.dao.SheetDAO;
import cz.mzk.mapseries.repository.SerieRepository;
import cz.mzk.mapseries.repository.SheetRepository;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Discrepancy report: harvested sheets (from Aleph, in the DB) whose sheet id has
 * no matching polygon in the series' geojson grid. Ported from the old DataAnalyzer.
 */
@Service
public class DataAnalyzer {

    private final SerieRepository serieRepository;
    private final SheetRepository sheetRepository;
    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public DataAnalyzer(SerieRepository serieRepository, SheetRepository sheetRepository, MapseriesProperties props) {
        this.serieRepository = serieRepository;
        this.sheetRepository = sheetRepository;
        this.props = props;
    }

    /** A harvested sheet that has no rectangle in its série's grid, and why. */
    public record NonLinked(SheetDAO sheet, Kind kind, String reason) {
    }

    public enum Kind {
        /** An overview of the whole sheet division — fine, it belongs on no single sheet. */
        OVERVIEW,
        /** One print covering several sheets. */
        COMBINED,
        /** A part of a sheet (e.g. "4557/West"). */
        PART,
        /** The sheet number is not in the grid at all. */
        UNKNOWN;

        public boolean isFine() {
            return this == OVERVIEW;
        }
    }

    /** The sheets of one série that are not on its grid. */
    public record SerieReport(String name, List<NonLinked> problems, List<NonLinked> fine) {
    }

    /** The non-linked sheets of every série, each with what it is and what to do. */
    public List<SerieReport> getNonLinkedReport() {
        List<SerieReport> out = new ArrayList<>();
        for (SerieDAO serie : serieRepository.findCurrent()) {
            Set<String> ids = loadGeojsonSheetIds(serie.getGrid());
            if (ids == null) {
                continue;
            }
            List<NonLinked> problems = new ArrayList<>(), fine = new ArrayList<>();
            for (SheetDAO sheet : getNonLinkedMapsForSerie(serie, ids)) {
                NonLinked n = classify(sheet, ids);
                (n.kind().isFine() ? fine : problems).add(n);
            }
            if (!problems.isEmpty() || !fine.isEmpty()) {
                out.add(new SerieReport(serie.getName(), problems, fine));
            }
        }
        return out;
    }

    static NonLinked classify(SheetDAO sheet, Set<String> ids) {
        String id = sheet.getSheetId() == null ? "" : sheet.getSheetId().trim();
        String all = plain(id + " " + sheet.getYear() + " " + sheet.getTitle());
        if (all.contains("klad") || all.contains("prehled") || all.contains("ubersicht")) {
            return new NonLinked(sheet, Kind.OVERVIEW,
                    "Přehledný list kladu — ukazuje rozdělení celého díla na listy, nepatří na jeden list. Je v pořádku.");
        }
        List<String> parts = Arrays.stream(id.split("\\s*[/+]\\s*")).filter(x -> !x.isBlank()).toList();
        if (parts.size() > 1) {
            List<String> onGrid = parts.stream().filter(x -> find(x, ids) != null).map(x -> find(x, ids)).toList();
            if (onGrid.size() == parts.size()) {
                return new NonLinked(sheet, Kind.COMBINED, "Sloučený tisk přes listy " + String.join(", ", onGrid)
                        + " — v mřížce jsou; web ale umí list nakreslit jen do jednoho obdélníčku.");
            }
            String first = find(parts.get(0), ids);
            if (first != null && parts.subList(1, parts.size()).stream().allMatch(x -> x.matches("\\p{L}+"))) {
                return new NonLinked(sheet, Kind.PART, "Část listu " + first + " („" + String.join("/", parts.subList(1, parts.size()))
                        + "“) — list " + first + " v mřížce je, ale číslo listu v záznamu obsahuje i označení části.");
            }
        }
        String close = find(id, ids);
        return new NonLinked(sheet, Kind.UNKNOWN, "Číslo listu „" + id + "“ v mřížce této série není"
                + (close != null && !close.equals(id) ? " — nejspíš jde o list „" + close + "“ (jinak zapsané)" : "")
                + ". Zkontrolujte pole 490 $v v záznamu v Alephu, nebo doplňte list do mřížky.");
    }

    /** The grid's sheet number written the same as {@code id} up to spaces and leading zeros. */
    private static String find(String id, Set<String> ids) {
        if (ids.contains(id)) {
            return id;
        }
        String key = id.replaceAll("\\s+", "").replaceAll("^0+(?=\\d)", "");
        for (String g : ids) {
            if (g.replaceAll("\\s+", "").replaceAll("^0+(?=\\d)", "").equalsIgnoreCase(key)) {
                return g;
            }
        }
        return null;
    }

    private static String plain(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
    }

    public Map<String, List<SheetDAO>> getNonLinkedMaps() {
        Map<String, List<SheetDAO>> result = new LinkedHashMap<>();
        for (SerieDAO serie : serieRepository.findCurrent()) {
            List<SheetDAO> nonLinked = getNonLinkedMapsForSerie(serie);
            if (!nonLinked.isEmpty()) {
                result.put(serie.getNameHtml(), nonLinked);
            }
        }
        return result;
    }

    private List<SheetDAO> getNonLinkedMapsForSerie(SerieDAO serie) {
        Set<String> geojsonSheetIds = loadGeojsonSheetIds(serie.getGrid());
        if (geojsonSheetIds == null) {
            // Could not load/parse the grid geojson — skip rather than over-report.
            return List.of();
        }
        return getNonLinkedMapsForSerie(serie, geojsonSheetIds);
    }

    private List<SheetDAO> getNonLinkedMapsForSerie(SerieDAO serie, Set<String> geojsonSheetIds) {
        return sheetRepository.findCurrentSheetIds(serie.getName()).stream()
                .filter(id -> !geojsonSheetIds.contains(id))
                .flatMap(id -> sheetRepository.findCurrentBySerieAndSheetId(serie.getName(), id).stream())
                .collect(Collectors.toList());
    }

    private Set<String> loadGeojsonSheetIds(String grid) {
        try {
            String url = String.format("https://raw.githubusercontent.com/%s/%s/master/geojson/%s.json",
                    props.repo().readUser(), props.repo().readName(), grid);
            String content = http.get().uri(url).retrieve().body(String.class);

            JSONArray features = new JSONObject(content).getJSONArray("features");
            Set<String> ids = new HashSet<>();
            for (Object o : features) {
                if (o instanceof JSONObject feature) {
                    JSONObject properties = feature.optJSONObject("properties");
                    if (properties != null && properties.has("SHEET")) {
                        ids.add(String.valueOf(properties.get("SHEET")));
                    }
                }
            }
            return ids;
        } catch (Exception e) {
            return null;
        }
    }
}
