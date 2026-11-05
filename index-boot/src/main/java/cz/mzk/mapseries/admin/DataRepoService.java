package cz.mzk.mapseries.admin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;

/**
 * The data repo as the admin pages see it: the WRITE repo (in production the
 * same as the read repo), read fresh through the GitHub API with the signed-in
 * admin's token.
 *
 * It knows the three things the admin works with and how they connect:
 * <ul>
 * <li>mapová díla of the catalogue ({@code config.js}), each with its own
 * template ({@code template/*.txt}) and grid ({@code geojson/*.json}),</li>
 * <li>série of the public web ({@code content-definition.json}): the exact
 * text of field 490 $a and the grid the sheets are drawn on,</li>
 * <li>grids, shared by díla and série.</li>
 * </ul>
 * A dílo fills a série through field 490: its template writes a fixed 490 $a
 * into every record and the web shows the records whose 490 $a equals the
 * série's name.
 */
@Service
public class DataRepoService {

    public static final String CONTENT_DEFINITION = "content-definition.json";
    public static final String CONFIG = "config.js";

    private static final Pattern WORK = Pattern.compile(
            "title:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"\\s*,\\s*layer:\\s*\"([^\"]*)\"\\s*,\\s*template:\\s*\"([^\"]*)\"");
    private static final Pattern FIELD_490 = Pattern.compile("(?m)^490.{1,3}L \\$\\$a([^\\n]*)$");

    private final MapseriesProperties props;
    private final AuthService authService;
    private final RestClient http = RestClient.create();
    /** File contents by git blob sha (immutable, so never stale). */
    private final Map<String, String> blobs = new ConcurrentHashMap<>();

    public DataRepoService(MapseriesProperties props, AuthService authService) {
        this.props = props;
        this.authService = authService;
    }

    // ---- what the admin works with ---------------------------------------------

    /** A dílo of the catalogue: one entry of config.js ("Region; Klad; Název"). */
    public record Work(String title, String region, String klad, String name, String layer, String template) {
        public String templatePath() {
            return "template/" + template;
        }

        public String gridPath() {
            return "geojson/" + layer + ".json";
        }
    }

    /** A série of the public web: one entry of content-definition.json. */
    public record Serie(String name, String grid) {
        /** The name without the brackets and the closing " ;" (how the web shows it). */
        public String prettyName() {
            return pretty(name);
        }
    }

    /** What a template writes into field 490 $a and which série shows those records. */
    public record Field490(String value, boolean fixed, Serie serie) {
    }

    public List<Work> works() {
        return parseWorks(read(CONFIG));
    }

    /** The díla listed in config.js (mapseries.config.series). */
    public static List<Work> parseWorks(String config) {
        List<Work> out = new ArrayList<>();
        Matcher m = WORK.matcher(config);
        while (m.find()) {
            String title = m.group(1).replace("\\\"", "\"");
            String[] parts = title.split(";", 3);
            String region = parts.length > 2 ? parts[0].trim() : "";
            String klad = parts.length > 2 ? parts[1].trim() : parts.length > 1 ? parts[0].trim() : "";
            String name = parts[parts.length - 1].trim();
            out.add(new Work(title, region, klad, name, m.group(2), m.group(3)));
        }
        return out;
    }

    public Work work(String layer) {
        return works().stream().filter(w -> w.layer().equals(layer)).findFirst().orElse(null);
    }

    public List<Serie> series() {
        List<Serie> out = new ArrayList<>();
        for (Object o : new JSONArray(read(CONTENT_DEFINITION))) {
            JSONObject j = (JSONObject) o;
            out.add(new Serie(j.optString("name", ""), j.optString("grid", "")));
        }
        return out;
    }

    /** The grid files (names without "geojson/" and ".json"). */
    public List<String> grids() {
        List<String> out = new ArrayList<>();
        for (String path : tree(authService.getToken()).keySet()) {
            if (path.startsWith("geojson/") && path.endsWith(".json") && path.indexOf('/', 8) < 0) {
                out.add(path.substring(8, path.length() - 5));
            }
        }
        out.sort(String::compareTo);
        return out;
    }

    /** Field 490 $a as the template writes it, and the série it ends up in (or null). */
    public static Field490 field490(String template, List<Serie> series) {
        Matcher m = FIELD_490.matcher(template == null ? "" : template);
        if (!m.find()) {
            return null;
        }
        String line = m.group(1);
        // $a runs up to the next subfield ($$v, the sheet) or a field block {…}
        int end = line.length();
        for (String stop : new String[] {"$$", "{"}) {
            int i = line.indexOf(stop);
            if (i >= 0 && i < end) {
                end = i;
            }
        }
        boolean fixed = end == line.length() || line.charAt(end) == '$';
        String value = line.substring(0, end).trim();
        Serie serie = series.stream().filter(s -> s.name().trim().equals(value)).findFirst().orElse(null);
        return new Field490(value, fixed, serie);
    }

    /** Which díla and série use a grid. */
    public record GridUse(List<Work> works, List<Serie> series) {
    }

    /** A grid to choose from: its file name and what people call it (the dílo or série using it). */
    public record GridOption(String name, String label) {
    }

    public List<GridOption> gridOptions(List<Work> works, List<Serie> series) {
        List<GridOption> out = new ArrayList<>();
        for (String g : grids()) {
            GridUse use = gridUse(g, works, series);
            String label = !use.works().isEmpty() ? use.works().get(0).name()
                    : !use.series().isEmpty() ? use.series().get(0).prettyName() : g;
            out.add(new GridOption(g, label));
        }
        out.sort((a, b) -> a.label().compareToIgnoreCase(b.label()));
        return out;
    }

    public GridUse gridUse(String grid, List<Work> works, List<Serie> series) {
        return new GridUse(
                works.stream().filter(w -> w.layer().equals(grid)).toList(),
                series.stream().filter(s -> s.grid().equals(grid)).toList());
    }

    // ---- reading -------------------------------------------------------------------

    /** A file of the write repo, fresh. */
    public String read(String path) {
        String token = authService.getToken();
        return read(path, tree(token), token);
    }

    private String read(String path, Map<String, String> tree, String token) {
        String sha = tree.get(path);
        if (sha != null) {
            String cached = blobs.get(sha);
            if (cached != null) {
                return cached;
            }
        }
        String content = call("/contents/" + path + "?ref=master", "application/vnd.github.raw", token);
        if (sha != null) {
            blobs.put(sha, content);
        }
        return content;
    }

    /** Several files at once (e.g. all templates), each read once per version. */
    public Map<String, String> readAll(List<String> paths) {
        Map<String, String> out = new LinkedHashMap<>();
        // the token is read here: the session is not available in the worker threads
        String token = authService.getToken();
        Map<String, String> tree = tree(token);
        paths.parallelStream().forEach(p -> {
            try {
                String c = read(p, tree, token);
                synchronized (out) {
                    out.put(p, c);
                }
            } catch (Exception e) {
                // a missing file reads as absent
            }
        });
        return out;
    }

    public boolean exists(String path) {
        return tree(authService.getToken()).containsKey(path);
    }

    /** Path -> blob sha of every file in the write repo's master. */
    private Map<String, String> tree(String token) {
        JSONObject t = new JSONObject(call("/git/trees/master?recursive=1", "application/vnd.github+json", token));
        Map<String, String> out = new LinkedHashMap<>();
        for (Object o : t.getJSONArray("tree")) {
            JSONObject e = (JSONObject) o;
            if ("blob".equals(e.optString("type"))) {
                out.put(e.getString("path"), e.getString("sha"));
            }
        }
        return out;
    }

    private String call(String suffix, String accept, String token) {
        String repo = props.repo().writeUser() + "/" + props.repo().writeName();
        return http.get().uri("https://api.github.com/repos/" + repo + suffix)
                .headers(h -> {
                    h.set("Accept", accept);
                    if (token != null && !token.isBlank()) {
                        h.setBearerAuth(token);
                    }
                })
                .retrieve().body(String.class);
    }

    // ---- helpers -------------------------------------------------------------------

    public static String pretty(String name) {
        String n = name == null ? "" : name.trim();
        int b = n.indexOf('['), e = n.lastIndexOf(']');
        if (b >= 0 && e > b) {
            return n.substring(b + 1, e);
        }
        return n.replaceAll("\\s*;\\s*$", "");
    }
}
