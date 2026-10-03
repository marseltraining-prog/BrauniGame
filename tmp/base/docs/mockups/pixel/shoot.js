// Снимает PNG с пиксельных макетов: node docs/mockups/pixel/shoot.js [имя...]
// export NODE_PATH=~/.bk-tools/node_modules
const { chromium } = require('playwright');
const path = require('path');
const list = [
  ['1-shift', 1440, 900],
  ['2-inheritance', 1440, 900],
  ['3-belaya', 1440, 900],
  ['4-portraits', 1440, 900],
];
(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  for (const [name, w, h] of list) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log(name, 'console:', m.text()); });
    page.on('pageerror', (e) => console.log(name, 'error:', e.message));
    await page.route(/^https?:/, (r) => r.abort());
    await page.goto('file://' + path.join(__dirname, name + '.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('svg') || e.tagName === 'CANVAS') return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.display === 'inline') return false;
      return e.scrollWidth > e.clientWidth + 1 && e.children.length === 0;
    }).map((e) => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 40)).slice(0, 10));
    const doc = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    console.log(name, 'doc', doc.join('×'), over.length ? 'OVERFLOW ' + JSON.stringify(over) : 'ok');
    await page.screenshot({ path: path.join(__dirname, 'img', name + '.png') });
    await ctx.close();
  }
  await browser.close();
})();
