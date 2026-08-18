/**
 * Reusable MARC21 cataloguing-template editor: a raw text editor with a live
 * structured preview and inline syntax-error highlighting. Extracted from the old
 * standalone template page so it can be embedded inline in the series workspace.
 *
 * Expects this HTML to already exist on the page:
 *   #tplText #tplBackdrop #synMsg #preview #fieldCount
 *
 * Usage:  var api = TemplateEditor.init({ initialText: "..." });
 *         api.getText();   // current template text
 *         api.setText(s);  // replace + re-render
 *         api.isValid();   // no invalid JSON block
 */
window.TemplateEditor = (function () {
    function init(opts) {
        opts = opts || {};
        var ta = document.getElementById("tplText");
        var backdrop = document.getElementById("tplBackdrop");
        var synMsg = document.getElementById("synMsg");
        var preview = document.getElementById("preview");
        var counter = document.getElementById("fieldCount");

        if (typeof opts.initialText === "string") { ta.value = opts.initialText; }

        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
        }

        // Mirror the catalogue's parser: the smallest brace span that JSON-parses is a field.
        // Also report the first "{" that never parses = a syntax error to highlight.
        function scan(text) {
            var blocks = [], n = text.length, cursor = 0, bad = -1;
            for (var i = 0; i < n; i++) {
                if (i < cursor || text.charAt(i) !== "{") { continue; }
                var ok = false;
                for (var j = i + 1; j < n; j++) {
                    if (text.charAt(j) !== "}") { continue; }
                    try {
                        var obj = JSON.parse(text.slice(i, j + 1));
                        blocks.push({ obj: obj, start: i });
                        cursor = j + 1; i = j; ok = true; break;
                    } catch (e) { /* not complete yet — widen to next } */ }
                }
                if (!ok && bad < 0) { bad = i; }
            }
            return { blocks: blocks, bad: bad };
        }
        function lineOf(text, idx) {
            var line = 1;
            for (var k = 0; k < idx; k++) { if (text.charAt(k) === "\n") { line++; } }
            return line;
        }
        // Paint the offending block (from its "{" to the end of its line) red behind the textarea.
        function paintError(text, bad) {
            if (bad < 0) {
                backdrop.textContent = "";
                ta.classList.remove("bad");
                synMsg.className = "hint ok";
                synMsg.textContent = "✓ syntaxe v pořádku";
                return;
            }
            var eol = text.indexOf("\n", bad);
            if (eol < 0) { eol = text.length; }
            backdrop.innerHTML = esc(text.slice(0, bad)) +
                "<mark>" + esc(text.slice(bad, eol)) + "</mark>" + esc(text.slice(eol));
            backdrop.scrollTop = ta.scrollTop; backdrop.scrollLeft = ta.scrollLeft;
            ta.classList.add("bad");
            synMsg.className = "hint err";
            synMsg.textContent = "⚠ neplatný blok na řádku " + lineOf(text, bad);
        }
        ta.addEventListener("scroll", function () {
            backdrop.scrollTop = ta.scrollTop; backdrop.scrollLeft = ta.scrollLeft;
        });

        // Record-start tags: a MARC tag (LDR/FMT/3 digits) at the very start of a line.
        function tagIndex(text) {
            var re = /^(LDR|FMT|\d{3})/gm, m, out = [];
            while ((m = re.exec(text)) !== null) { out.push({ pos: m.index, tag: m[1] }); }
            return out;
        }
        function tagFor(tags, pos) {
            var t = "";
            for (var i = 0; i < tags.length; i++) { if (tags[i].pos <= pos) { t = tags[i].tag; } else { break; } }
            return t;
        }

        function optText(v) {
            if (v === null || v === undefined) { return ""; }
            if (typeof v === "object") { return JSON.stringify(v); }
            return String(v);
        }
        function renderOpts(arr) {
            if (!arr || !arr.length) { return ""; }
            var shown = arr.slice(0, 8).map(function (v) { return esc(optText(v)); });
            var extra = arr.length > 8 ? ' <span class="more">… +' + (arr.length - 8) + "</span>" : "";
            return shown.join(" · ") + extra;
        }

        function classify(o) {
            var ro = o.enabled === false;
            if (o.values !== undefined) { return { type: "Rozbalovačka", detail: "", opts: o.values, ro: ro }; }
            if (o.valuesByBaseIndex !== undefined) { return { type: "Podle pole „" + (o.base || "") + "\"", detail: "", opts: o.valuesByBaseIndex, ro: ro }; }
            if (o.value !== undefined) {
                var v = o.value;
                if (v && typeof v === "object") {
                    if (v.attr) { return { type: "Z listu", detail: v.attr, opts: null, ro: true }; }
                    if (v.formatFunction) { return { type: "Dopočítané", detail: v.formatFunction, opts: null, ro: true }; }
                }
                return { type: "Pevná hodnota", detail: optText(v), opts: null, ro: ro };
            }
            if (o.attr) { return { type: "Z listu", detail: o.attr, opts: null, ro: true }; }
            if (o.base) { return { type: "Podle pole „" + o.base + "\"", detail: "", opts: null, ro: ro }; }
            return { type: "Volný text", detail: o.id || "", opts: null, ro: ro };
        }

        function render() {
            var text = ta.value;
            var tags = tagIndex(text);
            var res = scan(text);
            var blocks = res.blocks;
            paintError(text, res.bad);
            var rows = "";
            blocks.forEach(function (b) {
                var c = classify(b.obj);
                var tag = tagFor(tags, b.start) || "—";
                rows += "<tr>" +
                    '<td class="tpl-tag">' + esc(tag) + "</td>" +
                    "<td>" + esc(b.obj.title || b.obj.id || "") + "</td>" +
                    '<td class="tpl-type' + (c.ro ? " ro" : "") + '">' + esc(c.type) +
                        (c.ro ? '<span class="badge-ro">jen náhled</span>' : "") + "</td>" +
                    '<td class="tpl-detail">' + esc(c.detail || "") + "</td>" +
                    '<td class="tpl-opts">' + renderOpts(c.opts) + "</td>" +
                    "</tr>";
            });
            counter.textContent = "(" + blocks.length + " polí)";
            if (!rows) {
                preview.innerHTML = '<p class="hint">Žádná editovatelná pole (šablona neobsahuje bloky „{ … }\").</p>';
                return;
            }
            preview.innerHTML = '<table><thead><tr>' +
                "<th>MARC</th><th>Pole</th><th>Typ</th><th>Zdroj / hodnota</th><th>Nabídka</th>" +
                "</tr></thead><tbody>" + rows + "</tbody></table>";
        }

        var timer = null;
        ta.addEventListener("input", function () {
            if (timer) { clearTimeout(timer); }
            timer = setTimeout(render, 200);
        });
        render();

        return {
            getText: function () { return ta.value; },
            setText: function (t) { ta.value = t == null ? "" : t; render(); },
            isValid: function () { return scan(ta.value).bad < 0; }
        };
    }

    return { init: init };
})();
