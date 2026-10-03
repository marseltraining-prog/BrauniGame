/* qa/crackle.js — «хрусты при взаимодействии»: замер звука до и после правки.

   Владелец: «Музыка мне нравится, но всё ещё есть хрусты… если я ничего не трогаю и не двигаю —
   хрустов нет, а если трогать кнопки, двигать экран — то они появляются». Значит мерить надо не музыку,
   а МАСТЕР-ШИНУ в двух режимах:

     ПОКОЙ           — музыка играет, игрок ничего не делает;
     ВЗАИМОДЕЙСТВИЕ  — тем же временем щёлкаем вкладки/кнопки и тянем карту.

   Как мерим (без звуковой карты, только числа):
     1) СЛУШАЕМ МАСТЕР. BK.Sound.startRec() навешивает на настоящий AudioContext игры AudioWorkletNode
        (модуль через data:-URL: blob: на file:// не грузится), который копит сэмплы мастер-шины.
        По ним считаем: пик, RMS, максимальный скачок между сэмплами, скачки выше порога, УЧАСТКИ ТОЧНО
        В НОЛЬ (пропуски аудиопотока), окна по 10 мс в тишине и число созданных узлов WebAudio
        (сколько работы приходится на каждое нажатие).
     1а) ЧТО СЧИТАТЬ «ХРУСТОМ». У «щелчковых» звуков интерфейса (click/tap/tab/win/deny) порог жёсткий:
         скачок между сэмплами ≤ 0,003 — именно они и хрустели владельцу. У звонких (лента, касса,
         деньги, фанфары, искры, предупреждение, провал) абсолютный скачок неизбежен по природе звука:
         у тона |Δ| ≈ 2π·f·A/sr, и один обертон 2637 Гц при громкости ленты даёт больше 0,003 сам по себе,
         ещё до всякого щелчка. Поэтому у звонких проверяется ПРИРОДА скачка, а не абсолют:
           • предел тона: скачок ≤ пик·2π·2700/sr (2700 Гц — верхний обертон всех рецептов);
           • при удвоении частоты дискретизации (88,2 кГц) скачок падает вдвое — это слитная
             полосно-ограниченная волна; у ступеньки-щелчка он остался бы прежним. Контроль детектора
             (синус 2637 Гц против квадрата 500 Гц) идёт в том же прогоне, чтобы порог не был «подогнан».
         Для щелчковых порог при этом не ослаблен, а у звонких добавлено два новых условия.
     2) ТЯЖЁЛЫЕ ЗАДАЧИ главного потока (PerformanceObserver, 'longtask') в тех же двух режимах.
     3) НАРОЧНЫЙ СТУПОР: держим поток 0,7 с — смотрим, рвётся ли музыка (это и есть «перерисовка карты
        в Safari»). Фаза сделана специально, поэтому нагрузку здесь НЕ проверяем: как в qa/lib.js,
        нарочные задержки исключены из проверок производительности — здесь важен только звук.
     4) ОФЛАЙН-ЗАМЕР СУММЫ: BK.Sound.renderMix('game', …) рендерит 3 канала — что слышно (музыка +
        эффекты через те же рецепты и ту же шину), сигнал на входе лимитера музыки и саму шину эффектов.
        Отсюда видно, СРАБАТЫВАЕТ ли лимитер (пик против порога) и какой вклад даёт каждый звук.
     5) ЗАПИСЬ ЧЕРЕЗ АУДИОКАРТУ, если среда умеет (getDisplayMedia + MediaRecorder): умеет — пишем,
        не умеет — честно говорим, что числа выше получены записью мастер-шины через AudioWorklet.

   Запуск:
     export NODE_PATH=~/.bk-tools/node_modules
     node build.js && node qa/crackle.js
     node qa/crackle.js --sec=10 --years=8 --seed=20270 --stall=700
     # «до» — на прежней сборке (в ней нет BK.Sound.renderMix; чтобы снять живые числа, достаточно
     # вставить в неё измерительную обвязку startRec/stopRec/diag — звук при этом не меняется):
     node qa/crackle.js --page=/tmp/bk-before2/dist/local.html

   Общие проверки нагрузки (qa/lib.js) не трогаются: qa/lib.js здесь не подключается, у проверки свои
   счётчики на своей странице; нарочный ступор (пункт 3) — только про звук, длинные задачи в нём
   печатаются справочно и в зачёт не идут (как и принято в qa/lib.js для нарочных задержек).
*/
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = {};
process.argv.slice(2).forEach((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });
const PAGE = path.resolve(args.page || path.join(__dirname, '..', 'dist', 'local.html'));
const SEC = +(args.sec || 10);            // длина каждого режима, с
const YEARS = +(args.years || 8);         // «возраст» игры для замера
const SEED = +(args.seed || 20270);
const STALL = +(args.stall || 700);       // нарочная задержка главного потока, мс

let bad = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ок   ' : '  БЕДА ') + msg + (extra === undefined ? '' : ' → ' + extra)); if (!cond) bad++; };
const info = (msg) => console.log('  инфо ' + msg);
const num = (v, n) => (typeof v === 'number' ? v.toFixed(n === undefined ? 5 : n) : String(v));
const db = (x) => num(20 * Math.log10(Math.max(1e-9, x)), 1) + ' дБ';

/* ---------- игра в Node: то же, что делает «Продолжить» в браузере ---------- */
function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S);
  delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}

/* ---------- тяжёлые задачи главного потока, счётчики ---------- */
function pageTools() {
  window.__lt = { list: [], obs: null };
  window.__ltStart = function () {
    window.__lt.list = [];
    if (typeof PerformanceObserver === 'undefined') return false;
    try {
      window.__lt.obs = new PerformanceObserver((l) => { l.getEntries().forEach((e) => window.__lt.list.push(+e.duration.toFixed(1))); });
      window.__lt.obs.observe({ entryTypes: ['longtask'] });
      return true;
    } catch (e) { return false; }
  };
  window.__ltStop = function () {
    if (window.__lt.obs) { try { window.__lt.obs.disconnect(); } catch (e) {} window.__lt.obs = null; }
    const l = window.__lt.list.slice().sort((a, b) => a - b);
    return { n: l.length, max: l.length ? l[l.length - 1] : 0, med: l.length ? l[l.length >> 1] : 0, sum: +l.reduce((a, b) => a + b, 0).toFixed(1) };
  };
  // счётчик сыгранных звуков (обёртка ставится один раз на тот же объект BK.Sound — ничего не ломает)
  window.__sndCount = function () {
    const Sd = window.BK && window.BK.Sound; if (!Sd) return null;
    if (!window.__sndHook) {
      window.__sndHook = true; window.__sndTally = {}; window.__sndTaps = 0;
      const wrap = (key) => {
        const P = Sd[key]; if (typeof P !== 'function') return;
        Sd[key] = function (n, o) { if (key === 'tap') window.__sndTaps++; const r = P.call(Sd, n, o); if (r) window.__sndTally[n] = (window.__sndTally[n] || 0) + 1; return r; };
      };
      wrap('play'); wrap('tap');
    }
    const c = { sounds: window.__sndTally, taps: window.__sndTaps };
    window.__sndTally = {}; window.__sndTaps = 0;
    return c;
  };
  // анализ одного канала офлайн-рендера
  window.__an = function (buf, ch) {
    const d = buf.getChannelData(ch || 0), sr = buf.sampleRate;
    let peak = 0, sq = 0, maxJump = 0, jumps = 0, j01 = 0, prev = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i], a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sq += v * v;
      if (i) { const j = Math.abs(v - prev); if (j > maxJump) maxJump = j; if (j > 0.01) j01++; if (j > 0.05) jumps++; }
      prev = v;
    }
    return { peak: +peak.toFixed(5), rms: +Math.sqrt(sq / d.length).toFixed(5), maxJump: +maxJump.toFixed(5), jumps: jumps, j01: j01 };
  };
  // КОНТРОЛЬ ДЕТЕКТОРА «щелчок или слитная волна»: один и тот же сигнал рендерим на 44,1 и 88,2 кГц.
  // У слитного тона скачок между сэмплами падает вдвое (|Δ| ≈ 2πfA/sr), у ступеньки (квадрат) — остаётся.
  // Значит, если у звука игры скачок при 88,2 кГц уменьшается, это скорость его обертонов, а не щелчок.
  window.__ctrl = async function () {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) return null;
    const one = async (sr, kind) => {
      const c = new OAC(1, Math.ceil(0.4 * sr), sr);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.016, 0.002);  // мягкое включение, как атака нот
      g.connect(c.destination);
      const o = c.createOscillator(); o.type = kind;
      o.frequency.setValueAtTime(kind === 'square' ? 500 : 2637, 0);
      o.connect(g); o.start(0);
      return window.__an(await c.startRendering(), 0).maxJump;
    };
    return { sine: { j44: await one(44100, 'sine'), j88: await one(88200, 'sine') },
      square: { j44: await one(44100, 'square'), j88: await one(88200, 'square') } };
  };
}

/* ---------- взаимодействие: щёлкаем кнопки и тянем карту ---------- */
const TAB_KEYS = ['dash', 'stores', 'prod', 'menu', 'team', 'fin', 'log'];
async function clickSel(p, sel) {
  const el = p.locator(sel).first();
  try { if (!(await el.count())) return false; } catch (e) { return false; }
  const b = await el.boundingBox();
  if (!b || b.width < 2 || b.height < 2) return false;
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
}
async function dragMap(p, dx, dy, steps) {
  const el = p.locator('#map').first();
  let b = null;
  try { if (await el.count()) b = await el.boundingBox(); } catch (e) {}
  if (!b || b.width < 20) return false;
  const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) await p.mouse.move(Math.round(cx + dx * i / steps), Math.round(cy + dy * i / steps));
  await p.mouse.up();
  return true;
}
// «руками»: перетаскивание карты, вкладки, зум — ничего, что открывает окно или глушит звук
async function interact(p, seconds) {
  const t0 = Date.now();
  let drags = 0, clicks = 0, alt = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const dx = (alt % 2 ? -1 : 1) * (90 + (alt % 3) * 40);
    const dy = (alt % 3 === 2 ? -1 : 1) * (40 + (alt % 4) * 25);
    if (await dragMap(p, dx, dy, 14)) drags++;
    for (let k = 0; k < 3; k++) { if (await clickSel(p, `[data-act="tab"][data-arg="${TAB_KEYS[(alt + k) % TAB_KEYS.length]}"]`)) clicks++; }
    if (await clickSel(p, '[data-act="zoomOut"]')) clicks++;
    if (await clickSel(p, '[data-act="zoomIn"]')) clicks++;
    alt++;
  }
  return { drags, clicks, sec: +((Date.now() - t0) / 1000).toFixed(1) };
}

/* ---------- запись через MediaRecorder (если в среде есть звуковая карта) ---------- */
async function mediaRecCheck(browser) {
  let ctx = null;
  try {
    ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const p = await ctx.newPage();
    return await p.evaluate(async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return { err: 'getDisplayMedia нет' };
      if (typeof MediaRecorder === 'undefined') return { err: 'MediaRecorder нет' };
      let stream;
      try { stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }); }
      catch (e) { return { err: 'нет доступа к захвату звука: ' + String(e).slice(0, 90) }; }
      const at = stream.getAudioTracks();
      return { tracks: at.length, webm: MediaRecorder.isTypeSupported('audio/webm') };
    });
  } catch (e) { return { err: String(e).slice(0, 120) }; }
  finally { if (ctx) await ctx.close(); }
}

/* ---------- прогон ---------- */
(async () => {
  if (!fs.existsSync(PAGE)) { console.error('Нет сборки: ' + PAGE + '\nСначала node build.js'); process.exit(1); }
  const save = botSave(YEARS, SEED);
  console.log('Страница: ' + PAGE);
  info('игра к замеру: ' + save.stores.filter((s) => s.status === 'open').length + ' точек, ' + save.day + '-й день');
  console.log('Режимы: покой ' + SEC + ' с | взаимодействие ' + SEC + ' с | ступор ' + STALL + ' мс\n');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.addInitScript(pageTools);
  await p.goto('file://' + PAGE);
  await p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('bk-ufa-tutorial', '0'); } catch (e) {} });
  await p.reload();

  // В прежней сборке офлайн-замера (renderMix) нет, а запись мастер-шины может быть — проверяем их отдельно:
  // так «до» можно снять той же проверкой (в старую сборку достаточно вставить одну измерительную обвязку).
  const hasMix = await p.evaluate(() => !!(BK.Sound && typeof BK.Sound.renderMix === 'function'));
  const hasRec = await p.evaluate(() => !!(BK.Sound && typeof BK.Sound.startRec === 'function'));
  const isNew = hasMix && hasRec;
  console.log('Код: ' + (isNew ? 'НОВЫЙ (есть BK.Sound.renderMix и startRec — офлайн-замер и запись мастер-шины)'
    : (hasRec ? 'ПРЕЖНИЙ + запись мастер-шины (офлайн-замера нет)' : 'ПРЕЖНИЙ (этих функций нет: офлайн-замера не будет, остаются живые замеры)')) + '\n');

  await p.evaluate((st) => { BK.App.continueGame(st); BK.App.setSpeed(1); }, save);
  await p.waitForTimeout(400);
  await p.keyboard.press('Tab');                      // первый жест игрока → arm() + музыка
  await p.waitForTimeout(2000);

  console.log('A. Звук идёт');
  const d0 = await p.evaluate(() => (BK.Sound.diag ? BK.Sound.diag() : null));
  info(JSON.stringify(d0));
  ok(!!(d0 && d0.ctxState === 'running'), 'аудиоконтекст игры работает', d0 ? d0.ctxState : 'нет diag');
  ok(!!(d0 && d0.on && d0.mood === 'game'), 'музыка играет (тема игры)');
  if (d0) info('план нот вперёд: ' + num(d0.ahead, 2) + ' с; порог лимитера ' + num(d0.limThreshold, 3) + ' (−6 дБ); шина эффектов ' + num(d0.sfx, 2));

  const recStart = hasRec ? await p.evaluate(() => BK.Sound.startRec({ counters: true })) : { err: 'в прежней сборке startRec нет' };
  if (recStart.err) ok(false, 'запись мастер-шины', recStart.err); else info('запись: ' + JSON.stringify(recStart));

  /* ---- режим 1: ПОКОЙ ---- */
  console.log('\nB. ПОКОЙ (' + SEC + ' с: музыка играет, ничего не трогаем)');
  let idle = { err: recStart.err || 'запись не начата' };
  if (!recStart.err) {
    await p.evaluate(() => { window.__ltStart(); window.__sndCount(); });
    idle = await p.evaluate((sec) => new Promise((r) => setTimeout(() => r(BK.Sound.stopRec()), sec * 1000)), SEC);
    if (idle.err) ok(false, 'запись в покое', idle.err); else console.log('   ' + JSON.stringify(idle));
  } else ok(false, 'запись в покое', idle.err);
  const idleLt = await p.evaluate(() => window.__ltStop());
  const idleSnd = await p.evaluate(() => window.__sndCount());
  console.log('   тяжёлые задачи: ' + JSON.stringify(idleLt) + ' | звуков: ' + JSON.stringify(idleSnd));

  /* ---- режим 2: ВЗАИМОДЕЙСТВИЕ ---- */
  console.log('\nC. ВЗАИМОДЕЙСТВИЕ (' + SEC + ' с: кнопки, вкладки, перетаскивание карты)');
  let interRec = { err: 'нет stopRec' };
  if (!recStart.err) {
    await p.evaluate(() => BK.Sound.startRec({ counters: true }).then(() => { window.__ltStart(); window.__sndCount(); }));
    interRec = { err: 'запись не начата' };
  } else await p.evaluate(() => { window.__ltStart(); window.__sndCount(); });
  const inter = await interact(p, SEC);
  if (!recStart.err) interRec = await p.evaluate(() => BK.Sound.stopRec());
  const interLt = await p.evaluate(() => window.__ltStop());
  const interSnd = await p.evaluate(() => window.__sndCount());
  info('за ' + inter.sec + ' с: перетаскиваний ' + inter.drags + ', нажатий ' + inter.clicks);
  if (interRec.err) ok(false, 'запись при взаимодействии', interRec.err); else console.log('   ' + JSON.stringify(interRec));
  console.log('   тяжёлые задачи: ' + JSON.stringify(interLt) + ' | звуков: ' + JSON.stringify(interSnd));

  /* ---- сравнение ---- */
  console.log('\nD. ПОКОЙ против ВЗАИМОДЕЙСТВИЯ');
  if (!idle.err && !interRec.err) {
    console.log('   пик мастер-шины   ' + num(idle.peak) + ' → ' + num(interRec.peak));
    console.log('   RMS               ' + num(idle.rms) + ' → ' + num(interRec.rms));
    console.log('   макс. скачок      ' + num(idle.maxJump) + ' → ' + num(interRec.maxJump) + '  (скачков >0,05: ' + idle.jumps05 + ' → ' + interRec.jumps05 + ')');
    console.log('   участки в ноль    ' + idle.zeroRuns + ' → ' + interRec.zeroRuns + '  (дырка: ' + idle.gapMs + ' → ' + interRec.gapMs + ' мс)');
    console.log('   окна в тишине     ' + idle.silent + '/' + idle.wins + ' → ' + interRec.silent + '/' + interRec.wins);
    console.log('   узлов WebAudio    ' + idle.nodes + ' → ' + interRec.nodes);
    console.log('   тяжёлые задачи    ' + idleLt.n + ' (макс ' + num(idleLt.max, 0) + ' мс) → ' + interLt.n + ' (макс ' + num(interLt.max, 0) + ' мс)');
    const grow = interRec.maxJump / Math.max(1e-9, idle.maxJump);
    ok(interRec.peak < 0.9, 'пик мастер-шины далёк от перегруза', num(interRec.peak) + ' (' + db(interRec.peak) + ')');
    ok(interRec.jumps05 === 0, 'скачков выше 0,05 в записи нет (это и были бы щелчки)', interRec.jumps05);
    ok(interRec.maxJump <= 0.006, 'самый резкий скачок при взаимодействии не больше 0,006', num(interRec.maxJump) + ' = ' + num(grow, 1) + '× от покоя');
    ok(interRec.gapMs <= 30, 'взаимодействие не рвёт звук (дырок в записи нет)', interRec.gapMs + ' мс');
    ok(interRec.zeroRuns <= idle.zeroRuns, 'взаимодействие не добавляет пропусков звука', idle.zeroRuns + ' → ' + interRec.zeroRuns);
    ok(interLt.max < 50, 'главный поток при перетаскивании карты не встаёт дольше 50 мс', num(interLt.max, 0) + ' мс, задач ' + interLt.n);
  }

  /* ---- режим 3: нарочный СТУПОР (нагрузку здесь не проверяем: фаза сделана специально) ---- */
  console.log('\nE. СТУПОР главного потока (' + SEC + ' с, в середине — задержка ' + STALL + ' мс)');
  const st = hasRec ? await p.evaluate(async (a) => {
    await window.BK.Sound.startRec();
    window.__ltStart();
    await new Promise((r) => setTimeout(r, Math.round(a.sec * 1000 / 2)));
    const t = performance.now();
    while (performance.now() - t < a.stall) { /* держим поток — как тяжёлая перерисовка карты */ }
    await new Promise((r) => setTimeout(r, Math.round(a.sec * 1000 / 2)));
    const rec = await window.BK.Sound.stopRec();
    rec.lt = window.__ltStop();
    return rec;
  }, { sec: SEC, stall: STALL }) : { err: 'нет startRec' };
  if (st.err) ok(false, 'запись в ступоре', st.err); else {
    console.log('   ' + JSON.stringify(st));
    info('датчик нагрузки эту задержку видит: ' + JSON.stringify(st.lt) + ' — значит замер тяжёлых задач рабочий');
    ok(st.gapMs <= 30, 'задержка главного потока ' + STALL + ' мс не рвёт музыку: дырка не больше 30 мс',
      st.gapMs + ' мс (в покое ' + (idle.err ? '?' : idle.gapMs) + ' мс)');
  }

  /* ---- офлайн-замер: сумма, лимитер, каждый звук ---- */
  console.log('\nF. Сумма «музыка + эффекты», лимитер и каждый звук (офлайн, те же шины и рецепты)');
  if (hasMix) {
    const mix = await p.evaluate(async (sec) => {
      const res = { cases: {}, sounds: {}, scale: {}, ctrl: null };
      const one = async (label, events, opts) => {
        const r = await BK.Sound.renderMix('game', sec, events, opts);
        if (!r) { res.cases[label] = { err: 'renderMix вернул null' }; return res.cases[label]; }
        res.cases[label] = { hear: window.__an(r.buf, 0), preLim: window.__an(r.buf, 1), sfx: window.__an(r.buf, 2),
          limThreshold: +r.limThreshold.toFixed(4), sfxGain: r.sfxGain };
        return res.cases[label];
      };
      await one('музыка', []);
      await one('музыка + нажатие', [{ at: sec / 2, name: 'tap' }]);
      await one('музыка + касса', [{ at: sec / 2, name: 'coin' }]);
      await one('музыка + 10 нажатий подряд', Array.from({ length: 10 }, (_, i) => ({ at: sec / 2 - 0.45 + i * 0.1, name: 'tap' })));
      await one('музыка + окно и деньги', [{ at: sec / 2, name: 'win', o: { down: 1 } }, { at: sec / 2 + 0.05, name: 'tab' }, { at: sec / 2 + 0.1, name: 'money' }]);
      const names = ['tap', 'click', 'tab', 'win', 'deny', 'coin', 'money', 'fanfare', 'sparkle', 'warn', 'bad', 'ribbon'];
      for (let i = 0; i < names.length; i++) res.sounds[names[i]] = await one('звук ' + names[i], [{ at: 1, name: names[i] }], { music: false });
      // тот же звук на 88,2 кГц (короткие 3 с): у слитной волны скачок между сэмплами падает вдвое, у ступеньки — нет
      for (let i = 0; i < names.length; i++) {
        const r = await BK.Sound.renderMix('game', 3, [{ at: 1, name: names[i] }], { music: false, sr: 88200 });
        res.scale[names[i]] = r ? window.__an(r.buf, 0).maxJump : null;
      }
      res.ctrl = await window.__ctrl();   // контроль детектора: синус 2637 Гц против квадрата 500 Гц
      return res;
    }, SEC);
    const C = mix.cases, S = mix.sounds;
    console.log('   случай                          пик(слышно)  RMS      макс.скачок  пик эффекта  порог лимитера');
    Object.keys(C).forEach((k) => {
      const v = C[k]; if (!v.hear) { console.log('   ' + k + ': ' + JSON.stringify(v)); return; }
      console.log('   ' + k.padEnd(30) + ' ' + num(v.hear.peak) + '     ' + num(v.hear.rms) + '  ' + num(v.hear.maxJump) + '     ' + (v.sfx ? num(v.sfx.peak) : '-') + '        ' + num(v.limThreshold, 3));
    });
    // 1) лимитер: пик на его входе (канал 1) против порога
    let worst = { label: '', peak: 0 };
    Object.keys(C).forEach((k) => { const v = C[k]; if (v.preLim && v.preLim.peak > worst.peak) worst = { label: k, peak: v.preLim.peak }; });
    const margin = 20 * Math.log10(C['музыка'].limThreshold / Math.max(1e-9, worst.peak));
    info('лимитер: порог ' + num(C['музыка'].limThreshold, 3) + ' (−6 дБ), самый громкий вход ' + num(worst.peak) + ' («' + worst.label + '») — запас ' + num(margin, 1) + ' дБ');
    ok(worst.peak < C['музыка'].limThreshold, 'лимитер музыки не срабатывает даже вместе с эффектами',
      num(worst.peak) + ' < ' + num(C['музыка'].limThreshold, 3));
    // 2) вклад эффектов: своя шина против музыки
    const musPeak = C['музыка'].preLim.peak;
    const tapSolo = S['tap'].sfx.peak, coinSolo = S['coin'].sfx.peak;
    console.log('   вклад эффекта (своя шина) против музыки ' + num(musPeak) + ': нажатие ' + num(tapSolo) + ' (' + db(tapSolo / musPeak)
      + '), вкладка ' + num(S['tab'].sfx.peak) + ' (' + db(S['tab'].sfx.peak / musPeak) + '), окно ' + num(S['win'].sfx.peak) + ' (' + db(S['win'].sfx.peak / musPeak)
      + '), касса ' + num(coinSolo) + ' (' + db(coinSolo / musPeak) + '), щелчок ' + num(S['click'].sfx.peak) + ' (' + db(S['click'].sfx.peak / musPeak) + ')');
    ok(tapSolo <= musPeak * 1.3, 'звук нажатия не громче самой музыки', num(tapSolo) + ' против ' + num(musPeak));
    ok(coinSolo <= musPeak * 5, 'самый громкий звук (касса) не громче музыки больше чем в 5 раз', db(coinSolo / musPeak));
    // 3) сумма не перегружает выход и не щёлкает
    const many = C['музыка + 10 нажатий подряд'], dense = C['музыка + окно и деньги'];
    ok(many.hear.peak < 0.9 && many.hear.jumps === 0, 'десять нажатий подряд: без перегруза и без щелчков', num(many.hear.peak) + ', скачков >0,05: ' + many.hear.jumps);
    ok(dense.hear.peak < 0.9 && dense.hear.jumps === 0, 'окно + вкладка + касса вместе: без перегруза и без щелчков', num(dense.hear.peak));
    // 4) каждый звук по отдельности. Вопросов два, и они разные:
    //    «щелчок ли это» (резкий скачок) и «не бьёт ли по ушам» (пик).
    const names = Object.keys(S);
    // Щелчковые — отклик интерфейса, ровно то, на что жаловался владелец («трогаю кнопки — хрустит»):
    // у них порог жёсткий и абсолютный. Остальные (звонкие: касса, деньги, фанфары, искры, лента, беда,
    // предупреждение) проверяем по природе скачка — см. шапку файла и комментарий у рецепта ribbon.
    const UI_SND = ['click', 'tap', 'tab', 'win', 'deny'];
    const worstOf = (list) => list.map((k) => ({ k, v: S[k] })).filter((x) => x.v && x.v.hear).sort((a, b) => b.v.hear.maxJump - a.v.hear.maxJump)[0];
    const wUi = worstOf(UI_SND), wAll = worstOf(names);
    console.log('   звуки по отдельности (пик / макс. скачок): ' + names.map((k) => k + ' ' + num(S[k].hear.peak) + '/' + num(S[k].hear.maxJump)).join(', '));
    ok(wUi.v.hear.maxJump <= 0.003, 'щелчковые звуки интерфейса не дают скачков «хруста» (≤ 0,003)',
      'самый резкий из них — ' + wUi.k + ': ' + num(wUi.v.hear.maxJump) + ' против музыки ' + num(C['музыка'].hear.maxJump));
    // природный предел: у тона |Δ| ≈ 2π·f·A/sr, значит скачок не может быть больше пик·2π·f_top/sr.
    // f_top = 2700 Гц — верхний обертон ВСЕХ рецептов (sparkle/ribbon 2637, шум кассы — полоса 2600).
    // Выше этого предела скачок тоном уже не объяснить: это была бы ступенька (щелчок).
    const FTOP = 2700, bound = (p) => p * 2 * Math.PI * FTOP / 44100;
    const over = names.filter((k) => S[k].hear && S[k].hear.maxJump > bound(S[k].hear.peak));
    ok(over.length === 0, 'скачок ни одного звука не выше природного предела тона (пик·2π·' + FTOP + '/sr)',
      over.length ? over.map((k) => k + ' ' + num(S[k].hear.maxJump) + ' > ' + num(bound(S[k].hear.peak), 4)).join(', ')
        : 'худший — ' + wAll.k + ': ' + num(wAll.v.hear.maxJump) + ' при пределе ' + num(bound(wAll.v.hear.peak), 4));
    // и главное отличие щелчка от слитной волны: при 88,2 кГц скачок обязан уменьшиться. Контроль на синусе
    // (уменьшается) и квадрате (остаётся) доказывает, что этот детектор видит настоящую ступеньку.
    const ctrl = mix.ctrl;
    ok(!!ctrl && ctrl.sine.j88 <= ctrl.sine.j44 * 0.62, 'контроль детектора: у слитного тона скачок при 88,2 кГц вдвое меньше',
      ctrl ? num(ctrl.sine.j44) + ' → ' + num(ctrl.sine.j88) + ' (' + num(ctrl.sine.j88 / ctrl.sine.j44, 2) + '×)' : 'нет контроля');
    ok(!!ctrl && ctrl.square.j88 > ctrl.square.j44 * 0.9, 'контроль детектора: у ступеньки (квадрат 500 Гц) скачок не падает — детектор её видит',
      ctrl ? num(ctrl.square.j44) + ' → ' + num(ctrl.square.j88) + ' (' + num(ctrl.square.j88 / ctrl.square.j44, 2) + '×)' : 'нет контроля');
    const jumpy = names.filter((k) => mix.scale[k] == null || mix.scale[k] > S[k].hear.maxJump * 0.72);
    ok(jumpy.length === 0, 'скачки всех звуков — это слитная волна, а не ступенька (при 88,2 кГц они вдвое меньше)',
      jumpy.length ? jumpy.map((k) => k + ' ' + num(S[k].hear.maxJump) + ' → ' + num(mix.scale[k])).join(', ')
        : 'худший — ' + wAll.k + ': ' + num(wAll.v.hear.maxJump) + ' → ' + num(mix.scale[wAll.k]));
    ok(wAll.v.hear.peak <= 0.06, 'ни один звук не бьёт по ушам (пик не больше 0,06 при музыке ' + num(C['музыка'].hear.peak) + ')',
      wAll.k + ': ' + num(wAll.v.hear.peak));
  } else {
    info('в прежней сборке офлайн-замера нет — числа по лимитеру и звукам берутся только из живого режима C');
  }
  /* ---- запись через аудиокарту (если среда умеет) ---- */
  console.log('\nG. Запись через аудиокарту (MediaRecorder)');
  const mr = await mediaRecCheck(browser);
  if (mr.err) info('недоступно в этой среде: ' + mr.err + ' — числа выше получены записью мастер-шины через AudioWorklet');
  else info('доступно: ' + JSON.stringify(mr));

  console.log('\nH. Ошибки консоли');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');

  await browser.close();
  console.log(bad ? '\nХРУСТЫ: ' + bad + ' проблема(ы)' : '\nХРУСТЫ: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
