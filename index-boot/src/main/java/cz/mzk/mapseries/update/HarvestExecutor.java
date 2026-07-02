package cz.mzk.mapseries.update;

import cz.mzk.mapseries.config.MapseriesProperties;
import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.dao.SheetDAO;
import cz.mzk.mapseries.dao.interfaces.VersionedData;
import cz.mzk.mapseries.managers.ContentDefinitionItem;
import cz.mzk.mapseries.managers.ContentDefinitionManager;
import cz.mzk.mapseries.oai.marc.MarcIdentifier;
import cz.mzk.mapseries.oai.marc.MarcRecord;
import cz.mzk.mapseries.oai.marc.OaiMarcXmlReader;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The harvest itself, run in the background — replaces UpdateEJB + the JMS/MDB
 * machinery with a single @Async method. Harvests MARC from OAI, builds the
 * versioned data in memory, then hands it to HarvestService to persist.
 */
@Component
public class HarvestExecutor {

    private final HarvestService harvestService;

    public HarvestExecutor(HarvestService harvestService) {
        this.harvestService = harvestService;
    }

    @Async
    public void runAsync(long taskId) {
        harvestService.markStarted(taskId);

        ByteArrayOutputStream logBuffer = new ByteArrayOutputStream();
        PrintStream log = new PrintStream(logBuffer, true, StandardCharsets.UTF_8);

        try {
            String definitionJson = harvestService.loadContentDefinition();
            List<VersionedData> data = doUpdate(definitionJson, log);
            harvestService.persistResult(taskId, data, logBuffer.toString(StandardCharsets.UTF_8), true);
        } catch (Exception e) {
            log.println("[TASK FAILED] " + e);
            e.printStackTrace(log);
            harvestService.persistResult(taskId, Collections.emptyList(), logBuffer.toString(StandardCharsets.UTF_8), false);
        }
    }

    private List<VersionedData> doUpdate(String definitionJson, PrintStream log) {
        log.println("Starting update.");

        List<VersionedData> result = new ArrayList<>();
        List<ContentDefinitionItem> definitions = ContentDefinitionManager.fromJsonString(definitionJson).getDefinitions();
        Map<ContentDefinitionItem, SerieDAO> series = new HashMap<>();

        MapseriesProperties.Oai oai = harvestService.oai();
        OaiMarcXmlReader reader = new OaiMarcXmlReader(oai.baseUrl(), oai.set());
        reader.setLog(log);

        int limit = oai.harvestLimit();
        int harvested = 0;

        for (MarcRecord record : reader) {
            if (limit > 0 && harvested >= limit) {
                log.println("Reached MAPSERIES_HARVEST_LIMIT=" + limit + ", stopping harvest early (sample mode).");
                break;
            }
            harvested++;

            Optional<ContentDefinitionItem> definition = findDefinitionForRecord(definitions, record);
            if (definition.isEmpty()) {
                continue;
            }

            SerieDAO serie = series.get(definition.get());
            if (serie == null) {
                serie = new SerieBuilder(definition.get()).buildSerie();
                series.put(definition.get(), serie);
                result.add(serie);
                result.addAll(new DescriptionBuilder(definition.get(), serie).buildDescriptions());
            }

            Optional<SheetDAO> sheet = new SheetBuilder(definition.get(), record, log).buildSheet();
            if (sheet.isEmpty()) {
                continue;
            }
            sheet.get().setSerie(serie.getName());
            result.add(sheet.get());
        }

        log.println("Update finished successfully");
        return result;
    }

    private Optional<ContentDefinitionItem> findDefinitionForRecord(List<ContentDefinitionItem> definitions, MarcRecord record) {
        for (ContentDefinitionItem definition : definitions) {
            if (isDefinitionSuitableForRecord(definition, record)) {
                return Optional.of(definition);
            }
        }
        return Optional.empty();
    }

    private boolean isDefinitionSuitableForRecord(ContentDefinitionItem definition, MarcRecord record) {
        MarcIdentifier marcId = MarcIdentifier.fromString(definition.getField());
        return record.getDataFields(marcId.getField()).stream()
                .map(dataField -> dataField.getSubfield(marcId.getSubfields().get(0)))
                .anyMatch(subfield -> subfield.isPresent() && subfield.get().equals(definition.getName()));
    }
}
