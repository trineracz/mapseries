package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.SheetDAO;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SheetRepository extends JpaRepository<SheetDAO, Long> {

    @Query("SELECT s FROM SheetDAO s WHERE s.serie = :serie AND s.sheetId = :sheetId " +
            "AND s.version = (SELECT c.value FROM CurrentVersionDAO c)")
    List<SheetDAO> findCurrentBySerieAndSheetId(@Param("serie") String serie, @Param("sheetId") String sheetId);

    @Query("SELECT DISTINCT s.sheetId FROM SheetDAO s WHERE s.serie = :serie " +
            "AND s.version = (SELECT c.value FROM CurrentVersionDAO c)")
    List<String> findCurrentSheetIds(@Param("serie") String serie);
}
