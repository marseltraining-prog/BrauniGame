/* QA: нити истории (docs/story-v2.md, часть 1) — блок «Вас помнят» в «Сводке», строка в «Требует внимания»
   с кнопкой «Подробнее», окно-реестр, журнал, летопись в итогах игры, старые сохранения без S.threads.
   Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/threads.js [папка=qa/shots/threads]   Итог — <папка>/issues.txt, код выхода 1 при проблемах.
   ВАЖНО: сценарий браузерный и тяжёлый — запускать по одному (не параллельно с другими qa/*). */
process.env.BK_THREADS = process.env.BK_THREADS || '1';   // готовим сохранение тем же кодом, что играет игрок
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/threads';
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const log = (...a) => console.log(...a);

/* Сохранение для сценария: сильный бот до второго акта, вход в Казань, три нити —
   отозвавшаяся обида (инспектор), ожидающая благодарность и прошедшее обещание. */
function botSave() {
  const BK = require('../sim/load');
  const E = BK.Engine, T = BK.Threads;
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed: 7919, years: 12 });
  const S = r.S;
  if (!S.corp) throw new Error('сохранение для QA не собралось: нет второго акта');
  const en = E.enterCity(S, 'kazan');
  if (!en.ok) throw new Error('сохранение для QA не собралось: ' + en.msg);
  T.demo = false;                                     // нити кладём руками — сценарий должен быть предсказуем
  // летопись: сюжетное состояние должно существовать до записи нитей, иначе в летопись писать некуда
  if (!S.story) { BK.CFG.STORY.ON = true; BK.Story.ensure(S); }
  // 1) обида отозвалась: в Казани открытие дольше на 29 дней (50 вместо 21) — до +540 дней
  const insp = T.add(S, { who: 'Рустам Ахметов', role: 'пожарный инспектор', kind: 'grudge', city: 'kazan', due: S.day, effect: { openK: 2.4, days: 540, text: 'тянет с разрешениями и приёмкой' } });
  T.fire(S);
  // 2) благодарность ждёт своего дня
  T.add(S, { who: 'Азамат Хайруллин', role: 'поставщик муки', kind: 'favor', city: 'kazan', after: 120, effect: { openK: 0.8, days: 365, text: 'ускоряет приёмку' } });
  // 3) обещание уже отозвалось и прошло
  T.add(S, { who: 'Марат Гайнуллин', role: 'знакомый по рынку', kind: 'promise', text: 'вернусь с деньгами', due: S.day - 30, effect: { fx: [{ t: 'cash', v: 1e6 }], text: 'вернул долг' } });
  T.fire(S);
  T.refresh(S);
  const c = Object.assign({}, S);
  delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  c.day = insp.due;                                   // точка отсчёта: нить уже давит, срок не вышел
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = ((document.querySelector('#pbody') || {}).innerText || '') + ' ' + ((document.querySelector('#modal .modal') || {}).innerText || '');
    return (t.match(/.{0,30}(NaN|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function start(b, vp, theme, save) {
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save: JSON.stringify(save) });
  await p.evaluate((t) => { BK.App.ACT.theme({ arg: t }); BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); }, theme);
  await p.waitForTimeout(300);
  await p.evaluate(() => { BK.App.ui.modalQueue.length = 0; if (BK.App.ui.modal) BK.App.closeModal(); });
  return p;
}
async function shot(p, name, sel) {
  const el = sel ? await p.$(sel) : null;
  if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(80); }
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}

async function screens(b, vp, theme, save) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await start(b, vp, theme, save);
  // 1. нить на месте в состоянии
  const st = await p.evaluate(() => {
    const S = BK.App.state, T = BK.Threads;
    return { n: T.list(S).length, gap: T.openGap(S, 'kazan'), days: T.openDays(S, 'kazan'), base: T.base(), att: T.attItems(S).map((x) => ({ t: x.t, d: x.d, lvl: x.lvl })) };
  });
  if (st.n !== 3) issues.push(`[${tag}] в реестре ${st.n} нитей вместо 3`);
  if (Math.abs(st.gap - 2.4) > 1e-9 || st.days !== 50) issues.push(`[${tag}] срок открытия в Казани ${st.days} дн. (множитель ${st.gap}) вместо 50`);
  if (!st.att.length || !/Вас помнит пожарный инспектор/.test(st.att.map((x) => x.t).join(' '))) issues.push(`[${tag}] в «Требует внимания» нет строки про инспектора: ${JSON.stringify(st.att)}`);

  // 2. блок «Вас помнят» в «Сводке»
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' })); await p.waitForTimeout(250);
  const blk = await p.evaluate(() => {
    const el = document.querySelector('.thr-block');
    return { has: !!el, txt: el ? el.innerText : '', btn: !!document.querySelector('.thr-block [data-act="threads"]') };
  });
  if (!blk.has) issues.push(`[${tag}] в «Сводке» нет блока «Вас помнят»`);
  else {
    if (!/Вас помнят/.test(blk.txt)) issues.push(`[${tag}] блок без заголовка: ${blk.txt.slice(0, 80)}`);
    if (!/50 вместо 21/.test(blk.txt)) issues.push(`[${tag}] в блоке нет цены последствия: ${blk.txt.slice(0, 160)}`);
    if (!blk.btn) issues.push(`[${tag}] в блоке нет кнопки «Подробнее»`);
  }
  await shot(p, `dash-${tag}`, '.thr-block');
  issues.push(...await layoutCheck(p, `${tag} сводка`, { mobile }), ...await textProblems(p, `${tag} сводка`));

  // 3. строка в «Требует внимания»
  const att = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.sec.att .it')];
    const el = rows.find((x) => /Вас помнит/.test(x.innerText));
    return el ? { txt: el.innerText.replace(/\s+/g, ' '), btn: !!el.querySelector('button') } : null;
  });
  if (!att) issues.push(`[${tag}] в «Требует внимания» нет строки «Вас помнит …»`);
  else { if (!att.btn) issues.push(`[${tag}] у строки нет кнопки «Подробнее»`); if (att.btn && !/Подробнее/.test(att.txt)) issues.push(`[${tag}] кнопка строки не «Подробнее»: ${att.txt.slice(0, 120)}`); }
  await shot(p, `att-${tag}`, '.sec.att');

  // 4. окно-реестр (по кнопке «Подробнее»)
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-act="threads"]')].pop(); if (b) b.click(); });
  await p.waitForTimeout(300);
  const win = await p.evaluate(() => {
    const m = document.querySelector('#modal .modal');
    return m ? { open: true, txt: m.innerText.replace(/\s+/g, ' '), cards: m.querySelectorAll('.thr-card').length } : { open: false };
  });
  if (!win.open) issues.push(`[${tag}] окно реестра не открылось по кнопке «Подробнее»`);
  else {
    if (win.cards !== 3) issues.push(`[${tag}] в окне ${win.cards} записей вместо 3`);
    for (const s of ['Помнят сейчас', 'Отзовётся', 'Уже отозвалось']) if (!win.txt.includes(s)) issues.push(`[${tag}] в окне нет раздела «${s}»`);
    if (!/50 вместо 21/.test(win.txt)) issues.push(`[${tag}] в окне нет «50 вместо 21»`);
    if (!/пожарный инспектор/.test(win.txt)) issues.push(`[${tag}] в окне нет роли человека`);
  }
  await shot(p, `modal-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} окно реестра`, { mobile }), ...await textProblems(p, `${tag} окно`));
  await p.evaluate(() => { if (BK.App.ui.modal) BK.App.closeModal(); });

  // 5. журнал: нить записана
  const jr = await p.evaluate(() => {
    BK.App.ACT.tab({ arg: 'log' });
    const t = (document.querySelector('#pbody') || {}).innerText || '';
    return /Вас помнит|Отозвалось/.test(t);
  });
  if (!jr) issues.push(`[${tag}] в журнале нет записей о нитях`);

  // 6. итоги игры: раздел «История» помнит людей
  const sum = await p.evaluate(() => {
    BK.App.ACT.summary();
    const t = (document.querySelector('#modal .modal') || {}).innerText || '';
    BK.App.closeModal();
    return t;
  });
  if (!/Вас помнит/.test(sum)) issues.push(`[${tag}] на экране итогов игры нет «Вас помнит …»`);
  await p.evaluate(() => { BK.App.ACT.summary(); }); await p.waitForTimeout(200);
  await shot(p, `summary-${tag}`);
  await p.evaluate(() => { BK.App.closeModal(); });

  // 7. 1 день игры: срок не сломался, ошибок нет
  await p.evaluate(() => { BK.Engine.tick(BK.App.state); BK.App.refresh(); });
  await p.waitForTimeout(120);
  if (p.errs.length) issues.push(`[${tag}] ошибки консоли: ${p.errs.slice(0, 3).join(' | ')}`);
  await p.context().close();
}

(async () => {
  const save = botSave();
  log(`сохранение собрано: нитей ${save.threads.list.length}, день ${save.day}`);
  const b = await chromium.launch();
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) await screens(b, vp, theme, save);
  await b.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.length ? issues.join('\n') : 'Проблем нет.');
  console.log(issues.length ? `ПРОБЛЕМ: ${issues.length}\n` + issues.join('\n') : '\nПроблем нет.');
  process.exitCode = issues.length ? 1 : 0;
})();
