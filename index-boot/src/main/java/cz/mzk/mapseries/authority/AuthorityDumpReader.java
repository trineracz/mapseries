package cz.mzk.mapseries.authority;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Streams a MARCXML collection of authority records (the NK dump, ~3 GB
 * uncompressed) without loading it into memory, and hands every record whose
 * heading (1XX) tag is wanted to the consumer.
 */
public class AuthorityDumpReader {

    /** One authority record, reduced to what the catalog needs. */
    public record Authority(String code, String tag, String heading, String marc, List<String> variants) {
    }

    private record Field(String tag, List<String[]> subfields) {
    }

    private final Set<String> tags;

    public AuthorityDumpReader(Set<String> tags) {
        this.tags = tags;
    }

    /**
     * Read the stream and pass matching records to the consumer.
     * @param limit stop after this many matching records (0 = all)
     * @return number of records passed on
     */
    public long read(InputStream in, Consumer<Authority> consumer, long limit) throws XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newInstance();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        XMLStreamReader xml = factory.createXMLStreamReader(in, "UTF-8");
        long count = 0;
        String code = null;
        List<Field> fields = null;
        Field field = null;
        String subfieldCode = null;
        String controlTag = null;
        StringBuilder text = new StringBuilder();
        try {
            while (xml.hasNext()) {
                int event = xml.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    switch (xml.getLocalName()) {
                        case "record" -> {
                            code = null;
                            fields = new ArrayList<>();
                        }
                        case "controlfield" -> {
                            controlTag = xml.getAttributeValue(null, "tag");
                            text.setLength(0);
                        }
                        case "datafield" -> field = new Field(xml.getAttributeValue(null, "tag"), new ArrayList<>());
                        case "subfield" -> {
                            subfieldCode = xml.getAttributeValue(null, "code");
                            text.setLength(0);
                        }
                        default -> {
                        }
                    }
                } else if (event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA) {
                    text.append(xml.getText());
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    switch (xml.getLocalName()) {
                        case "controlfield" -> {
                            if ("001".equals(controlTag)) {
                                code = text.toString().trim();
                            }
                            controlTag = null;
                        }
                        case "subfield" -> {
                            if (field != null && subfieldCode != null) {
                                field.subfields().add(new String[] {subfieldCode, text.toString().trim()});
                            }
                            subfieldCode = null;
                        }
                        case "datafield" -> {
                            if (fields != null && field != null) {
                                fields.add(field);
                            }
                            field = null;
                        }
                        case "record" -> {
                            Authority a = toAuthority(code, fields);
                            if (a != null) {
                                consumer.accept(a);
                                count++;
                                if (limit > 0 && count >= limit) {
                                    return count;
                                }
                            }
                            fields = null;
                        }
                        default -> {
                        }
                    }
                }
            }
        } finally {
            xml.close();
        }
        return count;
    }

    private Authority toAuthority(String code, List<Field> fields) {
        if (code == null || code.isEmpty() || fields == null) {
            return null;
        }
        Field heading = fields.stream().filter(f -> f.tag() != null && f.tag().startsWith("1")).findFirst().orElse(null);
        if (heading == null || !tags.contains(heading.tag())) {
            return null;
        }
        String display = join(heading, false);
        if (display.isEmpty()) {
            return null;
        }
        // variants: the 4XX "see from" tracings of the same kind (110 -> 410, ...)
        String variantTag = "4" + heading.tag().substring(1);
        Set<String> variants = new LinkedHashSet<>();
        for (Field f : fields) {
            if (variantTag.equals(f.tag())) {
                String v = join(f, false);
                if (!v.isEmpty()) {
                    variants.add(v);
                }
            }
        }
        return new Authority(code, heading.tag(), display, join(heading, true), new ArrayList<>(variants));
    }

    /**
     * Name parts of a heading field (control subfields like $7 or $0 skipped).
     * For display they are joined with spaces; for MARC the first part is
     * written as is and the others with their "$$x" subfield marker, the way
     * the templates write it (e.g. "Rakousko-Uhersko.$$bMilitärgeographisches Institut").
     */
    private static String join(Field f, boolean marc) {
        StringBuilder sb = new StringBuilder();
        for (String[] sf : f.subfields()) {
            String c = sf[0];
            if (c.isEmpty() || Character.isDigit(c.charAt(0)) || sf[1].isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(marc ? "$$" + c : " ");
            }
            sb.append(sf[1]);
        }
        return sb.toString();
    }
}
