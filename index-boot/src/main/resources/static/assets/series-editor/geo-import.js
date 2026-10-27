/**
 * Converts an uploaded/dropped file into a GeoJSON FeatureCollection so the
 * sheet-map editor can load it. Mirrors the old standalone editor's readfile.js,
 * but only the formats useful for sheet grids and with locally-hosted libs
 * (no CDN): GeoJSON/JSON, TopoJSON, KML, GPX, CSV/TSV.
 *
 * Depends on globals from vendor/ (loaded before this script):
 *   toGeoJSON  (vendor/togeojson/togeojson.umd.js)   — KML, GPX
 *   topojson   (vendor/topojson/topojson-client.min.js) — TopoJSON
 *
 * Usage:  GeoImport.parse(fileName, text) -> FeatureCollection  (throws on error)
 *         GeoImport.ACCEPT                 -> value for <input accept="...">
 */
window.GeoImport = (function () {

    var ACCEPT = ".json,.geojson,.topojson,.kml,.gpx,.csv,.tsv," +
        "application/json,application/geo+json,application/vnd.google-earth.kml+xml,application/gpx+xml,text/csv";

    function ext(name) {
        var m = /\.([a-z0-9]+)$/i.exec(name || "");
        return m ? m[1].toLowerCase() : "";
    }

    function asFC(features) {
        return { type: "FeatureCollection", features: features || [] };
    }

    // A GeoJSON payload may be a FeatureCollection, a bare Feature, or a raw
    // Geometry — normalise all three to a FeatureCollection.
    function normalizeGeojson(obj) {
        if (!obj || !obj.type) { throw new Error("Neznámý JSON — chybí \"type\"."); }
        if (obj.type === "FeatureCollection") { return obj; }
        if (obj.type === "Feature") { return asFC([obj]); }
        if (obj.type === "Topology") { return fromTopojson(obj); }
        // a bare geometry
        return asFC([{ type: "Feature", properties: {}, geometry: obj }]);
    }

    function fromTopojson(topo) {
        if (typeof topojson === "undefined") { throw new Error("TopoJSON knihovna se nenačetla."); }
        var out = [];
        Object.keys(topo.objects || {}).forEach(function (k) {
            var fc = topojson.feature(topo, topo.objects[k]);
            if (fc.type === "FeatureCollection") { out = out.concat(fc.features); }
            else { out.push(fc); }
        });
        return asFC(out);
    }

    function parseXml(text, label) {
        var doc = new DOMParser().parseFromString(text, "text/xml");
        if (doc.getElementsByTagName("parsererror").length) {
            throw new Error("Neplatné " + label + " (chyba XML).");
        }
        return doc;
    }

    function fromKmlGpx(text, kind) {
        if (typeof toGeoJSON === "undefined") { throw new Error("KML/GPX knihovna se nenačetla."); }
        var doc = parseXml(text, kind.toUpperCase());
        var fc = kind === "kml" ? toGeoJSON.kml(doc) : toGeoJSON.gpx(doc);
        if (!fc || !fc.features || !fc.features.length) {
            throw new Error(kind.toUpperCase() + " neobsahuje žádné prvky.");
        }
        return fc;
    }

    // Minimal CSV/TSV: detects a lat/lon column pair, makes point features,
    // keeps the rest of the columns as properties. Good enough to seed sheets
    // you then reshape on the map.
    function fromCsv(text, delim) {
        var rows = splitRows(text).map(function (r) { return splitCells(r, delim); });
        if (rows.length < 2) { throw new Error("CSV nemá žádné datové řádky."); }
        var head = rows[0].map(function (h) { return String(h).trim(); });
        var latI = findCol(head, ["lat", "latitude", "y", "šířka", "sirka"]);
        var lonI = findCol(head, ["lon", "lng", "long", "longitude", "x", "délka", "delka"]);
        if (latI < 0 || lonI < 0) {
            throw new Error("V CSV nejsou souřadnicové sloupce (lat/lon).");
        }
        var feats = [];
        for (var i = 1; i < rows.length; i++) {
            var cells = rows[i];
            if (!cells.length || (cells.length === 1 && cells[0] === "")) { continue; }
            var lat = parseFloat(cells[latI]), lon = parseFloat(cells[lonI]);
            if (isNaN(lat) || isNaN(lon)) { continue; }
            var props = {};
            head.forEach(function (h, c) { if (c !== latI && c !== lonI) { props[h] = cells[c]; } });
            feats.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } });
        }
        if (!feats.length) { throw new Error("V CSV se nenašly platné souřadnice."); }
        return asFC(feats);
    }

    function findCol(head, names) {
        for (var i = 0; i < head.length; i++) {
            if (names.indexOf(head[i].toLowerCase()) >= 0) { return i; }
        }
        return -1;
    }
    function splitRows(text) {
        return text.replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.length > 0; });
    }
    // tolerant of quoted fields containing the delimiter
    function splitCells(line, delim) {
        var out = [], cur = "", q = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (q) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { q = false; }
                else { cur += ch; }
            } else if (ch === '"') { q = true; }
            else if (ch === delim) { out.push(cur); cur = ""; }
            else { cur += ch; }
        }
        out.push(cur);
        return out;
    }

    function parse(fileName, text) {
        switch (ext(fileName)) {
            case "geojson":
            case "json":     return normalizeGeojson(JSON.parse(text));
            case "topojson": return fromTopojson(JSON.parse(text));
            case "kml":      return fromKmlGpx(text, "kml");
            case "gpx":      return fromKmlGpx(text, "gpx");
            case "csv":      return fromCsv(text, ",");
            case "tsv":      return fromCsv(text, "\t");
            default:
                // no/unknown extension: try JSON, then KML/GPX by sniffing the text
                try { return normalizeGeojson(JSON.parse(text)); } catch (e) { /* not json */ }
                if (/<kml[\s>]/i.test(text)) { return fromKmlGpx(text, "kml"); }
                if (/<gpx[\s>]/i.test(text)) { return fromKmlGpx(text, "gpx"); }
                throw new Error("Nerozpoznaný formát souboru.");
        }
    }

    return { parse: parse, ACCEPT: ACCEPT };
})();
