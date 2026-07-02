package cz.mzk.mapseries.web;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;
import cz.mzk.mapseries.repository.CurrentVersionRepository;
import cz.mzk.mapseries.repository.UpdateTaskRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Admin UI. The Update page (run harvest + rollback) is ported; the login gate
 * uses the session AuthService and the GitHub OAuth redirect.
 */
@Controller
public class AdminController {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd. MM. yyyy - HH:mm:ss");

    private final AuthService authService;
    private final UpdateTaskRepository updateTaskRepository;
    private final CurrentVersionRepository currentVersionRepository;
    private final MapseriesProperties props;

    public AdminController(AuthService authService, UpdateTaskRepository updateTaskRepository,
                          CurrentVersionRepository currentVersionRepository, MapseriesProperties props) {
        this.authService = authService;
        this.updateTaskRepository = updateTaskRepository;
        this.currentVersionRepository = currentVersionRepository;
        this.props = props;
    }

    @GetMapping({"/admin", "/admin/index.xhtml"})
    public String adminRoot() {
        // Content-settings page not ported yet — land on the Update page.
        return "redirect:/admin/update.xhtml";
    }

    @GetMapping("/admin/update.xhtml")
    public String update(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/update.xhtml";
        }

        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "update");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            long current = currentVersionRepository.findCurrentVersion().orElse(0L);
            model.addAttribute("currentVersion", current);
            model.addAttribute("tasks", taskRows(current));
        }
        return "admin/update";
    }

    @GetMapping("/logout")
    public String logout() {
        authService.logout();
        return "redirect:/admin/update.xhtml";
    }

    private String authUrl(HttpServletRequest request) {
        String redirect = request.getRequestURL().toString();
        return "https://github.com/login/oauth/authorize"
                + "?client_id=" + enc(props.github().clientId())
                + "&redirect_uri=" + enc(redirect)
                + "&scope=" + enc("user:email public_repo");
    }

    private List<TaskRow> taskRows(long current) {
        return updateTaskRepository.findAllByOrderByStartDateDescIdDesc().stream()
                .map(t -> {
                    String status = t.getStartDate() == null ? "scheduled"
                            : t.getEndDate() == null ? "running"
                            : t.isResult() ? "passed" : "failed";
                    String start = t.getStartDate() == null ? "" : DATE.format(t.getStartDate());
                    String end = t.getEndDate() == null ? "" : DATE.format(t.getEndDate());
                    String duration = (t.getStartDate() != null && t.getEndDate() != null)
                            ? formatDuration(Duration.between(t.getStartDate(), t.getEndDate())) : "";
                    return new TaskRow(t.getId(), status, start, end, duration, t.getId() == current);
                })
                .collect(Collectors.toList());
    }

    private static String formatDuration(Duration d) {
        long s = d.getSeconds();
        return String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60);
    }

    private static String enc(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    public record TaskRow(long id, String status, String startDate, String endDate, String duration, boolean active) {
    }
}
