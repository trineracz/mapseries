package cz.mzk.mapseries.web;

import cz.mzk.mapseries.dao.AdminDAO;
import cz.mzk.mapseries.github.AuthService;
import cz.mzk.mapseries.github.GithubWriteService;
import cz.mzk.mapseries.repository.AdminRepository;
import cz.mzk.mapseries.update.HarvestExecutor;
import cz.mzk.mapseries.update.HarvestService;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The ajax endpoints the admin frontend (main.js) calls. Kept at the same
 * /rest/ajax/... paths + {success,message} response shape as the old AjaxRestApi
 * so the existing JS works unchanged. (jQuery $.ajax defaults to GET.)
 */
@RestController
@RequestMapping("/rest/ajax")
public class AjaxRestController {

    private static final String CONTENT_DEFINITION_PATH = "content-definition.json";

    private final HarvestService harvestService;
    private final HarvestExecutor harvestExecutor;
    private final AdminRepository adminRepository;
    private final AuthService authService;
    private final GithubWriteService githubWriteService;

    public AjaxRestController(HarvestService harvestService, HarvestExecutor harvestExecutor,
                              AdminRepository adminRepository, AuthService authService,
                              GithubWriteService githubWriteService) {
        this.harvestService = harvestService;
        this.harvestExecutor = harvestExecutor;
        this.adminRepository = adminRepository;
        this.authService = authService;
        this.githubWriteService = githubWriteService;
    }

    /** Null when the visitor is a signed-in admin, otherwise the refusal (as the old AjaxRestApi). */
    private Map<String, Object> notAdmin() {
        if (!authService.isAuthenticated()) {
            return result(false, "You are not authenticated.");
        }
        if (!authService.isAdmin()) {
            return result(false, "You are not authorized.");
        }
        return null;
    }

    @RequestMapping("/updateSettings/updateAction")
    public Map<String, Object> updateAction() {
        Map<String, Object> refused = notAdmin();
        if (refused != null) {
            return refused;
        }
        if (harvestService.tooManyUnfinished()) {
            return result(false, "Too many unfinished tasks");
        }
        long id = harvestService.startUpdate();
        harvestExecutor.runAsync(id);
        return result(true, "");
    }

    @RequestMapping("/updateSettings/restoreVersion")
    public Map<String, Object> restoreVersion(@RequestParam long version) {
        Map<String, Object> refused = notAdmin();
        if (refused != null) {
            return refused;
        }
        harvestService.restoreVersion(version);
        return result(true, "");
    }

    @RequestMapping("/usersSettings/addAdmin")
    @Transactional
    public Map<String, Object> addAdmin(@RequestParam String adminName) {
        Map<String, Object> refused = notAdmin();
        if (refused != null) {
            return refused;
        }
        AdminDAO admin = new AdminDAO();
        admin.setName(adminName);
        adminRepository.save(admin);
        return result(true, "");
    }

    @RequestMapping("/usersSettings/removeAdmin")
    @Transactional
    public Map<String, Object> removeAdmin(@RequestParam String adminName) {
        Map<String, Object> refused = notAdmin();
        if (refused != null) {
            return refused;
        }
        adminRepository.deleteById(adminName);
        return result(true, "");
    }

    @PostMapping("/contentDefinition/update")
    public Map<String, Object> contentDefinitionUpdate(@RequestBody Map<String, String> body) {
        Map<String, Object> refused = notAdmin();
        if (refused != null) {
            return refused;
        }
        try {
            githubWriteService.saveFile(authService.getToken(),
                    body.get("commitMessage"), CONTENT_DEFINITION_PATH, body.get("content"));
            return result(true, "");
        } catch (Exception e) {
            return result(false, String.valueOf(e.getMessage()));
        }
    }

    private Map<String, Object> result(boolean success, String message) {
        return Map.of("success", success, "message", message);
    }
}
