/* =====================================================================
   ДВИЖОК «Хлебная карта Уфы» — чистая логика, без DOM.
   Состояние — простой JSON (сохраняется целиком). RNG детерминированный.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const C = () => BK.CFG;
  // уровень сложности: множитель/добавка из CFG.DIFFICULTY (старые сохранения без S.difficulty — «Нормальный»)
  function diffK(S, key) {
    const D = C().DIFFICULTY || {}, d = D[(S && S.difficulty) || 'normal'] || D.normal || {};
    return d[key] != null ? d[key] : D.normal && D.normal[key] != null ? D.normal[key] : 0;
  }

  /* ---------------- утилиты ---------------- */
  function rnd(S) { // mulberry32
    let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (S, a, b) => a + (b - a) * rnd(S);
  const ri = (S, a, b) => Math.floor(rr(S, a, b + 1));
  const pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
  function wpick(S, arr, wf) {
    let tot = 0; for (const x of arr) tot += Math.max(0, wf(x));
    if (tot <= 0) return null;
    let r = rnd(S) * tot;
    for (const x of arr) { r -= Math.max(0, wf(x)); if (r <= 0) return x; }
    return arr[arr.length - 1];
  }
  function gauss(S) { return (rnd(S) + rnd(S) + rnd(S) - 1.5) * 1.414; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const round = (v, s) => Math.round(v / s) * s;

  function dateOf(day) {
    const d = new Date(Date.UTC(C().START_YEAR, 0, 1));
    d.setUTCDate(d.getUTCDate() + day);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: (d.getUTCDay() + 6) % 7 };
  }
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function fmtDate(day) { const t = dateOf(day); return `${t.d} ${MONTHS_G[t.m]} ${t.y}`; }
  function nextId(S, p) { S.ids = (S.ids || 0) + 1; return p + S.ids; }

  function log(S, text, kind = 'info') {
    S.log.unshift({ day: S.day, text, kind });
    if (S.log.length > 250) S.log.length = 250;
  }
  function toast(S, title, text, kind = 'info', extra) {
    S.notify.push(Object.assign({ type: 'toast', title, text, kind }, extra || {}));
  }
  function spend(S, amount, bucket) { // все расходы идут через эту функцию
    S.cash -= amount;
    if (bucket) S.month[bucket] = (S.month[bucket] || 0) + amount;
    coverFromReserve(S);
  }
  function coverFromReserve(S) {
    if (S.cash < 0 && S.reserve > 0) {
      const t = Math.min(S.reserve, -S.cash);
      S.reserve -= t; S.cash += t;
      if (!S.flags.reserveUsedMsg || S.day - S.flags.reserveUsedMsg > 30) {
        S.flags.reserveUsedMsg = S.day;
        toast(S, 'Резервный фонд выручил', `Кассовый разрыв закрыт из резерва (−${BK.fmtMoney(t)}).`, 'warn');
      }
    }
  }

  /* ---------------- новая игра ---------------- */
  function newGame(opts) {
    const cfg = C();
    if (BK.useCity) BK.useCity(null); // карта и районы — Уфы (после игры в другом городе)
    const seed = (opts && opts.seed) || Math.floor(Math.random() * 1e9);
    const difficulty = opts && cfg.DIFFICULTY && cfg.DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    const dk = (k) => diffK({ difficulty }, k);
    const S = {
      v: 1, seed, rng: seed, ids: 0, day: 0, difficulty,
      company: (opts && opts.company) || 'Пекарня «Каравай»',
      phase: 'setup_prod', won: false, wonDay: null, lost: false,
      cash: Math.round(cfg.START_CASH * dk('cash')), reserve: 0, loan: 0, cumRevenue: 0,
      macro: { keyRate: cfg.KEY_RATE, inflation: cfg.INFLATION_BASE, inflAdd: 0, priceLevel: 1, taxAdd: 0, regime: 'usn' },
      market: { seller: cfg.MARKET_SALARY_SELLER, baker: cfg.MARKET_SALARY_BAKER },
      pay: { seller: cfg.MARKET_SALARY_SELLER, baker: cfg.MARKET_SALARY_BAKER },
      alloc: { reserve: 0.15, bonus: 0.03, marketing: 0.05 },
      culture: 0, office: { hr: false, academy: false, autohireOn: true, ownerHires: 0, ownerWeek: 0, autotrainOn: true, trainTarget: 3, ownerTrains: 0, ownerTrainWeek: 0 },
      loyaltyMod: 0, lastBonusPerEmp: 0, lastMarketingPerStore: 0,
      productions: [], stores: [], offers: [], prodOffers: [],
      menu: BK.START_MENU.map((id) => ({ id, pm: 1 })),
      trends: { bread: 55, laminated: 70, sweet: 60, pies: 50, national: 62, desserts: 60, drinks: 66, breakfast: 55, healthy: 45 },
      chef: { pending: null, lastYear: cfg.START_YEAR },
      candidates: [], candDay: -999,
      mods: [],
      ev: { next: 30, nextCrisis: Math.round(30 * dk('crisisGap') * ri({ rng: seed ^ 77 }, (cfg.CRISIS_FIRST_MONTHS || [cfg.CRISIS_MIN_MONTHS])[0], (cfg.CRISIS_FIRST_MONTHS || [0, cfg.CRISIS_MAX_MONTHS])[1])), last: {}, once: {}, pending: null, lastCrisis: null, recent: [], queue: [] },
      month: {}, history: [], log: [], notify: [], flags: {}, negMonths: 0,
      yearRev: 0, lastMonthRev: 0, speed: 1,
      stats: { hires: 0, quits: 0, eventsSeen: 0, peakStores: 0 },
    };
    resetMonth(S);
    genProdOffers(S, 3);
    genStoreOffers(S, true);
    refreshCandidates(S, true);
    rivalInit(S, opts && opts.rival != null ? opts.rival : cfg.RIVAL_ON); // сеть-соперник (свой ГСЧ — основной поток не сдвигается)
    log(S, `Компания ${/[«»"„“]/.test(S.company) ? S.company : `«${S.company}»`} зарегистрирована. На счёте ${BK.fmtMoney(S.cash)}.`, 'good');
    return S;
  }
  function resetMonth(S) {
    S.month = { rev: 0, checks: 0, fc: 0, rent: 0, payroll: 0, util: 0, delivery: 0, tax: 0, interest: 0, upkeep: 0, hire: 0, train: 0, other: 0, income: 0, capex: 0, lost: 0, bonus: 0, marketing: 0, coll: 0, inv: 0 };
  }

  /* ---------------- генерация предложений ---------------- */
  function districtWeight(S, d) {
    if (d.w != null) return d.w; // сгенерированные города: вес — поле района (у Уфы поля нет — таблица ниже)
    const w = { center: 1.4, grove: 1.2, october: 1.3, sipaylovo: 1.2, glumilino: 0.9, chernikovka: 1.2, inors: 0.9, north: 0.5, shaksha: 0.5, nizh: 0.8, zaton: 0.8, dema: 1.0 };
    return w[d.id] || 1;
  }
  function freeSpot(S, d, radius) {
    for (let k = 0; k < 30; k++) {
      const a = rnd(S) * Math.PI * 2, r = Math.sqrt(rnd(S)) * radius;
      const p = { x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r * 0.85 };
      const busy = S.stores.concat(S.offers, S.productions, S.prodOffers, (S.rival && S.rival.stores) || []).some((o) => dist(o, p) < 14);
      if (!busy) return p;
    }
    return { x: d.x + rr(S, -radius, radius), y: d.y + rr(S, -radius, radius) };
  }
  function makeStoreOffer(S, opts) { // opts (опц.): { district, lm, size } — для помещений из событий
    const cfg = C();
    const d = (opts && opts.district && byId(BK.DISTRICTS, opts.district)) || wpick(S, BK.DISTRICTS, (x) => districtWeight(S, x));
    const sizeKey = (opts && cfg.SIZES[opts.size] && opts.size) || wpick(S, ['small', 'standard', 'large'], (k) => ({ small: 0.3, standard: 0.5, large: 0.2 })[k]);
    const sz = cfg.SIZES[sizeKey];
    const area = ri(S, sz.min, sz.max);
    const lms = [(opts && opts.lm && byId(BK.LANDMARKS, opts.lm)) || pick(S, BK.LANDMARKS)];
    if (rnd(S) < 0.45) { const l2 = pick(S, BK.LANDMARKS); if (l2.id !== lms[0].id) lms.push(l2); }
    let tr = 1, sv = 1, rm = 1;
    for (const l of lms) { tr *= l.tr; sv *= l.solv; rm *= l.rent; }
    const pl = S.macro.priceLevel;
    const sizeRent = { small: 1.12, standard: 1, large: 0.9 }[sizeKey];
    let rentM2 = rr(S, d.rent[0], d.rent[1]) * rm * sizeRent * pl, value = 1;
    const traffic = round(rr(S, d.traffic[0], d.traffic[1]) * tr, 50);
    const solv = round(rr(S, d.solv[0], d.solv[1]) * sv, 5); // в ценах 2027 (умножается на уровень цен)
    const cr = (BK.CITY && BK.CITY.compRange) || [0.84, 1]; // конкуренция города (у Уфы — прежний диапазон)
    const comp = +rr(S, cr[0], cr[1]).toFixed(2);
    if (cfg.RENT_FAIR_W) { // хорошее место стоит дороже: ставка тянется к доле ожидаемой выручки точки
      const refB = cfg.RENT_REF_BASKET * pl, Sv = solv * pl;
      const chk = refB <= Sv ? refB + cfg.UPSELL * (Sv - refB) : Math.sqrt(refB * Sv);
      const checks = Math.min(sz.staffMax * cfg.CHECKS_PER_STAFF_BASE, traffic * sz.capture * comp * cfg.BASE_CONV);
      const fair = checks * chk * 30.4 * cfg.RENT_FAIR_SHARE / area;
      rentM2 = Math.pow(rentM2, 1 - cfg.RENT_FAIR_W) * Math.pow(fair, cfg.RENT_FAIR_W);
      value = fair / rentM2;
    }
    rentM2 = round(rentM2 * diffK(S, 'rent'), 10);
    const p = freeSpot(S, d, 42);
    const payMode = rnd(S) < 0.62 ? 'month' : 'year';
    return {
      id: nextId(S, 'o'), district: d.id, x: p.x, y: p.y,
      address: `${pick(S, d.streets)}, ${ri(S, 1, 120)}`,
      size: sizeKey, area, rentM2, payMode, traffic, solv, landmarks: lms.map((l) => l.id), comp,
      expires: S.day + Math.round(ri(S, 35, 75) * clamp(Math.pow(value, -(cfg.OFFER_QUALITY_EXP || 0)), 0.3, 1.5)), // выгодные места быстро уходят
    };
  }
  function offersWanted(S) { return Math.min(C().OFFERS_MAX, C().OFFERS_BASE + S.stores.length); }
  // инвестор со связями в ритейле: новые помещения приходят заметно чаще (investors.js)
  function invOfferK(S) { return (S.inv && BK.Inv && BK.Inv.perkOf(S, 'offers')) ? 0.75 : 1; }
  function genStoreOffers(S, initial) {
    const want = offersWanted(S);
    if (initial) {
      while (S.offers.length < want) S.offers.push(makeStoreOffer(S));
      S.offerRefreshDay = S.day + C().OFFER_REFRESH_DAYS;
      S.nextOfferDay = S.day + Math.round(ri(S, C().OFFER_ARRIVAL_DAYS[0], C().OFFER_ARRIVAL_DAYS[1]) * diffK(S, 'offerGap') * invOfferK(S));
      return;
    }
    if (S.offers.length < want && S.day >= (S.nextOfferDay || 0)) {
      S.offers.push(makeStoreOffer(S));
      S.nextOfferDay = S.day + Math.round(ri(S, C().OFFER_ARRIVAL_DAYS[0], C().OFFER_ARRIVAL_DAYS[1]) * diffK(S, 'offerGap') * invOfferK(S));
    }
  }
  function makeProdOffer(S, d) {
    const pl = S.macro.priceLevel;
    const area = round(rr(S, 120, 300), 10);
    const p = freeSpot(S, d, 38);
    return { id: nextId(S, 'po'), district: d.id, x: p.x, y: p.y, address: `${pick(S, d.streets)}, ${ri(S, 1, 90)}`, area, rentM2: round(rr(S, d.prodRent[0], d.prodRent[1]) * pl * diffK(S, 'rent'), 10) };
  }
  function genProdOffers(S, n) {
    S.prodOffers = [];
    const groups = (BK.MAP && BK.MAP.prodGroups) || [['center', 'grove', 'october'], ['sipaylovo', 'glumilino', 'chernikovka', 'inors', 'zaton', 'dema', 'nizh'], ['north', 'shaksha', 'north', 'nizh']];
    if (S.productions.length) { // для второго/третьего цеха — районы подальше от существующих
      const far = BK.DISTRICTS.slice().sort((a, b) => Math.min(...S.productions.map((p) => dist(p, b))) - Math.min(...S.productions.map((p) => dist(p, a))));
      for (let i = 0; i < n; i++) S.prodOffers.push(makeProdOffer(S, far[Math.min(far.length - 1, i * 2 + ri(S, 0, 1))]));
      return;
    }
    for (let i = 0; i < n; i++) S.prodOffers.push(makeProdOffer(S, byId(BK.DISTRICTS, pick(S, groups[i % 3]))));
  }

  /* ---------------- персонал ---------------- */
  function makePerson(S, lvl) {
    const f = rnd(S) < 0.55;
    const first = pick(S, f ? BK.NAMES_F : BK.NAMES_M);
    let sur = pick(S, BK.SURNAMES); if (f) sur = sur.endsWith('ин') || sur.endsWith('ов') || sur.endsWith('ев') ? sur + 'а' : sur;
    return { id: nextId(S, 'p'), name: `${first} ${sur}`, lvl, mood: 62, fatigue: 0, unhappy: 0, trait: Math.round(rr(S, -9, 9)), patience: ri(S, 0, 10), since: S.day, lvlDay: S.day };
  }
  function candLevel(S) { return rnd(S) < (S.office.hr ? 0.5 : 0.28) ? 2 : 1; }
  function refreshCandidates(S, force) {
    if (!force && S.day - S.candDay < 7) return;
    S.candDay = S.day;
    const n = S.office.hr ? 8 : 5;
    S.candidates = [];
    for (let i = 0; i < n; i++) S.candidates.push(makePerson(S, candLevel(S)));
  }
  function salaryOf(S, lvl) { return S.pay.seller * (1 + C().EXPECT_PER_LVL * (lvl - 1)); }
  function hireCost(S, lvl) { return Math.round(C().HIRE_COST_SALARIES * salaryOf(S, lvl)); }
  function hireDays(S) { return S.office.hr ? 5 : S.stores.length > C().HR_REQUIRED_STORES ? C().OWNER_HIRE_DAYS_BIG : C().HIRE_DAYS; }
  function hrCount(S) { return S.office.hr ? Math.max(1, Math.ceil(S.stores.length / C().HR_STORES_PER)) : 0; }
  function trainersCount(S) { return S.office.academy ? Math.max(1, Math.ceil(S.stores.length / C().TRAINER_STORES_PER)) : 0; }
  function ownerTrainLeft(S) {
    if (S.office.academy || S.stores.length <= C().TRAIN_REQUIRED_STORES) return Infinity;
    const wk = Math.floor(S.day / 7);
    if (S.office.ownerTrainWeek !== wk) { S.office.ownerTrainWeek = wk; S.office.ownerTrains = 0; }
    return Math.max(0, C().OWNER_TRAINS_PER_WEEK - S.office.ownerTrains);
  }
  function ownerHireLeft(S) { // без HR при сети >10 точек владелец нанимает не больше N человек в неделю
    if (S.office.hr || S.stores.length <= C().HR_REQUIRED_STORES) return Infinity;
    const wk = Math.floor(S.day / 7);
    if (S.office.ownerWeek !== wk) { S.office.ownerWeek = wk; S.office.ownerHires = 0; }
    return Math.max(0, C().OWNER_HIRES_PER_WEEK - S.office.ownerHires);
  }
  function vacancies(st) { return Math.max(0, st.staffTarget - st.staff.length - st.incoming.length); }
  function trainCost(S, lvl) { return Math.round(C().TRAIN_COST[lvl] * S.macro.priceLevel * (S.office.academy ? 0.65 : 1)); }
  function allStaff(S) { let n = 0; for (const s of S.stores) n += s.staff.length; return n; }
  function bakersTotal(S) { let n = 0; for (const p of S.productions) n += p.staff; return n; }

  /* ---------------- модификаторы ---------------- */
  function modMult(S, t, store, prodId) {
    let m = 1;
    for (const x of S.mods) {
      if (x.t !== t || x.until <= S.day) continue;
      if (x.scope === 'global' || (x.scope === 'district' && store && store.district === x.target) || (x.scope === 'store' && store && store.id === x.target) || (x.scope === 'production' && prodId && prodId === x.target)
        || (x.scope === 'city' && S.corp && x.target === (S.corp._with || S.corp.active))) m *= x.m; // 'city' — корпоративные события по городу (corpev.js)
    }
    return m;
  }
  function modScope(S, t, scope, target) {
    let m = 1;
    for (const x of S.mods) if (x.t === t && x.until > S.day && x.scope === scope && (scope === 'global' || x.target === target)) m *= x.m;
    return m;
  }
  function modAdd(S, t) { let a = 0; for (const x of S.mods) if (x.t === t && x.until > S.day) a += x.add || 0; return a; }

  /* ---------------- меню ---------------- */
  function menuStats(S) {
    const pl = S.macro.priceLevel;
    let w = 0, wp = 0, wpm = 0, wcost = 0, wrev = 0, popSum = 0;
    const cats = new Set();
    for (const it of S.menu) {
      const p = byId(BK.PRODUCTS, it.id); if (!p) continue;
      const pop = p.pop * (0.55 + 0.9 * (S.trends[p.cat] || 50) / 100);
      const price = p.price * pl * it.pm;
      w += pop; wp += pop * price; wpm += pop * it.pm; wcost += pop * p.fc * p.price * pl; wrev += pop * price; popSum += pop;
      cats.add(p.cat);
    }
    const n = S.menu.length || 1;
    const avgPop = popSum / n;
    const variety = 0.85 + 0.15 * clamp((n - 4) / 8, 0, 1) + 0.008 * Math.max(0, n - 12);
    const diversity = 1 + 0.015 * (cats.size - 3);
    const appeal = clamp(avgPop / 58, 0.7, 1.35) * variety * diversity;
    return { avgPrice: wp / w, priceIdx: wpm / w, fcPct: wcost / wrev, appeal, n, cats: cats.size };
  }
  function eqUnlocked(S, req) { return !req || S.productions.some((p) => p.status === 'open' && (p.equip[req] || 0) > 0); }

  /* ---------------- производство ---------------- */
  function prodCapacity(S, p) {
    if (p.status !== 'open') return 0;
    let cap = C().PROD_BASE_CAPACITY;
    for (const e of BK.EQUIPMENT) cap += (p.equip[e.id] || 0) * e.cap;
    const staffF = p.need ? clamp(p.staff / p.need, 0.4, 1) : 1;
    const moraleF = 0.88 + 0.12 * (p.morale / 100);
    return cap * staffF * moraleF * modMult(S, 'capacity', null, p.id);
  }
  function prodFcMult(S, p) {
    let r = 0; for (const e of BK.EQUIPMENT) r += (p.equip[e.id] || 0) > 0 ? e.fc * Math.min(1, p.equip[e.id]) : 0;
    return 1 - Math.min(C().PROD_FC_MAX_CUT != null ? C().PROD_FC_MAX_CUT : 0.2, r);
  }
  function prodDelMult(p) { let r = 0; for (const e of BK.EQUIPMENT) if (e.del && p.equip[e.id]) r += e.del; return 1 - r; }
  function nearestProd(S, st) {
    let best = null, bd = 1e9;
    for (const p of S.productions) { if (p.status !== 'open') continue; const d = dist(p, st); if (d < bd) { bd = d; best = p; } }
    if (!best) best = S.productions[0];
    return best;
  }
  function deliveryCost(S, st) {
    if (S.corp && BK.Corp && BK.Corp.remoteDel) { const r = BK.Corp.remoteDel(S, st); if (r != null) return r; } // второй акт: выпечка из цеха другого города (§7.2)
    const p = nearestProd(S, st); if (!p) return 0;
    const km = dist(p, st) * kmPerUnit();
    // объём: чем больше изделий в день возит точка, тем больше рейсов (√ — рейсы укрупняются)
    const ref = C().DELIVERY_UNITS_REF;
    const volF = ref ? clamp(Math.sqrt(((st.cpd != null ? st.cpd : 150) * C().ITEMS_PER_CHECK) / ref), 0.6, 2.2) : 1;
    return (C().DELIVERY_BASE + C().DELIVERY_PER_KM * km) * volF * S.macro.priceLevel * prodDelMult(p) * modMult(S, 'delivery', st) * (S.corp && S.corp.hqDelK ? S.corp.hqDelK : 1); // логистика штаба
  }
  function prod2Stores() { return (BK.CITY && BK.CITY.prod2) || C().SECOND_PROD_STORES; } // второй цех: город-лента (Р4) — раньше
  function kmPerUnit() { return (BK.CITY && BK.CITY.kmPerUnit) || C().KM_PER_UNIT; } // масштаб активного города (Уфа — KM_PER_UNIT)
  function storeRentMonth(st) { return st.area * st.rentM2; }
  function rentReview(S, st, idx) { // новая ставка ₽/м²: индексация, а у успешной точки — не ниже доли оборота
    const cfg = C();
    let r = st.rentM2 * (1 + idx);
    const h = st.hist || [];
    if (cfg.RENT_TURNOVER_SHARE && h.length >= 6) {
      const fair = h.reduce((a, x) => a + x, 0) / h.length * cfg.RENT_TURNOVER_SHARE / st.area;
      if (fair > r) r = Math.min(fair, r * (1 + (cfg.RENT_REVIEW_MAX || 0.2)));
    }
    return Math.round(r);
  }
  function recStaff(S, o) { // сколько людей нужно, чтобы загрузка была ≤ 80%
    const cfg = C(); const sz = cfg.SIZES[o.size];
    const tmp = Object.assign({}, o, { id: '__rec', status: 'open', repair: o.repair || 0, staff: [{ lvl: 1 }] });
    const d = storeDemand(S, tmp, { dow: 2, m: 4 }, menuStats(S));
    const A = aggDay(S, tmp, d), work = A ? d.demand - A.cannib + A.orders * cfg.AGG_LOAD : d.demand; // доставка тоже занимает команду
    const need = Math.ceil(work / (cfg.CHECKS_PER_STAFF_BASE * 0.8 * daypartOf(o).thrK)); // в пиковые часы нужно больше людей
    return { need, target: clamp(need, sz.staffMin, sz.staffMax), over: need > sz.staffMax };
  }
  function prodRentMonth(p) { return p.area * p.rentM2; }

  /* ---------------- ежедневная симуляция ---------------- */
  const SEASON = [0.92, 0.9, 0.95, 0.98, 1.0, 0.96, 0.93, 0.95, 1.03, 1.04, 1.05, 1.12]; // декабрьский пик — частично в празднике «Новый год» (календарь ниже)

  /* ---------------- календарь праздников Уфы ----------------
     Даты считаются из номера года (ничего не хранится в состоянии). Числа — CFG.HOLIDAYS. */
  const holYears = {};
  function dayIdx(y, m, d) { return Math.round((Date.UTC(y, m, d) - Date.UTC(C().START_YEAR, 0, 1)) / 864e5); }
  function orthodoxEaster(y) { // алгоритм Гаусса для юлианской Пасхи + 13 дней (верно для 1900–2099)
    const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
    return dayIdx(y, Math.floor((d + e + 114) / 31) - 1, ((d + e + 114) % 31) + 1 + 13);
  }
  function lunarDays(y, base) { // даты лунного праздника в году y: опорная дата + k × 354,37 дня
    const isl = C().HOLIDAY_ISLAMIC, p = base.split('-').map(Number), b = dayIdx(p[0], p[1] - 1, p[2]);
    const y0 = dayIdx(y, 0, 1), y1 = dayIdx(y + 1, 0, 1), out = [];
    for (let k = Math.floor((y0 - b) / isl.step) - 1; k <= Math.ceil((y1 - b) / isl.step) + 1; k++) { const x = b + Math.round(k * isl.step); if (x >= y0 && x < y1) out.push(x); }
    return out;
  }
  function holidaysOfYear(y) {
    const key = y + ':' + C().START_YEAR;
    if (holYears[key]) return holYears[key];
    const H = C().HOLIDAYS || {}, list = [];
    const add = (id, start, end) => { if (H[id]) list.push({ id, name: H[id].name, start, end }); };
    add('newyear', dayIdx(y, 11, 22), dayIdx(y, 11, 31));
    add('march8', dayIdx(y, 2, 5), dayIdx(y, 2, 8));
    for (const x of lunarDays(y, C().HOLIDAY_ISLAMIC.uraza)) add('uraza', x - 1, x + 1);
    for (const x of lunarDays(y, C().HOLIDAY_ISLAMIC.kurban)) add('kurban', x - 1, x + 1);
    const j13 = dayIdx(y, 5, 13), sat = j13 + (6 - new Date(Date.UTC(y, 5, 13)).getUTCDay() + 7) % 7;
    add('sabantuy', sat, sat + 1);
    add('sept1', dayIdx(y, 8, 1), dayIdx(y, 8, 7));
    add('summer', dayIdx(y, 6, 1), dayIdx(y, 7, 31));
    const easter = orthodoxEaster(y);
    add('lent', easter - 48, easter - 1);
    list.sort((a, b) => a.start - b.start);
    return (holYears[key] = list);
  }
  function holidaysAround(day) { const y = dateOf(day).y; return holidaysOfYear(y - 1).concat(holidaysOfYear(y), holidaysOfYear(y + 1)); }
  function menuCatShares(S) { // доля выручки категории в меню (веса как в menuStats)
    const sh = {}; let tot = 0;
    for (const it of S.menu) { const p = byId(BK.PRODUCTS, it.id); if (!p) continue; const w = p.pop * (0.55 + 0.9 * (S.trends[p.cat] || 50) / 100) * p.price * it.pm; sh[p.cat] = (sh[p.cat] || 0) + w; tot += w; }
    for (const k in sh) sh[k] /= tot || 1;
    return sh;
  }
  let holDay = null;
  function cityCatK(day) { // прибавка к чеку по доле категории в меню: cat — круглый год, hot — июнь–август
    const c = BK.CITY; if (!c || (!c.cat && !c.hot)) return null;
    const m = dateOf(day).m, out = Object.assign({}, c.cat || {});
    if (c.hot && m >= 5 && m <= 7) for (const k in c.hot) out[k] = (out[k] || 0) + c.hot[k];
    return out;
  }
  function holidayDay(S, day) { // общие множители сети на день: dem (поток), chk (чек), lm (по соседству)
    const cal = BK.CITY && BK.CITY.cal; // календарный профиль города: доля байрамов и сила Сабантуя (у Уфы нет — всё в полную силу)
    const key = S.seed + ':' + day + ':' + S.menu.map((m) => m.id).join() + (cal ? ':' + BK.CITY.id : '');
    if (holDay && holDay.key === key) return holDay;
    const H = C().HOLIDAYS || {}, act = holidaysAround(day).filter((h) => h.start <= day && day <= h.end);
    let rev = 1, catAdd = 0; const lm = {};
    const ck = cal ? cityCatK(day) : null; // особенности города (Р4): любимые категории (Оренбург — национальная выпечка, жаркое лето — напитки)
    const sh = act.length || ck ? menuCatShares(S) : {};
    if (ck) for (const k in ck) catAdd += (sh[k] || 0) * ck[k];
    for (const h of act) {
      const c = H[h.id];
      const f = cal ? (h.id === 'uraza' || h.id === 'kurban' ? cal.muslim : h.id === 'sabantuy' ? cal.sab : 1) : 1;
      if (f === 1) {
        rev *= c.rev || 1;
        if (c.cat) for (const k in c.cat) catAdd += (sh[k] || 0) * c.cat[k];
        if (c.lm) for (const k in c.lm) lm[k] = (lm[k] || 1) * c.lm[k];
      } else {
        rev *= 1 + ((c.rev || 1) - 1) * f;
        if (c.cat) for (const k in c.cat) catAdd += (sh[k] || 0) * c.cat[k] * f;
        if (c.lm) for (const k in c.lm) lm[k] = (lm[k] || 1) * (1 + (c.lm[k] - 1) * f);
      }
    }
    return (holDay = { key, act, dem: Math.sqrt(rev), chk: Math.sqrt(rev) * (1 + catAdd), lm });
  }
  function holidayMult(S, st, t) { // множители праздника для точки; без полной даты (оценка помещений) — нейтрально
    if (t.y == null || !C().HOLIDAYS) return { dem: 1, chk: 1 };
    const h = holidayDay(S, dayIdx(t.y, t.m, t.d));
    let f = 1; for (const id of st.landmarks) if (h.lm[id]) f *= h.lm[id];
    const cl = C().HOLIDAY_LM_CLAMP || [0.7, 1.6];
    return { dem: h.dem * (f === 1 ? 1 : clamp(f, cl[0], cl[1])), chk: h.chk };
  }
  const LM_AT = { school: 'у школ', uni: 'у вузов', park: 'в парках' };
  const CAT_SHORT = { desserts: 'десерты', sweet: 'сладкая выпечка', national: 'национальная выпечка', pies: 'пироги' };
  function holidayEffectText(id) { // «выручка +25%, десерты +60%»
    const c = (C().HOLIDAYS || {})[id]; if (!c) return '';
    const p = (x) => (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 100) + '%';
    const out = [];
    if (c.rev && c.rev !== 1) out.push('выручка ' + p(c.rev - 1));
    if (c.cat) for (const k in c.cat) out.push((CAT_SHORT[k] || (BK.CATEGORIES[k] ? BK.CATEGORIES[k].name.toLowerCase() : k)) + ' ' + p(c.cat[k]));
    if (c.lm) for (const k in c.lm) out.push((LM_AT[k] || k) + ' ' + p(c.lm[k] - 1));
    return out.join(', ');
  }
  function upcomingHolidays(S, n) { // ближайшие (и идущие) даты календаря
    const out = [];
    for (const h of holidaysAround(S.day)) if (h.end >= S.day && out.length < (n || 3)) out.push(Object.assign({ inDays: h.start - S.day, active: h.start <= S.day, effect: holidayEffectText(h.id), neg: isNegHoliday(h.id) }, h));
    return out;
  }
  function isNegHoliday(id) { const c = (C().HOLIDAYS || {})[id] || {}; return (c.rev || 1) < 1 || Object.values(c.lm || {}).some((v) => v < 1); }
  function holidayNotice(S) { // за N дней до начала — тост и запись в журнале
    const N = C().HOLIDAY_NOTICE_DAYS || 7, c = C().HOLIDAYS || {};
    for (const h of holidaysAround(S.day)) {
      if (h.start - S.day !== N) continue;
      const lms = Object.keys(c[h.id].lm || {});
      if (!c[h.id].rev && !S.stores.some((st) => st.landmarks.some((l) => lms.includes(l)))) continue; // только про соседство, которого у сети нет
      const text = `${h.name} через ${N} дн. (${fmtDate(h.start)}${h.end > h.start ? ' — ' + fmtDate(h.end) : ''}): ${holidayEffectText(h.id)}.`;
      log(S, text, isNegHoliday(h.id) ? 'warn' : 'good');
      toast(S, `${h.name} через ${N} дн.`, holidayEffectText(h.id) + '.', isNegHoliday(h.id) ? 'warn' : 'good');
    }
  }

  function storeDemand(S, st, t, ms) {
    const cfg = C();
    const sz = cfg.SIZES[st.size];
    const lms = st.landmarks.map((id) => byId(BK.LANDMARKS, id));
    // трафик
    let wk = 1; for (const l of lms) wk *= l.wk;
    const fwd = 7 / (5 + 2 * wk);
    let dayF = t.dow >= 5 ? fwd * wk : fwd;
    let season = SEASON[t.m];
    if (BK.CITY && BK.CITY.season) season *= BK.CITY.season[t.m]; // сезонный профиль города (у Уфы нет)
    if (lms.some((l) => l.summer) && t.m >= 5 && t.m <= 7) season *= (BK.CITY && BK.CITY.park) || 1.25; // парки летом (Самара — набережная Волги, сильнее)
    let cannibal = 1, inDistrict = 0;
    for (const o of S.stores) {
      if (o === st || o.status === 'opening') continue;
      if (dist(o, st) < (cfg.CANNIBAL_RADIUS || 26)) cannibal *= (cfg.CANNIBAL_F || 0.86);
      if (o.district === st.district) inDistrict++;
    }
    cannibal /= 1 + cfg.SATURATION_K * Math.max(0, inDistrict - 1);
    const mkt = 1 + cfg.MARKETING_EFF * (S.lastMarketingPerStore / (S.lastMarketingPerStore + cfg.MARKETING_HALF * S.macro.priceLevel));
    // раскрутка: новая точка первые месяцы собирает только часть потока, пока район к ней не привыкнет
    const ramp = st.openedDay != null && cfg.RAMP_DAYS ? Math.min(1, cfg.RAMP_START + (1 - cfg.RAMP_START) * (S.day - st.openedDay) / cfg.RAMP_DAYS) : 1;
    const traffic = st.traffic * sz.capture * dayF * season * cannibal * mkt * st.comp * ramp
      * modMult(S, 'traffic', st) * modMult(S, 'competitor', st) * rivalMult(S, st);
    // сервис
    let lvlSum = 0; for (const e of st.staff) lvlSum += e.lvl;
    const avgLvl = st.staff.length ? lvlSum / st.staff.length : 1;
    const svcConv = 1 + cfg.LVL_CONV * (avgLvl - 1);
    const svcCheck = 1 + cfg.LVL_CHECK * (avgLvl - 1);
    const rep = st.repair > 0 ? cfg.REPAIRS[st.repair] : { conv: 1, check: 1 };
    const staffF = st.staff.length < sz.staffMin ? 0.85 : 1;
    let moodSum = 0, moodN = 0; for (const e of st.staff) if (e.mood != null) { moodSum += e.mood; moodN++; }
    const moodF = moodN && cfg.MOOD_CONV ? 1 + cfg.MOOD_CONV * (moodSum / moodN - 60) / 40 : 1; // довольная команда продаёт лучше
    // цена vs платёжеспособность
    const Sv = st.solv * S.macro.priceLevel;
    const B = ms.avgPrice * cfg.ITEMS_PER_CHECK;
    let check, priceConv;
    if (B <= Sv) { check = B + cfg.UPSELL * (Sv - B); priceConv = 1 + (cfg.PRICE_CONV_K != null ? cfg.PRICE_CONV_K : 0.15) * (1 - B / Sv); } // дешёвое меню относительно кошелька района — больше покупают
    else { check = Math.sqrt(B * Sv); priceConv = Math.pow(Sv / B, 2); }
    priceConv *= Math.pow(ms.priceIdx, -0.6);
    let healthy = 1;
    if (lms.some((l) => l.healthy)) healthy = 1.05;
    const conv = cfg.BASE_CONV * ms.appeal * svcConv * rep.conv * priceConv * staffF * moodF * healthy * modMult(S, 'conv', st);
    check *= rep.check * svcCheck * modMult(S, 'check', st);
    const hol = holidayMult(S, st, t); check *= hol.chk; // календарь праздников
    let demand = traffic * conv * hol.dem * ratingMult(S, st) * diffK(S, 'demand'); // рейтинг на картах — небольшая прибавка/потеря новых гостей
    if (S.corp && BK.Corp) { const aw = BK.Corp.demandMult(S); if (aw !== 1) demand *= aw; const g = BK.Corp.growthK ? BK.Corp.growthK(S) : 1; if (g !== 1) demand *= g; } // узнаваемость бренда в новом городе (у Уфы — ровно 1); рост населения города (Р4)
    let thr = 0; for (const e of st.staff) thr += cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * (e.lvl - 1);
    thr *= daypartOf(st).thrK; // пиковые часы: очередь в утренний/обеденный/вечерний пик
    return { demand, thr, check, traffic, avgLvl };
  }

  function dailyStores(S, t) {
    const cfg = C();
    const ms = menuStats(S);
    S.cache = { ms };
    dailyRatings(S);
    let totalUnits = 0;
    const rows = [];
    for (const st of S.stores) {
      if (st.status === 'opening') { if (S.day >= st.openDay) { st.status = 'open'; st.openedDay = S.day; log(S, `Открылась пекарня: ${st.address}`, 'good'); toast(S, 'Новая точка открыта', st.address, 'good'); } else continue; }
      if (st.status === 'repair' && S.day >= st.repairUntil) {
        st.status = 'open'; st.repair += 1;
        log(S, `Ремонт завершён: ${st.address} — «${cfg.REPAIRS[st.repair].name}»`, 'good');
        toast(S, 'Ремонт завершён', `${st.address}: ${cfg.REPAIRS[st.repair].name}`, 'good');
      }
      const closed = st.status === 'repair' || (st.closedUntil && st.closedUntil > S.day) || st.staff.length === 0;
      if (closed) { st.today = { checks: 0, rev: 0, load: 0, closed: true, lost: 0 }; rows.push(null); continue; }
      const d = storeDemand(S, st, t, ms);
      const A = aggDay(S, st, d); // доставка через агрегаторы: заказы делят время команды с гостями зала
      const hall = A ? Math.max(0, d.demand - A.cannib) : d.demand, work = hall + (A ? A.orders * cfg.AGG_LOAD : 0);
      const f = work > d.thr ? d.thr / work : 1;
      const checks = hall * f, ao = A ? A.orders * f : 0;
      const load = d.thr > 0 ? work / d.thr : 2;
      rows.push({ st, d, checks, load, hall, ao });
      totalUnits += (checks + ao) * cfg.ITEMS_PER_CHECK;
    }
    // мощность производства
    let cap = 0; for (const p of S.productions) cap += prodCapacity(S, p);
    if (S.stage1 && S.stage1.selfBake) cap += totalUnits; // стадия 1 (stage1.js): кофейня печёт сама из закупленных полуфабрикатов — цеха нет
    if (S.corp && BK.Corp && BK.Corp.remoteFill) { const rf = BK.Corp.remoteFill(S); if (rf) cap += totalUnits; } // второй акт: везут из цеха другого города — хватает на всё (false — поставки прерваны)
    const fill = totalUnits > 0 ? Math.min(1, cap / totalUnits) : 1;
    S.cache.capUse = cap > 0 ? totalUnits / cap : 0; S.cache.cap = cap; S.cache.units = totalUnits; S.cache.fill = fill;
    // фудкост — средневзвешенный по производствам
    let fcMult = 1;
    if (S.productions.length) {
      let wsum = 0, fsum = 0;
      for (const p of S.productions) if (p.status === 'open') { const c = prodCapacity(S, p); wsum += c; fsum += c * prodFcMult(S, p) * modScope(S, 'foodcost', 'production', p.id); }
      if (wsum > 0) fcMult = fsum / wsum;
    }
    fcMult *= modScope(S, 'foodcost', 'global', null);
    if (S.corp) fcMult *= modScope(S, 'foodcost', 'city', S.corp.active) * (S.corp.hqFcK || 1); // второй акт: события города и отдел закупок штаба
    let fcPct = clamp(ms.fcPct * (cfg.FOODCOST_MULT || 1) * fcMult, 0.08, 0.8); // FOODCOST_MULT — списания, упаковка, потери
    if (S.corp && BK.Corp && BK.Corp.remoteFc) { const fz = BK.Corp.remoteFc(S); if (fz) fcPct += fz; } // фабрика заморозки: фудкост +3 п. п.
    S.cache.fcPct = fcPct;
    const wz = wasteFactors(S, ms), fcRec = fcPct / (cfg.FOODCOST_MULT || 1); let dayFc = 0; // списания — по себестоимости непроданного
    S.cache.waste = wz; S.cache.fcPct = (fcPct + fcRec * wz.waste) / wz.revMult; // фудкост с учётом списаний и скидки — для прогнозов
    let dayRev = 0, dayAgg = 0;
    const waste0 = S.month.waste || 0; // списания месяца до сегодняшнего дня: учёту по продуктам (prodstats.js) отдаём списания дня точно
    const aggK = C().AGG_PACK + aggCommission(S);
    for (const r of rows) {
      if (!r) continue;
      const { st, d } = r;
      const checks = bakeChecks(r.checks * fill, d, wz);
      const ws = storeWaste(wz, st); // время суток: у вечерних точек остатки раскупают, у утренних — залёживаются
      const revFull = checks * d.check, rev = revFull * ws.revMult;
      const lost = (r.hall - checks) * d.check;
      const ao = r.ao * fill * Math.min(1, wz.sales), ar = ao * d.check * cfg.AGG_CHECK; // доставка: заказы и выручка (без вечерней скидки)
      st.today = { checks, rev: rev + ar, load: r.load, lost, check: d.check, traffic: d.traffic, closed: false, agg: ao, aggRev: ar };
      st.cpd = st.cpd != null ? st.cpd * 0.95 + checks * 0.05 : checks; // сглаженные чеки в день (для доставки)
      st.m.rev += rev + ar; st.m.checks += checks; st.m.fc += (revFull + ar) * fcPct; st.m.lost += Math.max(0, lost);
      if (ar) { st.m.aggRev = (st.m.aggRev || 0) + ar; st.m.aggOrders = (st.m.aggOrders || 0) + ao; st.m.agg = (st.m.agg || 0) + ar * aggK; dayAgg += ar; S.month.aggOrders = (S.month.aggOrders || 0) + ao; }
      dayRev += ar; dayFc += ar * fcPct;
      const wst = revFull * fcRec * ws.waste; st.m.fc += wst; st.m.waste = (st.m.waste || 0) + wst; dayFc += revFull * fcPct + wst;
      S.month.waste = (S.month.waste || 0) + wst; S.month.lostBake = (S.month.lostBake || 0) + revFull / (1 - wz.lost) * wz.lost;
      dayRev += rev;
      S.month.lost += Math.max(0, lost);
    }
    S.cash += dayRev; S.month.rev += dayRev; S.cumRevenue += dayRev; S.yearRev += dayRev;
    let dayChecks = 0; for (const r of rows) if (r) dayChecks += r.st.today.checks;
    S.month.checks += dayChecks;
    spend(S, dayFc, 'fc');
    if (dayAgg) { S.month.aggRev = (S.month.aggRev || 0) + dayAgg; spend(S, dayAgg * aggK, 'agg'); } // комиссия агрегатора и упаковка
    S.cache.dayRev = dayRev;
    if (BK.ProdStats) BK.ProdStats.day(S, dayRev, dayFc, dayChecks, (S.month.waste || 0) - waste0); // учёт продаж по продуктам (prodstats.js): только читает итоги дня
    // производство: загрузка
    for (const p of S.productions) {
      p.load = S.cache.capUse;
      const units = totalUnits * (cap > 0 ? prodCapacity(S, p) / cap : 0);
      p.need = cfg.PROD_STAFF_BASE + Math.ceil(Math.min(units, prodCapacity(S, p) || units) / cfg.PROD_UNITS_PER_BAKER);
    }
  }

  /* ---------------- рейтинг точки на картах и списания ---------------- */
  // S.waste: { bake: −3…+3 (ползунок «Сколько печь»), disc: 0…3 (вечерняя скидка), discDay, penUntil } — старые сохранения получают значения по умолчанию
  function wasteState(S) {
    if (!S.waste) S.waste = { bake: 0, disc: 0, discDay: -9999, penUntil: 0 };
    return S.waste;
  }
  function bakeLevel(S) { const cfg = C(); return cfg.BAKE_LEVELS[clamp(Math.round(wasteState(S).bake), -3, 3) + 3]; }
  // факторы дня для всей сети: продажи, выручка со скидкой, списания (доля от проданного объёма)
  function wasteFactors(S, ms) {
    const cfg = C(), W = wasteState(S), L = bakeLevel(S), lost0 = cfg.BAKE_LEVELS[3].lost;
    const i = clamp(W.disc | 0, 0, cfg.EVE_DISCOUNTS.length - 1), d = cfg.EVE_DISCOUNTS[i];
    const n = ms ? ms.n : S.menu.length;
    let erpCap = 0, capAll = 0; // доля мощности цехов с ERP-планированием
    for (const p of S.productions) if (p.status === 'open') { const c = prodCapacity(S, p); capAll += c; if (p.equip.erp) erpCap += c; }
    const erp = capAll > 0 ? erpCap / capAll : 0;
    const menuF = Math.max(0.5, 1 + cfg.WASTE_MENU_K * (n - cfg.WASTE_MENU_REF));
    const left = cfg.WASTE_BASE * L.waste * menuF * (1 - cfg.WASTE_ERP_CUT * erp); // непроданное без скидки
    const sold = Math.min(left * cfg.EVE_SELL[i], cfg.EVE_CAP[i]); // раскупили вечером со скидкой
    return { sales: (1 - L.lost) / (1 - lost0), lost: L.lost, revMult: 1 - cfg.EVE_CANNIBAL[i] * d + sold * (1 - d), waste: left - sold, disc: d, erp, menuF, left, i };
  }
  function storeWaste(wz, st) { // остатки и вечерняя скидка на точке с учётом времени суток (доля вечерних гостей)
    const cfg = C(), dp = daypartOf(st), i = wz.i;
    const left = wz.left * dp.wasteK, sold = Math.min(left * cfg.EVE_SELL[i] * dp.eveK, cfg.EVE_CAP[i] * dp.eveK);
    return { revMult: 1 - cfg.EVE_CANNIBAL[i] * wz.disc * dp.eveK + sold * (1 - wz.disc), waste: left - sold };
  }
  function bakeChecks(c, d, wz) { const x = c * wz.sales; return wz.sales > 1 ? Math.min(x, Math.max(c, d.thr)) : x; } // перерасход не продаст больше, чем успевает команда
  function ratingParts(S, st) {
    const cfg = C();
    let lv = 0, md = 0; for (const e of st.staff) { lv += e.lvl; md += e.mood; }
    const n = st.staff.length;
    const avgLvl = n ? lv / n : 1, mood = n ? md / n : 60;
    const ratio = st.staffTarget ? Math.min(1, n / st.staffTarget) : 1;
    return {
      train: clamp(cfg.RATING_TRAIN[0] + cfg.RATING_TRAIN[1] * (avgLvl - 1), 1, 5),
      repair: cfg.RATING_REPAIR[st.repair || 0],
      mood: clamp(1 + 4 * Math.pow(clamp(mood, 0, 100) / 100, cfg.RATING_MOOD_EXP), 1, 5),
      staff: clamp(5 - 8 * (1 - ratio), 1, 5),
      fresh: bakeLevel(S).fresh,
    };
  }
  function ratingTarget(S, st) {
    const w = C().RATING_W, p = ratingParts(S, st); let s = 0; for (const k in w) s += w[k] * p[k];
    if (S.corp && BK.Corp && BK.Corp.ratingAdj) { const a = BK.Corp.ratingAdj(S); if (a) s -= a; } // второй акт: свежесть при поставках из другого города, особенности города
    return s - aggLatePen(S, st); // перегруз доставкой — опоздания
  }
  function discPenalty(S) { const W = wasteState(S); return W.penUntil > S.day ? C().DISC_PENALTY_RATING : 0; }
  // рейтинг, который видят гости (с временным штрафом за частую смену скидки)
  function storeRating(S, st) { return clamp((st.rating != null ? st.rating : C().RATING_START) - (st.num != null ? discPenalty(S) : 0), 1, 5); }
  function ratingMult(S, st) {
    const cfg = C(), r = storeRating(S, st) - cfg.RATING_START;
    return 1 + (r < 0 ? cfg.RATING_TRAFFIC_LO : cfg.RATING_TRAFFIC_HI) * r;
  }
  function dailyRatings(S) {
    const k = 1 / C().RATING_DAYS;
    for (const st of S.stores) {
      if (st.rating == null) st.rating = C().RATING_START;
      if (st.status !== 'open' || !st.staff.length) continue;
      st.rating += (ratingTarget(S, st) - st.rating) * k;
    }
  }
  function networkRating(S) {
    let s = 0, n = 0; for (const st of S.stores) if (st.status !== 'opening') { s += storeRating(S, st); n++; }
    return n ? s / n : null;
  }
  function setBake(S, v) { wasteState(S).bake = clamp(Math.round(+v || 0), -3, 3); }
  function discFreeDay(S) { return wasteState(S).discDay + C().DISC_CHANGE_DAYS; }
  function setEveDiscount(S, i) {
    const cfg = C(), W = wasteState(S);
    i = clamp(i | 0, 0, cfg.EVE_DISCOUNTS.length - 1);
    if (i === W.disc) return { ok: true, penalty: false };
    const penalty = S.day < discFreeDay(S);
    if (penalty) {
      W.penUntil = S.day + cfg.DISC_PENALTY_DAYS;
      log(S, `Вечерняя скидка сменилась слишком скоро — гости раздражены: рейтинг точек −${String(cfg.DISC_PENALTY_RATING).replace('.', ',')}★ до ${fmtDate(W.penUntil)}.`, 'warn');
    }
    W.disc = i; W.discDay = S.day;
    return { ok: true, penalty };
  }

  function unhappyReason(S, fatigue, under) {
    if (fatigue > 45) return 'люди вымотаны: гостей больше, чем они успевают обслужить. Добавьте сотрудников или обучите команду';
    if (S.pay.seller < S.market.seller) return 'зарплата ниже рынка';
    if (under) return 'не хватает людей в смене — наймите замену';
    if (S.loyaltyMod < -5) return 'зарплату выдали с задержкой — нужны премии или корпоративная культура';
    return 'нужны премии, зарплата выше рынка или корпоративная культура';
  }
  let quitStores = []; // точки, откуда сегодня ушли люди (для уведомления)
  const empWord = (n) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'сотрудника' : n % 10 === 1 && n % 100 !== 11 ? 'сотрудник' : 'сотрудников');
  function dailyStaff(S) {
    quitStores = [];
    const cfg = C();
    const cult = cfg.CULTURE[S.culture].mood;
    const payTerm = clamp((S.pay.seller / S.market.seller - 1) * (cfg.PAY_MOOD_K || 120), -40, 30);
    const bonusTerm = clamp(S.lastBonusPerEmp / S.pay.seller * 100, 0, 15);
    for (const st of S.stores) {
      if (st.status === 'opening') continue;
      // прибытие новых сотрудников
      for (let i = st.incoming.length - 1; i >= 0; i--) {
        if (st.incoming[i].day <= S.day) { const e = st.incoming[i].p; e.since = S.day; e.lvlDay = S.day; st.staff.push(e); st.incoming.splice(i, 1); }
      }
      const sz = cfg.SIZES[st.size];
      const missing = Math.max(0, Math.min(st.staffTarget, sz.staffBase) - st.staff.length);
      const under = missing > 0;
      const underPen = Math.min(20, missing * 7 * (4 / sz.staffBase));
      const closed = !st.today || st.today.closed;
      const load = closed ? 0 : st.today.load;
      const fatT = clamp((load - cfg.FATIGUE_START) * cfg.FATIGUE_SLOPE, 0, 100);
      const warnList = [];
      const staffBefore = st.staff.length;
      for (let i = st.staff.length - 1; i >= 0; i--) {
        const e = st.staff[i];
        e.fatigue += (fatT - e.fatigue) * 0.1;
        if (e.hero) continue; // стадия 1: сам игрок за стойкой — не увольняется, настроение и силы ведёт stage1.js
        const stagn = e.lvl <= 2 && S.day - e.lvlDay > 180 ? 5 : 0;
        const target = (cfg.MOOD_BASE != null ? cfg.MOOD_BASE : 60) + payTerm + cult + bonusTerm + S.loyaltyMod + diffK(S, 'mood') + e.trait - e.fatigue * 0.35 - underPen + (e.lvl - 1) * 2.5 - stagn;
        e.mood = clamp(e.mood + (target - e.mood) * 0.08, 0, 100);
        if (e.mood < cfg.MOOD_UNHAPPY) e.unhappy++; else e.unhappy = Math.max(0, e.unhappy - 2);
        // личное предупреждение: сотрудник недоволен уже N дней — игрок узнаёт об этом заранее
        if (e.unhappy === (cfg.UNHAPPY_WARN_AFTER || 5) && S.day - (e.warnDay || -999) > 30) { e.warnDay = S.day; warnList.push(e); }
        const QP = cfg.QUIT_P || [0.00018, 0.0007, 0.002]; // вероятность уйти за день: довольный / нейтральный / недовольный
        let p = e.mood >= cfg.MOOD_HAPPY ? QP[0] : e.mood >= cfg.MOOD_UNHAPPY ? QP[1] : QP[2];
        p *= (1 - 0.08 * (e.lvl - 1)) * diffK(S, 'quit');
        if (e.unhappy > cfg.UNHAPPY_QUIT_DAYS + diffK(S, 'patience') + (e.patience || 0) || rnd(S) < p) {
          st.staff.splice(i, 1);
          S.stats.quits++;
          const g = (m, f) => BK.byGender(e.name, m, f);
          const why = e.unhappy > cfg.UNHAPPY_QUIT_DAYS + diffK(S, 'patience') + (e.patience || 0) ? (e.fatigue > 50 ? g('выгорел', 'выгорела') + ' от переработок' : S.pay.seller < S.market.seller ? g('ушёл', 'ушла') + ' на зарплату выше' : g('был недоволен', 'была недовольна') + ' больше месяца') : g('нашёл', 'нашла') + ' другую работу';
          log(S, `${e.name} (${BK.STAFF_LVL_NAMES[e.lvl]}, ${st.address}) ${g('уволился', 'уволилась')}: ${why}.`, 'bad');
          S.flags.quitsToday = (S.flags.quitsToday || 0) + 1;
        }
      }
      if (st.staff.length < staffBefore) quitStores.push(st);
      if (warnList.length) {
        const left = Math.max(1, Math.min(...warnList.map((e) => cfg.UNHAPPY_QUIT_DAYS + diffK(S, 'patience') + (e.patience || 0) - e.unhappy)));
        let ft = 0; for (const e of warnList) ft += e.fatigue; ft /= warnList.length;
        const why = unhappyReason(S, ft, under);
        const names = warnList.map((e) => e.name).join(', ');
        const n = warnList.length;
        st.warnDay = S.day; // общее предупреждение по точке — не раньше чем через месяц
        toast(S, `Точка №${st.num}: ${n > 1 ? n + ' ' + empWord(n) + ' недовольны' : 'сотрудник недоволен'}`, `${names} — ${why}. Если ничего не изменить, ${n > 1 ? 'начнут увольняться' : 'уволится'} примерно через ${left} дн.`, 'warn', { storeId: st.id });
        log(S, `Точка №${st.num} (${st.address}): ${names} ${n > 1 ? 'недовольны' : BK.byGender(names, 'недоволен', 'недовольна')} — ${why}. ${n > 1 ? 'Могут начать увольняться' : 'Может уволиться'} через ~${left} дн.`, 'warn');
      }
      // предупреждение о недовольной команде
      if (st.staff.length) {
        let ms = 0, ft = 0; for (const e of st.staff) { ms += e.mood; ft += e.fatigue; }
        ms /= st.staff.length; ft /= st.staff.length;
        if (ms < cfg.MOOD_UNHAPPY + 3 && S.day - (st.warnDay || -999) > 30) {
          st.warnDay = S.day;
          const why = unhappyReason(S, ft, under);
          toast(S, `Точка №${st.num}: команда недовольна`, `${st.address}: ${why}. Через месяц недовольства люди начнут увольняться.`, 'bad', { storeId: st.id });
          log(S, `Точка №${st.num} (${st.address}): команда недовольна — ${why}.`, 'bad');
        }
      }
      // автонайм
      if (S.office.hr && S.office.autohireOn) {
        let v = vacancies(st);
        while (v-- > 0) { const e = makePerson(S, candLevel(S)); const c = hireCost(S, e.lvl); spend(S, c, 'hire'); st.incoming.push({ p: e, day: S.day + hireDays(S) }); S.stats.hires++; }
      }
    }
    // отдел обучения: сам поднимает уровень до цели
    if (S.office.academy && S.office.autotrainOn) {
      let quota = trainersCount(S) * cfg.AUTOTRAIN_PER_TRAINER_DAY;
      const reserveFloor = Math.max(0, S.lastMonthRev * 0.05);
      for (const st of S.stores) {
        if (quota <= 0) break;
        for (const e of st.staff) {
          if (quota <= 0) break;
          if (e.lvl >= S.office.trainTarget || S.day - e.lvlDay < cfg.AUTOTRAIN_GAP_DAYS || S.day - e.since < 14) continue;
          if (S.cash - trainCost(S, e.lvl + 1) < reserveFloor) { quota = 0; break; }
          if (train(S, st.id, e.id, true).ok) quota--;
        }
      }
    }
    if (!S.office.academy && S.stores.length > cfg.TRAIN_REQUIRED_STORES && !S.flags.trainWarned) {
      S.flags.trainWarned = true;
      toast(S, 'Пора открыть отдел обучения', `В сети больше ${cfg.TRAIN_REQUIRED_STORES} точек — вручную вы успеваете обучить только ${cfg.OWNER_TRAINS_PER_WEEK} человек в неделю. Отдел обучения во вкладке «Команда» будет учить персонал сам.`, 'warn');
    }
    // пекари (агрегировано)
    const bPay = clamp((S.pay.baker / S.market.baker - 1) * 120, -40, 30);
    for (const p of S.productions) {
      if (p.status !== 'open') continue;
      const fat = clamp((p.load - 0.85) * 300, 0, 60);
      const target = 58 + bPay + cult + bonusTerm + S.loyaltyMod - fat;
      p.morale = clamp(p.morale + (target - p.morale) * 0.06, 0, 100);
      if (p.staff < p.need && S.day % 3 === 0) { // цех нанимает сам
        const n = p.need - p.staff;
        spend(S, n * cfg.HIRE_COST_SALARIES * S.pay.baker, 'hire'); p.staff += n;
      } else if (p.staff > p.need + 2 && S.day % 30 === 0) { p.staff -= 1; }
    }
  }

  function dailyMisc(S, t) {
    const cfg = C();
    // предложения аренды
    S.offers = S.offers.filter((o) => o.expires > S.day);
    if (S.day >= S.offerRefreshDay) {
      S.offerRefreshDay = S.day + cfg.OFFER_REFRESH_DAYS;
      const n = Math.ceil(S.offers.length * 0.4);
      for (let i = 0; i < n; i++) { // помещения из событий (special) живут до своего срока
        const k = ri(S, 0, S.offers.length - 1);
        if (!S.offers[k].special) S.offers.splice(k, 1);
      }
    }
    genStoreOffers(S);
    refreshCandidates(S);
    // годовая аренда
    for (const st of S.stores) if (st.payMode === 'year' && st.status !== 'opening' && S.day >= st.rentPaidUntil) {
      const c = storeRentMonth(st) * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT);
      spend(S, c, 'rent'); st.rentPaidUntil = S.day + 365; st.m.rent += c;
      log(S, `Оплачена аренда на год вперёд: ${st.address} (${BK.fmtMoney(c)})`);
    }
    // производства открываются
    for (const p of S.productions) if (p.status === 'opening' && S.day >= p.openDay) { p.status = 'open'; log(S, `Производство запущено: ${p.address}`, 'good'); toast(S, 'Цех запущен', p.address, 'good'); }
    if (!S.office.hr && S.stores.length > cfg.HR_REQUIRED_STORES && !S.flags.hrWarned) {
      S.flags.hrWarned = true;
      toast(S, 'Пора нанять HR-отдел', `В сети больше ${cfg.HR_REQUIRED_STORES} точек — владелец больше не успевает нанимать сам: не больше ${cfg.OWNER_HIRES_PER_WEEK} человек в неделю и по ${cfg.OWNER_HIRE_DAYS_BIG} дней. Откройте HR-отдел во вкладке «Команда».`, 'warn');
    }
    // открыть доступ ко 2-му/3-му цеху
    const nOpen = S.stores.length;
    const allowed = nOpen >= cfg.THIRD_PROD_STORES ? 3 : nOpen >= prod2Stores() ? 2 : 1;
    if (allowed > S.productions.length && !S.prodOffers.length) {
      genProdOffers(S, 3);
      toast(S, 'Можно открыть ещё одно производство', `У сети ${nOpen} точек — появились помещения под новый цех.`, 'good');
      log(S, `Доступно ${S.productions.length + 1}-е производство.`, 'good');
    }
    // модификаторы
    S.mods = S.mods.filter((m) => m.until > S.day);
  }

  function tick(S) {
    if (S.phase !== 'play' || S.ev.pending || S.chef.pending || S.lost) return false;
    S.day += 1;
    const t = dateOf(S.day);
    dailyStores(S, t);
    dailyStaff(S);
    dailyMisc(S, t);
    holidayNotice(S);
    rivalDaily(S, t);
    if (t.d === 1) monthly(S, t);
    if (S.day >= S.ev.nextCrisis) fireCrisis(S);
    else if (fireQueuedEvent(S)) { /* отложенное последствие прошлого решения */ }
    else if (S.day >= S.ev.next) fireRandomEvent(S, t);
    if (S.corp && BK.CorpEv && !S.ev.pending) BK.CorpEv.daily(S, t); // корпоративные события e201–e218 (2+ города; свой ГСЧ)
    if (S.flags.quitsToday) {
      const autohire = S.office.hr && S.office.autohireOn;
      const parts = quitStores.map((st) => `№${st.num}: осталось ${st.staff.length} из ${st.staffTarget}`);
      const hint = autohire ? 'HR-отдел уже ищет замену.' : 'Наймите замену во вкладке «Команда» — иначе оставшиеся начнут выгорать.';
      toast(S, S.flags.quitsToday > 1 ? `Уволились сотрудники: ${S.flags.quitsToday}` : 'Сотрудник уволился', `${parts.length ? 'Точка ' + parts.join('; ') + '. ' : ''}${hint} Подробности — в журнале.`, 'bad', quitStores.length === 1 ? { storeId: quitStores[0].id } : undefined);
      S.flags.quitsToday = 0;
    }
    quitStores = [];
    return true;
  }

  /* ---------------- месячный расчёт ---------------- */
  function monthly(S, t) {
    const cfg = C();
    const M = S.month;
    const agg = S.corp && BK.Corp ? BK.Corp.monthly(S, t) : null; // города на «автопилоте»: выручка и расходы — в общий месяц (corp.js)
    const nEmp = allStaff(S) + bakersTotal(S) + (agg ? agg.emp : 0);
    for (const st of S.stores) {
      if (st.status === 'opening') { st.last = null; continue; }
      const mk = st.mountK != null ? st.mountK : 1; // город смонтирован посреди месяца — постоянные расходы за его часть (остальное — в агрегате)
      if (st.mountK != null) delete st.mountK;
      const rent = st.payMode === 'month' ? storeRentMonth(st) * mk : 0;
      let pay = 0; for (const e of st.staff) pay += salaryOf(S, e.lvl) * (1 + cfg.PAYROLL_TAX);
      pay *= mk;
      const util = (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * st.area) * S.macro.priceLevel * mk;
      const del = deliveryCost(S, st) * mk;
      spend(S, rent, 'rent'); spend(S, pay, 'payroll'); spend(S, util, 'util'); spend(S, del, 'delivery');
      st.m.rent += rent; st.m.payroll = pay; st.m.util = util; st.m.delivery = del;
      st.m.profit = st.m.rev - st.m.fc - st.m.rent - pay - util - del - (st.m.agg || 0) - st.m.rev * currentTaxRate(S);
      st.last = st.m;
      st.lossStreak = st.m.profit < 0 ? (st.lossStreak || 0) + 1 : 0; // месяцев подряд в убытке (для «Требует внимания»); в старых сохранениях поля нет → 0
      st.hist = (st.hist || []).concat([Math.round(st.m.rev)]).slice(-12);
      st.m = { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 };
    }
    for (const p of S.productions) {
      const mk = p.mountK != null ? p.mountK : 1;
      if (p.mountK != null) delete p.mountK;
      const rent = prodRentMonth(p) * mk;
      const pay = p.staff * S.pay.baker * (1 + cfg.PAYROLL_TAX) * mk;
      const util = (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * p.area) * S.macro.priceLevel * mk;
      spend(S, rent, 'rent'); spend(S, pay, 'payroll'); spend(S, util, 'util');
      p.lastCost = rent + pay + util;
      // текучка пекарей
      const q = Math.round(p.staff * (0.015 + Math.max(0, 50 - p.morale) / 50 * 0.12));
      if (q > 0) { p.staff -= q; log(S, `С производства (${p.address}) ушли пекари: ${q} чел.`, 'bad'); }
    }
    // офис
    const upkeep = cfg.CULTURE[S.culture].upkeep * nEmp * S.macro.priceLevel
      + Object.keys(cfg.OFFICE_UPGRADES).reduce((a, k) => a + (S.office[k] ? cfg.OFFICE_UPGRADES[k].upkeep * S.macro.priceLevel : 0), 0);
    const hq = Math.max(0, S.stores.length - cfg.HQ_FREE_STORES) * cfg.HQ_PER_STORE * S.macro.priceLevel
      + (S.stores.length > cfg.HQ_FREE_STORES ? (agg ? M.rev - agg.rev : M.rev) * (cfg.HQ_REV_SHARE || 0) : 0) // управляющая компания: бухгалтерия, IT, закупки, маркетинг (города на автопилоте платят её в агрегате)
      + hrCount(S) * cfg.HR_SALARY * (1 + cfg.PAYROLL_TAX) * S.macro.priceLevel
      + trainersCount(S) * cfg.TRAINER_SALARY * (1 + cfg.PAYROLL_TAX) * S.macro.priceLevel;
    spend(S, upkeep + hq, 'upkeep');
    // налоги
    const taxRate = currentTaxRate(S);
    let tax = M.rev * taxRate;
    const opex = M.fc + M.rent + M.payroll + M.util + M.delivery + M.upkeep + M.hire + M.train + M.other + (M.agg || 0) + (M.inv || 0); // + выплаты инвесторам (investors.js)
    if (S.macro.regime === 'osno') tax += Math.max(0, M.rev - opex - M.rev * taxRate) * cfg.OSNO_PROFIT;
    spend(S, tax, 'tax');
    // кредит и резерв
    const interest = S.loan * loanRate(S) / 12 + (M.coll || 0); // залог: проценты по кредиту под точку (collateral.js кладёт их в S.month.coll)
    spend(S, interest, 'interest');
    const resInc = S.reserve * Math.max(0, S.macro.keyRate - cfg.RESERVE_SPREAD + (S.corp && BK.HQ ? BK.HQ.resAdd(S) : 0)) / 12; // финдеп: казначейство
    S.reserve += resInc;
    M.reserveIncome = resInc;
    const profit = M.rev + M.income - (opex + tax + interest);
    M.profit = profit;
    // распределение прибыли
    let toRes = 0, bonus = 0, mkt = 0;
    if (profit > 0) {
      toRes = profit * S.alloc.reserve; bonus = profit * S.alloc.bonus; mkt = profit * S.alloc.marketing;
      S.cash -= toRes; S.reserve += toRes;
      spend(S, bonus, 'bonus'); spend(S, mkt, 'marketing');
    }
    const openStores = (S.stores.filter((s) => s.status !== 'opening').length + (agg ? agg.stores : 0)) || 1;
    S.lastBonusPerEmp = nEmp ? bonus / nEmp : 0;
    S.lastMarketingPerStore = mkt / openStores;
    M.toReserve = toRes;
    // история
    const prev = dateOf(S.day - 1);
    S.history.push({ y: prev.y, m: prev.m, rev: M.rev, profit, cash: S.cash, reserve: S.reserve, stores: S.stores.filter((s) => s.status !== 'opening').length, staff: allStaff(S), fc: M.fc, pnl: Object.assign({}, M) });
    if (S.corp && BK.Corp) BK.Corp.afterMonth(S, S.history[S.history.length - 1], agg); // выручка Уфы (c1), история городов
    if (S.history.length > 480) S.history.shift();
    S.lastMonthRev = M.rev;
    // банкротство
    if (S.cash < 0 && S.reserve <= 0) {
      S.negMonths++;
      if (cfg.CASHGAP_LOYALTY) { // зарплату выдали с задержкой — команда это запомнит
        S.loyaltyMod = clamp(S.loyaltyMod - cfg.CASHGAP_LOYALTY, -30, 30);
        log(S, 'Кассовый разрыв: зарплату выдали с задержкой, команда недовольна.', 'bad');
      }
      if (S.negMonths >= cfg.BANKRUPT_MONTHS) { S.lost = true; S.phase = 'lost'; S.notify.push({ type: 'lost' }); log(S, `Банкротство: счёт в минусе ${cfg.BANKRUPT_MONTHS}-й месяц подряд, а резерв пуст.`, 'bad'); }
      else toast(S, 'Кассовый разрыв!', `Счёт отрицательный ${S.negMonths}-й месяц подряд. На ${cfg.BANKRUPT_MONTHS}-й — банкротство. Возьмите кредит или сократите расходы.`, 'bad');
    } else S.negMonths = 0;
    // лояльность возвращается к нулю, ставка — к норме
    S.loyaltyMod *= 0.9;
    S.macro.keyRate = clamp(S.macro.keyRate + (cfg.KEY_RATE_MEAN - S.macro.keyRate) * 0.04 + gauss(S) * 0.002, 0.05, 0.25);
    // тренды
    for (const k in S.trends) {
      let v = S.trends[k] + gauss(S) * 3.5 + (50 - S.trends[k]) * 0.03;
      if (k === 'healthy') v += 0.35;
      S.trends[k] = clamp(v, 10, 95);
    }
    // победа
    const rolling = rolling12(S);
    if (!S.won && rolling >= cfg.WIN_ANNUAL_REVENUE) {
      S.won = true; S.wonDay = S.day; S.notify.push({ type: 'won' });
      log(S, `ПОБЕДА! Оборот за 12 месяцев — ${BK.fmtMoney(rolling)}.`, 'good');
    }
    S.stats.peakStores = Math.max(S.stats.peakStores, S.stores.length);
    if (BK.Corp) BK.Corp.check(S); // накопленный оборот ≥ 10 млрд — открывается выход в Россию (свой ГСЧ, основной поток не трогает)
    const mname = MONTHS[prev.m];
    S.notify.push({ type: 'month', title: `Итоги: ${mname} ${prev.y}`, rev: M.rev, profit });
    log(S, `Итоги месяца (${mname} ${prev.y}): выручка ${BK.fmtMoney(M.rev)}, прибыль ${BK.fmtMoney(profit)}.`, profit >= 0 ? 'good' : 'bad');
    resetMonth(S);
    if (t.m === 0) yearly(S, t);
  }
  function rolling12(S) { let s = 0; const h = S.history.slice(-12); for (const x of h) s += x.c1 != null ? x.c1 : x.rev; return s; } // после выхода в Россию — оборот Уфы (цель первого акта)
  function currentTaxRate(S) {
    const cfg = C();
    const base = S.macro.regime === 'osno' ? cfg.OSNO_VAT : cfg.TAX_USN;
    return clamp(base + S.macro.taxAdd + modAdd(S, 'tax'), 0, 0.3);
  }

  function yearly(S, t) {
    const cfg = C();
    const infl = clamp(S.macro.inflation + S.macro.inflAdd, 0, 0.3);
    S.macro.priceLevel *= 1 + infl;
    S.market.seller *= 1 + infl + 0.01;
    S.market.baker *= 1 + infl + 0.01;
    for (const st of S.stores) { // индексация всех договоров (годовые платят по новой ставке при продлении) + пересмотр к доле оборота
      const old = st.rentM2; st.rentM2 = rentReview(S, st, infl * 0.85);
      if (st.rentM2 > old * (1 + infl * 0.85) * 1.03) log(S, `Арендодатель пересмотрел ставку: ${st.address} — ${BK.fmtMoney(old)} → ${BK.fmtMoney(st.rentM2)} за м² (оборот точки вырос).`, 'warn');
    }
    for (const p of S.productions) p.rentM2 = Math.round(p.rentM2 * (1 + infl * 0.85));
    if (S.corp && BK.Corp) BK.Corp.yearly(S, infl, rentReview); // индексация аренды в городах на автопилоте
    log(S, `Новый ${t.y} год. Инфляция прошлого года ${(infl * 100).toFixed(1).replace('.', ',')}%: цены, аренда и рыночные зарплаты проиндексированы.`, 'info');
    // налоговый режим
    const prevRegime = S.macro.regime;
    S.macro.regime = S.yearRev > cfg.USN_LIMIT ? 'osno' : 'usn';
    if (S.macro.regime !== prevRegime) {
      if (S.macro.regime === 'osno') toast(S, 'Переход на ОСНО', `Выручка за год превысила ${BK.fmtMoney(cfg.USN_LIMIT)} — сеть теряет право на УСН (упрощёнку, налог с выручки). Теперь общая система: НДС и налог на прибыль.`, 'warn');
      log(S, S.macro.regime === 'osno' ? 'Сеть переведена на общую систему налогообложения.' : 'Сеть вернулась на УСН.', 'info');
    }
    S.notify.push({ type: 'year', y: t.y - 1, rev: S.yearRev });
    S.yearRev = 0;
    S.macro.inflation = clamp(cfg.INFLATION_BASE + gauss(S) * (cfg.INFLATION_SD != null ? cfg.INFLATION_SD : 0.015), 0.02, 0.15);
    S.macro.inflAdd = 0;
    // шеф-пекарь
    if (S.stores.length > 0) proposeChef(S);
  }

  function proposeChef(S) {
    const cfg = C();
    const inMenu = new Set(S.menu.map((m) => m.id));
    const pool = BK.PRODUCTS.filter((p) => !inMenu.has(p.id));
    const out = [];
    while (out.length < cfg.CHEF_OFFER && pool.length) {
      const p = wpick(S, pool, (x) => 0.5 + (S.trends[x.cat] || 50) / 100);
      out.push(p.id); pool.splice(pool.indexOf(p), 1);
    }
    S.chef.pending = out;
    S.chef.lastYear = dateOf(S.day).y;
    log(S, 'Шеф-пекарь подготовил 5 новинок на выбор.', 'info');
  }

  /* ---------------- события ---------------- */
  function eventEligible(S, e, t) {
    if (e.followUp) return false; // последствия приходят только из очереди S.ev.queue
    const openStores = S.stores.filter((s) => s.status !== 'opening');
    if ((e.minStores || 1) > openStores.length + (S.corp && BK.Corp ? BK.Corp.otherStores(S) : 0)) return false; // порог «от N точек» — по всей сети
    if ((e.minYear || 0) > S.day / 365) return false;
    if (e.once && S.ev.once[e.id]) return false;
    const last = S.ev.last[e.id];
    if (last != null && S.day - last < (e.cooldown || 365)) return false;
    const months = BK.EVENT_MONTHS[e.id];
    if (months && months.indexOf(t.m) < 0) return false;
    if (e.scope === 'production' && !S.productions.some((p) => p.status === 'open')) return false;
    if (e.scope === 'store' && !openStores.length) return false;
    if (e.agg != null && (aggConnected(S) > 0) !== e.agg) return false; // события про агрегаторы: agg:true — только если есть подключённые точки, false — если нет
    return true;
  }
  function fireRandomEvent(S, t) {
    const cfg = C();
    S.ev.next = S.day + Math.round(ri(S, cfg.EVENT_MIN_DAYS, cfg.EVENT_MAX_DAYS) * diffK(S, 'evGap'));
    const kind = rnd(S) < cfg.EVENT_POS_SHARE + diffK(S, 'posAdd') ? 'pos' : 'neg';
    let pool = BK.EVENTS.filter((e) => !e.crisis && e.kind === kind && eventEligible(S, e, t));
    if (!pool.length) pool = BK.EVENTS.filter((e) => !e.crisis && eventEligible(S, e, t));
    if (!pool.length) return;
    const e = wpick(S, pool, (x) => x.weight || 1);
    startEvent(S, e);
  }
  // Отложенные события (цепочки): эффект {t:'schedule'} кладёт {id, day, tg} в S.ev.queue
  function fireQueuedEvent(S) {
    const q = S.ev.queue;
    if (!q || !q.length) return false;
    const i = q.findIndex((x) => x.day <= S.day);
    if (i < 0) return false;
    const it = q.splice(i, 1)[0];
    const e = byId(BK.EVENTS, it.id);
    if (!e || !S.stores.some((s) => s.status !== 'opening')) return false;
    let tg = null;
    if (it.tg && it.tg.scope === e.scope) { // та же точка / цех / район, если они ещё существуют
      const r = rebuildTarget(S, it.tg);
      const ok = r.scope === 'global' || (r.scope === 'store' && r.store && r.store.status !== 'opening') || (r.scope === 'production' && r.prod && r.prod.status === 'open') || (r.scope === 'district' && r.district);
      if (ok) tg = r;
    }
    if (!tg && e.scope === 'production' && !S.productions.some((p) => p.status === 'open')) return false;
    startEvent(S, e, tg);
    S.ev.next = Math.max(S.ev.next, S.day + 7); // не сваливать случайное событие в тот же день
    return true;
  }
  function fireCrisis(S) {
    const cfg = C();
    S.ev.nextCrisis = S.day + Math.round(30 * diffK(S, 'crisisGap') * ri(S, cfg.CRISIS_MIN_MONTHS, cfg.CRISIS_MAX_MONTHS));
    S.ev.next = Math.max(S.ev.next, S.day + 20);
    if (!S.stores.some((s) => s.status !== 'opening')) return;
    const pool = BK.EVENTS.filter((e) => e.crisis && e.id !== S.ev.lastCrisis);
    const e = pick(S, pool);
    S.ev.lastCrisis = e.id;
    S.ev.creditSqueezeUntil = S.day + (cfg.CRISIS_CREDIT_DAYS || 0); // банки ужесточают кредитование
    startEvent(S, e);
  }
  function resolveTarget(S, e) {
    const open = S.stores.filter((s) => s.status !== 'opening');
    if (e.scope === 'store') { const st = pick(S, open); return { scope: 'store', target: st.id, store: st }; }
    if (e.scope === 'district') {
      const ds = [...new Set(open.map((s) => s.district))];
      const did = ds.length ? pick(S, ds) : pick(S, BK.DISTRICTS).id;
      return { scope: 'district', target: did, district: byId(BK.DISTRICTS, did) };
    }
    if (e.scope === 'production') { const p = pick(S, S.productions.filter((x) => x.status === 'open')); return { scope: 'production', target: p.id, prod: p }; }
    return { scope: 'global', target: null };
  }
  function fillText(s, tg) {
    return String(s || '').replace(/\{store\}/g, tg.store ? tg.store.address : 'точка').replace(/\{district\}/g, tg.district ? tg.district.name : 'город').replace(/\{prod\}/g, tg.prod ? tg.prod.address : 'цех');
  }
  function startEvent(S, e, tgForced) {
    const tg = tgForced || resolveTarget(S, e);
    S.ev.last[e.id] = S.day; if (e.once) S.ev.once[e.id] = true;
    S.stats.eventsSeen++;
    const inst = { id: e.id, kind: e.kind, crisis: !!e.crisis, title: e.title, text: fillText(e.text, tg), tg: { scope: tg.scope, target: tg.target }, day: S.day, effectsText: [] };
    inst.effectsText = applyEffects(S, e.effects || [], tg);
    S.ev.recent.unshift({ day: S.day, id: e.id, kind: e.kind, title: e.title });
    if (S.ev.recent.length > 60) S.ev.recent.length = 60;
    if (e.choices && e.choices.length) {
      inst.choices = e.choices.map((c) => ({ label: c.label, desc: c.desc, cost: costOf(S, c.cost, tg) }));
      S.ev.pending = inst;
    } else {
      log(S, `${e.kind === 'pos' ? 'Событие' : 'Событие'}: ${e.title}. ${inst.text}`, e.kind === 'pos' ? 'good' : 'bad');
      if (e.crisis) S.ev.pending = inst; // кризис без выбора — всё равно модальное окно
      else S.notify.push({ type: 'event', ev: inst });
    }
  }
  function storesInScope(S, tg) {
    const open = S.stores.filter((s) => s.status !== 'opening');
    if (tg.scope === 'store') return open.filter((s) => s.id === tg.target);
    if (tg.scope === 'district') return open.filter((s) => s.district === tg.target);
    return open;
  }
  function costOf(S, c, tg) {
    const k = diffK(S, 'cost');
    return k === 1 ? costOf0(S, c, tg) : Math.round(costOf0(S, c, tg) * k);
  }
  function costOf0(S, c, tg) {
    if (!c) return 0;
    if (typeof c === 'number') return Math.round(c * S.macro.priceLevel);
    if (c.perStore) return Math.round(c.perStore * S.macro.priceLevel * Math.max(1, storesInScope(S, tg).length));
    if (c.revPct) return Math.round(c.revPct * Math.max(S.lastMonthRev, 1000000));
    return 0;
  }
  function resolveEvent(S, idx) {
    const inst = S.ev.pending; if (!inst) return;
    const e = byId(BK.EVENTS, inst.id);
    const tg = rebuildTarget(S, inst.tg);
    if (inst.choices && e && e.choices) {
      const ch = e.choices[idx] || e.choices[e.choices.length - 1];
      const cost = inst.choices[idx] ? inst.choices[idx].cost : 0;
      if (cost > 0) spend(S, cost, 'other');
      const txt = applyEffects(S, ch.effects || [], tg);
      log(S, `${inst.title}: выбрано «${ch.label}»${cost ? ` (−${BK.fmtMoney(cost)})` : ''}.${txt.length ? ' ' + txt.join('; ') : ''}`, inst.kind === 'pos' ? 'good' : 'warn');
    } else log(S, `${inst.title}. ${inst.text}`, inst.kind === 'pos' ? 'good' : 'bad');
    S.ev.pending = null;
  }
  function rebuildTarget(S, t) {
    const out = { scope: t.scope, target: t.target };
    if (t.scope === 'store') out.store = byId(S.stores, t.target);
    if (t.scope === 'district') out.district = byId(BK.DISTRICTS, t.target);
    if (t.scope === 'production') out.prod = byId(S.productions, t.target);
    if (t.scope === 'store' && !out.store) out.scope = 'none';
    return out;
  }
  const pct = (m) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;
  // сила негативных эффектов по уровню сложности: отклонение «в плохую сторону» × sev (хорошие эффекты не трогаем)
  function diffEffects(S, effects) {
    const k = diffK(S, 'sev');
    if (k === 1 || !effects) return effects;
    const lo = (m) => clamp(1 - (1 - m) * k, 0.05, 1), hi = (m) => 1 + (m - 1) * k;
    return effects.map((f) => {
      const g = Object.assign({}, f);
      switch (f.t) {
        case 'traffic': case 'competitor': case 'check': case 'conv': case 'capacity': if (f.m < 1) g.m = +lo(f.m).toFixed(3); break;
        case 'foodcost': case 'delivery': case 'rent': case 'salary': if (f.m > 1) g.m = +hi(f.m).toFixed(3); break;
        case 'close': g.d = Math.max(1, Math.round(f.d * k)); break;
        case 'cash': for (const key of ['v', 'perStore', 'revPct']) if (f[key] != null && f[key] < 0) g[key] = f[key] * k; break;
        case 'staffQuit': g.n = Math.max(1, Math.round((f.n || 1) * k)); break;
        case 'tax': case 'keyRate': if (f.add > 0) g.add = f.add * k; break;
        case 'loyalty': if (f.add < 0) g.add = Math.round(f.add * k); break;
        default: break;
      }
      return g;
    });
  }
  function applyEffects(S, effects, tg) {
    effects = diffEffects(S, effects);
    const out = [];
    const cfg = C();
    const addMod = (t, m, d, scopeOverride) => S.mods.push({ t, m, until: S.day + (d || 30), scope: scopeOverride || tg.scope, target: tg.target });
    const scopeName = tg.scope === 'store' ? 'точка' : tg.scope === 'district' ? 'район' : tg.scope === 'production' ? 'цех' : 'вся сеть';
    for (const f of effects) {
      switch (f.t) {
        case 'traffic': addMod('traffic', f.m, f.d); out.push(`трафик ${pct(f.m)} на ${f.d} дн. (${scopeName})`); break;
        case 'competitor': addMod('competitor', f.m, f.d, tg.scope === 'global' ? 'global' : undefined); out.push(`конкурент: гостей ${pct(f.m)} на ${f.d} дн.`); break;
        case 'check': addMod('check', f.m, f.d); out.push(`средний чек ${pct(f.m)} на ${f.d} дн.`); break;
        case 'conv': addMod('conv', f.m, f.d); out.push(`конверсия ${pct(f.m)} на ${f.d} дн.`); break;
        case 'foodcost': S.mods.push({ t: 'foodcost', m: f.m, until: S.day + (f.d || 60), scope: tg.scope === 'production' ? 'production' : 'global', target: tg.target }); out.push(`себестоимость ${pct(f.m)} на ${f.d} дн.`); break;
        case 'delivery': S.mods.push({ t: 'delivery', m: f.m, until: S.day + (f.d || 30), scope: tg.scope === 'production' ? 'global' : tg.scope, target: tg.target }); out.push(`доставка ${pct(f.m)} на ${f.d} дн.`); break;
        case 'capacity': S.mods.push({ t: 'capacity', m: f.m, until: S.day + (f.d || 14), scope: tg.scope === 'production' ? 'production' : 'global', target: tg.target }); out.push(`мощность цеха ${pct(f.m)} на ${f.d} дн.`); break;
        case 'close': for (const st of storesInScope(S, tg)) st.closedUntil = Math.max(st.closedUntil || 0, S.day + f.d); out.push(`закрытие на ${f.d} дн.`); break;
        case 'rent': {
          const list = tg.scope === 'global' ? S.stores : storesInScope(S, tg);
          for (const st of list) st.rentM2 = Math.round(st.rentM2 * f.m);
          if (tg.scope === 'global') for (const p of S.productions) p.rentM2 = Math.round(p.rentM2 * f.m);
          out.push(`аренда ${pct(f.m)} навсегда`); break;
        }
        case 'salary': S.market.seller *= f.m; S.market.baker *= f.m; out.push(`рыночные зарплаты ${pct(f.m)} — персонал ждёт повышения`); break;
        case 'tax': if (f.d) S.mods.push({ t: 'tax', add: f.add, until: S.day + f.d, scope: 'global' }); else S.macro.taxAdd += f.add; out.push(`налог ${f.add > 0 ? '+' : '−'}${(Math.abs(f.add) * 100).toFixed(1).replace('.', ',')} п.п.${f.d ? ` на ${f.d} дн.` : ' навсегда'}`); break;
        case 'keyRate': S.macro.keyRate = clamp(S.macro.keyRate + f.add, 0.05, 0.25); out.push(`ключевая ставка ${f.add > 0 ? '+' : '−'}${(Math.abs(f.add) * 100).toFixed(1).replace('.', ',')} п.п.`); break;
        case 'inflation': S.macro.inflAdd += f.add; out.push(`инфляция ${f.add > 0 ? '+' : '−'}${(Math.abs(f.add) * 100).toFixed(1).replace('.', ',')} п.п.`); break;
        case 'cash': {
          let v = 0;
          if (f.v != null) v = f.v * S.macro.priceLevel;
          else if (f.perStore != null) v = f.perStore * S.macro.priceLevel * Math.max(1, storesInScope(S, tg).length);
          else if (f.revPct != null) v = f.revPct * Math.max(S.lastMonthRev, 1000000);
          v = Math.round(v);
          if (v < 0) spend(S, -v, 'other'); else { S.cash += v; S.month.income += v; }
          out.push(`${v >= 0 ? '+' : '−'}${BK.fmtMoney(Math.abs(v))}`); break;
        }
        case 'staffQuit': {
          let n = f.n || 1; let done = 0;
          const pool = tg.scope === 'store' ? storesInScope(S, tg) : S.stores.filter((s) => s.staff.length > 1);
          while (n-- > 0 && pool.length) {
            const st = tg.scope === 'store' ? pool[0] : pick(S, pool);
            if (!st || !st.staff.length) break;
            const e = st.staff.splice(ri(S, 0, st.staff.length - 1), 1)[0]; done++; S.stats.quits++;
            log(S, `${e.name} ${BK.byGender(e.name, 'уволился', 'уволилась')} (${st.address}).`, 'bad');
          }
          if (done) out.push(`уволилось сотрудников: ${done}`); break;
        }
        case 'staffTrain': {
          let n = f.n || 1; const all = []; for (const st of S.stores) for (const e of st.staff) if (e.lvl < cfg.MAX_LVL) all.push(e);
          let done = 0; while (n-- > 0 && all.length) { const e = all.splice(ri(S, 0, all.length - 1), 1)[0]; e.lvl++; e.lvlDay = S.day; done++; }
          if (done) out.push(`повысили уровень: ${done} чел.`); break;
        }
        case 'trend': S.trends[f.cat] = clamp((S.trends[f.cat] || 50) + f.add, 5, 98); out.push(`тренд «${BK.CATEGORIES[f.cat] ? BK.CATEGORIES[f.cat].name : f.cat}» ${f.add > 0 ? '+' : '−'}${Math.abs(f.add)}`); break;
        case 'loyalty': S.loyaltyMod = clamp(S.loyaltyMod + f.add, -30, 30); out.push(`настроение команды ${f.add > 0 ? '+' : '−'}${Math.abs(f.add)}`); break;
        case 'schedule': { // отложенное последствие: скрыто от игрока, намёк — в тексте выбора
          if (f.p != null && rnd(S) >= f.p) break;
          if (!S.ev.queue) S.ev.queue = []; // старые сохранения
          if (S.ev.queue.some((x) => x.id === f.id)) break;
          const a = f.after || [90, 180];
          S.ev.queue.push({ id: f.id, day: S.day + ri(S, a[0], a[1]), tg: { scope: tg.scope, target: tg.target } });
          break;
        }
        case 'agg': { // агрегаторы доставки: подключить всю сеть (подключение за счёт агрегатора) или отключить
          const A = aggState(S); A.on = !!f.on;
          for (const st of S.stores) { if (f.on && !st.agg) { st.aggPaid = true; st.aggDay = Math.max(S.day, st.status === 'opening' ? st.openDay : S.day); } st.agg = !!f.on; }
          out.push(f.on ? `все точки подключены к доставке (${S.stores.length})` : 'сеть отключена от агрегаторов доставки'); break;
        }
        case 'aggComm': S.mods.push({ t: 'aggComm', add: f.add, until: S.day + (f.d || 120), scope: 'global' }); out.push(`комиссия агрегатора ${f.add > 0 ? '+' : '−'}${Math.round(Math.abs(f.add) * 100)} п.п. на ${f.d || 120} дн.`); break;
        case 'aggOrders': S.mods.push({ t: 'aggOrders', m: f.m, until: S.day + (f.d || 90), scope: 'global' }); out.push(`заказы доставки ${pct(f.m)} на ${f.d || 90} дн.`); break;
        case 'offer': { // особое помещение на рынке (со скидкой к аренде)
          const o = makeStoreOffer(S, { district: f.district || (tg.scope === 'district' ? tg.target : null), lm: f.lm, size: f.size });
          if (f.rent) o.rentM2 = round(o.rentM2 * f.rent, 10);
          o.expires = S.day + (f.days || 60); o.special = true;
          S.offers.push(o);
          const dn = byId(BK.DISTRICTS, o.district);
          out.push(`помещение на рынке: ${dn ? dn.name + ', ' : ''}${o.address}${f.rent ? `, аренда ${pct(f.rent)}` : ''}`); break;
        }
        default: break;
      }
    }
    return out;
  }

  /* ---------------- действия игрока ---------------- */
  function storeOpenCost(S, o) {
    const cfg = C();
    const sz = cfg.SIZES[o.size];
    const fit = o.area * cfg.FITOUT_PER_M2 * S.macro.priceLevel;
    const eq = cfg.STORE_EQUIP[o.size] * S.macro.priceLevel;
    const hire = recStaff(S, o).target * hireCost(S, 1);
    const rent = o.payMode === 'year' ? o.area * o.rentM2 * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT) : o.area * o.rentM2; // год вперёд или депозит
    return { fit, eq, hire, rent, total: fit + eq + hire + rent };
  }
  function prodOpenCost(S, o) {
    const cfg = C();
    const fit = o.area * cfg.PROD_FITOUT_PER_M2 * S.macro.priceLevel;
    const eq = cfg.PROD_BASE_EQUIP * S.macro.priceLevel;
    const dep = o.area * o.rentM2;
    return { fit, eq, dep, total: fit + eq + dep };
  }
  function chooseProduction(S, offerId) {
    const o = byId(S.prodOffers, offerId); if (!o) return { ok: false, msg: 'Предложение не найдено' };
    const cfg = C();
    const need = S.productions.length === 0 ? 1 : S.productions.length === 1 ? prod2Stores() : cfg.THIRD_PROD_STORES;
    if (S.productions.length && S.stores.length < need) return { ok: false, msg: `Нужно ${need} точек` };
    const c = prodOpenCost(S, o);
    if (S.cash < c.total) return { ok: false, msg: 'Не хватает денег' };
    spend(S, c.total, 'capex');
    const d = byId(BK.DISTRICTS, o.district);
    const p = { id: nextId(S, 'f'), district: o.district, x: o.x, y: o.y, address: o.address, area: o.area, rentM2: o.rentM2, status: 'opening', openDay: S.day + cfg.PROD_OPEN_DAYS, equip: {}, staff: cfg.PROD_STAFF_BASE + 1, need: cfg.PROD_STAFF_BASE + 1, morale: 65, load: 0, capex: c.total, name: `Цех №${S.productions.length + 1}` };
    if (S.phase !== 'setup_prod') p.status = 'opening';
    S.productions.push(p);
    S.prodOffers = [];
    log(S, `Арендовано помещение под производство: ${o.address} (${d.name}), ${o.area} м².`, 'good');
    if (S.phase === 'setup_prod') { S.phase = 'setup_store'; }
    return { ok: true };
  }
  function rentStore(S, offerId) {
    const cfg = C();
    const o = byId(S.offers, offerId); if (!o) return { ok: false, msg: 'Предложение не найдено' };
    const c = storeOpenCost(S, o);
    if (S.cash < c.total) return { ok: false, msg: `Не хватает ${BK.fmtMoney(c.total - S.cash)}` };
    spend(S, c.fit + c.eq, 'capex'); spend(S, c.hire, 'hire');
    if (o.payMode === 'year') spend(S, c.rent, 'rent'); else spend(S, c.rent, 'capex');
    const sz = cfg.SIZES[o.size];
    const st = {
      id: nextId(S, 's'), address: o.address, district: o.district, x: o.x, y: o.y, area: o.area, size: o.size,
      rentM2: o.rentM2, payMode: o.payMode, rentPaidUntil: o.payMode === 'year' ? S.day + cfg.OPEN_DAYS + 365 : 0,
      traffic: o.traffic, solv: o.solv, landmarks: o.landmarks, comp: o.comp,
      status: 'opening', openDay: S.day + cfg.OPEN_DAYS, repair: 0, repairUntil: 0, closedUntil: 0,
      staff: [], incoming: [], staffTarget: sz.staffBase, capex: c.total, m: { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 }, last: null, hist: [],
      num: (S.flags.storeNum = (S.flags.storeNum || 0) + 1),
    };
    if (S.agg && S.agg.on) { const c = aggConnectCost(S, st); if (S.cash >= c) { spend(S, c, 'agg'); st.aggPaid = true; st.agg = true; st.aggDay = st.openDay; } } // сеть подключена к агрегаторам — новая точка тоже (с открытия)
    st.staffTarget = recStaff(S, st).target;
    for (let i = 0; i < st.staffTarget; i++) { const e = makePerson(S, candLevel(S)); st.incoming.push({ p: e, day: st.openDay }); S.stats.hires++; }
    S.stores.push(st);
    S.offers = S.offers.filter((x) => x.id !== offerId);
    if (S.stores.length === 1) S.nextOfferDay = S.day + 3;
    log(S, `Арендована точка: ${o.address} (${byId(BK.DISTRICTS, o.district).name}), ${o.area} м². Открытие через ${cfg.OPEN_DAYS} дн.`, 'good');
    if (S.phase === 'setup_store') { S.phase = 'play'; S.ev.next = 45; }
    return { ok: true, store: st };
  }
  function refreshOffers(S) {
    const fee = Math.round(C().REALTOR_FEE * S.macro.priceLevel);
    if (S.cash < fee) return { ok: false, msg: 'Не хватает денег' };
    spend(S, fee, 'other');
    S.offers = S.offers.filter((o) => o.special); genStoreOffers(S, true);
    return { ok: true };
  }
  function repairCost(S, st) { const r = C().REPAIRS[st.repair + 1]; return r ? Math.round(r.perM2 * st.area * S.macro.priceLevel) : 0; }
  function startRepair(S, storeId) {
    const st = byId(S.stores, storeId); if (!st || st.status !== 'open') return { ok: false, msg: 'Точка недоступна' };
    const r = C().REPAIRS[st.repair + 1]; if (!r) return { ok: false, msg: 'Максимальный ремонт' };
    const c = repairCost(S, st); if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    spend(S, c, 'capex'); st.status = 'repair'; st.repairUntil = S.day + r.days; st.capex += c;
    log(S, `Начат ремонт «${r.name}»: ${st.address} (${r.days} дн.)`, 'info');
    return { ok: true };
  }
  function train(S, storeId, empId, auto) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false };
    const e = byId(st.staff, empId); if (!e || e.lvl >= C().MAX_LVL) return { ok: false, msg: 'Максимальный уровень' };
    const c = trainCost(S, e.lvl + 1); if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    if (!auto) {
      if (ownerTrainLeft(S) <= 0) return { ok: false, msg: `Без отдела обучения при сети больше ${C().TRAIN_REQUIRED_STORES} точек вы успеваете обучить только ${C().OWNER_TRAINS_PER_WEEK} человек в неделю` };
      if (ownerTrainLeft(S) !== Infinity) S.office.ownerTrains++;
    }
    spend(S, c, 'train'); e.lvl++; e.lvlDay = S.day; e.mood = clamp(e.mood + 6, 0, 100);
    return { ok: true };
  }
  function trainAll(S, storeId) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false };
    let n = 0;
    for (const e of st.staff.slice().sort((a, b) => a.lvl - b.lvl)) { if (e.lvl < C().MAX_LVL && train(S, storeId, e.id).ok) n++; }
    return { ok: n > 0, n };
  }
  function hire(S, storeId, candId) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false, msg: 'Точка не найдена' };
    if (st.staff.length + st.incoming.length >= C().SIZES[st.size].staffMax) return { ok: false, msg: 'Штат заполнен' };
    let e;
    if (candId) { e = byId(S.candidates, candId); if (!e) return { ok: false, msg: 'Кандидат уже ушёл' }; }
    else e = makePerson(S, candLevel(S));
    const c = hireCost(S, e.lvl); if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    if (ownerHireLeft(S) <= 0) return { ok: false, msg: `Без HR-отдела при сети больше ${C().HR_REQUIRED_STORES} точек вы успеваете нанять только ${C().OWNER_HIRES_PER_WEEK} человек в неделю` };
    if (ownerHireLeft(S) !== Infinity) S.office.ownerHires++;
    spend(S, c, 'hire');
    if (candId) S.candidates = S.candidates.filter((x) => x.id !== candId);
    st.incoming.push({ p: e, day: S.day + hireDays(S) }); S.stats.hires++;
    if (st.staff.length + st.incoming.length > st.staffTarget) st.staffTarget = st.staff.length + st.incoming.length;
    return { ok: true, p: e };
  }
  function fire(S, storeId, empId) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false };
    const e = byId(st.staff, empId); if (!e) return { ok: false };
    spend(S, salaryOf(S, e.lvl), 'payroll');
    st.staff = st.staff.filter((x) => x.id !== empId);
    if (st.staffTarget > st.staff.length + st.incoming.length) st.staffTarget = Math.max(C().SIZES[st.size].staffMin, st.staff.length + st.incoming.length);
    for (const o of st.staff) o.mood = clamp(o.mood - 3, 0, 100);
    log(S, `${e.name} ${BK.byGender(e.name, 'уволен', 'уволена')} с выплатой компенсации.`, 'warn');
    return { ok: true };
  }
  function setStaffTarget(S, storeId, n) {
    const st = byId(S.stores, storeId); if (!st) return;
    const sz = C().SIZES[st.size]; st.staffTarget = clamp(n, sz.staffMin, sz.staffMax);
  }
  function closeStore(S, storeId) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false };
    const refund = Math.round(st.capex * C().CLOSE_REFUND);
    S.cash += refund; S.month.income += refund;
    S.stores = S.stores.filter((x) => x.id !== storeId);
    log(S, `Точка закрыта: ${st.address}. Продано оборудование на ${BK.fmtMoney(refund)}.`, 'warn');
    return { ok: true, refund };
  }
  function buyEquipment(S, prodId, eqId) {
    const p = byId(S.productions, prodId); const e = byId(BK.EQUIPMENT, eqId);
    if (!p || !e) return { ok: false };
    if ((p.equip[eqId] || 0) >= e.max) return { ok: false, msg: 'Больше не поставить' };
    const c = Math.round(e.price * S.macro.priceLevel * modMult(S, 'equipPrice'));
    if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    spend(S, c, 'capex'); p.equip[eqId] = (p.equip[eqId] || 0) + 1; p.capex += c;
    log(S, `Куплено оборудование: ${e.name} (${p.name})`, 'good');
    return { ok: true };
  }
  function setPrice(S, prodId, pm) { const it = S.menu.find((m) => m.id === prodId); if (it) it.pm = clamp(Math.round(pm * 100) / 100, C().PRICE_MIN, C().PRICE_MAX); }
  function setAllPrices(S, delta) { for (const it of S.menu) it.pm = clamp(Math.round((it.pm + delta) * 100) / 100, C().PRICE_MIN, C().PRICE_MAX); }
  function chefConfirm(S, adds, removes) {
    const cfg = C();
    if (!S.chef.pending) return { ok: false };
    adds = (adds || []).filter((id) => S.chef.pending.includes(id)).slice(0, cfg.CHEF_PICK);
    removes = (removes || []).slice(0, cfg.CHEF_REMOVE);
    for (const id of adds) { const p = byId(BK.PRODUCTS, id); if (p && !eqUnlocked(S, p.req)) return { ok: false, msg: `Для «${p.name}» нужно оборудование` }; }
    const after = S.menu.length - removes.length + adds.length;
    if (after < cfg.MENU_MIN) return { ok: false, msg: `В меню должно быть не меньше ${cfg.MENU_MIN} позиций` };
    if (after > cfg.MENU_MAX) return { ok: false, msg: `Максимум ${cfg.MENU_MAX} позиций` };
    S.menu = S.menu.filter((m) => !removes.includes(m.id));
    for (const id of adds) S.menu.push({ id, pm: 1 });
    S.chef.pending = null;
    const names = (ids) => ids.map((id) => byId(BK.PRODUCTS, id).name).join(', ');
    log(S, `Меню обновлено.${adds.length ? ' Добавлено: ' + names(adds) + '.' : ''}${removes.length ? ' Выведено: ' + names(removes) + '.' : ''}`, 'good');
    return { ok: true };
  }
  function setAlloc(S, a) {
    const r = clamp(a.reserve, 0, 1), b = clamp(a.bonus, 0, 1), m = clamp(a.marketing, 0, 1);
    const tot = r + b + m; const k = tot > 1 ? 1 / tot : 1;
    S.alloc = { reserve: r * k, bonus: b * k, marketing: m * k };
  }
  function reserveMove(S, amount) { // + в резерв, − из резерва
    if (amount > 0) { amount = Math.min(amount, Math.max(0, S.cash)); S.cash -= amount; S.reserve += amount; }
    else { amount = Math.min(-amount, S.reserve); S.reserve -= amount; S.cash += amount; }
  }
  // инвестор в совете: лимит кредита больше (investors.js)
  function invBankK(S) { return (S.inv && BK.Inv && BK.Inv.perkOf(S, 'bank')) ? 1.25 : 1; }
  function loanLimit(S) {
    const h = S.history.slice(-3); const avg = h.length ? h.reduce((a, x) => a + x.rev, 0) / h.length : 0;
    let lim = Math.max(C().LOAN_MIN * S.macro.priceLevel, avg * C().LOAN_MAX_REV_MULT) * diffK(S, 'loanMult');
    if (S.ev && S.day < (S.ev.creditSqueezeUntil || 0)) lim *= C().CRISIS_LOAN_MULT != null ? C().CRISIS_LOAN_MULT : 1; // кризис: лимит урезан
    if (S.corp && S.corp.creditK) lim *= S.corp.creditK; // корпоративное событие e213: кредитная линия под экспансию
    return lim * invBankK(S);
  }
  function loanRate(S) { return S.macro.keyRate + C().LOAN_SPREAD + diffK(S, 'spreadAdd') + (S.corp && BK.HQ ? BK.HQ.rateAdd(S) : 0) + (S.coll && BK.Coll ? BK.Coll.rateAdd(S) : 0) - ((S.inv && BK.Inv && BK.Inv.perkOf(S, 'bank')) ? 0.01 : 0); } // инвестор с казначейством: −1 п. п. // штаб: казначейство, ковенанта банка; залог: надбавка после изъятия точки
  function takeLoan(S, amount) {
    const room = loanLimit(S) - S.loan; amount = Math.min(amount, room);
    if (amount <= 0) return { ok: false, msg: 'Банк больше не даёт: кредитный лимит исчерпан' };
    S.loan += amount; S.cash += amount; log(S, `Получен кредит ${BK.fmtMoney(amount)} под ${(loanRate(S) * 100).toFixed(1).replace('.', ',')}% годовых.`, 'warn');
    return { ok: true, amount };
  }
  function repayLoan(S, amount) {
    amount = Math.min(amount, S.loan, Math.max(0, S.cash)); if (amount <= 0) return { ok: false, msg: 'Нечем гасить: на счёте нет свободных денег' };
    S.loan -= amount; S.cash -= amount; log(S, `Погашено ${BK.fmtMoney(amount)} кредита.`, 'good');
    return { ok: true };
  }
  function setPay(S, kind, value) { S.pay[kind] = Math.round(clamp(value, S.market[kind] * 0.6, S.market[kind] * 2)); }
  function buyCulture(S) {
    const cfg = C(); const next = cfg.CULTURE[S.culture + 1]; if (!next) return { ok: false, msg: 'Культура уже на максимуме' };
    const c = Math.round(next.cost * S.macro.priceLevel); if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    spend(S, c, 'capex'); S.culture++; log(S, `Корпоративная культура: «${next.name}».`, 'good');
    return { ok: true };
  }
  function buyOffice(S, key) {
    const u = C().OFFICE_UPGRADES[key]; if (!u || S.office[key]) return { ok: false };
    const c = Math.round(u.cost * S.macro.priceLevel); if (S.cash < c) return { ok: false, msg: 'Не хватает денег' };
    spend(S, c, 'capex'); S.office[key] = true; log(S, `Офис: ${u.name}.`, 'good');
    if (key === 'hr') refreshCandidates(S, true);
    return { ok: true };
  }

  BK.Engine = {
    newGame, diffK, loanRate, tick, dateOf, fmtDate, MONTHS, MONTHS_G, menuStats, storeDemand, prodCapacity, prodFcMult, deliveryCost, nearestProd,
    storeOpenCost, prodOpenCost, chooseProduction, rentStore, refreshOffers, repairCost, startRepair, train, trainAll, trainCost, hire, hireCost, hireDays,
    fire, setStaffTarget, closeStore, buyEquipment, setPrice, setAllPrices, chefConfirm, setAlloc, reserveMove, loanLimit, takeLoan, repayLoan,
    setPay, buyCulture, buyOffice, resolveEvent, rolling12, currentTaxRate, salaryOf, vacancies, eqUnlocked, offersWanted, storeRentMonth, prodRentMonth,
    allStaff, bakersTotal, refreshCandidates, proposeChef, dist, byId, clamp, recStaff, hrCount, ownerHireLeft, trainersCount, ownerTrainLeft,
    holidaysOfYear, upcomingHolidays, holidayEffectText, holidayMult, kmPerUnit,
  };

  /* форматирование денег (общая функция) */
  BK.fmtMoney = function (v) {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace('.', ',') + '\u00a0млрд\u00a0₽';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + '\u00a0млн\u00a0₽';
    if (a >= 1e4) return s + Math.round(a / 1e3) + '\u00a0тыс\u00a0₽';
    return s + Math.round(a).toLocaleString('ru-RU') + '\u00a0₽';
  };
  // рейтинг точки и списания (отдельно от основного списка, чтобы не править его)
  Object.assign(BK.Engine, { wasteState, wasteFactors, ratingParts, ratingTarget, storeRating, ratingMult, networkRating, setBake, setEveDiscount, discFreeDay, discPenalty });

  /* ---------------- сеть-соперник «Хлебный двор» ----------------
     S.rival: { enabled, name, rng, agg, stores: [{ id, x, y, district, address, q, day, how }], hist (число точек по месяцам, 13 шт.),
                nextDay, ban: { район: до какого дня не лезет }, opened, closed, grabbed }
     Свой ГСЧ (S.rival.rng): соперник не сдвигает основной поток случайностей. Числа — RIVAL_* в config.js.
     Старые сохранения (без S.rival) получают enabled:false — соперника в начатой партии не было, её баланс не меняется. */
  function rivalState(S) {
    if (!S.rival) S.rival = { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 };
    return S.rival;
  }
  function withRivalRng(S, fn) { const keep = S.rng; S.rng = S.rival.rng; try { fn(); } finally { S.rival.rng = S.rng; S.rng = keep; } }
  function rivalInit(S, on) {
    const cfg = C();
    const R = S.rival = { enabled: !!on, name: cfg.RIVAL_NAME, rng: (S.seed ^ 0x2f6b1d) | 0, agg: 1, stores: [], hist: [], nextDay: cfg.RIVAL_FIRST_DAY, ban: {}, opened: 0, closed: 0, grabbed: 0 };
    if (!R.enabled) return R;
    withRivalRng(S, () => {
      R.agg = R.agg0 = rr(S, cfg.RIVAL_AGG[0], cfg.RIVAL_AGG[1]);
      const n = ri(S, cfg.RIVAL_START[0], cfg.RIVAL_START[1]);
      for (let i = 0; i < n; i++) rivalPlace(S, 'random');
    });
    return R;
  }
  function offerPotential(S, o) { // грубая месячная отдача места: чеки × платёжеспособность − аренда (для выбора «лучшего» помещения)
    const cfg = C(), sz = cfg.SIZES[o.size];
    const checks = Math.min(sz.staffMax * cfg.CHECKS_PER_STAFF_BASE, o.traffic * sz.capture * o.comp * cfg.BASE_CONV);
    return checks * o.solv * S.macro.priceLevel * 30.4 * 0.3 - o.area * o.rentM2;
  }
  function rivalPlace(S, how) { // how: 'grab' — забрать помещение с рынка, 'near' — рядом с сильной точкой игрока, 'random'
    const cfg = C(), R = S.rival;
    let p = null, d = null, address = null, grabbed = null;
    const tooClose = (q) => R.stores.some((o) => dist(o, q) < 12) || S.stores.some((o) => dist(o, q) < 8);
    if (how === 'grab') {
      const pool = S.offers.filter((o) => !o.special);
      if (!pool.length) return null;
      grabbed = pool.reduce((b, o) => (offerPotential(S, o) > offerPotential(S, b) ? o : b));
      p = { x: grabbed.x, y: grabbed.y }; d = byId(BK.DISTRICTS, grabbed.district); address = grabbed.address;
    } else if (how === 'near') {
      const open = S.stores.filter((s) => s.status === 'open' && s.last && !(R.ban[s.district] > S.day));
      if (!open.length) return rivalPlace(S, 'random');
      open.sort((a, b) => b.last.rev - a.last.rev);
      const st = pick(S, open.slice(0, Math.max(1, Math.ceil(open.length / 3)))); // одна из сильнейших точек игрока
      for (let k = 0; k < 12 && !p; k++) {
        const a = rnd(S) * Math.PI * 2, r = rr(S, 0.35, 0.9) * cfg.RIVAL_RADIUS;
        const q = { x: st.x + Math.cos(a) * r, y: st.y + Math.sin(a) * r * 0.85 };
        if (!tooClose(q)) p = q;
      }
      if (!p) return null;
      d = byId(BK.DISTRICTS, st.district);
    } else {
      const ds = BK.DISTRICTS.filter((x) => !(R.ban[x.id] > S.day));
      d = wpick(S, ds.length ? ds : BK.DISTRICTS, (x) => districtWeight(S, x));
      for (let k = 0; k < 6 && !p; k++) { const q = freeSpot(S, d, 42); if (!tooClose(q)) p = q; }
      if (!p) return null;
    }
    if (!address) address = `${pick(S, d.streets)}, ${ri(S, 1, 120)}`;
    const q = +clamp(rr(S, cfg.RIVAL_Q[0], cfg.RIVAL_Q[1]) + Math.min(0.15, 0.01 * S.day / 365), 0.6, 1.3).toFixed(2);
    const rs = { id: nextId(S, 'r'), x: p.x, y: p.y, district: d.id, address, q, day: S.day, how };
    R.stores.push(rs); R.opened++;
    if (grabbed) { S.offers = S.offers.filter((o) => o !== grabbed); R.grabbed++; }
    return rs;
  }
  function rivalAnnounce(S, rs) {
    const R = S.rival, dn = (byId(BK.DISTRICTS, rs.district) || {}).name || '';
    if (rs.how === 'grab') {
      toast(S, `«${R.name}» занял помещение`, `${rs.address} (${dn}) — соперник успел раньше вас.`, 'warn');
      log(S, `«${R.name}» занял помещение на ${rs.address} (${dn}) — теперь там его пекарня.`, 'warn');
      return;
    }
    let near = null, bd = C().RIVAL_RADIUS;
    for (const st of S.stores) { const x = dist(st, rs); if (x < bd) { bd = x; near = st; } }
    if (near) {
      toast(S, `«${R.name}» открылся рядом с точкой №${near.num}`, `${rs.address}: часть гостей уйдёт к соседу. Высокий рейтинг точки — лучшая защита.`, 'warn', { storeId: near.id });
      log(S, `«${R.name}» открыл пекарню на ${rs.address} — рядом с вашей точкой №${near.num} (${near.address}).`, 'warn');
    } else log(S, `«${R.name}» открыл пекарню: ${rs.address} (${dn}). Всего у сети: ${R.stores.length}.`, 'info');
  }
  function rivalMult(S, st) { // доля гостей, которая остаётся у точки игрока рядом с соперником
    const R = S.rival; if (!R || !R.enabled || !R.stores.length) return 1;
    const cfg = C(), rad = cfg.RIVAL_RADIUS; let m = 1, k = null;
    for (const o of R.stores) {
      const dd = dist(o, st); if (dd >= rad) continue;
      if (k == null) k = clamp(1 + cfg.RIVAL_RATING_K * (cfg.RATING_START - storeRating(S, st)), 0.4, 1.6); // высокий рейтинг — теряем меньше
      m *= 1 - cfg.RIVAL_F * o.q * k * (1 - 0.4 * dd / rad);
    }
    return m;
  }
  function rivalNear(S, obj) { // для карточек точки и помещения: сколько точек соперника рядом и какая доля гостей уходит
    const R = S.rival; if (!R || !R.enabled) return { n: 0, loss: 0 };
    let n = 0; for (const o of R.stores) if (dist(o, obj) < C().RIVAL_RADIUS) n++;
    return { n, loss: n ? 1 - rivalMult(S, obj) : 0 };
  }
  function rivalDaily(S, t) {
    const R = S.rival; if (!R || !R.enabled) return;
    const cfg = C();
    withRivalRng(S, () => {
      if (S.day >= R.nextDay) {
        const mine = S.stores.filter((s) => s.status !== 'opening').length;
        const target = Math.min(cfg.RIVAL_MAX, R.agg * (cfg.RIVAL_BASE + cfg.RIVAL_PER_YEAR * S.day / 365 + cfg.RIVAL_PER_PLAYER * mine));
        const gap = target - R.stores.length;
        if (gap > 0 && rnd(S) < clamp(gap, 0.3, 1)) {
          const r = rnd(S);
          const canGrab = S.day >= cfg.RIVAL_GRAB_FROM_DAY && mine >= cfg.RIVAL_GRAB_MIN_STORES && S.offers.some((o) => !o.special);
          const how = r < cfg.RIVAL_GRAB_P && canGrab ? 'grab' : r < cfg.RIVAL_GRAB_P + cfg.RIVAL_NEAR_P && mine >= cfg.RIVAL_NEAR_MIN_STORES ? 'near' : 'random'; // молодую сеть игрока не душит
          const rs = rivalPlace(S, how);
          if (rs) rivalAnnounce(S, rs);
        }
        R.nextDay = S.day + ri(S, cfg.RIVAL_GAP_DAYS[0], cfg.RIVAL_GAP_DAYS[1]);
      }
      if (t.d === 1) rivalMonthly(S);
    });
  }
  function rivalMonthly(S) {
    const cfg = C(), R = S.rival;
    // слабеет: где игрок сильно доминирует (несколько точек с рейтингом ≥ 4★ рядом), точка соперника закрывается
    for (let i = R.stores.length - 1; i >= 0; i--) {
      const o = R.stores[i]; if (S.day - o.day < 180) continue;
      let strong = 0;
      for (const st of S.stores) if (st.status !== 'opening' && dist(st, o) < cfg.RIVAL_DOM_R && storeRating(S, st) >= cfg.RIVAL_DOM_MIN_RATING) strong++;
      const p = cfg.RIVAL_DOM_P * Math.max(0, strong - 1) * clamp(1.3 - o.q, 0.1, 0.6) / 0.4;
      if (p > 0 && rnd(S) < p) {
        R.stores.splice(i, 1); R.closed++;
        R.ban[o.district] = S.day + cfg.RIVAL_BAN_DAYS; R.agg = Math.max(0.5, R.agg - cfg.RIVAL_AGG_HIT);
        const dn = (byId(BK.DISTRICTS, o.district) || {}).name || '';
        toast(S, `«${R.name}» закрыл точку`, `${o.address} (${dn}): не выдержал соседства с вашими пекарнями.`, 'good');
        log(S, `«${R.name}» закрыл пекарню на ${o.address} (${dn}) — не выдержал конкуренции с вашей сетью.`, 'good');
      }
    }
    R.hist.push(R.stores.length); if (R.hist.length > 13) R.hist.shift();
    if (R.agg0) R.agg = Math.min(R.agg0, R.agg + cfg.RIVAL_AGG_BACK); // агрессия медленно восстанавливается
    // переманивание сотрудников и ценовая война — события e141/e142 через очередь последствий
    const queued = (id) => (S.ev.queue || []).some((x) => x.id === id);
    const recent = (id, cd) => S.ev.last[id] != null && S.day - S.ev.last[id] < cd;
    const exposed = S.stores.filter((st) => st.status === 'open' && st.staff.length >= 2 && R.stores.some((o) => dist(o, st) < cfg.RIVAL_RADIUS));
    if (!exposed.length) return;
    if (!S.ev.queue) S.ev.queue = [];
    if (!queued('e142') && !recent('e142', cfg.RIVAL_POACH_CD) && rnd(S) < cfg.RIVAL_POACH_P) {
      const st = pick(S, exposed);
      S.ev.queue.push({ id: 'e142', day: S.day + ri(S, 1, 10), tg: { scope: 'store', target: st.id } });
    }
    if (R.stores.length >= cfg.RIVAL_WAR_MIN && !queued('e141') && !recent('e141', cfg.RIVAL_WAR_CD) && rnd(S) < cfg.RIVAL_WAR_P) {
      const cnt = {}; for (const st of exposed) cnt[st.district] = (cnt[st.district] || 0) + 1;
      const did = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; // район, где у вас больше всего точек рядом с соперником
      S.ev.queue.push({ id: 'e141', day: S.day + ri(S, 1, 10), tg: { scope: 'district', target: did } });
    }
  }
  function rivalSummary(S) { // для UI: null, если соперник выключен
    const R = S.rival; if (!R || !R.enabled) return null;
    const n = R.stores.length, y = R.hist.length ? R.hist[0] : n;
    return { name: R.name || C().RIVAL_NAME, n, delta: n - y, months: R.hist.length, opened: R.opened, closed: R.closed, grabbed: R.grabbed, stores: R.stores };
  }
  Object.assign(BK.Engine, { rivalState, rivalMult, rivalNear, rivalSummary });

  /* ---------------- время суток и доставка через агрегаторы (ROADMAP, этап 2) ----------------
     Время суток: у точки/помещения профиль гостей утро/обед/вечер (район + соседство, CFG.DAYPART_*), в состоянии ничего не хранится.
       Пик — очередь: пропускная способность команды ниже (storeDemand); доля вечера — сколько выпечки залёживается и как работает вечерняя скидка.
     Агрегаторы: S.agg = { on } — переключатель на сеть (новые точки подключаются сами), st.agg — точка подключена, st.aggDay — с какого дня,
       st.aggPaid — подключение оплачено. Старые сохранения: полей нет → всё выключено. Числа — AGG_* в config.js. ГСЧ не используется. */
  const dpCache = {};
  function daypartOf(o) {
    const key = o.district + '|' + (o.landmarks || []).join(',');
    if (dpCache[key] && dpCache[key].map === BK.DISTRICTS) return dpCache[key];
    const cfg = C(), d = byId(BK.DISTRICTS, o.district) || {};
    const base = cfg.DAYPART_ARCH[d.arch || cfg.DAYPART_UFA[d.id]] || [1 / 3, 1 / 3, 1 / 3];
    const lms = (o.landmarks || []).map((id) => cfg.DAYPART_LM[id]).filter(Boolean);
    const p = [0, 1, 2].map((i) => (lms.length ? 0.5 * base[i] + 0.5 * lms.reduce((a, l) => a + l[i], 0) / lms.length : base[i]));
    const s = p[0] + p[1] + p[2], m = p[0] / s, dd = p[1] / s, e = p[2] / s, mx = Math.max(m, dd, e);
    const W = cfg.AGG_DP_W, w0 = (W[0] + W[1] + W[2]) / 3;
    const r = {
      m, d: dd, e, peak: mx < cfg.DAYPART_PEAK ? 'flat' : mx === m ? 'm' : mx === dd ? 'd' : 'e',
      thrK: 1 - cfg.DAYPART_PEAK_K * Math.max(0, mx - cfg.DAYPART_PEAK_FREE),
      agg: (W[0] * m + W[1] * dd + W[2] * e) / w0,
      wasteK: clamp(1 + cfg.DAYPART_WASTE_K * (1 - 3 * e), 0.6, 1.5), eveK: clamp(3 * e, 0.4, 1.8),
      map: BK.DISTRICTS,
    };
    dpCache[key] = r;
    return r;
  }
  const DP_NAMES = { m: 'утро', d: 'обед', e: 'вечер', flat: 'ровно' };
  function aggState(S) { if (!S.agg) S.agg = { on: false }; return S.agg; }
  function aggConnected(S) { let n = 0; for (const st of S.stores) if (st.agg) n++; return n; }
  function aggCommission(S) { const n = aggConnected(S); let r = C().AGG_COMMISSION[0][1]; for (const [k, v] of C().AGG_COMMISSION) if (n >= k) r = v; return clamp(r + modAdd(S, 'aggComm'), 0, 0.6); } // + события (e065)
  // заказы доставки за день (до ограничения командой): null — точка не подключена
  function aggDay(S, st, d) {
    if (!st.agg) return null;
    const cfg = C(), dp = daypartOf(st);
    const ramp = st.aggDay != null ? clamp(cfg.AGG_RAMP_START + (1 - cfg.AGG_RAMP_START) * (S.day - st.aggDay) / cfg.AGG_RAMP_DAYS, cfg.AGG_RAMP_START, 1) : 1;
    const rk = clamp(1 + cfg.AGG_RATING_K * (storeRating(S, st) - cfg.RATING_START), 0.4, 1.4); // выдача агрегатора — по рейтингу
    const orders = d.demand * cfg.AGG_SHARE * dp.agg * rk * ramp * modMult(S, 'aggOrders', st);
    return { orders, cannib: orders * cfg.AGG_CANNIBAL };
  }
  function aggLatePen(S, st) { // перегрузка подключённой точки: опоздания курьеров и плохие отзывы
    if (!st.agg || !st.today || st.today.closed) return 0;
    const cfg = C(); return clamp((st.today.load - cfg.AGG_LATE_LOAD) * cfg.AGG_LATE_K, 0, cfg.AGG_LATE_MAX);
  }
  function aggConnectCost(S, st) { return st.aggPaid ? 0 : Math.round(C().AGG_CONNECT * S.macro.priceLevel); }
  function setAggStore(S, storeId, on) {
    const st = byId(S.stores, storeId); if (!st) return { ok: false, msg: 'Точка не найдена' };
    on = !!on; if (!!st.agg === on) return { ok: true };
    if (on) {
      const c = aggConnectCost(S, st); if (c && S.cash < c) return { ok: false, msg: 'Не хватает денег на подключение' };
      if (c) { spend(S, c, 'agg'); st.aggPaid = true; }
      st.aggDay = Math.max(S.day, st.status === 'opening' ? st.openDay : S.day);
    }
    st.agg = on;
    return { ok: true };
  }
  function setAggNetwork(S, on) { // один переключатель на сеть: подключить или отключить все точки
    const A = aggState(S); on = !!on;
    if (on) { const need = S.stores.reduce((a, st) => a + (st.agg ? 0 : aggConnectCost(S, st)), 0); if (S.cash < need) return { ok: false, msg: `Подключение стоит ${BK.fmtMoney(need)} — не хватает денег` }; }
    A.on = on;
    for (const st of S.stores) setAggStore(S, st.id, on);
    log(S, on ? `Сеть подключена к агрегаторам доставки: ${aggConnected(S)} точек, комиссия ${Math.round(aggCommission(S) * 100)}%.` : 'Сеть отключена от агрегаторов доставки.', on ? 'good' : 'info');
    return { ok: true };
  }
  function aggSummary(S) { // для UI
    const A = aggState(S), last = S.history[S.history.length - 1], p = last && last.pnl;
    return { on: !!A.on, n: aggConnected(S), total: S.stores.length, rate: aggCommission(S), pack: C().AGG_PACK,
      last: p && p.aggRev ? { rev: p.aggRev, orders: p.aggOrders || 0, cost: p.agg || 0 } : null,
      month: { rev: S.month.aggRev || 0, orders: S.month.aggOrders || 0, cost: S.month.agg || 0 } };
  }
  Object.assign(BK.Engine, { daypartOf, DP_NAMES, aggState, aggConnected, aggCommission, aggDay, aggLatePen, aggConnectCost, setAggStore, setAggNetwork, aggSummary });
  // внутренние функции для расширений движка (корпорация, corp.js); не для интерфейса
  BK.Engine._int = { spend, log, toast, rnd, rr, ri, gauss, pick, nextId, makePerson, candLevel, makeStoreOffer, genStoreOffers, genProdOffers, bakeChecks, modScope, modMult, SEASON, holidayDay, dayIdx, resetMonth, rentReview, freeSpot, districtWeight, rivalInit, storesInScope, diffEffects, storeWaste };
})();
