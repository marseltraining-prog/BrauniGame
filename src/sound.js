/* =====================================================================
   ЗВУК «Хлебной карты» (vision-plan §4 п. 3, этап В2 «Живость»).
   Все звуки синтезируются кодом через WebAudio — файлов нет, сборка не растёт.
   Тихие по умолчанию (громкость ниже обычной), включаются кнопкой в HUD и в «Меню игры».

   Настройки игрока (localStorage):
     bk-ufa-sound        — общий выключатель ('0' — молчит всё, '1' — включено; нет записи — включено, но тихо);
     bk-ufa-sound-money  — «Касса и деньги» (выручка, монетки 1-го числа);
     bk-ufa-sound-notes  — «Уведомления» (открытие точки, вехи, достижения, предупреждения);
     bk-ufa-sound-ui     — «Интерфейс» (отклик на нажатия кнопок, вкладки, окна);
     bk-ufa-sound-music  — «Музыка» (тихая фоновая подложка, синтез; нет записи — включена).
   Старые записи читаются как раньше: нет ключа категории — категория включена.

   Фоновая музыка (BK.Sound.music(mood):
     — лёгкая романтичная 8-битная тема (чиптюн): ведущая партия — квадрат (square) через фильтр низких
       частот, бас — треугольник рисунком вальса «раз-два-три», мягкое арпеджио восьмыми и очень тихий
       «тик»-перкуссия (шум через полосовой фильтр). Никаких «пэдов» и «блеска» — они владельцу не нравились;
     — две разные темы: 'game' — фа мажор, 92 BPM, 3/4, петля 24 такта ≈ 47 с; 'prologue' — до мажор,
       84 BPM, 3/4, петля 24 такта ≈ 51 с, выше регистр, мягче тембр и тише. Форма A–A'–B с вариациями;
      — третья тема — 'victory', ПОБЕДНАЯ, и она не фон, а момент: ре мажор, 140 BPM, 4/4, 10 тактов
        ≈ 17 с, играется ОДИН раз от начала до конца (фанфарный подъём, кульминация и разрешение в
        тонику), после чего сама возвращает ту тему, что звучала до неё. Включается только по большим
        событиям: победа по обороту (S.won), «Федеральная сеть», победный финал истории и итоги
        победившей партии. Мелкие вехи, достижения и «ленточка» открытия точки остаются как были —
        владелец просил именно разницу между большим и мелким. Под открытым окном момент НЕ
        приглушается (это не подложка); выключатели «Музыка» и общий уважаются, как у фоновых тем;
     — три разные темы: 'game' — фа мажор, 92 BPM, 3/4, петля 24 такта ≈ 47 с; 'prologue' — до мажор,
       84 BPM, 3/4, петля 24 такта ≈ 51 с, выше регистр, мягче тембр и тише; 'sad' — ре минор, 63 BPM,
       3/4, петля 16 тактов ≈ 46 с: тема тяжёлого момента (заставка BK.Moment), без перкуссии, ниже и тише.
       Форма A–A'–B с вариациями (у 'sad' — A–B из восьмитактовых фраз);     — каждая нота — свой короткоживущий осциллятор: частота ставится до старта, огибающая только рампами
       (атака 24 мс, спад 90 мс), stop() — после нуля; выключение и скрытая вкладка — плавный спад шины;
       после шины стоит мягкий лимитер (DynamicsCompressor) от перегрузки;
     — включается после первого жеста игрока (arm()), молчит в скрытой вкладке (visibilitychange),
       тише под открытым окном (пауза не выключает музыку — она идёт фоном мира, см. отчет).

   Что звучит:
     coin    — касса: короткий «дзынь-дзынь» (мелкое поступление, продажа);
     money   — 1-е число: горсть монет и касса (итоги месяца);
     ribbon  — открытие точки/цеха: колокольчик с ленточкой;
     fanfare — веха (короткое задание выполнено);
     sparkle — достижение;
     warn    — предупреждение (негативное событие, проблема);
     bad     — банкротство/провал;
     click   — очень тихий отклик интерфейса (переключатели, мелкие касания);
     tap     — нажатие кнопки-действия (нанять, открыть точку, купить, ремонт…);
     deny    — неудача действия (не хватает денег и т. п.) — мягкий низкий тон;
     tab     — переключение вкладки;
     win     — открытие окна (и то же тише и ниже — закрытие).

   Требования к надёжности: модуль не должен ломать игру, если WebAudio нет (старый Safari, тесты, Node):
   всё в try/catch, `play` в таком случае просто ничего не делает. Звук не играет в скрытой вкладке.
   Отклик на нажатия подключается без правок интерфейса: `BK.Sound.tap(act)` зовётся из app.js,
   а действия переключателей категорий (`sndCat`) модуль добавляет в `BK.App.ACT` сам.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const KEY = 'bk-ufa-sound';
  const KEY_CAT = { money: 'bk-ufa-sound-money', notes: 'bk-ufa-sound-notes', ui: 'bk-ufa-sound-ui', music: 'bk-ufa-sound-music' };
  // категории: какие звуки к какой группе относятся (владелец: отдельно «касса», «уведомления», «интерфейс»)
  // music — своя категория без одноразовых звуков: у неё фоновая подложка (см. блок «фоновая музыка»)
  const CATS = {
    money: ['coin', 'money'],
    notes: ['ribbon', 'fanfare', 'sparkle', 'warn', 'bad'],
    ui: ['click', 'tap', 'deny', 'tab', 'win'],
    music: [],
  };
  const CAT_OF = {};
  Object.keys(CATS).forEach((c) => CATS[c].forEach((n) => { CAT_OF[n] = c; }));
  const CAT_NAME = { money: 'Касса и деньги', notes: 'Уведомления', ui: 'Интерфейс', music: 'Музыка' };
  // действия, у которых свои звуки или которым «щелчок» не нужен
  const NO_TAP = { tab: 1, sound: 1, sndSet: 1, sndCat: 1, closeModal: 1, continue: 1, theme: 1, help: 1, settings: 1, zoomIn: 1, zoomOut: 1, zoomReset: 1 };

  const MASTER = 0.16;              // «тихие по умолчанию»: общая громкость невелика
  // Шина одноразовых звуков. Замер (qa/crackle.js) показал, что эффекты были на ~20 дБ громче музыки:
  // пик музыки на выходе 0,0057, а пик нажатия — 0,069 (в 12 раз). Поэтому все рецепты идут не сразу
  // в master, а через свою шину: одним числом держим баланс «эффекты против музыки», характер звуков
  // остаётся прежним. 0,5 = −6 дБ — ровно та правка, что просил владелец («опусти эффекты на 3–6 дБ»).
  const SFX = 0.5;
  const RATE = 45;                  // мс: один и тот же звук не чаще раза в 45 мс (на ×10 иначе трещит; performance.now() — в миллисекундах)
  const SETTLE = 30;                // мс: отклик действия уже прозвучал — общий «щелчок» не повторяем
  let on = null, ctx = null, master = null, sfx = null, last = {}, cats = {}, fbAt = 0;
  let timeBase = 0;   // сдвиг времени для офлайн-замера: в живом контексте 0, в renderMix — момент события

  function stored() { try { const v = localStorage.getItem(KEY); return v == null ? null : v === '1'; } catch (e) { return null; } }
  function isOn() { if (on == null) on = stored(); return on !== false; } // нет записи — включено (тихо)
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (on) { resume(); musStart(); } else { musStop('now'); stopAll(); } // общий выключатель глушит и музыку
    syncBtns();
    return on;
  }
  function toggle() { return set(!isOn()); }

  // категория: нет ключа — включена (так читаются старые настройки), значение — без учёта общего выключателя
  function catVal(cat) {
    if (!KEY_CAT[cat]) return false;
    if (cats[cat] == null) {
      let v = null;
      try { v = localStorage.getItem(KEY_CAT[cat]); } catch (e) { v = null; }
      cats[cat] = v == null ? true : v === '1';
    }
    return cats[cat] !== false;
  }
  function catOn(cat) { return isOn() && catVal(cat); }
  function setCat(cat, v) {
    if (!KEY_CAT[cat]) return false;
    cats[cat] = !!v;
    try { localStorage.setItem(KEY_CAT[cat], v ? '1' : '0'); } catch (e) {}
    if (cat === 'music') { if (cats[cat]) musStart(); else musStop(); } // Music: включили — зазвучала, выключили — узлы остановлены
    syncBtns();
    return cats[cat];
  }
  function toggleCat(cat) { return setCat(cat, !catVal(cat)); }

  function ac() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
      sfx = null;                                  // шина эффектов создаётся лениво, на своём контексте
    } catch (e) { ctx = null; }
    return ctx;
  }
  // шина одноразовых эффектов: gain → master. Всё, что звучит «по нажатию», идёт сюда (см. SFX выше).
  function sfxBus() {
    const c = ac(); if (!c || !master) return null;
    if (!sfx) { sfx = c.createGain(); sfx.gain.value = SFX; sfx.connect(master); }
    return sfx;
  }
  function resume() { const c = ac(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  // общий выключатель: не «в ноль одним кадром», а короткий плавный спад шины — иначе слышен щелчок
  function stopAll() {
    if (!master || !ctx) return;
    try {
      const now = ctx.currentTime, cur = master.gain.value;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(cur, now);
      master.gain.linearRampToValueAtTime(0, now + 0.06);
      setTimeout(() => {
        if (!master || !ctx) return;
        try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(MASTER, ctx.currentTime); } catch (e) {}
      }, 220);
    } catch (e) {}
  }

  /* ---------- кирпичики синтеза ----------
     c и dest — необязательные контекст и приёмник: в игре это ctx и шина эффектов, в офлайн-замере
     (renderMix, qa/crackle.js) — свой OfflineAudioContext и его шины. Одни и те же рецепты и играются,
     и измеряются, поэтому «второго набора звуков для теста» нет. */
  // нота: осциллятор с огибающей. o: { f, f2, t (задержка), d (длина), type, vol, sweep, att }
  function tone(o, c, dest) {
    c = c || ac(); if (!c) return;
    dest = dest || sfxBus(); if (!dest) return;
    const t0 = c.currentTime + timeBase + (o.t || 0), d = o.d || 0.1;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(Math.max(20, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + d * (o.sweep || 1));
    const v = (o.vol == null ? 1 : o.vol), att = o.att || 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + d + 0.03);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }
  // шум (касса, «шшш» монет): короткий буфер с полосовым фильтром.
  // Раньше буфер начинался сразу с полной амплитуды (первый сэмпл — ступенька) и громкость ставилась
  // мгновенно: каждое «дзынь» щёлкало. Теперь в буфере мягкая атака 2 мс, громкость — короткой рампой.
  // Буферы кэшируются: на каждое нажатие новый кусок шума — лишняя работа ровно в тот момент, когда
  // главный поток и так занят перерисовкой (владелец: «трогаю кнопки — появляются хрусты»).
  const ncache = new WeakMap();   // контекст → { ключ: буфер } (буферы не переносятся между контекстами)
  function noiseBuf(c, d) {
    let m = ncache.get(c); if (!m) { m = {}; ncache.set(c, m); }
    const key = Math.round(d * 1000);
    if (m[key]) return m[key];
    const n = Math.max(1, Math.floor(c.sampleRate * d));
    const buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    const atk = Math.max(1, Math.floor(c.sampleRate * 0.003));
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.min(1, i / atk) * Math.pow(1 - i / n, 2.2);
    m[key] = buf;
    return buf;
  }
  function noise(o, c, dest) {
    c = c || ac(); if (!c) return;
    dest = dest || sfxBus(); if (!dest) return;
    const t0 = c.currentTime + timeBase + (o.t || 0), d = o.d || 0.08;
    const buf = noiseBuf(c, d);
    const vol = o.vol == null ? 0.5 : o.vol;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(o.hz || 2600, t0); f.Q.setValueAtTime(o.q || 1.1, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.att || 0.006));
    g.gain.linearRampToValueAtTime(0, t0 + d + 0.012);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0);
    try { src.stop(t0 + d + 0.05); } catch (e) {}
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // Рецепты звуков. Первые два аргумента (c, dest) — контекст и шина: игра передаёт свои, офлайн-замер
  // (renderMix) — свои. Характер звуков не менялся; изменились только «щелчковые» звуки интерфейса
  // (tap / click / tab) — в них больше нет белого шума (см. ниже) и уровень эффектов опущен на шине SFX.
  const RECIPES = {
    coin: (o, c, d) => { tone({ f: 1046, d: 0.07, vol: 0.4 }, c, d); tone({ f: 1568, d: 0.11, t: 0.055, vol: 0.34 }, c, d); noise({ hz: 2600, d: 0.05, vol: 0.06, t: 0.01 }, c, d); },
    money: (o, c, d) => {
      noise({ hz: 2200, d: 0.09, vol: 0.11 }, c, d);
      const ns = [1568, 1397, 1245, 1046];
      ns.forEach((f, i) => tone({ f, d: 0.09, t: 0.03 + i * 0.055, vol: 0.28 - i * 0.025 }, c, d));
      tone({ f: 2093, d: 0.16, t: 0.27, vol: 0.24 }, c, d);
    },
    // ribbon — «открыли точку»: колокольчик. Спад удлинён (0,5 → 1,2 с): резкое закрытие длинной ноты
    // давало единственный оставшийся скачок 0,008 (это и слышно как «дзынь с щелчком» на открытии).
    // Про скачок 0,0074, который остаётся у ленты: это НЕ щелчок, а собственная скорость тона.
    // У синуса соседние сэмплы не могут сойтись ближе, чем |Δ| ≈ 2π·f·A/sr. Обертоны ленты 880/1318/2637 Гц
    // при амплитудах 0,36/0,28/0,11 дают 2π·(0,36·1420 + 0,28·1318 + 0,11·2637)/44100 ≈ 0,116 до шин,
    // то есть ≈ 0,0093 на выходе (шина эффектов 0,5 × мастер 0,16); рядом с этим 0,00742 — норма.
    // Чтобы уложиться в абсолютные 0,003 (порог «щелчковых» звуков интерфейса), колокольчик пришлось бы
    // сделать на 8–9 дБ тише нажатия, то есть убрать его из важных событий, — это уже другой звук.
    // Поэтому qa/crackle.js проверяет у звонких не абсолют, а ПРИРОДУ скачка: при 88,2 кГц он обязан
    // уменьшиться вдвое (слитная полосно-ограниченная волна), а у настоящей ступеньки-щелчка — остаться.
    ribbon: (o, c, d) => { tone({ f: 880, f2: 1420, d: 0.16, type: 'sine', vol: 0.36, sweep: 0.7, att: 0.012 }, c, d); tone({ f: 1318, d: 1.2, t: 0.1, type: 'sine', vol: 0.28, att: 0.012 }, c, d); tone({ f: 2637, d: 0.42, t: 0.1, type: 'sine', vol: 0.11, att: 0.012 }, c, d); },
    fanfare: (o, c, d) => { [523, 659, 784, 1046].forEach((f, i) => { tone({ f, d: i === 3 ? 0.34 : 0.13, t: i * 0.1, vol: 0.28 }, c, d); tone({ f: f * 2, d: 0.1, t: i * 0.1, vol: 0.08 }, c, d); }); },
    sparkle: (o, c, d) => { tone({ f: 1318, d: 0.09, vol: 0.26 }, c, d); tone({ f: 1976, d: 0.16, t: 0.08, vol: 0.22 }, c, d); tone({ f: 2637, d: 0.2, t: 0.16, vol: 0.13 }, c, d); },
    warn: (o, c, d) => { tone({ f: 392, d: 0.13, type: 'sine', vol: 0.26 }, c, d); tone({ f: 311, d: 0.2, t: 0.12, type: 'sine', vol: 0.24 }, c, d); },
    // bad — «провал/банкротство»: было две пилы (f2 130) — это самый резкий звук из всех (скачок 0,016).
    // Теперь мягкий низкий треугольник с ровной огибающей: по-прежнему «плохо», но без скрежета.
    bad: (o, c, d) => { tone({ f: 165, d: 0.5, type: 'triangle', vol: 0.17, sweep: 1, att: 0.012 }, c, d); tone({ f: 98, d: 0.6, t: 0.04, type: 'sine', vol: 0.15, att: 0.012 }, c, d); },
    // click — самый частый звук интерфейса. Раньше это был квадрат 1500 Гц (то есть буквально щелчок);
    // теперь — короткий мягкий синус с атакой 4 мс: отклик слышно, «хруста» нет.
    click: (o, c, d) => { tone({ f: 1180, d: 0.03, type: 'sine', vol: 0.045, att: 0.004 }, c, d); },
    // ---- звуки интерфейса (тихие, короткие, без шума: шум на нажатие и читался как «хруст») ----
    tap: (o, c, d) => { tone({ f: 660, f2: 560, d: 0.055, type: 'sine', vol: 0.09, sweep: 1, att: 0.005 }, c, d); },
    deny: (o, c, d) => { tone({ f: 185, f2: 138, d: 0.17, type: 'sine', vol: 0.17, sweep: 1, att: 0.01 }, c, d); tone({ f: 108, d: 0.22, t: 0.03, type: 'sine', vol: 0.11, att: 0.01 }, c, d); },
    tab: (o, c, d) => { tone({ f: 980, d: 0.03, type: 'sine', vol: 0.05, att: 0.004 }, c, d); tone({ f: 1320, d: 0.04, t: 0.018, type: 'sine', vol: 0.032, att: 0.004 }, c, d); },
    win: (o, c, d) => {
      const up = !(o && o.down);
      tone({ f: up ? 520 : 640, f2: up ? 780 : 430, d: 0.1, type: 'sine', vol: 0.1, sweep: 1, att: 0.008 }, c, d);
      tone({ f: up ? 1040 : 320, d: 0.09, t: 0.045, type: 'sine', vol: 0.06, att: 0.008 }, c, d);
    },
  };

  // Главный вход. Возвращает true, если звук действительно попытались проиграть.
  function play(name, o) {
    if (!name || !RECIPES[name] || !isOn()) return false;
    const cat = CAT_OF[name];
    if (cat && !catVal(cat)) return false; // выключена только эта группа — остальные звучат
    if (typeof document !== 'undefined' && document.hidden) return false; // в скрытой вкладке молчим
    const now = (globalThis.performance ? performance.now() : Date.now());
    if (last[name] && now - last[name] < RATE) return false;
    last[name] = now;
    if (name === 'tap' || name === 'deny') fbAt = now; // отклик действия: второй звук на то же нажатие не нужен
    try { resume(); RECIPES[name](o || {}, ctx, sfxBus()); } catch (e) { /* WebAudio недоступен — просто тишина */ }
    return true;
  }

  // Отклик на нажатие кнопки с data-act: вкладка — свой звук, действие — «tap», служебные — молча.
  // Зовётся из app.js ПОСЛЕ действия: если действие уже откликнулось в res() (tap/deny), не дублируем.
  function tap(act) {
    if (!act) return false;
    if (act === 'tab') return play('tab');
    if (NO_TAP[act]) return false;
    const now = (globalThis.performance ? performance.now() : Date.now());
    if (now - fbAt < SETTLE) return false;
    return play('tap');
  }

  /* ---------- фоновая музыка: лёгкая романтичная 8-битная тема ---------- */
  // Владелец: «фоновая музыка в прологе просто ужасная, надо переделать в лёгкую романтичную 8-битную».
  // Прежние «пэды» (4 тянущихся голоса) и тихий «блеск» убраны совсем — теперь честный чиптюн (NES/Game Boy):
  //   • ведущая партия — прямоугольная волна (square) с фильтром низких частот;
  //   • бас — треугольник (triangle), рисунок вальса «раз-два-три»;
  //   • мягкое арпеджио восьмыми — тихая подложка, чтобы фон не «проваливался» в тишину;
  //   • лёгкая перкуссия-«тик» — шум через полосовой фильтр, совсем тихо.
  // Две темы, у каждой своя тональность, темп и мелодия (не «та же петля на тон выше»):
  //   • game — фа мажор, 92 BPM, 3/4, 24 такта ≈ 47 с; спокойная «деловитая» тема сети;
  //   • prologue — до мажор, 84 BPM, 3/4, 24 такта ≈ 51 с; выше регистр, мягче тембр, тише и короче фраза;
  //   • sad — ре минор, 63 BPM, 3/4, 16 тактов ≈ 46 с; тема тяжёлого момента (заставка BK.Moment):
  //     тот же чиптюн-движок, но без перкуссии (tick = 0), ниже регистр, тише шина и мягче срез фильтра.
  //     Владелец: «заставка с грустной 8-битной музыкой» — поэтому тема отдельная (BK.Sound.music('sad')),
  //     а не «игровая на тон ниже»: у неё свой темп, своя мелодия и своя гармония.
  // Форма петли A (8 тактов) – A' (8) – B (8), повторяется с вариациями.
  //
  // Почему больше нет скрипов и хрустов:
  //   • каждая нота — свой короткоживущий осциллятор, частота ставится ДО старта: скачков частоты нет вовсе;
  //   • огибающая — только линейные рампы, атака ~24 мс, спад ≥ 60 мс, stop() зовётся уже после нуля;
  //   • шина музыки целиком режется фильтром низких частот (2,3–3,0 кГц) — без него квадрат «хрустит» на верхах;
  //   • после шины стоит мягкий лимитер (DynamicsCompressor), сумма голосов не выходит за 1,0;
  //   • выключение и уход в скрытую вкладку — плавный спад шины, узлы освобождаются только после него;
  //   • в аккордах нет секунд в низком регистре: прежний Cmaj7 держал B2 и C3 рядом (7,3 Гц биений — «дребезг»).
  const MUS = {
    GAIN: 0.06,          // громкость шины музыки (дальше общий MASTER 0,16 — вместе тихо, как раньше)
    PRO_K: 0.72,         // пролог тише игры
    SAD_K: 0.8,          // тема тяжёлого момента тише игры: она звучит под затемнением и не должна бить в уши
    DUCK: 0.45,          // под открытым окном — тише, но не останавливаемся
    FADE_IN: 0.5,        // τ, с: появление подложки
    FADE_OUT: 0.25,      // τ, с: затухание при выключении
    ATT: 0.024,          // с: атака ноты — мягкая (щелчка нет)
    REL: 0.09,           // с: спад ноты
    // с: насколько вперёд планируем ноты. Замер (qa/crackle.js, режим «СТУПОР»): с планом 0,4 с
    // задержка главного потока 1,2 с рвала музыку дыркой в 140 мс, а 2 с — в 880 мс. Перетаскивание
    // карты в Safari — как раз такие задержки. С планом 1 с музыка переживает стопор до ~1,5 с.
    // Темп, мелодия и инструменты от этого не меняются — только то, за сколько нот мы «успели» их поставить.
    LOOK: 1.0,
    TICK: 250,           // мс: как часто планировщик просыпается (реже, чем раньше, — меньше работы в момент нажатий)
    WIN_K: 1.15,         // победа громче фоновой темы на ~1 дБ — это момент, а не подложка
    WIN_TAIL: 0.25,      // с: сколько ждём после последней ноты момента, прежде чем вернуть прежнюю тему
    SAD_K: 0.8,          // тяжёлый момент тише обычного фона
    CUT: { game: 3000, prologue: 2300, victory: 3400, sad: 1900 }, // Гц: пролог мягче, победа ярче, тяжёлый момент самый глухой
  };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);   // MIDI-номер → Гц

  // Аккорды сопровождения: [тоника, терция, квинта] в третьей октаве (только трезвучия — без секунд внизу).
  const CH = {
    F: [53, 57, 60], Bb: [58, 62, 65], C: [60, 64, 67], Dm: [50, 53, 57], Gm: [55, 58, 62],
    Am: [57, 60, 64], Em: [52, 55, 59], G: [55, 59, 62], D: [50, 54, 57],
    A: [57, 61, 64], Bm: [59, 62, 66], // тоника/доминанта и ii ступень победной темы (ре мажор)
  };
  // Мелодия: на каждый такт — список [шаг (0..5 = восьмые в такте 3/4), MIDI, длина в шагах].
  const MUS_MEL = {
    // ——— игра: фа мажор, спокойно и «деловито»; фраза A (8 тактов) ———
    game: [
      [[0, 72, 2], [2, 69, 1], [3, 65, 2], [5, 69, 1]],
      [[0, 70, 2], [2, 74, 1], [3, 77, 3]],
      [[0, 72, 1], [1, 67, 1], [2, 64, 2], [4, 67, 1], [5, 72, 1]],
      [[0, 69, 3], [3, 65, 3]],
      [[0, 74, 2], [2, 69, 1], [3, 65, 2], [5, 69, 1]],
      [[0, 70, 2], [2, 67, 1], [3, 62, 2], [5, 67, 1]],
      [[0, 67, 1], [1, 70, 1], [2, 72, 2], [4, 76, 2]],
      [[0, 77, 3], [3, 72, 1], [4, 69, 1], [5, 65, 1]],
      // ——— A' (8 тактов): та же фраза с небольшим подъёмом ———
      [[0, 77, 2], [2, 76, 1], [3, 72, 2], [5, 74, 1]],
      [[0, 74, 3], [3, 70, 1], [4, 72, 1], [5, 74, 1]],
      [[0, 72, 2], [2, 76, 1], [3, 77, 2], [5, 76, 1]],
      [[0, 74, 2], [2, 72, 1], [3, 69, 3]],
      [[0, 74, 2], [2, 77, 1], [3, 76, 2], [5, 74, 1]],
      [[0, 70, 2], [2, 67, 1], [3, 62, 3]],
      [[0, 72, 1], [1, 74, 1], [2, 76, 2], [4, 79, 1], [5, 77, 1]],
      [[0, 77, 4], [4, 72, 1], [5, 69, 1]],
      // ——— B (8 тактов): контраст, кончается на доминанте — возврат к A ———
      [[0, 74, 2], [2, 70, 1], [3, 67, 2], [5, 70, 1]],
      [[0, 72, 2], [2, 69, 1], [3, 65, 2], [5, 69, 1]],
      [[0, 70, 2], [2, 74, 1], [3, 70, 2], [5, 67, 1]],
      [[0, 72, 3], [3, 76, 3]],
      [[0, 77, 2], [2, 76, 1], [3, 74, 2], [5, 72, 1]],
      [[0, 74, 3], [3, 69, 1], [4, 72, 1], [5, 74, 1]],
      [[0, 70, 2], [2, 74, 1], [3, 77, 3]],
      [[0, 76, 2], [2, 74, 1], [3, 72, 3]],
    ],
    // ——— пролог: до мажор, выше и мягче; фраза короче (по 4 такта) ———
    prologue: [
      [[0, 76, 2], [2, 79, 1], [3, 81, 2], [5, 79, 1]],
      [[0, 81, 2], [2, 79, 1], [3, 76, 2], [5, 72, 1]],
      [[0, 77, 2], [2, 81, 1], [3, 84, 2], [5, 81, 1]],
      [[0, 79, 3], [3, 77, 1], [4, 74, 1], [5, 71, 1]],
      [[0, 76, 2], [2, 79, 1], [3, 84, 2], [5, 83, 1]],
      [[0, 81, 3], [3, 79, 2], [5, 76, 1]],
      [[0, 77, 2], [2, 79, 1], [3, 81, 3]],
      [[0, 79, 2], [2, 77, 1], [3, 74, 3]],
      [[0, 84, 2], [2, 83, 1], [3, 79, 2], [5, 81, 1]],
      [[0, 81, 3], [3, 76, 1], [4, 79, 1], [5, 81, 1]],
      [[0, 84, 2], [2, 81, 1], [3, 79, 2], [5, 77, 1]],
      [[0, 79, 2], [2, 77, 1], [3, 74, 3]],
      [[0, 79, 2], [2, 81, 1], [3, 84, 3]],
      [[0, 83, 2], [2, 81, 1], [3, 79, 3]],
      [[0, 81, 2], [2, 79, 1], [3, 77, 2], [5, 76, 1]],
      [[0, 74, 2], [2, 76, 1], [3, 79, 3]],
      [[0, 81, 2], [2, 84, 1], [3, 86, 2], [5, 84, 1]],
      [[0, 83, 2], [2, 81, 1], [3, 79, 2], [5, 77, 1]],
      [[0, 79, 2], [2, 76, 1], [3, 72, 2], [5, 76, 1]],
      [[0, 81, 2], [2, 79, 1], [3, 76, 3]],
      [[0, 77, 2], [2, 81, 1], [3, 84, 2], [5, 86, 1]],
      [[0, 84, 2], [2, 83, 1], [3, 81, 3]],
      [[0, 79, 2], [2, 76, 1], [3, 72, 3]],
      [[0, 74, 1], [1, 76, 1], [2, 77, 2], [4, 79, 2]],
    ],
    // ——— победа: ре мажор, 4/4, 140 BPM, 10 тактов ≈ 17 с. Это НЕ петля: подъём к кульминации
    // (такты 1–5), утверждение (6–8) и разрешение A7 → D (9–10). Последняя нота — тоника D6.
    victory: [
      [[0, 62, 2], [2, 66, 1], [3, 69, 2], [6, 74, 2]],               // D: D–F#–A–D5, восход
      [[0, 71, 2], [2, 74, 1], [3, 76, 2], [5, 79, 3]],               // G: B–D5–E5–G5
      [[0, 78, 2], [2, 74, 1], [3, 71, 2], [5, 74, 3]],               // Bm: F#5–D5–B4–D5
      [[0, 76, 2], [2, 73, 1], [3, 69, 2], [5, 73, 3]],               // A: E5–C#5–A4–C#5 (ведёт в D)
      [[0, 74, 4], [4, 78, 2], [6, 81, 2]],                           // D: кульминация D5–F#5–A5
      [[0, 83, 2], [2, 81, 1], [3, 79, 2], [5, 76, 2]],               // G: B5–A5–G5–E5
      [[0, 73, 2], [2, 76, 1], [3, 79, 2], [5, 81, 3]],               // A7: C#5–E5–G5–A5
      [[0, 78, 2], [2, 74, 1], [3, 71, 2], [5, 74, 3]],               // D: F#5–D5–B4–D5
      [[0, 76, 1], [1, 78, 1], [2, 79, 2], [4, 81, 4]],               // A7: E5–F#5–G5–A5, подъём к разрешению
      [[0, 74, 2], [2, 78, 1], [3, 81, 1], [4, 86, 4]],               // D: D5–F#5–A5–D6 — разрешение в тонику
    ],
    // ——— тяжёлый момент: ре минор, медленно и низко; фразы длинные, дыхания много ———
    // Ноты тянутся по 2–4 восьмых: это «неспешный темп», а не просто редкие удары.
    // Тональность ре минор (Dm–Bb–F–C / Dm–Gm–Am–Dm) — минор без надрыва, без хроматики.
    sad: [
      // ——— A (8 тактов): Dm — Bb — F — C — Dm — Gm — Am — Dm
      [[0, 69, 2], [2, 72, 1], [3, 74, 3]],
      [[0, 74, 2], [2, 72, 1], [3, 70, 3]],
      [[0, 69, 2], [2, 65, 1], [3, 67, 3]],
      [[0, 72, 4], [4, 71, 1], [5, 67, 1]],
      [[0, 69, 2], [2, 74, 1], [3, 72, 2], [5, 69, 1]],
      [[0, 70, 2], [2, 74, 1], [3, 77, 3]],
      [[0, 76, 2], [2, 72, 1], [3, 69, 3]],
      [[0, 74, 3], [3, 72, 1], [4, 69, 1], [5, 65, 1]],
      // ——— B (8 тактов): подъём и мягкий возврат домой (Bb — F — Gm — Dm — Bb — C — Am — Dm)
      [[0, 70, 3], [3, 74, 2], [5, 77, 1]],
      [[0, 77, 2], [2, 76, 1], [3, 74, 3]],
      [[0, 74, 2], [2, 70, 1], [3, 67, 3]],
      [[0, 69, 2], [2, 72, 1], [3, 74, 3]],
      [[0, 74, 2], [2, 77, 1], [3, 79, 3]],
      [[0, 76, 3], [3, 72, 2], [5, 74, 1]],
      [[0, 72, 2], [2, 69, 1], [3, 67, 3]],
      [[0, 69, 4], [4, 65, 2]],    ],
  };
  // Гармония по тактам (A – A' – B). Вальс: I–IV–V–I / vi–ii–V–I.
  // sad — ре минор: Dm – Bb – F – C – Dm – Gm – Am – Dm (вторая фраза поднимается на Bb и возвращается).
  const MUS_PROG = {
    game: ['F', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C', 'F', 'F', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C', 'F',
      'Bb', 'F', 'Gm', 'C', 'F', 'Dm', 'Bb', 'C'],
    prologue: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G',
      'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'G'],
    // победа: I–IV–ii–V, потом утверждение и доминанта A7, разрешающаяся в тонику
    victory: ['D', 'G', 'Bm', 'A', 'D', 'G', 'A', 'D', 'A', 'D'],
    sad: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Am', 'Dm',
      'Bb', 'F', 'Gm', 'Dm', 'Bb', 'C', 'Am', 'Dm'],  };
  const MUS_THEMES = {
    game: {
      mood: 'game', key: 'фа мажор', bpm: 92, beats: 3, steps: 6, gain: MUS.GAIN, cut: MUS.CUT.game,
      lev: { lead: 0.34, bass: 0.246, arp: 0.058, tick: 0.037 },
    },
    prologue: {
      mood: 'prologue', key: 'до мажор', bpm: 84, beats: 3, steps: 6, gain: MUS.GAIN * MUS.PRO_K, cut: MUS.CUT.prologue,
      lev: { lead: 0.272, bass: 0.208, arp: 0.049, tick: 0.025 },
    },
    // Победа — разовая тема-момент (`once`): тот же движок, но позиция не зацикливается, а в конце
    // музыка сама возвращается к прежней теме (musSched → musMood). Громче и ярче фона, потому что
    // это не подложка: тромбонный квадрат ведёт, треугольный бас марширует, арпеджио и тик держат шаг.
    victory: {
      mood: 'victory', key: 'ре мажор', bpm: 140, beats: 4, steps: 8, once: true,
      gain: MUS.GAIN * MUS.WIN_K, cut: MUS.CUT.victory,
      lev: { lead: 0.40, bass: 0.25, arp: 0.075, tick: 0.05 },
    },
    sad: {
      mood: 'sad', key: 'ре минор', bpm: 63, beats: 3, steps: 6, gain: MUS.GAIN * MUS.SAD_K, cut: MUS.CUT.sad,
      // перкуссии нет вовсе (tick: 0): в тяжёлом моменте «тик» звучал бы как метроном
      lev: { lead: 0.28, bass: 0.22, arp: 0.04, tick: 0 },
    },
  };
  Object.keys(MUS_THEMES).forEach((k) => { const t = MUS_THEMES[k]; t.mel = MUS_MEL[k]; t.prog = MUS_PROG[k]; t.bars = t.prog.length; });  const theme = (m) => MUS_THEMES[m] || MUS_THEMES.game;
  const stepDur = (th) => (60 / th.bpm) / (th.steps / th.beats);   // длительность восьмой, с
  const loopSec = (th) => th.bars * th.beats * 60 / th.bpm;        // длина полной петли, с
  const totalSteps = (th) => th.bars * th.steps;                   // шагов в одном проходе темы

  const mus = { on: false, gestured: false, mood: 'game', nodes: null, bus: null, gen: 0, timer: null, nextT: 0, pos: 0, duck: false,
    moment: 0, after: 'game', until: 0 };  // moment/after/until — разовая тема-момент (победа) и возврат к прежней

  // одна нота: свой осциллятор, мягкая атака, спад в ноль, и только потом stop() — щелчка на стыках нет
  function musNote(c, dest, o) {
    const att = o.att || MUS.ATT, rel = o.rel || MUS.REL;
    const d = Math.max(att + rel + 0.02, o.d || 0.2);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    if (osc.frequency.setValueAtTime) osc.frequency.setValueAtTime(o.f, o.t); else osc.frequency.value = o.f;
    g.gain.setValueAtTime(0, o.t);
    g.gain.linearRampToValueAtTime(o.vol, o.t + att);
    g.gain.setValueAtTime(o.vol, o.t + d - rel);
    g.gain.linearRampToValueAtTime(0, o.t + d);
    osc.connect(g); g.connect(dest);
    osc.start(o.t); osc.stop(o.t + d + 0.01);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }
  // перкуссия-«тик»: короткий шум через полосовой фильтр; в буфере мягкая атака — иначе первый сэмпл щёлкает
  function musTick(c, dest, t, vol, hz) {
    const n = Math.max(1, Math.floor(c.sampleRate * 0.03));
    const buf = c.createBuffer(1, n, c.sampleRate), bd = buf.getChannelData(0);
    const atk = Math.max(1, Math.floor(c.sampleRate * 0.002));
    for (let i = 0; i < n; i++) { const k = 1 - i / n; bd[i] = (Math.random() * 2 - 1) * Math.min(1, i / atk) * k * k; }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    if (f.frequency.setValueAtTime) f.frequency.setValueAtTime(hz, t); else f.frequency.value = hz;
    if (f.Q && f.Q.setValueAtTime) f.Q.setValueAtTime(0.9, t); else if (f.Q) f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.linearRampToValueAtTime(0, t + 0.032);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
    try { src.stop(t + 0.05); } catch (e) {}
    src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
  }
  // один шаг секвенсора (восьмая): мелодия, бас, арпеджио, тик — всё в одно и то же время t
  function musStep(c, nd, th, t, pos) {
    const steps = th.steps, bar = Math.floor(pos / steps) % th.bars, st = pos % steps;
    const ch = CH[th.prog[bar]] || CH.C, sd = stepDur(th), lev = th.lev;
    const m = th.mel[bar];
    if (m) for (let i = 0; i < m.length; i++) {
      if (m[i][0] !== st) continue;                       // ведущая партия — квадрат
      musNote(c, nd.bus, { f: midi(m[i][1]), t, d: sd * m[i][2] * 0.96, type: 'square', vol: lev.lead });
    }
    if (st === 0) musNote(c, nd.bus, { f: midi(ch[0] - 12), t, d: sd * 1.9, type: 'triangle', vol: lev.bass });
    else if (st === 2) musNote(c, nd.bus, { f: midi(ch[0]), t, d: sd * 1.9, type: 'triangle', vol: lev.bass * 0.62 });
    else if (st === 4) musNote(c, nd.bus, { f: midi(ch[1]), t, d: sd * 1.9, type: 'triangle', vol: lev.bass * 0.55 });
    const arp = [ch[0], ch[1], ch[2], ch[0] + 12];        // мягкое арпеджио восьмыми — тихо
    // нота арпеджио звучит дольше шага (1,3 восьмой): между шагами не остаётся «дырки» в тишину
    musNote(c, nd.bus, { f: midi(arp[st % 4]), t, d: sd * 1.3, type: 'square', vol: lev.arp, att: 0.02, rel: 0.08 });
    const tv = lev.tick * (st === 0 ? 1 : (st === 2 || st === 4 ? 0.55 : 0));
    if (tv > 0) musTick(c, nd.bus, t, tv, st === 0 ? 5200 : 4200);
  }
  // шина музыки: gain → фильтр низких частот → мягкий лимитер → выход (master в игре, destination в офлайне)
  function musGraph(c, mood, dest) {
    const th = theme(mood);
    const bus = c.createGain();
    bus.gain.setValueAtTime(0, 0);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    if (lp.frequency.setValueAtTime) lp.frequency.setValueAtTime(th.cut, 0); else lp.frequency.value = th.cut;
    if (lp.Q && lp.Q.setValueAtTime) lp.Q.setValueAtTime(0.5, 0); else if (lp.Q) lp.Q.value = 0.5;
    bus.connect(lp);
    let lim = null;
    if (typeof c.createDynamicsCompressor === 'function') {
      lim = c.createDynamicsCompressor();                 // мягкий лимитер: сумма голосов не выходит за 1,0
      try {
        // Порог поднят с −10 до −6 дБ: замер (qa/crackle.js) показывает, что шина музыки даже с эффектами
        // не доходит до −28 дБ, то есть лимитер не срабатывает ни разу и ничего не «качает». −10 дБ при
        // таком запасе пугало владельца: он слышал хрип «на каждом нажатии» (это были сами эффекты, не лимитер).
        lim.threshold.setValueAtTime(-6, 0); lim.knee.setValueAtTime(3, 0); lim.ratio.setValueAtTime(20, 0);
        lim.attack.setValueAtTime(0.004, 0); lim.release.setValueAtTime(0.18, 0);
      } catch (e) {}
      lp.connect(lim); lim.connect(dest);
    } else lp.connect(dest);
    return { bus, lp, lim, th };
  }
  // Порог лимитера в линейной амплитуде — для проверок «он вообще не срабатывает» (qa/crackle.js)
  const LIM_THRESHOLD = Math.pow(10, -6 / 20);
  function musFree(nd) {
    if (!nd) return;
    try { nd.bus.disconnect(); } catch (e) {}
    try { nd.lp.disconnect(); } catch (e) {}
    if (nd.lim) { try { nd.lim.disconnect(); } catch (e) {} }
  }
  // музыка нужна: общий звук включён, категория «Музыка» включена, был жест игрока, вкладка видима
  function musicWant() {
    return mus.gestured && isOn() && catVal('music') && !(typeof document !== 'undefined' && document.hidden);
  }
  // уровень подложки: всегда через плавный setTargetAtTime — щелчков не бывает
  function musLevel() {
    if (!mus.bus || !ctx || !mus.bus.gain || !mus.bus.gain.setTargetAtTime) return;
    const th = theme(mus.mood);
    // разовый момент (победа) под окном НЕ приглушается: окно открывается ровно в этот момент,
    // а сама тема — не фон, а событие; фоновые темы ведут себя как раньше (0,45 от своей громкости)
    const want = (mus.on && musicWant()) ? th.gain * (mus.duck && !th.once ? MUS.DUCK : 1) : 0;
    const tau = want ? (mus.duck && !th.once ? 0.4 : MUS.FADE_IN) : MUS.FADE_OUT;
    try { mus.bus.gain.setTargetAtTime(want, ctx.currentTime, tau); } catch (e) {}
  }
  // планировщик: держим LOOK секунд вперёд; отстали (вкладка подвисла) — не играем в прошлом, а начинаем заново.
  // Разовая тема (победа) не зацикливается: доиграв её до конца, возвращаем ту тему, что звучала до неё.
  function musSched() {
    if (!mus.on || !ctx || !mus.nodes) return;
    const now = ctx.currentTime;
    if (!mus.nextT || mus.nextT < now + 0.05) mus.nextT = now + 0.08;
    let guard = 0;
    while (mus.nextT < now + MUS.LOOK && guard++ < 64) {
      const th = theme(mus.mood);
      if (th.once && mus.pos >= totalSteps(th)) break;    // момент доигран — новых нот не ставим
      musStep(ctx, mus.nodes, th, mus.nextT, mus.pos);
      mus.pos++; mus.nextT += stepDur(th);
    }
    const cur = theme(mus.mood);
    if (cur.once && mus.moment === mus.mood && mus.pos >= totalSteps(cur) && mus.until && now >= mus.until) {
      // все ноты момента уже начались; последний аккорд ещё звучит и плавно уступает фоновой теме
      musMood(mus.after && MUS_THEMES[mus.after] ? mus.after : 'game');
    }
  }
  function musStart() {
    if (!musicWant()) return false;
    if (mus.on && mus.nodes) return true;   // уже играет — ничего не трогаем
    const c = ac(); if (!c || !master) return false;
    resume();
    mus.gen++;                       // отменяем отложенный разбор узлов прежней остановки
    mus.on = true;
    if (!mus.nodes) {
      const nd = musGraph(c, mus.mood, master);
      if (!nd) { mus.on = false; return false; }
      mus.nodes = nd; mus.bus = nd.bus;
    }
    mus.nextT = 0; mus.pos = 0;
    musSched();
    if (!mus.timer) mus.timer = setInterval(musSched, MUS.TICK);
    musLevel();
    return true;
  }
  // mode: 'now' — почти мгновенно (~45 мс), 'fast' — скрытая вкладка (~70 мс), иначе — обычное затухание (~0,5 с).
  // В любом случае это линейная рампа шины в ноль, а узлы освобождаются только после неё: обрыва нет.
  function musStop(mode) {
    if (!mus.on && !mus.nodes) return false;
    mus.gen++; mus.on = false;
    mus.moment = 0; mus.until = 0;   // разовый момент не «висит» на паузе: после возврата играет обычная тема
    if (theme(mus.mood).once) mus.mood = (mus.after && MUS_THEMES[mus.after]) ? mus.after : 'game';
    if (mus.timer) { clearInterval(mus.timer); mus.timer = null; }
    mus.nextT = 0; mus.pos = 0;
    const nd = mus.nodes, gen = mus.gen;
    if (!nd || !ctx || !nd.bus.gain) { mus.nodes = null; mus.bus = null; return true; }
    const now = ctx.currentTime, fade = mode === 'now' ? 0.045 : (mode === 'fast' ? 0.07 : 0.22);
    try {
      const cur = nd.bus.gain.value;
      nd.bus.gain.cancelScheduledValues(now);
      nd.bus.gain.setValueAtTime(cur, now);
      nd.bus.gain.linearRampToValueAtTime(0, now + fade);
    } catch (e) {}
    setTimeout(() => { if (gen !== mus.gen) return; mus.nodes = null; mus.bus = null; musFree(nd); },
      Math.round(fade * 1000) + 120);
    return true;
  }
  // настроение: 'game' — тема сети, 'prologue' — отдельная, более лёгкая и романтичная тема пролога,
  // 'victory' — разовый момент победы (см. musMoment ниже): в конце сам возвращает прежнюю тему.
  // 'sad' — тема тяжёлого момента (заставка BK.Moment). Обе идут через MUS_THEMES и друг другу не мешают.
  function musMood(m) {
    if (!MUS_THEMES[m]) return mus.mood;          // темы нет — ничего не трогаем
    if (theme(m).once) return musMoment(m);       // разовый момент — своя логика с возвратом
    if (mus.moment) { mus.moment = 0; mus.until = 0; }   // обычная тема отменяет незаконченный момент    if (mus.mood === m) return mus.mood;
    mus.mood = m;
    const nd = mus.nodes;
    if (nd && ctx) {
      // тембр меняется плавно; следующая нота берётся с начала такта новой темы — стык без рывка
      try { nd.lp.frequency.cancelScheduledValues(ctx.currentTime); nd.lp.frequency.setTargetAtTime(theme(m).cut, ctx.currentTime, 0.6); } catch (e) {}
      const st = theme(m).steps;
      mus.pos = Math.ceil(mus.pos / st) * st;
      if (mus.on) musLevel();
    }
    return mus.mood;
  }
  // Разовая тема-момент (победа): играет один раз от начала до конца, потом musSched возвращает
  // ту тему, что звучала до неё. Тот же синтез, та же шина, тот же планировщик — отличается только
  // конец (позиция не зацикливается) и то, что момент не приглушается окном. Если музыка выключена
  // (общий выключатель или «Музыка»), момента тоже нет — тишина, как просил владелец.
  function musMoment(name) {
    const th = theme(name);
    if (!th.once) return mus.mood;
    if (mus.moment === name) return mus.mood;            // уже звучит — не начинаем заново
    if (!musicWant()) return mus.mood;                   // музыки нет — и момента нет
    if (mus.mood !== name && !theme(mus.mood).once) mus.after = mus.mood;   // куда вернуться
    mus.mood = name; mus.moment = name; mus.until = 0;
    const nd = mus.nodes;
    if (nd && ctx) { try { nd.lp.frequency.cancelScheduledValues(ctx.currentTime); nd.lp.frequency.setTargetAtTime(th.cut, ctx.currentTime, 0.25); } catch (e) {} }
    if (!mus.on) musStart();                             // музыка была остановлена — момент её включает
    if (mus.on && ctx) {
      mus.pos = 0; mus.nextT = 0;                        // момент всегда звучит с начала
      if (mus.bus && mus.bus.gain) musLevel();
      mus.until = ctx.currentTime + loopSec(th) + MUS.WIN_TAIL;
      musSched();
    }
    return mus.mood;
  }
  // открылось окно (пауза чтения) — приглушаем; закрылось — возвращаем. Музыка при этом не останавливается.
  function musDuck(v) { const d = !!v; if (mus.duck === d) return; mus.duck = d; if (mus.on) musLevel(); }
  function musVis() {
    if (typeof document === 'undefined') return;
    if (document.hidden) musStop('fast');           // в скрытой вкладке — тишина и никакой работы
    else if (mus.gestured) { resume(); musStart(); }
  }
  // справка о теме (для проверки музыки, qa/music8.js и qa/music-win.js): темп, тональность, длина, тембр, регистр
  function musInfo(m) {
    const th = theme(MUS_THEMES[m] ? m : mus.mood);
    let sum = 0, n = 0, lo = 127, hi = 0;
    th.mel.forEach((bar) => bar.forEach((v) => { sum += v[1]; n++; if (v[1] < lo) lo = v[1]; if (v[1] > hi) hi = v[1]; }));
    return { mood: th.mood, key: th.key, bpm: th.bpm, beats: th.beats, steps: th.steps, bars: th.bars,
      loopSec: +loopSec(th).toFixed(1), cut: th.cut, gain: +th.gain.toFixed(4), once: !!th.once,
      leadAvg: n ? +(sum / n).toFixed(1) : 0, leadLo: lo, leadHi: hi, leadNotes: n };
  }
  // офлайн-рендер музыки (OfflineAudioContext) — только для проверки qa/music8.js и qa/music-win.js: числа вместо «на слух».
  // opts.stopAt (с) — та же плавная рампа выключения, что и в musStop: проверяем, что на стопе нет щелчка.
  // Разовая тема (победа) не зацикливается: играем ровно её длину и гасим шину по концу момента —
  // ровно так, как это делает живой планировщик, возвращая потом обычную музыку.
  function renderMusic(mood, seconds, srIn, opts) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) return null;
    const m = MUS_THEMES[mood] ? mood : 'game', th = theme(m);
    const sr = srIn || 44100, sec = Math.max(4, Math.min(120, seconds || 44));
    const c = new OAC(1, Math.ceil(sec * sr), sr);
    const out = c.createGain();                 // как MASTER в игре — иначе замер нельзя сравнивать с живым звуком
    out.gain.setValueAtTime(MASTER, 0); out.connect(c.destination);
    const nd = musGraph(c, m, out);
    if (!nd) return null;
    const end = sec - 0.3;
    const stopAt = opts && opts.stopAt > 0.5 && opts.stopAt < end - 0.5 ? opts.stopAt : 0;
    const onceAt = th.once ? 0.12 + loopSec(th) + MUS.WIN_TAIL : 0;   // где кончается момент
    const tail = th.once ? Math.min(end, onceAt) : end;
    let t = 0.12, pos = 0, guard = 0;
    const planTo = (stopAt || (th.once ? onceAt : end)) - 0.2;
    while (t < planTo && guard++ < 4000) {
      if (th.once && pos >= totalSteps(th)) break;
      musStep(c, nd, th, t, pos); pos++; t += stepDur(th);
    }
    nd.bus.gain.setValueAtTime(0, 0);                    // вход подложки — плавно
    nd.bus.gain.linearRampToValueAtTime(th.gain, 0.5);
    if (stopAt) {
      nd.bus.gain.setValueAtTime(th.gain, stopAt);
      nd.bus.gain.linearRampToValueAtTime(0, stopAt + 0.045);   // ровно как musStop('now')
    } else {
      nd.bus.gain.setValueAtTime(th.gain, tail - 0.4);          // выход подложки (или конца момента) — плавно
      nd.bus.gain.linearRampToValueAtTime(0, tail);
    }
    return c.startRendering();
  }
  /* Офлайн-замер СУММЫ «музыка + эффекты» — для qa/crackle.js (владелец: «хрустит, когда трогаю кнопки»).
     Рендерим в 3 канала, чтобы одним прогоном видеть всё, что нужно:
       0 — выход мастер-шины (то, что слышно: музыка + эффекты через те же рецепты и ту же шину эффектов);
       1 — сигнал на входе лимитера музыки: сравнив его пик с порогом, видно, срабатывает лимитер или нет;
       2 — шина эффектов: видно уровень нажатий отдельно от музыки.
     Событие: { at: секунда, name: 'tap', o: {…} } — тот же рецепт, что играет в игре. */
  function renderMix(mood, seconds, events, opts) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) return null;
    const m = MUS_THEMES[mood] ? mood : 'game', th = theme(m);
    // sr можно задать (opts.sr): проверка qa/crackle.js рендерит звук ещё и на 88,2 кГц — у слитной волны
    // скачок между сэмплами падает вдвое, у ступеньки-щелчка нет. Так «хруст» отличают от скорости тона.
    const sr = (opts && opts.sr) || 44100, sec = Math.max(4, Math.min(60, seconds || 12));
    const c = new OAC(3, Math.ceil(sec * sr), sr);
    const merger = c.createChannelMerger(3);
    // замерный «штырь» намеренно НЕ выводим в слышимый канал: он не должен попадать в замеры
    const meter = c.createGain(); meter.gain.setValueAtTime(1, 0); meter.connect(merger, 0, 1);
    merger.connect(c.destination);
    const out = c.createGain(); out.gain.setValueAtTime(MASTER, 0); out.connect(merger, 0, 0);
    const sfx = c.createGain(); sfx.gain.setValueAtTime(SFX, 0); sfx.connect(out); sfx.connect(merger, 0, 2);
    const nd = musGraph(c, m, out);
    if (!nd) return null;
    nd.lp.connect(meter);
    const end = sec - 0.3, withMusic = !(opts && opts.music === false);
    if (withMusic) {
      let t = 0.12, pos = 0, guard = 0;
      while (t < end - 0.2 && guard++ < 4000) { musStep(c, nd, th, t, pos); pos++; t += stepDur(th); }
      nd.bus.gain.setValueAtTime(0, 0);
      nd.bus.gain.linearRampToValueAtTime(th.gain, 0.5);
      nd.bus.gain.setValueAtTime(th.gain, end - 0.4);
      nd.bus.gain.linearRampToValueAtTime(0, end);
    } else {
      nd.bus.gain.setValueAtTime(0, 0);          // музыка выключена: меряем сам эффект (шина канала 2)
    }
    const played = [];
    (events || []).forEach((ev) => {
      const r = RECIPES[ev && ev.name]; if (!r) return;
      const at = Math.max(0.1, Math.min(end - 0.6, (ev && ev.at) || 1));
      timeBase = at;                                  // офлайн-контекст всегда «сейчас» = 0, поэтому сдвигаем сами
      try { r(ev.o || {}, c, sfx); } catch (e) {}
      timeBase = 0;
      played.push({ name: ev.name, at: at });
    });
    return c.startRendering().then((buf) => ({ buf, master: MASTER, sfxGain: SFX, limThreshold: LIM_THRESHOLD, sr, played: played.slice() }));
  }
  /* СЛУШАЕМ МАСТЕР-ШИНУ вживую — для qa/crackle.js. Это точная копия того, что делает проверка:
     AudioWorkletNode (модуль через data:-URL — blob: на file:// не грузится), приёмник с numberOfOutputs: 0,
     поэтому звук он не портит. Пишем мастер-шину (первый createGain модуля) и возвращаем сэмплы.
     opts.counters — считать ещё и созданные узлы (сколько работы на каждое нажатие).
     Обычная игра этим не пользуется: одна проверка — один вызов, потом stopRec(). */
  let recorder = null;
  const REC_CODE = `class BkRec extends AudioWorkletProcessor {
    constructor(){ super(); this.acc = new Float32Array(4096); this.n = 0; }
    process(inputs){
      const ch = inputs[0] && inputs[0][0];
      if (ch) { for (let i = 0; i < ch.length; i++) { this.acc[this.n++] = ch[i]; if (this.n === this.acc.length) this.flush(); } }
      else { for (let i = 0; i < 128; i++) { this.acc[this.n++] = 0; if (this.n === this.acc.length) this.flush(); } }
      return true;
    }
    flush(){ if (this.n) this.port.postMessage(this.acc.slice(0, this.n)); this.n = 0; }
  }
  registerProcessor('bkrec', BkRec);`;
  async function startRec(opts) {
    const c = ac(); if (!c) return { err: 'нет AudioContext' };
    try {
      resume();
      if (!c.audioWorklet) return { err: 'нет AudioWorklet' };
      if (!c.__bkRecMod) { await c.audioWorklet.addModule('data:application/javascript;base64,' + btoa(REC_CODE)); c.__bkRecMod = true; }
      const node = new AudioWorkletNode(c, 'bkrec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
      const chunks = [];
      node.port.onmessage = (e) => { chunks.push(e.data); };
      if (!master) return { err: 'мастер-шина ещё не создана' };
      master.connect(node);
      c.__bkNodes = 0;
      const counters = !!(opts && opts.counters);
      if (counters && !c.__bkCounted) {
        c.__bkCounted = true;
        ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createBuffer'].forEach((k) => {
          const o = c[k].bind(c); c[k] = function () { c.__bkNodes++; return o.apply(null, arguments); };
        });
      }
      recorder = { c, node, chunks, counters };
      return { ok: true, sr: c.sampleRate, state: c.state, counters: counters };
    } catch (e) { return { err: String(e) }; }
  }
  async function stopRec() {
    const r = recorder; if (!r) return { err: 'запись не начата' };
    recorder = null;
    try { r.node.port.postMessage('flush'); } catch (e) {}
    await new Promise((res) => setTimeout(res, 90));        // дать воркл-ету отдать последний неполный блок
    try { master.disconnect(r.node); } catch (e) {}
    let len = 0; r.chunks.forEach((a) => { len += a.length; });
    const d = new Float32Array(len);
    let o = 0; r.chunks.forEach((a) => { d.set(a, o); o += a.length; });
    try { r.node.disconnect(); } catch (e) {}
    const sr = r.c.sampleRate, nodes = r.counters ? (r.c.__bkNodes || 0) : 0;
    // ——— метрики: пик, RMS, скачки между сэмплами, участки в ноль, окна по 10 мс ———
    let peak = 0, sq = 0, dc = 0, maxJump = 0, jumpAt = 0, j01 = 0, j05 = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const v = d[i], a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sq += v * v; dc += v;
      if (i) { const j = Math.abs(v - prev); if (j > maxJump) { maxJump = j; jumpAt = i / sr; } if (j > 0.01) j01++; if (j > 0.05) j05++; }
      prev = v;
    }
    let run = 0, runAt = 0, zeroRun = 0, zeroRuns = 0;
    for (let i = 0; i < len; i++) {
      if (d[i] === 0) { if (!run) runAt = i; run++; }
      else { if (run >= 32) { zeroRuns++; if (run > zeroRun) zeroRun = run; } run = 0; }
    }
    if (run >= 32) { zeroRuns++; if (run > zeroRun) zeroRun = run; }
    const win = Math.round(0.01 * sr);
    let winMin = Infinity, winMinAt = 0, silent = 0, wins = 0, gap = 0, gapWin = 0, gapAt = 0;
    for (let w = 0; w + win <= len; w += win) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += d[i] * d[i];
      const rr = Math.sqrt(s / win);
      wins++;
      if (rr < winMin) { winMin = rr; winMinAt = w / sr; }
      if (rr < 1e-5) { silent++; gapWin++; if (gapWin > gap) { gap = gapWin; gapAt = (w - (gapWin - 1) * win) / sr; } } else gapWin = 0;
    }
    return { sec: +(len / sr).toFixed(2), sr, nodes,
      peak: +peak.toFixed(5), rms: +Math.sqrt(sq / Math.max(1, len)).toFixed(5), dc: +(dc / Math.max(1, len)).toFixed(6),
      maxJump: +maxJump.toFixed(5), jumpAt: +jumpAt.toFixed(2), jumps01: j01, jumps05: j05,
      zeroRun, zeroRuns, winMin: +winMin.toFixed(5), winMinAt: +winMinAt.toFixed(1), silent, wins, gapMs: gap * 10, gapAt: +gapAt.toFixed(2) };
  }
  // Живая диагностика для qa/crackle.js: состояние шин, лимитера и планировщика (ничего не меняет).
  function diag() {
    const nd = mus.nodes;
    return {
      ctxState: ctx ? ctx.state : null, sr: ctx ? ctx.sampleRate : 0, t: ctx ? +ctx.currentTime.toFixed(3) : 0,
      on: mus.on, mood: mus.mood, duck: mus.duck, pos: mus.pos,
      moment: mus.moment, momentLeft: (mus.moment && mus.until && ctx) ? +Math.max(0, mus.until - ctx.currentTime).toFixed(2) : 0,
      ahead: ctx && mus.nextT ? +(mus.nextT - ctx.currentTime).toFixed(3) : 0,   // на сколько вперёд запланированы ноты
      bus: nd ? +nd.bus.gain.value.toFixed(5) : 0,
      cut: nd ? +nd.lp.frequency.value.toFixed(0) : 0,
      limThreshold: LIM_THRESHOLD,
      limReduction: nd && nd.lim ? +nd.lim.reduction.toFixed(2) : null,
      master: master ? +master.gain.value.toFixed(4) : 0,
      sfx: sfx ? +sfx.gain.value.toFixed(4) : null,
      sounds: Object.keys(RECIPES).length,
    };
  }

  /* ---------- кнопки в интерфейсе ---------- */
  const IC_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.4L9 3.2v9.6L5.4 10H3z" fill="currentColor"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.9a6 6 0 0 1 0 8.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const IC_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.4L9 3.2v9.6L5.4 10H3z" fill="currentColor"/><path d="M11.2 6.4l3.6 3.6M14.8 6.4l-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function syncBtns() {
    if (typeof document === 'undefined') return;
    const v = isOn();
    document.querySelectorAll('[data-act="sound"]').forEach((b) => {
      b.innerHTML = v ? IC_ON : IC_OFF;
      b.setAttribute('aria-pressed', String(v));
      b.setAttribute('aria-label', v ? 'Звук включён. Выключить' : 'Звук выключен. Включить');
      b.title = v ? 'Звук: включён (тихий). Нажмите, чтобы выключить' : 'Звук: выключен. Нажмите, чтобы включить';
    });
    document.querySelectorAll('[data-snd]').forEach((b) => b.setAttribute('aria-pressed', String(String(v) === b.dataset.snd)));
    // переключатели категорий: своё состояние видно и при выключенном общем звуке
    document.querySelectorAll('[data-catbtn]').forEach((b) => {
      const cat = b.dataset.cat;
      b.setAttribute('aria-pressed', String((catVal(cat) ? '1' : '0') === b.dataset.arg));
    });
    document.querySelectorAll('[data-cats]').forEach((el) => { el.style.opacity = v ? '' : '.55'; });
    const hint = document.getElementById('sndHint');
    if (hint) hint.textContent = v ? 'Играет тихо: громкость — как в браузере.' : 'Сейчас молчит всё — включите общий звук.';
    document.documentElement.classList.toggle('sound-on', v);
  }

  /* ---------- строка настроек в «Меню игры» ---------- */
  // Общий выключатель + четыре группы. Компактно и понятно: подпись с пояснением и пара «Вкл/Выкл».
  function settingsHtml(S) {
    const seg = (act, attrs, label, pressed) => `<button type="button" data-act="${act}" ${attrs} aria-pressed="${pressed}">${label}</button>`;
    const catRow = (cat, name, hint) => {
      const v = catVal(cat);
      return `<div class="row sp snd-row"><span>${name}<small class="hint">${hint}</small></span>
        <div class="seg snd-seg" role="group" aria-label="${name}">
          ${seg('sndCat', `data-cat="${cat}" data-arg="1" data-catbtn="1"`, 'Вкл', v)}
          ${seg('sndCat', `data-cat="${cat}" data-arg="0" data-catbtn="1"`, 'Выкл', !v)}
        </div></div>`;
    };
    const v = isOn();
    return `<div class="sndset">
      <div class="row sp snd-row"><span>Звук<small class="hint" id="sndHint">${v ? 'Играет тихо: громкость — как в браузере.' : 'Сейчас молчит всё — включите общий звук.'}</small></span>
        <div class="seg snd-seg" role="group" aria-label="Звук игры">
          ${seg('sndSet', 'data-arg="1" data-snd="1"', 'Вкл', v)}
          ${seg('sndSet', 'data-arg="0" data-snd="0"', 'Выкл', !v)}
        </div></div>
      <div data-cats="1" style="display:grid;gap:4px;padding-top:6px;margin-top:2px;border-top:1px solid var(--line-2)${v ? '' : ';opacity:.55'}">
        ${catRow('money', CAT_NAME.money, 'выручка, монетки 1-го числа')}
        ${catRow('notes', CAT_NAME.notes, 'открытие точки, вехи, достижения')}
        ${catRow('ui', CAT_NAME.ui, 'отклик на нажатия и окна')}
        ${catRow('music', CAT_NAME.music, '8-битные темы: игра, пролог, победа и тяжёлый момент — разные')}      </div></div>`;
  }

  /* ---------- подключение к интерфейсу без правок чужих файлов ---------- */
  // действие для кнопок категорий: при включении — короткий пример звука группы
  function hookActions() {
    const App = BK.App;
    if (!App || !App.ACT || App.ACT.sndCat) return !!(App && App.ACT);
    App.ACT.sndCat = (d) => {
      const cat = d && d.cat;
      if (!KEY_CAT[cat]) return;
      const v = setCat(cat, d.arg === '1');
      if (v && isOn() && CATS[cat][0]) play(CATS[cat][0]); // включили — слышно, что именно включили (музыка звучит сама)
    };
    return true;
  }
  // окна: открытие/закрытие «Меню игры», событий, отчётов и прочих модалок (#modal)
  let hadModal = null;
  function watchModal() {
    if (typeof document === 'undefined') return false;
    const box = document.getElementById('modal');
    if (!box) return false;
    if (box.__sndWatch) return true;
    box.__sndWatch = true;
    hadModal = !!box.querySelector('.modal');
    try {
      new MutationObserver(() => {
        const has = !!box.querySelector('.modal');
        if (has === hadModal) return;
        hadModal = has;
        musDuck(has); // окно открыто — музыка тише, закрыто — возвращается (не останавливается)
        play('win', { down: has ? 0 : 1 });
      }).observe(box, { childList: true });
    } catch (e) {}
    return true;
  }
  let tries = 0;
  function hooks() {
    const a = hookActions(), b = watchModal();
    if ((!a || !b) && tries++ < 40) setTimeout(hooks, 250); // App и #modal появляются позже (sound.js грузится раньше app.js)
  }

  BK.Sound = {
    get on() { return isOn(); },
    play, toggle, sync: syncBtns,
    set,
    settingsHtml,
    tap,
    catOn, catVal, setCat, toggleCat, CATS, CAT_NAME,
    // музыка: music('game') / music('prologue') / music('victory') / music('sad') — настроение (без аргумента — узнать текущее)
    music: musMood,
    musicInfo: musInfo,       // справка о теме: темп, тональность, длина петли, тембр (проверка qa/music8.js)
    renderMusic,              // офлайн-рендер музыки в OfflineAudioContext — числа вместо «на слух»
    renderMix,                // офлайн-рендер суммы «музыка + эффекты» (3 канала) — проверка qa/crackle.js
    diag,                     // живое состояние шин, лимитера и планировщика — проверка qa/crackle.js
    startRec, stopRec,        // запись мастер-шины вживую: покой против взаимодействия — проверка qa/crackle.js
    SFX,                      // уровень шины эффектов (для проверок)
    // первый жест игрока — можно включать звук (политика браузеров) и снимать запрет на музыку
    arm() {
      if (typeof document === 'undefined' || BK.Sound.__armed) return;
      BK.Sound.__armed = true;
      const go = () => {
        mus.gestured = true;             // жест был — браузер разрешает звук (даже если звук сейчас выключен: включат в настройках)
        if (!isOn()) return;
        resume();
        if (catVal('music')) musStart();
      };
      document.addEventListener('pointerdown', go, { passive: true });
      document.addEventListener('keydown', go);
    },
    IC_ON, IC_OFF,
  };
  if (typeof document !== 'undefined') {
    const init = () => {
      syncBtns(); hooks();
      document.addEventListener('visibilitychange', musVis); // скрытая вкладка — тишина, вернулись — снова играет
      try { const m = matchMedia('(prefers-color-scheme: dark)'); if (m && m.addEventListener) m.addEventListener('change', syncBtns); } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init);
  }
})();
