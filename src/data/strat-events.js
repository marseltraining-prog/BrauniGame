/* =====================================================================
   СОБЫТИЯ И ДОСТИЖЕНИЯ СТРАТЕГИЙ (этап 3 плана, vision-plan §5.3).
   Четыре пути — «Премиум», «Народная», «Кофейни», «Пекарня-кафе» (CFG.STRAT.PATHS,
   логика — src/strategy.js, BK.Strat). Здесь только данные и два крошечных помощника.

   САМ ПО СЕБЕ ФАЙЛ НИЧЕГО НЕ МЕНЯЕТ: движок берёт события из BK.EVENTS, достижения — из
   BK.Ach.LIST (src/data/achievements.js), а BK.STRAT_EVENTS / BK.STRAT_ACH пока никто не читает.
   Чтобы они заработали, при слиянии нужно три правки (этот файл трогать не надо):

   1) СОБЫТИЯ, фильтр по пути. В src/engine.js, function eventEligible(S, e, t) — рядом со
      строкой `if (e.followUp) return false;` добавить:
          if (!BK.StratEvents.ok(S, e)) return false;   // событие пути — только на своём пути
      Тогда события стратегий не выпадают никому, кроме игрока на этом пути (у ботов S.strat
      нет — и канонические прогоны ботов остаются прежними).

   2) СОБЫТИЯ, добавить в общий список. Одна строка там, где игра уже собрана, например в конце
      src/data/strategy.js (после wrap()) или при старте в src/ui/app.js:
          BK.StratEvents.attach();                      // BK.STRAT_EVENTS → BK.EVENTS, без дублей
      Важно: 1) и 2) делать ВМЕСТЕ. Если сделать только 2) — события начнут выпадать всем
      (у ботов S.strat нет), и баланс/побайтность прогонов изменятся.
      Для Node (sim/load.js) добавить 'data/strat-events.js' в список загружаемых файлов
      (в build.js файл уже зарегистрирован — сразу после data/events.js).
      Порядок загрузки не важен: attach() вызывают вручную, а события читаются движком в рантайме.

   3) ДОСТИЖЕНИЯ. Одна строка рядом:
          BK.StratEvents.attachAch();                   // BK.STRAT_ACH → BK.Ach.LIST + BK.Ach.BY_ID
      У каждого достижения есть и заданные title/text/check, и совместимые name/desc/test
      (именно их ждёт src/data/achievements.js: cat, icon, rar, name, desc, test), поэтому
      годится и простое `BK.Ach.LIST.push(...BK.STRAT_ACH)` + прописать id в BK.Ach.BY_ID.
      Бонусов достижения не дают — только запись в S.achievements (как остальные).
      cat выбран из существующих категорий BK.Ach.CATS, чтобы экран «Достижения» их показал.
      Хотите отдельную вкладку — добавьте ['strat', 'Стратегии'] в BK.Ach.CATS и поменяйте
      cat у двенадцати достижений на 'strat'.

   СХЕМА СОБЫТИЯ — как в шапке src/data/events.js: id, kind ('neg'/'pos'), title, text
   (плейсхолдеры {store}, {district}, {prod}), scope, weight, minStores, minYear, cooldown
   (в задании он назван «d» — срок до повторного выпадения, по умолчанию 365 дней), once,
   effects, choices. Новое поле — strat: id пути, на котором событие живёт
   ('premium' | 'folk' | 'coffee' | 'cafe'); tags — просто подпись для человека.
   Числа наград и потерь — в пределах ±10–15 % (множители 0,90–1,15 и разовые суммы
   до ~90 тыс. ₽ на точку), как у остальных событий игры.

   Состав: 16 событий (по 4 на путь; 7 neg / 9 pos) и 12 достижений (по 3 на путь).
   Проверки — node sim/strat-events.js (см. отчёт), браузерные тесты не нужны.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});

/* ======================= СОБЫТИЯ ПО ПУТЯМ =======================
   Приходят только на своём пути — нужен фильтр `BK.StratEvents.ok` в engine.eventEligible (см. шапку).
   У каждого события есть хотя бы один бесплатный вариант (cost: 0). */
BK.STRAT_EVENTS = [

  /* ---------------- «Премиум»: дорогой чек, витрина, рейтинг, мало точек ---------------- */

  { id:'sp01', strat:'premium', tags:['премиум','витрина','проверка'], kind:'neg', scope:'store', weight:1.2, minStores:1, cooldown:365,
    title:'Инспектор изучает витрину',
    text:'Санитарный инспектор долго стоял у витрины {store}: щипцы для выпечки, ценники, сроки, перчатки продавца. Замечание — оформление витрины и маркировка.',
    effects:[],
    choices:[
      { label:'Сделать всё по нормам', desc:'Новые витринные щипцы, ценники с составом и журнал — без штрафа.', cost:{ perStore:30000 }, effects:[] },
      { label:'Ограничиться объяснением', desc:'Формально не придраться, но две недели у витрины суета, и гости это видят.', cost:0, effects:[{ t:'conv', m:0.95, d:14 }] },
    ] },

  { id:'sp02', strat:'premium', tags:['премиум','редкий сорт'], kind:'pos', scope:'store', weight:1, minStores:2, cooldown:420,
    title:'Гость просит редкий сорт',
    text:'Постоянный гость спрашивает хлеб на закваске с грецким орехом — «как в Праге». Такого у нас нет, и он уходит искать дальше.',
    effects:[],
    choices:[
      { label:'Заказать редкую муку и закваску', desc:'Новый сорт на витрине — за ним приезжают через полгорода.', cost:{ perStore:25000 }, effects:[{ t:'check', m:1.10, d:45 }, { t:'traffic', m:1.04, d:45 }] },
      { label:'Предложить то, что есть', desc:'Гость вежливо кивнёт и в следующий раз не зайдёт.', cost:0, effects:[{ t:'conv', m:0.97, d:14 }] },
    ] },

  { id:'sp03', strat:'premium', tags:['премиум','репутация'], kind:'pos', scope:'store', weight:0.8, minStores:3, cooldown:400,
    title:'Гид привёл группу к витрине',
    text:'Городской гид остановил экскурсию у {store}: «Лучшая витрина квартала». Двадцать человек с телефонами разглядывают хлеб.',
    effects:[],
    choices:[
      { label:'Угостить гида и группу', desc:'О витрине рассказывают на каждой экскурсии — сарафанное радио работает.', cost:{ perStore:20000 }, effects:[{ t:'traffic', m:1.15, d:60 }] },
      { label:'Продавать как обычно', desc:'Группа купила кофе и ушла, но фотографии уже в соцсетях.', cost:0, effects:[{ t:'traffic', m:1.07, d:20 }] },
    ] },

  { id:'sp04', strat:'premium', tags:['премиум','коллаборация'], kind:'pos', scope:'store', weight:0.7, minStores:4, once:true,
    title:'Ресторан напротив предлагает коллаборацию',
    text:'Шеф ресторана напротив предлагает вместе сделать дегустационный сет: их десерт, наш хлеб. Он давно приглядывается к нашей витрине.',
    effects:[],
    choices:[
      { label:'Сделать общий сет', desc:'Сет стоит на двух витринах — гости ресторана заходят к нам за хлебом.', cost:{ perStore:40000 }, effects:[{ t:'check', m:1.12, d:60 }, { t:'traffic', m:1.05, d:60 }] },
      { label:'Отказаться — своих дел хватает', desc:'Ничего не теряем, но и имени не прибавляем.', cost:0, effects:[] },
    ] },

  /* ---------------- «Народная»: много точек, низкий чек, большие объёмы ---------------- */

  { id:'sn01', strat:'folk', tags:['народная','цены','конкурент'], kind:'neg', scope:'store', weight:1.3, minStores:2, cooldown:300,
    title:'Хлебозавод снизил цены',
    text:'Хлебозавод №3 выкатил батон по 19 рублей и развесил листовки по всему району. Наша {store} стоит в двух шагах от остановки, где эти листовки читают.',
    effects:[],
    choices:[
      { label:'Держать цену и объяснять разницу', desc:'Часть гостей уйдёт к дешёвому батону — зато чек не потеряем.', cost:0, effects:[{ t:'traffic', m:0.93, d:45 }] },
      { label:'Ответить скидкой на батон', desc:'Очередь вернётся, но маржа с батона почти исчезнет.', cost:0, effects:[{ t:'traffic', m:1.06, d:45 }, { t:'check', m:0.93, d:45 }] },
    ] },

  { id:'sn02', strat:'folk', tags:['народная','рецепт','бабушка'], kind:'pos', scope:'store', weight:0.9, minStores:2, once:true,
    title:'Бабушка просит «такой же, как раньше»',
    text:'Бабушка Сания принесла старую тетрадку: «Раньше в этой пекарне пекли такой же — на закваске, с тмином». Рецепт сохранился только в её памяти.',
    effects:[],
    choices:[
      { label:'Восстановить старый рецепт', desc:'Хлеб «как раньше» встаёт на полку — за ним идут соседи со всего двора.', cost:{ perStore:35000 }, effects:[{ t:'check', m:1.10, d:60 }, { t:'traffic', m:1.06, d:60 }] },
      { label:'Поблагодарить и вернуться к делам', desc:'Бабушка вздохнёт и уйдёт; пара постоянных гостей — вместе с ней.', cost:0, effects:[{ t:'conv', m:0.98, d:10 }] },
    ] },

  { id:'sn03', strat:'folk', tags:['народная','очередь','мороз'], kind:'neg', scope:'store', weight:1.1, minStores:2, minYear:1, cooldown:400,
    title:'Очередь в мороз',
    text:'На улице −27, а у {store} очередь на улицу: внутрь помещается пять человек. Гости прыгают на месте и греют руки о пакеты.',
    effects:[],
    choices:[
      { label:'Поставить пушку и чай для очереди', desc:'Согрелись и вернулись, а потом рассказали, что у нас «по-человечески».', cost:{ perStore:25000 }, effects:[{ t:'traffic', m:1.06, d:45 }, { t:'conv', m:1.02, d:45 }] },
      { label:'Пусть потерпят — очередь идёт', desc:'Часть гостей развернулась и ушла в сетевой магазин у дома.', cost:0, effects:[{ t:'traffic', m:0.92, d:21 }] },
    ] },

  { id:'sn04', strat:'folk', tags:['народная','поставка','мука'], kind:'neg', scope:'store', weight:1.1, minStores:2, cooldown:365,
    title:'Подвоз муки не пришёл',
    text:'Фура поставщика застряла на трассе: мука в {store} закончится к утренней смене. Искать замену надо сейчас, ночью.',
    effects:[],
    choices:[
      { label:'Купить муку у другого поставщика', desc:'Дороже и мешок не тот — зато витрина будет полной.', cost:{ perStore:45000 }, effects:[{ t:'foodcost', m:1.03, d:30 }] },
      { label:'Печь, что есть, и растянуть остатки', desc:'Половина витрины пустая, и гости это видят.', cost:0, effects:[{ t:'conv', m:0.93, d:14 }] },
    ] },

  /* ---------------- «Кофейни»: маленькие точки, утро, проходимость, напитки ---------------- */

  { id:'sk01', strat:'coffee', tags:['кофейни','оборудование','пик'], kind:'neg', scope:'store', weight:1.3, minStores:1, cooldown:300,
    title:'Кофемашина встала в утренний пик',
    text:'В 8:20 кофемашина в {store} выдала ошибку и замолчала. За стойкой — очередь из тех, кто забежал на минуту перед работой.',
    effects:[],
    choices:[
      { label:'Вызвать мастера срочно', desc:'Дорогой срочный вызов, но к обеду машина снова работает.', cost:{ perStore:90000 }, effects:[{ t:'traffic', m:0.96, d:3 }] },
      { label:'Варить в турке и на альтернативе', desc:'Медленно и не тот вкус — часть утренних гостей уйдёт к автомату напротив.', cost:0, effects:[{ t:'conv', m:0.93, d:10 }, { t:'traffic', m:0.95, d:7 }] },
    ] },

  { id:'sk02', strat:'coffee', tags:['кофейни','студенты','зал'], kind:'pos', scope:'store', weight:1, minStores:2, once:true,
    title:'Студенты просят розетки',
    text:'Компания студентов из общежития неподалёку просит розетки у дальнего столика в {store}: «Мы будем приходить с ноутбуками и брать по два кофе».',
    effects:[],
    choices:[
      { label:'Поставить розетки и Wi-Fi', desc:'Утром и днём у дальних столиков всегда кто-то есть — с ноутбуком и стаканом.', cost:{ perStore:30000 }, effects:[{ t:'traffic', m:1.12, d:60 }] },
      { label:'Извиниться — счётчик один', desc:'Студенты пойдут в библиотеку, а мы ничего не теряем и не тратим.', cost:0, effects:[] },
    ] },

  { id:'sk03', strat:'coffee', tags:['кофейни','зёрна','поставщик'], kind:'neg', scope:'store', weight:1, minStores:2, cooldown:400,
    title:'Поставщик зёрен поднял цену',
    text:'Поставщик объясняет рост цен на зелёное зерно и присылает новый прайс: +12 % по всей линейке. Наш бленд — как раз из неё.',
    effects:[],
    choices:[
      { label:'Принять цену и не менять вкус', desc:'Гости не заметят разницы, но себестоимость чашки вырастет.', cost:0, effects:[{ t:'foodcost', m:1.06, d:90 }] },
      { label:'Перейти на бленд подешевле', desc:'Часть постоянных гостей почувствует разницу во вкусе.', cost:0, effects:[{ t:'conv', m:0.95, d:45 }, { t:'foodcost', m:1.02, d:45 }] },
    ] },

  { id:'sk04', strat:'coffee', tags:['кофейни','утро','метро'], kind:'pos', scope:'store', weight:1, minStores:3, cooldown:420,
    title:'Утренний поток у метро вырос',
    text:'После открытия нового выхода метро мимо {store} утром идёт заметно больше людей. В 8:00 очередь уже до двери.',
    effects:[],
    choices:[
      { label:'Второй кассир и заготовки с вечера', desc:'Очередь рассасывается за минуту — утренний поток остаётся нашим.', cost:{ perStore:40000 }, effects:[{ t:'traffic', m:1.15, d:45 }] },
      { label:'Работать как есть', desc:'Часть людей, увидев очередь, идёт дальше — но и без затрат поток вырос.', cost:0, effects:[{ t:'traffic', m:1.08, d:45 }] },
    ] },

  /* ---------------- «Пекарня-кафе»: большие залы, обед, вечер, посиделки ---------------- */

  { id:'sc01', strat:'cafe', tags:['кафе','зал','столы'], kind:'neg', scope:'store', weight:1.2, minStores:1, cooldown:300,
    title:'Гости сидят по три часа с одним кофе',
    text:'В {store} за дальним столом третий час сидит пара с одним кофе и одним круассаном. Обеденный поток в это время ищет, где сесть.',
    effects:[],
    choices:[
      { label:'Добавить обеденное меню и «стол на час»', desc:'Столы оборачиваются быстрее, и чек обеда выше — но часть «посидеть» уйдёт.', cost:0, effects:[{ t:'check', m:1.12, d:60 }, { t:'conv', m:0.95, d:30 }] },
      { label:'Терпеть — гости нам дороги', desc:'Люди с ноутбуками создают атмосферу, но мест для обеда не хватает.', cost:0, effects:[{ t:'traffic', m:0.95, d:30 }] },
    ] },

  { id:'sc02', strat:'cafe', tags:['кафе','вечер','музыка'], kind:'pos', scope:'store', weight:0.9, minStores:2, once:true,
    title:'Вечерняя живая музыка',
    text:'Знакомый музыкант предлагает играть в {store} по пятницам: гитара, тихий джаз, два часа. Ему нужна только площадка и ужин.',
    effects:[],
    choices:[
      { label:'Пригласить музыкантов', desc:'По пятницам зал забит до закрытия, вечерний чек заметно выше.', cost:{ perStore:25000 }, effects:[{ t:'traffic', m:1.14, d:45 }, { t:'check', m:1.06, d:45 }] },
      { label:'Обойтись без музыки', desc:'Тише, но и без лишних хлопот с вечерним залом.', cost:0, effects:[{ t:'traffic', m:1.03, d:20 }] },
    ] },

  { id:'sc03', strat:'cafe', tags:['кафе','аренда','столы'], kind:'neg', scope:'store', weight:1.1, minStores:2, minYear:1, once:true,
    title:'Арендодатель поднял аренду из-за столов',
    text:'Арендодатель заметил, что мы поставили ещё четыре стола и гоняем посуду до ночи: «Нагрузка на помещение выросла — аренда тоже».',
    effects:[],
    choices:[
      { label:'Согласиться и оставить зал', desc:'Платим больше, зато зал работает как работает.', cost:0, effects:[{ t:'rent', m:1.10 }] },
      { label:'Поторговаться и убрать два стола', desc:'Аренда вырастет меньше, но посадочных мест станет меньше.', cost:0, effects:[{ t:'rent', m:1.04 }, { t:'traffic', m:0.96, d:60 }] },
    ] },

  { id:'sc04', strat:'cafe', tags:['кафе','обед','бизнес-центр'], kind:'pos', scope:'store', weight:1, minStores:2, cooldown:420,
    title:'Обеденный поток из бизнес-центра',
    text:'Соседний бизнес-центр просит привозить горячие обеды к 13:00: сотрудникам надоела столовая, а до нас пять минут пешком.',
    effects:[],
    choices:[
      { label:'Запустить бизнес-ланч', desc:'К обеду зал полон, и чек выше обычного — но заготовки и посуда стоят денег.', cost:{ perStore:25000 }, effects:[{ t:'check', m:1.10, d:60 }, { t:'traffic', m:1.08, d:60 }] },
      { label:'Просто ждать их после работы', desc:'Часть сотрудников зайдёт вечером — обеденного потока не будет.', cost:0, effects:[{ t:'traffic', m:1.08, d:45 }] },
    ] },
];

/* ======================= ДОСТИЖЕНИЯ ПО ПУТЯМ =======================
   Формат BK.STRAT_ACH: { id, title, text, check(S) } — чистая функция от состояния.
   Дополнительно: cat/icon/rar/name/desc/test — ровно те поля, которые читает
   src/data/achievements.js (BK.Ach), чтобы слияние было одной строкой.
   Бонусов не дают: только запись в S.achievements. */
(function () {
  const P = () => (BK.CFG && BK.CFG.STRAT) || {};
  const open = (S) => ((S && S.stores) || []).filter((s) => s && s.status !== 'opening');
  const pathOf = (S) => (S && S.strat && S.strat.id) || null;
  const isPath = (S, id) => pathOf(S) === id;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  // чек сети к рынку: сумма месячных чеков и выручки открытых точек против рынка (× уровень цен)
  const market = (S) => num(S && S.macro && S.macro.avgCheck) || num(P().MARKET_CHECK || 260) * (num(S && S.macro && S.macro.priceLevel) || 1);
  const checkK = (S) => {
    let rev = 0, checks = 0;
    for (const st of open(S)) { rev += num(st.m && st.m.rev); checks += num(st.m && st.m.checks); }
    const mk = market(S);
    return checks > 0 && mk > 0 ? rev / checks / mk : 0;
  };
  // средний рейтинг сети: как его считает движок, с запасным вариантом на случай отсутствия BK.Engine
  const rating = (S) => {
    try { if (BK.Engine && BK.Engine.networkRating) return num(BK.Engine.networkRating(S)); } catch (e) { /* ниже */ }
    const o = open(S); if (!o.length) return 0;
    const start = num((BK.CFG && BK.CFG.RATING_START) || 4);
    let s = 0; for (const st of o) s += st.rating != null ? num(st.rating) : start;
    return s / o.length;
  };
  // сколько точек сейчас загружены не меньше чем на k (0,9 = очередь в пик; st.today.load — загрузка команды)
  const busy = (S, k) => open(S).filter((st) => st.today && num(st.today.load) >= k).length;
  const areaOf = (S) => { const o = open(S); return o.length ? o.reduce((a, st) => a + num(st.area), 0) / o.length : 0; };
  const smallN = (S, m2) => open(S).filter((st) => num(st.area) <= m2).length;
  // доля вечера в профиле гостей точки (район + соседство, E.daypartOf) — «работаем вечером»
  const eveShare = (S) => {
    try {
      if (!BK.Engine || !BK.Engine.daypartOf) return 0;
      const o = open(S); if (!o.length) return 0;
      let e = 0; for (const st of o) e += num(BK.Engine.daypartOf(st).e);
      return e / o.length;
    } catch (err) { return 0; }
  };
  const mornShare = (S) => {
    try {
      if (!BK.Engine || !BK.Engine.daypartOf) return 0;
      const o = open(S); if (!o.length) return 0;
      let m = 0; for (const st of o) m += num(BK.Engine.daypartOf(st).m);
      return m / o.length;
    } catch (err) { return 0; }
  };
  const lastProfit = (S) => { const h = (S && S.history) || []; return h.length ? num(h[h.length - 1].profit) : 0; };

  // Фабрика: заданные title/text/check + совместимые с BK.Ach name/desc/test.
  const A = (id, rar, cat, icon, title, text, check) => ({
    id, title, text, check, cat, icon, rar,
    name: title, desc: text, test: check,
  });

  BK.STRAT_ACH = [
    // --- «Премиум»: 10 точек со средним рейтингом ≥ 4,6 и дорогая полка ---
    A('sa_p1', 'r', 'rating', '★', 'Витрина квартала',
      'Играть «Премиум» и держать средний рейтинг сети 4,6★ при пяти точках',
      (S) => isPath(S, 'premium') && open(S).length >= 5 && rating(S) >= 4.6),
    A('sa_p2', 'e', 'stores', '🏪', 'Десять витрин',
      'Играть «Премиум»: десять точек и средний рейтинг сети 4,6★',
      (S) => isPath(S, 'premium') && open(S).length >= 10 && rating(S) >= 4.6),
    A('sa_p3', 'r', 'money', '💎', 'Дорогая полка',
      'Играть «Премиум»: пять точек, средний чек на 15% выше рынка и рейтинг 4,5★',
      (S) => isPath(S, 'premium') && open(S).length >= 5 && checkK(S) >= 1.15 && rating(S) >= 4.5),

    // --- «Народная»: много точек при чеке ниже рынка ---
    A('sa_n1', 'c', 'stores', '🍞', 'Хлеб в каждом дворе',
      'Играть «Народная» и открыть десять точек',
      (S) => isPath(S, 'folk') && open(S).length >= 10),
    A('sa_n2', 'r', 'money', '🪙', 'Честная цена',
      'Играть «Народная»: пять точек, чек ниже рынка на 10% и месяц с прибылью',
      (S) => isPath(S, 'folk') && open(S).length >= 5 && checkK(S) <= 0.90 && lastProfit(S) > 0),
    A('sa_n3', 'e', 'stores', '🏘', 'Тридцать дворов',
      'Играть «Народная»: тридцать точек, и средний чек всё ещё не выше рынка',
      (S) => isPath(S, 'folk') && open(S).length >= 30 && checkK(S) <= 1.0),

    // --- «Кофейни»: маленькие точки у метро и очереди в утренний пик ---
    A('sa_k1', 'c', 'stores', '☕', 'Пять кофеен',
      'Играть «Кофейни»: пять точек, и хотя бы три загружены на 90%',
      (S) => isPath(S, 'coffee') && open(S).length >= 5 && busy(S, 0.9) >= 3),
    A('sa_k2', 'r', 'stores', '⏱', 'Кофейный пик',
      'Играть «Кофейни»: в один день пять точек загружены на 90% и больше',
      (S) => isPath(S, 'coffee') && open(S).length >= 5 && busy(S, 0.9) >= 5),
    A('sa_k3', 'r', 'rating', '🌅', 'Точки у метро',
      'Играть «Кофейни»: восемь точек, пять из них маленькие (до 70 м²) и утро — пик гостей',
      (S) => isPath(S, 'coffee') && open(S).length >= 8 && smallN(S, 70) >= 5 && mornShare(S) >= 0.33),

    // --- «Пекарня-кафе»: большие залы, обед и вечер ---
    A('sa_c1', 'e', 'stores', '🍽', 'Двенадцать залов',
      'Играть «Пекарня-кафе»: двенадцать точек и вечерняя доля гостей от трети',
      (S) => isPath(S, 'cafe') && open(S).length >= 12 && eveShare(S) >= 0.34),
    A('sa_c2', 'r', 'money', '🥗', 'Обеденный поток',
      'Играть «Пекарня-кафе»: восемь точек и средний чек на 5% выше рынка',
      (S) => isPath(S, 'cafe') && open(S).length >= 8 && checkK(S) >= 1.05),
    A('sa_c3', 'r', 'stores', '🪑', 'Зал, а не витрина',
      'Играть «Пекарня-кафе»: восемь точек, и средняя площадь зала не меньше 60 м²',
      (S) => isPath(S, 'cafe') && open(S).length >= 8 && areaOf(S) >= 60),
  ];

  /* ---------------- помощники для слияния (см. шапку файла) ---------------- */
  BK.StratEvents = {
    PATHS: ['premium', 'folk', 'coffee', 'cafe'],
    pathOf,
    // фильтр для engine.eventEligible: событие без поля strat годится всегда, событие пути — только на своём
    ok: function (S, e) { return !e || !e.strat || e.strat === pathOf(S); },
    events: function (id) { return (BK.STRAT_EVENTS || []).filter((e) => e.strat === id); },
    // BK.STRAT_EVENTS → BK.EVENTS (без дублей). Вызывать ТОЛЬКО вместе с фильтром ok в eventEligible.
    attach: function () {
      if (!Array.isArray(BK.EVENTS) || !Array.isArray(BK.STRAT_EVENTS)) return 0;
      let n = 0;
      for (const e of BK.STRAT_EVENTS) {
        if (!e || !e.id) continue;
        if (BK.EVENTS.some((x) => x && x.id === e.id)) continue;
        BK.EVENTS.push(e); n++;
      }
      return n;
    },
    // BK.STRAT_ACH → BK.Ach.LIST + BK.Ach.BY_ID (без дублей). Бонусов достижения не дают.
    attachAch: function () {
      if (!BK.Ach || !Array.isArray(BK.Ach.LIST) || !Array.isArray(BK.STRAT_ACH)) return 0;
      let n = 0;
      for (const a of BK.STRAT_ACH) {
        if (!a || !a.id) continue;
        if (BK.Ach.LIST.some((x) => x && x.id === a.id)) continue;
        BK.Ach.LIST.push(a);
        if (BK.Ach.BY_ID) BK.Ach.BY_ID[a.id] = a;
        n++;
      }
      return n;
    },
  };
})();
