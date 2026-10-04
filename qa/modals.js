const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.goto('file://' + __dirname + '/../dist/local.html');
  await p.click('#startForm button[type=submit]'); await p.waitForTimeout(200);
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.waitForTimeout(100);
  await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(100);
  await p.click('#modal [data-act="closeModal"]');
  await p.evaluate(() => { const S = BK.App.state; for (let i = 0; i < 60; i++) { BK.Engine.tick(S); if (S.ev.pending) BK.Engine.resolveEvent(S, 0); } S.notify = []; BK.App.setSpeed(0); });
  // событие с выбором
  await p.evaluate(() => { const S = BK.App.state; const e = BK.EVENTS.find(x => x.id === 'e013'); S.ev.pending = null; const st = S.stores[0]; S.ev.pending = { id: e.id, kind: e.kind, title: e.title, text: e.text.replace('{store}', st.address), tg: { scope: 'store', target: st.id }, day: S.day, effectsText: [], choices: e.choices.map(c => ({ label: c.label, desc: c.desc, cost: 100000 })) }; });
  await p.waitForTimeout(400); await p.screenshot({ path: 'qa/m-event.png' });
  await p.click('#modal [data-choice]'); await p.waitForTimeout(200);
  await p.evaluate(() => { const S = BK.App.state; BK.Engine.proposeChef(S); });
  await p.waitForTimeout(400); await p.screenshot({ path: 'qa/m-chef.png' });
  await p.click('#modal [data-pick]'); await p.waitForTimeout(100);
  await p.click('#chefOk'); await p.waitForTimeout(200);
  await p.evaluate(() => { BK.App.ACT.openStore({ arg: BK.App.state.stores[0].id }); });
  await p.waitForTimeout(400); await p.screenshot({ path: 'qa/m-store.png' });
  await b.close();
})();
