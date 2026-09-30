// Прогон второго акта (этап Р1): бот good ведёт Уфу до выхода в Россию, затем вручную открывает 1–2 города.
// Проверяет, что ничего не ломается и деньги сходятся: каждый месяц
//   (счёт + резерв − кредит) − стартовое значение = Σ(выручка + прочие доходы + проценты резерва − все статьи расходов).
// Запуск: node sim/corp.js [сидов=2] [лет=16] [города через запятую=kazan,samara] [--stay=24] [--quiet] [--dirs]
//   --dirs — вместо ручного плана города открывает корпоративный профиль бота (директора, sim/corpbot.js)
//   --stay — сколько месяцев вести каждый новый город вручную, потом — следующий; в конце — назад в Уфу.
//   --supply=fresh|frozen — входить без своего цеха: выпечка из цеха другого города / с фабрики заморозки (Р4, §7.2), если досягаемо;
//   --log=1|2 — перед входом открыть логистику в штабе до этого уровня (2 — фабрика заморозки).
//   Пример: node sim/corp.js 2 14 sterlitamak,chelny --supply=fresh --log=1 · node sim/corp.js 1 14 samara,moscow --supply=frozen --log=2
const BK = require('./load');
const { play, estStore } = require('./bot');
const E = BK.Engine, CFG = BK.CFG;

const flags = {}, pos = [];
for (const a of process.argv.slice(2)) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v == null ? true : v; } else pos.push(a); }
const seeds = +(pos[0] || 2), years = +(pos[1] || 16), plan = (pos[2] || 'kazan,samara').split(',').filter(Boolean);
const stayMonths = +(flags.stay || 24);

const NET_IN = ['rev', 'income', 'reserveIncome'];
const NET_OUT = ['fc', 'rent', 'payroll', 'util', 'delivery', 'tax', 'interest', 'upkeep', 'hire', 'train', 'other', 'capex', 'bonus', 'marketing', 'agg'];
const net = (m) => NET_IN.reduce((a, k) => a + (m[k] || 0), 0) - NET_OUT.reduce((a, k) => a + (m[k] || 0), 0);
const W = (S) => S.cash + S.reserve - S.loan + (BK.Growth ? BK.Growth.recvTotal(S) : 0); // + дебиторка сетей супермаркетов (рост вглубь): выручка уже в отчёте, деньги придут через 30–60 дн.
const f1 = (v) => Math.round(v / 1e6);

function startCity(S, P) { // как старт в Уфе: дешёвый по полной стоимости цех + лучшая точка (при поставках из другого города — только точка)
  if (BK.Corp.remoteOf(S)) { const best = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => a.e.payback - b.e.payback); return best.length ? E.rentStore(S, best[0].o.id).ok : false; }
  const wsum = BK.DISTRICTS.length, kmU = E.kmPerUnit();
  const cost = (o) => {
    let km = 0; for (const d of BK.DISTRICTS) km += E.dist(o, d) * kmU / wsum;
    return E.prodOpenCost(S, o).total + 24 * (E.prodRentMonth(o) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * o.area) + (CFG.DELIVERY_BASE + CFG.DELIVERY_PER_KM * km) * 5);
  };
  const po = S.prodOffers.slice().sort((a, b) => cost(a) - cost(b))[0];
  const r1 = E.chooseProduction(S, po.id);
  const best = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => a.e.payback - b.e.payback);
  const r2 = best.length ? E.rentStore(S, best[0].o.id) : { ok: false };
  return r1.ok && r2.ok;
}

function run(seed) {
  const issues = [], cityRows = [], visits = [], supplied = [];
  let step = 0, phaseDay = null, unlockY = null;
  const onDay = (S, P) => {
    if (!S.corp) return;
    if (unlockY == null) unlockY = +(S.day / 365).toFixed(1);
    // стратегия городов
    const t = E.dateOf(S.day);
    if (t.d !== 3) return;
    const cr = S.corp;
    if (step < plan.length && (phaseDay == null || S.day - phaseDay >= stayMonths * 30.4)) {
      const id = plan[step], cost = E.enterCost(S, id), lock = E.enterLock(S, id);
      if (!lock && S.cash > cost + 60e6 * S.macro.priceLevel) {
        if (flags.log) while (BK.HQ.lvlOf(S, 'logistics') < +flags.log && E.hqOpen(S, 'logistics').ok);
        const sup = flags.supply && BK.Corp.supplyHubs(S, id)[flags.supply] ? flags.supply : null;
        const r = E.enterCity(S, id, sup ? { supply: sup } : undefined);
        if (sup) supplied.push(`${id} ← ${S.corp.cities[id].supplyFrom} (${sup}, ${S.corp.cities[id].supplyKm} км)`);
        if (!r.ok) { issues.push(`вход в ${id}: ${r.msg}`); step++; return; }
        const ok = startCity(S, P);
        if (!ok) issues.push(`старт ${id}: не удалось открыть цех/точку`);
        visits.push({ id, day: S.day, cost: r.cost });
        phaseDay = S.day; step++;
      } else if (lock && !/за раз/.test(lock)) { issues.push(`${id}: ${lock}`); step++; }
    } else if (step >= plan.length && cr.active !== 'ufa' && S.day - phaseDay >= stayMonths * 30.4) {
      E.switchCity(S, 'ufa'); visits.push({ id: 'ufa', day: S.day }); phaseDay = S.day;
    }
  };
  // деньги: с момента выхода в Россию каждый день сверяем изменение (счёт + резерв − кредит) с суммой статей месяца
  let month0 = null;
  const r = play({ level: 'good', seed, years, onDay: (S, P, mem) => {
    if (S.corp && month0 == null) { month0 = { W: W(S), acc: -net(S.month), h: S.history.length }; }
    if (month0) {
      if (S.history.length !== month0.h) { for (let i = month0.h; i < S.history.length; i++) month0.acc += net(S.history[i].pnl); month0.h = S.history.length; }
      const lhs = W(S) - month0.W, rhs = month0.acc + net(S.month);
      if (Math.abs(lhs - rhs) > 1 + 1e-9 * Math.abs(W(S))) { issues.push(`день ${S.day}: деньги не сходятся на ${Math.round(lhs - rhs)} ₽`); month0.W += lhs - rhs; }
    }
    if (flags.dirs) { if (S.corp && unlockY == null) unlockY = +(S.day / 365).toFixed(1); if (S.corp && E.dateOf(S.day).d === 3) require('./corpbot').corpMonth(S, P, mem); } // --dirs: города открывает корпоративный профиль (директора)
    else onDay(S, P, mem);
    // проверки состояния
    if (!Number.isFinite(S.cash) || !Number.isFinite(S.reserve)) issues.push(`день ${S.day}: NaN в деньгах`);
    if (S.corp && E.dateOf(S.day).d === 2 && E.dateOf(S.day).m === 0) {
      const sm = E.corpSummary(S);
      cityRows.push({ year: +(S.day / 365).toFixed(1), active: S.corp.active, ...Object.fromEntries(sm.cities.map((c) => [c.id, `${c.open}т ${f1(c.lastRev || 0)}/${f1(c.lastProfit || 0)}`])), cash: f1(S.cash), loan: f1(S.loan) });
      for (const c of sm.cities) if (c.lastRev != null && !Number.isFinite(c.lastRev)) issues.push(`${c.id}: NaN в истории`);
    }
  } });
  const S = r.S;
  if (flags.dirs && S.corp) for (const id in S.corp.cities) if (id !== 'ufa') visits.push({ id, day: S.corp.cities[id].enteredDay }); // города, в которые вошёл корпоративный профиль
  return { seed, S, r, issues, cityRows, visits, unlockY, supplied };
}

let bad = 0;
for (let s = 1; s <= seeds; s++) {
  const t0 = Date.now();
  const x = run(s * 7919);
  const S = x.S;
  console.log(`\n=== seed ${s}: выход в Россию на ${x.unlockY ?? '—'}-м году · ${(Date.now() - t0) / 1000} с · ${S.lost ? 'БАНКРОТ на ' + (S.day / 365).toFixed(1) : 'жив'} · победа в Уфе ${x.r.won ? x.r.won.year : '—'}`);
  console.log('Вход в города:', x.visits.map((v) => `${v.id} (${(v.day / 365).toFixed(1)} г.${v.cost ? ', ' + f1(v.cost) + ' млн' : ''})`).join(' → ') || 'нет');
  if (x.supplied.length) console.log('Снабжение из другого города:', x.supplied.join('; '), '· сейчас:', BK.Corp.supplyLinks(S).map((l) => `${l.to}←${l.from} ${l.mode}${l.ok ? '' : ' ПРЕРВАНО'}`).join(', ') || 'все города на своих цехах');
  if (!flags.quiet) console.table(x.cityRows);
  if (S.corp) {
    const sm = E.corpSummary(S);
    console.table(sm.cities.map((c) => ({ город: c.name, режим: c.active ? 'вручную' : 'автопилот', точек: c.open, штат: c.staff, 'рейтинг': c.rating != null ? +c.rating.toFixed(2) : null, 'выр. 12 мес, млн': f1(c.rev12), 'приб. 12 мес, млн': f1(c.prof12), узнаваемость: +c.aw.toFixed(2) })));
    // Уфа на автопилоте: без роста (точек не больше, чем при выходе)
    const u = S.corp.cities.ufa, h = u.hist;
    if (h.length > 24) {
      const st0 = Math.max(...h.slice(0, 3).map((x) => x[4])), stN = h[h.length - 1][4];
      if (S.corp.active !== 'ufa' && stN > st0) x.issues.push(`Уфа на автопилоте выросла: ${st0} → ${stN} точек`);
    }
    const size = JSON.stringify(Object.assign({}, S, { cache: null })).length;
    console.log(`Сохранение: ${(size / 1024).toFixed(0)} КБ`);
  }
  if (x.issues.length) { bad++; console.log('ПРОБЛЕМЫ:\n  ' + [...new Set(x.issues)].slice(0, 20).join('\n  ')); }
  else console.log('Проблем нет: деньги сходятся каждый день, NaN нет.');
}
process.exit(bad ? 1 : 0);
