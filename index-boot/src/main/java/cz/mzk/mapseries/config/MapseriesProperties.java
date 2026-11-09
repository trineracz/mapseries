package cz.mzk.mapseries.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds the `mapseries.*` settings from application.yml. Carries over the old
 * app's config: a read/write repo split, the OAI source, and GitHub OAuth.
 */
@ConfigurationProperties("mapseries")
public record MapseriesProperties(Repo repo, Oai oai, Github github, Editor editor, Authorities authorities) {

    /** prUser/prName = where editor pull requests are opened; empty = the read repo
     *  (production flow). A test deployment points it at its own fork so test
     *  edits never reach the library's data. */
    public record Repo(String readUser, String readName, String writeUser, String writeName,
                       String prUser, String prName) {

        public String prRepo() {
            return (prUser == null || prUser.isBlank() ? readUser : prUser) + "/"
                    + (prName == null || prName.isBlank() ? readName : prName);
        }
    }

    public record Oai(String baseUrl, String set, int harvestLimit) {
    }

    public record Github(String clientId, String clientSecret) {
    }

    /** Editor options. dryRun = validate + log writes but skip the GitHub commit
     *  (lets the editor be clicked through locally without hitting the data repo). */
    public record Editor(boolean dryRun) {
    }

    /** National authority file import: where the NK dump is, which heading tags
     *  to keep, an optional record limit for trying it out (0 = no limit), and
     *  whether to import on start-up when the table is still empty. */
    public record Authorities(String dumpUrl, java.util.List<String> tags, int importLimit,
                              boolean importIfEmptyOnStart) {
    }
}
