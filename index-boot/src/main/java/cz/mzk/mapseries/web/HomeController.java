package cz.mzk.mapseries.web;

import cz.mzk.mapseries.repository.SerieRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Presentation homepage — the Thymeleaf port of index.xhtml. Lists the
 * current-version series (each linking to its map).
 */
@Controller
public class HomeController {

    private final SerieRepository serieRepository;

    public HomeController(SerieRepository serieRepository) {
        this.serieRepository = serieRepository;
    }

    @GetMapping({"/", "/index.xhtml"})
    public String index(Model model) {
        model.addAttribute("series", serieRepository.findCurrent());
        model.addAttribute("langUrlsJson", "{\"cs\":\"?lang=cs\",\"en\":\"?lang=en\"}");
        return "index";
    }
}
