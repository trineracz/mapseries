package cz.mzk.mapseries.managers;

import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public class ContentDefinitionItem {

    private final String field;
    private final String name;
    private final String prettyName;
    private final String grid;
    private final String sheets;
    private final String groupBy;
    private final String thumbnailUrl;
    private final Map<String, String> description;

    private ContentDefinitionItem(Builder builder) {
        field = builder.field;
        name = builder.name;
        prettyName = builder.prettyName;
        grid = builder.grid;
        sheets = builder.sheets;
        groupBy = builder.groupBy;
        thumbnailUrl = builder.thumbnailUrl;
        description = Collections.unmodifiableMap(builder.description);
    }

    public String getField() {
        return field;
    }

    public String getName() {
        return name;
    }

    public String getPrettyName() {
        return prettyName;
    }

    public String getGrid() {
        return grid;
    }

    public String getSheets() {
        return sheets;
    }

    public String getGroupBy() {
        return groupBy;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public Optional<String> getDescription(String lang) {
        return Optional.ofNullable(description.get(lang));
    }

    public Map<String, String> getDescriptionMap() {
        return description;
    }

    public static class Builder {

        private String field;
        private String name;
        private String prettyName;
        private String grid;
        private String sheets;
        private String groupBy;
        private String thumbnailUrl;
        private Map<String, String> description;

        public Builder withField(String field) {
            Objects.requireNonNull(field);
            this.field = field;
            return this;
        }

        public Builder withName(String name) {
            Objects.requireNonNull(name);
            this.name = name;
            return this;
        }

        public Builder withGrid(String grid) {
            Objects.requireNonNull(grid);
            this.grid = grid;
            return this;
        }

        public Builder withSheets(String sheets) {
            Objects.requireNonNull(sheets);
            this.sheets = sheets;
            return this;
        }

        public Builder withGroupBy(String groupBy) {
            Objects.requireNonNull(groupBy);
            this.groupBy = groupBy;
            return this;
        }

        public Builder withThumbnailUrl(String thumbnailUrl) {
            Objects.requireNonNull(thumbnailUrl);
            this.thumbnailUrl = thumbnailUrl;
            return this;
        }

        public Builder withDescription(Map<String, String> description) {
            Objects.requireNonNull(description);
            this.description = description;
            return this;
        }

        public ContentDefinitionItem build() {
            Objects.requireNonNull(field);
            Objects.requireNonNull(name);
            Objects.requireNonNull(grid);
            Objects.requireNonNull(sheets);
            Objects.requireNonNull(groupBy);
            Objects.requireNonNull(thumbnailUrl);
            Objects.requireNonNull(description);

            prettyName = createPrettyName();

            return new ContentDefinitionItem(this);
        }

        private String createPrettyName() {
            if (name.isEmpty()) {
                return name;
            }
            int begin = name.indexOf("[");
            int end = name.lastIndexOf("]");
            if (begin < 0 || end < 0) {
                return name;
            }
            return name.substring(begin + 1, end);
        }
    }
}
