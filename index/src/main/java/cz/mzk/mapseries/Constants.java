package cz.mzk.mapseries;

/**
 *
 * @author Erich Duda <dudaerich@gmail.com>
 */
public class Constants {
    
    // Repo we READ data from (geojson/templates/config/content-definition). This is
    // the public production repo; reads are unauthenticated so it must stay public.
    public static final String REPO_USER = getPropertyOrDefault("MAPSERIES_REPO_USER", "moravianlibrary");
    public static final String REPO_NAME = getPropertyOrDefault("MAPSERIES_REPO_NAME", "mapseries-data");

    // Repo we WRITE to (commits/PRs). Deliberately separate from the read repo so
    // that editing never touches the library's production data. Defaults to our fork.
    public static final String REPO_WRITE_USER = getPropertyOrDefault("MAPSERIES_REPO_WRITE_USER", "trineracz");
    public static final String REPO_WRITE_NAME = getPropertyOrDefault("MAPSERIES_REPO_WRITE_NAME", "mapseries-data");

    public static final String GITHUB_CLIENT_ID = getProperty("GITHUB_CLIENT_ID");
    public static final String GITHUB_CLIENT_SECRET = getProperty("GITHUB_CLIENT_SECRET");

    public static final String THUMBNAIL_COPYRIGHTED = "copyrighted";
    public static final String THUMBNAIL_UNAVAILABLE = "unavailable";

    public static String getProperty(String key)  {
        String property = System.getProperty(key);
        if (property != null) {
            return property;
        }
        return System.getenv(key);
    }

    public static String getPropertyOrDefault(String key, String defaultValue) {
        String value = getProperty(key);
        return value != null ? value : defaultValue;
    }
    
}
