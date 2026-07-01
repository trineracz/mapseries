package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.UpdateTaskDAO;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UpdateTaskRepository extends JpaRepository<UpdateTaskDAO, Long> {

    List<UpdateTaskDAO> findAllByOrderByStartDateDescIdDesc();

    List<UpdateTaskDAO> findByStartDateIsNull();
}
