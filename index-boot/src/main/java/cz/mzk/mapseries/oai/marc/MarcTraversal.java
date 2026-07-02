package cz.mzk.mapseries.oai.marc;

import java.util.*;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class MarcTraversal {

    private final MarcRecord marcRecord;
    private final Consumer<String> logHandler;
    private final List<Predicate<MarcDataField>> dataFieldPredicates;
    private final Function<String, String> subfieldTransformer;

    private MarcTraversal(Builder builder) {
        marcRecord = builder.marcRecord;
        logHandler = builder.logHandler;
        dataFieldPredicates = builder.dataFieldPredicates;
        subfieldTransformer = builder.subfieldTransformer;
    }

    public Optional<String> getValue(MarcIdentifier identifier) {
        List<String> values = getValuesAsList(identifier);

        if (values.isEmpty()) {
            return Optional.empty();
        }
        if (values.size() > 1) {
            logHandler.accept(String.format("[WARN] record contains more than one %s fields: %s", identifier, marcRecord));
        }
        return Optional.of(values.get(0));
    }

    public Optional<String> getValueAsString(String delimiter, MarcIdentifier... identifiers) {
        List<String> values = Stream.of(identifiers)
                .map(this::getValuesAsList)
                .flatMap(Collection::stream)
                .collect(Collectors.toList());

        if (values.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(String.join(delimiter, values));
    }

    public List<String> getValuesAsList(MarcIdentifier... identifier) {
        return Stream.of(identifier)
                .map(this::getValuesAsListInternal)
                .flatMap(Collection::stream)
                .collect(Collectors.toList());
    }

    private List<String> getValuesAsListInternal(MarcIdentifier identifier) {
        return marcRecord
                .getDataFields(identifier.getField())
                .stream()
                .filter(dataField -> dataFieldPredicates.isEmpty() || dataFieldPredicates.stream().anyMatch(predicate -> predicate.test(dataField)))
                .filter(dataField -> checkIndicators(dataField, identifier))
                .map(dataField -> joinSubfields(dataField, identifier))
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toList());
    }

    private boolean checkIndicators(MarcDataField dataField, MarcIdentifier id) {
        boolean result = true;
        if (id.getInd1().isPresent()) {
            result = dataField.getInd1().equals(id.getInd1());
        }
        if (id.getInd2().isPresent()) {
            result = result && dataField.getInd2().equals(id.getInd2());
        }
        return result;
    }

    private Optional<String> joinSubfields(MarcDataField dataField, MarcIdentifier identifier) {
        List<String> values = identifier.getSubfields()
                .stream()
                .map(dataField::getSubfield)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toList());

        if (values.isEmpty()) {
            return Optional.empty();
        }
        if (subfieldTransformer != null) {
            values = values.stream().map(subfieldTransformer).collect(Collectors.toList());
        }
        return Optional.of(String.join(identifier.getDelimiter(), values));
    }

    public static class Builder {

        private MarcRecord marcRecord;
        private Consumer<String> logHandler;
        private final List<Predicate<MarcDataField>> dataFieldPredicates = new ArrayList<>();
        private Function<String, String> subfieldTransformer;

        public Builder withMarcRecord(MarcRecord marcRecord) {
            Objects.requireNonNull(marcRecord);
            this.marcRecord = marcRecord;
            return this;
        }

        public Builder withLogHandler(Consumer<String> logHandler) {
            Objects.requireNonNull(logHandler);
            this.logHandler = logHandler;
            return this;
        }

        public Builder withDataFieldPredicate(Predicate<MarcDataField> predicate) {
            Objects.requireNonNull(predicate);
            dataFieldPredicates.add(predicate);
            return this;
        }

        public Builder withSubfieldTransformer(Function<String, String> subfieldTransformer) {
            Objects.requireNonNull(subfieldTransformer);
            this.subfieldTransformer = subfieldTransformer;
            return this;
        }

        public MarcTraversal build() {
            Objects.requireNonNull(marcRecord);
            Objects.requireNonNull(logHandler);
            return new MarcTraversal(this);
        }
    }
}
