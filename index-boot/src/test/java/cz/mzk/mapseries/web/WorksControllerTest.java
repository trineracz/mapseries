package cz.mzk.mapseries.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import cz.mzk.mapseries.admin.DataRepoService;
import cz.mzk.mapseries.admin.DataRepoService.Field490;
import cz.mzk.mapseries.admin.DataRepoService.Serie;
import cz.mzk.mapseries.admin.DataRepoService.Work;

/** The parts of the admin that rewrite the data files (config.js, field 490 of a template). */
class WorksControllerTest {

    /** Shaped like the real config.js: helper functions, formatFunctions, comments. */
    private static final String CONFIG = """
            var mapseries = {};
            mapseries.config = {
              formatFunctionsTemplate: {
                addDegrees: function (stringValue, sheet) {
                  if(stringValue.length==4) { return stringValue.substr(0,2)+'°'; } // "}" in a comment
                  return "[" + stringValue + "]";
                }
              },
              series: [
                {
                  title: "Evropa; Třetí vojenské mapování, speciální mapy 1:75 000; Třetí vojenské mapování: speciální mapy 1:75 000",
                  layer: "evropa-treti-vojenske-mapovani-specialni-mapy-175-000",
                  template: "evropa-treti-vojenske-mapovani-specialni-mapy-175-000.txt",
                  formatFunctions: {
                    addDegrees: function (stringValue, sheet) {
                      return stringValue + '°';
                    }
                  }
                },
                {
                  title: "Evropa; Třetí vojenské mapování, speciální mapy 1:75 000; Karte Slowakei 1:75 000",
                  layer: "evropa-karte-slowakei-175-000",
                  template: "evropa-karte-slowakei-175-000.txt"
                }
              ]
            };
            """;

    private static final String TEMPLATE = """
            245 0 L $$a{"title": "Název listu"}
            4901  L $$a[Die Franzisco-Josephinische Landesaufnahme 1:75 000] ; $$v{
                "base":"sheet",
                "title": "Označení svazku/pořadí"
              }
            500   L $$aDalší údaje o vydání:
            """;

    @Test
    void readsTheDilaOfConfig() {
        List<Work> works = DataRepoService.parseWorks(CONFIG);
        assertEquals(2, works.size());
        Work w = works.get(1);
        assertEquals("Evropa", w.region());
        assertEquals("Třetí vojenské mapování, speciální mapy 1:75 000", w.klad());
        assertEquals("Karte Slowakei 1:75 000", w.name());
        assertEquals("template/evropa-karte-slowakei-175-000.txt", w.templatePath());
        assertEquals("geojson/evropa-karte-slowakei-175-000.json", w.gridPath());
    }

    @Test
    void addsADiloAtTheEndOfTheSeries() {
        String ff = WorksController.formatFunctionsOf(CONFIG, "evropa-treti-vojenske-mapovani-specialni-mapy-175-000");
        assertNotNull(ff);
        assertTrue(ff.startsWith("{") && ff.endsWith("}") && ff.contains("addDegrees"));
        assertNull(WorksController.formatFunctionsOf(CONFIG, "evropa-karte-slowakei-175-000"));

        String out = WorksController.addWork(CONFIG, "Evropa; Nový klad; Nové \"dílo\" 1:75 000", "evropa-nove-dilo", ff);
        assertNotNull(out);
        List<Work> works = DataRepoService.parseWorks(out);
        assertEquals(3, works.size());
        assertEquals("evropa-nove-dilo", works.get(2).layer());
        assertEquals("evropa-nove-dilo.txt", works.get(2).template());
        assertEquals("Nové \"dílo\" 1:75 000", works.get(2).name());
        // everything before the new entry is kept as it was
        int at = CONFIG.lastIndexOf("}", CONFIG.lastIndexOf("]"));
        assertEquals(CONFIG.substring(0, at + 1), out.substring(0, at + 1));
        assertTrue(out.endsWith("  ]\n};\n"));
    }

    @Test
    void writesTheNewName490() {
        String t = WorksController.with490(TEMPLATE, "[Karte Slowakei 1:75 000] ;");
        assertTrue(t.contains("4901  L $$a[Karte Slowakei 1:75 000] ; $$v{"), t);
        assertEquals(TEMPLATE.replace("[Die Franzisco-Josephinische Landesaufnahme 1:75 000] ;", "[Karte Slowakei 1:75 000] ;"), t);
    }

    @Test
    void findsTheSerieTheTemplateFills() {
        List<Serie> series = List.of(new Serie("[Slowakei 1:75 000] ;", "evropa-treti-vojenske-mapovani-specialni-mapy-175-000"));
        Field490 none = DataRepoService.field490(TEMPLATE, series);
        assertEquals("[Die Franzisco-Josephinische Landesaufnahme 1:75 000] ;", none.value());
        assertNull(none.serie());
        Field490 hit = DataRepoService.field490(WorksController.with490(TEMPLATE, "[Slowakei 1:75 000] ;"), series);
        assertNotNull(hit.serie());
        assertEquals("Slowakei 1:75 000", hit.serie().prettyName());
        assertNull(DataRepoService.field490("245 0 L $$aX", series));
    }

    @Test
    void renamesOnlyTheTitleOfThatDilo() {
        List<Work> before = DataRepoService.parseWorks(CONFIG);
        Work first = before.get(0);
        String out = WorksController.withTitle(CONFIG, first.layer(), "Svět; Nový klad; Nové \"jméno\"");
        assertNotNull(out);
        List<Work> after = DataRepoService.parseWorks(out);
        assertEquals("Nové \"jméno\"", after.get(0).name());
        assertEquals("Nový klad", after.get(0).klad());
        assertEquals(first.layer(), after.get(0).layer());
        assertEquals(before.subList(1, before.size()), after.subList(1, after.size()));
        assertNull(WorksController.withTitle(CONFIG, "no-such-layer", "a; b; c"));
    }

    /** The real config.js, when a checkout of the data repo is given (MAPSERIES_DATA=…/mapseries-data). */
    @Test
    void addsADiloToTheRealConfig() throws Exception {
        String dir = System.getenv("MAPSERIES_DATA");
        Assumptions.assumeTrue(dir != null && Files.exists(Path.of(dir, "config.js")));
        String config = Files.readString(Path.of(dir, "config.js"));
        List<Work> before = DataRepoService.parseWorks(config);
        String out = WorksController.addWork(config, "Evropa; Test; Test 1:1", "evropa-test",
                WorksController.formatFunctionsOf(config, before.get(0).layer()));
        assertNotNull(out);
        List<Work> after = DataRepoService.parseWorks(out);
        assertEquals(before.size() + 1, after.size());
        assertEquals(before, after.subList(0, before.size()));
        assertEquals("evropa-test", after.get(after.size() - 1).layer());

        // renaming every dílo in turn touches only its own title
        for (Work w : before) {
            String renamed = WorksController.withTitle(config, w.layer(), w.region() + "; " + w.klad() + "; X");
            assertNotNull(renamed, w.layer());
            List<Work> r = DataRepoService.parseWorks(renamed);
            for (int i = 0; i < before.size(); i++) {
                assertEquals(before.get(i).layer().equals(w.layer()) ? "X" : before.get(i).name(), r.get(i).name());
            }
            // the only difference is inside one line: that dílo's title
            int p = 0, e = 0;
            while (config.charAt(p) == renamed.charAt(p)) p++;
            while (config.charAt(config.length() - 1 - e) == renamed.charAt(renamed.length() - 1 - e)) e++;
            String changed = config.substring(p, config.length() - e);
            assertEquals(-1, changed.indexOf('\n'), w.layer());
            assertTrue(config.lastIndexOf("title:", p) > config.lastIndexOf('}', p), w.layer());
        }
    }
}
