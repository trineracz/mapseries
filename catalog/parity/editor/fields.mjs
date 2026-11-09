// Pole šablony in the template form (whole MARC fields): edit, remove, add a subject from the
// authority file (mocked), add a fixed field and a drop-down; the link check (D4d). A static page
// with the real template-form.js and two real templates — no app needed. Run: ./editor-tests.sh fields
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1300, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('dialog', d => d.accept());
await page.route('**/api/authorities**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([
  { code: 'ph123456', tag: '150', heading: 'kartografie', marc: 'kartografie', variants: [] }]) }));
await page.route('**/page/**', r => { const f = r.request().url().split('/page/')[1]; r.fulfill({ body: fs.readFileSync('/work/editor/out/fields/' + f), contentType: f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'application/javascript' : 'text/html' }); });
const ok = (c, m) => console.log((c ? 'OK   ' : 'FAIL ') + m);
async function load(tpl) {
  await page.goto('http://x/page/index.html');
  await page.evaluate((t) => { const ta = document.getElementById('txt'); ta.value = t;
    window.api = TemplateForm.init({ container: document.getElementById('form'), getText: () => ta.value, setText: v => { ta.value = v; } }); }, tpl);
}
const text = () => page.evaluate(() => document.getElementById('txt').value);
const diff = (a, c) => { const x = a.split('\n'), y = c.split('\n'); const rm = x.filter(l => !y.includes(l)), add = y.filter(l => !x.includes(l)); return { rm, add }; };
const T = fs.readFileSync('/work/editor/out/fields/evropa-karte-ungarn-175-000.txt', 'utf8');
await load(T);
const rows = await page.locator('.tf-lines tbody tr').count();
ok(rows > 20, 'all fields listed (' + rows + ')');
ok(await page.locator('.tf-lines tr:has(td.tf-tag b:text-is("110")) .tf-keep').count() === 1, '110 (corporation, others depend on it) cannot be removed');
ok(await page.locator('.tf-lines tr:has(td.tf-tag b:text-is("245")) .tf-keep').count() === 1, '245 required');
// edit 650 content
let t0 = await text();
const r650 = page.locator('.tf-lines tr:has(td.tf-tag b:text-is("650"))').first();
await r650.locator('textarea').fill('$$avojenská topografie (test)$$7ph316247$$2czenas'); await r650.locator('textarea').blur();
let d = diff(t0, await text());
ok(d.rm.length === 1 && d.add.length === 1 && d.add[0] === '650 7 L $$avojenská topografie (test)$$7ph316247$$2czenas', 'edit 650 changes only that line ' + JSON.stringify(d));
// remove 500 fixed
t0 = await text();
const fixed500 = page.locator('.tf-lines tr:has(td.tf-tag b:text-is("500")):has(textarea)').first();
const n500 = await fixed500.count();
if (n500) { await fixed500.locator('.tf-line-del').click(); await page.waitForTimeout(500);
  d = diff(t0, await text()); ok(d.rm.length === 1 && d.add.length === 0 && d.rm[0].startsWith('500'), 'remove 500 removes one line ' + JSON.stringify(d)); }
// add subject 650 from authorities
t0 = await text();
await page.locator('.tf-add-subject[data-tag="650"]').click();
await page.locator('.tf-q').fill('kartografie'); await page.locator('.tf-result').first().click();
d = diff(t0, await text());
const lines = (await text()).split('\n');
ok(d.add.length === 1 && d.add[0] === '650 7 L $$akartografie$$7ph123456$$2czenas' && d.rm.length === 0, 'add 650 from NK ' + JSON.stringify(d));
const i650 = lines.indexOf('650 7 L $$akartografie$$7ph123456$$2czenas');
ok(lines[i650 - 1].startsWith('650') && !lines[i650 + 1].startsWith('650'), 'new 650 placed after the other 650s');
// add 655 with suffix as in template (none)
t0 = await text();
await page.locator('.tf-add-subject[data-tag="655"]').click();
await page.locator('.tf-q').fill('mapy'); await page.locator('.tf-result').first().click();
d = diff(t0, await text()); ok(d.add[0] === '655 7 L $$akartografie$$7ph123456', '655 follows the template (no $$2) ' + JSON.stringify(d.add));
// add other fixed field
t0 = await text();
await page.locator('summary:text("+ Jiné pevné pole")').click();
await page.locator('.tf-n-tag').fill('500'); await page.locator('.tf-n-content').fill('$$aTest poznámka'); await page.locator('.tf-add-fixed').click();
d = diff(t0, await text()); ok(d.add.length === 1 && d.add[0] === '500   L $$aTest poznámka' && d.rm.length === 0, 'add fixed 500 ' + JSON.stringify(d));
// add drop-down field
t0 = await text();
await page.locator('summary:text("+ Pole s nabídkou")').click();
await page.locator('.tf-d-tag').fill('500'); await page.locator('.tf-d-title').fill('Poznámka k vydání');
await page.locator('.tf-d-values').fill('Dotisk\nNové vydání'); await page.locator('.tf-add-drop').click();
d = diff(t0, await text()); ok(d.add.length === 1 && d.add[0] === '500   L $$a{"id":"poznamka_k_vydani","title":"Poznámka k vydání","values":["Dotisk","Nové vydání"]}', 'add drop-down 500 ' + JSON.stringify(d.add));
ok(await page.locator('.tf-list h5:has-text("Poznámka k vydání")').count() === 1, 'new drop-down appears under Další nabídky');
await page.screenshot({ path: 'editor/out/fields.png', fullPage: true });
// link check on the template with extra values
await load(fs.readFileSync('/work/editor/out/fields/evropa-befestigungskarte-tschechoslowakei-125-000.txt', 'utf8'));
const links = await page.locator('.tf-problems:has(summary:has-text("Vazby mezi poli")) li').allInnerTexts();
ok(links.length === 1 && /víc, než je řádků/.test(links[0]), 'D4d: extra values reported: ' + links.join(' | '));
// the original untouched text stays identical after just opening
await load(T); ok((await text()) === T, 'opening the form changes nothing');
console.log('page errors:', errors.length ? errors : 'none');
await b.close();
