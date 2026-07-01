package cz.mzk.mapseries.dao;

import java.io.Serializable;
import java.util.Objects;

/**
 * Composite primary key for {@link SerieDAO} (a series is identified by its name
 * within a data version). Field names must match the @Id fields on SerieDAO.
 */
public class SerieId implements Serializable {

    private String name;
    private long version;

    public SerieId() {
    }

    public SerieId(String name, long version) {
        this.name = name;
        this.version = version;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SerieId serieId = (SerieId) o;
        return version == serieId.version && Objects.equals(name, serieId.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, version);
    }
}
