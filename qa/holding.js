/* QA: третий акт «Холдинг» (src/holding.js, src/ui/holding-ui.js). Только Chromium.
   Сохранение — бот good --corp сразу после победы первого акта. В браузере: третий акт открывается
   сам, окно выбора с тремя путями (два — «скоро», не выбрать), путь «Биржа»: сцена, окно подготовки,
   роадшоу, торги и квартальные отчёты, блок в «Сводке», строка в отчёте, сцена «Колокол», концовка
   «Публичная компания», раздел «Холдинг» в итогах. Экраны 1440 и 390, светлая и тёмная тема.
   Запуск: node qa/holding.js [папка=qa/shots/holding]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/holding';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const log = (...a) => console.log(...a);

function botSave() {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed: 2 * 7919, years: 30, corp: true, corpOpt: { level: 'good' }, stopWhen: (S) => S.won && S.day >= S.wonDay + 1 });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.holding;
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = ((document.querySelector('#pbody') || {}).innerText || '') + ' ' + ((document.querySelector('#modal .modal') || {}).innerText || '');
    return (t.match(/.{0,30}(NaN|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function shot(p, name) { await p.waitForTimeout(150); await p.screenshot({ path: path.join(OUT, name + '.png') }); }
// прокрутить N игровых дней в странице: события, шеф и сцены сюжета решаются первым доступным вариантом
// (без концовок), сцены холдинга — по заданному правилу; интерфейс не трогаем
async function adv(p, n, opts = {}) {
  return p.evaluate(([n, o]) => {
    const S = BK.App.state, E = BK.Engine, HD = BK.Holding;
    const PICK = { h_ipo1: 0, h_ipo2: 0, h_ipo3: 0, h_ipo4: 1, h_ipo5: 1, h_ipo6: 2 };
    for (let i = 0; i < n; i++) {
      for (let k = 0; S.ev.pending && k < 4; k++) E.resolveEvent(S, k);
      if (S.ev.pending) S.ev.pending = null;
      if (S.chef.pending) E.chefConfirm(S, [], []);
      const R = BK.Story && BK.Story.state(S);
      if (R && R.pending) { const sc = BK.Story.pendingScene(S); const j = (sc.choices || []).findIndex((c) => BK.Story.canChoose(S, c.need) && !(c.effects || []).some((e) => e.t === 'ending')); if (j >= 0) BK.Story.resolve(S, j); else { R.seen[sc.id] = S.day; R.pending = null; } } // у бот-сохранения нет сюжетной истории: финал сюжета без концовки пропускаем
      const H = HD.state(S);
      if (H && H.pending && !o.keepScene) { const sc = HD.pendingScene(S); if (sc.id === 'h_ipo7') return { stop: 'h_ipo7', day: S.day }; let j = PICK[sc.id] || 0; if (!sc.choices[j].ok) j = sc.choices.findIndex((c) => c.ok); HD.resolve(S, j); }
      if (H && H.ipo && o.prep) {
        const P = H.ipo, inf = HD.info(S);
        if (P.stage === 'prep' && !P.auditJob && inf.auditNext && P.audit < 2) HD.buyAudit(S);
        if (P.stage === 'prep' && !P.boardJob && P.board < 1) HD.buyBoard(S);
        if (P.stage === 'prep' && !HD.listBlocks(S).length) HD.startRoadshow(S);
        if (o.until === 'public' && P.stage === 'public' && P.q.length >= (o.q || 0)) return { stop: 'public', day: S.day };
      }
      E.tick(S); S.notify = [];
      if (S.lost) return { stop: 'lost', day: S.day };
    }
    return { stop: 'n', day: S.day };
  }, [n, opts]);
}
async function start(b, vp, theme, save) {
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save, holding: true });
  await p.evaluate((t) => { BK.App.ACT.theme({ arg: t }); BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); }, theme);
  await p.waitForTimeout(300);
  await p.evaluate(() => { while (BK.App.ui.modal) BK.App.closeModal(); BK.App.ui.modalQueue.length = 0; });
  return p;
}

async function run(b, vp, theme, save, full) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await start(b, vp, theme, save);
  const pre = await p.evaluate(() => ({ won: !!BK.App.state.won, h: !!BK.App.state.holding }));
  if (!pre.won || pre.h) issues.push(`[${tag}] сохранение не то: ${JSON.stringify(pre)}`);
  // 1. открытие через 14 дней после победы — по-настоящему, через цикл игры (окно должно открыться само)
  await p.evaluate(() => { BK.App.setSpeed(10); });
  let opened = false;
  for (let i = 0; i < 80 && !opened; i++) {
    await p.waitForTimeout(150);
    opened = await p.evaluate(() => {
      const m = document.querySelector('#modal .modal');
      if (m && m.querySelector('.hd-cards')) return true;
      if (m) { // событие, шеф, сюжет — закрываем первым вариантом
        const S = BK.App.state;
        if (S.ev.pending) { for (let k = 0; S.ev.pending && k < 4; k++) BK.Engine.resolveEvent(S, k); }
        if (S.chef.pending) BK.Engine.chefConfirm(S, [], []);
        const R = BK.Story && BK.Story.state(S); if (R && R.pending) { const sc = BK.Story.pendingScene(S); const j = sc.choices.findIndex((c) => BK.Story.canChoose(S, c.need) && !(c.effects || []).some((e) => e.t === 'ending')); if (j >= 0) BK.Story.resolve(S, j); else { R.seen[sc.id] = S.day; R.pending = null; } }
        BK.App.closeModal();
      }
      return false;
    });
  }
  await p.evaluate(() => BK.App.setSpeed(0));
  if (!opened) { issues.push(`[${tag}] окно «Третий акт» не открылось само`); await p.evaluate(() => BK.HoldingUI.openChoose()); }
  const ch = await p.evaluate(() => {
    const m = document.querySelector('#modal .modal');
    return { cards: m.querySelectorAll('.hd-card').length, soon: m.querySelectorAll('.hd-card.soon').length, picks: m.querySelectorAll('[data-act="holdPick"]').length, txt: m.innerText, days: BK.App.state.holding ? BK.App.state.holding.unlockDay - BK.App.state.wonDay : null };
  });
  if (ch.cards !== 3 || ch.soon !== 2 || ch.picks !== 1) issues.push(`[${tag}] окно выбора: ${JSON.stringify({ cards: ch.cards, soon: ch.soon, picks: ch.picks })}`);
  for (const need of ['Выход на биржу', 'За рубеж', 'Франшиза-империя', 'скоро', 'Решить позже']) if (!ch.txt.toLowerCase().includes(need.toLowerCase())) issues.push(`[${tag}] в окне выбора нет «${need}»`);
  notes.push(`${tag}: третий акт открылся через ${ch.days} дн. после победы`);
  await shot(p, `${tag}-1-choose`);
  issues.push(...await layoutCheck(p, `${tag} выбор пути`, { mobile }), ...await textProblems(p, `${tag} выбор пути`));
  if (mobile) { await p.evaluate(() => { document.querySelector('#modal .modal').scrollTop = 99999; }); await shot(p, `${tag}-1b-choose-end`); }
  // 2. выбор пути «Биржа» → сцена
  await p.click('#modal [data-act="holdPick"][data-arg="ipo"]');
  await p.waitForTimeout(250);
  const sc1 = await p.evaluate(() => { const m = document.querySelector('#modal .modal'); return m ? { scene: !!m.querySelector('.hd-lines'), n: m.querySelectorAll('.hd-choice').length, px: m.querySelectorAll('canvas.pxp').length, txt: m.innerText } : null; });
  if (!sc1 || !sc1.scene || sc1.n !== 3) issues.push(`[${tag}] сцена «Витрина» не открылась: ${JSON.stringify(sc1 && { n: sc1.n })}`);
  if (sc1 && !sc1.px) issues.push(`[${tag}] в сцене нет портретов`);
  await shot(p, `${tag}-2-scene`);
  issues.push(...await layoutCheck(p, `${tag} сцена`, { mobile }), ...await textProblems(p, `${tag} сцена`));
  await p.click('#modal [data-act="holdAns"][data-arg="0"]');
  await p.waitForTimeout(250);
  // 3. окно «Биржа» — подготовка
  await p.evaluate(() => BK.App.ACT.hold()); await p.waitForTimeout(250);
  const prep = await p.evaluate(() => { const m = document.querySelector('#modal .modal'); return { txt: m.innerText, steps: m.querySelectorAll('.hd-steps li').length, rs: !!m.querySelector('[data-act="holdRoadshow"][disabled]') }; });
  for (const need of ['Подготовка', 'Аудит и отчётность', 'Совет директоров', 'Начать роадшоу', 'цель']) if (!prep.txt.toLowerCase().includes(need.toLowerCase())) issues.push(`[${tag}] в окне подготовки нет «${need}»`);
  if (!prep.rs) issues.push(`[${tag}] роадшоу доступно без подготовки`);
  await shot(p, `${tag}-3-prep`);
  issues.push(...await layoutCheck(p, `${tag} подготовка`, { mobile }), ...await textProblems(p, `${tag} подготовка`));
  // покупка аудита кнопкой
  const c0 = await p.evaluate(() => BK.App.state.cash);
  await p.click('#modal [data-act="holdAudit"]'); await p.waitForTimeout(200);
  const a1 = await p.evaluate(() => ({ job: !!BK.App.state.holding.ipo.auditJob, cash: BK.App.state.cash }));
  if (!a1.job || a1.cash >= c0) issues.push(`[${tag}] аудит не купился кнопкой`);
  if (!full) { if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`)); await p.context().close(); return; }
  await p.evaluate(() => BK.App.closeModal());
  // 4. подготовка и листинг (прокрутка в странице)
  const r1 = await adv(p, 365 * 4, { prep: true, until: 'public', q: 4 });
  notes.push(`${tag}: прокрутка до торгов и 4 отчётов — ${JSON.stringify(r1)}`);
  const pub = await p.evaluate(() => { const P = BK.App.state.holding.ipo; return { stage: P.stage, q: P.q.length, book: P.book, cap: BK.Holding.cap(P), seen: Object.keys(BK.App.state.holding.seen) }; });
  if (pub.stage !== 'public' || pub.q < 4) issues.push(`[${tag}] не дошли до торгов: ${JSON.stringify(pub)}`);
  notes.push(`${tag}: ${JSON.stringify(pub)}`);
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'dash' }); BK.App.refresh(); });
  await p.waitForTimeout(400);
  const dash = await p.evaluate(() => { const b = document.querySelector('#pbody .hdb'); if (b) b.scrollIntoView(); return b ? b.innerText : ''; });
  if (!/холдинг/i.test(dash) || !/капитализация/i.test(dash)) issues.push(`[${tag}] в «Сводке» нет блока холдинга: ${dash.slice(0, 80)}`);
  await shot(p, `${tag}-4-dash`);
  await p.evaluate(() => BK.App.ACT.hold()); await p.waitForTimeout(300);
  const info = await p.evaluate(() => document.querySelector('#modal .modal').innerText);
  for (const need of ['Капитализация', 'Цена акции', 'Обещание рынку', 'Дивиденды', 'Квартальные отчёты', 'Следующий отчёт']) if (!info.toLowerCase().includes(need.toLowerCase())) issues.push(`[${tag}] в окне торгов нет «${need}»`);
  await shot(p, `${tag}-5-public`);
  issues.push(...await layoutCheck(p, `${tag} торги`, { mobile }), ...await textProblems(p, `${tag} торги`));
  await p.evaluate(() => { document.querySelector('#modal .modal').scrollTop = 99999; }); await shot(p, `${tag}-5b-public-end`);
  // прогноз кнопкой
  await p.click('#modal [data-act="holdGuide"][data-arg="high"]').catch(() => {});
  const g = await p.evaluate(() => BK.App.state.holding.ipo.guide);
  if (g !== 'high') issues.push(`[${tag}] прогноз не переключился: ${g}`);
  await p.evaluate(() => BK.App.closeModal());
  // строка в отчёте
  const rep = await p.evaluate(() => { BK.App.ACT.tab({ arg: 'fin' }); BK.App.refresh(); return document.querySelector('#pbody').innerText; });
  if (!/Биржа и холдинг/.test(rep)) notes.push(`${tag}: строки «Биржа и холдинг» во вкладке не видно (отчёт месяца в другом окне)`);
  // 5. цель: снижаем порог, чтобы не крутить годы, — сцена «Колокол»
  await p.evaluate(() => { BK.CFG.HOLDING.IPO.GOAL_CAP = 1e6; });
  const r2 = await adv(p, 70, {});
  if (r2.stop !== 'h_ipo7') issues.push(`[${tag}] сцена «Колокол» не пришла: ${JSON.stringify(r2)}`);
  await p.evaluate(() => BK.App.ACT.holdScene()); await p.waitForTimeout(300);
  const bell = await p.evaluate(() => { const m = document.querySelector('#modal .modal'); return m ? m.innerText : ''; });
  if (!/колокол/i.test(bell)) issues.push(`[${tag}] окно «Колокол» не открылось`);
  await shot(p, `${tag}-6-bell`);
  issues.push(...await layoutCheck(p, `${tag} колокол`, { mobile }), ...await textProblems(p, `${tag} колокол`));
  notes.push(`${tag}: до «Колокола» — ${JSON.stringify(r2)}; окно: ${bell.slice(0, 60).replace(/\s+/g, ' ')}`);
  if (!(await p.$('#modal [data-act="holdAns"][data-arg="2"]'))) { issues.push(`[${tag}] нет кнопок сцены «Колокол»`); await p.context().close(); return; }
  await p.click('#modal [data-act="holdAns"][data-arg="2"]'); await p.waitForTimeout(400);
  const end = await p.evaluate(() => ({ lost: BK.App.state.lost, e: BK.App.state.storyEnding, txt: (document.querySelector('#modal .modal') || {}).innerText || '' }));
  if (!end.lost || end.e !== 'ipo' || !/публичная компания/i.test(end.txt)) issues.push(`[${tag}] концовка не показана: ${JSON.stringify({ lost: end.lost, e: end.e, t: end.txt.slice(0, 60) })}`);
  await shot(p, `${tag}-7-ending`);
  await p.evaluate(() => BK.App.ACT.summary()); await p.waitForTimeout(500);
  const sum = await p.evaluate(() => { const s = document.querySelector('#modal .hd-sum'); if (s) s.scrollIntoView(); return s ? s.innerText : ''; });
  if (!/холдинг/i.test(sum) || !/публичная компания/i.test(sum)) issues.push(`[${tag}] в итогах нет раздела «Холдинг»: ${sum.slice(0, 80)}`);
  await shot(p, `${tag}-8-summary`);
  issues.push(...await textProblems(p, `${tag} итоги`));
  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  log('Сохранение ботом (good --corp до победы)…');
  const save = JSON.stringify(botSave());
  log(`  ${Math.round(save.length / 1024)} КБ`);
  const b = await chromium.launch();
  for (const [vp, theme, full] of [['d1440', 'light', true], ['m390', 'dark', true], ['d1440', 'dark', false], ['m390', 'light', false]]) {
    log(`— ${vp} ${theme}`);
    await run(b, vp, theme, save, full);
  }
  await b.close();
  const txt = [`Проблем: ${issues.length}`, ...issues, '', 'Заметки:', ...notes].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log(txt);
  process.exit(issues.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
