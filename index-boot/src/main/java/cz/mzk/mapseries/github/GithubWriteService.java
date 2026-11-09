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
 * Commits changes to the WRITE repo (our fork) via the GitHub git-data REST API
 * and opens a Pull Request against the READ repo (upstream) — nothing lands on
 * the production data without review, exactly like the old editor's fork → work
 * branch → pull-request flow. Writes never patch a shared master directly.
 */
@Component
public class GithubWriteService {

    private static final Logger log = LoggerFactory.getLogger(GithubWriteService.class);

    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public GithubWriteService(MapseriesProperties props) {
        this.props = props;
    }

    /** Outcome of a save: the branch that was pushed and the PR opened for it.
     *  In dry-run everything is null / -1 (nothing was written). */
    public record SaveResult(String branch, String prUrl, int prNumber, boolean unchanged) {
        public SaveResult(String branch, String prUrl, int prNumber) {
            this(branch, prUrl, prNumber, false);
        }

        static SaveResult nothingChanged() {
            return new SaveResult(null, null, -1, true);
        }

        public boolean committed() { return branch != null; }

        /** The line shown to the user after saving. */
        public String userMessage() {
            if (unchanged) return "Žádné změny k uložení — návrh změny nevznikl.";
            if (!committed()) return "Uloženo (testovací režim — nevytvořen návrh změny).";
            return "Vytvořen návrh změny (PR" + (prNumber > 0 ? " #" + prNumber : "") + ") — čeká na schválení správcem.";
        }
    }

    /** Commit a single file (convenience wrapper around {@link #saveFiles}). */
    public SaveResult saveFile(String token, String commitMessage, String path, String content) {
        return saveFiles(token, commitMessage, java.util.Map.of(path, content));
    }

    /** Commit the given files to a fresh branch in the WRITE repo (ONE commit) and
     *  open a Pull Request into the READ repo's master. When read == write this is
     *  an internal PR; when they differ (a fork) it's a cross-fork PR to upstream.
     *  mapseries.repo.pr-user/pr-name override the PR target (test deployments). */
    public SaveResult saveFiles(String token, String commitMessage, java.util.Map<String, String> files) {
        String writeRepo = props.repo().writeUser() + "/" + props.repo().writeName();
        String baseRepo = props.repo().prRepo();
        if (props.editor() != null && props.editor().dryRun()) {
            log.warn("saveFiles: DRY-RUN — skipping commit of {} file(s) to {} + PR to {}: {}",
                    files.size(), writeRepo, baseRepo, files.keySet());
            return new SaveResult(null, null, -1);
        }
        String api = "https://api.github.com/repos/" + writeRepo;
        String branch = branchName(commitMessage);
        log.info("saveFiles: committing {} file(s) to {}@{} (token present={}, msg='{}')",
                files.size(), writeRepo, branch, token != null && !token.isBlank(), commitMessage);
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
            if (newTreeSha.equals(baseTreeSha)) {
                log.info("saveFiles: {} file(s) identical to {}@master, nothing to propose", files.size(), writeRepo);
                return SaveResult.nothingChanged();
            }

            // branch off the write repo's current master
            post(api + "/git/refs", token, new JSONObject()
                    .put("ref", "refs/heads/" + branch).put("sha", masterSha));

            String newCommitSha = post(api + "/git/commits", token, new JSONObject()
                    .put("message", commitMessage)
                    .put("tree", newTreeSha)
                    .put("parents", new JSONArray().put(masterSha))).getString("sha");

            patch(api + "/git/refs/heads/" + branch, token, new JSONObject().put("sha", newCommitSha));
            log.info("saveFiles: committed {} to {}@{}", newCommitSha, writeRepo, branch);

            // open the PR upstream: head = <writeUser>:<branch>, base = master
            String head = props.repo().writeUser() + ":" + branch;
            JSONObject pr = post("https://api.github.com/repos/" + baseRepo + "/pulls", token,
                    new JSONObject().put("title", commitMessage).put("base", "master")
                            .put("head", head).put("body", "Vytvořeno editorem sérií (Mapseries admin)."));
            log.info("saveFiles: opened PR {} on {}", pr.optString("html_url", "?"), baseRepo);
            return new SaveResult(branch, pr.optString("html_url", null), pr.optInt("number", -1));
        } catch (RestClientResponseException e) {
            log.error("saveFiles: GitHub API {} for {} -> {}", e.getStatusCode(), writeRepo,
                    e.getResponseBodyAsString());
            throw new RuntimeException("GitHub API " + e.getStatusCode() + ": "
                    + e.getResponseBodyAsString(), e);
        }
    }

    /** A branch name safe for git refs: edit-<slug>-<timestamp>. */
    private static String branchName(String commitMessage) {
        String slug = commitMessage == null ? "" : commitMessage.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (slug.length() > 40) { slug = slug.substring(0, 40).replaceAll("-+$", ""); }
        if (slug.isBlank()) { slug = "series"; }
        return "edit-" + slug + "-" + System.currentTimeMillis();
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
