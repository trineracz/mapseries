package cz.mzk.mapseries.web;

import cz.mzk.mapseries.dao.SerieDAO;
import cz.mzk.mapseries.repository.SerieRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Temporary verification endpoint: returns the current-version series as JSON so
 * we can confirm the ported domain + persistence read the real harvested data.
 */
@RestController
public class SeriesController {

    private final SerieRepository serieRepository;

    public SeriesController(SerieRepository serieRepository) {
        this.serieRepository = serieRepository;
    }

    @GetMapping("/api/series")
    public List<SerieDAO> series() {
        return serieRepository.findCurrent();
    }
}
