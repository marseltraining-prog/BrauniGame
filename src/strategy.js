/* =====================================================================
   СТРАТЕГИИ (этап 3 плана, vision-plan §5.3). Чистая логика без DOM.
   Четыре пути к победе — «Премиум», «Народная», «Кофейни», «Пекарня-кафе».
   У каждого своя сильная сторона и своя плата за неё; ни один не лучший всегда.

   Как устроено: стратегия — это набор постоянных модификаторов игры (S.mods с src: 'strat'),
   множитель стоимости открытия точки и профиль поведения. Модификаторы идут через обычную
   систему игры (traffic / check / conv / capacity / delivery), поэтому ничего в движке
   переписывать не пришлось — только одна строка про стоимость открытия.

   Стратегию можно выбрать на старте («Как играем?») или она **складывается сама** из решений:
   detect(S) смотрит, что у игрока получилось (средний чек, размер точек, гостей на точку,
   напитки и утро), и называет ближайший путь. Выбор виден в «Сводке» и в «Меню игры»,
   но ничего не навязывает.

   Состояние: S.strat = { v, id | null, chosen: bool, since, hist: [{day, check, size, guests}] }.
   Пока игрок не начал — состояния нет (боты и старые сохранения не меняются).
   Числа — CFG.STRAT. Проверки — node sim/strat.js, node qa/strategy.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, K = () => BK.CFG.STRAT;
  const open = (S) => (S.stores || []).filter((s) => s.status !== 'opening');
  const R2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S) return null;
    if (S.strat && S.strat.v) return S.strat;
    S.strat = { v: 1, id: null, chosen: false, since: S.day || 0, hist: [] };
    return S.strat;
  }
  const state = (S) => (S && S.strat && S.strat.v ? S.strat : null);
  const list = () => Object.keys(K().PATHS);

  /* ---------------- выбор и модификаторы ---------------- */
  function set(S, id) {
    const st = ensure(S); if (!st) return null;
    if (st.lock) return st.id;                                   // путь задан историей (lock) — не меняется
    if (id && !K().PATHS[id]) return null;
    st.id = id || null; st.chosen = !!id; st.random = false; st.since = S.day;
    syncMods(S);
    return st.id;
  }
  // постоянные модификаторы пути; навсегда, пока стратегия та же
  function syncMods(S) {
    const st = state(S); if (!S || !Array.isArray(S.mods)) return;
    S.mods = S.mods.filter((m) => m.src !== 'strat');
    const p = st && st.id ? K().PATHS[st.id] : null;
    if (!p) return;
    for (const m of p.mods || []) S.mods.push({ t: m.t, m: m.m, until: S.day + (m.d || 36500), scope: 'global', src: 'strat' });
  }
  const openMult = (S) => { const st = state(S), p = st && st.id ? K().PATHS[st.id] : null; return (p && p.openK) || 1; };
  // Путь «выпадает случайно»: игра через пролог не спрашивает игрока (детерминированно от зерна,
  // поэтому одна и та же партия воспроизводится; сменить можно в первые месяцы, как и выбранный).
  function setRandom(S) {
    const st = ensure(S); if (!st) return null;
    if (st.lock) return st.id;
    const ids = list();
    let t = ((S.seed | 0) ^ 0x2c1b3) | 0;
    t = (Math.imul(t ^ (t >>> 15), 1 | t) + 0x6D2B79F5) | 0;
    const id = ids[((t ^ (t >>> 14)) >>> 0) % ids.length];
    st.id = id; st.chosen = false; st.random = true; st.since = S.day;
    syncMods(S);
    if (S.notify) S.notify.push({ type: 'strat', phase: 'random', id });
    return id;
  }
  // История может задать путь с самого начала («Только кофейни» → «Кофейни», src/scenario.js):
  // путь выбран, сменить его нельзя (st.lock — id истории). Без истории поле не появляется.
  function lock(S, id, by) {
    const st = ensure(S); if (!st || !K().PATHS[id]) return null;
    st.lock = null;
    set(S, id);
    st.lock = by || 'scen';
    return st.id;
  }
  const path = (id) => K().PATHS[id] || null;
  function info(S) {
    const st = state(S); if (!st) return null;
    const p = st.id ? K().PATHS[st.id] : null;
    const d = detect(S);
    return {
      id: st.id, chosen: st.chosen, random: !!st.random, locked: st.lock || null, name: p ? p.name : null, icon: p ? p.icon : null,
      text: p ? p.text : null, plus: p ? p.plus : null, minus: p ? p.minus : null,
      detect: d, since: st.since, day: S.day - st.since,
    };
  }

  /* ---------------- «складывается сама»: что получилось ---------------- */
  // Считаем средние по сети: чек (к рынку), размер точки, гостей на точку, доля утра.
  function metrics(S) {
    const list_ = open(S);
    const h = (S.history || []).slice(-3);
    const m = h.length ? h[h.length - 1] : null;
    let size = 0, guests = 0, rev = 0;
    for (const st of list_) { const sz = (BK.CFG.SIZES || {})[st.size] || {}; size += sz.area || sz.staffMax * 30 || 0; guests += ((st.m && st.m.checks) || 0) * (S.day % 30.44 ? 30.44 / Math.max(1, S.day % 30.44) : 1); rev += (st.m && st.m.rev) || 0; } // гостей за неполный месяц приводим к полному
    const n = list_.length || 1;
    const avgCheck = m && m.pnl && m.pnl.checks ? m.rev / m.pnl.checks : 0;   // чеки лежат в m.pnl (в самой записи их нет)
    const market = (S.macro && S.macro.avgCheck) || (K().MARKET_CHECK * (S.macro ? S.macro.priceLevel : 1));
    return {
      n: list_.length,
      sizePerStore: size / n,
      guestsPerStore: guests / n,
      checkK: (market && avgCheck) ? avgCheck / market : 1,   // чек к рынку; если данных нет — считаем «как рынок»
      morning: (S.thoughts && S.thoughts.daypart && S.thoughts.daypart.morning) || 0,
    };
  }
  // Ближайший путь по замерам: у каждого — ожидаемые признаки.
  function detect(S) {
    const st = state(S); const m = metrics(S);
    if (m.n < K().DETECT_MIN_STORES) return { id: null, why: 'мало точек', m };
    let best = null;
    const rel = (v, t) => (t ? Math.abs(v / t - 1) : 0);        // относительное расхождение, а не абсолютное
    for (const id of list()) {
      const p = K().PATHS[id];
      const c = p.fit || {};
      let d = 0, k = 0;
      if (c.checkK) { d += Math.abs(m.checkK - c.checkK); k++; }
      if (c.sizePerStore) { d += rel(m.sizePerStore, c.sizePerStore); k++; }
      if (c.guestsPerStore) { d += rel(m.guestsPerStore, c.guestsPerStore); k++; }
      d = k ? d / k : 9;
      if (!best || d < best.d) best = { id, d: R2(d), m };
    }
    return best || { id: null, m };
  }
  // Если игрок не выбирал, а картина сложилась устойчиво — называем путь (не навязывая).
  function maybeDetect(S) {
    const st = state(S); if (!st || st.chosen || st.id) return null;
    const d = detect(S); if (!d.id) return null;
    if (d.d > K().DETECT_TOL) return null;                       // картина ещё размытая
    st.id = d.id; st.chosen = false; st.since = S.day; syncMods(S);
    if (S.notify) S.notify.push({ type: 'strat', phase: 'detected', id: d.id });
    return d.id;
  }

  /* ---------------- день ---------------- */
  function day(S) {
    if (!S || S.lost) return;
    const st = state(S); if (!st) return;
    if (S.day - (st.last || 0) >= 30) {                          // раз в месяц записываем замеры
      st.last = S.day; st.hist.push({ d: S.day, ...metrics(S) });
      while (st.hist.length > 36) st.hist.shift();
    }
    if (!st.chosen && S.day - st.since > K().DETECT_DAYS) maybeDetect(S);
  }

  /* ---------------- «Требует внимания» ---------------- */
  function attItems(S) {
    const st = state(S); const out = [];
    if (st && !st.chosen) {
      const d = detect(S);
      if (d.id && d.d <= K().DETECT_TOL) out.push({ lvl: 'info', ic: 'rub', t: `Похоже, вы играете «${K().PATHS[d.id].name}»`, d: 'Посмотрите, что это значит и что даёт.', b: { act: 'strat', label: 'Открыть' } });
    }
    return out;
  }

  /* ---------------- подключение ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__strat) return;
    Eng.__strat = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* стратегии не должны ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Strat = { ensure, state, set, setRandom, lock, list, path, info, metrics, detect, maybeDetect, syncMods, openMult, attItems, day };
})();
