// Probe of the authority search in the template dialog (110/710) against a
// running app with the authority file (/api/authorities), e.g.
//   docker run --rm --ipc=host -v "$PWD":/work -w /work -e CATALOG_URL=http://host.docker.internal:8080 \
//     mcr.microsoft.com/playwright:v1.48.2-jammy bash -c "npm install --silent >/dev/null && node authority-probe.mjs"
// Prints the copied MARC lines of interest after each step and saves screenshots to out/authority/.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.CATALOG_URL || 'http://localhost:8080';
const SERIES = process.env.SERIES || 'Deutsche Heereskarte 1:200 000';
const OUT = 'out/authority';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'cs-CZ' });
await context.route(/tile\.openstreetmap\.org|openmaptiles\.org|googletagmanager|google-analytics|opencagedata/, r => r.abort());
await context.addInitScript(() => {
  window.__clip = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true });
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
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/catalog/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__search && window.__search.seriess
  && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });

let SI = 0;
async function openSheet() {
  await page.evaluate(async (si) => {
    const s = window.__search;
    const series = s.seriess[si];
    s.series = series;
    const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
    const f = gj.features[0];
    const props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
    s.template.setVisible(false);
    s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
  }, SI);
}

// index of the combo box of the given MARC tag and subfield/offset
async function combo(tag, pred) {
  return page.evaluate(([tag, pred]) => window.__search.template.fields.findIndex(cb =>
    cb.tag === tag && (pred.subfield === undefined || cb.subfield === pred.subfield)
      && (pred.offset === undefined || cb.offset === pred.offset)
      && (pred.authority === undefined || !!cb.authorityType === pred.authority)), [tag, pred]);
}

async function show(label) {
  const text = await page.evaluate(() => {
    window.__clip = [];
    document.getElementById('clipboard_button').click();
    return window.__clip[0];
  });
  console.log(`\n== ${label}`);
  for (const line of text.split('\n')) {
    if (/^(008|110|245|260|264|710)/.test(line)) console.log('  ' + line);
  }
  const enabled = await page.evaluate(() => window.__search.template.fields
    .filter(cb => cb.tag === '008' && cb.base).map(cb => cb.isEnabled()));
  console.log('  008 linked fields enabled: ' + JSON.stringify(enabled));
}

async function search(idx, text) {
  const input = page.locator(`#templateComboBox${idx} input`);
  await input.click();
  await input.fill('');
  await input.pressSequentially(text, { delay: 30 });
  await page.locator(`#templateComboBox${idx} .authority-header`).waitFor({ timeout: 10000 });
}

async function pickResult(idx, code) {
  const item = code
    ? page.locator(`#templateComboBox${idx} .authority-item`, { hasText: code })
    : page.locator(`#templateComboBox${idx} .authority-item`).first();
  await item.click();
}


const n = await page.evaluate(() => window.__search.seriess.length);
const byId = (id) => page.evaluate((id) => window.__search.template.fields.findIndex(cb => cb.id === id), id);
for (SI = 0; SI < n; SI++) {
  await openSheet();
  const title = await page.evaluate(() => window.__search.series.title);
  const corp = await byId('corporation');
  const count = corp < 0 ? 1 : await page.evaluate((i) => window.__search.template.fields[i].getItemCount(), corp);
  for (let k = corp < 0 ? 0 : 1; k < count; k++) {
    await openSheet();
    const res = await page.evaluate(([corp, k]) => {
      const t = window.__search.template;
      const set = (id, v, pick) => {
        const cb = t.fields.find(c => c.id === id);
        if (!cb || !cb.isEnabled()) return;
        if (pick) { const it = cb.getItemAt(1); if (it) cb.pickValue(it.getCaption(), 1); }
        else cb.pickValue(v, -1);
      };
      set('typ_data', null, true);
      set('year', '1900');
      for (const id of ['mapHeight', 'mapWidth', 'height', 'width']) set(id, '40');
      let name = '';
      if (corp >= 0) { const cb = t.fields[corp]; name = cb.getItemAt(k).getCaption(); cb.pickValue(name, k); }
      window.__clip = [];
      document.getElementById('clipboard_button').click();
      const box = document.querySelector('.copy-check-problems');
      return { name, problems: box ? [...box.querySelectorAll('li')].map(l => l.innerText) : [] };
    }, [corp, k]);
    if (res.problems.length) console.log(`${title} | ${res.name.slice(0, 40)} | ${res.problems.join(' ; ')}`);
  }
}
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
