package cz.mzk.mapseries.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.Test;

import cz.mzk.mapseries.admin.DataAnalyzer.Kind;
import cz.mzk.mapseries.admin.DataAnalyzer.NonLinked;
import cz.mzk.mapseries.dao.SheetDAO;

/** What the Nepřiřazené mapy page says about a sheet — the cases found in the data. */
class DataAnalyzerTest {

    private static NonLinked classify(String id, String year, String title, Set<String> grid) {
        SheetDAO s = new SheetDAO();
        s.setSheetId(id);
        s.setYear(year);
        s.setTitle(title);
        return DataAnalyzer.classify(s, grid);
    }

    @Test
    void anOverviewOfTheDivisionIsFine() {
        NonLinked n = classify("klad", "klad listů", "[Přehled kladu listů speciální mapy]", Set.of("4553"));
        assertEquals(Kind.OVERVIEW, n.kind());
        assertTrue(n.kind().isFine());
    }

    @Test
    void aPrintOverSeveralSheets() {
        NonLinked n = classify("P 52/Q 50", "1944", "Zusammendruck Breslau Sillein.", Set.of("P52", "Q50"));
        assertEquals(Kind.COMBINED, n.kind());
        assertTrue(n.reason().contains("P52, Q50"), n.reason());
    }

    @Test
    void aPartOfASheet() {
        NonLinked n = classify("4557/West", "1945", "Mistelbach an der Zaya.", Set.of("4557"));
        assertEquals(Kind.PART, n.kind());
        assertTrue(n.reason().contains("list 4557 v mřížce je"), n.reason());
    }

    @Test
    void aNumberTheGridDoesNotHave() {
        NonLinked n = classify("9999", "1930", "Nowhere.", Set.of("4557"));
        assertEquals(Kind.UNKNOWN, n.kind());
        NonLinked close = classify("04557", "1930", "Leading zero.", Set.of("4557"));
        assertTrue(close.reason().contains("„4557“"), close.reason());
    }
}
