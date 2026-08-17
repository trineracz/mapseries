package cz.mzk.mapseries.github;

import cz.mzk.mapseries.config.MapseriesProperties;
import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Commits a single file to the WRITE repo (our fork) via the GitHub git-data
 * REST API. Replaces the egit-based half of the old GithubService.saveFile;
 * writes never touch the production read repo.
 */
@Component
public class GithubWriteService {

    private static final Logger log = LoggerFactory.getLogger(GithubWriteService.class);

    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public GithubWriteService(MapseriesProperties props) {
        this.props = props;
    }

    /** Commit a single file (convenience wrapper around {@link #saveFiles}). */
    public void saveFile(String token, String commitMessage, String path, String content) {
        saveFiles(token, commitMessage, java.util.Map.of(path, content));
    }

    /** Commit several files to the WRITE repo's master branch in ONE commit. */
    public void saveFiles(String token, String commitMessage, java.util.Map<String, String> files) {
        String repo = props.repo().writeUser() + "/" + props.repo().writeName();
        if (props.editor() != null && props.editor().dryRun()) {
            log.warn("saveFiles: DRY-RUN — skipping commit of {} file(s) to {}: {}",
                    files.size(), repo, files.keySet());
            return;
        }
        String api = "https://api.github.com/repos/" + repo;
        log.info("saveFiles: committing {} file(s) to {} (token present={}, msg='{}')",
                files.size(), repo, token != null && !token.isBlank(), commitMessage);
        try {
            String masterSha = get(api + "/git/refs/heads/master", token)
                    .getJSONObject("object").getString("sha");

            String baseTreeSha = get(api + "/git/commits/" + masterSha, token)
                    .getJSONObject("tree").getString("sha");

            JSONArray tree = new JSONArray();
            for (var entry : files.entrySet()) {
                String blobSha = post(api + "/git/blobs", token,
                        new JSONObject().put("content", entry.getValue()).put("encoding", "utf-8")).getString("sha");
                tree.put(new JSONObject().put("path", entry.getKey()).put("mode", "100644")
                        .put("type", "blob").put("sha", blobSha));
            }
            String newTreeSha = post(api + "/git/trees", token,
                    new JSONObject().put("base_tree", baseTreeSha).put("tree", tree)).getString("sha");

            String newCommitSha = post(api + "/git/commits", token, new JSONObject()
                    .put("message", commitMessage)
                    .put("tree", newTreeSha)
                    .put("parents", new JSONArray().put(masterSha))).getString("sha");

            patch(api + "/git/refs/heads/master", token, new JSONObject().put("sha", newCommitSha));
            log.info("saveFiles: committed {} to {}@master", newCommitSha, repo);
        } catch (RestClientResponseException e) {
            log.error("saveFiles: GitHub API {} for {} -> {}", e.getStatusCode(), repo,
                    e.getResponseBodyAsString());
            throw new RuntimeException("GitHub API " + e.getStatusCode() + ": "
                    + e.getResponseBodyAsString(), e);
        }
    }

    private JSONObject get(String url, String token) {
        return new JSONObject(http.get().uri(url).headers(h -> auth(h, token)).retrieve().body(String.class));
    }

    private JSONObject post(String url, String token, JSONObject body) {
        return new JSONObject(http.post().uri(url).headers(h -> auth(h, token))
                .body(body.toString()).retrieve().body(String.class));
    }

    private void patch(String url, String token, JSONObject body) {
        http.patch().uri(url).headers(h -> auth(h, token)).body(body.toString()).retrieve().toBodilessEntity();
    }

    private void auth(HttpHeaders headers, String token) {
        headers.set("Authorization", "token " + token);
        headers.set("Accept", "application/vnd.github+json");
        headers.setContentType(MediaType.APPLICATION_JSON);
    }
}
