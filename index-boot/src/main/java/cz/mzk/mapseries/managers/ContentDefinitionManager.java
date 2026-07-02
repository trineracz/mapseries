package cz.mzk.mapseries.managers;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Parses the content-definition.json into {@link ContentDefinitionItem}s.
 * Simplified from the old CDI/Guava version: the harvest passes the raw JSON in.
 */
public class ContentDefinitionManager {

    private final String rawData;
    private List<ContentDefinitionItem> definitions;

    private ContentDefinitionManager(String jsonString) {
        this.rawData = jsonString;
    }

    public static ContentDefinitionManager fromJsonString(String jsonString) {
        return new ContentDefinitionManager(jsonString);
    }

    public String getRawData() {
        return rawData;
    }

    public List<ContentDefinitionItem> getDefinitions() {
        if (definitions == null) {
            definitions = parse();
        }
        return definitions;
    }

    private List<ContentDefinitionItem> parse() {
        List<ContentDefinitionItem> result = new ArrayList<>();
        JSONArray jsonData = new JSONArray(rawData);

        for (Object objectItem : jsonData) {
            if (!(objectItem instanceof JSONObject jsonItem)) {
                throw new IllegalStateException("JSON data has unexpected format.");
            }
            ContentDefinitionItem item = new ContentDefinitionItem.Builder()
                    .withField(jsonItem.getString("field"))
                    .withName(jsonItem.getString("name"))
                    .withGrid(jsonItem.getString("grid"))
                    .withSheets(jsonItem.getString("sheets"))
                    .withGroupBy(jsonItem.getString("groupby"))
                    .withThumbnailUrl(jsonItem.getString("thumbnailUrl"))
                    .withDescription(parseDescription(jsonItem.optJSONObject("description")))
                    .build();
            result.add(item);
        }
        return result;
    }

    private Map<String, String> parseDescription(JSONObject description) {
        if (description == null) {
            return Collections.emptyMap();
        }
        return description.keySet().stream()
                .filter(key -> !description.isNull(key))
                .collect(Collectors.toMap(Function.identity(), description::getString));
    }
}
