// Бот-игрок разного уровня для балансировки «Хлебной карты Уфы».
//  good — сильный: управляет раз в неделю, держит резерв ~2,5 мес. постоянных расходов, платит рынок +12%,
//         внедряет культуру, учит персонал и делает ремонты по окупаемости, покупает мощность при загрузке > 80%,
//         открывает 2-й/3-й цех, оценивает точки с учётом каннибализации, выбирает в событиях по ожидаемой выгоде.
//  avg  — средний: как good, но управляет раз в 30 дней, не держит резерв, выбирает в событиях случайно,
//         не внедряет культуру, оценивает точки проще (без каннибализации, мягче порог окупаемости).
//  bad  — слабый/жадный: без резерва, обучения, ремонтов и культуры, зарплату поднимает только до рынка раз в год,
//         открывает самое «выручечное» предложение (в кредит), мощность докупает только при дефиците.
// Запуск: node sim/bot.js <good|avg|bad> <сидов> <лет> [--summary] [--reserve=0.2] [--pay=0.12] [--culture=0] [--stop]
const BK = require('./load');
const E = BK.Engine, CFG = BK.CFG;

const PROFILES = {
  good: { every: 7, reserveMonths: 2.5, reserveShare: 0.25, culture: true, train: true, repair: true, payPremium: 0.12,
    events: 'smart', menu: 'smart', maxPayback: 26, cannibal: true, capAt: 0.8, loadTarget: 0.78,
    repairPayback: 24, trainPayback: 20, prices: true, office: true, bootstrapLoan: true, bufferRev: 0.25, realtor: true },
  avg: null, // = good, но: управляет раз в 30 дней, без резерва, случайные выборы в событиях, без культуры, без риелтора
  bad: { every: 7, reserveMonths: 0, reserveShare: 0, culture: false, train: false, repair: false, payPremium: 0,
    events: 'free', menu: 'none', greedy: true, capAt: 1.0, loadTarget: 1.0, prices: false, office: false, bufferRev: 0 },
};

PROFILES.avg = Object.assign({}, PROFILES.good, { every: 30, reserveMonths: 0, reserveShare: 0, events: 'random', culture: false, realtor: false });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const thrOf = (e) => CFG.CHECKS_PER_STAFF_BASE + CFG.CHECKS_PER_STAFF_LVL * (e.lvl - 1);
const storeThr = (st) => st.staff.reduce((a, e) => a + thrOf(e), 0);

/* ---------- оценка предложения аренды ---------- */
function estStore(S, o, P) {
  P = P || PROFILES.good;
  const sz = CFG.SIZES[o.size];
  const ms = E.menuStats(S);
  const tmp = Object.assign({}, o, { id: 'tmp', status: 'open', repair: 0, staff: [] });
  for (let i = 0; i < sz.staffMax; i++) tmp.staff.push({ lvl: 1 });
  let dem = 0, chk = 0;
  for (let dow = 0; dow < 7; dow++) { const d = E.storeDemand(S, tmp, { dow, m: 4 }, ms); dem += d.demand / 7; chk += d.check / 7; }
  const thrPer = CFG.CHECKS_PER_STAFF_BASE + CFG.CHECKS_PER_STAFF_LVL * 0.5;
  const staff = clamp(Math.ceil(dem / (thrPer * P.loadTarget)), sz.staffMin, sz.staffMax);
  const checks = Math.min(dem, staff * thrPer * 0.95);
  const rev = checks * chk * 30.4;
  const pl = S.macro.priceLevel;
  const fc = S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct;
  const rent = o.area * o.rentM2 * (o.payMode === 'year' ? 1 - CFG.YEARLY_RENT_DISCOUNT : 1);
  const pay = staff * E.salaryOf(S, 1.4) * (1 + CFG.PAYROLL_TAX);
  const util = (CFG.UTIL_BASE + CFG.UTIL_PER_M2 * o.area) * pl;
  const del = S.productions.length ? E.deliveryCost(S, tmp) : 40000 * pl;
  const hq = S.stores.length >= CFG.HQ_FREE_STORES ? CFG.HQ_PER_STORE * pl * (E.hqScale ? E.hqScale(S, S.stores.length + 1) : 1) : 0;
  const cult = CFG.CULTURE[S.culture].upkeep * staff * pl;
  const tax = rev * E.currentTaxRate(S);
  const bakers = checks * CFG.ITEMS_PER_CHECK / CFG.PROD_UNITS_PER_BAKER * S.pay.baker * (1 + CFG.PAYROLL_TAX); // доп. пекари под объём
  const hqRev = S.stores.length >= CFG.HQ_FREE_STORES ? rev * (CFG.HQ_REV_SHARE || 0) : 0;
  let profit = rev * (1 - fc) - tax - rent - pay - util - del - hq - cult - bakers - hqRev;
  let cannibal = 0;
  if (P.cannibal) { // потери существующих точек от соседства и насыщения района
    const K = CFG.SATURATION_K, R = CFG.CANNIBAL_RADIUS || 26, F = CFG.CANNIBAL_F || 0.86;
    for (const st of S.stores) {
      if (st.status === 'opening' || !st.last) continue;
      let f = 1;
      if (E.dist(st, o) < R) f *= F;
      if (st.district === o.district) {
        let n = 0; for (const x of S.stores) if (x !== st && x.status !== 'opening' && x.district === st.district) n++;
        f *= (1 + K * Math.max(0, n - 1)) / (1 + K * Math.max(0, n));
      }
      if (f < 1) {
        const load = (st._bot && st._bot.load) || 0.8;
        const lostShare = load > 1 ? Math.max(0, 1 - load * f) : 1 - f; // перегруженная точка теряет меньше
        cannibal += st.last.rev * Math.max(0, lostShare) * 0.6;
      }
    }
    profit -= cannibal;
  }
  const oc = E.storeOpenCost(S, o);
  return { rev, profit, capex: oc.total, payback: profit > 0 ? oc.total / profit : 999, staff, dem, chk, cannibal };
}

/* ---------- оценка эффектов события (для good) ---------- */
function effectValue(S, effects, tg, depth) {
  const R = Math.max(S.lastMonthRev, 1e6);
  const open = S.stores.filter((s) => s.status !== 'opening');
  const n = Math.max(1, open.length);
  let share = 1;
  if (tg && tg.scope === 'store') share = 1 / n;
  else if (tg && tg.scope === 'district') share = open.filter((s) => s.district === tg.target).length / n;
  else if (tg && tg.scope === 'production') share = 1 / Math.max(1, S.productions.length);
  const pnl = S.history.length ? S.history[S.history.length - 1].pnl : {};
  const pl = S.macro.priceLevel;
  const nEmp = E.allStaff(S) + E.bakersTotal(S);
  let v = 0;
  for (const f of effects || []) {
    const d = (f.d || 30) / 30;
    switch (f.t) {
      case 'traffic': case 'competitor': case 'conv': v += (f.m - 1) * share * R * (f.m > 1 ? 0.35 : 0.55) * d; break;
      case 'check': v += (f.m - 1) * share * R * 0.7 * d; break;
      case 'foodcost': v -= (f.m - 1) * (pnl.fc || R * 0.3) * (tg && tg.scope === 'production' ? share : 1) * ((f.d || 60) / 30); break;
      case 'delivery': v -= (f.m - 1) * (pnl.delivery || R * 0.03) * share * d; break;
      case 'capacity': { const cu = S.cache.capUse || 0.5; const after = cu / (1 - (1 - f.m) * share); v -= Math.max(0, Math.max(1, after) - Math.max(1, cu)) / Math.max(1, after) * R * 0.6 * ((f.d || 14) / 30); break; }
      case 'close': v -= share * R * 0.6 * d; break;
      case 'cash': { let x = 0; if (f.v != null) x = f.v * pl; else if (f.perStore != null) x = f.perStore * pl * Math.max(1, Math.round(share * n)); else if (f.revPct != null) x = f.revPct * R; v += x; break; }
      case 'staffQuit': v -= (f.n || 1) * (E.hireCost(S, 1) + 80000 * pl); break;
      case 'staffTrain': v += (f.n || 1) * 60000 * pl; break;
      case 'loyalty': v += f.add * nEmp * 1200 * pl; break;
      case 'salary': v -= (f.m - 1) * (pnl.payroll || R * 0.25) * 18; break;
      case 'tax': v -= f.add * R * (f.d ? f.d / 30 : 36); break;
      case 'rent': v -= (f.m - 1) * (pnl.rent || R * 0.1) * share * 36; break;
      case 'keyRate': v -= f.add * S.loan; break;
      case 'schedule': { // ожидаемая цена отложенного последствия (без дисконта, глубина цепочки ≤ 2)
        const fe = E.byId(BK.EVENTS, f.id);
        if (!fe || (depth || 0) >= 2) break;
        let fv = effectValue(S, fe.effects, tg, (depth || 0) + 1);
        if (fe.choices && fe.choices.length) fv += Math.max(...fe.choices.map((c) => effectValue(S, c.effects, tg, (depth || 0) + 1) - approxCost(S, c.cost, share, n)));
        v += (f.p != null ? f.p : 1) * fv; break;
      }
      case 'trend': { const inMenu = S.menu.some((m) => { const p = E.byId(BK.PRODUCTS, m.id); return p && p.cat === f.cat; }); if (inMenu) v += f.add * R * 0.012; break; }
      default: break;
    }
  }
  return v;
}
function approxCost(S, c, share, n) {
  if (!c) return 0;
  if (typeof c === 'number') return c * S.macro.priceLevel;
  if (c.perStore) return c.perStore * S.macro.priceLevel * Math.max(1, Math.round(share * n));
  if (c.revPct) return c.revPct * Math.max(S.lastMonthRev, 1e6);
  return 0;
}
function chooseEvent(S, P) {
  const inst = S.ev.pending, ch = inst.choices;
  if (!ch) return 0;
  if (P.events === 'random') return Math.floor(rand(S) * ch.length);
  if (P.events === 'free') { const i = ch.findIndex((c) => !c.cost); return i < 0 ? 0 : i; }
  const def = E.byId(BK.EVENTS, inst.id);
  let best = 0, bv = -Infinity;
  ch.forEach((c, i) => {
    if (c.cost > S.cash + S.reserve) return;
    // повторяющееся последствие (выбор снова ставит это же событие в очередь, напр. дивиденды) — считаем ~6 повторов
    const eff = def.choices[i].effects || [];
    const self = eff.some((f) => f.t === 'schedule' && f.id === inst.id);
    const val = self ? (effectValue(S, eff.filter((f) => !(f.t === 'schedule' && f.id === inst.id)), inst.tg) - c.cost) * 6 : effectValue(S, eff, inst.tg) - c.cost;
    if (val > bv) { bv = val; best = i; }
  });
  return best;
}
function rand(S) { S._botRng = (S._botRng * 1103515245 + 12345) % 2147483648; return S._botRng / 2147483648; } // отдельный ГСЧ бота

/* ---------- меню ---------- */
function menuScore(S) { // валовая маржа сети в день при текущем меню
  const ms = E.menuStats(S);
  let tot = 0;
  for (const st of S.stores) {
    if (st.status === 'opening' || !st.staff.length) continue;
    const d = E.storeDemand(S, st, { dow: 2, m: 4 }, ms);
    tot += Math.min(d.demand, d.thr) * d.check * (1 - ms.fcPct);
  }
  return tot;
}
function chooseMenu(S, P) {
  const cands = S.chef.pending.map((id) => E.byId(BK.PRODUCTS, id)).filter((p) => E.eqUnlocked(S, p.req));
  if (P.menu === 'none') return E.chefConfirm(S, [], []);
  if (P.menu === 'simple') {
    cands.sort((a, b) => b.pop * S.trends[b.cat] - a.pop * S.trends[a.cat]);
    const adds = cands.slice(0, 2).map((p) => p.id);
    const menu = S.menu.map((m) => E.byId(BK.PRODUCTS, m.id)).sort((a, b) => a.pop * S.trends[a.cat] - b.pop * S.trends[b.cat]);
    const removes = S.menu.length + adds.length > 13 ? menu.slice(0, 2).map((p) => p.id) : [];
    const r = E.chefConfirm(S, adds, removes); if (!r.ok) E.chefConfirm(S, [], []);
    return;
  }
  // smart: жадно добавляем лучшие новинки, затем убираем худшие позиции, пока растёт маржа сети
  const orig = S.menu.slice();
  const pm = S.menu[0] ? S.menu[0].pm : 1;
  const adds = [], removes = [];
  let base = menuScore(S);
  for (let k = 0; k < CFG.CHEF_PICK; k++) {
    let bestId = null, bestV = base;
    for (const p of cands) {
      if (adds.includes(p.id) || S.menu.length >= CFG.MENU_MAX) continue;
      S.menu.push({ id: p.id, pm });
      const v = menuScore(S); S.menu.pop();
      if (v > bestV * 1.001) { bestV = v; bestId = p.id; }
    }
    if (!bestId) break;
    adds.push(bestId); S.menu.push({ id: bestId, pm }); base = bestV;
  }
  for (let k = 0; k < CFG.CHEF_REMOVE; k++) {
    let bestI = -1, bestV = base;
    for (let i = 0; i < S.menu.length; i++) {
      if (adds.includes(S.menu[i].id) || S.menu.length <= CFG.MENU_MIN + 1) continue;
      const it = S.menu.splice(i, 1)[0];
      const v = menuScore(S); S.menu.splice(i, 0, it);
      if (v > bestV * 1.001) { bestV = v; bestI = i; }
    }
    if (bestI < 0) break;
    removes.push(S.menu[bestI].id); S.menu.splice(bestI, 1); base = bestV;
  }
  S.menu = orig;
  const r = E.chefConfirm(S, adds, removes); if (!r.ok) E.chefConfirm(S, [], []);
  for (const it of S.menu) it.pm = pm;
}

/* ---------- основной цикл ---------- */
function play(opts) {
  opts = opts || {};
  const lvl = opts.level || 'good';
  const P = Object.assign({}, PROFILES[lvl], opts.profile || {});
  if (opts.pay != null) P.payPremium = opts.pay;
  if (opts.culture != null) P.culture = !!opts.culture;
  if (opts.reserve != null) P.reserveFixed = opts.reserve;
  const S = E.newGame({ seed: opts.seed || 1 });
  S._botRng = (opts.seed || 1) % 2147483647;
  const mem = { months: [], quitsYear: [], staffYear: [], crises: [], minLiq: Infinity };
  const pl = () => S.macro.priceLevel;
  const fixedLast = () => { const h = S.history[S.history.length - 1]; if (!h) return 0; const m = h.pnl; return m.rent + m.payroll + m.util + m.delivery + m.upkeep + m.interest + m.tax; };
  const buffer = () => Math.max(1.5e6 * pl(), S.lastMonthRev * P.bufferRev, P.greedy ? 0 : Math.max(fixedLast(), settlementEstimate(S)) * 0.9);

  // старт: производство (good/avg — недорогой средний район, bad — первое, обычно центр) + лучшая точка
  let po;
  if (lvl === 'bad') po = S.prodOffers[0];
  else { // открытие + 2 года аренды/коммуналки + доставка на ~5 точек, разбросанных по городу как предложения
    const wsum = BK.DISTRICTS.length;
    const cost = (o) => {
      let km = 0; for (const d of BK.DISTRICTS) km += E.dist(o, d) * CFG.KM_PER_UNIT / wsum;
      const del = (CFG.DELIVERY_BASE + CFG.DELIVERY_PER_KM * km) * 5;
      return E.prodOpenCost(S, o).total + 24 * (E.prodRentMonth(o) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * o.area) + del);
    };
    po = S.prodOffers.slice().sort((a, b) => cost(a) - cost(b))[0];
  }
  E.chooseProduction(S, po.id);
  let first;
  if (lvl === 'bad') first = S.offers.filter((o) => E.storeOpenCost(S, o).total <= S.cash)[0] || S.offers[0];
  else {
    const all = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => a.e.payback - b.e.payback);
    const aff = all.filter((x) => x.e.capex <= S.cash - 3e5);
    // лучшее предложение не по карману — сильный игрок берёт кредит, если оно заметно лучше доступного
    if (all[0] && (!aff[0] || (all[0] !== aff[0] && all[0].e.payback < aff[0].e.payback * 0.7)) && S.cash + E.loanLimit(S) > all[0].e.capex + 1e6) first = all[0].o;
    else first = (aff[0] || all[all.length - 1]).o;
  }
  if (!E.rentStore(S, first.id).ok) { E.takeLoan(S, E.storeOpenCost(S, first).total - S.cash + 1e6); E.rentStore(S, first.id); }
  E.setAlloc(S, { reserve: P.reserveFixed != null ? P.reserveFixed : P.reserveShare, bonus: lvl === 'bad' ? 0 : 0.03, marketing: lvl === 'bad' ? 0 : 0.04 });

  const years = opts.years || 20;
  const out = [];
  let lastY = 0, yQuits = 0, yStaffDays = 0, yDays = 0;
  while (S.day < years * 365 && !S.lost) {
    if (S.ev.pending) {
      const inst = S.ev.pending;
      if (inst.crisis) mem.crises.push({ day: S.day, id: inst.id, revBefore: S.lastMonthRev, reserve: S.reserve, cash: S.cash, loan: S.loan });
      E.resolveEvent(S, chooseEvent(S, P));
    }
    if (S.chef.pending) chooseMenu(S, P);
    S.notify.length = 0;
    const q0 = S.stats.quits;
    if (!E.tick(S)) continue;
    yQuits += S.stats.quits - q0; yStaffDays += E.allStaff(S); yDays++;
    if (S.day > 60) mem.minLiq = Math.min(mem.minLiq, S.cash + S.reserve - S.loan);
    for (const st of S.stores) { // память бота: сглаженный спрос и загрузка точки
      if (!st._bot) st._bot = { dem: 0, load: 0, opened: S.day, capex0: st.capex, prof: [], rev: [] };
      const m = st._bot;
      if (st.today && !st.today.closed && st.staff.length) {
        const dm = st.today.load * storeThr(st);
        m.dem = m.dem ? m.dem * 0.93 + dm * 0.07 : dm;
        m.load = m.load ? m.load * 0.93 + st.today.load * 0.07 : st.today.load;
      }
    }
    const t = E.dateOf(S.day);
    if (t.d === 1) monthHook(S, mem);
    if (S.day % P.every === 0) { if (P.greedy) manageBad(S, P); else manage(S, P, buffer()); }
    else if (t.d === 1 && S.cash < 0 && !P.greedy) E.takeLoan(S, -S.cash + buffer()); // реакция на «Кассовый разрыв!»
    // перед месячным расчётом сильный бот проверяет, хватит ли денег на зарплаты и аренду
    if (P.every <= 7 && !P.greedy && E.dateOf(S.day + 1).d === 1) {
      const need = settlementEstimate(S) * 1.05 + 2e5 * pl();
      if (S.cash + S.reserve < need) E.takeLoan(S, need - S.cash - S.reserve);
    }
    if (t.m === 0 && t.d === 2 && t.y !== lastY) {
      lastY = t.y;
      const h = S.history.slice(-12);
      const rev = h.reduce((a, x) => a + x.rev, 0), prof = h.reduce((a, x) => a + x.profit, 0);
      const avgStaff = yDays ? yStaffDays / yDays : 0;
      mem.quitsYear.push(yQuits); mem.staffYear.push(avgStaff);
      out.push({ year: t.y - CFG.START_YEAR, stores: S.stores.length, rev: Math.round(rev / 1e6), profit: Math.round(prof / 1e6), cash: Math.round(S.cash / 1e6), reserve: Math.round(S.reserve / 1e6), loan: Math.round(S.loan / 1e6), staff: E.allStaff(S), 'turn%': avgStaff ? Math.round(yQuits / avgStaff * 100) : 0, capUse: +(S.cache.capUse || 0).toFixed(2), avgLvl: +(avgLvl(S)).toFixed(2), mood: Math.round(avgMood(S)), menu: S.menu.length, prods: S.productions.length, cult: S.culture, pm: S.menu[0] ? S.menu[0].pm : 1, pl: +pl().toFixed(2) });
      yQuits = 0; yStaffDays = 0; yDays = 0;
    }
    if (S.won && !mem.won) { mem.won = { year: +(S.day / 365).toFixed(1), stores: S.stores.length }; out.push({ WON_YEAR: mem.won.year, stores: S.stores.length }); if (opts.stopOnWin) break; }
  }
  return { S, out, mem, lost: S.lost, lostYear: S.lost ? +(S.day / 365).toFixed(1) : null, won: mem.won || null };
}
function settlementEstimate(S) { // сколько спишет ближайший месячный расчёт
  const pl = S.macro.priceLevel;
  let x = 0, nEmp = 0;
  for (const st of S.stores) {
    if (st.status === 'opening') continue;
    if (st.payMode === 'month') x += E.storeRentMonth(st);
    for (const e of st.staff) { x += E.salaryOf(S, e.lvl) * (1 + CFG.PAYROLL_TAX); nEmp++; }
    x += (CFG.UTIL_BASE + CFG.UTIL_PER_M2 * st.area) * pl + E.deliveryCost(S, st);
  }
  for (const p of S.productions) { x += E.prodRentMonth(p) + p.staff * S.pay.baker * (1 + CFG.PAYROLL_TAX) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * p.area) * pl; nEmp += p.staff; }
  x += CFG.CULTURE[S.culture].upkeep * nEmp * pl + Math.max(0, S.stores.length - CFG.HQ_FREE_STORES) * CFG.HQ_PER_STORE * pl + S.month.rev * ((CFG.HQ_REV_SHARE || 0) + E.currentTaxRate(S) * 1.4);
  x += S.loan * (S.macro.keyRate + CFG.LOAN_SPREAD) / 12 + (E.hrCount ? E.hrCount(S) * (CFG.HR_SALARY || 0) * 1.3 * pl : 0) + (E.trainersCount ? E.trainersCount(S) * (CFG.TRAINER_SALARY || 0) * 1.3 * pl : 0);
  return x;
}
function avgLvl(S) { let n = 0, s = 0; for (const st of S.stores) for (const e of st.staff) { n++; s += e.lvl; } return n ? s / n : 0; }
function avgMood(S) { let n = 0, s = 0; for (const st of S.stores) for (const e of st.staff) { n++; s += e.mood; } return n ? s / n : 0; }

function monthHook(S, mem) {
  const pl = S.macro.priceLevel;
  const h = S.history[S.history.length - 1];
  if (h) mem.months.push({ day: S.day, rev: h.rev, profit: h.profit, pl, pnl: h.pnl, stores: h.stores, cash: S.cash, reserve: S.reserve, loan: S.loan });
  // накладные сети (пекари, аренда цехов, офис, культура), разложенные по выручке точек
  let stPay = 0, stRent = 0, stUtil = 0;
  for (const st of S.stores) if (st.last) { stPay += st.last.payroll || 0; stRent += st.last.rent || 0; stUtil += st.last.util || 0; }
  const ovh = h && h.rev > 0 ? Math.max(0, (h.pnl.payroll - stPay) + (h.pnl.rent - stRent) + (h.pnl.util - stUtil) + h.pnl.upkeep) / h.rev : 0;
  for (const st of S.stores) {
    if (!st.last || !st._bot) continue;
    st._bot.prof.push(st.last.profit);
    (st._bot.net || (st._bot.net = [])).push(st.last.profit - ovh * st.last.rev);
    st._bot.rev.push({ rev: st.last.rev / pl, checks: st.last.checks / 30.4, chk: st.last.checks ? st.last.rev / st.last.checks / pl : 0, repair: st.repair, size: st.size });
  }
}

/* ---------- управление (good / avg) ---------- */
function manage(S, P, buf) {
  const pl = S.macro.priceLevel;
  // зарплата: рынок + надбавка
  for (const k of ['seller', 'baker']) {
    const target = S.market[k] * (1 + P.payPremium);
    if (Math.abs(S.pay[k] - target) / target > 0.01) E.setPay(S, k, target);
  }
  // резерв: ~2,5 месяца постоянных расходов, излишек — в развитие
  const last = S.history.length ? S.history[S.history.length - 1].pnl : null;
  if (P.reserveFixed == null && P.reserveMonths > 0 && last) {
    const fixed = last.rent + last.payroll + last.util + last.delivery + last.upkeep + last.interest;
    const target = fixed * P.reserveMonths;
    const a = Object.assign({}, S.alloc);
    a.reserve = S.reserve < target && (S.loan <= 0 || S.stores.length >= 3) ? P.reserveShare : 0; // на старте — сначала кредит
    E.setAlloc(S, a);
    if (S.reserve > target * 1.3) E.reserveMove(S, -(S.reserve - target * 1.1));
  }
  // кредиты: закрыть дыру, гасить при избытке
  if (S.cash < 0) E.takeLoan(S, -S.cash + buf * 0.5);
  if (S.loan > 0 && S.cash > buf * 2) E.repayLoan(S, S.cash - buf * 1.5);

  const open = S.stores.filter((s) => s.status !== 'opening');
  // персонал: штат под спрос, найм лучших кандидатов
  for (const st of open) {
    const sz = CFG.SIZES[st.size], m = st._bot || {};
    const avgThr = st.staff.length ? storeThr(st) / st.staff.length : CFG.CHECKS_PER_STAFF_BASE;
    if (m.dem) {
      const need = clamp(Math.ceil(m.dem / (avgThr * P.loadTarget)), sz.staffMin, sz.staffMax);
      if (need > st.staffTarget) E.setStaffTarget(S, st.id, need);
      else if (need < st.staffTarget - 1) E.setStaffTarget(S, st.id, st.staffTarget - 1);
    }
    if (!(S.office.hr && S.office.autohireOn)) {
      let v = E.vacancies(st);
      while (v-- > 0 && S.cash > 2e5) {
        const c = S.candidates.slice().sort((a, b) => b.lvl - a.lvl || b.trait - a.trait)[0];
        if (!E.hire(S, st.id, c ? c.id : undefined).ok) break;
      }
    }
  }
  // офис
  if (P.office) {
    const n = S.stores.length;
    if (n >= 5 && !S.office.hr && S.cash > buf + 1e6 * pl) E.buyOffice(S, 'hr');
    if (n >= 10 && !S.office.academy && S.cash > buf + 3e6 * pl) E.buyOffice(S, 'academy');
    if (S.office.academy && P.train) S.office.trainTarget = n >= 25 ? 5 : 4;
  }
  // культура
  if (P.culture && S.culture < CFG.CULTURE.length - 1) {
    const need = [0, 3, 8, 16, 28, 45][S.culture + 1];
    const c = CFG.CULTURE[S.culture + 1].cost * pl;
    if (S.stores.length >= need && S.cash > buf + c * 1.5) E.buyCulture(S);
  }
  // производство: мощность
  const capUse = S.cache.capUse || 0;
  let projUse = capUse;
  for (let k = 0; k < 4 && projUse > P.capAt; k++) {
    let best = null;
    for (const p of S.productions) {
      if (p.status !== 'open') continue;
      for (const e of BK.EQUIPMENT) {
        if (e.cap <= 0 || (p.equip[e.id] || 0) >= e.max) continue;
        const sc = e.cap / e.price;
        if (!best || sc > best.sc) best = { p, e, sc };
      }
    }
    if (!best || S.cash < buf * 0.5 + best.e.price * pl) break;
    const capBefore = S.cache.cap || 1;
    if (!E.buyEquipment(S, best.p.id, best.e.id).ok) break;
    projUse = projUse * capBefore / (capBefore + best.e.cap);
    S.cache.cap = capBefore + best.e.cap;
  }
  // производство: разблокировки и снижение фудкоста/доставки по окупаемости
  const R = Math.max(S.lastMonthRev, 1);
  for (const p of S.productions) {
    if (p.status !== 'open') continue;
    const share = (E.prodCapacity(S, p) || 1) / Math.max(1, S.cache.cap || 1);
    for (const e of BK.EQUIPMENT) {
      if ((p.equip[e.id] || 0) > 0) continue;
      const price = e.price * pl;
      let gain = 0;
      if (e.fc) gain += e.fc * (last ? last.fc : R * 0.3) * share;
      if (e.del) gain += e.del * (last ? last.delivery : 0) * share * 1.5;
      if (e.unlock && !S.productions.some((x) => x.equip[e.id]) && S.stores.length >= ({ laminator: 2, hearth: 5, confect: 7 })[e.unlock]) gain += R * 0.03 + price / 30;
      if (gain > 0 && price / gain < 20 && S.cash > buf + price) { E.buyEquipment(S, p.id, e.id); break; }
    }
  }
  // 2-е / 3-е производство
  if (S.prodOffers.length && S.productions.length < 3 && S.productions.every((p) => p.status === 'open')) {
    let best = null;
    const unit = (d) => CFG.DELIVERY_BASE + CFG.DELIVERY_PER_KM * d * CFG.KM_PER_UNIT;
    let slots = 0; for (const p of S.productions) for (const e of BK.EQUIPMENT) if (e.cap > 0) slots += (e.max - (p.equip[e.id] || 0)) * e.cap;
    for (const o of S.prodOffers) {
      let save = 0;
      for (const st of S.stores) {
        const p0 = E.nearestProd(S, st);
        const dNew = E.dist(o, st), dOld = p0 ? E.dist(p0, st) : 1e9;
        if (dNew < dOld) save += E.deliveryCost(S, st) * (1 - unit(dNew) / unit(dOld));
      }
      const overhead = E.prodRentMonth(o) + CFG.PROD_STAFF_BASE * S.pay.baker * (1 + CFG.PAYROLL_TAX) + (CFG.PROD_UTIL_BASE + CFG.PROD_UTIL_PER_M2 * o.area) * pl;
      const cost = E.prodOpenCost(S, o).total;
      const capNeed = capUse > 0.6 ? (slots < (S.cache.units || 0) * 0.6 ? 3 : 1) : 0; // своё оборудование заканчивается — нужен цех
      const val = (save - overhead) * 24 + capNeed * CFG.PROD_BASE_CAPACITY * 1500 * pl;
      if (!best || val > best.val) best = { o, val, cost };
    }
    if (best && best.val > best.cost * 0.5 && S.cash > buf + best.cost) E.chooseProduction(S, best.o.id);
  }
  // новые точки
  let slotsLeft = 0; for (const p of S.productions) for (const e of BK.EQUIPMENT) if (e.cap > 0) slotsLeft += e.max - (p.equip[e.id] || 0);
  if (slotsLeft > 0 || capUse < 0.9) {
    // лишние деньги лежат без дела — порог окупаемости мягче (сильный игрок вкладывает всё, что окупается)
    const idle = S.cash / Math.max(1, 6e6 * pl);
    const hurdle = P.maxPayback * (idle > 6 ? 1.8 : idle > 3 ? 1.4 : 1);
    const cand = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).filter((x) => x.e.payback < hurdle).sort((a, b) => a.e.payback - b.e.payback);
    const c = cand[0];
    if (!c && P.realtor && S.stores.length >= 1 && S.day - (S._botRealtor || -999) > 60 && S.cash > buf + 6e6 * pl) { S._botRealtor = S.day; E.refreshOffers(S); }
    if (c) {
      if (S.cash > c.e.capex + buf) E.rentStore(S, c.o.id);
      else if (P.bootstrapLoan && S.stores.length < 3 && S.loan + c.e.capex <= E.loanLimit(S) && S.cash + (E.loanLimit(S) - S.loan) > c.e.capex + buf && c.e.payback < 16) {
        E.takeLoan(S, c.e.capex + buf - S.cash);
        E.rentStore(S, c.o.id);
      }
    }
  }
  // ремонты по окупаемости
  if (P.repair && S.stores.length >= 2) {
    const fc = S.cache.fcPct || 0.3;
    const cands = [];
    for (const st of open) {
      if (st.status !== 'open' || st.repair >= 3 || !st.last || !st._bot || !st._bot.dem || !st.last.rev) continue;
      const cur = CFG.REPAIRS[st.repair] || { conv: 1, check: 1 }, nx = CFG.REPAIRS[st.repair + 1];
      const thr = CFG.SIZES[st.size].staffMax * (st.staff.length ? storeThr(st) / st.staff.length : CFG.CHECKS_PER_STAFF_BASE) * 0.9;
      const dem = st._bot.dem;
      const checksNow = Math.min(dem, thr), checksNew = Math.min(dem * nx.conv / cur.conv, thr);
      const revNow = st.last.rev;
      const revNew = revNow * (checksNew / Math.max(1, checksNow)) * (nx.check / cur.check);
      const gain = (revNew - revNow) * (1 - fc - 0.06) - (checksNew - checksNow) / (avgThrOf(st) * P.loadTarget) * E.salaryOf(S, 2) * 1.3;
      const cost = E.repairCost(S, st) + revNow * nx.days / 30 * 0.6;
      if (gain > 0) cands.push({ st, pb: cost / gain, cost: E.repairCost(S, st) });
    }
    cands.sort((a, b) => a.pb - b.pb);
    for (const c of cands.slice(0, 2)) if (c.pb < P.repairPayback && S.cash > buf + c.cost * 1.3) E.startRepair(S, c.st.id);
  }
  // обучение по окупаемости (сверх отдела обучения)
  if (P.train) {
    const list = [];
    for (const st of open) {
      if (!st.last || !st.staff.length || !st.last.rev) continue;
      const n = st.staff.length, load = (st._bot && st._bot.load) || 0.8;
      for (const e of st.staff) {
        if (e.lvl >= CFG.MAX_LVL) continue;
        const dConv = load < 1 ? CFG.LVL_CONV / n : 0;
        const dThr = load >= 0.95 ? CFG.CHECKS_PER_STAFF_LVL / Math.max(1, storeThr(st)) : 0;
        const gain = st.last.rev * (dConv + dThr + CFG.LVL_CHECK / n) * 0.62 - S.pay.seller * CFG.EXPECT_PER_LVL * (1 + CFG.PAYROLL_TAX);
        const cost = E.trainCost(S, e.lvl + 1);
        if (gain > 0) list.push({ st, e, pb: cost / gain, cost });
      }
    }
    list.sort((a, b) => a.pb - b.pb);
    for (const x of list) { if (x.pb > P.trainPayback || S.cash < buf + x.cost * 2) break; if (!E.train(S, x.st.id, x.e.id).ok) break; }
  }
  // цены: при хронической перегрузке сети — чуть дороже, при недогрузе — назад к базе
  if (P.prices && open.length) {
    let ld = 0; for (const st of open) ld += (st._bot && st._bot.load) || 0; ld /= open.length;
    const pm = S.menu[0] ? S.menu[0].pm : 1;
    if (ld > 0.98 && pm < 1.25) E.setAllPrices(S, 0.03);
    else if (ld < 0.7 && pm > 1.0) E.setAllPrices(S, -0.03);
  }
}
function avgThrOf(st) { return st.staff.length ? storeThr(st) / st.staff.length : CFG.CHECKS_PER_STAFF_BASE; }

/* ---------- слабый бот ---------- */
function manageBad(S, P) {
  const t = E.dateOf(S.day);
  if (t.m === 0 && t.d <= 7) { if (S.pay.seller < S.market.seller) E.setPay(S, 'seller', S.market.seller); if (S.pay.baker < S.market.baker) E.setPay(S, 'baker', S.market.baker); }
  for (const st of S.stores) { let v = E.vacancies(st); while (v-- > 0 && S.cash > 2e5) if (!E.hire(S, st.id).ok) break; }
  if ((S.cache.capUse || 0) > 1.0) {
    const p = S.productions.find((x) => x.status === 'open');
    const e = p && BK.EQUIPMENT.filter((x) => x.cap > 0 && (p.equip[x.id] || 0) < x.max).sort((a, b) => a.price - b.price)[0];
    if (e && S.cash > e.price * S.macro.priceLevel) E.buyEquipment(S, p.id, e.id);
  }
  if (S.stores.length > 10 && !S.office.hr && S.cash > 1e6) E.buyOffice(S, 'hr');
  // жадность: самое «выручечное» предложение, в кредит если надо
  const cand = S.offers.map((o) => ({ o, e: estStore(S, o, P) })).sort((a, b) => b.e.rev - a.e.rev)[0];
  if (cand && S.cash > cand.e.capex) E.rentStore(S, cand.o.id); // без подушки: всё, что на счёте, — в новую точку
  if (S.cash < 0) E.takeLoan(S, -S.cash + 1e6);
}

/* ---------- сводка ---------- */
function summarize(r) {
  const { S, mem } = r;
  const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const startRev = [], startChk = [], startChecks = [], payback = [], paybackNet = [], flag = [];
  for (const st of S.stores) {
    if (!st._bot) continue;
    const rv = st._bot.rev;
    if (rv.length >= 4) { const f = rv.slice(1, 4); startRev.push(f.reduce((a, x) => a + x.rev, 0) / 3); startChk.push(f.reduce((a, x) => a + x.chk, 0) / 3); startChecks.push(f.reduce((a, x) => a + x.checks, 0) / 3); }
    for (const x of rv) flag.push(x.rev);
    let cum = 0, pb = null;
    for (let i = 0; i < st._bot.prof.length; i++) { cum += st._bot.prof[i]; if (cum >= st._bot.capex0) { pb = i + 1; break; } }
    if (pb != null || st._bot.prof.length >= 36) payback.push(pb != null ? pb : 99);
    cum = 0; pb = null; const net = st._bot.net || [];
    for (let i = 0; i < net.length; i++) { cum += net[i]; if (cum >= st._bot.capex0) { pb = i + 1; break; } }
    if (pb != null || net.length >= 36) paybackNet.push(pb != null ? pb : 99);
  }
  flag.sort((a, b) => b - a);
  const ms = mem.months;
  const share = (k, from) => { let a = 0, b = 0; for (const m of ms.slice(from)) { a += m.pnl[k] || 0; b += m.rev; } return b ? a / b : 0; };
  const y = (n) => { const o = r.out.find((x) => x.year === n); return o ? o.stores : null; };
  const yr = (n) => { const o = r.out.find((x) => x.year === n); return o ? +(o.rev / 1000).toFixed(2) : null; };
  const yv = (n, k) => { const o = r.out.find((x) => x.year === n); return o ? o[k] : null; };
  const turn = mem.quitsYear.map((q, i) => (mem.staffYear[i] > 3 ? q / mem.staffYear[i] : null));
  return {
    won: r.won ? r.won.year : null, wSt: r.won ? r.won.stores : null, lost: r.lostYear,
    y1p: r.out[1] ? r.out[1].profit : null,
    s3: y(3), s5: y(5), s10: y(10), s15: y(15), s20: y(20),
    r5: yr(5), r10: yr(10), r15: yr(15), mood10: yv(10, 'mood'), lvl10: yv(10, 'avgLvl'),
    rev0: +(med(startRev) / 1e6).toFixed(2), chk0: Math.round(med(startChk)), cpd0: Math.round(med(startChecks)),
    flag: +((flag[0] || 0) / 1e6).toFixed(1),
    pb: med(payback), pbNet: med(paybackNet), turn: Math.round((med(turn.slice(1)) || 0) * 100),
    fc: +(share('fc', 12) * 100).toFixed(1), pay: +(share('payroll', 12) * 100).toFixed(1), rent: +(share('rent', 12) * 100).toFixed(1), del: +(share('delivery', 12) * 100).toFixed(1), upk: +(share('upkeep', 12) * 100).toFixed(1), tax: +(share('tax', 12) * 100).toFixed(1),
    minLiq: Math.round(mem.minLiq / 1e6), cris: mem.crises.length,
  };
}

module.exports = { play, estStore, summarize, PROFILES };
if (require.main === module) {
  const flags = {}, pos = [];
  for (const a of process.argv.slice(2)) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v == null ? true : v; } else pos.push(a); }
  const level = pos[0] || 'good', seeds = +(pos[1] || 3), years = +(pos[2] || 20);
  const opts = { level, years, stopOnWin: !!flags.stop };
  if (flags.reserve != null) opts.reserve = +flags.reserve;
  if (flags.pay != null) opts.pay = +flags.pay;
  if (flags.culture != null) opts.culture = +flags.culture;
  const sums = [];
  for (let s = 1; s <= seeds; s++) {
    const r = play(Object.assign({ seed: s * 7919 }, opts));
    if (!flags.summary) { console.log(`\n=== ${level} seed ${s} ${r.lost ? 'LOST at ' + r.lostYear : ''}`); console.table(r.out); }
    const sm = summarize(r); sm.seed = s; sums.push(sm);
  }
  console.log(`\n### ${level} ${JSON.stringify(flags)}`);
  console.table(sums);
  const wins = sums.map((x) => x.won).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`wins ${wins.length}/${sums.length}, median win year ${wins.length ? wins[Math.floor(wins.length / 2)] : '-'}, lost ${sums.filter((x) => x.lost != null).length}`);
}
