package cz.mzk.mapseries.web;

import cz.mzk.mapseries.update.HarvestExecutor;
import cz.mzk.mapseries.update.HarvestService;
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

    private final HarvestService harvestService;
    private final HarvestExecutor harvestExecutor;

    public AjaxRestController(HarvestService harvestService, HarvestExecutor harvestExecutor) {
        this.harvestService = harvestService;
        this.harvestExecutor = harvestExecutor;
    }

    @RequestMapping("/updateSettings/updateAction")
    public Map<String, Object> updateAction() {
        if (harvestService.tooManyUnfinished()) {
            return result(false, "Too many unfinished tasks");
        }
        long id = harvestService.startUpdate();
        harvestExecutor.runAsync(id);
        return result(true, "");
    }

    @RequestMapping("/updateSettings/restoreVersion")
    public Map<String, Object> restoreVersion(@RequestParam long version) {
        harvestService.restoreVersion(version);
        return result(true, "");
    }

    private Map<String, Object> result(boolean success, String message) {
        return Map.of("success", success, "message", message);
    }
}
