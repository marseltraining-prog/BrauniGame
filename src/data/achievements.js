/* =====================================================================
   ДОСТИЖЕНИЯ, ЛЕТОПИСЬ РЕШЕНИЙ И ИТОГИ ИГРЫ — чистая логика, без DOM.
   Подключается после engine.js: оборачивает несколько функций BK.Engine (tick, newGame, решения игрока),
   поэтому сам движок не меняется. Работает и в браузере, и в sim/ (Node).
   Состояние (сохраняется вместе с игрой, старые сохранения получают значения по умолчанию):
     S.achievements = { id: день получения }
     S.achx  — счётчики для условий (рискованные решения, кризисы, праздники, увольнения…)
     S.chron — летопись главных решений: [{ day, t, … }] (t: prod/open/close/loan/repay/choice/crisis)
     st.pAll / st.pN / st.p12 / st.lossRun / st.lossMax — прибыль точки за всё время, по месяцам последнего года
   Уведомление о новом достижении — S.notify {type:'ach', id} + запись в журнале.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG;
  const RAR = { c: 'обычное', r: 'редкое', e: 'эпическое' };
  const CATS = [
    ['stores', 'Точки'], ['money', 'Оборот'], ['team', 'Команда'], ['rating', 'Рейтинг'], ['menu', 'Меню и цех'],
    ['events', 'События'], ['finance', 'Финансы'], ['holidays', 'Праздники'], ['city', 'Город и темп'], ['secret', 'Секретные'],
  ];
  const HEAVY_EVERY = 7; // «тяжёлые» условия (перебор всех сотрудников) — раз в неделю

  /* ---------- помощники условий ---------- */
  const openStores = (S) => { let n = 0; for (const s of S.stores) if (s.status !== 'opening') n++; return n; };
  const peak = (S) => Math.max((S.stats && S.stats.peakStores) || 0, S.stores.length);
  const staffN = (S) => { let n = 0; for (const s of S.stores) n += s.staff.length; return n; };
  const equipN = (S) => { let n = 0; for (const p of S.productions) for (const k in p.equip) n += p.equip[k] || 0; return n; };
  const districtsN = (S) => new Set(S.stores.map((s) => s.district)).size;
  const catsN = (S) => { const c = new Set(); for (const it of S.menu) { const p = E().byId(BK.PRODUCTS, it.id); if (p) c.add(p.cat); } return c.size; };
  const rolling = (S) => { let s = 0; for (const h of S.history.slice(-12)) s += h.rev; return s; };
  const rollingProfit = (S) => { let s = 0; for (const h of S.history.slice(-12)) s += h.profit; return s; };
  const lvlN = (S, l) => { let n = 0; for (const s of S.stores) for (const e of s.staff) if (e.lvl >= l) n++; return n; };
  const cnt = (id, cat, icon, rar, name, desc, get, goal, o) => Object.assign({ id, cat, icon, rar, name, desc, test: (S, X) => get(S, X) >= goal, prog: (S, X) => [get(S, X), goal] }, o || {});
  const flag = (id, cat, icon, rar, name, desc, test, o) => Object.assign({ id, cat, icon, rar, name, desc, test }, o || {});
  const M = (v) => v * 1e6;

  /* ---------- список (порядок = порядок на экране внутри категории) ---------- */
  const LIST = [
    // Точки
    flag('prod1', 'stores', '🏭', 'c', 'Своя пекарня', 'Арендовать помещение под первый цех', (S) => S.productions.length >= 1),
    flag('store1', 'stores', '🥐', 'c', 'Первая точка', 'Арендовать помещение под первую пекарню', (S) => S.stores.length >= 1 || peak(S) >= 1),
    flag('open1', 'stores', '🔔', 'c', 'Двери открыты', 'Первая точка приняла гостей', (S) => openStores(S) >= 1 || peak(S) >= 2),
    cnt('stores3', 'stores', '🏪', 'c', 'Три адреса', 'Три точки в сети одновременно', peak, 3),
    cnt('stores5', 'stores', '🖐', 'c', 'Пятёрка', 'Пять точек в сети одновременно', peak, 5),
    cnt('stores10', 'stores', '🔟', 'r', 'Десятка', 'Десять точек в сети', peak, 10),
    cnt('stores20', 'stores', '🏘', 'r', 'Двадцать адресов', 'Двадцать точек в сети', peak, 20),
    cnt('stores30', 'stores', '🌆', 'e', 'Городская сеть', 'Тридцать точек в сети', peak, 30),
    cnt('stores40', 'stores', '🗼', 'e', 'Сорок адресов', 'Сорок точек в сети', peak, 40),
    // Оборот
    cnt('rev1m', 'money', '🪙', 'c', 'Первый миллион', 'Выручка за месяц — 1 млн ₽', (S, X) => X.maxRev, M(1)),
    flag('profit1', 'money', '📈', 'c', 'В плюсе', 'Первый месяц с прибылью', (S, X) => X.profitMonths >= 1),
    cnt('rev10m', 'money', '💰', 'r', 'Десять миллионов', 'Выручка за месяц — 10 млн ₽', (S, X) => X.maxRev, M(10)),
    cnt('rev100m', 'money', '🏦', 'e', 'Сто миллионов', 'Выручка за месяц — 100 млн ₽', (S, X) => X.maxRev, M(100)),
    cnt('cum10b', 'money', '💎', 'e', 'Десять миллиардов', 'Выручка за всю игру — 10 млрд ₽', (S) => S.cumRevenue || 0, 1e10),
    cnt('cum30b', 'money', '🌾', 'e', 'Тридцать миллиардов', 'Выручка за всю игру — 30 млрд ₽', (S) => S.cumRevenue || 0, 3e10),
    cnt('rev3b', 'money', '🚂', 'e', 'Три миллиарда за год', 'Оборот за 12 месяцев — 3 млрд ₽', rolling, 3e9),
    flag('win', 'money', '🏆', 'e', 'Хлебная карта Уфы', 'Оборот за 12 месяцев — 5 млрд ₽: победа', (S) => !!S.won, { prog: (S) => [rolling(S), C().WIN_ANNUAL_REVENUE] }),
    // Команда
    cnt('hire10', 'team', '🤝', 'c', 'Своя команда', 'Нанять 10 сотрудников', (S) => S.stats.hires, 10),
    flag('train1', 'team', '🎓', 'c', 'Первое обучение', 'Отправить сотрудника на обучение', (S, X) => X.trains >= 1 || !!S.office.academy),
    flag('academy', 'team', '🏫', 'r', 'Своя академия', 'Открыть отдел обучения', (S) => !!S.office.academy),
    cnt('hire300', 'team', '🏟', 'r', 'Большой коллектив', 'Нанять 300 сотрудников', (S) => S.stats.hires, 300),
    cnt('masters', 'team', '🧑‍🍳', 'r', 'Мастера своего дела', '60 сотрудников на 5-м уровне обучения', (S) => lvlN(S, C().MAX_LVL || 5), 60, { heavy: true }),
    flag('happy', 'team', '😊', 'r', 'Все довольны', 'Все сотрудники довольны работой при штате от 100 человек', (S) => { let n = 0; for (const s of S.stores) for (const e of s.staff) { if (e.mood < C().MOOD_HAPPY) return false; n++; } return n >= 100; }, { heavy: true }),
    flag('culture', 'team', '🌟', 'r', 'Бренд работодателя', 'Корпоративная культура на высшем уровне', (S) => S.culture >= C().CULTURE.length - 1, { prog: (S) => [S.culture, C().CULTURE.length - 1] }),
    flag('noquit', 'team', '🕊️', 'e', 'Никто не ушёл', '12 месяцев подряд без увольнений при штате от 6 человек', (S, X) => X.staffSince != null && S.day - Math.max(X.lastQuit, X.staffSince) >= 365, { prog: (S, X) => [X.staffSince == null ? 0 : Math.max(0, Math.min(365, S.day - Math.max(X.lastQuit, X.staffSince))), 365], unit: 'дн.' }),
    // Рейтинг
    flag('star5', 'rating', '⭐', 'r', 'Звёздная точка', 'Точка с рейтингом 4,9★ на картах', (S) => S.stores.some((s) => s.status !== 'opening' && E().storeRating(S, s) >= 4.9), { heavy: true }),
    flag('net45', 'rating', '🌠', 'r', 'Любимая сеть', 'Средний рейтинг сети 4,5★ при 30 точках и больше', (S) => openStores(S) >= 30 && (E().networkRating(S) || 0) >= 4.5, { heavy: true }),
    // Меню и цех
    flag('chef1', 'menu', '👨‍🍳', 'c', 'Новинка от шефа', 'Добавить в меню новинку шеф-пекаря', (S) => S.menu.some((m) => BK.START_MENU.indexOf(m.id) < 0)),
    flag('equip1', 'menu', '⚙️', 'c', 'Новое оборудование', 'Купить оборудование для цеха', (S) => equipN(S) >= 1),
    flag('repair1', 'menu', '🖌', 'c', 'Свежий ремонт', 'Сделать ремонт в точке', (S) => S.stores.some((s) => s.repair >= 1 || s.status === 'repair')),
    cnt('menu14', 'menu', '🧺', 'r', 'Богатая витрина', '14 позиций в меню', (S) => S.menu.length, 14),
    cnt('equip20', 'menu', '🏗', 'r', 'Цех мечты', '20 единиц оборудования в цехах', equipN, 20),
    flag('prod2', 'menu', '🏭', 'r', 'Второй цех', 'Открыть второе производство', (S) => S.productions.length >= 2),
    flag('repair3', 'menu', '💫', 'r', 'Премиум-концепт', 'Ремонт третьей ступени в точке', (S) => S.stores.some((s) => s.repair >= 3)),
    cnt('cats', 'menu', '🎨', 'e', 'Всё для всех', 'Все категории выпечки и напитков в меню', catsN, 9),
    flag('prod3', 'menu', '🌇', 'e', 'Три цеха', 'Открыть третье производство', (S) => S.productions.length >= 3),
    // События
    cnt('ev10', 'events', '⚡', 'c', 'Закалённые', 'Пережить 10 событий', (S) => S.stats.eventsSeen, 10),
    flag('star', 'events', '📺', 'r', 'Звёздный час', 'Одно из редких «звёздных» событий', (S) => ['e137', 'e138', 'e139', 'e140'].some((id) => S.ev.once && S.ev.once[id])),
    cnt('risky5', 'events', '🎲', 'r', 'Азартный пекарь', 'Пять раз выбрать вариант с отложенными последствиями', (S, X) => X.risky, 5),
    cnt('crisis', 'events', '🛡', 'r', 'Без паники', 'Пережить экономический кризис (полгода) без новых кредитов', (S, X) => X.crisisOk, 1),
    cnt('ev150', 'events', '🌪', 'r', 'Видали всякое', 'Пережить 150 событий', (S) => S.stats.eventsSeen, 150),
    // Финансы
    flag('reserveSaved', 'finance', '🛟', 'c', 'Резерв выручил', 'Резервный фонд закрыл кассовый разрыв', (S) => !!S.flags.reserveUsedMsg),
    flag('repaid', 'finance', '✅', 'c', 'Без долгов', 'Полностью погасить кредит', (S, X) => X.repaid >= 1),
    flag('lowWaste', 'finance', '♻️', 'r', 'Бережливость', 'Списания меньше 0,8% выручки за месяц (при выручке от 5 млн ₽)', (S, X) => !!X.lowWaste),
    cnt('res200m', 'finance', '🐷', 'r', 'Подушка безопасности', 'Резервный фонд — 200 млн ₽', (S) => S.reserve, M(200)),
    cnt('res500m', 'finance', '🏰', 'e', 'Золотой запас', 'Резервный фонд — 500 млн ₽', (S) => S.reserve, M(500)),
    flag('osno', 'finance', '🏛', 'r', 'Большой бизнес', 'Выручка за год больше лимита УСН — сеть на общей системе налогов', (S) => S.macro.regime === 'osno'),
    // Праздники
    flag('hBay', 'holidays', '🌙', 'c', 'Праздничный эчпочмак', 'Встретить Ураза- или Курбан-байрам с национальной выпечкой в меню', (S, X) => !!X.hBay),
    flag('hNY', 'holidays', '🎄', 'c', 'Сладкий Новый год', 'Встретить Новый год с десертами в меню', (S, X) => !!X.hNY),
    flag('hSab', 'holidays', '🎪', 'r', 'Сабантуй', 'Точка у парка работает в Сабантуй', (S, X) => !!X.hSab),
    cnt('hAll', 'holidays', '📅', 'r', 'Круглый год', 'Встретить все даты календаря Уфы с открытыми точками', (S, X) => Object.keys(X.hol || {}).length, 8),
    // Город и темп
    cnt('d6', 'city', '🗺', 'c', 'Полгорода', 'Точки в шести районах Уфы', districtsN, 6),
    cnt('d12', 'city', '🏙', 'e', 'Вся Уфа', 'Точки во всех 12 районах', districtsN, 12),
    flag('fast', 'city', '🚀', 'e', 'Стремительный рост', 'Десять точек за первые три года', (S) => S.stores.length >= 10 && S.day <= 3 * 365, { prog: (S) => [S.day <= 3 * 365 ? S.stores.length : 0, 10], missed: (S) => S.day > 3 * 365 }),
    cnt('y10', 'city', '🎂', 'r', 'Десять лет в деле', 'Сеть работает 10 лет', (S) => Math.floor(S.day / 365), 10),
    cnt('y15', 'city', '🎖', 'e', 'Пятнадцать лет', 'Сеть работает 15 лет', (S) => Math.floor(S.day / 365), 15),
    // Секретные (до получения скрыты)
    flag('s13', 'secret', '🐈', 'c', 'Чёртова дюжина', 'Открыть точку №13', (S) => (S.flags.storeNum || 0) >= 13, { secret: true }),
    flag('sPrice', 'secret', '👑', 'c', 'Хлеб по цене золота', 'Все цены в меню на 50% выше рекомендованных', (S) => S.menu.length > 0 && S.menu.every((m) => m.pm >= 1.5), { secret: true }),
    flag('sSurv', 'secret', '🩹', 'r', 'На волоске', 'Выбраться из кассового разрыва после двух месяцев в минусе', (S, X) => !!X.survived, { secret: true }),
    flag('sLoner', 'secret', '🏠', 'r', 'Одна, но любимая', 'Три года с одной-единственной точкой', (S, X) => X.loner >= 3 * 365, { secret: true }),
    cnt('sClose', 'secret', '✂️', 'r', 'Оптимизатор', 'Закрыть пять точек', (S, X) => X.closed, 5, { secret: true }),
  ];
  const BY_ID = {}; for (const a of LIST) BY_ID[a.id] = a;

  /* ---------- состояние ---------- */
  function freshX() {
    return { v: 1, maxRev: 0, profitMonths: 0, trains: 0, risky: 0, crises: [], crisisOk: 0, repaid: 0, loans: 0, closed: 0, lowWaste: false,
      q: null, lastQuit: 0, staffSince: null, hol: {}, hNY: false, hBay: false, hSab: false, gapMonths: 0, gapMax: 0, survived: false, loner: 0, mKey: null, lastHeavy: -99 };
  }
  // Безопасная инициализация. Старое сохранение (без S.achievements): всё, что уже выполнено, начисляется тихо.
  function ensure(S) {
    if (!S) return S;
    if (!S.achx) S.achx = freshX();
    const X = S.achx;
    if (!S.chron) S.chron = [];
    if (X.q == null) X.q = S.stats ? S.stats.quits : 0;
    if (!S.achievements) {
      S.achievements = {};
      backfill(S);
      for (const a of LIST) if (!S.achievements[a.id] && safeTest(a, S)) S.achievements[a.id] = S.day;
    }
    return S;
  }
  function backfill(S) { // счётчики, которые можно восстановить из истории старого сохранения
    const X = S.achx;
    for (const h of S.history || []) {
      X.maxRev = Math.max(X.maxRev, h.rev || 0);
      if (h.profit > 0) X.profitMonths++;
      if (h.pnl && h.rev >= 5e6 && h.pnl.waste != null && h.pnl.waste / h.rev < 0.008) X.lowWaste = true;
    }
    const h = S.history && S.history[S.history.length - 1]; if (h) X.mKey = h.y * 12 + h.m;
    if (staffN(S) >= 6) X.staffSince = S.day;
    X.lastQuit = S.day;
  }
  function safeTest(a, S) { try { return !!a.test(S, S.achx); } catch (e) { return false; } }
  function logLine(S, text, kind) { S.log.unshift({ day: S.day, text, kind }); if (S.log.length > 250) S.log.length = 250; }
  function award(S, a) {
    S.achievements[a.id] = S.day;
    S.notify.push({ type: 'ach', id: a.id });
    logLine(S, `Достижение «${a.name}»: ${a.desc.charAt(0).toLowerCase() + a.desc.slice(1)}.`, 'good');
  }
  function check(S, all) {
    if (!S || !S.achievements) return;
    const X = S.achx, heavy = all || S.day - X.lastHeavy >= HEAVY_EVERY;
    if (heavy) X.lastHeavy = S.day;
    for (const a of LIST) {
      if (S.achievements[a.id] != null) continue;
      if (a.heavy && !heavy) continue;
      if (safeTest(a, S)) award(S, a);
    }
  }
  function chron(S, rec) {
    rec.day = S.day;
    S.chron.push(rec);
    if (S.chron.length > 400) { const i = S.chron.findIndex((r) => r.t === 'open' && r.num % 10 !== 0 && r.num > 1); S.chron.splice(i >= 0 ? i : 0, 1); }
  }

  /* ---------- ежедневный учёт (после E.tick) ---------- */
  function daily(S) {
    ensure(S);
    const X = S.achx;
    // увольнения: день последнего ухода; отсчёт «без увольнений» — с момента, когда в штате 6+ человек
    if (S.stats.quits !== X.q) { X.q = S.stats.quits; X.lastQuit = S.day; }
    const nStaff = staffN(S);
    if (nStaff >= 6) { if (X.staffSince == null) X.staffSince = S.day; } else X.staffSince = null;
    if (S.stores.length === 1 && openStores(S) === 1) X.loner++; else if (S.stores.length > 1) X.loner = 0;
    // кризисы: через 180 дней после начала — «пережит»; без новых кредитов за это время — засчитан
    for (const c of X.crises) if (!c.done && S.day - c.day >= 180) { c.done = true; if (!c.loan && !S.lost) X.crisisOk++; }
    holidays(S, X);
    // новый месячный расчёт
    const h = S.history[S.history.length - 1];
    if (h && h.y * 12 + h.m !== X.mKey) { X.mKey = h.y * 12 + h.m; onMonth(S, X, h); }
    check(S);
  }
  function holidays(S, X) {
    if (!E().holidaysOfYear || !openStores(S)) return;
    const y = E().dateOf(S.day).y;
    for (const hd of E().holidaysOfYear(y)) {
      if (hd.start > S.day || hd.end < S.day) continue;
      X.hol[hd.id] = 1;
      const hasCat = (cat) => S.menu.some((m) => { const p = E().byId(BK.PRODUCTS, m.id); return p && p.cat === cat; });
      const hasLm = (lm) => S.stores.some((s) => s.status !== 'opening' && s.landmarks.indexOf(lm) >= 0);
      if (hd.id === 'newyear' && hasCat('desserts')) X.hNY = true;
      if ((hd.id === 'uraza' || hd.id === 'kurban') && hasCat('national')) X.hBay = true;
      if (hd.id === 'sabantuy' && hasLm('park')) X.hSab = true;
    }
  }
  function onMonth(S, X, h) {
    X.maxRev = Math.max(X.maxRev, h.rev);
    if (h.profit > 0) X.profitMonths++;
    if (h.pnl && h.rev >= 5e6 && h.pnl.waste != null && h.pnl.waste / h.rev < 0.008) X.lowWaste = true;
    if (S.negMonths > 0) { X.gapMonths++; X.gapMax = Math.max(X.gapMax, S.negMonths); }
    else if (X.prevNeg >= 2 && !S.lost) X.survived = true;
    X.prevNeg = S.negMonths;
    for (const st of S.stores) { // прибыль точки: за всё время, помесячно за последний год, серии убыточных месяцев
      if (!st.last || st.status === 'opening' || st.last.profit == null) continue;
      const p = Math.round(st.last.profit);
      st.pAll = (st.pAll || 0) + p; st.pN = (st.pN || 0) + 1;
      st.p12 = (st.p12 || []).concat([p]).slice(-12);
      st.lossRun = p < 0 ? (st.lossRun || 0) + 1 : 0;
      st.lossMax = Math.max(st.lossMax || 0, st.lossRun);
    }
  }

  /* ---------- обёртки функций движка (действия игрока и ботов) ---------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__ach) return;
    Eng.__ach = true;
    const w = (name, fn) => { const orig = Eng[name]; if (orig) Eng[name] = fn(orig); };
    w('newGame', (o) => function (opts) { const S = o.apply(this, arguments); S.achievements = {}; S.achx = freshX(); S.achx.q = 0; S.chron = []; return S; });
    w('tick', (o) => function (S) { const r = o.apply(this, arguments); if (r) daily(S); return r; });
    const after = (name, fn) => w(name, (o) => function (S) { const pre = fn.pre ? fn.pre.apply(null, arguments) : null; const r = o.apply(this, arguments); if (S && S.achievements && (r == null || r.ok !== false)) { fn(S, r, pre, arguments); check(S); } return r; });
    after('chooseProduction', (S) => chron(S, { t: 'prod', n: S.productions.length, addr: S.productions[S.productions.length - 1].address }));
    after('rentStore', (S, r) => chron(S, { t: 'open', num: r.store.num, addr: r.store.address, d: r.store.district, n: S.stores.length }));
    const close = (S, r, st) => { S.achx.closed++; if (st) chron(S, { t: 'close', num: st.num, addr: st.address, d: st.district, pAll: st.pAll || 0, pN: st.pN || 0, p12: (st.p12 || []).reduce((a, x) => a + x, 0), lossMax: st.lossMax || 0 }); };
    close.pre = (S, id) => (S && S.stores ? S.stores.find((x) => x.id === id) : null);
    after('closeStore', close);
    after('takeLoan', (S, r) => {
      const X = S.achx; X.loans++;
      for (const c of X.crises) if (!c.done) c.loan = true;
      chron(S, { t: 'loan', v: Math.round(r.amount), loan: Math.round(S.loan), rev: Math.round(S.lastMonthRev) });
    });
    const repay = (S, r, before) => { if (before > 0 && S.loan <= 0) { S.achx.repaid++; chron(S, { t: 'repay', v: Math.round(before) }); } };
    repay.pre = (S) => (S ? S.loan : 0);
    after('repayLoan', repay);
    after('train', (S) => { S.achx.trains++; });
    after('trainAll', (S) => { S.achx.trains++; });
    // решение в событии: рискованное (с отложенным последствием), кризис, дорогой вариант — в летопись
    const choice = (S, r, pre) => {
      if (!pre) return;
      const X = S.achx, inst = pre.inst, e = E().byId(BK.EVENTS, inst.id);
      const ch = inst.choices && e && e.choices ? (e.choices[pre.idx] || e.choices[e.choices.length - 1]) : null;
      const risky = !!(ch && (ch.effects || []).some((f) => f.t === 'schedule'));
      if (risky) X.risky++;
      if (inst.crisis) X.crises.push({ day: inst.day, loan: false, done: false });
      const cost = ch && inst.choices[pre.idx] ? inst.choices[pre.idx].cost || 0 : 0;
      const big = cost >= Math.max(1e6 * S.macro.priceLevel, S.lastMonthRev * 0.15);
      if (inst.crisis || risky || big || (e && e.once)) chron(S, { t: inst.crisis ? 'crisis' : 'choice', id: inst.id, title: inst.title, label: ch ? ch.label : '', cost: Math.round(cost), risky, kind: inst.kind });
    };
    choice.pre = (S, idx) => (S && S.ev && S.ev.pending ? { inst: S.ev.pending, idx: idx | 0 } : null);
    after('resolveEvent', choice);
  }
  wrap();

  /* ---------- итоги игры: лучшая/худшая точка, главные решения, что верно / что можно лучше ---------- */
  function storeRows(S) {
    const rows = [];
    for (const st of S.stores) if (st.pN) rows.push({ num: st.num, addr: st.address, d: st.district, pAll: st.pAll || 0, pN: st.pN, p12: (st.p12 || []).reduce((a, x) => a + x, 0), lossMax: st.lossMax || 0, open: true });
    for (const c of S.chron || []) if (c.t === 'close' && c.pN) rows.push({ num: c.num, addr: c.addr, d: c.d, pAll: c.pAll, pN: c.pN, p12: c.p12, lossMax: c.lossMax, open: false, day: c.day });
    return rows;
  }
  function decisions(S, max) {
    const out = [];
    for (const c of S.chron || []) {
      if (c.t === 'open' && !(c.num === 1 || c.num % 10 === 0)) continue;
      if (c.t === 'loan' && c.v < Math.max(3e6, c.rev * 1.5)) continue; // только крупные кредиты
      out.push(c);
    }
    // если решений много — оставить самые весомые (кризисы, цеха, закрытия, крупные кредиты), по датам
    const w = (c) => ((c.t === 'open' && c.num === 1) || (c.t === 'prod' && c.n === 1) ? 9 : ({ crisis: 5, prod: 4, close: 4, repay: 3, loan: 3, open: 3, choice: c.risky ? 3 : 2 })[c.t] || 1);
    const keep = out.map((c, i) => ({ c, i })).sort((a, b) => w(b.c) - w(a.c) || b.i - a.i).slice(0, max || 12).sort((a, b) => a.i - b.i);
    return keep.map((x) => x.c);
  }
  function review(S) {
    ensure(S);
    const cfg = C(), X = S.achx, h = S.history || [];
    const sum = (f, arr) => (arr || h).reduce((a, x) => a + (f(x) || 0), 0);
    const years = S.day / 365;
    const revAll = sum((x) => x.rev), last12 = h.slice(-12);
    const rev12 = sum((x) => x.rev, last12), prof12 = sum((x) => x.profit, last12);
    const wasteShare = revAll ? sum((x) => x.pnl && x.pnl.waste) / revAll : 0;
    const interest = sum((x) => x.pnl && x.pnl.interest), intShare = revAll ? interest / revAll : 0;
    const avgStaff = h.length ? sum((x) => x.staff) / h.length : 0;
    const turnover = avgStaff >= 3 && years > 0.5 ? S.stats.quits / avgStaff / years : null;
    const rating = E().networkRating(S);
    const rows = storeRows(S);
    const byAll = rows.slice().sort((a, b) => b.pAll - a.pAll);
    const best = byAll[0] || null, worst = byAll.length > 1 ? byAll[byAll.length - 1] : null;
    const lossy = rows.filter((r) => r.lossMax >= 6).sort((a, b) => b.lossMax - a.lossMax)[0];
    const fmt = BK.fmtMoney, pc = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%';
    const good = [], bad = [];
    const G = (w, t) => good.push({ w, t }), B = (w, t) => bad.push({ w, t });
    const monthCost = (() => { const p = h.length ? h[h.length - 1].pnl : null; return p ? p.rent + p.payroll + p.util + (p.delivery || 0) + (p.upkeep || 0) : 0; })();
    // что сделано верно
    if (S.won) G(10, `Цель взята за ${(Math.round((S.wonDay || S.day) / 36.5) / 10).toString().replace('.', ',')} года: оборот 5 млрд ₽ за 12 месяцев.`);
    if (X.crisisOk) G(8, X.crisisOk > 1 ? `Пережили ${X.crisisOk} кризиса без новых кредитов — резерв и запас денег сработали.` : 'Пережили кризис без новых кредитов — резерв и запас денег сработали.');
    else if (S.flags.reserveUsedMsg && !S.lost) G(5, 'Резервный фонд закрыл кассовый разрыв — сеть не встала.');
    if (turnover != null && turnover < 0.2) G(7, `Команда держалась: уходило ~${pc(turnover)} сотрудников в год — зарплаты, премии и культура окупились.`);
    if (rating != null && rating >= 4.4) G(6, `Гости ценят сеть: средний рейтинг ${rating.toFixed(1).replace('.', ',')}★.`);
    if (S.culture >= 3) G(4, `Вложились в корпоративную культуру — «${cfg.CULTURE[S.culture].name}».`);
    if (monthCost > 0 && S.reserve >= monthCost * 2) G(5, `Держали резерв на ${Math.floor(S.reserve / monthCost)} мес. постоянных расходов.`);
    if (X.repaid && S.loan <= 0) G(4, 'Кредиты погашены — сеть без долгов.');
    if (S.achievements.fast) G(6, 'Быстрый старт: десять точек за первые два года.');
    else if (peak(S) >= 20) G(4, `Выросли до ${peak(S)} точек.`);
    if (revAll > 0 && h.length >= 6 && wasteShare < 0.025) G(4, `Мало списаний: ${pc(wasteShare)} выручки за всю игру.`);
    if (rev12 > 0 && prof12 / rev12 >= 0.1) G(5, `Сеть прибыльна: ${pc(prof12 / rev12)} выручки за последний год остаётся в прибыли.`);
    if (S.productions.length >= 2) G(3, `Вовремя расширили производство: ${S.productions.length} цеха.`);
    // что можно было лучше
    if (S.lost) B(10, `Банкротство на ${Math.max(1, Math.ceil(years))}-м году: ${cfg.BANKRUPT_MONTHS} месячных расчёта подряд со счётом в минусе и пустым резервом.`);
    if (turnover != null && turnover > 0.35) B(8, `Высокая текучка: ~${pc(turnover)} команды уходило за год — похоже, экономили на зарплатах, премиях или культуре.`);
    if (lossy) B(7, `Долго держали убыточную точку №${lossy.num} (${lossy.addr}) — ${lossy.lossMax} мес. подряд в минусе. Чините раньше (штат, ремонт, цены) или закрывайте.`);
    if (revAll > 0 && h.length >= 6 && wasteShare > 0.04) B(6, `Много списаний: ${pc(wasteShare)} выручки. Настройте «Сколько печь» и вечернюю скидку во вкладке «Цех».`);
    if (X.gapMonths) B(7, `Кассовые разрывы: ${X.gapMonths} мес. со счётом в минусе. Держите в резерве 2–3 месячных расхода.`);
    if (intShare > 0.015) B(5, `Проценты по кредитам съели ${pc(intShare)} выручки (${fmt(interest)}).`);
    if (rating != null && rating < 3.8) B(6, `Низкий рейтинг сети ${rating.toFixed(1).replace('.', ',')}★ — обучение, ремонт и довольная команда приводят новых гостей.`);
    if (S.pay && S.market && S.pay.seller < S.market.seller * 0.97) B(5, 'Зарплаты ниже рынка — люди уходят к конкурентам.');
    if (S.cache && S.cache.capUse > 1) B(5, 'Производство не справлялось со спросом — продажи терялись. Оборудование окупается быстрее новых точек.');
    if (S.alloc && S.alloc.reserve === 0 && S.reserve < monthCost) B(4, 'Не откладывали прибыль в резервный фонд — первый же кризис бьёт по счёту.');
    if (years >= 3 && peak(S) < 5) B(4, `Медленный рост: за ${Math.floor(years)} года — всего ${peak(S)} точки.`);
    if (!S.office.hr && S.stores.length > cfg.HR_REQUIRED_STORES) B(3, 'Без HR-отдела найм в большой сети шёл медленно.');
    if (monthCost > 0 && S.cash > monthCost * 6 && S.cash > S.reserve) B(4, `Много свободных денег на счёте (${fmt(S.cash)}): в резервном фонде они приносили бы проценты, а в новых точках — выручку.`);
    const d10 = (S.chron || []).find((c) => c.t === 'open' && c.num === 10);
    if (d10 && d10.day > 4 * 365) B(3, `Медленный старт: десятая точка открылась только на ${Math.ceil(d10.day / 365)}-м году — ранние точки дольше всего работают на оборот.`);
    if (best && worst && worst !== best && worst.pN >= 12 && worst.p12 < best.p12 * 0.15) B(3, `Точка №${worst.num} (${worst.addr}) заработала за год всего ${fmt(worst.p12)} — проверьте аренду, штат и цены или замените место.`);
    if (S.culture < 2 && staffN(S) >= 50) B(3, 'Большая команда без корпоративной культуры — довольство держится только на зарплате.');
    // запасные пункты, чтобы в каждом блоке было не меньше трёх
    const years1 = Math.max(1, Math.round(years));
    const gFill = [`Продержались ${years1} ${years1 % 10 === 1 && years1 % 100 !== 11 ? 'год' : years1 % 10 >= 2 && years1 % 10 <= 4 && (years1 % 100 < 12 || years1 % 100 > 14) ? 'года' : 'лет'} и открыли ${peak(S)} точ.`, `Пережили ${S.stats.eventsSeen} событий — проверки, конкуренты, погода и кризисы.`, `Заработали ${fmt(revAll)} выручки за всю игру.`];
    const bFill = ['Следите за загрузкой цеха: при 90% пора покупать оборудование.', 'Сравнивайте предложения по окупаемости, а не только по трафику.', 'Держите в резерве 2–3 месячных расхода — он спасает при кризисе и карантине.'];
    for (const t of gFill) if (good.length < 3) G(0, t);
    for (const t of bFill) if (bad.length < 3) B(0, t);
    const top = (a) => a.sort((x, y) => y.w - x.w).slice(0, 5).map((x) => x.t);
    return { good: top(good), bad: top(bad), best, worst: worst && worst !== best ? worst : null, decisions: decisions(S, 12), revAll, rev12, prof12, turnover, rating, wasteShare };
  }

  function list() { return LIST; }
  function isOn(S, id) { return !!(S && S.achievements && S.achievements[id] != null); }
  function count(S) { let n = 0; if (S && S.achievements) for (const a of LIST) if (S.achievements[a.id] != null) n++; return n; }
  function progress(S, a) { if (!a.prog) return null; try { const p = a.prog(S, S.achx); return [Math.max(0, p[0] || 0), p[1]]; } catch (e) { return null; } }

  BK.Ach = { LIST, BY_ID, CATS, RAR, list, ensure, check, daily, review, storeRows, decisions, isOn, count, progress, wrap };
})();
