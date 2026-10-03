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

  /* ---------------- условия триггера ---------------- */
  function cond(S, R, c) {
    if (c.stores != null) return openStores(S).length >= c.stores;
    if (c.months != null) return months(S) >= c.months;
    if (c.year != null) return year(S) >= c.year;
    if (c.rivalStores != null) { const rv = S.rival || {}; return (rv.stores ? rv.stores.length : (rv.n || 0)) >= c.rivalStores; }
    if (c.prod != null) return !!(S.productions && S.productions.length);
    if (c.cash != null) return S.cash >= c.cash;
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
    if (monthStart(S)) sharesMonthly(S);   // доли сюжета: выплата 1-го числа
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
  function sharesMonthly(S) {
    const R = state(S); if (!R || !R.shares.length) return 0;
    const h = S.history || []; if (!h.length) return 0;
    const m = h[h.length - 1];
    let total = 0;
    for (const sh of R.shares) {
      const base = sh.what === 'net' ? Math.max(0, m.profit) : Math.max(0, m.profit);   // доля от прибыли сети
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
    ensure, state, fill, scene, scenes, pendingScene, resolve, start, day, history, summary, attItems, letter, rivalNear, sharesMonthly,
    chapter, hero, chapterName, defaults, fits, cond,
  };
})();
