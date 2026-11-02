// Editor page layout: the save bar at the very bottom, no sideways scrolling, the wheel
// scrolls over the table, and moving a row animates both swapped rows.
import { open, openTemplate, W } from './lib.mjs';
const { browser, page, errors } = await open();
await openTemplate(page);
const lay = () => page.evaluate(() => {
  const main = document.querySelector('.main'), bar = document.getElementById('saveBar').getBoundingClientRect();
  return { mainScrollW: main.scrollWidth, mainClientW: main.clientWidth, barBottom: Math.round(bar.bottom), innerH: innerHeight };
});
console.log('layout', JSON.stringify(await lay()));
await page.locator('.tf-card[data-t="0"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: W + 'f-1.png' });
// wheel scroll over the table
const before = await page.evaluate(() => document.querySelector('.main').scrollTop);
const box = await page.locator('.tf-card[data-t="0"] table').boundingBox();
await page.mouse.move(box.x + 300, box.y + 40); await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
console.log('wheel over table scrolls:', before, '->', await page.evaluate(() => document.querySelector('.main').scrollTop));
// swap animation: capture mid-animation
await page.locator('.tf-card[data-t="0"] tr[data-r="1"] .tf-up').click();
await page.waitForTimeout(120);
await page.screenshot({ path: W + 'f-2-moving.png' });
const tf = await page.evaluate(() => [...document.querySelectorAll('.tf-card[data-t="0"] tbody tr')].map(tr => tr.style.transform || getComputedStyle(tr).transform));
console.log('row transforms mid-animation', JSON.stringify(tf));
await page.waitForTimeout(600);
await page.screenshot({ path: W + 'f-3-moved.png' });
console.log('layout end', JSON.stringify(await lay()), 'errors', errors);
await browser.close();
