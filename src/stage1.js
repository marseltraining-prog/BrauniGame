/* =====================================================================
   СТАДИЯ 1 «СВОЯ КОФЕЙНЯ» (docs/vision-plan.md §3.2; сюжет — docs/story.md, глава 1, сцены 1.1–1.8). Чистая логика без DOM.
   Решение: второй экономики нет — это ОБЫЧНАЯ игра движка (BK.Engine) с одной точкой и особыми правилами:
     • точка — обычная запись S.stores (small), её спрос, чек, штат, рейтинг, списания, «Сколько печь», вечерняя скидка,
       меню и цены, найм, обучение, ремонт, месячный отчёт, налоги, кредит — всё считает движок;
     • цеха нет: кофейня печёт сама из закупленных полуфабрикатов — хук движка S.stage1.selfBake (мощность = спросу)
       и глобальный модификатор себестоимости ×BAKEOFF_FC; доставки из цеха нет;
     • сам игрок стоит за стойкой — сотрудник с e.hero (хук движка: не увольняется); его силы (hp, из пролога) тают
       от загрузки, часов работы и отсутствия помощников; настроение героя = от сил (продажи, рейтинг); болезнь — дни без него;
     • случайные события сети и кризисы на стадии 1 выключены (S.ev.next отложен), вместо них — простые события кофейни
       и сцены главы 1 (карточки S.stage1.cards, свой ГСЧ S.stage1.rng — основной поток не сдвигается);
     • часы работы — модификатор потока точки по профилю утро/обед/вечер района (engine.daypartOf);
     • «известность» и постоянные гости — модификаторы потока точки (src: 's1').
   Переход в стадию 2 (сцена 1.8 «Вторая вывеска», finish): герой уходит из-за стойки, кофейня становится точкой №1 сети,
   «деньги + стоимость точки» ≈ старт основной игры (±15 %), фаза 'setup_prod' — игрок выбирает цех, дальше обычная игра.
   Пока цех не запущен, кофейня печёт сама (selfBake), после — как все точки.
   Состояние — S.stage1 (нет поля — стадии 1 не было; игры без пролога побайтно прежние):
     { v, status: 'pick'|'run'|'ready'|'done'|'failed'|'skipped', rng, spots[], spot, storeId, openDay, cap0, hp, hours, dayOff,
       sick (до какого дня), hero (сотрудник, пока болеет), aware, reg (постоянные гости), days[[чеки, выручка, загрузка]],
       ms {веха: день}, cards[], seen{}, flags{}, evNext, feed[], fx[], months[{y,m,rev,profit,guests,rating}], streak, loanMax,
       keep {ev, crisis}, next {...итог перехода} }
   Числа — BK.CFG.STAGE1. Интерфейс — src/ui/stage1.js. Боты — sim/stage1.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const C = () => BK.CFG.STAGE1;
  const E = () => BK.Engine;
  const I = () => BK.Engine._int;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  const r1000 = (v) => Math.round(v / 1000) * 1000;
  function rnd(T) { let t = (T.rng = (T.rng + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rr = (T, a, b) => a + (b - a) * rnd(T);
  const ri = (T, a, b) => Math.floor(rr(T, a, b + 1));

  const HEROES = {
    rashid: { name: 'Рашид Хайруллин', role: 'хозяин «Калача», наставник', ini: 'Р', hue: 28 },
    gulya: { name: 'Гуля Сафина', role: 'пекарь, ваша коллега', ini: 'Г', hue: 340 },
    oleg: { name: 'Олег Кравцов', role: 'владелец сети «Хлебный двор»', ini: 'О', hue: 210 },
    elvira: { name: 'Эльвира Ахметова', role: 'банк «Семь рек»', ini: 'Э', hue: 185 },
    family: { name: 'Семья', role: 'мама Фания, брат Ильдар', ini: 'С', hue: 150 },
    semyon: { name: 'Семён Аркадьевич', role: 'постоянный гость, канал «Уфа жуёт»', ini: 'С', hue: 95 },
    aidar: { name: 'Айдар и Лариса', role: 'кандидаты на работу', ini: 'А', hue: 260 },
    life: { name: 'Кофейня', role: 'так бывает', ini: '•', hue: 45 },
    hero: { name: 'Вы', role: 'за стойкой', ini: 'Я', hue: 30 },
    babushka: { name: 'Бабушка Сания', role: 'ваша бабушка', ini: 'Б', hue: 15 },
  };
  const MS = [ // вехи главы (порядок — как в списке)
    { id: 'open', name: 'Открыться' },
    { id: 'hire', name: 'Первый наём' },
    { id: 'plus', name: 'Первый месяц в плюсе' },
    { id: 'g100', name: '100 гостей за день' },
    { id: 'r45', name: 'Рейтинг 4,5★' },
    { id: 'streak', name: 'Три месяца в плюсе подряд' },
    { id: 'second', name: 'Вторая вывеска' },
  ];

  /* ---------------- доступ ---------------- */
  const T0 = (S) => S && S.stage1;
  const on = (S) => !!(S && S.stage1 && ['pick', 'run', 'ready'].includes(S.stage1.status));
  const running = (S) => !!(S && S.stage1 && (S.stage1.status === 'run' || S.stage1.status === 'ready'));
  function store(S) { const T = T0(S); return T && T.storeId ? S.stores.find((x) => x.id === T.storeId) || null : null; }
  function hero(S) { const st = store(S); return st ? st.staff.find((e) => e.hero) || null : null; }
  /* ---------- местный слой (src/data/story-cast.js): «Калач», «Семь рек», Рашид, ул. Пушкина ----------
     Тексты стадии 1 идут через эти три точки (лента, СМС, журнал) — и читаются местно, если партия
     начата не в Уфе. Для Уфы swap() возвращает строку как есть: партия побайтно прежняя. */
  function sub(S, t) { const C = BK.STORY_CAST; if (!C || !C.swap || t == null) return t; try { return C.swap(S, String(t)); } catch (e) { return t; } }
  function subT(T, t) { return sub({ startCity: (T && T.city) || null }, t); }
  function feed(T, t, k) { T.feed.push({ day: T.lastDay || 0, t: subT(T, t), k: k || 'info' }); if (T.feed.length > 40) T.feed.shift(); }
  /* Родовые формы героя (PLAN.md §8.1): пол выбирается на стартовом экране, лежит в S.story.hero.
     Базовое правило — тексты безличные («вы», «ты»); форма нужна только там, где без неё не по-русски:
     «Пока справлюсь сам» / «…сама». Без выбора пола (старые сохранения, боты) — мужская форма, как было. */
  const sex = (S, m, f) => (BK.Story && BK.Story.g ? BK.Story.g(S, m, f) : m);
  const hname = (S) => (BK.Story && BK.Story.heroName ? BK.Story.heroName(S) : 'шеф');
  const hword = (S) => sex(S, 'молодой человек', 'девушка');
  // а цикл слоя перерисовывается десятки раз в секунду. Здесь только чтение, состояние не меняется.
  function daySig(S) {
    const T = T0(S), st = store(S); if (!T || !st) return '';
    const td = st.today || {};
    return [S.day, T.status, T.hp | 0, T.aware.toFixed(3), T.reg | 0, Math.round(td.checks || 0), Math.round(td.rev || 0), td.closed ? 1 : 0, st.status, st.staff.length, st.incoming.length, T.months.length, st.repair, T.hired, T.days.length, st.rating ? +st.rating.toFixed(2) : ''].join('|');
  }
  function fx(T, kind, v, extra) {
    let ex = extra || {};
    if (kind === 'sms' && ex) ex = Object.assign({}, ex, { who: subT(T, ex.who), text: subT(T, ex.text) }); // СМС из «Калача» — по городу партии
    T.fx.push(Object.assign({ kind, v }, ex)); if (T.fx.length > 30) T.fx.splice(0, T.fx.length - 30);
  }
  function log(S, text, kind) { if (I()) I().log(S, sub(S, text), kind || 'info'); }
  function setMod(S, key, t, m, scope, target, until) { // один модификатор стадии 1 по ключу (обновляется, не копится)
    let x = S.mods.find((z) => z.s1 === key);
    if (!x) { x = { t, m, until: until || 1e9, scope: scope || 'global', target: target || null, src: 's1', s1: key }; S.mods.push(x); }
    x.m = m; x.until = until || 1e9; return x;
  }
  function addMod(S, t, m, days, st) { S.mods.push({ t, m, until: S.day + days, scope: st ? 'store' : 'global', target: st ? st.id : null, src: 's1ev' }); }
  const pro = (S) => S.prologue || null;
  const storyF = (S) => (S.story && S.story.f) || {};
  function rel(S, o) { if (!S.story) return; for (const k of Object.keys(o)) S.story.rel[k] = clamp((S.story.rel[k] || 0) + o[k], -100, 100); }
  function meter(S, k, v) { if (S.story) S.story.m[k] = clamp((S.story.m[k] || 0) + v, -100, 100); }
  function flag(S, k, v) { if (S.story) S.story.f[k] = v; }

  /* ---------------- старт: места на выбор ---------------- */
  function genSpots(S, T) {
    const c = C(), pl = S.macro.priceLevel;
    return c.SPOTS.map((k) => {
      // Уфа сохраняет прежний выбор и поток ГСЧ; в другом городе выбираем
      // соответствующий тип района из его карты вместо отсутствующего уфимского id.
      const local = S.startCity && S.startCity !== 'ufa';
      const types = k.id === 'mall' ? ['biz', 'prestige', 'sleep'] : k.id === 'stop' ? ['sleep', 'far', 'outskirts'] : ['student', 'center'];
      const candidates = local ? BK.DISTRICTS.filter((d) => types.includes(d.arch)) : null;
      const pool = local ? (candidates.length ? candidates : BK.DISTRICTS) : k.districts;
      const selected = pool[ri(T, 0, pool.length - 1)];
      const d = local ? selected : E().byId(BK.DISTRICTS, selected);
      const area = ri(T, k.area[0], k.area[1]);
      const city = local ? BK.CITY_BY_ID[S.startCity] : null;
      const rentM2 = Math.round(rr(T, k.rent[0], k.rent[1]) * pl * (city ? city.rent : 1) / 10) * 10;
      const traffic = Math.round(rr(T, k.traffic[0], k.traffic[1]) / 50) * 50;
      const solv = Math.round(rr(T, k.solv[0], k.solv[1]) * (city ? city.inc : 1) / 5) * 5;
      const a = rnd(T) * Math.PI * 2, r = 14 + rnd(T) * 20;
      return { kind: k.id, name: k.name, icon: k.icon, note: k.note, district: d.id, dname: d.name, x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r * 0.85,
        address: `${d.streets[ri(T, 0, d.streets.length - 1)]}, ${ri(T, 1, 90)}`, area, rentM2, traffic, solv, landmarks: k.lm.slice(), comp: +rr(T, 0.9, 1).toFixed(2),
        hours: k.hours.slice(), fit: Math.round(k.fit * area * pl), equip: Math.round(k.equip * pl) };
    });
  }
  function spotCost(S, sp) {
    const T = T0(S), cr = pro(S) && pro(S).carry;
    let equip = sp.equip;
    if (cr && cr.perks && cr.perks.includes('machine')) equip = Math.round(equip * (1 - BK.CFG.PROLOGUE.CARRY.MACHINE)); // старая кофемашина Рашида
    const rent = sp.area * sp.rentM2; // депозит — месяц аренды
    const stock = r1000(60000 * S.macro.priceLevel); // первая закупка, посуда, касса
    const thrift = cr && cr.trait === 'thrift' ? Math.round((sp.fit + equip) * BK.CFG.PROLOGUE.CARRY.THRIFT_OPEN) : 0;
    const total = sp.fit + equip + rent + stock - thrift;
    return { fit: sp.fit, equip, rent, stock, thrift, total, left: (S.cash || 0) - total, machine: sp.equip - equip, T };
  }
  // спрос места для карточки выбора: гостей в день через 5 мес. (движок, стандартный день, одно меню) и профиль дня
  function spotPreview(S, sp) {
    const tmp = Object.assign({ id: '__s1', status: 'open', size: 'small', repair: 0, staff: [{ lvl: 2 }, { lvl: 1 }], staffTarget: 2 }, sp);
    const d = E().storeDemand(S, tmp, { dow: 2, m: 4 }, E().menuStats(S));
    const dp = E().daypartOf(sp);
    const cov = hoursCover(dp, sp.hours[0]);
    return { guests: Math.round(d.demand * cov), check: Math.round(d.check), dp: { m: dp.m, d: dp.d, e: dp.e, peak: dp.peak } };
  }
  function hoursCover(dp, h) { const c = (C().HOURS[h] || C().HOURS.day).cover; return c[0] * dp.m + c[1] * dp.d + c[2] * dp.e; }

  // время пролога: у пролога свой счёт месяцев (с февраля, герою 21), кофейня открывается по календарю игры (1 января 2027).
  // Календарь не двигаем — честно говорим о скачке: «Прошло 2 года 3 мес. Январь 2027, вам 23».
  function timeLine(S) {
    const P = pro(S); if (!P || !(P.m >= 0) || !BK.Prologue || !BK.Prologue.age) return '';
    const y = Math.floor(P.m / 12), m = P.m % 12, n10 = y % 10, n100 = y % 100;
    const yw = n10 === 1 && n100 !== 11 ? 'год' : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? 'года' : 'лет';
    const gone = [y ? `${y} ${yw}` : '', m ? `${m} мес.` : ''].filter(Boolean).join(' ') || 'меньше месяца';
    const d = E().dateOf(S.day), mon = E().MONTHS[d.m];
    return `Прошло ${gone}${gone.endsWith('.') ? '' : '.'} ${mon.charAt(0).toUpperCase() + mon.slice(1)} ${d.y}, вам ${BK.Prologue.age(P)}.`;
  }
  // начало стадии 1: S — новая игра движка (фаза 'setup_prod'), пролог пройден. Деньги стадии — накопления пролога.
  function start(S) {
    const P = pro(S), c = C();
    const T = S.stage1 = {
      v: 1, status: 'pick', rng: ((S.seed || 1) ^ 0x51c0f3) | 0, spots: [], spot: null, storeId: null, openDay: null, cap0: 0,
      hp: P ? clamp(Math.round(P.hp), 35, 100) : 80, hours: null, dayOff: false, sick: 0, hero: null, aware: c.AWARE0, reg: 0,
      days: [], ms: {}, cards: [], seen: {}, flags: {}, evNext: 0, feed: [], fx: [], months: [], streak: 0, loanMax: 0, lastScene: -99, lastDay: S.day,
      keep: { ev: Math.max(30, S.ev.next - S.day), crisis: Math.max(365, S.ev.nextCrisis - S.day) }, next: null, hired: 0, share: 0,
    };
    if (S.startCity && S.startCity !== 'ufa') T.city = S.startCity; // местный слой: город партии (в Уфе поля нет)
    // деньги: накопления пролога (+ кредит, если открывались «950 тыс. + банк»); партнёрство с Рашидом — его 40 %
    const sav = P ? BK.Prologue.savings(P) : BK.CFG.PROLOGUE.GOAL;
    let cash = sav;
    const f = storyF(S);
    if (f.mentor === 'partner') { const add = r1000(Math.min(sav * c.SHARE_RASHID_CASH / (1 - c.SHARE_RASHID_CASH), 1200000)); cash += add; T.flags.rashidIn = add; T.share += 0.3; }
    if (f.gulya === 'share') T.share += 0.1;
    // «950 тыс. + кредит» (финал пролога по кредиту): банк сразу даёт недостающее до 1,5 млн
    let credit = 0;
    if (P && P.won && P.won.credit) credit = r1000(Math.max(0, BK.CFG.PROLOGUE.GOAL - sav));
    S.cash = Math.round(cash + credit); S.reserve = 0; S.loan = credit;
    T.cap0 = S.cash;
    T.loanMax = r1000(c.LOAN_BASE + credit + (f.bankBox ? c.LOAN_BANKBOX : 0));
    if (credit) T.flags.credit0 = credit;
    // сеть и её события — позже: случайные события и кризисы сети ждут стадии 2
    S.ev.next = 1e9; S.ev.nextCrisis = 1e9;
    S.menu = c.MENU_START.map((id) => ({ id, pm: 1 }));
    S.alloc = { reserve: 0, bonus: 0.03, marketing: 0.04 };
    if (S.tutorial) { T.flags.tutOn = !!S.tutorial.on || !!(P && P.tutOn); S.tutorial.on = false; }
    T.spots = genSpots(S, T);
    // сюжет на входе в главу (только факты пролога): «Открыть кофейню заново» вернёт его, а не решения проваленной попытки
    if (S.story) T.story0 = JSON.parse(JSON.stringify(S.story));
    T.timeLine = timeLine(S);
    if (T.timeLine) feed(T, T.timeLine, 'info');
    feed(T, `Своя кофейня! В кармане ${fm(S.cash)}${credit ? ` (из них ${fm(credit)} — кредит «Семь рек»)` : ''}${f.mentor === 'partner' ? ` (из них ${fm(T.flags.rashidIn)} — доля Рашида)` : ''}. Осталось выбрать место.`, 'good');
    return T;
  }

  // выбор места → точка в движке (как rentStore, но островок: своя смета, без цеха)
  function pick(S, idx) {
    const T = T0(S); if (!T || T.status !== 'pick') return { ok: false, msg: 'Место уже выбрано' };
    const sp = T.spots[idx | 0]; if (!sp) return { ok: false, msg: 'Нет такого места' };
    const c = spotCost(S, sp);
    if (S.cash < c.total) return { ok: false, msg: `Не хватает ${fm(c.total - S.cash)}` };
    const E0 = E(), In = I();
    In.spend(S, c.fit + c.equip + c.stock - c.thrift, 'capex'); In.spend(S, c.rent, 'capex');
    const st = {
      id: In.nextId(S, 's'), address: sp.address, district: sp.district, x: sp.x, y: sp.y, area: sp.area, size: 'small',
      rentM2: sp.rentM2, payMode: 'month', rentPaidUntil: 0, traffic: sp.traffic, solv: sp.solv, landmarks: sp.landmarks.slice(), comp: sp.comp,
      status: 'opening', openDay: S.day + C().OPEN_DAYS, repair: 0, repairUntil: 0, closedUntil: 0,
      staff: [], incoming: [], staffTarget: 2, capex: c.fit + c.equip + c.stock - c.thrift, m: { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 }, last: null, hist: [],
      num: (S.flags.storeNum = (S.flags.storeNum || 0) + 1), s1: sp.kind, s1name: sp.name,
    };
    // вы — за стойкой: сотрудник-герой (уровень — от навыков пролога)
    const P = pro(S), sk = P ? BK.Prologue.skAvg(P) : 40;
    const h = In.makePerson(S, clamp(1 + Math.round(sk / 30), 1, 4));
    Object.assign(h, { name: 'Вы', hero: 1, trait: 6, patience: 30, mood: 70 });
    st.staff.push(h);
    S.stores.push(st);
    T.storeId = st.id; T.spot = sp; T.hours = sp.hours.includes('day') ? 'day' : sp.hours[0]; T.status = 'run';
    T.selfBake = true; // хук движка: мощность «цеха» = спросу (печём из закупки)
    setMod(S, 'fc', 'foodcost', C().BAKEOFF_FC, 'global');
    applyHours(S);
    setMod(S, 'aware', 'traffic', T.aware, 'store', st.id);
    const cr = P && P.carry;
    if (cr) { cr.store1 = st.id; cr.bakerDone = cr.baker ? st.id : cr.bakerDone; if (c.machine) cr.machine = c.machine; if (c.thrift) cr.saved = (cr.saved || 0) + c.thrift; } // перки пролога уже учтены здесь (обёртки rentStore их не повторят)
    if (cr && cr.perks && cr.perks.includes('regulars')) { T.reg = 30 * Math.min(3, cr.regulars || 1); } // ушли со скандалом — гости Рашида идут за вами
    S.phase = 'play';
    S.nextOfferDay = S.day + 30;
    T.evNext = S.day + C().OPEN_DAYS + ri(T, 20, 30);
    log(S, `Своя кофейня: ${sp.name.toLowerCase()}, ${sp.address} (${sp.dname}), ${sp.area} м². Открытие через ${C().OPEN_DAYS} дн.`, 'good');
    feed(T, `${sp.name}: ${sp.address}. Сборка островка — ${C().OPEN_DAYS} дней.`, 'good');
    return { ok: true, store: st };
  }

  /* ---------------- решения игрока (обёртки движка + свои) ---------------- */
  function applyHours(S) {
    const T = T0(S), st = store(S); if (!st) return;
    setMod(S, 'hours', 'traffic', hoursCover(E().daypartOf(st), T.hours), 'store', st.id);
  }
  function setHours(S, h) {
    const T = T0(S); if (!T || !T.spot || !T.spot.hours.includes(h)) return { ok: false, msg: 'Такие часы здесь нельзя' };
    T.hours = h; applyHours(S); return { ok: true };
  }
  function setDayOff(S, v) { const T = T0(S); if (!T) return { ok: false }; T.dayOff = !!v; return { ok: true }; }
  function menuWhy(S, id, add) {
    const c = C(), n = S.menu.length;
    if (add) {
      if (n >= c.MENU_MAX) return `На островке помещается ${c.MENU_MAX} позиций`;
      const p = E().byId(BK.PRODUCTS, id);
      // flags.pact — день окончания договора с Олегом (12 мес.): после него хлеб и пироги снова можно
      if (T0(S).flags.pact > S.day && p && (p.cat === 'bread' || p.cat === 'pies')) return sub(S, 'Договор с Олегом: хлеб и пироги — у «Двора»');
      return null;
    }
    if (n <= c.MENU_MIN) return `Нужно хотя бы ${c.MENU_MIN} позиций`;
    return null;
  }
  function menuAdd(S, id) { const w = menuWhy(S, id, true); if (w) return { ok: false, msg: w }; if (S.menu.some((m) => m.id === id)) return { ok: false }; S.menu.push({ id, pm: 1 }); return { ok: true }; }
  function menuRemove(S, id) { const w = menuWhy(S, id, false); if (w) return { ok: false, msg: w }; S.menu = S.menu.filter((m) => m.id !== id); return { ok: true }; }
  function gulyaAvail(S) { const f = storyF(S), T = T0(S); return (f.gulya === 'with' || f.gulya === 'share') && !T.flags.gulyaIn; }
  function gulyaLvl(S) { const r = S.story ? S.story.rel.gulya : 0; return r >= BK.CFG.PROLOGUE.CARRY.BAKER_L3 ? 3 : 2; }
  function addPerson(S, name, lvl, days, extra) {
    const st = store(S), e = I().makePerson(S, lvl);
    Object.assign(e, { name }, extra || {});
    st.incoming.push({ p: e, day: S.day + days });
    if (st.staff.length + st.incoming.length > st.staffTarget) st.staffTarget = st.staff.length + st.incoming.length;
    S.stats.hires++;
    return e;
  }
  function hireWhy(S) { const st = store(S); if (!st) return 'Нет точки'; if (st.staff.length + st.incoming.length + (T0(S).hero ? 1 : 0) >= BK.CFG.SIZES.small.staffMax) return `За стойкой островка помещается ${BK.CFG.SIZES.small.staffMax} человека`; return null; }
  function inviteGulya(S) {
    const T = T0(S), w = hireWhy(S); if (w) return { ok: false, msg: w };
    if (!gulyaAvail(S)) return { ok: false, msg: sub(S, 'Гуля осталась в «Калаче»') };
    addPerson(S, sub(S, 'Гульнара Сафина'), gulyaLvl(S), 3, { mood: 80, trait: 6, patience: 12, fromPrologue: 1, gulya: 1 });
    T.flags.gulyaIn = 1; hired(S, sub(S, 'Гуля'));
    rel(S, { gulya: 5 });
    return { ok: true };
  }
  function hire(S, candId) {
    const w = hireWhy(S); if (w) return { ok: false, msg: w };
    const r = E().hire(S, store(S).id, candId);
    if (r.ok) hired(S, r.p && r.p.name);
    return r;
  }
  function hired(S, name) {
    const T = T0(S); T.hired++;
    feed(T, `${name} выходит на работу.`, 'good');
    milestone(S, 'hire');
  }
  function loanRoom(S) { const T = T0(S); return Math.max(0, T.loanMax - S.loan); }
  function loanWhy(S) {
    const T = T0(S);
    if (storyF(S).noBank && T.openDay != null && S.day - T.openDay < C().LOAN_WAIT_NOBANK) return sub(S, 'Вы сказали Эльвире «я без банков» — кредит только через 3 месяца работы');
    if (storyF(S).noBank && T.openDay == null) return sub(S, 'Вы сказали Эльвире «я без банков» — кредит только через 3 месяца работы');
    if (loanRoom(S) <= 0) return 'Банк больше не даёт: лимит для одной кофейни исчерпан';
    return null;
  }
  function takeLoan(S, v) {
    const w = loanWhy(S); if (w) return { ok: false, msg: w };
    v = Math.min(v || loanRoom(S), loanRoom(S));
    S.loan += v; S.cash += v;
    log(S, `Кредит «Семь рек» на кофейню: ${fm(v)} под ${(E().loanRate(S) * 100).toFixed(1).replace('.', ',')}% годовых.`, 'warn');
    feed(T0(S), `Эльвира: «Поздравляю с кредитом. Теперь у нас с вами отношения». +${fm(v)}`, 'info');
    return { ok: true, v };
  }

  /* ---------- поломки: кофемашина и поставка ----------
     «3 дня только чай и выпечка» — это правда: на эти дни кофе убирается из меню дня (продажи и статистика продуктов
     его не видят), сорванная поставка так же убирает выпечку (остаются напитки). Меню игрока не меняется: в обёртке
     tick на время дневного шага ставится урезанное меню, после шага — прежнее. Срок — как у модификатора события
     (until > дня шага). Если урезать нечего оставить — меню дня полное. */
  const COFFEE = ['americano', 'cappuccino', 'raf'];
  function outage(S, kind, days) { const T = T0(S); if (!T) return; T.out = T.out || {}; T.out[kind] = Math.max(T.out[kind] || 0, S.day + days); }
  function outageMenu(S, day) {
    const o = T0(S) && T0(S).out; if (!o) return null;
    const coffee = (o.coffee || 0) > day, pastry = (o.pastry || 0) > day;
    if (!coffee && !pastry) { delete T0(S).out; return null; }
    const L = S.menu.filter((m) => { const p = E().byId(BK.PRODUCTS, m.id); if (coffee && COFFEE.includes(m.id)) return false; if (pastry && p && p.cat !== 'drinks') return false; return true; });
    return L.length && L.length < S.menu.length ? L : null;
  }

  /* ---------------- день ---------------- */
  function preTick(S) { // до дневного шага движка: выходной и болезнь героя
    const T = T0(S), st = store(S); if (!st || st.status !== 'open') return;
    const tm = E().dateOf(S.day + 1);
    const h = hero(S);
    T.offToday = false;
    if (T.sick > S.day + 1 || (T.hero && T.sick > S.day)) return; // болеет — героя нет за стойкой (снят в postTick)
    if (T.dayOff && tm.dow === 6 && h) { // воскресенье: вы отдыхаете; одни — точка закрыта
      T.offToday = true;
      if (st.staff.length === 1) st.closedUntil = Math.max(st.closedUntil || 0, S.day + 2);
      else { st.staff.splice(st.staff.indexOf(h), 1); T.offHero = h; }
    }
  }
  function postTick(S) {
    const T = T0(S), c = C(), st = store(S); if (!st) return;
    T.lastDay = S.day;
    if (T.offHero) { st.staff.push(T.offHero); T.offHero = null; }
    // открытие
    if (st.status === 'open' && T.openDay == null) {
      T.openDay = S.day; milestone(S, 'open'); fx(T, 'guest', 1);
      queue(S, 's11', {}, true);
      T.dvorDay = S.day + ri(T, 30, 42);
    }
    if (T.openDay == null) return;
    const td = st.today || {};
    const others = st.staff.filter((e) => !e.hero).length;
    if (!td.closed) { T.days.push([Math.round(td.checks || 0), Math.round(td.rev || 0), +(td.load || 0).toFixed(3)]); if (T.days.length > 35) T.days.shift(); }
    // силы героя
    const h = hero(S);
    if (T.hero && S.day >= T.sick) { // выздоровел
      st.staff.push(T.hero); T.hero = null; T.hp = Math.max(T.hp, c.SICK_BACK);
      feed(T, 'Вы снова за стойкой.', 'good');
    } else if (h) {
      let d = c.HP_REST;
      if (T.offToday) d += c.HP_DAYOFF;
      else if (!td.closed) d -= c.HP_WORK * (c.HOURS[T.hours] || c.HOURS.day).hp * clamp(td.load || 0, 0.35, 1.5) * c.HP_HELP[Math.min(3, others)];
      else d += 2;
      T.hp = clamp(T.hp + d, 0, 100);
      h.mood = clamp(c.HERO_MOOD[0] + c.HERO_MOOD[1] * T.hp, 0, 100); h.unhappy = 0; h.fatigue = clamp(100 - T.hp, 0, 100);
      if ((T.hp < c.SICK_HP && rnd(T) < c.SICK_P * (1 + (c.SICK_HP - T.hp) / c.SICK_HP)) || T.hp <= 0) {
        T.sick = S.day + ri(T, c.SICK_DAYS[0], c.SICK_DAYS[1]);
        st.staff.splice(st.staff.indexOf(h), 1); T.hero = h;
        T.flags.sickN = (T.flags.sickN || 0) + 1;
        queue(S, 'sick', { alone: st.staff.length === 0, days: T.sick - S.day }, true);
      }
    }
    if (!st.staff.length && T.hero) st.closedUntil = Math.max(st.closedUntil || 0, T.sick + 1); // одни и заболели — точка закрыта
    // известность и постоянные гости
    const od = S.day - T.openDay;
    T.aware = Math.min(1, c.AWARE0 + (1 - c.AWARE0) * od / c.AWARE_DAYS);
    const rt = E().storeRating(S, st);
    if (!td.closed) T.reg = Math.max(0, T.reg + (td.checks || 0) * c.REG_K * clamp((rt - 3.9) / 0.6, 0, 1.6) - T.reg * c.REG_CHURN);
    setMod(S, 'aware', 'traffic', T.aware * (1 + c.REG_TRAFFIC * Math.min(1, T.reg / c.REG_FULL)), 'store', st.id);
    // вехи дня
    const g7 = avg7(T);
    if (!td.closed && (td.checks || 0) >= c.G100 - 0.5) milestone(S, 'g100');
    if (rt >= c.R45) milestone(S, 'r45');
    // «Двор» напротив (сцена 1.1 → 1.3)
    if (T.dvorDay && S.day === T.dvorDay) {
      setMod(S, 'dvor', 'traffic', 0.96, 'store', st.id, S.day + 400);
      feed(T, 'Напротив открылся «Хлебный двор». Часть гостей ушла посмотреть.', 'bad');
      T.flags.dvorOpen = S.day;
      fx(T, 'sms', 0, { who: 'Семён Аркадьевич', text: '«Двор» открылся напротив вас. Пирожки по 49. Хожу пока к вам — из принципа.' });
    }
    // события сети (переманивание, ценовая война соперника) на стадии 1 не приходят — только события кофейни
    if (S.ev.queue && S.ev.queue.length) S.ev.queue = S.ev.queue.filter((x) => x.id !== 'e141' && x.id !== 'e142');
    if (S.ev.pending) { const n = (S.ev.pending.choices || []).length; E().resolveEvent(S, Math.max(0, n - 1)); }
    // шеф-пекарь основной игры на стадии 1 не приходит: меню кофейни — во вкладке «Меню»
    if (S.chef.pending) S.chef.pending = null;
    // простые события кофейни и сцены главы
    scenes(S);
    if (S.day >= T.evNext && !T.cards.length) { rollEvent(S); T.evNext = S.day + ri(T, c.EV_GAP[0], c.EV_GAP[1]); }
    if (E().dateOf(S.day).d === 1 && S.history.length) monthEnd(S);
    readyCheck(S);
  }
  function avg7(T) { const L = T.days.slice(-7); let c = 0, r = 0, l = 0; for (const x of L) { c += x[0]; r += x[1]; l += x[2]; } const n = L.length || 1; return { n: L.length, checks: c / n, rev: r / n, load: l / n }; }

  /* ---------- обязательства главы, которые живут дольше неё: доли партнёров и помощь «Калачу» ----------
     Доли (S.story.shares — Рашид 30 %, Гуля 10 % от точки №1) платит BK.Story.sharesMonthly 1-го числа: её зовёт
     обёртка сюжета (src/story.js, Story.day). Если сюжет в партии не идёт (выключен, прогоны ботов), ту же выплату
     делает обёртка стадии 1 — один раз за 1-е число (Story ставит lastShare = день выплаты). Работает и в главе,
     и после перехода в сеть, пока доли есть. */
  function sharesFallback(S) {
    const R = S.story; if (!R || !R.v || !R.shares || !R.shares.length || !BK.Story || !BK.Story.sharesMonthly) return 0;
    if (R.lastShare === S.day) return 0; // сюжет уже заплатил сегодня
    return BK.Story.sharesMonthly(S);
  }
  // сколько ушло партнёрам сегодня (1-го числа): выплата — первая запись статьи «Партнёрам» нового месяца
  function sharesPaidToday(S) { return S.story && S.story.lastShare === S.day ? Math.round(S.month.inv || 0) : 0; }
  // «Не продавайте. Я помогу» (сцена 1.7): KALACH_MONTHS выплат 1-го числа, в главе и после неё — пока не кончатся.
  // В главе — вложение в «Калач», не расход кофейни (серию прибыльных месяцев не ломает), в сети — статья «Партнёрам».
  function kalachMonthly(S) {
    const T = T0(S); if (!T || !T.flags || !(T.flags.kalachHelp > 0) || T.flags.kalachPaid === S.day || T.status === 'failed') return 0;
    const v = r1000(C().KALACH_HELP * S.macro.priceLevel);
    I().spend(S, v, T.status === 'done' ? 'inv' : 'capex');
    T.flags.kalachHelp--; T.flags.kalachPaid = S.day;
    if (T.status === 'done') log(S, `Помощь «Калачу»: −${fm(v)} (статья «Партнёрам»)${T.flags.kalachHelp ? `, осталось ${T.flags.kalachHelp} мес.` : ' — последняя, обещание выполнено'}.`, 'info');
    else feed(T, `Помощь «Калачу»: −${fm(v)}. Рашид: «Печь горит. Спасибо, балам».`, 'info');
    return v;
  }
  function monthEnd(S) {
    const T = T0(S), c = C(), st = store(S), h = S.history[S.history.length - 1];
    if (!h || T.months.some((x) => x.y === h.y && x.m === h.m)) return;
    // доли партнёров (Рашид 30 %, Гуля 10 %) платит общий механизм сюжета (BK.Story.sharesMonthly, статья «Партнёрам»):
    // 1-го числа от прибыли точки №1 за прошлый месяц, расходом нового месяца — так же, как после перехода в сеть.
    // Закрытый месяц (h.profit, h.pnl, h.cash) не трогаем: все отчёты показывают одну и ту же прибыль.
    const share = sharesPaidToday(S);
    const full = T.openDay != null && S.day - T.openDay >= 26;
    const L = T.days.slice(-30); let g = 0; for (const x of L) g += x[0];
    const row = { y: h.y, m: h.m, rev: Math.round(h.rev), profit: Math.round(h.profit), guests: L.length ? Math.round(g / L.length) : 0, rating: +E().storeRating(S, st).toFixed(2), share, full, cash: Math.round(S.cash) };
    T.months.push(row);
    if (full) T.streak = h.profit > 0 ? T.streak + 1 : 0;
    if (full && h.profit > 0) { if (!T.ms.plus) { milestone(S, 'plus'); queue(S, 's16', { profit: row.profit }); } }
    if (T.streak >= c.READY_STREAK) milestone(S, 'streak');
    kalachMonthly(S); // помощь «Калачу» (сцена 1.7, вариант А)
    // совет наставника после плохого месяца (сцена 1.2 вводит)
    T.advice = full && h.profit < 0 ? advice(S) : null;
    fx(T, 'month', row.profit, { row });
    // провал: счёт в минусе, кредит исчерпан
    if (S.cash < 0 && S.reserve <= 0) T.negM = (T.negM || 0) + 1; else T.negM = 0;
    if ((T.negM >= c.FAIL_NEG_MONTHS && loanRoom(S) <= 0) || S.lost) fail(S);
  }
  function fail(S) {
    const T = T0(S); if (T.status === 'failed') return;
    T.status = 'failed'; T.cards = []; T.failDay = S.day; fx(T, 'fail', 1);
    log(S, 'Кофейня закрылась: деньги кончились.', 'bad');
    if (S.story) S.story.log.push({ day: S.day, id: 's1fail', choice: null, line: 'Кофейня закрылась' });
  }
  // «Совет наставника»: кто советует — по развилке П7 (Рашид / Эльвира / Гуля), что — по самой острой проблеме месяца
  function advisor(S) { const f = storyF(S); return f.mentor === 'friend' || f.mentor === 'partner' ? 'rashid' : f.mentor === 'enemy' ? (T0(S).flags.gulyaIn ? 'gulya' : 'semyon') : 'elvira'; }
  function advice(S) {
    const T = T0(S), st = store(S), who = advisor(S), a7 = avg7(T), ms = E().menuStats(S);
    const B = ms.avgPrice * BK.CFG.ITEMS_PER_CHECK, Sv = st.solv * S.macro.priceLevel;
    const W = E().wasteState(S), last = st.last || {};
    if (a7.load > 0.95 && st.staff.length + st.incoming.length < BK.CFG.SIZES.small.staffMax) return { who, act: 'hire', text: who === 'rashid' ? '«Очередь до трамвая, а ты один. Люди не ждут — люди уходят. Возьми человека».' : '«Очередь теряет гостей. Второй человек за стойкой окупится быстрее кредита».' };
    if (B > Sv * 1.05) return { who, act: 'price', text: who === 'rashid' ? '«Цены у тебя как на проспекте, а люди тут считают сдачу. Скинь немного — придут».' : '«Средний чек выше кошелька района — половина уходит, посмотрев на доску. Снизьте цены на 5–10 %».' };
    if ((last.waste || 0) > (last.rev || 1) * 0.05 && W.bake > -2) return { who, act: 'bakeLess', text: who === 'rashid' ? '«Витрина полная, зал пустой. Кому ты печёшь — себе? Пеки меньше».' : '«Списания съедают прибыль. Пеките меньше или включите вечернюю скидку».' };
    if (T.hp < 40) return { who, act: 'hire', text: '«На тебе лица нет. Один ты долго не простоишь — найми помощника или возьми выходной».' };
    if (hoursCover(E().daypartOf(st), T.hours) < 0.8 && T.spot.hours.length > 1) return { who, act: 'hours', text: who === 'rashid' ? '«Балам, у тебя открыто, когда людей нет. Люди идут на трамвай в полвосьмого — открывайся раньше».' : '«Посмотрите, когда у вас идут люди, и работайте в эти часы».' };
    return { who, act: null, text: who === 'rashid' ? '«Первый год всегда в минус. Не паникуй, считай людей, а не рубли».' : '«Кассовый разрыв — это не приговор. Держите запас на месяц аренды и зарплат».' };
  }

  /* ---------------- вехи ---------------- */
  function milestone(S, id) {
    const T = T0(S); if (!T || T.ms[id] != null) return false;
    T.ms[id] = S.day;
    const m = MS.find((x) => x.id === id);
    const n = Object.keys(T.ms).length;
    log(S, `Веха главы «Своя точка»: ${m.name}.`, 'good');
    if (S.story) S.story.log.push({ day: S.day, id: 'ms_' + id, choice: null, line: m.name });
    fx(T, 'milestone', n, { id, name: m.name });
    return true;
  }
  function msList(S) { const T = T0(S); return MS.map((m) => ({ id: m.id, name: m.name, day: T && T.ms[m.id] != null ? T.ms[m.id] : null })); }
  // ближайшая цель для HUD: что именно и сколько осталось
  function nextGoal(S) {
    const T = T0(S), c = C(), st = store(S);
    if (!T || !st || T.openDay == null) return { id: 'open', name: 'Открыться', p: st ? clamp(1 - (st.openDay - S.day) / c.OPEN_DAYS, 0, 1) : 0, v: st ? `через ${Math.max(0, st.openDay - S.day)} дн.` : '' };
    if (T.status === 'ready' || T.status === 'done') return { id: 'second', name: 'Вторая вывеска', p: 1, v: 'можно открывать' }; // переход уже открыт — других целей не требуем
    if (T.ms.plus == null) { const p = S.month.rev ? clamp((S.month.rev - (S.month.fc || 0)) / Math.max(1, S.month.rev), 0, 1) : 0; return { id: 'plus', name: 'Первый месяц в плюсе', p, v: `${T.streak ? '' : 'итог 1-го числа'}` }; }
    // условие перехода — «100 гостей ИЛИ 4,5★» (readyCheck): хватает одного из двух, показываем то, что ближе
    if (T.ms.g100 == null && T.ms.r45 == null) {
      const g = T.days.slice(-7).reduce((a, x) => Math.max(a, x[0]), 0), r = E().storeRating(S, st);
      const pg = clamp(g / c.G100, 0, 1), pr = clamp((r - 3.5) / 1, 0, 1);
      return { id: pg >= pr ? 'g100' : 'r45', name: `${c.G100} гостей за день или рейтинг 4,5★`, p: Math.max(pg, pr), v: `лучший день недели — ${g} · ${r.toFixed(2).replace('.', ',')}★` };
    }
    if (T.streak < c.READY_STREAK) return { id: 'streak', name: 'Три месяца в плюсе подряд', p: T.streak / c.READY_STREAK, v: `${T.streak} из ${c.READY_STREAK}` };
    const own = S.cash + S.reserve - S.loan, need = c.READY_CASH * S.macro.priceLevel;
    if (own < need) return { id: 'cash', name: `Свои деньги ${fm(r1000(need))}`, p: clamp(own / need, 0, 1), v: `сейчас ${fm(r1000(Math.max(0, own)))}` };
    return { id: 'second', name: 'Вторая вывеска', p: 0.9, v: 'скоро' };
  }
  // разговор «Что мешает»: какая часть цели не взята, почему и что сделать
  function stuckTalk(S) {
    const T = T0(S), c = C(), g = nextGoal(S), n = T.flags.stuckN = (T.flags.stuckN || 0) + 1;
    const who = n === 1 ? 'babushka' : n % 2 === 0 ? advisor(S) : (T.flags.gulyaIn ? 'gulya' : 'semyon');
    const vy = who === 'elvira'; // Эльвира — на «вы», свои люди — на «ты»
    const a = advice(S), mo = Math.round((S.day - T.openDay) / 30.4), st = store(S);
    const best = T.days.slice(-7).reduce((m, x) => Math.max(m, x[0]), 0), rt = E().storeRating(S, st).toFixed(1).replace('.', ',');
    const TIP = {
      hire: vy ? 'Вы один за стойкой — очередь уходит. Возьмите помощника.' : 'Ты один не вытянешь, очередь уходит. Возьми помощника.',
      price: vy ? 'Цены выше кошелька района — люди смотрят на доску и уходят. Снизьте на 5–10 %.' : 'Цены у тебя выше, чем люди тут могут платить. Посмотри на доску их глазами и сбавь немного.',
      bakeLess: vy ? 'Списания съедают прибыль. Пеките меньше или включите вечернюю скидку.' : 'Много выпечки уходит в мусор. Пеки меньше или делай вечером скидку.',
      hours: vy ? 'Вы открыты, когда людей нет. Работайте в часы, когда они идут мимо.' : 'Ты открыт, когда людей нет. Работай в часы, когда они идут мимо.',
      none: vy ? 'Держите витрину свежей, а команду — отдохнувшей: рейтинг растёт от мелочей.' : 'Следи, чтобы витрина была свежей, а люди за стойкой — не уставшими. Гости это видят.',
      loss: vy ? 'Откройте отчёт месяца: что съедает больше всего — аренда, зарплаты или списания? С этого и начните.' : 'Открой отчёт месяца и посмотри, что съедает больше всего — аренда, зарплаты или списания. С этого и начни.',
      cash: vy ? 'Не тратьте лишнего и гасите кредит — тогда банк заговорит о второй точке.' : 'Не трать лишнего и гаси кредит — тогда и банк заговорит о второй точке.',
    };
    const loss = g.id === 'plus' || g.id === 'streak', act = g.id === 'cash' ? null : a.act, tip = g.id === 'cash' ? TIP.cash : TIP[act || (loss ? 'loss' : 'none')];
    const gst = (k) => k + ' ' + (k % 10 === 1 && k % 100 !== 11 ? 'гость' : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? 'гостя' : 'гостей');
    const you = (t, v) => vy ? v : t;
    let why;
    if (g.id === 'cash') why = you(`В плюсе ты уже держишься, а своих денег мало: надо ${fm(r1000(c.READY_CASH * S.macro.priceLevel))}, у тебя ${g.v.replace('сейчас ', '')}.`, `В плюсе вы держитесь, а своих денег мало: нужно ${fm(r1000(c.READY_CASH * S.macro.priceLevel))}, у вас ${g.v.replace('сейчас ', '')}.`);
    else if (g.id === 'g100' || g.id === 'r45') why = you(`Людей мало. Надо 100 гостей за день или рейтинг 4,5★, а у тебя лучший день — ${gst(best)}, рейтинг ${rt}★.`, `Гостей мало. Нужно 100 за день или рейтинг 4,5★, а у вас лучший день — ${gst(best)}, рейтинг ${rt}★.`);
    else why = you(`Плюс не держится: нужно три месяца в плюсе подряд, а у тебя ${g.id === 'streak' ? g.v : 'ещё ни одного'}.`, `Плюс не держится: нужно три месяца в плюсе подряд, а у вас ${g.id === 'streak' ? g.v : 'ещё ни одного'}.`);
    const open = who === 'babushka' ? `Бабушка Сания приходит с банкой варенья и долго смотрит на зал. «${mo} месяцев ты тут, балам. Я считать не умею, но вижу.`
      : who === 'gulya' ? 'Гуля после смены садится напротив: «{boss}, давай честно.' : who === 'semyon' ? 'Семён Аркадьевич допивает кофе: «Скажу как старый гость.'
      : who === 'elvira' ? 'Эльвира заходит под вечер: «Давайте посмотрим, что мешает.' : `${HEROES[who] ? HEROES[who].name.split(' ')[0] : 'Наставник'} заходит под вечер: «Давай посмотрим, что не так.`;
    return { who, act, tip: `«${tip}»`, text: `${open} ${why} ${tip}»` };
  }
  function readyCheck(S) {
    const T = T0(S), c = C(); if (T.status !== 'run' || T.openDay == null) return;
    const od = S.day - T.openDay;
    const s17done = !!T.seen.s17 || storyF(S).mentor === 'enemy';
    const own = S.cash + S.reserve - S.loan;
    const ok = (T.streak >= c.READY_STREAK && od >= c.READY_MIN_DAYS && s17done && own >= c.READY_CASH * S.macro.priceLevel && (T.ms.g100 != null || T.ms.r45 != null));
    // Переход — только по заявленной цели главы (три месяца в плюсе, 100 гостей или 4,5★, свои деньги). Запасного пути
    // «через 15 мес. хватит одного плюса» больше нет, покупка «Калача» цель тоже не обходит: «Калач» войдёт в сеть
    // вместе с кофейней, когда цель взята.
    if (!ok) return;
    T.status = 'ready';
    feed(T, 'Эльвира: «С такими цифрами можно говорить о второй точке». Кнопка «Вторая вывеска» — в «Точке».', 'good');
    queue(S, 'ready', {});
  }

  /* ---------------- карточки: сцены главы 1 и события ----------------
     Как в прологе: определение — CARDS[id]: { kind: 'hero'|'pos'|'neg'|'info', who, title(S,v), text(S,v), choices(S,v) };
     вариант: { label, desc, cost, fx: {rub, guests, team, hp, rel} (−3..3), dis (причина недоступности), do(S, v) }. */
  const ok1 = (label, desc) => ({ label: label || 'Понятно', desc: desc || '', fx: {}, do() {} });
  const mentorWho = (S) => { const f = storyF(S); return f.mentor === 'friend' || f.mentor === 'partner' ? 'rashid' : f.mentor === 'enemy' ? (T0(S).flags.gulyaIn ? 'gulya' : 'semyon') : 'elvira'; };
  const semyonClose = (S) => (S.story ? S.story.rel.semyon : 0) >= 10;
  const CARDS = {
    s11: { kind: 'hero', who: 'family', title: () => 'Ключи',
      text: (S) => `Мама: «Я посчитала. Если в день будет сорок гостей, ты выходишь в ноль к маю. Если тридцать — к ноябрю. Если двадцать — приходи ужинать каждый день». Ильдар: «Короче, давай я тебе соцсети сделаю. Бесплатно. Ну почти. Кроссовки хочу». ${semyonClose(S) ? 'Семён Аркадьевич — первый в очереди: «Американо и правду».' : 'Семён Аркадьевич обещал зайти «проверить слухи».'} На другой стороне улицы на пустой витрине висит баннер: «Хлебный двор. Скоро!»`,
      choices: (S) => [
        { label: '«Ильдар, делай»', desc: 'Бесплатно: гостей +8 % на 2 месяца. Брат рад. Может выйти что-то неожиданное', fx: { guests: 2, rel: 1 }, do(S) { addMod(S, 'traffic', 1.08, 60, store(S)); rel(S, { family: 5 }); flag(S, 'ildar', 'smm'); } },
        { label: 'Агентство', desc: 'Гостей +8 % на 2 месяца, без сюрпризов', cost: r1000(60000 * S.macro.priceLevel), fx: { rub: -1, guests: 2 }, do(S) { I().spend(S, r1000(60000 * S.macro.priceLevel), 'marketing'); addMod(S, 'traffic', 1.08, 60, store(S)); flag(S, 'ildar', 'agency'); } },
        { label: '«Без соцсетей, сарафан надёжнее»', desc: semyonClose(S) ? 'Семён напишет пост «Открылись»: +5 % на месяц' : 'Сарафан — дело небыстрое', fx: { guests: semyonClose(S) ? 1 : 0 }, do(S) { if (semyonClose(S)) { addMod(S, 'traffic', 1.05, 30, store(S)); feed(T0(S), 'Семён в «Уфа жуёт»: «Открылись. Американо честный, правда — тоже».', 'good'); } flag(S, 'ildar', 'none'); } },
      ] },
    s12: { kind: 'hero', who: (S) => mentorWho(S), title: () => 'Пустая витрина',
      text: (S) => { const w = mentorWho(S); return w === 'rashid' ? 'Рашид заходит без предупреждения: «Витрина полная, зал пустой. Красиво, как в музее. Балам, у тебя хлеб выходит в десять. А люди идут на трамвай в полвосьмого. Кому ты печёшь — себе?»' : w === 'elvira' ? 'Эльвира заходит за кофе: «Средний чек у вас хороший. Чеков мало. Когда у вас люди идут мимо? Не знаете? Вот и я не знаю. Узнайте».' : w === 'gulya' ? 'Гуля, вытирая стойку: «Слышь, {boss}, мы стоим, а люди идут мимо. Может, откроемся, когда они идут?»' : 'Семён Аркадьевич: «Пусто у вас, как в редакции в пятницу. Люди идут мимо в полвосьмого, а у вас ещё закрыто».'; },
      choices: (S) => { const T = T0(S), early = T.spot.hours.includes('early') || T.spot.hours.includes('full'); return [
        { label: '«Открываемся раньше»', desc: early ? 'Часы 7:00–16:00: утренний поток; и +5 % гостей на 2 месяца' : 'ТЦ открывается в 10 — зато акция у входа: +6 % гостей на 2 месяца', fx: { guests: 2, hp: early ? -1 : 0 }, do(S) { if (early) { T.hours = T.spot.hours.includes('early') ? 'early' : 'full'; applyHours(S); } addMod(S, 'traffic', early ? 1.05 : 1.06, 60, store(S)); T.flags.hoursHint = 1; } },
        { label: '«Снижу цены на кофе»', desc: 'Кофе дешевле на 5 %: гостей больше, чек меньше', fx: { guests: 1, rub: -1 }, do(S) { for (const it of S.menu) { const p = E().byId(BK.PRODUCTS, it.id); if (p && p.cat === 'drinks') E().setPrice(S, it.id, it.pm - 0.05); } addMod(S, 'conv', 1.06, 60, store(S)); } },
        { label: '«Подожду ещё месяц»', desc: '«Жди. Хлеб ждать не будет»', fx: {}, do() {} },
      ]; } },
    s13: { kind: 'hero', who: 'oleg', title: () => 'Кофе напротив',
      text: () => 'Олег Кравцов — со стаканом кофе из своей точки: «Хороший у тебя кофе. У меня дешевле». Садится. «Давай как взрослые. Я не хочу с тобой воевать, у меня двенадцать точек и одна ты. Ты — кофе и сладкое. Я — хлеб и пироги. Ты не ставишь хлеб на витрину, я не варю раф. Все живы».',
      choices: (S) => { const out = [
        { label: '«Договорились»', desc: 'Пироги и хлеб — не у вас (12 мес.), зато «Двор» почти не отнимает гостей', fx: { guests: 1, rel: 1 }, do(S) { const st = store(S); setMod(S, 'dvor', 'traffic', 0.99, 'store', st.id, S.day + 365); T0(S).flags.pact = S.day + 365; S.menu = S.menu.filter((m) => { const p = E().byId(BK.PRODUCTS, m.id); return !(p && (p.cat === 'bread' || p.cat === 'pies')); }); while (S.menu.length < C().MENU_MIN) { const id = C().MENU_ALL.find((x) => !S.menu.some((m) => m.id === x) && !['bread', 'pies'].includes(E().byId(BK.PRODUCTS, x).cat)); S.menu.push({ id, pm: 1 }); } flag(S, 'lenin', 'pact'); rel(S, { oleg: 20 }); meter(S, 'fair', 10); } },
        { label: '«Спасибо, но у нас свободный рынок»', desc: 'Обычная конкуренция: −4 % гостей, пока «Двор» рядом', fx: { guests: -1 }, do(S) { flag(S, 'lenin', 'no'); rel(S, { oleg: 5 }); } },
        { label: '«Посмотрим, чей хлеб вкуснее»', desc: 'Пост Семёна «Битва на улице»: +8 % на 2 месяца, но «Двор» рядом злее (−7 % на год)', fx: { guests: 1, rel: -1 }, risk: true, do(S) { const st = store(S); addMod(S, 'traffic', 1.08, 60, st); setMod(S, 'dvor', 'traffic', 0.93, 'store', st.id, S.day + 365); flag(S, 'lenin', 'fight'); rel(S, { oleg: -5 }); meter(S, 'fair', -5); } },
      ];
      if (storyF(S).mentor === 'enemy') out.push({ label: '«Передайте привет Рашиду»', desc: 'Олег смеётся: «Мы с тобой похожи». Дальше — обычная конкуренция', fx: { rel: 1 }, do(S) { flag(S, 'lenin', 'no'); rel(S, { oleg: 15, rashid: -5 }); } });
      return out; } },
    s14: { kind: 'hero', who: 'family', title: () => 'Батон и танец',
      text: (S) => (T0(S).flags.gulyaIn ? 'Ильдар: «Короче, я снял, как Гуля танцует с багетом. Сорок тысяч просмотров! Не благодари. Хотя нет, благодари». Гуля входит с телефоном: «Или это видео исчезнет, или исчезнет твой брат».' : 'Ильдар: «Короче, я снял, как ты танцуешь с багетом за стойкой. Сорок тысяч просмотров! Не благодари». Семён Аркадьевич уже поставил лайк.'),
      choices: (S) => { const g = T0(S).flags.gulyaIn, r = S.story ? S.story.rel.gulya : 0; return [
        { label: 'Удалить', desc: g ? 'Гуле спокойнее, Ильдар дуется' : 'Ильдар дуется', fx: { rel: g ? 1 : -1 }, do(S) { rel(S, g ? { gulya: 10, family: -3 } : { family: -3 }); } },
        { label: '«Оставить — это же реклама!»', desc: g ? 'Гостей +15 % на месяц, Гуле обидно' : 'Гостей +15 % на месяц', fx: { guests: 2, rel: g ? -2 : 0 }, do(S) { addMod(S, 'traffic', 1.15, 30, store(S)); if (g) rel(S, { gulya: -15 }); } },
        { label: '«Гуля, решай сама»', desc: 'Она снимет второе видео: +10 % на 2 месяца', dis: g && r >= 30 ? null : g ? 'Гуля вам пока не настолько доверяет' : 'Гули нет в команде', fx: { guests: 2, rel: 2 }, do(S) { addMod(S, 'traffic', 1.1, 60, store(S)); rel(S, { gulya: 10, family: 5 }); } },
      ]; } },
    s15: { kind: 'hero', who: (S) => (gulyaAvail(S) ? 'gulya' : 'aidar'), title: () => 'Первый наём',
      text: (S) => (gulyaAvail(S) ? 'Вечер, закрытие. Гуля стоит у витрины с булочкой из «Калача»: «Видела твою очередь с трамвайной остановки. Одному тебе её не вытянуть — ты к восьми уже зелёный. Рашид-абый отпускает. Ворчит, но отпускает. Ну? Будешь звать или мне самой напрашиваться?» На объявление откликнулись ещё двое: Айдар (19, «сдачу считаю два раза») и Лариса (32, пять лет в «Дворе»).' : 'На объявление откликнулись двое. Айдар Галиев, 19: «Я… я быстро учусь. Сдачу считаю два раза. Это плохо?» Лариса Кузнецова, 32: «Пять лет в „Дворе“. Кассу, выкладку, санкнижки — всё знаю. Хочу на пятнадцать процентов больше, чем там».'),
      choices: (S) => { const full = hireWhy(S), out = [];
        if (gulyaAvail(S)) out.push({ label: '«Гуля, выходи завтра»', desc: `Гуля — уровень ${gulyaLvl(S)}, своя: вряд ли уйдёт`, dis: full, fx: { team: 2, rel: 1, rub: -1 }, do(S) { inviteGulya(S); } });
        out.push({ label: 'Айдар', desc: 'Уровень 1, недорогой, учится быстро', cost: E().hireCost(S, 1), dis: full, fx: { team: 1, rub: -1 }, do(S) { I().spend(S, E().hireCost(S, 1), 'hire'); addPerson(S, 'Айдар Галиев', 1, 4, { aidar: 1, trait: 5, patience: 8 }); hired(S, 'Айдар'); flag(S, 'hire1', 'aidar'); } });
        out.push({ label: 'Лариса', desc: 'Уровень 3 сразу: сильная, но из «Двора»…', cost: E().hireCost(S, 3), dis: full, fx: { team: 2, rub: -2 }, risk: true, do(S) { I().spend(S, E().hireCost(S, 3), 'hire'); addPerson(S, 'Лариса Кузнецова', 3, 4, { lara: 1 }); hired(S, 'Лариса'); flag(S, 'hire1', 'lara'); if (S.story) S.story.f.laraSpy = rnd(T0(S)) < 0.4; } });
        out.push({ label: (S) => 'Пока справлюсь ' + sex(S, 'сам', 'сама'), desc: 'Кандидаты уйдут; нанять можно во вкладке «Команда»', fx: { hp: -1 }, do() {} });
        return out; } },
    // «Что мешает»: 18 мес. без цели главы — близкий человек говорит, что не так и что сделать (решение владельца 08.10.2026).
    // Первый раз — бабушка, потом наставник, потом Гуля или Семён. «Так и сделаю» включает обычный совет с кнопкой.
    stuck: { kind: 'hero', who: (S, v) => v.who, title: () => 'Что мешает',
      text: (S, v) => v.text,
      choices: (S, v) => [
        { label: '«Так и сделаю»', desc: v.act ? 'Совет появится в «Точке» с кнопкой' : 'Совет — в журнале', fx: { hp: 1 }, do(S) { const T = T0(S); T.flags.advisor = 1; T.advice = { who: v.who, act: v.act, text: v.tip }; } },
        { label: '«Сам разберусь»', desc: 'Без подсказки', fx: {}, do() {} },
      ] },
    s16: { kind: 'hero', who: 'gulya', title: () => 'Первый плюс',
      text: (S, v) => `${T0(S).flags.gulyaIn ? 'Гуля' : 'За стойкой'}: «{boss}, мы в плюсе! На ${fm(v.profit)}, но в плюсе!» СМС от мамы: «Я видела, у вас очередь была. Горжусь. Покушай».`,
      choices: (S) => [
        { label: '«Премия команде»', desc: 'Команда запомнит', cost: r1000(10000 * S.macro.priceLevel), fx: { rub: -1, team: 2, rel: 1 }, do(S) { I().spend(S, r1000(10000 * S.macro.priceLevel), 'bonus'); for (const e of store(S).staff) if (!e.hero) e.mood = clamp(e.mood + 10, 0, 100); meter(S, 'care', 5); rel(S, { gulya: 5 }); } },
        { label: '«Всё в резерв»', desc: 'Эльвира: «Правильный ответ. Скучный, но правильный». Резерв закрывает кассовые разрывы', fx: { rub: 1, rel: 1 }, do(S) { E().setAlloc(S, { reserve: 0.3, bonus: S.alloc.bonus, marketing: S.alloc.marketing }); rel(S, { elvira: 5 }); } },
        { label: '«Цветы маме»', desc: 'Мама будет рада', cost: 3000, fx: { rub: -1, rel: 2 }, do(S) { I().spend(S, 3000, 'other'); rel(S, { family: 10 }); } },
      ] },
    s17: { kind: 'hero', who: 'rashid', title: () => 'Письмо от Рашида',
      text: () => 'Письмо от руки, сфотографировано криво: «Олег предложил купить „Калач“. Хорошие деньги. Мне шестьдесят, сыновья в Москве, спина говорит „соглашайся“. Скажи честно: у тебя получится то, что не получилось у меня? Если да — я продам не ему».',
      choices: (S) => { const c = C(), buy = r1000(1500000 * S.macro.priceLevel); return [
        { label: '«Не продавайте. Я помогу»', desc: `${fm(r1000(c.KALACH_HELP * S.macro.priceLevel))} в месяц полгода — «Калач» жив`, fx: { rub: -2, rel: 2 }, do(S) { T0(S).flags.kalachHelp = c.KALACH_MONTHS; flag(S, 'kalach', 'alive'); rel(S, { rashid: 20 }); } },
        { label: '«Продавайте. Вы заслужили отдых»', desc: 'У «Двора» появится сильная точка в Центре', fx: { rel: 1 }, do(S) { flag(S, 'kalach', 'dvor'); rel(S, { rashid: 5, oleg: 10 }); } },
        { label: '«Продайте мне»', desc: `${fm(buy)} — вся цена: печи, команда, аренда. Когда кофейня выйдет в сеть, «Калач» сразу станет точкой №2`, cost: buy, fx: { rub: -3, guests: 2, rel: 1 }, risk: true, do(S) { I().spend(S, buy, 'capex'); const T = T0(S); T.flags.kalachMine = buy; flag(S, 'kalach', 'mine'); rel(S, { rashid: 15, oleg: -15 }); } },
      ]; } },
    s18: { kind: 'climax', who: 'semyon', title: () => 'Вторая вывеска',
      text: (S) => { const k = T0(S).flags.kalachMine; return `${k ? 'Ленточка на двери «Калача», «дзынь», фото с командой.' : 'Последняя смена за стойкой, фото с командой.'} Семён Аркадьевич — пост в «Уфа жуёт»: «${k ? '„Калач“ на Пушкина переходит в новые руки. Рашид доволен — впервые за двадцать лет' : 'Кофейня с одной стойкой становится сетью. Город становится тесным — и это хорошо'}». Камера отдаляется: впервые видна вся Уфа — реки, районы и сиреневые ромбы «Двора». СМС от Олега: «${k ? 'Две точки. Мило' : 'Слышал, ты собираешься в сеть. Мило'}. У меня двенадцать. Увидимся на карте».`; },
      choices: (S) => { const k = T0(S).flags.kalachMine, h = helpLine(S); return [{ label: 'На карту Уфы', desc: `${k ? 'Кофейня — точка №1, «Калач» — точка №2. Дальше — цех' : 'Кофейня станет точкой №1 сети. Дальше — цех и вторая точка'}${h ? '. ' + h : ''}`, fx: { rub: 3 }, do(S) { finish(S); } }]; } },
    ready: { kind: 'hero', who: 'elvira', title: () => 'Пора расти',
      text: (S) => `Эльвира: «${T0(S).streak} ${T0(S).streak >= 5 ? 'месяцев' : 'месяца'} в плюсе подряд. Люблю, когда цифры сходятся. У нас есть программа для тех, кто уже доказал, что умеет: деньги на цех и вторую точку. Приходите, когда будете готовы».`,
      choices: () => [ok1('Понятно', 'Кнопка «Вторая вывеска» — во вкладке «Точка». Можно ещё поработать одной кофейней')] },
    sick: { kind: 'neg', who: 'life', title: () => 'Вы заболели',
      text: (S, v) => `Температура, ломит всё тело. Организм напомнил, что силы не бесконечны. ${v.alone ? `Точка закрыта на ${v.days} дн. — за стойкой больше никого.` : `${v.days} дн. за стойкой без вас — команда справится, но медленнее.`}`,
      choices: () => [ok1('Лечиться', 'Помощник за стойкой и выходные берегут силы')] },
    // ---------- простые события кофейни (70 % неприятностей) ----------
    e_machine: { kind: 'neg', who: 'life', title: () => 'Сломалась кофемашина',
      text: () => 'Утром кофемашина зашипела и выдала вместо капучино облако пара. Гости уже в очереди.',
      choices: (S) => [
        { label: 'Срочный мастер', desc: 'Сегодня же починят', cost: r1000(45000 * S.macro.priceLevel), fx: { rub: -2 }, do(S) { I().spend(S, r1000(45000 * S.macro.priceLevel), 'other'); } },
        { label: 'Ждать сервис по гарантии', desc: 'Бесплатно, но 3 дня только чай и выпечка', fx: { guests: -2 }, do(S) { addMod(S, 'conv', 0.55, 3, store(S)); outage(S, 'coffee', 3); } },
      ] },
    e_supply: { kind: 'neg', who: 'life', title: () => 'Поставщик сорвал поставку',
      text: () => 'Полуфабрикаты не привезли: «машина сломалась на Шакше». Витрина к обеду опустеет.',
      choices: (S) => [
        { label: 'Купить в розницу', desc: 'Дорого, но витрина полная', cost: r1000(18000 * S.macro.priceLevel), fx: { rub: -1 }, do(S) { I().spend(S, r1000(18000 * S.macro.priceLevel), 'fc'); } },
        { label: 'Два дня с пустой витриной', desc: 'Гости уйдут без выпечки', fx: { guests: -2 }, do(S) { addMod(S, 'conv', 0.8, 2, store(S)); outage(S, 'pastry', 2); } },
      ] },
    e_check: { kind: 'neg', who: 'life', title: () => 'Санитарная проверка',
      text: (S) => (E().storeRating(S, store(S)) >= 4.2 ? 'Пришла проверка. У стойки идеальный порядок, санкнижки на месте. Проверяющая даже взяла визитку.' : 'Пришла проверка. Нашли просроченные сливки и одну санкнижку без печати.'),
      choices: (S) => (E().storeRating(S, store(S)) >= 4.2 ? [ok1('Отлично')] : [{ label: 'Оплатить штраф', desc: '', cost: r1000(30000 * S.macro.priceLevel), fx: { rub: -2 }, do(S) { I().spend(S, r1000(30000 * S.macro.priceLevel), 'other'); } }]) },
    e_rent: { kind: 'neg', who: 'life', title: () => 'Арендодатель поднимает ставку',
      text: () => '«Всё дорожает, сами понимаете». Аренда — +8 % с этого месяца.',
      choices: () => [
        { label: 'Согласиться', desc: 'Аренда дороже', fx: { rub: -1 }, do(S) { const st = store(S); st.rentM2 = Math.round(st.rentM2 * 1.08); } },
        { label: 'Торговаться', desc: 'Может, и уступит. А может, поднимет больше', fx: { rub: 0 }, risk: true, do(S) { const st = store(S); if (rnd(T0(S)) < 0.5) feed(T0(S), 'Арендодатель уступил: ставка прежняя.', 'good'); else { st.rentM2 = Math.round(st.rentM2 * 1.12); feed(T0(S), 'Не уступил: аренда +12 %.', 'bad'); } } },
      ] },
    e_power: { kind: 'neg', who: 'life', title: () => 'Отключили свет',
      text: () => 'Плановые работы на подстанции: сегодня без электричества. Кофемашина, касса, витрина — всё стоит.',
      choices: () => [{ label: 'Закрыться на день', desc: '', fx: { guests: -1 }, do(S) { const st = store(S); st.closedUntil = Math.max(st.closedUntil || 0, S.day + 2); } }] },
    e_road: { kind: 'neg', who: 'life', title: () => 'Ремонт улицы',
      text: () => 'Перед входом раскопали тротуар: месяц люди обходят кофейню по другой стороне.',
      choices: (S) => [
        { label: 'Штендер и стрелки', desc: 'Потеря меньше', cost: r1000(12000 * S.macro.priceLevel), fx: { rub: -1, guests: -1 }, do(S) { I().spend(S, r1000(12000 * S.macro.priceLevel), 'marketing'); addMod(S, 'traffic', 0.93, 30, store(S)); } },
        { label: 'Переждать', desc: 'Гостей −15 % на месяц', fx: { guests: -2 }, do(S) { addMod(S, 'traffic', 0.85, 30, store(S)); } },
      ] },
    e_raise: { kind: 'neg', who: 'life', title: () => 'Просят прибавку',
      text: () => 'Помощник за стойкой: «В „Дворе“ напротив платят больше. Я не ухожу, я спрашиваю».',
      choices: (S) => [
        { label: 'Поднять зарплату до рынка +5 %', desc: 'Команда довольна, ФОТ выше', fx: { rub: -1, team: 2 }, do(S) { E().setPay(S, 'seller', Math.max(S.pay.seller, S.market.seller * 1.05)); } },
        { label: '«Пока не могу»', desc: 'Настроение команды ниже', fx: { team: -2 }, do(S) { for (const e of store(S).staff) if (!e.hero) e.mood = clamp(e.mood - 12, 0, 100); } },
      ] },
    e_cash: { kind: 'neg', who: 'life', title: () => 'Недостача в кассе',
      text: (S) => `Вечером в кассе не хватило ${fm(r1000(7000 * S.macro.priceLevel))}. Устали — ошиблись со сдачей.`,
      choices: (S) => [{ label: 'Обидно', desc: 'Меньше усталости — меньше ошибок', fx: { rub: -1 }, do(S) { I().spend(S, r1000(7000 * S.macro.priceLevel), 'other'); } }] },
    p_post: { kind: 'pos', who: 'semyon', title: () => 'Пост в «Уфа жуёт»',
      text: (S) => `Семён Аркадьевич: «В кофейне на ${store(S).address.split(',')[0]} эчпочмак сегодняшний, а бариста помнит, кто что пьёт. Рекомендую». Три тысячи подписчиков — это вам не шутки.`,
      choices: () => [{ label: 'Приятно', desc: 'Гостей +10 % на месяц', fx: { guests: 2 }, do(S) { addMod(S, 'traffic', 1.1, 30, store(S)); rel(S, { semyon: 3 }); } }] },
    p_order: { kind: 'pos', who: 'life', title: () => 'Заказ на корпоратив',
      text: (S) => `Офис по соседству: «Сорок кофе и сорок эчпочмаков к девяти утра, сможете?» Выручка — ${fm(r1000(55000 * S.macro.priceLevel))}.`,
      choices: (S) => [
        { label: 'Взяться', desc: 'Деньги, но придётся встать в пять', fx: { rub: 2, hp: -1 }, do(S) { const v = r1000(55000 * S.macro.priceLevel); S.cash += v; S.month.rev += v; S.month.fc = (S.month.fc || 0) + v * 0.4; S.cash -= v * 0.4; T0(S).hp = clamp(T0(S).hp - 8, 0, 100); } },
        { label: 'Отказаться', desc: 'Силы дороже', fx: {}, do() {} },
      ] },
    p_students: { kind: 'pos', who: 'life', title: () => 'Вас нашли в картах',
      text: () => 'Кто-то оставил длинный отзыв с фотографиями — и кофейня поднялась в поиске по району.',
      choices: () => [{ label: 'Отлично', desc: 'Гостей +8 % на 1,5 месяца', fx: { guests: 2 }, do(S) { addMod(S, 'traffic', 1.08, 45, store(S)); } }] },
    p_tips: { kind: 'pos', who: 'life', title: () => 'Щедрые гости',
      text: () => 'Женщина, которая каждое утро берёт раф на кокосовом, оставила в банке для чаевых пятитысячную: «За то, что помните, как я люблю».',
      choices: () => [{ label: 'Отдать команде', desc: 'Настроение выше', fx: { team: 1 }, do(S) { for (const e of store(S).staff) e.mood = clamp(e.mood + 6, 0, 100); T0(S).hp = clamp(T0(S).hp + 4, 0, 100); } }] },
  };
  const EV = [
    { id: 'e_machine', kind: 'neg', w: 1 }, { id: 'e_supply', kind: 'neg', w: 1 }, { id: 'e_check', kind: 'neg', w: 0.8, once: 1 }, { id: 'e_rent', kind: 'neg', w: 0.6, once: 1 },
    { id: 'e_power', kind: 'neg', w: 0.6 }, { id: 'e_road', kind: 'neg', w: 0.6, once: 1 }, { id: 'e_raise', kind: 'neg', w: 0.8, cond: (S) => store(S).staff.some((e) => !e.hero), once: 1 }, { id: 'e_cash', kind: 'neg', w: 0.7, cond: (S) => T0(S).hp < 55 },
    { id: 'p_post', kind: 'pos', w: 1, cond: (S) => E().storeRating(S, store(S)) >= 4.1 }, { id: 'p_order', kind: 'pos', w: 1 }, { id: 'p_students', kind: 'pos', w: 0.8 }, { id: 'p_tips', kind: 'pos', w: 0.8 },
  ];
  function rollEvent(S) {
    const T = T0(S), st = store(S); if (!st || st.status !== 'open' || T.status === 'failed') return null;
    const neg = rnd(T) < C().EV_NEG;
    const av = (k) => EV.filter((e) => e.kind === k && (!e.cond || e.cond(S)) && !(e.once && T.seen[e.id]) && T.flags.lastEv !== e.id);
    let L = av(neg ? 'neg' : 'pos'); if (!L.length) L = av(neg ? 'pos' : 'neg'); if (!L.length) return null;
    let tw = 0; for (const e of L) tw += e.w; let x = rnd(T) * tw, e = L[0];
    for (const it of L) { x -= it.w; if (x <= 0) { e = it; break; } }
    T.flags.lastEv = e.id;
    T.cards.push({ id: e.id, v: {} });
    return e.id;
  }
  // сцены главы 1 — по состоянию точки; не чаще GAP_DAYS (кроме кульминаций)
  function queue(S, id, v, force) {
    const T = T0(S); if (T.seen[id] && id !== 'sick' && id !== 'stuck') return;
    if (T.cards.some((c) => c.id === id)) return;
    if (id !== 'sick' && CARDS[id].kind === 'hero') { T.seen[id] = S.day; T.lastScene = S.day; }
    T.cards.push({ id, v: v || {} });
  }
  function scenes(S) {
    const T = T0(S), c = C(), st = store(S), f = storyF(S);
    if (T.openDay == null || T.cards.length) return;
    const od = S.day - T.openDay, gap = S.day - T.lastScene >= c.GAP_DAYS;
    const a7 = avg7(T), m1 = T.months.find((m) => m.full);
    if (!T.seen.s13 && T.flags.dvorOpen && S.day >= T.flags.dvorOpen + 10 && S.day - T.lastScene >= 8) return queue(S, 's13'); // кульминация
    if (T.status === 'run' && od >= c.STUCK_DAYS && S.day >= (T.flags.stuckNext || 0) && nextGoal(S).id !== 'second') { T.flags.stuckNext = S.day + c.STUCK_REPEAT; return queue(S, 'stuck', stuckTalk(S)); }
    if (!gap) return;
    if (!T.seen.s12 && ((od >= 10 && od <= 20 && a7.load < 0.5) || (m1 && m1.profit < 0) || od >= 50)) return queue(S, 's12');
    if (!T.seen.s15 && !T.hired && ((a7.n >= 7 && a7.load >= 0.85) || od >= 75 || T.hp < 45)) return queue(S, 's15');
    if (!T.seen.s14 && f.ildar === 'smm' && od >= 60 && od <= 140) return queue(S, 's14');
    if (!T.seen.s17 && od >= 120) { // без верхней границы: сцена 1.7 нужна для перехода (readyCheck), пропущенная в окне 120–190 дн. запирала главу
      if (f.mentor === 'enemy') { T.seen.s17 = S.day; flag(S, 'kalach', 'dvor'); fx(T, 'sms', 0, { who: 'Семён Аркадьевич · пост', text: '«Калач» на Пушкина продан «Хлебному двору». Рашид Хайруллин на вопросы не отвечает. Эпоха.' }); feed(T, 'Семён: «„Калач“ на Пушкина продан „Хлебному двору“. Эпоха».', 'bad'); return; }
      return queue(S, 's17');
    }
  }
  function card(S) {
    const T = T0(S); if (!T || !T.cards.length) return null;
    const q = T.cards[0], d = CARDS[q.id]; if (!d) { T.cards.shift(); return card(S); }
    const who = typeof d.who === 'function' ? d.who(S, q.v) : d.who;
    const ch = d.choices(S, q.v).map((c) => {
      const o = Object.assign({}, c);
      if (typeof o.label === 'function') o.label = o.label(S);   // вариант с родовой формой героя (PLAN.md §8.1)
      if (typeof o.desc === 'function') o.desc = o.desc(S);
      o.can = !o.dis && (!o.cost || S.cash >= o.cost);
      o.why = o.dis || (o.cost && !o.can ? 'Не хватает денег' : '');
      return o;
    });
    if (!ch.some((c) => c.can)) ch[ch.length - 1].can = true;
    // местный слой (src/data/story-cast.js): подписи героев, заголовки, тексты и варианты — по городу партии
    const cv = { id: q.id, v: q.v, kind: d.kind, who, hero: localHero(S, who, HEROES[who] || HEROES.life), title: d.title(S, q.v), text: d.text(S, q.v), choices: ch };
    cv.title = sub(S, cv.title); cv.text = sub(S, cv.text);
    for (const c of cv.choices) { c.label = sub(S, c.label); c.desc = sub(S, c.desc); if (typeof c.why === 'string') c.why = sub(S, c.why); }
    return cv;
  }
  // герой по городу партии: имя, роль и инициал аватара — из BK.STORY_CAST (для Уфы — как было)
  function localHero(S, who, h0) {
    const C = BK.STORY_CAST;
    const role = C && C.HERO_ROLE ? C.HERO_ROLE[who] : null;
    if (!C || !role || C.cityOf(S) === 'ufa') return h0;
    const p = C.personOf(C.cityOf(S), role); if (!p) return h0;
    const out = Object.assign({}, h0, { name: p.name });
    out.role = p.role || h0.role;
    out.ini = String(p.name).trim().charAt(0).toUpperCase() || h0.ini;
    return out;
  }
  function choose(S, i) {
    const T = T0(S), cv = card(S); if (!cv) return { ok: false };
    const c = cv.choices[i | 0] || cv.choices[0];
    if (!c.can) return { ok: false, msg: c.why || 'Недоступно' };
    T.cards.shift();
    if (!T.seen[cv.id]) T.seen[cv.id] = S.day;
    c.do(S, cv.v);
    // в летопись и в «главные решения» итогов запись идёт уже с именем и родовой формой героя (PLAN.md §8.1):
    // окно сцены подставляет их на отрисовке, а итоги рисуют запись как она сохранена
    const hl = BK.Story && BK.Story.heroText ? BK.Story.heroText(S, c.label) : c.label;
    if ((cv.kind === 'hero' || cv.kind === 'climax') && S.story) {
      S.story.seen[cv.id] = S.day; S.story.log.push({ day: S.day, id: cv.id, choice: cv.choices.indexOf(c), line: hl });
      if (S.story.log.length > 120) S.story.log.shift();
      if (S.chron) S.chron.push({ t: 'story', id: cv.id, label: hl, day: S.day });
    }
    if (cv.choices.length > 1) feed(T, `${cv.title}: ${/^«/.test(c.label) ? c.label : '«' + c.label + '»'}.`, (c.fx && c.fx.k) || (cv.kind === 'pos' ? 'good' : cv.kind === 'neg' ? 'bad' : 'hero'));
    if (cv.id === 's12') T.flags.advisor = 1;
    if (S.stage1) { // звук карточки читает интерфейс (src/ui/stage1.js): тон — по значкам последствий варианта
      const F = c.fx || {}; let sc = 0;
      for (const k of Object.keys(F)) { const v = F[k] || 0; sc += k === 'rub' ? v * 1.2 : v; }
      S.stage1.pick = { id: cv.id, kind: cv.kind, tone: c.risk ? 'risk' : sc > 0 ? 'pos' : sc < 0 ? 'neg' : '', label: c.label };
    }
    return { ok: true };
  }
  // кнопка «Вторая вывеска» (готово) → сцена 1.8
  function secondWhy(S) { const T = T0(S); if (!T) return 'Нет кофейни'; if (T.status !== 'ready') return `Нужно: три месяца в плюсе подряд, 100 гостей за день или рейтинг 4,5★ и ${fm(C().READY_CASH * S.macro.priceLevel)} своих денег`; if (T.cards.length) return 'Сначала решите, что делать'; return null; }
  function openSecond(S) { const w = secondWhy(S); if (w) return { ok: false, msg: w }; T0(S).cards.push({ id: 's18', v: {} }); return { ok: true }; }

  /* ---------------- переход в стадию 2 ---------------- */
  function perfK(S) { // 0..1 — насколько хорошо прошла глава: вехи, рейтинг, постоянные гости
    const T = T0(S), st = store(S), n = Object.keys(T.ms).filter((k) => k !== 'second').length;
    return clamp(0.5 * n / 6 + 0.25 * clamp((E().storeRating(S, st) - 3.8) / 0.8, 0, 1) + 0.25 * Math.min(1, T.reg / C().REG_FULL), 0, 1);
  }
  function nextPreview(S) {
    const T = T0(S), c = C(), st = store(S);
    const start = BK.CFG.START_CASH * E().diffK(S, 'cash');
    const target = Math.round(start * (c.NEXT_K[0] + (c.NEXT_K[1] - c.NEXT_K[0]) * perfK(S)));
    const kalach = T.flags.kalachMine ? kalachPrice(S, T) : 0; // «Калач» куплен в главе — входит в «точки» по цене покупки
    const value = Math.round(st.capex) + kalach;
    const own = Math.round(S.cash + S.reserve - S.loan);
    const cash = r1000(clamp(own, target - value, start * c.NEXT_MAX - value));
    return { start, target, value, kalach, own, cash, fund: Math.max(0, cash - own), loanPaid: S.loan, help: Math.max(0, cash - Math.round(S.cash + S.reserve)), total: cash + value, reg: Math.round(T.reg), rating: E().storeRating(S, st), staff: st.staff.filter((e) => !e.hero).length + st.incoming.length };
  }
  // честная строка о помощи при переходе (окно 1.8, тост, журнал): сколько добавил банк и что стало с кредитом
  function helpLine(S, nx) {
    nx = nx || nextPreview(S);
    const parts = [];
    if (nx.help > 0) parts.push(`+${fm(nx.help)}`);
    if (nx.loanPaid > 0) parts.push(`кредит ${fm(nx.loanPaid)} закрыт`);
    return parts.length ? sub(S, `Банк «Семь рек» помог с переходом: ${parts.join(', ')}.`) : '';
  }
  function finish(S) {
    const T = T0(S), st = store(S), In = I(), c = C(); if (!T || !st) return null;
    milestone(S, 'second');
    const nx = nextPreview(S);
    T.next = nx;
    S.cash = nx.cash; S.reserve = 0; S.loan = 0;
    // герой уходит из-за стойки — управлять сетью; вместо него нанимают продавца (если людей мало)
    const h = hero(S); if (h) st.staff.splice(st.staff.indexOf(h), 1);
    T.hero = null; T.sick = 0; st.closedUntil = 0;
    const sz = BK.CFG.SIZES.small;
    while (st.staff.length + st.incoming.length < sz.staffMin) { const e = In.makePerson(S, 1); st.incoming.push({ p: e, day: S.day + 3 }); }
    st.staffTarget = clamp(Math.max(st.staffTarget, st.staff.length + st.incoming.length), sz.staffMin, sz.staffMax);
    // модификаторы стадии 1 уходят; постоянные гости остаются с точкой №1 на год
    S.mods = S.mods.filter((m) => m.src !== 's1');
    const regK = 1 + 0.1 * Math.min(1, T.reg / c.REG_FULL);
    if (regK > 1.005) S.mods.push({ t: 'traffic', m: +regK.toFixed(3), until: S.day + 365, scope: 'store', target: st.id, src: 'stage1' });
    // кофейня печёт сама, пока не заработает цех (tick-обёртка снимет selfBake)
    T.selfBake = true;
    // меню: хиты кофейни + хлеб и пироги стартового меню сети (новый цех их печёт)
    const add = BK.START_MENU.filter((id) => !S.menu.some((m) => m.id === id)).filter((id) => !(T.flags.pact > S.day && ['bread', 'pies'].includes(E().byId(BK.PRODUCTS, id).cat)));
    for (const id of add) if (S.menu.length < BK.CFG.MENU_MAX) S.menu.push({ id, pm: 1 });
    // сеть просыпается: события, кризисы, соперник, распределение прибыли — как в обычном старте
    S.ev.next = S.day + 45; S.ev.nextCrisis = S.day + T.keep.crisis;
    S.alloc = { reserve: 0.15, bonus: 0.03, marketing: 0.05 };
    if (!S.productions.length) { In.genProdOffers(S, 3); S.phase = 'setup_prod'; }
    if (S.offers.length < 3) In.genStoreOffers(S, true);
    if (T.flags.kalachMine) kalachStore(S, T); // сцена 1.7 «Продайте мне»: «Калач» — точка №2 сразу, уже оплачен
    if (S.tutorial) S.tutorial.on = !!T.flags.tutOn;
    T.status = 'done'; T.cards = []; delete T.story0; // снимок сюжета для перезапуска главы больше не нужен
    if (S.story) { S.story.ch = 'city'; S.story.f.seed = nx.fund; }
    if (pro(S) && pro(S).carry) pro(S).carry.bakerDone = pro(S).carry.bakerDone || st.id;
    const hl = helpLine(S, nx); nx.helpText = hl;
    log(S, `Стадия «Своя кофейня» пройдена за ${Math.round((S.day - T.openDay) / 30.4)} мес. Кофейня — точка №1 сети${T.flags.kalachStore ? ', «Калач» — точка №2' : ''}. Деньги на сеть: ${fm(nx.cash)}.${hl ? ' ' + hl : ''}`, 'good');
    return nx;
  }
  /* «Калач» Рашида (сцена 1.7 «Продайте мне»): при переходе в сеть он — точка №2 сразу, без новой сметы. Цена покупки
     (T.flags.kalachMine) уже заплачена в главе: в ней печи, отделка, команда Рашида и депозит аренды. Точку открывает
     обычный rentStore (все обёртки: «Калач» — 4,5★ и старые гости +15 %, летопись), но деньги и статьи месяца после
     него возвращаются как были — сметы нет. Команда выходит на следующий день, точка работает со следующего дня. */
  function kalachPrice(S, T) { const v = T.flags.kalachMine; return typeof v === 'number' && v > 1 ? v : r1000(1500000 * S.macro.priceLevel); }
  function kalachStore(S, T) {
    if (S.stores.some((x) => x.kalach)) return null;
    const In = I(), d = E().byId(BK.DISTRICTS, 'center') || BK.DISTRICTS.find((x) => x.arch === 'center') || BK.DISTRICTS[0];
    const o = In.makeStoreOffer(S, { district: d.id, size: 'standard' });
    Object.assign(o, { address: sub(S, 'ул. Пушкина, 14 · «Калач»'), special: true, kalach: 1, expires: S.day + 365, rentM2: Math.round(o.rentM2 * 0.8), payMode: 'month', x: d.x - 12, y: d.y + 6 });
    S.offers.push(o);
    const cash0 = S.cash, month0 = Object.assign({}, S.month), phase0 = S.phase, ev0 = S.ev.next;
    S.cash += 1e12; // смета покрыта покупкой: на время вызова денег «хватает» (правило истории может поменять помещение)
    const r = E().rentStore(S, o.id);
    S.cash = cash0; S.month = month0; S.phase = phase0; S.ev.next = ev0;
    S.offers = S.offers.filter((x) => x.id !== o.id);
    if (!r || !r.ok || !r.store) return null;
    const st = r.store;
    st.capex = kalachPrice(S, T); st.openDay = S.day + 1;
    for (const x of st.incoming) x.day = S.day + 1;
    T.flags.kalachStore = st.id;
    return st;
  }
  // мягкий финал: перезапуск кофейни с теми же накоплениями или пропуск в сеть — делает интерфейс (новая игра + copyCarry)
  function copyCarry(from, to) { // пролог, сюжет, навыки и перки — в новое состояние (переиграть кофейню / пропустить в сеть)
    if (from.prologue) to.prologue = JSON.parse(JSON.stringify(from.prologue));
    // сюжет — только факты пролога: решения, сцены и летопись проваленной попытки кофейни не переносятся.
    // Снимок главы (stage1.story0) — сюжет в момент входа в неё; старые сохранения без снимка — сюжет заново из пролога.
    const T = from.stage1;
    if (T && T.story0) to.story = JSON.parse(JSON.stringify(T.story0));
    else if (from.story && T && from.prologue && from.prologue.rel && BK.Prologue) {
      to.story = BK.Prologue.storyDefaults(to.seed || 1);
      to.story.hero = JSON.parse(JSON.stringify(from.story.hero || to.story.hero));
      BK.Prologue.syncStory(to);
    } else if (from.story) to.story = JSON.parse(JSON.stringify(from.story));
    if (from.player) to.player = JSON.parse(JSON.stringify(from.player));
    for (const m of from.mods || []) if (m.src === 'prologue') to.mods.push(Object.assign({}, m));
    return to;
  }
  function skip(S) { if (S.stage1) { S.stage1.status = 'skipped'; S.stage1.cards = []; } }

  /* ---------------- обёртки движка ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__s1) return;
    Eng.__s1 = true;
    const w = (name, fn) => { const orig = Eng[name]; if (orig) Eng[name] = fn(orig); };
    w('tick', (o) => function (S) {
      const T = S && S.stage1;
      if (T && running(S)) preTick(S);
      const menu0 = T && running(S) ? S.menu : null, cut = menu0 ? outageMenu(S, S.day + 1) : null; // поломка: меню дня без кофе / без выпечки
      if (cut) S.menu = cut;
      let r;
      try { r = o.apply(this, arguments); } finally { if (cut) S.menu = menu0; }
      if (!T) return r;
      if (r && T.status !== 'failed' && E().dateOf(S.day).d === 1 && S.history.length) { // 1-е число: обязательства главы
        sharesFallback(S);
        if (T.status === 'done') kalachMonthly(S); // в главе помощь платит monthEnd
      }
      if (r && running(S)) postTick(S);
      else if (T.offHero) { const st = store(S); if (st) st.staff.push(T.offHero); T.offHero = null; }
      if (T.selfBake && T.status === 'done' && S.productions.some((p) => p.status === 'open')) { T.selfBake = false; log(S, 'Цех заработал — кофейня больше не печёт из закупки.', 'good'); }
      return r;
    });
    // после стадии 1 точка уже есть: выбрали цех — сразу играем (без шага «первая точка»)
    w('chooseProduction', (o) => function (S) {
      const r = o.apply(this, arguments);
      if (r && r.ok && S.stage1 && S.stage1.status === 'done' && S.phase === 'setup_store' && S.stores.length) S.phase = 'play';
      return r;
    });
    // «Калач» — точка №2 (сцена 1.7): лояльные гости +15 %, старт 4,5★
    w('rentStore', (o) => function (S, offerId) {
      const off = S && S.offers ? S.offers.find((x) => x.id === offerId) : null, k = off && off.kalach;
      const r = o.apply(this, arguments);
      if (k && r && r.ok && r.store) { r.store.rating = 4.5; r.store.kalach = 1; S.mods.push({ t: 'traffic', m: 1.15, until: 1e9, scope: 'store', target: r.store.id, src: 'kalach' }); if (I()) I().log(S, sub(S, '«Калач» Рашида — теперь точка сети. Старые гости остались.'), 'good'); }
      return r;
    });
  }
  wrap();

  BK.Stage1 = {
    HEROES, CARDS, MS, EV, start, pick, spotCost, spotPreview, hoursCover, on, running, store, hero, card, choose, queue,
    setHours, setDayOff, menuAdd, menuRemove, menuWhy, inviteGulya, gulyaAvail, gulyaLvl, hire, hireWhy, takeLoan, loanRoom, loanWhy,
    avg7, msList, nextGoal, advice, advisor, secondWhy, openSecond, finish, nextPreview, perfK, fail, skip, copyCarry, milestone, wrap,
    hname, sex, hword,                                          // имя и родовые формы героя (PLAN.md §8.1)
    timeLine, helpLine, outage, sharesFallback, kalachMonthly,
    daySig, _rnd: rnd,
  };
})();
