package cz.mzk.mapseries.dao;

import cz.mzk.mapseries.dao.interfaces.VersionedData;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;

import java.io.Serializable;
import java.util.Objects;
import java.util.regex.Pattern;

@Entity
@IdClass(SerieId.class)
public class SerieDAO implements VersionedData, Serializable {

    private static final Pattern SPACE_REPLACE = Pattern.compile("(\\d) (\\d)");

    @Id
    private String name;

    private String grid;

    private String thumbnailUrl;

    @Id
    private long version;

    public String getName() {
        return name;
    }

    public String getNameHtml() {
        return SPACE_REPLACE.matcher(name).replaceAll("$1&nbsp;$2");
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getGrid() {
        return grid;
    }

    public void setGrid(String grid) {
        this.grid = grid;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    @Override
    public long getVersion() {
        return version;
    }

    @Override
    public void setVersion(long version) {
        this.version = version;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SerieDAO serieDAO = (SerieDAO) o;
        return Objects.equals(name, serieDAO.name) &&
                Objects.equals(grid, serieDAO.grid) &&
                Objects.equals(thumbnailUrl, serieDAO.thumbnailUrl);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, grid, thumbnailUrl);
    }

    @Override
    public String toString() {
        return "SerieDAO{" +
                "name='" + name + '\'' +
                ", grid='" + grid + '\'' +
                ", thumbnailUrl='" + thumbnailUrl + '\'' +
                '}';
    }
}
