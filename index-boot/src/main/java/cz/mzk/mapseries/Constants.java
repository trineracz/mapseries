package cz.mzk.mapseries;

/**
 * Marker values stored in SheetDAO.thumbnailUrl instead of a real URL.
 * (Repo/OAI/GitHub settings now live in application.yml, not here.)
 */
public final class Constants {

    public static final String THUMBNAIL_COPYRIGHTED = "copyrighted";
    public static final String THUMBNAIL_UNAVAILABLE = "unavailable";

    private Constants() {
    }
}
