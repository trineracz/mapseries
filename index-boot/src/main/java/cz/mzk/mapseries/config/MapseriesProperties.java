package cz.mzk.mapseries.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds the `mapseries.*` settings from application.yml. Carries over the old
 * app's config: a read/write repo split, the OAI source, and GitHub OAuth.
 */
@ConfigurationProperties("mapseries")
public record MapseriesProperties(Repo repo, Oai oai, Github github) {

    public record Repo(String readUser, String readName, String writeUser, String writeName) {
    }

    public record Oai(String baseUrl, String set, int harvestLimit) {
    }

    public record Github(String clientId, String clientSecret) {
    }
}
