package cz.mzk.mapseries.update;

import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.managers.ContentDefinitionItem;

public class SerieBuilder {

    private final ContentDefinitionItem contentDefinition;

    public SerieBuilder(ContentDefinitionItem contentDefinition) {
        this.contentDefinition = contentDefinition;
    }

    public SerieDAO buildSerie() {
        SerieDAO serie = new SerieDAO();
        serie.setName(getSerieName());
        serie.setGrid(contentDefinition.getGrid());
        serie.setThumbnailUrl(contentDefinition.getThumbnailUrl());
        return serie;
    }

    private String getSerieName() {
        return contentDefinition.getName().replaceAll("[\\[\\];]", "").trim();
    }
}
