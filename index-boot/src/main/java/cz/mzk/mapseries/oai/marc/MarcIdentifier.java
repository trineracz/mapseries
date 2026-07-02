package cz.mzk.mapseries.oai.marc;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MarcIdentifier {

    private static final Pattern MARC_ID_PATTERN = Pattern.compile("(\\d+)(\\w)");

    private final String field;
    private final List<String> subfields;
    private final String delimiter;
    private final Optional<String> ind1;
    private final Optional<String> ind2;

    private MarcIdentifier(Builder builder) {
        field = builder.field;
        subfields = builder.subfields;
        delimiter = builder.delimiter;
        ind1 = builder.ind1;
        ind2 = builder.ind2;
    }

    public static MarcIdentifier fromString(String str) {
        Objects.requireNonNull(str);

        Matcher m = MARC_ID_PATTERN.matcher(str);

        if (m.matches() && m.groupCount() == 2) {
            return new MarcIdentifier.Builder()
                    .withField(m.group(1))
                    .withSubfield(m.group(2))
                    .build();
        }
        throw new RuntimeException("Incorrect format of marc field: " + str);
    }

    public String getField() {
        return field;
    }

    public List<String> getSubfields() {
        return subfields;
    }

    public String getDelimiter() {
        return delimiter;
    }

    public Optional<String> getInd1() {
        return ind1;
    }

    public Optional<String> getInd2() {
        return ind2;
    }

    @Override
    public String toString() {
        if (subfields.size() == 1) {
            return field + subfields.get(0);
        } else {
            return field + subfields;
        }
    }

    public static class Builder {

        private String field;
        private final List<String> subfields = new ArrayList<>();
        private String delimiter;
        private Optional<String> ind1 = Optional.empty();
        private Optional<String> ind2 = Optional.empty();

        public Builder withField(String field) {
            Objects.requireNonNull(field);
            this.field = field;
            return this;
        }

        public Builder withSubfield(String subfield) {
            Objects.requireNonNull(subfield);
            subfields.add(subfield);
            return this;
        }

        public Builder withDelimiter(String delimiter) {
            Objects.requireNonNull(delimiter);
            this.delimiter = delimiter;
            return this;
        }

        public Builder withIndicator1(String ind1) {
            Objects.requireNonNull(ind1);
            this.ind1 = Optional.of(ind1);
            return this;
        }

        public Builder withIndicator2(String ind2) {
            Objects.requireNonNull(ind2);
            this.ind2 = Optional.of(ind2);
            return this;
        }

        public MarcIdentifier build() {
            Objects.requireNonNull(field);

            if (subfields.isEmpty()) {
                throw new IllegalStateException("Identifier must contain at least one subfield identifier");
            }
            if (subfields.size() > 1 && delimiter == null) {
                throw new IllegalStateException("Delimeter must be defined in case of multiple subfield identifiers.");
            }
            if (delimiter == null) {
                delimiter = "";
            }
            return new MarcIdentifier(this);
        }
    }
}
