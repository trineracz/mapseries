package cz.mzk.mapseries.web;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import cz.mzk.mapseries.authority.AuthorityService;
import cz.mzk.mapseries.github.AuthService;

/**
 * National authority file (Národní autority ČR) for the catalog and the
 * template editor: search is public (the catalog is), the import is admin-only.
 */
@RestController
@RequestMapping("/api/authorities")
public class AuthorityController {

    /** Friendly names for the heading tags. */
    private static final Map<String, String> TYPES = Map.of(
            "corporation", "110", "topic", "150", "geographic", "151", "form", "155");

    private final AuthorityService authorities;
    private final AuthService authService;

    public AuthorityController(AuthorityService authorities, AuthService authService) {
        this.authorities = authorities;
        this.authService = authService;
    }

    /** GET /api/authorities?q=vojensky ustav&type=corporation&limit=20 */
    @GetMapping
    public List<Map<String, Object>> search(@RequestParam("q") String q,
                                            @RequestParam(value = "type", required = false) List<String> types,
                                            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        List<String> tags = types == null ? List.of()
                : types.stream().map(t -> TYPES.getOrDefault(t, t)).toList();
        return authorities.search(q, tags, limit);
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return authorities.status();
    }

    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> startImport() {
        if (!authService.isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Admins only"));
        }
        if (authorities.isRunning()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Import already running"));
        }
        authorities.importAsync();
        return ResponseEntity.accepted().body(Map.of("status", "started"));
    }
}
