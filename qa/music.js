/* qa/music.js — фоновая музыка (src/sound.js), сценарий без звуковой карты.
   AudioContext подменяется «счётчиком»: видно, сколько узлов создано, какой уровень у подложки,
   какие ноты звучат. Проверяем: до жеста музыки нет; после жеста — 6 узлов и тихий уровень;
   аккорд меняется, но НОВЫХ узлов нет; выключенная «Музыка» = 0 узлов; скрытая вкладка = тишина;
   звуки игры при этом работают; настроение в прологе теплее.
   Запуск: export NODE_PATH=~/.bk-tools/node_modules && node qa/music.js  */
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
  const A = { count: 0, oscs: [], gains: [], filters: [], srcs: [], ctx: null, started: 0, stopped: 0 };
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
    createBufferSource() { return new S(); }
    createBuffer(ch, len, rate) { return { numberOfChannels: ch, length: len, sampleRate: rate, getChannelData: () => new Float32Array(len) }; }
  }
  window.AudioContext = C; window.webkitAudioContext = C;
  // снимок музыкальной подложки: шина — это gain, который идёт в фильтр (у звуков gain идёт сразу в master)
  window.__mus = function () {
    const bus = A.gains.filter((g) => g.out.length && g.out[0].kind === 'filter')[0] || null;
    const r = { ctxs: A.count, totalOscs: A.oscs.length, totalGains: A.gains.length, totalFilters: A.filters.length, live: 0, running: 0, level: 0, target: null, cut: null, notes: [], freqSegs: 0 };
    if (!bus) return r;
    const live = A.oscs.filter((o) => o.out.length && o.out[0].out.indexOf(bus) >= 0);
    r.live = live.length;
    r.running = live.filter((o) => o._stop == null || o._stop > now()).length;
    r.level = +bus.gain.at(now()).toFixed(5);
    const last = bus.gain.segs[bus.gain.segs.length - 1];
    r.target = last && last.k === 'tgt' ? +last.target.toFixed(4) : null;
    r.cut = +bus.out[0].frequency.at(now()).toFixed(0);
    r.notes = live.map((o) => Math.round(o.frequency.at(now())));
    r.freqSegs = live.reduce((n, o) => n + o.frequency.segs.length, 0);
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
  ok(m.ctxs === 0 && m.live === 0, 'до жеста игрока музыки нет (AudioContext не создаётся)', JSON.stringify(m));
  await p.waitForTimeout(300); await gesture(p);   // пролог/старт: первый жест
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.live === 6 && m.running === 6, 'после жеста играют 6 голосов (4 пэда + бас + «блеск»)', JSON.stringify(m.notes));
  ok(m.level > 0.05 && m.level <= 0.0601, 'уровень подложки поднялся до тихих 0,06', m.level);
  ok(m.cut >= 1000 && m.cut <= 1200, 'в игре тёмный тембр (фильтр ~1150 Гц)', m.cut);

  const before = await mus(p);
  await p.waitForTimeout(13000);                   // проходит аккорд (12 с)
  const after = await mus(p);
  ok(after.totalOscs === before.totalOscs && after.live === 6, 'на смене аккорда новых узлов не создано', before.totalOscs + ' → ' + after.totalOscs);
  ok(after.freqSegs > before.freqSegs, 'аккорд действительно сменился (новые ноты запланированы)', before.freqSegs + ' → ' + after.freqSegs);
  ok(JSON.stringify(after.notes) !== JSON.stringify(before.notes), 'ноты другие', before.notes + ' → ' + after.notes);

  console.log('A2. звуки игры не сломаны');
  let sfx = await p.evaluate(() => ({ coin: BK.Sound.play('coin'), warn: BK.Sound.play('warn'), denied: BK.Sound.play('нет-такого') }));
  const afterSfx = await mus(p);
  ok(sfx.coin === true && sfx.warn === true && sfx.denied === false, 'звуки играют как раньше', JSON.stringify(sfx));
  ok(afterSfx.totalOscs > after.totalOscs, 'звуковые узлы создаются отдельно от музыкальных', after.totalOscs + ' → ' + afterSfx.totalOscs);
  ok(afterSfx.live === 6, 'музыка при этом не тронута');

  console.log('A3. окно настроек: тише под модальным окном, выключатель «Музыка»');
  await p.evaluate(() => BK.App.newGame('Тест', 'normal'));
  await p.waitForTimeout(500);
  await p.click('[data-act="settings"]');
  await p.waitForTimeout(2000);
  m = await mus(p);
  ok(Math.abs(m.level - 0.027) < 0.004, 'под открытым окном музыка приглушена (0,027 ≈ 45 %)', m.level);
  ok(m.live === 6, 'но не остановлена');
  const rows = await p.evaluate(() => document.querySelectorAll('[data-catbtn][data-cat="music"]').length);
  ok(rows === 2, 'в настройках есть строка «Музыка» (Вкл/Выкл)', rows);
  await p.click('[data-cat="music"][data-arg="0"]');
  await p.waitForTimeout(1600);
  m = await mus(p);
  ok(m.level < 0.001 && m.live === 0 && m.running === 0, 'выключили «Музыку» — уровень 0 и узлы остановлены', JSON.stringify({ level: m.level, live: m.live }));
  const stored = await p.evaluate(() => localStorage.getItem('bk-ufa-sound-music'));
  ok(stored === '0', 'выбор записан в localStorage[bk-ufa-sound-music]', stored);
  await p.click('[data-cat="music"][data-arg="1"]');
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.live === 6 && Math.abs(m.level - 0.027) < 0.006, 'включили обратно — снова играет (уже тише, окно открыто)', JSON.stringify({ live: m.live, level: m.level }));
  await p.click('[data-act="closeModal"]');
  await p.waitForTimeout(1800);
  m = await mus(p);
  ok(m.level > 0.05, 'окно закрылось — музыка вернулась на полную тихую громкость', m.level);

  console.log('A4. скрытая вкладка');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  m = await mus(p);
  ok(m.live === 0 && m.running === 0 && m.level < 0.001, 'в скрытой вкладке тишина и узлы освобождены', JSON.stringify({ live: m.live, level: m.level }));
  const off = await p.evaluate(() => BK.Sound.play('coin'));
  ok(off === false, 'и звуки в скрытой вкладке не играют');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(1400);
  m = await mus(p);
  ok(m.live === 6 && m.level > 0.05, 'вернулись во вкладку — музыка играет снова', JSON.stringify({ live: m.live, level: m.level }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === true, 'звук игры после возврата работает');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');
  await p.context().close();

  /* ---- B. пролог: настроение теплее ---- */
  console.log('B. пролог «Бариста» — та же петля, но выше и светлее');
  p = await open(browser);
  await gesture(p);
  await p.waitForTimeout(900);
  await p.evaluate(() => BK.PrologueUI.begin('Тест', 'normal', {}));
  await p.waitForTimeout(4000);
  m = await mus(p);
  ok(m.live === 6, 'в прологе музыка та же (6 голосов)', m.live);
  ok(m.cut >= 1550, 'тембр в прологе светлее (фильтр ~1650 Гц)', m.cut);
  ok((await p.evaluate(() => BK.Sound.music())) === 'prologue', 'настроение переключилось на пролог');
  await p.waitForTimeout(12500);   // настроение доходит со следующим аккордом (петля 9,5 с в прологе)
  m = await mus(p);
  const lowVoice = Math.min.apply(null, m.notes.slice(0, 4));
  ok(lowVoice >= 116, 'в прологе петля звучит на тон выше (тёплый пролог)', JSON.stringify({ notes: m.notes, низ: lowVoice }));
  await p.evaluate(() => BK.PrologueUI.close());
  await p.waitForTimeout(3000);
  m = await mus(p);
  ok(m.cut <= 1250 && m.live === 6, 'вышли из пролога — вернулся спокойный игровой фон', m.cut);
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');
  await p.context().close();

  /* ---- C. музыка выключена в настройках ---- */
  console.log('C. музыка выключена в localStorage — узлов нет');
  p = await open(browser, { 'bk-ufa-sound-music': '0' });
  await gesture(p);
  await p.waitForTimeout(1500);
  m = await mus(p);
  ok(m.live === 0 && m.totalOscs === 0 && m.level === 0, 'при выключенной музыке не создано ни одного узла', JSON.stringify({ live: m.live, totalOscs: m.totalOscs }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === true, 'звуки игры при этом работают');
  await p.context().close();

  /* ---- D. общий выключатель ---- */
  console.log('D. общий звук выключен — музыки нет');
  p = await open(browser, { 'bk-ufa-sound': '0' });
  await gesture(p);
  await p.waitForTimeout(1200);
  m = await mus(p);
  ok(m.live === 0 && m.totalOscs === 0, 'общий выключатель глушит и музыку', JSON.stringify({ live: m.live, totalOscs: m.totalOscs }));
  ok((await p.evaluate(() => BK.Sound.play('coin'))) === false, 'и звуки не играют');
  await p.context().close();

  await browser.close();
  console.log(bad ? '\nМУЗЫКА: ' + bad + ' проблема(ы)' : '\nМУЗЫКА: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
