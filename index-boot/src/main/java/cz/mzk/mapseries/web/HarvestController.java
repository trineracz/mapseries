package cz.mzk.mapseries.web;

import cz.mzk.mapseries.repository.UpdateTaskRepository;
import cz.mzk.mapseries.update.HarvestExecutor;
import cz.mzk.mapseries.update.HarvestService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Trigger + status for the harvest. (Temporary JSON API for verification; the
 * admin UI will call these once ported.)
 */
@RestController
@RequestMapping("/api/harvest")
public class HarvestController {

    private final HarvestService harvestService;
    private final HarvestExecutor harvestExecutor;
    private final UpdateTaskRepository updateTaskRepository;
    private final AdminGate gate;

    public HarvestController(HarvestService harvestService, HarvestExecutor harvestExecutor,
                             UpdateTaskRepository updateTaskRepository, AdminGate gate) {
        this.harvestService = harvestService;
        this.harvestExecutor = harvestExecutor;
        this.updateTaskRepository = updateTaskRepository;
        this.gate = gate;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> trigger() {
        if (!gate.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admins only"));
        }
        if (harvestService.tooManyUnfinished()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Too many unfinished tasks"));
        }
        long id = harvestService.startUpdate();
        harvestExecutor.runAsync(id);
        return ResponseEntity.accepted().body(Map.of("taskId", id, "status", "started"));
    }

    @GetMapping("/tasks")
    public List<Map<String, Object>> tasks() {
        return updateTaskRepository.findAllByOrderByStartDateDescIdDesc().stream()
                .map(task -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", task.getId());
                    row.put("result", task.isResult());
                    row.put("startDate", String.valueOf(task.getStartDate()));
                    row.put("endDate", String.valueOf(task.getEndDate()));
                    return row;
                })
                .collect(Collectors.toList());
    }
}
