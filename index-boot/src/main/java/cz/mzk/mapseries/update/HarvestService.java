package cz.mzk.mapseries.update;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.dao.CurrentVersionDAO;
import cz.mzk.mapseries.dao.UpdateTaskDAO;
import cz.mzk.mapseries.dao.interfaces.VersionedData;
import cz.mzk.mapseries.repository.UpdateTaskRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Database side of the harvest: task lifecycle + persisting a new versioned
 * snapshot. Replaces the old UpdateTaskManager + the persistence half of
 * UpdateMDB (JMS/MDB gone — see HarvestExecutor for the @Async run).
 */
@Service
public class HarvestService {

    private static final int HISTORY = 10;

    @PersistenceContext
    private EntityManager em;

    private final UpdateTaskRepository updateTaskRepository;
    private final MapseriesProperties props;
    private final RestClient http = RestClient.create();

    public HarvestService(UpdateTaskRepository updateTaskRepository, MapseriesProperties props) {
        this.updateTaskRepository = updateTaskRepository;
        this.props = props;
    }

    public boolean tooManyUnfinished() {
        return updateTaskRepository.findByStartDateIsNull().size() >= 2;
    }

    @Transactional
    public long startUpdate() {
        UpdateTaskDAO task = new UpdateTaskDAO();
        updateTaskRepository.save(task);
        return task.getId();
    }

    @Transactional
    public void markStarted(long taskId) {
        em.find(UpdateTaskDAO.class, taskId).setStartDate(LocalDateTime.now());
    }

    @Transactional
    public void persistResult(long taskId, List<VersionedData> data, String log, boolean success) {
        UpdateTaskDAO task = em.find(UpdateTaskDAO.class, taskId);
        task.setResult(success);

        if (success) {
            clearOldData();
            for (VersionedData d : data) {
                d.setVersion(taskId);
                em.persist(d);
            }
            CurrentVersionDAO currentVersion = new CurrentVersionDAO();
            currentVersion.setValue(taskId);
            em.merge(currentVersion);
        }

        task.setLog(log);
        task.setEndDate(LocalDateTime.now());
    }

    /** Rollback: point the current version at an older snapshot. */
    @Transactional
    public void restoreVersion(long version) {
        CurrentVersionDAO currentVersion = new CurrentVersionDAO();
        currentVersion.setValue(version);
        em.merge(currentVersion);
    }

    /** Loads content-definition.json from the READ repo (public production data). */
    public String loadContentDefinition() {
        String url = String.format("https://raw.githubusercontent.com/%s/%s/master/content-definition.json",
                props.repo().readUser(), props.repo().readName());
        return http.get().uri(url).retrieve().body(String.class);
    }

    public MapseriesProperties.Oai oai() {
        return props.oai();
    }

    /** Keeps the current version + the newest HISTORY snapshots; deletes older ones. */
    private void clearOldData() {
        List<Long> ids = em.createQuery(
                        "SELECT t.id FROM UpdateTaskDAO t WHERE t.id <> (SELECT c.value FROM CurrentVersionDAO c) ORDER BY t.id ASC",
                        Long.class)
                .getResultList();

        int toDelete = ids.size() - HISTORY;
        if (toDelete <= 0) {
            return;
        }
        for (Long ver : ids.subList(0, toDelete)) {
            em.createQuery("DELETE FROM SheetDAO s WHERE s.version = :ver").setParameter("ver", ver).executeUpdate();
            em.createQuery("DELETE FROM SerieDAO s WHERE s.version = :ver").setParameter("ver", ver).executeUpdate();
            em.createQuery("DELETE FROM DescriptionDAO d WHERE d.version = :ver").setParameter("ver", ver).executeUpdate();
            em.createQuery("DELETE FROM UpdateTaskDAO t WHERE t.id = :ver").setParameter("ver", ver).executeUpdate();
        }
    }
}
