package cz.mzk.mapseries.repository;

import cz.mzk.mapseries.dao.AdminDAO;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminRepository extends JpaRepository<AdminDAO, String> {
    // isAdmin(name) -> existsById(name); list -> findAll(); add -> save(); remove -> deleteById()
}
