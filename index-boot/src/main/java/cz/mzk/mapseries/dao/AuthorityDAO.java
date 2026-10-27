package cz.mzk.mapseries.dao;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * One record of the Czech National Authority File (Národní autority ČR, NK ČR),
 * imported from the NK dump. Only the kinds the templates use are kept
 * (corporate bodies, topics, geographic names, genre/form terms).
 * Written in bulk by AuthorityImportService and searched with plain SQL.
 */
@Entity
@Table(indexes = @Index(columnList = "tag"))
public class AuthorityDAO {

    /** Authority code (controlfield 001), e.g. ko2015890165 — what goes to $7. */
    @Id
    @Column(length = 32)
    private String code;

    /** Heading tag: 110 corporate body, 150 topic, 151 geographic, 155 form. */
    @Column(length = 3)
    private String tag;

    /** Heading for display, e.g. "Rakousko-Uhersko. Militärgeographisches Institut". */
    @Column(columnDefinition = "text")
    private String heading;

    /** Heading as written in a MARC field, e.g. "Rakousko-Uhersko.$$bMilitärgeographisches Institut". */
    @Column(columnDefinition = "text")
    private String marc;

    /** Variant names (4XX), separated by " | ". */
    @Column(columnDefinition = "text")
    private String variants;

    /** Normalized heading (lowercase, no diacritics) — used for ranking. */
    @Column(columnDefinition = "text")
    private String norm;

    /** Normalized heading + variants — used for searching. */
    @Column(columnDefinition = "text")
    private String search;

    public String getCode() {
        return code;
    }

    public String getTag() {
        return tag;
    }

    public String getHeading() {
        return heading;
    }

    public String getMarc() {
        return marc;
    }

    public String getVariants() {
        return variants;
    }
}
