/* QA тёмной/светлой темы: скриншоты всех экранов + проверка вёрстки и контраста.
   node qa/theme.js [папка] [dark|light|both] [d1440,m390] */
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');
const out = process.argv[2] || 'qa/shots';
const modes = (process.argv[3] || 'both') === 'both' ? ['dark', 'light'] : [process.argv[3]];
const vps = (process.argv[4] || 'd1440,m390').split(',');
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const issues = [];
  for (const mode of modes) for (const vp of vps) {
    const mobile = vp[0] === 'm';
    const p = await openPage(b, vp, { dark: mode === 'dark', seed: 7 });
    const tag = `${mode}-${vp}`;
    const shot = async (n, full) => { await p.waitForTimeout(120); await p.screenshot({ path: `${out}/${tag}-${n}.png`, fullPage: !!full }); issues.push(...await layoutCheck(p, `${tag} ${n}`, { mobile })); };
    await shot('0-start');
    await p.click('#startForm button'); await p.waitForTimeout(300);
    await shot('1-setup-prod');
    await p.click('[data-act="rentProd"]:not([disabled])'); await p.waitForTimeout(200);
    await shot('2-setup-store');
    await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(300);
    await shot('3-tutorial');
    await p.click('#modal [data-act="closeModal"]');
    // прогнать ~4 месяца, открыть ещё пару точек
    await p.evaluate(() => {
      const S = BK.App.state, E = BK.Engine;
      for (let i = 0; i < 130; i++) {
        E.tick(S); if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) { S.chef.pending = null; }
        if (i % 30 === 5 && S.offers.length && S.cash > 4e6) E.rentStore(S, S.offers[0].id);
      }
      S.notify = []; BK.App.setSpeed(0);
    });
    await realTicks(p, 1);
    await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' }));
    await shot('4-play', mobile);
    for (const t of ['stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) {
      await p.evaluate((t) => BK.App.ACT.tab({ arg: t }), t);
      await shot('tab-' + t, mobile && (t === 'team' || t === 'menu'));
    }
    await p.evaluate(() => BK.App.ACT.openStore({ arg: BK.App.state.stores[0].id }));
    await shot('store');
    // событие с выбором
    await p.evaluate(() => { const S = BK.App.state; const e = BK.EVENTS.find((x) => x.choices && x.choices.length > 1) || BK.EVENTS[0]; const st = S.stores[0]; S.ev.pending = { id: e.id, kind: e.kind, title: e.title, text: e.text.replace('{store}', st.address), tg: { scope: 'store', target: st.id }, day: S.day, effectsText: [], choices: (e.choices || []).map((c) => ({ label: c.label, desc: c.desc, cost: 100000 })) }; });
    await p.waitForTimeout(400);
    await shot('m-event');
    const ch = await p.$('#modal [data-choice]'); if (ch) await ch.click(); else await p.click('#modal [data-act="closeModal"]');
    await p.waitForTimeout(200);
    await p.evaluate(() => BK.Engine.proposeChef(BK.App.state)); await p.waitForTimeout(400);
    await shot('m-chef');
    const pk = await p.$('#modal [data-pick]:not([disabled])'); if (pk) { await pk.click(); await p.waitForTimeout(100); await shot('m-chef-pick'); }
    const ok = await p.$('#chefOk:not([disabled])'); if (ok) await ok.click(); await p.waitForTimeout(200);
    await p.evaluate(() => BK.App.ACT.settings()); await p.waitForTimeout(200);
    await shot('m-settings');
    await p.evaluate(() => BK.App.ACT.closeModal());
    await p.evaluate(() => BK.App.ACT.help()); await p.waitForTimeout(200);
    await shot('m-help');
    await p.evaluate(() => BK.App.ACT.closeModal());
    // тост
    await p.evaluate(() => { const S = BK.App.state; S.notify.push({ type: 'toast', title: 'Проверка уведомления', text: 'Точка №1 закрыта на санобработку', kind: 'bad' }); });
    await realTicks(p, 1); await p.waitForTimeout(100);
    await p.screenshot({ path: `${out}/${tag}-toast.png` });
    console.log(tag, 'errors:', p.errs.length ? p.errs.join('\n') : 'none');
    await p.context().close();
  }
  // переключатель: светлая система → «Тёмная» на старте → запоминается после перезагрузки → цикл в HUD
  {
    const p = await openPage(b, 'm390', {});
    await p.click('.themeseg [data-arg="dark"]');
    const a = await p.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('bk-ufa-theme'), getComputedStyle(document.body).backgroundColor]);
    await p.reload(); await p.waitForTimeout(200);
    const r = await p.evaluate(() => [document.documentElement.dataset.theme, document.querySelector('.themeseg [aria-pressed="true"]').dataset.arg]);
    await p.screenshot({ path: `${out}/toggle-start-dark.png` });
    await p.click('#startForm button'); await p.waitForTimeout(200);
    const cyc = [];
    for (let i = 0; i < 3; i++) { await p.click('.hud [data-act="theme"]'); cyc.push(await p.evaluate(() => (document.documentElement.dataset.theme || 'нет') + '/' + document.querySelector('.hud [data-act="theme"]').getAttribute('aria-label'))); }
    const box = await p.evaluate(() => { const r = document.querySelector('.hud [data-act="theme"]').getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height); });
    console.log('переключатель:', JSON.stringify({ a, r, cyc, box }), p.errs.length ? p.errs : '');
    await p.context().close();
  }
  console.log(issues.filter((x) => /КОНТРАСТ/.test(x)).join('\n') || 'контраст: ок');
  console.log('прочее:', issues.filter((x) => !/КОНТРАСТ/.test(x)).length);
  require('fs').writeFileSync(`${out}/theme-issues.txt`, issues.join('\n'));
  await b.close();
})();
