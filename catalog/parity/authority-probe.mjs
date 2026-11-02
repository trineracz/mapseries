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

async function openSheet() {
  await page.evaluate(async (title) => {
    const s = window.__search;
    const series = s.seriess.find(x => x.title === title) || s.seriess.find(x => x.title.indexOf(title) >= 0);
    s.series = series;
    const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
    const f = gj.features[0];
    const props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
    s.template.setVisible(false);
    s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
  }, SERIES);
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

await openSheet();
const c110 = await combo('110', { subfield: 'a', authority: true });
const c710 = await combo('710', { subfield: 'a', authority: true });
const c264 = await combo('264', { subfield: 'a' });
console.log({ c110, c710, c264 });
await show('default');

// 1. a corporation the template does not know
await search(c110, 'vojensky zemepisny');
await page.screenshot({ path: `${OUT}/110-results.png` });
await pickResult(c110, 'ko2005263855');
await show('110 <- authority ko2005263855 (not in the template)');

// 2. a corporation the template knows (same $7) = as the template value
await openSheet();
await search(c110, 'nemecko heer generalstab');
await page.screenshot({ path: `${OUT}/110-results-template.png` });
await pickResult(c110, 'mzk2017971934');
await show('110 <- authority mzk2017971934 (in the template)');
await openSheet();
await page.locator(`#templateComboBox${c110} .goog-combobox-button`).click();
await page.locator(`#templateComboBox${c110} .goog-menuitem`).nth(1).click();
await show('110 <- template value 1 (must equal the previous one)');

// 3. typed free text is reverted
await page.locator(`#templateComboBox${c110} input`).click();
await page.locator(`#templateComboBox${c110} input`).fill('');
await page.locator(`#templateComboBox${c110} input`).pressSequentially('Moje korporace');
await page.locator('.template-dialog-title').click();
await page.screenshot({ path: `${OUT}/110-reverted.png` });
await show('110 typed "Moje korporace" + blur (reverted)');

// 4. 710 from the authority file keeps the relator, sets the indicator
await openSheet();
await page.locator(`#templateComboBox${c110} .goog-combobox-button`).click();
await page.locator(`#templateComboBox${c110} .goog-menuitem`).nth(1).click();
await search(c710, 'rakousko militargeographisches');
await page.screenshot({ path: `${OUT}/710-results.png` });
await pickResult(c710, null);
await show('710 <- first authority result');
// the same corporation as the template has it (same $7) = the template value
await search(c710, 'nemecko heer generalstab');
await pickResult(c710, 'mzk2017971934');
await show('710 <- authority mzk2017971934 (the template value)');
await search(c710, 'rakousko militargeographisches');
await pickResult(c710, null);

// 5. 710: the relator can be changed, the name cannot
const in710 = page.locator(`#templateComboBox${c710} input`);
await in710.click();
await in710.press('End');
const v = await in710.inputValue();
await in710.fill(v.replace('$$4ctg', () => '$$4ant'));
await page.locator('.template-dialog-title').click();
await show('710 relator ctg -> ant (kept)');
await in710.click();
await in710.fill('Něco jiného$$4ant');
await page.locator('.template-dialog-title').click();
await show('710 typed other name (reverted)');

// 6. 264 is transcribed: editable
const in264 = page.locator(`#templateComboBox${c264} input`);
await in264.click();
await in264.fill('Berlin :$$bReichsamt für Landesaufnahme,');
await page.locator('.template-dialog-title').click();
await show('264 typed');

console.log('\npage errors:', errors.length ? errors : 'none');
await browser.close();
