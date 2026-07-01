package cz.mzk.mapseries.web;

import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.repository.DescriptionRepository;
import cz.mzk.mapseries.repository.SerieRepository;
import cz.mzk.mapseries.repository.SheetRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Locale;

/**
 * Series map page — Thymeleaf port of map.xhtml. The map itself is drawn by the
 * frontend JS from window.mapSettings (serie / grid / sheetIds) which we inject.
 */
@Controller
public class MapController {

    private final SerieRepository serieRepository;
    private final SheetRepository sheetRepository;
    private final DescriptionRepository descriptionRepository;

    public MapController(SerieRepository serieRepository, SheetRepository sheetRepository,
                         DescriptionRepository descriptionRepository) {
        this.serieRepository = serieRepository;
        this.sheetRepository = sheetRepository;
        this.descriptionRepository = descriptionRepository;
    }

    @GetMapping("/map.xhtml")
    public String map(@RequestParam String serie, Locale locale, Model model) {
        SerieDAO serieDAO = serieRepository.findCurrentByName(serie).orElse(null);

        model.addAttribute("series", serieRepository.findCurrent());
        model.addAttribute("activeSerie", serie);
        model.addAttribute("serieDescription",
                descriptionRepository.findCurrentText(serie, locale.getLanguage()).orElse("..."));

        model.addAttribute("serieName", serie);
        model.addAttribute("grid", serieDAO != null ? serieDAO.getGrid() : "");
        model.addAttribute("sheetIdsJson", ViewUtils.toJsArray(sheetRepository.findCurrentSheetIds(serie)));
        model.addAttribute("langUrlsJson", ViewUtils.langUrls("/map.xhtml", "serie=" + ViewUtils.enc(serie)));

        return "map";
    }
}
