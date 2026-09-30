/* =====================================================================
   РОСТ ВГЛУБЬ (docs/vision-plan.md §5 п. 1, этап В1): середина первого акта.
   После ~15–30 точек сеть в Уфе упирается в город — дальше растёт не вширь, а вглубь. Пять направлений,
   каждое — своя маленькая дилемма, открываются по одному (по числу открытых точек ИЛИ по обороту за 12 мес.):
     cater   — кейтеринг и корпоративные заказы: разовые большие заказы к датам (корпоративы, Сабантуй, 8 Марта).
               Выгодно, но заказ занимает цех: если фабрики нет или она занята, цеха не успевают печь для точек.
     flag    — флагман: одна большая пекарня-кафе в центре. Дорогая, прибыль скромная, зато узнаваемость:
               гости всех точек +2,5 %, франчайзи сильнее, на полках дороже.
     factory — своя фабрика: долгая стройка, мощность на полки/франчайзи/заказы и полуфабрикаты для своих цехов
               (фудкост сети ниже). Риски — поломки (обслуживание стоит денег) и цена муки (можно закупить впрок).
     retail  — полки в супермаркетах: контракты с сетями (объём, цена, отсрочка 30–60 дн. — деньги приходят позже),
               за недопоставку — неустойка, три плохих месяца — расторжение и пятно на бренде.
     fran    — франшиза: партнёры платят взнос и роялти, покупают изделия у фабрики, но их качество ниже —
               скандалы бьют по рейтингу всей сети; контроль качества стоит денег.
   Подключается обёрткой BK.Engine.tick (как managers.js): перед обычным днём движка считается день направлений
   (выручка — в общий S.month.rev и оборот, расходы — по обычным статьям через spend), а 1-го числа — их постоянные
   расходы за закончившийся месяц. Влияние на сеть — через S.mods с пометкой src (фудкост, мощность цехов, гости).
   События направлений (g01–g03) добавляются в BK.EVENTS как followUp и ставятся в очередь S.ev.queue;
   их особые последствия (choice.g) применяет обёртка BK.Engine.resolveEvent.
   Второй акт: направления — активы Уфы и работают всегда; пока подробно открыт другой город, цеха Уфы для заказов
   считаются по последней известной свободной мощности, а выручка идёт и в оборот Уфы (cities.ufa.mAcc → c1).
   Состояние: S.growth (ensure() — значения по умолчанию, старые сохранения грузятся). Свой ГСЧ (S.growth.rng).
   Числа — BK.CFG.GROWTH. Интерфейс — src/ui/growth-ui.js (BK.GrowthUI). Проверка — sim/bot.js, qa/growth.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, K = () => BK.CFG.GROWTH;
  const I = () => BK.Engine._int;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = (v) => BK.fmtMoney(v);
  const KEYS = ['cater', 'flag', 'factory', 'retail', 'fran'];
  const NAMES = { cater: 'Кейтеринг и корпоративные заказы', flag: 'Флагман в центре', factory: 'Своя фабрика', retail: 'Полки в супермаркетах', fran: 'Франшиза' };

  /* ---------------- свой ГСЧ ---------------- */
  function rnd(G) {
    let t = (G.rng = (G.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (G, a, b) => a + (b - a) * rnd(G);
  const ri = (G, a, b) => Math.floor(rr(G, a, b + 1));
  const pick = (G, a) => a[Math.floor(rnd(G) * a.length)];
  const gauss = (G) => (rnd(G) + rnd(G) + rnd(G) - 1.5) * 1.414;
  const nid = (G, p) => p + (++G.ids);

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S.growth || typeof S.growth !== 'object') S.growth = {};
    const G = S.growth;
    if (G.v == null) G.v = 1;
    if (G.rng == null) G.rng = ((S.seed | 0) ^ 0x6b1f3a) | 0;
    if (G.ids == null) G.ids = 0;
    if (!G.un || typeof G.un !== 'object') G.un = {};      // направление → день, когда открылось
    if (!Array.isArray(G.recv)) G.recv = [];               // дебиторка сетей: [{ d: день оплаты, v: ₽, c: сеть }]
    if (!Array.isArray(G.hist)) G.hist = [];               // по месяцам: { y, m, rev: {…}, pr: {…} }
    if (!G.m || typeof G.m !== 'object') G.m = blankM();
    if (G.flour == null) G.flour = 1;                      // индекс цены муки
    if (!G.ws) G.ws = { cap: 0, spare: 0, units: 0 };       // цеха Уфы: мощность и свободная мощность (последний известный день)
    if (G.nr == null) G.nr = 4;                             // рейтинг сети Уфы (последний известный)
    if (G.fac === undefined) G.fac = null;
    if (!Array.isArray(G.facSites)) G.facSites = [];
    if (G.flag === undefined) G.flag = null;
    if (!Array.isArray(G.flagSites)) G.flagSites = [];
    if (!G.ret || typeof G.ret !== 'object') G.ret = {};
    const R = G.ret; if (!Array.isArray(R.list)) R.list = []; if (!Array.isArray(R.offers)) R.offers = []; if (R.next == null) R.next = 0; if (!R.ban) R.ban = {};
    if (!G.fr || typeof G.fr !== 'object') G.fr = {};
    const F = G.fr; if (!Array.isArray(F.list)) F.list = []; if (!Array.isArray(F.cand)) F.cand = []; if (F.next == null) F.next = 0; if (F.ctrl == null) F.ctrl = 1; if (F.scandals == null) F.scandals = 0;
    if (!G.cat || typeof G.cat !== 'object') G.cat = {};
    const T = G.cat; if (!Array.isArray(T.offers)) T.offers = []; if (!Array.isArray(T.acc)) T.acc = []; if (T.team == null) T.team = false; if (T.done == null) T.done = 0; if (T.failed == null) T.failed = 0;
    return G;
  }
  function blankM() { return { rev: { cater: 0, flag: 0, retail: 0, fran: 0 }, cost: { cater: 0, flag: 0, retail: 0, fran: 0, factory: 0 }, fines: 0, netCut: 0, units: 0 }; }
  const on = () => !!(K() && K().ON);
  const ufaOn = (S) => !S.corp || !S.corp.active || S.corp.active === 'ufa';
  function ufaStores(S) { // открытые точки Уфы (во втором акте — и когда Уфа упакована)
    if (ufaOn(S)) { let n = 0; for (const st of S.stores) if (st.status !== 'opening') n++; return n; }
    const c = S.corp.cities && S.corp.cities.ufa, pk = c && c.packed;
    return pk && pk.stores ? pk.stores.filter((s) => s.status !== 'opening').length : 0;
  }
  const unlocked = (S, k) => !!(S && S.growth && S.growth.un && S.growth.un[k] != null);
  const anyUnlocked = (S) => KEYS.some((k) => unlocked(S, k));
  const pl = (S) => S.macro.priceLevel;
  const bakerCost = (S) => S.pay.baker * (1 + C().PAYROLL_TAX);

  /* ---------------- деньги ---------------- */
  // выручка направления: в оборот сети и Уфы; cash — сразу на счёт (иначе — дебиторка у вызывающего)
  function addRev(S, ch, v, cash) {
    if (!(v > 0)) return;
    const G = S.growth;
    S.month.rev += v; S.cumRevenue += v; S.yearRev += v;
    S.month.gRev = (S.month.gRev || 0) + v;
    G.m.rev[ch] = (G.m.rev[ch] || 0) + v;
    if (cash) S.cash += v;
    const u = S.corp && S.corp.cities && S.corp.cities.ufa; if (u && u.mAcc) u.mAcc.rev += v; // оборот Уфы (цель первого акта, история города)
  }
  function cost(S, ch, v, bucket) {
    if (!(v > 0)) return;
    I().spend(S, v, bucket);
    S.growth.m.cost[ch] = (S.growth.m.cost[ch] || 0) + v;
    const u = S.corp && S.corp.cities && S.corp.cities.ufa; if (u && u.mAcc && bucket !== 'capex') u.mAcc.profit -= v;
  }
  function recvTotal(S) { let s = 0; for (const r of (S.growth ? S.growth.recv : [])) s += r.v; return s; }

  /* ---------------- модификаторы сети (S.mods с пометкой src) ---------------- */
  function setMod(S, src, t, m) {
    let x = null; for (const q of S.mods) if (q.src === src) { x = q; break; }
    if (Math.abs(m - 1) < 1e-4) { if (x) S.mods = S.mods.filter((q) => q !== x); return; }
    if (!x) { x = { t, m, until: 0, src }; S.mods.push(x); }
    x.t = t; x.m = +m.toFixed(4); x.until = S.day + 3;
    if (S.corp) { x.scope = 'city'; x.target = 'ufa'; } else { x.scope = 'global'; x.target = null; } // во втором акте — только Уфа
  }
  function hitRating(S, d) { if (!ufaOn(S)) return; for (const st of S.stores) if (st.status !== 'opening') st.rating = clamp((st.rating != null ? st.rating : C().RATING_START) - d, 1, 5); }

  /* ---------------- места на карте (Уфа) ---------------- */
  function spot(S, G, d, r) {
    const busy = (p) => S.stores.concat(S.offers, S.productions).some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 14)
      || G.facSites.concat(G.flagSites, G.fac ? [G.fac] : [], G.flag ? [G.flag] : [], G.fr.list, G.fr.cand).some((o) => o && Math.hypot(o.x - p.x, o.y - p.y) < 14);
    for (let k = 0; k < 30; k++) {
      const a = rnd(G) * Math.PI * 2, rad = Math.sqrt(rnd(G)) * r;
      const p = { x: +(d.x + Math.cos(a) * rad).toFixed(1), y: +(d.y + Math.sin(a) * rad * 0.85).toFixed(1) };
      if (p.x > 30 && p.x < 970 && p.y > 30 && p.y < 970 && !busy(p)) return p;
    }
    return { x: d.x, y: d.y };
  }
  const street = (G, d, n) => `${pick(G, d.streets)}, ${ri(G, 1, n || 90)}`;
  const dist = (id) => BK.DISTRICTS.find((x) => x.id === id);

  /* ---------------- открытие направлений ---------------- */
  function checkUnlock(S, day) {
    const G = S.growth, U = K().UNLOCK, n = ufaStores(S);
    let rev = null; const got = [];
    for (const k of KEYS) {
      if (G.un[k] != null) continue;
      const u = U[k]; if (!u) continue;
      if (n < u.stores) { if (rev == null) rev = E().rolling12(S); if (rev < u.rev) continue; }
      G.un[k] = day; got.push(k);
    }
    if (!got.length) return;
    if (ufaOn(S)) for (const k of got) prepare(S, k);
    I().log(S, `Новая возможность — ${got.map((k) => NAMES[k].toLowerCase()).join(', ')}. Подробности — во вкладке «Рост».`, 'good');
    S.notify.push({ type: 'growth', keys: got });
  }
  function prepare(S, k) { // площадки и первые предложения — только когда Уфа на экране (карта и районы Уфы)
    const G = S.growth;
    if (k === 'factory' && !G.fac && !G.facSites.length) genFacSites(S);
    if (k === 'flag' && !G.flag && !G.flagSites.length) genFlagSites(S);
    if (k === 'retail' && !G.ret.offers.length) { genRetOffer(S); G.ret.next = S.day + ri(G, K().RET_OFFER_GAP[0], K().RET_OFFER_GAP[1]); }
    if (k === 'fran' && !G.fr.cand.length) { genFrCand(S); G.fr.next = S.day + ri(G, K().FR_POOL_DAYS[0], K().FR_POOL_DAYS[1]); }
    if (k === 'cater' && !G.cat.offers.length && !G.cat.acc.length) genOrder(S);
  }

  /* ================= ФАБРИКА ================= */
  function genFacSites(S) {
    const G = S.growth, k = K();
    const pool = ['north', 'shaksha', 'inors', 'nizh', 'zaton', 'dema'].map(dist).filter(Boolean);
    G.facSites = [];
    for (let i = 0; i < k.FAC_SITES && pool.length; i++) {
      const d = pool.splice(Math.floor(rnd(G) * pool.length), 1)[0], p = spot(S, G, d, 40);
      const f = +rr(G, 0.9, 1.15).toFixed(2); // стройка дороже/дешевле: грунт, сети, подъезд
      const lg = +(1.1 - 0.25 * (f - 0.9) / 0.25 + rr(G, -0.05, 0.05)).toFixed(2); // логистика до города
      G.facSites.push({ id: nid(G, 'fs'), district: d.id, x: p.x, y: p.y, address: street(G, d), k: f, rentK: +rr(G, 0.85, 1.2).toFixed(2), logi: clamp(lg, 0.85, 1.2) });
    }
  }
  function facBuildCost(S, site) { return Math.round(K().FAC_BUILD * site.k * pl(S)); }
  function buildFactory(S, siteId) {
    const G = ensure(S); if (!unlocked(S, 'factory')) return { ok: false, msg: 'Фабрика ещё не открыта' };
    if (G.fac) return { ok: false, msg: 'Фабрика уже есть' };
    const site = G.facSites.find((x) => x.id === siteId); if (!site) return { ok: false, msg: 'Площадка не найдена' };
    const c = facBuildCost(S, site); if (S.cash < c) return { ok: false, msg: `Не хватает ${fm(c - S.cash)}` };
    cost(S, 'factory', c, 'capex');
    G.fac = Object.assign({}, site, { id: nid(G, 'fac'), status: 'build', day: S.day, readyDay: S.day + K().FAC_DAYS, lvl: 1, expDay: null, down: 0, maint: 1, semis: 1, breaks: 0, hedge: null, opened: null, capex: c });
    G.facSites = [];
    I().log(S, `Начата стройка фабрики: ${site.address} (${dist(site.district).name}). Запуск — ${E().fmtDate(G.fac.readyDay)}.`, 'good');
    return { ok: true };
  }
  function facCap(S) { const f = S.growth && S.growth.fac; if (!f || f.status !== 'open') return 0; return K().FAC_CAP[f.lvl - 1] || 0; }
  function facUp(S) { const f = S.growth.fac; return !!(f && f.status === 'open' && !(f.down > S.day)); }
  function facExpCost(S) { const f = S.growth.fac; if (!f || f.lvl >= K().FAC_CAP.length) return 0; return Math.round(K().FAC_EXP[f.lvl] * pl(S)); }
  function expandFactory(S) {
    const G = ensure(S), f = G.fac; if (!f || f.status !== 'open') return { ok: false, msg: 'Фабрика ещё не работает' };
    if (f.expDay) return { ok: false, msg: 'Расширение уже идёт' };
    if (f.lvl >= K().FAC_CAP.length) return { ok: false, msg: 'Все очереди построены' };
    const c = facExpCost(S); if (S.cash < c) return { ok: false, msg: `Не хватает ${fm(c - S.cash)}` };
    cost(S, 'factory', c, 'capex'); f.expDay = S.day + K().FAC_EXP_DAYS; f.capex += c;
    I().log(S, `Фабрика: начато строительство ${f.lvl + 1}-й очереди (+${K().FAC_CAP[f.lvl] - K().FAC_CAP[f.lvl - 1]} изд./день), готово ${E().fmtDate(f.expDay)}.`, 'good');
    return { ok: true };
  }
  function setMaint(S, l) { const f = ensure(S).fac; if (!f) return { ok: false }; f.maint = clamp(Math.round(+l || 0), 0, 2); return { ok: true }; }
  function setSemis(S, v) { const f = ensure(S).fac; if (!f) return { ok: false }; f.semis = clamp(Math.round((+v || 0) * 4) / 4, 0, 1); return { ok: true }; }
  function flourK(S) { const G = S.growth, f = G.fac; return f && f.hedge && f.hedge.until > S.day ? f.hedge.k : G.flour; }
  function facUnit(S) { const k = K(); return k.FAC_UNIT * pl(S) * (1 - k.FAC_FLOUR_SHARE + k.FAC_FLOUR_SHARE * flourK(S)); }
  function hedgeCost(S) { // стоимость муки на полгода вперёд × комиссия (при текущей загрузке фабрики, но не меньше половины мощности)
    const G = S.growth, f = G.fac, k = K(); if (!f || f.status !== 'open') return 0;
    const units = Math.max(facCap(S) * 0.5, G.lastUnits || 0);
    return Math.round(units * k.HEDGE_DAYS * k.FAC_UNIT * pl(S) * k.FAC_FLOUR_SHARE * G.flour * k.HEDGE_FEE);
  }
  function hedge(S) {
    const G = ensure(S), f = G.fac; if (!f || f.status !== 'open') return { ok: false, msg: 'Фабрика ещё не работает' };
    if (f.hedge && f.hedge.until > S.day) return { ok: false, msg: 'Мука уже закуплена впрок' };
    const c = hedgeCost(S); if (S.cash < c) return { ok: false, msg: `Не хватает ${fm(c - S.cash)}` };
    cost(S, 'factory', c, 'other'); f.hedge = { k: G.flour, until: S.day + K().HEDGE_DAYS, day: S.day };
    I().log(S, `Фабрика: мука закуплена на полгода по индексу ${G.flour.toFixed(2).replace('.', ',')} (−${fm(c)}).`, 'good');
    return { ok: true, cost: c };
  }
  function facMonthCost(S) { // постоянные расходы фабрики в месяц (для прогноза и 1-го числа)
    const f = S.growth && S.growth.fac, k = K(); if (!f) return { rent: 0, pay: 0, util: 0, maint: 0, total: 0 };
    const rent = k.FAC_RENT * f.rentK * pl(S);
    if (f.status !== 'open') return { rent, pay: 0, util: 0, maint: 0, total: rent };
    const pay = k.FAC_STAFF[f.lvl - 1] * bakerCost(S), util = k.FAC_UTIL[f.lvl - 1] * pl(S), maint = k.FAC_MAINT[f.maint] * pl(S);
    return { rent, pay, util, maint, total: rent + pay + util + maint };
  }
  function facDaily(S, D) {
    const G = S.growth, f = G.fac, k = K(); if (!f) return;
    if (f.status === 'build' && D >= f.readyDay) {
      f.status = 'open'; f.opened = D;
      I().toast(S, 'Фабрика запущена', `${f.address}: ${k.FAC_CAP[0].toLocaleString('ru-RU')} изделий в день. Теперь можно брать контракты с сетями и снабжать цеха полуфабрикатами.`, 'good');
      I().log(S, `Фабрика запущена: ${f.address}.`, 'good');
    }
    if (f.expDay && D >= f.expDay) { f.lvl++; f.expDay = null; I().toast(S, `Фабрика: ${f.lvl}-я очередь`, `Мощность — ${k.FAC_CAP[f.lvl - 1].toLocaleString('ru-RU')} изделий в день.`, 'good'); I().log(S, `Фабрика: запущена ${f.lvl}-я очередь.`, 'good'); }
    if (f.status !== 'open' || f.down > D) return;
    const age = (D - f.opened) / 365;
    const p = k.FAC_BREAK_P * k.FAC_BREAK_K[f.maint] * (1 + k.FAC_AGE_K * age) * (f.revUntil > D ? 0.5 : 1);
    if (rnd(G) < p) { // поломка: простой, пока игрок не решит (событие g03)
      f.down = D + k.FAC_DOWN0; f.breaks++;
      queueEvent(S, 'g03', 0);
      I().log(S, `Фабрика остановилась: поломка линии (${f.address}).`, 'bad');
    }
  }

  /* ================= ПОЛКИ В СУПЕРМАРКЕТАХ ================= */
  function brandPrice(S) { const G = S.growth; return 1 + (G.flag && G.flag.status === 'open' ? K().FLAG_RET_PRICE : 0) + clamp((G.nr - 4) * 0.04, -0.06, 0.04); }
  function genRetOffer(S, renew) {
    const G = S.growth, k = K(), R = G.ret;
    const busy = new Set(R.list.map((c) => c.chain).concat(R.offers.map((o) => o.chain)));
    const free = k.RET_CHAINS.filter((c) => !busy.has(c.id) && !(R.ban[c.id] > S.day));
    if (!renew && R.list.length >= k.RET_MAX_ACTIVE) return null;
    const ch = renew || (free.length ? pick(G, free) : null); if (!ch) return null;
    const grow = clamp(ufaStores(S) / 35, 0.7, 1.4);
    let units = Math.round(rr(G, ch.size[0], ch.size[1]) * grow / 100) * 100;
    let price = +(k.RET_PRICE * ch.price * brandPrice(S) * rr(G, 0.95, 1.05)).toFixed(2); // в ценах 2027, × уровень цен при поставке
    const o = { id: nid(G, 'ro'), chain: ch.id, name: ch.name, note: ch.note, units, price, pay: ch.pay, fine: ch.fine, until: S.day + k.RET_OFFER_DAYS, term: k.RET_TERM };
    R.offers.push(o);
    return o;
  }
  function chainOf(id) { return K().RET_CHAINS.find((c) => c.id === id) || K().RET_CHAINS[0]; }
  function acceptContract(S, offerId) {
    const G = ensure(S), R = G.ret; const o = R.offers.find((x) => x.id === offerId); if (!o) return { ok: false, msg: 'Предложение уже неактуально' };
    R.offers = R.offers.filter((x) => x !== o);
    R.list.push({ id: nid(G, 'rc'), chain: o.chain, name: o.name, units: o.units, price: o.price, pay: o.pay, fine: o.fine, start: S.day, end: S.day + o.term, fillM: [0, 0], strikes: 0, lastFill: null, renewed: !!o.renew, total: 0 });
    I().log(S, `Подписан контракт с сетью ${o.name}: ${o.units.toLocaleString('ru-RU')} изделий в день на год, оплата через ${o.pay} дн.`, 'good');
    return { ok: true };
  }
  function declineOffer(S, offerId) { const R = ensure(S).ret; const n = R.offers.length; R.offers = R.offers.filter((x) => x.id !== offerId); return { ok: R.offers.length < n }; }
  function retUnits(S) { let u = 0; for (const c of S.growth.ret.list) u += c.units; return u; }

  /* ================= ФРАНШИЗА ================= */
  const PARTNER_FORM = ['ИП', 'ООО «', 'ООО «'];
  const PARTNER_WORD = ['Уфимский хлеб', 'Хлебный дом', 'Тёплая булочка', 'Мир выпечки', 'Сытый квартал', 'Добрый пекарь', 'Хлебница', 'Башкирская слобода', 'Пекарский двор', 'Утро'];
  const PARTNER_BIO = [
    ['три кофейни в спальных районах — знает, как считать деньги', 0.1], ['бывший управляющий ресторана, первый свой бизнес', 0.0],
    ['семейная пара, продали квартиру под точку', -0.08], ['сеть автомоек, хочет «что-то с едой»', -0.12],
    ['пекарь с 20-летним стажем, денег впритык', 0.06], ['инвестор из Москвы, в Уфе бывает раз в квартал', -0.15],
    ['владелица двух магазинов у дома', 0.02], ['выпускник бизнес-школы, всё по таблицам', 0.04],
  ];
  function genFrCand(S) {
    const G = S.growth, k = K(), F = G.fr;
    F.cand = F.cand.filter((c) => c.until > S.day);
    const own = {}; for (const st of S.stores) own[st.district] = (own[st.district] || 0) + 1;
    for (const f of F.list) own[f.district] = (own[f.district] || 0) + 0.7;
    const ctrlSeen = k.FR_CTRL_SEEN[F.ctrl] || 0.3;
    while (F.cand.length < k.FR_POOL) {
      // районы, где своих мест мало или аренда дорогая
      const ds = BK.DISTRICTS.map((d) => ({ d, w: (1 / (1 + (own[d.id] || 0))) * (1 + (d.rent[0] > 1800 ? 0.6 : 0)) }));
      let tot = 0; for (const x of ds) tot += x.w; let r = rnd(G) * tot, d = ds[0].d; for (const x of ds) { r -= x.w; if (r <= 0) { d = x.d; break; } }
      const bio = pick(G, PARTNER_BIO);
      const q = +clamp(rr(G, 0.35, 0.9) + bio[1], 0.2, 0.95).toFixed(2);
      const seen = clamp(Math.round((q * 5 + gauss(G) * ctrlSeen * 5) * 2) / 2, 1, 5); // что видно: звёзды со случайной ошибкой (меньше при контроле)
      const form = pick(G, PARTNER_FORM), nm = form === 'ИП' ? `ИП ${pick(G, BK.SURNAMES)}` : `${form}${pick(G, PARTNER_WORD)}»`;
      const p = spot(S, G, d, 44);
      const fee = Math.round(k.FR_FEE * rr(G, 0.85, 1.15) / 1e4) * 1e4;
      F.cand.push({ id: nid(G, 'fc'), partner: nm, bio: bio[0], district: d.id, x: p.x, y: p.y, address: street(G, d, 120), q, seen, fee, until: S.day + k.FR_CAND_DAYS });
    }
  }
  function frQ(S, f) { const k = K(), G = S.growth; return clamp(f.q + (k.FR_CTRL_Q[G.fr.ctrl] || 0) * (1 - f.q) + (G.flag && G.flag.status === 'open' ? k.FLAG_FR_Q : 0), 0, 1); }
  function frSalesDay(S, f, t) { // оборот франчайзи за день (в текущих ценах)
    const k = K(), G = S.growth;
    if (f.status !== 'open') return 0;
    const ramp = Math.min(1, C().RAMP_START + (1 - C().RAMP_START) * (S.day - f.openDay) / k.FR_RAMP_DAYS);
    const rk = clamp(1 + 0.12 * (G.nr - 4), 0.7, 1.15);
    const season = [0.92, 0.9, 0.95, 0.98, 1.0, 0.96, 0.93, 0.95, 1.03, 1.04, 1.05, 1.12][t.m];
    return k.FR_SALES / 30.4 * pl(S) * (0.55 + 0.6 * frQ(S, f)) * rk * season * ramp * (f.hit > S.day ? 0.8 : 1);
  }
  function signFran(S, candId) {
    const G = ensure(S), F = G.fr, k = K();
    if (!unlocked(S, 'fran')) return { ok: false, msg: 'Франшиза ещё не открыта' };
    if (F.list.length >= k.FR_MAX) return { ok: false, msg: `Больше ${k.FR_MAX} франчайзи сеть не потянет` };
    const c = F.cand.find((x) => x.id === candId); if (!c) return { ok: false, msg: 'Партнёр уже передумал' };
    F.cand = F.cand.filter((x) => x !== c);
    const fee = Math.round(c.fee * pl(S));
    addRev(S, 'fran', fee, true);
    F.list.push({ id: nid(G, 'fr'), partner: c.partner, district: c.district, x: c.x, y: c.y, address: c.address, q: c.q, seen: c.seen, fee, day: S.day, openDay: S.day + k.FR_OPEN_DAYS, status: 'opening', sales: 0, inc: 0, scandals: 0, hit: 0 });
    I().log(S, `Франшиза: договор с ${c.partner} (${dist(c.district).name}), паушальный взнос ${fm(fee)}. Открытие через ${Math.round(k.FR_OPEN_DAYS / 30)} мес.`, 'good');
    return { ok: true, fee };
  }
  function closeFran(S, id, noComp) {
    const G = ensure(S), F = G.fr; const f = F.list.find((x) => x.id === id); if (!f) return { ok: false };
    const comp = noComp ? 0 : Math.round(f.fee * K().FR_EXIT);
    if (comp && S.cash < comp) return { ok: false, msg: `Компенсация партнёру ${fm(comp)} — не хватает денег` };
    if (comp) cost(S, 'fran', comp, 'other');
    F.list = F.list.filter((x) => x !== f);
    I().log(S, `Франшиза: договор с ${f.partner} расторгнут${comp ? ` (компенсация ${fm(comp)})` : ''}.`, 'warn');
    return { ok: true, comp };
  }
  function setControl(S, l) { const F = ensure(S).fr; F.ctrl = clamp(Math.round(+l || 0), 0, 3); return { ok: true }; }

  /* ================= ФЛАГМАН ================= */
  function genFlagSites(S) {
    const G = S.growth, k = K(); G.flagSites = [];
    const ds = ['center', 'center', 'october', 'grove'].map(dist).filter(Boolean);
    for (let i = 0; i < k.FLAG_SITES; i++) {
      const d = i === 0 ? ds[0] : pick(G, ds.slice(1)), p = spot(S, G, d, 30);
      const tk = +rr(G, 0.9, 1.2).toFixed(2); // туристический поток места
      G.flagSites.push({ id: nid(G, 'gs'), district: d.id, x: p.x, y: p.y, address: street(G, d, 60), tk, rentK: +(tk * rr(G, 0.9, 1.05)).toFixed(2), area: ri(G, 380, 520) });
    }
  }
  function flagBuildCost(S, s) { return Math.round(K().FLAG_BUILD * (0.85 + 0.15 * s.tk) * pl(S)); }
  function buildFlag(S, siteId) {
    const G = ensure(S); if (!unlocked(S, 'flag')) return { ok: false, msg: 'Флагман ещё не открыт' };
    if (G.flag) return { ok: false, msg: 'Флагман уже есть' };
    const s = G.flagSites.find((x) => x.id === siteId); if (!s) return { ok: false, msg: 'Помещение не найдено' };
    const c = flagBuildCost(S, s); if (S.cash < c) return { ok: false, msg: `Не хватает ${fm(c - S.cash)}` };
    cost(S, 'flag', c, 'capex');
    G.flag = Object.assign({}, s, { id: nid(G, 'fl'), status: 'build', day: S.day, readyDay: S.day + K().FLAG_DAYS, tour: false, opened: null, capex: c });
    G.flagSites = [];
    I().log(S, `Флагман: начат ремонт помещения ${s.address} (${dist(s.district).name}), открытие ${E().fmtDate(G.flag.readyDay)}.`, 'good');
    return { ok: true };
  }
  function setTour(S, v) { const f = ensure(S).flag; if (!f) return { ok: false }; f.tour = !!v; return { ok: true }; }
  function flagRamp(S) { const f = S.growth.flag; if (!f || f.status !== 'open') return 0; return Math.min(1, C().RAMP_START + (1 - C().RAMP_START) * (S.day - f.opened) / C().RAMP_DAYS); }
  function flagDay(S, t) { // гостей и выручка флагмана за день
    const f = S.growth.flag, k = K(); if (!f || f.status !== 'open') return { guests: 0, rev: 0 };
    const rt = clamp(S.growth.nr + 0.3, 1, 5), rk = clamp(1 + 0.15 * (rt - 4), 0.7, 1.2);
    const tour = f.tour && t.m >= 4 && t.m <= 8 ? k.FLAG_TOUR_K : 1;
    const guests = k.FLAG_GUESTS * f.tk * k.FLAG_SEASON[t.m] * rk * tour * flagRamp(S);
    const pm = S.menu && S.menu.length ? S.menu.reduce((a, x) => a + x.pm, 0) / S.menu.length : 1;
    return { guests, rev: guests * k.FLAG_CHECK * pl(S) * (1 + 0.5 * (pm - 1)) };
  }
  function flagMonthCost(S) {
    const f = S.growth && S.growth.flag, k = K(); if (!f) return { total: 0 };
    const rent = k.FLAG_RENT * f.rentK * pl(S);
    if (f.status !== 'open') return { rent, total: rent };
    const pay = k.FLAG_STAFF * E().salaryOf(S, 3) * (1 + C().PAYROLL_TAX), util = k.FLAG_UTIL * pl(S), tour = f.tour ? k.FLAG_TOUR * pl(S) : 0;
    return { rent, pay, util, tour, total: rent + pay + util + tour };
  }

  /* ================= КЕЙТЕРИНГ ================= */
  const CLIENTS = [
    ['Бизнес-центр «Уфа-Сити»', 'корпоратив', 1.1], ['Завод «Башнефтемаш»', 'обеды для смены', 0.95], ['Университет', 'выпускной и конференция', 0.95],
    ['Форум «Уфа-Экспо»', 'кофе-брейки форума', 1.2], ['Банк «Урал-Капитал»', 'новогодний корпоратив', 1.25], ['Свадебное агентство «Сорок сороков»', 'свадьба на 300 гостей', 1.15],
    ['Администрация района', 'городской праздник', 0.9], ['IT-компания «Байт»', 'завтраки для офиса', 1.1], ['Фитнес-клуб «Батыр»', 'марафон', 1.0], ['Школа олимпийского резерва', 'сборы', 0.9],
  ];
  function catScale(S) { return clamp(ufaStores(S) / 30, 0.6, 1.6) * (S.growth.cat.team ? K().CAT_TEAM_K : 1); }
  function genOrder(S) {
    const G = S.growth, k = K(), t = E().dateOf(S.day);
    let cl = pick(G, CLIENTS);
    if (t.m === 10 || t.m === 11) cl = rnd(G) < 0.5 ? CLIENTS[4] : cl; // к Новому году — корпоративы
    const units = Math.round(rr(G, k.CAT_UNITS[0], k.CAT_UNITS[1]) * catScale(S) / 100) * 100;
    const days = ri(G, k.CAT_DAYS[0], k.CAT_DAYS[1]);
    const start = S.day + ri(G, k.CAT_LEAD[0], k.CAT_LEAD[1]);
    const price = +(k.CAT_PRICE * cl[2] * rr(G, 0.92, 1.08)).toFixed(1);
    G.cat.offers.push({ id: nid(G, 'co'), client: cl[0], what: cl[1], units, days, start, price, until: Math.min(start - 2, S.day + k.CAT_OFFER_DAYS) });
  }
  function catPlanLoad(S, day) { // сколько изделий кейтеринга в этот день по принятым заказам
    let u = 0; for (const o of S.growth.cat.acc) if (day >= o.start && day < o.start + o.days) u += o.units / o.days; return u;
  }
  function acceptOrder(S, id) {
    const G = ensure(S), T = G.cat; const o = T.offers.find((x) => x.id === id); if (!o) return { ok: false, msg: 'Заказ уже ушёл к другим' };
    T.offers = T.offers.filter((x) => x !== o);
    T.acc.push(Object.assign({}, o, { got: 0, rev: 0 }));
    I().log(S, `Кейтеринг: принят заказ — ${o.client}, ${o.what}: ${o.units.toLocaleString('ru-RU')} изделий к ${E().fmtDate(o.start)}.`, 'good');
    return { ok: true };
  }
  function declineOrder(S, id) { const T = ensure(S).cat; const n = T.offers.length; T.offers = T.offers.filter((x) => x.id !== id); return { ok: T.offers.length < n }; }
  function hireTeam(S) {
    const T = ensure(S).cat; if (T.team) return { ok: false, msg: 'Команда уже есть' };
    const c = Math.round(K().CAT_TEAM * pl(S)); if (S.cash < c) return { ok: false, msg: `Не хватает ${fm(c - S.cash)}` };
    cost(S, 'cater', c, 'capex'); T.team = true; T.teamDay = S.day;
    I().log(S, 'Кейтеринг: собрана своя команда (развоз, сервировка, менеджер заказов).', 'good');
    return { ok: true };
  }
  function orderValue(S, o) { return o.units * o.price * pl(S); }

  /* ================= ДЕНЬ ================= */
  // Мощность: сначала обязательства (полки и заказы) — с фабрики, недостающее — из цехов (цеха печь для точек успевают меньше);
  // потом закупки франчайзи (только с фабрики), остаток фабрики — полуфабрикаты для своих цехов (фудкост сети ниже).
  function capPlan(S, day, extra) {
    const G = S.growth, k = K();
    const fcap = facUp(S) ? facCap(S) : 0;
    const ret = retUnits(S), cat = catPlanLoad(S, day) + (extra || 0);
    let frU = 0; if (G.fac && G.fac.status === 'open') for (const f of G.fr.list) if (f.status === 'open') frU += f.sales1 || 0;
    const need1 = ret + cat;
    const fromFac = Math.min(fcap, need1), fromWs = Math.min(need1 - fromFac, G.ws.cap * 0.9);
    let left = fcap - fromFac;
    const frGot = Math.min(left, frU); left -= frGot;
    const net = G.fac ? G.ws.units * G.fac.semis : 0;
    const semis = Math.min(left, net); left -= semis;
    return { fcap, ret, cat, need1, fromFac, fromWs, fill: need1 > 0 ? (fromFac + fromWs) / need1 : 1, frU, frGot, semis, cover: G.ws.units > 0 ? semis / G.ws.units : 0, facFree: left,
      wsSpare: G.ws.spare, wsOver: Math.max(0, fromWs - G.ws.spare), capM: G.ws.cap > 0 ? clamp(1 - fromWs / G.ws.cap, 0.1, 1) : 1 };
  }
  function pre(S) {
    const G = ensure(S), k = K();
    const D = S.day + 1, t = E().dateOf(D);
    const uOn = ufaOn(S);
    if (uOn) { // цеха Уфы: мощность без нашей поправки (вчерашний день)
      const cm = S.mods.find((q) => q.src === 'g-cap'), capM = cm && cm.until > S.day ? cm.m : 1;
      const cache = S.cache || {};
      if (cache.cap != null) { const cap = cache.cap / (capM || 1); G.ws = { cap, units: cache.units || 0, spare: Math.max(0, cap - (cache.units || 0)) * 0.95 }; }
      const nr = E().networkRating(S); if (nr != null) G.nr = nr;
    }
    if (D % 7 === 0 || t.d === 1) checkUnlock(S, D);
    if (!anyUnlocked(S)) return;
    if (t.d === 1) monthEnd(S, t);
    // дебиторка: сети платят по сроку
    if (G.recv.length) { let got = 0; G.recv = G.recv.filter((r) => { if (r.d <= D) { got += r.v; return false; } return true; }); if (got) S.cash += got; }
    facDaily(S, D);
    // франчайзи открываются
    for (const f of G.fr.list) if (f.status === 'opening' && D >= f.openDay) { f.status = 'open'; I().toast(S, 'Франчайзи открылся', `${f.partner}: ${f.address}. Роялти ${Math.round(k.FR_ROYALTY * 100)}% с оборота.`, 'good'); }
    if (G.flag && G.flag.status === 'build' && D >= G.flag.readyDay) { G.flag.status = 'open'; G.flag.opened = D; I().toast(S, 'Флагман открыт!', `${G.flag.address}: большая пекарня-кафе в центре. Узнаваемость сети растёт.`, 'good'); I().log(S, `Открыт флагман: ${G.flag.address}.`, 'good'); }
    // объёмы франчайзи на сегодня
    let frSales = 0; for (const f of G.fr.list) { const s = frSalesDay(S, f, t); f.sd = s; f.sales1 = s * k.FR_SUPPLY / (k.RET_PRICE * pl(S)); frSales += s; }
    const P = capPlan(S, D);
    G.lastPlan = { fill: P.fill, cover: P.cover, fcap: P.fcap, used: P.fromFac + P.frGot + P.semis, wsOver: P.wsOver };
    G.lastUnits = P.fromFac + P.frGot + P.semis;
    const fu = facUnit(S), wsu = k.RET_WS_UNIT * pl(S), share = P.need1 > 0 ? P.fromFac / P.need1 : 0; // доля обязательств с фабрики
    const uCost = share * fu + (1 - share) * wsu;
    // полки: поставка, выручка (деньги — через отсрочку), неустойка
    for (const c of G.ret.list) {
      const got = c.units * P.fill, v = got * c.price * pl(S);
      addRev(S, 'retail', v, false);
      G.recv.push({ d: D + c.pay, v, c: c.chain });
      c.total += v; c.fillM[0] += got; c.fillM[1] += c.units;
      cost(S, 'retail', got * (uCost + k.RET_LOGI * pl(S) * ((G.fac && G.fac.logi) || 1)), 'fc');
      const miss = c.units - got; if (miss > 1) { const fine = miss * c.price * pl(S) * c.fine; cost(S, 'retail', fine, 'other'); G.m.fines += fine; }
    }
    // кейтеринг: выдача принятых заказов
    for (const o of G.cat.acc) {
      if (D < o.start || D >= o.start + o.days) continue;
      const want = o.units / o.days, got = want * P.fill;
      o.got += got; const v = got * o.price * pl(S); o.rev += v;
      addRev(S, 'cater', v, true);
      cost(S, 'cater', got * (uCost + k.CAT_PACK * pl(S)), 'fc');
    }
    // франчайзи: роялти каждый день, закупки у фабрики
    if (frSales > 0) {
      addRev(S, 'fran', frSales * k.FR_ROYALTY, true);
      const got = P.frGot; if (got > 0) { const v = got * k.RET_PRICE * pl(S); addRev(S, 'fran', v, true); cost(S, 'fran', got * fu, 'fc'); }
      for (const f of G.fr.list) if (f.sd) { f.sales += f.sd; f.inc += f.sd * k.FR_ROYALTY + (P.frU > 0 ? P.frGot * f.sales1 / P.frU : 0) * k.RET_PRICE * pl(S); }
    }
    // флагман
    const fd = flagDay(S, t);
    if (fd.rev > 0) { addRev(S, 'flag', fd.rev, true); cost(S, 'flag', fd.rev * k.FLAG_FC, 'fc'); G.flag.guests = fd.guests; }
    // полуфабрикаты сети: фудкост своих цехов ниже; сэкономлено ≈ доля покрытия × срез × фудкост сети
    G.m.units += P.fromFac + P.frGot + P.semis;
    const fcK = 1 - k.FAC_NET_CUT * (G.fac && G.fac.status === 'open' ? P.cover : 0);
    if (uOn) {
      setMod(S, 'g-fc', 'foodcost', fcK);
      setMod(S, 'g-cap', 'capacity', P.capM);
      if (S.cache && S.cache.dayRev && S.cache.fcPct) G.m.netCut += S.cache.dayRev * S.cache.fcPct * (1 - fcK) / Math.max(0.5, fcK);
    }
    // узнаваемость: флагман + бренд на полках
    const shelf = Math.min(k.RET_SHELF_MAX, k.RET_SHELF_TRAFFIC * G.ret.list.length);
    setMod(S, 'g-aw', 'traffic', 1 + k.FLAG_NET * flagRamp(S) + shelf);
    // новые предложения
    if (uOn) daily2(S, D, t);
    // заказы и предложения, которые сгорели
    const exp = G.cat.offers.filter((o) => o.until < D); if (exp.length) G.cat.offers = G.cat.offers.filter((o) => o.until >= D);
    G.ret.offers = G.ret.offers.filter((o) => o.until >= D);
    // закрыть выданные заказы
    for (const o of G.cat.acc.slice()) if (D >= o.start + o.days - 1 && D >= o.start) {
      G.cat.acc = G.cat.acc.filter((x) => x !== o);
      const ratio = o.got / o.units;
      if (ratio < 0.95) {
        const fine = (o.units - o.got) * o.price * pl(S) * k.CAT_FINE; cost(S, 'cater', fine, 'other'); G.m.fines += fine; G.cat.failed++;
        hitRating(S, 0.05);
        I().toast(S, 'Заказ сорван', `${o.client}: выдали ${Math.round(ratio * 100)}% — не хватило мощности. Неустойка ${fm(fine)}, отзывы подпортили рейтинг.`, 'bad');
      } else { G.cat.done++; I().log(S, `Кейтеринг: заказ выполнен — ${o.client}, выручка ${fm(o.rev)}.`, 'good'); }
    }
  }
  function daily2(S, D, t) { // генерация предложений (карта Уфы — только когда Уфа на экране)
    const G = S.growth, k = K();
    if (unlocked(S, 'cater')) {
      const rate = (k.CAT_RATE + k.CAT_RATE_PER_STORE * ufaStores(S)) * k.CAT_MONTH_K[t.m] * (G.cat.team ? k.CAT_TEAM_K : 1);
      if (G.cat.offers.length < 4 && rnd(G) < rate / 30.4) genOrder(S);
    }
    if (unlocked(S, 'retail') && D >= G.ret.next) {
      if (G.ret.offers.length < k.RET_MAX_OFFERS) { const o = genRetOffer(S); if (o) I().toast(S, `Сеть ${o.name} предлагает контракт`, `${o.units.toLocaleString('ru-RU')} изделий в день, оплата через ${o.pay} дн. — во вкладке «Рост».`, 'info'); }
      G.ret.next = D + ri(G, k.RET_OFFER_GAP[0], k.RET_OFFER_GAP[1]);
    }
    if (unlocked(S, 'fran') && D >= G.fr.next) { genFrCand(S); G.fr.next = D + ri(G, k.FR_POOL_DAYS[0], k.FR_POOL_DAYS[1]); }
    if (unlocked(S, 'factory') && !G.fac && !G.facSites.length) genFacSites(S);
    if (unlocked(S, 'flag') && !G.flag && !G.flagSites.length) genFlagSites(S);
    G.fr.cand = G.fr.cand.filter((c) => c.until >= D);
  }
  // 1-го числа (до месячного расчёта движка): постоянные расходы направлений за закончившийся месяц, мука, контракты, франшиза
  function monthEnd(S, t) {
    const G = S.growth, k = K();
    const fc = facMonthCost(S);
    if (G.fac) { cost(S, 'factory', fc.rent, 'rent'); cost(S, 'factory', fc.pay || 0, 'payroll'); cost(S, 'factory', fc.util || 0, 'util'); cost(S, 'factory', fc.maint || 0, 'upkeep'); }
    const fl = flagMonthCost(S);
    if (G.flag) { cost(S, 'flag', fl.rent, 'rent'); cost(S, 'flag', fl.pay || 0, 'payroll'); cost(S, 'flag', fl.util || 0, 'util'); cost(S, 'flag', fl.tour || 0, 'marketing'); }
    if (G.cat.team) cost(S, 'cater', k.CAT_TEAM_MONTH * pl(S), 'payroll');
    const nOpen = G.fr.list.filter((f) => f.status === 'open').length;
    if (nOpen) cost(S, 'fran', k.FR_CTRL[G.fr.ctrl] * pl(S) * nOpen, 'upkeep');
    // мука
    G.flour = +clamp(G.flour + gauss(G) * k.FLOUR_SD + (1 - G.flour) * k.FLOUR_REVERT, k.FLOUR_RANGE[0], k.FLOUR_RANGE[1]).toFixed(3);
    if (G.fac && G.fac.status === 'open' && G.flour > 1.2 && !(G.fac.hedge && G.fac.hedge.until > S.day) && !G.flourWarn) { G.flourWarn = 1; I().toast(S, 'Мука подорожала', `Индекс цены муки ${G.flour.toFixed(2).replace('.', ',')} — изделия фабрики дороже. Можно закупить муку впрок во вкладке «Рост».`, 'warn'); }
    if (G.flour < 1.1) G.flourWarn = 0;
    // контракты: итоги месяца, страйки, окончание и продление
    for (const c of G.ret.list.slice()) {
      const fill = c.fillM[1] > 0 ? c.fillM[0] / c.fillM[1] : 1; c.lastFill = fill; c.fillM = [0, 0];
      if (fill < k.RET_FILL_OK) {
        c.strikes++;
        if (c.strikes >= k.RET_STRIKES) {
          G.ret.list = G.ret.list.filter((x) => x !== c); G.ret.ban[c.chain] = S.day + k.RET_BAN_DAYS; hitRating(S, k.RET_RATING_HIT);
          I().toast(S, `${c.name} расторгла контракт`, `Третий месяц недопоставок. Сеть год не будет с нами работать, покупатели запомнили пустые полки (−${String(k.RET_RATING_HIT).replace('.', ',')}★ точкам).`, 'bad');
          I().log(S, `Контракт с ${c.name} расторгнут из-за недопоставок.`, 'bad');
          continue;
        }
        I().toast(S, `${c.name}: недопоставка`, `Поставили ${Math.round(fill * 100)}% за месяц — предупреждение ${c.strikes} из ${k.RET_STRIKES}. Нужна мощность: фабрика или меньше обязательств.`, 'warn');
      }
      if (S.day >= c.end) {
        G.ret.list = G.ret.list.filter((x) => x !== c);
        I().log(S, `Контракт с ${c.name} завершён: выручка за год ${fm(c.total)}.`, 'info');
        if (c.strikes === 0 && ufaOn(S)) { // хороший поставщик — сеть сама предлагает продлить и больше
          const o = genRetOffer(S, chainOf(c.chain)); if (o) { o.units = Math.round(c.units * rr(G, 1.0, 1.15) / 100) * 100; o.price = +(c.price * rr(G, 1.0, 1.04)).toFixed(2); o.renew = true; I().toast(S, `${c.name} предлагает продлить`, `Контракт закончился без нареканий: сеть хочет ${o.units.toLocaleString('ru-RU')} изделий в день.`, 'good'); }
        }
      }
    }
    // франшиза: скандалы (событие g01), итоги
    if (nOpen) {
      for (const f of G.fr.list) {
        if (f.status !== 'open') continue;
        const q = frQ(S, f), p = k.FR_SCANDAL_P * Math.pow(1 - q, 2);
        if (rnd(G) < p && !(S.ev.queue || []).some((x) => x.id === 'g01')) { G.evFr = f.id; queueEvent(S, 'g01', ri(G, 1, 6)); f.scandals++; G.fr.scandals++; break; }
      }
    }
    for (const f of G.fr.list) { f.lastSales = f.sales - (f.sales0 || 0); f.lastInc = f.inc - (f.inc0 || 0); f.sales0 = f.sales; f.inc0 = f.inc; }
    // закрыть месяц
    const prev = E().dateOf(S.day);
    const pr = {}; for (const ch of ['cater', 'flag', 'retail', 'fran']) pr[ch] = (G.m.rev[ch] || 0) - (G.m.cost[ch] || 0);
    pr.factory = -(G.m.cost.factory || 0) + G.m.netCut;
    G.last = { y: prev.y, m: prev.m, rev: Object.assign({}, G.m.rev), cost: Object.assign({}, G.m.cost), pr, fines: G.m.fines, netCut: G.m.netCut, units: G.m.units, recv: recvTotal(S) };
    G.hist.push({ y: prev.y, m: prev.m, r: Math.round(sumRev(G.m.rev)), p: Math.round(pr.cater + pr.flag + pr.retail + pr.fran + pr.factory) });
    if (G.hist.length > 36) G.hist.shift();
    G.m = blankM();
  }
  const sumRev = (r) => (r.cater || 0) + (r.flag || 0) + (r.retail || 0) + (r.fran || 0);

  /* ---------------- события направлений (followUp; ставятся в очередь) ---------------- */
  const GEV = [
    { id: 'g01', kind: 'neg', followUp: true, weight: 0, scope: 'global', title: 'Франчайзи опозорил бренд',
      text: 'Видео с грязной кухни франчайзи под вашей вывеской разошлось по городским пабликам. Гости не различают, где ваша точка, а где партнёр.',
      choices: [
        { label: 'Расторгнуть договор', desc: 'Жёстко и быстро: бренд отмоется, но роялти этой точки пропадут (без компенсации — нарушил договор).', cost: 0, effects: [{ t: 'traffic', m: 0.98, d: 30 }], g: [{ t: 'frClose' }] },
        { label: 'Штраф, аудит и обучение', desc: 'Проверяем кухню, учим команду партнёра: качество точки заметно вырастет.', cost: 1500000, effects: [{ t: 'traffic', m: 0.97, d: 45 }], g: [{ t: 'frFix', add: 0.2 }] },
        { label: 'Промолчать', desc: 'Бесплатно, но гости запомнят: рейтинг сети просядет, а история может всплыть снова.', cost: 0, effects: [{ t: 'traffic', m: 0.94, d: 75 }, { t: 'schedule', id: 'g02', after: [60, 150], p: 0.5 }], g: [{ t: 'rating', d: 0.15 }, { t: 'frHit' }] },
      ] },
    { id: 'g02', kind: 'neg', followUp: true, weight: 0, scope: 'global', title: 'Скандал с франчайзи вернулся',
      text: 'Журналисты нашли старую историю с франчайзи и сделали большой материал «Что скрывает сеть». Гостей стало заметно меньше.',
      effects: [{ t: 'traffic', m: 0.93, d: 60 }] },
    { id: 'g03', kind: 'neg', followUp: true, weight: 0, scope: 'global', title: 'Поломка на фабрике',
      text: 'Встала главная тестомесильная линия. Пока фабрика стоит, полки и заказы снабжают обычные цеха — если успеют.',
      choices: [
        { label: 'Срочный ремонт с выездом сервиса', desc: 'Дорого, зато через 3 дня линия снова работает.', cost: 6000000, effects: [], g: [{ t: 'down', d: 3 }] },
        { label: 'Своими силами', desc: 'Дёшево, но простоим ~10 дней: полки и франчайзи будут недополучать.', cost: 1500000, effects: [], g: [{ t: 'down', d: 10 }] },
        { label: 'Остановить на полную ревизию', desc: '2 недели простоя, зато год поломок будет вдвое меньше.', cost: 4000000, effects: [], g: [{ t: 'down', d: 14 }, { t: 'revision' }] },
      ] },
  ];
  function queueEvent(S, id, after) {
    if (!S.ev.queue) S.ev.queue = [];
    if (S.ev.queue.some((x) => x.id === id)) return;
    S.ev.queue.push({ id, day: S.day + 1 + (after || 0), tg: { scope: 'global', target: null } });
  }
  function applyG(S, inst, idx) {
    const def = GEV.find((e) => e.id === inst.id), G = ensure(S);
    const ch = def && def.choices ? def.choices[idx] || def.choices[def.choices.length - 1] : null;
    if (!ch || !ch.g) return;
    const f = G.fr.list.find((x) => x.id === G.evFr);
    for (const e of ch.g) {
      if (e.t === 'frClose' && f) closeFran(S, f.id, true);
      if (e.t === 'frFix' && f) { f.q = clamp(f.q + e.add, 0, 0.95); f.seen = clamp(Math.round(f.q * 10) / 2, 1, 5); }
      if (e.t === 'frHit' && f) f.hit = S.day + 90;
      if (e.t === 'rating') hitRating(S, e.d);
      if (e.t === 'down' && G.fac) G.fac.down = S.day + e.d;
      if (e.t === 'revision' && G.fac) G.fac.revUntil = S.day + 365;
    }
  }
  function prepEventText(S) { // имя партнёра — в тексте события (текст фиксируется в момент показа)
    const G = S.growth, q = S.ev.queue || []; if (!q.some((x) => x.id === 'g01')) return;
    const f = G.fr.list.find((x) => x.id === G.evFr), def = GEV[0];
    def.text = f ? `Видео с грязной кухни франчайзи ${f.partner} (${f.address}, ${(dist(f.district) || {}).name || 'Уфа'}) разошлось по городским пабликам. Гости не различают, где ваша точка, а где партнёр.` : def.text;
  }
  // бот: выбор в событиях направлений
  function botChoice(S, inst, level) {
    const G = S.growth;
    if (inst.id === 'g01') return level === 'good' ? (S.cash > 3e6 * pl(S) ? 1 : 0) : level === 'avg' ? 2 : 2;
    if (inst.id === 'g03') { const heavy = retUnits(S) > facCap(S) * 0.4 || (G.cat.acc.length > 0); return level === 'good' ? (heavy ? 0 : 1) : 1; }
    return 0;
  }

  /* ---------------- сводка для интерфейса и ботов ---------------- */
  function monthFee(S) { // постоянные расходы направлений 1-го числа (для «К 1-му числу не хватит»)
    const G = S.growth; if (!G || !anyUnlocked(S)) return 0;
    const k = K(); let x = facMonthCost(S).total + flagMonthCost(S).total + (G.cat.team ? k.CAT_TEAM_MONTH * pl(S) : 0);
    x += k.FR_CTRL[G.fr.ctrl] * pl(S) * G.fr.list.filter((f) => f.status === 'open').length;
    return x;
  }
  function summary(S) {
    const G = ensure(S), L = G.last;
    const n = KEYS.filter((k) => unlocked(S, k)).length;
    const active = (G.cat.acc.length || G.cat.done ? 1 : 0) + (G.flag ? 1 : 0) + (G.fac ? 1 : 0) + (G.ret.list.length ? 1 : 0) + (G.fr.list.length ? 1 : 0);
    return { unlocked: n, active, last: L || null, recv: recvTotal(S), fr: G.fr.list.length, frOpen: G.fr.list.filter((f) => f.status === 'open').length, contracts: G.ret.list.length,
      rev: L ? sumRev(L.rev) : 0, profit: L ? L.pr.cater + L.pr.flag + L.pr.retail + L.pr.fran + L.pr.factory : 0 };
  }
  function nextUnlock(S) { // ближайшее закрытое направление и условие
    const G = ensure(S), U = K().UNLOCK;
    for (const k of KEYS) if (G.un[k] == null) return { key: k, name: NAMES[k], stores: U[k].stores, rev: U[k].rev, have: ufaStores(S), rolling: E().rolling12(S) };
    return null;
  }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__growth) return;
    Eng.__growth = true;
    if (BK.EVENTS) for (const e of GEV) if (!BK.EVENTS.some((x) => x.id === e.id)) BK.EVENTS.push(e);
    const origTick = Eng.tick;
    Eng.tick = function (S) {
      if (S && on() && S.phase === 'play' && !S.ev.pending && !S.chef.pending && !S.lost) { pre(S); prepEventText(S); }
      return origTick.apply(this, arguments);
    };
    const origRes = Eng.resolveEvent;
    Eng.resolveEvent = function (S, idx) {
      const inst = S && S.ev && S.ev.pending, g = inst && /^g\d\d$/.test(inst.id) ? inst : null;
      const r = origRes.apply(this, arguments);
      if (g) applyG(S, g, idx);
      return r;
    };
  }
  wrap();

  BK.Growth = { KEYS, NAMES, ensure, unlocked, anyUnlocked, ufaOn, ufaStores, summary, nextUnlock, monthFee, capPlan, recvTotal,
    facBuildCost, buildFactory, expandFactory, facExpCost, setMaint, setSemis, hedge, hedgeCost, facCap, facUp, facUnit, facMonthCost, flourK,
    acceptContract, declineOffer, retUnits, brandPrice, chainOf,
    signFran, closeFran, setControl, frQ, frSalesDay,
    flagBuildCost, buildFlag, setTour, flagDay, flagMonthCost, flagRamp,
    acceptOrder, declineOrder, hireTeam, orderValue, catPlanLoad,
    botChoice, GEV, _rnd: rnd, _pre: pre };
})();
