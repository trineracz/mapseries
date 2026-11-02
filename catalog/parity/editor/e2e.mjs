// catalogue (live app) -> "+ přidat do šablony" -> the editor page (static replica) gets the row
import { chromium } from 'playwright';
import fs from 'node:fs';
import { open, openTemplate, W } from './lib.mjs';
const BASE = 'http://host.docker.internal:8080';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'cs-CZ' });
await ctx.route(/tile\.openstreetmap\.org|openmaptiles\.org|googletagmanager|google-analytics|opencagedata/, r => r.abort());
await ctx.addInitScript(() => {
  Object.defineProperty(Object.prototype, 'template', { configurable: true, set(v) {
    Object.defineProperty(this, 'template', { value: v, writable: true, enumerable: true, configurable: true });
    if (!window.__search && Object.prototype.hasOwnProperty.call(this, 'map') && Object.prototype.hasOwnProperty.call(this, 'seriess')) window.__search = this; } });
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/catalog/');
await page.waitForFunction(() => window.__search && window.__search.seriess && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });
async function openSheet() {
  await page.evaluate(async () => {
    const s = window.__search, series = s.seriess.find(x => x.layer === 'evropa-deutsche-heereskarte-1200-000');
    s.series = series;
    const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
    const f = gj.features[0], props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
    s.template.setVisible(false);
    s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
  });
}
const idx = (pred) => page.evaluate((p) => window.__search.template.fields.findIndex(cb => cb.tag === p.tag && cb.subfield === p.sf && !!cb.authorityType), pred);
async function pick(i, q, code) {
  const input = page.locator(`#templateComboBox${i} input`);
  await input.click(); await input.fill(''); await input.pressSequentially(q, { delay: 20 });
  await page.locator(`#templateComboBox${i} .authority-item`, { hasText: code }).click();
}
await openSheet();
const c110 = await idx({ tag: '110', sf: 'a' }), c710 = await idx({ tag: '710', sf: 'a' });
console.log('buttons at start:', await page.locator('.template-add').count());
// 1) corporation not in the template, values filled in afterwards
await pick(c110, 'vojensky zemepisny', 'ko2005263855');
console.log('buttons after off-template 110:', await page.locator('.template-add').count());
const f245 = await page.evaluate(() => window.__search.template.fields.findIndex(cb => cb.tag === '245' && cb.subfield === 'c'));
await page.locator(`#templateComboBox${f245} input`).fill('Vojenský zeměpisný ústav');
const f264 = await page.evaluate(() => window.__search.template.fields.findIndex(cb => cb.tag === '264' && cb.subfield === 'a'));
await page.locator(`#templateComboBox${f264} input`).fill('Praha :$$bVojenský zeměpisný ústav,');
await page.locator('.template-dialog-title').click();
await page.screenshot({ path: W + 'e-1-catalog.png' });
const [popup] = await Promise.all([ctx.waitForEvent('page'), page.locator('.template-add').first().click()]);
console.log('opens:', popup.url().replace(BASE, ''));
const add1 = await page.evaluate(() => localStorage.getItem('mapseries.templateAddition'));
console.log('addition 1:', add1);
await popup.close();
// 2) template corporation + a related corporation (710) not in the template
await openSheet();
await page.locator(`#templateComboBox${c110} .goog-combobox-button`).click();
await page.locator(`#templateComboBox${c110} .goog-menuitem`).nth(2).click();
await pick(c710, 'rakousko militargeographisches', 'kn20060405003');
console.log('buttons after off-template 710:', await page.locator('.template-add').count());
const [popup2] = await Promise.all([ctx.waitForEvent('page'), page.locator('.template-add').first().click()]);
await popup2.close();
const add2 = await page.evaluate(() => localStorage.getItem('mapseries.templateAddition'));
console.log('addition 2:', add2);
console.log('catalogue errors:', errors);
await browser.close();
fs.writeFileSync(W + 'add1.json', add1); fs.writeFileSync(W + 'add2.json', add2);

// the editor (replica) with each addition pending
for (const n of ['add1', 'add2']) {
  const { browser: b2, page: p2, errors: e2 } = await (async () => {
    const r = await open();
    return r;
  })();
  await p2.evaluate((v) => { localStorage.setItem('mapseries.templateAddition', v); }, fs.readFileSync(W + n + '.json', 'utf8'));
  await p2.reload();
  await p2.waitForSelector('.tf-banner', { timeout: 15000 });
  console.log(n, 'banner:', await p2.locator('.tf-banner').innerText());
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: W + 'e-' + n + '-editor.png' });
  fs.writeFileSync(W + n + '-after.txt', await p2.evaluate(() => document.getElementById('tplText').value));
  console.log(n, 'pending left:', await p2.evaluate(() => localStorage.getItem('mapseries.templateAddition')), 'errors', e2);
  await b2.close();
}
