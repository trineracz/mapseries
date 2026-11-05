// The reorganised admin on the real app (signed in with a session cookie; the app must
// run with MAPSERIES_EDITOR_DRY_RUN=true): Mapová díla, Mřížky, Série, the guide for a
// new dílo and "+ přidat do šablony" from the catalogue.
//   SESSION=<JSESSIONID> ./editor-tests.sh admin
import { chromium } from 'playwright';
const BASE = 'http://host.docker.internal:8080', OUT = '/work/editor/out/admin-';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'cs-CZ' });
await ctx.addCookies([{ name: 'JSESSIONID', value: process.env.SESSION, domain: 'host.docker.internal', path: '/' }]);
await ctx.route(/tile\.openstreetmap|openmaptiles|googletagmanager|google-analytics|opencagedata|basemaps|arcgisonline/, r => r.abort());
const errors = [], bad = [];
const ok = (cond, what) => { console.log((cond ? '  OK   ' : '  FAIL ') + what); if (!cond) bad.push(what); };
ctx.on('page', p => { p.on('pageerror', e => errors.push(p.url() + ': ' + e)); p.on('dialog', d => d.accept()); });
const page = await ctx.newPage();
const saveMsg = async (p) => {
  await p.waitForFunction(() => /✔|✕/.test(document.getElementById('saveMsg').textContent), null, { timeout: 60000 });
  return (await p.locator('#saveMsg').textContent()).trim();
};

// ---- the menu and Mapová díla ----
await page.goto(BASE + '/admin');
ok(page.url().includes('/admin/works'), '/admin opens Mapová díla');
const menu = (await page.locator('.side-navbar').innerText()).toLowerCase();
ok(['katalogizace', 'mapová díla', 'veřejný web', 'série', 'společné', 'mřížky'].every(t => menu.includes(t)), 'menu has the three groups');
const rows = await page.locator('table.admin-list tbody tr').count();
ok(rows === 39 || rows === 38, `all díla of the catalogue listed (${rows})`);
ok(await page.locator('text=Karte Slowakei 1:75 000').count() > 0, 'Karte Slowakei is listed');
ok(await page.locator('td .chip.ok').count() >= 10, 'díla whose 490 has a série are marked ✔');
await page.screenshot({ path: OUT + '1-works.png', fullPage: true });

// ---- one dílo: its own template (not the grid's) ----
await page.goto(BASE + '/admin/works/edit?layer=evropa-karte-slowakei-175-000');
await page.waitForSelector('.tf-table', { timeout: 30000 });
const tpl = await page.locator('#tplText').inputValue();
ok(tpl.includes('[Slowakei 1:75 000]'), 'Karte Slowakei shows ITS template (490 [Slowakei 1:75 000])');
ok((await page.locator('.use-box').first().innerText()).includes('Slowakei 1:75 000'), 'shows the série it fills');
await page.screenshot({ path: OUT + '2-work.png' });
await page.locator('#saveBtn').click();
ok(/testovací režim/.test(await saveMsg(page)), 'template saved (dry-run)');

// the 3VM template: a warning about the placeholder 490 and the séries on the same grid
await page.goto(BASE + '/admin/works/edit?layer=evropa-treti-vojenske-mapovani-specialni-mapy-175-000');
await page.waitForSelector('.tf-table', { timeout: 30000 });
const box = await page.locator('.use-box').first().innerText();
ok(box.includes('Franzisco-Josephinische') && box.includes('Založit sérii'), '3VM: 490 without a série is flagged');
ok(!box.includes('Spezialkarte') && !/mřížk/i.test(box), '3VM: no grid talk on the dílo page');

// ---- Mřížky ----
await page.goto(BASE + '/admin/grids');
ok(await page.locator('table.admin-list tbody tr').count() >= 39, 'grids listed with who uses them');
await page.goto(BASE + '/admin/grids/edit?name=evropa-treti-vojenske-mapovani-specialni-mapy-175-000');
await page.waitForFunction(() => document.querySelectorAll('.leaflet-tooltip.sheet-label').length > 20, null, { timeout: 60000 });
const use = await page.locator('.use-box').textContent();
ok(use.includes('Spezialkarte') && use.includes('Třetí vojenské mapování'), 'grid page names the díla and séries using it');
await page.screenshot({ path: OUT + '3-grid.png' });
await page.locator('#saveBtn').click();
ok(/testovací režim/.test(await saveMsg(page)), 'grid saved (dry-run)');

// ---- Série: grid chosen from the list, the dílo that fills it ----
await page.goto(BASE + '/admin/series/edit?name=' + encodeURIComponent('[Slowakei 1:75 000] ;'));
ok(await page.locator('#gridSelect').inputValue() === 'evropa-treti-vojenske-mapovani-specialni-mapy-175-000', 'série: its grid is selected');
ok((await page.locator('body').innerText()).includes('Karte Slowakei 1:75 000'), 'série: names the dílo that fills it');
ok(await page.locator('#tplSection, #map').count() === 0, 'série: no template or map editor any more');
await page.screenshot({ path: OUT + '4-serie.png' });
await page.locator('#saveBtn').click();
ok(/testovací režim/.test(await saveMsg(page)), 'série saved (dry-run)');
await page.waitForURL(/\/admin\/series$/, { timeout: 10000 }).catch(() => {});   // it goes back to the list

// ---- the guide for a new dílo ----
await page.goto(BASE + '/admin/works/new');
await page.selectOption('#grid', 'evropa-karte-slowakei-175-000');
await page.fill('#klad', 'Třetí vojenské mapování, speciální mapy 1:75 000');
await page.fill('#name', 'Testovací dílo 1:75 000');
ok(await page.inputValue('#name490') === '[Testovací dílo 1:75 000] ;', 'guide: 490 is proposed from the name');
await page.selectOption('#copyFrom', 'evropa-karte-slowakei-175-000');
await page.fill('#thumb', 'https://example.org/t.jpg');
await page.screenshot({ path: OUT + '5-new.png', fullPage: true });
await page.locator('#saveBtn').click();
ok(/testovací režim/.test(await saveMsg(page)), 'guide: dílo created (dry-run)');

// ---- catalogue -> "+ přidat do šablony" -> the dílo page ----
const cat = await ctx.newPage();
await cat.addInitScript(() => {
  Object.defineProperty(Object.prototype, 'template', { configurable: true, set(v) {
    Object.defineProperty(this, 'template', { value: v, writable: true, enumerable: true, configurable: true });
    if (!window.__search && Object.prototype.hasOwnProperty.call(this, 'map') && Object.prototype.hasOwnProperty.call(this, 'seriess')) window.__search = this; } });
});
await cat.goto(BASE + '/catalog/');
await cat.waitForFunction(() => window.__search && window.__search.seriess && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });
await cat.evaluate(async () => {
  const s = window.__search, series = s.seriess.find(x => x.layer === 'evropa-deutsche-heereskarte-1200-000'); s.series = series;
  const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
  const f = gj.features[0], props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
  s.template.setVisible(false);
  s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
});
const c110 = await cat.evaluate(() => window.__search.template.fields.findIndex(cb => cb.tag === '110' && cb.subfield === 'a' && cb.authorityType));
const in110 = cat.locator(`#templateComboBox${c110} input`);
await in110.click(); await in110.fill(''); await in110.pressSequentially('vojensky zemepisny', { delay: 20 });
await cat.locator(`#templateComboBox${c110} .authority-item`, { hasText: 'ko2005263855' }).click();
const [ed] = await Promise.all([ctx.waitForEvent('page'), cat.locator('.template-add').click()]);
await ed.waitForSelector('.tf-banner', { timeout: 30000 });
ok(ed.url().includes('/admin/works/edit?layer=evropa-deutsche-heereskarte-1200-000'), 'catalogue opens the dílo Deutsche Heereskarte 1:200 000');
ok((await ed.locator('.tf-banner').innerText()).includes('Přidán řádek'), 'the row is prepared in its template');
await ed.screenshot({ path: OUT + '6-prefilled.png' });

// ---- Nepřiřazené mapy: each with what it is ----
await page.goto(BASE + '/admin/non-linked-maps.xhtml');
const nl = await page.locator('.main').innerText();
ok(/Nepřiřazené mapy/.test(nl) && (/O co jde|Všechny listy/i.test(nl)), 'Nepřiřazené mapy explain each sheet');
ok(!/Nepřiřazení mapy/.test(await page.locator('.side-navbar').innerText()), 'menu label is "Nepřiřazené mapy"');
await page.screenshot({ path: OUT + '8-nonlinked.png', fullPage: true });

// the save bar touches the menu and the right edge
await page.goto(BASE + '/admin/works/edit?layer=evropa-karte-slowakei-175-000');
await page.waitForSelector('.tf-table', { timeout: 30000 });
const bar = await page.evaluate(() => { const b = document.getElementById('saveBar').getBoundingClientRect(), p = document.querySelector('.page').getBoundingClientRect();
  return { left: Math.round(b.left), page: Math.round(p.left), right: Math.round(b.right), w: innerWidth, bottom: Math.round(b.bottom), h: innerHeight }; });
ok(bar.left === bar.page && bar.right === bar.w && bar.bottom === bar.h, 'save bar spans from the menu to the right edge, at the bottom ' + JSON.stringify(bar));
await page.screenshot({ path: OUT + '2b-work.png' });

// ---- Uživatelé ----
await page.goto(BASE + '/admin/users.xhtml');
ok(await page.locator('table.table td').count() >= 1, 'Uživatelé: the admins are listed');
await page.screenshot({ path: OUT + '7-users.png' });
// the ajax endpoints refuse a visitor who is not signed in
const anon = await browser.newContext();
const r = await (await anon.request.get(BASE + '/rest/ajax/usersSettings/addAdmin?adminName=intruder-test')).json();
ok(r.success === false, 'adding an admin without signing in is refused: ' + r.message);
await anon.close();

console.log('page errors:', errors.length ? errors : 'none');
console.log(bad.length ? 'FAILED: ' + bad.length : 'ALL OK');
await browser.close();
