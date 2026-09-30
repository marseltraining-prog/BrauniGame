// Разбор калибровки «директор против игрока» по статьям (блок А sim/corp-calib.js: год вручную, дальше тот же набор точек).
// По годам: выручка (в т. ч. доставка), фудкост (в т. ч. списания), комиссия агрегаторов, ФОТ, аренда, коммуналка, доставка из цеха,
// цеха, точки, люди, средний уровень, рейтинг, настроение, подключено к агрегаторам — вручную / агрегат с директором.
// Запуск: node sim/calib-diag.js [сид=1] [грейд=3] [город=kazan] [--months] [--pack]
//   --months — первые 14 месяцев после переключения по месяцам (с ценами меню и фудкостом), --pack — снимок при упаковке.
const BK = require('./load');
const { play, estStore } = require('./bot');
const E = BK.Engine, CFG = BK.CFG;
CFG.CORP = Object.assign({}, CFG.CORP, { CEV_GAP: [1e7, 1e7], RIVAL_FOLLOW_P: 0, LEAK_MAX: 0 });
const s = +(process.argv[2] || 1), grade = +(process.argv[3] || 3), CITY = process.argv[4] || 'kazan', YEARS = 5, seed = s * 7919;
const GR = { 1: 35, 3: 60, 5: 85 };
function makeDir(S, g) {
  const cr = S.corp, sk = GR[g];
  const d = { id: 'd' + (++cr.dirSeq), name: 'Директор', f: false, grade: g, skills: { ops: sk, econ: sk, growth: sk, people: sk }, seen: { ops: sk, econ: sk, growth: sk, people: sk },
    style: 'balance', traits: [], hidden: [], src: 'market', loyalty: 70, loyD: 0, loyWhy: [], bio: '', pot: 2, city: null, joined: S.day, months: 0, cityMonths: 0, manualM: 0, adaptUntil: 0, praiseDay: -999, hist: [] };
  d.salary = Math.round(BK.Dir.marketPay(S, d, CITY)); cr.directors.push(d); return d;
}
function startCity(S, P) {
  const wsum = BK.DISTRICTS.length, kmU = E.kmPerUnit();
  const cost = (o) => { let km = 0; for (const d of BK.DISTRICTS) km += E.dist(o, d) * kmU / wsum; return E.prodOpenCost(S, o).total + 24 * (E.prodRentMonth(o) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * o.area) + (CFG.DELIVERY_BASE + CFG.DELIVERY_PER_KM * km) * 5); };
  const po = S.prodOffers.slice().sort((a, b) => cost(a) - cost(b))[0]; E.chooseProduction(S, po.id);
  const best = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => a.e.payback - b.e.payback); if (best.length) E.rentStore(S, best[0].o.id);
}
const Z = () => ({ rev: 0, aggRev: 0, fc: 0, waste: 0, agg: 0, pay: 0, rent: 0, util: 0, del: 0, prod: 0, chk: 0, ns: 0, staff: 0, lvl: 0, rt: 0, mood: 0, nagg: 0 });
function run(mode) {
  const rows = []; let t0 = null, entered = false, switched = false, done = false;
  const am = BK.Corp.afterMonth;
  BK.Corp.onCityMonth = (S, c, x) => {
    if (c.id !== CITY || mode !== 'dir') return;
    const o = Object.assign(Z(), { rev: x.rev, aggRev: x.aggRev || 0, fc: x.fc, waste: x.waste || 0, agg: x.agg || 0, pay: x.pay, rent: x.rent, util: x.util, del: x.del, prod: x.prod, chk: x.chk || 0 });
    let lv = 0, md = 0;
    for (const p of c.packed.stores) if (p.status !== 'opening') { o.ns++; o.staff += p.staff.n; for (let l = 1; l <= 5; l++) lv += l * (p.staff.lv[l - 1] || 0); o.rt += p.rating; md += p.staff.mood * p.staff.n; if (p.agg) o.nagg++; }
    o.lvl = lv / o.staff; o.mood = md / o.staff; o.rt /= o.ns; o.pm = S.menu[0].pm; o.msfc = E.menuStats(S).fcPct; o.hq = S.corp.hqFcK || 1; rows.push(o);
  };
  BK.Corp.afterMonth = function (S, h, a) {
    if (mode === 'manual' && S.corp.active === CITY) {
      const o = Z(); let lv = 0, md = 0;
      for (const st of S.stores) if (st.last) {
        const l = st.last; o.rev += l.rev; o.aggRev += l.aggRev || 0; o.fc += l.fc; o.waste += l.waste || 0; o.agg += l.agg || 0; o.pay += l.payroll; o.rent += l.rent; o.util += l.util; o.del += l.delivery; o.chk += l.checks;
        o.ns++; o.staff += st.staff.length; for (const e of st.staff) { lv += e.lvl; md += e.mood; } o.rt += E.storeRating(S, st); if (st.agg) o.nagg++;
      }
      for (const p of S.productions) o.prod += p.lastCost || 0;
      o.lvl = lv / o.staff; o.mood = md / o.staff; o.rt /= o.ns; o.pm = S.menu[0].pm; o.msfc = E.menuStats(S).fcPct; o.hq = S.corp.hqFcK || 1; rows.push(o);
    }
    return am.call(this, S, h, a);
  };
  play({ level: 'good', seed, years: 30, onDay: (S, P) => {
    if (!S.corp || done) return;
    if (!entered) { if (E.dateOf(S.day).d !== 3) return; t0 = S.day; entered = true; E.enterCity(S, CITY); startCity(S, P); return; }
    const m = (S.day - t0) / 30.44;
    if (!switched && m >= 12 && E.dateOf(S.day).d === 3) {
      switched = true; rows.length = 0; P.prices = false; // цены сети — одинаковые в обоих прогонах (как в sim/corp-calib.js)
      if (mode === 'manual') { P.maxPayback = 0; P.realtor = false; }
      else {
        const d = makeDir(S, grade); E.switchCity(S, 'ufa');
        if (process.argv.includes('--pack')) { const pk = S.corp.cities[CITY].packed; console.log('упаковка: события', JSON.stringify(S.mods.filter((x) => x.until > S.day)), '· фудкост', pk.fcPct.toFixed(3), 'чистый', pk.fcB, '· спрос/пропускная', pk.stores.map((p) => Math.round(p.dem7.reduce((a, x) => a + x, 0) / 7) + '/' + Math.round(p.thr0)).join(' ')); }
        E.dirAssign(S, d.id, CITY); E.citySetBudget(S, CITY, { capex: 200e6, close: false, train: 5, open: false });
      }
    }
    if (m >= YEARS * 12 + 0.5) { done = true; S.lost = true; }
  } });
  BK.Corp.afterMonth = am; delete BK.Corp.onCityMonth;
  return rows;
}
const A = run('manual'), B = run('dir');
const f = (v) => (v / 1e6).toFixed(0);
const money = ['rev', 'aggRev', 'fc', 'waste', 'agg', 'pay', 'rent', 'util', 'del', 'prod'];
const NAMES = { rev: 'выручка', aggRev: 'в т.ч. доставка', fc: 'фудкост', waste: 'в т.ч. списания', agg: 'агрегаторы', pay: 'ФОТ', rent: 'аренда', util: 'коммуналка', del: 'доставка из цеха', prod: 'цеха' };
console.log(`Сид ${s}, ${CITY}, директор грейда ${grade}: вручную / агрегат (млн ₽ за год; состояние — на конец года)`);
for (let y = 0; y < YEARS - 1; y++) {
  const sum = (R) => { const sl = R.slice(y * 12, (y + 1) * 12), o = {}; for (const k of money.concat(['chk'])) o[k] = sl.reduce((a, x) => a + x[k], 0); const z = sl[sl.length - 1] || Z(); for (const k of ['ns', 'staff', 'lvl', 'rt', 'mood', 'nagg']) o[k] = z[k]; return o; };
  const a = sum(A), b = sum(B);
  console.log(`год ${y + 2}: ` + money.map((k) => `${NAMES[k]} ${f(a[k])}/${f(b[k])}`).join(' · '));
  console.log(`        чеков тыс. ${(a.chk / 1e3).toFixed(0)}/${(b.chk / 1e3).toFixed(0)} · точек ${a.ns}/${b.ns} · люди ${a.staff}/${b.staff} · уровень ${(+a.lvl).toFixed(2)}/${(+b.lvl).toFixed(2)} · ★ ${(+a.rt).toFixed(2)}/${(+b.rt).toFixed(2)} · настроение ${(+a.mood).toFixed(0)}/${(+b.mood).toFixed(0)} · у агрегаторов ${a.nagg}/${b.nagg}`);
}
if (process.argv.includes('--months')) for (let i = 0; i < 14; i++) { const a = A[i], b = B[i]; if (a && b) console.log(`мес ${i + 1}: выручка ${f(a.rev)} (зал ${f(a.rev - a.aggRev)}) / ${f(b.rev)} (зал ${f(b.rev - b.aggRev)}) · фудкост % ${(100 * a.fc / a.rev).toFixed(1)}/${(100 * b.fc / b.rev).toFixed(1)} · люди ${a.staff}/${b.staff} · ур ${a.lvl.toFixed(2)}/${b.lvl.toFixed(2)} · ★ ${a.rt.toFixed(2)}/${b.rt.toFixed(2)} · настр ${a.mood.toFixed(0)}/${b.mood.toFixed(0)} · цены ${a.pm}/${b.pm} меню-фк ${a.msfc.toFixed(3)}/${b.msfc.toFixed(3)} закупки ${a.hq}/${b.hq}`); }
