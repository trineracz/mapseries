package cz.mzk.mapseries.web;

import cz.mzk.mapseries.config.MapseriesProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * Replaces the old DataProxyServlet: serves the data-repo files (geojson,
 * config.js, templates, content-definition) to the frontend by proxying
 * raw.githubusercontent.com for the READ repo. Read-only.
 */
@RestController
public class DataProxyController {

    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public DataProxyController(MapseriesProperties props) {
        this.props = props;
    }

    @GetMapping("/server/data/**")
    public ResponseEntity<byte[]> proxy(HttpServletRequest request) {
        String path = request.getRequestURI().substring("/server/data/".length());

        String url = String.format("https://raw.githubusercontent.com/%s/%s/master/%s",
                props.repo().readUser(), props.repo().readName(), path);

        byte[] body = http.get().uri(url).retrieve().body(byte[].class);

        MediaType type = MediaType.APPLICATION_OCTET_STREAM;
        if (path.endsWith(".js")) {
            type = MediaType.valueOf("application/javascript");
        } else if (path.endsWith(".json")) {
            type = MediaType.APPLICATION_JSON;
        } else if (path.endsWith(".txt")) {
            type = MediaType.TEXT_PLAIN;
        }

        return ResponseEntity.ok().contentType(type).body(body);
    }
}
