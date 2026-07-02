package cz.mzk.mapseries.oai.marc;

import java.util.*;

public class MarcRecord {

    private final Map<String, String> controlFields;
    private final Map<String, List<MarcDataField>> dataFields;

    private MarcRecord(Builder builder) {
        controlFields = Collections.unmodifiableMap(builder.controlFields);
        dataFields = Collections.unmodifiableMap(builder.dataFields);
    }

    public Optional<String> getControlField(String tag) {
        return Optional.ofNullable(controlFields.get(tag));
    }

    public List<MarcDataField> getDataFields(String tag) {
        return dataFields.getOrDefault(tag, Collections.emptyList());
    }

    @Override
    public String toString() {
        return "MarcRecord{" +
                "controlFields=" + controlFields +
                ", dataFields=" + dataFields +
                '}';
    }

    static class Builder {

        private final Map<String, String> controlFields = new HashMap<>();
        private final Map<String, List<MarcDataField>> dataFields = new HashMap<>();

        Builder withControlField(String tag, String value) {
            Objects.requireNonNull(tag);
            Objects.requireNonNull(value);
            controlFields.put(tag, value);
            return this;
        }

        Builder withDataField(String tag, MarcDataField dataField) {
            Objects.requireNonNull(tag);
            Objects.requireNonNull(dataField);
            dataFields.computeIfAbsent(tag, k -> new ArrayList<>()).add(dataField);
            return this;
        }

        MarcRecord build() {
            return new MarcRecord(this);
        }
    }
}
