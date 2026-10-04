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
  const cityName = (id, S) => (S ? cityDef(S, id) : def(id) || {}).name || id;
  const on = (S) => !!(S && S.corp && S.corp.unlockedDay != null);

  function withRng(S, holder, key, fn) { // свой ГСЧ на время вызова (как у соперника)
    const keep = S.rng; S.rng = holder[key];
    try { return fn(); } finally { holder[key] = S.rng; S.rng = keep; }
  }
  const daysInMonthOf = (day) => { const t = E.dateOf(day); return new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate(); };
  // «уфимский» (корпоративный) рынок зарплат: рынок активного города ÷ его индекс зарплат
  function cityDef(S, id) { // ключ `ufa` в корпорации означает домашний город, в сценарии им может быть Москва
    const real = realCityId(S, id);
    return def(real) || def('ufa') || {};
  }
  // Ключ ufa зарезервирован за домашним городом ради совместимости сохранений.
  // Отдельный вход в настоящую Уфу из другого города пока недоступен.
  const homeCityId = (S) => startCityOf(S) || 'ufa';
  const realCityId = (S, id) => id === 'ufa' ? homeCityId(S) : id;
  const roadKm = (S, a, b) => BK.roadKm(realCityId(S, a), realCityId(S, b));
  function mapCities(S) {
    const home = homeCityId(S);
    if (home === 'ufa') return BK.CITIES;
    return BK.CITIES.filter((d) => d.id !== home).map((d) => d.id === 'ufa' ? Object.assign({}, cityDef(S, 'ufa'), { id: 'ufa', geoId: home }) : d);
  }
  function corpMarket(S) { if (!S.corp.active) return S.corp.market0; const w = cityDef(S, S.corp.active).wage || 1; return { seller: S.market.seller / w, baker: S.market.baker / w }; }

  /* ---------------- выход в Россию ---------------- */
  function check(S) {
    if (S.corp || !C().CORP_ON || !K()) return;
    if (S.cumRevenue < K().UNLOCK_REVENUE) return;
    if (S.story && S.story.f && S.story.f.ufa === 'deep') return; // сюжет: выбран «Глубина» — Россия закрыта
    unlock(S);
  }
  function unlock(S) {
    const ufa = { id: 'ufa', name: cityDef(S, 'ufa').name, enteredDay: 0, status: 'run', seed: S.seed | 0, mapGen: 0, rng: (S.seed ^ 0x3a1f5) | 0, aw: 1,
      payK: S.pay.seller / S.market.seller, payKb: S.pay.baker / S.market.baker, numSeq: S.flags.storeNum || 0, packed: null, aggFrom: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
    const homeWage = cityDef(S, 'ufa').wage || 1;
    S.corp = { unlockedDay: S.day, active: 'ufa', market0: { seller: S.market.seller / homeWage, baker: S.market.baker / homeWage }, cities: { ufa }, rng: (S.seed ^ 0x5eed0c) | 0, lastMonthly: S.day, aggRevP: 0 };
    S.v = 2;
    if (BK.Dir) BK.Dir.ensure(S);
    S.notify.push({ type: 'corp' });
    I.log(S, `Сеть переросла город: оборот за всё время — ${BK.fmtMoney(S.cumRevenue)}. Открыт выход в Россию.`, 'good');
  }
  // при загрузке старого сохранения: условие уже выполнено — Россия откроется сразу
  function ensure(S) {
    if (!S) return;
    if (!S.corp) { if (C().CORP_ON && K() && S.phase === 'play' && S.cumRevenue >= K().UNLOCK_REVENUE && !(S.story && S.story.f && S.story.f.ufa === 'deep')) unlock(S); }
    const cr = S.corp;
    if (cr) {
      if (cr.cities.ufa) cr.cities.ufa.name = cityDef(S, 'ufa').name;
      for (const id in cr.cities) { const c = cr.cities[id]; if (!c.mAcc) c.mAcc = { rev: 0, profit: 0, agg: 0 }; if (!c.hist) c.hist = []; if (c.packed && c.packed.stores) c.packed.stores = c.packed.stores.map(canonStore); }
      if (cr.lastMonthly == null) cr.lastMonthly = S.day - (E.dateOf(S.day).d - 1);
      if (cr.aggRevP == null) cr.aggRevP = 0;
      if (BK.Dir) BK.Dir.ensure(S); // директора, входящие, цель акта — значения по умолчанию для сохранений Р1
    }
    applyGlobals(S);
  }
  // Глобальные ссылки на карту активного города (BK.DISTRICTS / BK.MAP / BK.CITY)
  // Город партии, когда второго акта ещё нет: поле S.startCity (новые партии — engine.newGame) или город
  // истории. Благодаря ему загрузка «Старта в Москве» открывается в Москве, а не в Уфе (задача 1 «Задачи по каркасу»).
  function startCityOf(S) {
    if (S && typeof S.startCity === 'string' && S.startCity) return S.startCity === 'ufa' ? null : S.startCity;
    const id = S && S.scen && S.scen.id;
    const d = id && BK.SCEN && BK.SCEN.list && BK.SCEN.list[id];
    const c = (d && d.start && d.start.city) || null;
    if (!c || c === 'ufa') return null;
    // Страховка старых сохранений: до правки каркаса история «Старт в Москве» игралась в Уфе, и её мир
    // (районы точек, предложений и площадок) — уфимский. Такому сохранению Москва сломала бы игру — оставляем Уфу.
    return worldFits(S, c) ? c : null;
  }
  function worldFits(S, cityId) {
    const def = BK.CITY_BY_ID && BK.CITY_BY_ID[cityId];
    if (!def || def.builtin || !BK.genCityGeo) return false;
    let g = null; try { g = BK.genCityGeo(def, (S && S.seed | 0) || 0, 1); } catch (e) { return false; }
    const ids = {}; for (const d of (g && g.DISTRICTS) || []) ids[d.id] = 1;
    const world = [].concat((S && S.stores) || [], (S && S.offers) || [], (S && S.productions) || [], (S && S.prodOffers) || [], (S && S.rival && S.rival.stores) || []);
    for (const o of world) if (o && o.district && !ids[o.district]) return false;
    return true;
  }
  // Карта города для движка: «уфа» в состоянии корпорации — это домашний город партии, а он не всегда Уфа
  // («Старт в Москве»). Остальные города — сами собой (id + зерно + mapGen из S.corp.cities).
  function useCityFor(S, id, c) {
    if (id && id !== 'ufa' && c) BK.useCity(id, c.seed, c.mapGen);
    else BK.useCity(startCityOf(S), (S && S.seed) || 0);
  }
  function applyGlobals(S) {
    if (!BK.useCity) return;
    const a = S && S.corp && S.corp.active, c = a && S.corp.cities[a];
    syncOpenDays(S, a); // нити истории: срок открытия точки в городе × openGap (обиженный инспектор — дольше, друг — быстрее)
    useCityFor(S, a || 'ufa', c); // подробно считается активный город; без корпорации — город истории, иначе Уфа
  }

  /* ---------------- нити истории (BK.Threads, src/threads.js) ----------------
     Срок открытия точки в городе = базовый (CFG.OPEN_DAYS_BASE) × поправка нити. Движок читает
     CFG.OPEN_DAYS как обычно, поэтому меняется только множитель, а не сам движок. */
  function openK(S, id) { return (S && BK.Threads && BK.Threads.openGap) ? BK.Threads.openGap(S, id) : 1; }
  function syncOpenDays(S, id) {
    const cfg = C(); if (!cfg || !cfg.OPEN_DAYS) return 1;
    if (cfg.OPEN_DAYS_BASE == null) cfg.OPEN_DAYS_BASE = cfg.OPEN_DAYS;
    cfg.OPEN_DAYS = Math.max(1, Math.round(cfg.OPEN_DAYS_BASE * openK(S, id)));
    return cfg.OPEN_DAYS;
  }

  /* ---------------- множители для движка ---------------- */
  function awMult(aw) { return 1 - K().AW_DEMAND + K().AW_DEMAND * clamp(aw, 0, 1); }
  function demandMult(S) { // узнаваемость бренда в активном городе (Уфа — 1); внутри withCity — в городе, который «смонтирован» временно
    const c = S.corp.cities[S.corp._with || S.corp.active]; if (!c || c.aw >= 1) return 1;
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
    useCityFor(S, id, c);
    const w0 = cr._with, a0 = cr._actProd; cr._with = id; if (w0 == null) cr._actProd = keep.productions; // цеха активного города — для снабжения из него (§7.2)
    const kd0 = C().OPEN_DAYS; syncOpenDays(S, id); // нити истории: у этого города свой срок открытия точки
    try { return withRng(S, c, 'rng', fn); } finally {
      C().OPEN_DAYS = kd0;
      if (w0 == null) { delete cr._with; delete cr._actProd; } else { cr._with = w0; cr._actProd = a0; }
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
    const keep = { status: st.status, staff: st.staff, openedDay: st.openedDay, mods: S.mods };
    st.status = 'open'; st.staff = staff; st.openedDay = null;
    // события (моды трафика, конверсии, чека) в снимок не попадают: агрегат применяет действующие моды сам — иначе кризис,
    // шедший в день упаковки, остался бы в снимке навсегда (и считался дважды, пока идёт)
    S.mods = [];
    // время суток (§17): вечерняя скидка и остатки — по профилю дня точки, как в dailyStores (storeWaste)
    const ws = I.storeWaste ? I.storeWaste(wz, st) : { revMult: wz.revMult, waste: wz.waste };
    let rev = 0, chk = 0, thr = 0; const dem7 = [];
    try {
      let dW = null, dE = null; // будни и выходные считаются одинаково внутри группы — два расчёта вместо семи (производительность)
      if (staff.length) for (let dow = 0; dow < 7; dow++) {
        const d = dow >= 5 ? dE || (dE = E.storeDemand(S, st, { dow, m: 4 }, ms)) : dW || (dW = E.storeDemand(S, st, { dow, m: 4 }, ms));
        const checks = I.bakeChecks(Math.min(d.demand, d.thr) * fill, d, wz);
        rev += checks * d.check * ws.revMult / 7; chk += d.check * ws.revMult / 7; thr = d.thr;
        dem7.push(+(d.demand / aw).toFixed(1));
      }
    } finally { st.status = keep.status; st.staff = keep.staff; st.openedDay = keep.openedDay; S.mods = keep.mods; }
    const lv = [0, 0, 0, 0, 0]; let md = 0, ls = 0;
    for (const e of staff) { lv[clamp(e.lvl, 1, 5) - 1]++; md += e.mood; ls += e.lvl; }
    const n = staff.length;
    // поправка настроения: усталость, характеры и застой, которых нет в агрегированной модели, — разница «факт − формула» при упаковке
    const tgt = moodTarget(S, S.pay.seller / S.market.seller, S.pay.seller, n ? ls / n : 1, Math.max(0, Math.min(st.staffTarget, cfg.SIZES[st.size].staffBase) - n), cfg.SIZES[st.size].staffBase);
    const p = Object.assign({}, st);
    delete p.staff; delete p.incoming; delete p.m; delete p.today; delete p._bot; delete p.mountFrom; delete p.mountK;
    Object.assign(p, {
      staff: { n, lv, mood: n ? md / n : 60 }, base: rev / pl / aw, chk0: (chk || cfg.RENT_REF_BASKET) / pl, dem7, thr0: thr,
      mn0: [+ms.appeal.toFixed(4), +(ms.avgPrice / pl).toFixed(2), +ms.priceIdx.toFixed(4)], lvl0: n ? ls / n : 1, mood0: n ? md / n : 60, moodOff: n ? clamp(md / n - tgt, -40, 10) : 0, r0: st.rating != null ? st.rating : cfg.RATING_START, rep0: st.repair || 0, n0: Math.max(1, n),
    });
    if (BK.CITY && BK.CITY.grow) p.g0 = +growthK(S).toFixed(4); // рост города: спрос в снимке — при населении на момент упаковки
    // компактное сохранение (Р4, §8.2 п. 6): лишние знаки после запятой не нужны
    p.x = +(+p.x).toFixed(1); p.y = +(+p.y).toFixed(1); if (p.capex != null) p.capex = Math.round(p.capex); p.base = Math.round(p.base); p.chk0 = +p.chk0.toFixed(2);
    p.lvl0 = +p.lvl0.toFixed(3); p.mood0 = +p.mood0.toFixed(2); p.moodOff = +p.moodOff.toFixed(2); p.r0 = +p.r0.toFixed(4); p.staff.mood = +p.staff.mood.toFixed(2);
    if (p.rating != null) p.rating = +p.rating.toFixed(4); if (p.cpd != null) p.cpd = +p.cpd.toFixed(1);
    if (p.last) { const l = p.last = Object.assign({}, p.last); for (const k in l) if (typeof l[k] === 'number' && k !== 'frac') l[k] = Math.round(l[k]); }
    packZeros(p);
    return canonStore(p);
  }
  /* единая «форма» упакованной точки в памяти (§17, производительность): все известные поля в одном порядке, отсутствующие —
     undefined (в сохранение не попадают — JSON их пропускает). Иначе у ~500 точек два десятка разных форм объекта, и месячный цикл
     агрегата работает через медленный полиморфный доступ к полям. Неизвестные поля — в конце, как были. */
  const PK_KEYS = ['id', 'address', 'district', 'x', 'y', 'area', 'size', 'rentM2', 'payMode', 'rentPaidUntil', 'traffic', 'solv', 'landmarks', 'comp', 'status', 'openDay', 'openedDay',
    'repair', 'repairUntil', 'closedUntil', 'staffTarget', 'capex', 'hist', 'num', 'rating', 'staff', 'base', 'chk0', 'dem7', 'thr0', 'mn0', 'lvl0', 'mood0', 'moodOff', 'r0', 'rep0', 'n0',
    'byDir', 'bought', 'g0', 'pr0', 'ld', 'cpd', 'last', 'agg', 'aggPaid', 'aggDay', 'lossStreak', 'lostDays'];
  function canonStore(p) { const o = {}; for (const k of PK_KEYS) o[k] = p[k]; for (const k in p) if (!(k in o)) o[k] = p[k]; return o; }
  // нулевые служебные поля упакованной точки не храним (expandStore вернёт их при распаковке)
  function packZeros(p) { for (const k of ['repairUntil', 'closedUntil', 'lossStreak', 'lostDays']) if (p[k] === 0) delete p[k]; if (p.rentPaidUntil === 0 && p.payMode !== 'year') delete p.rentPaidUntil; if (p.moodOff === 0) delete p.moodOff; if (p.agg === false) delete p.agg; if (!p.agg && p.aggDay != null) delete p.aggDay; }
  // оборудование цехов (взвешено по мощности, как в dailyStores): множитель фудкоста и доля мощности с ERP
  function prodFcNow(S) {
    let w = 0, f = 0, erp = 0;
    for (const p of S.productions) if (p.status === 'open') { const c = E.prodCapacity(S, p); w += c; f += c * E.prodFcMult(S, p); if (p.equip && p.equip.erp) erp += c; }
    return w > 0 ? { fc: f / w, erp: erp / w } : { fc: 1, erp: 0 };
  }
  /* фудкост для упакованного города (без заморозки — она в агрегате отдельно, §7.2, и без действующих событий «фудкост» —
     агрегат применяет их сам): fcPct — с учётом списаний и вечерней скидки сети (как S.cache.fcPct), fcB — чистый, без списаний
     (как fcPct в dailyStores: к нему по точке добавляются остатки по профилю дня, у доставки списаний нет); pf0/erp0 — оборудование
     цехов при упаковке, wz0 — остатки и вечерняя скидка сети (§17) */
  function fcBase(S, ms, wz) {
    const cfg = C(), mult = cfg.FOODCOST_MULT || 1, rv = wz.revMult || 1;
    let fc = S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct * mult;
    fc -= remoteFc(S) / rv;
    const cr = S.corp, mk = I.modScope(S, 'foodcost', 'global', null) * (cr && cr.active ? I.modScope(S, 'foodcost', 'city', cr.active) : 1);
    if (mk > 0) fc /= mk;
    const pq = prodFcNow(S);
    return { fcPct: fc, fcB: +(fc * rv / (1 + (wz.waste || 0) / mult)).toFixed(5), pf0: +pq.fc.toFixed(4), erp0: +pq.erp.toFixed(3),
      wz0: { left: +(wz.left || 0).toFixed(5), i: wz.i || 0, disc: wz.disc || 0 } }; // остатки и вечерняя скидка сети — по точке считаются через профиль дня (storeWaste)
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
    const fb = fcBase(S, ms, wz);
    c.packed = {
      stores: S.stores.map((st) => packStore(S, st, ms, wz, fill, aw)),
      productions: S.productions.map((p) => { const q = Object.assign({}, p); delete q.mountFrom; delete q.mountK; return q; }),
      offersSpecial: S.offers.filter((o) => o.special), rival: S.rival, office: S.office, fcMs0: ms.fcPct, fill, sales: wz.sales, fcK0: cr.hqFcK || 1,
    };
    Object.assign(c.packed, fb);
    // давление соперника в снимке: в подробном городе «Хлебный двор» уже учтён спросом (Р3)
    if (S.rival && S.rival.enabled && c.id !== 'ufa') for (const p of c.packed.stores) p.pr0 = c.rp || 0;
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
    for (const k of ['base', 'chk0', 'lvl0', 'mood0', 'r0', 'rep0', 'n0', 'mn0', 'dem7', 'thr0', 'moodOff', 'byDir', 'g0', 'ld']) delete st[k];
    const people = [];
    for (let l = 1; l <= 5; l++) for (let k = 0; k < (sd.lv[l - 1] || 0); k++) { // люди по распределению уровней: новые имена, настроение около среднего
      const e = I.makePerson(S, l); e.mood = clamp(sd.mood + I.rr(S, -6, 6), 0, 100); e.since = S.day - 90; e.lvlDay = S.day - 60; people.push(e);
    }
    st.m = { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 };
    st.today = null;
    for (const k of ['repairUntil', 'closedUntil', 'rentPaidUntil']) if (st[k] == null) st[k] = 0; // компактное сохранение — нули не хранятся
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
    useCityFor(S, id, c);
    const m0 = cr.market0, w = cityDef(S, id).wage || 1;
    S.market = { seller: m0.seller * w, baker: m0.baker * w };
    S.pay = { seller: Math.round(S.market.seller * (c.payK || 1)), baker: Math.round(S.market.baker * (c.payKb || c.payK || 1)) };
    S.flags.storeNum = c.numSeq || 0;
    cr.active = id;
    syncOpenDays(S, id); // нити истории: в этом городе срок открытия точки может быть другим
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
    if (c.rivalIn && id !== 'ufa' && !(S.rival && S.rival.enabled) && I.rivalInit) I.rivalInit(S, true); // федеральный «Хлебный двор» уже в городе (Р3)
    S.cache = null;
  }
  function switchCity(S, id) {
    const cr = S.corp; if (!on(S) || !cr.cities[id]) return { ok: false, msg: 'Город не найден' };
    if (cr.active === id) return { ok: true };
    const from = cr.active;
    unmount(S); mount(S, id);
    if (BK.HQ) BK.HQ.onVisit(S, id); // личный визит: касса без фильтра директора («цифры не сходятся»)
    I.log(S, `Вы взяли управление ${cityIn(id, S)}. ${cityName(from, S)} — на автопилоте: точки работают, новых не открывается.`, 'info');
    return { ok: true };
  }
  const cityIn = (id, S) => (S ? cityDef(S, id) : def(id) || {}).in || 'в городе ' + cityName(id, S);

  /* ---------------- агрегированная модель (раз в месяц; «владелец заочно», без директора) ---------------- */
  function salaryCity(S, c, lvl) { const m = corpMarket(S).seller * (cityDef(S, c.id).wage || 1) * (c.payK || 1); return m * (1 + C().EXPECT_PER_LVL * (lvl - 1)); }
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
  let holMemo = { key: '', map: {} }; // Р4: у многих городов одинаковый календарь — считаем один раз на профиль (производительность на 19 городах)
  function holidayAvg(S, d0, d1) {
    if (!C().HOLIDAYS || d1 <= d0) return { dem: 1, chk: 1 };
    const ci = BK.CITY || {}, cal = ci.cal, mk = S.seed + ':' + S.menu.map((m) => m.id + '/' + m.pm).join();
    if (holMemo.key !== mk) holMemo = { key: mk, map: {} };
    const pk = d0 + ':' + d1 + ':' + (cal ? cal.muslim + '/' + cal.sab + '/' + JSON.stringify(ci.cat || 0) + JSON.stringify(ci.hot || 0) : 'ufa');
    const hit = holMemo.map[pk]; if (hit) return hit;
    let a = 0, b = 0; for (let d = d0 + 1; d <= d1; d++) { const h = I.holidayDay(S, d); a += h.dem; b += h.chk; }
    return (holMemo.map[pk] = { dem: a / (d1 - d0), chk: b / (d1 - d0) });
  }
  /* доставка и команда в агрегате (§17) — как dailyStores: заказы доставки забирают часть гостей зала (каннибализация)
     и время команды (заказ = AGG_LOAD гостя); если работы больше, чем успевает команда, режутся и зал, и доставка.
     dem7 — спрос по дням недели в снимке, F — множитель месяца, cap — пропускная способность, ag — заказов на гостя спроса.
     h — чеков зала в день, o — заказов в день, ld — загрузка команды (для опозданий и решений директора) */
  function teamDay(dem7, F, cap, ag) {
    const cfg = C(), ca = cfg.AGG_CANNIBAL || 0, lo = cfg.AGG_LOAD || 0, n = dem7.length;
    let h = 0, o = 0, ld = 0;
    for (const x of dem7) {
      const D = x * F, O = D * ag, hall = Math.max(0, D - O * ca), w = hall + O * lo, f = w > cap ? cap / w : 1;
      h += hall * f; o += O * f; ld += cap > 0 ? w / cap : 2;
    }
    TD.h = h / n; TD.o = o / n; TD.ld = ld / n; return TD; // общий объект: без выделения памяти на каждую точку (производительность)
  }
  const TD = { h: 0, o: 0, ld: 0 };
  // заказов доставки на гостя спроса у подключённой упакованной точки (как aggDay движка; разгон — на середину периода)
  function aggPerDemand(S, s, days, dp, aoM) {
    const cfg = C();
    const ramp = s.aggDay != null ? clamp(cfg.AGG_RAMP_START + (1 - cfg.AGG_RAMP_START) * (S.day - days / 2 - s.aggDay) / cfg.AGG_RAMP_DAYS, cfg.AGG_RAMP_START, 1) : 1;
    const rk = clamp(1 + cfg.AGG_RATING_K * ((s.rating != null ? s.rating : cfg.RATING_START) - cfg.RATING_START), 0.4, 1.4);
    return cfg.AGG_SHARE * dp.agg * rk * ramp * (aoM != null ? aoM : I.modMult(S, 'aggOrders', s));
  }
  // остатки и вечерняя скидка точки (как storeWaste движка) по профилю дня dp
  function storeWasteDp(wz, dp) {
    const cfg = C(), i = wz.i, left = wz.left * dp.wasteK, sold = Math.min(left * cfg.EVE_SELL[i] * dp.eveK, cfg.EVE_CAP[i] * dp.eveK);
    return { revMult: 1 - cfg.EVE_CANNIBAL[i] * wz.disc * dp.eveK + sold * (1 - wz.disc), waste: left - sold };
  }
  // один агрегированный расчёт города за долю периода frac (0…1); деньги — в общий S.month по обычным статьям
  function cityMonth(S, c, frac, hireBudget) {
    const cfg = C(), K_ = K(), pl = S.macro.priceLevel, pk = c.packed, dc = cityDef(S, c.id);
    const out = { rev: 0, profit: 0, emp: 0, stores: 0, hired: 0, fc: 0, quits: 0, trained: 0 };
    if (!pk || frac <= 0) { for (const s of (pk ? pk.stores : [])) if (s.status !== 'opening') { out.stores++; out.emp += s.staff.n; } return out; }
    const cr = S.corp, L = cr.lastMonthly, dim = daysInMonthOf(L), days = dim * frac, d0 = Math.round(S.day - days);
    const m = E.dateOf(Math.max(L + 1, S.day - 1)).m;
    return withCity(S, c.id, () => {
      const seas = I.SEASON[m] * (BK.CITY.season ? BK.CITY.season[m] : 1) / I.SEASON[4];
      const hol = holidayAvg(S, d0, S.day);
      const cm = (t) => I.modScope(S, t, 'global') * I.modScope(S, t, 'city', c.id); // события сети и корпоративные события города (Р3)
      // оборудование цехов города (§17): фудкост и ERP (остатки) — к тому, что было при упаковке; сохранения до §17 — с этого месяца
      const pq = prodFcNow(S); if (pk.pf0 == null) { pk.pf0 = +pq.fc.toFixed(4); pk.erp0 = +pq.erp.toFixed(3); }
      const fcm = cm('foodcost') * (cr.hqFcK || 1) / (pk.fcK0 || 1) * pq.fc / (pk.pf0 || 1); // отдел закупок штаба (в снимке — то, что было при упаковке)
      const wsK = (1 - cfg.WASTE_ERP_CUT * pq.erp) / (1 - cfg.WASTE_ERP_CUT * (pk.erp0 || 0));
      // меню сети (привлекательность, тренды, цены) менялось после упаковки: гости и чек — к снимку (как в storeDemand)
      const msN = E.menuStats(S), apN = msN.avgPrice / pl, fcMenu = pk.fcMs0 ? msN.fcPct / pk.fcMs0 : 1;
      const aw = c.id === 'ufa' ? 1 : awMult(c.aw);
      // директор города (directors.js): null — «владелец заочно», как в Р1
      const dm = BK.Dir ? BK.Dir.mods(S, c) : null;
      const D = dm ? dm.D : K_.ABSENT_D, epsC = I.gauss(S) * K_.EPS_CITY * (dm ? dm.eps : 1);
      const QP = cfg.QUIT_P || [0.00018, 0.0009, 0.0025];
      const tax = E.currentTaxRate(S);
      // Р4: снабжение из другого города (§7.2) и особенности города (рост, парки, рейтинг)
      const sup = remoteFill(S), fzFc = remoteFc(S), rAdj = ratingAdj(S), gK = growthK(S), park = (BK.CITY && BK.CITY.park) || 1.25;
      const lk = dm && dm.leak ? dm.leak : 0, lkR = K_.LEAK_REV * lk, lkF = K_.LEAK_FC * lk, lkP = K_.LEAK_PAY * lk, lkA = (K_.LEAK_RENT || 0) * lk; // денежный риск (Р4): утечка слабого директора
      let rev = 0, fc = 0, rent = 0, pay = 0, util = 0, del = 0, hire = 0, hq = 0, units = 0, aggRev = 0, aggOrd = 0, waste = 0, chkN = 0;
      // доставка через агрегаторы (§17): комиссия — по числу подключённых точек города (как у подробного города), + упаковка
      const aggK = cfg.AGG_PACK != null ? cfg.AGG_PACK + E.aggCommission(S) : 0, fMult = cfg.FOODCOST_MULT || 1;
      const fill = pk.fill != null ? pk.fill : 1, sales = pk.sales != null ? pk.sales : 1, fracR = +frac.toFixed(4);
      const SAL = [0, 1, 2, 3, 4, 5].map((l) => (l ? salaryCity(S, c, l) : 0)); // оклады по уровням — один раз на город (производительность)
      // события по точке (как modMult в storeDemand): если нет событий района или точки — одни множители на весь город
      const MT = { traffic: 1, conv: 1, competitor: 1, check: 1, aggOrders: 1 };
      const modLocal = S.mods.some((x) => MT[x.t] && x.until > S.day && (x.scope === 'district' || x.scope === 'store'));
      const gmD0 = I.modMult(S, 'traffic', null) * I.modMult(S, 'conv', null) * I.modMult(S, 'competitor', null), gmC0 = I.modMult(S, 'check', null), aoM0 = I.modMult(S, 'aggOrders', null);
      const hireOk = (pk.office && pk.office.hr) || !!dm;
      let trainCost = 0;
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
        const target = moodTarget(S, (c.payK || 1) * (dm ? dm.payK : 1), SAL[1], avgL, missing, sz.staffBase) + (s.moodOff || 0) + (dm ? dm.mood : 0);
        sd.mood = clamp(sd.mood + (target - sd.mood) * clamp(K_.MOOD_STEP * frac, 0, 1), 0, 100);
        let pd = sd.mood >= cfg.MOOD_HAPPY ? QP[0] : sd.mood >= cfg.MOOD_UNHAPPY ? QP[1] : QP[2];
        pd *= (1 - 0.08 * (avgL - 1)) * E.diffK(S, 'quit') * (dm ? dm.quitK : 1);
        let pm = 1 - Math.pow(1 - pd, days); if (sd.mood < cfg.MOOD_UNHAPPY) pm = Math.max(pm, 0.3 * frac);
        const qx = n * pm; let q = Math.floor(qx) + (I.rnd(S) < qx - Math.floor(qx) ? 1 : 0);
        while (q-- > 0 && n > 0) { // уходит человек случайного уровня (по долям)
          let r = I.rnd(S) * n, l = 0; for (; l < 5; l++) { r -= sd.lv[l] || 0; if (r < 0) break; }
          l = Math.min(4, l); if (!sd.lv[l]) l = sd.lv.findIndex((x) => x > 0);
          sd.lv[l]--; n--; S.stats.quits++; out.quits++;
        }
        let vac = Math.max(0, s.staffTarget - n);
        while (vac-- > 0 && (hireOk || hireBudget.left > 0)) {
          const lvl = I.rnd(S) < 0.28 ? 2 : 1; sd.lv[lvl - 1]++; n++; if (!hireOk) hireBudget.left--; out.hired++; S.stats.hires++;
          hire += cfg.HIRE_COST_SALARIES * SAL[lvl];
          sd.mood = (sd.mood * (n - 1) + 62) / n;
        }
        if (dm) { const tr = BK.Dir.train(S, sd, dm, frac); trainCost += tr.cost; out.trained += tr.n; } // директор учит команду до цели обучения города
        sd.n = n; lsum = 0; for (let l = 1; l <= 5; l++) lsum += l * (sd.lv[l - 1] || 0); avgL = n ? lsum / n : 1;
        // рейтинг: заочно сползает к 3,5★, при директоре тянется к цели из тех же составляющих, что у подробной точки
        const late = s.agg && s.ld ? clamp((s.ld - cfg.AGG_LATE_LOAD) * cfg.AGG_LATE_K, 0, cfg.AGG_LATE_MAX) : 0; // перегруз доставкой — опоздания (как aggLatePen)
        const rTarget = (dm ? dm.rating(s, avgL, sd.mood, n) : K_.ABSENT_RATING) - rAdj - late;
        s.rating = (s.rating != null ? s.rating : cfg.RATING_START) + (rTarget - (s.rating != null ? s.rating : cfg.RATING_START)) * (1 - Math.exp(-days / cfg.RATING_DAYS));
        out.emp += n;
        // выручка
        // спрос × (сезон, праздники, качество «сейчас против снимка», узнаваемость, директор, раскрутка, события, шум), но не больше, чем успевает команда
        const dl = avgL - (s.lvl0 || 1), R1 = REP(s.repair), R0 = REP(s.rep0), lvl0 = s.lvl0 || 1;
        const Qd = (1 + cfg.LVL_CONV * dl) * moodF(sd.mood) / moodF(s.mood0 != null ? s.mood0 : 60) * ratingMultOf(s.rating) / ratingMultOf(s.r0 != null ? s.r0 : cfg.RATING_START) * R1.conv / R0.conv * (n < sz.staffMin ? 0.85 : 1) / ((s.n0 || 1) < sz.staffMin ? 0.85 : 1);
        const Qc = (1 + cfg.LVL_CHECK * dl) * R1.check / R0.check;
        const G = n * (cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * (avgL - 1)) / ((s.n0 || 1) * (cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * (lvl0 - 1)));
        const ramp = s.openedDay != null && cfg.RAMP_DAYS ? Math.min(1, cfg.RAMP_START + (1 - cfg.RAMP_START) * (S.day - days / 2 - s.openedDay) / cfg.RAMP_DAYS) : 1;
        const sum = m >= 5 && m <= 7 && (s.landmarks || []).some((id) => { const l = E.byId(BK.LANDMARKS, id); return l && l.summer; }) ? park : 1; // парки летом (как в storeDemand; Самара — сильнее)
        const mn = s.mn0, prD = mn ? msN.appeal / mn[0] * Math.pow(msN.priceIdx / mn[2], -0.6) : 1, pr = mn ? Math.pow(apN / mn[1], 0.7) : 1;
        const Rc = BK.HQ ? BK.HQ.rivalMult(S, c, s) : 1; // давление «Хлебного двора» и местных сетей (§5.3 R_c)
        if (gK !== 1 && s.g0 == null) s.g0 = gK; // сохранение до Р4: рост считается с этого месяца
        const grow = gK !== 1 ? gK / s.g0 : 1;
        // события: сеть, город, район и точка (как modMult в storeDemand; в снимке событий нет)
        const gmD = modLocal ? I.modMult(S, 'traffic', s) * I.modMult(S, 'conv', s) * I.modMult(S, 'competitor', s) : gmD0, gmC = modLocal ? I.modMult(S, 'check', s) : gmC0;
        const F = seas * sum * hol.dem * Qd * aw * D * Rc * grow * Math.max(0.3, ramp) * gmD * prD * Math.max(0.5, 1 + epsC + I.gauss(S) * K_.EPS_STORE);
        // заказов доставки на гостя спроса: доля × профиль дня × рейтинг × разгон × события (как aggDay)
        const dp = s.dem7 && (s.agg || pk.wz0) ? E.daypartOf(s) : null; // профиль дня (кэш движка по району и соседству)
        const ag = s.agg && dp ? aggPerDemand(S, s, days, dp, modLocal ? null : aoM0) : 0;
        const ws = pk.wz0 && dp ? storeWasteDp(pk.wz0, dp) : null, rm = ws ? ws.revMult : 1; // вечерняя скидка и остатки точки по профилю дня (§17)
        let cpd = 0, ocpd = 0;
        if (s.dem7 && s.dem7.length) { const x = teamDay(s.dem7, F, (s.thr0 || 1e9) * G, ag); cpd = x.h * fill * sales; ocpd = x.o * fill * Math.min(1, sales); s.ld = Math.round(x.ld * 100) / 100; }
        else cpd = s.base / (s.chk0 || 200) * F * Math.min(1, G);
        let closed = s.status === 'repair' || n === 0 || sup === false ? 0 : 1; // снабжение прервано — выпечки нет
        if (s.lostDays && closed) { closed = clamp(1 - s.lostDays / Math.max(1, days), 0, 1); s.lostDays = undefined; } // ремонт директора: точка закрыта несколько дней
        const chk = (s.chk0 || 200) * pl * hol.chk * Qc * gmC * pr * (1 - lkR); // Р4: утечка слабого директора — выручка отстаёт
        let rH = closed * days * cpd * chk, rA = ocpd ? closed * days * ocpd * chk / rm * cfg.AGG_CHECK : 0; // зал (с вечерней скидкой) и доставка (без неё, чек ×1,3)
        if (dm && dm.theft) { const lost = (rH + rA) * dm.theft; rH *= 1 - dm.theft; rA *= 1 - dm.theft; dm.d.stolen = (dm.d.stolen || 0) + lost; cr.stat.stolen += lost; } // «Нечист на руку»: касса честно показывает меньше
        const r = rH + rA;
        // прогноз: та же точка «как при снимке» — без директора, шума и изменений команды и рейтинга, но с сезоном, меню, ценами сети и доставкой (для «На точку к прогнозу»)
        if (s.dem7 && s.dem7.length) { const F0 = seas * sum * hol.dem * aw * grow * Math.max(0.3, ramp) * gmD * prD, x0 = teamDay(s.dem7, F0, s.thr0 || 1e9, ag); out.fc += closed * days * (x0.h * fill * sales + x0.o * fill * Math.min(1, sales) * cfg.AGG_CHECK / rm) * (s.chk0 || 200) * pl * hol.chk * gmC * pr; }
        // фудкост: зал — чистый фудкост + остатки точки по профилю дня (÷ вечерняя скидка), доставка — без списаний; до §17 — общий фудкост сети
        const fk = fcMenu * fcm * (dm ? dm.fcK : 1) * (1 + lkF);
        let f1;
        if (pk.fcB != null && ws) { const wst = rH / rm * pk.fcB * fk / fMult * ws.waste * wsK; f1 = rH * (pk.fcB * fk / rm + fzFc) + wst + rA * (pk.fcB * fk + fzFc); waste += wst; }
        else f1 = r * (pk.fcPct * fk + fzFc); // заморозка: фудкост +3 п. п.; утечка — перерасход
        const a1 = rA * aggK;
        const rn = s.payMode === 'month' ? E.storeRentMonth(s) * frac * (dm ? dm.rentK : 1) * (1 + lkA) : 0;
        if (s.payMode === 'year' && S.day >= (s.rentPaidUntil || 0)) { const y = E.storeRentMonth(s) * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT); rent += y; s.rentPaidUntil = S.day + 365; }
        let py = 0; for (let l = 1; l <= 5; l++) py += (sd.lv[l - 1] || 0) * SAL[l]; py *= (1 + cfg.PAYROLL_TAX) * frac * (dm ? dm.payK : 1) * (1 + lkP); // утечка — лишний ФОТ
        const ut = (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * s.area) * pl * frac;
        s.cpd = closed * cpd;
        const dv = E.deliveryCost(S, s) * frac;
        const h1 = cfg.HQ_PER_STORE * pl * frac + r * (cfg.HQ_REV_SHARE || 0);
        units += (s.cpd + closed * ocpd) * cfg.ITEMS_PER_CHECK;
        rev += r; fc += f1; rent += rn; pay += py; util += ut; del += dv; hq += h1; aggRev += rA; aggOrd += closed * days * ocpd; chkN += s.cpd * days;
        // отчёт точки (для карточки города и «Требует внимания»)
        s.last = { rev: Math.round(r), profit: Math.round(r - f1 - a1 - rn - py - ut - dv - r * tax), checks: Math.round(s.cpd * days), frac: fracR, // как у подробной точки: без управляющей компании
          aggRev: rA ? Math.round(rA) : undefined, agg: rA ? Math.round(a1) : undefined }; // доставка (нет — поля не сохраняются)
        if (s.aggDay != null && S.day - s.aggDay > cfg.AGG_RAMP_DAYS + 31) s.aggDay = undefined; // разгон доставки закончился — день подключения больше не нужен
        s.cpd = Math.round(s.cpd * 10) / 10; s.rating = Math.round(s.rating * 1e4) / 1e4; sd.mood = Math.round(sd.mood * 100) / 100; // без toFixed — быстрее
        if (s.capex != null) s.capex = Math.round(s.capex); // компактное сохранение (19 городов < 1 МБ)
        // нули не храним, но и не удаляем/добавляем поля каждый месяц: смена формы объекта замедляет весь цикл (§17, производительность)
        if (frac >= 0.5) { if (!s.hist) s.hist = []; s.hist.push(Math.round(r / frac)); while (s.hist.length > 12) s.hist.shift(); if (s.last.profit < 0) s.lossStreak = (s.lossStreak || 0) + 1; else if (s.lossStreak) s.lossStreak = undefined; }
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
      if (aggRev) { const a = aggRev * aggK; I.spend(S, a, 'agg'); S.month.aggRev = (S.month.aggRev || 0) + aggRev; S.month.aggOrders = (S.month.aggOrders || 0) + aggOrd; } // комиссия агрегатора и упаковка
      if (waste) S.month.waste = (S.month.waste || 0) + waste; // списания — часть фудкоста (строка отчёта)
      I.spend(S, hq, 'upkeep'); I.spend(S, hire, 'hire'); if (trainCost) I.spend(S, trainCost, 'train');
      I.spend(S, pRent, 'rent'); I.spend(S, pPay, 'payroll'); I.spend(S, pUtil, 'util');
      // прибыль города — как у подробного города: точки минус цеха, без управляющей компании, найма и обучения (они — расходы сети)
      out.rev = rev; out.profit = rev * (1 - tax) - fc - aggRev * aggK - rent - pay - util - del - prod;
      if (frac >= 0.5) pk.delM = Math.round(del / frac); // доставка из цехов за месяц — директору для решения об автопарке (§17)
      if (BK.Corp.onCityMonth) BK.Corp.onCityMonth(S, c, { rev, aggRev, fc, waste, agg: aggRev * aggK, chk: chkN, rent, pay, util, del, prod, hq, frac }); // для sim/corp-calib.js --diag
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
    c.mAcc.fc = (c.mAcc.fc || 0) + r.fc; c.mAcc.quits = (c.mAcc.quits || 0) + r.quits;
  }

  /* ---------------- логистика между городами (Р4, §7.2) ----------------
     Город без своего цеха снабжается из цеха другого нашего города: свежая выпечка — до 150 км (300 км с логистикой 1-го
     уровня в штабе), фабрика заморозки (логистика 2-го уровня) — до 1 500 км. Поля города (всё с безопасными значениями
     по умолчанию: поля нет — свой цех, как в Р1–Р3): supplyFrom — город-хаб, supplyMode 'fresh' | 'frozen', supplyKm,
     supplyOk (false — хаб потерял цех или штаб закрыл логистику: выпечки нет). Как только в городе заработал свой цех,
     поставки прекращаются сами. Мощность хаба не расходуется: пекари хаба оплачиваются в строке поставки. */
  function prodsOf(S, id) {
    const cr = S.corp, c = cr.cities[id]; if (!c) return [];
    if (id === cr.active) return cr._with != null && cr._with !== id ? cr._actProd || [] : S.productions;
    return c.packed ? c.packed.productions : [];
  }
  const ownOpen = (S, id) => prodsOf(S, id).some((p) => p.status === 'open');
  const logLvl = (S) => (BK.HQ ? BK.HQ.lvlOf(S, 'logistics') : 0);
  // откуда можно снабжать город id: ближайший наш город со своим работающим цехом (для свежей выпечки и для заморозки)
  function supplyHubs(S, id) {
    const cr = S.corp, k = K(), lvl = logLvl(S), fr = lvl >= 1 ? k.FRESH_KM_L1 : k.FRESH_KM;
    let fresh = null, frozen = null;
    for (const o in cr.cities) {
      if (o === id || !ownOpen(S, o)) continue;
      const km = roadKm(S, o, id);
      if (km <= fr && (!fresh || km < fresh.km)) fresh = { from: o, km };
      if (lvl >= 2 && km <= k.FROZEN_KM && (!frozen || km < frozen.km)) frozen = { from: o, km };
    }
    return { fresh, frozen, lvl, freshKm: fr, frozenKm: k.FROZEN_KM };
  }
  // город снабжается извне прямо сейчас (нет своего работающего цеха): город или null
  function remoteOf(S, id) {
    const cr = S.corp; if (!cr) return null;
    id = id || cr._with || cr.active;
    const c = cr.cities[id]; if (!c || !c.supplyFrom) return null;
    return ownOpen(S, id) ? null : c;
  }
  // поставка на точку в месяц: транспорт (§7.2: 40 тыс. + 250 ₽ × км, заморозка — 60 тыс. + 120 ₽ × км) + пекари хаба под её объём
  function remoteDel(S, st) {
    const c = remoteOf(S); if (!c) return null;
    const k = K(), cfg = C(), fz = c.supplyMode === 'frozen', D = fz ? k.DEL_FROZEN : k.DEL_FRESH;
    const km = c.supplyKm != null ? c.supplyKm : roadKm(S, c.supplyFrom, c.id);
    const hub = S.corp.cities[c.supplyFrom], payB = corpMarket(S).baker * (cityDef(S, c.supplyFrom).wage || 1) * (hub ? hub.payKb || hub.payK || 1 : 1);
    const units = (st.cpd != null ? st.cpd : 150) * cfg.ITEMS_PER_CHECK;
    const bake = units / cfg.PROD_UNITS_PER_BAKER * payB * (1 + cfg.PAYROLL_TAX) * k.REMOTE_BAKE_K[fz ? 1 : 0];
    return (D[0] + D[1] * km) * S.macro.priceLevel * (S.corp.hqDelK || 1) + bake;
  }
  // мощность: null — свой цех; true — везут (хватает на всё); false — снабжение прервано
  function remoteFill(S) { const c = remoteOf(S); return c ? c.supplyOk !== false : null; }
  function remoteFc(S) { const c = remoteOf(S); return c && c.supplyMode === 'frozen' ? K().FROZEN_FC : 0; }
  // поправка рейтинга города (★): свежесть при дальних поставках и заморозке; особенности города (Казань — национальная выпечка)
  function ratingAdj(S, id) {
    const cr = S.corp; if (!cr) return 0;
    id = id || cr._with || cr.active;
    let a = 0; const c = remoteOf(S, id), k = K();
    if (c) a += c.supplyMode === 'frozen' ? k.FROZEN_RATING : (c.supplyKm || 0) > k.FRESH_FAR_KM ? k.FRESH_FAR_RATING : 0;
    const d = cityDef(S, id);
    if (d && d.natReq && !S.menu.some((m) => { const p = E.byId(BK.PRODUCTS, m.id); return p && p.cat === 'national'; })) a += d.natReq;
    return a;
  }
  function supplyName(S, c) {
    if (!c || !c.supplyFrom) return 'свой цех';
    return (c.supplyMode === 'frozen' ? 'фабрика заморозки ' : 'цех ') + (cityDef(S, c.supplyFrom).in || cityName(c.supplyFrom, S));
  }
  // назначить снабжение (вход в город или смена): mode 'fresh' | 'frozen'
  function setSupply(S, id, mode) {
    const c = S.corp.cities[id]; if (!c) return { ok: false, msg: 'Город не найден' };
    if (mode !== 'fresh' && mode !== 'frozen') return { ok: false, msg: 'Неизвестный формат снабжения' };
    const h = supplyHubs(S, id)[mode];
    if (!h) return { ok: false, msg: mode === 'fresh' ? `Нет нашего цеха ближе ${supplyHubs(S, id).freshKm} км` : 'Нужна логистика 2-го уровня (фабрика заморозки) и наш цех ближе 1 500 км' };
    c.supplyFrom = h.from; c.supplyMode = mode; c.supplyKm = h.km; c.supplyOk = true;
    return { ok: true, from: h.from, km: h.km };
  }
  // раз в месяц и при смене уровня логистики: поставки ещё возможны? хаб потерял цех — ищем другой, иначе выпечки нет
  function supplyCheck(S, quiet) {
    const cr = S.corp;
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (!c.supplyFrom) continue;
      if (ownOpen(S, id)) { // свой цех заработал — поставки больше не нужны
        if (!quiet) I.log(S, `${cityName(id, S)}: свой цех заработал — поставки (${supplyName(S, c)}) прекращены.`, 'good');
        delete c.supplyFrom; delete c.supplyMode; delete c.supplyKm; delete c.supplyOk; continue;
      }
      const h = supplyHubs(S, id), cur = h[c.supplyMode || 'fresh'], alt = c.supplyMode === 'frozen' ? h.fresh : h.frozen;
      const pick = cur && cur.from === c.supplyFrom ? cur : cur || alt;
      const was = c.supplyOk !== false;
      if (pick) {
        if (pick.from !== c.supplyFrom || pick !== cur) {
          c.supplyMode = pick === cur ? c.supplyMode || 'fresh' : c.supplyMode === 'frozen' ? 'fresh' : 'frozen';
          c.supplyFrom = pick.from;
          if (!quiet) I.log(S, `${cityName(id, S)}: снабжение переключено — ${supplyName(S, c)} (${pick.km} км).`, 'warn');
        }
        c.supplyKm = pick.km; c.supplyOk = true;
      } else {
        c.supplyOk = false;
        if (was && !quiet) {
          I.log(S, `${cityName(id, S)}: снабжение прервано — нет нашего цеха в досягаемости. Точки стоят без выпечки: откройте свой цех или верните логистику в штабе.`, 'bad');
          if (BK.Dir && BK.Dir.pushInbox) BK.Dir.pushInbox(S, { kind: 'note', tone: 'bad', city: id, dname: '', title: `${cityName(id, S)}: нет выпечки`, text: 'Поставки из другого города прервались (хаб без цеха или штаб закрыл логистику). Пока нет своего цеха, точки не продают. Откройте цех в городе или верните отдел логистики.' });
        }
      }
    }
  }
  // линии снабжения для карты России: [{ from, to, mode, ok }]
  function supplyLinks(S) {
    const out = []; if (!on(S)) return out;
    for (const id in S.corp.cities) { const c = remoteOf(S, id); if (c) out.push({ from: c.supplyFrom, to: id, mode: c.supplyMode || 'fresh', ok: c.supplyOk !== false, km: c.supplyKm }); }
    return out;
  }

  /* ---------------- особенности городов (Р4, §2.3; числа — cities.js) ---------------- */
  // рост населения (Тюмень, Краснодар): поток гостей × (1 + g)^лет после выхода в Россию, не больше GROW_CAP
  function growthK(S) {
    const g = BK.CITY && BK.CITY.grow; if (!g || !S.corp || S.corp.unlockedDay == null) return 1;
    return Math.min(K().GROW_CAP, Math.pow(1 + g, Math.max(0, S.day - S.corp.unlockedDay) / 365));
  }
  // порог второго цеха в городе (город-лента — раньше)
  function prod2Stores() { return (BK.CITY && BK.CITY.prod2) || C().SECOND_PROD_STORES; }
  // вход в Москву дешевле, если в сети есть «ворота» (Нижний Новгород)
  function gateK(S, id) {
    let k = 1; if (!on(S)) return k;
    for (const o in S.corp.cities) { const g = cityDef(S, o).gate; if (g && g[id]) k = Math.min(k, g[id]); }
    return k;
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
      c.mAcc.fc = (c.mAcc.fc || 0) + r.fc; c.mAcc.quits = (c.mAcc.quits || 0) + r.quits;
      out.emp += r.emp; out.stores += r.stores;
    }
    supplyCheck(S); // Р4: снабжение из других городов ещё возможно?
    // директора (directors.js): оклады, развитие городов (открытия и закрытия), лояльность
    if (BK.Dir) BK.Dir.monthly(S, t);
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
      c.aw = clamp(c.aw + (target - c.aw) * clamp(K().AW_SPEED * (BK.HQ ? BK.HQ.awSpeedK(S, c) : 1), 0, 1), 0, 1); // бренд-отдел и «Любимец СМИ» — быстрее
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
      let aq = 0; for (const id in cr.cities) if (id !== cr.active) aq += cr.cities[id].mAcc.quits || 0;
      act.mAcc.quits = (act.mAcc.quits || 0) + Math.max(0, S.stats.quits - (cr.q0 != null ? cr.q0 : S.stats.quits) - aq);
      if (act.status === 'launch' && S.stores.some((s) => s.status !== 'opening')) act.status = 'run';
    }
    let other = 0; for (const id in cr.cities) if (id !== 'ufa') other += cr.cities[id].mAcc.rev;
    h.c1 = cr.active === 'ufa' ? h.rev - other : cr.cities.ufa.mAcc.rev;
    for (const id in cr.cities) {
      const c = cr.cities[id], active = id === cr.active;
      const st = active ? S.stores.filter((s) => s.status !== 'opening') : c.packed ? c.packed.stores.filter((s) => s.status !== 'opening') : [];
      let rt = 0, staff = 0; for (const s of st) { rt += active ? E.storeRating(S, s) : s.rating || 0; staff += active ? s.staff.length : s.staff.n; }
      // [год, месяц, выручка, прибыль, точки, рейтинг, персонал, прогноз выручки (0 — нет: город подробный), уволились]
      c.hist.push([h.y, h.m, Math.round(c.mAcc.rev), Math.round(c.mAcc.profit), st.length, st.length ? +(rt / st.length).toFixed(2) : 0, staff, Math.round(active ? 0 : c.mAcc.fc || 0), c.mAcc.quits || 0]);
      if (c.hist.length > K().HIST_MAX) c.hist.shift();
      c.mAcc = { rev: 0, profit: 0, agg: 0, fc: 0, quits: 0 };
    }
    cr.aggRevP = 0; cr.lastMonthly = S.day; cr.q0 = S.stats.quits;
    // компактное сохранение (Р4): записи истории сети старше 2 лет — в целых рублях (только когда в сети больше одного города: первый акт не меняется)
    if (Object.keys(cr.cities).length > 1) { for (let i = cr.hpk || 0; i < S.history.length - 24; i++) roundHist(S.history[i]); cr.hpk = Math.max(cr.hpk || 0, S.history.length - 24); }
    cr.market0 = corpMarket(S);
    if (BK.Dir) BK.Dir.afterMonth(S, h); // отчёты директоров во входящих, цель «Федеральная сеть»
  }
  function roundHist(x) {
    if (!x) return;
    for (const k in x) if (typeof x[k] === 'number' && !Number.isInteger(x[k])) x[k] = Math.round(x[k]);
    if (x.pnl) for (const k in x.pnl) if (typeof x.pnl[k] === 'number' && !Number.isInteger(x.pnl[k])) x.pnl[k] = Math.round(x.pnl[k]);
  }
  function yearly(S, infl, rentReview) { // индексация аренды в упакованных городах (как у Уфы)
    const cr = S.corp;
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (!c.packed || id === cr.active) continue;
      for (const s of c.packed.stores) s.rentM2 = rentReview(S, s, infl * 0.85);
      for (const p of c.packed.productions) p.rentM2 = Math.round(p.rentM2 * (1 + infl * 0.85));
    }
    if (BK.Dir) BK.Dir.yearly(S, infl);
  }

  /* ---------------- вход в город (упрощённо: свой цех + точки, как старт в Уфе) ---------------- */
  function ownCount(S) { return on(S) ? Object.keys(S.corp.cities).length : 0; }
  // вход в город (Р4 ч. 2, vision-plan §5 п. 2 — без таймера): регистрация + маркетинг × аренда + «штаб нового города»,
  // всё × ENTER_GROW за каждый наш город кроме Уфы — каждый следующий город дороже; GR и юристы — на 15 % дешевле
  function enterGrowK(S, n) { return Math.pow(K().ENTER_GROW || 1, Math.max(0, (n != null ? n : ownCount(S)) - 1)); }
  function enterCost(S, id) {
    const d = def(id); if (!d) return 0;
    const pk = on(S) && S.corp.perks && S.corp.perks[id], free = pk && pk.regFree && pk.until >= S.day; // приглашение губернатора (e207): регистрация бесплатно
    const legal = on(S) && BK.HQ && BK.HQ.lvlOf(S, 'legal') ? K().LEGAL_LAUNCH_K : 1;
    return Math.round(((free ? 0 : K().ENTER_FEE) + K().ENTER_MKT * d.rent + (K().ENTER_HQ || 0)) * S.macro.priceLevel * (d.far ? K().FAR_K : 1) * gateK(S, id) * legal * enterGrowK(S) / 1e5) * 1e5; // Нижний Новгород — «ворота» к Москве
  }
  function awStart(S, id) {
    const d = def(id);
    if (d.aw0 != null) return d.aw0;
    let near = 0; for (const o in S.corp.cities) if (roadKm(S, o, id) < K().AW_NEAR_KM) near++;
    return Math.min(K().AW_START_MAX, K().AW_START + K().AW_NEAR * near) + K().AW_MKT + (BK.HQ ? BK.HQ.awStartAdd(S) : 0);
  }
  function enterLock(S, id) { // null — можно; иначе причина
    const d = def(id);
    if (!on(S)) return 'Выход в Россию ещё не открыт';
    if (!d || d.builtin) return 'Город недоступен';
    if (S.corp.cities[id] || id === homeCityId(S)) return 'Уже ваш город';
    // Москва и Петербург — после 3 городов И финансового департамента (§12 п. 8)
    if (d.big) { const bl = BK.HQ ? BK.HQ.bigLock(S) : ownCount(S) < K().BIG_MIN_CITIES ? `Откроется, когда в сети будет ${K().BIG_MIN_CITIES} города` : null; if (bl) return bl; }
    // таймера «один город за раз» больше нет (Р4 ч. 2): темп входа ограничивают цена (enterCost) и мощность штаба (BK.HQ.load — перегрузка даёт утечку)
    return null;
  }
  function enterCity(S, id, opts) { // opts.director — id директора: город запускает он, игрок остаётся, где был (directors.js); opts.supply — 'fresh' | 'frozen' (Р4, §7.2): без своего цеха
    const lock = enterLock(S, id); if (lock) return { ok: false, msg: lock };
    const sm = opts && (opts.supply === 'fresh' || opts.supply === 'frozen') ? opts.supply : null;
    if (sm && !supplyHubs(S, id)[sm]) return { ok: false, msg: sm === 'fresh' ? 'Нет нашего цеха в досягаемости свежей выпечки' : 'Фабрика заморозки не дотягивается до города' };
    const cost = enterCost(S, id);
    if (S.cash < cost) return { ok: false, msg: `Не хватает ${BK.fmtMoney(cost - S.cash)}` };
    const cr = S.corp;
    const seed = withRng(S, cr, 'rng', () => I.ri(S, 1, 2e9));
    I.spend(S, cost, 'other');
    const cur = cr.cities[cr.active] || {};
    const dirId = opts && opts.director && BK.Dir ? opts.director : null;
    cr.cities[id] = { id, name: cityName(id), enteredDay: S.day, status: 'launch', seed, mapGen: 1, rng: (seed ^ 0x51ed27) | 0, aw: awStart(S, id),
      payK: S.pay.seller / S.market.seller, payKb: S.pay.baker / S.market.baker, numSeq: 0, packed: null, aggFrom: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
    void cur;
    let supTxt = '';
    if (sm) { const r = setSupply(S, id, sm); supTxt = ` Выпечку повезут: ${supplyName(S, cr.cities[id])} (${r.km} км).`; }
    if (BK.HQ) BK.HQ.onEnter(S, id); // давление местных сетей и «Хлебного двора», льгота губернатора
    if (S.chron) S.chron.push({ day: S.day, t: 'city', id, cost, over: BK.HQ && BK.HQ.load && BK.HQ.load(S).over > 0 ? 1 : undefined }); // летопись: вход в город (итоги игры)
    if (dirId) {
      I.log(S, `Вход ${cityIn(id, S)}: регистрация, разрешения и стартовый маркетинг — ${BK.fmtMoney(cost)}. Запуск ведёт директор.${supTxt}`, 'good');
      const r = BK.Dir.launch(S, id, dirId);
      return Object.assign({ ok: true, cost, supply: sm }, r);
    }
    I.log(S, `Вход ${cityIn(id, S)}: регистрация, разрешения и стартовый маркетинг — ${BK.fmtMoney(cost)}. ${sm ? 'Выберите первую точку.' + supTxt : 'Выберите помещение под цех.'}`, 'good');
    switchCity(S, id);
    const pc = cr.cities[id].perk; if (pc && pc.prodRent) for (const o of S.prodOffers) o.rentM2 = Math.round(o.rentM2 * pc.prodRent); // цех в индустриальном парке за полцены
    return { ok: true, cost, supply: sm };
  }
  // шаг запуска нового города: 'prod' — нужен цех, 'store' — первая точка, null — город работает
  function citySetup(S) {
    if (!on(S) || !S.corp.active || S.corp.active === 'ufa' || S.phase !== 'play') return null;
    if (!S.productions.length && !remoteOf(S, S.corp.active)) return 'prod'; // снабжение из другого города — сразу точки
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

  BK.Corp = { _int: { packStore, fcBase, teamDay, prodFcNow, salaryCity, moodTarget, moodF, withRng, cityIn, def, cityDef, ratingMultOf, daysInMonthOf, REP }, check, ensure, applyGlobals, demandMult, otherStores, monthly, afterMonth, yearly, withCity, mount, unmount, switchCity, enterCity, enterCost, enterGrowK, enterLock, awStart, citySetup, cityStats, summary, rollingAll, corpMarket, on, awMult, cityMonth,
    cityDef, homeCityId, realCityId, roadKm, mapCities, supplyHubs, remoteOf, remoteDel, remoteFill, remoteFc, ratingAdj, supplyName, setSupply, supplyCheck, supplyLinks, growthK, prod2Stores, gateK, prodsOf };
  Object.assign(BK.Engine, { mountCity: mount, unmountCity: unmount, withCity, switchCity, enterCity, enterCost, enterLock, citySetup, corpSummary: summary, corpMonthly: monthly, corpOn: on, citySupply: setSupply });
})();
