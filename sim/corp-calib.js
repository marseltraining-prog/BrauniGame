// Калибровка «директор против игрока» (docs/russia-design.md §5.4, §8.2 п. 1).
// Один и тот же город (по умолчанию Казань) после выхода в Россию:
//   А. «Команда» — бот good год открывает точки вручную; дальше 4 года тот же набор точек без новых открытий:
//      вручную (подробно, по дням) против агрегированной модели с директором грейда 1 / 3 / 5 (бюджет открытий 0).
//      Это проверка месячной формулы: допуск ±5% выручки и ±2 п. п. маржи для директора грейда 3 (навыки 60).
//   Б. «Рост» — 5 лет с нуля: бот good вручную против директора грейда 1 / 3 / 5 (город запускает директор).
//      Сравнивается выручка за 5 лет, маржа и точки в конце; игрок в это время ведёт Уфу.
// Запуск: node sim/corp-calib.js [сидов=3] [город=kazan] [--years=5] [--events] [--leak] [--prices] [--train=5]
//   --prices — бот двигает цены сети и после переключения; --train — цель обучения директора в блоке А (по умолчанию 5, как у бота)
const BK = require('./load');
const { play, estStore } = require('./bot');
const E = BK.Engine, CFG = BK.CFG;

const flags = {}, pos = [];
for (const a of process.argv.slice(2)) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v == null ? true : v; } else pos.push(a); }
const seeds = +(pos[0] || 3), CITY = pos[1] || 'kazan', YEARS = +(flags.years || 5);
const GRADES = { 1: 35, 3: 60, 5: 85 };
// Р3: калибруется месячная формула — корпоративные события и федеральный «Хлебный двор» выключены (--events — включить)
if (!flags.events) CFG.CORP = Object.assign({}, CFG.CORP, { CEV_GAP: [1e7, 1e7], RIVAL_FOLLOW_P: 0 });
// Р4: денежный риск («утечка» слабого директора) — отдельная механика поверх формулы; калибруется без неё (--leak — включить)
if (!flags.leak) CFG.CORP = Object.assign({}, CFG.CORP, { LEAK_MAX: 0 });

function makeDir(S, grade) { // синтетический директор: стиль «Баланс», без черт, навыки по грейду
  const cr = S.corp, sk = GRADES[grade];
  const d = { id: 'd' + (++cr.dirSeq), name: `Директор грейда ${grade}`, f: false, grade, skills: { ops: sk, econ: sk, growth: sk, people: sk }, seen: { ops: sk, econ: sk, growth: sk, people: sk },
    style: 'balance', traits: [], hidden: [], src: 'market', loyalty: 70, loyD: 0, loyWhy: [], bio: '', pot: 2, city: null, joined: S.day, months: 0, cityMonths: 0, manualM: 0, adaptUntil: 0, praiseDay: -999, hist: [] };
  d.salary = Math.round(BK.Dir.marketPay(S, d, CITY));
  cr.directors.push(d);
  return d;
}
function startCity(S, P) { // как в sim/corp.js: дешёвый по полной стоимости цех + лучшая точка
  const wsum = BK.DISTRICTS.length, kmU = E.kmPerUnit();
  const cost = (o) => { let km = 0; for (const d of BK.DISTRICTS) km += E.dist(o, d) * kmU / wsum; return E.prodOpenCost(S, o).total + 24 * (E.prodRentMonth(o) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * o.area) + (CFG.DELIVERY_BASE + CFG.DELIVERY_PER_KM * km) * 5); };
  const po = S.prodOffers.slice().sort((a, b) => cost(a) - cost(b))[0];
  E.chooseProduction(S, po.id);
  const best = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => a.e.payback - b.e.payback);
  if (best.length) E.rentStore(S, best[0].o.id);
}
// один прогон: mode = 'manual' | 'dir'; phase 'team' — год вручную, потом без открытий; 'grow' — 5 лет с нуля
function run(seed, mode, grade, phase) {
  let t0 = null, done = false, entered = false, switched = false;
  const r = play({ level: 'good', seed, years: 30, onDay: (S, P) => {
    if (!S.corp || done) return;
    if (!entered) {
      if (E.dateOf(S.day).d !== 3) return;
      t0 = S.day; entered = true;
      if (phase === 'grow' && mode === 'dir') { const d = makeDir(S, grade); E.enterCity(S, CITY, { director: d.id }); E.citySetBudget(S, CITY, { train: 4 }); }
      else { E.enterCity(S, CITY); startCity(S, P); }
      return;
    }
    const m = (S.day - t0) / 30.44;
    if (phase === 'team' && !switched && m >= 12 && E.dateOf(S.day).d === 3) {
      switched = true;
      // цены меню — общие для сети, и бот двигает их по загрузке активного города (вручную — Казань, с директором — Уфа):
      // с этого дня цены замораживаются в обоих прогонах, иначе сравнивается реакция бота на разные города, а не модель (§17)
      if (!flags.prices) P.prices = false;
      if (mode === 'manual') { P.maxPayback = 0; P.realtor = false; } // тот же город, но без новых точек
      else { const d = makeDir(S, grade); E.switchCity(S, 'ufa'); E.dirAssign(S, d.id, CITY); E.citySetBudget(S, CITY, { capex: 200e6, close: false, train: +(flags.train || 5), open: false }); } // цель обучения — 5, как у бота good вручную (та же команда; --train=4 — как было до §17)
    }
    if (phase === 'grow' && mode === 'manual' && !switched) { switched = true; }
    // Уфа без роста у обоих: бот ведёт Уфу только в сценарии с директором (как и игрок), а в ручном — Уфа на автопилоте
    if (m >= YEARS * 12 + 0.5) { done = true; S.lost = true; } // стоп прогона
  } });
  const S = r.S, c = S.corp && S.corp.cities[CITY];
  if (!c) return null;
  const from = phase === 'team' ? 12 : 0;
  const rows = c.hist.slice(from + 1, 1 + YEARS * 12); // первый месяц — неполный
  const rev = rows.reduce((a, x) => a + x[2], 0), prof = rows.reduce((a, x) => a + x[3], 0);
  const last = c.hist[c.hist.length - 1];
  return { rev, margin: rev ? prof / rev : 0, stores: last ? last[4] : 0, rating: last ? last[5] : 0, months: rows.length };
}

const f1 = (v) => Math.round(v / 1e6);
const pc = (v) => (v * 100).toFixed(1);
const out = { team: [], grow: [] };
for (let s = 1; s <= seeds; s++) {
  const seed = s * 7919;
  for (const phase of ['team', 'grow']) {
    const man = run(seed, 'manual', 0, phase);
    const row = { seed: s, 'вручную: выр., млн': f1(man.rev), 'маржа %': +pc(man.margin), 'точек': man.stores };
    for (const g of [1, 3, 5]) {
      const a = run(seed, 'dir', g, phase);
      row[`гр.${g}: выр./ручн. %`] = +(100 * (a.rev / man.rev - 1)).toFixed(1);
      row[`гр.${g}: Δмаржи п.п.`] = +(100 * (a.margin - man.margin)).toFixed(1);
      row[`гр.${g}: точек`] = a.stores;
    }
    out[phase].push(row);
  }
}
const avg = (a, k) => +(a.reduce((x, r) => x + r[k], 0) / a.length).toFixed(1);
console.log(`\nА. Команда: год вручную, дальше ${YEARS - 1} г. тот же набор точек (${CITY}) — вручную против агрегата с директором`);
console.table(out.team);
console.log(`Среднее: грейд 1 — выручка ${avg(out.team, 'гр.1: выр./ручн. %')} %, маржа ${avg(out.team, 'гр.1: Δмаржи п.п.')} п.п.; грейд 3 — ${avg(out.team, 'гр.3: выр./ручн. %')} % / ${avg(out.team, 'гр.3: Δмаржи п.п.')} п.п.; грейд 5 — ${avg(out.team, 'гр.5: выр./ручн. %')} % / ${avg(out.team, 'гр.5: Δмаржи п.п.')} п.п.`);
console.log(`\nБ. Рост: ${YEARS} лет с нуля — бот good вручную против директора`);
console.table(out.grow);
console.log(`Среднее: грейд 1 — ${avg(out.grow, 'гр.1: выр./ручн. %')} %, грейд 3 — ${avg(out.grow, 'гр.3: выр./ручн. %')} %, грейд 5 — ${avg(out.grow, 'гр.5: выр./ручн. %')} % выручки к ручному`);
const g3 = avg(out.team, 'гр.3: выр./ручн. %'), m3 = avg(out.team, 'гр.3: Δмаржи п.п.');
const ok = Math.abs(g3) <= 5 && Math.abs(m3) <= 2;
console.log(ok ? '\nКалибровка в допуске (грейд 3: ±5% выручки, ±2 п. п. маржи).' : '\nКАЛИБРОВКА ВНЕ ДОПУСКА (грейд 3).');
process.exit(ok ? 0 : 1);
