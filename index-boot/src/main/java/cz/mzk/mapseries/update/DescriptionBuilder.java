package cz.mzk.mapseries.update;

import cz.mzk.mapseries.dao.DescriptionDAO;
import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.managers.ContentDefinitionItem;

import java.util.List;
import java.util.stream.Collectors;

public class DescriptionBuilder {

    private final ContentDefinitionItem contentDefinition;
    private final SerieDAO serie;

    public DescriptionBuilder(ContentDefinitionItem contentDefinition, SerieDAO serie) {
        this.contentDefinition = contentDefinition;
        this.serie = serie;
    }

    public List<DescriptionDAO> buildDescriptions() {
        return contentDefinition
                .getDescriptionMap()
                .entrySet()
                .stream()
                .map(entry -> createDescription(entry.getKey(), entry.getValue()))
                .collect(Collectors.toList());
    }

    private DescriptionDAO createDescription(String lang, String text) {
        DescriptionDAO description = new DescriptionDAO();
        description.setSerie(serie.getName());
        description.setLang(lang);
        description.setText(text != null ? text : "");
        return description;
    }
}
