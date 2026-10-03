/* =====================================================================
   «КТО ЕСТЬ КТО» ПО ГОРОДАМ (BK.STORY_CAST) — src/data/story-cast.js.

   Решение владельца (04.10.2026, PLAN.md §8.2): «сюжет с лёгкими правками — свои районы
   и улицы, имена и персонажи другие». История одна и та же, но читается местной:

     • в каждом городе свои наставник, соперник и его сеть, банк, коллега-пекарь,
       банковский работник, ревизор/инспектор, летописец, повторяющиеся гости;
     • районы и улицы берутся из src/data/cities.js (ничего не дублируем);
     • Уфа — эталон, как и просил владелец: для неё НИЧЕГО не меняется, ни буквы.
       Поэтому cityOf(S) для старой партии без S.startCity возвращает 'ufa', а swap()
       для Уфы возвращает текст как есть.

   Как это работает (без DOM — поэтому проверяется и на Node):
     1. render(S, text) — единственная точка подстановки для сцен, писем, летописи
        и тостов. Сначала {плейсхолдеры} ({name}, {street}, {n}, {city}, {inCity},
        {district}, {mentor}, {mentorFull}, {rival}, {rivalChain}, {bank}, {colleague},
        {banker}, {inspector}, {chronicler}, {shop}, {mentorGen}…{mentorPre} и т. д.),
        затем swap(S, text) — аккуратная замена уфимских имён и топонимов на местные
        (слово целиком, по формам падежей). Так местными становятся ВСЕ главы, письма
        и записи летописи, даже те, которые писались без плейсхолдеров.
     2. hero(S, who) — герой по городу партии для подписи говорящего и роли.
     3. swap() — реестр нитей и «Вас помнят» получают уже местные имена (см. guests.js,
        src/story.js: attItems и строка отчёта месяца).

   Записи людей: { name — полное имя (подпись), short — как зовут в тексте,
   role — кто он (берётся из шаблона MAIN_ROLE/GUEST_ROLE), f — формы short,
   nf — формы полного имени }. Формы, если не заданы, считаются правилами русского
   склонения (forms/wordOne ниже): их достаточно для имён («Рашид» → Рашида/Рашиду/…),
   фамилий на -ов/-ин/-ова и названий вроде «Хлебный двор». Для городов, проработанных
   вручную, формы не задаются — правила дают верные; там, где правило ошибочно
   (Казань, Пермь, Челны, Ростов, «Семь рек»), форма выписана явно.

   Города вручную: Уфа (эталон), Москва, Санкт-Петербург, Казань, Екатеринбург,
   Новосибирск, Самара. Остальные 12 берут имена из общего пула по региону
   (татарский, уральский, центральный, южный) — детерминированно по id города,
   поэтому в каждом городе свой набор и никаких уфимских имён.

   Числа и сохранения: файл не трогает движок, состояние и ГСЧ. Подключение — build.js
   и sim/load.js. Для Уфы вывод побайтно прежний (проверки: sim/bot.js good 3 18 --summary,
   sim/story.js --check, sim/scencity.js).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  /* =====================================================================
     1. ПРАВИЛА СКЛОНЕНИЯ (только для имён и названий, не общий морфологизатор)
     ===================================================================== */
  // слово в нужной форме: n — именительный, g — родительный, d — дательный,
  // a — винительный (kind 'anim' — как родительный, 'inan' — как именительный),
  // i — творительный, p — предложный.
  // ё в корне при склонении переходит в е: «Пётр» → Петра (у фамилий вроде Соловьёв ё остаётся).
  const YO = { 'пётр': 'Петр' };
  function wordOne(w, c, kind) {
    let out = String(w || '');
    if (c === 'n' || !out) return out;
    const yo = YO[out.toLowerCase()];
    if (yo) out = yo;
    const low = out.toLowerCase();
    const fem = kind === 'inan-f';
    if (/(ко|енко|их|ых|ук|юк)$/.test(low)) return out;            // Гриценко, Шевчук, Сипко
    if (/[оуэюи]$/.test(low)) return out;                          // Сипайлово, Азино, Сочи, Дону
    // прилагательные (Хлебный, Северный, Столичный, Лесной), но не имена на -ий (Аркадий, Виталий)
    const adj = /(ный|ний|ский|цкий|овый|евый|кий|лый|дый|тый|рый|ой)$/.test(low);
    if (adj) {
      const st = out.slice(0, -2);
      const ksk = /(ский|цкий|кий)$/.test(low);                    // Приморский → Приморского, Приморским
      if (c === 'g') return st + (ksk ? 'ого' : /ий$/.test(low) ? 'его' : 'ого');
      if (c === 'd') return st + (ksk ? 'ому' : /ий$/.test(low) ? 'ему' : 'ому');
      if (c === 'a') return fem ? st + (ksk || !/ий$/.test(low) ? 'ую' : 'юю') : (kind === 'anim' ? st + (ksk ? 'ого' : /ий$/.test(low) ? 'его' : 'ого') : out);
      if (c === 'i') return st + (/ий$/.test(low) ? 'им' : 'ым');
      return st + (/ий$/.test(low) && !ksk ? 'ем' : 'ом');
    }
    if (/(ая|яя|ое|ее)$/.test(low)) {                              // Хлебная, Синяя, Красное
      const st = out.slice(0, -2), soft = /(яя|ее)$/.test(low);
      if (c === 'g' || c === 'd' || c === 'i' || c === 'p') return st + (soft ? 'ей' : 'ой');
      if (c === 'a') return st + (soft ? 'юю' : 'ую');
      return out;
    }
    if (/ия$/.test(low)) { const st = out.slice(0, -1); return st + (c === 'a' ? 'ю' : c === 'i' ? 'ей' : 'и'); }
    if (/ья$/.test(low)) { const st = out.slice(0, -1); return st + (c === 'a' ? 'ю' : c === 'i' ? 'ей' : c === 'g' ? 'и' : 'е'); }
    if (/а$/.test(low)) {
      const st = out.slice(0, -1), sur = /(ов|ёв|ев|ин|ын|ск|цк)$/.test(st.toLowerCase());
      if (sur) return c === 'a' ? st + 'у' : st + 'ой';             // Ковалёва, Ахметова
      if (c === 'g') return st + (/[кгхжчшщ]$/.test(st.toLowerCase()) ? 'и' : 'ы');
      if (c === 'd' || c === 'p') return st + 'е';
      if (c === 'a') return st + 'у';
      return st + 'ой';
    }
    if (/я$/.test(low)) { const st = out.slice(0, -1); return st + (c === 'a' ? 'ю' : c === 'i' ? 'ей' : c === 'g' ? 'и' : 'е'); }
    if (/й$/.test(low)) { const st = out.slice(0, -1); return st + (c === 'a' || c === 'g' ? 'я' : c === 'd' ? 'ю' : c === 'i' ? 'ем' : 'е'); }
    if (/ь$/.test(low)) { const st = out.slice(0, -1); return st + (c === 'a' || c === 'g' ? 'я' : c === 'd' ? 'ю' : c === 'i' ? 'ем' : 'и'); }
    if ((kind === 'inan-m' || kind === 'inan') && c === 'a') return out;   // «Хлебный двор»: вижу «Хлебный двор»
    if (kind === 'inan-f' && c === 'a') return out.slice(0, -1) + 'у';
    if (c === 'g' || c === 'a') return out + 'а';                  // Рашид, Пётр, Соловьёв
    if (c === 'd') return out + 'у';
    if (c === 'i') return out + (/[чшщж]$/.test(low) ? 'ем' : 'ом');
    return out + 'е';
  }
  // «Семь рек» — числительное, правила его ломают; выписано явно.
  const NUM_PHRASES = { 'семь рек': { n: 'Семь рек', g: 'Семи рек', d: 'Семи рекам', a: 'Семь рек', i: 'Семью реками', p: 'Семи реках' } };
  function forms(str, kind) {
    const n = String(str == null ? '' : str);
    if (!n) return { n: '', g: '', d: '', a: '', i: '', p: '' };
    const num = NUM_PHRASES[n.toLowerCase()];
    if (num) return Object.assign({}, num);
    if (n.indexOf('-') > 0 && n.indexOf(' ') < 0) {                // Волга-Хлеб: склоняем хвост
      const i = n.lastIndexOf('-'), pre = n.slice(0, i + 1), tail = n.slice(i + 1);
      const k = kind === 'inan' ? (/[ая]$/.test(tail) ? 'inan-f' : 'inan-m') : kind;
      const o = { n };
      for (const c of ['g', 'd', 'a', 'i', 'p']) o[c] = pre + wordOne(tail, c, k);
      return o;
    }
    const parts = n.split(' ');
    // род головного слова для винительного: «Хлебную столицу», но «Хлебный двор»
    const head = parts[parts.length - 1];
    const k = kind === 'anim' ? 'anim' : (/[ая]$/.test(head) ? 'inan-f' : 'inan-m');
    const o = { n };
    for (const c of ['g', 'd', 'a', 'i', 'p']) o[c] = parts.map((w) => wordOne(w, c, k)).join(' ');
    return o;
  }
  const shortOf = (p) => p.short || p.name;                        // как зовут в тексте
  const shortForms = (p) => p.f || forms(shortOf(p), 'anim');
  const nameForms = (p) => p.nf || forms(p.name, 'anim');
  const chainForms = (name) => forms(name, 'inan');
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* =====================================================================
     2. ФОРМЫ НАЗВАНИЙ ГОРОДОВ (ключи берутся из уфимских форм «Уфа/Уфы/Уфе/Уфу»)
     ===================================================================== */
  const CITY_FORMS = {
    ufa: { n: 'Уфа', g: 'Уфы', d: 'Уфе', a: 'Уфу', i: 'Уфой', p: 'Уфе', in: 'в Уфе' },
    sterlitamak: { n: 'Стерлитамак', g: 'Стерлитамака', d: 'Стерлитамаку', a: 'Стерлитамак', i: 'Стерлитамаком', p: 'Стерлитамаке', in: 'в Стерлитамаке' },
    chelny: { n: 'Набережные Челны', g: 'Набережных Челнов', d: 'Набережным Челнам', a: 'Набережные Челны', i: 'Набережными Челнами', p: 'Набережных Челнах', in: 'в Набережных Челнах' },
    orenburg: { n: 'Оренбург', g: 'Оренбурга', d: 'Оренбургу', a: 'Оренбург', i: 'Оренбургом', p: 'Оренбурге', in: 'в Оренбурге' },
    chelyabinsk: { n: 'Челябинск', g: 'Челябинска', d: 'Челябинску', a: 'Челябинск', i: 'Челябинском', p: 'Челябинске', in: 'в Челябинске' },
    samara: { n: 'Самара', g: 'Самары', d: 'Самаре', a: 'Самару', i: 'Самарой', p: 'Самаре', in: 'в Самаре' },
    perm: { n: 'Пермь', g: 'Перми', d: 'Перми', a: 'Пермь', i: 'Пермью', p: 'Перми', in: 'в Перми' },
    kazan: { n: 'Казань', g: 'Казани', d: 'Казани', a: 'Казань', i: 'Казанью', p: 'Казани', in: 'в Казани' },
    ekb: { n: 'Екатеринбург', g: 'Екатеринбурга', d: 'Екатеринбургу', a: 'Екатеринбург', i: 'Екатеринбургом', p: 'Екатеринбурге', in: 'в Екатеринбурге' },
    tyumen: { n: 'Тюмень', g: 'Тюмени', d: 'Тюмени', a: 'Тюмень', i: 'Тюменью', p: 'Тюмени', in: 'в Тюмени' },
    nnov: { n: 'Нижний Новгород', g: 'Нижнего Новгорода', d: 'Нижнему Новгороду', a: 'Нижний Новгород', i: 'Нижним Новгородом', p: 'Нижнем Новгороде', in: 'в Нижнем Новгороде' },
    volgograd: { n: 'Волгоград', g: 'Волгограда', d: 'Волгограду', a: 'Волгоград', i: 'Волгоградом', p: 'Волгограде', in: 'в Волгограде' },
    voronezh: { n: 'Воронеж', g: 'Воронежа', d: 'Воронежу', a: 'Воронеж', i: 'Воронежем', p: 'Воронеже', in: 'в Воронеже' },
    rostov: { n: 'Ростов-на-Дону', g: 'Ростова-на-Дону', d: 'Ростову-на-Дону', a: 'Ростов-на-Дону', i: 'Ростовом-на-Дону', p: 'Ростове-на-Дону', in: 'в Ростове-на-Дону' },
    krasnodar: { n: 'Краснодар', g: 'Краснодара', d: 'Краснодару', a: 'Краснодар', i: 'Краснодаром', p: 'Краснодаре', in: 'в Краснодаре' },
    sochi: { n: 'Сочи', g: 'Сочи', d: 'Сочи', a: 'Сочи', i: 'Сочи', p: 'Сочи', in: 'в Сочи' },
    moscow: { n: 'Москва', g: 'Москвы', d: 'Москве', a: 'Москву', i: 'Москвой', p: 'Москве', in: 'в Москве' },
    spb: { n: 'Санкт-Петербург', g: 'Санкт-Петербурга', d: 'Санкт-Петербургу', a: 'Санкт-Петербург', i: 'Санкт-Петербургом', p: 'Санкт-Петербурге', in: 'в Петербурге' },
    nsk: { n: 'Новосибирск', g: 'Новосибирска', d: 'Новосибирску', a: 'Новосибирск', i: 'Новосибирском', p: 'Новосибирске', in: 'в Новосибирске' },
  };

  /* =====================================================================
     3. ЛЮДИ: имена вручную для семи крупных городов
     ===================================================================== */
  const P = (name, short) => ({ name, short });
  const GUEST_ROLE = {
    maltsev: 'мастер с завода, потом инспектор ГПН',
    albina: 'продавщица из соседнего магазина',
    radik: 'водитель трамвая, знает весь город',
    nina: 'учительница начальных классов',
    aliya: 'студентка, расклейка объявлений',
    zoya: 'бухгалтер из соседней конторы',
    gabdullai: 'пенсионер, гуляет с собакой',
    artur: 'курьер службы доставки',
  };
  // Шаблоны ролей: {shop} — пекарня наставника, {chain} — сеть соперника (в родительном падеже)
  const MAIN_ROLE = {
    mentor: 'наставник, хозяин пекарни «{shop}»',
    colleague: 'первая коллега, пекарь',
    rival: 'владелец «{chain}»',
    banker: 'банк, потом фонд',
    inspector: 'инспекция, камеральные проверки',
    chronicler: 'постоянный гость и летописец',
    damir: 'бывший бариста «{shop}»',
    inna: '«Быстрые деньги», взыскание',
  };
  const MAIN_ROLES = ['mentor', 'colleague', 'rival', 'banker', 'inspector', 'chronicler', 'damir', 'inna'];
  const GUEST_ROLES = ['maltsev', 'albina', 'radik', 'nina', 'aliya', 'zoya', 'gabdullai', 'artur'];
  const ALL_ROLES = MAIN_ROLES.concat(GUEST_ROLES);
  // герой BK.STORY.heroes → роль «кто есть кто»
  const HERO_ROLE = {
    rashid: 'mentor', gulya: 'colleague', oleg: 'rival', elvira: 'banker', taxman: 'inspector',
    semyon: 'chronicler', damir: 'damir', inna: 'inna',
    maltsev: 'maltsev', albina: 'albina', radik: 'radik', nina: 'nina', aliya: 'aliya', zoya: 'zoya',
    gabdullai: 'gabdullai', artur: 'artur',
  };

  /* Уфа — эталон. Имена и роли здесь ровно те, что в src/data/story.js и src/data/guests.js:
     для Уфы hero()/swap() ничего не меняют, но запись нужна как источник ключей замены. */
  const UFA = {
    id: 'ufa',
    people: {
      mentor: P('Рашид Хайруллин', 'Рашид'),
      colleague: P('Гульнара Сафина', 'Гуля'),
      rival: P('Олег Кравцов', 'Олег'),
      banker: P('Эльвира Ахметова', 'Эльвира'),
      inspector: P('Марат Ильдарович', 'Марат Ильдарович'),
      chronicler: P('Семён Аркадьевич', 'Семён'),
      damir: P('Дамир Ярмухаметов', 'Дамир'),
      inna: P('Инна Ковалёва', 'Инна'),
      maltsev: P('Пётр Егорович Мальцев', 'Пётр Егорович'),
      albina: P('Альбина Рифкатовна Ямаева', 'Альбина'),
      radik: P('Радик Гайнуллин', 'Радик'),
      nina: P('Нина Петровна Балашова', 'Нина Петровна'),
      aliya: P('Алия Валиева', 'Алия'),
      zoya: P('Зоя Львовна Терехова', 'Зоя Львовна'),
      gabdullai: P('Габдулхай Закирович Нуриев', 'Габдулхай Закирович'),
      artur: P('Артур Хисматуллин', 'Артур'),
    },
    chains: { rivalChain: 'Хлебный двор', chainShort: 'Двор', bank: 'Семь рек', shop: 'Калач' },
    topo: null,
  };

  // Города, проработанные вручную: имена, названия сетей/банков и топонимы.
  const MANUAL = {
    moscow: {
      people: {
        mentor: P('Аркадий Петрович Волошин', 'Аркадий Петрович'),
        colleague: P('Наталья Ершова', 'Наташа'),
        rival: P('Виктор Соловьёв', 'Виктор'),
        banker: P('Марина Крылова', 'Марина'),
        inspector: P('Игорь Борисович Дьяков', 'Игорь Борисович'),
        chronicler: P('Борис Ильич Марголин', 'Борис Ильич'),
        damir: P('Тимур Асланов', 'Тимур'),
        inna: P('Вера Шульгина', 'Вера'),
        maltsev: P('Илья Фёдорович Гусев', 'Илья Фёдорович'),
        albina: P('Надежда Осипова', 'Надежда'),
        radik: P('Сергей Дудкин', 'Сергей'),
        nina: P('Тамара Ивановна Крайнова', 'Тамара Ивановна'),
        aliya: P('Полина Сергеева', 'Полина'),
        zoya: P('Раиса Львовна Гурвич', 'Раиса Львовна'),
        gabdullai: P('Василий Трофимович Пестряков', 'Василий Трофимович'),
        artur: P('Денис Ушаков', 'Денис'),
      },
      chains: { rivalChain: 'Столичный хлеб', chainShort: 'Столичный хлеб', bank: 'Столичный кредит', shop: 'Крендель' },
      topo: { street: 'Никольская', streetIn: 'Никольской', route: 'Никольская — Тверская', mainIn: 'Никольской', districtNom: 'Хамовники', districtGen: 'Хамовников', districtPre: 'Хамовниках' },
    },
    spb: {
      people: {
        mentor: P('Юрий Аркадьевич Кораблёв', 'Юрий Аркадьевич'),
        colleague: P('Марина Гущина', 'Марина'),
        rival: P('Андрей Барсуков', 'Андрей'),
        banker: P('Ольга Виноградова', 'Ольга'),
        inspector: P('Валерий Семёнович Абрамов', 'Валерий Семёнович'),
        chronicler: P('Иосиф Маркович Ратнер', 'Иосиф Маркович'),
        damir: P('Кирилл Ефимов', 'Кирилл'),
        inna: P('Анна Тихомирова', 'Анна'),
        maltsev: P('Аркадий Нилович Круглов', 'Аркадий Нилович'),
        albina: P('Вера Дементьева', 'Вера'),
        radik: P('Павел Ярцев', 'Паша'),
        nina: P('Людмила Борисовна Смирнова', 'Людмила Борисовна'),
        aliya: P('Ася Гринберг', 'Ася'),
        zoya: P('Ревекка Марковна Штерн', 'Ревекка Марковна'),
        gabdullai: P('Николай Саввич Дроздов', 'Николай Саввич'),
        artur: P('Женя Тихонов', 'Женя'),
      },
      chains: { rivalChain: 'Северный хлеб', bank: 'Балтийский кредит', shop: 'Пышечная' },
      topo: { street: 'Рубинштейна', streetIn: 'Рубинштейна', route: 'Рубинштейна — Невский', mainIn: 'Рубинштейна', districtNom: 'Приморский', districtGen: 'Приморского', districtPre: 'Приморском' },
    },
    kazan: {
      people: {
        mentor: P('Ильдар Ринатович Гайнуллин', 'Ильдар Ринатович'),
        colleague: P('Алсу Вагапова', 'Алсу'),
        rival: P('Рустем Ахметзянов', 'Рустем'),
        banker: P('Гульнара Сафиуллина', 'Гульнара'),
        inspector: P('Рустам Ильгизович Шакиров', 'Рустам Ильгизович'),
        chronicler: P('Азат Маратович Нигматуллин', 'Азат Маратович'),
        damir: P('Ильнур Закиров', 'Ильнур'),
        inna: P('Гульшат Идрисова', 'Гульшат'),
        maltsev: P('Марат Фаридович Хусаинов', 'Марат Фаридович'),
        albina: P('Лейсан Гайнуллина', 'Лейсан'),
        radik: P('Ринат Нуриев', 'Ринат'),
        nina: P('Фарида Габдулловна Валеева', 'Фарида Габдулловна'),
        aliya: P('Айгуль Зарипова', 'Айгуль'),
        zoya: P('Резеда Маратовна Юсупова', 'Резеда Маратовна'),
        gabdullai: P('Наиль Закирович Бикмуллин', 'Наиль Закирович'),
        artur: P('Тимур Фаттахов', 'Тимур'),
      },
      chains: { rivalChain: 'Тандыр', bank: 'Акча-банк', shop: 'Бәлеш' },
      topo: { street: 'Баумана', streetIn: 'Баумана', route: 'Баумана — Пушкина', mainIn: 'Кремлёвской', districtNom: 'Азино', districtGen: 'Азино', districtPre: 'Азино' },
    },
    ekb: {
      people: {
        mentor: P('Виталий Семёнович Кузнецов', 'Виталий Семёнович'),
        colleague: P('Ксения Балакина', 'Ксения'),
        rival: P('Дмитрий Плотников', 'Дмитрий'),
        banker: P('Наталья Верещагина', 'Наталья'),
        inspector: P('Сергей Павлович Мезенцев', 'Сергей Павлович'),
        chronicler: P('Аркадий Львович Штейн', 'Аркадий Львович'),
        damir: P('Егор Субботин', 'Егор'),
        inna: P('Лариса Копылова', 'Лариса'),
        maltsev: P('Пётр Аркадьевич Шестаков', 'Пётр Аркадьевич'),
        albina: P('Юлия Пантелеева', 'Юля'),
        radik: P('Вадим Крутиков', 'Вадим'),
        nina: P('Ольга Ивановна Ситникова', 'Ольга Ивановна'),
        aliya: P('Аня Зыкова', 'Аня'),
        zoya: P('Маргарита Соломоновна Фельдман', 'Маргарита Соломоновна'),
        gabdullai: P('Степан Кузьмич Пятков', 'Степан Кузьмич'),
        artur: P('Костя Бабкин', 'Костя'),
      },
      chains: { rivalChain: 'Хлебный Урал', bank: 'Уралкредит', shop: 'Пряник' },
      topo: { street: 'Малышева', streetIn: 'Малышева', route: 'Малышева — Ленина', mainIn: 'Ленина', districtNom: 'Уралмаш', districtGen: 'Уралмаша', districtPre: 'Уралмаше' },
    },
    nsk: {
      people: {
        mentor: P('Анатолий Григорьевич Селезнёв', 'Анатолий Григорьевич'),
        colleague: P('Екатерина Пахомова', 'Катя'),
        rival: P('Максим Дергачёв', 'Максим'),
        banker: P('Ирина Тарасова', 'Ирина'),
        inspector: P('Пётр Данилович Ложкин', 'Пётр Данилович'),
        chronicler: P('Савелий Тимофеевич Огурцов', 'Савелий Тимофеевич'),
        damir: P('Никита Бояркин', 'Никита'),
        inna: P('Валентина Морозова', 'Валентина'),
        maltsev: P('Фёдор Ильич Кожин', 'Фёдор Ильич'),
        albina: P('Мария Панова', 'Маша'),
        radik: P('Гриша Волков', 'Гриша'),
        nina: P('Татьяна Егоровна Зырянова', 'Татьяна Егоровна'),
        aliya: P('Даша Куимова', 'Даша'),
        zoya: P('Эмма Робертовна Краузе', 'Эмма Робертовна'),
        gabdullai: P('Тимофей Макарович Ощепков', 'Тимофей Макарович'),
        artur: P('Витя Кузнецов', 'Витя'),
      },
      chains: { rivalChain: 'Хлеб Сибири', bank: 'Сибирь-банк', shop: 'Заимка' },
      topo: { street: 'Ленина', streetIn: 'Ленина', route: 'Ленина — Кирова', mainIn: 'Красном проспекте', districtNom: 'Академгородок', districtGen: 'Академгородка', districtPre: 'Академгородке' },
    },
    samara: {
      people: {
        mentor: P('Николай Петрович Жигулёв', 'Николай Петрович'),
        colleague: P('Дарья Сотникова', 'Даша'),
        rival: P('Станислав Гуров', 'Станислав'),
        banker: P('Елена Данилова', 'Елена'),
        inspector: P('Михаил Юрьевич Астахов', 'Михаил Юрьевич'),
        chronicler: P('Роман Ильич Бекетов', 'Роман Ильич'),
        damir: P('Артём Панкратов', 'Артём'),
        inna: P('Светлана Круглова', 'Светлана'),
        maltsev: P('Алексей Никитич Дёмин', 'Алексей Никитич'),
        albina: P('Люба Костина', 'Люба'),
        radik: P('Игорь Мельник', 'Игорь'),
        nina: P('Зинаида Петровна Шаталова', 'Зинаида Петровна'),
        aliya: P('Кристина Жукова', 'Кристина'),
        zoya: P('Раиса Павловна Мещерякова', 'Раиса Павловна'),
        gabdullai: P('Иван Кузьмич Свешников', 'Иван Кузьмич'),
        artur: P('Слава Пименов', 'Слава'),
      },
      chains: { rivalChain: 'Волга-Хлеб', bank: 'Волгабанк', shop: 'Коврига' },
      topo: { street: 'Куйбышева', streetIn: 'Куйбышева', route: 'Куйбышева — Ленинградская', mainIn: 'Куйбышева', districtNom: 'Безымянка', districtGen: 'Безымянки', districtPre: 'Безымянке' },
    },
  };

  /* =====================================================================
     4. ПУЛЫ ПО РЕГИОНАМ — для остальных 12 городов
     Наборы детерминированно разные: индекс берётся от id города, роли не повторяют
     друг друга внутри города (для мужских ролей «короткое» имя — фамилия).
     ===================================================================== */
  const POOLS = {
    tatar: {
      m: ['Ильшат Ринатович', 'Айрат Маратович', 'Рустам Фаритович', 'Ильнур Гаязович', 'Наиль Закирович', 'Данис Илдарович', 'Марат Ринатович', 'Радик Ильгизович', 'Азат Фаритович'],
      f: ['Гульнара Ильдаровна', 'Алсу Ринатовна', 'Лейсан Маратовна', 'Айгуль Фаритовна', 'Резеда Наилевна', 'Эльмира Газизовна', 'Гульшат Идрисовна', 'Фарида Габдулловна', 'Алия Ильгизовна'],
      last: ['Хабибуллин', 'Сафиуллин', 'Гимаев', 'Шарипов', 'Фаттахов', 'Маннапов', 'Юсупов', 'Бикмуллин', 'Валиев', 'Гайнуллин', 'Зарипов', 'Ибрагимов', 'Камалов', 'Мустафин', 'Ситдиков', 'Хусаинов'],
      chains: { rivalChain: 'Катык', bank: 'Акча', shop: 'Эчпочмак' },
    },
    ural: {
      m: ['Виталий Семёнович', 'Андрей Петрович', 'Сергей Ильич', 'Николай Фёдорович', 'Валерий Дмитриевич', 'Анатолий Борисович', 'Пётр Аркадьевич', 'Егор Кузьмич', 'Степан Макарович'],
      f: ['Ксения Андреевна', 'Наталья Сергеевна', 'Ольга Викторовна', 'Мария Павловна', 'Елена Анатольевна', 'Татьяна Львовна', 'Юлия Петровна', 'Людмила Ильинична', 'Дарья Викторовна'],
      last: ['Кузнецов', 'Одинцов', 'Плотников', 'Мезенцев', 'Верещагин', 'Субботин', 'Шестаков', 'Пятков', 'Крутиков', 'Балакин', 'Зыков', 'Пантелеев', 'Ситников', 'Копылов', 'Шульгин', 'Дроздов'],
      chains: { rivalChain: 'Хлебный край', bank: 'Уралбанк', shop: 'Шаньга' },
    },
    central: {
      m: ['Аркадий Петрович', 'Игорь Борисович', 'Лев Маркович', 'Борис Ильич', 'Виктор Павлович', 'Пётр Савельевич', 'Антон Тимофеевич', 'Григорий Ильич', 'Валерий Семёнович'],
      f: ['Марина Сергеевна', 'Ирина Павловна', 'Ольга Борисовна', 'Вера Николаевна', 'Анна Львовна', 'Тамара Ивановна', 'Наталья Егоровна', 'Светлана Юрьевна', 'Полина Марковна'],
      last: ['Волошин', 'Крылов', 'Соловьёв', 'Гусев', 'Ершов', 'Крайнов', 'Дьяков', 'Шульгин', 'Марголин', 'Осипов', 'Пестряков', 'Гурвич', 'Ушаков', 'Дудкин', 'Тихонов', 'Смирнов'],
      chains: { rivalChain: 'Хлебный ряд', bank: 'Губернский банк', shop: 'Баранка' },
    },
    south: {
      m: ['Станислав Игоревич', 'Роман Витальевич', 'Геннадий Артёмович', 'Алексей Никитич', 'Максим Андреевич', 'Валерий Дмитриевич', 'Игорь Романович', 'Виктор Семёнович', 'Пётр Данилович'],
      f: ['Дарья Викторовна', 'Елена Даниловна', 'Светлана Юрьевна', 'Марина Андреевна', 'Ирина Романовна', 'Валентина Петровна', 'Любовь Сергеевна', 'Зинаида Павловна', 'Кристина Игоревна'],
      last: ['Гуров', 'Астахов', 'Бекетов', 'Панкратов', 'Круглов', 'Дёмин', 'Жуков', 'Мещеряков', 'Костин', 'Шаталов', 'Свешников', 'Пименов', 'Мельник', 'Куимов', 'Зырянов', 'Панов'],
      chains: { rivalChain: 'Хлебный юг', bank: 'Южбанк', shop: 'Паляница' },
    },
  };
  const REGION = {
    sterlitamak: 'tatar', chelny: 'tatar',
    orenburg: 'ural', chelyabinsk: 'ural', perm: 'ural', tyumen: 'ural',
    nnov: 'central', voronezh: 'central',
    volgograd: 'south', rostov: 'south', krasnodar: 'south', sochi: 'south',
  };
  const femLast = (s) => (/(ов|ёв|ев|ин|ын|ск|цк)$/.test(s) ? s + 'а' : s);
  const firstOf = (fio) => String(fio).split(' ')[0];
  // Пул города: имена и фамилии берутся счётчиками от id города, поэтому внутри города
  // никто не повторяется, а в разных городах наборы разные (татарские, уральские, южные…).
  function poolRecord(id) {
    const pool = POOLS[REGION[id]] || POOLS.central, h = hashStr(id);
    let mi = h % pool.m.length, fi = (h >>> 3) % pool.f.length, si = h % pool.last.length;
    const nextM = () => pool.m[mi++ % pool.m.length];
    const nextF = () => pool.f[fi++ % pool.f.length];
    const nextL = () => pool.last[si++ % pool.last.length];
    const male = (kind) => { const base = nextM(), sur = nextL(); return P(base + ' ' + sur, kind === 'first' ? firstOf(base) : kind === 'fio' ? base : sur); };
    const female = (kind) => { const base = nextF(), sur = femLast(nextL()); return P(base + ' ' + sur, kind === 'first' ? firstOf(base) : kind === 'fio' ? base : sur); };
    const people = {};
    people.mentor = male('sur');
    people.rival = male('sur');
    people.inspector = male('fio');
    people.chronicler = male('fio');
    people.damir = male('sur');
    people.maltsev = male('fio');
    people.gabdullai = male('fio');
    people.radik = male('first');
    people.artur = male('first');
    people.colleague = female('first');
    people.banker = female('first');
    people.inna = female('first');
    people.nina = female('fio');
    people.zoya = female('fio');
    people.albina = female('first');
    people.aliya = female('first');
    const chains = Object.assign({}, pool.chains);
    if (!chains.chainShort) chains.chainShort = chains.rivalChain;
    return { id, people, chains, topo: null };
  }

  /* =====================================================================
     5. ТОПОНИМЫ: уфимские названия из текстов → местные (улицы и районы города)
     ===================================================================== */
  const CITY_DEF = () => ((BK.CITY_BY_ID && BK.CITY_BY_ID) || {});
  function bareStreet(s) {
    return String(s || '')
      .replace(/^(ул\.|пр\.|пр-т|пр-кт|б-р|бул\.|шоссе|тракт)\s*/i, '')
      .replace(/\s*(ул\.|пр\.|пр-т|пр-кт|б-р|бул\.|шоссе|тракт)$/i, '')
      .trim();
  }
  // улица для текста: имя человека в родительном («Ленина», «Стачки») или прилагательное («Красная»)
  function pickStreet(list) {
    const names = (list || []).map(bareStreet).filter(Boolean);
    const named = (x) => (/[ая]$/.test(x) && !/(ая|яя)$/.test(x)) || /[оеиуэ]$/.test(x);
    return names.find(named) || names[0] || '';
  }
  function prepStreet(s) {
    const t = String(s || '');
    if (/пр\.|проспект/i.test(t)) { const b = bareStreet(t).split(' ')[0]; return wordOne(b, 'p', 'inan') + ' проспекте'; }
    if (/шоссе/i.test(t)) return bareStreet(t) + ' шоссе';
    if (/б-р|бул\./i.test(t)) { const b = bareStreet(t); return wordOne(b, 'p', 'inan') + ' бульваре'; }
    if (/тракт/i.test(t)) return bareStreet(t) + ' тракте';
    return bareStreet(t);
  }
  function topoFor(def) {
    const st = (def && def.streets) || [], ds = (def && def.districts) || [];
    const s0 = pickStreet(st), s1 = bareStreet(st[1] || st[0]);
    const main = st.find((s) => /пр\.|проспект|шоссе/i.test(s)) || st[0];
    const sleep = (ds.find((d) => d[1] === 'sleep') || ds[ds.length - 1] || ['Центр'])[0];
    // второй район — только для текстов, где Уфа названа двумя районами сразу («от Черниковки до Дёмы»)
    const far = (ds.find((d) => d[1] === 'far' && d[0] !== sleep) || ds.find((d) => d[0] !== sleep) || [sleep])[0];
    const f = forms(sleep, 'inan'), f2 = forms(far, 'inan');
    const mainNom = bareStreet(main);
    return { street: s0, streetIn: /(ая|яя)$/.test(s0) ? wordOne(s0, 'p', 'inan-f') : s0, route: s0 + ' — ' + s1,
      mainIn: prepStreet(main), mainNom: mainNom,
      districtNom: sleep, districtGen: f.g, districtAcc: f.a, districtIns: f.i, districtPre: f.p,
      district2Nom: far, district2Gen: f2.g, district2Acc: f2.a, district2Pre: f2.p };
  }
  const TOPO_KEYS = (t) => [
    ['Пушкина — Ленина', t.route],
    ['улица Пушкина', 'улица ' + t.street],
    ['На Пушкина', 'На ' + t.streetIn],
    ['на Пушкина', 'на ' + t.streetIn],
    ['проспект Октября', 'проспект ' + t.mainNom],
    ['Проспект Октября', 'Проспект ' + t.mainNom],
    ['проспекте Октября', t.mainIn],
    ['Проспекте Октября', t.mainIn],
    ['от Черниковки до Дёмы', 'от ' + t.districtGen + ' до ' + (t.district2Gen || t.districtGen)],
    ['Черниковки', t.districtGen],
    ['Черниковке', t.districtPre],
    ['Черниковку', t.districtAcc || t.districtNom],
    ['Черниковкой', t.districtIns || t.districtNom],
    ['Черниковка', t.districtNom],
    ['Дёмы', t.district2Gen || t.districtGen],
    ['Дёме', t.district2Pre || t.districtPre],
    ['Дёму', t.district2Acc || t.districtNom],
    ['Дёма', t.district2Nom || t.districtNom],
    ['из Сипайлово', 'из ' + t.districtGen],
    ['Сипайлова', t.districtGen],
    ['Сипайлове', t.districtPre],
    ['Сипайлово', t.districtNom],
    ['Инорс', t.districtNom],
    ['Шакша', t.district2Nom || t.districtNom],
    ['Пушкина', t.street],
  ];

  /* =====================================================================
     6. СБОРКА ЗАПИСИ ГОРОДА
     ===================================================================== */
  function build(id, raw) {
    const shop = chainForms(raw.chains.shop), chain = chainForms(raw.chains.rivalChain);
    const people = {};
    for (const role of ALL_ROLES) {
      const p = raw.people[role]; if (!p) continue;
      const tpl = MAIN_ROLE[role] || GUEST_ROLE[role] || '';
      const roleText = tpl.replace('{shop}', shop.g).replace('{chain}', chain.g);
      people[role] = { name: p.name, short: p.short || p.name, role: roleText, f: p.f, nf: p.nf };
    }
    const def = CITY_DEF()[id];
    const chains = Object.assign({}, raw.chains);
    if (!chains.chainShort) chains.chainShort = chains.rivalChain;   // «Двор» в текстах → местное имя сети
    return { id, people, chains, topo: raw.topo || (def ? topoFor(def) : null) };
  }
  const cache = {};
  function record(id) {
    if (cache[id]) return cache[id];
    if (id === 'ufa') return (cache.ufa = UFA);
    const raw = MANUAL[id];
    const rec = raw ? build(id, raw) : (REGION[id] ? build(id, poolRecord(id)) : null);
    return (cache[id] = rec || UFA);
  }

  /* =====================================================================
     7. ГОРОД ПАРТИИ И РЕНДЕР ТЕКСТА
     ===================================================================== */
  // Город партии: S.startCity новых партий; у старых сохранений поля нет — Уфа (как просил владелец).
  function cityOf(S) {
    const by = CITY_DEF();
    const c = S && S.startCity;
    if (typeof c === 'string' && c && by[c] && (c === 'ufa' || MANUAL[c] || REGION[c])) return c;
    return 'ufa';
  }
  function resolve(S) { return record(cityOf(S)); }

  /* ---------- город партии, когда состояния под рукой нет (пролог, стадия 1, стартовый экран) ----------
     homeId ставит install() на входе в новую игру (BK.Engine.newGame) и при загрузке сохранения
     (BK.Corp.applyGlobals): так во втором акте, где активный город меняется, «свой» город остаётся
     прежним. Если игры ещё нет вовсе (стартовый экран) — смотрим BK.CITY (там, как и раньше, Уфа). */
  let homeId = null;
  function noteHome(id) {
    const by = CITY_DEF();
    const c = id && by[id] ? id : null;
    if (c) homeId = c === 'ufa' ? null : c;
  }
  function cityIdNow() {
    if (homeId && CITY_DEF()[homeId]) return homeId;
    const c = (BK.CITY && BK.CITY.id) || null;
    const by = CITY_DEF();
    if (c && by[c] && (c === 'ufa' || MANUAL[c] || REGION[c])) return c;
    return 'ufa';
  }
  const chainName = (id) => record(id || 'ufa').chains.rivalChain;
  const chainShortName = (id) => { const r = record(id || 'ufa').chains; return r.chainShort || r.rivalChain; };
  const bankName = (id) => record(id || 'ufa').chains.bank;
  const shopName = (id) => record(id || 'ufa').chains.shop;
  const personOf = (id, role) => (record(id || 'ufa').people[role] || null);
  // Имя сети-соперника для интерфейса вне сюжета (вкладка «Рынок», CFG.RIVAL_NAME, второй акт)
  const rivalNow = () => chainName(cityIdNow());


  // Активный город сцены (как subCity в src/ui/story-ui.js): чужой, если сеть уже в других городах.
  function sceneCity(S) {
    const by = CITY_DEF(), cr = S && S.corp && S.corp.cities;
    if (cr) for (const id in cr) if (id !== 'ufa' && by[id]) return by[id];
    return BK.CITY || by.ufa || null;
  }
  function bestStore(S) {
    const list = (S && S.stores) || [];
    let best = null;
    for (const st of list) {
      if (!st || st.status === 'opening' || !st.address) continue;
      if (!best || (st.rating || 0) > (best.rating || 0)) best = st;
    }
    return best || list[0] || null;
  }
  function districtOf(S, st) {
    const id = st && st.district;
    if (id) { const d = (BK.DISTRICTS || []).find((x) => x.id === id); if (d && d.name) return d.name; }
    const c = resolve(S);
    return (c.topo && c.topo.districtNom) || 'Центр';
  }
  // {name} — имя героя игрока; {city}/{inCity} — город сцены (прежнее поведение);
  // {street}/{n} — точка, о которой сцена; {district} — её район; {role}/{roleFull}… — люди города.
  function vars(S, C) {
    const st = bestStore(S), sc = sceneCity(S), f = CITY_FORMS[sc && sc.id] || null;
    const v = {
      name: (S && S.story && S.story.hero && S.story.hero.name) || 'шеф',
      city: (sc && sc.name) || 'Уфа',
      inCity: (sc && sc.in) || (f && f.in) || ('в городе ' + ((sc && sc.name) || 'Уфа')),
      street: (st && st.address) || (C.topo && C.topo.street) || 'Пушкина',
      n: String(st && st.num != null ? st.num : 1),
      district: districtOf(S, st),
      rivalChain: C.chains.rivalChain, chainShort: C.chains.chainShort || C.chains.rivalChain, bank: C.chains.bank, shop: C.chains.shop,
    };
    for (const k of ['rivalChain', 'chainShort', 'bank', 'shop']) {
      if (v[k] == null) continue;
      const f = chainForms(v[k]);
      v[k + 'Gen'] = f.g; v[k + 'Dat'] = f.d; v[k + 'Acc'] = f.a; v[k + 'Ins'] = f.i; v[k + 'Pre'] = f.p;
    }
    for (const role of ALL_ROLES) {
      const p = C.people[role]; if (!p) continue;
      v[role] = p.short; v[role + 'Full'] = p.name;
      const sf = shortForms(p), nf = nameForms(p);
      v[role + 'Gen'] = sf.g; v[role + 'Dat'] = sf.d; v[role + 'Acc'] = sf.a; v[role + 'Ins'] = sf.i; v[role + 'Pre'] = sf.p;
      v[role + 'FullGen'] = nf.g; v[role + 'FullDat'] = nf.d; v[role + 'FullIns'] = nf.i;
    }
    return v;
  }
  const PH = /\{([A-Za-zА-Яа-я]+)\}/g;
  function render(S, txt) {
    let s = String(txt == null ? '' : txt);
    if (!s) return s;
    const C = resolve(S);
    if (s.indexOf('{') >= 0) { const v = vars(S, C); s = s.replace(PH, (m, k) => (v[k] != null ? v[k] : m)); }
    return swap(S, s);
  }

  /* ---------- замена уфимских имён и названий на местные (для Уфы — текст как есть) ---------- */
  function pairsFor(id) {
    const dst = record(id);
    if (!dst || dst.id === 'ufa') return null;
    const src = UFA, out = [];
    const put = (a, b) => { if (a && b && a !== b) out.push([a, b]); };
    const both = (fa, fb) => { for (const k of ['n', 'g', 'd', 'a', 'i', 'p']) put(fa[k], fb[k]); };
    const firstWord = (p) => String(p.name).split(' ')[0];
    const lastWord = (p) => String(p.name).split(' ').pop();
    for (const role of ALL_ROLES) {
      const a = src.people[role], b = dst.people[role];
      if (!a || !b) continue;
      both(shortForms(a), shortForms(b));
      both(nameForms(a), nameForms(b));
      put(a.name, b.name);
      // тексты зовут человека и по одному имени, и по фамилии, и в обратном порядке («Мальцев Пётр Егорович»)
      both(forms(firstWord(a), 'anim'), forms(firstWord(b), 'anim'));
      both(forms(lastWord(a), 'anim'), forms(lastWord(b), 'anim'));
      put(lastWord(a) + ' ' + a.short, lastWord(b) + ' ' + b.short);
    }
    for (const k of ['rivalChain', 'chainShort', 'bank', 'shop']) both(chainForms(src.chains[k] || ''), chainForms(dst.chains[k] || ''));
    // Формы города: у Уфы дательный и предложный совпадают («Уфе»), поэтому для местных названий
    // берём предложный — он и стоит в текстах («в Уфе», «районах Уфы»); дательный — только с «к».
    const cf = CITY_FORMS[id] || CITY_FORMS.ufa;
    put(CITY_FORMS.ufa.n, cf.n); put(CITY_FORMS.ufa.g, cf.g); put(CITY_FORMS.ufa.a, cf.a);
    put(CITY_FORMS.ufa.i, cf.i); put(CITY_FORMS.ufa.p, cf.p);
    put('к Уфе', 'к ' + cf.d); put('К Уфе', 'К ' + cf.d);
    if (dst.topo) for (const [a, b] of TOPO_KEYS(dst.topo)) put(a, b);
    out.sort((x, y) => y[0].length - x[0].length || (x[0] < y[0] ? -1 : 1));
    const map = Object.create(null), keys = [];
    for (const [a, b] of out) if (!(a in map) && !/[[\](){}*+?.^$|\\]/.test(a)) { map[a] = b; keys.push(a); }
    if (!keys.length) return null;
    /* Слова местных имён, названий и топонимов («значения» замены). Текст проходит слой не всегда
       один раз: пролог и стадия 1 подставляют имена при записи, а интерфейс — ещё раз при отрисовке;
       летопись и «Рынок» тоже смотрят на один и тот же текст. Без этого правила второй проход
       принимал бы местное имя за уфимское («Юрий Аркадьевич» → «Юрий Ратнер»). Поэтому слово,
       которое уже есть среди местных, не заменяется: подстановка идемпотентна. */
    const local = Object.create(null);
    for (const x of out) for (const w of String(x[1]).split(/[^0-9A-Za-zА-Яа-яЁё]+/)) if (w.length > 2) local[w] = 1;
    const re = new RegExp('(^|[^0-9A-Za-zА-Яа-яЁё])(' + keys.join('|') + ')(?![0-9A-Za-zА-Яа-яЁё])', 'g');
    return { re, map, local };
  }
  const pairCache = {};
  function swapBy(id, txt) {
    let s = String(txt == null ? '' : txt);
    if (!s || !id || id === 'ufa') return s;
    let P = pairCache[id];
    if (P === undefined) P = pairCache[id] = pairsFor(id);
    if (!P) return s;
    return s.replace(P.re, (m, pre, w) => pre + ((P.local[w] || !(w in P.map)) ? w : P.map[w]));
  }
  function swap(S, txt) { return swapBy(cityOf(S), txt); }
  // то же, но когда состояния под рукой нет (пролог, стадия 1, стартовый экран): город — из homeId/BK.CITY
  function swapNow(txt) { return swapBy(cityIdNow(), txt); }

  /* ---------- герой по городу: подпись говорящего и роль ---------- */
  const GUEST_IDS = { maltsev: 1, albina: 1, radik: 1, nina: 1, aliya: 1, zoya: 1, gabdullai: 1, artur: 1 };
  function hero(S, who) {
    const base = (BK.STORY && BK.STORY.heroes && BK.STORY.heroes[who]) || null;
    const id = cityOf(S);
    if (id === 'ufa') return base || { name: who };                 // Уфа — эталон: ничего не меняем
    const C = resolve(S), role = HERO_ROLE[who], p = role && C.people[role];
    if (!p) return base || { name: who };
    const out = Object.assign({}, base || {}, { name: p.name, role: p.role || (base && base.role) || '' });
    if (base && base.short) out.short = p.short;                     // сокращённая подпись (Гуля → Наташа)
    else delete out.short;                                           // остальные подписаны полным именем
    return out;
  }

  /* =====================================================================
     8. ПОДКЛЮЧЕНИЕ К ДВИЖКУ (install) — вызывается из src/prologue.js, который
     грузится после engine.js и corp.js и в браузере, и в Node.
     Три обёртки, ни одна не трогает числа, ГСЧ и состояние Уфы:
       • newGame            — запомнить город партии до rivalInit (имя сети-соперника
                              берётся из CFG.RIVAL_NAME → он спрашивает rivalNow());
       • Corp.applyGlobals  — то же при загрузке сохранения и при переезде во втором акте
                              (активный город меняется, «свой» остаётся прежним);
       • tick / resolveEvent — тексты событий (заголовок, текст, журнал) проходят swap,
                              поэтому «ценовая война „Хлебного двора“» и «карантин в Уфе»
                              читаются местно. Для Уфы swap возвращает строку как есть —
                              тексты и прогоны ботов побайтно прежние.
     ===================================================================== */
  function swapEvent(S, ev) {
    if (!ev || typeof ev !== 'object') return;
    if (typeof ev.title === 'string') ev.title = swap(S, ev.title);
    if (typeof ev.text === 'string') ev.text = swap(S, ev.text);
  }
  function swapFreshLog(S, head) {
    const log = S && S.log; if (!log || !log.length) return;
    for (let i = 0; i < log.length; i++) {
      const it = log[i];
      if (it === head) break;
      if (it && typeof it.text === 'string') it.text = swap(S, it.text);
    }
  }
  function localizeAfter(S, head) {
    if (!S || cityOf(S) === 'ufa') return;                 // Уфа — эталон: ничего не меняем
    try {
      if (S.ev && S.ev.pending) swapEvent(S, S.ev.pending);
      if (S.notify && S.notify.length) for (const n of S.notify) if (n && n.type === 'event' && n.ev) swapEvent(S, n.ev);
      swapFreshLog(S, head);
    } catch (e) { /* тексты не должны ломать день игры */ }
  }
  function install() {
    const E = BK.Engine, Co = BK.Corp;
    if (!E || typeof E.newGame !== 'function' || E.__castHome) return false;
    E.__castHome = 1;
    const origNew = E.newGame;
    E.newGame = function (opts) {
      noteHome((opts && opts.city) || 'ufa');              // город известен до rivalInit и до генерации предложений
      return origNew.apply(this, arguments);
    };
    if (Co && typeof Co.applyGlobals === 'function' && !Co.__castHome) {
      Co.__castHome = 1;
      const origApp = Co.applyGlobals;
      Co.applyGlobals = function (S) { noteHome((S && S.startCity) || 'ufa'); return origApp.apply(this, arguments); };
    }
    if (typeof E.tick === 'function' && !E.__castTick) {
      E.__castTick = 1;
      const origTick = E.tick;
      E.tick = function (S) {
        const head = S && S.log && S.log.length ? S.log[0] : null;
        const r = origTick.apply(this, arguments);
        localizeAfter(S, head);
        return r;
      };
    }
    // Летопись в окне «Летопись» (src/ui/story-ui.js) берёт названия глав из BK.Story.history —
    // там «Уфа на двоих». Обёртка делает их местными; для Уфы swap возвращает строку как есть.
    const ST = BK.Story;
    if (ST && typeof ST.history === 'function' && !ST.__castHist) {
      ST.__castHist = 1;
      const origHist = ST.history;
      ST.history = function (S) {
        const h = origHist.apply(this, arguments);
        try { if (h && h.chapters && cityOf(S) !== 'ufa') for (const c of h.chapters) c.name = swap(S, c.name); } catch (e) { /* летопись важнее */ }
        return h;
      };
    }
    if (typeof E.resolveEvent === 'function' && !E.__castEv) {
      E.__castEv = 1;
      const origEv = E.resolveEvent;
      E.resolveEvent = function (S) {
        const head = S && S.log && S.log.length ? S.log[0] : null;
        const r = origEv.apply(this, arguments);
        localizeAfter(S, head);
        return r;
      };
    }
    return true;
  }

  BK.STORY_CAST = {
    CITY_FORMS, UFA, MANUAL, POOLS, REGION, ALL_ROLES, HERO_ROLE, GUEST_IDS,
    cityOf, resolve, record, hero, render, swap, vars, forms, wordOne,
    sceneCity, bestStore, districtOf, topoFor,
    cityIdNow, noteHome, swapNow, chainName, chainShortName, bankName, shopName, personOf, rivalNow, install,
  };
})();
