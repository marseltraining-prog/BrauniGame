/* Мир игры: районы Уфы, соседство, продукты, оборудование, имена. */
var BK = globalThis.BK || (globalThis.BK = {});

/* Координаты — стилизованная карта 1000×1000 (север сверху, ~33 ед = 1 км).
   rent — аренда торговых площадей ₽/м²/мес (2027), solv — платёжеспособность ₽ за визит,
   traffic — поток пешеходов в день, prodRent — аренда под производство ₽/м²/мес. */
BK.DISTRICTS = [
  { id: 'center',  name: 'Центр',             x: 362, y: 800, rent: [2600, 4600], solv: [430, 640], traffic: [6500, 12500], prodRent: [1250, 1650],
    streets: ['ул. Ленина', 'ул. Коммунистическая', 'ул. Пушкина', 'ул. Карла Маркса', 'ул. Гоголя', 'ул. Заки Валиди', 'ул. Цюрупы', 'ул. Октябрьской революции', 'ул. Аксакова', 'ул. Кирова'] },
  { id: 'grove',   name: 'Зелёная роща',      x: 478, y: 712, rent: [1900, 3100], solv: [390, 540], traffic: [4200, 8500], prodRent: [950, 1300],
    streets: ['ул. Менделеева', 'ул. Бакалинская', 'ул. Степана Злобина', 'ул. Айская', 'ул. Шафиева', 'ул. Мингажева'] },
  { id: 'october', name: 'Проспект Октября',  x: 548, y: 612, rent: [2000, 3500], solv: [370, 520], traffic: [6000, 11500], prodRent: [900, 1250],
    streets: ['пр. Октября', 'ул. Комсомольская', 'бул. Славы', 'ул. Рихарда Зорге', 'ул. Лесной проезд', 'ул. 50 лет СССР'] },
  { id: 'sipaylovo', name: 'Сипайлово',       x: 690, y: 632, rent: [1400, 2300], solv: [320, 430], traffic: [4800, 8800], prodRent: [700, 950],
    streets: ['ул. Бикбая', 'ул. Юрия Гагарина', 'ул. Академика Королёва', 'ул. Энтузиастов', 'ул. Российская', 'ул. Набережная реки Уфы'] },
  { id: 'glumilino', name: 'Глумилино',       x: 612, y: 742, rent: [1300, 2000], solv: [310, 420], traffic: [3500, 7000], prodRent: [650, 900],
    streets: ['ул. Максима Рыльского', 'ул. Уфимское шоссе', 'ул. Дмитрия Донского', 'ул. Сипайловская', 'ул. Глумилинская'] },
  { id: 'chernikovka', name: 'Черниковка',    x: 606, y: 468, rent: [1200, 2100], solv: [290, 390], traffic: [4500, 9000], prodRent: [600, 850],
    streets: ['ул. Первомайская', 'ул. Интернациональная', 'ул. Кольцевая', 'бул. Молодёжный', 'ул. Вологодская', 'ул. Кремлёвская'] },
  { id: 'inors',   name: 'Инорс',             x: 430, y: 478, rent: [1000, 1650], solv: [270, 350], traffic: [3200, 6500], prodRent: [500, 700],
    streets: ['ул. Сельская Богородская', 'ул. Георгия Мушникова', 'ул. Мира', 'ул. Лесная', 'ул. Победы'] },
  { id: 'north',   name: 'Северная промзона', x: 548, y: 318, rent: [800, 1250], solv: [250, 320], traffic: [1800, 4500], prodRent: [330, 480],
    streets: ['Индустриальное шоссе', 'ул. Трамвайная', 'ул. Кемеровская', 'ул. Ульяновых', 'ул. Нефтяников'] },
  { id: 'shaksha', name: 'Шакша',             x: 862, y: 138, rent: [600, 1000], solv: [230, 300], traffic: [1500, 3800], prodRent: [260, 400],
    streets: ['ул. Гвардейская', 'ул. Шакшинская', 'ул. Кооперативная', 'ул. Лётчиков'] },
  { id: 'nizh',    name: 'Нижегородка',       x: 452, y: 902, rent: [900, 1500], solv: [250, 330], traffic: [2500, 5500], prodRent: [420, 600],
    streets: ['ул. Ахметова', 'ул. Нижегородская', 'ул. Пугачёва', 'ул. Лазо'] },
  { id: 'zaton',   name: 'Затон',             x: 196, y: 728, rent: [1000, 1650], solv: [280, 360], traffic: [2800, 6000], prodRent: [450, 650],
    streets: ['ул. Лесозаводская', 'ул. Судоремонтная', 'ул. Корабельная', 'ул. Кулибина'] },
  { id: 'dema',    name: 'Дёма',              x: 108, y: 902, rent: [1100, 1800], solv: [300, 400], traffic: [3200, 6800], prodRent: [480, 700],
    streets: ['ул. Правды', 'ул. Ухтомского', 'ул. Дагестанская', 'ул. Таллинская', 'ул. Левитана'] },
];
BK.CENTER_POINT = { x: 362, y: 800 };

/* Реки и декор карты (полилинии в координатах карты) */
BK.MAP = {
  belaya: [[140, 0], [250, 150], [322, 300], [338, 420], [322, 560], [296, 650], [286, 740], [268, 830], [232, 900], [262, 960], [360, 986], [444, 994], [560, 1000], [640, 1010]],
  ufa:    [[760, -10], [792, 100], [800, 240], [790, 380], [782, 520], [772, 650], [724, 778], [624, 872], [522, 948], [444, 994]],
  dema:   [[-10, 1000], [80, 962], [160, 930], [234, 902]],
  rail:   [[-10, 540], [200, 575], [382, 605], [470, 520], [540, 400], [640, 230], [700, 110], [740, -10]],
  station: { x: 382, y: 605, name: 'Ж/д вокзал' },
  city: [[60, 820], [110, 700], [226, 640], [300, 470], [330, 280], [430, 180], [560, 190], [700, 60], [900, 34], [968, 170], [912, 300], [830, 430], [810, 600], [770, 770], [650, 900], [490, 980], [300, 1000], [80, 1000], [24, 930]],
  labels: [ { x: 250, y: 360, text: 'р. Белая', rot: 62 }, { x: 812, y: 560, text: 'р. Уфа', rot: 84 }, { x: 70, y: 975, text: 'р. Дёма', rot: -18 } ],
  parks: [ { x: 470, y: 760, r: 26, name: 'Лесопарк' }, { x: 520, y: 690, r: 16, name: 'Кашкадан' }, { x: 668, y: 505, r: 20, name: 'Парк Победы' } ],
};

/* Соседство: множители трафика, платёжеспособности и аренды. wk — насколько поток падает в выходные (<1) или растёт (>1). */
BK.LANDMARKS = [
  { id: 'school',  name: 'Школа',              tr: 1.10, solv: 0.78, rent: 0.95, wk: 0.6 },
  { id: 'uni',     name: 'Университет',        tr: 1.30, solv: 0.86, rent: 1.00, wk: 0.55 },
  { id: 'bc',      name: 'Бизнес-центр',       tr: 1.15, solv: 1.35, rent: 1.25, wk: 0.45 },
  { id: 'mall',    name: 'ТЦ',                 tr: 1.40, solv: 1.08, rent: 1.30, wk: 1.35 },
  { id: 'station', name: 'Остановка / вокзал', tr: 1.50, solv: 0.90, rent: 1.10, wk: 0.9 },
  { id: 'lux',     name: 'ЖК бизнес-класса',   tr: 0.90, solv: 1.30, rent: 1.15, wk: 1.1 },
  { id: 'market',  name: 'Рынок',              tr: 1.30, solv: 0.85, rent: 0.95, wk: 1.3 },
  { id: 'clinic',  name: 'Поликлиника',        tr: 1.20, solv: 0.95, rent: 1.00, wk: 0.5 },
  { id: 'park',    name: 'Парк',               tr: 1.05, solv: 1.08, rent: 1.00, wk: 1.5, summer: 1.3 },
  { id: 'sleep',   name: 'Спальный массив',    tr: 1.00, solv: 1.00, rent: 0.92, wk: 1.1 },
  { id: 'theatre', name: 'Театр / музей',      tr: 1.05, solv: 1.20, rent: 1.10, wk: 1.3 },
  { id: 'fitness', name: 'Фитнес-клуб',        tr: 0.95, solv: 1.15, rent: 1.00, wk: 1.0, healthy: 1.2 },
];

BK.CATEGORIES = {
  bread:     { name: 'Хлеб',                 color: '#b07a3a' },
  laminated: { name: 'Слоёное',              color: '#d4a13b' },
  sweet:     { name: 'Сладкая выпечка',      color: '#c8664b' },
  pies:      { name: 'Пироги и пирожки',     color: '#9c6b3f' },
  national:  { name: 'Башкирская и татарская', color: '#3f8a7a' },
  desserts:  { name: 'Десерты',              color: '#b85a8a' },
  drinks:    { name: 'Напитки',              color: '#5b6fb5' },
  breakfast: { name: 'Завтраки',             color: '#7a9a3a' },
  healthy:   { name: 'ЗОЖ',                  color: '#4f9a5a' },
};

/* Каталог продуктов. price — рекомендованная цена 2027 (₽), fc — фудкост при этой цене, pop — базовая популярность, req — нужное оборудование */
BK.PRODUCTS = [
  { id: 'bread_wheat', name: 'Хлеб «Уфимский» пшеничный', cat: 'bread', price: 75, fc: 0.26, pop: 55 },
  { id: 'borodinsky', name: 'Бородинский', cat: 'bread', price: 85, fc: 0.28, pop: 50 },
  { id: 'baguette', name: 'Багет', cat: 'bread', price: 95, fc: 0.24, pop: 55 },
  { id: 'sourdough', name: 'Хлеб на закваске', cat: 'bread', price: 220, fc: 0.22, pop: 62, req: 'hearth' },
  { id: 'ciabatta', name: 'Чиабатта', cat: 'bread', price: 120, fc: 0.23, pop: 55 },
  { id: 'rye_seeds', name: 'Ржаной с семечками', cat: 'bread', price: 110, fc: 0.27, pop: 45 },
  { id: 'focaccia', name: 'Фокачча с томатами', cat: 'bread', price: 190, fc: 0.30, pop: 55, req: 'hearth' },
  { id: 'croissant', name: 'Круассан классический', cat: 'laminated', price: 150, fc: 0.30, pop: 72, req: 'laminator' },
  { id: 'croissant_almond', name: 'Миндальный круассан', cat: 'laminated', price: 240, fc: 0.34, pop: 70, req: 'laminator' },
  { id: 'pain_choc', name: 'Пан-о-шоколя', cat: 'laminated', price: 190, fc: 0.33, pop: 65, req: 'laminator' },
  { id: 'danish', name: 'Слойка с вишней', cat: 'laminated', price: 130, fc: 0.29, pop: 58, req: 'laminator' },
  { id: 'ham_puff', name: 'Слойка с ветчиной и сыром', cat: 'laminated', price: 160, fc: 0.33, pop: 58, req: 'laminator' },
  { id: 'cinnamon', name: 'Булочка с корицей', cat: 'sweet', price: 110, fc: 0.25, pop: 66 },
  { id: 'poppy', name: 'Рулет с маком', cat: 'sweet', price: 140, fc: 0.27, pop: 46 },
  { id: 'vatrushka', name: 'Ватрушка с творогом', cat: 'sweet', price: 95, fc: 0.30, pop: 55 },
  { id: 'cardamom', name: 'Кардамоновая булочка', cat: 'sweet', price: 160, fc: 0.26, pop: 60 },
  { id: 'honey_bun', name: 'Булочка с башкирским мёдом', cat: 'sweet', price: 130, fc: 0.31, pop: 62 },
  { id: 'donut', name: 'Пончик', cat: 'sweet', price: 90, fc: 0.28, pop: 56 },
  { id: 'pie_potato', name: 'Пирожок с картофелем', cat: 'pies', price: 65, fc: 0.26, pop: 55 },
  { id: 'pie_cabbage', name: 'Пирожок с капустой', cat: 'pies', price: 65, fc: 0.25, pop: 45 },
  { id: 'pie_meat', name: 'Пирожок с мясом', cat: 'pies', price: 95, fc: 0.38, pop: 60 },
  { id: 'kurnik', name: 'Курник', cat: 'pies', price: 220, fc: 0.36, pop: 46 },
  { id: 'pie_berry', name: 'Ягодный пирог', cat: 'pies', price: 150, fc: 0.30, pop: 55 },
  { id: 'osetian', name: 'Осетинский пирог с сыром', cat: 'pies', price: 380, fc: 0.33, pop: 50 },
  { id: 'echpochmak', name: 'Эчпочмак', cat: 'national', price: 120, fc: 0.38, pop: 72 },
  { id: 'belish', name: 'Бэлиш', cat: 'national', price: 480, fc: 0.37, pop: 50 },
  { id: 'chakchak', name: 'Чак-чак с мёдом', cat: 'national', price: 260, fc: 0.30, pop: 56 },
  { id: 'kystyby', name: 'Кыстыбый', cat: 'national', price: 90, fc: 0.24, pop: 56 },
  { id: 'gubadiya', name: 'Губадия', cat: 'national', price: 220, fc: 0.35, pop: 50 },
  { id: 'baursak', name: 'Баурсаки', cat: 'national', price: 120, fc: 0.22, pop: 46 },
  { id: 'samsa', name: 'Самса слоёная', cat: 'national', price: 150, fc: 0.34, pop: 65, req: 'laminator' },
  { id: 'eclair', name: 'Эклер', cat: 'desserts', price: 170, fc: 0.30, pop: 60, req: 'confect' },
  { id: 'napoleon', name: 'Наполеон', cat: 'desserts', price: 250, fc: 0.28, pop: 60, req: 'confect' },
  { id: 'medovik', name: 'Медовик', cat: 'desserts', price: 260, fc: 0.29, pop: 66, req: 'confect' },
  { id: 'cheesecake', name: 'Чизкейк', cat: 'desserts', price: 320, fc: 0.33, pop: 60, req: 'confect' },
  { id: 'macaron', name: 'Макарон', cat: 'desserts', price: 120, fc: 0.25, pop: 55, req: 'confect' },
  { id: 'trifle', name: 'Трайфл', cat: 'desserts', price: 290, fc: 0.31, pop: 55, req: 'confect' },
  { id: 'americano', name: 'Американо', cat: 'drinks', price: 150, fc: 0.12, pop: 60 },
  { id: 'cappuccino', name: 'Капучино', cat: 'drinks', price: 220, fc: 0.16, pop: 70 },
  { id: 'raf', name: 'Лавандовый раф', cat: 'drinks', price: 290, fc: 0.17, pop: 60 },
  { id: 'tea_thyme', name: 'Чай с чабрецом', cat: 'drinks', price: 120, fc: 0.07, pop: 46 },
  { id: 'cocoa', name: 'Какао', cat: 'drinks', price: 190, fc: 0.20, pop: 50 },
  { id: 'kumis', name: 'Кумыс', cat: 'drinks', price: 160, fc: 0.40, pop: 36 },
  { id: 'lemonade', name: 'Облепиховый лимонад', cat: 'drinks', price: 210, fc: 0.18, pop: 50 },
  { id: 'syrniki', name: 'Сырники', cat: 'breakfast', price: 290, fc: 0.33, pop: 60 },
  { id: 'sandwich', name: 'Сэндвич с курицей', cat: 'breakfast', price: 290, fc: 0.38, pop: 60 },
  { id: 'salmon_croissant', name: 'Круассан с лососем', cat: 'breakfast', price: 420, fc: 0.42, pop: 56, req: 'laminator' },
  { id: 'porridge', name: 'Каша на кокосовом молоке', cat: 'breakfast', price: 250, fc: 0.25, pop: 45 },
  { id: 'quiche', name: 'Киш с брокколи', cat: 'breakfast', price: 280, fc: 0.34, pop: 50, req: 'hearth' },
  { id: 'wholegrain', name: 'Цельнозерновой хлеб', cat: 'healthy', price: 160, fc: 0.25, pop: 50 },
  { id: 'glutenfree', name: 'Безглютеновый хлеб', cat: 'healthy', price: 280, fc: 0.33, pop: 40 },
  { id: 'protein_bar', name: 'Протеиновый батончик', cat: 'healthy', price: 190, fc: 0.30, pop: 45 },
  { id: 'chia', name: 'Пудинг чиа', cat: 'healthy', price: 260, fc: 0.30, pop: 45, req: 'confect' },
  { id: 'sugarless', name: 'Выпечка без сахара', cat: 'healthy', price: 180, fc: 0.28, pop: 45 },
];
BK.START_MENU = ['bread_wheat', 'borodinsky', 'cinnamon', 'pie_potato', 'echpochmak', 'americano', 'tea_thyme'];

/* Оборудование производства. cap — +мощность изделий/день, fc — снижение фудкоста (доля), del — снижение доставки, max — сколько можно купить */
BK.EQUIPMENT = [
  { id: 'mixer',     name: 'Спиральный тестомес',        price: 900000,   cap: 600,  fc: 0.01, max: 3, desc: 'Замес быстрее и ровнее' },
  { id: 'rotary',    name: 'Ротационная печь',           price: 2400000,  cap: 1500, fc: 0,    max: 3, desc: 'Главная печь цеха' },
  { id: 'proofer',   name: 'Расстоечный шкаф',           price: 700000,   cap: 400,  fc: 0.01, max: 2, desc: 'Стабильная расстойка — меньше брака' },
  { id: 'divider',   name: 'Тестоделитель-округлитель',  price: 1600000,  cap: 800,  fc: 0.02, max: 2, desc: 'Точная развеска' },
  { id: 'laminator', name: 'Тестораскаточная машина',    price: 1800000,  cap: 500,  fc: 0,    max: 1, desc: 'Открывает слоёное тесто и круассаны', unlock: 'laminator' },
  { id: 'shock',     name: 'Шоковая заморозка',          price: 2200000,  cap: 300,  fc: 0.04, max: 1, desc: 'Меньше списаний, выпечка «с пылу»' },
  { id: 'cold',      name: 'Холодильная камера',         price: 800000,   cap: 0,    fc: 0.02, max: 1, desc: 'Сырьё хранится дольше' },
  { id: 'hearth',    name: 'Подовая каменная печь',      price: 3500000,  cap: 800,  fc: 0,    max: 1, desc: 'Хлеб на закваске, фокачча, киш', unlock: 'hearth' },
  { id: 'confect',   name: 'Кондитерский цех',           price: 4000000,  cap: 600,  fc: 0,    max: 1, desc: 'Торты и десерты', unlock: 'confect' },
  { id: 'line',      name: 'Автоматическая линия',       price: 12000000, cap: 4000, fc: 0.03, max: 2, desc: 'Промышленный объём' },
  { id: 'fleet',     name: 'Автопарк-рефрижераторы',     price: 3000000,  cap: 0,    fc: 0.01, del: 0.25, max: 1, desc: 'Своя доставка дешевле на 25%' },
  { id: 'erp',       name: 'Планирование выпуска (ERP)', price: 1500000,  cap: 0,    fc: 0.03, max: 1, desc: 'Прогноз спроса — меньше остатков' },
];

BK.NAMES_M = ['Азат', 'Руслан', 'Тимур', 'Айдар', 'Ильдар', 'Артём', 'Денис', 'Максим', 'Салават', 'Ринат', 'Марат', 'Никита', 'Егор', 'Булат', 'Иван', 'Кирилл', 'Радик', 'Олег', 'Альберт', 'Данияр', 'Роберт', 'Игорь', 'Эмиль', 'Ильнур', 'Павел'];
BK.NAMES_F = ['Айгуль', 'Лилия', 'Гульнара', 'Анна', 'Алина', 'Элина', 'Регина', 'Дарья', 'Зарина', 'Мария', 'Камила', 'Ольга', 'Диляра', 'Екатерина', 'Резеда', 'Юлия', 'Альфия', 'Ксения', 'Лейсан', 'Софья', 'Гузель', 'Виктория', 'Эльвира', 'Наталья', 'Айсылу'];
BK.SURNAMES = ['Хабибуллин', 'Галиев', 'Иванов', 'Сафин', 'Ахмадуллин', 'Кузнецов', 'Исмагилов', 'Валеев', 'Смирнов', 'Шарипов', 'Юсупов', 'Попов', 'Гарипов', 'Мухаметов', 'Николаев', 'Зиннатуллин', 'Байбурин', 'Фёдоров', 'Каримов', 'Садыков', 'Латыпов', 'Морозов', 'Нуриев', 'Хасанов'];
BK.STAFF_LVL_NAMES = ['', 'Стажёр', 'Продавец', 'Бариста-профи', 'Мастер сервиса', 'Наставник'];

/* Привязка сезонных событий к месяцам (0 = январь) */
BK.EVENT_MONTHS = {
  e033: [11, 0, 1], e034: [11, 0, 1, 2], e035: [5, 6, 7], e036: [3, 4], e037: [3, 4], e038: [10, 11, 2, 3],
  e041: [5, 6, 7], e071: [5], e072: [5, 6, 7], e091: [3, 4], e095: [11], e096: [4, 5, 8],
};
