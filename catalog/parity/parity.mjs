// Catalog parity harness — records what the catalog produces for every series,
// so a rebuilt/refactored catalog can be checked against it.
//
//   node parity.mjs record  <outDir>   # first run: also saves server data to <outDir>/data.har
//   node parity.mjs replay  <outDir>   # later runs: serve /server/data from the saved HAR
//
// For each series and its first SHEETS_PER_SERIES sheets it captures the text
// the three copy buttons put on the clipboard (Aleph, ARL, 008):
//   - default state,
//   - after picking each option of each combobox (one at a time, fresh dialog),
//   - after typing a custom value into each enabled combobox.
// It also saves screenshots of the dialog (default + first combobox menu open)
// for the first sheet of every series.
//
// No change to the catalog code is needed: the Search instance is captured via
// a one-shot setter on Object.prototype ('template' is assigned in its
// constructor), and navigator.clipboard.writeText is stubbed to record text.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [mode, outDir] = process.argv.slice(2);
if (!['record', 'replay'].includes(mode) || !outDir) {
  console.error('usage: node parity.mjs record|replay <outDir>');
  process.exit(2);
}
const BASE = process.env.CATALOG_URL || 'http://host.docker.internal:8080';
const SHEETS_PER_SERIES = parseInt(process.env.SHEETS_PER_SERIES || '2', 10);
const ONLY = process.env.ONLY_SERIES ? process.env.ONLY_SERIES.split(',') : null;
const harPath = path.join(outDir, 'data.har');
fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });

// Playwright stores text/plain bodies without a charset (the templates) decoded
// as Windows-1252/Latin-1; map the characters back to the original bytes.
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
function singleByteToBuffer(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const b = code < 256 ? code : CP1252[code];
    if (b === undefined) throw new Error('cannot map char U+' + code.toString(16) + ' back to a byte');
    bytes[i] = b;
  }
  return Buffer.from(bytes);
}

// record mode always uses one worker, so the HAR is written once
const WORKERS = mode === 'record' ? 1 : parseInt(process.env.WORKERS || '1', 10);
const errors = [];
const har = mode === 'replay' ? JSON.parse(fs.readFileSync(harPath, 'utf8')) : null;
const browser = await chromium.launch();

// One isolated browser context + page per worker.
async function newWorkerPage() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'cs-CZ' });
  if (mode === 'record') {
    await context.routeFromHAR(harPath, { url: /\/server\/data\//, update: true, updateContent: 'embed' });
  } else {
    const byPath = new Map();
    for (const e of har.log.entries) {
      const u = new URL(e.request.url);
      byPath.set(u.pathname + u.search, e.response);
    }
    await context.route(/\/server\/data\//, (route) => {
      const u = new URL(route.request().url());
      const r = byPath.get(u.pathname + u.search);
      if (!r) return route.abort();
      const c = r.content;
      const ct = ((r.headers || []).find(h => /^content-type$/i.test(h.name)) || {}).value || '';
      let body;
      if (c.encoding === 'base64') body = Buffer.from(c.text || '', 'base64');
      else if (/^text\/plain/i.test(ct) && !/charset/i.test(ct)) body = singleByteToBuffer(c.text || '');
      else body = Buffer.from(c.text || '', 'utf8');
      const headers = {};
      for (const h of r.headers || []) {
        if (!/^(content-length|content-encoding|transfer-encoding)$/i.test(h.name)) headers[h.name] = h.value;
      }
      return route.fulfill({ status: r.status, headers, body });
    });
  }
  // Keep screenshots deterministic and the run offline-ish: no tiles/glyphs/analytics.
  await context.route(/tile\.openstreetmap\.org|openmaptiles\.org|googletagmanager|google-analytics|opencagedata/,
    r => r.abort());

  await context.addInitScript(() => {
    window.__clip = [];
    const stub = { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } };
    Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true });
    Object.defineProperty(Object.prototype, 'template', {
      configurable: true,
      set(v) {
        Object.defineProperty(this, 'template', { value: v, writable: true, enumerable: true, configurable: true });
        if (!window.__search && Object.prototype.hasOwnProperty.call(this, 'map')
            && Object.prototype.hasOwnProperty.call(this, 'seriess')) {
          window.__search = this;
        }
      },
    });
    try { localStorage.setItem('templateFormat', 'aleph'); } catch (e) {}
  });

  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/catalog/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__search && window.__search.seriess
    && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });
  return { page, context };
}

const comboSel = idx => `#templateComboBox${idx}`;

// Helpers bound to one page.
function helpersFor(page) {
  async function openSheet(si, fi) {
    await page.evaluate(async ([si, fi]) => {
      const s = window.__search;
      const series = s.seriess[si];
      if (s.series !== series) { s.series = series; }
      window.__gj = window.__gj || {};
      if (!window.__gj[series.layer]) {
        window.__gj[series.layer] = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
      }
      const f = window.__gj[series.layer].features[fi];
      const props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
      s.template.setVisible(false);
      s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
    }, [si, fi]);
  }

  async function copyAll() {
    return page.evaluate(() => {
      const out = {};
      for (const [k, id] of [['aleph', 'clipboard_button'], ['arl', 'clipboard_button_arl'], ['f008', 'clipboard_button_008']]) {
        window.__clip = [];
        document.getElementById(id).click();
        out[k] = window.__clip.length ? window.__clip[0] : null;
      }
      return out;
    });
  }

  // Describe comboboxes of the open dialog: index, id/title, enabled, item captions.
  async function describeCombos() {
    return page.evaluate(() => {
      const t = window.__search.template;
      return t.fields.map((cb, idx) => {
        const items = [];
        for (let i = 0; i < cb.getItemCount(); i++) {
          const it = cb.getItemAt(i);
          items.push({ caption: it.getCaption(), enabled: it.isEnabled() });
        }
        return { idx, id: cb.id || null, title: (cb.configObj && cb.configObj.title) || null,
          enabled: cb.isEnabled(), items };
      });
    });
  }

  // Normalized DOM of the dialog: generated ids (goog ':0', 'goog_12') and inline
  // positions of the floating menu are dropped, the rest must match exactly.
  async function dialogDom() {
    return page.evaluate(() => {
      const el = document.querySelector('.template-dialog');
      return el ? el.outerHTML
        .replace(/ id="(:[0-9a-z]+|goog_[0-9]+)"/g, '')
        .replace(/ aria-(labelledby|activedescendant)="[^"]*"/g, '') : null;
    });
  }

  async function openMenu(idx) {
    // the dropdown arrow of the combobox (same as a user click)
    await page.locator(`${comboSel(idx)} .goog-combobox-button`).click();
  }

  // Keyboard scenarios (SCENARIOS=keys): typical ways of choosing a value without
  // the mouse, on the first sheet of each series, for every combobox with options.
  async function keyboardStates(si, combos) {
    const states = [];
    const dialogState = () => page.evaluate(() => ({
      visible: window.__search.template.isVisible(),
      active: (document.activeElement && (document.activeElement.id || document.activeElement.tagName)) || null,
    }));
    const run = async (label, c, keys) => {
      await openSheet(si, 0);
      const input = page.locator(`${comboSel(c.idx)} input`);
      await input.click();
      for (const k of keys) {
        if (k.type) await page.keyboard.type(k.type);
        else await page.keyboard.press(k);
      }
      const st = await dialogState();
      const out = st.visible ? await copyAll() : null;
      states.push({ action: `keys #${c.idx} (${c.id || c.title}) ${label}`, dialog: st, out });
    };
    for (const c of combos) {
      if (!c.enabled) continue;
      const pickable = c.items.filter(it => it.enabled && it.caption);
      if (pickable.length < 2) continue;
      // the click on the input above already opened the menu
      await run('Down Enter', c, ['ArrowDown', 'Enter']);
      await run('Down Down Enter', c, ['ArrowDown', 'ArrowDown', 'Enter']);
      await run('Up Up Tab', c, ['ArrowUp', 'ArrowUp', 'Tab']);
      await run('Home Enter', c, ['Home', 'Enter']);
      await run('End Enter', c, ['End', 'Enter']);
      await run('Escape', c, ['Escape']);
      await run('Escape Down Enter', c, ['Escape', 'ArrowDown', 'Enter']);
      const second = pickable[1].caption;
      await run(`type "${second.slice(0, 2)}" Tab`, c, [{ type: second.slice(0, 2) }, 'Tab']);
      await run(`type "${second.slice(0, 2)}" Enter`, c, [{ type: second.slice(0, 2) }, 'Enter']);
      await run('type "v" Tab', c, [{ type: 'v' }, 'Tab']);
    }
    return states;
  }

  return { openSheet, copyAll, describeCombos, dialogDom, openMenu, keyboardStates };
}

async function keysForSeries(page, s) {
  const { openSheet, describeCombos, keyboardStates } = helpersFor(page);
  await openSheet(s.i, 0);
  const combos = await describeCombos();
  const states = await keyboardStates(s.i, combos);
  return { layer: s.layer, title: s.title, sheets: [{ index: 0, combos, states }] };
}

async function fullForSeries(page, s) {
  const { openSheet, copyAll, describeCombos, dialogDom, openMenu } = helpersFor(page);
  const nFeatures = await page.evaluate(async (layer) =>
    (await (await fetch('/server/data/geojson/' + layer + '.json')).json()).features.length, s.layer);
  const sres = { layer: s.layer, title: s.title, sheets: [] };
  for (let fi = 0; fi < Math.min(SHEETS_PER_SERIES, nFeatures); fi++) {
    await openSheet(s.i, fi);
    const combos = await describeCombos();
    const sheet = { index: fi, combos, states: [] };
    sheet.states.push({ action: 'default', out: await copyAll() });

    const menuCombos = combos.filter(c => c.enabled && c.items.filter(it => it.enabled).length > 1);
    const shotAt = new Map(); // combo idx -> screenshot label (first and last multi-option combo)
    if (fi === 0) {
      await page.locator('.template-dialog').screenshot({ path: path.join(outDir, 'shots', `${s.layer}--dialog.png`) });
      sheet.dom = { default: await dialogDom() };
      if (menuCombos.length) {
        shotAt.set(menuCombos[0].idx, 'menu');
        shotAt.set(menuCombos[menuCombos.length - 1].idx, 'menu-last');
      }
    }

    for (const c of combos) {
      if (!c.enabled) continue;
      const pickable = c.items.map((it, i) => ({ ...it, i })).filter(it => it.enabled);
      for (const it of pickable) {
        await openSheet(s.i, fi);
        await openMenu(c.idx);
        if (shotAt.has(c.idx)) {
          const label = shotAt.get(c.idx);
          await page.screenshot({ path: path.join(outDir, 'shots', `${s.layer}--${label}.png`) });
          sheet.dom[label] = await dialogDom();
          shotAt.delete(c.idx);
        }
        const item = page.locator(`${comboSel(c.idx)} .goog-menuitem`).nth(it.i);
        const action = `pick #${c.idx} (${c.id || c.title}) = ${it.caption}`;
        if (!(await item.isVisible())) {
          // e.g. an empty caption is never shown in the menu — record that, nothing to click
          sheet.states.push({ action, hidden: true });
          continue;
        }
        await item.click();
        sheet.states.push({ action, out: await copyAll() });
      }
      // free text typed by the user instead of choosing
      await openSheet(s.i, fi);
      const input = page.locator(`${comboSel(c.idx)} input`);
      await input.click();
      await input.fill('');
      await input.pressSequentially('XyZ 1');
      await page.locator('.template-dialog-title').click(); // blur
      sheet.states.push({ action: `type #${c.idx} (${c.id || c.title}) = "XyZ 1"`, out: await copyAll() });
    }
    sres.sheets.push(sheet);
  }
  return sres;
}

const first = await newWorkerPage();
const seriesList = await first.page.evaluate(() =>
  window.__search.seriess.map((s, i) => ({ i, layer: s.layer, title: s.title })));
const todo = seriesList.filter(s => !ONLY || ONLY.includes(s.layer));
const workers = [first];
for (let w = 1; w < Math.min(WORKERS, todo.length); w++) workers.push(await newWorkerPage());

const done = new Map();
let next = 0;
await Promise.all(workers.map(async ({ page }) => {
  while (next < todo.length) {
    const s = todo[next++];
    const sres = process.env.SCENARIOS === 'keys' ? await keysForSeries(page, s) : await fullForSeries(page, s);
    done.set(s.layer, sres);
    console.log(`${s.layer}: ${sres.sheets.map(x => x.states.length).join('+')} states`);
  }
}));

const result = { base: BASE, mode, series: todo.map(s => done.get(s.layer)) };
const n = result.series.reduce((a, s) => a + s.sheets.reduce((b, sh) => b + sh.states.length, 0), 0);
result.pageErrors = errors;
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
console.log(`done: ${result.series.length} series, ${n} states, ${errors.length} page errors`);
for (const w of workers) await w.context.close();
await browser.close();
