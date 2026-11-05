/**
 * A small read-only preview of a grid (klad listů) next to a grid choice: the
 * sheets drawn on a map, how many there are and what their numbers look like,
 * so that it is clear the right grid was chosen.
 *
 * Usage: GridPreview.bind(selectElement, containerElement);
 * Needs Leaflet on the page.
 */
window.GridPreview = (function () {
    function bind(select, container) {
        container.innerHTML = '<div class="gp-map"></div><div class="gp-info hint"></div>';
        var mapEl = container.querySelector(".gp-map"), info = container.querySelector(".gp-info");
        var map = null, layer = null, seq = 0;

        function show() {
            var name = select.value, my = ++seq;
            if (!name) {
                container.style.display = "none";
                return;
            }
            container.style.display = "";
            info.textContent = "Načítám mřížku…";
            fetch("/admin/grids/data?name=" + encodeURIComponent(name))
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (gj) {
                    if (my !== seq) { return; }
                    if (!gj || !gj.features) { info.textContent = "Mřížku se nepodařilo načíst."; return; }
                    if (!map) {
                        map = L.map(mapEl, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
                        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12 }).addTo(map);
                    }
                    if (layer) { map.removeLayer(layer); }
                    layer = L.geoJSON(gj, { style: { color: "#3388ff", weight: 1, fillOpacity: 0.08 } }).addTo(map);
                    map.invalidateSize();
                    try { map.fitBounds(layer.getBounds(), { padding: [6, 6] }); } catch (e) { /* empty grid */ }
                    var ids = gj.features.map(function (f) { return (f.properties || {}).SHEET; })
                        .filter(function (v) { return v !== undefined && v !== null && v !== ""; });
                    info.textContent = gj.features.length + " listů" +
                        (ids.length ? " · čísla listů v mřížce vypadají takto: " + ids.slice(0, 4).join(", ") + (ids.length > 4 ? " …" : "") : "");
                    container.setAttribute("data-sample-ids", ids.slice(0, 50).join("|"));
                    container.dispatchEvent(new Event("gridloaded"));
                })
                .catch(function () { if (my === seq) { info.textContent = "Mřížku se nepodařilo načíst."; } });
        }
        select.addEventListener("change", show);
        show();
    }
    return { bind: bind };
})();
