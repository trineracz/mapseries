package cz.mzk.mapseries.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;

class ContentDefinitionSerializeTest {

    @Test
    void theLibrarysFileIsWrittenBackByteForByte() throws Exception {
        String original;
        try (var in = getClass().getResourceAsStream("/content-definition.json")) {
            original = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        List<JSONObject> items = new ArrayList<>();
        for (Object o : new JSONArray(original)) {
            items.add((JSONObject) o);
        }
        assertEquals(original, SeriesEditorController.serialize(items));
    }
}
