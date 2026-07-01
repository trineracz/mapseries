package cz.mzk.mapseries.dao;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;

import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
public class UpdateTaskDAO implements Serializable {

    @SequenceGenerator(name = "updatetaskdao_seq",
            sequenceName = "updatetaskdao_seq",
            allocationSize = 1)
    @GeneratedValue(strategy = GenerationType.SEQUENCE,
            generator = "updatetaskdao_seq")
    @Id
    private long id;

    private boolean result;

    // Existing column is Postgres `text`; map as text (not @Lob, which wants oid).
    @Column(columnDefinition = "text")
    private String log;

    // Existing columns are `timestamp without time zone`.
    private LocalDateTime startDate;

    private LocalDateTime endDate;

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public boolean isResult() {
        return result;
    }

    public void setResult(boolean result) {
        this.result = result;
    }

    public String getLog() {
        return log;
    }

    public void setLog(String log) {
        this.log = log;
    }

    public LocalDateTime getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDateTime date) {
        this.startDate = date;
    }

    public LocalDateTime getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDateTime date) {
        this.endDate = date;
    }

    @Override
    public int hashCode() {
        int hash = 5;
        hash = 97 * hash + (int) (this.id ^ (this.id >>> 32));
        return hash;
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        final UpdateTaskDAO other = (UpdateTaskDAO) obj;
        return this.id == other.id;
    }
}
