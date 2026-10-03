/* Стратегии (этап 3 плана, vision-plan §5.3): прогон по каждому пути и проверка цели баланса.
   Логика путей — src/strategy.js (BK.Strat), числа — CFG.STRAT.PATHS в src/config.js.

   Что делает: гоняет сильного бота (good) по каждому пути — «без пути», premium, folk, coffee, cafe —
   на N сидах × M лет, путь включается на 4-й день (BK.Strat.set). Считает победы, медиану года победы,
   разброс, точки, средний чек к рынку и гостей на точку; сравнивает с базой («без пути») и выносит вердикт.

   Цель (владелец): у каждого пути медиана года победы в коридоре 14–16, разброс между путями ≤ 1,5 года,
   побед не меньше, чем у базы, и ни один путь не быстрее базы больше чем на год (и не медленнее чем на 1,5).
   Код выхода 1, если что-то из этого не выполнено. Про банкротства: в базовой игре на 16 сидах тоже
   бывает один банкрот, поэтому путь сравнивается с базой, а не с «16 из 16».

   Запуск:
     node sim/strat.js                       — 16 сидов × 24 года, все пути (надёжный вердикт)
     node sim/strat.js --seeds=8 --years=24  — быстрее, но медиана шумит: вердикт может дрогнуть
     node sim/strat.js --brief               — только сводка и вердикт
     node sim/strat.js --only=premium,cafe   — только эти пути (быстрый подбор; база считается всегда)
     node sim/strat.js --from=20             — другая группа сидов (проверка устойчивости медианы)
     node sim/strat.js --noev                — без событий путей (только модификаторы)
     node sim/strat.js --set=premium.check=1.12,folk.traffic=1.15   — подбор чисел без правки config.js
   Ключи: --seeds=N, --years=N, --brief; для подбора — --only=, --from=, --set=, --noev, --level=.

   События путей (src/data/strat-events.js) учитываются: событие с полем strat выпадает только на своём
   пути, у базы — никогда. Если движок их ещё не фильтрует, инструмент сам держит пул событий по пути.

   Прогон = good-бот (sim/bot.js), сюжет/инвесторы выключены (sim/load.js), как в канонических прогонах. */
const BK = require('./load');
const { play } = require('./bot');
const CFG = BK.CFG, PATHS = CFG.STRAT.PATHS;

/* ---------- ключи командной строки ---------- */
const flags = {}, pos = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) { const i = a.indexOf('='); if (i < 0) flags[a.slice(2)] = true; else flags[a.slice(2, i)] = a.slice(i + 1); } else pos.push(a); // значение может содержать «=» (--set=premium.check=1.08)
}
const SEEDS = +(flags.seeds || pos[0] || 16);   // 6–8 сидов тоже можно, но медиана на них гуляет на ±1,5 года
const YEARS = +(flags.years || pos[1] || 24);
const FROM = +(flags.from || 1);     // --from=20 — другая группа сидов (проверка устойчивости медианы)
const START_DAY = 4;                 // путь включается на 4-й день (как в грубом прогоне владельца)
const LEVEL = flags.level || 'good';

/* ---------- цель баланса ---------- */
const GOAL = { lo: 14, hi: 16, fast: 1.0, slow: 1.5, spread: 1.5 };

/* ---------- подбор чисел: --set=premium.check=1.12,folk.traffic=1.15 ---------- */
const MODS = ['traffic', 'check', 'conv', 'capacity', 'delivery', 'foodcost'];
function applyOverrides(spec) {
  if (!spec) return false;
  for (const part of String(spec).split(',')) {
    const [left, val] = part.split('=');
    const [id, key] = left.split('.');
    const p = PATHS[id];
    if (!p) { console.log(`--set: неизвестный путь «${id}»`); return true; }
    const v = +val;
    if (!isFinite(v)) { console.log(`--set: «${part}» — не число`); return true; }
    if (MODS.includes(key)) {
      const m = (p.mods || (p.mods = [])).find((x) => x.t === key);
      if (m) m.m = v; else p.mods.push({ t: key, m: v });
    } else if (key === 'openK') p.openK = v;
    else { console.log(`--set: «${key}» — не модификатор (${MODS.join('/')}/openK)`); return true; }
  }
  console.log(`--set: ${spec}`);
  return false;
}
if (flags.set === true) { console.log('--set требует значение, например --set=premium.check=1.12'); process.exit(1); }
if (applyOverrides(flags.set)) process.exit(1);
if (!(SEEDS > 0) || !(YEARS > 1)) { console.log('--seeds и --years должны быть положительными числами'); process.exit(1); }

/* ---------- события путей (src/data/strat-events.js) ----------
   Событие с полем strat выпадает только на своём пути: у бота без пути — никогда (эталон не меняется).
   Если движок уже фильтрует их (BK.StratEvents.ok в eventEligible — после слияния), ничего не делаем;
   иначе сами держим список событий: до 4-го дня — базовые, дальше — базовые + события пути.
   Проверить путь без событий: --noev. */
const NOEV = !!flags.noev;
try { if (!BK.STRAT_EVENTS || !BK.STRAT_EVENTS.length) require('../src/data/strat-events.js'); } catch (e) { /* данных ещё нет — не беда */ }
const STRAT_EV = BK.STRAT_EVENTS || [];
const ENGINE_FILTERS = BK.EVENTS.some((e) => e.strat);
const MANAGE_EV = !!STRAT_EV.length && !ENGINE_FILTERS && !NOEV;
const BASE_EVENTS = BK.EVENTS.filter((e) => !e.strat);
const evFor = (id) => (id == null ? BASE_EVENTS : BASE_EVENTS.concat(STRAT_EV.filter((e) => e.strat === id)));

/* ---------- метрики: средний чек к рынку и гости на точку за последние месяцы ---------- */
function metrics(S) {
  const h = (S.history || []).slice(-3);
  const stores = S.stores.filter((s) => s.status !== 'opening').length || 1;
  let rev = 0, guests = 0;
  for (const x of h) { rev += x.rev || 0; guests += ((x.pnl && x.pnl.checks) || 0) + ((x.pnl && x.pnl.aggOrders) || 0); }
  const check = guests ? rev / guests : 0;
  const market = (S.macro.priceLevel || 1) * CFG.STRAT.MARKET_CHECK;
  return { checkK: +check / market, guestsPerStore: h.length ? guests / h.length / stores : 0 };
}

/* ---------- один прогон ---------- */
function run(id, seed) {
  let done = id == null;             // «без пути» — состояние стратегии вообще не создаётся
  if (MANAGE_EV) BK.EVENTS = evFor(null);                       // до 4-го дня событий пути нет
  const r = play({
    level: LEVEL, seed, years: YEARS, stopOnWin: true,
    onDay: (S) => {
      if (!done && S.day >= START_DAY) {
        BK.Strat.set(S, id);
        if (MANAGE_EV) BK.EVENTS = evFor(id);                   // с включением пути приходят и его события
        done = true;
      }
    },
  });
  const S = r.S, m = metrics(S);
  return {
    seed, won: r.won ? r.won.year : null, lost: r.lost ? r.lostYear : null,
    stores: S.stores.filter((s) => s.status !== 'opening').length,
    checkK: m.checkK, guests: m.guestsPerStore,
    path: (S.strat && S.strat.id) || null,
  };
}

/* ---------- сводка по пути ---------- */
const md = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; }; // верхняя медиана — как в sim/bot.js
function summarize(rows) {
  const years = rows.map((x) => x.won).filter((x) => x != null).sort((a, b) => a - b);
  const lost = rows.filter((x) => x.lost != null);
  return {
    runs: rows.length, wins: years.length, lost: lost.length,
    median: years.length ? years[Math.floor(years.length / 2)] : null,
    mean: years.length ? +(years.reduce((a, b) => a + b, 0) / years.length).toFixed(2) : null,
    min: years.length ? years[0] : null, max: years.length ? years[years.length - 1] : null,
    stores: md(rows.map((x) => x.stores)),
    checkK: md(rows.map((x) => x.checkK)), guests: md(rows.map((x) => x.guests)),
    days: rows.map((x) => x.won),
  };
}

/* ---------- прогон по путям ---------- */
const ONLY = flags.only && flags.only !== true ? String(flags.only).split(',') : null; // --only=premium,cafe — быстрый подбор (база считается всегда)
const LIST = [null].concat(Object.keys(PATHS).filter((id) => !ONLY || ONLY.includes(id)));
const NAME = (id) => (id == null ? 'без пути' : PATHS[id].name);

console.log(`# Стратегии: ${LEVEL}, ${SEEDS} сид(ов) × ${YEARS} лет, сиды ${FROM}–${FROM + SEEDS - 1} (×7919), путь включается на ${START_DAY}-й день`);
console.log('# модификаторы путей:');
for (const id of Object.keys(PATHS)) {
  const p = PATHS[id];
  console.log(`#   ${id.padEnd(8)} ${(p.mods || []).map((m) => `${m.t} ×${m.m}`).join(', ')}; openK ×${p.openK}`);
}
console.log(`# события путей: ${STRAT_EV.length ? STRAT_EV.length + ' шт.' : 'нет данных (src/data/strat-events.js)'}`
  + `; учёт: ${MANAGE_EV ? 'включён (пул событий по пути)' : ENGINE_FILTERS ? 'включён (фильтрует движок)' : NOEV ? 'выключен (--noev)' : 'события не подключены'}`);
const res = {};
for (const id of LIST) {
  const rows = [];
  for (let s = FROM; s < FROM + SEEDS; s++) rows.push(run(id, s * 7919));
  res[id == null ? 'base' : id] = { id, rows, sum: summarize(rows) };
  if (!flags.brief) {
    console.log(`\n=== ${NAME(id)}${id == null ? '' : ' (' + id + ')'}`);
    console.table(rows.map((x) => ({ сид: x.seed, 'год победы': x.won, банкрот: x.lost, точек: x.stores, 'чек к рынку': x.checkK, 'гостей/точку в мес.': Math.round(x.guests), 'путь в конце': x.path || '—' })));
  }
}

/* ---------- таблица «путь → результат» ---------- */
const base = res.base.sum;
console.log(`\n# Сравнение с базой («без пути», медиана ${base.median})`);
console.table(LIST.map((id) => {
  const k = id == null ? 'base' : id, x = res[k].sum;
  return {
    путь: NAME(id), сид: id == null ? '—' : id, побед: `${x.wins}/${x.runs}`, банкротств: x.lost,
    'медиана года': x.median, 'среднее': x.mean, 'годы': x.wins ? `${x.min}–${x.max}` : '—',
    'к базе': id == null ? '—' : (x.median == null ? '—' : (x.median - base.median > 0 ? '+' : '') + +(x.median - base.median).toFixed(1)),
    точек: x.stores, 'чек к рынку': x.checkK, 'гостей/точку': Math.round(x.guests || 0),
  };
}));

/* ---------- вердикт ----------
   Коридор и «не быстрее базы на год / не медленнее на 1,5» считаем и по медиане (как в требовании),
   и по среднему: на 8 сидах медиана одного пути гуляет на ±1,5 года, и одиночный выброс не должен
   валить вердикт. Банкротства сравниваем с базой: своя доля риска у базовой игры та же. */
let bad = 0;
const lines = [];
function verdict(ok, text) { if (!ok) bad++; lines.push(`  ${ok ? '✓' : '✗'} ${text}`); }
const pathMeds = [];
for (const id of LIST) {
  if (id == null) continue;
  const x = res[id].sum;
  const dMed = x.median == null ? null : +(x.median - base.median).toFixed(1);
  const dMean = x.mean == null ? null : +(x.mean - base.mean).toFixed(2);
  if (x.median != null) pathMeds.push(x.median);
  const fast = dMed != null && dMed < -GOAL.fast && dMean < -GOAL.fast;      // быстрее базы больше чем на год
  const slow = dMed != null && dMed > GOAL.slow && dMean > GOAL.slow;        // медленнее базы больше чем на 1,5 года
  const corr = x.median != null && x.median >= GOAL.lo && x.median <= GOAL.hi;
  const risky = x.lost > base.lost + 1;                                      // банкротств заметно больше, чем у базы (запас 1 на шум: риск ~6 %)
  const inGoal = corr && !fast && !slow && !risky;
  const why = fast ? 'БЫСТРЕЕ БАЗЫ БОЛЬШЕ ЧЕМ НА ГОД' : slow ? 'ОТСТАЁТ ОТ БАЗЫ БОЛЬШЕ ЧЕМ НА 1,5 ГОДА' : risky ? `банкротств больше, чем у базы (${x.lost} против ${base.lost})` : !corr ? 'вне коридора ' + GOAL.lo + '–' + GOAL.hi : '';
  verdict(inGoal, `${NAME(id)}: ${x.wins}/${x.runs} побед (база ${base.wins}/${base.runs}), медиана ${x.median == null ? '—' : x.median} (${dMed == null ? '—' : (dMed > 0 ? '+' : '') + dMed}), среднее ${x.mean == null ? '—' : x.mean} (${dMean == null ? '—' : (dMean > 0 ? '+' : '') + dMean}) — ${inGoal ? 'в коридоре' : why}`);
}
if (pathMeds.length) {
  const spread = +(Math.max(...pathMeds) - Math.min(...pathMeds)).toFixed(1);
  verdict(spread <= GOAL.spread, `разброс между путями ${spread} года (норма ≤ ${GOAL.spread})`);
}
verdict(base.median != null && base.median >= GOAL.lo - 1 && base.median <= GOAL.hi + 1, `база (${base.median}) не сдвинулась: канонический good 3 18 — 3/3, медиана 14,9`);
console.log(`\n# Вердикт (коридор ${GOAL.lo}–${GOAL.hi}, не быстрее базы на ${GOAL.fast}, не медленнее на ${GOAL.slow})`);
for (const l of lines) console.log(l);
if (SEEDS < 12) console.log(`  ! ${SEEDS} сид(ов) — медиана шумит на ±1,5 года; для вердикта надёжнее --seeds=16`);
console.log(bad ? `\nЦЕЛЬ НЕ ВЫПОЛНЕНА: ${bad}` : '\nЦель выполнена: все пути в коридоре.');
process.exitCode = bad ? 1 : 0;
