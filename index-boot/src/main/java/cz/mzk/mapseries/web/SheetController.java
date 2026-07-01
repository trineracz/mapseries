package cz.mzk.mapseries.web;

import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.dao.SheetDAO;
import cz.mzk.mapseries.repository.DescriptionRepository;
import cz.mzk.mapseries.repository.SerieRepository;
import cz.mzk.mapseries.repository.SheetRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Locale;

/**
 * Sheet detail page — Thymeleaf port of sheet.xhtml. Shows the available versions
 * (issues) of a sheet and the metadata of the selected one.
 */
@Controller
public class SheetController {

    private final SerieRepository serieRepository;
    private final SheetRepository sheetRepository;
    private final DescriptionRepository descriptionRepository;

    public SheetController(SerieRepository serieRepository, SheetRepository sheetRepository,
                           DescriptionRepository descriptionRepository) {
        this.serieRepository = serieRepository;
        this.sheetRepository = sheetRepository;
        this.descriptionRepository = descriptionRepository;
    }

    @GetMapping("/sheet.xhtml")
    public String sheet(@RequestParam String serie,
                        @RequestParam String sheet,
                        @RequestParam(defaultValue = "0") int issue,
                        Locale locale, Model model) {

        SerieDAO serieDAO = serieRepository.findCurrentByName(serie).orElse(null);
        List<SheetDAO> sheets = sheetRepository.findCurrentBySerieAndSheetId(serie, sheet);

        if (issue < 0 || issue >= sheets.size()) {
            issue = 0;
        }
        SheetDAO activeSheet = sheets.isEmpty() ? null : sheets.get(issue);

        // Right panel (same as map/home)
        model.addAttribute("series", serieRepository.findCurrent());
        model.addAttribute("activeSerie", serie);
        model.addAttribute("serieDescription",
                descriptionRepository.findCurrentText(serie, locale.getLanguage()).orElse("..."));

        // window.mapSettings for the background map
        model.addAttribute("serieName", serie);
        model.addAttribute("grid", serieDAO != null ? serieDAO.getGrid() : "");
        model.addAttribute("sheetIdsJson", ViewUtils.toJsArray(sheetRepository.findCurrentSheetIds(serie)));

        // Sheet detail
        model.addAttribute("sheetId", sheet);
        model.addAttribute("sheets", sheets);
        model.addAttribute("issue", issue);
        model.addAttribute("activeSheet", activeSheet);
        model.addAttribute("issueFirst", issue == 0);
        model.addAttribute("issueLast", sheets.isEmpty() || issue == sheets.size() - 1);

        model.addAttribute("langUrlsJson", ViewUtils.langUrls("/sheet.xhtml",
                "serie=" + ViewUtils.enc(serie) + "&sheet=" + ViewUtils.enc(sheet) + "&issue=" + issue));

        return "sheet";
    }
}
