/**
 * Form view of a MARC21 cataloguing template: what catalogers choose from,
 * edited without touching the template text or its JSON.
 *
 *  - A "controlling" field (e.g. the corporation in 110) and the fields that
 *    follow it ("base"/"valuesByBaseIndex": 008 codes, $7, 245 $c, 264, 710…)
 *    are one table: a row per option, a column per linked field. Rows can be
 *    added, removed and moved and all linked fields move with them, so the
 *    positions can no longer get out of step.
 *  - Corporations (110 $a, 710 $a) are picked from the national authority
 *    file: the heading, its $7 code and the indicator are written together.
 *  - Other drop-downs ("values") are plain lists.
 *  - Empty or suspicious cells are marked with the reason.
 *
 * Only the edited JSON blocks are rewritten; the rest of the text stays as is.
 *
 * Usage: var api = TemplateForm.init({ container: el, getText: fn, setText: fn });
 *        api.refresh();   // re-read the text (after it was edited elsewhere)
 */
window.TemplateForm = (function () {

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    // ---------- reading the template ----------

    // Same rule as the catalogue: the smallest brace span that parses as JSON is a block.
    function scan(text) {
        var blocks = [], n = text.length, cursor = 0;
        for (var i = 0; i < n; i++) {
            if (i < cursor || text.charAt(i) !== "{") { continue; }
            for (var j = i + 1; j < n; j++) {
                if (text.charAt(j) !== "}") { continue; }
                try {
                    var obj = JSON.parse(text.slice(i, j + 1));
                    blocks.push({ obj: obj, start: i, end: j + 1 });
                    cursor = j + 1; i = j; break;
                } catch (e) { /* not complete yet */ }
            }
        }
        return blocks;
    }

    // Where each block sits: its MARC field (a line start outside any block),
    // tag, subfield ($$x before it) and offset in the field (3 = first indicator).
    function describe(text, blocks) {
        var starts = [];
        for (var p = 0; p < text.length; p = text.indexOf("\n", p) + 1 || text.length) {
            var inside = blocks.some(function (b) { return p > b.start && p < b.end; });
            if (!inside) { starts.push(p); }
        }
        blocks.forEach(function (b) {
            var fs = -1;
            for (var i = 0; i < starts.length && starts[i] <= b.start; i++) { fs = starts[i]; }
            var before = fs >= 0 ? text.substring(fs, b.start) : "";
            var marker = before.lastIndexOf("$$");
            b.fieldStart = fs;
            b.tag = fs >= 0 ? text.substr(fs, 3) : "";
            b.subfield = marker >= 0 ? before.charAt(marker + 2) : "";
            b.offset = before.length;
        });
        return blocks;
    }

    function isPlain(v) { return typeof v === "string" || typeof v === "number"; }

    // a heading as people read it: "Německo.$$bHeer" -> "Německo. Heer"
    function readable(v) { return String(v).replace(/\$\$[a-z0-9]/g, " ").replace(/\s+/g, " ").trim(); }

    // drop-downs with a technical meaning the catalogue relies on (not offered in the form)
    var TECHNICAL = ["typ_data"];

    function build(text) {
        var blocks = describe(text, scan(text));
        var tables = [], lists = [];
        blocks.forEach(function (b, idx) {
            b.idx = idx;
            var o = b.obj;
            if (!o.id || !Array.isArray(o.values) || !o.values.every(isPlain)) { return; }
            var deps = blocks.filter(function (d) {
                return d.obj.base === o.id && Array.isArray(d.obj.valuesByBaseIndex);
            });
            if (deps.length) {
                tables.push(makeTable(b, deps));
            } else if (o.enabled !== false && TECHNICAL.indexOf(o.id) < 0 && b.subfield) {
                // (a drop-down of an indicator, e.g. 651 second indicator 7/4, is a
                // code with a fixed meaning, not an offer: only in the text)
                lists.push(b);
            }
        });
        return { blocks: blocks, tables: tables, lists: lists };
    }

    // a block that is a whole line of the record ("7101  L $$a…" inside the JSON)
    function wholeLine(b) { return b.offset === 0 && !/^\d{3}$/.test(b.tag); }

    function where(b) {
        if (wholeLine(b)) {
            var line = (b.obj.valuesByBaseIndex || b.obj.values || []).filter(Boolean)[0];
            return line ? String(line).substr(0, 3) + " (celý řádek)" : "celý řádek";
        }
        if (b.subfield) { return b.tag + " $" + b.subfield; }
        if (b.offset === 3) { return b.tag + " ind."; }
        return b.tag;
    }

    // A key of a linked field that the catalogue computes the same way:
    // tag + subfield (or indicator position) + its occurrence among the fields
    // linked to the same controlling field, e.g. "008@26#1", "245$c#0", "710ind#0".
    function columnKeys(deps) {
        var seen = {};
        return deps.map(function (d) {
            var k = d.tag + (d.subfield ? "$" + d.subfield : d.offset === 3 ? "ind" : "@" + d.offset);
            seen[k] = (seen[k] || 0) + 1;
            return k + "#" + (seen[k] - 1);
        });
    }

    function makeTable(base, deps) {
        var corp = base.tag === "110" && base.subfield === "a";
        var cols = deps.map(function (d) {
            var sameField = d.fieldStart === base.fieldStart;
            var kind = "text";
            if (corp && sameField && d.subfield === "7") { kind = "code"; }
            else if (corp && sameField && d.offset === 3) { kind = "ind"; }
            else if (d.tag.charAt(0) === "7" && d.subfield === "a") { kind = "entry"; }
            else if (d.tag.charAt(0) === "7" && d.offset === 3) { kind = "entryInd"; }
            else if (d.tag.charAt(0) === "7" || wholeLine(d)) { kind = "optional"; }
            return { block: d, kind: kind, label: d.obj.title || d.obj.id || "", where: where(d) };
        });
        var keys = columnKeys(deps);
        cols.forEach(function (c, i) { c.key = keys[i]; });
        // the indicator of an added entry belongs to the entry in the same field
        cols.forEach(function (c) {
            if (c.kind === "entry") {
                c.ind = cols.filter(function (x) {
                    return x.kind === "entryInd" && x.block.fieldStart === c.block.fieldStart;
                })[0] || null;
            }
        });
        // identities first (name, ind., $7), then the rest in template order
        var order = { ind: 0, code: 1 };
        cols.sort(function (a, b) {
            var ka = a.kind in order ? order[a.kind] : 2, kb = b.kind in order ? order[b.kind] : 2;
            return ka - kb || a.block.start - b.block.start;
        });
        return { base: base, corp: corp, cols: cols };
    }

    // ---------- writing it back ----------

    // Rewrite a block in the style of the original (indentation, "key": spacing).
    function serialize(obj, original) {
        if (original.indexOf("\n") < 0) { return JSON.stringify(obj); }
        var mi = original.match(/\{[ \t]*\n([ \t]*)"/);
        var ind = mi ? mi[1] : "    ";
        var mc = original.match(/\n([ \t]*)\}$/);
        var close = mc ? mc[1] : "";
        var sep = /"[ \t]*:[ \t]+/.test(original) ? ": " : ":";
        var keys = Object.keys(obj).map(function (k) {
            var v = obj[k], s;
            if (Array.isArray(v) && v.length > 1) {
                s = "[\n" + v.map(function (x) { return ind + "  " + JSON.stringify(x); }).join(",\n") +
                    "\n" + ind + "]";
            } else {
                s = JSON.stringify(v);
            }
            return ind + JSON.stringify(k) + sep + s;
        });
        return "{\n" + keys.join(",\n") + "\n" + close + "}";
    }

    // The [ … ] of a key in a block's text: [start, end) or null.
    function arraySpan(src, key) {
        var m = new RegExp('"' + key + '"\\s*:\\s*\\[').exec(src);
        if (!m) { return null; }
        var start = m.index + m[0].length - 1, inString = false;
        for (var i = start + 1; i < src.length; i++) {
            var ch = src.charAt(i);
            if (inString) {
                if (ch === "\\") { i++; } else if (ch === '"') { inString = false; }
            } else if (ch === '"') { inString = true; }
            else if (ch === "]") { return [start, i + 1]; }
        }
        return null;
    }

    // An array written like the original one: on one line, or an item per line
    // with the same indentation and the same place of the closing bracket.
    function formatArray(values, original) {
        var items = values.map(function (v) { return JSON.stringify(v); });
        var mi = original.match(/\n([ \t]*)\S/);
        if (!mi || !items.length) {
            return "[" + items.join(/",\S/.test(original) ? "," : ", ") + "]";
        }
        var mc = original.match(/\n([ \t]*)\]$/);
        return "[\n" + items.map(function (it) { return mi[1] + it; }).join(",\n") +
            (mc ? "\n" + mc[1] + "]" : "]");
    }

    // Rewrite only what changed: the value arrays of the changed blocks (the
    // rest of the block keeps its exact text); other changes rewrite the block.
    function write(text, model, changed) {
        var list = Object.keys(changed).map(function (i) { return model.blocks[i]; });
        list.sort(function (a, b) { return b.start - a.start; });
        list.forEach(function (b) {
            var src = text.slice(b.start, b.end), orig = JSON.parse(src), out = src;
            var keys = Object.keys(b.obj).concat(Object.keys(orig)).filter(function (k, i, all) { return all.indexOf(k) === i; });
            var simple = keys.every(function (k) {
                var same = JSON.stringify(orig[k]) === JSON.stringify(b.obj[k]);
                return same || (Array.isArray(orig[k]) && Array.isArray(b.obj[k]) && arraySpan(src, k));
            });
            if (!simple) {
                out = serialize(b.obj, src);
            } else {
                keys.forEach(function (k) {
                    if (JSON.stringify(orig[k]) === JSON.stringify(b.obj[k])) { return; }
                    var span = arraySpan(out, k);
                    out = out.slice(0, span[0]) + formatArray(b.obj[k], out.slice(span[0], span[1])) + out.slice(span[1]);
                });
            }
            text = text.slice(0, b.start) + out + text.slice(b.end);
        });
        return text;
    }

    // ---------- the authority file picker ----------

    var picker = null, pickerCallback = null;
    function closePicker() { picker.style.display = "none"; pickerCallback = null; }
    function pickerDone(rec) {
        var callback = pickerCallback;
        closePicker();
        if (callback) { callback(rec); }
    }
    function pickAuthority(title, current, onPick) {
        if (!picker) {
            picker = document.createElement("div");
            picker.className = "tf-modal";
            picker.innerHTML =
                '<div class="tf-dialog">' +
                '<h4 class="tf-title"></h4>' +
                '<input type="text" class="form-control tf-q" placeholder="Napište část názvu (stačí bez diakritiky)…"/>' +
                '<div class="tf-results"></div>' +
                '<details class="tf-manual"><summary>Korporace není v Národních autoritách – zapsat ručně</summary>' +
                '<div class="tf-manual-body">' +
                '<label>Název (jak se píše do pole, podpole odděleně $$b)<input type="text" class="form-control tf-m-name"/></label>' +
                '<label>Kód autority $7 (nechte prázdné, pokud žádný není)<input type="text" class="form-control tf-m-code"/></label>' +
                '<label>Indikátor <select class="tf-m-ind"><option value="2">2 – jméno korporace</option>' +
                '<option value="1">1 – jurisdikce (stát, země…)</option><option value="0">0 – invertované jméno</option></select></label>' +
                '<button type="button" class="btn btn-sm btn-default tf-m-use">Použít</button></div></details>' +
                '<div class="tf-buttons"><button type="button" class="btn btn-sm btn-default tf-cancel">Zavřít</button></div>' +
                "</div>";
            document.body.appendChild(picker);
            picker.addEventListener("mousedown", function (e) { if (e.target === picker) { closePicker(); } });
            picker.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePicker(); } });
            picker.querySelector(".tf-cancel").addEventListener("click", closePicker);
            var q = picker.querySelector(".tf-q"), results = picker.querySelector(".tf-results");
            var timer = null, seq = 0;
            q.addEventListener("input", function () {
                clearTimeout(timer);
                var my = ++seq, query = q.value.trim();
                if (query.length < 2) { results.innerHTML = ""; return; }
                timer = setTimeout(function () {
                    fetch("/api/authorities?type=corporation&limit=15&q=" + encodeURIComponent(query))
                        .then(function (r) { return r.ok ? r.json() : []; })
                        .then(function (list) {
                            if (my !== seq) { return; }
                            if (!list.length) { results.innerHTML = '<p class="hint">Nic nenalezeno.</p>'; return; }
                            results.innerHTML = list.map(function (a, i) {
                                return '<button type="button" class="tf-result" data-i="' + i + '">' + esc(a.heading) +
                                    ' <span class="tf-code">' + esc(a.code) + "</span>" +
                                    (a.variants && a.variants.length ? '<span class="tf-var">' + esc(a.variants.slice(0, 2).join(" · ")) + "</span>" : "") +
                                    "</button>";
                            }).join("");
                            results.querySelectorAll(".tf-result").forEach(function (btn) {
                                btn.addEventListener("click", function () {
                                    var a = list[+btn.getAttribute("data-i")];
                                    pickerDone({ marc: a.marc, code: a.code, ind1: a.ind1 || "2" });
                                });
                            });
                        })
                        .catch(function () { results.innerHTML = '<p class="hint err">Hledání se nepovedlo.</p>'; });
                }, 250);
            });
            picker.querySelector(".tf-m-use").addEventListener("click", function () {
                var name = picker.querySelector(".tf-m-name").value.trim();
                if (!name) { return; }
                pickerDone({ marc: name, code: picker.querySelector(".tf-m-code").value.trim(),
                    ind1: picker.querySelector(".tf-m-ind").value });
            });
        }
        pickerCallback = onPick;
        picker.querySelector(".tf-title").textContent = title;
        var q = picker.querySelector(".tf-q");
        q.value = (current || "").split("$$")[0].replace(/\.$/, "");
        picker.querySelector(".tf-results").innerHTML = "";
        picker.querySelector(".tf-m-name").value = "";
        picker.querySelector(".tf-m-code").value = "";
        picker.querySelector(".tf-manual").open = false;
        picker.style.display = "flex";
        q.focus();
        q.dispatchEvent(new Event("input"));
    }

    // ---------- checks ----------

    function mode(values) {
        var count = {}, best = null;
        values.forEach(function (v) { count[v] = (count[v] || 0) + 1; if (best === null || count[v] > count[best]) { best = v; } });
        return best;
    }

    // problems of each cell: { "row:col": "reason" } (col -1 = the controlling field)
    function check(table) {
        var base = table.base.obj.values, n = base.length, out = {};
        var cell = function (c, r) {
            var arr = c.block.obj.valuesByBaseIndex;
            return r < arr.length ? arr[r] : undefined;
        };
        base.forEach(function (v, r) {
            if (!String(v).trim()) { out[r + ":-1"] = "Prázdná hodnota."; }
            var dup = base.indexOf(v);
            if (dup !== r) { out[r + ":-1"] = "Stejná hodnota je i v řádku " + (dup + 1) + "."; }
        });
        table.cols.forEach(function (c, ci) {
            var vals = [];
            for (var r = 0; r < n; r++) { vals.push(cell(c, r)); }
            var filled = vals.filter(function (v) { return isPlain(v) && String(v) !== ""; });
            var usual = c.block.tag === "008" ? mode(filled.map(function (v) { return String(v).length; })) : null;
            vals.forEach(function (v, r) {
                var key = r + ":" + ci, empty = v === undefined || v === "";
                if (!isPlain(v) && v !== undefined) { return; }
                if (c.kind === "code" && empty) {
                    out[key] = "Chybí kód autority $7 – vyberte korporaci z Národních autorit.";
                } else if (c.kind === "ind" && empty) {
                    out[key] = "Chybí indikátor.";
                } else if (c.kind === "entry" && !empty && String(v).indexOf("$$7") < 0) {
                    out[key] = "Chybí kód autority $7 – vyberte korporaci z Národních autorit.";
                } else if (c.kind === "entryInd") {
                    var entry = table.cols.filter(function (x) { return x.ind === c; })[0];
                    var ev = entry ? cell(entry, r) : "";
                    if (ev && empty) { out[key] = "Chybí indikátor (korporace v řádku je vyplněná)."; }
                } else if (c.kind === "optional" && !empty && /^7/.test(String(v)) && String(v).indexOf("$$7") < 0) {
                    out[key] = "Chybí kód autority $7.";
                } else if (c.kind === "entry" || c.kind === "optional") {
                    // an empty added entry is fine: the corporation has no related one
                } else if (empty && filled.length) {
                    out[key] = "Nevyplněno – ostatní řádky hodnotu mají.";
                } else if (usual !== null && !empty && String(v).length !== usual) {
                    out[key] = "Jiná délka než u ostatních (" + String(v).length + " místo " + usual +
                        " znaků) – pole 008 má pevné pozice.";
                }
            });
        });
        return out;
    }

    // ---------- the form ----------

    function init(opts) {
        var root = opts.container;
        var model = null, updating = false;

        function commit(changed, structural) {
            updating = true;
            try {
                opts.setText(write(opts.getText(), model, changed));
            } finally {
                updating = false;
            }
            model = build(opts.getText());
            if (structural) { render(); } else { mark(); }
        }

        // all arrays of a table as long as its controlling field (missing = "")
        function pad(t) {
            var n = t.base.obj.values.length, changed = {};
            t.cols.forEach(function (c) {
                var arr = c.block.obj.valuesByBaseIndex;
                while (arr.length < n) { arr.push(""); changed[c.block.idx] = true; }
            });
            return changed;
        }

        function roles(value) { return (String(value || "").match(/\$\$4[^$]*/g) || []).join(""); }

        // a picked corporation: heading + $7 (+ indicator) of the row in one go
        function applyBase(t, r, rec) {
            var changed = pad(t);
            t.base.obj.values[r] = rec.marc;
            changed[t.base.idx] = true;
            t.cols.forEach(function (c) {
                if (c.kind === "code") { c.block.obj.valuesByBaseIndex[r] = rec.code; changed[c.block.idx] = true; }
                if (c.kind === "ind") { c.block.obj.valuesByBaseIndex[r] = rec.ind1 || "2"; changed[c.block.idx] = true; }
            });
            return changed;
        }

        function applyEntry(t, c, r, rec) {
            var changed = pad(t), arr = c.block.obj.valuesByBaseIndex;
            var keep = roles(arr[r]);
            if (!keep) { keep = mode(arr.map(roles).filter(Boolean)) || ""; }
            arr[r] = rec.marc + keep + (rec.code ? "$$7" + rec.code : "");
            changed[c.block.idx] = true;
            if (c.ind) { c.ind.block.obj.valuesByBaseIndex[r] = rec.ind1 || "2"; changed[c.ind.block.idx] = true; }
            return changed;
        }

        function tableHtml(t, ti) {
            var b = t.base.obj;
            var h = '<div class="tf-card" data-t="' + ti + '">';
            h += "<h5>" + esc(b.title || b.id) + ' <span class="tf-where">' + esc(where(t.base)) + "</span></h5>";
            h += '<p class="hint">' + (t.corp
                ? "Každý řádek je jedna korporace. Když ji katalogizátor vybere, vyplní se podle řádku i ostatní sloupce."
                : "Každý řádek je jedna hodnota nabídky. Když ji katalogizátor vybere, vyplní se podle řádku i ostatní sloupce.") + "</p>";
            h += '<div class="tf-problems"></div>';
            h += '<div class="tf-scroll"><table class="tf-table" lang="cs"><thead><tr><th class="tf-num">#</th><th class="w-act"></th>';
            h += '<th class="tf-main w-main">' + esc(b.title || b.id) + '<span class="tf-where">' + esc(where(t.base)) + "</span></th>";
            t.cols.forEach(function (c) {
                h += '<th class="w-' + colWidth(c) + '">' + esc(c.label) + '<span class="tf-where">' + esc(c.where) + "</span></th>";
            });
            h += "</tr></thead><tbody>";
            b.values.forEach(function (v, r) {
                h += '<tr data-r="' + r + '"><td class="tf-num">' + (r + 1) + "</td>" +
                    '<td class="tf-row-actions">' +
                    '<button type="button" class="tf-up" title="Posunout nahoru"' + (r === 0 ? " disabled" : "") + ">↑</button>" +
                    '<button type="button" class="tf-down" title="Posunout dolů"' + (r === b.values.length - 1 ? " disabled" : "") + ">↓</button>" +
                    '<button type="button" class="tf-del" title="Smazat řádek">✕</button></td>';
                if (t.corp) {
                    h += '<td class="tf-main" data-c="-1"><span class="tf-ident" title="' + esc(v) + '">' + esc(readable(v)) + "</span>" +
                        '<button type="button" class="tf-pick" title="Vybrat z Národních autorit">Změnit…</button></td>';
                } else {
                    h += '<td class="tf-main" data-c="-1"><textarea rows="1">' + esc(v) + "</textarea></td>";
                }
                t.cols.forEach(function (c, ci) {
                    var arr = c.block.obj.valuesByBaseIndex, cv = r < arr.length ? arr[r] : "";
                    h += '<td data-c="' + ci + '" class="tf-' + c.kind + '">';
                    if (!isPlain(cv)) {
                        h += '<span class="tf-ro" title="Hodnota se bere z údajů listu">' + esc(JSON.stringify(cv)) + "</span>";
                    } else if (c.kind === "code") {
                        h += '<span class="tf-ident">' + esc(cv) + "</span>";
                    } else if (c.kind === "entry") {
                        var name = String(cv).split("$$4")[0].split("$$7")[0];
                        h += '<span class="tf-ident" title="' + esc(name) + '">' + esc(name ? readable(name) : "—") + "</span>" +
                            (roles(cv) ? '<input type="text" class="tf-roles" title="Role ($$4)" value="' + esc(roles(cv)) + '"/>' : "") +
                            (cv ? '<span class="tf-code">' + esc((String(cv).match(/\$\$7([^$]*)/) || ["", ""])[1]) + "</span>" : "") +
                            '<button type="button" class="tf-pick" title="Vybrat z Národních autorit">' + (cv ? "Změnit…" : "Vybrat…") + "</button>" +
                            (cv ? '<button type="button" class="tf-clear" title="Žádná">✕</button>' : "");
                    } else if (colWidth(c) === "short") {
                        h += '<input type="text" class="tf-short" value="' + esc(cv) + '"/>';
                    } else {
                        h += '<textarea rows="1">' + esc(cv) + "</textarea>";
                    }
                    h += "</td>";
                });
                h += "</tr>";
            });
            h += "</tbody></table></div>";
            h += '<button type="button" class="btn btn-sm btn-default tf-add">+ ' +
                (t.corp ? "Přidat korporaci" : "Přidat hodnotu") + "</button>";
            return h + "</div>";
        }

        function colWidth(c) {
            if (c.kind === "ind" || c.kind === "entryInd" || c.block.tag === "008") { return "short"; }
            if (c.kind === "code") { return "code"; }
            if (c.kind === "entry") { return "wide"; }
            return "text";
        }

        function listHtml(b, li) {
            var o = b.obj, title = o.title || o.id;
            var same = model.lists.filter(function (x) { return (x.obj.title || x.obj.id) === title; });
            if (same.length > 1) { title += " (" + (same.indexOf(b) + 1) + ".)"; }
            // longer values (e.g. 500 notes) get a whole line each
            var long = o.values.some(function (v) { return String(v).length > 16; });
            var h = '<div class="tf-card tf-list' + (long ? " tf-list-long" : "") + '" data-l="' + li + '"><h5>' + esc(title) +
                ' <span class="tf-where">' + esc(where(b)) + "</span></h5><div class=\"tf-items\">";
            o.values.forEach(function (v, i) {
                h += '<span class="tf-item" data-i="' + i + '"><input type="text" value="' + esc(v) + '"/>' +
                    '<button type="button" class="tf-del" title="Odebrat">✕</button></span>';
            });
            return h + '<button type="button" class="btn btn-sm btn-default tf-add">+ Přidat</button></div></div>';
        }

        function render() {
            if (!model.tables.length && !model.lists.length) {
                root.innerHTML = '<p class="hint">Šablona nemá žádné nabídky k úpravě. Strukturu šablony upravíte v textu (pokročilé).</p>';
                return;
            }
            var h = '<p class="help"><i class="help-i">i</i>Tady upravíte, z čeho katalogizátor vybírá. ' +
                "Změny se hned propíšou do textu šablony; uloží se tlačítkem „Uložit sérii“. " +
                "Přidat nebo odebrat celé pole MARC jde zatím jen v textu (pokročilé).</p>";
            model.tables.forEach(function (t, ti) { h += tableHtml(t, ti); });
            if (model.lists.length) {
                h += '<h4 class="tf-section">Další nabídky</h4><p class="hint">Hodnoty, které katalog nabídne ' +
                    "v rozbalovacím poli (katalogizátor z nich vybírá, nic dalšího se podle nich nevyplňuje).</p>";
                model.lists.forEach(function (b, li) { h += listHtml(b, li); });
            }
            root.innerHTML = h;
            root.querySelectorAll("textarea").forEach(grow);
            mark();
        }

        // a cell grows with its text instead of scrolling
        function grow(ta) {
            ta.style.height = "auto";
            ta.style.height = ta.scrollHeight + 2 + "px";
        }
        root.addEventListener("input", function (e) {
            if (e.target.tagName === "TEXTAREA") { grow(e.target); }
        });
        // a click anywhere in a cell (not only on the text box) edits its value
        root.addEventListener("click", function (e) {
            var td = e.target.closest("td, .tf-item");
            if (!td || e.target.closest("button, input, textarea")) { return; }
            var field = td.querySelector("input:not(.tf-roles), textarea");
            if (field) { field.focus(); }
        });
        // a value is one line: Enter confirms it
        root.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) {
                e.preventDefault();
                e.target.blur();
            }
        });

        // ---------- animations: what moved where ----------

        function rowsOf(ti) {
            var card = root.querySelector('.tf-card[data-t="' + ti + '"]'), rows = {};
            if (card) {
                card.querySelectorAll("tbody tr").forEach(function (tr) { rows[tr.getAttribute("data-r")] = tr; });
            }
            return rows;
        }
        function tops(ti) {
            var out = {}, rows = rowsOf(ti);
            Object.keys(rows).forEach(function (r) { out[r] = rows[r].getBoundingClientRect().top; });
            return out;
        }
        function slide(tr, dy) {
            if (!tr || !dy) { return; }
            tr.style.transition = "none";
            tr.style.transform = "translateY(" + dy + "px)";
            tr.getBoundingClientRect();
            tr.style.transition = "transform .5s ease";
            tr.style.transform = "";
        }
        function flash(tr, scroll) {
            if (!tr) { return; }
            tr.classList.remove("tf-flash");
            tr.getBoundingClientRect();
            tr.classList.add("tf-flash");
            if (scroll) { tr.scrollIntoView({ block: "center", behavior: "smooth" }); }
        }
        // rows "from" and "to" swapped: both slide from where they were
        function animateSwap(ti, from, to, before) {
            var rows = rowsOf(ti);
            slide(rows[to], before[from] - rows[to].getBoundingClientRect().top);
            slide(rows[from], before[to] - rows[from].getBoundingClientRect().top);
            flash(rows[to], false);
        }

        // mark problem cells and list them above each table
        function mark() {
            model.tables.forEach(function (t, ti) {
                var card = root.querySelector('.tf-card[data-t="' + ti + '"]');
                if (!card) { return; }
                var problems = check(t), lines = [];
                card.querySelectorAll("tbody td[data-c]").forEach(function (td) {
                    var r = td.parentNode.getAttribute("data-r"), key = r + ":" + td.getAttribute("data-c");
                    td.classList.toggle("tf-bad", !!problems[key]);
                    td.title = problems[key] || "";
                });
                Object.keys(problems).forEach(function (key) {
                    var p = key.split(":"), r = +p[0], ci = +p[1];
                    var col = ci < 0 ? (t.base.obj.title || t.base.obj.id) : t.cols[ci].label;
                    lines.push("Řádek " + (r + 1) + " (" + String(t.base.obj.values[r]).split("$$")[0] + "), " + col + ": " + problems[key]);
                });
                var box = card.querySelector(".tf-problems");
                box.innerHTML = lines.length
                    ? '<details><summary>⚠ K opravě: ' + lines.length + "</summary><ul>" +
                      lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul></details>"
                    : '<span class="hint ok">✓ Bez zjištěných chyb</span>';
            });
        }

        root.addEventListener("change", function (e) {
            var input = e.target;
            if (input.tagName !== "INPUT" && input.tagName !== "TEXTAREA") { return; }
            var card = input.closest(".tf-card"), changed = {};
            if (card.hasAttribute("data-t")) {
                var t = model.tables[+card.getAttribute("data-t")];
                var r = +input.closest("tr").getAttribute("data-r"), ci = +input.closest("td").getAttribute("data-c");
                changed = pad(t);
                if (ci < 0) {
                    t.base.obj.values[r] = input.value; changed[t.base.idx] = true;
                } else {
                    var c = t.cols[ci], arr = c.block.obj.valuesByBaseIndex;
                    if (input.classList.contains("tf-roles")) {
                        arr[r] = String(arr[r]).replace(/(\$\$4[^$]*)+/, "");
                        var at = arr[r].indexOf("$$7");
                        var rl = input.value.trim();
                        arr[r] = at < 0 ? arr[r] + rl : arr[r].slice(0, at) + rl + arr[r].slice(at);
                    } else {
                        arr[r] = input.value;
                    }
                    changed[c.block.idx] = true;
                }
            } else {
                var b = model.lists[+card.getAttribute("data-l")], item = input.closest(".tf-item");
                var at = item.hasAttribute("data-i") ? +item.getAttribute("data-i") : -1;
                var value = input.value.trim();
                if (at < 0 && !value) { return; }
                if (at < 0) { b.obj.values.push(value); }
                else if (!value) { b.obj.values.splice(at, 1); }
                else { b.obj.values[at] = value; }
                changed[b.idx] = true;
                commit(changed, at < 0 || !value);
                return;
            }
            commit(changed, false);
        });

        root.addEventListener("click", function (e) {
            var btn = e.target.closest("button");
            if (!btn || !root.contains(btn)) { return; }
            var card = btn.closest(".tf-card");
            if (!card) { return; }
            if (card.hasAttribute("data-l")) {
                var b = model.lists[+card.getAttribute("data-l")], ch = {};
                ch[b.idx] = true;
                if (btn.classList.contains("tf-add")) {
                    // a new value is stored once it is typed in
                    var span = document.createElement("span");
                    span.className = "tf-item";
                    span.innerHTML = '<input type="text" placeholder="nová hodnota"/>';
                    btn.parentNode.insertBefore(span, btn);
                    span.querySelector("input").focus();
                } else if (btn.classList.contains("tf-del")) {
                    b.obj.values.splice(+btn.closest(".tf-item").getAttribute("data-i"), 1);
                    commit(ch, true);
                }
                return;
            }
            var ti = +card.getAttribute("data-t"), t = model.tables[ti];
            var tr = btn.closest("tr"), r = tr ? +tr.getAttribute("data-r") : -1;
            var td = btn.closest("td"), ci = td ? +td.getAttribute("data-c") : NaN;
            var all = function () {
                var arrs = [t.base.obj.values];
                t.cols.forEach(function (c) { arrs.push(c.block.obj.valuesByBaseIndex); });
                return arrs;
            };
            var everything = function (changed) {
                changed[t.base.idx] = true;
                t.cols.forEach(function (c) { changed[c.block.idx] = true; });
                return changed;
            };
            if (btn.classList.contains("tf-add")) {
                var add = function (rec) {
                    var changed = everything(pad(t));
                    all().forEach(function (arr) { arr.push(""); });
                    if (rec) { applyBase(t, t.base.obj.values.length - 1, rec); }
                    commit(changed, true);
                    flash(rowsOf(ti)[t.base.obj.values.length - 1], true);
                };
                if (t.corp) { pickAuthority("Přidat korporaci", "", add); } else { add(null); }
            } else if (btn.classList.contains("tf-del")) {
                if (!confirm("Smazat řádek " + (r + 1) + " „" + readable(t.base.obj.values[r]) + "“ i se všemi jeho hodnotami?")) { return; }
                // the row fades out first, so it is clear which one goes
                tr.classList.add("tf-leaving");
                setTimeout(function () {
                    var changed = everything(pad(t));
                    all().forEach(function (arr) { arr.splice(r, 1); });
                    commit(changed, true);
                }, 300);
            } else if (btn.classList.contains("tf-up") || btn.classList.contains("tf-down")) {
                var to = btn.classList.contains("tf-up") ? r - 1 : r + 1, before = tops(ti);
                var changed2 = everything(pad(t));
                all().forEach(function (arr) { var x = arr[r]; arr[r] = arr[to]; arr[to] = x; });
                commit(changed2, true);
                animateSwap(ti, r, to, before);
                var moved = rowsOf(ti)[to].querySelector(btn.classList.contains("tf-up") ? ".tf-up" : ".tf-down");
                if (moved && !moved.disabled) { moved.focus(); }
            } else if (btn.classList.contains("tf-pick")) {
                if (ci < 0) {
                    pickAuthority("Korporace v řádku " + (r + 1), t.base.obj.values[r], function (rec) {
                        commit(applyBase(t, r, rec), true);
                    });
                } else {
                    var c = t.cols[ci];
                    pickAuthority(c.label + " – řádek " + (r + 1), c.block.obj.valuesByBaseIndex[r], function (rec) {
                        commit(applyEntry(t, c, r, rec), true);
                    });
                }
            } else if (btn.classList.contains("tf-clear")) {
                var col = t.cols[ci], cleared = pad(t);
                col.block.obj.valuesByBaseIndex[r] = ""; cleared[col.block.idx] = true;
                if (col.ind) { col.ind.block.obj.valuesByBaseIndex[r] = ""; cleared[col.ind.block.idx] = true; }
                commit(cleared, true);
            }
        });

        function refresh() {
            if (updating) { return; }
            model = build(opts.getText());
            render();
        }

        /**
         * A value the cataloguer used that the template does not have, sent from
         * the catalogue ("Přidat do šablony"): { base, main: {marc, code, ind1},
         * match: {code}, cells: {columnKey: value}, sheet }. With "match" the
         * row of that corporation gets the cells, otherwise a new row is added.
         * The row is shown and marked; nothing is saved until "Uložit sérii".
         * @return {string|null} what was done, or null if it does not fit.
         */
        function prefill(add) {
            var ti = -1;
            model.tables.forEach(function (t, i) { if (ti < 0 && t.base.obj.id === add.base) { ti = i; } });
            if (ti < 0) { return null; }
            var t = model.tables[ti], changed = everythingOf(t, pad(t)), r = -1;
            if (add.match && add.match.code) {
                var codeCol = t.cols.filter(function (c) { return c.kind === "code"; })[0];
                r = codeCol ? codeCol.block.obj.valuesByBaseIndex.indexOf(add.match.code) : -1;
            }
            var isNew = r < 0;
            if (isNew) {
                [t.base.obj.values].concat(t.cols.map(function (c) { return c.block.obj.valuesByBaseIndex; }))
                    .forEach(function (arr) { arr.push(""); });
                r = t.base.obj.values.length - 1;
                if (add.main) { applyBase(t, r, add.main); }
            }
            t.cols.forEach(function (c) {
                var v = add.cells ? add.cells[c.key] : undefined;
                if (typeof v === "string" && v !== "" && c.kind !== "code" && c.kind !== "ind") {
                    c.block.obj.valuesByBaseIndex[r] = v;
                }
            });
            commit(changed, true);
            var tr = rowsOf(ti)[r];
            flash(tr, true);
            if (tr) { tr.classList.add("tf-prefilled"); }
            return isNew ? "Přidán řádek " + (r + 1) : "Doplněn řádek " + (r + 1);
        }
        function everythingOf(t, changed) {
            changed[t.base.idx] = true;
            t.cols.forEach(function (c) { changed[c.block.idx] = true; });
            return changed;
        }

        refresh();
        return { refresh: refresh, prefill: prefill };
    }

    return { init: init, _build: build, _serialize: serialize, _check: check, _columnKeys: columnKeys };
})();
