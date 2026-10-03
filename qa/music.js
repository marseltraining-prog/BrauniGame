/* qa/music.js — фоновая музыка (src/sound.js), сценарий без звуковой карты.
   AudioContext подменяется «счётчиком»: видно, сколько узлов создано и сколько нот звучит сейчас,
   какой уровень у подшины, какие частоты и какая полоса фильтра.
   Проверяем ПОВЕДЕНИЕ (оно не должно меняться от переписывания музыки):
     до жеста музыки нет; после жеста — тихая подшина и живые ноты; ноты меняются, старые освобождаются
     (звучащих нот мало, созданных много — секвенсор, а не утечка узлов); выключенная «Музыка» = 0 узлов;
     скрытая вкладка = тишина; приглушение под окном; общий выключатель; звуки игры работают;
     в прологе — своя тема (другая тональность и регистр выше), после пролога возвращается игровая.
   Числа «до/после» по самому звуку (пик, RMS, щелчки, биения) — в qa/music8.js.
   Запуск: export NODE_PATH=~/.bk-tools/node_modules && node build.js && node qa/music.js  */
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
let bad = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ок   ' : '  БЕДА ') + msg + (extra === undefined ? '' : ' → ' + extra)); if (!cond) bad++; };

// Подмена WebAudio: те же имена методов, но узлы только считаются, а параметры — небольшая
// модель автоматизации (setValueAtTime / linearRamp / setTargetAtTime), чтобы знать текущий уровень.
function fakeAudio() {
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
  // снимок музыкальной подшины: это gain, который идёт в фильтр (у звуков gain идёт сразу в master).
  // Подшина: gain → фильтр → (лимитер) → master. Ноты подключаются к подшине напрямую.
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
    r.freqSegs = live.reduce((n, o) => n + o.frequency.segs.length, 0);
    // цепочка после фильтра: soft-лимитер (DynamicsCompressor) — обещали мягкий лимитер от перегруза
    const tail = bus.out[0].out || [];
    for (let i = 0; i < tail.length; i++) if (tail[i].kind === 'dyn') r.underLimit++;
    return r;
  };
}

async function open(browser, store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.addInitScript(fakeAudio);
  if (store) await p.addInitScript((s) => { try { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } catch (e) {} }, store);
  await p.goto(URL);
  if (!store) await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); // чистая настройка звука
  return p;
}
const gesture = (p) => p.keyboard.press('Tab'); // первый жест игрока: клавиша (слушатель — на document)
const mus = (p) => p.evaluate(() => window.__mus());

(async () => {
  const browser = await chromium.launch();

  /* ---- A. обычная игра ---- */
  console.log('A. первый жест и фон');
  let p = await open(browser);
  let m = await mus(p);
  ok(m.ctxs === 0 && m.totalOscs === 0, 'до жеста игрока музыки нет (AudioContext не создаётся)', JSON.stringify(m));
  await p.waitForTimeout(300); await gesture(p);   // первый жест
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.sounding >= 3 && m.sounding <= 14, 'после жеста звучат несколько нот (мелодия + бас + арпеджио + тик)', m.sounding + ' нот: ' + JSON.stringify(m.notes));
  ok(m.level > 0.05 && m.level <= 0.0601, 'уровень подшины поднялся до тихих 0,06', m.level);
  ok(m.cut >= 2900 && m.cut <= 3100, 'в игре срез фильтра ~3000 Гц (квадрат не «хрустит» на верхах)', m.cut);
  ok(m.underLimit >= 1, 'после фильтра стоит мягкий лимитер (DynamicsCompressor)', m.underLimit);
  const gameMed = m.medHz;

  const before = await mus(p);
  await p.waitForTimeout(13000);                   // 13 с — это ~40 нот секвенсора
  const after = await mus(p);
  ok(after.created > before.created + 20, 'секвенсор играет ноты: создано новых осцилляторов', before.created + ' → ' + after.created);
  ok(after.released > before.released + 20, 'и освобождает их (stop() после нуля огибающей)', before.released + ' → ' + after.released);
  ok(after.sounding <= 14, 'звучащих нот одновременно мало — узлы не копятся', after.sounding);
  ok(after.totalOscs < 400, 'за 14 с создано меньше 400 узлов (нет утечки)', after.totalOscs);
  ok(JSON.stringify(after.notes) !== JSON.stringify(before.notes), 'ноты за это время сменились', JSON.stringify(before.notes) + ' → ' + JSON.stringify(after.notes));

  console.log('A2. звуки игры не сломаны');
  let sfx = await p.evaluate(() => ({ coin: BK.Sound.play('coin'), warn: BK.Sound.play('warn'), denied: BK.Sound.play('нет-такого') }));
  const afterSfx = await mus(p);
  ok(sfx.coin === true && sfx.warn === true && sfx.denied === false, 'звуки играют как раньше', JSON.stringify(sfx));
  ok(afterSfx.totalOscs > after.totalOscs, 'звуковые узлы создаются отдельно от музыкальных', after.totalOscs + ' → ' + afterSfx.totalOscs);
  ok(afterSfx.sounding <= 14, 'музыка при этом не тронута');

  console.log('A3. окно настроек: тише под модальным окном, выключатель «Музыка»');
  await p.evaluate(() => BK.App.newGame('Тест', 'normal'));
  await p.waitForTimeout(500);
  await p.click('[data-act="settings"]');
  await p.waitForTimeout(2500);
  m = await mus(p);
  ok(Math.abs(m.level - 0.027) < 0.004, 'под открытым окном музыка приглушена (0,027 ≈ 45 %)', m.level);
  ok(m.sounding >= 3, 'но не остановлена', m.sounding);
  const rows = await p.evaluate(() => document.querySelectorAll('[data-catbtn][data-cat="music"]').length);
  ok(rows === 2, 'в настройках есть строка «Музыка» (Вкл/Выкл)', rows);
  await p.click('[data-cat="music"][data-arg="0"]');
  await p.waitForTimeout(1600);
  m = await mus(p);
  ok(m.level < 0.001 && m.sounding === 0, 'выключили «Музыку» — уровень 0 и звучащих нот нет', JSON.stringify({ level: m.level, sounding: m.sounding }));
  const stored = await p.evaluate(() => localStorage.getItem('bk-ufa-sound-music'));
  ok(stored === '0', 'выбор записан в localStorage[bk-ufa-sound-music]', stored);
  await p.click('[data-cat="music"][data-arg="1"]');
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.sounding >= 3 && Math.abs(m.level - 0.027) < 0.006, 'включили обратно — снова играет (уже тише, окно открыто)', JSON.stringify({ sounding: m.sounding, level: m.level }));
  await p.click('[data-act="closeModal"]');
  await p.waitForTimeout(1800);
  m = await mus(p);
  ok(m.level > 0.05, 'окно закрылось — музыка вернулась на полную тихую громкость', m.level);

  console.log('A4. скрытая вкладка');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(600);
  m = await mus(p);
  ok(m.sounding === 0 && m.level < 0.001, 'в скрытой вкладке тишина и звучащих нот нет', JSON.stringify({ sounding: m.sounding, level: m.level }));
  const off = await p.evaluate(() => BK.Sound.play('coin'));
  ok(off === false, 'и звуки в скрытой вкладке не играют');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(1400);
  m = await mus(p);
  ok(m.sounding >= 3 && m.level > 0.05, 'вернулись во вкладку — музыка играет снова', JSON.stringify({ sounding: m.sounding, level: m.level }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === true, 'звук игры после возврата работает');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');
  await p.context().close();

  /* ---- B. пролог: своя тема ---- */
  console.log('B. пролог «Бариста» — своя тема, выше и мягче');
  p = await open(browser);
  await gesture(p);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ game: BK.Sound.musicInfo('game'), prologue: BK.Sound.musicInfo('prologue') }));
  ok(info.game.bpm >= 84 && info.game.bpm <= 96 && info.prologue.bpm >= 84 && info.prologue.bpm <= 96,
    'неспешный темп у обеих тем (84–96 BPM)', info.game.bpm + ' / ' + info.prologue.bpm);
  ok(info.prologue.leadAvg > info.game.leadAvg, 'мелодия пролога выше по регистру', info.game.leadAvg + ' → ' + info.prologue.leadAvg);
  ok(info.prologue.key !== info.game.key, 'у пролога своя тональность (не «та же петля на тон выше»)', info.game.key + ' / ' + info.prologue.key);
  await p.evaluate(() => BK.PrologueUI.begin('Тест', 'normal', {}));
  await p.waitForTimeout(4000);
  m = await mus(p);
  ok(m.sounding >= 3, 'в прологе музыка играет', m.sounding);
  ok(m.cut <= 2400, 'тембр в прологе мягче (фильтр ~2300 Гц против 3000)', m.cut);
  const proMed = m.medHz;
  ok((await p.evaluate(() => BK.Sound.music())) === 'prologue', 'настроение переключилось на пролог');
  journalMed(gameMed, proMed);
  await p.evaluate(() => BK.PrologueUI.close());
  await p.waitForTimeout(3500);
  m = await mus(p);
  ok(m.cut >= 2900 && m.sounding >= 3, 'вышли из пролога — вернулась игровая тема', JSON.stringify({ cut: m.cut, sounding: m.sounding }));
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');
  await p.context().close();

  /* ---- C. музыка выключена в настройках ---- */
  console.log('C. музыка выключена в localStorage — узлов нет');
  p = await open(browser, { 'bk-ufa-sound-music': '0' });
  await gesture(p);
  await p.waitForTimeout(1500);
  m = await mus(p);
  ok(m.totalOscs === 0 && m.level === 0, 'при выключенной музыке не создано ни одного узла', JSON.stringify({ oscs: m.totalOscs, level: m.level }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === true, 'звуки игры при этом работают');
  await p.context().close();

  /* ---- D. общий выключатель ---- */
  console.log('D. общий звук выключен — музыки нет');
  p = await open(browser, { 'bk-ufa-sound': '0' });
  await gesture(p);
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.totalOscs === 0, 'общий выключатель глушит и музыку', JSON.stringify({ oscs: m.totalOscs, sounding: m.sounding }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === false, 'и звуки не играют');
  await p.context().close();

  await browser.close();
  console.log(bad ? '\nМУЗЫКА: ' + bad + ' проблема(ы)' : '\nМУЗЫКА: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// живой регистр: медиана звучащих частот — просто для сведения (мгновенный снимок случаен;
// надёжная проверка регистра — musicInfo().leadAvg выше и «яркость» zcrHz в qa/music8.js)
function journalMed(gameMed, proMed) {
  console.log('  инфо  медиана звучащих частот сейчас: игра ' + gameMed + ' Гц, пролог ' + proMed + ' Гц');
}
