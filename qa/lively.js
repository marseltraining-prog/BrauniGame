/* QA: «живость» — этап В2 (vision-plan §4 п. 2–4). Вехи (блок в «Сводке», окно, прогресс, награда, смена вехи),
   «Что говорят гости» за неделю, звук (кнопка в HUD и переключатель в «Меню игры», звуки не ломают игру),
   монетки на 1-е число, тосты всех трёх видов, старое сохранение без S.miles/S.thoughts и выключенные вехи.
   Экраны 1440 / 390 / 360, светлая и тёмная тема. Запуск: node qa/lively.js [папка=qa/shots/lively]
   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/lively';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}
function plainSave(st) { // сохранение до этапа В2: ни вех, ни мыслей гостей
  const c = JSON.parse(JSON.stringify(st)); delete c.miles; delete c.thoughts; return c;
}
// в странице: снять «зависшие» решения (иначе E.tick ничего не делает) и прокрутить N дней
const SETTLE = `(S, n) => { const E = BK.Engine; const clear = () => { for (let g = 0; g < 50 && (S.ev.pending || S.chef.pending); g++) { if (S.ev.pending) E.resolveEvent(S, 0); else E.chefConfirm(S, [], []); } }; clear(); for (let i = 0; i < (n || 1); i++) { if (!E.tick(S)) { clear(); if (!E.tick(S)) break; } } }`;
async function settle(p, n) { await p.evaluate(`(${SETTLE})(BK.App.state, ${n || 1})`); }

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
  await p.waitForTimeout(250);
  await p.evaluate(() => { if (BK.App.ui.modal) BK.App.closeModal(); });
  // сохранение бота сгенерировано без вех (в sim/load.js они выключены) — прокручиваем пару дней, чтобы веха выдалась
  await settle(p, 3);
  // за 3 дня веха могла успеть взяться (например, «резерв» закрылся 1-го числа) — тогда берём следующую
  await p.evaluate(() => {
    const S = BK.App.state;
    if (!S.miles.cur) { S.miles.nextDay = S.day; BK.Miles.issue(S); }
    if (BK.App.ui.modal) BK.App.closeModal();
  });
  await p.waitForTimeout(120);
  return p;
}
async function shot(p, name, sel) {
  const el = sel ? await p.$(sel) : null;
  if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(80); }
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}

async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await start(b, vp, theme, sv);
  // 1. «Сводка»: блок вехи и «что говорят гости»
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' })); await p.waitForTimeout(200);
  const dash = await p.evaluate(() => ({
    mil: !!document.querySelector('#milBlock'), talk: !!document.querySelector('#talkBlock'),
    milTxt: ((document.querySelector('#milBlock') || {}).innerText || ''),
    ready: BK.Thoughts.ready(BK.App.state), cur: !!(BK.App.state.miles && BK.App.state.miles.cur),
  }));
  if (!dash.mil) issues.push(`[${tag}] в «Сводке» нет блока «Вехи»`);
  if (!dash.talk) issues.push(`[${tag}] в «Сводке» нет блока «Что говорят гости»`);
  if (!dash.cur) issues.push(`[${tag}] веха не выдалась за первые дни игры`);
  if (dash.mil && dash.cur && !/ещё \d+ (день|дня|дней)/.test(dash.milTxt)) issues.push(`[${tag}] в вехе нет срока: ${dash.milTxt.replace(/\s+/g, ' ').slice(0, 90)}`);
  if (dash.mil && dash.cur && !/%|₽|дн\.|чел\.|точ\.|★/.test(dash.milTxt)) issues.push(`[${tag}] в вехе нет прогресса: ${dash.milTxt.replace(/\s+/g, ' ').slice(0, 90)}`);
  await shot(p, `dash-${tag}`, '#milBlock');
  issues.push(...await layoutCheck(p, `${tag} сводка`, { mobile }), ...await textProblems(p, `${tag} сводка`));
  // 2. окно «Вехи»: открывается, перечисляет виды, меняет веху
  const before = await p.evaluate(() => { BK.App.ACT.miles(); return BK.App.state.miles.cur ? BK.App.state.miles.cur.k + ':' + BK.App.state.miles.cur.at : null; });
  await p.waitForTimeout(250);
  const modal = await p.evaluate(() => ({
    open: !!document.querySelector('#modal .mil-modal'),
    groups: document.querySelectorAll('#modal .mil-g').length,
    kinds: document.querySelectorAll('#modal .mil-k').length,
    hasOther: !!document.querySelector('#modal [data-act="milesOther"]'),
    hasOn: !!document.querySelector('#modal [data-act="milesOn"]'),
  }));
  if (!modal.open) issues.push(`[${tag}] окно «Вехи» не открылось`);
  if (modal.groups < 4 || modal.kinds < 8) issues.push(`[${tag}] в окне «Вехи» мало видов: групп ${modal.groups}, видов ${modal.kinds}`);
  if (!modal.hasOther || !modal.hasOn) issues.push(`[${tag}] в окне «Вехи» нет кнопок «другая веха» / выключателя`);
  await shot(p, `modal-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} окно вех`, { mobile }), ...await textProblems(p, `${tag} окно вех`));
  if (modal.hasOther) {
    await p.click('#modal [data-act="milesOther"]'); await p.waitForTimeout(300);
    const after = await p.evaluate(() => (BK.App.state.miles.cur ? BK.App.state.miles.cur.k + ':' + BK.App.state.miles.cur.at : null));
    if (!after) issues.push(`[${tag}] после «Взять другую веху» вехи нет`);
    notes.push(`${tag}: веха ${before} → ${after}`);
    await p.evaluate(() => BK.App.closeModal()); await p.waitForTimeout(150);
  }
  // 3. звук: кнопка в HUD и переключатель в «Меню игры»
  const snd = await p.evaluate(() => {
    const had = BK.Sound.on;
    const b = document.querySelector('.hud [data-act="sound"]');
    const iconBefore = b ? b.innerHTML.length : 0;
    b.click(); const off = BK.Sound.on;
    b.click(); const back = BK.Sound.on;
    return { had, off, back, iconBefore, iconAfter: b.innerHTML.length, played: BK.Sound.play('coin'), pressed: b.getAttribute('aria-pressed') };
  });
  if (!snd.had) issues.push(`[${tag}] звук по умолчанию выключен (задумано: тихий, но включённый)`);
  if (snd.off !== false || snd.back !== true) issues.push(`[${tag}] кнопка звука в HUD не переключает: ${JSON.stringify(snd)}`);
  if (!snd.iconBefore || !snd.iconAfter) issues.push(`[${tag}] у кнопки звука нет значка`);
  if (snd.pressed !== 'true') issues.push(`[${tag}] кнопка звука не отражает состояние: ${snd.pressed}`);
  await p.evaluate(() => BK.App.ACT.settings()); await p.waitForTimeout(250);
  const set = await p.evaluate(() => ({
    row: !!document.querySelector('#modal .snd-row'), btns: document.querySelectorAll('#modal [data-act="sndSet"]').length,
    on: document.querySelector('#modal [data-snd="1"]') ? document.querySelector('#modal [data-snd="1"]').getAttribute('aria-pressed') : null,
  }));
  if (!set.row || set.btns < 2) issues.push(`[${tag}] в «Меню игры» нет переключателя звука: ${JSON.stringify(set)}`);
  if (set.on !== 'true') issues.push(`[${tag}] переключатель звука в меню не синхронизирован: ${set.on}`);
  await shot(p, `settings-${tag}`, '#modal .snd-row');
  issues.push(...await layoutCheck(p, `${tag} меню игры`, { mobile }), ...await textProblems(p, `${tag} меню игры`));
  await p.evaluate(() => BK.App.closeModal()); await p.waitForTimeout(150);
  // 4. веха выполняется: счётчик, награда и запись в журнале
  const done = await p.evaluate((settleSrc) => {
    const S = BK.App.state; BK.App.setSpeed(0);
    S.miles.cur = { k: 'guests', at: S.day - 1, until: S.day + 10, need: 0, base: 0, got: 0, spot: null, num: 0, best: 0 };
    const n0 = S.miles.n;
    eval(settleSrc)(S, 1);
    const mod = (S.mods || []).filter((m) => m.src === 'mile' && m.until > S.day);
    return { n0, n: S.miles.n, mods: mod.length, log: (S.log.find((x) => /Веха/.test(x.text)) || {}).text || '', cur: S.miles.cur ? S.miles.cur.k : null };
  }, `(${SETTLE})`);
  if (done.n !== done.n0 + 1) issues.push(`[${tag}] веха не засчиталась: ${JSON.stringify(done)}`);
  if (!done.mods) issues.push(`[${tag}] за веху не выдана награда`);
  if (!/Веха взята/.test(done.log)) issues.push(`[${tag}] в журнале нет записи о вехе: ${done.log.slice(0, 70)}`);
  // 4б. тост «веха взята» приходит из обычного цикла игры
  await p.evaluate((settleSrc) => {
    const S = BK.App.state;
    if (BK.App.ui.modal) BK.App.closeModal();
    eval(settleSrc)(S, 1);
    S.miles.cur = { k: 'guests', at: S.day - 1, until: S.day + 10, need: 0, base: 0, got: 0, spot: null, num: 0, best: 0 };
    BK.App.setSpeed(1);
  }, `(${SETTLE})`);
  await p.waitForTimeout(1300);
  const toasts = await p.evaluate(() => { BK.App.setSpeed(0); return [...document.querySelectorAll('#toasts .miltoast')].map((t) => t.className + ' | ' + t.innerText.replace(/\s+/g, ' ').slice(0, 70)); });
  if (!toasts.some((t) => /miltoast done/.test(t))) issues.push(`[${tag}] нет тоста «веха взята»: ${JSON.stringify(toasts)}`);
  else notes.push(`${tag}: тост — ${toasts.find((t) => /done/.test(t))}`);
  // 4в. тосты «новая веха» и «веха не вышла» — напрямую
  const other = await p.evaluate(() => {
    document.querySelectorAll('#toasts .miltoast').forEach((t) => t.remove());
    BK.LivelyUI.mileNotify({ phase: 'new', id: 'guests' });
    BK.LivelyUI.mileNotify({ phase: 'fail', id: 'guests', title: 'Проба' });
    return [...document.querySelectorAll('#toasts .miltoast')].map((t) => t.className);
  });
  if (!other.some((c) => /new/.test(c)) || !other.some((c) => /fail/.test(c))) issues.push(`[${tag}] тосты «новая веха» / «не вышла» не показаны: ${JSON.stringify(other)}`);
  await p.evaluate(() => document.querySelectorAll('#toasts .miltoast').forEach((t) => t.remove()));
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'log' })); await p.waitForTimeout(200);
  const jlog = await p.evaluate(() => document.querySelector('#pbody').innerText);
  if (!/Веха/.test(jlog)) issues.push(`[${tag}] в «Журнале» не видно вех`);
  await shot(p, `log-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} журнал`, { mobile }), ...await textProblems(p, `${tag} журнал`));
  // 5. монетки на 1-е число
  const coins = await p.evaluate(() => { BK.LivelyUI.monthFx(1000000); return document.querySelectorAll('#coins .coin').length; });
  if (!coins) issues.push(`[${tag}] монетки на 1-е число не появились`);
  // 6. новая веха приходит сама, когда придёт срок
  const auto = await p.evaluate((settleSrc) => {
    const S = BK.App.state; S.miles.cur = null; S.miles.nextDay = S.day;
    eval(settleSrc)(S, 3);
    return S.miles.cur ? S.miles.cur.k : null;
  }, `(${SETTLE})`);
  if (!auto) issues.push(`[${tag}] новая веха не выдаётся сама`);
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'dash' }); BK.App.refresh(); }); await p.waitForTimeout(200);
  await shot(p, `coins-${tag}`, '#milBlock');
  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  log('генерирую сохранения ботом…');
  const sv = botSave(4, 7919);
  notes.push(`бот 4 года: точек ${sv.stores.length}`);
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { log(vp, theme); await screens(b, vp, theme, sv); }
  // старое сохранение (до этапа В2): вехи и мысли создаются по умолчанию, игра идёт
  {
    const tag = 'старое сохранение';
    const p = await start(b, 'd1440', 'light', plainSave(sv));
    const r = await p.evaluate((settleSrc) => {
      const S = BK.App.state, d0 = S.day;
      eval(settleSrc)(S, 30);
      BK.App.refresh();
      return { miles: !!S.miles, th: !!S.thoughts, days: S.day - d0, cur: !!(S.miles && S.miles.cur), n: S.miles ? S.miles.n : 0, fail: S.miles ? S.miles.fail : 0, blk: !!document.querySelector('#milBlock'), talk: !!document.querySelector('#talkBlock') };
    }, `(${SETTLE})`);
    if (!r.miles || !r.th) issues.push(`[${tag}] состояние живости не создалось: ${JSON.stringify(r)}`);
    if (!(r.days > 0)) issues.push(`[${tag}] игра не идёт: ${JSON.stringify(r)}`);
    if (!r.cur && !(r.n + r.fail > 0)) issues.push(`[${tag}] вехи не выдавались за 30 дней: ${JSON.stringify(r)}`);
    if (!r.blk || !r.talk) issues.push(`[${tag}] блоков живости нет: ${JSON.stringify(r)}`);
    issues.push(...await textProblems(p, tag));
    if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
    await p.context().close();
  }
  // выключенные вехи: блок не показывается, вехи не выдаются
  {
    const tag = 'вехи выключены';
    const p = await start(b, 'd1440', 'light', sv);
    const r = await p.evaluate((settleSrc) => {
      const S = BK.App.state; BK.Miles.setOn(S, false); BK.App.refresh();
      const blk = !!document.querySelector('#milBlock');
      S.miles.cur = null; S.miles.nextDay = S.day;
      eval(settleSrc)(S, 5);
      return { blk, cur: !!S.miles.cur };
    }, `(${SETTLE})`);
    if (r.blk) issues.push(`[${tag}] блок «Вехи» показан при выключенных вехах`);
    if (r.cur) issues.push(`[${tag}] веха выдалась при выключенных вехах`);
    if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
    await p.context().close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), notes.concat(issues).join('\n') + '\n');
  log(notes.join('\n'));
  log(issues.length ? issues.join('\n') : '');
  log(`Итог: ${issues.length} проблем, ${issues.filter((x) => /PAGEERR|CONSOLE/.test(x)).length} ошибок консоли`);
  process.exit(issues.length ? 1 : 0);
})();
