/**
 * Exports the current sheet grid (a GeoJSON FeatureCollection) to a downloadable
 * file. Mirrors the old standalone editor's export menu, minus the formats that
 * needed heavy deps. Pure vanilla JS, no external libs.
 *
 * Usage:  GeoExport.download("geojson", featureCollection, "grid-name");
 *         GeoExport.FORMATS  -> [{key, label, ext}]
 */
window.GeoExport = (function () {

    var FORMATS = [
        { key: "geojson", label: "GeoJSON", ext: "geojson", mime: "application/geo+json" },
        { key: "csv",     label: "CSV (atributy + WKT)", ext: "csv", mime: "text/csv" },
        { key: "kml",     label: "KML", ext: "kml", mime: "application/vnd.google-earth.kml+xml" },
        { key: "wkt",     label: "WKT", ext: "wkt", mime: "text/plain" }
    ];

    // Drop the editor's internal helper key so it never leaks into exports.
    function clean(fc) {
        return JSON.parse(JSON.stringify(fc, function (k, v) { return k === "_template" ? undefined : v; }));
    }

    function propKeys(features) {
        var seen = {}, keys = [];
        features.forEach(function (f) {
            Object.keys(f.properties || {}).forEach(function (k) { if (!seen[k]) { seen[k] = true; keys.push(k); } });
        });
        // SHEET first if present
        keys.sort(function (a, b) { return a === "SHEET" ? -1 : b === "SHEET" ? 1 : 0; });
        return keys;
    }

    function ringWkt(ring) {
        return "(" + ring.map(function (c) { return c[0] + " " + c[1]; }).join(", ") + ")";
    }
    function geomWkt(g) {
        if (!g) { return ""; }
        if (g.type === "Polygon") { return "POLYGON(" + g.coordinates.map(ringWkt).join(", ") + ")"; }
        if (g.type === "MultiPolygon") {
            return "MULTIPOLYGON(" + g.coordinates.map(function (poly) {
                return "(" + poly.map(ringWkt).join(", ") + ")"; }).join(", ") + ")";
        }
        if (g.type === "Point") { return "POINT(" + g.coordinates[0] + " " + g.coordinates[1] + ")"; }
        if (g.type === "LineString") { return "LINESTRING" + ringWkt(g.coordinates); }
        return "";
    }

    function csvCell(v) {
        v = v == null ? "" : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    function toCsv(features) {
        var keys = propKeys(features);
        var header = keys.concat(["WKT"]).map(csvCell).join(",");
        var rows = features.map(function (f) {
            var p = f.properties || {};
            return keys.map(function (k) { return csvCell(p[k]); })
                .concat([csvCell(geomWkt(f.geometry))]).join(",");
        });
        return header + "\n" + rows.join("\n") + "\n";
    }

    function toWkt(features) {
        return features.map(function (f) { return geomWkt(f.geometry); })
            .filter(Boolean).join("\n") + "\n";
    }

    function xml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
        });
    }
    function kmlCoords(ring) {
        return ring.map(function (c) { return c[0] + "," + c[1] + ",0"; }).join(" ");
    }
    function kmlGeom(g) {
        if (!g) { return ""; }
        if (g.type === "Polygon") {
            var boundaries = g.coordinates.map(function (ring, i) {
                var tag = i === 0 ? "outerBoundaryIs" : "innerBoundaryIs";
                return "<" + tag + "><LinearRing><coordinates>" + kmlCoords(ring) +
                    "</coordinates></LinearRing></" + tag + ">";
            }).join("");
            return "<Polygon>" + boundaries + "</Polygon>";
        }
        if (g.type === "Point") { return "<Point><coordinates>" + g.coordinates[0] + "," + g.coordinates[1] + ",0</coordinates></Point>"; }
        if (g.type === "LineString") { return "<LineString><coordinates>" + kmlCoords(g.coordinates) + "</coordinates></LineString>"; }
        return "";
    }
    function toKml(features, name) {
        var keys = propKeys(features);
        var placemarks = features.map(function (f) {
            var p = f.properties || {};
            var data = keys.map(function (k) {
                return '<Data name="' + xml(k) + '"><value>' + xml(p[k]) + "</value></Data>";
            }).join("");
            return "<Placemark><name>" + xml(p.SHEET || p.TITLE || "") + "</name>" +
                "<ExtendedData>" + data + "</ExtendedData>" + kmlGeom(f.geometry) + "</Placemark>";
        }).join("\n");
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + xml(name || "grid") + "</name>\n" +
            placemarks + "\n</Document></kml>\n";
    }

    function serialize(format, fc, name) {
        var features = (fc && fc.features) || [];
        switch (format) {
            case "geojson": return JSON.stringify(clean(fc), null, 2);
            case "csv":     return toCsv(features);
            case "kml":     return toKml(features, name);
            case "wkt":     return toWkt(features);
            default:        throw new Error("Neznámý formát: " + format);
        }
    }

    function download(format, fc, name) {
        var fmt = FORMATS.filter(function (f) { return f.key === format; })[0];
        if (!fmt) { throw new Error("Neznámý formát: " + format); }
        var content = serialize(format, fc, name);
        var blob = new Blob([content], { type: fmt.mime + ";charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = (name || "grid") + "." + fmt.ext;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    return { FORMATS: FORMATS, serialize: serialize, download: download };
})();
