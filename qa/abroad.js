/* QA: путь «За рубеж» третьего акта (src/holding.js, src/ui/holding-ui.js). Chromium.
   Сохранение — бот good сразу после победы. В браузере: окно выбора пути, карточка «За рубеж»
   открыта, сцена «Ташкентский партнёр», окно стран, вход в Казахстан, рост точек и выручка.
   Экраны 1440 и 390, светлая и тёмная тема. Запуск: node qa/abroad.js */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');
const OUT = process.argv[2] || 'qa/shots/abroad';
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const PICK = { h_ab1: 0, h_ab2: 0, h_ab3: 2, h_ab4: 0, h_ab5: 0 };

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
  const tag = `${vp}-${theme}`, mobile = vp[0] === 'm';
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save, holding: true });
  await p.evaluate((t) => BK.App.ACT.theme({ arg: t }), theme);
  await p.waitForTimeout(100);
  await p.click('[data-act="continue"][data-arg="1"]');
  await p.waitForTimeout(400);
  await p.evaluate(() => { BK.App.setSpeed(0); if (BK.CFG.STORY) BK.CFG.STORY.ON = false; });
  await p.evaluate(() => { while (BK.App.ui.modal) BK.App.closeModal(); BK.App.ui.modalQueue.length = 0; });
  // 20 дней до открытия третьего акта (события решаем, чтобы время шло)
  const st = await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine;
    for (let i = 0; i < 25; i++) {
      if (S.ev.pending) E.resolveEvent(S, 0);
      if (S.chef.pending) E.chefConfirm(S, [], []);
      E.tick(S);
    }
    S.notify.length = 0;
    return { won: !!S.won, h: !!BK.Holding.state(S), day: S.day };
  });
  if (!st.won || !st.h) issues.push(`[${tag}] третий акт не открылся: ${JSON.stringify(st)}`);
  // окно выбора пути
  await p.evaluate(() => { BK.App.ACT.closeModal(); BK.App.ui.modalQueue.length = 0; BK.App.ACT.holdChoose(); });
  await p.waitForTimeout(150);
  const card = await p.evaluate(() => {
    const c = document.querySelector('#modal .hd-card[data-path="abroad"]');
    return { there: !!c, soon: !!(c && c.classList.contains('soon')), btn: !!(c && c.querySelector('[data-act="holdPick"]:not([disabled])')), n: document.querySelectorAll('#modal .hd-card').length };
  });
  if (!card.there || card.soon || !card.btn || card.n !== 3) issues.push(`[${tag}] карточка «За рубеж»: ${JSON.stringify(card)}`);
  await shot(p, `${vp}-${theme}-01-choose`);
  await p.click('#modal .hd-card[data-path="abroad"] [data-act="holdPick"]');
  await p.waitForTimeout(200);
  // сцена могла встать в очередь за событием — открываем её сами
  await p.evaluate(() => { if (!document.querySelector('#modal .hd-choice')) { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) BK.Engine.chefConfirm(S, [], []); if (S.story && S.story.pending) S.story.pending = null; BK.Holding.day(S); BK.App.ACT.holdScene(); } });
  await p.waitForTimeout(150);
  // сцена «Ташкентский партнёр»
  const sc = await p.evaluate(() => ({ title: (document.querySelector('#modal h2') || {}).textContent || '', choices: document.querySelectorAll('#modal .hd-choice').length }));
  if (sc.choices !== 3 || !/Ташкентский партнёр/.test(sc.title)) issues.push(`[${tag}] сцена h_ab1: ${JSON.stringify(sc)}`);
  await shot(p, `${vp}-${theme}-02-scene`);
  if (await p.locator('#modal .hd-choice[data-act="holdAns"]').count()) { await p.click('#modal .hd-choice[data-act="holdAns"][data-arg="0"]'); await p.waitForTimeout(200); }
  else issues.push(`[${tag}] сцена h_ab1 не открылась`);
  // окно стран
  await p.evaluate(() => { if (!document.querySelector('#modal .hd-countries')) { BK.App.closeModal(); BK.App.ACT.hold(); } });
  await p.waitForTimeout(150);
  const w = await p.evaluate(() => ({ countries: document.querySelectorAll('#modal .hd-country').length, enter: !!document.querySelector('#modal [data-act="holdEnter"][data-arg="kz:local"]'), goal: /10/.test(((document.querySelector('#modal .hd-gl') || {}).innerText || '')) }));
  if (w.countries !== 3 || !w.enter || !w.goal) issues.push(`[${tag}] окно «За рубеж»: ${JSON.stringify(w)}`);
  await shot(p, `${vp}-${theme}-03-window`);
  await p.click('#modal [data-act="holdEnter"][data-arg="kz:local"]');
  await p.waitForTimeout(200);
  // 100 дней: вход открывается, точки растут, выручка идёт
  const adv = await p.evaluate((pick) => {
    const S = BK.App.state, E = BK.Engine, HD = BK.Holding;
    for (let i = 0; i < 100; i++) {
      if (S.ev.pending) E.resolveEvent(S, 0);
      if (S.chef.pending) E.chefConfirm(S, [], []);
      const H = HD.state(S);
      if (H && H.pending) { const sc = HD.pendingScene(S); let j = pick[sc.id] || 0; if (!sc.choices[j].ok) j = sc.choices.findIndex((c) => c.ok); if (j >= 0) HD.resolve(S, j); }
      E.tick(S); S.notify.length = 0;
    }
    BK.App.refresh();
    const A = HD.abInfo(S);
    return { open: A.open, kz: A.countries[0], rev12: A.rev12, monthRev: A.monthRev };
  }, PICK);
  if (adv.open !== 1) issues.push(`[${tag}] Казахстан не открылся: ${JSON.stringify(adv)}`);
  if (!(adv.kz.stores >= 3)) issues.push(`[${tag}] точек в Казахстане: ${adv.kz.stores}`);
  if (!(adv.monthRev > 0)) issues.push(`[${tag}] выручки за месяц нет: ${adv.monthRev}`);
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.hold(); });
  await p.waitForTimeout(200);
  const openCard = await p.evaluate(() => { const c = document.querySelector('#modal .hd-country.open'); return { there: !!c, txt: (c || {}).innerText || '' }; });
  if (!openCard.there || !/\d+ из 45/.test(openCard.txt)) issues.push(`[${tag}] карточка открытой страны: ${JSON.stringify(openCard).slice(0, 160)}`);
  const junk = await p.evaluate(() => (((document.querySelector('#modal .modal') || {}).innerText || '').match(/.{0,24}(NaN|undefined|Infinity|\[object).{0,24}/g) || []).slice(0, 2));
  if (junk.length) issues.push(`[${tag}] мусор в тексте: ${junk.join(' | ')}`);
  await shot(p, `${vp}-${theme}-04-open`);
  // один раз доводим до цели и концовки: три страны + 10 млрд за 12 мес.
  if (vp === 'd1440' && theme === 'light') {
    const goal = await p.evaluate(() => {
      const S = BK.App.state, E = BK.Engine, HD = BK.Holding, A = HD.state(S).abroad;
      for (const id of ['kz', 'uz', 'kg']) { const c = A.c[id]; c.open = true; c.stores = c.stores || 12; c.mode = c.mode || 'local'; c.rate = c.rate || 1; }
      A.hist = Array.from({ length: 12 }, (_, i) => ({ day: S.day - 30 * (i + 1), rev: 1e9, prof: 3e8 }));
      for (let i = 0; i < 35 && !A.goalDay; i++) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); E.tick(S); }
      BK.App.closeModal(); BK.App.ui.modalQueue.length = 0;
      const H = HD.state(S);
      if (H.pending) { const sc = HD.pendingScene(S); return { goal: !!A.goalDay, scene: sc && sc.id }; }
      return { goal: !!A.goalDay, scene: null };
    });
    if (!goal.goal || goal.scene !== 'h_ab6') issues.push(`[${tag}] цель/сцена «Чайхана на углу»: ${JSON.stringify(goal)}`);
    await p.evaluate(() => BK.App.ACT.holdScene());
    await p.waitForTimeout(150);
    await shot(p, `${vp}-${theme}-05-final`);
    if (await p.locator('#modal .hd-choice[data-act="holdAns"]').count()) await p.click('#modal .hd-choice[data-act="holdAns"][data-arg="0"]');
    await p.waitForTimeout(250);
    const end = await p.evaluate(() => ({ lost: !!BK.App.state.lost, e: BK.App.state.storyEnding, h: BK.Holding.state(BK.App.state) && BK.Holding.state(BK.App.state).ending }));
    if (!end.lost || end.e !== 'abroad' || end.h !== 'abroad') issues.push(`[${tag}] концовка «Хлеб без границ»: ${JSON.stringify(end)}`);
    await p.evaluate(() => { BK.App.ui.modalQueue.length = 0; BK.App.closeModal(); BK.App.ACT.summary(); });
    await p.waitForTimeout(200);
    const sum = await p.evaluate(() => (((document.querySelector('#modal .modal') || {}).innerText || '')));
    if (!/Хлеб без границ/.test(sum) || !/За рубеж/.test(sum)) issues.push(`[${tag}] в итогах нет раздела «За рубеж»`);
    await shot(p, `${vp}-${theme}-06-summary`);
  }
  issues.push(...await layoutCheck(p, `${tag} abroad`, { modal: true }));
  if (p.errs.length) issues.push(`[${tag}] ошибки консоли: ${p.errs.slice(0, 3).join(' | ')}`);
  await p.context().close();
}

(async () => {
  const browser = await chromium.launch();
  const save = JSON.stringify(botSave());
  try {
    for (const vp of ['d1440', 'm390']) for (const theme of ['light', 'dark']) await run(browser, vp, theme, save);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.join('\n') + '\n');
  console.log(issues.length ? `ПРОБЛЕМЫ (${issues.length}):\n - ` + issues.join('\n - ') : 'ЗА РУБЕЖ: проблем нет, 0 ошибок консоли');
  process.exit(issues.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
