/* qa/music-win.js — ПОБЕДНАЯ тема (четвёртая, src/sound.js, ключ 'victory').
   Владелец: «сейчас и победа в истории, и мелкое достижение звучат одинаково, а это единственное место,
   где игра „не хвалит“ игрока как следует» — значит победе нужен свой момент, а не «та же тема громче».

   Проверяем три вещи:
     1) ТЕМУ: своя тональность/размер/темп, длина 10–20 с, разовая (`once`), а не петля; мелодия и
        диапазон не как у игровой темы. Числа самого звука — офлайн-рендер OfflineAudioContext
        (пик, RMS, скачки между сэмплами, окна в тишине, DC) и фактическая длина звучания.
     2) ПОВЕДЕНИЕ: `music('victory')` включает тему, она НЕ приглушается открытым окном (это событие,
        а не фон), сама возвращает обычную музыку через ~17 с; выключение/включение «Музыки» не оставляет
        момент висеть; мелкая «ленточка» музыку не переключает.
     3) СОБЫТИЯ: уведомление о победе по обороту (S.won, то же, что делает app.js) включает тему;
        итоги победившей партии — один раз, второй раз звучит прежняя «ленточка»; при выключенной
        «Музыке» и при общем выключателе не создаётся ни одного узла (тишина).

   Запуск:
     export NODE_PATH=~/.bk-tools/node_modules
     node build.js && node qa/music-win.js

   Числа (офлайн-рендер 20 с, тема доиграна до конца; общий MASTER 0,16 — как в игре):
     победа — длина 17,1 с (10 тактов 4/4 при 140 BPM), пик ~0,020, RMS ~0,0075, скачков > 0,05 — 0. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
let bad = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ок   ' : '  БЕДА ') + msg + (extra === undefined ? '' : ' → ' + extra)); if (!cond) bad++; };
const num = (v, n) => (v === undefined || v === null ? String(v) : Number(v).toFixed(n === undefined ? 5 : n));

/* Подмена WebAudio «счётчиком» — тот же приём, что в qa/music.js: узлы считаются, а параметры
   автоматизации чуть моделируются, чтобы знать текущий уровень подшины. Офлайн-рендер ниже идёт
   через настоящий OfflineAudioContext (его подмена не касается). */
function pageTools() {
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  window.__now = now;
  const A = { count: 0, oscs: [], gains: [], filters: [], srcs: [], dyns: [], ctx: null, started: 0, stopped: 0 };
  window.__ac = A;
  class P {
    constructor(v) { this._base = v; this.segs = []; this._lastT = -1e9; this._lastV = v; }
    _t(t) { return t == null ? now() : t; }
    setValueAtTime(v, t) { t = this._t(t); if (t < this._lastT) t = this._lastT; this.segs.push({ k: 'set', t0: t, v: v }); this._lastT = t; this._lastV = v; return this; }
    linearRampToValueAtTime(v, t) { t = this._t(t); if (t < this._lastT) t = this._lastT; this.segs.push({ k: 'lin', t0: this._lastT, v0: this._lastV, t1: t, v: v }); this._lastT = t; this._lastV = v; return this; }
    exponentialRampToValueAtTime(v, t) { return this.linearRampToValueAtTime(v, t); }
    setTargetAtTime(v, t, tau) { t = this._t(t); this.segs.push({ k: 'tgt', t0: t, v0: this._lastV, target: v, tau: tau || 0.1 }); this._lastT = t; this._lastV = v; return this; }
    cancelScheduledValues(t) { t = this._t(t); this.segs = this.segs.filter((s) => (s.t1 != null ? s.t1 : s.t0) < t); return this; }
    get value() { return this.at(now()); }
    set value(v) { this._base = v; this.segs = [{ k: 'set', t0: -1e9, v: v }]; this._lastT = now(); this._lastV = v; }
    at(t) {
      let v = this._base;
      for (const s of this.segs) {
        if (s.t0 > t) break;
        if (s.k === 'set') v = s.v;
        else if (s.k === 'lin') { const d = s.t1 - s.t0; v = d <= 0 ? s.v : s.v0 + (s.v - s.v0) * Math.min(1, Math.max(0, (t - s.t0) / d)); }
        else v = s.target + (s.v0 - s.target) * Math.exp(-(t - s.t0) / s.tau);
      }
      return v;
    }
  }
  class Node {
    constructor(kind) { this.kind = kind; this.out = []; (A[kind + 's'] || (A[kind + 's'] = [])).push(this); }
    connect(n) { this.out.push(n); return n; }
    disconnect() { this.out = []; }
  }
  class G extends Node { constructor() { super('gain'); this.gain = new P(1); } }
  class F extends Node { constructor() { super('filter'); this.type = 'lowpass'; this.frequency = new P(350); this.Q = new P(1); this.detune = new P(0); } }
  class D extends Node {
    constructor() { super('dyn'); this.threshold = new P(-24); this.knee = new P(30); this.ratio = new P(12); this.attack = new P(0.003); this.release = new P(0.25); this.reduction = 0; }
  }
  class O extends Node {
    constructor() { super('osc'); this.type = 'sine'; this.frequency = new P(440); this.detune = new P(0); this._stop = null; }
    start(t) { this._start = t == null ? now() : t; A.started++; }
    stop(t) { this._stop = t == null ? now() : t; A.stopped++; }
  }
  class S extends Node { constructor() { super('src'); this.buffer = null; } start() { this._start = now(); } stop() {} }
  class C {
    constructor() { this.state = 'suspended'; this.sampleRate = 44100; this.destination = new Node('dest'); A.count++; A.ctx = this; }
    get currentTime() { return now(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return new G(); }
    createOscillator() { return new O(); }
    createBiquadFilter() { return new F(); }
    createDynamicsCompressor() { return new D(); }
    createBufferSource() { return new S(); }
    createBuffer(ch, len, rate) { return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData: () => new Float32Array(len) }; }
  }
  window.AudioContext = C; window.webkitAudioContext = C;
  // снимок музыкальной подшины (gain → фильтр → лимитер → master), как в qa/music.js
  window.__mus = function () {
    const bus = A.gains.filter((g) => g.out.length && g.out[0].kind === 'filter')[0] || null;
    const r = { ctxs: A.count, totalOscs: A.oscs.length, created: A.started, released: A.stopped,
      gains: A.gains.length, filters: A.filters.length, limiters: A.dyns.length,
      sounding: 0, level: 0, target: null, cut: null, notes: [], medHz: 0, underLimit: 0 };
    if (!bus) return r;
    const live = A.oscs.filter((o) => o.out.length && o.out[0].out && o.out[0].out.indexOf(bus) >= 0);
    const run = live.filter((o) => o._stop == null || o._stop > now());
    r.sounding = run.length;
    r.level = +bus.gain.at(now()).toFixed(5);
    const last = bus.gain.segs[bus.gain.segs.length - 1];
    r.target = last && last.k === 'tgt' ? +last.target.toFixed(4) : null;
    r.cut = +bus.out[0].frequency.at(now()).toFixed(0);
    r.notes = run.map((o) => Math.round(o.frequency.at(now())));
    const s = r.notes.slice().sort((a, b) => a - b);
    r.medHz = s.length ? s[s.length >> 1] : 0;
    const tail = bus.out[0].out || [];
    for (let i = 0; i < tail.length; i++) if (tail[i].kind === 'dyn') r.underLimit++;
    return r;
  };
  // метрики буфера офлайн-рендера: пик, RMS, скачки, окна 10 мс в тишине, DC
  window.__an = function (buf, from, to) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const i0 = Math.floor((from || 0) * sr), i1 = Math.min(d.length, Math.floor((to || buf.duration) * sr));
    let peak = 0, sq = 0, dc = 0, maxJump = 0, jumpAt = 0, jumps = 0, j01 = 0, n = 0, prev = 0;
    for (let i = i0; i < i1; i++) {
      const v = d[i], a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sq += v * v; dc += v; n++;
      if (i > i0) { const j = Math.abs(v - prev); if (j > maxJump) { maxJump = j; jumpAt = i / sr; } if (j > 0.01) j01++; if (j > 0.05) jumps++; }
      prev = v;
    }
    const win = Math.round(0.01 * sr);
    let winMin = Infinity, winMinAt = 0, silent = 0, wins = 0;
    for (let w = i0; w + win <= i1; w += win) {
      let s = 0;
      for (let i = w; i < w + win; i++) s += d[i] * d[i];
      const r = Math.sqrt(s / win);
      wins++;
      if (r < 0.00002) silent++;
      if (r < winMin) { winMin = r; winMinAt = w / sr; }
    }
    return { sec: +(n / sr).toFixed(2), peak: +peak.toFixed(5), rms: +Math.sqrt(sq / n).toFixed(5), dc: +(dc / n).toFixed(6),
      maxJump: +maxJump.toFixed(5), jumpAt: +jumpAt.toFixed(2), jumps: jumps, jumps01: j01,
      winMin: +winMin.toFixed(5), winMinAt: +winMinAt.toFixed(1), silent: silent, wins: wins };
  };
  // фактическая длина: последний сэмпл громче 1e-4 — «сколько тема звучит на самом деле»
  window.__len = function (buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > 0.0001) return +(i / sr).toFixed(2);
    return 0;
  };
}

async function open(browser, store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.addInitScript(pageTools);
  if (store) await p.addInitScript((s) => { try { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
  await p.goto(URL);
  if (!store) await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  return p;
}
const gesture = (p) => p.keyboard.press('Tab');        // первый жест игрока (слушатель — на document)
const mus = (p) => p.evaluate(() => window.__mus());
const mood = (p) => p.evaluate(() => BK.Sound.music());
const diag = (p) => p.evaluate(() => BK.Sound.diag());
const json = JSON.stringify;
// ждём настроение: игровой цикл обрабатывает уведомления по тикам (раз в игровой день), поэтому опрашиваем
async function waitMood(p, want, ms) {
  const t0 = Date.now();
  let m = await mood(p);
  while (m !== want && Date.now() - t0 < (ms || 6000)) { await p.waitForTimeout(250); m = await mood(p); }
  return m;
}

(async () => {
  if (!fs.existsSync(path.join(__dirname, '..', 'dist', 'local.html'))) { console.error('Нет сборки: сначала node build.js'); process.exit(1); }
  const browser = await chromium.launch();
  let p = await open(browser);
  await gesture(p);
  await p.waitForTimeout(1200);

  /* ---- A. тема по паспорту ---- */
  console.log('A. Паспорт темы: своя, короткая, разовая');
  const info = await p.evaluate(() => ({ game: BK.Sound.musicInfo('game'), prologue: BK.Sound.musicInfo('prologue'), win: BK.Sound.musicInfo('victory') }));
  console.log('   игра:    ' + json(info.game));
  console.log('   пролог:  ' + json(info.prologue));
  console.log('   победа:  ' + json(info.win));
  ok(info.win.key !== info.game.key && info.win.key !== info.prologue.key, 'своя тональность (ре мажор) — не «та же тема выше»',
    info.game.key + ' / ' + info.prologue.key + ' / ' + info.win.key);
  ok(info.win.bpm > info.game.bpm + 30, 'темп заметно бодрее игровой темы (140 против 92)', info.game.bpm + ' → ' + info.win.bpm);
  ok(info.win.beats === 4 && info.game.beats === 3, 'другой размер: марш 4/4 против вальса 3/4', info.game.beats + '/4 → ' + info.win.beats + '/4');
  ok(info.win.loopSec >= 10 && info.win.loopSec <= 20, 'длина 10–20 с — это момент, а не фон', info.win.loopSec + ' с');
  ok(info.win.bars < info.game.bars, 'короче фоновой темы (10 тактов против 24)', info.win.bars + ' против ' + info.game.bars);
  ok(info.win.once === true && !info.game.once && !info.prologue.once, 'победа помечена разовой (`once`), фоновые — петли');
  ok(info.win.cut > info.game.cut, 'тембр ярче игрового (срез 3400 против 3000 Гц)', info.win.cut + ' против ' + info.game.cut);
  ok(info.win.gain > info.game.gain && info.win.gain < info.game.gain * 1.3, 'громче фона, но в пределах момента (+1 дБ)',
    num(info.win.gain, 4) + ' против ' + num(info.game.gain, 4));
  ok(info.win.leadHi >= info.game.leadHi + 4 && info.win.leadNotes !== info.game.leadNotes, 'и мелодия другая: диапазон выше, нот меньше',
    'ведущая до ' + info.win.leadHi + ' (' + info.win.leadNotes + ' нот) против ' + info.game.leadHi + ' (' + info.game.leadNotes + ')');

  /* ---- B. числа самого звука ---- */
  console.log('B. Числа звука (офлайн-рендер 20 с, тема доиграна)');
  const render = async (moodName) => p.evaluate(async (m) => {
    const b = await BK.Sound.renderMusic(m, 20, 44100);
    return b ? { an: window.__an(b, 1, 17), len: window.__len(b) } : null;
  }, moodName);
  const w = await render('victory');
  const g = await render('game');
  if (!w || !g) { ok(false, 'офлайн-рендер темы', 'renderMusic вернул null'); } else {
    console.log('   победа: ' + json(w.an) + ' | звучит до ' + w.len + ' с');
    console.log('   игра:   ' + json(g.an));
    ok(w.an.peak > 0.002, 'тема слышна (пик больше 0,002)', num(w.an.peak, 5));
    ok(w.an.peak <= 0.9, 'пик далёк от перегруза', num(w.an.peak, 5));
    ok(w.an.rms > 0.001, 'RMS слышимый (момент не тише фона)', num(w.an.rms, 5));
    ok(w.an.maxJump <= 0.05 && w.an.jumps === 0, 'скачков между сэмплами выше 0,05 нет — хруста нет',
      num(w.an.maxJump, 5) + ' на ' + num(w.an.jumpAt, 2) + ' с, скачков: ' + w.an.jumps);
    ok(w.an.silent === 0, 'нет окон по 10 мс в тишине — обрывов внутри темы нет',
      'минимальное окно ' + num(w.an.winMin, 5) + ' на ' + num(w.an.winMinAt, 1) + ' с из ' + w.an.wins);
    ok(Math.abs(w.an.dc) < 0.001, 'постоянная составляющая близка к нулю', w.an.dc);
    ok(w.len >= 10 && w.len <= 20, 'звучит ' + w.len + ' с — не длиннее 20 (короткий момент)', w.len + ' с');
    ok(w.an.peak <= g.an.peak * 2.5, 'победа громче фона, но не «просто громче в 10 раз»',
      num(w.an.peak, 5) + ' против ' + num(g.an.peak, 5) + ' (×' + num(w.an.peak / g.an.peak, 2) + ')');
  }

  /* ---- C. живой путь: включение, окно, возврат ---- */
  console.log('C. Живой путь: включается, не глушится окном, сама возвращает фон');
  // Доводим партию до обычной игры: уведомления разбирает игровой цикл, а он идёт только в фазе игры.
  // Производство и первую точку берём теми же функциями движка, что и кнопки новой игры, и сразу
  // останавливаем время — моментом дальше управляем вручную (свежая игра на скорости 1 успевает
  // проскочить день-два и открыть своё окно, а оно бы перебило замер).
  await p.evaluate(() => { BK.App.newGame('Тест', 'normal'); BK.App.setSpeed(0); });
  await p.evaluate(() => {
    // доводим партию до обычной игры (иначе цикл не тикает и уведомления не разбираются):
    // производство и первая точка — теми же функциями движка, что и кнопки «Новая игра»
    const S = BK.App.state, E = BK.Engine;
    E.chooseProduction(S, (S.prodOffers || [])[0] && (S.prodOffers || [])[0].id);
    // помещение берём самое дешёвое и ровно то, на которое хватает денег: подборка помещений
    // обновляется каждый игровой день, и не всякая точка по карману на старте
    const fit = (S.offers || []).filter((o) => E.storeOpenCost(S, o).total <= S.cash)
      .sort((a, b) => E.storeOpenCost(S, a).total - E.storeOpenCost(S, b).total)[0];
    if (fit) E.rentStore(S, fit.id);
    S.ev.next = 9999;                        // случайное событие не должно открыть своё окно посреди замера
  });
  // «Начислить день» ровно так, как это делает цикл игры: движок меняет состояние, потом идёт обычный
  // разбор уведомлений (handleNotify) — но только пока время идёт (ui.speed > 0), как в самой игре.
  await p.waitForTimeout(700);
  let mm = await mus(p);
  ok(mm.level > 0.05 && (await mood(p)) === 'game', 'фон игры играет как обычно', num(mm.level, 5));
  ok((await p.evaluate(() => BK.Sound.music('victory'))) === 'victory', 'music(\'victory\') включает победную тему');
  await p.waitForTimeout(1500);
  mm = await mus(p);
  let d = await diag(p);
  ok(mm.sounding >= 3, 'победная тема играет', mm.sounding + ' голосов, ноты: ' + json(mm.notes));
  ok(mm.cut >= 3300 && mm.cut <= 3500, 'слышен яркий тембр победы (срез ~3400 Гц)', mm.cut);
  ok(mm.level > 0.065, 'момент звучит громче фона (0,069 против 0,06)', num(mm.level, 5));
  ok(d.moment === 'victory' && d.momentLeft > 10, 'планировщик знает: идёт момент победы, конец через ' + d.momentLeft + ' с');
  await p.click('[data-act="settings"]');
  await p.waitForTimeout(1500);
  d = await diag(p);
  ok(d.duck === true, 'окно открыто (музыка «под окном»)');
  ok(d.bus > 0.065, 'под открытым окном победная тема НЕ приглушается (это событие, не фон)', num(d.bus, 5));
  await p.waitForTimeout(17000);
  d = await diag(p);
  const backMood = await mood(p);
  mm = await mus(p);
  ok(backMood === 'game' && d.moment === 0, 'через ~17 с тема сама вернула обычную музыку', backMood + ', moment=' + d.moment);
  ok(d.cut >= 2900 && d.cut <= 3100, 'вернулся и срез игровой темы', d.cut);
  ok(mm.sounding >= 3, 'обычная музыка играет', mm.sounding);
  ok(Math.abs(mm.level - 0.027) < 0.006, 'и ведёт себя как раньше: под окном приглушена до 45 %', num(mm.level, 5));
  await p.click('[data-act="closeModal"]');
  await p.waitForTimeout(1800);
  mm = await mus(p);
  ok(Math.abs(mm.level - 0.06) < 0.005, 'окно закрылось — фон вернулся на полную тихую громкость', num(mm.level, 5));
  await p.waitForTimeout(2500);
  ok((await mood(p)) === 'game', 'момент не зацикливается и не включается сам');

  /* ---- D. событие: победа по обороту ---- */
  console.log('D. Событие «победа по обороту» (то же уведомление S.notify:{type:"won"}, что разбирает app.js)');
  // «Победа по обороту» ровно так, как она приходит в игре: движок пересчитывает месяцы и ставит
  // уведомление S.notify:{type:'won'}, а цикл игры разбирает его (handleNotify → фанфара + тема + окно).
  // Скорость на этот момент возвращаем на 1 — иначе цикл не обрабатывает очередь уведомлений.
  // В игре уведомление о победе приходит из движка вместе с поднятым S.won (engine.js: оборот ≥ цели).
  // Здесь ставим то же поле сами — так проверяем путь уведомления, не трогая числа баланса.
  await p.evaluate(() => {
    const S = BK.App.state;
    S.won = true; S.wonDay = S.day;
    const h = S.history[S.history.length - 1];
    if (h) h.c1 = 6e9;                           // оборот Уфы за 12 месяцев
    S.cumRevenue = 5.5e9;
    S.notify.push({ type: 'won' });
    BK.App.setSpeed(1);
  });
  const gotWin = await waitMood(p, 'victory');
  ok(gotWin === 'victory', 'уведомление о победе включает победную тему', gotWin);
  d = await diag(p);
  const wonFlag = await p.evaluate(() => { const S = BK.App.state; return { won: !!S.won, notify: S.notify.length }; });
  const modalOpen = await p.evaluate(() => !!document.querySelector('#modal .modal'));
  ok(wonFlag.won, 'победа отмечена в состоянии игры (S.won)');
  ok(modalOpen, 'и открывается окно победы');
  ok(modalOpen && d.bus > 0.065, 'окно победы тему не глушит', num(d.bus, 5));
  await p.evaluate(() => BK.App.setSpeed(0));    // дальше время снова стоит: замер ручной

  /* ---- E. большое и мелкое не путаются ---- */
  console.log('E. Большое и мелкое: мелкие события тему не трогают и не путаются с победой');
  // Убираем окно победы: очередь уведомлений на паузе не разбирается, поэтому тем же способом,
  // каким её разбирает цикл, отдаём уже пустую очередь — и момент снимаем выключателем «Музыки».
  await p.evaluate(() => { BK.App.closeModal(); BK.App.state.notify = []; BK.Sound.setCat('music', false); BK.Sound.setCat('music', true); });
  await p.waitForTimeout(1200);
  ok((await mood(p)) === 'game', 'выключение/включение «Музыки» не оставляет момент висеть');
  const afterSmall = await p.evaluate(() => { BK.Sound.play('ribbon'); BK.Sound.play('fanfare'); return BK.Sound.music(); });
  ok(afterSmall === 'game', '«ленточка» открытия точки и веха музыку не переключают', afterSmall);
  await p.evaluate(() => BK.App.closeModal());
  await p.evaluate(() => { window.__calls = []; const P = BK.Sound.play; BK.Sound.__origPlay = P; BK.Sound.play = function (n, o) { window.__calls.push(n); return P.call(BK.Sound, n, o); }; });
  await p.evaluate(() => BK.Extras.openSummary());
  await p.waitForTimeout(500);
  ok((await mood(p)) === 'victory', 'итоги победившей партии — победная тема');
  await p.evaluate(() => BK.App.closeModal());
  await p.evaluate(() => { BK.Sound.setCat('music', false); BK.Sound.setCat('music', true); });
  await p.waitForTimeout(900);
  await p.evaluate(() => BK.Extras.openSummary());
  await p.waitForTimeout(400);
  const calls = await p.evaluate(() => window.__calls);
  ok(calls.indexOf('ribbon') >= 0, 'второй раз итоги звучат прежней «ленточкой» (тема — один раз)', json(calls));
  ok((await mood(p)) === 'game', 'и музыка осталась обычной');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');
  await p.context().close();

  /* ---- F. выключатели ---- */
  console.log('F. Выключатели: «Музыка» и общий звук');
  let p2 = await open(browser, { 'bk-ufa-sound-music': '0' });
  await gesture(p2);
  await p2.waitForTimeout(1200);
  let r = await p2.evaluate(() => ({ mood: BK.Sound.music('victory'), on: BK.Sound.diag().on }));
  mm = await mus(p2);
  ok(r.mood === 'game' && r.on === false, 'при выключенной «Музыке» победа не включает тему', json(r));
  ok(mm.totalOscs === 0 && mm.level === 0, 'ни одного узла и тишина', json({ oscs: mm.totalOscs, level: mm.level }));
  await p2.context().close();

  p2 = await open(browser, { 'bk-ufa-sound': '0' });
  await gesture(p2);
  await p2.waitForTimeout(1200);
  r = await p2.evaluate(() => ({ mood: BK.Sound.music('victory'), on: BK.Sound.diag().on }));
  mm = await mus(p2);
  ok(r.mood === 'game' && r.on === false, 'общий выключатель глушит и победную тему', json(r));
  ok(mm.totalOscs === 0, 'и узлов не создаёт', mm.totalOscs);
  await p2.context().close();

  await browser.close();
  console.log(bad ? '\nПОБЕДНАЯ ТЕМА: ' + bad + ' проблема(ы)' : '\nПОБЕДНАЯ ТЕМА: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
