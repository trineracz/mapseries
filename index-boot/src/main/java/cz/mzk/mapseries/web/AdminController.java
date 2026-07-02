package cz.mzk.mapseries.web;

import cz.mzk.mapseries.admin.DataAnalyzer;
import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.github.AuthService;
import cz.mzk.mapseries.managers.ContentDefinitionManager;
import cz.mzk.mapseries.repository.AdminRepository;
import cz.mzk.mapseries.repository.CurrentVersionRepository;
import cz.mzk.mapseries.repository.UpdateTaskRepository;
import cz.mzk.mapseries.update.HarvestService;
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
    private final AdminRepository adminRepository;
    private final DataAnalyzer dataAnalyzer;
    private final HarvestService harvestService;
    private final MapseriesProperties props;

    public AdminController(AuthService authService, UpdateTaskRepository updateTaskRepository,
                          CurrentVersionRepository currentVersionRepository, AdminRepository adminRepository,
                          DataAnalyzer dataAnalyzer, HarvestService harvestService, MapseriesProperties props) {
        this.authService = authService;
        this.updateTaskRepository = updateTaskRepository;
        this.currentVersionRepository = currentVersionRepository;
        this.adminRepository = adminRepository;
        this.dataAnalyzer = dataAnalyzer;
        this.harvestService = harvestService;
        this.props = props;
    }

    /** Available to every admin view (the left panel shows the user's avatar + name). */
    @org.springframework.web.bind.annotation.ModelAttribute("login")
    public String currentLogin() {
        return authService.getLogin() != null ? authService.getLogin() : "";
    }

    @GetMapping("/admin")
    public String adminRoot() {
        return "redirect:/admin/index.xhtml";
    }

    @GetMapping("/admin/index.xhtml")
    public String index(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/index.xhtml";
        }

        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "index");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            model.addAttribute("contentDefinitionData", harvestService.loadContentDefinition());
        }
        return "admin/index";
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

    @GetMapping("/admin/update-log.xhtml")
    public String updateLog(@RequestParam long task, @RequestParam(required = false) String code,
                            Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/update-log.xhtml?task=" + task;
        }

        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "update");
        model.addAttribute("authUrl", authUrl(request));
        model.addAttribute("taskId", task);

        if (admin) {
            var updateTask = updateTaskRepository.findById(task).orElse(null);
            model.addAttribute("task", updateTask);
            model.addAttribute("log", updateTask != null ? updateTask.getLog() : null);
        }
        return "admin/update-log";
    }

    @GetMapping("/admin/users.xhtml")
    public String users(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/users.xhtml";
        }

        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "users");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            model.addAttribute("admins", adminRepository.findAll());
            model.addAttribute("currentLogin", authService.getLogin());
        }
        return "admin/users";
    }

    @GetMapping("/admin/non-linked-maps.xhtml")
    public String nonLinkedMaps(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/non-linked-maps.xhtml";
        }

        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "non-linked-maps");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            model.addAttribute("nonLinkedMaps", dataAnalyzer.getNonLinkedMaps());
        }
        return "admin/non-linked-maps";
    }

    @GetMapping("/admin/texts.xhtml")
    public String texts(@RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/texts.xhtml";
        }
        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "texts");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            model.addAttribute("definitions", loadDefinitions());
            model.addAttribute("languages", List.of("cs", "en"));
        }
        return "admin/texts";
    }

    @GetMapping("/admin/text-editor.xhtml")
    public String textEditor(@RequestParam(name = "text-lang", required = false, defaultValue = "cs") String textLang,
                             @RequestParam(name = "text-name", required = false, defaultValue = "") String textName,
                             @RequestParam(required = false) String code, Model model, HttpServletRequest request) {
        if (code != null && !code.isBlank()) {
            authService.authenticate(code);
            return "redirect:/admin/text-editor.xhtml?text-lang=" + enc(textLang) + "&text-name=" + enc(textName);
        }
        boolean admin = authService.isAuthenticated() && authService.isAdmin();
        model.addAttribute("authenticated", authService.isAuthenticated());
        model.addAttribute("admin", admin);
        model.addAttribute("activeMenuItem", "texts");
        model.addAttribute("authUrl", authUrl(request));

        if (admin) {
            String json = harvestService.loadContentDefinition();
            var item = ContentDefinitionManager.fromJsonString(json).getDefinitions().stream()
                    .filter(d -> d.getName().equals(textName)).findFirst().orElse(null);
            model.addAttribute("contentDefinitionData", json);
            model.addAttribute("textLang", textLang);
            model.addAttribute("textName", textName);
            model.addAttribute("prettyName", item != null ? item.getPrettyName() : textName);
            model.addAttribute("text", item != null ? item.getDescription(textLang).orElse("") : "");
        }
        return "admin/text-editor";
    }

    private List<cz.mzk.mapseries.managers.ContentDefinitionItem> loadDefinitions() {
        return ContentDefinitionManager.fromJsonString(harvestService.loadContentDefinition()).getDefinitions();
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
                + "&scope=" + enc("user:email repo");
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
