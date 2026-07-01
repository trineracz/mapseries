package cz.mzk.mapseries.dao;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class AdminDAO {

    @Id
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
