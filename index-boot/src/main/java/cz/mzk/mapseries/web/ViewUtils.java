package cz.mzk.mapseries.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Small helpers for the presentation controllers: building the JS sheet-id array
 * and the language-switch URL map that the old app injected as page globals.
 */
final class ViewUtils {

    private ViewUtils() {
    }

    /** Builds a JS array literal like ['4162','4163'] for window.mapSettings.sheetIds. */
    static String toJsArray(List<String> ids) {
        return "[" + ids.stream()
                .map(id -> "'" + id + "'")
                .collect(Collectors.joining(",")) + "]";
    }

    /** Builds window.langUrls JSON, keeping the current page params and adding lang. */
    static String langUrls(String path, String query) {
        String base = path + "?" + (query == null || query.isEmpty() ? "" : query + "&");
        return "{\"cs\":\"" + base + "lang=cs\",\"en\":\"" + base + "lang=en\"}";
    }

    static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
