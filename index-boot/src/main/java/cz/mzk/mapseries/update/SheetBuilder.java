package cz.mzk.mapseries.update;

import cz.mzk.mapseries.Constants;
import cz.mzk.mapseries.dao.SheetDAO;
import cz.mzk.mapseries.managers.ContentDefinitionItem;
import cz.mzk.mapseries.oai.marc.MarcIdentifier;
import cz.mzk.mapseries.oai.marc.MarcRecord;
import cz.mzk.mapseries.oai.marc.MarcTraversal;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.PrintStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SheetBuilder {

    private static final String INNER_DEL = " ";
    private static final String OUTER_DEL = "; ";
    private static final Pattern UUID = Pattern.compile("^.*/(uuid:.+)$");
    private static final int THUMBNAIL_HEIGHT = 300;

    private final ContentDefinitionItem contentDefinition;
    private final MarcRecord marcRecord;
    private final PrintStream log;

    public SheetBuilder(ContentDefinitionItem contentDefinition, MarcRecord marcRecord, PrintStream log) {
        this.contentDefinition = contentDefinition;
        this.marcRecord = marcRecord;
        this.log = log;
    }

    public Optional<SheetDAO> buildSheet() {
        Optional<String> sheetId = getId();
        if (sheetId.isEmpty()) {
            log.println("[WARN] getting of identificator failed for following record: " + marcRecord);
            return Optional.empty();
        }

        SheetDAO sheet = new SheetDAO();
        sheet.setSheetId(sheetId.get());
        sheet.setTitle(getTitle());
        sheet.setYear(getYear());
        sheet.setAuthor(getAuthor());
        sheet.setOtherAuthors(getOtherAuthors());
        sheet.setPublisher(getPublisher());
        sheet.setIssue(getIssue());
        sheet.setDescription(getDescription());
        sheet.setSignature(getSignature());

        String digitalLibraryUrl = getDigitalLibraryUrl();
        sheet.setThumbnailUrl(getThumbnailUrl(digitalLibraryUrl));
        sheet.setDigitalLibraryUrl(digitalLibraryUrl);
        sheet.setVufindUrl(getVufindUrl());

        return Optional.of(sheet);
    }

    private Optional<String> getId() {
        MarcIdentifier marcId = MarcIdentifier.fromString(contentDefinition.getSheets());
        MarcTraversal marcTraversal = createMarcTraversal(marcId).build();

        Optional<String> sheetId = marcTraversal.getValue(marcId);
        if (sheetId.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(applyGroovyTransformation(sheetId.get(), contentDefinition.getGroupBy()));
        } catch (Exception e) {
            log.println(String.format("[WARN] applying script on Sheet ID failed because of exception %s. ID: %s; SCRIPT: %s; MarcRecord: %s",
                    e, sheetId.get(), contentDefinition.getGroupBy(), marcRecord));
        }
        return Optional.empty();
    }

    private String applyGroovyTransformation(String value, String script) {
        Binding binding = new Binding();
        binding.setVariable("field", value);
        GroovyShell shell = new GroovyShell(binding);
        return shell.evaluate(script).toString();
    }

    private String getTitle() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("245").withSubfield("a").build();
        return createMarcTraversal(marcId).build().getValue(marcId).orElse("Unknown");
    }

    private String getYear() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("490").withSubfield("v").build();
        String year = createMarcTraversal(marcId).build().getValue(marcId).orElse("");
        if (year.contains(",")) {
            year = year.substring(year.indexOf(',') + 1).trim();
        }
        return year;
    }

    private String getDigitalLibraryUrl() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("856").withSubfield("u").build();
        return createMarcTraversal(marcId).build().getValue(marcId).orElse("");
    }

    private String getThumbnailUrl(String digitalLibraryUrl) {
        if (digitalLibraryUrl.isEmpty()) {
            return Constants.THUMBNAIL_UNAVAILABLE;
        }
        Optional<String> uuid = parseUuid(digitalLibraryUrl);
        return uuid.map(this::getThumbnailUrlFromUuid).orElse(Constants.THUMBNAIL_UNAVAILABLE);
    }

    private Optional<String> parseUuid(String url) {
        Matcher matcher = UUID.matcher(url);
        if (matcher.matches() && matcher.groupCount() == 1) {
            return Optional.of(matcher.group(1));
        }
        log.println("[WARN] record has unexpected digitalLibraryUrl: " + marcRecord);
        return Optional.empty();
    }

    private String getThumbnailUrlFromUuid(String uuid) {
        // Kramerius 7: the record uuid is usually a monograph with no image of its own;
        // its scan lives on the first page (child), found via the search API. If it has
        // no children the uuid is already a page and we IIIF it directly.
        String imageUuid = getFirstChildOfUuid(uuid).orElse(uuid);
        String url = String.format("https://api.kramerius.mzk.cz/search/iiif/%s/full/,%s/0/default.jpg", imageUuid, THUMBNAIL_HEIGHT);

        int code = checkUrl(url);
        switch (code) {
            case 200: return url;
            case 403: return Constants.THUMBNAIL_COPYRIGHTED;
            default:  return Constants.THUMBNAIL_UNAVAILABLE;
        }
    }

    private Optional<String> getFirstChildOfUuid(String uuid) {
        try {
            String fq = URLEncoder.encode(String.format("own_parent.pid:\"%s\"", uuid), StandardCharsets.UTF_8);
            URL url = new URL(String.format(
                    "https://api.kramerius.mzk.cz/search/api/client/v7.0/search?q=*:*&fq=%s&rows=1&fl=pid", fq));

            String content;
            try (InputStream is = url.openStream()) {
                content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
            JSONArray docs = new JSONObject(content).getJSONObject("response").getJSONArray("docs");

            if (docs.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(docs.getJSONObject(0).getString("pid"));

        } catch (Exception e) {
            log.println("Exception while finding first child of " + uuid + ". MarcRecord: " + marcRecord);
            e.printStackTrace(log);
            return Optional.empty();
        }
    }

    private int checkUrl(String urlParam) {
        try {
            URL url = new URL(urlParam);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            return conn.getResponseCode();
        } catch (Exception e) {
            log.println("Error at processing url: " + urlParam);
            e.printStackTrace(log);
            return 500;
        }
    }

    private String getVufindUrl() {
        Optional<String> controlField = marcRecord.getControlField("001");
        if (controlField.isEmpty()) {
            log.println(String.format("[WARN] following record has no controlfield 001: %s", marcRecord));
            return "";
        }
        return String.format("https://vufind.mzk.cz/Record/MZK01-%s", controlField.get());
    }

    private String getAuthor() {
        MarcTraversal marcTraversal = createMarcTraversal()
                .withSubfieldTransformer(s -> s.replaceAll(",\\s*$", ""))
                .build();

        MarcIdentifier marc110 = new MarcIdentifier.Builder().withField("110").withSubfield("a").withSubfield("b").withDelimiter(INNER_DEL).build();
        MarcIdentifier marc100 = new MarcIdentifier.Builder().withField("100").withSubfield("a").withSubfield("d").withDelimiter(INNER_DEL).build();

        String author = marcTraversal.getValueAsString(OUTER_DEL, marc110).orElse("");
        if (!author.isEmpty()) {
            return author;
        }
        return marcTraversal.getValueAsString(OUTER_DEL, marc100).orElse("");
    }

    private String getOtherAuthors() {
        MarcTraversal marcTraversal = createMarcTraversal()
                .withSubfieldTransformer(s -> s.replaceAll(",\\s*$", ""))
                .build();

        MarcIdentifier marc710 = new MarcIdentifier.Builder().withField("710").withSubfield("a").withSubfield("b").withDelimiter(INNER_DEL).build();
        MarcIdentifier marc700 = new MarcIdentifier.Builder().withField("700").withSubfield("a").withSubfield("d").withDelimiter(INNER_DEL).build();

        return marcTraversal.getValueAsString(OUTER_DEL, marc710, marc700).orElse("");
    }

    private String getPublisher() {
        MarcIdentifier marcId = new MarcIdentifier.Builder()
                .withField("264").withIndicator2("1")
                .withSubfield("a").withSubfield("b").withSubfield("c").withDelimiter(INNER_DEL).build();

        String value = createMarcTraversal(marcId).build().getValueAsString(OUTER_DEL, marcId).orElse(null);
        if (value != null) {
            return value;
        }

        marcId = new MarcIdentifier.Builder()
                .withField("260").withSubfield("a").withSubfield("b").withSubfield("c").withDelimiter(INNER_DEL).build();
        return createMarcTraversal(marcId).build().getValueAsString(OUTER_DEL, marcId).orElse("");
    }

    private String getIssue() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("250").withSubfield("a").build();
        return createMarcTraversal(marcId).build().getValueAsString(OUTER_DEL, marcId).orElse("");
    }

    private String getDescription() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("300")
                .withSubfield("a").withSubfield("b").withSubfield("c").withDelimiter(INNER_DEL).build();
        return createMarcTraversal(marcId).build().getValueAsString(OUTER_DEL, marcId).orElse("");
    }

    private String getSignature() {
        MarcIdentifier marcId = new MarcIdentifier.Builder().withField("910").withSubfield("b").build();
        return createMarcTraversal(marcId).build().getValueAsString(OUTER_DEL, marcId).orElse("");
    }

    private MarcTraversal.Builder createMarcTraversal() {
        return createMarcTraversal(null);
    }

    private MarcTraversal.Builder createMarcTraversal(MarcIdentifier identifier) {
        MarcTraversal.Builder builder = new MarcTraversal.Builder()
                .withMarcRecord(marcRecord)
                .withLogHandler(log::println);

        MarcIdentifier fieldId = MarcIdentifier.fromString(contentDefinition.getField());

        if (identifier != null && fieldId.getField().equals(identifier.getField())) {
            builder.withDataFieldPredicate(dataField ->
                    contentDefinition.getName().equals(dataField.getSubfield(fieldId.getSubfields().get(0)).orElse(null)));
        }

        return builder;
    }
}
