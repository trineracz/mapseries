// The real admin page (signed in with a session cookie; the app must run with
// MAPSERIES_EDITOR_DRY_RUN=true): TESTPLAN part 2, editor + catalogue -> editor.
//   SESSION=<JSESSIONID> ./editor-tests.sh real
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://host.docker.internal:8080', OUT = '/work/editor/out/real-';
const GRID = process.env.GRID || 'evropa-deutsche-heereskarte-1200-000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'JSESSIONID', value: process.env.SESSION, domain: 'host.docker.internal', path: '/' }]);
await ctx.route(/tile\.openstreetmap|openmaptiles|googletagmanager|google-analytics|opencagedata|basemaps|arcgisonline/, r => r.abort());
const errors = [];
const log = (...a) => console.log(...a);
const ok = (cond, what) => log((cond ? '  OK   ' : '  FAIL ') + what);
ctx.on('page', p => p.on('pageerror', e => errors.push(String(e))));
ctx.on('page', p => p.on('dialog', d => d.accept()));
const saves = [];
ctx.on('request', r => { if (r.url().endsWith('/admin/series/save')) saves.push(JSON.parse(r.postData())); });

const page = await ctx.newPage();
await page.goto(BASE + '/admin/series');
ok(await page.locator('a[href*="/admin/series/edit"]').count() > 0, 'signed in as admin, series list shown');

// ---- editor ----
await page.goto(BASE + '/admin/series/edit?grid=' + GRID);
ok(await page.locator('#ws').count() === 1, 'edit by ?grid= opens the workspace');
const original = await page.evaluate(async (g) => (await fetch('/admin/series/template/data?grid=' + g)).text(), GRID);
await page.locator('#tplSection > summary').click();
await page.waitForSelector('.tf-table');
const lay = await page.evaluate(() => { const m = document.querySelector('.main'); const b = document.getElementById('saveBar').getBoundingClientRect();
  return { bar: Math.round(b.bottom), h: innerHeight, sw: m.scrollWidth, cw: m.clientWidth }; });
ok(lay.bar === lay.h, `save bar at the very bottom (${lay.bar}/${lay.h})`);
ok(lay.sw === lay.cw, 'the page does not scroll sideways');
await page.locator('.tf-card[data-t="0"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: OUT + '1-form.png' });
const rows0 = await page.locator('.tf-card[data-t="0"] tbody tr').count();
// add from the authority file
await page.locator('.tf-card[data-t="0"] .tf-add').click();
// a corporation already in the template is not added twice
const codes = await page.evaluate(() => [...document.querySelectorAll('.tf-card[data-t="0"] td.tf-code .tf-ident')].map(e => e.textContent));
await page.locator('.tf-q').fill('vojensky zemepisny');
await page.locator('.tf-result', { hasText: codes.includes('ko2005263855') ? 'ko2005263855' : 'ko20241227931' }).click();
await page.waitForTimeout(300);
if (codes.includes('ko2005263855')) {
  ok(await page.locator('.tf-card[data-t="0"] tbody tr').count() === rows0, 'a corporation already in the template is not added again');
  await page.locator('.tf-card[data-t="0"] .tf-add').click();
  await page.locator('.tf-q').fill('vojensky zemepisny');
  await page.locator('.tf-result', { hasText: 'ko20241227931' }).click();
}
await page.waitForTimeout(400);
ok(await page.locator('.tf-card[data-t="0"] tbody tr').count() === rows0 + 1, 'row added from the authority file');
// a click into the empty part of a short cell edits it
const td = page.locator(`.tf-card[data-t="0"] tbody tr[data-r="${rows0}"] td[data-c="2"]`);
const box = await td.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
ok(await page.evaluate(() => !!document.activeElement.closest('td')), 'click in a cell focuses its value');
await page.keyboard.type('gw'); await page.keyboard.press('Enter');
// move it up: both rows animate
await page.locator(`.tf-card[data-t="0"] tbody tr[data-r="${rows0}"] .tf-up`).click();
await page.waitForTimeout(150);
const moving = await page.evaluate(() => [...document.querySelectorAll('.tf-card[data-t="0"] tbody tr')].filter(tr => getComputedStyle(tr).transform !== 'none').length);
ok(moving === 2, `two rows animate when swapped (${moving})`);
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '2-added-moved.png' });
// the text tab shows the change
await page.locator('.tpl-tabs button[data-tab="tplTextTab"]').click();
ok((await page.locator('#tplText').inputValue()).includes('ko2005263855'), 'text tab has the new $7');
await page.locator('.tpl-tabs button[data-tab="tplForm"]').click();
// save (dry-run)
await page.locator('#saveBtn').click();
await page.waitForFunction(() => /✔|selhal|Vyplň|neplatn/.test(document.getElementById('saveMsg').textContent), null, { timeout: 30000 });
const saveMsg = await page.locator('#saveMsg').textContent();
ok(/testovací režim/.test(saveMsg), 'save answered in dry-run: ' + saveMsg.trim());
const sent = saves[saves.length - 1].template;
fs.writeFileSync(OUT + 'orig.txt', original); fs.writeFileSync(OUT + 'saved.txt', sent);

// ---- catalogue -> "+ přidat do šablony" -> editor ----
const cat = await ctx.newPage();
await cat.addInitScript(() => {
  Object.defineProperty(Object.prototype, 'template', { configurable: true, set(v) {
    Object.defineProperty(this, 'template', { value: v, writable: true, enumerable: true, configurable: true });
    if (!window.__search && Object.prototype.hasOwnProperty.call(this, 'map') && Object.prototype.hasOwnProperty.call(this, 'seriess')) window.__search = this; } });
});
await cat.goto(BASE + '/catalog/');
await cat.waitForFunction(() => window.__search && window.__search.seriess && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });
await cat.evaluate(async (g) => {
  const s = window.__search, series = s.seriess.find(x => x.layer === g); s.series = series;
  const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
  const f = gj.features[0], props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
  s.template.setVisible(false);
  s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
}, GRID);
const c110 = await cat.evaluate(() => window.__search.template.fields.findIndex(cb => cb.tag === '110' && cb.subfield === 'a' && cb.authorityType));
const in110 = cat.locator(`#templateComboBox${c110} input`);
await in110.click(); await in110.fill(''); await in110.pressSequentially('kartografie praha', { delay: 20 });
await cat.locator(`#templateComboBox${c110} .authority-item`).first().click();
const f245 = await cat.evaluate(() => window.__search.template.fields.findIndex(cb => cb.tag === '245' && cb.subfield === 'c'));
await cat.locator(`#templateComboBox${f245} input`).fill('Kartografie Praha');
await cat.locator('.template-dialog-title').click();
ok(await cat.locator('.template-add').count() === 1, '"+ přidat do šablony" shown for a corporation outside the template');
await cat.screenshot({ path: OUT + '3-catalog.png' });
const [ed] = await Promise.all([ctx.waitForEvent('page'), cat.locator('.template-add').click()]);
await ed.waitForSelector('.tf-banner', { timeout: 30000 });
ok(true, 'editor opened with: ' + (await ed.locator('.tf-banner').innerText()));
await ed.waitForTimeout(800);
await ed.screenshot({ path: OUT + '4-editor-prefilled.png' });
const pre = await ed.locator('tr.tf-prefilled').count();
ok(pre === 1, 'the prepared row is marked');
await ed.locator('#saveBtn').click();
await ed.waitForFunction(() => /✔|selhal|Vyplň|neplatn/.test(document.getElementById('saveMsg').textContent), null, { timeout: 30000 });
ok(/testovací režim/.test(await ed.locator('#saveMsg').textContent()), 'prepared row saved (dry-run)');
fs.writeFileSync(OUT + 'saved2.txt', saves[saves.length - 1].template);

// ---- GitHub login comes back to the series list: it forwards a pending addition ----
const fw = await ctx.newPage();
await fw.goto(BASE + '/admin/series');
await fw.evaluate((g) => localStorage.setItem('mapseries.templateAddition', JSON.stringify({ grid: g, base: 'corporation', cells: {}, created: Date.now() })), GRID);
await fw.goto(BASE + '/admin/series');
await fw.waitForURL(/edit\?grid=/, { timeout: 15000 }).catch(() => {});
ok(fw.url().includes('edit?grid=' + GRID), 'the series list forwards a pending addition to its series');
await fw.evaluate(() => localStorage.removeItem('mapseries.templateAddition'));

log('page errors:', errors.length ? errors : 'none');
await browser.close();
