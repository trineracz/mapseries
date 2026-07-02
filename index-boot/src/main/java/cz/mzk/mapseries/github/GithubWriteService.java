package cz.mzk.mapseries.github;

import cz.mzk.mapseries.config.MapseriesProperties;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Commits a single file to the WRITE repo (our fork) via the GitHub git-data
 * REST API. Replaces the egit-based half of the old GithubService.saveFile;
 * writes never touch the production read repo.
 */
@Component
public class GithubWriteService {

    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public GithubWriteService(MapseriesProperties props) {
        this.props = props;
    }

    public void saveFile(String token, String commitMessage, String path, String content) {
        String api = "https://api.github.com/repos/"
                + props.repo().writeUser() + "/" + props.repo().writeName();

        String masterSha = get(api + "/git/refs/heads/master", token)
                .getJSONObject("object").getString("sha");

        String baseTreeSha = get(api + "/git/commits/" + masterSha, token)
                .getJSONObject("tree").getString("sha");

        String blobSha = post(api + "/git/blobs", token,
                new JSONObject().put("content", content).put("encoding", "utf-8")).getString("sha");

        JSONArray tree = new JSONArray().put(new JSONObject()
                .put("path", path).put("mode", "100644").put("type", "blob").put("sha", blobSha));
        String newTreeSha = post(api + "/git/trees", token,
                new JSONObject().put("base_tree", baseTreeSha).put("tree", tree)).getString("sha");

        String newCommitSha = post(api + "/git/commits", token, new JSONObject()
                .put("message", commitMessage)
                .put("tree", newTreeSha)
                .put("parents", new JSONArray().put(masterSha))).getString("sha");

        patch(api + "/git/refs/heads/master", token, new JSONObject().put("sha", newCommitSha));
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
