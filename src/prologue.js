/* =====================================================================
   ПРОЛОГ «БАРИСТА» — стадия 0 (docs/vision-plan.md §3.1, §3.1.1). Чистая логика без DOM (как engine.js).
   Вы — бариста в пекарне-кофейне «Калач» Рашида Хайруллина на ул. Пушкина в Уфе (герои и сцены П1–П8 — docs/story.md). Цель — накопить на свою точку и стать управляющим сменой.
   Ход = месяц, идёт сам (интерфейс зовёт advance(S, мс × скорость)); решения — карточки (S.prologue.cards), пока карточка
   открыта, время стоит. Деньги: кошелёк (cash) → копилка (box, 0 %) → вклад (dep, проценты раз в год, досрочно сгорают).
   Состояние — S.prologue (в сохранении вместе с обычной игрой; старые сохранения без поля — пролога не было):
     { v, status: 'run'|'won'|'life'|'done'|'skipped', seed, rng, m (месяцев прошло), t (доля текущего месяца 0..1),
       job 0..2, jobM, stazh, rep, hp, mood, sk: {sales, coffee, people}, cash, box, dep, depInt,
       home, food, extra, saveRate, study, done{}, payK, rentK, cut, sickNow, fired, wantsCd{}, sale, loans[], inv[],
       rel: {rashid, gulya, oleg, elvira, family, semyon} (−100…100, как S.story.rel), sf (флаги сюжета, как S.story.f), sm (стили),
       shares[], seen{}, slog[], flags{}, cards[], evAt[], shift (последний итог смены), earned{}, spent{}, mo, hist[], feed[], fx[], stats{}, won, carry }
   Мини-игра «Смена» идёт по расписанию (shiftAt/dueShift): смены приходят сами 5–10 раз за пролог, игрок их не выбирает
   и не может пропустить (счётчик — stats.shifts, он же в сохранении). Полка — три ряда по три позиции (SHELF_KEYS).
   Числа расписания — SHIFT_AT (место в BK.CFG.PROLOGUE, как остальные числа пролога).
   Сюжетные решения пролога копируются в S.story по схеме docs/story.md §4.5 (syncStory) — их прочитает будущий сюжетный модуль.
   Свой ГСЧ (S.prologue.rng, от зерна игры): основной поток случайностей игры не сдвигается.
   Переход в основную игру — finish()/applyCarry(): бонус к капиталу (≤ +15 %), навыки игрока (S.player.skills, система тренеров),
   коллега-пекарь — первый сотрудник первой точки, черта героя. Эффекты в основной игре — обёртки rentStore/tick (как achievements.js),
   движок не меняется; без S.prologue обёртки ничего не делают (боты первого акта побайтно прежние).
   Числа — BK.CFG.PROLOGUE. Интерфейс — src/ui/prologue.js. Боты — sim/prologue.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const C = () => BK.CFG.PROLOGUE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r100 = (v) => Math.round(v / 100) * 100;
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  function rnd(P) { // mulberry32 — как в движке, но на своём зерне
    let t = (P.rng = (P.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (P, a, b) => a + (b - a) * rnd(P);
  const ri = (P, a, b) => Math.floor(rr(P, a, b + 1));

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const START_MON = 1; // пролог начинается в феврале (docs/story.md, П0)
  const HEROES = {
    rashid: { name: 'Рашид Хайруллин', role: 'хозяин пекарни-кофейни «Калач», ваш наставник', ini: 'Р', hue: 28 },
    gulya: { name: 'Гуля Сафина', role: 'пекарь «Калача», ваша коллега', ini: 'Г', hue: 340 },
    oleg: { name: 'Олег Кравцов', role: 'владелец сети «Хлебный двор»', ini: 'О', hue: 210 },
    elvira: { name: 'Эльвира Ахметова', role: 'банк «Семь рек», проспект Октября', ini: 'Э', hue: 185 },
    family: { name: 'Семья', role: 'мама Фания, брат Ильдар, бабушка Сания', ini: 'С', hue: 150 },
    semyon: { name: 'Семён Аркадьевич', role: 'постоянный гость, канал «Уфа жуёт»', ini: 'С', hue: 95 },
    friend: { name: 'Дамир', role: 'друг со школы', ini: 'Д', hue: 260 },
    life: { name: 'Жизнь', role: 'так бывает', ini: '•', hue: 45 },
  };
  const SK_NAME = { sales: 'Продажи', coffee: 'Кофе', people: 'Люди' };
  const SPENT_NAME = {
    home: 'Жильё', food: 'Еда', fun: 'Кино, бар, развлечения', transport: 'Транспорт', phone: 'Связь', study: 'Учёба', health: 'Здоровье и лечение', fines: 'Штрафы и потери',
    cinema: 'Кино', bar: 'Бар с друзьями', clothes: 'Одежда', gifts: 'Подарки', sneakers: 'Кроссовки', console: 'Приставка', phone2: 'Новые телефоны', trip: 'Отпуска',
    loans: 'Долги друзьям (не вернули)', invest: 'Вложения (прогорели)', car: 'Машина в кредит', debt: 'Проценты по кредитке', other: 'Разное',
  };
  const WANT_CAT = { clothes: 'clothes', gifts: 'gifts', sneakers: 'sneakers', console: 'console', phone: 'phone2', trip: 'trip', car: 'car' };
  const FUN_CATS = ['fun', 'clothes', 'gifts', 'sneakers', 'console', 'phone2', 'trip', 'car'];

  /* ---------------- состояние ---------------- */
  function create(seed) {
    const c = C();
    const P = {
      v: 1, status: 'run', seed: seed | 0, rng: ((seed | 0) ^ 0x5eed0b) | 0,
      m: 0, t: 0, job: 0, jobM: 0, stazh: 0, rep: 50, hp: 80, mood: 62,
      sk: { sales: 10, coffee: 15, people: 10 },
      cash: c.START_CASH, box: 0, dep: 0, depInt: 0,
      home: 'parents', food: 'normal', fun: 'some', extra: 0, saveRate: 1, study: null, done: {},
      payK: 1, rentK: 1, cut: 0, sickNow: false, fired: 0,
      wantsCd: {}, sale: null, loans: [], inv: [], car: null,
      rel: { rashid: 0, gulya: 0, oleg: 0, elvira: 0, family: 10, semyon: 0 }, sm: { care: 0, risk: 0, honesty: 0, fair: 0 },
      sf: { mentor: null, gulya: null, kalach: 'alive', olegCard: false, regulars: 0 }, shares: [], seen: {}, slog: [], depBonus: 0, flags: {}, cards: [], evAt: [], shift: { m: -1 },
      earned: { salary: 0, tips: 0, extra: 0, interest: 0, gifts: 0, other: 0 },
      spent: {}, mo: null, hist: [], feed: [], fx: [],
      stats: { sick: 0, splurge: 0, shifts: 0, warn: 0, fired: 0, best: 0, boxed: 0 },
      won: null, carry: null,
    };
    return P;
  }
  function start(S) {
    const P = S.prologue = create((S.seed || 1) ^ 0x6b2a91);
    P.cards.push({ id: 'p01', v: {} });
    schedule(P);
    feed(P, 'Уфа, февраль. Вам 21. В телефоне объявление: «В пекарню „Калач“ нужен бариста. Опыт не важен, важно не опаздывать».', 'info');
    V2('init', S); V2('welcome', P);
    syncStory(S);
    return P;
  }
  // --- живой сюжет пролога (src/data/prolog-v2.js): 8 историй, 16 дилемм, нити, правила показателей ---
  // дилеммы зовут наружу функции с «2» (feed2, fx2, rel2, style2, pay2, spend2, thread2, storyLog2) —
  // они определены ниже и экспортированы, потому что сборка грузит data/prolog-v2.js раньше prologue.js
  // и «мостик» bridge() из v2 тогда не успевает их поставить (симуляторы грузят в обратном порядке).
  const V2 = (fn, ...a) => (BK.PrologV2 && BK.PrologV2[fn] ? BK.PrologV2[fn](...a) : null);
  /* ---------- сюжет: запись решений пролога в S.story (схема docs/story.md §4.5) ---------- */
  function storyDefaults(seed) {
    return { v: 1, mode: 'full', scenario: 'ufa', hero: { name: '', g: null }, ch: 'prologue', rng: ((seed | 0) ^ 0x51a7e) | 0, seen: {}, queue: [], pending: null, inbox: [],
      lastScene: 0, lastLetter: 0, lastLine: 0, rel: { rashid: 0, gulya: 0, oleg: 0, elvira: 0, family: 10, semyon: 0 }, m: { care: 0, risk: 0, honesty: 0, fair: 0 },
      f: { mentor: null, gulya: null, kalach: 'alive', lenin: null, hire1: null, fund: 0, war: null, scandal: null, ufa: null, ildar: null, olegCard: false, regulars: 0 },
      shares: [], ending: null, log: [] };
  }
  function syncStory(S) {
    const P = S && S.prologue; if (!P || !P.rel) return;
    const st = S.story || (S.story = storyDefaults(S.seed || 1));
    Object.assign(st.rel, P.rel); Object.assign(st.m, P.sm); Object.assign(st.f, P.sf);
    st.shares = P.shares.slice(); Object.assign(st.seen, P.seen); st.log = P.slog.slice(-120);
    if (P.status === 'life') st.ending = 'hired';
    if ((P.status === 'done' || P.status === 'skipped') && (!S.stage1 || S.stage1.status !== 'done')) st.ch = 'own'; // глава 1 «Своя точка» (стадия 1 — stage1.js; после неё — 'city')
  }
  const on = (S) => !!(S && S.prologue && S.prologue.status === 'run');
  // тон записи в ленте: по нему озвучка пролога (src/ui/prologue.js) выбирает звук события.
  // Иначе звук пришлось бы определять по русскому тексту записи — это хрупко.
  // Вариант может задать тон сам (fx.k, feed.k), тогда он важнее общего правила.
  const FEED_K = { good: 'pos', bad: 'neg' };
  function feed(P, t, k) { P.feed.push({ m: P.m, t, k: k || 'info', tone: FEED_K[k] || '' }); if (P.feed.length > 40) P.feed.shift(); }
  function fx(P, kind, v, where) { P.fx.push({ kind, v: Math.round(v), where: where || '' }); if (P.fx.length > 30) P.fx.splice(0, P.fx.length - 30); }

  /* ---------------- хуки живого сюжета: функции *2 (src/data/prolog-v2.js) ----------------
     Дилеммы v2 не лезут во внутренности пролога, а зовут эти функции через BK.Prologue.*.
     Имена с «2» — потому что рядом уже есть внутренние feed/fx/rel/style/pay/spend.
     Правила те же, что у внутренних: деньги уходят по порядку кошелёк → копилка → вклад
     (проценты сгорают) и в минус только как долг; отношения и стили — в границах −100…100;
     лента и значки не растут без предела. Аргументы могут прийти любые: функция молчит,
     а не падает — одна запись сюжета не важнее самого пролога.
     В prolog-v2.js есть свой «мостик» bridge(), но он срабатывает, только когда файл загружен
     после пролога (так в симуляторах, sim/load.js). В сборке порядок обратный (build.js:
     data/prolog-v2.js идёт раньше prologue.js) — тогда BK.Prologue ещё не создан и мостик
     пропускает работу. Поэтому определения живут здесь и работают при любом порядке файлов;
     мостик v2 свои версии уже не подменяет (там `if (!PR[k])`). */
  function feed2(P, t, k) { // запись в ленту пролога с тем же тоном, что у bridge()
    if (!P || !P.feed || typeof P.feed.push !== 'function') return;
    const kk = k || 'info';
    P.feed.push({ m: P.m, t: t == null ? '' : String(t), k: kk, tone: kk === 'good' ? 'pos' : kk === 'bad' ? 'neg' : kk === 'hero' ? 'hero' : '' });
    if (P.feed.length > 40) P.feed.shift();
  }
  function fx2(P, kind, v, where) { // значок в «Что изменилось»
    if (!P || !P.fx || typeof P.fx.push !== 'function') return;
    const n = Math.round(Number(v)); if (!isFinite(n)) return;
    P.fx.push({ kind, v: n, where: where || '' });
    if (P.fx.length > 30) P.fx.splice(0, P.fx.length - 30);
  }
  function rel2(P, o) { // отношения с героями: { rashid: 8, gulya: -5 }
    if (!P || !o || typeof o !== 'object') return;
    if (!P.rel) P.rel = {};
    for (const k of Object.keys(o)) { const v = Number(o[k]); if (isFinite(v) && v) P.rel[k] = clamp((P.rel[k] || 0) + v, -100, 100); }
  }
  function style2(P, k, v) { // стиль игры героя (care/risk/honesty/fair): −100…100
    if (!P || !k) return;
    const n = Number(v); if (!isFinite(n) || !n) return;
    if (!P.sm) P.sm = {};
    P.sm[k] = clamp((P.sm[k] || 0) + n, -100, 100);
  }
  // деньги и статьи расходов на месте: чужое/старое состояние не ломаем и не заводим NaN в сохранении
  function pro2money(P) {
    if (!P || typeof P !== 'object') return false;
    if (!P.spent || typeof P.spent !== 'object') P.spent = {};
    for (const k of ['cash', 'box', 'dep', 'depInt']) { const n = Number(P[k]); P[k] = isFinite(n) ? n : 0; }
    return true;
  }
  function pay2(P, v, cat) { // обязательный платёж: как pay() — кошелёк, копилка, вклад, долг
    if (!pro2money(P)) return;
    const n = Math.round(Number(v)); if (!isFinite(n) || n <= 0) return; // NaN/«текст»/∞ в сохранение не пускаем
    pay(P, n, cat || 'other');
  }
  function spend2(P, v, cat) { // только запись расхода (деньги уже списаны вручную): не трогает cash
    if (!pro2money(P)) return;
    const n = Math.round(Number(v)); if (!isFinite(n) || n <= 0) return;
    spendRec(P, n, cat || 'other');
  }
  function thread2(P, t) { // нить: человек, который вернётся; живёт в P.v2 (аддитивный сюжет v2)
    if (!P || !t || typeof t !== 'object') return null;
    if (BK.PrologV2 && BK.PrologV2.addThread) return BK.PrologV2.addThread(P, t); // тот же addThread, что и в bridge()
    if (!P.v2 || !Array.isArray(P.v2.threads)) return null;                       // живого сюжета нет — запоминать негде
    P.v2.threads.push({ id: t.id || ('t' + P.v2.threads.length), who: t.who || '', gist: t.gist || '', dir: t.dir || 1,
      due: t.due == null ? (P.m | 0) + 6 : t.due, fx: t.fx || 'friend', note: t.note || '', at: P.m });
    return null;
  }
  function storyLog2(P, rec) { // запись в летопись пролога (P.slog; syncStory переносит её в S.story.log)
    if (!P || !rec || typeof rec !== 'object') return;
    if (!Array.isArray(P.slog)) P.slog = [];
    const line = rec.line || rec.gist || '';
    P.slog.push({ day: null, pm: P.m, id: 'v2_' + (rec.what || 'note'), choice: 0, line: line == null ? '' : String(line) });
    if (P.slog.length > 120) P.slog.shift();
  }

  /* ---------------- справочные функции ---------------- */
  const savings = (P) => Math.round(P.cash + P.box + P.dep + P.depInt);
  const skAvg = (P) => (P.sk.sales + P.sk.coffee + P.sk.people) / 3;
  const age = (P) => C().AGE0 + Math.floor(P.m / 12);
  const year = (P) => Math.floor(P.m / 12) + 1;
  const monName = (P, m) => MONTHS[(START_MON + (m == null ? P.m : m)) % 12];
  const calMon = (P) => (START_MON + P.m) % 12; // 0 = январь
  function monthMs(P) { const y = year(P); for (const [to, ms] of C().MONTH_MS) if (y <= to) return ms; return 6000; }
  function payOf(P) {
    const c = C(), J = c.JOBS[P.job];
    return r100((J.pay + skAvg(P) * c.SKILL_PAY) * P.payK);
  }
  function homeCost(P) { const h = C().HOME[P.home]; return r100(h.cost * (P.home === 'parents' ? 1 : P.rentK)); }
  function studyFee(P) { return P.study ? C().COURSES[P.study.id].month : 0; }
  function monthCost(P) { const c = C(); return homeCost(P) + c.HOME[P.home].transport + c.FOOD[P.food].cost + (c.FUN[P.fun] || c.FUN.some).cost + c.PHONE + studyFee(P) + (P.car ? P.car.pay : 0); }
  function maxExtra(P) { return C().HOME[P.home].maxExtra; }
  // можно ли открывать свою точку: должность управляющего + накопления (или меньше + кредит при стаже и репутации)
  function goal(P) {
    const c = C(), sav = savings(P);
    const credit = P.stazh >= c.CREDIT_STAZH && P.rep >= c.CREDIT_REP;
    const need = credit ? c.GOAL_CREDIT : c.GOAL;
    const job = P.job >= 2;
    return { sav, need, full: c.GOAL, credit, job, ok: job && sav >= need, p: clamp(sav / need, 0, 1), creditNeed: c.GOAL_CREDIT };
  }
  function promoCheck(P) {
    const c = C(), n = P.job + 1, q = c.PROMO[n];
    if (!q) return null;
    const miss = [];
    if (q.coffee && P.sk.coffee < q.coffee) miss.push(`кофе ${Math.floor(P.sk.coffee)}/${q.coffee}`);
    if (q.sales && P.sk.sales < q.sales) miss.push(`продажи ${Math.floor(P.sk.sales)}/${q.sales}`);
    if (q.people && P.sk.people < q.people) miss.push(`люди ${Math.floor(P.sk.people)}/${q.people}`);
    if (P.rep < q.rep && P.stazh < C().PROMO_STAZH) miss.push(`начальник ${Math.floor(P.rep)}/${q.rep}`); // с большим стажем повышают и без любви начальника
    if (P.jobM < q.months) miss.push(`стаж в должности ${P.jobM}/${q.months} мес.`);
    return { job: n, name: c.JOBS[n].name, q, miss, ok: !miss.length };
  }

  /* ---------------- деньги ---------------- */
  function earn(P, v, cat) { v = Math.round(v); P.cash += v; P.earned[cat] = (P.earned[cat] || 0) + v; return v; }
  function spendRec(P, v, cat) { P.spent[cat] = (P.spent[cat] || 0) + Math.round(v); }
  // обязательный платёж: из кошелька; не хватает — из копилки, потом со вклада (проценты сгорают); дальше — в минус (долг)
  function pay(P, v, cat) {
    v = Math.round(v); if (v <= 0) return;
    spendRec(P, v, cat);
    P.cash -= v;
    if (P.cash < 0 && P.box > 0) { const t = Math.min(P.box, -P.cash); P.box -= t; P.cash += t; }
    if (P.cash < 0 && P.dep > 0) {
      const t = Math.min(P.dep, -P.cash); P.dep -= t; P.cash += t;
      if (P.depInt > 0) { feed(P, `Пришлось снять вклад досрочно — проценты (${fm(P.depInt)}) сгорели.`, 'bad'); P.depInt = 0; }
    }
  }
  const canAfford = (P, v, cashOnly) => (cashOnly ? P.cash : P.cash + P.box + P.dep) >= v;

  /* ---------------- действия игрока ---------------- */
  function setHome(S, k) { const P = S.prologue; if (!C().HOME[k]) return { ok: false }; P.home = k; P.extra = Math.min(P.extra, maxExtra(P)); return { ok: true }; }
  function setFood(S, k) { const P = S.prologue; if (!C().FOOD[k]) return { ok: false }; P.food = k; return { ok: true }; }
  function setFun(S, k) { const P = S.prologue; if (!C().FUN[k]) return { ok: false }; P.fun = k; return { ok: true }; }
  function setExtra(S, n) { const P = S.prologue; P.extra = clamp(n | 0, 0, maxExtra(P)); return { ok: true }; }
  function setSaveRate(S, i) { const P = S.prologue; P.saveRate = clamp(i | 0, 0, C().SAVE_RATES.length - 1); return { ok: true }; }
  function studyWhy(P, id) {
    const c = C().COURSES[id]; if (!c) return 'Нет такого курса';
    if (P.study) return 'Уже учитесь — один курс за раз';
    if (P.done[id]) return 'Уже пройден';
    if (id === 'lead' && P.job < 1) return 'Для старших бариста';
    if (!canAfford(P, c.month)) return 'Не хватает денег на первый месяц';
    return null;
  }
  function startStudy(S, id) {
    const P = S.prologue, why = studyWhy(P, id); if (why) return { ok: false, msg: why };
    const c = C().COURSES[id];
    P.study = { id, left: c.months, disc: P.flags.disc && id === 'coffee' ? 0.5 : 0 };
    feed(P, `Записались: «${c.name}» — ${c.months} мес. по ${fm(c.month)}.`, 'info');
    return { ok: true };
  }
  function wantWhy(P, id) {
    const w = C().WANTS[id]; if (!w) return 'Нет такого';
    if ((P.wantsCd[id] || 0) > P.m) return 'Уже есть — пока не хочется';
    if (w.job && P.job < w.job) return 'Банк даст кредит со старшего бариста';
    if (w.monthly && P.car) return 'Ещё платите за прошлую';
    const cost = wantPrice(P, id);
    if (P.cash < cost) return P.cash + P.box + P.dep >= cost ? 'В кошельке не хватает — достаньте из копилки' : 'Не хватает денег';
    return null;
  }
  function wantPrice(P, id) { const w = C().WANTS[id]; const k = P.sale && P.sale.id === id && P.sale.until >= P.m ? P.sale.k : 1; return r100(w.cost * k); }
  function buyWant(S, id, forced) {
    const P = S.prologue, why = forced ? null : wantWhy(P, id); if (why) return { ok: false, msg: why };
    const w = C().WANTS[id], cost = forced ? r100(w.cost) : wantPrice(P, id);
    P.cash -= cost; spendRec(P, cost, WANT_CAT[id]);
    P.mood = clamp(P.mood + w.mood, 0, 100);
    if (w.hp) P.hp = clamp(P.hp + w.hp, 0, 100);
    if (w.people) P.sk.people = clamp(P.sk.people + w.people, 0, 100);
    P.wantsCd[id] = P.m + w.cd;
    if (w.monthly) P.car = { pay: w.monthly, left: w.months };
    if (P.sale && P.sale.id === id) P.sale = null;
    fx(P, 'rub', -cost, 'want'); fx(P, 'mood', w.mood);
    feed(P, `${w.icon} ${w.name} — ${fm(cost)}.`, 'spend');
    return { ok: true, cost };
  }
  function toBox(S, v) { const P = S.prologue; v = Math.round(Math.min(v, P.cash)); if (v <= 0) return { ok: false, msg: 'В кошельке пусто' }; P.cash -= v; P.box += v; P.stats.boxed += v; fx(P, 'box', v); return { ok: true, v }; }
  function fromBox(S, v) { const P = S.prologue; v = Math.round(Math.min(v, P.box)); if (v <= 0) return { ok: false, msg: 'В копилке пусто' }; P.box -= v; P.cash += v; return { ok: true, v }; }
  function toDep(S, v) {
    const P = S.prologue; v = Math.round(Math.min(v, P.cash + P.box)); if (v <= 0) return { ok: false, msg: 'Нечего положить' };
    const fromB = Math.min(P.box, v); P.box -= fromB; P.cash -= v - fromB; P.dep += v; fx(P, 'dep', v);
    feed(P, `На вклад: ${fm(v)} под ${Math.round(C().DEP_RATE * 100)} % годовых.`, 'good');
    return { ok: true, v };
  }
  function fromDep(S) {
    const P = S.prologue; if (P.dep <= 0) return { ok: false, msg: 'Вклада нет' };
    const lost = P.depInt; P.cash += P.dep; P.dep = 0; P.depInt = 0;
    feed(P, lost > 0 ? `Вклад снят досрочно — проценты (${fm(lost)}) сгорели.` : 'Вклад снят.', lost > 0 ? 'bad' : 'info');
    return { ok: true, lost };
  }

  /* ---------------- карточки: сцены с героями, события, итоги ----------------
     Карточка в очереди — { id, v }; определение — CARDS[id]: { kind, who, title(P,v), text(P,v), choices(P,v) }.
     Вариант: { label, desc, cost, cashOnly (соблазн — только из кошелька), fx: { rub, hp, mood, rep, skill, rel } (−3..3), risk, do(P,v) } */
  const eff = (P, o) => {
    if (o.hp) P.hp = clamp(P.hp + o.hp, 0, 100);
    if (o.mood) { P.mood = clamp(P.mood + o.mood, 0, 100); fx(P, 'mood', o.mood); }
    if (o.rep) { P.rep = clamp(P.rep + o.rep, 0, 100); fx(P, 'rep', o.rep); }
    for (const k of ['sales', 'coffee', 'people']) if (o[k]) P.sk[k] = clamp(P.sk[k] + o[k], 0, 100);
  };
  const rel = (P, o) => { for (const k of Object.keys(o)) P.rel[k] = clamp((P.rel[k] || 0) + o[k], -100, 100); };
  const style = (P, k, v) => { P.sm[k] = clamp((P.sm[k] || 0) + v, -100, 100); };
  const mentor = (P, v) => { P.sf.mentor = v; };
  const gift = (P, v, cat, t) => { earn(P, v, cat || 'gifts'); fx(P, 'rub', v); if (t) feed(P, t, 'good'); };
  const ok = (label, desc) => ({ label: label || 'Понятно', desc: desc || '', fx: {}, do() {} });

  const CARDS = {
    /* ---------- сюжет пролога (docs/story.md §7, сцены П1–П8; числа — механика CFG.PROLOGUE) ---------- */
    p01: { kind: 'hero', who: 'rashid', title: () => 'Пять утра, улица Пушкина',
      text: () => 'Рашид Хайруллин, хозяин «Калача»: «Бариста? Мне нужен человек, а не бариста. Кофе — это вода и терпение. Хлеб — вот это работа. Фартук на крючке, касса слева, улыбка — своя». Гуля из цеха, не оборачиваясь: «Сахар — в синей банке, соль — в белой. Перепутаешь — Рашид-абый тебя в тесто замесит. Шучу. Наполовину». 7:02, первый гость — Семён Аркадьевич: «Американо и правду. Правда сегодня в чём? Эчпочмаки вчерашние?»',
      choices: () => [
        { label: '«Сегодняшние. Гуля с четырёх утра тут»', desc: 'Семёну нравится, Гуле — тоже', fx: { rel: 2 }, do(P) { rel(P, { semyon: 5, gulya: 5 }); P.sf.regulars++; } },
        { label: '«Не знаю, я первый день. Сейчас спрошу»', desc: 'Честность — редкость. Рашид услышал', fx: { rel: 1, rep: 1 }, do(P) { rel(P, { semyon: 5, rashid: 5 }); style(P, 'honesty', 5); eff(P, { rep: 2 }); } },
        { label: '«Вчерашние. Но для вас — минус двадцать процентов»', desc: 'Семён в восторге, Рашид — не очень', fx: { rel: 1, rep: -1 }, do(P) { rel(P, { semyon: 10, rashid: -5 }); P.sf.eveHint = true; eff(P, { rep: -2 }); } },
      ] },
    p02: { kind: 'hero', who: 'semyon', title: () => 'Сухой эчпочмак',
      text: () => 'Семён Аркадьевич: «У меня претензия. Эчпочмак сухой, как отчёт Минфина. Я двадцать лет пишу про еду, я такое чувствую зубами». Гуля шёпотом: «Он прав. Картошку вчера пересушили. Но Рашиду не говори».',
      choices: () => [
        { label: '«Извините. Замену — за мой счёт»', desc: 'Постоянный гость это запомнит', cost: 150, fx: { rub: -1, rel: 2 }, do(P) { pay(P, 150, 'other'); rel(P, { semyon: 10 }); P.sf.regulars++; } },
        { label: '«Гуля, выручай — есть свежие?»', desc: 'Гуля поможет, Семён доволен', fx: { rel: 2 }, do(P) { rel(P, { gulya: 5, semyon: 10 }); } },
        { label: '«У нас всегда так, это авторская сухость»', desc: 'Семён смеётся: «Запишу. В раздел „юмор“»', fx: { rel: 1 }, do(P) { rel(P, { semyon: -5, gulya: 5 }); } },
      ] },
    p03: { kind: 'hero', who: 'family', title: () => 'Конверт от бабушки',
      text: () => 'Бабушка Сания пришла в «Калач» в выходном платке: «Показывай, где работаешь. Так… Тесто у вас хорошее. Лук мелковат. Вот. Пятнадцать тысяч. На мечту. Не на кроссовки. На кроссовки я тебе в прошлый раз давала».',
      choices: () => [
        { label: '«Положу на вклад, әби. Честно»', desc: '+15 000 ₽ сразу на вклад', fx: { rub: 2, rel: 1 }, do(P) { earn(P, 15000, 'gifts'); P.cash -= 15000; P.dep += 15000; fx(P, 'dep', 15000); rel(P, { family: 5 }); P.sf.depHint = true; } },
        { label: '«Отдам маме за квартиру»', desc: 'Дома теплее, настроение лучше', fx: { mood: 1, rel: 2 }, do(P) { rel(P, { family: 10 }); eff(P, { mood: 5 }); P.flags.calmHome = P.m; } },
        { label: '«Кроссовки со скидкой — тоже мечта!»', desc: 'Настроение до небес, бабушка — не очень', fx: { mood: 3, rel: -1 }, do(P) { earn(P, 15000, 'gifts'); P.cash -= 15000; spendRec(P, 15000, 'sneakers'); P.wantsCd.sneakers = P.m + C().WANTS.sneakers.cd; eff(P, { mood: 20 }); rel(P, { family: -5 }); feed(P, 'Бабушка видела кроссовки. Сказала: «Красивые. Мечта, видимо, бегает быстро».', 'info'); } },
      ] },
    p04: { kind: 'hero', who: 'oleg', title: () => 'Человек в сером пальто',
      text: () => 'За десять минут до закрытия мужчина в сером пальто берёт весь противень булочек с корицей и платит без сдачи. «Печь всё та же. Ей сорок лет, а температуру держит лучше моих новых. Передай Рашиду: я не ругаться пришёл». Рашид из подсобки, тихо и страшно: «Иди домой. Смена закончилась». У двери мужчина кладёт визитку: «„Хлебный двор“, Олег Кравцов. Надоест варить кофе за копейки — звони. У меня бариста получают на пятнадцать процентов больше».',
      choices: () => [
        { label: 'Взять визитку себе', desc: 'Кто знает, пригодится', fx: { rel: 1 }, do(P) { P.sf.olegCard = true; rel(P, { oleg: 5 }); } },
        { label: 'Отдать визитку Рашиду', desc: '«Когда-то он был лучшим моим пекарем. Больше не спрашивай»', fx: { rel: 1 }, do(P) { rel(P, { rashid: 10, oleg: -5 }); feed(P, 'Рашид: «Спасибо. Когда-то он был лучшим моим пекарем. Больше не спрашивай».', 'hero'); } },
        { label: 'Выбросить, пока никто не видит', desc: 'Гуля видела', fx: { rel: 1 }, do(P) { rel(P, { gulya: 5 }); feed(P, 'Гуля: «Правильно. Я свою тоже выкинула. Два раза».', 'hero'); } },
      ] },
    p05: { kind: 'hero', who: 'rashid', title: () => 'Двести эчпочмаков к утру',
      text: () => 'Рашид: «Свадьба в Демском. Двести эчпочмаков и три бәлеша к восьми утра. Второй пекарь с температурой. Гуля одна». Гуля: «Я справлюсь». Пауза. «Ну, почти».',
      choices: () => [
        { label: '«Остаюсь. Денег не надо»', desc: 'Ночь без сна; Гуля и Рашид этого не забудут', fx: { hp: -2, mood: -1, rel: 3 }, do(P) { eff(P, { hp: -15, mood: -5 }); rel(P, { gulya: 15, rashid: 10 }); style(P, 'care', 5); P.flags.tired = P.m; if (P.rel.gulya >= 25) feed(P, 'На рассвете Гуля: «Когда-нибудь открою пекарню, где тесто будет по моим правилам. Хочешь — возьму тебя кассиром». — «Ещё посмотрим, кто кого возьмёт».', 'hero'); } },
        { label: '«Остаюсь за двойную ставку»', desc: '+6 000 ₽, но устанете', fx: { rub: 1, hp: -2, rel: 1 }, do(P) { earn(P, 6000, 'extra'); fx(P, 'rub', 6000); eff(P, { hp: -15 }); rel(P, { gulya: 5, rashid: 5 }); } },
        { label: '«Не могу, у меня утром смена и курсы»', desc: 'Рашид: «Правильно. Себя тоже надо беречь. Иногда»', fx: { rel: -1 }, do(P) { rel(P, { gulya: -5 }); } },
      ] },
    p06: { kind: 'hero', who: 'elvira', title: () => 'Третий раз за месяц',
      text: () => 'Эльвира Ахметова, отделение «Семь рек» на проспекте Октября: «Вы у нас третий раз за месяц. Или копите на что-то, или вам нравится наша очередь. Своя кофейня? Знаете, сколько их закрывается в первый год? Поэтому вот что. Приходите с цифрами — и я приду с деньгами».',
      choices: () => [
        { label: 'Открыть «Копилку предпринимателя»', desc: 'Вклад +1 п. п.; снимете раньше срока — проценты сгорят', fx: { rub: 1, rel: 1 }, do(P) { P.depBonus = 0.01; P.sf.bankBox = true; rel(P, { elvira: 10 }); feed(P, `Вклад теперь под ${Math.round((C().DEP_RATE + 0.01) * 100)} % годовых.`, 'good'); } },
        { label: 'Обычный вклад', desc: 'Без условий', fx: {}, do() {} },
        { label: '«Спасибо, я без банков»', desc: 'Эльвира запомнит', fx: { rel: -1 }, do(P) { rel(P, { elvira: -5 }); P.sf.noBank = true; } },
      ] },
    h_school: { kind: 'hero', who: 'rashid', title: () => 'Рашид предлагает учёбу',
      text: () => 'Рашид: «Кофе у тебя пока как из автомата на вокзале. Мой старый друг ведёт школу бариста — оплачу половину, если пойдёшь. Не благодари, это я для гостей».',
      choices: () => [
        { label: 'Спасибо, пойду', desc: '«Школа бариста» за полцены — в блоке «Учёба»', fx: { skill: 1, rel: 1, rep: 1 }, do(P) { P.flags.disc = 1; rel(P, { rashid: 6 }); eff(P, { rep: 3 }); } },
        { label: 'Пока не до учёбы', desc: 'Скидка пропадёт', fx: { rel: -1 }, do(P) { rel(P, { rashid: -4 }); } },
      ] },
    h_lesson: { kind: 'hero', who: 'rashid', title: () => 'Урок про аренду',
      text: () => 'Рашид раскладывает на столе счета: «Ты считаешь рубли, а надо считать людей, которые утром идут мимо. Рубли потом сами посчитаются. Останешься после смены — покажу, как не работать на хозяина помещения».',
      choices: () => [
        { label: 'Остаться и слушать', desc: 'Продажи и понимание людей', fx: { skill: 2, hp: -1, rel: 1 }, do(P) { eff(P, { sales: 5, people: 4, hp: -3 }); rel(P, { rashid: 6 }); } },
        { label: 'Спасибо, в другой раз', desc: 'Устали — домой', fx: { hp: 1 }, do(P) { eff(P, { hp: 2 }); } },
      ] },
    promo: { kind: 'hero', who: 'rashid', title: (P) => `Повышение: ${C().JOBS[P.job + 1].name.toLowerCase()}`,
      text: (P) => (P.job === 0 ? 'Рашид: «Кофе у тебя уже лучше моего. Не зазнавайся. Будешь старшим — открываешь смену, учишь новеньких. Оклад выше, спрос тоже».' : 'Рашид: «Смены без тебя разваливаются. Бери управление: график, касса, люди. Это уже почти своё дело. Почти».'),
      choices: (P) => [
        { label: 'Согласиться', desc: `Оклад около ${fm(r100((C().JOBS[P.job + 1].pay + skAvg(P) * C().SKILL_PAY) * P.payK))}`, fx: { rub: 2, mood: 1, rep: 1 }, do(P) { P.job++; P.jobM = 0; eff(P, { mood: 8, rep: 3 }); rel(P, { rashid: 4 }); feed(P, `Повышение! Теперь вы — ${C().JOBS[P.job].name.toLowerCase()}.`, 'good'); fx(P, 'promo', P.job); } },
        { label: 'Пока не готов(а)', desc: 'Рашид предложит снова через 3 месяца', fx: { rep: -1 }, do(P) { P.flags.promoLater = P.m + 3; } },
      ] },
    goal: { kind: 'hero', who: 'elvira', title: () => 'Можно открывать своё!',
      text: (P, v) => (v.credit ? `Накоплено ${fm(savings(P))}. Эльвира из «Семи рек»: «Стаж есть, отзыв от Рашида есть, цифры сходятся. Остальное банк даст в кредит. Поздравляю — теперь у нас с вами отношения. Серьёзные».` : `Накоплено ${fm(savings(P))} — хватает на островок в хорошем месте без кредита. Эльвира из «Семи рек»: «Люблю, когда ко мне приходят с цифрами. Ещё больше люблю, когда цифры сходятся».`),
      choices: () => [
        { label: 'Открыть свою точку', desc: 'Разговор с Рашидом неизбежен', fx: { rub: 3 }, do(P) { P.cards.unshift({ id: 'p07', v: {} }); } }, // сцена П7 — сразу за решением: иначе вперёд пролезет дилемма, уже стоявшая в очереди (живой сюжет v2), и разговор с Рашидом отложится
        { label: 'Ещё поработать и подкопить', desc: 'Сверх 1,5 млн — бонус к старту. Кнопка «Открыть своё» останется', fx: { rub: 1 }, do(P) { P.flags.goalLater = 1; } },
      ] },
    p07: { kind: 'hero', who: 'rashid', title: () => 'Рашид знает',
      text: () => 'Семён Аркадьевич на весь зал: «Слышал, вы своё открываете? Я первый в очереди!» Вечером Рашид наливает два чая. «Семён — хороший человек и ужасный секретарь. Садись. Чай чёрный, разговор тоже. Я не сержусь. Я в двадцать шесть тоже ушёл от хозяина. Скажи мне одно: ты будешь печь хлеб или деньги?»',
      choices: (P) => {
        const r = P.rel.rashid, trust = 'Рашид вам пока не настолько доверяет';
        return [
          { label: '«И то и другое. Научите, как не выбирать»', desc: 'Рашид — друг: старая кофемашина (−8 % на оборудование первой точки) и советы', dis: r >= 0 ? null : trust, fx: { rel: 2, rub: 1 }, do(P) { mentor(P, 'friend'); rel(P, { rashid: 15 }); } },
          { label: '«Деньги. Хлеб у вас получается лучше»', desc: 'Честно и холодно: без бонусов', fx: { rel: -1 }, do(P) { mentor(P, 'cold'); rel(P, { oleg: 5 }); } },
          { label: '«Я забираю своих гостей. И Гулю, если она захочет»', desc: 'Со скандалом: гости и Гуля — с вами, Рашид — враг', fx: { rel: -3, rub: 1 }, do(P) { mentor(P, 'enemy'); rel(P, { rashid: -40 }); style(P, 'fair', -10); P.sf.kalach = 'dvor'; P.sf.gulya = P.rel.gulya >= C().CARRY.BAKER_REL ? 'with' : 'rashid'; } },
          { label: '«Давайте вместе. Вывеска ваша, работа моя»', desc: 'Партнёрство: точка №1 под вывеской «Калач»', dis: r >= 40 ? null : trust, fx: { rel: 3 }, do(P) { mentor(P, 'partner'); rel(P, { rashid: 25, oleg: -10 }); P.sf.gulya = 'with'; P.shares.push({ who: 'rashid', what: 'store1', pct: 0.3 }); } },
          { label: '«Мне предложили стажировку у Олега. На три месяца»', desc: '3 месяца в «Хлебном дворе» (+15 % к окладу), навсегда себестоимость −3 %', dis: P.sf.olegCard ? null : 'Нужна визитка Олега', fx: { rub: 1, rel: -2 }, do(P) { mentor(P, 'intern'); rel(P, { oleg: 20, rashid: -25, gulya: -10 }); P.flags.intern = P.m + 3; P.payK *= 1.15; feed(P, 'Три месяца в «Хлебном дворе». Смены быстрее, но «без души».', 'info'); } },
        ];
      } },
    p08: { kind: 'hero', who: 'gulya', title: () => 'Гуля',
      text: (P) => (P.sf.mentor === 'intern' && P.rel.gulya <= 0 ? 'Гуля на заднем крыльце, с булочкой: «Меня Олег тоже звал. Я не пошла. Вот и ты — иди».' : 'Гуля на заднем крыльце, с булочкой: «Слышала. Стены тут тонкие, а Семён громкий. Ну? Будешь звать или мне самой напрашиваться?»'),
      choices: (P) => {
        const no = P.sf.mentor === 'intern' && P.rel.gulya <= 0 ? 'Гуля не пойдёт' : null;
        return [
          { label: '«Пойдёшь со мной? Зарплата на 20 % выше, чем тут»', desc: 'Гуля — первый сотрудник первой точки (уровень 3)', dis: no, fx: { rel: 1, skill: 1 }, do(P) { P.sf.gulya = 'with'; rel(P, { gulya: 5, rashid: P.sf.mentor === 'friend' ? -5 : -10 }); } },
          { label: '«Пойдёшь партнёром? Десять процентов прибыли точки — твои»', desc: 'Гуля с вами и совладелица точки №1', dis: no, fx: { rel: 2, skill: 1 }, do(P) { P.sf.gulya = 'share'; P.shares.push({ who: 'gulya', what: 'store1', pct: 0.1 }); rel(P, { gulya: 20 }); } },
          { label: '«Останься с Рашидом. Ему ты сейчас нужнее»', desc: 'Гуля остаётся в «Калаче»', fx: { rel: 1 }, do(P) { P.sf.gulya = 'rashid'; rel(P, { gulya: P.sf.mentor === 'cold' ? -5 : 10, rashid: 10 }); } },
        ];
      } },
    /* ---------- рабочие ситуации ---------- */
    warn: { kind: 'neg', who: 'rashid', title: () => 'Разговор с начальником',
      text: () => 'Рашид закрывает дверь: «Опоздания, ошибки в заказах, Семён жалуется. Я молчу громко. Ещё немного — и нам придётся попрощаться».',
      choices: () => [
        { label: 'Исправлюсь', desc: 'Меньше подработок, больше сна — и выйти на «Смену»', fx: { rep: 1 }, do(P) { eff(P, { rep: 4, mood: -3 }); } },
      ] },
    fired: { kind: 'neg', who: 'rashid', title: () => 'Вас уволили',
      text: () => 'Рашид: «Прости, балам, но так дальше нельзя». Месяц уйдёт на поиски — без оклада. В новой кофейне возьмут на ступень ниже, а Рашид когда-нибудь остынет.',
      choices: () => [ok('Начать заново', 'Новая кофейня, тот же вы')] },
    sick: { kind: 'neg', who: 'life', title: () => 'Вы заболели',
      text: () => 'Температура, ломит всё тело. Организм напомнил, что силы не бесконечны.',
      choices: () => [
        { label: 'Больничный', desc: 'Половина оклада в этом месяце, силы восстановятся', fx: { rub: -2, hp: 2 }, do(P) { P.sickNow = true; eff(P, { hp: 25, rep: -2 }); P.stats.sick++; } },
        { label: 'Лекарства и работать', desc: 'Лекарства 4 000 ₽, сил мало, начальник оценит', cost: 4000, fx: { rub: -1, hp: -1, rep: 1 }, do(P) { pay(P, 4000, 'health'); eff(P, { hp: 6, rep: 2, mood: -4 }); } },
      ] },
    err: { kind: 'neg', who: 'rashid', title: () => 'Ошибки на смене',
      text: () => 'От усталости вы перепутали три заказа и пролили молоко на кассу. Рашид молчит громко.',
      choices: () => [ok('Понятно', 'Нужно больше есть и спать')] },
    splurge: { kind: 'neg', who: 'life', title: (P, v) => `Срыв: ${C().WANTS[v.id].name.toLowerCase()}`,
      text: (P, v) => `Настроение на нуле, а в витрине — ${C().WANTS[v.id].name.toLowerCase()}. Рука сама достала карту: −${fm(v.cost)}. Копилка и вклад такие срывы не пускают — там деньги целее.`,
      choices: () => [ok('Эх…', 'Поднимите настроение заранее: кино, отдых, нормальная еда')] },
    /* ---------- случайные события: хорошие ---------- */
    e_grandma: { kind: 'pos', who: 'family', title: () => 'Бабушка передала конверт',
      text: (P, v) => `Мама Фания: «Бабушка Сания просила передать. Сказала — на мечту, а не на кроссовки». В конверте ${fm(v.a)}.`,
      choices: (P, v) => [
        { label: 'В копилку', desc: 'На свою точку', fx: { rub: 2 }, do(P) { earn(P, v.a, 'gifts'); P.cash -= v.a; P.box += v.a; P.stats.boxed += v.a; fx(P, 'box', v.a); } },
        { label: 'Порадовать себя', desc: 'Бабушка бы одобрила', fx: { mood: 2 }, do(P) { earn(P, v.a, 'gifts'); spendRec(P, v.a, 'other'); P.cash -= v.a; eff(P, { mood: 10 }); } },
      ] },
    e_lottery: { kind: 'pos', who: 'life', title: () => 'Выигрыш в лотерею',
      text: (P, v) => `Билет со сдачи оказался счастливым: ${fm(v.a)}!`, choices: (P, v) => [{ label: 'Ура!', desc: '', fx: { rub: 1, mood: 1 }, do(P) { gift(P, v.a, 'gifts'); eff(P, { mood: 5 }); } }] },
    e_bonus: { kind: 'pos', who: 'rashid', title: () => 'Премия от Рашида',
      text: (P, v) => `Рашид протягивает конверт: «Месяц был сильный. Не зазнавайся». Премия ${fm(v.a)}.`, choices: (P, v) => [{ label: 'Спасибо!', desc: '', fx: { rub: 2, mood: 1 }, do(P) { gift(P, v.a, 'other'); eff(P, { mood: 6 }); rel(P, { rashid: 3 }); } }] },
    e_guest: { kind: 'pos', who: 'life', title: () => 'Щедрый постоянный гость',
      text: (P, v) => `Женщина, которая каждое утро берёт раф на кокосовом, оставила ${fm(v.a)} чаевых: «За то, что помните, как я люблю».`,
      choices: (P, v) => [{ label: 'Приятно!', desc: '', fx: { rub: 1, mood: 1 }, do(P) { gift(P, v.a, 'tips'); eff(P, { mood: 5, people: 1 }); } }] },
    e_praise: { kind: 'pos', who: 'semyon', title: () => 'Пост в «Уфа жуёт»',
      text: () => 'Семён Аркадьевич написал в канале: «В „Калаче“ на Пушкина кофе наконец-то догнал хлеб. Рекомендую бариста — помнит, кто что пьёт». Рашид показал пост всей смене и сделал вид, что ему всё равно.',
      choices: () => [{ label: 'Приятно', desc: '', fx: { rep: 2, mood: 1 }, do(P) { eff(P, { rep: 7, mood: 5 }); rel(P, { semyon: 3 }); } }] },
    e_fest: { kind: 'pos', who: 'rashid', title: () => 'Выездная точка на празднике',
      text: () => 'На Сабантуй «Калач» ставит палатку с кофе и эчпочмаками. Рашид ищет, кто выйдет в выходные.',
      choices: () => [
        { label: 'Выйти на праздник', desc: '+12 000 ₽, но устанете', fx: { rub: 2, hp: -1, rep: 1 }, do(P) { gift(P, 12000, 'extra'); eff(P, { hp: -8, rep: 3, sales: 2 }); } },
        { label: 'Отдохнуть', desc: 'Праздник — для себя', fx: { mood: 1, hp: 1 }, do(P) { eff(P, { mood: 6, hp: 4 }); } },
      ] },
    e_cashback: { kind: 'pos', who: 'life', title: () => 'Банк вернул кешбэк',
      text: (P, v) => `За год покупок по карте набежало ${fm(v.a)} кешбэка.`, choices: (P, v) => [{ label: 'Отлично', desc: '', fx: { rub: 1 }, do(P) { gift(P, v.a, 'other'); } }] },
    e_newyear: { kind: 'pos', who: 'rashid', title: () => 'Новогодняя премия',
      text: (P, v) => `Декабрь — самый денежный месяц в кофейне. Рашид раздаёт конверты: вам ${fm(v.a)}.`, choices: (P, v) => [{ label: 'С Новым годом!', desc: '', fx: { rub: 2, mood: 1 }, do(P) { gift(P, v.a, 'other'); eff(P, { mood: 6 }); } }] },
    /* ---------- случайные события: неприятности ---------- */
    e_phone: { kind: 'neg', who: 'life', title: () => 'Разбился телефон',
      text: () => 'Телефон выскользнул из кармана фартука прямо на кафель. Экран — паутина.',
      choices: () => [
        { label: 'Починить экран', desc: '6 000 ₽', cost: 6000, fx: { rub: -1 }, do(P) { pay(P, 6000, 'other'); } },
        { label: 'Купить новый', desc: 'Раз уж так вышло — хороший', cost: 38000, cashOnly: true, fx: { rub: -3, mood: 2 }, do(P) { P.cash -= 38000; spendRec(P, 38000, 'phone2'); eff(P, { mood: 12 }); P.wantsCd.phone = P.m + 24; } },
        { label: 'Ходить с разбитым', desc: 'Бесплатно, но раздражает', fx: { mood: -1 }, do(P) { eff(P, { mood: -8 }); } },
      ] },
    e_fine: { kind: 'neg', who: 'life', title: () => 'Штраф',
      text: (P, v) => `Контролёр в автобусе оказался быстрее, чем оплата по карте. Штраф ${fm(v.a)}.`, choices: (P, v) => [{ label: 'Оплатить', desc: '', fx: { rub: -1 }, do(P) { pay(P, v.a, 'fines'); fx(P, 'rub', -v.a); } }] },
    e_rent: { kind: 'neg', who: 'life', title: () => 'Хозяйка поднимает аренду',
      text: (P) => `«Всё дорожает, сами понимаете». Аренда — +10 % (${fm(r100(homeCost(P) * 0.1))} в месяц).`,
      choices: (P) => [
        { label: 'Согласиться', desc: 'Жильё дороже навсегда', fx: { rub: -1 }, do(P) { P.rentK *= 1.1; } },
        { label: 'Переехать', desc: 'Переезд 6 000 ₽ и суета, зато цена прежняя', cost: 6000, fx: { rub: -1, mood: -1 }, do(P) { pay(P, 6000, 'home'); eff(P, { mood: -6, hp: -3 }); } },
      ] },
    e_cut: { kind: 'neg', who: 'rashid', title: () => 'Урезали смены',
      text: () => 'Рашид: «Гостей мало, на Пушкина ремонт дороги. Два месяца работаем в сокращённом графике». Оклад — минус 20 %.',
      choices: () => [ok('Переживём', 'Можно взять доп. смены в другом месте — в «Как живу»')] },
    e_loan: { kind: 'neg', who: 'friend', title: () => 'Друг просит в долг',
      text: (P, v) => `Дамир: «Выручай, ${fm(v.a)} до зарплаты. Честное слово, верну!»`,
      choices: (P, v) => [
        { label: 'Дать в долг', desc: 'Может, вернёт. А может, и нет', cost: v.a, fx: { rub: -2, rel: 1 }, risk: true, do(P) { pay(P, v.a, 'loans'); P.spent.loans -= v.a; P.loans.push({ v: v.a, back: P.m + ri(P, 2, 4), p: 0.6 }); eff(P, { people: 1 }); } },
        { label: 'Отказать', desc: 'Дамир обидится', fx: { mood: -1 }, do(P) { eff(P, { mood: -4 }); } },
      ] },
    e_sneakers: { kind: 'neg', who: 'life', title: () => 'Распродажа кроссовок −30 %',
      text: () => 'Те самые кроссовки, о которых вы думали полгода, — со скидкой. Только до воскресенья.',
      choices: () => [
        { label: 'Купить', desc: `${fm(r100(C().WANTS.sneakers.cost * 0.7))} вместо ${fm(C().WANTS.sneakers.cost)}`, cost: r100(C().WANTS.sneakers.cost * 0.7), cashOnly: true, fx: { rub: -2, mood: 2 }, do(P) { P.sale = { id: 'sneakers', k: 0.7, until: P.m }; buyWant({ prologue: P }, 'sneakers', false); } },
        { label: 'Пройти мимо', desc: 'Цель важнее', fx: { mood: -1 }, do(P) { eff(P, { mood: -2 }); } },
      ] },
    e_sea: { kind: 'neg', who: 'friend', title: () => 'Друзья зовут на море',
      text: () => 'Дамир: «Горящий тур, неделя в Турции, летим вчетвером! Ты с нами?»',
      choices: () => [
        { label: 'Лететь', desc: '55 000 ₽ — лучшая неделя года', cost: 55000, cashOnly: true, fx: { rub: -3, mood: 3, hp: 2 }, do(P) { P.cash -= 55000; spendRec(P, 55000, 'trip'); eff(P, { mood: 30, hp: 20 }); P.wantsCd.trip = P.m + 12; } },
        { label: 'Остаться', desc: 'Фото в соцсетях будут колоть глаз', fx: { mood: -2 }, do(P) { eff(P, { mood: -7 }); } },
      ] },
    e_bday: { kind: 'neg', who: 'friend', title: () => 'День рождения друга',
      text: () => 'Дамиру 22! Собираются в кафе на Ленина, скидываются на подарок.',
      choices: () => [
        { label: 'Пойти с подарком', desc: '4 500 ₽', cost: 4500, cashOnly: true, fx: { rub: -1, mood: 1 }, do(P) { P.cash -= 4500; spendRec(P, 4500, 'gifts'); eff(P, { mood: 7, people: 1 }); } },
        { label: 'Поздравить в сообщении', desc: 'Бесплатно', fx: { mood: -1 }, do(P) { eff(P, { mood: -3 }); } },
      ] },
    e_short: { kind: 'neg', who: 'rashid', title: () => 'Недостача в кассе',
      text: (P, v) => `В конце смены в кассе не хватило ${fm(v.a)}. Рашид: «Смена твоя — недостача твоя».`,
      choices: (P, v) => [{ label: 'Возместить', desc: '', fx: { rub: -1, rep: -1 }, do(P) { pay(P, v.a, 'fines'); eff(P, { rep: -3 }); fx(P, 'rub', -v.a); } }] },
    e_parents: { kind: 'neg', who: 'family', title: () => 'Дома напряжённо',
      text: () => 'Мама Фания: «Приходишь в полночь, уходишь в пять, ешь на бегу. Ильдар уже забыл, как ты выглядишь. Покушай хотя бы».',
      choices: () => [
        { label: 'Помочь по дому в выходные', desc: 'Меньше отдыха, дома теплее', fx: { hp: -1, mood: 1 }, do(P) { eff(P, { hp: -4, mood: 4 }); rel(P, { family: 3 }); } },
        { label: 'Огрызнуться', desc: 'Все останутся при своём', fx: { mood: -2 }, do(P) { eff(P, { mood: -9 }); rel(P, { family: -3 }); } },
      ] },
    e_tooth: { kind: 'neg', who: 'life', title: () => 'Заболел зуб',
      text: () => 'Холодное молоко, горячий эспрессо — и зуб напомнил о себе.',
      choices: () => [
        { label: 'К стоматологу', desc: '9 000 ₽', cost: 9000, fx: { rub: -2 }, do(P) { pay(P, 9000, 'health'); } },
        { label: 'Потерпеть', desc: 'Может, само пройдёт…', fx: { hp: -2, mood: -1 }, do(P) { eff(P, { hp: -10, mood: -5 }); } },
      ] },
    e_wallet: { kind: 'neg', who: 'life', title: () => 'Украли кошелёк',
      text: (P, v) => `В час пик в автобусе кто-то оказался ловчее вас. Пропало ${fm(v.a)} наличными. Хорошо, что копилка дома.`,
      choices: (P, v) => [{ label: 'Обидно', desc: '', fx: { rub: -1, mood: -1 }, do(P) { P.cash -= v.a; spendRec(P, v.a, 'fines'); eff(P, { mood: -5 }); fx(P, 'rub', -v.a); } }] },
    e_invest: { kind: 'neg', who: 'friend', title: () => 'Знакомый зовёт вложиться',
      text: (P, v) => `Приятель Дамира: «${v.what}. Вложи ${fm(v.a)} — через полгода вернёшь вдвое!»`,
      choices: (P, v) => [
        { label: 'Вложить', desc: 'Иногда везёт. Чаще — нет', cost: v.a, fx: { rub: -2 }, risk: true, do(P) { pay(P, v.a, 'invest'); P.spent.invest -= v.a; P.inv.push({ v: v.a, at: P.m + ri(P, 3, 6), what: v.what }); } },
        { label: 'Отказаться', desc: 'Деньги целее', fx: {}, do() {} },
      ] },
    e_flood: { kind: 'neg', who: 'life', title: () => 'Затопили соседи',
      text: () => 'Сверху прорвало трубу. Хозяйка просит скинуться на ремонт потолка.',
      choices: () => [
        { label: 'Скинуться', desc: '6 000 ₽', cost: 6000, fx: { rub: -1 }, do(P) { pay(P, 6000, 'home'); } },
        { label: 'Отказаться', desc: 'Хозяйка запомнит — жди подорожания', fx: { mood: -1 }, risk: true, do(P) { eff(P, { mood: -3 }); if (rnd(P) < 0.5) { P.rentK *= 1.08; feed(P, 'Хозяйка обиделась и подняла аренду на 8 %.', 'bad'); } } },
      ] },
    e_blackfri: { kind: 'neg', who: 'life', title: () => 'Чёрная пятница',
      text: () => 'Скидки везде: одежда, наушники, кофемолка для дома. Корзина собирается сама.',
      choices: () => [
        { label: 'Набрать корзину', desc: '12 000 ₽', cost: 12000, cashOnly: true, fx: { rub: -2, mood: 2 }, do(P) { P.cash -= 12000; spendRec(P, 12000, 'clothes'); eff(P, { mood: 11 }); } },
        { label: 'Закрыть приложение', desc: '', fx: { mood: -1 }, do(P) { eff(P, { mood: -2 }); } },
      ] },
    e_quit: { kind: 'neg', who: 'rashid', title: () => 'Уволился коллега',
      text: () => 'Второй бариста ушёл без предупреждения. Месяц работаете за двоих.',
      choices: () => [ok('Справимся', 'Сил меньше, опыта больше')] },
    e_check: { kind: 'neg', who: 'rashid', title: () => 'Проверка в кофейне',
      text: (P) => (P.sk.coffee >= 40 ? 'Пришла санитарная проверка. У вашей стойки — идеальный порядок, проверяющая даже взяла визитку.' : 'Пришла санитарная проверка. У вашей стойки нашли просроченные сливки. Рашид красный, как бәлеш из печи.'),
      choices: (P) => [ok(P.sk.coffee >= 40 ? 'Отлично' : 'Больше не повторится')] },
  };

  // пул случайных событий: вес, условие, параметры
  const POOL = [
    { id: 'e_grandma', kind: 'pos', w: 1, init: (P) => ({ a: 1000 * ri(P, 4, 10) }) },
    { id: 'e_lottery', kind: 'pos', w: 0.6, init: (P) => ({ a: 500 * ri(P, 4, 30) }) },
    { id: 'e_bonus', kind: 'pos', w: 1, cond: (P) => P.rep >= 60 && !P.flags.gromov, init: (P) => ({ a: 1000 * ri(P, 6, 14) }) },
    { id: 'e_guest', kind: 'pos', w: 1.2, init: (P) => ({ a: 500 * ri(P, 3, 10) }) },
    { id: 'e_praise', kind: 'pos', w: 1, cond: (P) => P.sk.people >= 25 },
    { id: 'e_fest', kind: 'pos', w: 1.4, cond: (P) => calMon(P) === 5 || calMon(P) === 6, once: 'y' },
    { id: 'e_cashback', kind: 'pos', w: 0.5, init: (P) => ({ a: 500 * ri(P, 3, 8) }) },
    { id: 'e_newyear', kind: 'pos', w: 3, cond: (P) => calMon(P) === 11 && P.rep >= 55, once: 'y', init: (P) => ({ a: 1000 * ri(P, 8, 15) }) },
    { id: 'e_phone', kind: 'neg', w: 0.8 },
    { id: 'e_fine', kind: 'neg', w: 1, init: (P) => ({ a: 500 * ri(P, 3, 6) }) },
    { id: 'e_rent', kind: 'neg', w: 0.8, cond: (P) => P.home !== 'parents' },
    { id: 'e_cut', kind: 'neg', w: 0.6, cond: (P) => !P.cut && P.fired === 0 },
    { id: 'e_loan', kind: 'neg', w: 1, cond: (P) => !P.loans.length, init: (P) => ({ a: 5000 * ri(P, 2, 4) }) },
    { id: 'e_sneakers', kind: 'neg', w: 1, cond: (P) => (P.wantsCd.sneakers || 0) <= P.m },
    { id: 'e_sea', kind: 'neg', w: 1.6, cond: (P) => (calMon(P) >= 5 && calMon(P) <= 7) && (P.wantsCd.trip || 0) <= P.m, once: 'y' },
    { id: 'e_bday', kind: 'neg', w: 1 },
    { id: 'e_short', kind: 'neg', w: 0.8, cond: (P) => rnd(P) > (P.sk.coffee + P.sk.people) / 200, init: (P) => ({ a: 500 * ri(P, 3, 8) }) },
    { id: 'e_parents', kind: 'neg', w: 1.6, cond: (P) => P.home === 'parents' },
    { id: 'e_tooth', kind: 'neg', w: 0.6 },
    { id: 'e_wallet', kind: 'neg', w: 0.5, cond: (P) => P.cash > 3000, init: (P) => ({ a: Math.min(Math.round(P.cash * 0.5 / 100) * 100, 500 * ri(P, 4, 12)) }) },
    { id: 'e_invest', kind: 'neg', w: 0.8, cond: (P) => !P.inv.length, init: (P) => ({ a: 10000 * ri(P, 3, 8), what: ['Перепродаём айфоны из Дубая', 'Криптоферма в гараже у Азата', 'Кофе-фудтрак у Конгресс-холла', 'Ставки на хоккей, «Салават» точно выиграет'][ri(P, 0, 3)] }) },
    { id: 'e_flood', kind: 'neg', w: 0.5, cond: (P) => P.home !== 'parents' },
    { id: 'e_blackfri', kind: 'neg', w: 3, cond: (P) => calMon(P) === 10, once: 'y' },
    { id: 'e_quit', kind: 'neg', w: 0.6, cond: (P) => P.fired === 0 },
    { id: 'e_check', kind: 'neg', w: 0.5, cond: (P) => P.fired === 0 },
  ];
  // неприятности без выбора, которые срабатывают сразу при появлении (последствия описаны в тексте)
  const ON_SHOW = {
    e_cut: (P) => { P.cut = 2; },
    e_quit: (P) => { eff(P, { hp: -8, rep: 3, coffee: 2 }); },
    e_check: (P) => { eff(P, P.sk.coffee >= 40 ? { rep: 5 } : { rep: -5 }); },
  };

  function rollEvent(P) {
    const c = C(), neg = rnd(P) < c.EV_NEG;
    const yearKey = Math.floor(P.m / 12);
    const avail = (kind) => POOL.filter((e) => e.kind === kind && (!e.cond || e.cond(P)) && !(e.once === 'y' && P.flags['y_' + e.id] === yearKey) && P.flags.lastEv !== e.id);
    let list = avail(neg ? 'neg' : 'pos'); if (!list.length) list = avail(neg ? 'pos' : 'neg');
    if (!list.length) return null;
    let tw = 0; for (const e of list) tw += e.w;
    let x = rnd(P) * tw, e = list[0];
    for (const it of list) { x -= it.w; if (x <= 0) { e = it; break; } }
    if (e.once === 'y') P.flags['y_' + e.id] = yearKey;
    P.flags.lastEv = e.id;
    const v = e.init ? e.init(P) : {};
    if (ON_SHOW[e.id]) ON_SHOW[e.id](P, v);
    P.cards.push({ id: e.id, v });
    return e.id;
  }
  // сцены с героями: одна за месяц, по условиям
  function heroScene(P) {
    const f = P.flags;
    // сцены П2–П6 (docs/story.md §7) — по одной в месяц, по условиям; П7–П8 — при достижении цели
    if (!f.h_school && P.m >= 1 && !P.done.coffee && !P.study) return 'h_school';
    if (!f.p02 && (P.m >= 3 || (P.m >= 2 && P.shift.errors > 0))) return 'p02';
    if (!f.p03 && (P.m >= 3 || P.cash < 5000)) return 'p03';
    if (!f.p04 && P.m >= 4) return 'p04';
    if (!f.p05 && ((P.m >= 5 && P.m <= 7 && P.hp >= 40) || P.m >= 8)) return 'p05';
    if (!f.p06 && (P.m >= 6 || savings(P) >= 0.4 * C().GOAL_CREDIT)) return 'p06';
    if (!f.h_lesson && P.m >= 12 && P.rel.rashid >= 15 && P.sf.mentor == null) return 'h_lesson';
    return null;
  }
  function schedule(P) {
    const c = C(); P.evAt = [];
    const dil = V2('overlay', P) && P.cards.length && P.cards[P.cards.length - 1].v2; // дилемма уже в очереди
    const h = P.m > 0 ? heroScene(P) : null;
    if (h) { P.flags[h] = 1; P.evAt.push({ t: 0.15 + rnd(P) * 0.15, hero: h }); }
    const k = year(P) >= c.EV_LATE[0] ? c.EV_LATE[1] : 1;
    // Разводим карточки по времени: в месяц, где уже стоит сцена или дилемма живого сюжета,
    // случайных событий нет. Раньше за один игровой месяц приходило 3–4 окна подряд
    // (сцена + два события + гость) — читать это было нельзя, а «окон» на партию выходило 76.
    if (!h && !dil) {
      if (rnd(P) < c.EV_P1 * k) P.evAt.push({ t: 0.35 + rnd(P) * 0.25 });
      if (rnd(P) < c.EV_P2 * k) P.evAt.push({ t: 0.65 + rnd(P) * 0.25 });
    }
    P.evAt.sort((a, b) => a.t - b.t);
  }

  /* ---------------- ход времени ---------------- */
  // dtMs — реальные миллисекунды × скорость. Возвращает 'card' (появилось решение), 'month' (месяц закрыт) или null.
  function advance(S, dtMs) {
    const P = S.prologue; if (!P || P.status !== 'run' || P.cards.length) return null;
    P.t += dtMs / monthMs(P);
    while (P.evAt.length && P.t >= P.evAt[0].t) {
      const e = P.evAt.shift();
      if (e.hero) P.cards.push({ id: e.hero, v: {} }); else rollEvent(P);
      if (P.cards.length) { P.t = Math.min(P.t, 0.999); return 'card'; }
    }
    if (P.t >= 1) { P.t = 0; endMonth(S); return 'month'; }
    return null;
  }
  // дилемма с живым человеком ждёт в очереди и всплывает раньше рутинного события (docs/story-v2.md п. 2)
  function nextCard(S) {
    const P = S.prologue; if (!P || !P.cards.length) return null;
    if (!P.cards[0].v2 && V2('overlay', P) && P.cards[P.cards.length - 1].v2) { const q = P.cards.pop(); P.cards.unshift(q); }
    return card(S);
  }
  // карточка сверху очереди: определение и варианты (для интерфейса и ботов)
  function card(S, skipPush) {
    const P = S.prologue; if (!P || !P.cards.length) return null;
    const q = P.cards[0], d = CARDS[q.id] || DIL(q.id);
    if (!d) { P.cards.shift(); return card(S); } // чужая карточка (старое сохранение) — просто убираем
    const ch = d.choices(P, q.v).map((c) => Object.assign({}, c, { can: !c.dis && (!c.cost || canAfford(P, c.cost, c.cashOnly)), why: c.dis || (c.cost && !canAfford(P, c.cost, c.cashOnly) ? (c.cashOnly && canAfford(P, c.cost) ? 'В кошельке не хватает' : 'Не хватает денег') : '') }));
    // бесплатный вариант есть почти всегда; если ни один не доступен — открыт первый (иначе игрок застрянет)
    if (!ch.some((c) => c.can)) ch[ch.length - 1].can = true;
    const t0 = typeof d.text === 'function' ? d.text(P, q.v) : d.text;
    return { id: q.id, v: q.v, kind: d.kind, who: d.who, hero: HEROES[d.who] || HEROES.life, title: V2('title', P, q.id, d.title(P, q.v)) || d.title(P, q.v), text: V2('storyText', P, q.id) || t0, choices: ch };
  }
  // определение дилеммы из живого сюжета (тот же формат, что CARDS ядра — интерфейс не меняется)
  function DIL(id) {
    const d = BK.PrologV2 && BK.PrologV2.DILEMMAS && BK.PrologV2.DILEMMAS[id]; if (!d) return null;
    return {
      kind: 'hero', who: d.who, v2: 1,
      // у дилемм живого сюжета title/text — функции: вызываем, иначе игрок увидит исходный код
      title: () => (typeof d.title === 'function' ? d.title() : d.title),
      text: () => (typeof d.text === 'function' ? d.text() : d.text),
      choices: (P) => d.choices(P),
    };
  }
  function choose(S, i) {
    const P = S.prologue, cv = card(S); if (!cv) return { ok: false };
    const c = cv.choices[i | 0] || cv.choices[0];
    if (!c.can) return { ok: false, msg: c.why || 'Недоступно' };
    P.cards.shift();
    c.do(P, cv.v);
    const q = /^«/.test(c.label) ? c.label : `«${c.label}»`;
    // тон последствий варианта — для звука карточки и для записи в ленте (fx.k не обязателен: у многих вариантов только fx.rub)
    const F = c.fx || {};
    let sc = 0;
    for (const k of Object.keys(F)) { const v = F[k] || 0; sc += k === 'rub' ? v * 1.2 : v; }
    const tone = c.risk ? 'risk' : sc > 0 ? 'pos' : sc < 0 ? 'neg' : '';
    if (cv.kind !== 'info' && c.label && cv.choices.length > 1) feed(P, `${cv.title}: ${q}.`, F.k || (cv.kind === 'pos' ? 'good' : cv.kind === 'neg' ? 'bad' : 'hero'));
    if (cv.kind === 'hero') { P.seen[cv.id] = P.m * 30; P.slog.push({ day: null, pm: P.m, id: cv.id, choice: cv.choices.indexOf(c), line: c.label }); if (P.slog.length > 120) P.slog.shift(); }
    if (cv.v2) { P.v2.lastDil = P.m; } // дилемма живого сюжета: отметка темпа
    // развилка П7 → П8 «Гуля» (кроме скандала и партнёрства, где исход ясен) → финал; стажировка у Олега — ещё 3 месяца
    if (cv.id === 'p07') { if (P.sf.mentor === 'enemy' || P.sf.mentor === 'partner') finish(P); else P.cards.unshift({ id: 'p08', v: {} }); }
    else if (cv.id === 'p08' && P.sf.mentor !== 'intern') finish(P);
    syncStory(S);
    if (S.prologue) S.prologue.pick = { id: cv.id, i: cv.choices.indexOf(c), tone, kind: c.fx && c.fx.k || cv.kind, label: c.label }; // звук выбора читает интерфейс
    return { ok: true };
  }

  function endMonth(S) {
    const c = C(), P = S.prologue, J = c.JOBS[P.job], H = c.HOME[P.home], F = c.FOOD[P.food], FN = c.FUN[P.fun] || c.FUN.some;
    const mo = { m: P.m, inc: {}, out: {}, notes: [] };
    const cash0 = savings(P);
    // --- доходы ---
    let salary = payOf(P);
    if (P.fired > 0) { salary = 0; P.fired--; mo.notes.push('Месяц без работы — ищете новое место'); }
    else {
      if (P.cut > 0) { salary *= 0.8; P.cut--; mo.notes.push('Смены урезаны: −20 % оклада'); }
      if (P.sickNow) { salary *= 0.5; mo.notes.push('Больничный: половина оклада'); }
    }
    salary = r100(salary);
    const moodK = P.mood < 30 ? 0.7 : P.mood > 70 ? 1.1 : 1;
    const tips = P.fired > 0 || !salary ? 0 : r100(J.tips * (0.6 + P.sk.sales / 100) * moodK);
    const extraN = P.fired > 0 ? 0 : P.extra;
    const extra = r100(extraN * c.EXTRA.pay * (1 + P.job * 0.15));
    mo.inc.salary = earn(P, salary, 'salary');
    mo.inc.tips = earn(P, tips, 'tips');
    if (extra) mo.inc.extra = earn(P, extra, 'extra');
    // копилка: процент от оклада и подработок — сразу, пока деньги не разошлись
    const rate = c.SAVE_RATES[P.saveRate] || 0;
    if (rate > 0) { const v = r100(Math.max(0, Math.min(P.cash, (salary + extra) * rate))); if (v > 0) { P.cash -= v; P.box += v; P.stats.boxed += v; mo.boxed = v; } }
    // вклад: проценты копятся помесячно, прибавляются к вкладу раз в год (каждый 12-й месяц)
    if (P.dep > 0) { const i = Math.round(P.dep * (c.DEP_RATE + (P.depBonus || 0)) / 12); P.depInt += i; mo.inc.interest = i; P.earned.interest += i; }
    if ((P.m + 1) % 12 === 0 && P.depInt > 0) { P.dep += P.depInt; mo.notes.push(`Проценты по вкладу за год: +${fm(P.depInt)}`); P.depInt = 0; }
    // --- обязательные траты ---
    const out = { home: homeCost(P), transport: H.transport, food: F.cost, fun: FN.cost, phone: c.PHONE, study: 0 };
    if (P.study) { const cs = c.COURSES[P.study.id]; out.study = r100(cs.month * (1 - (P.study.disc || 0))); }
    if (P.car) { out.car = P.car.pay; if (--P.car.left <= 0) { P.car = null; mo.notes.push('Кредит за машину выплачен'); } }
    if (P.cash < 0) out.debt = r100(-P.cash * c.DEBT_RATE); // минус — это кредитка под проценты
    for (const k of Object.keys(out)) { if (out[k] > 0) pay(P, out[k], k); }
    mo.out = out;
    // --- силы, настроение, начальник, навыки ---
    const st = P.study ? c.COURSES[P.study.id] : null;
    let dhp = F.hp + H.hp + FN.hp + extraN * c.EXTRA.hp + c.HP_REST + (st ? c.STUDY_HP : 0);
    if (P.sickNow) { P.sickNow = false; }
    P.hp = clamp(P.hp + dhp, 0, 100);
    let dm = (c.MOOD_BASE - P.mood) * c.MOOD_PULL + H.mood + F.mood + FN.mood + extraN * c.EXTRA.mood + (st ? c.STUDY_MOOD : 0);
    if (P.cash < 0) { dm -= 6; mo.notes.push('Не хватило до зарплаты — заняли у родителей'); }
    P.mood = clamp(P.mood + dm, 0, 100);
    if (P.fired === 0) {
      let dr = (c.REP_BASE - P.rep) * c.REP_PULL + extraN * c.EXTRA.rep;
      if (P.mood < 30) dr -= 3;
      if (P.hp < c.SICK_HP) dr -= 3;
      P.rep = clamp(P.rep + dr, 0, 100);
      P.sk.coffee = clamp(P.sk.coffee + 1.2 + extraN * c.EXTRA.coffee, 0, 100);
      P.sk.sales = clamp(P.sk.sales + 0.6, 0, 100);
      P.sk.people = clamp(P.sk.people + 0.6 + (P.job >= 1 ? 0.4 : 0) + (FN.people || 0), 0, 100);
      P.stazh++; P.jobM++;
    }
    if (P.study) {
      P.study.left--;
      if (P.study.left <= 0) { P.sk[st.skill] = clamp(P.sk[st.skill] + st.add, 0, 100); P.done[P.study.id] = 1; mo.notes.push(`Курс «${st.name}» пройден: ${SK_NAME[st.skill].toLowerCase()} +${st.add}`); feed(P, `Курс «${st.name}» пройден!`, 'good'); fx(P, 'skill', st.add); P.study = null; }
    }
    // --- долги друзьям и вложения ---
    for (const L of P.loans.slice()) {
      if (L.back > P.m) continue;
      P.loans.splice(P.loans.indexOf(L), 1);
      if (rnd(P) < L.p) { P.cash += L.v; mo.notes.push(`Дамир вернул долг: +${fm(L.v)}`); feed(P, `Дамир вернул ${fm(L.v)}.`, 'good'); }
      else { spendRec(P, L.v, 'loans'); mo.notes.push('Дамир так и не вернул долг'); feed(P, `Дамир не вернул ${fm(L.v)}. Дружба дороже… наверное.`, 'bad'); }
    }
    for (const I of P.inv.slice()) {
      if (I.at > P.m) continue;
      P.inv.splice(P.inv.indexOf(I), 1);
      const x = rnd(P);
      if (x < 0.22) { const v = r100(I.v * 2.2); P.cash += v; P.earned.other += v - I.v; mo.notes.push(`Вложение выстрелило: +${fm(v)}`); feed(P, `«${I.what}» — выгорело! Вернули ${fm(v)}.`, 'good'); }
      else if (x < 0.38) { const v = r100(I.v * 1.05); P.cash += v; mo.notes.push(`Вложение вернули: ${fm(v)}`); feed(P, `«${I.what}» — еле вернули свои ${fm(v)}.`, 'info'); }
      else { spendRec(P, I.v, 'invest'); mo.notes.push('Вложение прогорело'); feed(P, `«${I.what}» — всё прогорело, −${fm(I.v)}.`, 'bad'); }
    }
    // --- последствия: болезнь, ошибки, срывы, предупреждения, повышения ---
    if (P.hp < c.SICK_HP && rnd(P) < (c.SICK_HP - P.hp) / c.SICK_HP * 0.8 + 0.1) P.cards.push({ id: 'sick', v: {} });
    else if (P.hp < c.ERR_HP && P.fired === 0) { P.rep = clamp(P.rep - 8, 0, 100); P.cards.push({ id: 'err', v: {} }); }
    if (P.mood < c.SPLURGE_MOOD && rnd(P) < c.SPLURGE_P) {
      const ids = Object.keys(c.WANTS).filter((id) => (P.wantsCd[id] || 0) <= P.m && c.WANTS[id].cost <= Math.max(P.cash, 0));
      if (ids.length) { const id = ids[Math.floor(rnd(P) * ids.length)]; const cost = c.WANTS[id].cost; buyWant(S, id, true); P.stats.splurge++; P.cards.push({ id: 'splurge', v: { id, cost } }); }
    }
    if (P.fired === 0 && P.rep < c.REP_FIRE) {
      P.fired = 1; P.stats.fired++; P.job = Math.max(0, P.job - 1); P.jobM = 0; P.rep = 45; P.payK = 1; P.flags.promoLater = P.m + 4;
      eff(P, { mood: -15 }); rel(P, { rashid: -20 }); P.cards.push({ id: 'fired', v: {} }); feed(P, 'Вас уволили. Месяц на поиски работы.', 'bad'); fx(P, 'ev', -3);
    } else if (P.fired === 0 && P.rep < c.REP_WARN && (P.flags.warnM == null || P.m - P.flags.warnM >= 4)) { P.flags.warnM = P.m; P.stats.warn++; P.cards.push({ id: 'warn', v: {} }); }
    const pr = promoCheck(P);
    if (pr && pr.ok && P.fired === 0 && (P.flags.promoLater == null || P.m >= P.flags.promoLater) && !P.cards.some((x) => x.id === 'promo')) P.cards.push({ id: 'promo', v: {} });
    // --- итог месяца ---
    mo.net = savings(P) - cash0;
    P.mo = mo;
    fx(P, 'month', mo.net);
    P.m++;
    if (P.sale && P.sale.until < P.m) P.sale = null;
    P.hist.push([P.m, savings(P), Math.round(P.hp), Math.round(P.mood), Math.round(P.rep), P.job, Math.round(skAvg(P))]);
    if (P.flags.intern && P.m >= P.flags.intern && P.status === 'run') { P.cards = []; finish(P); syncStory(S); return mo; } // стажировка у Олега окончена
    // --- цель и конец жизни в найме ---
    const g = goal(P);
    if (g.ok && !P.flags.goalShown) { P.flags.goalShown = 1; P.cards.push({ id: 'goal', v: { credit: g.credit && g.sav < g.full } }); }
    if (P.m >= c.LIFE_MONTHS && P.status === 'run' && !g.ok) { P.status = 'life'; P.cards = []; P.won = null; feed(P, 'Годы прошли. Своей точки так и не случилось.', 'bad'); syncStory(S); return mo; }
    V2('tick', P); // живой сюжет: дни болезни, отложенные люди, давление долга, эпилог (src/data/prolog-v2.js)
    schedule(P);
    syncStory(S);
    return mo;
  }
  // «Открыть своё» по кнопке (после «Ещё поработать»)
  function openOwn(S) { const P = S.prologue; if (!goal(P).ok || P.cards.length || P.sf.mentor) return { ok: false }; P.cards.push({ id: 'p07', v: {} }); return { ok: true }; }

  /* ---------------- мини-игра «Смена» ---------------- */
  function shiftWhy(P) {
    if (!P || P.status !== 'run') return 'Пролог окончен';
    if (P.fired > 0) return 'Сейчас вы без работы';
    if (P.shift.m === P.m) return 'Смена в этом месяце уже была';
    if (P.cards.length) return 'Сначала решите, что делать';
    const note = V2('shiftNote', P);
    return note || null;
  }
  // меню стойки: чем выше должность и навык кофе, тем больше позиций
  /* ---------------- мини-игра «Смена» ----------------
     Полка — три ряда по три позиции (ITEMS): у каждой позиции своя клавиша на ПК
     (верхний ряд 1-2-3, средний Q-W-E, нижний A-S-D) — порядок ITEMS и есть порядок полки. */
  const SHELF_KEYS = ['1', '2', '3', 'Q', 'W', 'E', 'A', 'S', 'D'];  const ITEMS = [
    { id: 'esp', name: 'Американо', icon: '☕', cat: 'coffee' },
    { id: 'cap', name: 'Капучино', icon: '🥛', cat: 'coffee' },
    { id: 'lat', name: 'Латте', icon: '🍶', cat: 'coffee' },
    { id: 'cro', name: 'Круассан', icon: '🥐', cat: 'bake' },
    { id: 'bun', name: 'Булочка', icon: '🥯', cat: 'bake' },
    { id: 'ech', name: 'Эчпочмак', icon: '🥟', cat: 'bake' },
    { id: 'tea', name: 'Чай', icon: '🍵', cat: 'coffee' },
    { id: 'cocoa', name: 'Какао', icon: '🍫', cat: 'coffee' },
    { id: 'chk', name: 'Чак-чак', icon: '🍯', cat: 'bake' },
  ];
  /* Расписание смен (задание владельца, docs/story-v2.md): смены приходят САМИ, 5–10 раз за пролог.
     Игрок их не выбирает и не может пропустить — может только оказаться не готовым.
     Месяцы пролога (0 — февраль первого года): промежутки растут вместе с должностью, а после 26-го месяца
     сюжетная жизнь бариста уже позади — дальше только своя точка или «жизнь в найме».
     7 смен: быстрый игрок успевает 6 (≥5), долгая «жизнь в найме» — 7 (≤10). Числа — как CFG.PROLOGUE.SHIFT_AT. */
  const SHIFT_AT_DEF = [0, 3, 6, 10, 14, 19, 25];
  const shiftAt = () => {
    const a = C().SHIFT_AT;
    return (a && a.length) ? a : SHIFT_AT_DEF;
  };
  const shiftsDone = (P) => ((P && P.stats && P.stats.shifts) || 0) | 0;   // счётчик смен лежит в P.stats.shifts (и в сохранении)
  const SHIFT_TIRED_HP = 45;   // «к смене не готов»: не выспались после ночной (сцена П5) или совсем без сил
  function shiftTired(P) {
    if (!P) return false;
    const f = P.flags || {};
    return f.tired === P.m - 1 || f.tired === P.m || P.hp < SHIFT_TIRED_HP;
  }
  // смена, которая уже пришла и ждёт игрока: null — ждать нечего
  function dueShift(P) {
    if (!P || P.status !== 'run') return null;
    const list = shiftAt(), n = shiftsDone(P);
    if (n >= list.length) return null;      // расписание пройдено
    if (P.fired > 0) return null;           // без работы смен не бывает — смена дождётся возвращения
    if (P.cards.length) return null;        // сначала решение по карточке
    if (P.m < list[n]) return null;         // ещё не время
    return { n: n + 1, all: list.length, month: list[n], late: P.m > list[n], first: n === 0, tired: shiftTired(P) };
  }
  function shiftWhy(P) {
    if (!P || P.status !== 'run') return 'Пролог окончен';
    if (P.fired > 0) return 'Сейчас вы без работы';
    if (P.cards.length) return 'Сначала решите, что делать';
    if (!dueShift(P)) return shiftsDone(P) >= shiftAt().length ? 'Смены пролога уже прошли' : 'Эта смена ещё не пришла';
    return null;
  }
  function shiftPlan(P) {
    const c = C(), vm = V2('shiftMods', P); // усталость/болезнь/долг/отношения — хук живого сюжета v2 (docs/story-v2.md)
    return { sec: c.SHIFT_SEC, items: ITEMS.slice(0, 9), keys: SHELF_KEYS, seed: (P.seed ^ (P.m * 7919)) | 0, maxItems: P.sk.coffee >= 40 ? 3 : 2, patience: Math.max(5, 11 + P.sk.people / 12 + ((vm && vm.pat) || 0)), upsell: 0.35 + P.sk.sales / 250, tired: shiftTired(P) };  }
  // итог смены: stats = { served, errors, upsells, lost, total }
  function shiftResult(S, st) {
    const c = C(), P = S.prologue;
    const served = Math.max(0, st.served | 0), errors = Math.max(0, st.errors | 0), ups = Math.max(0, st.upsells | 0), lost = Math.max(0, st.lost | 0);
    const tot = Math.max(1, served + lost);
    const acc = served / Math.max(1, served + errors), rate = served / tot;
    const score = acc * 0.45 + rate * 0.4 + Math.min(1, ups / 4) * 0.15;
    const stars = clamp(Math.round(score * 5 + (served >= 12 ? 0.3 : -0.3)), 1, 5);
    const tips = r100(served * c.SHIFT_TIP * (0.7 + P.sk.sales / 100) + ups * c.SHIFT_UPSELL);
    const add = { sales: Math.min(4, ups * 0.8 + 0.5), coffee: Math.min(3, served * 0.12), people: Math.min(2.5, (served - lost * 0.5) * 0.08) };
    for (const k of Object.keys(add)) { add[k] = Math.max(0, Math.round(add[k] * 10) / 10); P.sk[k] = clamp(P.sk[k] + add[k], 0, 100); }
    const rep = Math.round((stars - 3) * 2.5);
    P.rep = clamp(P.rep + rep, 0, 100);
    const mood = stars >= 4 ? 4 : stars <= 2 ? -3 : 1;
    P.mood = clamp(P.mood + mood, 0, 100);
    P.hp = clamp(P.hp - 2, 0, 100);
    earn(P, tips, 'tips');
    // номер смены в расписании — по счётчику итогов; сам P.shift хранит только последний итог (его читает интерфейс)
    P.shift = Object.assign({}, P.shift, { m: P.m, stars, tips, served, errors, ups, lost, n: shiftsDone(P) + 1 });   // счётчик смены (n) не теряем
    V2('shiftOutcome', P, P.shift, { stars, errors, served, lost, ups, tips }); // больной на смене, срыв, «Рашид узнал» (prolog-v2.js)
    // счётчик смен: по нему расписание SHIFT_AT решает, какая смена следующая (было съедено комментарием при слиянии — из-за
    // этого dueShift() считал расписание непройденным и «Смена» приходила каждый месяц: 34–41 смена за партию вместо 5–10).
    P.stats.shifts++; P.stats.best = Math.max(P.stats.best, stars);
    fx(P, 'rub', tips, 'shift');
    // тон смены — для звука интерфейса («Смена»): удачная (+) / провальная (−) / обычная
    P.lastShift = { stars: stars, tips: tips, tone: stars >= 4 ? 'pos' : stars <= 2 ? 'neg' : '' };
    feed(P, `Смена: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}, чаевые ${fm(tips)}.`, stars >= 4 ? 'good' : stars <= 2 ? 'bad' : 'info');
    return { tips, stars, add, rep, mood };
  }
  // для ботов: смена с качеством q (0..1) без интерфейса; не выспались — играется хуже (как в интерфейсе)
  function simShift(P, q) {
    const vm = V2('shiftMods', P);
    if (vm) q = Math.max(0.15, q - (vm.cloth || 0));
    q = clamp(q * (shiftTired(P) ? 0.88 : 1), 0, 1);    const n = 14 + Math.round(10 * q + rr(P, -2, 2));
    const lost = Math.max(0, Math.round((1 - q) * 6 + rr(P, -1, 1)));
    return { served: Math.max(0, n - lost), errors: Math.max(0, Math.round((1 - q) * 5 + rr(P, -1, 1))), upsells: Math.max(0, Math.round(q * 5 + rr(P, -1, 1))), lost, total: n };
  }

  /* ---------------- финалы и перенос в основную игру ---------------- */
  function finish(P) {
    const g = goal(P);
    P.status = 'won'; P.cards = [];
    P.won = { m: P.m, credit: g.sav < g.full, sav: g.sav, mentor: P.sf.mentor, gulya: P.sf.gulya };
    feed(P, 'Своя точка! Пролог окончен.', 'good');
  }
  // крючок пролога — СМС ночью с неизвестного номера (docs/story.md, после П8)
  function hookSms(P) { return P.sf.mentor === 'intern' ? 'Три месяца — и хватит. Ты не мой человек, ты свой. Удачи. Она понадобится. — О.' : 'Слышал, ты уходишь от Рашида. Правильно. Он тоже когда-то выгнал лучшего. — О.'; }
  const MENTOR = { friend: 'Рашид — друг и советчик', cold: 'С Рашидом — честно и холодно', enemy: 'Рашид — обиженный соперник', partner: 'Рашид — партнёр, точка №1 под вывеской «Калач»', intern: 'Стажировка у Олега — «Школа Двора»' };
  const PERKS = { machine: 'Старая кофемашина Рашида: оборудование первой точки на 8 % дешевле', dvorSchool: '«Школа Двора»: себестоимость −3 % навсегда', regulars: 'Постоянные гости ушли за вами: +гости первой точки на полгода' };
  function trait(P) {
    const k = C().CARRY, earned = Object.values(P.earned).reduce((a, b) => a + b, 0) || 1;
    let fun = 0; for (const x of FUN_CATS) fun += P.spent[x] || 0;
    const saved = savings(P);
    if (fun / earned >= k.SPENDER) return 'spender';
    if (saved / earned >= k.THRIFT && fun / earned < k.THRIFT_WANTS) return 'thrift';
    return null;
  }
  const TRAITS = {
    thrift: { name: 'Бережливый', desc: 'Открытие точек на 3 % дешевле: вы умеете торговаться с подрядчиками' },
    spender: { name: 'Транжира', desc: 'Команда сильнее радуется премиям: +2 к настроению каждый месяц, если премии платятся' },
  };
  // что переносится в основную игру (S — состояние основной игры, для размера стартового капитала)
  function carry(P, S) {
    const k = C().CARRY, cash = S && S.cash ? S.cash : BK.CFG.START_CASH;
    const out = { skills: {}, bonus: 0, baker: null, trait: trait(P), mentor: P.sf.mentor, perks: [], sav: savings(P) };
    const rank = Object.keys(k.SKILL_MAP).filter((s) => P.sk[s] >= k.SKILL_MIN).sort((a, b) => P.sk[b] - P.sk[a]).slice(0, 2);
    for (const s of rank) out.skills[k.SKILL_MAP[s]] = 1;
    const over = Math.max(0, savings(P) - C().GOAL);
    out.bonus = Math.round(Math.min(over * k.BONUS_MULT, cash * k.BONUS_MAX) / 1e4) * 1e4;
    if (P.sf.gulya === 'with' || P.sf.gulya === 'share') out.baker = { name: 'Гульнара Сафина', lvl: P.rel.gulya >= k.BAKER_L3 ? 3 : 2 };
    if (P.sf.mentor === 'friend') out.perks.push('machine');
    if (P.sf.mentor === 'intern') out.perks.push('dvorSchool');
    if (P.sf.mentor === 'enemy' && P.sf.regulars > 0) { out.perks.push('regulars'); out.regulars = P.sf.regulars; }
    return out;
  }
  // применить перенос к основной игре (стадия 2) и закрыть пролог
  function applyCarry(S) {
    const P = S.prologue; if (!P || P.status !== 'won') return null;
    const cr = carry(P, S);
    if (cr.bonus > 0 && !P.toStage1) { S.cash += cr.bonus; } // в стадию 1 «Своя кофейня» идут все накопления целиком (stage1.js)
    if (Object.keys(cr.skills).length) {
      if (BK.Trainers) BK.Trainers.ensure(S); else S.player = S.player || { skills: {}, study: [], log: [], spent: 0 };
      for (const a of Object.keys(cr.skills)) S.player.skills[a] = Math.max(S.player.skills[a] | 0, cr.skills[a]);
    }
    if (cr.perks.includes('dvorSchool')) S.mods.push({ t: 'foodcost', m: 1 - k2().DVOR_FOODCOST, until: 1e9, scope: 'global', target: null, src: 'prologue' });
    P.carry = cr; P.status = 'done';
    syncStory(S);
    const E = BK.Engine, I = E && E._int;
    if (I) {
      const parts = [];
      if (cr.bonus && !P.toStage1) parts.push(`накопления сверх цели +${fm(cr.bonus)} к капиталу`);
      const skn = Object.keys(cr.skills).map((a) => (BK.Trainers ? BK.Trainers.AREA[a].short : a));
      if (skn.length) parts.push(`навыки: ${skn.join(', ')} 1`);
      if (cr.baker) parts.push(`${cr.baker.name} придёт в первую точку (уровень ${cr.baker.lvl})`);
      if (cr.trait) parts.push(`черта «${TRAITS[cr.trait].name}»`);
      for (const x of cr.perks) parts.push(PERKS[x].split(':')[0]);
      I.log(S, `Пролог «Бариста» пройден за ${P.won.m} мес.${parts.length ? ': ' + parts.join('; ') : ''}.`, 'good');
    }
    return cr;
  }
  function skip(S) { const P = S.prologue; if (P) { P.status = 'skipped'; P.cards = []; syncStory(S); } }
  const k2 = () => C().CARRY;
  // итог «жизни в найме» и финала: сколько заработано, куда ушло
  function summary(P) {
    const earned = Object.values(P.earned).reduce((a, b) => a + b, 0);
    const rows = Object.keys(P.spent).filter((k) => P.spent[k] > 0).map((k) => ({ k, name: SPENT_NAME[k] || k, v: P.spent[k], fun: FUN_CATS.includes(k) })).sort((a, b) => b.v - a.v);
    let fun = 0; for (const r of rows) if (r.fun) fun += r.v;
    return { earned, spent: rows.reduce((a, r) => a + r.v, 0), fun, rows, sav: savings(P), months: P.m, age: age(P), job: C().JOBS[P.job].name, stats: P.stats };
  }

  /* ---------------- эффекты переноса в основной игре (обёртки движка, как achievements.js) ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__pro) return;
    Eng.__pro = true;
    const w = (name, fn) => { const orig = Eng[name]; if (orig) Eng[name] = fn(orig); };
    w('rentStore', (o) => function (S) {
      const r = o.apply(this, arguments);
      const cr = S && S.prologue && S.prologue.carry;
      if (!cr || !r || !r.ok || !r.store) return r;
      const k = C().CARRY, st = r.store;
      if (cr.baker && !cr.bakerDone && st.incoming && st.incoming.length) { // Гуля из «Калача» — первый сотрудник первой точки
        const e = st.incoming[0].p; e.name = cr.baker.name; e.lvl = cr.baker.lvl; e.mood = 78; e.trait = Math.max(e.trait, 4); e.patience = 10; e.fromPrologue = 1;
        cr.bakerDone = st.id;
        if (Eng._int) Eng._int.log(S, `${cr.baker.name}, пекарь из «Калача», выходит в точку №${st.num} (уровень ${cr.baker.lvl}).`, 'good');
      }
      if (!cr.store1) { // первая точка: кофемашина Рашида, постоянные гости
        cr.store1 = st.id;
        const pl = (S.macro && S.macro.priceLevel) || 1;
        if (cr.perks.includes('machine')) { const v = Math.round(BK.CFG.STORE_EQUIP[st.size] * pl * k.MACHINE / 1000) * 1000; S.cash += v; if (S.month) S.month.capex = (S.month.capex || 0) - v; cr.machine = v; if (Eng._int) Eng._int.log(S, `Рашид отдал старую кофемашину «Калача»: сэкономлено ${fm(v)}.`, 'good'); }
        if (cr.perks.includes('regulars')) S.mods.push({ t: 'traffic', m: 1 + k.REGULARS_TRAFFIC * Math.min(1, (cr.regulars || 0) / 3), until: (st.openDay || S.day) + 180, scope: 'store', target: st.id, src: 'prologue' });
      }
      if (cr.trait === 'thrift') { // Бережливый: 3 % от отделки и оборудования возвращаются
        const v = Math.round((st.capex || 0) * k.THRIFT_OPEN / 1000) * 1000;
        if (v > 0) { S.cash += v; if (S.month) S.month.capex = (S.month.capex || 0) - v; cr.saved = (cr.saved || 0) + v; }
      }
      return r;
    });
    w('tick', (o) => function (S) {
      const r = o.apply(this, arguments);
      const cr = r && S && S.prologue && S.prologue.carry;
      if (cr && cr.trait === 'spender' && S.alloc && S.alloc.bonus > 0 && Eng.dateOf(S.day).d === 1) { // Транжира: премии радуют сильнее
        const add = C().CARRY.SPENDER_MOOD;
        for (const st of S.stores) for (const e of st.staff) e.mood = Math.min(100, e.mood + add);
      }
      return r;
    });
  }
  wrap();

  BK.Prologue = {
    HEROES, CARDS, POOL, ITEMS, SK_NAME, SPENT_NAME, TRAITS, MONTHS,
    create, start, on, advance, nextCard, card, choose, endMonth, openOwn, schedule, SHELF_KEYS,    savings, goal, promoCheck, payOf, homeCost, studyFee, monthCost, maxExtra, monthMs, age, year, monName, skAvg,
    feed2, fx2, rel2, style2, pay2, spend2, thread2, storyLog2, // хуки живого сюжета v2 (src/data/prolog-v2.js) — имя с «2», чтобы не путать с внутренними feed/fx/rel/style
    setHome, setFood, setFun, setExtra, setSaveRate, startStudy, studyWhy, buyWant, wantWhy, wantPrice, toBox, fromBox, toDep, fromDep,
    shiftWhy, shiftPlan, shiftResult, simShift, dueShift, shiftAt, shiftsDone, shiftTired, finish, carry, applyCarry, skip, summary, trait, wrap, syncStory, storyDefaults, hookSms, MENTOR, PERKS, _rnd: rnd,
  };
})();
