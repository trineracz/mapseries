package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.CurrentVersionDAO;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface CurrentVersionRepository extends JpaRepository<CurrentVersionDAO, Integer> {

    // Optional -> no NoResultException on a fresh/empty DB (fixes the old bootstrap bug).
    @Query("SELECT c.value FROM CurrentVersionDAO c")
    Optional<Long> findCurrentVersion();
}
