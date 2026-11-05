package cz.mzk.mapseries.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;
import org.springframework.ui.Model;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;
import jakarta.servlet.http.HttpServletRequest;

/** The sign-in check and the common model of the admin pages (menu, login link). */
@Component
public class AdminGate {

    private final AuthService authService;
    private final MapseriesProperties props;

    public AdminGate(AuthService authService, MapseriesProperties props) {
        this.authService = authService;
        this.props = props;
    }

    /** Sets the admin page attributes; true if the visitor is a signed-in admin. */
    public boolean open(Model model, HttpServletRequest request, String menuItem) {
        boolean admin = isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", menuItem);
        model.addAttribute("authUrl", authUrl(request));
        model.addAttribute("login", authService.getLogin() != null ? authService.getLogin() : "");
        return admin;
    }

    public boolean isAdmin() {
        return authService.isAuthenticated() && authService.isAdmin();
    }

    /** GitHub returns to the page without its query; the page then forwards (see the lists). */
    public void signIn(String code) {
        authService.authenticate(code);
    }

    public String token() {
        return authService.getToken();
    }

    public boolean dryRun() {
        return props.editor() != null && props.editor().dryRun();
    }

    private String authUrl(HttpServletRequest request) {
        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + enc(props.github().clientId())
                + "&redirect_uri=" + enc(request.getRequestURL().toString())
                + "&scope=" + enc("user:email repo");
    }

    public static String enc(String v) {
        return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8);
    }
}
