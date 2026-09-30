/* =====================================================================
   УПРАВЛЯЮЩИЕ ТОЧЕК (решение владельца 01.10.2026, docs/vision-plan.md §5 п. 4, этап В6 «Меньше рутины»).
   С 5 открытых точек игрок может нанять управляющего (позже — нескольких, у каждого свой набор точек, 8–10 на одного).
   Управляющий НИЧЕГО НЕ ДЕЛАЕТ САМ: раз в N дней он приносит 0–3 предложения на согласование — «Сделать / Не делать».
   «Сделать» сразу исполняет действие через обычные функции движка (BK.Engine: setPay, hire, train, startRepair, setBake,
   setPrice, setAlloc, setAggStore…) — ровно то же, что игрок сделал бы руками. Не ответил за срок — предложение сгорает.
   Качества управляющего:
     наблюдательность (obs 0..1) — сколько проблем замечает и насколько рано (порог SENS_HI…SENS_LO, вероятность заметить);
     точность (acc 0..1)         — доля правильных советов: слабый иногда советует лишнее или вредное (лишний найм при
                                   нормальной загрузке, «печь больше» при списаниях, прибавку сверх рынка, доставку на
                                   перегруженную точку, скидку там, где меню и так по карману);
     частота докладов (freq, дн.).
   Чем лучше управляющий — тем выше оклад (рынок кандидатов, × уровень цен). Найм — 2 оклада, увольнение — 1 оклад.
   Анализ проблем — общий с личными тренерами: BK.Trainers.analyze(S) (+ свои проверки вакансий и доставки).
   Состояние: S.managers = { v, rng, ids, list[], cand[], candDay, props[], done[], ld{}, spent } — старые сохранения
   и боты без управляющих: ensure() ставит пустое; до 5 точек ничего не создаётся. Свой ГСЧ (S.managers.rng):
   основной поток игры не сдвигается — боты первого акта побайтно прежние.
   Числа — BK.CFG.MANAGERS (config.js). Интерфейс — src/ui/managers-ui.js (BK.ManagersUI). Проверка — sim/managers.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, K = () => BK.CFG.MANAGERS;
  const fm = (v) => BK.fmtMoney(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const pc = (v) => Math.round(v * 100) + '%';
  const round5 = (v) => Math.round(v / 5000) * 5000;

  /* ---------------- свой ГСЧ (mulberry32, как в движке, но на S.managers.rng) ---------------- */
  function rnd(R) {
    let t = (R.rng = (R.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (R, a) => a[Math.floor(rnd(R) * a.length)];

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S.managers || typeof S.managers !== 'object') S.managers = {};
    const R = S.managers;
    if (R.v == null) R.v = 1;
    if (R.rng == null) R.rng = ((S.seed | 0) ^ 0x5a17c3) | 0;
    if (R.ids == null) R.ids = 0;
    for (const k of ['list', 'cand', 'props', 'done']) if (!Array.isArray(R[k])) R[k] = [];
    if (!R.ld || typeof R.ld !== 'object') R.ld = {};
    if (R.candDay == null) R.candDay = -1e9;
    if (R.spent == null) R.spent = 0;
    return R;
  }
  const openStores = (S) => S.stores.filter((st) => st.status !== 'opening');
  const unlocked = (S) => !!S && S.phase === 'play' && openStores(S).length >= K().UNLOCK_STORES;
  const any = (S) => !!(S && S.managers && S.managers.list && S.managers.list.length);
  const nid = (R, p) => p + (++R.ids);

  /* ---------------- кандидаты ---------------- */
  const BIOS = [
    // слабые (q < 0,4)
    [(g) => `Два года ${g('администратором', 'администратором')} в торговом центре, в пекарне не ${g('работал', 'работала')}.`,
      (g) => `${g('Вёл', 'Вела')} смену в фастфуде у вокзала, хочет попробовать себя на точках.`,
      (g) => `Недавно из колледжа сервиса, ${g('подрабатывал', 'подрабатывала')} продавцом в «Хлебном дворе».`,
      (g) => `Семь лет на рынке в Черниковке — торговать умеет, людьми ${g('руководил', 'руководила')} мало.`],
    // средние
    [(g) => `Пять лет ${g('управлял', 'управляла')} кофейней на проспекте Октября, знает сезоны Уфы.`,
      (g) => `Старший смены в сетевой пекарне: считает списания, сам${g('', 'а')} закрывает дыры в графике.`,
      (g) => `${g('Руководил', 'Руководила')} тремя точками фастфуда в Сипайлово, ушёл${g('', 'ла')} за ростом.`,
      (g) => `Бывший администратор ресторана на Ленина — строгий${g('', 'ая')}, но команда держится.`],
    // сильные
    [(g) => `Восемь лет в федеральной сети пекарен, ${g('вёл', 'вела')} 12 точек в Казани, вернул${g('ся', 'ась')} в Уфу.`,
      (g) => `Операционный менеджер сети кофеен: замечает проблему раньше, чем она попадёт в отчёт.`,
      (g) => `${g('Открывал', 'Открывала')} пекарни-кафе в Екатеринбурге с нуля, любит цифры и людей.`,
      (g) => `Бывший тренер сервиса «Хлебного двора» — ${g('ушёл', 'ушла')}, когда там перестали слушать продавцов.`],
  ];
  function makeCand(S, R, q) {
    const cfg = K(), f = rnd(R) < 0.5;
    const first = pick(R, f ? BK.NAMES_F : BK.NAMES_M);
    let sur = pick(R, BK.SURNAMES); if (f) sur = sur.endsWith('ин') || sur.endsWith('ов') || sur.endsWith('ев') ? sur + 'а' : sur;
    const name = `${first} ${sur}`;
    const obs = clamp(0.18 + 0.78 * q + (rnd(R) - 0.5) * 0.22, 0.12, 0.97);
    const acc = clamp(0.5 + 0.47 * q + (rnd(R) - 0.5) * 0.2, 0.45, 0.98);
    const freq = q > 0.7 ? pick(R, [7, 7, 10]) : q > 0.4 ? pick(R, [10, 10, 14]) : pick(R, [14, 21]);
    const g = (m, w) => (f ? w : m);
    const bio = pick(R, BIOS[q < 0.4 ? 0 : q < 0.7 ? 1 : 2])(g);
    const jit = 1 + (rnd(R) * 2 - 1) * cfg.SAL_JITTER;
    return { id: nid(R, 'm'), name, female: f, bio, obs: +obs.toFixed(2), acc: +acc.toFixed(2), freq, sal0: round5(salaryFor(obs, acc, freq) * jit) };
  }
  // оклад в ценах 2027 по качеству (рынок): score 0,3…0,95 → SAL_MIN…SAL_MAX
  function score(obs, acc, freq) { const F = K().FREQ; return 0.45 * obs + 0.4 * acc + 0.15 * (F[F.length - 1] - freq) / (F[F.length - 1] - F[0]); }
  function salaryFor(obs, acc, freq) {
    const k = K(), x = clamp((score(obs, acc, freq) - 0.3) / 0.65, 0, 1);
    return k.SAL_MIN + (k.SAL_MAX - k.SAL_MIN) * Math.pow(x, 1.4);
  }
  const salary = (S, m) => Math.round(m.sal0 * S.macro.priceLevel / 1000) * 1000;
  const hireCost = (S, m) => salary(S, m) * K().HIRE_SALARIES;
  function refreshCand(S, force) {
    const R = ensure(S), k = K();
    if (!force && S.day - R.candDay < k.POOL_DAYS && R.cand.length) return;
    R.candDay = S.day;
    // один послабее, один средний, один сильный — в случайном порядке; иногда кто-то уже ушёл к другим (2 кандидата)
    const bands = [[0.05, 0.38], [0.4, 0.68], [0.7, 0.98]];
    const out = bands.map((b) => makeCand(S, R, b[0] + (b[1] - b[0]) * rnd(R)));
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd(R) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    if (k.POOL < 3 || rnd(R) < 0.25) out.pop();
    R.cand = out;
  }
  // сколько управляющих можно держать: по одному на каждые STORES_PER точек (округление вверх)
  const maxManagers = (S) => Math.max(1, Math.ceil(S.stores.length / K().STORES_PER));
  const capOf = (m) => K().STORES_PER + Math.round(K().CAP_OBS * m.obs);
  function whyNot(S, candId) {
    if (!S || S.phase !== 'play') return 'Сначала откройте точки';
    if (!unlocked(S) && !any(S)) return `Управляющий нужен сети от ${K().UNLOCK_STORES} открытых точек`;
    const R = ensure(S), c = R.cand.find((x) => x.id === candId);
    if (!c) return 'Кандидат уже ушёл';
    if (R.list.length >= maxManagers(S)) return R.list.length === 1 ? `Один управляющий справляется с сетью до ${K().STORES_PER} точек — второй понадобится позже` : `Сейчас хватит ${R.list.length} управляющих — по одному на ${K().STORES_PER} точек`;
    if (S.cash < hireCost(S, c)) return 'Не хватает денег на счёте';
    return null;
  }
  function hire(S, candId) {
    const why = whyNot(S, candId); if (why) return { ok: false, msg: why };
    const R = ensure(S), c = R.cand.find((x) => x.id === candId), I = E()._int;
    const cost = hireCost(S, c);
    I.spend(S, cost, 'hire'); R.spent += cost;
    R.cand = R.cand.filter((x) => x.id !== candId);
    const m = Object.assign({}, c, { hiredDay: S.day, next: S.day + Math.min(7, c.freq), st: { prop: 0, yes: 0, no: 0, exp: 0, good: 0, bad: 0, val: 0 } });
    R.list.push(m);
    I.log(S, `Нанят управляющий: ${m.name}. Оклад ${fm(salary(S, m))} в месяц, доклад раз в ${m.freq} дн. Найм — ${fm(cost)}.`, 'good');
    return { ok: true, m, cost };
  }
  function fire(S, mid) {
    const R = ensure(S), m = R.list.find((x) => x.id === mid); if (!m) return { ok: false, msg: 'Нет такого управляющего' };
    const comp = salary(S, m) * K().FIRE_SALARIES, I = E()._int;
    I.spend(S, comp, 'upkeep'); R.spent += comp;
    R.list = R.list.filter((x) => x !== m);
    R.props = R.props.filter((p) => p.mid !== mid);
    I.log(S, `Управляющий ${m.name} уволен${m.female ? 'а' : ''} с компенсацией ${fm(comp)}.`, 'warn');
    return { ok: true, comp };
  }
  const monthFee = (S) => { let s = 0; for (const m of (S && S.managers && S.managers.list) || []) s += salary(S, m); return s; };

  /* ---------------- кто за какие точки отвечает ----------------
     Точки по номерам делятся поровну между управляющими (каждый — не больше своей вместимости 8–10);
     лишние точки — «без присмотра» (подсказка нанять ещё одного). */
  function coverage(S) {
    const R = S.managers, map = {}, list = S.stores.slice().sort((a, b) => a.num - b.num);
    let i = 0;
    const ms = (R && R.list) || [];
    for (let k = 0; k < ms.length; k++) {
      const m = ms[k], left = ms.length - k, share = Math.min(capOf(m), Math.ceil((list.length - i) / left));
      map[m.id] = list.slice(i, i + share).map((st) => st.id); i += share;
    }
    return { map, free: list.slice(i).map((st) => st.id) };
  }
  function managerOf(S, storeId) {
    if (!any(S)) return null;
    const cv = coverage(S);
    for (const m of S.managers.list) if (cv.map[m.id].indexOf(storeId) >= 0) return m;
    return null;
  }

  /* ---------------- предложения ----------------
     { id, mid, kind, key, storeId, title, why (слова управляющего), fact (факты, чтобы проверить), cost (сразу), monthly (в месяц),
       fx: {team, guests, check} (-3..3, по мнению управляющего), act: {...}, right (верный ли совет — скрыто), val (оценка ₽/мес),
       day, until, st: open | yes | no | exp } */
  const ldOf = (S, st) => { const v = S.managers && S.managers.ld[st.id]; return v != null ? v : st.today && !st.today.closed ? st.today.load : 0; };
  const sellers = (S) => { let n = 0; for (const st of S.stores) n += st.staff.length; return n; };
  const tax = () => 1 + C().PAYROLL_TAX;
  const stName = (st) => `№${st.num}`;
  const lvlWord = (n) => `${n}-го уровня`;

  function mkPay(S, why, fact, right, val) {
    const nv = Math.round(S.market.seller * (1 + K().PAY_UP) / 1000) * 1000;
    if (nv <= S.pay.seller) return null;
    const monthly = (nv - S.pay.seller) * sellers(S) * tax();
    return { kind: 'pay', key: 'pay', storeId: null, title: `Поднять зарплату продавцов до ${fm(nv)}`, why, fact: `${fact} Рынок ${fm(S.market.seller)}, у нас ${fm(S.pay.seller)} · продавцов ${sellers(S)}.`, cost: 0, monthly, fx: { team: 2, guests: 0, check: 0 }, act: { v: nv }, right, val: right ? val - monthly * 0.4 : -monthly * 0.7 };
  }
  function mkTrainEmp(S, st, e, why, right, val) {
    if (!e || e.lvl >= C().MAX_LVL) return null;
    const cost = E().trainCost(S, e.lvl + 1), extra = (E().salaryOf(S, e.lvl + 1) - E().salaryOf(S, e.lvl)) * tax();
    return { kind: 'trainEmp', key: 'train:' + e.id, storeId: st.id, title: `Отправить на обучение: ${e.name}, ${stName(st)}`, why, fact: `${e.name}: ${BK.STAFF_LVL_NAMES[e.lvl].toLowerCase()} (${lvlWord(e.lvl)}), настроение ${Math.round(e.mood)} · после обучения — ${lvlWord(e.lvl + 1)}, оклад +${fm(extra)}.`, cost, monthly: extra, fx: { team: 1, guests: 1, check: 1 }, act: { st: st.id, e: e.id }, right, val: right ? val - extra : -cost / 12 - extra };
  }
  function mkHire(S, st, n, extra, why, right, val) {
    const sz = C().SIZES[st.size];
    n = Math.min(n, sz.staffMax - st.staff.length - st.incoming.length); if (n <= 0) return null;
    const cost = E().hireCost(S, 1) * n, monthly = E().salaryOf(S, 1) * tax() * n;
    const load = ldOf(S, st);
    return { kind: extra ? 'hireExtra' : 'hire', key: 'hire:' + st.id, storeId: st.id, title: extra ? `Добавить продавца в штат ${stName(st)} и нанять` : `Нанять ${n} ${plural(n, 'продавца', 'продавцов', 'продавцов')} на ${stName(st)}`, why,
      fact: `${stName(st)}: штат ${st.staff.length}${st.incoming.length ? '+' + st.incoming.length : ''} из ${st.staffTarget} (формат ${sz.staffMin}–${sz.staffMax}), загрузка команды ${pc(load)}.`, cost, monthly, fx: { team: 2, guests: extra ? 1 : 2, check: 0 }, act: { st: st.id, n, extra: !!extra }, right, val: right ? val - monthly : -monthly - cost / 12 };
  }
  function mkTrainStore(S, st, why, right, val, upTo) {
    const list = st.staff.filter((e) => e.lvl < (upTo || 3));
    if (!list.length) return null;
    let cost = 0, extra = 0; for (const e of list) { cost += E().trainCost(S, e.lvl + 1); extra += (E().salaryOf(S, e.lvl + 1) - E().salaryOf(S, e.lvl)) * tax(); }
    return { kind: 'trainStore', key: 'trains:' + st.id, storeId: st.id, title: `Обучить команду ${stName(st)}: ${list.length} ${plural(list.length, 'человек', 'человека', 'человек')}`, why, fact: `${stName(st)}: средний уровень ${(st.staff.reduce((a, e) => a + e.lvl, 0) / st.staff.length).toFixed(1).replace('.', ',')} из 5, загрузка ${pc(ldOf(S, st))} · каждый — на ступень выше, оклады +${fm(extra)}/мес.`, cost, monthly: extra, fx: { team: 1, guests: 1, check: 2 }, act: { st: st.id, ids: list.map((e) => e.id) }, right, val: right ? val - extra : -cost / 12 - extra };
  }
  function mkRepair(S, st, why, right, val) {
    const r = C().REPAIRS[st.repair + 1]; if (!r || st.status !== 'open') return null;
    const cost = E().repairCost(S, st);
    return { kind: 'repair', key: 'repair:' + st.id, storeId: st.id, title: `Ремонт «${r.name}» на ${stName(st)}`, why, fact: `${stName(st)}: ремонт ${st.repair}/3 · точка закроется на ${r.days} дн. · выручка ${st.last ? fm(st.last.rev) : '—'}/мес.`, cost, monthly: 0, fx: { team: 0, guests: 2, check: 2 }, act: { st: st.id }, right, val: right ? val : -cost / 24 - (st.last ? st.last.rev * r.days / 30 / 12 : 0) };
  }
  function mkPrice(S, why, right, val) {
    const ms = E().menuStats(S);
    const top = S.menu.slice().sort((a, b) => (b.pm * ((E().byId(BK.PRODUCTS, b.id) || {}).price || 0)) - (a.pm * ((E().byId(BK.PRODUCTS, a.id) || {}).price || 0)))[0];
    if (!top || top.pm - K().PRICE_CUT < C().PRICE_MIN) return null;
    const p = E().byId(BK.PRODUCTS, top.id);
    return { kind: 'price', key: 'price:' + top.id, storeId: null, title: `Снизить цену: ${p ? p.name : 'позиция'} (−${Math.round(K().PRICE_CUT * 100)}%)`, why, fact: `Корзина по меню ≈ ${Math.round(ms.avgPrice * C().ITEMS_PER_CHECK)} ₽ · цена позиции ×${top.pm.toFixed(2).replace('.', ',')} от рекомендованной.`, cost: 0, monthly: 0, fx: { team: 0, guests: 2, check: -1 }, act: { id: top.id, pm: +(top.pm - K().PRICE_CUT).toFixed(2) }, right, val };
  }
  function mkBake(S, dir, why, fact, right, val) {
    const W = E().wasteState(S), nv = clamp((W.bake | 0) + dir, -3, 3); if (nv === (W.bake | 0)) return null;
    const L = C().BAKE_LEVELS[nv + 3];
    return { kind: 'bake', key: 'bake', storeId: null, title: `«Сколько печь»: ${L.name.toLowerCase()}`, why, fact, cost: 0, monthly: 0, fx: { team: 0, guests: dir > 0 ? 1 : 0, check: 0 }, act: { v: nv }, right, val };
  }
  function mkAgg(S, st, on, why, right, val) {
    const cost = on ? E().aggConnectCost(S, st) : 0;
    return { kind: on ? 'aggOn' : 'aggOff', key: 'agg:' + st.id, storeId: st.id, title: on ? `Подключить доставку на ${stName(st)}` : `Отключить доставку на ${stName(st)}`, why, fact: `${stName(st)}: загрузка команды ${pc(ldOf(S, st))}, рейтинг ${E().storeRating(S, st).toFixed(1).replace('.', ',')}★, комиссия агрегатора ${Math.round(E().aggCommission(S) * 100)}%.`, cost, monthly: 0, fx: { team: on ? -1 : 1, guests: on ? 2 : -1, check: 0 }, act: { st: st.id, on }, right, val: right ? val : on ? -(st.last ? st.last.rev * 0.02 : 0) - cost / 12 : -(st.last ? st.last.rev * 0.03 : 0) };
  }
  function mkMkt(S, why, right, val) {
    return { kind: 'mkt', key: 'mkt', storeId: null, title: `Направлять ${Math.round(K().MKT * 100)}% прибыли на маркетинг`, why, fact: `Сейчас на маркетинг ${Math.round(S.alloc.marketing * 100)}% прибыли, резерв ${Math.round(S.alloc.reserve * 100)}%, премии ${Math.round(S.alloc.bonus * 100)}%.`, cost: 0, monthly: 0, fx: { team: 0, guests: 1, check: 0 }, act: { v: K().MKT }, right, val };
  }

  function mkEve(S, why, fact, right, val) {
    return { kind: 'eve', key: 'eve', storeId: null, title: 'Вечерняя скидка 30% на остатки', why, fact, cost: 0, monthly: 0, fx: { team: 0, guests: 1, check: 0 }, act: { v: 1 }, right, val };
  }
  function mkCulture(S, why, right, val) {
    const nx = C().CULTURE[S.culture + 1]; if (!nx) return null;
    const pl = S.macro.priceLevel, n = E().allStaff(S) + E().bakersTotal(S);
    const cost = Math.round(nx.cost * pl), monthly = (nx.upkeep - C().CULTURE[S.culture].upkeep) * n * pl;
    return { kind: 'culture', key: 'culture', storeId: null, title: `Корпоративная культура: «${nx.name}»`, why, fact: `Сейчас «${C().CULTURE[S.culture].name}» · настроение +${nx.mood - C().CULTURE[S.culture].mood} всем · ${n} чел. в команде.`, cost, monthly, fx: { team: 3, guests: 0, check: 0 }, act: {}, right, val: right ? val - monthly : -monthly - cost / 24 };
  }
  // верные предложения из найденных проблем (анализ — общий с тренерами)
  function fromProblem(S, p, st) {
    const cfg = C();
    const edge = st ? st.staff.filter((e) => e.mood < cfg.MOOD_UNHAPPY + 6).sort((a, b) => a.mood - b.mood) : [];
    const fat = st && st.staff.length ? st.staff.reduce((a, e) => a + e.fatigue, 0) / st.staff.length : 0;
    const sz = st ? cfg.SIZES[st.size] : null, vac = st ? E().vacancies(st) : 0;
    const val = Math.max(0, p.impact || 0) * 0.6;
    switch (p.kind) {
      case 'quit': case 'mood': {
        const gap = S.pay.seller / S.market.seller - 1;
        if (vac > 0) return mkHire(S, st, vac, false, `На ${stName(st)} не хватает людей — оставшиеся устают и недовольны.`, true, val + E().hireCost(S, 1) * 0.3);
        if (fat > 45 && st.staffTarget < sz.staffMax) return mkHire(S, st, 1, true, `На ${stName(st)} люди вымотаны очередями — ${edge.length ? edge.length + ' чел. на грани увольнения' : 'настроение падает'}. Нужен ещё продавец.`, true, val);
        if (gap < 0.03) return mkPay(S, `На ${stName(st)} ${edge.length > 1 ? edge.length + ' чел. на грани увольнения' : 'человек на грани увольнения'}: зарплата не дотягивает. Прибавка удержит людей по всей сети.`, `${edge[0] ? edge[0].name + ': настроение ' + Math.round(edge[0].mood) + '.' : ''}`, true, val * 2);
        if (edge[0] && edge[0].lvl < cfg.MAX_LVL) return mkTrainEmp(S, st, edge[0], `${edge[0].name} на грани увольнения. Обучение — шаг вверх и настроение +6: так удержим.`, true, val);
        if (cfg.CULTURE[S.culture + 1] && S.cash > cfg.CULTURE[S.culture + 1].cost * S.macro.priceLevel * 2) return mkCulture(S, `На ${stName(st)} люди на грани, хотя платим выше рынка и все обучены. Держит только культура — она поднимет настроение всем.`, true, val * 2);
        return null;
      }
      case 'chain': return vac > 0 ? mkHire(S, st, vac, false, `На ${stName(st)} ${vac} ${plural(vac, 'вакансия', 'вакансии', 'вакансий')} — команда выматывается, скоро начнут уходить.`, true, val + (st.last ? st.last.rev * 0.03 : 0)) : null;
      case 'vac': return mkHire(S, st, vac, false, `На ${stName(st)} ${vac} ${plural(vac, 'вакансия', 'вакансии', 'вакансий')} уже ${p.days} дн. — без людей точка теряет гостей.`, true, val);
      case 'queue': {
        if (vac > 0) return mkHire(S, st, vac, false, `На ${stName(st)} очереди: гости уходят, а в смене не хватает ${vac}.`, true, val);
        if (st.staffTarget < sz.staffMax) return mkHire(S, st, 1, true, `На ${stName(st)} очереди: гости уходят, не дождавшись. Ещё один продавец окупится.`, true, val);
        return mkTrainStore(S, st, `На ${stName(st)} очереди, а штат уже максимальный — опытные обслуживают больше гостей.`, true, val, cfg.MAX_LVL);
      }
      case 'check': {
        if (/обуч/.test(p.cause)) return mkTrainStore(S, st, `На ${stName(st)} низкий средний чек: продавцы не допродают.`, true, val);
        if (/ремонт|интерьер/.test(p.cause)) return mkRepair(S, st, `На ${stName(st)} ${p.cause.replace(/^низкий средний чек: /, '')}.`, true, val);
        if (/дороже/.test(p.cause)) { // цена общая на сеть: снижать, только если меню дороже кошелька у большинства точек и команды не перегружены
          const B = E().menuStats(S).avgPrice * cfg.ITEMS_PER_CHECK, os = S.stores.filter((x) => x.status === 'open' && x.last);
          const dear = os.filter((x) => B > x.solv * S.macro.priceLevel * 1.03).length, ld = os.reduce((a, x) => a + ldOf(S, x), 0) / Math.max(1, os.length);
          if (dear * 2 < os.length || ld > 0.85) return null;
          const pr = mkPrice(S, `Меню дороже кошелька района на ${dear} из ${os.length} точек — гости уходят без покупки.`, true, val);
          return pr && pr.act.pm >= 1 - K().PRICE_CUT ? pr : null;
        }
        return null;
      }
      case 'rating': {
        const parts = E().ratingParts(S, st), w = cfg.RATING_W;
        const weak = ['train', 'repair', 'staff', 'mood'].sort((a, b) => w[b] * (5 - parts[b]) - w[a] * (5 - parts[a]))[0];
        const why = `У ${stName(st)} рейтинг на картах ${E().storeRating(S, st).toFixed(1).replace('.', ',')}★ — теряем новых гостей.`;
        if (weak === 'train') return mkTrainStore(S, st, why + ' Слабее всего — обучение.', true, val);
        if (weak === 'repair') return mkRepair(S, st, why + ' Слабее всего — ремонт.', true, val);
        if (weak === 'staff' && vac > 0) return mkHire(S, st, vac, false, why + ' Не хватает людей.', true, val);
        return null;
      }
      case 'waste': {
        const more = !/слишком много/.test(p.cause);
        return mkBake(S, more ? 1 : -1, more ? 'К вечеру витрины пустые — гости уходят без покупки.' : 'Выпечки слишком много — растут списания.', p.detail ? p.detail[0].toUpperCase() + p.detail.slice(1) + '.' : '', true, val);
      }
      case 'fc': return null; // цены ниже рекомендованных — решение за игроком
      case 'mkt': return mkMkt(S, 'Прибыль есть, а на новых гостей не идёт ни рубля.', true, val);
      case 'aggOff': return mkAgg(S, st, false, `${stName(st)} не успевает с заказами доставки: курьеры ждут, отзывы портятся.`, true, val);
      case 'aggOn': return mkAgg(S, st, true, `У ${stName(st)} есть запас команды и хороший рейтинг — доставка добавит заказов.`, true, val);
      case 'eve': return mkEve(S, 'Вечером витрины полные, утром — в списание. Скидка раскупит часть остатков.', p.fact, true, val);
      case 'culture': return mkCulture(S, `Люди держатся только за зарплату: среднее настроение ${p.mood}${p.quits ? `, за 3 месяца ${plural(p.quits, 'ушёл', 'ушли', 'ушли')} ${p.quits}` : ''}. Культура поднимет настроение всем — меньше увольнений и наймов.`, true, val);
      default: return null;
    }
  }
  // свои проверки: вакансии (рутина найма) и доставка по точкам
  function extraProblems(S, stores, network) {
    const out = [], cfg = C(), R = S.managers;
    if (network) {
      const W = E().wasteState(S), last = S.history[S.history.length - 1], lp = last && last.pnl;
      if (lp && lp.rev > 0 && lp.waste != null && !(W.disc | 0) && S.day >= E().discFreeDay(S)) {
        const sh = lp.waste / lp.rev;
        if (sh > 0.03) out.push({ kind: 'eve', key: 'eve', sev: 1 + (sh - 0.03) * 30, impact: lp.waste * 0.25, fact: `Прошлый месяц: списано ${fm(lp.waste)} (${(sh * 100).toFixed(1).replace('.', ',')}% выручки), вечерней скидки нет.` });
      }
      const nx = cfg.CULTURE[S.culture + 1], need = [0, 3, 8, 16, 28, 45][S.culture + 1];
      if (nx && need != null && S.stores.length >= need && S.cash > nx.cost * S.macro.priceLevel * 2) {
        let mood = 0, n = 0; for (const st of S.stores) for (const e of st.staff) { mood += e.mood; n++; }
        mood = n ? mood / n : 70;
        const q = R.qlog || [], quits = q.length >= 4 ? S.stats.quits - q[q.length - 4] : 0, turn = n ? quits * 4 / n : 0; // уволились за 3 месяца, в пересчёте на год
        if (mood < 66 || turn > 0.2) out.push({ kind: 'culture', key: 'culture', sev: 1 + Math.max((66 - mood) / 10, (turn - 0.2) * 5), impact: (S.lastMonthRev || 0) * 0.015 + E().hireCost(S, 1) * n * Math.max(0.02, turn * 0.3), mood: Math.round(mood), quits });
      }
    }
    for (const st of stores) {
      if (st.status === 'opening' || !st.last) continue;
      const vac = E().vacancies(st);
      if (vac > 0) {
        const since = R.ld['v' + st.id] != null ? S.day - R.ld['v' + st.id] : 0;
        out.push({ kind: 'vac', key: 'vac:' + st.id, storeId: st.id, sev: 0.8 + vac / Math.max(2, st.staffTarget) * 2 + since / 20, impact: st.last.rev * 0.04 * vac, days: since });
      }
      if (E().setAggStore && S.agg) {
        const load = ldOf(S, st), rate = E().aggCommission(S) + cfg.AGG_PACK;
        if (st.agg && load > 1.1 && E().storeRating(S, st) < 3.9 && st.staff.length + st.incoming.length >= cfg.SIZES[st.size].staffMax) out.push({ kind: 'aggOff', key: 'aggoff:' + st.id, storeId: st.id, sev: 1 + (load - 1) * 4, impact: st.last.rev * 0.02 });
        else if (!st.agg && st.status === 'open' && load < 0.7 && !(R.ld['off' + st.id] > S.day - 365) && E().storeRating(S, st) >= 3.8 && S.day - (st.openedDay || 0) > 60 && rate < 0.4) out.push({ kind: 'aggOn', key: 'aggon:' + st.id, storeId: st.id, sev: 0.9 + (0.8 - load), impact: st.last.rev * 0.03 });
      }
    }
    return out;
  }
  // лишние / вредные советы (слабая точность): выглядят правдоподобно, но факты под карточкой их выдают
  function wrongOne(S, R, stores) {
    const cfg = C(), opts = [];
    for (const st of stores) {
      if (st.status !== 'open' || !st.last || !st.staff.length) continue;
      const load = ldOf(S, st), sz = cfg.SIZES[st.size];
      if (load < 0.75 && st.staff.length + st.incoming.length < sz.staffMax && E().vacancies(st) === 0) opts.push(() => mkHire(S, st, 1, true, `На ${stName(st)} в час пик очередь — давайте ещё одного продавца.`, false, 0));
      if (!st.agg && S.agg && load > 1) opts.push(() => mkAgg(S, st, true, `${stName(st)} — сильная точка, доставка принесёт ещё больше.`, false, 0));
      const top = st.staff.slice().sort((a, b) => b.lvl - a.lvl)[0];
      if (top && top.lvl >= 3 && top.lvl < cfg.MAX_LVL && top.mood > 60) opts.push(() => mkTrainEmp(S, st, top, `${top.name} — лучший продавец, стоит вложиться ещё.`, false, 0));
      if (st.repair >= 1 && st.repair < 3 && st.last.rev < (S.lastMonthRev || 0) / Math.max(1, S.stores.length) * 0.8) opts.push(() => mkRepair(S, st, `${stName(st)} выглядит бледно — ремонт оживит.`, false, 0));
    }
    const W = E().wasteState(S), last = S.history[S.history.length - 1], lp = last && last.pnl;
    if (lp && lp.rev > 0 && lp.waste / lp.rev > 0.035 && (W.bake | 0) < 2) opts.push(() => mkBake(S, 1, 'Говорят, к вечеру круассанов нет — давайте печь больше.', `Прошлый месяц: списано ${fm(lp.waste)} (${(lp.waste / lp.rev * 100).toFixed(1).replace('.', ',')}% выручки).`, false, -lp.rev * 0.006));
    if (S.pay.seller >= S.market.seller * 1.04) opts.push(() => mkPay(S, 'Продавцы жалуются на деньги — давайте прибавим, пока не разбежались.', '', false, 0));
    const ms = E().menuStats(S), B = ms.avgPrice * cfg.ITEMS_PER_CHECK;
    let solv = 0, n = 0; for (const st of stores) if (st.status === 'open') { solv += st.solv * S.macro.priceLevel; n++; }
    if (n && B < solv / n * 0.85) opts.push(() => mkPrice(S, 'Гости говорят «дорого» — снизим цену на самую дорогую позицию.', false, -((S.lastMonthRev || 0) * 0.015)));
    while (opts.length) {
      const i = Math.floor(rnd(R) * opts.length), p = opts.splice(i, 1)[0]();
      if (p) return p;
    }
    return null;
  }

  function report(S, m, stores, network) {
    const R = S.managers, k = K(), T = BK.Trainers;
    const ids = new Set(stores.map((st) => st.id));
    const byId = (id) => S.stores.find((x) => x.id === id);
    const cool = (key) => R.props.some((p) => p.key === key && (p.st === 'open' || S.day - (p.ans || p.day) < k.COOLDOWN)) || R.done.some((d) => d.key === key && S.day - d.ans < k.COOLDOWN);
    let probs = (T ? T.analyze(S) : []).filter((p) => (p.storeId ? ids.has(p.storeId) : network) && !p.cityId && !p.dirId);
    probs = probs.concat(extraProblems(S, stores, network));
    const thr = k.SENS_HI - (k.SENS_HI - k.SENS_LO) * m.obs, pN = k.NOTICE_MIN + (1 - k.NOTICE_MIN) * m.obs;
    const seen = probs.filter((p) => p.sev >= thr).sort((a, b) => b.impact - a.impact || b.sev - a.sev);
    const out = [], keys = new Set();
    for (const p of seen) {
      if (out.length >= k.MAX_PER_REPORT) break;
      if (rnd(R) >= pN) continue; // не заметил
      const st = p.storeId ? byId(p.storeId) : null;
      if (p.storeId && !st) continue;
      const pr = fromProblem(S, p, st);
      if (!pr || keys.has(pr.key) || cool(pr.key)) continue;
      keys.add(pr.key); out.push(pr);
    }
    // лишний совет: вероятность (1 − точность) × WRONG_K; место — случайное среди предложений
    if (rnd(R) < (1 - m.acc) * k.WRONG_K * (out.length ? 1 : 0.15)) { // в пустом докладе выдумывает редко
      const w = wrongOne(S, R, stores);
      if (w && !keys.has(w.key) && !cool(w.key)) {
        if (out.length >= k.MAX_PER_REPORT) out.pop();
        out.splice(Math.floor(rnd(R) * (out.length + 1)), 0, w);
      }
    }
    for (const p of out) Object.assign(p, { id: nid(R, 'q'), mid: m.id, day: S.day, until: S.day + k.EXPIRE_DAYS, st: 'open', val: Math.round(p.val || 0) });
    return out;
  }

  /* ---------------- ответ игрока ---------------- */
  function exec(S, p) {
    const e = E(), a = p.act, st = a.st ? S.stores.find((x) => x.id === a.st) : null;
    if (a.st && !st) return { ok: false, msg: 'Точки уже нет' };
    if (p.cost > 0 && S.cash < p.cost) return { ok: false, msg: `Не хватает денег: нужно ${fm(p.cost)}` };
    switch (p.kind) {
      case 'pay': e.setPay(S, 'seller', a.v); return { ok: true };
      case 'trainEmp': { const x = st.staff.find((y) => y.id === a.e); if (!x) return { ok: false, msg: 'Сотрудник уже ушёл' }; return e.train(S, st.id, x.id); }
      case 'hire': case 'hireExtra': {
        if (a.extra) { const sz = C().SIZES[st.size]; if (st.staffTarget >= sz.staffMax && st.staff.length + st.incoming.length >= sz.staffMax) return { ok: false, msg: 'Штат уже максимальный' }; e.setStaffTarget(S, st.id, st.staffTarget + 1); }
        let n = 0, msg = '';
        for (let i = 0; i < a.n; i++) {
          const c = S.candidates.slice().sort((x, y) => y.lvl - x.lvl || y.trait - x.trait)[0];
          const r = e.hire(S, st.id, c ? c.id : undefined); if (!r.ok) { msg = r.msg; break; } n++;
        }
        return n ? { ok: true, n } : { ok: false, msg: msg || 'Не получилось нанять' };
      }
      case 'trainStore': { let n = 0, msg = ''; for (const id of a.ids) { const x = st.staff.find((y) => y.id === id); if (!x || x.lvl >= 3) continue; const r = e.train(S, st.id, id); if (!r.ok) { msg = r.msg; break; } n++; } return n ? { ok: true, n } : { ok: false, msg: msg || 'Некого обучать' }; }
      case 'repair': return e.startRepair(S, st.id);
      case 'price': e.setPrice(S, a.id, a.pm); return { ok: true };
      case 'bake': e.setBake(S, a.v); return { ok: true };
      case 'mkt': e.setAlloc(S, { reserve: S.alloc.reserve, bonus: S.alloc.bonus, marketing: Math.max(S.alloc.marketing, a.v) }); return { ok: true };
      case 'aggOn': case 'aggOff': { const r = e.setAggStore(S, st.id, a.on); if (r.ok && !a.on) S.managers.ld['off' + st.id] = S.day; return r; } // отключили — год не предлагать снова
      case 'eve': return e.setEveDiscount(S, a.v);
      case 'culture': return e.buyCulture(S);
      default: return { ok: false, msg: 'Неизвестное предложение' };
    }
  }
  function archive(S, p) {
    const R = S.managers;
    R.props = R.props.filter((x) => x !== p);
    R.done.unshift({ id: p.id, mid: p.mid, key: p.key, kind: p.kind, title: p.title, storeId: p.storeId, day: p.day, ans: S.day, st: p.st, right: p.right, val: p.val, cost: p.cost, monthly: p.monthly });
    if (R.done.length > 150) R.done.length = 150;
  }
  function accept(S, pid) {
    const R = ensure(S), p = R.props.find((x) => x.id === pid);
    if (!p || p.st !== 'open') return { ok: false, msg: 'Предложение уже неактуально' };
    const r = exec(S, p);
    if (!r || !r.ok) return { ok: false, msg: (r && r.msg) || 'Не получилось' };
    const m = R.list.find((x) => x.id === p.mid);
    p.st = 'yes'; p.ans = S.day;
    if (m) { m.st.yes++; }
    archive(S, p);
    E()._int.log(S, `Управляющий${m ? ' ' + m.name : ''}: согласовано — ${p.title[0].toLowerCase() + p.title.slice(1)}.`, 'info');
    return { ok: true, p };
  }
  function reject(S, pid) {
    const R = ensure(S), p = R.props.find((x) => x.id === pid);
    if (!p || p.st !== 'open') return { ok: false, msg: 'Предложение уже неактуально' };
    const m = R.list.find((x) => x.id === p.mid);
    p.st = 'no'; p.ans = S.day; if (m) m.st.no++;
    archive(S, p);
    return { ok: true, p };
  }
  // итог принятых (виден через VERDICT_DAYS): полезных / лишних и оценка пользы ₽/мес
  function stats(S, m) {
    const R = S.managers, k = K(), out = { prop: m.st.prop, yes: m.st.yes, no: m.st.no, exp: m.st.exp, good: m.st.good, bad: m.st.bad, wait: 0, val: 0 };
    for (const d of R.done) {
      if (d.mid !== m.id || d.st !== 'yes') continue;
      if (!d.v) { out.wait++; continue; }
      if (S.day - d.ans <= 365) out.val += d.val; // оценка пользы принятых за последний год, ₽/мес
    }
    return out;
  }
  const open = (S) => (S && S.managers && S.managers.props ? S.managers.props.filter((p) => p.st === 'open') : []);
  const forStore = (S, id) => open(S).filter((p) => p.storeId === id);

  /* ---------------- день ---------------- */
  function daily(S) {
    if (!S.managers && !unlocked(S)) return;
    const R = ensure(S), k = K(), I = E()._int, t = E().dateOf(S.day);
    if (!R.list.length) { if (unlocked(S)) refreshCand(S); return; }
    refreshCand(S);
    // сглаженная загрузка точек и «с какого дня вакансия» — чтобы советы не прыгали от одного дня
    for (const st of S.stores) {
      if (st.today && !st.today.closed && st.staff.length) { const v = R.ld[st.id]; R.ld[st.id] = v == null ? st.today.load : v * 0.9 + st.today.load * 0.1; }
      const vk = 'v' + st.id; if (E().vacancies(st) > 0) { if (R.ld[vk] == null) R.ld[vk] = S.day; } else if (R.ld[vk] != null) delete R.ld[vk];
    }
    // оклады — 1-го числа; журнал увольнений по месяцам (для совета о культуре)
    if (t.d === 1) {
      for (const m of R.list) { const s = salary(S, m); I.spend(S, s, 'upkeep'); R.spent += s; }
      if (!Array.isArray(R.qlog)) R.qlog = [];
      R.qlog.push(S.stats.quits | 0); if (R.qlog.length > 13) R.qlog.shift();
    }
    // сгорание
    for (const p of R.props.slice()) if (p.st === 'open' && S.day > p.until) {
      p.st = 'exp'; p.ans = S.day; const m = R.list.find((x) => x.id === p.mid); if (m) m.st.exp++;
      archive(S, p);
    }
    // итог принятых советов (виден через VERDICT_DAYS): полезных / лишних, оценка пользы
    for (const d of R.done) {
      if (d.st !== 'yes' || d.v || S.day - d.ans < k.VERDICT_DAYS) continue;
      d.v = 1; const m = R.list.find((x) => x.id === d.mid); if (!m) continue;
      if (d.right) m.st.good++; else m.st.bad++;
      m.st.val += d.val;
    }
    // доклады
    const cv = coverage(S);
    R.list.forEach((m, i) => {
      if (S.day < m.next) return;
      m.next = S.day + m.freq;
      const stores = cv.map[m.id].map((id) => S.stores.find((x) => x.id === id)).filter(Boolean);
      const ps = report(S, m, stores, i === 0);
      m.last = S.day;
      if (!ps.length) return;
      m.st.prop += ps.length;
      R.props.push(...ps);
      I.toast(S, `Управляющий ${m.name.split(' ')[0]}: ${ps.length} ${plural(ps.length, 'предложение', 'предложения', 'предложений')}`, `Нужно ваше решение «Сделать / Не делать» — в «Сводке». Через ${k.EXPIRE_DAYS} дн. сгорят.`, 'info', { mgr: true });
    });
  }

  /* ---------------- подключение к движку (как trainers.js: обёртка, движок не меняется) ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__mgr) return;
    Eng.__mgr = true;
    const orig = Eng.tick;
    Eng.tick = function (S) { const r = orig.apply(this, arguments); if (r) daily(S); return r; };
  }
  wrap();

  BK.Managers = { ensure, unlocked, any, refreshCand, salary, salaryFor, hireCost, whyNot, hire, fire, monthFee, coverage, managerOf, capOf, maxManagers,
    report, accept, reject, exec, stats, open, forStore, daily, score, _rnd: rnd };
})();
