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
     — фон: постоянные осцилляторы-«пэд» (4 голоса + бас + тихий «блеск»), которые плавно переезжают
       на ноты следующего аккорда; новые узлы на такт не создаются (ноль на аккорд), при выключении
       узлы останавливаются и отключаются;
     — петля: Fmaj7 – Dm7 – G6 – Cmaj7 (IV–ii–V–I в до-мажоре), мягкое голосоведение, никакой мелодии —
       неспешный тёплый фон для чтения и раздумий; в прологе та же петля на тон выше и светлее ('prologue');
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
  const RATE = 45;                  // мс: один и тот же звук не чаще раза в 45 мс (на ×10 иначе трещит; performance.now() — в миллисекундах)
  const SETTLE = 30;                // мс: отклик действия уже прозвучал — общий «щелчок» не повторяем
  let on = null, ctx = null, master = null, last = {}, cats = {}, fbAt = 0;

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
    } catch (e) { ctx = null; }
    return ctx;
  }
  function resume() { const c = ac(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  function stopAll() { if (master) { try { master.gain.value = 0; setTimeout(() => { if (master) master.gain.value = MASTER; }, 60); } catch (e) {} } }

  /* ---------- кирпичики синтеза ---------- */
  // нота: осциллятор с огибающей. o: { f, f2, t (задержка), d (длина), type, vol, sweep }
  function tone(o) {
    const c = ac(); if (!c || !master) return;
    const t0 = c.currentTime + (o.t || 0), d = o.d || 0.1;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(Math.max(20, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + d * (o.sweep || 1));
    const v = (o.vol == null ? 1 : o.vol);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + d + 0.03);
  }
  // шум (касса, «шшш» монет): короткий буфер с полосовым фильтром
  function noise(o) {
    const c = ac(); if (!c || !master) return;
    const t0 = c.currentTime + (o.t || 0), d = o.d || 0.08;
    const n = Math.max(1, Math.floor(c.sampleRate * d));
    const buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.hz || 2600; f.Q.value = o.q || 1.1;
    const g = c.createGain(); g.gain.value = o.vol == null ? 0.5 : o.vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const RECIPES = {
    coin: (c) => { tone({ f: 1046, d: 0.07, vol: 0.5 }); tone({ f: 1568, d: 0.11, t: 0.055, vol: 0.42 }); noise({ hz: 3600, d: 0.05, vol: 0.16, t: 0.01 }); },
    money: (c) => {
      noise({ hz: 2400, d: 0.09, vol: 0.3 });
      const ns = [1568, 1397, 1245, 1046];
      ns.forEach((f, i) => tone({ f, d: 0.09, t: 0.03 + i * 0.055, vol: 0.34 - i * 0.03 }));
      tone({ f: 2093, d: 0.16, t: 0.27, vol: 0.3 });
    },
    ribbon: (c) => { tone({ f: 880, f2: 1420, d: 0.16, type: 'sine', vol: 0.42, sweep: 0.7 }); tone({ f: 1318, d: 0.5, t: 0.1, type: 'sine', vol: 0.34 }); tone({ f: 2637, d: 0.42, t: 0.1, type: 'sine', vol: 0.16 }); },
    fanfare: (c) => { [523, 659, 784, 1046].forEach((f, i) => { tone({ f, d: i === 3 ? 0.34 : 0.13, t: i * 0.1, vol: 0.34 }); tone({ f: f * 2, d: 0.1, t: i * 0.1, vol: 0.1 }); }); },
    sparkle: (c) => { tone({ f: 1318, d: 0.09, vol: 0.3 }); tone({ f: 1976, d: 0.16, t: 0.08, vol: 0.26 }); tone({ f: 2637, d: 0.2, t: 0.16, vol: 0.16 }); },
    warn: (c) => { tone({ f: 392, d: 0.13, type: 'sine', vol: 0.3 }); tone({ f: 311, d: 0.2, t: 0.12, type: 'sine', vol: 0.28 }); },
    bad: (c) => { tone({ f: 196, f2: 130, d: 0.5, type: 'sawtooth', vol: 0.22, sweep: 1 }); tone({ f: 98, d: 0.6, t: 0.04, type: 'sine', vol: 0.24 }); },
    click: (c) => { tone({ f: 1500, d: 0.025, type: 'square', vol: 0.1 }); },
    // ---- звуки интерфейса (тихие, короткие; на ×10 не раздражают) ----
    tap: (c) => { noise({ hz: 1700, d: 0.026, vol: 0.1, q: 1.5 }); tone({ f: 620, f2: 470, d: 0.05, type: 'sine', vol: 0.11, sweep: 1 }); },
    deny: (c) => { tone({ f: 185, f2: 138, d: 0.17, type: 'sine', vol: 0.2, sweep: 1 }); tone({ f: 108, d: 0.22, t: 0.03, type: 'sine', vol: 0.13 }); },
    tab: (c) => { tone({ f: 900, d: 0.028, type: 'sine', vol: 0.08 }); tone({ f: 1260, d: 0.04, t: 0.018, type: 'sine', vol: 0.055 }); },
    win: (c, o) => {
      const up = !(o && o.down);
      tone({ f: up ? 520 : 640, f2: up ? 780 : 430, d: 0.1, type: 'sine', vol: 0.12, sweep: 1 });
      tone({ f: up ? 1040 : 320, d: 0.09, t: 0.045, type: 'sine', vol: 0.07 });
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
    try { resume(); RECIPES[name](o || {}); } catch (e) { /* WebAudio недоступен — просто тишина */ }
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

  /* ---------- фоновая музыка: тихая синтезированная подложка ---------- */
  // Игра шла в тишине — владелец просил фон. Файлов нет: те же осцилляторы WebAudio.
  // Узлы создаются один раз на запуск и живут, пока музыка играет: на каждый аккорд — ноль новых узлов,
  // голоса просто плавно переезжают на новые ноты (setTargetAtTime) с мягкой огибающей.
  // Петля Fmaj7–Dm7–G6–Cmaj7 (IV–ii–V–I в до-мажоре): тёплое голосоведение, без «мелодии-хита» —
  // это фон для чтения и раздумий, а не песня; полная петля ≈ 48 с, за час не приедается.
  const MUS = {
    GAIN: 0.06,           // громкость подложки (дальше ещё общий MASTER 0,16 — вместе очень тихо)
    FADE_IN: 0.25,        // τ, с: появление (слышимо ~0,7 с)
    FADE_OUT: 0.16,       // τ, с: затухание при остановке — плавно, без щелчков (~0,5–0,8 с)
    ATTACK: [2.6, 2.0],   // с: мягкая атака аккорда [игра, пролог]
    RELEASE: [3.0, 2.4],  // с: затухание аккорда [игра, пролог]
    STEP: [12.0, 9.5],    // с: длина аккорда [игра, пролог] — неспешно; в прологе чуть живее
    CUT: [1150, 1650],    // Гц: срез фильтра — в игре темнее, в прологе теплее и светлее
    GLIDE: 1.1,           // τ, с: переезд голоса на новую ноту (никаких скачков)
    DUCK: 0.45,           // под открытым окном музыка тише — не мешает читать
    BASS: 0.30,           // вес нижнего голоса
    SHINE: [0.05, 0.16],  // вес тихого «блеска» (высокая синусоида) [игра, пролог]
  };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);   // MIDI-номер → Гц
  const MUS_TR = [0, 2];                                  // пролог — та же петля на тон выше
  // аккорды петли: голоса (MIDI), бас (MIDI), вес каждого голоса
  const MUS_CHORDS = [
    { v: [45, 48, 52, 57], b: 41, w: [0.50, 0.42, 0.38, 0.30] }, // Fmaj7: A2 C3 E3 A3, бас F2
    { v: [45, 48, 50, 53], b: 38, w: [0.46, 0.40, 0.42, 0.30] }, // Dm7:   A2 C3 D3 F3, бас D2
    { v: [47, 50, 52, 55], b: 43, w: [0.44, 0.40, 0.38, 0.34] }, // G6:    B2 D3 E3 G3, бас G2
    { v: [47, 48, 52, 55], b: 48, w: [0.42, 0.36, 0.40, 0.34] }, // Cmaj7: B2 C3 E3 G3, бас C3
  ];
  const mus = { on: false, gestured: false, mood: 'game', nodes: null, bus: null, gen: 0, timer: null, next: 0, step: 0, duck: false };

  const musIdx = () => (mus.mood === 'prologue' ? 1 : 0);
  // музыка нужна: общий звук включён, категория «Музыка» включена, был жест игрока, вкладка видима
  function musicWant() {
    return mus.gestured && isOn() && catVal('music') && !(typeof document !== 'undefined' && document.hidden);
  }
  // уровень подложки: всегда через плавный setTargetAtTime — щелчков не бывает
  function musLevel() {
    if (!mus.bus || !ctx || !mus.bus.gain || !mus.bus.gain.setTargetAtTime) return;
    const want = (mus.on && musicWant()) ? MUS.GAIN * (mus.duck ? MUS.DUCK : 1) : 0;
    const tau = want ? (mus.duck ? 0.45 : MUS.FADE_IN) : MUS.FADE_OUT;
    try { mus.bus.gain.setTargetAtTime(want, ctx.currentTime, tau); } catch (e) {}
  }
  function musBuild() {
    const c = ac(); if (!c || !master) return false;
    const c0 = MUS_CHORDS[mus.step % MUS_CHORDS.length], tr0 = MUS_TR[musIdx()];
    const bus = c.createGain(); bus.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = MUS.CUT[musIdx()]; lp.Q.value = 0.4;
    bus.connect(lp); lp.connect(master);
    const voices = [];
    for (let i = 0; i < c0.v.length; i++) {
      const osc = c.createOscillator(); osc.type = i === 0 ? 'sine' : 'triangle'; // мягкий тёплый тембр
      osc.frequency.value = midi(c0.v[i] + tr0);                                 // сразу своя нота — без «подъезда» от 440 Гц
      const g = c.createGain(); g.gain.value = c0.w[i] * (0.24 + 0.08 * i);      // старт с «дыхания», не с нуля
      osc.connect(g); g.connect(bus); osc.start();
      voices.push({ osc, g });
    }
    const bassOsc = c.createOscillator(), bassG = c.createGain();
    bassOsc.type = 'sine'; bassOsc.frequency.value = midi(c0.b + tr0); bassG.gain.value = MUS.BASS * 0.25;
    bassOsc.connect(bassG); bassG.connect(bus); bassOsc.start();
    const shOsc = c.createOscillator(), shG = c.createGain();
    shOsc.type = 'sine'; shOsc.frequency.value = midi(c0.b + tr0) * 4; shG.gain.value = MUS.SHINE[musIdx()] * 0.3;
    shOsc.connect(shG); shG.connect(bus); shOsc.start();
    try { shG.gain.setTargetAtTime(MUS.SHINE[musIdx()], c.currentTime, 1.0); } catch (e) {}
    mus.nodes = { bus, lp, voices, bassOsc, bassG, shOsc, shG }; mus.bus = bus;
    return true;
  }
  function musTeardown() {
    const n = mus.nodes; if (!n) return;
    mus.nodes = null; mus.bus = null;
    try {
      n.voices.forEach((v) => { v.osc.stop(); v.osc.disconnect(); v.g.disconnect(); });
      n.bassOsc.stop(); n.bassOsc.disconnect(); n.bassG.disconnect();
      n.shOsc.stop(); n.shOsc.disconnect(); n.shG.disconnect();
      n.lp.disconnect(); n.bus.disconnect();
    } catch (e) {}
  }
  // один аккорд: голоса «переезжают» на новые ноты, огибающая дышит (не в полную тишину) — ровный фон без разрывов
  function musChord(t0) {
    const n = mus.nodes; if (!n) return;
    const mi = musIdx(), tr = MUS_TR[mi], D = MUS.STEP[mi];
    const ch = MUS_CHORDS[mus.step % MUS_CHORDS.length]; mus.step++;
    for (let i = 0; i < n.voices.length; i++) {
      const v = n.voices[i], w = ch.w[i];
      const att = MUS.ATTACK[mi] * (0.85 + 0.15 * i), rel = MUS.RELEASE[mi] * (0.85 + 0.12 * i);
      const floor = w * (0.24 + 0.08 * i);
      try {
        v.osc.frequency.setTargetAtTime(midi(ch.v[i] + tr), t0, MUS.GLIDE);
        const g = v.g.gain;
        g.cancelScheduledValues(t0);
        g.setValueAtTime(floor, t0);
        g.linearRampToValueAtTime(w, t0 + att);
        g.setValueAtTime(w, Math.max(t0 + att, t0 + D - rel));
        g.linearRampToValueAtTime(floor, t0 + D - 0.02); // закончить до следующего аккорда — без рывка на стыке
      } catch (e) {}
    }
    const bf = midi(ch.b + tr);
    try { n.bassOsc.frequency.setTargetAtTime(bf, t0, MUS.GLIDE);
      n.bassG.gain.cancelScheduledValues(t0);
      n.bassG.gain.setValueAtTime(MUS.BASS * 0.25, t0);
      n.bassG.gain.linearRampToValueAtTime(MUS.BASS, t0 + MUS.ATTACK[mi]);
      n.bassG.gain.setValueAtTime(MUS.BASS, Math.max(t0 + MUS.ATTACK[mi], t0 + D - MUS.RELEASE[mi]));
      n.bassG.gain.linearRampToValueAtTime(MUS.BASS * 0.25, t0 + D - 0.02);
      n.shOsc.frequency.setTargetAtTime(bf * 4, t0, MUS.GLIDE); // тихий «блеск» в две октавы выше баса
    } catch (e) {}
  }
  function musSched() {
    if (!mus.on || !ctx || !mus.nodes) return;
    const now = ctx.currentTime;
    if (!mus.next || mus.next < now) mus.next = now + 0.12;
    let guard = 0;
    while (mus.next - now < 2.2 && guard++ < 8) { musChord(mus.next); mus.next += MUS.STEP[musIdx()]; }
  }
  function musStart() {
    if (!musicWant()) return false;
    if (mus.on && mus.nodes) return true;   // уже играет — ничего не трогаем (никаких лишних событий на каждый клик)
    const c = ac(); if (!c || !master) return false;
    resume();
    mus.gen++;                       // отменяем отложенный разбор узлов прежней остановки
    mus.on = true;
    if (!mus.nodes && !musBuild()) { mus.on = false; return false; }
    mus.next = 0; mus.step = mus.step || 0;
    musSched();
    if (!mus.timer) mus.timer = setInterval(musSched, 500);
    musLevel();
    return true;
  }
  // mode: 'now' — мгновенно (общий выключатель: master глушится в тот же миг, щелчка не слышно),
  //       'fast' — очень короткое плавное затухание ~0,2 с (скрытая вкладка),
  //       иначе — обычное плавное затухание 0,5–0,8 с (выключили «Музыку»), затем узлы освобождаются.
  function musStop(mode) {
    if (!mus.on && !mus.nodes) return false;
    mus.gen++; mus.on = false;
    if (mus.timer) { clearInterval(mus.timer); mus.timer = null; }
    mus.next = 0;
    const n = mus.nodes, gen = mus.gen;
    if (mode === 'now') {
      if (n && ctx && n.bus.gain && n.bus.gain.cancelScheduledValues) { try { n.bus.gain.cancelScheduledValues(ctx.currentTime); n.bus.gain.setValueAtTime(0, ctx.currentTime); } catch (e) {} }
      musTeardown();
    } else if (mode === 'fast') {
      if (n && ctx && n.bus.gain && n.bus.gain.setTargetAtTime) { try { n.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) {} }
      setTimeout(() => {
        if (gen !== mus.gen || mus.on) return;
        const m2 = mus.nodes;
        if (m2 && ctx && m2.bus.gain && m2.bus.gain.cancelScheduledValues) { try { m2.bus.gain.cancelScheduledValues(ctx.currentTime); m2.bus.gain.setValueAtTime(0, ctx.currentTime); } catch (e) {} }
        musTeardown();
      }, 220);
    } else {
      musLevel(); // плавное затухание, потом освобождаем узлы
      setTimeout(() => { if (gen === mus.gen && !mus.on) musTeardown(); }, 900);
    }
    return true;
  }
  // настроение: 'game' — тёмный спокойный фон, 'prologue' — та же петля выше и светлее (тёплый пролог)
  function musMood(m) {
    if (m !== 'game' && m !== 'prologue') return mus.mood;
    if (mus.mood === m) return mus.mood;
    mus.mood = m;
    const n = mus.nodes;
    if (n && ctx) { try { n.lp.frequency.setTargetAtTime(MUS.CUT[musIdx()], ctx.currentTime, 1.2); n.shG.gain.setTargetAtTime(MUS.SHINE[musIdx()], ctx.currentTime, 1.2); } catch (e) {} }
    return mus.mood;
  }
  // открылось окно (пауза чтения) — приглушаем; закрылось — возвращаем. Музыка при этом не останавливается.
  function musDuck(v) { const d = !!v; if (mus.duck === d) return; mus.duck = d; if (mus.on) musLevel(); }
  function musVis() {
    if (typeof document === 'undefined') return;
    if (document.hidden) musStop('fast');           // в скрытой вкладке — тишина и никакой работы
    else if (mus.gestured) { resume(); musStart(); }
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
        ${catRow('music', CAT_NAME.music, 'тихий тёплый фон, без мелодий')}
      </div></div>`;
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
    // музыка: music('game') / music('prologue') — настроение (без аргумента — узнать текущее)
    music: musMood,
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
