// Does the template dialog scroll sideways? For every series (first sheet): how far the
// template reaches past its right edge, which fields and which text do.
//   docker run --rm --ipc=host -v "$PWD":/work -w /work -e VW=1280 -e CATALOG_URL=http://host.docker.internal:8080 \
//     mcr.microsoft.com/playwright:v1.48.2-jammy bash -c "npm install --silent >/dev/null && node overflow.mjs"
// Prints nothing when nothing overflows. SHOT=<layer prefix> saves a screenshot to out/.
import { chromium } from 'playwright';
const BASE = process.env.CATALOG_URL;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW || 1600), height: 1000 }, locale: 'cs-CZ' });
await ctx.route(/tile\.openstreetmap\.org|openmaptiles\.org|googletagmanager|google-analytics|opencagedata/, r => r.abort());
await ctx.addInitScript(() => {
  Object.defineProperty(Object.prototype, 'template', { configurable: true, set(v) {
    Object.defineProperty(this, 'template', { value: v, writable: true, enumerable: true, configurable: true });
    if (!window.__search && Object.prototype.hasOwnProperty.call(this, 'map') && Object.prototype.hasOwnProperty.call(this, 'seriess')) window.__search = this; } });
});
const page = await ctx.newPage();
await page.goto(BASE + '/catalog/');
await page.waitForFunction(() => window.__search && window.__search.seriess && window.__search.seriess.every(s => typeof s.template === 'string'), null, { timeout: 120000 });
const n = await page.evaluate(() => window.__search.seriess.length);
for (let i = 0; i < n; i++) {
  const r = await page.evaluate(async (i) => {
    const s = window.__search, series = s.seriess[i]; s.series = series;
    const gj = await (await fetch('/server/data/geojson/' + series.layer + '.json')).json();
    const f = gj.features[0], props = Object.assign({}, f.properties, { __GEOMETRY: JSON.stringify(f.geometry) });
    s.template.setVisible(false);
    s.template.showSheet({ type: 'Feature', geometry: f.geometry, properties: props }, series, s.map);
    const pre = document.querySelector('.template-dialog-content pre'), pr = pre.getBoundingClientRect();
    const over = [...pre.querySelectorAll('.combo')].map(d => ({ d, r: d.getBoundingClientRect() }))
      .filter(x => x.r.right > pr.right + 1).map(x => (x.d.title || x.d.id) + ' +' + Math.round(x.r.right - pr.right) + 'px');
    // which line reaches furthest (text included)
    const range = document.createRange(); let maxRight = 0, maxText = '';
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode; if (!t.nodeValue.trim()) continue; range.selectNodeContents(t);
      for (const rr of range.getClientRects()) if (rr.right > maxRight) { maxRight = rr.right; maxText = t.nodeValue.trim().slice(0, 70) + (t.parentNode.className ? ' [' + t.parentNode.className + ']' : ''); } }
    return { layer: series.layer.slice(0, 50), extra: pre.scrollWidth - pre.clientWidth, over, text: Math.round(maxRight - pr.right) + 'px: ' + maxText };
  }, i);
  if (process.env.SHOT && r.layer.indexOf(process.env.SHOT) === 0) { await page.evaluate(() => { const p = document.querySelector('.template-dialog-content pre'); p.scrollTop = p.scrollHeight; }); await page.screenshot({ path: 'out/shot-' + process.env.VW + '-' + process.env.SHOT + '.png' }); }
  if (r.extra > 0 && (!process.env.ONLY || r.layer.indexOf(process.env.ONLY) >= 0)) console.log(r.extra, r.layer, '| fields:', r.over.join(', ').slice(0,120), '| text', r.text);
}
await browser.close();
