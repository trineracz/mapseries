package cz.mzk.mapseries.web;

import cz.mzk.mapseries.github.GithubOAuth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Token-exchange gatekeeper used by the edit app (config.gatekeeper_url +
 * "/authenticate/" + code): swaps the OAuth code for a token and returns it.
 */
@RestController
public class AuthController {

    private final GithubOAuth oauth;

    public AuthController(GithubOAuth oauth) {
        this.oauth = oauth;
    }

    @GetMapping("/server/authenticate/{code}")
    public Map<String, Object> authenticate(@PathVariable String code) {
        try {
            return Map.of("token", oauth.exchangeCodeForToken(code));
        } catch (Exception e) {
            return Map.of("error", String.valueOf(e.getMessage()));
        }
    }
}
