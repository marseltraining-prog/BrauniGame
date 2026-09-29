const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = process.argv[2] || 'qa';
  for (const vp of [{ w: 1440, h: 900, n: 'desk' }, { w: 390, h: 844, n: 'mob' }]) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
    await p.goto('file://' + __dirname + '/../dist/local.html');
    await p.screenshot({ path: `${out}/${vp.n}-0-start.png` });
    await p.click('#startForm button');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${vp.n}-1-setup.png` });
    await p.click('[data-act="rentProd"]:not([disabled])');
    await p.waitForTimeout(200);
    await p.click('[data-act="rent"]:not([disabled])');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${vp.n}-2-tutorial.png` });
    await p.click('#modal [data-act="closeModal"]');
    await p.evaluate(() => BK.App.setSpeed(10));
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(500);
      // закрывать модалки
      const ch = await p.$('#modal [data-choice]:not([disabled])');
      if (ch) await ch.click();
      const cm = await p.$('#modal [data-act="closeModal"]');
      if (cm) await cm.click();
      const chef = await p.$('#chefOk:not([disabled])');
      if (chef) await chef.click();
    }
    await p.screenshot({ path: `${out}/${vp.n}-3-play.png`, fullPage: vp.n === 'mob' });
    for (const t of ['stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) {
      await p.evaluate((t) => BK.App.ACT.tab({ arg: t }), t);
      await p.waitForTimeout(150);
      if (vp.n === 'desk') await p.screenshot({ path: `${out}/${vp.n}-tab-${t}.png` });
    }
    const st = await p.evaluate(() => { const S = BK.App.state; return { day: S.day, stores: S.stores.length, cash: Math.round(S.cash), phase: S.phase, log: S.log.slice(0, 5).map(l => l.text) }; });
    console.log(vp.n, JSON.stringify(st));
    console.log(vp.n, 'errors:', errs.length ? errs.slice(0, 10).join('\n') : 'none');
    const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(vp.n, 'horizontal scroll:', hscroll);
    await p.close();
  }
  await b.close();
})();
