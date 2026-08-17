package cz.mzk.mapseries.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds the `mapseries.*` settings from application.yml. Carries over the old
 * app's config: a read/write repo split, the OAI source, and GitHub OAuth.
 */
@ConfigurationProperties("mapseries")
public record MapseriesProperties(Repo repo, Oai oai, Github github, Editor editor) {

    public record Repo(String readUser, String readName, String writeUser, String writeName) {
    }

    public record Oai(String baseUrl, String set, int harvestLimit) {
    }

    public record Github(String clientId, String clientSecret) {
    }

    /** Editor options. dryRun = validate + log writes but skip the GitHub commit
     *  (lets the editor be clicked through locally without hitting the data repo). */
    public record Editor(boolean dryRun) {
    }
}
