package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.dao.SerieId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SerieRepository extends JpaRepository<SerieDAO, SerieId> {

    @Query("SELECT s FROM SerieDAO s WHERE s.version = (SELECT c.value FROM CurrentVersionDAO c)")
    List<SerieDAO> findCurrent();

    @Query("SELECT s FROM SerieDAO s WHERE s.name = :name AND s.version = (SELECT c.value FROM CurrentVersionDAO c)")
    Optional<SerieDAO> findCurrentByName(@Param("name") String name);
}
