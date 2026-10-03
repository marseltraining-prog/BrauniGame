/* =====================================================================
   ГЕРОИ В ПИКСЕЛЯХ (BK.Px.CAST): фигуры для сцен (16×30) и портреты 48×48 (поле .p) — Рашид, Гуля, Олег, Эльвира,
   мама Фания, бабушка Сания, Семён Аркадьевич, Дамир, герой-бариста; гости очереди (GUESTS — 10 обликов, по индексу
   эмодзи-лица в «Смене»); продавцы и курьер «живой точки». Готовые спрайты — через Px.fig / Px.face (кэш).
   Проба и палитры — docs/mockups/pixel/cast.js, 4-portraits.html.
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
  // кэшированные спрайты: в ключе — «поколение» облика героя (heroSet), иначе после смены пола
  // Px.memo отдал бы готовый спрайт прежнего героя
  function fig(who, opt = {}) {
    const sp = typeof who === 'string' ? CAST[who] : who;
    const key = 'f|' + (typeof who === 'string' ? who : (who.__k || (who.__k = Math.random().toString(36).slice(2)))) + '|' + heroGen + '|' + [opt.view, opt.emo, opt.pose, opt.step, opt.upper, opt.drop, opt.body].join(',');
    return Px.memo(key, () => Px.figure(sp, opt));
  }
  function face(who, emo) { return Px.memo('p|' + who + '|' + heroGen + '|' + (emo || 'neutral'), () => Px.portrait(CAST[who].p, emo || 'neutral')); }
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
      const [who, emo] = cv.dataset.pxp.split(':'); if (!CAST[who]) return;
      face(who, emo).toCanvas(cv); done(cv, cv.dataset.pxp);
    });
    root.querySelectorAll('canvas[data-pxi]').forEach((cv) => {
      if (cv.dataset.pxDone === cv.dataset.pxi) return;
      const n = cv.dataset.pxi; Px.memo('ii|' + n, () => { const b = new Px.Buf(9, 9); Px.icon(b, 1, 1, n); return b; }).toCanvas(cv); cv.dataset.pxDone = n;
    });
  }
  const portraitTag = (who, emo, cls) => `<canvas class="pxp ${cls || ''}" data-pxp="${who}:${emo || 'neutral'}" width="48" height="48" aria-hidden="true"></canvas>`;
  const iconTag = (name, cls) => `<canvas class="pxi ${cls || ''}" data-pxi="${name}" width="9" height="9" aria-hidden="true"></canvas>`;
  Object.assign(Px, { CAST, GUESTS, STAFF, HAIR, fig, face, hydrate, portraitTag, iconTag, heroSet, heroG });
})();
