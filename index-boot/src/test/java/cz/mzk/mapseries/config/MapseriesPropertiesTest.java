package cz.mzk.mapseries.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class MapseriesPropertiesTest {

    @Test
    void pullRequestsGoToTheReadRepoByDefault() {
        var repo = new MapseriesProperties.Repo("moravianlibrary", "mapseries-data", "trineracz", "mapseries-data", "", null);
        assertEquals("moravianlibrary/mapseries-data", repo.prRepo());
    }

    @Test
    void aTestDeploymentKeepsPullRequestsInItsFork() {
        var repo = new MapseriesProperties.Repo("moravianlibrary", "mapseries-data", "AlesChudarek", "mapseries-data",
                "AlesChudarek", "mapseries-data");
        assertEquals("AlesChudarek/mapseries-data", repo.prRepo());
    }
}
