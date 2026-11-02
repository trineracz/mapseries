// Screenshots of the template form for a look: out/s-table.png, out/s-lists.png
import { open, openTemplate, W } from './lib.mjs';
const { browser, page, errors } = await open();
await openTemplate(page);
await page.locator('.tf-card[data-t="0"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: W + 's-table.png' });
// a click into an empty part of a short cell edits it
const td = page.locator('.tf-card[data-t="0"] tbody tr[data-r="0"] td[data-c="0"]');
const box = await td.boundingBox();
console.log('cell', JSON.stringify(box), 'hit:', await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el.tagName + '.' + el.className; }, [box.x + box.width / 2, box.y + box.height - 4]));
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
console.log('focused after click in the cell:', await page.evaluate(() => document.activeElement.tagName + ' in ' + document.activeElement.closest('td')?.getAttribute('data-c')));
await page.locator('.tf-section').scrollIntoViewIfNeeded();
await page.screenshot({ path: W + 's-lists.png' });
console.log('lists:', await page.locator('.tf-list h5').allInnerTexts(), 'errors', errors);
await browser.close();
