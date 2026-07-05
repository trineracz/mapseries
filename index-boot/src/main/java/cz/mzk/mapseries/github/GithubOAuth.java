package cz.mzk.mapseries.github;

import cz.mzk.mapseries.config.MapseriesProperties;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Stateless GitHub OAuth helper: exchanges an authorization code for a token and
 * looks up the authenticated user's login. Replaces the token-exchange half of
 * the old GithubService (Apache HttpClient + egit) with RestClient.
 */
@Component
public class GithubOAuth {

    private static final Logger log = LoggerFactory.getLogger(GithubOAuth.class);

    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public GithubOAuth(MapseriesProperties props) {
        this.props = props;
    }

    public String exchangeCodeForToken(String code) {
        String form = "client_id=" + enc(props.github().clientId())
                + "&client_secret=" + enc(props.github().clientSecret())
                + "&code=" + enc(code);

        String body = http.post()
                .uri("https://github.com/login/oauth/access_token")
                .header("Accept", "application/json")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(String.class);

        JSONObject json = new JSONObject(body);
        if (json.has("access_token")) {
            return json.getString("access_token");
        }
        throw new RuntimeException(json.optString("error", "Unexpected error"));
    }

    public String fetchLogin(String token) {
        var response = http.get()
                .uri("https://api.github.com/user")
                .header("Authorization", "token " + token)
                .header("Accept", "application/json")
                .retrieve()
                .toEntity(String.class);
        // The granted scopes are echoed here; "repo" is required to commit to the data repo.
        log.info("login: X-OAuth-Scopes='{}'", response.getHeaders().getFirst("X-OAuth-Scopes"));
        return new JSONObject(response.getBody()).optString("login", "");
    }

    private static String enc(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
