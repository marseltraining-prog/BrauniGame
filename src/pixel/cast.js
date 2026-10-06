/* =====================================================================
   ГЕРОИ В ПИКСЕЛЯХ (BK.Px.CAST): фигуры для сцен (16×30) и портреты 48×48 (поле .p) — Рашид, Гуля, Олег, Эльвира,
   мама Фания, бабушка Сания, Семён Аркадьевич, Дамир, герой-бариста; гости очереди (GUESTS — 10 обликов, по индексу
   эмодзи-лица в «Смене»); продавцы и курьер «живой точки». Готовые спрайты — через Px.fig / Px.face (кэш).
   Проба и палитры — docs/mockups/pixel/cast.js, 4-portraits.html.
   Городские портреты: вне Уфы у героя с местным именем (BK.STORY_CAST) — свой вариант облика
   (Px.cityKey → ключ «город.роль» в data-pxp и в кэше, Px.castVariant); Уфа побайтно прежняя.
   Подробно — блок «городские портреты» ниже, проверка — node qa/city-portraits.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px;
  const HAIR = {
    hero: ['#4a3024', '#2f1d17', '#7a5238'], heroOld: ['#8a8078', '#645a54', '#b0a8a0'],
    grey: ['#c9c4bc', '#9a948c', '#eeeae2'], dark: ['#3a2622', '#22161a', '#5e4034'], black: ['#241c24', '#141018', '#46384a'],
    auburn: ['#8a4a2e', '#62311e', '#b8703f'], blond: ['#d8b36a', '#a8803e', '#f0d898'], chest: ['#6a4028', '#4a2a1a', '#8e5a38'],
    red: ['#b8562a', '#8a3a1a', '#e08048'], white: ['#e8e4dc', '#bdb7ae', '#ffffff'],
  };
  // платок бабушки: светлый хлопок, красные цветы, бордовая кайма (раньше читался как рыжие волосы)
  const SCARF = ['#efe3c8', '#d2c09c', '#e3b341', '#c0412d', '#8a2f3a'];
  /* Герой: четыре облика — мужчина/женщина, молодой/постаревший (PLAN.md §8.1, выбор игрока).
     Облик подменяет сам Px.CAST.hero / heroOld (Px.heroSet), поэтому все готовые сцены — «Калач»
     (scenes.js), кофейня (coffee.js), финал «Своя точка», портреты — рисуют выбранного героя без правок:
     они спрашивают Px.fig('hero') / Px.face('hero'). Рост, позы и одежда у вариантов одинаковые —
     отличаются причёска, цвет волос, фартук и лицо (плюс очки в возрасте, как было). */
  const HERO_M = { name: 'Герой-бариста', skin: 0, hair: HAIR.hero, hairStyle: 'messy', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#2e4570', '#1f3052'], shoes: ['#3a2a2a', '#241a1a'],
    p: { skin: 0, hair: HAIR.hero, hairStyle: 'messy', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], bg: ['#f4dfc2', '#ecd0aa'] } };
  const HERO_F = { name: 'Героиня-бариста', skin: 0, hair: HAIR.auburn, hairStyle: 'bob', top: ['#f5efe3', '#d6ccb9'], apron: ['#3b8796', '#235f6b'], pants: ['#2e4570', '#1f3052'], shoes: ['#3a2a2a', '#241a1a'],
    p: { skin: 0, hair: HAIR.auburn, hairStyle: 'bob', top: ['#f5efe3', '#d6ccb9'], apron: ['#3b8796', '#235f6b'], lashes: 1, lips: '#b0503f', bg: ['#f4dfc2', '#ecd0aa'] } };
  const HERO_OLD_M = Object.assign({}, HERO_M, { hair: HAIR.heroOld, hairStyle: 'neat', p: Object.assign({}, HERO_M.p, { hair: HAIR.heroOld, hairStyle: 'neat', age: 2, bg: ['#e6dccb', '#d6c8b0'] }) });
  const HERO_OLD_F = Object.assign({}, HERO_F, { hair: HAIR.grey, hairStyle: 'bun', p: Object.assign({}, HERO_F.p, { hair: HAIR.grey, hairStyle: 'bun', age: 2, bg: ['#e6dccb', '#d6c8b0'] }) });
  const CAST = {
    hero: HERO_M, heroOld: HERO_OLD_M, heroF: HERO_F, heroOldF: HERO_OLD_F,
    rashid: { name: 'Рашид Хайруллин', skin: 1, hair: HAIR.grey, hairStyle: 'baker', hat: ['#fbf6ec', '#d9d0c0', '#ffffff'], top: ['#f5efe3', '#d6ccb9'], apron: ['#6b4a2e', '#4a3220'], pants: ['#4a4a55', '#35353e'], shoes: ['#3a2a2a', '#241a1a'], mustache: '#b8b2aa', brows: true,
      p: { skin: 1, hair: HAIR.grey, hairStyle: 'baker', hat: ['#fbf6ec', '#d9d0c0', '#ffffff'], top: ['#f5efe3', '#d6ccb9'], apron: ['#6b4a2e', '#4a3220'], mustache: '#bdb6ad', brows: true, browc: '#8f8980', age: 1, bg: ['#efe3cf', '#e2d2b8'] } },
    gulya: { name: 'Гуля Сафина', skin: 0, hair: HAIR.dark, hairStyle: 'bandana', hat: ['#c0412d', '#8f2c20', '#e2705a', '#f5efe3'], top: ['#f5efe3', '#d6ccb9'], apron: ['#3f7d5a', '#2d5e44'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'],
      p: { skin: 0, hair: HAIR.dark, hairStyle: 'bandana', hat: ['#c0412d', '#8f2c20', '#e2705a', '#f5efe3'], top: ['#f5efe3', '#d6ccb9'], apron: ['#3f7d5a', '#2d5e44'], eyec: '#4a2a18', lips: '#b0503f', lashes: 1, bg: ['#e3efe4', '#cfe3d4'] } },
    oleg: { name: 'Олег Кравцов', skin: 0, hair: HAIR.dark, hairStyle: 'neat', top: ['#6b6a73', '#4f4e57', '#8f8d94'], coat: true, pants: ['#2a2a33', '#1c1c24'], shoes: ['#1c1418', '#100c10'], beard: '#3a2622',
      p: { skin: 0, hair: ['#3b2e2a', '#241a18', '#5a4640'], hairStyle: 'neat', top: ['#6b6a73', '#4f4e57'], collar: 'shirt', tie: '#3b4a6b', beard: ['#5a4640', 0.22], eyec: '#3a4a5a', bg: ['#e7dfee', '#d8cce4'] } },
    elvira: { name: 'Эльвира Ахметова', skin: 0, hair: HAIR.black, hairStyle: 'bob', top: ['#2e4570', '#1f3052'], pants: ['#1f3052', '#15223c'], shoes: ['#1c1418', '#100c10'],
      p: { skin: 0, hair: HAIR.black, hairStyle: 'bob', top: ['#2e4570', '#1f3052'], collar: 'shirt', tie: '#f5efe3', earring: '#e3b341', lips: '#b04a4a', lashes: 1, bg: ['#dbe7ee', '#c6d8e4'] } },
    mama: { name: 'Мама Фания', skin: 0, hair: HAIR.auburn, hairStyle: 'bun', top: ['#7d5a8e', '#5c3f6d'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'], body: 'dress',
      p: { skin: 0, hair: HAIR.auburn, hairStyle: 'bun', top: ['#7d5a8e', '#5c3f6d'], collar: 'v', age: 1, lips: '#a8504a', lashes: 1, bg: ['#ece2f0', '#dccde4'] } },
    sania: { name: 'Бабушка Сания', skin: 1, hair: HAIR.white, hairStyle: 'scarf', hat: SCARF, top: ['#3f6b5a', '#2d4e42'], pants: ['#3f6b5a', '#2d4e42'], shoes: ['#3a2a2a', '#241a1a'], body: 'dress',
      p: { skin: 1, hair: HAIR.white, hairStyle: 'scarf', hat: SCARF, top: ['#3f6b5a', '#2d4e42'], age: 2, blush: true, eyec: '#4a2a18', bg: ['#f3e6c4', '#e8d4a4'] } },
    semyon: { name: 'Семён Аркадьевич', skin: 0, hair: HAIR.grey, hairStyle: 'bald', top: ['#8a6a4a', '#6a4e36'], pants: ['#5a5a66', '#40404a'], shoes: ['#3a2a2a', '#241a1a'], glasses: '#6a5050',
      p: { skin: 0, hair: HAIR.grey, hairStyle: 'bald', top: ['#8a6a4a', '#6a4e36'], collar: 'shirt', tie: '#8f2c20', glasses: '#2a1a1c', age: 1, beard: ['#c9c4bc', 0.3], bg: ['#efe6d6', '#e2d4bc'] } },
    damir: { name: 'Дамир', skin: 1, hair: HAIR.black, hairStyle: 'cap', hat: ['#2f8a57', '#1f6a40', '#5ab884', '#1c1418'], top: ['#e3b341', '#b88a24'], pants: ['#2e4570', '#1f3052'], shoes: ['#f5efe3', '#d6ccb9'],
      p: { skin: 1, hair: HAIR.black, hairStyle: 'short', top: ['#e3b341', '#b88a24'], collar: 'hood', eyec: '#2a1a14', bg: ['#e9f0dc', '#d6e4c2'] } },
    courier: { skin: 2, hair: HAIR.black, hairStyle: 'cap', hat: ['#2f8a57', '#1f6a40', '#5ab884', '#1c1418'], top: ['#2f8a57', '#1f6a40'], pants: ['#2a2a33', '#1c1c24'], shoes: ['#1c1418', '#100c10'] },
    // врач из заставки тяжёлого момента (BK.Moment): новых примитивов не понадобилось —
    // седые волосы, халат (body 'coat'), очки и усталое лицо из тех же частей, что у Семёна и Рашида.
    // Никаких «медицинских» атрибутов: ни креста, ни халата до пола с капельницей — только человек в дверях.
    doctor: { name: 'Врач', skin: 1, hair: HAIR.grey, hairStyle: 'short', coat: true, top: ['#eef0f2', '#c9ced4', '#ffffff'], pants: ['#3f4a56', '#2c343c'], shoes: ['#22242a', '#14161a'], glasses: '#4a5560',
      p: { skin: 1, hair: HAIR.grey, hairStyle: 'short', top: ['#eef0f2', '#c9ced4'], collar: 'shirt', glasses: '#3a444e', age: 1, browc: '#8f8980', bg: ['#e2e8ec', '#cbd6dd'] } },
  };
  // герой через 15 лет — седина, морщины (финал «Жизнь в найме»); у женщины — пучок
  CAST.heroOld = HERO_OLD_M;
  CAST.heroOldF = HERO_OLD_F;
  /* Облик героя выбирает игрок (PLAN.md §8.1): 'm' — мужчина, 'f' — женщина, null — как раньше
     (старые сохранения и боты: облик выбирался по названию сети, игра об этом не спрашивала).
     heroSet идемпотентен; при смене облика «поколение» кэша растёт, иначе Px.memo вернул бы
     готовый спрайт прежнего героя. */
  let heroGen = 0;
  function heroSet(g) {
    const want = g === 'f' ? 'f' : g === 'm' ? 'm' : null;
    if (CAST.__heroG === want) return want;
    CAST.__heroG = want; heroGen++;
    CAST.hero = want === 'f' ? HERO_F : HERO_M;
    CAST.heroOld = want === 'f' ? HERO_OLD_F : HERO_OLD_M;
    return want;
  }
  const heroG = () => CAST.__heroG || null;
  // гости очереди: по индексу эмодзи-лица «Смены» ['🧔','👩','👨‍🦳','👧','🧑‍💼','👵','🧑‍🎓','👩‍🦰','👨','👱‍♀️']
  const GUESTS = [
    { skin: 0, hair: HAIR.chest, hairStyle: 'short', top: ['#3f7d5a', '#2d5e44'], pants: ['#4a4a55', '#35353e'], shoes: ['#3a2a2a', '#241a1a'], beard: '#6a4028' },
    { skin: 0, hair: HAIR.dark, hairStyle: 'long', top: ['#c0412d', '#8f2c20'], pants: ['#2e4570', '#1f3052'], shoes: ['#6b4a2e', '#4a3220'], body: 'dress' },
    { skin: 1, hair: HAIR.grey, hairStyle: 'short', top: ['#6b6a73', '#4f4e57'], pants: ['#2a2a33', '#1c1c24'], shoes: ['#1c1418', '#100c10'], coat: true },
    { skin: 0, hair: HAIR.blond, hairStyle: 'bun', top: ['#e2705a', '#c0412d'], pants: ['#3b8796', '#235f6b'], shoes: ['#f5efe3', '#d6ccb9'] },
    { skin: 2, hair: HAIR.black, hairStyle: 'neat', top: ['#2e4570', '#1f3052'], pants: ['#2a2a33', '#1c1c24'], shoes: ['#1c1418', '#100c10'] },
    { skin: 0, hair: HAIR.white, hairStyle: 'scarf', hat: ['#7d5a8e', '#5c3f6d', '#e3b341', '#e3b341', '#4a2e5a'], top: ['#8a6a4a', '#6a4e36'], pants: ['#8a6a4a', '#6a4e36'], shoes: ['#3a2a2a', '#241a1a'], body: 'dress' },
    { skin: 1, hair: HAIR.black, hairStyle: 'beanie', hat: ['#3b8796', '#235f6b', '#6cc0cf'], top: ['#7d5a8e', '#5c3f6d'], pants: ['#4a4a55', '#35353e'], shoes: ['#3a2a2a', '#241a1a'] },
    { skin: 0, hair: HAIR.red, hairStyle: 'curly', top: ['#3f7d5a', '#2d5e44'], pants: ['#2a2a33', '#1c1c24'], shoes: ['#6b4a2e', '#4a3220'] },
    { skin: 1, hair: HAIR.dark, hairStyle: 'messy', top: ['#e3b341', '#b88a24'], pants: ['#2e4570', '#1f3052'], shoes: ['#f5efe3', '#d6ccb9'] },
    { skin: 0, hair: HAIR.blond, hairStyle: 'bob', top: ['#a4d3e6', '#6fa8c4'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'] },
  ];
  // продавцы «живой точки» — в фирменном фартуке, разные причёски
  const STAFF = [
    { skin: 0, hair: HAIR.dark, hairStyle: 'bandana', hat: ['#c46f17', '#94500b', '#e59a3e', '#f5efe3'], top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#3a3a48', '#282833'], shoes: ['#3a2a2a', '#241a1a'] },
    { skin: 1, hair: HAIR.black, hairStyle: 'short', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#3a3a48', '#282833'], shoes: ['#3a2a2a', '#241a1a'] },
    { skin: 0, hair: HAIR.auburn, hairStyle: 'bun', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#3a3a48', '#282833'], shoes: ['#3a2a2a', '#241a1a'] },
    { skin: 2, hair: HAIR.chest, hairStyle: 'neat', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#3a3a48', '#282833'], shoes: ['#3a2a2a', '#241a1a'] },
  ];
  /* ---------- городские портреты (PLAN.md «Городские портреты») ----------
     Имена героев по городу партии даёт BK.STORY_CAST (src/data/story-cast.js); здесь им — свои лица.
     Если в городе партии у роли другой человек (не уфимское имя), портрет и фигура героя строятся
     из уфимского облика с другими чертами: тон кожи (три тона палитры), цвет и форма волос, глаза,
     очки, усы/борода у мужчин, у женщин — причёска, цвет косынки или (в татарских городах, иногда)
     однотонный платок. Одежда, фон и рабочие уборы (колпак наставника, косынка пекаря, кепка Дамира)
     остаются — по ним узнаётся роль. Черты выбираются детерминированно: хэш «город|роль|полное имя».
     Ключ варианта — «город.роль» (например kazan.mentor) — уходит третьим полем в data-pxp и в ключ
     кэша; для Уфы и для героев без городской замены (семья, сам герой, врач) ключа нет, поэтому
     разметка, кэш и пиксели побайтно прежние (проверка — node qa/city-portraits.js).
     Роль по умолчанию — PX_ROLE[ключ Px.CAST]; окно сюжета передаёт свою (Инна рисуется из облика
     Эльвиры, инспектор — из облика Семёна, но лица у них в городах свои). */
  const PX_ROLE = { rashid: 'mentor', gulya: 'colleague', oleg: 'rival', elvira: 'banker', semyon: 'chronicler', damir: 'damir' };
  // город партии: из открытой партии (как подписи сюжета — STORY_CAST.hero), без неё — как тексты пролога (cityIdNow)
  function castCity() {
    const C = BK.STORY_CAST; if (!C) return 'ufa';
    try { const S = BK.App && BK.App.state; return (S ? C.cityOf(S) : C.cityIdNow()) || 'ufa'; } catch (e) { return 'ufa'; }
  }
  // ключ варианта «город.роль» или '' (Уфа, нет замены, то же имя, что в Уфе)
  function cityKey(who, role) {
    const C = BK.STORY_CAST, sp = CAST[who];
    role = role || PX_ROLE[who];
    if (!C || !role || !sp || !sp.p || !C.personOf) return '';
    const city = castCity(); if (city === 'ufa') return '';
    const pp = C.personOf(city, role), u = C.personOf('ufa', role);
    if (!pp || (u && u.name === pp.name)) return '';
    return city + '.' + role;
  }
  const hashStr = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const prng = (seed) => { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const LIGHT_BROWN = ['#9a6a42', '#6e4a2c', '#c08e5e'], PEPPER = ['#6e6660', '#4a4440', '#9a928a'];
  const YOUNG_HAIR = [HAIR.dark, HAIR.black, HAIR.chest, HAIR.auburn, HAIR.blond, HAIR.hero, LIGHT_BROWN, HAIR.red];
  const OLD_HAIR = [HAIR.grey, HAIR.white, HAIR.heroOld, PEPPER];
  const EYES = ['#3a2418', '#4a2a18', '#2a1a14', '#3a4a5a', '#4a5a3a', '#5a4030'];
  const GLASSES = ['#2a1a1c', '#6a5050', '#3a444e', '#8a6a3a'];
  // косынка пекаря: [цвет, тень, блик, горошек]
  const BANDANAS = [['#3b6fa0', '#2a5078', '#6a9ccc', '#f5efe3'], ['#e3b341', '#b88a24', '#f2d27a', '#8f2c20'], ['#7d5a8e', '#5c3f6d', '#a888b8', '#f5efe3'], ['#2f8a57', '#1f6a40', '#5ab884', '#f5efe3'], ['#c46f17', '#94500b', '#e59a3e', '#f5efe3']];
  // однотонный платок: [ткань, тень, ткань, ткань, кайма] — цветы рисуются цветом ткани, т. е. не видны
  const SCARVES = [['#3b6fa0', '#2a5078', '#3b6fa0', '#3b6fa0', '#24456a'], ['#8f4a5a', '#6a3040', '#8f4a5a', '#8f4a5a', '#e3b341'], ['#e8dcc4', '#c9b998', '#e8dcc4', '#e8dcc4', '#3f6b5a'], ['#3f6b5a', '#2d4e42', '#3f6b5a', '#3f6b5a', '#e3b341']];
  const TATAR = { kazan: 1, chelny: 1, sterlitamak: 1 };
  const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  const pickW = (r, pairs) => { let x = r() * pairs.reduce((a, q) => a + q[1], 0); for (const q of pairs) { x -= q[1]; if (x < 0) return q[0]; } return pairs[pairs.length - 1][0]; };
  const VAR = {};
  function variant(who, vk) {
    const id = who + '@' + vk;
    if (VAR[id]) return VAR[id];
    const base = CAST[who], bp = base.p, dot = vk.indexOf('.');
    const city = vk.slice(0, dot), role = vk.slice(dot + 1);
    const pp = (BK.STORY_CAST && BK.STORY_CAST.personOf(city, role)) || { name: vk };
    const r = prng(hashStr(city + '|' + role + '|' + pp.name));
    const fem = !!bp.lashes, old = bp.hair === HAIR.grey || bp.hair === HAIR.white;
    const hat = bp.hairStyle === 'baker' || bp.hairStyle === 'bandana';
    const p = Object.assign({}, bp);
    p.skin = pickW(r, [[0, 0.45], [1, 0.43], [2, 0.12]]);
    const red = r() < 0.4;                                          // рыжие — реже остальных
    p.hair = pick(r, (old ? OLD_HAIR : YOUNG_HAIR).filter((h) => h !== bp.hair && (h !== HAIR.red || red)));
    p.eyec = pick(r, EYES);
    if (bp.hairStyle === 'bandana') p.hat = pick(r, BANDANAS);
    else if (!hat) {
      if (fem) p.hairStyle = TATAR[city] && r() < 0.35 ? 'scarf' : pick(r, ['bob', 'long', 'bun', 'curly']);
      else p.hairStyle = old ? pick(r, ['bald', 'short', 'neat']) : pick(r, ['short', 'neat', 'messy', 'curly']);
      if (p.hairStyle === 'scarf') p.hat = pick(r, SCARVES); else delete p.hat;
    }
    p.glasses = r() < (old ? 0.45 : 0.25) ? pick(r, GLASSES) : undefined;
    let facial = null;
    if (!fem) {
      facial = old ? pickW(r, [['none', 0.25], ['mustache', 0.3], ['beard', 0.3], ['both', 0.15]]) : pickW(r, [['none', 0.45], ['stubble', 0.3], ['beard', 0.15], ['mustache', 0.1]]);
      const fc = old ? p.hair[0] : p.hair[1];
      p.beard = facial === 'stubble' ? [fc, 0.22] : facial === 'beard' || facial === 'both' ? [fc, 0.85] : undefined;
      p.mustache = facial === 'mustache' || facial === 'both' ? p.hair[1] : undefined;
      p.brows = r() < 0.5;
    }
    if (old) p.browc = Px.mix ? Px.mix(p.hair[1], '#2a1a1c', 0.25) : p.hair[1];
    // заметная разница: хотя бы два видимых отличия от уфимского лица
    const seen = () => (p.skin !== (bp.skin || 0)) + (!hat && p.hairStyle !== bp.hairStyle) + (bp.hairStyle !== 'baker' && p.hair !== bp.hair) + (!!p.glasses !== !!bp.glasses) + (p.hat !== bp.hat) + (!fem && (!!p.beard !== !!bp.beard || !!p.mustache !== !!bp.mustache));
    if (seen() < 2) p.glasses = p.glasses ? undefined : pick(r, GLASSES);
    if (seen() < 2) p.skin = (bp.skin || 0) === 0 ? 1 : 0;
    // фигура сцен: те же черты; рабочий убор фигуры (кепка Дамира, колпак) остаётся
    const f = Object.assign({}, base, { p, skin: p.skin, hair: p.hair });
    if (base.hairStyle === bp.hairStyle) { f.hairStyle = p.hairStyle; f.hat = p.hat; }
    f.glasses = p.glasses ? (p.glasses === '#2a1a1c' ? '#6a5050' : p.glasses) : undefined;
    f.beard = p.beard ? p.beard[0] : undefined;
    f.mustache = p.mustache || undefined;
    f.brows = !!p.brows;
    f.__k = 'cv|' + id;
    return (VAR[id] = { p, f });
  }
  // кэшированные спрайты: в ключе — «поколение» облика героя (heroSet), иначе после смены пола
  // Px.memo отдал бы готовый спрайт прежнего героя. Городской вариант — отдельный ключ (cityKey).
  function fig(who, opt = {}) {
    const vk = typeof who === 'string' && PX_ROLE[who] ? cityKey(who) : '';
    const sp = vk ? variant(who, vk).f : typeof who === 'string' ? CAST[who] : who;
    const key = 'f|' + (typeof who === 'string' ? who + (vk ? '@' + vk : '') : (who.__k || (who.__k = Math.random().toString(36).slice(2)))) + '|' + heroGen + '|' + [opt.view, opt.emo, opt.pose, opt.step, opt.upper, opt.drop, opt.body].join(',');
    return Px.memo(key, () => Px.figure(sp, opt));
  }
  function face(who, emo, vk) {
    return Px.memo('p|' + who + '|' + heroGen + '|' + (emo || 'neutral') + (vk ? '|' + vk : ''), () => Px.portrait(vk ? variant(who, vk).p : CAST[who].p, emo || 'neutral'));
  }
  GUESTS.forEach((g, i) => { g.__k = 'g' + i; });
  STAFF.forEach((g, i) => { g.__k = 's' + i; });
  CAST.courier.__k = 'courier';
  // canvas-портреты в готовой разметке: <canvas data-pxp="rashid:angry" width="48" height="48">
  function hydrate(root) {
    if (!root) return;
    const done = (cv, tag) => { cv.dataset.pxDone = heroGen + ':' + tag; };
    root.querySelectorAll('canvas[data-pxp]').forEach((cv) => {
      const tag = heroGen + ':' + cv.dataset.pxp;
      if (cv.dataset.pxDone === tag) return;
      const [who, emo, vk] = cv.dataset.pxp.split(':'); if (!CAST[who]) return;
      face(who, emo, vk && vk.indexOf('.') > 0 ? vk : '').toCanvas(cv); done(cv, cv.dataset.pxp);
    });
    root.querySelectorAll('canvas[data-pxi]').forEach((cv) => {
      if (cv.dataset.pxDone === cv.dataset.pxi) return;
      const n = cv.dataset.pxi; Px.memo('ii|' + n, () => { const b = new Px.Buf(9, 9); Px.icon(b, 1, 1, n); return b; }).toCanvas(cv); cv.dataset.pxDone = n;
    });
  }
  // role — роль BK.STORY_CAST, если портрет говорящего взят из чужого облика (Инна → elvira); без неё — PX_ROLE[who]
  const portraitTag = (who, emo, cls, role) => { const vk = cityKey(who, role); return `<canvas class="pxp ${cls || ''}" data-pxp="${who}:${emo || 'neutral'}${vk ? ':' + vk : ''}" width="48" height="48" aria-hidden="true"></canvas>`; };
  const iconTag = (name, cls) => `<canvas class="pxi ${cls || ''}" data-pxi="${name}" width="9" height="9" aria-hidden="true"></canvas>`;
  Object.assign(Px, { CAST, GUESTS, STAFF, HAIR, fig, face, hydrate, portraitTag, iconTag, heroSet, heroG, cityKey, castVariant: variant, PX_ROLE });
})();
