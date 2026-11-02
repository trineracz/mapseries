package cz.mzk.mapseries.authority;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.GZIPInputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import cz.mzk.mapseries.config.MapseriesProperties;

/**
 * The national authority file (Národní autority ČR) for the catalog:
 * imports the NK dump into the authoritydao table and searches it.
 *
 * The import replaces the whole table in one transaction, so searches keep
 * seeing the previous data until the new import is complete.
 */
@Service
public class AuthorityService {

    private static final Logger LOG = LoggerFactory.getLogger(AuthorityService.class);
    private static final int BATCH = 1000;
    private static final String INSERT = "INSERT INTO authoritydao "
            + "(code, tag, ind1, heading, marc, variants, norm, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            + "ON CONFLICT (code) DO NOTHING";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final MapseriesProperties.Authorities config;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile LocalDateTime lastStart;
    private volatile LocalDateTime lastEnd;
    private volatile String lastResult = "never run";
    private volatile long lastCount;

    public AuthorityService(JdbcTemplate jdbc, TransactionTemplate tx, MapseriesProperties props) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.config = props.authorities();
    }

    /** Lowercase, no diacritics, single spaces — how headings are matched. */
    public static String normalize(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    // --- search -------------------------------------------------------------

    /**
     * Find authorities whose heading or variant name contains every word of
     * the query (ignoring case and diacritics). Headings starting with the
     * query come first, then shorter ones.
     */
    public List<Map<String, Object>> search(String query, List<String> tags, int limit) {
        String q = normalize(query);
        if (q.length() < 2) {
            return List.of();
        }
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT code, tag, ind1, heading, marc, variants FROM authoritydao WHERE 1=1");
        if (tags != null && !tags.isEmpty()) {
            sql.append(" AND tag IN (").append(String.join(",", tags.stream().map(t -> "?").toList())).append(")");
            args.addAll(tags);
        }
        for (String word : q.split(" ")) {
            sql.append(" AND search LIKE ?");
            args.add("%" + escapeLike(word) + "%");
        }
        sql.append(" ORDER BY (CASE WHEN norm LIKE ? THEN 0 ELSE 1 END), length(norm), norm LIMIT ?");
        args.add(escapeLike(q) + "%");
        args.add(Math.max(1, Math.min(limit, 100)));
        return jdbc.query(sql.toString(), (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", rs.getString("code"));
            row.put("tag", rs.getString("tag"));
            row.put("ind1", rs.getString("ind1"));
            row.put("heading", rs.getString("heading"));
            row.put("marc", rs.getString("marc"));
            String variants = rs.getString("variants");
            row.put("variants", variants == null || variants.isEmpty() ? List.of() : List.of(variants.split(" \\| ")));
            return row;
        }, args.toArray());
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    // --- import -------------------------------------------------------------

    public boolean isRunning() {
        return running.get();
    }

    public Map<String, Object> status() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("running", running.get());
        s.put("count", jdbc.queryForObject("SELECT count(*) FROM authoritydao", Long.class));
        s.put("byTag", jdbc.queryForList("SELECT tag, count(*) AS count FROM authoritydao GROUP BY tag ORDER BY tag"));
        s.put("lastStart", String.valueOf(lastStart));
        s.put("lastEnd", String.valueOf(lastEnd));
        s.put("lastResult", lastResult);
        s.put("lastImported", lastCount);
        s.put("source", config.dumpUrl());
        s.put("importLimit", config.importLimit());
        return s;
    }

    /** Re-import on the configured cron (mapseries.authorities.cron, "-" = off). */
    @Scheduled(cron = "${mapseries.authorities.cron:-}")
    public void scheduledImport() {
        runImport();
    }

    /** Start an import in the background; false if one is already running. */
    @Async
    public void importAsync() {
        runImport();
    }

    private void runImport() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        lastStart = LocalDateTime.now();
        lastEnd = null;
        lastResult = "running";
        lastCount = 0;
        try {
            long count = tx.execute(status -> importDump());
            lastCount = count;
            lastResult = "ok";
            LOG.info("Authority import finished: {} records from {}", count, config.dumpUrl());
        } catch (Exception e) {
            lastResult = "failed: " + e;
            LOG.error("Authority import failed", e);
        } finally {
            lastEnd = LocalDateTime.now();
            running.set(false);
        }
    }

    private long importDump() {
        jdbc.update("DELETE FROM authoritydao");
        AuthorityDumpReader reader = new AuthorityDumpReader(new HashSet<>(config.tags()));
        List<Object[]> batch = new ArrayList<>(BATCH);
        try (InputStream raw = open(config.dumpUrl())) {
            long n = reader.read(raw, a -> {
                String variants = String.join(" | ", a.variants());
                String norm = normalize(a.heading());
                String search = a.variants().isEmpty() ? norm : norm + " | " + normalize(variants);
                batch.add(new Object[] {a.code(), a.tag(), a.ind1(), a.heading(), a.marc(), variants, norm, search});
                if (batch.size() >= BATCH) {
                    flush(batch);
                }
            }, config.importLimit());
            flush(batch);
            return n;
        } catch (Exception e) {
            throw new IllegalStateException("Import from " + config.dumpUrl() + " failed", e);
        }
    }

    private void flush(List<Object[]> batch) {
        if (!batch.isEmpty()) {
            jdbc.batchUpdate(INSERT, batch);
            lastCount += batch.size();
            batch.clear();
        }
    }

    private static InputStream open(String url) throws Exception {
        URL u = URI.create(url).toURL();
        var conn = u.openConnection();
        conn.setRequestProperty("User-Agent", "mapseries (Moravian Library) authority import");
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(300_000);
        InputStream in = new BufferedInputStream(conn.getInputStream(), 1 << 16);
        return url.endsWith(".gz") ? new GZIPInputStream(in, 1 << 16) : in;
    }
}
