/* Третий акт «Холдинг» (src/holding.js): проверки механики и бот, который доходит до цели пути «Биржа».
   node sim/holding.js [сидов=3] [лет=36] [--quiet]
   1) утверждения: выключатель, открытие после победы, выбор пути, «скоро», сцены, подготовка, роадшоу,
      оценка, квартальный отчёт, сохранение/загрузка, старое сохранение, финал сюжета ждёт третий акт;
   2) бот good --corp + стратегия холдинга: через сколько лет после открытия третьего акта взята цель.
   Код выхода 1 — если есть провалы. */
process.env.BK_HOLDING = '1';
const BK = require('./load');
const { play } = require('./bot');
const E = BK.Engine, HD = BK.Holding, CFG = BK.CFG;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const QUIET = process.argv.includes('--quiet');
const SEEDS = +(args[0] || 3), YEARS = +(args[1] || 36);
let ok = 0, bad = 0;
const check = (cond, text) => { if (cond) { ok++; if (!QUIET) console.log('  ✓ ' + text); } else { bad++; console.log('  ✗ ' + text); } };
const y = (d) => +(d / 365).toFixed(1);

/* ---------- стратегия бота для холдинга ---------- */
const PICK = { h_ipo1: 0, h_ipo2: 0, h_ipo3: 0, h_ipo4: 1, h_ipo5: 1, h_ipo6: 2, h_ipo7: 2 };
function holdBot(S, mem) {
  const H = HD.state(S); if (!H || H.ending) return;
  const m = mem.hold || (mem.hold = { unlock: H.unlockDay, scenes: [] });
  if (H.pending) {
    const sc = HD.pendingScene(S);
    let i = PICK[sc.id] != null ? PICK[sc.id] : 0;
    if (!sc.choices[i].ok) i = sc.choices.findIndex((c) => c.ok);
    const r = HD.resolve(S, i);
    m.scenes.push(sc.id);
    if (r.ending) m.end = S.day;
    return;
  }
  if (!H.path) { HD.choose(S, 'ipo'); m.choose = S.day; return; }
  const P = H.ipo; if (!P) return;
  if (P.stage === 'prep') {
    const inf = HD.info(S);
    if (!P.auditJob && inf.auditNext && P.audit < 3 && S.cash > inf.auditNext.cost * 3) HD.buyAudit(S);
    if (!P.boardJob && inf.boardNext && P.board < 2 && S.cash > inf.boardNext.cost * 3) HD.buyBoard(S);
    if (!P.auditJob && P.audit >= 3 && !HD.listBlocks(S).length) { HD.setFloat(S, 0.2); HD.startRoadshow(S); m.roadshow = S.day; }
  }
  if (P.stage === 'public') {
    if (!m.list) m.list = P.listDay;
    if (E.dateOf(S.day).d === 15) {     // прогноз — по тому, как растёт выручка
      const g = HD.figures(S).growth;
      HD.setGuide(S, g > 0.2 ? 'high' : g > 0.1 ? 'mid' : (P.boardWho === 'elvira' ? 'mid' : 'low'));
    }
    if (P.goalDay && !m.goal) m.goal = P.goalDay;
  }
}

/* ---------- 1. бот-прогоны ---------- */
console.log(`# Холдинг: бот good --corp + путь «Биржа», ${SEEDS} сид(а) × ${YEARS} лет`);
const rows = [];
let sample = null;
for (let s = 1; s <= SEEDS; s++) {
  const r = play({ seed: s * 7919, level: 'good', years: YEARS, corp: true, corpOpt: { level: 'good' }, onDay: (S, P, mem) => holdBot(S, mem) });
  const S = r.S, H = HD.state(S), m = r.mem.hold || {}, P = H && H.ipo;
  rows.push({
    seed: s, win: r.won ? r.won.year : null, unlock: H ? y(H.unlockDay) : null,
    list: P && P.listDay != null ? y(P.listDay) : null, goal: P && P.goalDay ? y(P.goalDay) : null, end: m.end ? y(m.end) : null,
    'лет после открытия': P && P.goalDay ? +((P.goalDay - H.unlockDay) / 365).toFixed(1) : null,
    book: P ? P.book : null, cover: P ? P.cover : null, 'привлекли, млрд': P ? +(P.raised / 1e9).toFixed(1) : null,
    'кап., млрд': P ? +(HD.cap(P) / 1e9).toFixed(1) : null, beats: P ? P.beats : null, inline: P ? P.inline : null, misses: P ? P.misses : null,
    ending: S.storyEnding || null, scenes: (m.scenes || []).length,
  });
  if (!sample && P) sample = { S, r };
}
console.table(rows);
const after = rows.map((r) => r['лет после открытия']).filter((x) => x != null).sort((a, b) => a - b);
console.log(`цель «100 млрд» взята: ${after.length}/${rows.length}; лет после открытия третьего акта — медиана ${after.length ? after[Math.floor(after.length / 2)] : '—'} (${after.join(' / ')})`);
check(after.length === rows.length, 'бот доходит до цели пути «Биржа» во всех сидах');
check(rows.every((r) => !r.goal || r.ending === 'ipo'), 'после цели — сцена «Колокол» и концовка «Публичная компания»');
check(rows.every((r) => r.scenes >= 6), 'бот прошёл не меньше шести сцен пути');

/* ---------- 2. утверждения по механике (на состоянии из бот-партии до открытия) ---------- */
console.log('\n# Механика');
// партия до победы: те же сиды, останавливаемся сразу после победы
const base = play({ seed: 7919, level: 'good', years: 30, corp: true, corpOpt: { level: 'good' }, stopWhen: (S) => S.won && S.day >= S.wonDay + 1 });
const W = base.S;
check(W.won && !W.holding, 'в день победы третий акт ещё не открыт');
const clone = (S) => { const c = JSON.parse(JSON.stringify(Object.assign({}, S, { cache: undefined }))); c.cache = {}; return c; };
const tickN = (S, n) => { for (let i = 0; i < n; i++) { S.notify.length = 0; if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); E.tick(S); } };
// выключатель
{
  const S = clone(W); CFG.HOLDING.ON = false; tickN(S, 40); CFG.HOLDING.ON = true;
  check(!S.holding, 'HOLDING.ON = false — состояние не создаётся');
}
const S = clone(W);
tickN(S, CFG.HOLDING.UNLOCK_DELAY + 2);
const H = HD.state(S);
check(!!H && H.unlockDay - W.wonDay >= CFG.HOLDING.UNLOCK_DELAY, `третий акт открылся через ${H ? H.unlockDay - W.wonDay : '—'} дн. после победы`);
check(HD.holdsFinale(S), 'путь не выбран — финал сюжета ждёт');
check(!HD.choose(S, 'abroad').ok && !HD.choose(S, 'franchise').ok, '«За рубеж» и «Франшиза-империя» пока не выбрать («скоро»)');
check(HD.choose(S, 'ipo').ok && H.path === 'ipo' && ((H.pending && H.pending.id === 'h_ipo1') || H.queue.some((q) => q.id === 'h_ipo1')), 'выбран путь «Биржа» — сцена «Витрина для всей страны»');
for (let i = 0; i < 30 && !H.pending; i++) tickN(S, 1);   // сцена ждёт, пока закроется событие дня
check(!HD.choose(S, 'ipo').ok, 'второй раз путь не выбрать');
check(HD.listBlocks(S).length > 0, 'без аудита и совета на биржу нельзя');
HD.resolve(S, 0);
check(H.ipo.approach === 'bank', 'подход «банк под ключ» записан');
const cash0 = S.cash, c1 = HD.buyAudit(S);
check(c1.ok && Math.abs(cash0 - S.cash - c1.cost) < 1 && !!H.ipo.auditJob, `аудит 1-го уровня оплачен (${(c1.cost / 1e6).toFixed(0)} млн) и идёт`);
check(!HD.buyAudit(S).ok, 'второй аудит, пока идёт первый, — нельзя');
const b1 = HD.buyBoard(S);
check(b1.ok && H.queue.concat(H.pending ? [H.pending] : []).some((q) => q.id === 'h_ipo3'), 'совет директоров — сцена «Кого позвать в совет»');
// прогоняем подготовку ботом
const memX = {};
for (let i = 0; i < 365 * 3 && H.ipo.stage !== 'public'; i++) { holdBot(S, memX); tickN(S, 1); }
check(H.ipo.stage === 'public' && H.ipo.listDay != null, `листинг: ${H.ipo.book}, спрос ×${H.ipo.cover}, привлекли ${(H.ipo.raised / 1e9).toFixed(1)} млрд`);
check(H.ipo.raised > 0 && H.ipo.own === 1 - H.ipo.float, 'деньги размещения пришли, ваша доля = 1 − проданная');
check(H.seen.h_ipo2 != null && H.seen.h_ipo3 != null && H.seen.h_ipo4 != null, 'сцены аудита, совета и роадшоу пройдены');
// оценка: больше прибыли — дороже
{
  const v0 = HD.valuation(S).fair;
  const T = clone(S); for (const x of T.history.slice(-12)) x.profit *= 1.5;
  check(HD.valuation(T).fair > v0 * 1.3, 'оценка растёт с прибылью');
  const T2 = clone(S); T2.holding.ipo.audit = 0; T2.holding.ipo.board = 0;
  check(HD.valuation(T2).fair < v0, 'без аудита и совета оценка ниже');
}
// квартальный отчёт: подгоняем выручку квартала
{
  const T = clone(S); T.holding.pending = null; T.holding.queue = [];
  const P = T.holding.ipo; P.guide = 'mid'; P.listDay = T.day - 400;
  // ближайшее 1-е число квартала
  let n = 0; while (!(E.dateOf(T.day + n + 1).d === 1 && E.dateOf(T.day + n + 1).m % 3 === 0)) n++;
  tickN(T, n);
  const h = T.history; for (const x of h.slice(-15, -12)) x.rev = 1e9;
  const hb = clone(T);
  h.slice(-2).forEach((x) => { x.rev = 2e9; x.profit = Math.abs(x.profit); });
  const q0 = P.q.length, m0 = P.mood; tickN(T, 1);
  check(P.q.length === q0 + 1 && P.q[P.q.length - 1].res === 'beat' && P.mood > m0 * 0.99, 'выручка выше обещанного — «обещание выполнено», настроение рынка вверх');
  const P2 = hb.holding.ipo; hb.history.slice(-2).forEach((x) => { x.rev = 0.2e9; }); const mb = P2.mood; tickN(hb, 1);
  const last = P2.q[P2.q.length - 1];
  check(last && last.res === 'miss' && P2.mood < mb, 'выручка ниже — «промах», цена вниз');
  check(hb.holding.pending && hb.holding.pending.id === 'h_ipo6' || hb.holding.queue.some((q) => q.id === 'h_ipo6') || hb.holding.seen.h_ipo6 != null, 'первый промах — «Звонок из фонда»');
}
// прогноз: Эльвира не подпишет осторожный
{
  const T = clone(S); T.holding.ipo.boardWho = 'elvira';
  check(!HD.setGuide(T, 'low').ok && HD.setGuide(T, 'high').ok, 'с Эльвирой в совете «осторожный» прогноз недоступен');
}
// сохранение / загрузка: две копии идут одинаково
{
  const A = clone(S), B = JSON.parse(JSON.stringify(A)); B.cache = {};
  tickN(A, 200); tickN(B, 200);
  check(JSON.stringify(A.holding) === JSON.stringify(B.holding) && A.cash === B.cash, 'после сохранения/загрузки партия идёт так же (200 дней)');
}
// старое сохранение без S.holding: открывается заново; неполное состояние дозаполняется
{
  const T = clone(W); delete T.holding; tickN(T, CFG.HOLDING.UNLOCK_DELAY + 1);
  check(!!HD.state(T), 'старое сохранение после победы получает третий акт');
  const U = clone(S); delete U.holding.queue; delete U.holding.ipo.hist; tickN(U, 3);
  check(Array.isArray(U.holding.queue) && Array.isArray(U.holding.ipo.hist), 'неполное состояние дозаполняется');
}
// финал сюжета ждёт третий акт
{
  CFG.STORY.ON = true;
  const T = clone(W); tickN(T, CFG.HOLDING.UNLOCK_DELAY + 1);
  const R = BK.Story.ensure(T); R.seen.sf1 = T.day; R.lastScene = 0; R.pending = null; R.queue = [{ kind: 'scene', id: 'sf2', day: T.day }];
  BK.Story.day(T);
  check(!(R.pending && R.pending.id === 'sf2'), 'путь холдинга не выбран — «Последний ужин» не приходит');
  HD.choose(T, 'none'); R.queue.forEach((q) => { q.day = T.day; });
  T.ev.pending = null; R.pending = null; T.ev.recent = []; T.chef.pending = null;
  BK.Story.day(T);
  check(R.pending && R.pending.id === 'sf2', 'отказ от третьего акта — «Последний ужин» приходит как обычно');
  // концовка пути пишется в сюжет
  const T2 = clone(W); tickN(T2, CFG.HOLDING.UNLOCK_DELAY + 1); BK.Story.ensure(T2);
  HD.choose(T2, 'ipo'); HD.endWith(T2, 'ipo');
  check(T2.lost && T2.storyEnding === 'ipo' && T2.story.ending === 'ipo' && T2.story.log.some((x) => x.chapter === 'holding'), 'концовка «Публичная компания» — в сюжете и летописи (глава «Холдинг»)');
  CFG.STORY.ON = false;
}
console.log(`\nИтог: ${ok} прошло, ${bad} провалов.`);
process.exit(bad ? 1 : 0);
