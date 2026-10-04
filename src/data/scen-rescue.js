/* =====================================================================
   СЦЕНАРИЙ «СПАСИ СЕТЬ» (rescue) — данные и сцены. Логика — src/scenario.js.
   Замысел — docs/vision-plan.md §5 п. 5 (пункт 3) и PLAN.md, этап 4.

   Игрок покупает готовую сеть в кризисе: точки есть, денег нет, долги,
   уставшие люди, часть точек в плохих местах. Цель — вытащить и вернуть в плюс.

   ЧТО ДЕЛАЕТ ЭТОТ ФАЙЛ (своими данными, без правок каркаса):
     • start          — стартовые правила (деньги, долг, падение спроса, дорогая
                        закупка, срок): их читает BK.Scenario.applyStart;
     • top-level days — срок истории;
     • done(S)/fail(S) — «сеть вытащили» / «всё потеряли»;
     • scenes         — 7 своих сцен с условием { scen: 'rescue' } (сцены также
                        положены в BK.STORY.scenes — их читает BK.Story.scenes());
     • setup(S)       — ГОТОВАЯ СЕТЬ: цех + 6 точек со сниженным настроением,
                        рейтингом, дорогими договорами аренды и некомплектом.
                        См. «ЧЕГО НЕ ХВАТАЕТ КАРКАСУ» ниже.

   ИНТЕГРАЦИЯ: src/scenario.js вызывает setup при старте и проверяет срок каждый
   игровой день. Эффект rent меняет ставку действующих помещений напрямую;
   стартовый rentK здесь не используется.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (!BK.SCEN || !BK.SCEN.list || !BK.SCEN.list.rescue) return;
  const L = BK.SCEN.list.rescue;
  const E = () => BK.Engine, I = () => (BK.Engine && BK.Engine._int) || {};
  const openStores = (S) => (S && S.stores ? S.stores : []).filter((s) => s.status !== 'opening');
  const lastMonths = (S, n) => (S && S.history ? S.history.slice(-n) : []);

  /* ------------------------------------------------------------------
     Правила: покупка сети в долг, падение спроса, дорогая закупка, срок.
     После покупки денег на счёте — на один-два месяца зарплат: любая ошибка
     видна сразу, а кредитная линия из-за долга первое время закрыта.
     ------------------------------------------------------------------ */
  Object.assign(L, {
    name: 'Спаси сеть',
    icon: '🚒',
    text: 'Продаётся сеть в кризисе: шесть точек, чужие долги, уставшие люди. Купить и вытащить.',
    goal: 'Вернуть сеть в плюс: три прибыльных месяца подряд и сохранить хотя бы три точки',

    /* start читает BK.Scenario.applyStart, причём ДО setup. `days` внутри start —
       сколько держатся множители (спрос/закупка), верхний `days` — срок истории.
       Здесь — то, что есть у игрока на руках до покупки сети: обычные 10 млн и
       небольшой долг. Если каркас ещё не умеет стартовать с готовой сетью, партия
       играется как обычная Уфа с упавшим спросом и дорогой закупкой (проверено
       ботом: 3 победы из 4 за 20 лет, без зависаний) — это честнее, чем «не
       хватает денег» на первом же шаге. Настоящие деньги после покупки (4,5 млн)
       и долг за сеть (12 млн) ставит setup. */
    start: {
      cash: 10000000,       // деньги до покупки сети (в setup 5,5 млн из них уходят продавцу)
      loan: 2000000,        // долг до покупки; после setup — 12 млн за сеть
      trafficK: 0.88,       // гости ушли: сеть полгода недопекала и теряла рейтинг
      foodcostK: 1.05,      // старые договоры с поставщиком дороже рынка
      days: 240,            // падение спроса и дорогая закупка держатся 8 месяцев
    },
    days: 540,              // срок истории: 18 месяцев на то, чтобы выйти в плюс

    // «Вытащили»: три прибыльных месяца подряд и живая сеть (или победа по обороту).
    done: (S) => !S.lost && openStores(S).length >= 3 && (S.won || (lastMonths(S, 3).length >= 3 && lastMonths(S, 3).every((m) => m.profit > 0))),
    // «Провалили»: банкротство или сеть закрыта целиком.
    fail: (S) => !!S.lost || openStores(S).length === 0,

    /* Готовая сеть. Вызывается каркасом (см. «ЧЕГО НЕ ХВАТАЕТ КАРКАСУ» п. 1). */
    setup,
  });

  /* ------------------------------------------------------------------
     ГОТОВАЯ СЕТЬ
     План: один цех (уже открыт) и 6 точек. Три из них — в дешёвых районах
     с плохим трафиком и договорами аренды на 25–50 % дороже рынка: они дают
     минус каждый месяц. Одна точка с некомплектом. Рейтинг 2,5–3,2★, настроение
     34–52, усталость 8–25 — не «сломанные» цифры, а уставшая сеть, которую
     можно вытянуть людьми, ремонтами и ростом.
     ------------------------------------------------------------------ */
  const PLAN = [
    // район             размер       аренда  штат      настроение  рейтинг
    { district: 'october',     size: 'standard', rentK: 1.35, staff: 'base',  mood: 52, rating: 3.2 }, // лучшая точка сети — и самая дорогая по аренде
    { district: 'sipaylovo',   size: 'standard', rentK: 1.30, staff: 'base',  mood: 46, rating: 2.9 },
    { district: 'chernikovka', size: 'standard', rentK: 1.25, staff: 'base',  mood: 48, rating: 3.0 },
    { district: 'dema',        size: 'small',    rentK: 1.35, staff: 'short', mood: 40, rating: 2.7 },
    { district: 'north',       size: 'small',    rentK: 1.50, staff: 'thin',  mood: 34, rating: 2.5 }, // промзона: минус каждый месяц
    { district: 'shaksha',     size: 'small',    rentK: 1.45, staff: 'base',  mood: 38, rating: 2.6, payMode: 'year' },
  ];

  function setup(S) {
    const E_ = E(), In = I();
    if (!S || !E_ || !In.makeStoreOffer) return null;
    const mk = In.makePerson || ((s, lvl) => ({ id: 'p0', name: 'Сотрудник', lvl, mood: 40, fatigue: 10, unhappy: 0, trait: 0, patience: 0, since: s.day, lvlDay: s.day }));
    const rr = In.rr || ((s, a, b) => a + (b - a) * 0.5);

    /* 1) цех: один, уже работает — старый, без нового оборудования */
    const po = (S.prodOffers || []).slice().sort((a, b) => a.area * a.rentM2 - b.area * b.rentM2)[0];
    if (po) {
      const units = 2000; // базовая мощность: шести точек хватает, роста — нет
      S.productions.push({
        id: In.nextId ? In.nextId(S, 'f') : 'f1', district: po.district, x: po.x, y: po.y, address: po.address,
        area: po.area, rentM2: po.rentM2, status: 'open', openDay: S.day, equip: {},
        staff: 1 + Math.ceil(units / 300), need: 1 + Math.ceil(units / 300), morale: 58, load: 0,
        capex: Math.round(po.area * 4500 + 1800000), name: 'Цех №1',
      });
      // рынок помещений под цех обновляем: занятое помещение уходит из предложений
      if (In.genProdOffers) In.genProdOffers(S, 3); else S.prodOffers = [];
    }

    /* 2) точки: помещение берём у движка (те же районы, ставки, трафик),
          но объект точки собираем как у уже работающей — с людьми и рейтингом */
    const num0 = S.flags.storeNum || 0;
    PLAN.forEach((p, i) => {
      const o = In.makeStoreOffer(S, { district: p.district, size: p.size });
      if (!o) return;
      o.rentM2 = Math.round(o.rentM2 * p.rentK);           // договор дороже рынка — наследство
      const st = {
        id: In.nextId(S, 's'), address: o.address, district: o.district, x: o.x, y: o.y, area: o.area, size: o.size,
        rentM2: o.rentM2, payMode: p.payMode || 'month', rentPaidUntil: 0,   // годовой договор уже оплачен — одна передышка
        traffic: o.traffic, solv: o.solv, landmarks: o.landmarks, comp: o.comp,
        status: 'open', openDay: S.day, openedDay: S.day - 200, repair: 0, repairUntil: 0, closedUntil: 0,
        staff: [], incoming: [], staffTarget: 2,
        capex: Math.round((E_.storeOpenCost ? E_.storeOpenCost(S, o).total : 4000000) * 0.6), // точка пожившая
        m: { rev: 0, checks: 0, fc: 0, rent: 0, lost: 0 }, last: null, hist: [],
        rating: p.rating, num: num0 + i + 1,
      };
      st.staffTarget = E_.recStaff ? E_.recStaff(S, st).target : 3;
      const sz = BK.CFG.SIZES[st.size];
      let want = st.staffTarget;
      if (p.staff === 'short') want = Math.max(sz.staffMin, st.staffTarget - 2);   // некомплект
      if (p.staff === 'thin') want = sz.staffMin;                                  // людей почти нет
      for (let k = 0; k < want; k++) {
        const e = mk(S, In.candLevel && In.candLevel(S) === 2 ? 2 : 1);
        e.mood = Math.max(16, p.mood + Math.round(rr(S, -8, 8)));
        e.fatigue = Math.round(rr(S, 8, 25));
        e.unhappy = e.mood < BK.CFG.MOOD_UNHAPPY ? Math.round(rr(S, 0, 12)) : 0;   // часть уже на грани увольнения
        e.since = Math.round(S.day - rr(S, 200, 900));
        e.lvlDay = e.since;
        st.staff.push(e);
      }
      S.stores.push(st);
      S.stats.hires += want;
    });
    S.flags.storeNum = num0 + PLAN.length;

    /* 3) деньги и долг: покупка сети съела 5,5 млн из наличных, остальное — кредит */
    const pl = S.macro ? S.macro.priceLevel : 1;
    S.cash = Math.round(4500000 * pl);
    S.loan = Math.round(12000000 * pl);

    /* 4) игра начинается сразу, события — не в первый день */
    S.phase = 'play';
    S.ev.next = Math.max(S.ev.next || 30, 45);
    if (S.notify) {
      S.notify.push({ type: 'scen', phase: 'network', id: 'rescue', stores: S.stores.length });   // метка для каркаса
      S.notify.push({ type: 'toast', kind: 'warn', title: 'Сеть куплена',
        text: `${S.stores.length} точек, из них три в минусе. На счёте ${BK.fmtMoney ? BK.fmtMoney(S.cash) : S.cash}, долг ${BK.fmtMoney ? BK.fmtMoney(S.loan) : S.loan}. Люди устали — начинайте с них, а не с отчётов.` });
    }
    return { stores: S.stores.length, productions: S.productions.length };
  }
  setup.plan = PLAN;   // план сети видно и каркасу, и проверкам

  /* ------------------------------------------------------------------
     Герои и бонусы сценария. Своих портретов у сценария нет: в Px.CAST
     девять героев, поэтому прежний владелец получает ближайший существующий
     портрет (oleg — мужчина в пальто).
     ------------------------------------------------------------------ */
  if (BK.STORY) {
    BK.STORY.heroes = BK.STORY.heroes || {};
    if (!BK.STORY.heroes.boss) {
      BK.STORY.heroes.boss = { name: 'Владислав Прокопьев', role: 'прежний владелец сети', px: 'oleg' };
    }
    BK.STORY.perks = BK.STORY.perks || {};
    Object.assign(BK.STORY.perks, {
      rsRecipe:    { name: 'Тетрадь прежнего владельца', text: 'проверенные рецепты и нормы: чек +2 % навсегда', mods: [{ t: 'check', m: 1.02, d: 3650 }] },
      rsGulyaLed:  { name: 'Гуля ведёт производство', text: 'себестоимость в цехе −2 % навсегда', mods: [{ t: 'foodcost', m: 0.98, d: 3650, scope: 'production' }] },
      rsTeam:      { name: 'Команда поверила', text: 'гостей +3 % на 5 месяцев', mods: [{ t: 'traffic', m: 1.03, d: 150 }] },
      rsTrust:     { name: 'Люди работают не из страха', text: 'конверсия +3 % навсегда', mods: [{ t: 'conv', m: 1.03, d: 3650 }] },
      rsThrift:    { name: 'Экономный режим', text: 'себестоимость −2 % на год', mods: [{ t: 'foodcost', m: 0.98, d: 365 }] },
      rsLogistics: { name: 'Своя логистика', text: 'доставка −15 % на год', mods: [{ t: 'delivery', m: 0.85, d: 365 }] },
      rsRescue:    { name: 'Сеть спасли', text: 'конверсия +4 % на год', mods: [{ t: 'conv', m: 1.04, d: 365 }] },
      rsSecond:    { name: 'Второе дыхание', text: 'гостей +4 % на год', mods: [{ t: 'traffic', m: 1.04, d: 365 }] },
    });
  }

  /* ------------------------------------------------------------------
     Сцены (5–9). Все — с условием { scen: 'rescue' }, глава «Сеть»,
     сроки разнесены: каркас показывает не чаще сцены раз в 2 месяца.
     У каждой сцены есть вариант без need; варианты с need — по деньгам
     и по отношениям, они продолжают уже сделанный выбор.
     Герои: gulya — ваша первая коллега (пришла с вами из своей точки),
     boss — прежний владелец, elvira — банк, semyon — постоянный гость.
     ------------------------------------------------------------------ */
  const scenes = [
    {
      id: 'sr1', ch: 'city', form: 'scene', title: 'Смена в семь утра',
      who: ['gulya'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 1 }, { stores: 5 }] },
      lines: [
        { who: 'gulya', emo: 'tired', text: 'В семь утра Гуля кладёт у кассы ведомость смен. На Северной двое просят расчёт. Один оставил фартук, другой ждёт твоего ответа.' },
        { who: 'gulya', emo: 'calm', text: 'Мы можем собрать людей до открытия. Или сначала разобрать договоры и смены. На всё утро не хватит.' },
        { who: 'hero', emo: 'neutral', text: 'Герой переворачивает ведомость. Кого позовём первым?' },
      ],
      choices: [
        {
          label: 'Собрать людей перед открытием', desc: 'Провести общее собрание.',
          effects: [{ t: 'rel', who: 'gulya', add: 10 }, { t: 'meter', k: 'care', add: 5 }, { t: 'loyalty', add: 4 }, { t: 'conv', m: 1.02, d: 90 }, { t: 'flag', k: 'rsTone', v: 'people' }, { t: 'journal', text: 'Первое собрание сети: сказали людям правду' }],
        },
        {
          label: 'Начать с договоров и смен', desc: 'Ввести новый порядок смен на ближайшие недели.',
          effects: [{ t: 'rel', who: 'gulya', add: -5 }, { t: 'meter', k: 'risk', add: 5 }, { t: 'loyalty', add: -6 }, { t: 'conv', m: 1.04, d: 45 }, { t: 'flag', k: 'rsTone', v: 'numbers' }, { t: 'journal', text: 'Сеть начали с цифр, а не с людей' }],
        },
      ],
    },
    {
      id: 'sr2', ch: 'city', form: 'scene', title: 'Прежний владелец',
      who: ['boss'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 3 }, { stores: 6 }] },
      lines: [
        { who: 'boss', emo: 'tired', text: 'Прежний владелец приходит с коробкой. Двенадцать лет возил её между точками. Тут рецепты и книги, каждую покупку записывал.' },
        { who: 'boss', emo: 'calm', text: 'Он вынимает три договора. На эти подписи смотреть не хочу. Арендодателям могу позвонить при вас — они меня ещё помнят.' },
        { who: 'boss', emo: 'worried', text: 'Тетрадь положил сверху. Её тоже оставлю. Только скажите, куда эту коробку поставить, чтобы люди не выбросили.' },
      ],
      choices: [
        {
          label: 'Принять книги и тетрадь',
          desc: 'Взять рецепты без денежного расчёта.',
          effects: [{ t: 'perk', id: 'rsRecipe' }, { t: 'rel', who: 'boss', add: 10 }, { t: 'meter', k: 'care', add: 5 }, { t: 'flag', k: 'rsBoss', v: 'books' }, { t: 'journal', text: 'Бывший владелец отдал книги и тетрадь с рецептами' }],
        },
        {
          label: 'Вместе пойти к арендодателям',
          desc: 'Пересмотреть аренду уже действующих точек и цеха; будущие помещения придут по рынку.',
          effects: [{ t: 'rent', m: 0.88 }, { t: 'rel', who: 'boss', add: -5 }, { t: 'meter', k: 'fair', add: 3 }, { t: 'flag', k: 'rsBoss', v: 'leases' }, { t: 'journal', text: 'Договоры аренды переподписаны: −12 % по всей сети' }],
        },
        {
          label: 'Выкупить тетрадь — 1,5 млн',
          desc: '1,5 млн ₽ прежнему владельцу за ту же тетрадь с рецептами.',
          need: { meter: { care: 5 } },
          effects: [{ t: 'cash', v: -1500000 }, { t: 'perk', id: 'rsRecipe' }, { t: 'rel', who: 'boss', add: 20 }, { t: 'meter', k: 'care', add: 8 }, { t: 'flag', k: 'rsBoss', v: 'bought' }, { t: 'journal', text: 'Тетрадь прежнего владельца выкуплена за 1,5 млн ₽' }],
        },
      ],
    },
    {
      id: 'sr3', ch: 'city', form: 'scene', title: 'Кого увольнять',
      who: ['gulya'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 5 }, { cash: 1500000 }] },
      lines: [
        { who: 'gulya', emo: 'serious', text: 'Гуля приносит сетку смен. В двух строках фамилии написаны карандашом. Эти места можем сократить. Или оставить людей и оплатить обучение.' },
        { who: 'gulya', emo: 'tired', text: 'Я могу сама разобрать работу цеха. Но тогда решения о сменах будешь сначала обсуждать со мной. Не после того, как объявишь людям.' },
      ],
      choices: [
        {
          label: 'Сократить две позиции',
          desc: 'Сократить до двух сотрудников в действующей сети.',
          effects: [{ t: 'staffQuit', n: 2 }, { t: 'loyalty', add: -8 }, { t: 'meter', k: 'risk', add: 5 }, { t: 'flag', k: 'rsCuts', v: 'fire' }, { t: 'journal', text: 'Сократили двоих самых выгоревших' }],
        },
        {
          label: 'Оплатить обучение — 600 тысяч',
          desc: '600 тыс. ₽ на обучение до трёх сотрудников.',
          effects: [{ t: 'staffTrain', n: 3 }, { t: 'cash', v: -600000 }, { t: 'loyalty', add: 6 }, { t: 'rel', who: 'gulya', add: 8 }, { t: 'meter', k: 'care', add: 6 }, { t: 'flag', k: 'rsCuts', v: 'train' }, { t: 'journal', text: 'Никого не уволили: переучили тех, кто держится' }],
        },
        {
          label: 'Поручить Гуле работу с людьми',
          desc: 'Передать Гуле решения о людях и производстве.',
          need: { meter: { care: 5 } },
          effects: [{ t: 'perk', id: 'rsGulyaLed' }, { t: 'rel', who: 'gulya', add: 15 }, { t: 'meter', k: 'fair', add: 5 }, { t: 'flag', k: 'rsCuts', v: 'gulya' }, { t: 'journal', text: 'Решения по людям отданы Гуле' }],
        },
      ],
    },
    {
      id: 'sr4', ch: 'city', form: 'scene', title: 'Точка, которую все советуют закрыть',
      who: ['gulya', 'semyon'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 7 }, { cash: 1200000 }] },
      lines: [
        { who: 'gulya', emo: 'serious', text: 'Гуля показывает фотографию витрины на Северной. Лампа погасла, вывеску из-за дерева не видно. Можно привести витрины в порядок или поменять утреннюю работу.' },
        { who: 'semyon', emo: 'calm', text: 'Семён придерживает фотографию. Я там живу. Пока вы ищете другое помещение, оставьте нам место, куда можно дойти с сумкой пешком.' },
      ],
      choices: [
        {
          label: 'Обновить витрины сети — 1,2 млн',
          desc: '1,2 млн ₽ на витрины и свет в сети.',
          effects: [{ t: 'cash', v: -1200000 }, { t: 'conv', m: 1.08, d: 180 }, { t: 'loyalty', add: 3 }, { t: 'flag', k: 'rsPoint', v: 'invest' }, { t: 'journal', text: 'Вложились в убыточную точку на Северной' }],
        },
        {
          label: 'Перестроить утренний ассортимент',
          desc: 'Сменить утреннее предложение и сократить до одной позиции.',
          effects: [{ t: 'check', m: 1.06, d: 180 }, { t: 'staffQuit', n: 1 }, { t: 'loyalty', add: -2 }, { t: 'flag', k: 'rsPoint', v: 'format' }, { t: 'journal', text: 'Северную перевели в утренний формат' }],
        },
        {
          label: 'Оплатить поиск замены — 2 млн',
          desc: '2 млн ₽ сейчас. На рынке появится предложение в Сипайлово; действующую точку закрывать и новую открывать нужно отдельно.',
          need: { rel: { gulya: 10 } },
          effects: [{ t: 'cash', v: -2000000 }, { t: 'offer', district: 'sipaylovo', size: 'standard', rent: 0.85, days: 120 }, { t: 'meter', k: 'risk', add: 6 }, { t: 'flag', k: 'rsPoint', v: 'move' }, { t: 'journal', text: 'Убыточную точку меняем на помещение в Сипайлово' }],
        },
      ],
    },
    {
      id: 'sr5', ch: 'city', form: 'scene', title: 'Утро в Черниковке',
      who: ['gulya', 'semyon'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 9 }, { revenue12: 90000000 }] },
      lines: [
        { who: 'gulya', emo: 'smile', text: 'Гуля приносит из Черниковки фотографию: продавец поднял жалюзи, первые гости уже стоят у двери. Хочу показать людям, что мы это видим.' },
        { who: 'semyon', emo: 'happy', text: 'Семён ставит сумку рядом. Меня сегодня встретили по имени. За такое я готов написать строчку. Только не просите написать, сколько вы заработали.' },
      ],
      choices: [
        {
          label: 'Выдать премии — 800 тысяч',
          desc: '800 тыс. ₽ на премии действующей команде.',
          effects: [{ t: 'cash', v: -800000 }, { t: 'loyalty', add: 8 }, { t: 'rel', who: 'gulya', add: 8 }, { t: 'meter', k: 'care', add: 5 }, { t: 'perk', id: 'rsTeam' }, { t: 'journal', text: 'Первая премия спасённой команде' }],
        },
        {
          label: 'Искать следующую точку',
          desc: 'Запросить новое помещение в Сипайлово.',
          effects: [{ t: 'offer', district: 'sipaylovo', size: 'small', rent: 0.9, days: 90 }, { t: 'meter', k: 'risk', add: 3 }, { t: 'loyalty', add: -3 }, { t: 'journal', text: 'Первую прибыль направили на новую точку' }],
        },
        {
          label: 'Поручить Гуле управление сетью',
          desc: 'Передать Гуле управление действующей сетью.',
          need: { rel: { gulya: 20 } },
          effects: [{ t: 'perk', id: 'rsTrust' }, { t: 'rel', who: 'gulya', add: 10 }, { t: 'meter', k: 'fair', add: 5 }, { t: 'journal', text: 'Гуля стала управляющей сети' }],
        },
      ],
    },
    {
      id: 'sr6', ch: 'city', form: 'scene', title: 'Разговор в банке',
      who: ['elvira'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 12 }, { stores: 8 }] },
      lines: [
        { who: 'elvira', emo: 'calm', text: 'Эльвира открывает папку. За сеть вы уже отвечаете. Я хочу понять, из чего оплатите следующий месяц — не только проценты.' },
        { who: 'elvira', emo: 'serious', text: 'Она кладёт фотографию склада. Тут есть имущество, которое можно продать. Или оставить себе и пересмотреть закупки. А логиста я могу познакомить с вами сегодня.' },
      ],
      choices: [
        {
          label: 'Продать старый склад и оборудование',
          desc: 'Продажа даст 4,5 млн ₽ в оборот; сама сумма кредита не уменьшится.',
          effects: [{ t: 'cash', v: 4500000 }, { t: 'rel', who: 'elvira', add: 10 }, { t: 'flag', k: 'rsBank', v: 'sell' }, { t: 'journal', text: 'Продан старый склад: 4,5 млн ₽ в оборот' }],
        },
        {
          label: 'Оставить склад и пересмотреть закупки',
          desc: 'Сохранить склад и работать в экономном режиме.',
          effects: [{ t: 'perk', id: 'rsThrift' }, { t: 'loyalty', add: 3 }, { t: 'meter', k: 'fair', add: 3 }, { t: 'flag', k: 'rsBank', v: 'keep' }, { t: 'journal', text: 'Склад решили не продавать' }],
        },
        {
          label: 'Попросить знакомства с логистом',
          desc: 'Обсудить доставку с предложенным банком логистом.',
          need: { meter: { fair: 3 } },
          effects: [{ t: 'perk', id: 'rsLogistics' }, { t: 'rel', who: 'elvira', add: 5 }, { t: 'journal', text: 'Банк помог с логистикой: доставка дешевле' }],
        },
      ],
    },
    {
      id: 'sr7', ch: 'city', form: 'climax', title: 'Что делаем дальше', climax: true,
      who: ['gulya', 'boss'],
      trigger: { all: [{ scen: 'rescue' }], any: [{ months: 15 }, { cash: 12000000 }] },
      lines: [
        { who: 'gulya', emo: 'smile', text: 'Гуля кладёт на стол два листа: текущие смены и места для новых точек. Какой сегодня открываем первым? Я могу заниматься людьми, пока ты ищешь адреса.' },
        { who: 'boss', emo: 'calm', text: 'Прежний владелец оставляет ключ на краю стола. У вокзала есть помещение. Я поговорю о предложении, если вам оно нужно.' },
        { who: 'gulya', emo: 'happy', text: 'Гуля убирает второй лист в сторону. Можно и не спешить. Только скажи людям, что мы делаем дальше.' },
      ],
      choices: [
        {
          label: 'Запросить помещение у вокзала',
          desc: 'Получить предложение помещения; договор и открытие остаются за вами.',
          effects: [{ t: 'perk', id: 'rsRescue' }, { t: 'offer', lm: 'station', size: 'standard', rent: 0.9, days: 120 }, { t: 'rel', who: 'gulya', add: 10 }, { t: 'meter', k: 'care', add: 5 }, { t: 'journal', text: 'Сеть вытащена: год спустя — рост' }],
        },
        {
          label: 'Продать лишнее и собрать запас',
          desc: 'Продать лишнее оборудование за 500 тыс. ₽.',
          effects: [{ t: 'cash', v: 500000 }, { t: 'loyalty', add: 5 }, { t: 'meter', k: 'risk', add: -3 }, { t: 'journal', text: 'Решили закрепиться, а не расти' }],
        },
        {
          label: 'Разделить с Гулей управление и рост',
          desc: 'Поручить Гуле действующую сеть, заниматься развитием.',
          need: { rel: { gulya: 25 } },
          effects: [{ t: 'perk', id: 'rsSecond' }, { t: 'rel', who: 'gulya', add: 10 }, { t: 'meter', k: 'fair', add: 5 }, { t: 'journal', text: 'Гуля возглавила спасённую сеть' }],
        },
      ],
    },
  ];

  /* Сцены кладём и в BK.STORY.scenes (их читает BK.Story.scenes()), и в L.scenes
     (по схеме данных сценария) — это ТЕ ЖЕ объекты, не копия: если каркас позже
     начнёт склеивать сцены сценария сам, копий и дублей id не будет.

     ВАЖНО: свои сцены ставим В НАЧАЛО списка (unshift). BK.Story.pick берёт первую
     подходящую сцену, а сцены основной истории подходят всегда — без этого история
     спасения растянулась бы на годы и не уложилась бы в срок сценария. На другие
     партии это не влияет: без сценария 'rescue' наши сцены не подходят вообще. */
  if (BK.STORY && Array.isArray(BK.STORY.scenes)) BK.STORY.scenes.unshift.apply(BK.STORY.scenes, scenes);
  L.scenes = scenes;
})();
