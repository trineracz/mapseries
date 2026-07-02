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
