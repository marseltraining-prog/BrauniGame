/* =====================================================================
   СЦЕНАРИИ (этап 4 плана, vision-plan §5 п. 5). Чистая логика без DOM.
   Четыре истории с разными правилами с самого начала:
     ufa      — обычная игра (Уфа, как раньше);
     legacy   — «Наследство»: бабушкина пекарня в долгах, спасти за полгода;
     rescue   — «Спаси сеть»: сеть в кризисе (точки, долги, недовольные люди) — вытащить;
     crisis   — «Кризис»: старт перед кризисом — спрос падает, мука дорожает;
     moscow   — «Старт в Москве»: дорогая аренда, высокий чек, сильные конкуренты.
   Сценарий пишется в S.story.scenario (поле уже было в схеме docs/story.md §4.5).

   Правило владельца: сценарий **выпадает случайно, но только из непройденных**;
   пройденные запоминаются в браузере (localStorage['bk-ufa-scen-done']) и больше не выпадают;
   в конце партии игрок видит «Пройдено N из 4» и может начать заново за другой историей.

   Состояние сценария внутри партии: S.scen = { v, id, at (день старта), flags }.
   Пока сценарий не выбран — состояния нет (обычная игра и боты не меняются).
   Числа и тексты — src/data/scenarios.js (BK.SCEN). Интерфейс — src/ui/scenario-ui.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const D = () => BK.SCEN || { list: {} };
  const E = () => BK.Engine;
  const KEY = 'bk-ufa-scen-done';
  const ls = (typeof localStorage === 'undefined') ? null : localStorage;

  /* ---------------- пройденные сценарии (между партиями) ---------------- */
  function done() {
    try { const raw = ls && ls.getItem(KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; }
    catch (e) { return []; }
  }
  function markDone(id) {
    if (!id || id === 'ufa') return done();
    const a = done(); if (a.indexOf(id) < 0) a.push(id);
    try { if (ls) ls.setItem(KEY, JSON.stringify(a)); } catch (e) {}
    return a;
  }
  function resetDone() { try { if (ls) ls.removeItem(KEY); } catch (e) {} }

  /* ---------------- список и выбор ---------------- */
  const all = () => Object.keys(D().list || {});
  const info = (id) => (D().list || {})[id] || null;
  const played = () => all().filter((id) => done().indexOf(id) >= 0);
  const left = () => all().filter((id) => done().indexOf(id) < 0);
  // Случайный из непройденных (детерминированно от зерна партии): пройденное не выпадает снова.
  function pick(seed) {
    const pool = left();
    if (!pool.length) return null;
    let t = ((seed | 0) ^ 0x7ac31) | 0;
    t = (Math.imul(t ^ (t >>> 15), 1 | t) + 0x6D2B79F5) | 0;
    return pool[((t ^ (t >>> 14)) >>> 0) % pool.length];
  }
  function progress() { return { done: done(), played: played(), left: left(), total: all().length }; }

  /* ---------------- состояние партии ---------------- */
  function state(S) { return S && S.scen && S.scen.v ? S.scen : null; }
  function ensure(S) {
    if (!S) return null;
    if (S.scen && S.scen.v) return S.scen;
    S.scen = { v: 1, id: null, at: S.day || 0, flags: {} };
    return S.scen;
  }
  // Выбрать сценарий партии. id === 'random' — случайный из непройденных (по зерну игры).
  function set(S, id) {
    const st = ensure(S); if (!st) return null;
    let real = id;
    if (id === 'random') real = pick(S.seed);
    if (real && !info(real)) real = null;
    st.id = real === 'ufa' ? null : real;      // «обычная Уфа» — это отсутствие сценария
    st.at = S.day;
    if (S.story) S.story.scenario = st.id || 'ufa';
    if (real && S.notify) S.notify.push({ type: 'scen', phase: 'start', id: real });
    return st.id;
  }
  const current = (S) => { const st = state(S); return st && st.id ? st.id : null; };

  /* ---------------- стартовые правила сценария ---------------- */
  // Каждый сценарий правит начало партии своими числами: деньги, точки, долги, рынок.
  // Полный набор — в src/data/scenarios.js (BK.SCEN.list[id].start).
  function applyStart(S) {
    const st = state(S); if (!st || !st.id) return null;
    const d = info(st.id); if (!d || !d.start) return null;
    const s = d.start, out = [];
    if (s.cash != null) { const k = (s.cashK || 1) * (S.macro ? S.macro.priceLevel : 1); S.cash = Math.max(0, Math.round(s.cash * (s.cashK ? 1 : k))); out.push('деньги'); }
    if (s.loan) { S.loan = Math.round((S.loan || 0) + s.loan); out.push('долг'); }
    if (s.stores) {
      // старт не с нуля: выдаём готовые точки (для истории «спаси сеть в кризисе»)
      const I = E()._int || {};
      let got = 0;
      for (let i = 0; i < s.stores; i++) {
        const off = (S.offers || [])[0];
        if (!off || !E().rentStore) break;
        try { E().rentStore(S, off); got++; } catch (e) { break; }
      }
      if (got) out.push(`${got} ${got === 1 ? 'точка' : 'точки'}`);
      if (s.mood != null) for (const st2 of (S.stores || [])) { st2.mood = s.mood; }   // уставшая команда
      if (s.rating != null) for (const st2 of (S.stores || [])) { st2.rating = s.rating; }
    }
    if (s.crisis) { S.ev = S.ev || {}; S.ev.nextCrisis = (S.day || 0) + (s.crisisIn || 60); S.ev.forcedCrisis = s.crisis; out.push('кризис'); }
    if (s.trafficK) { S.mods.push({ t: 'traffic', m: s.trafficK, until: (S.day || 0) + (s.days || 180), scope: 'global', src: 'scen' }); out.push('спрос'); }
    if (s.foodcostK) { S.mods.push({ t: 'foodcost', m: s.foodcostK, until: (S.day || 0) + (s.days || 180), scope: 'global', src: 'scen' }); out.push('мука'); }
    if (s.rentK) { S.mods.push({ t: 'rent', m: s.rentK, until: (S.day || 0) + (s.days || 3650), scope: 'global', src: 'scen' }); out.push('аренда'); }
    if (S.notify) S.notify.push({ type: 'scen', phase: 'applied', id: st.id, what: out.join(', ') });
    return out;
  }

  /* ---------------- день ---------------- */
  function day(S) {
    if (!S || S.lost) return;
    const st = state(S);
    if (!st || !st.id) return;
    const d = info(st.id); if (!d) return;
    // срок сценария (например, «Наследство» — спасти за 6 месяцев)
    if (d.days && !st.expired && S.day - st.at > d.days) {
      st.expired = true;
      st.flags = st.flags || {};
      st.flags.expired = true;
      // срок вышел: сразу считаем, спасена история или нет — вердикт не зависит от того, когда вызван finish()
      try { st.flags.saved = !!(d.done && d.done(S, st)); } catch (e) { st.flags.saved = false; }
      if (S.notify) S.notify.push({ type: 'scen', phase: st.flags.saved ? 'saved' : 'expired', id: st.id, days: d.days });
    }
  }
  function failed(S) { const st = state(S); if (!st || !st.expired) return false; const d = info(st.id); return !!(d && d.fail && d.fail(S, st)); }

  /* ---------------- итог: отметить пройденное ---------------- */
  // Вызывается, когда партия закончилась (победа, банкротство, финал истории):
  // сценарий считается пройденным, если цель сценария выполнена.
  function finish(S) {
    const id = current(S); if (!id) return null;
    const d = info(id);
    const ok = !d || !d.done || d.done(S, state(S));
    if (ok) markDone(id);
    return { id, ok, progress: progress() };
  }
  function progressHtml() { const p = progress(); return `${p.played.length} из ${p.total}`; }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__scen) return;
    Eng.__scen = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* сценарий не должен ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Scenario = {
    all, info, left, played, done, markDone, resetDone, pick, progress, progressHtml,
    state, ensure, set, current, applyStart, day, failed, finish,
  };
})();
