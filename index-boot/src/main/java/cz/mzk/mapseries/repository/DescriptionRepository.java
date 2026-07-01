package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.DescriptionDAO;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface DescriptionRepository extends JpaRepository<DescriptionDAO, Long> {

    @Query("SELECT d.text FROM DescriptionDAO d WHERE d.serie = :serie AND d.lang = :lang " +
            "AND d.version = (SELECT c.value FROM CurrentVersionDAO c)")
    Optional<String> findCurrentText(@Param("serie") String serie, @Param("lang") String lang);
}
