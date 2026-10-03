/* qa/music8.js — фоновая музыка: офлайн-рендер в Chromium и ЧИСЛА, а не «на слух».
   Владелец: «фоновая музыка в прологе просто ужасная… есть скрипы и хрусты, надо вылечить».
   Поэтому проверяем звук не глазами, а замером: рендерим 44 секунды музыки пролога и игры через
   OfflineAudioContext и считаем:
     • пик (не больше 0,9) и RMS (музыка слышна, но тихая);
     • щелчки: max|s[i+1] − s[i]| и число скачков выше 0,05 (должно быть 0);
     • паузы и обрывы: окна по 10 мс — RMS не падает в ноль (нет участков тишины);
     • постоянная составляющая (DC) — близко к нулю;
     • щелчок на выключении: тем же замером ловим стоп музыки (плавная рампа против мгновенного нуля);
     • «дребезг» (биения): по всей петле ищем две равносильные гармоники в низком регистре ближе 12 Гц
       (окно Ханна + алгоритм Гёртцеля, без FFT) — прежний Cmaj7 держал B2 и C3 рядом и «хрустел»;
     • живой путь: настоящий AudioContext, ноты секвенсора идут, ошибок консоли нет.
   Ещё сверяем саму тему: темп 84–96 BPM, петля 40–70 с, у пролога регистр выше и громкость ниже.

   Запуск:
     export NODE_PATH=~/.bk-tools/node_modules
     node build.js && node qa/music8.js                    # «после» на текущем коде
     # «до» — на любой прежней сборке (тест сам увидит, что в ней нет BK.Sound.renderMusic,
     # и покрутит старый планировщик через тень currentTime):
     git worktree add /tmp/bk-old HEAD~1 && (cd /tmp/bk-old && node build.js)
     node qa/music8.js --page=/tmp/bk-old/dist/local.html

   Числа (44 с музыки на тему, оба рендера через общий MASTER 0,16 — как в игре):
     «до» (старые «пэды», 6 тянущихся голосов): игра — пик 0,01736, RMS 0,00460, макс. скачок 0,00037;
       пролог — пик 0,01821 (громче игры!), RMS 0,00471; выключение музыки давало скачок в 2,09 раза
       больше игрового; в прологе две равносильные гармоники 138 и 147 Гц (9 Гц биений = «дребезг»);
     «после» (чиптюн): игра — пик 0,01273, RMS 0,00497, макс. скачок 0,00309 (это края квадрата, щелчков
       выше 0,05 нет); пролог — пик 0,00765, RMS 0,00292; выключение музыки не добавляет скачка (в 1,00 раза);
       близких равносильных низких гармоник нет (ближайшая пара 28 и 45 Гц). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = {};
process.argv.slice(2).forEach((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const PAGE = path.resolve(args.page || path.join(__dirname, '..', 'dist', 'local.html'));
const SEC = +(args.sec || 44);
const JUMP_LIMIT = 0.05;      // порог «щелчка» из задания
const PEAK_LIMIT = 0.9;

let bad = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ок   ' : '  БЕДА ') + msg + (extra === undefined ? '' : ' → ' + extra)); if (!cond) bad++; };
const num = (v, n) => (v === undefined || v === null ? String(v) : Number(v).toFixed(n));
const json = JSON.stringify;

// ---- что считает страница ----
function pageTools() {
  // Живой путь проверяем на НАСТОЯЩЕМ AudioContext: оборачиваем конструктор, чтобы знать его состояние
  // и сколько осцилляторов создал секвенсор (в офлайне мы это не увидим).
  (function () {
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (!Orig) return;
    window.__acs = [];
    const W = function () {
      const c = new Orig();
      c.__osc = 0;
      const co = c.createOscillator.bind(c);
      c.createOscillator = function () { c.__osc++; return co(); };
      window.__acs.push(c);
      return c;
    };
    W.prototype = Orig.prototype;
    window.AudioContext = W; window.webkitAudioContext = W;
  })();
  window.__live = async function (sec) {
    BK.Sound.arm();
    document.dispatchEvent(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, sec * 1000));
    const c = window.__acs[0] || null;
    return { ctxs: window.__acs.length, state: c && c.state, oscs: c ? c.__osc : 0,
      advanced: c ? +c.currentTime.toFixed(2) : 0, music: BK.Sound.music() };
  };
  // метрики буфера: пик, RMS, скачки, тишина по окнам, DC, пульсация низа, «яркость»
  window.__an = function (buf, from, to) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const i0 = Math.floor((from || 0) * sr), i1 = Math.min(d.length, Math.floor((to || buf.duration) * sr));
    let peak = 0, sq = 0, dc = 0, maxJump = 0, jumpAt = 0, jumps = 0, n = 0, cross = 0, prev = 0;
    for (let i = i0; i < i1; i++) {
      const v = d[i], a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sq += v * v; dc += v; n++;
      if (i > i0 && ((v >= 0) !== (prev >= 0))) cross++;
      prev = v;
    }
    for (let i = i0; i < i1 - 1; i++) {
      const j = Math.abs(d[i + 1] - d[i]);
      if (j > maxJump) { maxJump = j; jumpAt = i / sr; }
      if (j > 0.05) jumps++;
    }
    // окна по 10 мс: RMS не должен падать в ноль (нет участков тишины и обрывов)
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
    // пульсация низа: ФНЧ ~180 Гц (два однополюсника) → огибающая по 20 мс → глубина и частота
    const a = 1 - Math.exp(-2 * Math.PI * 180 / sr);
    let y1 = 0, y2 = 0, acc = 0, cnt = 0; const env = [], ew = Math.round(0.02 * sr);
    for (let i = i0; i < i1; i++) {
      y1 += a * (d[i] - y1); y2 += a * (y1 - y2); acc += y2 * y2;
      if (++cnt === ew) { env.push(Math.sqrt(acc / cnt)); acc = 0; cnt = 0; }
    }
    const srt = env.slice().sort((x, y) => x - y);
    const med = srt[srt.length >> 1] || 0;
    const hi = srt[Math.min(srt.length - 1, Math.floor(srt.length * 0.97))] || 0;
    const lo = srt[Math.floor(srt.length * 0.03)] || 0;
    let ecross = 0;
    for (let i = 1; i < env.length; i++) if ((env[i - 1] - med) * (env[i] - med) < 0) ecross++;
    return {
      sec: +(n / sr).toFixed(2),
      peak: +peak.toFixed(5), rms: +Math.sqrt(sq / n).toFixed(5), dc: +(dc / n).toFixed(6),
      maxJump: +maxJump.toFixed(5), jumpAt: +jumpAt.toFixed(2), jumps: jumps,
      winMin: +winMin.toFixed(5), winMinAt: +winMinAt.toFixed(1), silent: silent, wins: wins,
      pulseDepth: med > 1e-7 ? +((hi - lo) / med).toFixed(2) : 0,
      pulseHz: env.length > 4 ? +(ecross / 2 / (env.length * ew / sr)).toFixed(1) : 0,
      zcrHz: +(cross / 2 / (n / sr)).toFixed(0),
    };
  };
  // биения в низком регистре: ищем ПО ВСЕЙ ПЕТЛЕ пару равносильных гармоник в 90–260 Гц, стоящих ближе 12 Гц.
  // Окна по 1,5 с (окно Ханна) с шагом 3 с, частоты 60–700 Гц шагом 1 Гц (алгоритм Гёртцеля) — без FFT.
  // Считаем только слышимые гармоники (не тише 25 дБ от самой громкой в окне): иначе «парой» становятся
  // два бугорка шума на краю полосы.
  window.__beat = function (buf, from, to) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const W = 1.5, freqs = [];
    for (let f = 60; f <= 700; f += 1) freqs.push(f);
    const recs = [];
    for (let t0 = from; t0 + W <= to; t0 += 3) {
      const i0 = Math.floor(t0 * sr), N = Math.floor(W * sr);
      const x = new Float32Array(N);
      for (let i = 0; i < N; i++) x[i] = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      const mg = freqs.map((f) => {
        const w = 2 * Math.PI * f / sr, coeff = 2 * Math.cos(w);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const s0 = x[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
        return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - coeff * s1 * s2));
      });
      let gmax = 0;
      for (let i = 0; i < mg.length; i++) if (mg[i] > gmax) gmax = mg[i];
      const audible = gmax * Math.pow(10, -25 / 20);
      const loc = [];   // локальные максимумы в полосе низа; склон того же тона за второй пик не считаем
      for (let i = 1; i < mg.length - 1; i++) {
        if (freqs[i] < 90 || freqs[i] > 260) continue;
        if (mg[i] > mg[i - 1] && mg[i] >= mg[i + 1] && mg[i] >= audible) loc.push({ f: freqs[i], m: mg[i] });
      }
      if (loc.length < 2) continue;
      loc.sort((a, b) => b.m - a.m);
      const a = loc[0];
      let b = null;
      for (let i = 1; i < loc.length; i++) { if (Math.abs(loc[i].f - a.f) >= 6) { b = loc[i]; break; } }
      if (!b) continue;
      const db = 20 * Math.log10(a.m / Math.max(1e-12, b.m));
      recs.push({ at: +t0.toFixed(1), f1: a.f, f2: b.f, gapHz: Math.abs(a.f - b.f), db: +db.toFixed(1) });
    }
    // сравнимая пара — вторая гармоника не тише первой на 12 дБ; более слабые не «дребезжат», а просто фон
    const cmp = recs.filter((r) => r.db <= 12);
    if (!cmp.length) return { wins: recs.length, pairs: 0, gapHz: null, db: null, beat: false };
    let worst = cmp[0];
    cmp.forEach((r) => { if (r.gapHz < worst.gapHz) worst = r; });
    return { wins: recs.length, pairs: cmp.length, at: worst.at, f1: worst.f1, f2: worst.f2,
      gapHz: worst.gapHz, db: worst.db, beat: worst.gapHz <= 12 };
  };
  window.__legacy = async function (mood, seconds, srIn, stopAt) {
    const sr = srIn || 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const c = new OAC(1, Math.ceil(seconds * sr), sr);
    let T = 0;
    Object.defineProperty(c, 'currentTime', { configurable: true, get: () => T });
    const gains = [];
    const cg = c.createGain.bind(c);
    c.createGain = function () { const g = cg(); const oc = g.connect.bind(g); g.__out = null; g.connect = (n) => { g.__out = n; return oc(n); }; gains.push(g); return g; };
    c.resume = () => Promise.resolve();
    window.AudioContext = function () { return c; };
    window.webkitAudioContext = window.AudioContext;
    try { localStorage.removeItem('bk-ufa-sound'); localStorage.removeItem('bk-ufa-sound-music'); } catch (e) {}
    BK.Sound.music(mood === 'prologue' ? 'prologue' : 'game');
    BK.Sound.arm();
    document.dispatchEvent(new Event('pointerdown'));
    for (let t = 0.12; t < (stopAt || seconds + 1); t += 2.0) { T = t; await new Promise((r) => setTimeout(r, 620)); }
    const bus = gains.filter((g) => g.__out && g.__out.frequency && g.__out.Q)[0] || null;
    if (!bus) return { err: 'шина музыки не найдена' };
    if (stopAt) { T = stopAt; bus.gain.cancelScheduledValues(stopAt); bus.gain.setValueAtTime(0, stopAt); }
    else { T = seconds + 1; bus.gain.setTargetAtTime(0, seconds - 0.3, 0.25); }
    return await c.startRendering();
  };
}

(async () => {
  if (!fs.existsSync(PAGE)) { console.error('Нет сборки: ' + PAGE + '\nСначала node build.js'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.addInitScript(pageTools);
  await p.goto('file://' + PAGE);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.reload();

  const isNew = await p.evaluate(() => !!(BK.Sound && typeof BK.Sound.renderMusic === 'function'));
  console.log('Страница: ' + PAGE);
  console.log(isNew ? 'Код: НОВЫЙ (BK.Sound.renderMusic — офлайн-рендер из модуля)'
    : 'Код: СТАРЫЙ (драйвер через тень currentTime; в старом коде renderMusic нет)');
  console.log('Музыка: ' + (SEC) + ' с на тему\n');

  // Старый модуль держит AudioContext в замыкании: один рендер на страницу. Поэтому для старого кода
  // перед каждым замером страницу перезагружаем (для нового renderMusic это не нужно и не делается).
  const render = async (mood, sec, stopAt) => {
    if (!isNew) await p.reload();
    return p.evaluate(async (a) => {
      const buf = window.BK.Sound.renderMusic
        ? await window.BK.Sound.renderMusic(a.mood, a.sec, 44100, a.stopAt ? { stopAt: a.stopAt } : null)
        : await window.__legacy(a.mood, a.sec, 44100, a.stopAt);
      if (!buf) return { err: 'рендер вернул null' };
      if (buf.err) return buf;
      return window.__an(buf, a.from, a.to);
    }, { mood, sec, stopAt: stopAt || 0, from: stopAt ? 0.5 : 1.0, to: stopAt ? 11.4 : sec - 0.6 });
  };
  // биения в низком регистре — по всей петле (окна 3–42 с)
  const beating = async (mood) => {
    if (!isNew) await p.reload();
    return p.evaluate(async (a) => {
      const buf = window.BK.Sound.renderMusic
        ? await window.BK.Sound.renderMusic(a.mood, a.to + 0.6, 44100)
        : await window.__legacy(a.mood, a.to + 0.6, 44100);
      if (!buf || buf.err) return buf || { err: 'нет буфера' };
      return window.__beat(buf, a.from, a.to);
    }, { mood, from: 3, to: 42 });
  };

  const info = isNew ? await p.evaluate(() => ({ game: BK.Sound.musicInfo('game'), prologue: BK.Sound.musicInfo('prologue') })) : null;

  /* ---- 1. музыка игры ---- */
  console.log('A. Тема игры');
  const g = await render('game', SEC, 0);
  if (g.err) { ok(false, 'рендер темы игры', g.err); } else {
    console.log('   ' + json(g));
    ok(g.peak > 0.001, 'музыка слышна (пик больше 0,001)', num(g.peak, 5));
    ok(g.peak <= PEAK_LIMIT, 'пик не больше ' + PEAK_LIMIT + ' (перегруза нет)', num(g.peak, 5));
    ok(g.rms > 0.0008, 'RMS слышимый, но тихий', num(g.rms, 5));
    ok(g.maxJump <= JUMP_LIMIT, 'максимальный скачок между сэмплами не больше ' + JUMP_LIMIT, num(g.maxJump, 5) + ' на ' + num(g.jumpAt, 2) + ' с');
    ok(g.jumps === 0, 'скачков выше ' + JUMP_LIMIT + ': 0 (щелчков нет)', g.jumps);
    ok(g.silent === 0, 'нет окон по 10 мс в тишине (обрывов нет)', 'минимальное окно ' + num(g.winMin, 5) + ' на ' + num(g.winMinAt, 1) + ' с из ' + g.wins);
    ok(Math.abs(g.dc) < 0.001, 'постоянная составляющая близка к нулю', g.dc);
  }

  /* ---- 2. музыка пролога ---- */
  console.log('B. Тема пролога (отдельная, выше и мягче)');
  const pr = await render('prologue', SEC, 0);
  if (pr.err) { ok(false, 'рендер темы пролога', pr.err); } else {
    console.log('   ' + json(pr));
    ok(pr.peak > 0.001, 'музыка слышна (пик больше 0,001)', num(pr.peak, 5));
    ok(pr.peak <= PEAK_LIMIT, 'пик не больше ' + PEAK_LIMIT, num(pr.peak, 5));
    ok(pr.maxJump <= JUMP_LIMIT, 'максимальный скачок не больше ' + JUMP_LIMIT, num(pr.maxJump, 5));
    ok(pr.jumps === 0, 'скачков выше ' + JUMP_LIMIT + ': 0', pr.jumps);
    ok(pr.silent === 0, 'нет окон в тишине', 'минимальное окно ' + num(pr.winMin, 5));
    ok(Math.abs(pr.dc) < 0.001, 'DC близко к нулю', pr.dc);
    ok(pr.peak <= g.peak * 1.05, 'пролог не громче игры', num(pr.peak, 5) + ' ≤ ' + num(g.peak, 5));
  }

  /* ---- 3. выключение музыки: щелчок на стопе ---- */
  console.log('C. Выключение музыки (стоп на 5,2 / 6,0 / 6,8-й секунде против такой же музыки без стопа)');
  const ref12 = await render('game', 12, 0);
  const stops = [];
  for (const at of [5.2, 6.0, 6.8]) stops.push(await render('game', 12, at));
  if (ref12.err || stops.some((s) => s.err)) { ok(false, 'рендер стопа', ref12.err || 'ошибка рендера'); } else {
    const worst = stops.reduce((a, b) => (b.maxJump > a.maxJump ? b : a));
    const grow = worst.maxJump / Math.max(1e-9, ref12.maxJump);
    console.log('   без стопа: maxJump ' + num(ref12.maxJump, 5)
      + ' | стопы: ' + stops.map((s) => num(s.maxJump, 5)).join(' / ')
      + ' | худший в ' + num(grow, 2) + ' раза больше, на ' + num(worst.jumpAt, 2) + ' с');
    ok(worst.maxJump <= JUMP_LIMIT, 'на выключении скачок не больше ' + JUMP_LIMIT, num(worst.maxJump, 5));
    if (isNew) {
      ok(grow <= 1.25, 'стоп не добавляет разрыва: скачок не вырос больше чем в 1,25 раза', num(grow, 2));
      ok(worst.maxJump <= 0.006, 'стоп плавный: скачок ≤ 0,006 (в старом коде мгновенный ноль давал больше)', num(worst.maxJump, 5));
    } else {
      console.log('   (старый код: мгновенный setValueAtTime(0) на шине — это и есть щелчок на выключении:'
        + ' ' + num(worst.maxJump, 5) + ' против ' + num(ref12.maxJump, 5) + ' в игре, в ' + num(grow, 1) + ' раза)');
    }
  }

  /* ---- 4. тема: темп, петля, регистр ---- */
  console.log('D. Тема по паспорту');
  if (!info) {
    console.log('   (старый код: паспорта нет — петля Fmaj7–Dm7–G6–Cmaj7, 4 аккорда по 12 с ≈ 48 с, мелодии нет)');
    ok(g.peak > 0.001 && pr.peak > 0.001, 'старые «пэды» звучат (сравнение «до»)');
  } else {
    console.log('   игра:     ' + json(info.game));
    console.log('   пролог:   ' + json(info.prologue));
    [['игра', info.game], ['пролог', info.prologue]].forEach(([name, t]) => {
      ok(t.bpm >= 84 && t.bpm <= 96, name + ': неспешный темп 84–96 BPM', t.bpm);
      ok(t.loopSec >= 40 && t.loopSec <= 70, name + ': петля 40–70 с', t.loopSec + ' с');
      ok(t.bars >= 16, name + ': фраза не короче 16 тактов', t.bars + ' тактов по ' + t.beats + '/4');
    });
    ok(info.prologue.leadAvg > info.game.leadAvg + 4, 'в прологе регистр выше (мелодия выше на ' + num(info.prologue.leadAvg - info.game.leadAvg, 1) + ' полутона)', num(info.game.leadAvg, 1) + ' → ' + num(info.prologue.leadAvg, 1));
    ok(info.prologue.gain < info.game.gain, 'пролог тише игры', info.prologue.gain + ' < ' + info.game.gain);
    ok(info.prologue.cut < info.game.cut, 'в прологе тембр мягче (срез фильтра ниже)', info.prologue.cut + ' < ' + info.game.cut);
    ok(json(info.prologue) !== json(info.game), 'пролог — своя тема, а не та же петля');
  }

  /* ---- 5. дребезг: биения двух близких низких гармоник ---- */
  console.log('E. Биения в низком регистре (вся петля, полоса 90–260 Гц)');
  const bg = await beating('game');
  const bp = await beating('prologue');
  if (bg.err || bp.err) { ok(false, 'замер биений', (bg.err || bp.err)); } else {
    const pair = (b) => (b.pairs ? (b.f1 + '/' + b.f2 + ' Гц = ' + b.gapHz + ' Гц при ' + b.db + ' дБ') : 'сравнимых пар нет');
    console.log('   игра:   ' + json(bg) + '  → ' + pair(bg));
    console.log('   пролог: ' + json(bp) + '  → ' + pair(bp));
    ok(!bg.beat && !bp.beat, 'двух равносильных низких гармоник ближе 12 Гц нет — «дребезга» нет', pair(bg) + '; ' + pair(bp));
    const far = (b) => b.gapHz === null || b.gapHz >= 12;
    if (isNew) ok(far(bg) && far(bp), 'самая близкая сравнимая пара низких гармоник дальше 12 Гц или её нет',
      num(bg.gapHz, 1) + ' / ' + num(bp.gapHz, 1));
    else console.log('   (старый код: ' + pair(bg) + ' — это и есть «хруст»)');
  }

  /* ---- 6. живой путь: настоящий AudioContext, ноты идут, ошибок нет ---- */
  console.log('F. Живой путь (настоящий AudioContext)');
  if (!isNew) await p.reload();
  const lv = await p.evaluate(() => window.__live(5));
  console.log('   ' + json(lv));
  ok(lv.ctxs === 1 && (lv.state === 'running' || lv.state === 'suspended'), 'аудиоконтекст создан после жеста', lv.state);
  ok(lv.advanced > 0, 'время в аудиоконтексте идёт', lv.advanced + ' с');
  ok(isNew ? lv.oscs >= 20 : lv.oscs >= 6, 'секвенсор играет ноты (осцилляторы создаются)',
    lv.oscs + (isNew ? ' за 5 с' : ' голосов старой подложки'));
  ok(lv.music === 'game', 'настроение — игра', lv.music);
  const live = await p.evaluate(() => (typeof BK.Sound.catVal === 'function' ? BK.Sound.catVal('music') : null));
  ok(live === true, 'категория «Музыка» по умолчанию включена');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');

  await browser.close();
  console.log(bad ? '\nМУЗЫКА (замер): ' + bad + ' проблема(ы)' : '\nМУЗЫКА (замер): всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
