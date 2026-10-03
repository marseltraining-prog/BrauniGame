/* =====================================================================
   СЮЖЕТ: каркас (BK.Story). Чистая логика без DOM.
   Данные и тексты — src/data/story.js (BK.STORY), интерфейс — src/ui/story-ui.js.
   Замысел целиком — docs/story.md (этап В4 плана работ).

   Что делает: следит за состоянием игры (точки, месяцы, отношения, боль) и по триггерам
   ставит сюжетную сцену в очередь (S.story.pending). Сцену показывает интерфейс, игрок выбирает
   вариант, BK.Story.resolve применяет последствия: отношения, скрытые стили (care / risk /
   honesty / fair), флаги развилок, именованные бонусы (perks), доли, концовку — и пишет запись
   в летопись (S.story.log) для итогов игры.

   Состояние — S.story по схеме docs/story.md §4.5 (его же пишет пролог, syncStory).
   **В прогонах ботов сюжет выключен** (sim/load.js ставит CFG.STORY.ON = false, включает BK_STORY=1):
   пока игрок не начал играть, S.story не создаётся, случайные числа основного потока не тратятся.
   Свой ГСЧ — S.story.rng.

   Обёртка BK.Engine.tick (как achievements.js, milestones.js): движок не менялся, кроме
   экспорта applyEffects — сюжет применяет обычные эффекты событий той же функцией движка.
   Числа — CFG.STORY. Проверки — node sim/story.js, node qa/story.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, K = () => BK.CFG.STORY, D = () => BK.STORY;
  const openStores = (S) => (S.stores || []).filter((s) => s.status !== 'opening');
  const months = (S) => S.day / 30.44;                       // игровых месяцев с начала игры
  const year = (S) => S.day / 365;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- состояние ---------------- */
  function defaults(seed) {
    return {
      v: 1, mode: 'full', scenario: 'ufa', hero: { name: '', g: null }, ch: 'own',
      rng: ((seed | 0) ^ 0x5f3a1) | 0, seen: {}, queue: [], pending: null, inbox: [],
      lastScene: 0, lastLetter: 0, lastLine: 0,
      rel: { rashid: 0, gulya: 0, oleg: 0, elvira: 0, family: 10, semyon: 0, ildar: 0, babushka: 0 },
      m: { care: 0, risk: 0, honesty: 0, fair: 0 },
      f: { mentor: null, gulya: null, kalach: 'alive', lenin: null, hire1: null, fund: 0, war: null, scandal: null, ufa: null, ildar: null, olegCard: false, regulars: 0 },
      perks: [], shares: [], ending: null, log: [], wonQueued: false,
    };
  }
  // Состояние сюжета: null, если игра ещё не начиналась (боты, старые сохранения без игры).
  function state(S) { return S && S.story && S.story.v ? S.story : null; }
  function ensure(S) {
    if (!S) return null;
    if (!K().ON) return null;                       // выключено — ничего не создаём
    if (S.story && S.story.v) return fill(S.story);
    S.story = fill(defaults(S.seed || 0));
    return S.story;
  }
  // дозаполнение старых сохранений и того, что писал пролог
  function fill(R) {
    const d = defaults(0);
    for (const k of Object.keys(d)) if (R[k] === undefined) R[k] = d[k];
    for (const k of Object.keys(d.rel)) if (R.rel[k] === undefined) R.rel[k] = d.rel[k];
    for (const k of Object.keys(d.m)) if (R.m[k] === undefined) R.m[k] = d.m[k];
    for (const k of Object.keys(d.f)) if (R.f[k] === undefined) R.f[k] = d.f[k];
    if (!Array.isArray(R.perks)) R.perks = [];
    if (!Array.isArray(R.log)) R.log = [];
    if (!Array.isArray(R.inbox)) R.inbox = [];
    if (!Array.isArray(R.queue)) R.queue = [];
    return R;
  }
  function rnd(R) { R.rng = (Math.imul(R.rng >>> 0, 1664525) + 1013904223) >>> 0; return R.rng / 4294967296; }

  /* ---------------- данные сцен ---------------- */
  function scenes() { return (D() && D().scenes) || []; }
  function scene(id) { return scenes().find((s) => s.id === id) || null; }

  /* ---------------- сквозные линии: пролог → нити (docs/story-v2.md п. 4–6) ----------------
     Пролог вёл свой реестр (P.v2.threads) и при переходе в основную игру терялся: решение
     первой главы умирало вместе с прологом (разбор — docs/writing-review.md, С1–С2).
     Здесь в первый же день основной игры незакрытые нити пролога переезжают в BK.Threads:
     игрок снова видит «Вас помнит …» в «Требует внимания» и в «Сводке», цену — заранее,
     а последствие меняет механику (обиженный инспектор тянет приёмку: 50 дней вместо 21
     во всех новых городах). Соответствия «нить пролога → нить игры» — BK.STORY.prologue
     (src/data/story-bridges.js), тут только механика. Без пролога (боты, старые сохранения)
     функция только помечает партию и ничего не создаёт. */
  function lineFired(P, id) {
    const F = (P && P.v2 && P.v2.fired) || {};
    for (const k of Object.keys(F)) if (k.indexOf(id + ':') === 0) return true;
    return false;
  }
  function wire(S, R) {
    if (R.f.proWired) return;
    const P = S.prologue, W = (D() && D().prologue) || {}, T = BK.Threads;
    if (!P || !P.v2) { R.f.proWired = 'no'; return; }        // партии без живого пролога
    R.f.proWired = S.day || 1;
    const tl = W.threads || {}, fl = W.flags || {};
    const setFlag = (a) => { if (a && a[0] && R.f[a[0]] == null) R.f[a[0]] = a[1]; };
    for (const k of Object.keys(fl)) if (P.flags && P.flags[k]) setFlag(fl[k]);
    if (T && T.add) {
      for (const t of P.v2.threads || []) {                 // нить ещё не отозвалась — переносим целиком
        const m = tl[t.id]; if (!m) continue;
        setFlag(m.flag);
        // срок: свой у каждой нити (последствие — через годы). Если пролог откладывал её дальше,
        // берём срок пролога: игрок уже видел эту дату в «Вас помнят».
        const left = (t.due != null && P.m != null) ? Math.round(Math.max(0, t.due - P.m) * 30.44) : 0;
        const after = Math.max(m.after != null ? m.after : 365, left);
        T.add(S, { who: m.who || t.who, role: m.role || '', kind: m.kind || (t.dir > 0 ? 'favor' : 'grudge'),
          text: m.text || t.gist || '', city: m.city || null, from: S.day,
          due: (S.day || 0) + after, effect: m.effect || {}, src: m.src || ('prologue:' + t.id) });
      }
    }
    for (const id of Object.keys(tl)) if (lineFired(P, id)) setFlag(tl[id].flag);   // отозвалось ещё в прологе
  }
  // чем закончилась линия: счёт «за людей» и «по бумагам» (docs/story-v2.md п. 4,
  // концовки «Вас помнят» / «Всё по бумагам» — их открывает флаг f.book)
  function closeLine(S, R, fx) {
    const warm = fx.warm !== false;
    const k = warm ? 'lineWarm' : 'lineCold';
    R.f[k] = (R.f[k] | 0) + 1;
    const w = R.f.lineWarm | 0, c = R.f.lineCold | 0;
    R.f.book = w >= 2 && w > c ? 'warm' : c >= 2 && c >= w ? 'cold' : 'even';
    if (fx.text) R.log.push({ day: S.day, id: 'ln' + S.day + '_' + R.log.length, title: fx.text, choice: '', chapter: R.ch, fx: ['line'] });
    return fx.text || null;
  }
  // помирились: нить закрывается из сцены (по src, id или имени человека)
  function unthread(S, fx) {
    const T = BK.Threads; if (!T || !T.list || !T.clear) return null;
    let n = 0;
    for (const t of T.list(S)) {
      if ((fx.src && t.src === fx.src) || (fx.id && t.id === fx.id) || (fx.who && t.who === fx.who)) { if (T.clear(S, t.id)) n++; }
    }
    return n ? `нитей закрыто: ${n}` : null;
  }

  /* Кто появляется рядом (решение владельца: семья/партнёр, вариант «в» — docs/story-v2.md п. 8).
     Помощница или самодур — не случайность и не кубик, а следствие характера партии: честность,
     справедливость, забота, закрытые линии «за людей», отношения с домом, откуда взяты деньги.
     Считается один раз, к 9-му году, и остаётся в f.mateKind: вторая партия на другом характере
     даст другого человека. Строку «кто идёт рядом» игрок видит в «Требует внимания» задолго
     до сцены — это и есть прозрачность, о которой просил владелец. */
  function mateScore(R) {
    const m = R.m || {}, f = R.f || {}, rel = R.rel || {};
    let v = (m.honesty | 0) + (m.fair | 0) + Math.round((m.care | 0) / 2);
    v += (f.lineWarm | 0) * 8 - (f.lineCold | 0) * 8;
    if ((rel.family | 0) >= 25) v += 5;
    if (f.lineKin === 'far') v -= 6;
    if (f.lineDebt === 'deep') v -= 6;              // деньги «Быстрых денег» — не про людей
    if (f.lineDamir === 'thief') v -= 5;            // человека выбросили
    if (f.linePaper === 'open') v -= 4;             // от проверки отмахнулись
    return v;
  }
  function mateKind(R) {
    const v = mateScore(R);
    if (v >= 15) return 'helper';
    if (v <= -5) return 'tyrant';
    return 'none';
  }
  const MATE_TEXT = {
    helper: 'Рядом с вами — человек, который считает лучше вас и говорит это вслух. Команда такого не любит.',
    tyrant: 'Рядом с вами — человек с деньгами и своими идеями. Отказать ему — потерять вливания.',
    none: 'Пока рядом никого: работа и есть ваш дом.',
  };

  /* ---------------- условия триггера ---------------- */
  function cond(S, R, c) {
    if (c.stores != null) return openStores(S).length >= c.stores;
    if (c.months != null) return months(S) >= c.months;
    if (c.year != null) return year(S) >= c.year;
    if (c.rivalStores != null) { const rv = S.rival || {}; return (rv.stores ? rv.stores.length : (rv.n || 0)) >= c.rivalStores; }
    if (c.prod != null) return !!(S.productions && S.productions.length);
    if (c.cash != null) return S.cash >= c.cash;
    if (c.cashLt != null) return S.cash < c.cashLt;                                  // «денег меньше, чем…»
    if (c.notSeen) return !R.seen[c.notSeen];                                        // сцену ещё не видели
    if (c.crisis != null) return !!(S.ev && S.ev.crisis);
    if (c.corp != null) return !!(S.corp && S.corp.active);                                  // второй акт открыт
    if (c.cities != null) return ((S.corp && S.corp.cities) ? Object.keys(S.corp.cities).length : 0) >= c.cities;
    if (c.scen != null) { try { return !!(BK.Scenario && BK.Scenario.current(S) === c.scen); } catch (e) { return false; } }   // сценарий партии (scenario.js)
    if (c.revenue12 != null) { try { return E().rolling12(S) >= c.revenue12; } catch (e) { return false; } }   // оборот за 12 месяцев
    if (c.rel) return Object.keys(c.rel).every((k) => (R.rel[k] || 0) >= c.rel[k]);
    if (c.meter) return Object.keys(c.meter).every((k) => (R.m[k] || 0) >= c.meter[k]);
    if (c.flag) return Object.keys(c.flag).every((k) => R.f[k] === c.flag[k]);
    return false;
  }
  function fits(S, R, sc) {
    if (!sc) return false;
    if (R.seen[sc.id] && sc.once !== false) return false;   // once:false — сцену можно показать снова (мостики)
    if (sc.once === false) { /* повторяемые сцены разрешены */ }
    const t = sc.trigger || {};
    if (t.after && !t.after.every((id) => R.seen[id])) return false;
    if (t.afterAny && t.afterAny.length && !t.afterAny.some((id) => R.seen[id])) return false;
    if (t.all && !t.all.every((c) => cond(S, R, c))) return false;
    if (t.any && t.any.length && !t.any.some((c) => cond(S, R, c))) return false;
    return true;
  }
  // Глава по состоянию игры: нужна для летописи и для порядка сцен.
  function chapter(S, R) {
    if (R && R.ch === 'final') return 'final';
    if (R && R.f && R.f.ufa === 'deep') return 'deep';
    if (S.corp && S.corp.active) return 'russia';
    const n = openStores(S).length;
    if (n >= 15) return 'war';
    if (n >= 2) return 'city';
    return 'own';
  }
  // Очередь: сцена, которую пора показать (или null). Темп — не чаще GAP_MONTHS, не в день события.
  function pick(S, R) {
    if (R.pending) return null;
    if (S.ev && S.ev.pending) return null;                       // не мешаем событию
    if (S.chef && S.chef.pending) return null;                   // и окну шеф-пекаря (1 января)
    // и не в те дни, когда только что случилось событие (docs/story.md §6: отложить на 3–7 дней)
    const r0 = (S.ev && S.ev.recent && S.ev.recent[0]) || null;
    if (r0 && S.day - r0.day < (K().DEFER_DAYS[0] || 3)) return null;
    const gap = (K().GAP_MONTHS[chapter(S, R)] != null ? K().GAP_MONTHS[chapter(S, R)] : 3) * 30.44;
    if (R.lastScene && S.day - R.lastScene < gap) return null;
    const list = scenes();
    for (const sc of list) { if (sc.queueOnly) continue; if (fits(S, R, sc)) return sc; }   // queueOnly — только по очереди
    // запасной вариант: срок вышел — приходим в мягкой версии
    for (const sc of list) {
      if (!sc.fallback || R.seen[sc.id]) continue;
      const t = sc.trigger || {};
      if (t.after && !t.after.every((id) => R.seen[id])) continue;
      if (t.afterAny && t.afterAny.length && !t.afterAny.some((id) => R.seen[id])) continue;   // запасной вариант не обходит ветвление
      if (t.all && !t.all.every((c) => cond(S, R, c))) continue;
      // срок запасного варианта: от самого раннего временного условия, а если их нет —
      // от момента, когда пришли предпосылки (after/afterAny): иначе сцены вроде «обеда с Олегом»
      // (условие по точкам) не приходили никогда
      let base = (t.any || []).map((c) => (c.months != null ? c.months : c.year != null ? c.year * 12 : null)).filter((x) => x != null);
      if (!base.length) {
        const pre = [].concat(t.after || [], t.afterAny || []).map((id) => R.seen[id]).filter((d) => d != null);
        if (!pre.length) continue;
        base = [Math.max.apply(null, pre) / 30.44];
      }
      if (months(S) >= Math.min.apply(null, base) + sc.fallback.months) return sc;
    }
    return null;
  }

  /* ---------------- показ и выбор ---------------- */
  function start(S, sc) {
    const R = ensure(S); if (!R) return null;
    R.pending = { id: sc.id, day: S.day };
    R.ch = chapter(S, R);
    if (S.notify) S.notify.push({ type: 'story', phase: 'scene', id: sc.id });
    return R.pending;
  }
  function pendingScene(S) {
    const R = state(S); if (!R || !R.pending) return null;
    return scene(R.pending.id);
  }
  // Выбор варианта: применяет последствия и закрывает сцену.
  function resolve(S, idx) {
    const R = state(S); if (!R || !R.pending) return { ok: false, msg: 'Сцены нет' };
    const sc = scene(R.pending.id); if (!sc) { R.pending = null; return { ok: false }; }
    const ch = (sc.choices || [])[idx];
    if (!ch) return { ok: false, msg: 'Нет такого варианта' };
    const out = [];
    for (const fx of ch.effects || []) { const t = apply(S, R, fx); if (t) out.push(t); }
    const list = (ch.effects || []).map((fx) => fx.t);
    R.seen[sc.id] = S.day;
    R.lastScene = S.day;
    R.pending = null;
    R.ch = chapter(S, R);
    R.log.push({ day: S.day, id: sc.id, title: sc.title, choice: ch.label, chapter: R.ch, fx: list });
    while (R.log.length > 120) R.log.shift();
    if (S.notify) S.notify.push({ type: 'story', phase: 'done', id: sc.id, title: sc.title, choice: ch.label, out: out.join('; ') });
    return { ok: true, scene: sc, choice: ch, out };
  }

  /* ---------------- эффекты сюжета ---------------- */
  function apply(S, R, fx) {
    switch (fx.t) {
      case 'rel': {
        R.rel[fx.who] = clamp((R.rel[fx.who] || 0) + fx.add, -100, 100);
        const h = hero(fx.who);
        return `${h.short || h.name}: отношения ${fx.add > 0 ? '+' : ''}${fx.add}`;
      }
      case 'meter': R.m[fx.k] = clamp((R.m[fx.k] || 0) + fx.add, -100, 100); return null;
      case 'flag': R.f[fx.k] = fx.v; return null;
      case 'perk': return givePerk(S, R, fx.id);
      case 'share': R.shares.push({ who: fx.who, what: fx.what, pct: fx.pct, buyout: fx.buyout }); return `доля ${hero(fx.who).name} — ${Math.round(fx.pct * 100)} %`;
      case 'rivalMod': {
        const rv = S.rival; if (!rv) return null;
        rv.storyAgg = R2((rv.storyAgg || 0) + (fx.agg || 0));
        rv.storyNearK = fx.nearK != null ? fx.nearK : rv.storyNearK;
        rv.storyUntil = S.day + (fx.days || 720);
        return null;
      }
      case 'rivalOpenNear': {
        if (!S.rival || !S.rival.enabled) return null;
        const n = rivalNear(S, fx.count || 1);
        return n ? `«Двор» открыл ${n} ${n === 1 ? 'точку' : 'точки'} рядом с вашими` : null;
      }
      case 'journal': R.log.push({ day: S.day, id: 'j' + S.day, title: fx.text, choice: '', chapter: R.ch, fx: ['journal'] }); return fx.text;
      case 'line': return closeLine(S, R, fx);                       // линия дошла до конца: счёт для концовки
      case 'unthread': return unthread(S, fx);                       // помирились — нить закрыта (BK.Threads.clear)
      case 'loan': {                                                 // деньги банка как эффект сцены (кредит настоящий)
        try { E().takeLoan(S, Math.round(fx.v || 0)); return `кредит ${BK.fmtMoney(Math.round(fx.v || 0))}`; } catch (e) { return null; }
      }
      case 'deferOpen': R.queue.push({ kind: 'deferOpen', days: fx.days || 3, day: S.day }); return null;
      case 'schedule': {
        const a = fx.after;
        const d = Array.isArray(a) ? Math.round(a[0] + (a[1] - a[0]) * rnd(R)) : (a || 30);   // в сценах after бывает диапазоном
        R.queue.push({ kind: 'scene', id: fx.id, day: S.day + d, p: fx.p });
        return null;
      }
      case 'ending': {
        R.ending = fx.id;
        const e = (D().endings || {})[fx.id] || {};
        R.log.push({ day: S.day, id: 'end_' + fx.id, title: 'Финал: ' + (e.name || fx.id), choice: '', chapter: 'final', fx: ['ending'] });
        if (S.notify) S.notify.push({ type: 'story', phase: 'ending', id: fx.id, name: e.name, text: e.text });
        S.lost = true; S.storyEnding = fx.id;   // игра останавливается, итоги показывают концовку
        return `концовка «${e.name || fx.id}»`;
      }
      default:
        // всё остальное — обычные эффекты событий, применяет движок той же функцией
        if (fx.t) { try { S.__storyFx = [fx]; E().applyEffects(S, [fx], { scope: 'global', target: null }); return null; } catch (e) { return null; } }
        return null;
    }
  }
  function hero(id) { return (D().heroes || {})[id] || { name: id }; }
  function givePerk(S, R, id) {
    const p = (D().perks || {})[id]; if (!p) return null;
    R.perks.push(id);
    for (const m of p.mods || []) S.mods.push({ t: m.t, m: m.m, until: S.day + (m.d || 90), scope: m.scope || 'global', src: 'story' });
    if (p.flag) R.f[p.flag.k] = p.flag.v;
    return `бонус «${p.name}»: ${p.text}`;
  }

  /* ---------------- день ---------------- */
  function day(S) {
    if (!K().ON || !S || S.lost) return;
    const R = ensure(S); if (!R) return;
    if (R.mode === 'off') return;
    wire(S, R);                                   // сквозные линии: нити пролога переезжают в BK.Threads
    // Кто идёт рядом (см. mateKind): считаем с 6-го года или после трёх закрытых линий — этого
    // хватает, чтобы характер партии был уже виден, а игрок успевал прочитать строку заранее.
    // Первое «есть кто-то» фиксируется и больше не пересчитывается: человек не меняется задним числом.
    if (!R.seen.kf3 && (year(S) >= 6 || ((R.f.lineWarm | 0) + (R.f.lineCold | 0)) >= 3)) {
      const k = mateKind(R);
      if (k !== 'none') { if (R.f.mateKind !== k) R.f.mateKind = k; }
      else if (R.f.mateKind == null) R.f.mateKind = 'none';
    }
    // отложенные записи
    if (R.queue.length) {
      R.queue = R.queue.filter((q) => {
        if (q.day > S.day) return true;
        if (q.kind === 'scene') {
          const sc = scene(q.id); if (!sc) return false;
          // то же правило, что и у обычного триггера: не в день события и не при открытом окне шефа
          const r0 = (S.ev && S.ev.recent && S.ev.recent[0]) || null;
          if ((r0 && S.day - r0.day < (K().DEFER_DAYS[0] || 3)) || (S.chef && S.chef.pending)) { q.day = S.day + 2; return true; }
          start(S, sc); return false;
        }
        if (q.kind === 'rivalNear') { rivalNear(S, q.count || 1); return false; }
        if (q.kind === 'journal') return false;
        return false;
      });
    }
    if (monthStart(S)) {
      sharesMonthly(S);                    // доли сюжета: выплата 1-го числа
      const data = D();
      if (data && data.recordLineOfMonth) data.recordLineOfMonth(S); // реплику фиксируем один раз после месячного отчёта
    }
    // победа взята — через месяц приходит финал (игрок успевает увидеть экран победы)
    if (S.won && !R.wonQueued) { R.wonQueued = true; const fin = scene('sf1'); if (fin && !R.seen.sf1) R.queue.push({ kind: 'scene', id: 'sf1', day: S.day + 30 }); }
    const sc = pick(S, R);
    if (sc) start(S, sc);
  }
  function monthStart(S) { return E().dateOf(S.day).d === 1; }

  /* ---------------- письма и СМС (их показывает BK.StoryUI) ---------------- */
  function letter(S, o) {
    const R = ensure(S); if (!R) return null;
    if (R.lastLetter && S.day - R.lastLetter < K().LETTER_GAP_DAYS) return null;   // не чаще раза в месяц
    const it = { id: o.id || ('l' + S.day), who: o.who || 'semyon', title: o.title || '', text: o.text || '', form: o.form || 'letter', day: S.day, read: false };
    R.inbox.push(it); R.lastLetter = S.day; while (R.inbox.length > 40) R.inbox.shift();
    if (S.notify) S.notify.push({ type: 'story', phase: 'letter', id: it.id });
    return it;
  }
  // «Двор» открывает точки рядом с вашими (эффект rivalOpenNear и очередь)
  function rivalNear(S, count) {
    const I = E()._int || {};
    if (!S.rival || !S.rival.enabled || !I.rivalPlace) return 0;
    let n = 0;
    for (let i = 0; i < (count || 1); i++) { try { if (I.rivalPlace(S, 'near')) n++; } catch (e) { break; } }
    return n;
  }

  /* ---------------- доли сюжета: выплаты 1-го числа ---------------- */
  const positiveProfit = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0; };
  function storesAll(S) {
    const out = [], seen = new Set();
    const add = (list) => { for (const st of list || []) if (st && !seen.has(st)) { seen.add(st); out.push(st); } };
    add(S && S.stores);
    const cities = S && S.corp && S.corp.cities;
    if (cities) for (const id of Object.keys(cities)) { const c = cities[id]; if (c && c.packed) add(c.packed.stores); }
    return out;
  }
  // База доли задаётся данными сюжета: вся сеть, конкретная точка или город.
  // store1 — старый формат пролога; новые данные могут использовать store:<id|num>.
  function shareBase(S, sh, month) {
    const what = String((sh && sh.what) || '');
    if (what === 'net') return positiveProfit(month && month.profit);
    if (what.startsWith('city:')) {
      const id = what.slice(5), c = S && S.corp && S.corp.cities && S.corp.cities[id];
      const row = c && Array.isArray(c.hist) && c.hist.length ? c.hist[c.hist.length - 1] : null;
      return positiveProfit(row && row[3]);
    }
    let ref = null;
    if (what === 'store1') ref = (S && S.prologue && S.prologue.carry && S.prologue.carry.store1) || 1;
    else if (what.startsWith('store:')) ref = what.slice(6);
    if (ref == null || ref === '') return 0;
    const list = storesAll(S);
    let st = list.find((x) => String(x.id) === String(ref));
    if (!st && /^\d+$/.test(String(ref))) st = list.find((x) => Number(x.num) === Number(ref));
    return positiveProfit(st && st.last && st.last.profit);
  }
  function sharesMonthly(S) {
    const R = state(S); if (!R || !R.shares.length) return 0;
    const h = S.history || []; if (!h.length) return 0;
    const m = h[h.length - 1];
    let total = 0;
    for (const sh of R.shares) {
      const base = shareBase(S, sh, m);
      const pay = Math.round(base * (sh.pct || 0));
      if (pay > 0) total += pay;
    }
    if (total > 0) {
      const I = E()._int || {};
      if (I.spend) I.spend(S, total, 'inv'); else { S.cash -= total; S.month.inv = (S.month.inv || 0) + total; }
      R.lastShare = S.day;
    }
    return total;
  }

  /* ---------------- летопись для итогов игры ---------------- */
  function history(S) {
    const R = state(S); if (!R) return { list: [], chapters: [] };
    const list = R.log.slice().sort((a, b) => a.day - b.day);
    const chs = [];
    for (const it of list) {
      const c = it.chapter || 'city';
      if (!chs.length || chs[chs.length - 1].id !== c) chs.push({ id: c, name: chapterName(c), items: [] });
      chs[chs.length - 1].items.push(it);
    }
    return { list, chapters: chs, ending: R.ending ? (D().endings || {})[R.ending] : null, rel: R.rel, f: R.f };
  }
  function chapterName(id) {
    const c = ((D().chapters) || []).find((x) => x.id === id);
    return c ? c.name : id;
  }
  function summary(S) {
    const R = state(S); if (!R) return null;
    return {
      scenes: R.log.filter((x) => x.title && x.choice).length,
      seen: Object.keys(R.seen).length,
      rel: R.rel, m: R.m, f: R.f, ending: R.ending, perks: R.perks.slice(),
    };
  }

  /* ---------------- «Требует внимания» ---------------- */
  function attItems(S) {
    const R = state(S); const out = [];
    if (R && R.pending) {
      const sc = scene(R.pending.id);
      if (sc) out.push({ lvl: 'info', ic: 'chat', t: `Сюжет: «${sc.title}»`, d: 'Ждёт вашего решения.', b: { act: 'story', label: 'Открыть', primary: true } });
    }
    // Линия Олега: владелец просил, чтобы решение было прозрачным, — игрок заранее знает,
    // что главный финал этой линии разговор о партнёрстве, а не расправа. Строка живёт до финала.
    if (R && R.f && R.f.olegDeal && R.f.olegDeal !== 'done' && !R.seen.sf1) {
      out.push({
        lvl: 'info', ic: 'chat', t: 'Олег предлагает поговорить о будущем',
        d: R.f.olegDeal === 'word'
          ? 'Пока разговор идёт, «Двор» не режет цены и не встаёт рядом. В финале он позовёт к воде — говорить на равных.'
          : 'Он не зовёт и не угрожает. Просто ждёт, чем закончится война.',
        b: { act: 'threads', label: 'Подробнее' },
      });
    }
    // Линия Дамира: кем он станет, решают встречи, а не пролог. Игрок видит вектор заранее.
    if (R && R.f && R.f.lineDamir && !R.seen.kd3) {
      const DAM = {
        owe: 'Он вернётся — вы за него выходили, когда он «болел». Кем станет, решится на встрече.',
        shadow: 'Он вернётся, и разговор будет неприятным: в тот день он не болел.',
        served: 'Он работает у вас смену. Дальше — как себя покажет.',
        close: 'Вы отказали ему дважды. Он из тех, кто это помнит.',
        trusted: 'Вы поверили ему на слово. Теперь он или управляющий, или подстава.',
        smeared: 'Тему закрыли, не разобравшись. Он это запомнил — как и Рашид.',
        thief: 'Он подставлял вас перед Рашидом. Это ещё всплывёт.',
        boss: 'Он ведёт город и обязан вам. Пока — ведёт честно.',
      };
      out.push({ lvl: 'info', ic: 'chat', t: 'Дамир: чем это кончится', d: DAM[R.f.lineDamir] || 'Он вернётся — вы его знаете.', b: { act: 'threads', label: 'Подробнее' } });
    }
    // Кто появляется рядом (партнёр): видно задолго до сцены — и это следствие игры, а не случайности.
    if (R && R.f && R.f.mateKind && !R.seen.kf3 && R.f.mateKind !== 'none') {
      out.push({ lvl: R.f.mateKind === 'tyrant' ? 'warn' : 'info', ic: 'chat', t: R.f.mateKind === 'helper' ? 'Рядом появляется человек, который считает' : 'Рядом появляется человек с деньгами', d: MATE_TEXT[R.f.mateKind], b: { act: 'threads', label: 'Подробнее' } });
    }
    return out;
  }

  /* ---------------- подключение ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__story) return;
    Eng.__story = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* сюжет не должен ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Story = {
    ensure, state, fill, scene, scenes, pendingScene, resolve, start, day, history, summary, attItems, letter, rivalNear, shareBase, sharesMonthly,
    chapter, hero, chapterName, defaults, fits, cond,
    wire, mateKind, mateScore, closeLine,   // сквозные линии: пролог → нити, кто рядом, счёт для концовки
  };
})();
