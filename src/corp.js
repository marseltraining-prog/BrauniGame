/* =====================================================================
   КОРПОРАЦИЯ «Хлебная карта России» — второй акт, этап Р1 («Второй город», каркас).
   docs/russia-design.md: §2 (условие выхода, города), §5.1–5.3 (монтирование, упаковка, агрегированная модель),
   §7 (вход в город — упрощённо). Директоров, штаба и корпоративных событий пока нет (этапы Р2–Р3).

   Всё новое состояние — в S.corp (поля нет — второго акта ещё нет, игра как раньше):
   S.corp = { unlockedDay, active, market0: { seller, baker }, cities: { id: City }, rng, lastMonthly, aggRevP }
   City   = { id, name, enteredDay, status: 'launch'|'run', seed, mapGen, rng, aw, payK, payKb, numSeq,
              packed: null | { stores: [PackedStore], productions, offersSpecial, rival, office, fcPct }, aggFrom,
              hist: [[y, m, rev, profit, stores, rating, staff]], mAcc: { rev, profit, agg } }
   Активный город живёт в прежних полях (S.stores, S.productions, S.offers, S.rival, S.office…) и считается движком
   по дням. Остальные города упакованы и считаются раз в месяц облегчённой моделью «владелец заочно»:
   без роста, найм — из общего лимита владельца, рейтинг сползает к 3,5★.
   Свой ГСЧ у корпорации (S.corp.rng) и у каждого города (city.rng): основной поток Уфы не сдвигается.
   Боты: BK_CORP=0 — выключить Россию совсем (CFG.CORP_ON = false).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, I = E._int, C = () => BK.CFG, K = () => BK.CFG.CORP;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const def = (id) => BK.CITY_BY_ID[id];
  const cityName = (id) => (def(id) || {}).name || id;
  const on = (S) => !!(S && S.corp && S.corp.unlockedDay != null);

  function withRng(S, holder, key, fn) { // свой ГСЧ на время вызова (как у соперника)
    const keep = S.rng; S.rng = holder[key];
    try { return fn(); } finally { holder[key] = S.rng; S.rng = keep; }
  }
  const daysInMonthOf = (day) => { const t = E.dateOf(day); return new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate(); };
  // «уфимский» (корпоративный) рынок зарплат: рынок активного города ÷ его индекс зарплат
  function corpMarket(S) { if (!S.corp.active) return S.corp.market0; const w = def(S.corp.active) ? def(S.corp.active).wage : 1; return { seller: S.market.seller / w, baker: S.market.baker / w }; }

  /* ---------------- выход в Россию ---------------- */
  function check(S) {
    if (S.corp || !C().CORP_ON || !K()) return;
    if (S.cumRevenue < K().UNLOCK_REVENUE) return;
    unlock(S);
  }
  function unlock(S) {
    const ufa = { id: 'ufa', name: 'Уфа', enteredDay: 0, status: 'run', seed: S.seed | 0, mapGen: 0, rng: (S.seed ^ 0x3a1f5) | 0, aw: 1,
      payK: S.pay.seller / S.market.seller, payKb: S.pay.baker / S.market.baker, numSeq: S.flags.storeNum || 0, packed: null, aggFrom: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
    S.corp = { unlockedDay: S.day, active: 'ufa', market0: { seller: S.market.seller, baker: S.market.baker }, cities: { ufa }, rng: (S.seed ^ 0x5eed0c) | 0, lastMonthly: S.day, aggRevP: 0 };
    S.v = 2;
    S.notify.push({ type: 'corp' });
    I.log(S, `Сеть переросла город: оборот за всё время — ${BK.fmtMoney(S.cumRevenue)}. Открыт выход в Россию.`, 'good');
  }
  // при загрузке старого сохранения: условие уже выполнено — Россия откроется сразу
  function ensure(S) {
    if (!S) return;
    if (!S.corp) { if (C().CORP_ON && K() && S.phase === 'play' && S.cumRevenue >= K().UNLOCK_REVENUE) unlock(S); }
    const cr = S.corp;
    if (cr) {
      for (const id in cr.cities) { const c = cr.cities[id]; if (!c.mAcc) c.mAcc = { rev: 0, profit: 0, agg: 0 }; if (!c.hist) c.hist = []; }
      if (cr.lastMonthly == null) cr.lastMonthly = S.day - (E.dateOf(S.day).d - 1);
      if (cr.aggRevP == null) cr.aggRevP = 0;
    }
    applyGlobals(S);
  }
  // глобальные ссылки на карту активного города (BK.DISTRICTS / BK.MAP / BK.CITY)
  function applyGlobals(S) {
    if (!BK.useCity) return;
    const a = S && S.corp && S.corp.active, c = a && S.corp.cities[a];
    if (c && a !== 'ufa') BK.useCity(a, c.seed, c.mapGen); else BK.useCity(null);
  }

  /* ---------------- множители для движка ---------------- */
  function awMult(aw) { return 1 - K().AW_DEMAND + K().AW_DEMAND * clamp(aw, 0, 1); }
  function demandMult(S) { // узнаваемость бренда в активном городе (Уфа — 1)
    const c = S.corp.cities[S.corp.active]; if (!c || c.aw >= 1) return 1;
    return awMult(c.aw);
  }
  function otherStores(S) { // открытые точки в упакованных городах (порог событий «от N точек» — по всей сети)
    let n = 0; const cr = S.corp;
    for (const id in cr.cities) { const c = cr.cities[id]; if (c.packed && id !== cr.active) for (const s of c.packed.stores) if (s.status !== 'opening') n++; }
    return n;
  }

  /* ---------------- withCity: временно «смонтировать» данные упакованного города (ссылки, не копии) ---------------- */
  function withCity(S, id, fn) {
    const cr = S.corp, c = cr.cities[id];
    if (!c || id === cr.active || !c.packed) return fn();
    const keep = { stores: S.stores, productions: S.productions, offers: S.offers, prodOffers: S.prodOffers, rival: S.rival, D: BK.DISTRICTS, M: BK.MAP, P: BK.CENTER_POINT, CITY: BK.CITY };
    const pk = c.packed;
    S.stores = pk.stores; S.productions = pk.productions; S.offers = []; S.prodOffers = []; S.rival = pk.rival || { enabled: false, stores: [] };
    if (id === 'ufa') BK.useCity(null); else BK.useCity(id, c.seed, c.mapGen);
    try { return withRng(S, c, 'rng', fn); } finally {
      S.stores = keep.stores; S.productions = keep.productions; S.offers = keep.offers; S.prodOffers = keep.prodOffers; S.rival = keep.rival;
      BK.DISTRICTS = keep.D; BK.MAP = keep.M; BK.CENTER_POINT = keep.P; BK.CITY = keep.CITY;
    }
  }

  /* ---------------- упаковка / распаковка ---------------- */
  /* «Снимок потенциала» точки (§5.2) при стандартных условиях — май, без праздников и раскрутки:
     dem7 — спрос (чеков в день) по дням недели без узнаваемости, thr0 — сколько чеков успевает команда, chk0 — чек в ценах 2027,
     base — выручка в день (для карточки города). Сезон и праздники города, качество и люди — множители в агрегированном месяце. */
  function packStore(S, st, ms, wz, fill, aw) {
    const cfg = C(), pl = S.macro.priceLevel;
    const staff = st.staff.concat((st.incoming || []).map((x) => x.p));
    // считаем на самой точке (не на копии): storeDemand исключает себя из каннибализации по ссылке
    const keep = { status: st.status, staff: st.staff, openedDay: st.openedDay };
    st.status = 'open'; st.staff = staff; st.openedDay = null;
    let rev = 0, chk = 0, thr = 0; const dem7 = [];
    try {
      if (staff.length) for (let dow = 0; dow < 7; dow++) {
        const d = E.storeDemand(S, st, { dow, m: 4 }, ms);
        const checks = I.bakeChecks(Math.min(d.demand, d.thr) * fill, d, wz);
        rev += checks * d.check * wz.revMult / 7; chk += d.check * wz.revMult / 7; thr = d.thr;
        dem7.push(+(d.demand / aw).toFixed(1));
      }
    } finally { st.status = keep.status; st.staff = keep.staff; st.openedDay = keep.openedDay; }
    const lv = [0, 0, 0, 0, 0]; let md = 0, ls = 0;
    for (const e of staff) { lv[clamp(e.lvl, 1, 5) - 1]++; md += e.mood; ls += e.lvl; }
    const n = staff.length;
    // поправка настроения: усталость, характеры и застой, которых нет в агрегированной модели, — разница «факт − формула» при упаковке
    const tgt = moodTarget(S, S.pay.seller / S.market.seller, S.pay.seller, n ? ls / n : 1, Math.max(0, Math.min(st.staffTarget, cfg.SIZES[st.size].staffBase) - n), cfg.SIZES[st.size].staffBase);
    const p = Object.assign({}, st);
    delete p.staff; delete p.incoming; delete p.m; delete p.today; delete p._bot; delete p.mountFrom; delete p.mountK;
    Object.assign(p, {
      staff: { n, lv, mood: n ? md / n : 60 }, base: rev / pl / aw, chk0: (chk || cfg.RENT_REF_BASKET) / pl, dem7, thr0: thr,
      lvl0: n ? ls / n : 1, mood0: n ? md / n : 60, moodOff: n ? clamp(md / n - tgt, -40, 10) : 0, r0: st.rating != null ? st.rating : cfg.RATING_START, rep0: st.repair || 0, n0: Math.max(1, n),
    });
    return p;
  }
  function settleActive(S) { // постоянные расходы активного города за прошедшую часть месяца (иначе их никто не заплатит)
    const cfg = C(), cr = S.corp, L = cr.lastMonthly, dim = daysInMonthOf(L), pl = S.macro.priceLevel;
    const part = (o) => clamp((S.day - Math.max(L, o.mountFrom != null ? o.mountFrom : L)) / dim, 0, 1);
    let rev = 0, cost = 0, n = 0;
    for (const st of S.stores) {
      rev += st.m ? st.m.rev : 0; cost += st.m ? st.m.fc : 0;
      if (st.status === 'opening') continue;
      const f = part(st); n++;
      const rent = st.payMode === 'month' ? E.storeRentMonth(st) * f : 0;
      let pay = 0; for (const e of st.staff) pay += E.salaryOf(S, e.lvl) * (1 + cfg.PAYROLL_TAX);
      const util = (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * st.area) * pl * f, del = E.deliveryCost(S, st) * f;
      I.spend(S, rent, 'rent'); I.spend(S, pay * f, 'payroll'); I.spend(S, util, 'util'); I.spend(S, del, 'delivery');
      I.spend(S, cfg.HQ_PER_STORE * pl * f, 'upkeep');
      cost += rent + pay * f + util + del + cfg.HQ_PER_STORE * pl * f;
    }
    for (const p of S.productions) {
      const f = part(p);
      const rent = E.prodRentMonth(p) * f, pay = p.staff * S.pay.baker * (1 + cfg.PAYROLL_TAX) * f, util = (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * p.area) * pl * f;
      I.spend(S, rent, 'rent'); I.spend(S, pay, 'payroll'); I.spend(S, util, 'util');
      cost += rent + pay + util;
    }
    const c = cr.cities[cr.active];
    c.mAcc.rev += rev; c.mAcc.profit += rev * (1 - E.currentTaxRate(S)) - cost;
  }
  function unmount(S) {
    const cr = S.corp, c = cr.cities[cr.active]; if (!c) return;
    settleActive(S);
    const ms = E.menuStats(S), wz = E.wasteFactors(S, ms), fill = S.cache && S.cache.fill != null ? S.cache.fill : 1;
    const aw = demandMult(S);
    const fc = S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct * (C().FOODCOST_MULT || 1);
    c.packed = {
      stores: S.stores.map((st) => packStore(S, st, ms, wz, fill, aw)),
      productions: S.productions.map((p) => { const q = Object.assign({}, p); delete q.mountFrom; delete q.mountK; return q; }),
      offersSpecial: S.offers.filter((o) => o.special), rival: S.rival, office: S.office, fcPct: fc, fill, sales: wz.sales,
    };
    c.payK = S.pay.seller / S.market.seller; c.payKb = S.pay.baker / S.market.baker;
    c.numSeq = S.flags.storeNum || 0; c.aggFrom = S.day;
    cr.market0 = corpMarket(S);
    S.stores = []; S.productions = []; S.offers = []; S.prodOffers = []; S.candidates = [];
    S.rival = { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 };
    S.cache = null;
    cr.active = null;
  }
  function expandStore(S, p) {
    const cfg = C(), st = Object.assign({}, p), sd = p.staff;
    for (const k of ['base', 'chk0', 'lvl0', 'mood0', 'r0', 'rep0', 'n0']) delete st[k];
    const people = [];
    for (let l = 1; l <= 5; l++) for (let k = 0; k < (sd.lv[l - 1] || 0); k++) { // люди по распределению уровней: новые имена, настроение около среднего
      const e = I.makePerson(S, l); e.mood = clamp(sd.mood + I.rr(S, -6, 6), 0, 100); e.since = S.day - 90; e.lvlDay = S.day - 60; people.push(e);
    }
    st.m = { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 };
    st.today = null;
    if (st.status === 'opening' && S.day < st.openDay) { st.staff = []; st.incoming = people.map((e) => ({ p: e, day: st.openDay })); }
    else { if (st.status === 'opening') { st.status = 'open'; st.openedDay = st.openDay; } st.staff = people; st.incoming = []; }
    if (st.status === 'repair' && S.day >= st.repairUntil) { st.status = 'open'; st.repair += 1; }
    if (st.staffTarget < cfg.SIZES[st.size].staffMin) st.staffTarget = cfg.SIZES[st.size].staffMin;
    st.mountFrom = S.day;
    return st;
  }
  function mount(S, id) {
    const cr = S.corp, c = cr.cities[id];
    if (c.packed) settleAgg(S, c); // упакованная часть месяца — по агрегированной модели
    if (id === 'ufa') BK.useCity(null); else BK.useCity(id, c.seed, c.mapGen);
    const m0 = cr.market0, w = def(id).wage;
    S.market = { seller: m0.seller * w, baker: m0.baker * w };
    S.pay = { seller: Math.round(S.market.seller * (c.payK || 1)), baker: Math.round(S.market.baker * (c.payKb || c.payK || 1)) };
    S.flags.storeNum = c.numSeq || 0;
    cr.active = id;
    withRng(S, c, 'rng', () => {
      if (c.packed) {
        const pk = c.packed;
        S.stores = pk.stores.map((p) => expandStore(S, p));
        S.productions = pk.productions.map((p) => Object.assign({}, p, { mountFrom: S.day }));
        S.offers = (pk.offersSpecial || []).filter((o) => o.expires > S.day);
        S.rival = pk.rival || { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 };
        S.office = pk.office || S.office;
      } else {
        S.stores = []; S.productions = []; S.offers = [];
        S.rival = { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 };
        S.office = Object.assign({}, S.office, { hr: false, academy: false, ownerHires: 0, ownerTrains: 0 });
      }
      S.prodOffers = [];
      if (!S.productions.length) I.genProdOffers(S, 3);
      I.genStoreOffers(S, true);
      E.refreshCandidates(S, true);
    });
    c.packed = null; c.aggFrom = null;
    S.cache = null;
  }
  function switchCity(S, id) {
    const cr = S.corp; if (!on(S) || !cr.cities[id]) return { ok: false, msg: 'Город не найден' };
    if (cr.active === id) return { ok: true };
    const from = cr.active;
    unmount(S); mount(S, id);
    I.log(S, `Вы взяли управление ${cityIn(id)}. ${cityName(from)} — на автопилоте: точки работают, новых не открывается.`, 'info');
    return { ok: true };
  }
  const cityIn = (id) => (def(id) || {}).in || 'в городе ' + cityName(id);

  /* ---------------- агрегированная модель (раз в месяц; «владелец заочно», без директора) ---------------- */
  function salaryCity(S, c, lvl) { const m = corpMarket(S).seller * def(c.id).wage * (c.payK || 1); return m * (1 + C().EXPECT_PER_LVL * (lvl - 1)); }
  const REP = (i) => C().REPAIRS[i || 0] || { conv: 1, check: 1 };
  function ratingMultOf(r) { const cfg = C(), d = r - cfg.RATING_START; return 1 + (d < 0 ? cfg.RATING_TRAFFIC_LO : cfg.RATING_TRAFFIC_HI) * d; }
  // цель настроения команды (как в dailyStaff движка, без усталости и характеров): зарплата к рынку, культура, премии, лояльность, уровень, нехватка людей
  function moodTarget(S, payK, salary1, avgL, missing, staffBase) {
    const cfg = C();
    const payTerm = clamp((payK - 1) * (cfg.PAY_MOOD_K || 120), -40, 30), bonusTerm = clamp(S.lastBonusPerEmp / Math.max(1, salary1) * 100, 0, 15);
    return (cfg.MOOD_BASE != null ? cfg.MOOD_BASE : 60) + payTerm + cfg.CULTURE[S.culture].mood + bonusTerm + S.loyaltyMod + E.diffK(S, 'mood') + (avgL - 1) * 2.5 - Math.min(20, missing * 7 * (4 / staffBase));
  }
  function moodF(m) { const k = C().MOOD_CONV || 0; return 1 + k * (m - 60) / 40; }
  // средний множитель праздников города за период [d0, d1) (сезон и праздники города, §5.3)
  function holidayAvg(S, d0, d1) {
    if (!C().HOLIDAYS || d1 <= d0) return { dem: 1, chk: 1 };
    let a = 0, b = 0; for (let d = d0 + 1; d <= d1; d++) { const h = I.holidayDay(S, d); a += h.dem; b += h.chk; }
    return { dem: a / (d1 - d0), chk: b / (d1 - d0) };
  }
  // один агрегированный расчёт города за долю периода frac (0…1); деньги — в общий S.month по обычным статьям
  function cityMonth(S, c, frac, hireBudget) {
    const cfg = C(), K_ = K(), pl = S.macro.priceLevel, pk = c.packed, dc = def(c.id);
    const out = { rev: 0, profit: 0, emp: 0, stores: 0, hired: 0 };
    if (!pk || frac <= 0) { for (const s of (pk ? pk.stores : [])) if (s.status !== 'opening') { out.stores++; out.emp += s.staff.n; } return out; }
    const cr = S.corp, L = cr.lastMonthly, dim = daysInMonthOf(L), days = dim * frac, d0 = Math.round(S.day - days);
    const m = E.dateOf(Math.max(L + 1, S.day - 1)).m;
    return withCity(S, c.id, () => {
      const seas = I.SEASON[m] * (BK.CITY.season ? BK.CITY.season[m] : 1) / I.SEASON[4];
      const hol = holidayAvg(S, d0, S.day);
      const gmD = I.modScope(S, 'traffic', 'global') * I.modScope(S, 'conv', 'global') * I.modScope(S, 'competitor', 'global'), gmC = I.modScope(S, 'check', 'global');
      const fcm = I.modScope(S, 'foodcost', 'global');
      const aw = c.id === 'ufa' ? 1 : awMult(c.aw);
      const D = K_.ABSENT_D, epsC = I.gauss(S) * K_.EPS_CITY;
      const QP = cfg.QUIT_P || [0.00018, 0.0009, 0.0025];
      const tax = E.currentTaxRate(S);
      let rev = 0, fc = 0, rent = 0, pay = 0, util = 0, del = 0, hire = 0, hq = 0, units = 0;
      const hireOk = pk.office && pk.office.hr;
      for (const s of pk.stores) {
        if (s.status === 'opening' && S.day >= s.openDay) { s.status = 'open'; s.openedDay = s.openDay; }
        if (s.status === 'repair' && S.day >= s.repairUntil) { s.status = 'open'; s.repair = (s.repair || 0) + 1; }
        if (s.status === 'opening') continue;
        out.stores++;
        const sd = s.staff, sz = cfg.SIZES[s.size];
        // люди: настроение тянется к цели, часть уходит, владелец заочно нанимает из общего лимита
        let n = sd.n, lsum = 0; for (let l = 1; l <= 5; l++) lsum += l * (sd.lv[l - 1] || 0);
        let avgL = n ? lsum / n : 1;
        const missing = Math.max(0, Math.min(s.staffTarget, sz.staffBase) - n);
        const target = moodTarget(S, c.payK || 1, salaryCity(S, c, 1), avgL, missing, sz.staffBase) + (s.moodOff || 0);
        sd.mood = clamp(sd.mood + (target - sd.mood) * clamp(K_.MOOD_STEP * frac, 0, 1), 0, 100);
        let pd = sd.mood >= cfg.MOOD_HAPPY ? QP[0] : sd.mood >= cfg.MOOD_UNHAPPY ? QP[1] : QP[2];
        pd *= (1 - 0.08 * (avgL - 1)) * E.diffK(S, 'quit');
        let pm = 1 - Math.pow(1 - pd, days); if (sd.mood < cfg.MOOD_UNHAPPY) pm = Math.max(pm, 0.3 * frac);
        const qx = n * pm; let q = Math.floor(qx) + (I.rnd(S) < qx - Math.floor(qx) ? 1 : 0);
        while (q-- > 0 && n > 0) { // уходит человек случайного уровня (по долям)
          let r = I.rnd(S) * n, l = 0; for (; l < 5; l++) { r -= sd.lv[l] || 0; if (r < 0) break; }
          l = Math.min(4, l); if (!sd.lv[l]) l = sd.lv.findIndex((x) => x > 0);
          sd.lv[l]--; n--; S.stats.quits++;
        }
        let vac = Math.max(0, s.staffTarget - n);
        while (vac-- > 0 && (hireOk || hireBudget.left > 0)) {
          const lvl = I.rnd(S) < 0.28 ? 2 : 1; sd.lv[lvl - 1]++; n++; if (!hireOk) hireBudget.left--; out.hired++; S.stats.hires++;
          hire += cfg.HIRE_COST_SALARIES * salaryCity(S, c, lvl);
          sd.mood = (sd.mood * (n - 1) + 62) / n;
        }
        sd.n = n; lsum = 0; for (let l = 1; l <= 5; l++) lsum += l * (sd.lv[l - 1] || 0); avgL = n ? lsum / n : 1;
        // рейтинг заочно сползает к 3,5★
        s.rating = (s.rating != null ? s.rating : cfg.RATING_START) + (K_.ABSENT_RATING - (s.rating != null ? s.rating : cfg.RATING_START)) * (1 - Math.exp(-days / cfg.RATING_DAYS));
        out.emp += n;
        // выручка
        // спрос × (сезон, праздники, качество «сейчас против снимка», узнаваемость, директор, раскрутка, события, шум), но не больше, чем успевает команда
        const dl = avgL - (s.lvl0 || 1), R1 = REP(s.repair), R0 = REP(s.rep0), lvl0 = s.lvl0 || 1;
        const Qd = (1 + cfg.LVL_CONV * dl) * moodF(sd.mood) / moodF(s.mood0 != null ? s.mood0 : 60) * ratingMultOf(s.rating) / ratingMultOf(s.r0 != null ? s.r0 : cfg.RATING_START) * R1.conv / R0.conv * (n < sz.staffMin ? 0.85 : 1) / ((s.n0 || 1) < sz.staffMin ? 0.85 : 1);
        const Qc = (1 + cfg.LVL_CHECK * dl) * R1.check / R0.check;
        const G = n * (cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * (avgL - 1)) / ((s.n0 || 1) * (cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * (lvl0 - 1)));
        const ramp = s.openedDay != null && cfg.RAMP_DAYS ? Math.min(1, cfg.RAMP_START + (1 - cfg.RAMP_START) * (S.day - days / 2 - s.openedDay) / cfg.RAMP_DAYS) : 1;
        const sum = m >= 5 && m <= 7 && (s.landmarks || []).some((id) => { const l = E.byId(BK.LANDMARKS, id); return l && l.summer; }) ? 1.25 : 1; // парки летом (как в storeDemand)
        const F = seas * sum * hol.dem * Qd * aw * D * Math.max(0.3, ramp) * gmD * Math.max(0.5, 1 + epsC + I.gauss(S) * K_.EPS_STORE);
        let cpd = 0;
        if (s.dem7 && s.dem7.length) { for (const x of s.dem7) cpd += Math.min(x * F, (s.thr0 || 1e9) * G) / s.dem7.length; cpd *= (pk.fill != null ? pk.fill : 1) * (pk.sales != null ? pk.sales : 1); }
        else cpd = s.base / (s.chk0 || 200) * F * Math.min(1, G);
        const closed = s.status === 'repair' || n === 0 ? 0 : 1;
        const r = closed * days * cpd * (s.chk0 || 200) * pl * hol.chk * Qc * gmC;
        const f1 = r * pk.fcPct * fcm;
        const rn = s.payMode === 'month' ? E.storeRentMonth(s) * frac : 0;
        if (s.payMode === 'year' && S.day >= (s.rentPaidUntil || 0)) { const y = E.storeRentMonth(s) * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT); rent += y; s.rentPaidUntil = S.day + 365; }
        let py = 0; for (let l = 1; l <= 5; l++) py += (sd.lv[l - 1] || 0) * salaryCity(S, c, l); py *= (1 + cfg.PAYROLL_TAX) * frac;
        const ut = (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * s.area) * pl * frac;
        s.cpd = closed * cpd;
        const dv = E.deliveryCost(S, s) * frac;
        const h1 = cfg.HQ_PER_STORE * pl * frac + r * (cfg.HQ_REV_SHARE || 0);
        units += s.cpd * cfg.ITEMS_PER_CHECK;
        rev += r; fc += f1; rent += rn; pay += py; util += ut; del += dv; hq += h1;
        // отчёт точки (для карточки города и «Требует внимания»)
        s.last = { rev: r, profit: r - f1 - rn - py - ut - dv - h1 - r * tax, checks: s.cpd * days, frac };
        if (frac >= 0.5) { s.hist = (s.hist || []).concat([Math.round(r / frac)]).slice(-12); s.lossStreak = s.last.profit < 0 ? (s.lossStreak || 0) + 1 : 0; }
      }
      // цеха города: аренда, пекари под объём, коммуналка
      let pRent = 0, pPay = 0, pUtil = 0;
      const payB = corpMarket(S).baker * dc.wage * (c.payKb || c.payK || 1);
      const nOpen = pk.productions.length || 1;
      for (const p of pk.productions) {
        if (p.status === 'opening' && S.day >= p.openDay) p.status = 'open';
        const need = cfg.PROD_STAFF_BASE + Math.ceil(units / nOpen / cfg.PROD_UNITS_PER_BAKER);
        if (p.staff < need) { hire += (need - p.staff) * cfg.HIRE_COST_SALARIES * payB; p.staff = need; } else if (p.staff > need + 2) p.staff -= 1;
        p.need = need;
        const a = E.prodRentMonth(p) * frac, b = p.staff * payB * (1 + cfg.PAYROLL_TAX) * frac, u = (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * p.area) * pl * frac;
        p.lastCost = a + b + u; pRent += a; pPay += b; pUtil += u;
      }
      const prod = pRent + pPay + pUtil;
      // отделы офиса города (если были открыты) продолжают работать
      const off = pk.office || {}, nst = pk.stores.length;
      if (off.hr) hq += Math.max(1, Math.ceil(nst / cfg.HR_STORES_PER)) * cfg.HR_SALARY * (1 + cfg.PAYROLL_TAX) * pl * frac;
      // деньги — в общий месяц
      S.cash += rev; S.month.rev += rev; S.cumRevenue += rev; S.yearRev += rev;
      I.spend(S, fc, 'fc'); I.spend(S, rent, 'rent'); I.spend(S, pay, 'payroll'); I.spend(S, util, 'util'); I.spend(S, del, 'delivery');
      I.spend(S, hq, 'upkeep'); I.spend(S, hire, 'hire');
      I.spend(S, pRent, 'rent'); I.spend(S, pPay, 'payroll'); I.spend(S, pUtil, 'util');
      out.rev = rev; out.profit = rev * (1 - tax) - fc - rent - pay - util - del - hq - hire - prod;
      return out;
    });
  }
  // упакованная часть месяца — при монтировании города посреди месяца
  function settleAgg(S, c) {
    const cr = S.corp, L = cr.lastMonthly, dim = daysInMonthOf(L);
    const frac = clamp((S.day - Math.max(L, c.aggFrom != null ? c.aggFrom : L)) / dim, 0, 1);
    const hb = { left: Math.round(C().OWNER_HIRES_PER_WEEK * dim * frac / 7) };
    const r = cityMonth(S, c, frac, hb);
    c.mAcc.rev += r.rev; c.mAcc.profit += r.profit; c.mAcc.agg += r.rev; cr.aggRevP += r.rev;
  }

  /* ---------------- 1-е число: вызывается в начале monthly() ---------------- */
  function monthly(S, t) {
    const cfg = C(), cr = S.corp, L = cr.lastMonthly != null ? cr.lastMonthly : S.day - daysInMonthOf(S.day - 1), dim = Math.max(1, S.day - L);
    const out = { rev: 0, emp: 0, stores: 0 };
    const hb = { left: Math.round(cfg.OWNER_HIRES_PER_WEEK * dim / 7) }; // общий лимит найма владельца на все города без директора
    for (const id in cr.cities) {
      const c = cr.cities[id];
      if (id === cr.active || !c.packed) continue;
      const frac = clamp((S.day - Math.max(L, c.aggFrom != null ? c.aggFrom : L)) / dim, 0, 1);
      const r = cityMonth(S, c, frac, hb);
      c.mAcc.rev += r.rev; c.mAcc.profit += r.profit; c.mAcc.agg += r.rev; cr.aggRevP += r.rev;
      out.emp += r.emp; out.stores += r.stores;
    }
    // активный город смонтирован посреди месяца — его постоянные расходы только за свою часть
    for (const st of S.stores) if (st.mountFrom != null) { st.mountK = clamp((S.day - Math.max(L, st.mountFrom)) / dim, 0, 1); delete st.mountFrom; }
    for (const p of S.productions) if (p.mountFrom != null) { p.mountK = clamp((S.day - Math.max(L, p.mountFrom)) / dim, 0, 1); delete p.mountFrom; }
    out.rev = cr.aggRevP;
    // узнаваемость новых городов (§7.3): цель растёт с числом точек и маркетингом
    const mk = S.lastMarketingPerStore || 0, mkt = K().AW_MKT_MAX * mk / (mk + cfg.MARKETING_HALF * S.macro.priceLevel);
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (id === 'ufa') { c.aw = 1; continue; }
      const n = id === cr.active ? S.stores.length : c.packed ? c.packed.stores.length : 0;
      const target = Math.min(1, K().AW_BASE + K().AW_PER_STORE * n + mkt);
      c.aw = clamp(c.aw + (target - c.aw) * K().AW_SPEED, 0, 1);
    }
    return out;
  }
  // после записи истории: выручка Уфы (c1 — цель первого акта), строки истории городов
  function afterMonth(S, h, agg) {
    const cr = S.corp, act = cr.cities[cr.active];
    if (act) { // активный город: выручка и прибыль точек за месяц (без накладных сети)
      let rev = 0, pr = 0; for (const st of S.stores) if (st.last) { rev += st.last.rev; pr += st.last.profit; }
      for (const p of S.productions) pr -= p.lastCost || 0;
      act.mAcc.rev += rev; act.mAcc.profit += pr;
      if (act.status === 'launch' && S.stores.some((s) => s.status !== 'opening')) act.status = 'run';
    }
    let other = 0; for (const id in cr.cities) if (id !== 'ufa') other += cr.cities[id].mAcc.rev;
    h.c1 = cr.active === 'ufa' ? h.rev - other : cr.cities.ufa.mAcc.rev;
    for (const id in cr.cities) {
      const c = cr.cities[id], active = id === cr.active;
      const st = active ? S.stores.filter((s) => s.status !== 'opening') : c.packed ? c.packed.stores.filter((s) => s.status !== 'opening') : [];
      let rt = 0, staff = 0; for (const s of st) { rt += active ? E.storeRating(S, s) : s.rating || 0; staff += active ? s.staff.length : s.staff.n; }
      c.hist.push([h.y, h.m, Math.round(c.mAcc.rev), Math.round(c.mAcc.profit), st.length, st.length ? +(rt / st.length).toFixed(2) : 0, staff]);
      if (c.hist.length > K().HIST_MAX) c.hist.shift();
      c.mAcc = { rev: 0, profit: 0, agg: 0 };
    }
    cr.aggRevP = 0; cr.lastMonthly = S.day;
    cr.market0 = corpMarket(S);
  }
  function yearly(S, infl, rentReview) { // индексация аренды в упакованных городах (как у Уфы)
    const cr = S.corp;
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (!c.packed || id === cr.active) continue;
      for (const s of c.packed.stores) s.rentM2 = rentReview(S, s, infl * 0.85);
      for (const p of c.packed.productions) p.rentM2 = Math.round(p.rentM2 * (1 + infl * 0.85));
    }
  }

  /* ---------------- вход в город (упрощённо: свой цех + точки, как старт в Уфе) ---------------- */
  function ownCount(S) { return on(S) ? Object.keys(S.corp.cities).length : 0; }
  function enterCost(S, id) {
    const d = def(id); if (!d) return 0;
    return Math.round((K().ENTER_FEE + K().ENTER_MKT * d.rent) * S.macro.priceLevel * (d.far ? K().FAR_K : 1) / 1e5) * 1e5;
  }
  function awStart(S, id) {
    const d = def(id);
    if (d.aw0 != null) return d.aw0;
    let near = 0; for (const o in S.corp.cities) if (BK.roadKm(o, id) < K().AW_NEAR_KM) near++;
    return Math.min(K().AW_START_MAX, K().AW_START + K().AW_NEAR * near) + K().AW_MKT;
  }
  function enterLock(S, id) { // null — можно; иначе причина
    const d = def(id);
    if (!on(S)) return 'Выход в Россию ещё не открыт';
    if (!d || d.builtin) return 'Город недоступен';
    if (S.corp.cities[id]) return 'Уже ваш город';
    // TODO(Р3): Москва и Петербург — после 3 городов И финансового департамента (штаб появится на этапе Р3)
    if (d.big && ownCount(S) < K().BIG_MIN_CITIES) return `Откроется, когда в сети будет ${K().BIG_MIN_CITIES} города`;
    const launching = Object.values(S.corp.cities).filter((c) => c.id !== 'ufa' && S.day - c.enteredDay < K().LAUNCH_DAYS).length;
    if (launching >= K().MAX_LAUNCHING) return `Одновременно запускаются не больше ${K().MAX_LAUNCHING} городов — подождите полгода после входа`;
    return null;
  }
  function enterCity(S, id) {
    const lock = enterLock(S, id); if (lock) return { ok: false, msg: lock };
    const cost = enterCost(S, id);
    if (S.cash < cost) return { ok: false, msg: `Не хватает ${BK.fmtMoney(cost - S.cash)}` };
    const cr = S.corp;
    const seed = withRng(S, cr, 'rng', () => I.ri(S, 1, 2e9));
    I.spend(S, cost, 'other');
    const cur = cr.cities[cr.active] || {};
    cr.cities[id] = { id, name: cityName(id), enteredDay: S.day, status: 'launch', seed, mapGen: 1, rng: (seed ^ 0x51ed27) | 0, aw: awStart(S, id),
      payK: S.pay.seller / S.market.seller, payKb: S.pay.baker / S.market.baker, numSeq: 0, packed: null, aggFrom: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
    void cur;
    I.log(S, `Вход ${cityIn(id)}: регистрация, разрешения и стартовый маркетинг — ${BK.fmtMoney(cost)}. Выберите помещение под цех.`, 'good');
    switchCity(S, id);
    return { ok: true, cost };
  }
  // шаг запуска нового города: 'prod' — нужен цех, 'store' — первая точка, null — город работает
  function citySetup(S) {
    if (!on(S) || !S.corp.active || S.corp.active === 'ufa' || S.phase !== 'play') return null;
    if (!S.productions.length) return 'prod';
    if (!S.stores.length) return 'store';
    return null;
  }

  /* ---------------- сводки для интерфейса ---------------- */
  function cityStats(S, id) {
    const cr = S.corp, c = cr.cities[id]; if (!c) return null;
    const active = id === cr.active, h = c.hist[c.hist.length - 1] || null;
    const list = active ? S.stores : c.packed ? c.packed.stores : [];
    const open = list.filter((s) => s.status !== 'opening');
    let staff = 0, rt = 0; for (const s of open) { staff += active ? s.staff.length : s.staff.n; rt += active ? E.storeRating(S, s) : s.rating || 0; }
    const prods = active ? S.productions.length : c.packed ? c.packed.productions.length : 0;
    const rev12 = c.hist.slice(-12).reduce((a, x) => a + x[2], 0), prof12 = c.hist.slice(-12).reduce((a, x) => a + x[3], 0);
    return { id, name: c.name, active, mode: active ? 'manual' : 'auto', status: c.status, stores: list.length, open: open.length, soon: list.length - open.length, prods, staff,
      rating: open.length ? rt / open.length : null, aw: c.aw, lastRev: h ? h[2] : null, lastProfit: h ? h[3] : null, rev12, prof12, months: c.hist.length, hist: c.hist, enteredDay: c.enteredDay };
  }
  function summary(S) {
    if (!on(S)) return null;
    const cr = S.corp, cities = Object.keys(cr.cities).map((id) => cityStats(S, id));
    let stores = 0, staff = 0; for (const c of cities) { stores += c.stores; staff += c.staff; }
    return { active: cr.active, cities, stores, staff, unlockedDay: cr.unlockedDay };
  }
  function rollingAll(S) { let s = 0; for (const x of S.history.slice(-12)) s += x.rev; return s; }

  BK.Corp = { check, ensure, applyGlobals, demandMult, otherStores, monthly, afterMonth, yearly, withCity, mount, unmount, switchCity, enterCity, enterCost, enterLock, awStart, citySetup, cityStats, summary, rollingAll, corpMarket, on, awMult, cityMonth };
  Object.assign(BK.Engine, { mountCity: mount, unmountCity: unmount, withCity, switchCity, enterCity, enterCost, enterLock, citySetup, corpSummary: summary, corpMonthly: monthly, corpOn: on });
})();
