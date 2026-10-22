/* QA: путь «Франшиза-империя» (src/holding.js, src/ui/holding-ui.js). Chromium.
   Сохранение — бот good сразу после победы: окно выбора, карточка «Франшиза» открыта, сцена
   «Первый чужой», окно франшизы, проверки, рост точек, цель 1000 и концовка «Имя на вывеске».
   Экраны 1440 и 390, светлая и тёмная тема. Запуск: node qa/franchise.js */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');
const OUT = process.argv[2] || 'qa/shots/franchise';
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const PICK = { h_fr1: 0, h_fr2: 0, h_fr3: 0, h_fr4: 0, h_fr5: 1 };
function botSave() {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed: 2 * 7919, years: 30, corp: true, corpOpt: { level: 'good' }, stopWhen: (S) => S.won && S.day >= S.wonDay + 1 });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.holding;
  return c;
}
async function shot(p, name) { await p.waitForTimeout(150); await p.screenshot({ path: path.join(OUT, name + '.png') }); }
async function run(b, vp, theme, save) {
  const tag = `${vp}-${theme}`;
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save, holding: true });
  await p.evaluate((t) => BK.App.ACT.theme({ arg: t }), theme);
  await p.waitForTimeout(100);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { BK.App.setSpeed(0); if (BK.CFG.STORY) BK.CFG.STORY.ON = false; while (BK.App.ui.modal) BK.App.closeModal(); BK.App.ui.modalQueue.length = 0; });
  const st = await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine;
    for (let i = 0; i < 25; i++) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); E.tick(S); }
    S.notify.length = 0;
    return { won: !!S.won, h: !!BK.Holding.state(S) };
  });
  if (!st.won || !st.h) issues.push(`[${tag}] третий акт не открылся: ${JSON.stringify(st)}`);
  await p.evaluate(() => { BK.App.ACT.closeModal(); BK.App.ui.modalQueue.length = 0; BK.App.ACT.holdChoose(); });
  await p.waitForTimeout(150);
  const card = await p.evaluate(() => {
    const c = document.querySelector('#modal .hd-card[data-path="franchise"]');
    return { there: !!c, soon: !!(c && c.classList.contains('soon')), picks: document.querySelectorAll('[data-act="holdPick"]').length };
  });
  if (!card.there || card.soon || card.picks !== 3) issues.push(`[${tag}] карточка «Франшиза»: ${JSON.stringify(card)}`);
  await shot(p, `${vp}-${theme}-01-choose`);
  await p.click('#modal .hd-card[data-path="franchise"] [data-act="holdPick"]');
  await p.waitForTimeout(200);
  await p.evaluate(() => { if (!document.querySelector('#modal .hd-choice')) { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) BK.Engine.chefConfirm(S, [], []); BK.Holding.day(S); BK.App.ACT.holdScene(); } });
  await p.waitForTimeout(150);
  const sc = await p.evaluate(() => ({ title: (document.querySelector('#modal h2') || {}).textContent || '', choices: document.querySelectorAll('#modal .hd-choice').length }));
  if (sc.choices !== 3 || !/Первый чужой/.test(sc.title)) issues.push(`[${tag}] сцена h_fr1: ${JSON.stringify(sc)}`);
  await shot(p, `${vp}-${theme}-02-scene`);
  if (await p.locator('#modal .hd-choice[data-act="holdAns"]').count()) { await p.click('#modal .hd-choice[data-act="holdAns"][data-arg="0"]'); await p.waitForTimeout(200); }
  await p.evaluate(() => { if (!document.querySelector('#modal .hd-goalbox')) { BK.App.closeModal(); BK.App.ACT.hold(); } });
  await p.waitForTimeout(150);
  const w = await p.evaluate(() => ({
    goal: ((document.querySelector('#modal .hd-gl') || {}).innerText || ''),
    checks: !!document.querySelector('#modal [data-act="holdChecks"]'),
    school: !!document.querySelector('#modal [data-act="holdSchool"]'),
    points: ((document.querySelector('#modal .inv-nums') || {}).innerText || '').length > 10,
  }));
  if (!/1000/.test(w.goal) || !w.checks || !w.school || !w.points) issues.push(`[${tag}] окно франшизы: ${JSON.stringify(w)}`);
  await shot(p, `${vp}-${theme}-03-window`);
  if (await p.locator('#modal [data-act="holdChecks"]:not([disabled])').count()) { await p.click('#modal [data-act="holdChecks"]'); await p.waitForTimeout(150); }
  const adv = await p.evaluate((pick) => {
    const S = BK.App.state, E = BK.Engine, HD = BK.Holding;
    for (let i = 0; i < 150; i++) {
      if (S.ev.pending) E.resolveEvent(S, 0);
      if (S.chef.pending) E.chefConfirm(S, [], []);
      const H = HD.state(S);
      if (H && H.pending) { const sc = HD.pendingScene(S); let j = pick[sc.id] || 0; if (!sc.choices[j] || !sc.choices[j].ok) j = sc.choices.findIndex((c) => c.ok); if (j >= 0) HD.resolve(S, j); }
      E.tick(S); S.notify.length = 0;
    }
    BK.App.refresh();
    const F = HD.frInfo(S);
    return { points: F.points, cities: F.cities, brand: F.brand, stand: F.standards, paid: F.paidIn, hist: F.hist.length };
  }, PICK);
  if (!(adv.points > 10) || !(adv.cities >= 1) || !(adv.paid > 0) || !(adv.hist >= 2)) issues.push(`[${tag}] рост франшизы: ${JSON.stringify(adv)}`);
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.hold(); });
  await p.waitForTimeout(150);
  const junk = await p.evaluate(() => (((document.querySelector('#modal .modal') || {}).innerText || '').match(/.{0,24}(NaN|undefined|Infinity|\[object).{0,24}/g) || []).slice(0, 2));
  if (junk.length) issues.push(`[${tag}] мусор в тексте: ${junk.join(' | ')}`);
  await shot(p, `${vp}-${theme}-04-open`);
  if (vp === 'd1440' && theme === 'light') {
    const goal = await p.evaluate(() => {
      const S = BK.App.state, E = BK.Engine, HD = BK.Holding, F = HD.state(S).franchise;
      F.points = 999;
      for (let i = 0; i < 35 && !F.goalDay; i++) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); E.tick(S); }
      // сцены могли накопиться (250/380/650) — доходим до финальной
      for (let k = 0; k < 8; k++) {
        const H = HD.state(S);
        if (!H.pending) break;
        const sc = HD.pendingScene(S); if (sc.id === 'h_fr6') break;
        const j = sc.choices.findIndex((c) => c.ok); if (j >= 0) HD.resolve(S, j); else break;
      }
      BK.App.closeModal(); BK.App.ui.modalQueue.length = 0;
      const H = HD.state(S);
      return { goal: !!F.goalDay, scene: H.pending ? HD.pendingScene(S).id : null, points: F.points };
    });
    if (!goal.goal || goal.scene !== 'h_fr6') issues.push(`[${tag}] цель/сцена «Тысячная вывеска»: ${JSON.stringify(goal)}`);
    await p.evaluate(() => BK.App.ACT.holdScene()); await p.waitForTimeout(150);
    await shot(p, `${vp}-${theme}-05-final`);
    if (await p.locator('#modal .hd-choice[data-act="holdAns"]').count()) await p.click('#modal .hd-choice[data-act="holdAns"][data-arg="0"]');
    await p.waitForTimeout(250);
    const end = await p.evaluate(() => ({ lost: !!BK.App.state.lost, e: BK.App.state.storyEnding, h: BK.Holding.state(BK.App.state) && BK.Holding.state(BK.App.state).ending }));
    if (!end.lost || end.e !== 'franchise' || end.h !== 'franchise') issues.push(`[${tag}] концовка «Имя на вывеске»: ${JSON.stringify(end)}`);
    await p.evaluate(() => { BK.App.ui.modalQueue.length = 0; BK.App.closeModal(); BK.App.ACT.summary(); }); await p.waitForTimeout(200);
    const sum = await p.evaluate(() => (((document.querySelector('#modal .modal') || {}).innerText || '')));
    if (!/Имя на вывеске/.test(sum) || !/Франшиза/.test(sum)) issues.push(`[${tag}] в итогах нет раздела франшизы`);
    await shot(p, `${vp}-${theme}-06-summary`);
  }
  issues.push(...await layoutCheck(p, `${tag} franchise`, { modal: true }));
  if (p.errs.length) issues.push(`[${tag}] ошибки консоли: ${p.errs.slice(0, 3).join(' | ')}`);
  await p.context().close();
}
(async () => {
  const browser = await chromium.launch();
  const save = JSON.stringify(botSave());
  try { for (const vp of ['d1440', 'm390']) for (const theme of ['light', 'dark']) await run(browser, vp, theme, save); }
  finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.join('\n') + '\n');
  console.log(issues.length ? `ПРОБЛЕМЫ (${issues.length}):\n - ` + issues.join('\n - ') : 'ФРАНШИЗА: проблем нет, 0 ошибок консоли');
  process.exit(issues.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
