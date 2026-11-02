import { chromium } from 'playwright';
import fs from 'node:fs';
// Run by editor-tests.sh: /work/editor = this folder (+ out/), /src = the mapseries repo.
export const W = '/work/editor/out/';
const SRC = '/src/';
export async function open(viewport = { width: 1440, height: 900 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await page.route('http://ws/**', async route => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const live = { '/assets/series-editor/template-form.js': 'index-boot/src/main/resources/static/assets/series-editor/template-form.js',
      '/assets/series-editor/template-editor.js': 'index-boot/src/main/resources/static/assets/series-editor/template-editor.js' };
    if (live[p]) return route.fulfill({ body: fs.readFileSync(SRC + live[p]), contentType: 'application/javascript; charset=utf-8' });
    if (p === '/admin/series/template/data') return route.fulfill({ body: fs.readFileSync(W + 't.txt'), contentType: 'text/plain; charset=utf-8' });
    if (p === '/admin/series/sheets/data') return route.fulfill({ body: fs.readFileSync(W + 'g.json'), contentType: 'application/json' });
    if (p === '/' || p === '/index.html') return route.fulfill({ body: fs.readFileSync(W + 'index.html'), contentType: 'text/html; charset=utf-8' });
    const r = await route.fetch({ url: 'http://host.docker.internal:8080' + p + u.search });
    return route.fulfill({ response: r });
  });
  await page.route(/tile\.openstreetmap|basemaps|arcgisonline|tiles/, r => r.abort());
  await page.goto('http://ws/');
  return { browser, page, errors };
}
export async function openTemplate(page) {
  await page.locator('#tplSection > summary').click();
  await page.waitForSelector('.tf-table');
}
