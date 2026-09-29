const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.goto('file://' + __dirname + '/../dist/local.html');
  await p.click('#startForm button'); await p.waitForTimeout(200);
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.waitForTimeout(100);
  await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(100);
  await p.click('#modal [data-act="closeModal"]');
  await p.evaluate(() => BK.App.setSpeed(10));
  for (let i = 0; i < 24; i++) {
    await p.waitForTimeout(500);
    const ch = await p.$('#modal [data-choice]:not([disabled])'); if (ch) await ch.click();
    const cm = await p.$('#modal [data-act="closeModal"]'); if (cm) await cm.click();
    const r = await p.evaluate(() => { const S = BK.App.state, st = S.stores[0]; return [S.day, S.phase, st.status, st.staff.map(e=>Math.round(e.mood)+'/'+Math.round(e.fatigue)).join(','), st.today && st.today.load && st.today.load.toFixed(2), st.staff.length, st.incoming.length, st.closedUntil, st.today && Math.round(st.today.rev), S.productions[0].status, Math.round(S.cache && S.cache.cap || 0), !!S.ev.pending, !!BK.App.ui.modal].join(' '); });
    console.log(r);
  }
  await b.close();
})();
