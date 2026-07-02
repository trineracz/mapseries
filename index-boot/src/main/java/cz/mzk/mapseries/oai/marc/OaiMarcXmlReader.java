package cz.mzk.mapseries.oai.marc;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.*;

/**
 * Reads MARC21 records from an OAI-PMH endpoint, following resumptionToken paging.
 * (javax.xml.parsers is JAXP from the JDK, not Java EE — unchanged under Jakarta.)
 */
public class OaiMarcXmlReader implements Iterable<MarcRecord> {

    private static final String OAI_NAMESPACE = "http://www.openarchives.org/OAI/2.0/";
    private static final String MARC_NAMESPACE = "http://www.loc.gov/MARC21/slim";

    private final String baseUrl;
    private final String setName;

    private PrintStream log;

    private Queue<MarcRecord> records;
    private final Object recordsLock = new Object();
    private String resumptionToken = null;

    private MarcRecord.Builder marcRecordBuilder;
    private MarcDataField.Builder marcDataFieldBuilder;

    public OaiMarcXmlReader(String baseUrl, String setName) {
        this.baseUrl = baseUrl;
        this.setName = setName;
    }

    public PrintStream getLog() {
        return log;
    }

    public void setLog(PrintStream log) {
        this.log = log;
    }

    @Override
    public Iterator<MarcRecord> iterator() {

        synchronized (recordsLock) {
            if (records == null) {
                records = getInitRecords();
            }
        }

        return new Iterator<MarcRecord>() {
            @Override
            public boolean hasNext() {
                if (!records.isEmpty()) {
                    return true;
                }
                if (resumptionToken == null) {
                    return false;
                }
                while (resumptionToken != null) {
                    records = getNextRecords();
                    if (!records.isEmpty()) {
                        return true;
                    }
                }
                return false;
            }

            @Override
            public MarcRecord next() {
                return records.poll();
            }
        };
    }

    private Queue<MarcRecord> getInitRecords() {
        try {
            URL url = new URL(String.format("%s?verb=ListRecords&metadataPrefix=marc21&set=%s", baseUrl, setName));
            return parseRecords(url);
        } catch (MalformedURLException e) {
            e.printStackTrace(log);
        }
        return new LinkedList<>();
    }

    private Queue<MarcRecord> getNextRecords() {
        try {
            URL url = new URL(String.format("%s?verb=ListRecords&resumptionToken=%s", baseUrl, resumptionToken));
            return parseRecords(url);
        } catch (MalformedURLException e) {
            e.printStackTrace(log);
        }
        return new LinkedList<>();
    }

    private Queue<MarcRecord> parseRecords(URL url) {
        Queue<MarcRecord> result = new LinkedList<>();

        try (InputStream is = url.openStream()) {

            Document doc = getDocumentBuilder().parse(is);
            NodeList records = doc.getElementsByTagNameNS(MARC_NAMESPACE, "record");

            for (int i = 0; i < records.getLength(); i++) {
                Element record = (Element) records.item(i);

                marcRecordBuilder = new MarcRecord.Builder();
                parseControlFields(record);
                parseDataFields(record);
                result.add(marcRecordBuilder.build());
                marcRecordBuilder = null;
            }

            NodeList resumptionTokenNodeList = doc.getElementsByTagNameNS(OAI_NAMESPACE, "resumptionToken");
            if (resumptionTokenNodeList.getLength() > 0) {
                resumptionToken = resumptionTokenNodeList.item(0).getTextContent().trim();
            } else {
                resumptionToken = null;
            }

        } catch (IOException | SAXException e) {
            e.printStackTrace(log);
        }

        return result;
    }

    private void parseControlFields(Element record) {
        NodeList controlFields = record.getElementsByTagNameNS(MARC_NAMESPACE, "controlfield");
        for (int i = 0; i < controlFields.getLength(); i++) {
            Element controlField = (Element) controlFields.item(i);
            if (!controlField.hasAttribute("tag")) {
                log.println(String.format("[WARN] controlfield %s has no tag attribute", controlField));
                continue;
            }
            marcRecordBuilder.withControlField(controlField.getAttribute("tag"), controlField.getTextContent().trim());
        }
    }

    private void parseDataFields(Element record) {
        NodeList dataFields = record.getElementsByTagNameNS(MARC_NAMESPACE, "datafield");
        for (int i = 0; i < dataFields.getLength(); i++) {
            Element dataField = (Element) dataFields.item(i);
            if (!dataField.hasAttribute("tag")) {
                log.println(String.format("[WARN] datafield %s has no tag attribute", dataField));
                continue;
            }
            marcDataFieldBuilder = new MarcDataField.Builder();
            if (dataField.hasAttribute("ind1")) {
                marcDataFieldBuilder.withIndicator1(dataField.getAttribute("ind1"));
            }
            if (dataField.hasAttribute("ind2")) {
                marcDataFieldBuilder.withIndicator2(dataField.getAttribute("ind2"));
            }
            parseSubFields(dataField);
            marcRecordBuilder.withDataField(dataField.getAttribute("tag"), marcDataFieldBuilder.build());
            marcDataFieldBuilder = null;
        }
    }

    private void parseSubFields(Element dataField) {
        NodeList subFields = dataField.getElementsByTagNameNS(MARC_NAMESPACE, "subfield");
        for (int i = 0; i < subFields.getLength(); i++) {
            Element subField = (Element) subFields.item(i);
            if (!subField.hasAttribute("code")) {
                log.println(String.format("[WARN] subfield %s has no code attribute", subField));
                continue;
            }
            marcDataFieldBuilder.withSubfield(subField.getAttribute("code"), subField.getTextContent().trim());
        }
    }

    private static DocumentBuilder getDocumentBuilder() {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        try {
            return dbf.newDocumentBuilder();
        } catch (ParserConfigurationException e) {
            throw new RuntimeException(e);
        }
    }
}
