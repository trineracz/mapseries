package cz.mzk.mapseries.authority;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import cz.mzk.mapseries.config.MapseriesProperties;

/** Fills the authority table on start-up when it is empty and this is enabled. */
@Component
public class AuthorityStartupImport {

    private final AuthorityService authorities;
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public AuthorityStartupImport(AuthorityService authorities, JdbcTemplate jdbc, MapseriesProperties props) {
        this.authorities = authorities;
        this.jdbc = jdbc;
        this.enabled = props.authorities().importIfEmptyOnStart();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void importIfEmpty() {
        Long count = jdbc.queryForObject("SELECT count(*) FROM authoritydao", Long.class);
        if (enabled && count != null && count == 0) {
            authorities.importAsync();
        }
    }
}
