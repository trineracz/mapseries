/**
 * Reusable rectangle-based sheet grid editor (Leaflet). Extracted from the old
 * standalone sheets page so it can be embedded inline in the series workspace.
 *
 * Expects this HTML to already exist on the page:
 *   #map                       (the Leaflet map container)
 *   #props                     (side panel — selected-sheet property editor)
 *   #pickBtn #rows #cols #pickStatus #undoBtn  (toolbar)
 *
 * Usage:  var api = SheetMapEditor.init({ initialGeojson: {...} });
 *         api.getGeojson();        // current FeatureCollection (live reference)
 *         api.invalidateSize();    // call after the section is expanded/shown
 *         api.hasFeatures();
 */
window.SheetMapEditor = (function () {
    function init(opts) {
        opts = opts || {};

        var props = document.getElementById("props");
        var onSelect = opts.onSelect;   // page hook: notified with the selected feature (or null)
        function notifySelect(f) { if (typeof onSelect === "function") { try { onSelect(f); } catch (e) { /* ignore */ } } }

        var map = L.map("map", { preferCanvas: true });
        // Keyless base layers only — no API tokens, so nothing breaks in deployment.
        var osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19, attribution: "© OpenStreetMap"
        }).addTo(map);
        var topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap"
        });
        var imagery = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19, attribution: "Letecký snímek © Esri, Maxar, Earthstar Geographics"
        });
        L.control.layers({
            "Mapa (OSM)": osm, "Turistická (OpenTopoMap)": topo, "Letecký snímek (Esri)": imagery
        }, null, { collapsed: false }).addTo(map);
        map.setView([49.8, 15.5], 6);
        map.on("moveend", updateLabels);

        var geojson = (opts.initialGeojson && opts.initialGeojson.type)
            ? opts.initialGeojson : { type: "FeatureCollection", features: [] };
        var gridLayer = null, layerOf = new Map();
        var selectedFeature = null, selectedLayer = null, selRect = null;
        var handles = [];                 // corner + rotation markers
        var ghostLayer = L.layerGroup().addTo(map);
        var ghostTimer = null;
        var isDragging = false, snapKey = false;
        var history = [], MAX_HISTORY = 30;
        var suggested = [];               // column names the template wants (via attr)
        var baseStyle = { color: "#3388ff", weight: 1, fillOpacity: 0.08 };
        var selStyle = { color: "#b23a2e", weight: 3, fillOpacity: 0.20 };
        var vertexIcon = L.divIcon({ className: "vhandle", iconSize: [11, 11] });
        var rotIcon = L.divIcon({ className: "rothandle", iconSize: [14, 14] });
        var edgeIcon = L.divIcon({ className: "edgehandle", iconSize: [12, 8] });
        var moveIcon = L.divIcon({ className: "movehandle", iconSize: [16, 16] });
        var plusIcon = L.divIcon({ className: "ghost-plus", html: "+", iconSize: [22, 22] });
        var LABEL_SPACING = 34, LABEL_CAP = 500;

        // ---- coordinate system for the selected-sheet corner boxes ----
        // WGS84 by default; optionally read/enter corners in S-JTSK / Křovák.
        if (window.proj4) {
            try {
                proj4.defs("EPSG:5514", "+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 " +
                    "+alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel " +
                    "+towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs");
            } catch (e) { /* already defined */ }
        }
        var coordCrs = "EPSG:4326";
        // A latitude/longitude → the two numbers shown for the current CRS, and back.
        // WGS84: [lat, lng] (keeps the familiar order). Projected: [X (east), Y (north)].
        function llToDisplay(latlng) {
            if (coordCrs === "EPSG:4326" || !window.proj4) { return [latlng.lat, latlng.lng]; }
            var xy = proj4("EPSG:4326", coordCrs, [latlng.lng, latlng.lat]); return [xy[0], xy[1]];
        }
        function displayToLL(d1, d2) {
            if (coordCrs === "EPSG:4326" || !window.proj4) { return L.latLng(d1, d2); }
            var ll = proj4(coordCrs, "EPSG:4326", [d1, d2]); return L.latLng(ll[1], ll[0]);
        }

        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
        }

        // ---- projected (planar) helpers, so rectangle math is zoom-independent ----
        function projC(c) { return map.options.crs.project(L.latLng(c[1], c[0])); }
        function unC(pt) { var ll = map.options.crs.unproject(pt); return [ll.lng, ll.lat]; }
        function projLL(latlng) { return map.options.crs.project(latlng); }
        function ringToLatLngs(r) { return r.slice(0, r.length - 1).map(function (c) { return [c[1], c[0]]; }); }

        function rectFromFeature(f) {
            var r = f.geometry.coordinates[0];
            var p = [0, 1, 2, 3].map(function (i) { return projC(r[i] || r[0]); });
            var angle = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
            return { cx: (p[0].x + p[2].x) / 2, cy: (p[0].y + p[2].y) / 2,
                w: p[0].distanceTo(p[1]), h: p[1].distanceTo(p[2]), angle: angle };
        }
        function axes(a) { var ca = Math.cos(a), sa = Math.sin(a); return { ux: { x: ca, y: sa }, uy: { x: -sa, y: ca } }; }
        function cornerPt(rc, sx, sy) {
            var A = axes(rc.angle), hw = rc.w / 2, hh = rc.h / 2;
            return L.point(rc.cx + A.ux.x * sx * hw + A.uy.x * sy * hh, rc.cy + A.ux.y * sx * hw + A.uy.y * sy * hh);
        }
        function ringFromRect(rc) {
            var s = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (v) { return unC(cornerPt(rc, v[0], v[1])); });
            s.push(s[0]);
            return s;
        }
        function applyRect(f, rc, layer) {
            f.geometry.coordinates = [ringFromRect(rc)];
            if (layer) { layer.setLatLngs(ringToLatLngs(f.geometry.coordinates[0])); }
        }

        function pointInRing(lng, lat, r) {
            var inside = false;
            for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
                var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
                if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) { inside = !inside; }
            }
            return inside;
        }
        function occupied(lng, lat, exceptF) {
            return (geojson.features || []).some(function (f) {
                return f !== exceptF && pointInRing(lng, lat, f.geometry.coordinates[0]);
            });
        }

        // ---- history ----
        function pushHistory() {
            try { history.push(JSON.stringify(geojson)); } catch (e) { return; }
            if (history.length > MAX_HISTORY) { history.shift(); }
        }
        function undo() { if (history.length) { geojson = JSON.parse(history.pop()); loadGeojson(geojson, false); } }

        // ---- series fields (property columns) ----
        function fieldKeys() {
            var set = {};
            (geojson.features || []).forEach(function (f) {
                Object.keys(f.properties || {}).forEach(function (k) { set[k] = true; });
            });
            var keys = Object.keys(set);
            return keys.length ? keys : ["SHEET"];
        }
        // Fields whose value is the same across ALL sheets = the series constants; used
        // to pre-fill new sheets automatically even without a manually set default.
        function autoDefaults() {
            var vals = {}, multi = {};
            (geojson.features || []).forEach(function (f) {
                Object.keys(f.properties || {}).forEach(function (k) {
                    var v = f.properties[k];
                    if (k === "SHEET" || v == null || v === "" || multi[k]) { return; }
                    if (vals[k] === undefined) { vals[k] = v; }
                    else if (vals[k] !== v) { multi[k] = true; delete vals[k]; }
                });
            });
            return vals;
        }
        function newProps() {
            var auto = autoDefaults(), p = {};
            fieldKeys().forEach(function (k) { p[k] = auto[k] != null ? auto[k] : ""; });
            p.SHEET = String(nextSheetNumber());
            return p;
        }
        function nextSheetNumber() {
            var max = 0;
            (geojson.features || []).forEach(function (f) {
                var n = parseInt((f.properties || {}).SHEET, 10); if (!isNaN(n) && n > max) { max = n; }
            });
            return max + 1;
        }
        // Sheet numbers are coordinates: XXYY where XX = row, YY = column (equal widths).
        function parseSheet(s) {
            s = String(s == null ? "" : s);
            if (!/^\d+$/.test(s) || s.length < 2 || s.length % 2 !== 0) { return null; }
            var h = s.length / 2;
            return { row: parseInt(s.slice(0, h), 10), col: parseInt(s.slice(h), 10), w: h };
        }
        function formatSheet(row, col, w) {
            function pad(n) { n = String(n); while (n.length < w) { n = "0" + n; } return n; }
            return pad(row) + pad(col);
        }
        function sheetExists(no) {
            return (geojson.features || []).some(function (f) { return String((f.properties || {}).SHEET) === String(no); });
        }

        // ---- column manager: the per-sheet property columns (catalog fields like N245A) ----
        function renderColumns() {
            var box = document.getElementById("colMgr");
            if (!box) { return; }
            var keys = fieldKeys(), has = {};
            keys.forEach(function (k) { has[k] = true; });
            var html = '<strong>Atributy listů</strong>' +
                '<div class="hint">Údaje, které nese každý list (např. TITLE, autor). Šablona je tahá přes <code>attr</code> (např. N245A).</div>';
            if (!(geojson.features || []).length) {
                html += '<div class="hint">Nejdřív vytvořte aspoň jeden list, pak sem přidávejte atributy.</div>';
            }
            keys.forEach(function (k) {
                html += '<div class="col-row"><span class="cname">' + esc(k) + '</span>' +
                    '<button type="button" class="btn btn-xs btn-link" data-cren="' + esc(k) + '">✎</button>' +
                    (k === "SHEET" ? "" : '<button type="button" class="btn btn-xs btn-link text-danger" data-cdel="' + esc(k) + '">×</button>') +
                    '</div>';
            });
            var missing = suggested.filter(function (a) { return !has[a]; });
            if (missing.length) {
                html += '<div class="hint" style="margin-top:6px">Šablona chce i tato pole:</div><div>';
                missing.forEach(function (a) { html += '<button type="button" class="btn btn-xs btn-default" data-cadd="' + esc(a) + '">+ ' + esc(a) + '</button> '; });
                html += '</div>';
            }
            html += '<div class="prop-row" style="margin-top:6px">' +
                '<input type="text" id="newColName" placeholder="název atributu" style="width:55%"/> ' +
                '<button type="button" class="btn btn-xs btn-default" id="addColBtn">Přidat</button></div>';
            box.innerHTML = html;
            box.querySelector("#addColBtn").addEventListener("click", function () {
                var i = document.getElementById("newColName"); addColumn((i.value || "").trim()); i.value = "";
            });
            box.querySelectorAll("[data-cadd]").forEach(function (b) {
                b.addEventListener("click", function () { addColumn(b.getAttribute("data-cadd")); });
            });
            box.querySelectorAll("[data-cren]").forEach(function (b) {
                b.addEventListener("click", function () {
                    var k = b.getAttribute("data-cren"), nn = prompt("Nový název sloupce:", k);
                    if (nn && nn !== k) { renameColumn(k, nn); }
                });
            });
            box.querySelectorAll("[data-cdel]").forEach(function (b) {
                b.addEventListener("click", function () {
                    var k = b.getAttribute("data-cdel");
                    if (confirm('Odebrat sloupec "' + k + '" ze všech listů?')) { deleteColumn(k); }
                });
            });
        }
        function addColumn(k) {
            if (!k) { return; }
            pushHistory();
            (geojson.features || []).forEach(function (f) {
                var p = f.properties || (f.properties = {});
                if (!(k in p)) { p[k] = ""; }
            });
            afterColumnChange();
        }
        function renameColumn(k, nn) {
            pushHistory();
            (geojson.features || []).forEach(function (f) {
                var p = f.properties || {};
                if (Object.prototype.hasOwnProperty.call(p, k)) { p[nn] = p[k]; delete p[k]; }
            });
            afterColumnChange();
        }
        function deleteColumn(k) {
            pushHistory();
            (geojson.features || []).forEach(function (f) { if (f.properties) { delete f.properties[k]; } });
            afterColumnChange();
        }
        function afterColumnChange() {
            renderColumns();
            renderTable();
            if (selectedFeature) { renderEditor(selectedFeature); }
        }

        // ---- bulk table: all sheets × all columns, editable in one grid ----
        var tableEl = null;
        function mountTable(el) { tableEl = el; renderTable(); }
        // Mark the selected sheet's row (without a full re-render, so edits keep focus).
        function highlightTableRow() {
            if (!tableEl) { return null; }
            var feats = geojson.features || [], target = null;
            tableEl.querySelectorAll("tr[data-row]").forEach(function (tr) {
                var f = feats[parseInt(tr.getAttribute("data-row"), 10)];
                if (f && f === selectedFeature) { tr.classList.add("sel-row"); target = tr; }
                else { tr.classList.remove("sel-row"); }
            });
            return target;
        }
        // Scroll the table to the selected sheet's row and flash it. Returns false if
        // nothing is selected or the table isn't mounted.
        function scrollToSelectedRow() {
            var tr = highlightTableRow();
            if (!tr) { return false; }
            if (tr.scrollIntoView) { tr.scrollIntoView({ behavior: "smooth", block: "center" }); }
            tr.classList.add("row-flash");
            setTimeout(function () { tr.classList.remove("row-flash"); }, 1200);
            return true;
        }
        // The same sheet can be edited in two places: the table and the selected-sheet
        // detail card. Both write the one shared feature.properties; these mirror a fresh
        // value into the OTHER view's DOM so they never drift (skips the field being typed
        // in, to avoid stealing focus/cursor).
        function attrEsc(s) { return String(s).replace(/[\\"]/g, "\\$&"); }
        function mirrorToDetail(feature, key, value) {
            if (feature !== selectedFeature) { return; }
            try {
                var d = props.querySelector('[data-key="' + attrEsc(key) + '"]');
                if (d && d !== document.activeElement) { d.value = value; }
            } catch (e) { /* ignore odd keys */ }
        }
        function mirrorToTable(feature, key, value) {
            if (!tableEl) { return; }
            var idx = (geojson.features || []).indexOf(feature);
            if (idx < 0) { return; }
            try {
                if (key === "SHEET") {
                    var row = tableEl.querySelector('tr[data-row="' + idx + '"]');
                    var cell = row && row.querySelector("td.sheet-cell");
                    if (cell) { cell.textContent = value || "—"; }
                } else {
                    var t = tableEl.querySelector('input[data-row="' + idx + '"][data-key="' + attrEsc(key) + '"]');
                    if (t && t !== document.activeElement) { t.value = value; }
                }
            } catch (e) { /* ignore odd keys */ }
        }
        function renderTable() {
            if (!tableEl) { return; }
            var feats = geojson.features || [];
            if (!feats.length) { tableEl.innerHTML = '<p class="hint" style="padding:8px">Zatím žádné listy.</p>'; return; }
            var keys = fieldKeys();
            var thead = '<thead><tr><th class="loc-col" title="Ukázat na mapě"></th>' + keys.map(function (k) {
                var fill = k === "SHEET" ? "" :
                    '<button type="button" class="colbtn" data-cfill="' + esc(k) + '" title="Vyplnit celý sloupec">⤓</button>' +
                    '<button type="button" class="colbtn" data-cclear="' + esc(k) + '" title="Vymazat celý sloupec">✕</button>';
                return '<th><div class="cbar"><span class="cn">' + esc(k) + '</span>' + fill + '</div></th>';
            }).join("") + '</tr></thead>';
            var rows = feats.map(function (f, i) {
                var p = f.properties || (f.properties = {});
                var selCls = (f === selectedFeature) ? ' class="sel-row"' : '';
                // narrow first column: a locate icon is the click target (SHEET isn't
                // always first, and clicking mid-table felt odd)
                var locCell = '<td class="loc-cell"><a class="rowsel" data-row="' + i + '" title="Ukázat na mapě"><i class="fas fa-crosshairs"></i></a></td>';
                return '<tr data-row="' + i + '"' + selCls + '>' + locCell + keys.map(function (k) {
                    var val = p[k] == null ? "" : String(p[k]);
                    if (k === "SHEET") {
                        return '<td class="sheet-cell">' + (esc(val) || "—") + '</td>';
                    }
                    return '<td><input type="text" data-row="' + i + '" data-key="' + esc(k) + '" value="' + esc(val) + '"/></td>';
                }).join("") + '</tr>';
            }).join("");
            tableEl.innerHTML = '<table class="sheet-table">' + thead + '<tbody>' + rows + '</tbody></table>';

            tableEl.querySelectorAll("input[data-key]").forEach(function (el) {
                el.addEventListener("input", function () {
                    var f = feats[parseInt(el.getAttribute("data-row"), 10)];
                    if (!f) { return; }
                    var key = el.getAttribute("data-key");
                    (f.properties || (f.properties = {}))[key] = el.value;
                    mirrorToDetail(f, key, el.value);
                });
            });
            tableEl.querySelectorAll("a.rowsel").forEach(function (a) {
                a.addEventListener("click", function () {
                    var f = feats[parseInt(a.getAttribute("data-row"), 10)], lyr = f && layerOf.get(f);
                    if (f && lyr) {
                        selectFeature(f, lyr);
                        try { map.fitBounds(lyr.getBounds(), { maxZoom: 12 }); } catch (e) { /* ignore */ }
                        var mp = document.getElementById("map");   // bring the map into view after picking a row
                        if (mp && mp.scrollIntoView) { mp.scrollIntoView({ behavior: "smooth", block: "center" }); }
                    }
                });
            });
            tableEl.querySelectorAll("[data-cfill]").forEach(function (b) {
                b.addEventListener("click", function () {
                    var k = b.getAttribute("data-cfill");
                    var v = prompt('Vyplnit sloupec "' + k + '" hodnotou (do všech listů):', "");
                    if (v === null) { return; }
                    pushHistory();
                    feats.forEach(function (f) { (f.properties || (f.properties = {}))[k] = v; });
                    renderTable(); if (selectedFeature) { renderEditor(selectedFeature); }
                });
            });
            tableEl.querySelectorAll("[data-cclear]").forEach(function (b) {
                b.addEventListener("click", function () {
                    var k = b.getAttribute("data-cclear");
                    if (!confirm('Vymazat hodnoty ve sloupci "' + k + '" u všech listů?')) { return; }
                    pushHistory();
                    feats.forEach(function (f) { if (f.properties) { f.properties[k] = ""; } });
                    renderTable(); if (selectedFeature) { renderEditor(selectedFeature); }
                });
            });
        }
        // ---- property editor of selected sheet ----
        function renderEditor(feature) {
            var p = feature.properties || (feature.properties = {});
            var html = '<h5>List: <span class="sel">' + esc(p.SHEET || p.TITLE || "—") + '</span>' +
                ' <button id="locateSheetBtn" class="btn btn-xs btn-default">Ukázat na mapě ↑</button>' +
                ' <button id="delSheetBtn" class="btn btn-xs btn-danger">Smazat list</button></h5>';
            html += '<div class="attr-grid">';
            fieldKeys().forEach(function (key) {
                var val = p[key] == null ? "" : String(p[key]);
                var big = val.length > 40;
                html += '<div class="prop-row"><label>' + esc(key) + '</label>';
                html += big
                    ? '<textarea rows="2" data-key="' + esc(key) + '">' + esc(val) + '</textarea>'
                    : '<input type="text" data-key="' + esc(key) + '" value="' + esc(val) + '"/>';
                html += '</div>';
            });
            html += '</div>';
            var crsRow = window.proj4
                ? '<div class="prop-row" style="margin-top:8px"><label>Souřadnicový systém</label>' +
                    '<select id="cCrs" style="width:auto">' +
                      '<option value="EPSG:4326">WGS84 — zeměpisné ° (šířka/délka)</option>' +
                      '<option value="EPSG:5514">S-JTSK / Křovák — X/Y (m)</option>' +
                    '</select></div>'
                : '';
            html += '<div id="coordBox" class="coords">' + crsRow +
                '<div class="hint" style="margin-top:6px">Dva protilehlé rohy + úhel (přesné umístění):</div>' +
                '<div class="prop-row"><label id="cLabA">Roh 1 (šířka° / délka°)</label>' +
                    '<input type="number" step="any" id="cA1" style="width:48%"/> ' +
                    '<input type="number" step="any" id="cA2" style="width:48%"/></div>' +
                '<div class="prop-row"><label id="cLabC">Roh 2 — protilehlý (šířka° / délka°)</label>' +
                    '<input type="number" step="any" id="cC1" style="width:48%"/> ' +
                    '<input type="number" step="any" id="cC2" style="width:48%"/></div>' +
                '<div class="prop-row"><label>Úhel (°)</label>' +
                    '<input type="number" step="any" id="cAng" style="width:48%"/></div>' +
                '</div>';
            props.innerHTML = html;
            var db = document.getElementById("delSheetBtn");
            if (db) { db.addEventListener("click", deleteSelected); }
            var lb = document.getElementById("locateSheetBtn");
            if (lb) {
                lb.addEventListener("click", function () {
                    if (selectedLayer) { try { map.fitBounds(selectedLayer.getBounds(), { maxZoom: 13 }); } catch (e) { /* ignore */ } }
                    var mp = document.getElementById("map");
                    if (mp && mp.scrollIntoView) { mp.scrollIntoView({ behavior: "smooth", block: "center" }); }
                });
            }
            props.querySelectorAll("[data-key]").forEach(function (el) {
                el.addEventListener("input", function () {
                    var key = el.getAttribute("data-key");
                    feature.properties[key] = el.value;
                    if (key === "SHEET" && selectedLayer) {
                        var t = selectedLayer.getTooltip(); if (t) { t.setContent(String(el.value)); }
                    }
                    mirrorToTable(feature, key, el.value);
                });
            });
            var crsSel = document.getElementById("cCrs");
            if (crsSel) {
                crsSel.value = coordCrs;
                crsSel.addEventListener("change", function () {
                    coordCrs = crsSel.value; relabelCoord(); updateCoordInputs();
                });
            }
            ["cA1", "cA2", "cC1", "cC2"].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) { el.addEventListener("change", function () { pushHistory(); applyCornerEdit(); }); }
            });
            var angEl = document.getElementById("cAng");
            if (angEl) { angEl.addEventListener("change", function () { pushHistory(); applyAngleEdit(); }); }
            relabelCoord();
            updateCoordInputs();
        }
        function relabelCoord() {
            var proj = coordCrs !== "EPSG:4326";
            var la = document.getElementById("cLabA"), lc = document.getElementById("cLabC");
            if (la) { la.textContent = proj ? "Roh 1 (X / Y v m)" : "Roh 1 (šířka° / délka°)"; }
            if (lc) { lc.textContent = proj ? "Roh 2 — protilehlý (X / Y v m)" : "Roh 2 — protilehlý (šířka° / délka°)"; }
        }

        // ---- selection + rectangle handles ----
        function clearHandles() { handles.forEach(function (m) { map.removeLayer(m); }); handles = []; }

        // After any drag: stop flag, reposition the sheet-number labels, refresh coord inputs.
        function endDrag() { isDragging = false; updateLabels(); updateCoordInputs(); }

        // ---- editable coordinates of the selected sheet (two opposite corners + angle) ----
        function cornerLatLng(sx, sy) { return map.options.crs.unproject(cornerPt(selRect, sx, sy)); }
        function setCoord(id, v) {
            var el = document.getElementById(id);
            if (el && document.activeElement !== el) { el.value = Math.round(v * 1e6) / 1e6; }
        }
        function coordNum(id) { var el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; }
        function updateCoordInputs() {
            if (!selectedFeature || !selRect || !document.getElementById("coordBox")) { return; }
            var da = llToDisplay(cornerLatLng(-1, -1)), dc = llToDisplay(cornerLatLng(1, 1));
            setCoord("cA1", da[0]); setCoord("cA2", da[1]);
            setCoord("cC1", dc[0]); setCoord("cC2", dc[1]);
            setCoord("cAng", selRect.angle * 180 / Math.PI);
        }
        // Editing a corner = same as dragging it: keep the current angle, recompute
        // centre/width/height from the two opposite corners.
        function applyCornerEdit() {
            if (!selectedFeature || !selRect) { return; }
            var a1 = coordNum("cA1"), a2 = coordNum("cA2"), c1 = coordNum("cC1"), c2 = coordNum("cC2");
            if ([a1, a2, c1, c2].some(isNaN)) { return; }
            var A = projLL(displayToLL(a1, a2)), C = projLL(displayToLL(c1, c2));
            var ax = axes(selRect.angle), dx = C.x - A.x, dy = C.y - A.y;
            selRect.cx = (A.x + C.x) / 2; selRect.cy = (A.y + C.y) / 2;
            selRect.w = Math.max(1, Math.abs(dx * ax.ux.x + dy * ax.ux.y));
            selRect.h = Math.max(1, Math.abs(dx * ax.uy.x + dy * ax.uy.y));
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles(); updateLabels(); updateCoordInputs();
        }
        // Editing the angle = rotate the sheet in place around its centre (keep size).
        function applyAngleEdit() {
            if (!selectedFeature || !selRect) { return; }
            var deg = coordNum("cAng"); if (isNaN(deg)) { return; }
            selRect.angle = deg * Math.PI / 180;
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles(); updateLabels(); updateCoordInputs();
        }

        function deselect() {
            if (selectedLayer) { selectedLayer.setStyle(baseStyle); }
            selectedFeature = null; selectedLayer = null; selRect = null;
            clearHandles();
            notifySelect(null);
        }
        function selectFeature(feature, layer) {
            deselect();
            selectedFeature = feature; selectedLayer = layer;
            layer.setStyle(selStyle);
            clearGhosts();
            selRect = rectFromFeature(feature);
            applyRect(feature, selRect, layer);   // snap this sheet to a clean rectangle
            renderEditor(feature);
            showHandles();
            highlightTableRow();
            notifySelect(feature);
        }
        function showHandles() {
            clearHandles();
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (sgn) {
                var pt = cornerPt(selRect, sgn[0], sgn[1]);
                var m = L.marker(map.options.crs.unproject(pt), { draggable: true, icon: vertexIcon });
                m._sgn = sgn;
                m.on("dragstart", function () { pushHistory(); isDragging = true; clearGhosts(); });
                m.on("drag", function () { resizeByCorner(m); });
                m.on("dragend", endDrag);
                m.addTo(map); handles.push(m);
            });
            // edge handles (resize one dimension by dragging a side)
            [{ axisKey: "ux", sign: 1 }, { axisKey: "ux", sign: -1 },
             { axisKey: "uy", sign: 1 }, { axisKey: "uy", sign: -1 }].forEach(function (e) {
                var em = L.marker(map.options.crs.unproject(edgeMidPt(selRect, e.axisKey, e.sign)),
                    { draggable: true, icon: edgeIcon });
                em._edge = e;
                em.on("dragstart", function () { pushHistory(); isDragging = true; clearGhosts(); });
                em.on("drag", function () { resizeByEdge(em); });
                em.on("dragend", endDrag);
                em.addTo(map); handles.push(em);
            });
            // move handle (drag the whole rectangle)
            var mm = L.marker(map.options.crs.unproject(L.point(selRect.cx, selRect.cy)),
                { draggable: true, icon: moveIcon });
            mm._move = true;
            mm.on("dragstart", function () { pushHistory(); isDragging = true; clearGhosts(); });
            mm.on("drag", function () { moveByCenter(mm); });
            mm.on("dragend", endDrag);
            mm.addTo(map); handles.push(mm);
            // rotation handle above the edge that is on top on the screen: a sheet stored
            // "upside down" (angle ~180°) gets it on its other side, the data stay as they are
            var rm = L.marker(map.options.crs.unproject(rotPt(selRect, rotSide(selRect))), { draggable: true, icon: rotIcon });
            rm._side = rotSide(selRect);
            rm.on("dragstart", function () { pushHistory(); isDragging = true; clearGhosts(); });
            rm.on("drag", function () { rotateByHandle(rm); });
            rm.on("dragend", endDrag);
            rm.addTo(map); handles.push(rm); rm._rot = true;
        }
        function rotSide(rc) { return axes(rc.angle).uy.y >= 0 ? 1 : -1; }  // projected y grows to the north
        function rotPt(rc, side) {
            var A = axes(rc.angle), d = side * rc.h / 2 * 1.4;
            return L.point(rc.cx + A.uy.x * d, rc.cy + A.uy.y * d);
        }
        function edgeMidPt(rc, axisKey, sign) {
            var A = axes(rc.angle), ax = axisKey === "ux" ? A.ux : A.uy, ext = axisKey === "ux" ? rc.w : rc.h;
            return L.point(rc.cx + ax.x * sign * ext / 2, rc.cy + ax.y * sign * ext / 2);
        }
        function repositionHandles() {
            handles.forEach(function (m) {
                if (m._rot) {
                    m.setLatLng(map.options.crs.unproject(rotPt(selRect, m._side)));
                } else if (m._move) {
                    m.setLatLng(map.options.crs.unproject(L.point(selRect.cx, selRect.cy)));
                } else if (m._edge) {
                    m.setLatLng(map.options.crs.unproject(edgeMidPt(selRect, m._edge.axisKey, m._edge.sign)));
                } else {
                    m.setLatLng(map.options.crs.unproject(cornerPt(selRect, m._sgn[0], m._sgn[1])));
                }
            });
        }
        function resizeByCorner(m) {
            var opp = cornerPt(selRect, -m._sgn[0], -m._sgn[1]);
            var P = projLL(m.getLatLng());
            var A = axes(selRect.angle);
            var vx = P.x - opp.x, vy = P.y - opp.y;
            var along = vx * A.ux.x + vy * A.ux.y;
            var perp = vx * A.uy.x + vy * A.uy.y;
            selRect.w = Math.max(1, Math.abs(along));
            selRect.h = Math.max(1, Math.abs(perp));
            selRect.cx = (opp.x + P.x) / 2; selRect.cy = (opp.y + P.y) / 2;
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles();
        }
        function rotateByHandle(m) {
            var P = projLL(m.getLatLng());
            var dx = P.x - selRect.cx, dy = P.y - selRect.cy;
            var a = Math.atan2(-dx, dy) + (m._side < 0 ? Math.PI : 0);
            if (snapKey) { var step = Math.PI / 12; a = Math.round(a / step) * step; }
            selRect.angle = a;
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles();
        }
        function resizeByEdge(m) {
            var e = m._edge, A = axes(selRect.angle), ax = e.axisKey === "ux" ? A.ux : A.uy;
            var ext = e.axisKey === "ux" ? selRect.w : selRect.h;
            var opp = L.point(selRect.cx - e.sign * ax.x * ext / 2, selRect.cy - e.sign * ax.y * ext / 2);
            var P = projLL(m.getLatLng());
            var d = (P.x - opp.x) * ax.x + (P.y - opp.y) * ax.y;
            var newExt = Math.max(1, Math.abs(d));
            if (e.axisKey === "ux") { selRect.w = newExt; } else { selRect.h = newExt; }
            selRect.cx = opp.x + ax.x * d / 2; selRect.cy = opp.y + ax.y * d / 2;
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles();
        }
        function moveByCenter(m) {
            var P = projLL(m.getLatLng());
            selRect.cx = P.x; selRect.cy = P.y;
            applyRect(selectedFeature, selRect, selectedLayer);
            repositionHandles();
        }
        function deleteSelected() {
            if (!selectedFeature) { return; }
            if (!confirm("Smazat tento list?")) { return; }
            pushHistory();
            var idx = geojson.features.indexOf(selectedFeature);
            if (idx >= 0) { geojson.features.splice(idx, 1); }
            deselect();
            loadGeojson(geojson, false);
        }

        // ---- neighbour ghosts ("+") along the rectangle's own axes ----
        function scheduleClearGhosts() { if (ghostTimer) { clearTimeout(ghostTimer); } ghostTimer = setTimeout(clearGhosts, 180); }
        function clearGhosts() { if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = null; } ghostLayer.clearLayers(); }
        function showGhosts(feature) {
            if (isDragging) { return; }
            clearGhosts();
            var rc = rectFromFeature(feature), A = axes(rc.angle);
            // ux+ = east (column +1), uy+ = north (row -1)
            var moves = [
                { dir: A.ux, dist: rc.w, dRow: 0, dCol: 1 }, { dir: A.ux, dist: -rc.w, dRow: 0, dCol: -1 },
                { dir: A.uy, dist: rc.h, dRow: -1, dCol: 0 }, { dir: A.uy, dist: -rc.h, dRow: 1, dCol: 0 }
            ];
            moves.forEach(function (mv) {
                var dir = mv.dir, dist = mv.dist;
                var nc = { cx: rc.cx + dir.x * dist, cy: rc.cy + dir.y * dist, w: rc.w, h: rc.h, angle: rc.angle };
                var cll = map.options.crs.unproject(L.point(nc.cx, nc.cy));
                if (occupied(cll.lng, cll.lat)) { return; }
                var poly = L.polygon(ringFromRect(nc).map(function (c) { return [c[1], c[0]]; }),
                    { color: "#2e7d32", weight: 1, dashArray: "4,4", fillColor: "#2e7d32", fillOpacity: 0.12 });
                var plus = L.marker(cll, { icon: plusIcon });
                function keep() { if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = null; } }
                function make() { createSheetAtRect(nc, feature, mv.dRow, mv.dCol); }
                poly.on("mouseover", keep); poly.on("mouseout", scheduleClearGhosts); poly.on("click", make);
                plus.on("mouseover", keep); plus.on("mouseout", scheduleClearGhosts); plus.on("click", make);
                ghostLayer.addLayer(poly); ghostLayer.addLayer(plus);
            });
        }
        function createSheetAtRect(nc, src, dRow, dCol) {
            pushHistory(); clearGhosts();
            var props = newProps();
            var ps = src ? parseSheet((src.properties || {}).SHEET) : null;
            if (ps) {                                   // number the neighbour by row/col (XXYY)
                var no = formatSheet(ps.row + (dRow || 0), ps.col + (dCol || 0), ps.w);
                props.SHEET = sheetExists(no) ? String(nextSheetNumber()) : no;
            }
            var f = { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ringFromRect(nc)] } };
            geojson.features.push(f);
            loadGeojson(geojson, false);
            var lyr = layerOf.get(f); if (lyr) { selectFeature(f, lyr); }
        }

        // ---- (re)render whole collection ----
        function loadGeojson(data, fit) {
            geojson = data;
            deselect(); clearGhosts();
            layerOf = new Map();
            if (gridLayer) { map.removeLayer(gridLayer); }
            gridLayer = L.geoJSON(data, {
                style: function () { return baseStyle; },
                onEachFeature: function (feature, lyr) {
                    layerOf.set(feature, lyr);
                    lyr.on("click", function () { selectFeature(feature, lyr); });
                    lyr.on("mouseover", function () { showGhosts(feature); });
                    lyr.on("mouseout", scheduleClearGhosts);
                }
            }).addTo(map);
            var count = (data.features || []).length;
            if (fit && count) { try { map.fitBounds(gridLayer.getBounds()); } catch (e) { /* ignore */ } }
            var gridSub = document.getElementById("gridSub");
            if (gridSub) {
                gridSub.textContent = count ? "— " + count + " listů" : "— nakreslete na mapě nebo nahrajte soubor";
            }
            props.innerHTML = count
                ? '<p class="hint">Klikněte na list na mapě — jeho údaje, souřadnice a rotace se ukážou tady a půjdou upravit.</p>'
                : '<p class="hint">Zatím žádné listy — vytvořte první obdélník, nebo vygenerujte mřížku (panel vpravo).</p>';
            updateLabels();
            renderColumns();
            renderTable();
        }

        function updateLabels() {
            if (!gridLayer) { return; }
            var z = map.getZoom(), mb = map.getBounds();
            // font grows with zoom
            var cls = z >= 12 ? "sheet-label sheet-label-lg" : z >= 10 ? "sheet-label sheet-label-md" : "sheet-label";
            var used = {}, shown = 0;    // pixel-bucket declutter: at most one label per LABEL_SPACING cell
            gridLayer.eachLayer(function (lyr) {
                function hide() { if (lyr.getTooltip()) { lyr.unbindTooltip(); } }
                if (!lyr.getBounds || !lyr.feature) { return; }
                var label = (lyr.feature.properties || {}).SHEET;
                if (!label || !mb.intersects(lyr.getBounds()) || shown >= LABEL_CAP) { return hide(); }
                var pt = map.latLngToContainerPoint(lyr.getBounds().getCenter());
                var key = Math.floor(pt.x / LABEL_SPACING) + ":" + Math.floor(pt.y / LABEL_SPACING);
                if (used[key]) { return hide(); }
                used[key] = true; shown++;
                var tt = lyr.getTooltip();
                if (tt && tt.options.className !== cls) { lyr.unbindTooltip(); tt = null; }
                if (!tt) { lyr.bindTooltip(String(label), { permanent: true, direction: "center", className: cls }); }
                lyr.openTooltip();
            });
        }

        // ---- create: one unified tool — pick an area (drag OR click-click), then
        //      fill it with a rows×cols grid (1×1 = a single sheet). ----
        document.getElementById("pickBtn").addEventListener("click", function () {
            document.getElementById("pickStatus").textContent = "táhněte myší nebo klikněte na dva rohy…";
            pickArea(function (bounds) {
                document.getElementById("pickStatus").textContent = "";
                var rows = parseInt(document.getElementById("rows").value, 10) || 1;
                var cols = parseInt(document.getElementById("cols").value, 10) || 1;
                generateGrid(bounds, Math.max(1, rows), Math.max(1, cols));
            });
        });

        function generateGrid(bounds, rows, cols) {
            if (rows === 1 && cols === 1) {           // single sheet appended + selected
                pushHistory();
                var sw = projLL(bounds.getSouthWest()), ne = projLL(bounds.getNorthEast());
                var rc = { cx: (sw.x + ne.x) / 2, cy: (sw.y + ne.y) / 2,
                    w: Math.abs(ne.x - sw.x), h: Math.abs(ne.y - sw.y), angle: 0 };
                var f = { type: "Feature", properties: newProps(), geometry: { type: "Polygon", coordinates: [ringFromRect(rc)] } };
                geojson.features.push(f); loadGeojson(geojson, false);
                var lyr = layerOf.get(f); if (lyr) { selectFeature(f, lyr); }
                return;
            }
            var feats = (geojson.features || []).slice();
            if (feats.length && confirm("Vygenerovat mřížku " + rows + "×" + cols +
                    " a NAHRADIT stávající listy?\n(Zrušit = přidat k nim.)")) {
                feats = [];
            }
            pushHistory();
            var s = bounds.getSouth(), n = bounds.getNorth(), w = bounds.getWest(), e = bounds.getEast();
            var dLat = (n - s) / rows, dLon = (e - w) / cols;
            for (var rr = 0; rr < rows; rr++) {
                for (var cc = 0; cc < cols; cc++) {
                    var top = n - rr * dLat, bot = n - (rr + 1) * dLat, lft = w + cc * dLon, rgt = w + (cc + 1) * dLon;
                    var p = newProps(); p.SHEET = formatSheet(rr + 1, cc + 1, 2); p.KOLONNE = String(cc + 1);
                    feats.push({ type: "Feature", properties: p, geometry: { type: "Polygon",
                        coordinates: [[[lft, top], [rgt, top], [rgt, bot], [lft, bot], [lft, top]]] } });
                }
            }
            loadGeojson({ type: "FeatureCollection", features: feats }, true);
        }

        // Area picker: crosshair + live preview; supports drag (down→up) AND click-click.
        function pickArea(onComplete) {
            var mapEl = map.getContainer();
            mapEl.style.cursor = "crosshair";
            map.dragging.disable();                   // don't pan the map while picking
            var downLL = null, firstLL = null, preview = null, moved = false;
            function draw(a, b) {
                var bb = L.latLngBounds(a, b);
                if (preview) { preview.setBounds(bb); }
                else { preview = L.rectangle(bb, { color: "#b23a2e", weight: 1, dashArray: "4,4", fillOpacity: 0.1 }).addTo(map); }
            }
            function cleanup() {
                map.off("mousedown", onDown); map.off("mousemove", onMove); map.off("mouseup", onUp);
                map.dragging.enable();
                if (preview) { map.removeLayer(preview); }
                mapEl.style.cursor = "";
            }
            function done(a, b) { cleanup(); onComplete(L.latLngBounds(a, b)); }
            function onDown(ev) { downLL = ev.latlng; moved = false; }
            function onMove(ev) {
                if (downLL) { moved = true; draw(downLL, ev.latlng); }   // dragging out an area
                else if (firstLL) { draw(firstLL, ev.latlng); }          // click-click: preview to cursor
            }
            function onUp(ev) {
                if (downLL && moved) { done(downLL, ev.latlng); return; } // drag select
                if (!firstLL) { firstLL = downLL || ev.latlng; }          // first click = first corner
                else { done(firstLL, ev.latlng); return; }                // second click = done
                downLL = null; moved = false;
            }
            map.on("mousedown", onDown); map.on("mousemove", onMove); map.on("mouseup", onUp);
        }

        // ---- keys: undo + axis/rotation snap ----
        window.addEventListener("keydown", function (e) {
            snapKey = e.shiftKey || e.ctrlKey;
            var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""));
            if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); }
            else if (!typing && (e.key === "Delete" || e.key === "Backspace") && selectedFeature) { e.preventDefault(); deleteSelected(); }
        });
        window.addEventListener("keyup", function (e) { snapKey = e.shiftKey || e.ctrlKey; });
        var undoBtn = document.getElementById("undoBtn");
        if (undoBtn) { undoBtn.addEventListener("click", undo); }

        loadGeojson(geojson, true);

        return {
            getGeojson: function () { return geojson; },
            setGeojson: function (data) {
                pushHistory();
                loadGeojson((data && data.type) ? data : { type: "FeatureCollection", features: [] }, true);
            },
            hasFeatures: function () { return (geojson.features || []).length > 0; },
            hasSelected: function () { return !!selectedFeature; },
            mountTable: mountTable,
            scrollToSelectedRow: scrollToSelectedRow,
            suggestColumns: function (list) { suggested = Array.isArray(list) ? list : []; renderColumns(); },
            invalidateSize: function () {
                setTimeout(function () {
                    map.invalidateSize();
                    if (gridLayer && (geojson.features || []).length) {
                        try { map.fitBounds(gridLayer.getBounds()); } catch (e) { /* ignore */ }
                    }
                }, 60);
            }
        };
    }

    return { init: init };
})();
