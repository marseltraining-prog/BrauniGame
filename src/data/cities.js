/* Города России (второй акт) и генератор упрощённых карт городов.
   Числа — игровые и округлённые (docs/russia-design.md §2), не справочник.
   Карта города строится детерминированно из параметров и зерна: тот же формат, что у Уфы в world.js
   (BK.DISTRICTS, BK.MAP, BK.CENTER_POINT). Активный город подменяет эти глобальные ссылки — BK.useCity(). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  /* inc — доход (× платёжеспособность), rent — аренда, wage — зарплаты, comp — конкуренция (low/mid/high/vhigh),
     km — от Уфы по дорогам, cap — ориентир ёмкости (точек), lat/lon — для карты России,
     shape: compact | river-strip | coast | bay | radial; water: none | one-river | confluence | coast | bay | strip,
     muslim — доля эффекта байрамов (Уфа = 1), sab — сила Сабантуя, in — «в Казани», feat — особенность (текст для карточки).
     Механика особенностей (этап Р4, docs/russia-design.md §16): season — сезонный профиль ×SEASON по месяцам; kmK — город вытянут (доставка
     внутри города дальше); prod2 — второй цех раньше (точек); park — летний множитель парковых точек (обычно 1,25); cat / hot — прибавка к чеку
     × доля категории в меню (круглый год / июнь–август); natReq — рейтинг −★ без национальной выпечки в меню; grow — рост населения в год
     (поток гостей, не больше CORP.GROW_CAP); archK — поправки архетипов районов (трафик, платёжеспособность, вес в предложениях);
     gate — «ворота»: вход в другой город дешевле (множитель); fedK — «Хлебный двор» приходит и давит слабее. */
  const CITIES = [
    { id: 'ufa', name: 'Уфа', in: 'в Уфе', pop: 1.16, inc: 1.00, rent: 1.00, wage: 1.00, comp: 'mid', km: 0, cap: 55, lat: 54.7, lon: 56.0, builtin: true,
      feat: 'Родной город: узнаваемость 100%' },
    { id: 'sterlitamak', name: 'Стерлитамак', in: 'в Стерлитамаке', pop: 0.28, inc: 0.85, rent: 0.60, wage: 0.85, comp: 'low', km: 130, cap: 14, lat: 53.6, lon: 55.9,
      shape: 'compact', water: 'one-river', rivers: [['р. Белая', 15]], muslim: 1, sab: 1, aw0: 0.4, feat: 'Спутник Уфы (130 км): можно возить выпечку из уфимского цеха без своего; стартовая узнаваемость 40%',
      districts: [['Центр', 'center'], ['Проспект Октября', 'biz'], ['Западный', 'sleep'], ['Северный', 'sleep'], ['Южный', 'far'], ['Промзона «Сода»', 'industrial']],
      streets: ['ул. Худайбердина', 'пр. Ленина', 'ул. Коммунистическая', 'ул. Артёма', 'пр. Октября'] },
    { id: 'chelny', name: 'Набережные Челны', short: 'Н. Челны', in: 'в Набережных Челнах', pop: 0.55, inc: 0.92, rent: 0.70, wage: 0.92, comp: 'mid', km: 290, cap: 25, lat: 55.7, lon: 52.4,
      shape: 'compact', water: 'one-river', rivers: [['р. Кама', 18]], muslim: 1, sab: 1, feat: 'Татарский календарь; выпечка из Уфы (290 км) — только с логистикой 1-го уровня',
      districts: [['Новый город', 'center'], ['Проспект Мира', 'biz'], ['ГЭС', 'sleep'], ['Комсомольский', 'sleep'], ['ЗЯБ', 'far'], ['Сидоровка', 'far'], ['Промзона КАМАЗа', 'industrial']],
      streets: ['пр. Мира', 'пр. Чулман', 'пр. Сююмбике', 'б-р Энтузиастов', 'пр. Вахитова'] },
    { id: 'orenburg', name: 'Оренбург', in: 'в Оренбурге', pop: 0.55, inc: 0.88, rent: 0.70, wage: 0.88, comp: 'low', km: 370, cap: 24, lat: 51.8, lon: 55.1,
      shape: 'compact', water: 'one-river', rivers: [['р. Урал', 12]], muslim: 0.5, sab: 0, feat: 'Дешёвый и спокойный вход; рядом Казахстан — национальная выпечка в чеке +15%; жаркое лето — напитки +25%',
      cat: { national: 0.15 }, hot: { drinks: 0.25 },
      districts: [['Центр', 'center'], ['Проспект Победы', 'biz'], ['Форштадт', 'sleep'], ['Степной', 'sleep'], ['Ростоши', 'far'], ['Карачи', 'far'], ['Промышленный', 'industrial']],
      streets: ['ул. Советская', 'пр. Победы', 'ул. Терешковой', 'ул. Чкалова', 'Шарлыкское шоссе'] },
    { id: 'chelyabinsk', name: 'Челябинск', in: 'в Челябинске', pop: 1.18, inc: 0.95, rent: 0.85, wage: 0.97, comp: 'mid', km: 410, cap: 50, lat: 55.2, lon: 61.4,
      shape: 'compact', water: 'one-river', rivers: [['р. Миасс', 8]], muslim: 0.3, sab: 0, feat: 'Промышленный: у заводов и на окраинах поток выше, чек ниже; мест у заводов больше',
      archK: { industrial: { traffic: 1.35, solv: 0.9, w: 1.8 }, far: { traffic: 1.12, solv: 0.94 } },
      districts: [['Центр', 'center'], ['Проспект Ленина', 'biz'], ['Северо-Запад', 'prestige'], ['Калининский', 'sleep'], ['Курчатовский', 'sleep'], ['Ленинский', 'sleep'], ['Тракторозаводский', 'far'], ['Советский', 'student'], ['Металлургический', 'industrial']],
      streets: ['пр. Ленина', 'ул. Кирова', 'пр. Победы', 'Свердловский пр.', 'Комсомольский пр.'] },
    { id: 'samara', name: 'Самара', in: 'в Самаре', pop: 1.16, inc: 1.00, rent: 0.95, wage: 1.00, comp: 'mid', km: 460, cap: 50, lat: 53.2, lon: 50.2,
      shape: 'river-strip', water: 'strip', rivers: [['р. Волга', 26]], muslim: 0.3, sab: 0, feat: 'Набережная Волги: летом точки у парков +30% (в других городах +25%)', park: 1.3,
      districts: [['Самарский', 'center'], ['Ленинский', 'biz'], ['Октябрьский', 'prestige'], ['Советский', 'sleep'], ['Промышленный', 'sleep'], ['Кировский', 'far'], ['Железнодорожный', 'student'], ['Красноглинский', 'outskirts'], ['Безымянка', 'industrial']],
      streets: ['ул. Куйбышева', 'ул. Ленинградская', 'Московское шоссе', 'ул. Ново-Садовая', 'ул. Самарская'] },
    { id: 'perm', name: 'Пермь', in: 'в Перми', pop: 1.03, inc: 0.98, rent: 0.85, wage: 0.98, comp: 'mid', km: 480, cap: 45, lat: 58.0, lon: 56.2,
      shape: 'river-strip', water: 'strip', rivers: [['р. Кама', 22]], muslim: 0.15, sab: 0, feat: 'Город вытянут вдоль Камы: доставка по городу дальше (×1,35), второй цех — с 11 точек', kmK: 1.35, prod2: 11,
      districts: [['Ленинский', 'center'], ['Свердловский', 'biz'], ['Дзержинский', 'prestige'], ['Мотовилихинский', 'sleep'], ['Индустриальный', 'sleep'], ['Кировский', 'far'], ['Орджоникидзевский', 'far'], ['Гайва', 'outskirts'], ['Закамск', 'industrial']],
      streets: ['Комсомольский пр.', 'ул. Ленина', 'ул. Сибирская', 'ул. Петропавловская', 'ул. Героев Хасана'] },
    { id: 'kazan', name: 'Казань', in: 'в Казани', pop: 1.32, inc: 1.08, rent: 1.10, wage: 1.05, comp: 'high', km: 525, cap: 60, lat: 55.8, lon: 49.1,
      shape: 'compact', water: 'confluence', rivers: [['р. Волга', 24], ['р. Казанка', 9], ['р. Волга', 24]], muslim: 1, sab: 1, feat: 'Туризм и вузы; татарский календарь; сильные местные пекарни — без национальной выпечки в меню рейтинг −0,3★', natReq: 0.3,
      districts: [['Вахитовский', 'center'], ['Ново-Савиновский', 'biz'], ['Приволжский', 'prestige'], ['Советский', 'sleep'], ['Московский', 'sleep'], ['Азино', 'sleep'], ['Кировский', 'far'], ['Горки', 'student'], ['Дербышки', 'outskirts'], ['Авиастроительный', 'industrial']],
      streets: ['ул. Баумана', 'ул. Пушкина', 'пр. Победы', 'пр. Ямашева', 'ул. Кремлёвская'] },
    { id: 'ekb', name: 'Екатеринбург', in: 'в Екатеринбурге', pop: 1.54, inc: 1.15, rent: 1.20, wage: 1.10, comp: 'high', km: 525, cap: 70, lat: 56.8, lon: 60.6,
      shape: 'compact', water: 'one-river', rivers: [['р. Исеть', 9]], muslim: 0.15, sab: 0.3, feat: 'Деловая столица Урала: больше мест у бизнес-центров, кофейная культура — напитки в чеке +12%; сильные местные сети',
      archK: { biz: { w: 1.4 } }, cat: { drinks: 0.12 },
      districts: [['Центр', 'center'], ['Юго-Запад', 'biz'], ['ВИЗ', 'biz'], ['Академический', 'prestige'], ['Уралмаш', 'sleep'], ['Эльмаш', 'sleep'], ['Ботаника', 'sleep'], ['Пионерский', 'student'], ['Химмаш', 'industrial'], ['Вторчермет', 'industrial']],
      streets: ['пр. Ленина', 'ул. Малышева', 'ул. 8 Марта', 'ул. Вайнера', 'ул. Куйбышева'] },
    { id: 'tyumen', name: 'Тюмень', in: 'в Тюмени', pop: 0.85, inc: 1.20, rent: 1.05, wage: 1.12, comp: 'mid', km: 800, cap: 38, lat: 57.2, lon: 65.5,
      shape: 'compact', water: 'one-river', rivers: [['р. Тура', 12]], muslim: 0.3, sab: 0, feat: 'Нефтяные доходы: высокий чек; город растёт — гостей +1,5% в год', grow: 0.015,
      districts: [['Центр', 'center'], ['Калининский', 'biz'], ['Заречный', 'prestige'], ['Восточный', 'sleep'], ['Мыс', 'sleep'], ['Ленинский', 'student'], ['Тарманы', 'far'], ['Антипино', 'industrial']],
      streets: ['ул. Республики', 'ул. Мельникайте', 'ул. Широтная', 'ул. Ленина', 'Червишевский тракт'] },
    { id: 'nnov', name: 'Нижний Новгород', short: 'Н. Новгород', in: 'в Нижнем Новгороде', pop: 1.20, inc: 1.00, rent: 0.95, wage: 1.00, comp: 'mid', km: 930, cap: 50, lat: 56.3, lon: 44.0,
      shape: 'compact', water: 'confluence', rivers: [['р. Ока', 18], ['р. Волга', 24], ['р. Волга', 24]], muslim: 0.15, sab: 0, feat: 'Слияние Оки и Волги — как Белая и Уфа; ворота к Москве: с Нижним в сети вход в Москву на 15% дешевле', gate: { moscow: 0.85 },
      districts: [['Нижегородский', 'center'], ['Советский', 'biz'], ['Приокский', 'prestige'], ['Канавинский', 'sleep'], ['Ленинский', 'sleep'], ['Московский', 'sleep'], ['Сормовский', 'far'], ['Щербинки', 'student'], ['Автозаводский', 'industrial']],
      streets: ['ул. Большая Покровская', 'ул. Рождественская', 'ул. Белинского', 'пр. Гагарина', 'ул. Родионова'] },
    { id: 'volgograd', name: 'Волгоград', in: 'в Волгограде', pop: 1.02, inc: 0.85, rent: 0.75, wage: 0.88, comp: 'low', km: 1290, cap: 40, lat: 48.7, lon: 44.5,
      shape: 'river-strip', water: 'strip', rivers: [['р. Волга', 28]], muslim: 0.15, sab: 0, feat: 'Город-лента ~70 км вдоль Волги: доставка по городу ×1,6, второй цех — с 10 точек; жаркое лето — напитки +20%',
      kmK: 1.6, prod2: 10, hot: { drinks: 0.2 },
      districts: [['Центральный', 'center'], ['Ворошиловский', 'biz'], ['Дзержинский', 'prestige'], ['Краснооктябрьский', 'sleep'], ['Советский', 'sleep'], ['Спартановка', 'sleep'], ['Кировский', 'far'], ['Красноармейский', 'far'], ['Тракторозаводский', 'industrial']],
      streets: ['пр. Ленина', 'ул. Мира', 'ул. Рабоче-Крестьянская', 'ул. Землячки', 'Университетский пр.'] },
    { id: 'voronezh', name: 'Воронеж', in: 'в Воронеже', pop: 1.05, inc: 0.95, rent: 0.85, wage: 0.92, comp: 'mid', km: 1330, cap: 42, lat: 51.7, lon: 39.2,
      shape: 'compact', water: 'one-river', rivers: [['р. Воронеж', 20]], muslim: 0.15, sab: 0, feat: 'Студенческий: больше мест у вузов, летом провал сильнее (июль–август −10%)',
      archK: { student: { w: 1.6 } }, season: [1, 1, 1, 1, 1, 0.96, 0.88, 0.9, 1.03, 1, 1, 1],
      districts: [['Центральный', 'center'], ['Ленинский', 'biz'], ['Северный', 'prestige'], ['Коминтерновский', 'sleep'], ['Советский', 'sleep'], ['Левобережный', 'far'], ['Университетский', 'student'], ['Шилово', 'outskirts'], ['Железнодорожный', 'industrial']],
      streets: ['пр. Революции', 'ул. Плехановская', 'ул. Кольцовская', 'Московский пр.', 'ул. Фридриха Энгельса'] },
    { id: 'rostov', name: 'Ростов-на-Дону', short: 'Ростов', in: 'в Ростове-на-Дону', pop: 1.14, inc: 1.00, rent: 0.95, wage: 0.95, comp: 'high', km: 1750, cap: 48, lat: 47.2, lon: 39.7,
      shape: 'compact', water: 'one-river', rivers: [['р. Дон', 18]], muslim: 0.15, sab: 0, feat: 'Южная кухня, много уличных пекарен (высокая конкуренция); короткая зима — провал зимой мельче',
      season: [1.05, 1.06, 1.03, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      districts: [['Кировский', 'center'], ['Ленинский', 'biz'], ['Октябрьский', 'prestige'], ['Западный', 'sleep'], ['Ворошиловский', 'sleep'], ['Пролетарский', 'sleep'], ['Первомайский', 'far'], ['Левенцовка', 'far'], ['Железнодорожный', 'industrial']],
      streets: ['ул. Большая Садовая', 'Будённовский пр.', 'ул. Пушкинская', 'Ворошиловский пр.', 'пр. Стачки'] },
    { id: 'krasnodar', name: 'Краснодар', in: 'в Краснодаре', pop: 1.10, inc: 1.02, rent: 1.00, wage: 0.95, comp: 'high', km: 2030, cap: 50, lat: 45.0, lon: 39.0,
      shape: 'compact', water: 'one-river', rivers: [['р. Кубань', 16]], muslim: 0.15, sab: 0, feat: 'Самый быстрорастущий: новые микрорайоны — гостей +2% в год', grow: 0.02,
      districts: [['Центр', 'center'], ['Фестивальный', 'biz'], ['Юбилейный', 'prestige'], ['Западный', 'sleep'], ['Карасунский', 'sleep'], ['Прикубанский', 'sleep'], ['ЮМР', 'student'], ['Пашковский', 'far'], ['Гидрострой', 'industrial']],
      streets: ['ул. Красная', 'ул. Северная', 'ул. Ставропольская', 'ул. Кубанская Набережная', 'ул. Российская'] },
    { id: 'sochi', name: 'Сочи', in: 'в Сочи', pop: 0.45, inc: 1.25, rent: 1.50, wage: 1.10, comp: 'mid', km: 2300, cap: 20, lat: 43.6, lon: 39.7,
      shape: 'coast', water: 'coast', rivers: [['р. Сочи', 7]], sea: 'Чёрное море', muslim: 0.15, sab: 0, feat: 'Курорт: лето ×1,5, зима ×0,8; дорогая аренда; город-лента вдоль моря — доставка ×1,3',
      season: [0.8, 0.8, 0.86, 0.95, 1.05, 1.28, 1.5, 1.5, 1.2, 0.98, 0.86, 0.88], kmK: 1.3,
      districts: [['Центральный', 'center'], ['Адлер', 'biz'], ['Хоста', 'prestige'], ['Мацеста', 'sleep'], ['Дагомыс', 'far'], ['Лазаревское', 'outskirts'], ['Кудепста', 'industrial']],
      streets: ['Курортный пр.', 'ул. Навагинская', 'ул. Роз', 'ул. Виноградная', 'ул. Орджоникидзе'] },
    { id: 'moscow', name: 'Москва', in: 'в Москве', pop: 13.1, inc: 1.80, rent: 3.00, wage: 1.70, comp: 'vhigh', km: 1350, cap: 250, lat: 55.8, lon: 37.6,
      shape: 'radial', water: 'one-river', rivers: [['р. Москва', 12]], muslim: 0.3, sab: 0.3, big: true, feat: 'Огромный рынок, самая дорогая аренда и сильнейшие федеральные сети',
      districts: [['Центр', 'center'], ['Москва-Сити', 'biz'], ['Павелецкая', 'biz'], ['Белорусская', 'biz'], ['Хамовники', 'prestige'], ['Юго-Запад', 'prestige'], ['Север', 'sleep'], ['Северо-Восток', 'sleep'], ['Восток', 'sleep'], ['Юг', 'far'], ['Новая Москва', 'outskirts'], ['Юго-Восток', 'industrial']],
      streets: ['ул. Тверская', 'ул. Арбат', 'ул. Мясницкая', 'пр. Мира', 'Ленинский пр.', 'Кутузовский пр.'] },
    { id: 'spb', name: 'Санкт-Петербург', short: 'Петербург', in: 'в Петербурге', pop: 5.6, inc: 1.40, rent: 1.90, wage: 1.40, comp: 'vhigh', km: 2050, cap: 150, lat: 59.9, lon: 30.3,
      shape: 'bay', water: 'bay', rivers: [['р. Нева', 22]], sea: 'Финский залив', muslim: 0.15, sab: 0, big: true, feat: 'Культура пышечных — сладкая выпечка в чеке +12%; короткое лето: белые ночи (июнь–июль +16%), сырое межсезонье и зима −5%',
      season: [0.95, 0.95, 1.0, 1.03, 1.07, 1.16, 1.16, 1.06, 1.0, 0.98, 0.95, 0.95], cat: { sweet: 0.12 },
      districts: [['Центральный', 'center'], ['Адмиралтейский', 'biz'], ['Василеостровский', 'biz'], ['Петроградский', 'prestige'], ['Московский', 'sleep'], ['Приморский', 'sleep'], ['Невский', 'sleep'], ['Калининский', 'sleep'], ['Выборгский', 'student'], ['Красносельский', 'far'], ['Кировский', 'industrial']],
      streets: ['Невский пр.', 'ул. Рубинштейна', 'Большой пр. П. С.', 'Литейный пр.', 'Московский пр.', 'ул. Марата'] },
    { id: 'nsk', name: 'Новосибирск', in: 'в Новосибирске', pop: 1.63, inc: 1.05, rent: 0.95, wage: 1.05, comp: 'mid', km: 2100, cap: 60, lat: 55.0, lon: 82.9,
      shape: 'compact', water: 'one-river', rivers: [['р. Обь', 26]], muslim: 0.15, sab: 0, far: true, feat: 'Самый дальний: вход дороже на 20%; суровая зима (январь–февраль −5%); федеральные сети слабы — «Хлебный двор» приходит реже и давит вдвое слабее', fedK: 0.5,
      season: [0.95, 0.95, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      districts: [['Центральный', 'center'], ['Железнодорожный', 'biz'], ['Заельцовский', 'prestige'], ['Октябрьский', 'sleep'], ['Дзержинский', 'sleep'], ['Калининский', 'sleep'], ['Ленинский', 'far'], ['Кировский', 'far'], ['Академгородок', 'student'], ['Первомайский', 'industrial']],
      streets: ['Красный пр.', 'ул. Ленина', 'ул. Кирова', 'ул. Фрунзе', 'ул. Большевистская'] },
  ];
  const COMMON_STREETS = ['ул. Ленина', 'пр. Мира', 'ул. Советская', 'ул. Гагарина', 'ул. Молодёжная', 'ул. Садовая', 'ул. Школьная', 'ул. Победы', 'ул. Кирова', 'ул. Мира', 'ул. Лесная', 'ул. Строителей'];
  // конкуренция → диапазон параметра comp у помещений (Уфа — прежний 0,84…1,00)
  const COMP = { low: { name: 'низкая', range: [0.86, 1] }, mid: { name: 'средняя', range: [0.84, 1] }, high: { name: 'высокая', range: [0.8, 0.97] }, vhigh: { name: 'очень высокая', range: [0.76, 0.94] } };

  /* Архетипы районов: эталон — районы Уфы (docs/russia-design.md §4.2). w — вес района в предложениях, ring — кольцо. */
  const ARCH = {
    center:     { ring: 0, w: 1.4, rent: [2600, 4600], solv: [430, 640], traffic: [6500, 12500], prodRent: [1250, 1650], grp: 0 },
    biz:        { ring: 1, w: 1.3, rent: [2000, 3500], solv: [370, 520], traffic: [6000, 11500], prodRent: [900, 1250], grp: 0 },
    prestige:   { ring: 1, w: 1.2, rent: [1900, 3100], solv: [390, 540], traffic: [4200, 8500], prodRent: [950, 1300], grp: 0 },
    student:    { ring: 1, w: 1.2, rent: [1200, 2100], solv: [290, 390], traffic: [4500, 9000], prodRent: [600, 850], grp: 1, lm: 'uni' },
    sleep:      { ring: 2, w: 1.1, rent: [1350, 2200], solv: [310, 420], traffic: [4200, 8500], prodRent: [650, 920], grp: 1 },
    far:        { ring: 3, w: 0.9, rent: [1000, 1700], solv: [280, 370], traffic: [3000, 6400], prodRent: [470, 680], grp: 1 },
    industrial: { ring: 3, w: 0.5, rent: [800, 1250], solv: [250, 320], traffic: [1800, 4500], prodRent: [330, 480], grp: 2 },
    outskirts:  { ring: 3, w: 0.5, rent: [600, 1000], solv: [230, 300], traffic: [1500, 3800], prodRent: [260, 400], grp: 2 },
  };
  const RING_R = [0, 130, 265, 385];

  function mulberry(a) {
    return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd10 = (v, s) => Math.round(v / s) * s;
  function kmPerUnitOf(c) { return c.pop >= 10 ? 1 / 18 : c.pop >= 3 ? 1 / 22 : c.pop >= 1 ? 1 / 28 : c.pop >= 0.5 ? 1 / 36 : 1 / 45; }
  function distToPoly(p, pts) {
    let best = 1e9, bi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L, 0, 1), x = a[0] + t * dx, y = a[1] + t * dy;
      const d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; bi = i; }
    }
    return { d: best, i: bi };
  }
  function hull(pts) { // выпуклая оболочка (монотонная цепь)
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  /* Генератор карты города (mapGen 1). Всё детерминированно от зерна; результат кешируется на сессию. */
  const geoCache = {};
  function genCityGeo(def, seed, mapGen) {
    const key = def.id + ':' + seed + ':' + (mapGen || 1);
    if (geoCache[key]) return geoCache[key];
    const R = mulberry(seed ^ hashStr(def.id)), rr = (a, b) => a + (b - a) * R();
    const shape = def.shape || 'compact', water = def.water || 'one-river';
    const C0 = { x: 500, y: 510 };
    // локальная система: u — вдоль оси города, v — поперёк
    const th = shape === 'coast' ? rr(-0.35, 0.1) : shape === 'bay' ? rr(-0.2, 0.2) : shape === 'river-strip' ? rr(-0.6, 0.6) : rr(0, Math.PI * 2);
    const A = [Math.cos(th), Math.sin(th)], B = [-Math.sin(th), Math.cos(th)];
    const toXY = (u, v) => ({ x: C0.x + u * A[0] + v * B[0], y: C0.y + u * A[1] + v * B[1] });
    const half = shape === 'coast' || shape === 'river-strip'; // город на одном берегу: v ≤ 0
    const sq = half ? { u: 1.25, v: 0.62 } : shape === 'bay' ? { u: 0.95, v: 1.05 } : { u: 1, v: 1 };
    // районы по кольцам
    const list = def.districts.map(([name, arch], i) => ({ name, arch, i, ring: ARCH[arch].ring }));
    const indAng = rr(0, Math.PI * 2);
    const byRing = [[], [], [], []];
    for (const d of list) byRing[d.ring].push(d);
    const angOf = (k, n, a0) => {
      if (half) return Math.PI + (k + 0.5) / n * Math.PI + rr(-0.12, 0.12);
      if (shape === 'bay') return -0.55 * Math.PI + (k + 0.5) / n * 1.1 * Math.PI + rr(-0.1, 0.1);
      return a0 + (k / n) * Math.PI * 2 + rr(-0.22, 0.22) * (Math.PI * 2 / Math.max(3, n));
    };
    for (let r = 0; r < 4; r++) {
      const ds = byRing[r]; if (!ds.length) continue;
      if (r === 0) { for (const d of ds) { const p = half ? toXY(0, -40) : shape === 'bay' ? toXY(-60, rr(-10, 10)) : toXY(rr(-15, 15), rr(-15, 15)); d.x = p.x; d.y = p.y; } continue; }
      // промзона — с одной стороны (у железной дороги), остальные — равномерно по кольцу
      const ind = ds.filter((d) => d.arch === 'industrial'), rest = ds.filter((d) => d.arch !== 'industrial');
      const a0 = rr(0, Math.PI * 2), n = rest.length + (half || shape === 'bay' ? ind.length : 0);
      let k = 0;
      const order = half || shape === 'bay' ? rest.concat(ind) : rest;
      for (const d of order) {
        const a = angOf(k++, n, a0), rad = RING_R[r] + rr(-22, 22);
        const p = toXY(Math.cos(a) * rad * sq.u, Math.sin(a) * rad * sq.v); d.x = p.x; d.y = p.y; d.ang = a;
      }
      if (!(half || shape === 'bay')) ind.forEach((d, j) => { const a = indAng + j * 0.55, rad = RING_R[r] + rr(-15, 25); const p = toXY(Math.cos(a) * rad, Math.sin(a) * rad); d.x = p.x; d.y = p.y; });
    }
    const box = (d) => { d.x = clamp(d.x, 80, 920); d.y = clamp(d.y, 95, 925); };
    list.forEach(box);
    // раздвинуть слишком близкие центры (ячейки Вороного — не мельче ~100 ед.)
    const relax = (minD) => {
      for (let it = 0; it < 30; it++) {
        let moved = false;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < minD) { const k = (minD - d) / 2 / d; if (a.ring) { a.x -= dx * k; a.y -= dy * k; } if (b.ring) { b.x += dx * k; b.y += dy * k; } moved = true; }
        }
        list.forEach(box);
        if (!moved) break;
      }
    };
    relax(list.length > 10 ? 125 : 140);
    // вода
    const rivers = [], sea = [], labels = [], rn = def.rivers || [];
    const noisy = (from, to, amp, n) => { // плавная ломаная с шумом поперёк
      const pts = [], dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const ph1 = rr(0, 6.3), ph2 = rr(0, 6.3), f1 = rr(1.2, 2.2), f2 = rr(2.5, 4);
      for (let i = 0; i <= n; i++) { const t = i / n, w = Math.sin(t * Math.PI); const o = amp * w * (0.7 * Math.sin(ph1 + t * f1 * Math.PI) + 0.3 * Math.sin(ph2 + t * f2 * Math.PI)); pts.push([Math.round(from.x + dx * t + nx * o), Math.round(from.y + dy * t + ny * o)]); }
      return pts;
    };
    const far = (p, ang, L) => ({ x: p.x + Math.cos(ang) * L, y: p.y + Math.sin(ang) * L });
    const center = list.find((d) => d.ring === 0) || list[0];
    if (water === 'one-river') {
      const ang = rr(0, Math.PI), nx = -Math.sin(ang), ny = Math.cos(ang), side = R() < 0.5 ? -1 : 1;
      const P = { x: center.x + nx * 62 * side, y: center.y + ny * 62 * side };
      rivers.push({ pts: noisy(far(P, ang + Math.PI, 900), far(P, ang, 900), 45, 12), w: rn[0] ? rn[0][1] : 14, name: rn[0] ? rn[0][0] : '' });
    } else if (water === 'confluence') {
      const a1 = rr(0, Math.PI * 2), a2 = a1 + rr(1.5, 2.3), a3 = (a1 + a2) / 2 + Math.PI + rr(-0.3, 0.3);
      const P = { x: center.x + Math.cos(a3 + 1.2) * 70, y: center.y + Math.sin(a3 + 1.2) * 70 };
      rivers.push({ pts: noisy(far(P, a1, 900), P, 35, 8), w: rn[0] ? rn[0][1] : 14, name: rn[0] ? rn[0][0] : '' });
      rivers.push({ pts: noisy(far(P, a2, 900), P, 35, 8), w: rn[1] ? rn[1][1] : 12, name: rn[1] ? rn[1][0] : '' });
      rivers.push({ pts: noisy(P, far(P, a3, 900), 35, 8), w: rn[2] ? rn[2][1] : 18, name: '' });
    } else if (water === 'strip') { // широкая река вдоль города (город на одном берегу)
      const p0 = toXY(-1100, 38), p1 = toXY(1100, 38);
      rivers.push({ pts: noisy(p0, p1, 30, 14), w: rn[0] ? rn[0][1] : 26, name: rn[0] ? rn[0][0] : '' });
    } else if (water === 'coast') { // море по одну сторону, небольшая река впадает у центра
      const cl = []; for (let i = 0; i <= 14; i++) { const u = -1500 + i * 3000 / 14; const p = toXY(u, 22 + (i % 2 ? 1 : -1) * rr(4, 16)); cl.push([Math.round(p.x), Math.round(p.y)]); }
      const f1 = toXY(1500, 1600), f0 = toXY(-1500, 1600);
      sea.push({ pts: cl.concat([[Math.round(f1.x), Math.round(f1.y)], [Math.round(f0.x), Math.round(f0.y)]]), name: def.sea || 'море' });
      const mouth = toXY(rr(40, 90), 24);
      rivers.push({ pts: noisy(toXY(rr(60, 160), -900), mouth, 30, 8), w: rn[0] ? rn[0][1] : 7, name: rn[0] ? rn[0][0] : '' });
    } else if (water === 'bay') { // залив с запада и река от востока к заливу
      const cl = []; for (let i = 0; i <= 12; i++) { const v = -1500 + i * 3000 / 12; const p = toXY(-205 + (i % 2 ? 1 : -1) * rr(6, 20), v); cl.push([Math.round(p.x), Math.round(p.y)]); }
      const f1 = toXY(-1700, 1500), f0 = toXY(-1700, -1500);
      sea.push({ pts: cl.concat([[Math.round(f1.x), Math.round(f1.y)], [Math.round(f0.x), Math.round(f0.y)]]), name: def.sea || 'залив' });
      rivers.push({ pts: noisy(toXY(1100, rr(-120, 120)), toXY(-215, rr(-20, 20)), 60, 12), w: rn[0] ? rn[0][1] : 20, name: rn[0] ? rn[0][0] : '' });
    }
    // районы не стоят в реке: отодвинуть от русла
    for (let it = 0; it < 4; it++) for (const d of list) for (const rv of rivers) {
      const need = rv.w * 0.5 + 48, q = distToPoly(d, rv.pts);
      if (q.d < need) {
        const a = rv.pts[q.i], b = rv.pts[q.i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        let nx = -dy / L, ny = dx / L; if ((d.x - a[0]) * nx + (d.y - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
        d.x += nx * (need - q.d); d.y += ny * (need - q.d); box(d);
      }
    }
    if (water === 'coast' || water === 'bay') for (const d of list) { // и не в море
      const lu = (d.x - C0.x) * A[0] + (d.y - C0.y) * A[1], lv = (d.x - C0.x) * B[0] + (d.y - C0.y) * B[1];
      if (water === 'coast' && lv > -30) { const p = toXY(lu, -30); d.x = p.x; d.y = p.y; }
      if (water === 'bay' && lu < -150) { const p = toXY(-150, lv); d.x = p.x; d.y = p.y; }
      box(d);
    }
    // промзона и железная дорога: вокзал между центром и промзоной
    const ind = list.find((d) => d.arch === 'industrial') || list[list.length - 1];
    const st = { x: Math.round(center.x + (ind.x - center.x) * 0.42), y: Math.round(center.y + (ind.y - center.y) * 0.42) };
    const dI = Math.atan2(ind.y - st.y, ind.x - st.x);
    const r0 = far(ind, dI + rr(-0.3, 0.3), 900), r1 = far(st, dI + Math.PI + rr(-0.7, 0.7), 1000);
    const rail = [[r0.x, r0.y], [ind.x + Math.cos(dI + 1.57) * 26, ind.y + Math.sin(dI + 1.57) * 26], [st.x, st.y], [(st.x + r1.x) / 2 * 0.25 + st.x * 0.75, (st.y + r1.y) / 2 * 0.25 + st.y * 0.75], [r1.x, r1.y]].map((p) => [Math.round(p[0]), Math.round(p[1])]);
    // контур города: выпуклая оболочка центров, раздутая на ~70 ед.
    const hp = hull(list.map((d) => [d.x, d.y]));
    const cx = hp.reduce((a, p) => a + p[0], 0) / hp.length, cy = hp.reduce((a, p) => a + p[1], 0) / hp.length;
    const city = [];
    for (let i = 0; i < hp.length; i++) {
      const p = hp[i], q = hp[(i + 1) % hp.length], L = Math.hypot(p[0] - cx, p[1] - cy) || 1, inf = 74 + rr(-8, 16);
      city.push([Math.round(p[0] + (p[0] - cx) / L * inf), Math.round(p[1] + (p[1] - cy) / L * inf)]);
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, M = Math.hypot(mx - cx, my - cy) || 1, inf2 = 62 + rr(-6, 18);
      city.push([Math.round(mx + (mx - cx) / M * inf2), Math.round(my + (my - cy) / M * inf2)]);
    }
    // парки: набережная у реки ближе к центру, центральный и лесопарк
    const parks = [];
    if (rivers[0]) {
      const q = distToPoly(center, rivers[0].pts), a = rivers[0].pts[q.i];
      const px = center.x + (a[0] - center.x) * 0.55, py = center.y + (a[1] - center.y) * 0.55;
      parks.push({ x: Math.round(px), y: Math.round(py), r: 18, name: 'Набережная' });
    }
    const r1d = list.filter((d) => d.ring === 1 || d.ring === 2);
    if (r1d.length) { const d = r1d[Math.floor(R() * r1d.length)]; parks.push({ x: Math.round(d.x + rr(-35, 35)), y: Math.round(d.y + rr(20, 45)), r: 22, name: 'Парк Победы' }); }
    const r3d = list.filter((d) => d.ring === 3 && d.arch !== 'industrial');
    if (r3d.length) { const d = r3d[Math.floor(R() * r3d.length)]; parks.push({ x: Math.round(d.x + rr(-40, 40)), y: Math.round(d.y + rr(-40, 40)), r: 26, name: 'Лесопарк' }); }
    // подписи рек и моря
    const inBox = (p) => p[0] > 90 && p[0] < 910 && p[1] > 110 && p[1] < 900;
    for (const rv of rivers) {
      if (!rv.name) continue;
      const cand = []; for (let i = 1; i < rv.pts.length - 1; i++) if (inBox(rv.pts[i]) && inBox(rv.pts[i + 1])) cand.push(i);
      if (!cand.length) continue;
      const i = cand[Math.min(cand.length - 1, Math.floor(cand.length * 0.28))], a = rv.pts[i], b = rv.pts[i + 1];
      let rot = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1, off = rv.w / 2 + 10;
      labels.push({ x: Math.round((a[0] + b[0]) / 2 + nx / L * off), y: Math.round((a[1] + b[1]) / 2 + ny / L * off), text: rv.name, rot: Math.round(rot) });
    }
    for (const s of sea) { const p = water === 'coast' ? toXY(-260, 150) : toXY(-330, 260); labels.push({ x: Math.round(clamp(p.x, 120, 880)), y: Math.round(clamp(p.y, 140, 900)), text: s.name, rot: 0, sea: true }); }
    // районы в формате world.js; числа архетипа × индексы города
    const dens = clamp(1 + 0.08 * Math.log(def.pop / 1.16), 0.85, 1.25);
    const own = def.streets || [];
    const DISTRICTS = list.map((d) => {
      const a = ARCH[d.arch], sh = COMMON_STREETS.slice().sort(() => R() - 0.5);
      const ak = Object.assign({ traffic: 1, solv: 1, w: 1 }, (def.archK || {})[d.arch]); // особенность города (Р4): промзоны Челябинска, вузы Воронежа… — без лишних вызовов ГСЧ
      const ownPick = own.slice().sort(() => R() - 0.5).slice(0, d.ring === 0 ? own.length : 3);
      return { id: def.id + d.i, name: d.name, x: Math.round(d.x), y: Math.round(d.y), arch: d.arch, ring: d.ring, w: +(a.w * ak.w).toFixed(3),
        rent: a.rent.map((v) => rnd10(v * def.rent, 10)), solv: a.solv.map((v) => rnd10(v * def.inc * ak.solv, 5)), traffic: a.traffic.map((v) => rnd10(v * dens * ak.traffic, 50)), prodRent: a.prodRent.map((v) => rnd10(v * def.rent, 10)),
        streets: ownPick.concat(sh.slice(0, 3)) };
    });
    const ids = (f) => DISTRICTS.filter(f).map((d) => d.id);
    let g0 = ids((d) => ARCH[d.arch].grp === 0), g1 = ids((d) => ARCH[d.arch].grp === 1), g2 = ids((d) => ARCH[d.arch].grp === 2).concat(ids((d) => d.arch === 'far').slice(0, 1));
    if (!g1.length) g1 = g0; if (!g2.length) g2 = g1;
    const c = DISTRICTS.find((d) => d.ring === 0) || DISTRICTS[0];
    const MAP = { rivers, sea, rail, station: { x: st.x, y: st.y, name: 'Ж/д вокзал' }, city, labels, parks, prodGroups: [g0, g1, g2], hq: { x: c.x + 40, y: c.y - 28 } };
    return (geoCache[key] = { DISTRICTS, MAP, CENTER_POINT: { x: c.x, y: c.y } });
  }

  /* Активный город: подменяет BK.DISTRICTS / BK.MAP / BK.CENTER_POINT и описание BK.CITY (ссылки, не копии).
     useCity(null | 'ufa') — Уфа из world.js (данные прежние, поэтому поток случайностей Уфы не меняется). */
  const UFA = { DISTRICTS: BK.DISTRICTS, MAP: BK.MAP, CENTER_POINT: BK.CENTER_POINT };
  BK.UFA = UFA;
  const byId = {}; for (const c of CITIES) byId[c.id] = c;

  /* ---------- проектные карты городов (PLAN.md, этап 8.3) ----------
     Районы, улицы, соседство и схема карты нарисованы руками — src/data/cities-big.js
     (как Уфа в src/data/world.js). Числа районов там записаны в УФИМСКОМ масштабе, а
     городские коэффициенты rent/inc и плотность dens применяются здесь — тем же способом,
     что в genCityGeo(), поэтому Москва получает аренду ×3,00 и чек ×1,80 из CITIES
     (это стережёт sim/city-coefficients.js), а не «свои» числа. Генератор остальных
     городов и Уфа не затрагиваются. */
  function bigGeo(def) {
    const big = BK.CITY_BIG[def.id];
    const dens = clamp(1 + 0.08 * Math.log(def.pop / 1.16), 0.85, 1.25);
    const DISTRICTS = big.districts.map((d) => {
      const a = ARCH[d.arch], ak = Object.assign({ traffic: 1, solv: 1, w: 1 }, (def.archK || {})[d.arch]);
      return { id: d.id, name: d.name, x: d.x, y: d.y, arch: d.arch, ring: a.ring, w: +(a.w * ak.w).toFixed(3),
        kind: d.kind, lm: (d.lm || []).slice(),
        sizeW: d.sizeW || null, lx: d.lx || 0, ly: d.ly || 0,
        rent: d.rent.map((v) => rnd10(v * def.rent, 10)),
        solv: d.solv.map((v) => rnd10(v * def.inc * ak.solv, 5)),
        traffic: d.traffic.map((v) => rnd10(v * dens * ak.traffic, 50)),
        prodRent: d.prodRent.map((v) => rnd10(v * def.rent, 10)),
        streets: (d.streets && d.streets.length ? d.streets : COMMON_STREETS).slice() };
    });
    const pois = []; // соседство районов одной лентой — карта рисует их точками с подписью
    for (const d of big.districts) for (const p of (d.pois || [])) pois.push({ x: d.x + p[0], y: d.y + p[1], kind: p[2], name: p[3] || '', lbl: !!p[4], d: d.id });
    const ids = (f) => DISTRICTS.filter(f).map((d) => d.id);
    let g0 = ids((d) => ARCH[d.arch].grp === 0), g1 = ids((d) => ARCH[d.arch].grp === 1), g2 = ids((d) => ARCH[d.arch].grp === 2).concat(ids((d) => d.arch === 'far').slice(0, 1));
    if (!g1.length) g1 = g0; if (!g2.length) g2 = g1;
    const c = DISTRICTS.find((d) => d.ring === 0) || DISTRICTS[0];
    const MAP = Object.assign({}, big.map, { sea: big.map.sea || [], prodGroups: [g0, g1, g2], pois,
      hq: { x: c.x + 40, y: c.y - 28 } });
    return { DISTRICTS, MAP, CENTER_POINT: { x: c.x, y: c.y } };
  }
  const bigGeoCache = {};
  function geoOf(def, seed, mapGen) {
    const big = BK.CITY_BIG && BK.CITY_BIG[def.id];
    // Партии до появления подробной карты сохраняют прежние координаты.
    if (!big || (big.mapGen > 1 && mapGen != null && mapGen < big.mapGen)) return genCityGeo(def, seed, mapGen);
    return bigGeoCache[def.id] || (bigGeoCache[def.id] = bigGeo(def)); // рукописная карта от зерна не зависит
  }

  function cityInfo(def) { // описание для движка: экономика, масштаб, конкуренция, сезон, календарь
    // inc/rent/wage всегда берутся из одной записи CITIES. Первый акт читает их через BK.CITY,
    // второй — через BK.CITY_BY_ID; одинаковый город поэтому больше не получает разные зарплаты.
    const base = { id: def.id, name: def.name, in: def.in, inc: def.inc || 1, rent: def.rent || 1, wage: def.wage || 1 };
    if (def.builtin) return base;
    return Object.assign(base, { kmPerUnit: kmPerUnitOf(def) * (def.kmK || 1), compRange: COMP[def.comp].range, season: def.season || null, cal: { muslim: def.muslim != null ? def.muslim : 0.15, sab: def.sab || 0 },
      park: def.park || null, prod2: def.prod2 || null, grow: def.grow || 0, cat: def.cat || null, hot: def.hot || null }); // особенности города (Р4)
  }
  function useCity(id, seed, mapGen) {
    const def = byId[id || 'ufa'] || byId.ufa;
    if (def.builtin) { BK.DISTRICTS = UFA.DISTRICTS; BK.MAP = UFA.MAP; BK.CENTER_POINT = UFA.CENTER_POINT; }
    else { const g = geoOf(def, seed | 0, mapGen); BK.DISTRICTS = g.DISTRICTS; BK.MAP = g.MAP; BK.CENTER_POINT = g.CENTER_POINT; }
    BK.CITY = cityInfo(def);
    return BK.CITY;
  }
  // проекция для карты России (лист 1600×900): x = 60 + (долгота − 27)·24, y = 40 + (68 − широта)·34
  const proj = (lon, lat) => ({ x: 60 + (lon - 27) * 24, y: 40 + (68 - lat) * 34 });
  // расстояние по дорогам между городами: от Уфы — из таблицы, между прочими — по дуге × 1,25
  function roadKm(a, b) {
    const A = byId[a], B = byId[b]; if (!A || !B || a === b) return 0;
    if (a === 'ufa') return B.km; if (b === 'ufa') return A.km;
    const r = Math.PI / 180, h = Math.sin((B.lat - A.lat) * r / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin((B.lon - A.lon) * r / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25 / 10) * 10;
  }
  BK.CITIES = CITIES; BK.CITY_BY_ID = byId; BK.CITY_COMP = COMP; BK.CITY_ARCH = ARCH;
  BK.cityMapGen = (id) => (BK.CITY_BIG && BK.CITY_BIG[id] && BK.CITY_BIG[id].mapGen) || 1;
  // Обложка получает географию отдельно: не меняет активный город и мир сохранения.
  BK.cityPreview = (id) => {
    const def = byId[id] || byId.ufa;
    const g = def.builtin ? UFA : geoOf(def, 7919, BK.cityMapGen(def.id));
    return { MAP: g.MAP, DISTRICTS: g.DISTRICTS, CITY: cityInfo(def) };
  };
  BK.genCityGeo = genCityGeo; BK.useCity = useCity; BK.cityProj = proj; BK.roadKm = roadKm; BK.cityKmPerUnit = kmPerUnitOf;
  useCity(null);
})();
