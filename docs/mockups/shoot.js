// Снимает PNG с макетов: node docs/mockups/shoot.js [номер...]
// export NODE_PATH=/opt/node22/lib/node_modules
const { chromium } = require('playwright');
const path = require('path');
const list = [
  ['1-desktop-map', 1440, 900],
  ['2-event-modal', 1440, 900],
  ['3-finance', 1440, 900],
  ['4-mobile', 390, 844],
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
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight));
    console.log(name, 'fonts loaded:', [...new Set(fonts)].join(', '));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, name + '.png') });
    await ctx.close();
  }
  await browser.close();
})();
