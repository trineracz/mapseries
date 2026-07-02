package cz.mzk.mapseries.github;

import cz.mzk.mapseries.repository.AdminRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.SessionScope;

/**
 * Session-scoped authentication state for the admin UI. Replaces the old
 * @SessionScoped GithubService's auth part: holds the GitHub token + login and
 * checks admin rights against the admindao table.
 */
@Component
@SessionScope
public class AuthService {

    private final GithubOAuth oauth;
    private final AdminRepository adminRepository;

    private String token;
    private String login;

    public AuthService(GithubOAuth oauth, AdminRepository adminRepository) {
        this.oauth = oauth;
        this.adminRepository = adminRepository;
    }

    public void authenticate(String code) {
        this.token = oauth.exchangeCodeForToken(code);
        this.login = oauth.fetchLogin(token);
    }

    public boolean isAuthenticated() {
        return token != null;
    }

    public boolean isAdmin() {
        return login != null && adminRepository.existsById(login);
    }

    public String getToken() {
        return token;
    }

    public String getLogin() {
        return login;
    }

    public void logout() {
        this.token = null;
        this.login = null;
    }
}
