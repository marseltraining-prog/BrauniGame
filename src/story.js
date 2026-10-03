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
      lastScene: 0, lastLetter: 0, lastLine: 0, famNext: 0, famSeen: {},
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
    applyHero(S);                                   // имя и пол со стартового экрана — в новое состояние
    return S.story;
  }

  /* ---------------- герой игрока: имя и пол (PLAN.md §8.1) ----------------
     Игрок выбирает имя и пол на стартовом экране (src/ui/app.js), выбор живёт в S.story.hero —
     это поле уже было в схеме (src/prologue.js, storyDefaults), но никто его не заполнял.
     Пока состояния сюжета нет (до первого дня игры или при выключенном сюжете), выбор лежит
     в служебном S.__hero — тем и хорош: новая игра с прологом не создаёт S.story раньше времени
     и не портит главу партии («Пролог» вместо «Своя точка»).
     Пол: 'm' — мужчина, 'f' — женщина, null — не выбирали (старые сохранения, боты): тексты
     остаются нейтральными, облик — прежний, по названию сети (src/ui/stage1.js). */
  function heroOf(S) {
    const R = state(S), h = (R && R.hero) || (S && S.__hero) || null;
    return { name: (h && h.name) ? String(h.name) : '', g: h && h.g === 'f' ? 'f' : h && h.g === 'm' ? 'm' : null };
  }
  function applyHero(S) {
    // выбор со стартового экрана переезжает в состояние сюжета, как только оно появилось
    if (!S || !S.story || !S.__hero) return;
    S.story.hero = { name: S.__hero.name || '', g: S.__hero.g || null };
  }
  function heroSet(S, o) {
    if (!S) return null;
    const h = { name: String((o && o.name) || '').trim().slice(0, 24), g: o && o.g === 'f' ? 'f' : o && o.g === 'm' ? 'm' : null };
    const R = state(S);
    if (R) R.hero = h; else S.__hero = h;
    return h;
  }
  // Имя героя для текстов. Пустое имя — не «дырка»: в игре его зовут «шеф» (как в src/data/story-lines.js).
  function heroName(S) { const h = heroOf(S); return h.name || 'шеф'; }
  const heroG = (S) => heroOf(S).g;
  const isFemale = (S) => heroOf(S).g === 'f';
  // Родовые формы: g(S, 'сказал', 'сказала'). Без выбора пола — мужская форма (как было до §8.1).
  function g(S, m, f) { return isFemale(S) ? f : m; }
  // Склонение имени: «Аня» → «Ане», нужно для писем и летописи (имя приходит от игрока, падеж угадываем).
  function heroNameDat(S) { const n = heroName(S); return /[ая]$/i.test(n) ? n.slice(0, -1) + 'е' : n; }

  /* Подстановки родовых форм в тексты: {имя формы} вместо двух вариантов.
     Данные сцен не переписываем — только те места, где форма важна (PLAN.md §8.1).
     Формы для мужчины (по умолчанию и без выбора) — как в текстах было. */
  const SEX = {
    say: ['сказал', 'сказала'], self: ['сам', 'сама'], ready: ['готов', 'готова'], must: ['должен', 'должна'],
    came: ['пришёл', 'пришла'], went: ['пошёл', 'пошла'], tired: ['устал', 'устала'], glad: ['рад', 'рада'],
    sure: ['уверен', 'уверена'], alone: ['один', 'одна'], made: ['сделал', 'сделала'], opened: ['открыл', 'открыла'],
    agreed: ['согласился', 'согласилась'], left: ['ушёл', 'ушла'], stayed: ['остался', 'осталась'],
    took: ['взял', 'взяла'], could: ['смог', 'смогла'], did: ['успел', 'успела'], grew: ['вырос', 'выросла'],
    young: ['молодой человек', 'девушка'], youngGen: ['молодого человека', 'девушки'],
    boss: ['начальник', 'начальница'], mate: ['партнёр', 'партнёрша'],
  };
  const SEX_RE = /\{(say|self|ready|must|came|went|tired|glad|sure|alone|made|opened|agreed|left|stayed|took|could|did|grew|young|youngGen|boss|mate)\}/g;
  /* Отдельные фразы, написанные заранее (src/data/story-lines.js — строки отчёта месяца; файл вне
     правки §8.1). Заменяем целиком фразу, а не слово «сам»: в тех же репликах «сам» бывает про
     другого человека («Вот этот батон я бы купил сам» — это Семён), и слепая замена ломала бы смысл. */
  // (?!…) вместо \b: в JavaScript \b работает только по латинице, для кириллицы границы слова не видит
  const SEX_PHRASES = [
    [/решай сам(?![а-яё])/g, 'решай сама'], [/Дальше сам(?![а-яё])/g, 'Дальше сама'], [/Реши сам(?![а-яё])/g, 'Реши сама'],
    [/поймёшь сам(?![а-яё])/g, 'поймёшь сама'], [/Скажи сумму сам(?![а-яё])/g, 'Скажи сумму сама'],
    // книга Семёна (src/ui/story-history.js): о хозяине первой точки — в женском роде о хозяйке
    [/очень нервного хозяина/g, 'очень нервной хозяйки'],
  ];
  function heroText(S, txt) {
    if (txt == null) return txt;
    let s = String(txt);
    if (s.indexOf('{') < 0 && !isFemale(S)) return s;
    if (s.indexOf('{') >= 0) s = s.replace(SEX_RE, (m, k) => (SEX[k] ? SEX[k][isFemale(S) ? 1 : 0] : m));
    s = s.split('{name}').join(heroName(S));
    if (isFemale(S)) for (const [re, to] of SEX_PHRASES) s = s.replace(re, to);
    return s;
  }
  // То же, но для готовой разметки: подстановки идут только вне тегов (в атрибутах «сам» не встречается,
  // но правило честнее — разметку не трогаем).
  function heroHtml(S, html) {
    if (html == null) return html;
    return String(html).split(/(<[^>]*>)/).map((p) => (p.charAt(0) === '<' ? p : heroText(S, p))).join('');
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
    if (R.famNext == null) R.famNext = 0;
    if (!R.famSeen || typeof R.famSeen !== 'object') R.famSeen = {};
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

  /* ===================== личные (семейные) линии =====================
     Требование владельца: «строка/блок в „Требует внимания“ и в „Сводке“: например „Мама болеет —
     4 дня, чтобы решить“ … когда срок подходит — предупреждение через те же механизмы, что уже есть
     (BK.Threads, attItems, тосты). Ничего не должно падать на голову».

     Поэтому семейное дело живёт в реестре нитей (src/threads.js, BK.Threads): у записи есть who/role/
     text/срок, её видно в «Требует внимания», в окне «Вас помнят» и в «Сводке». Две добавки к нитям
     (в threads.js, там же объяснено): поле `ask` — короткая человеческая строка («Мама болеет») и
     поля `act`/`arg` — кнопка «Решить», которая открывает окно выбора (src/ui/story-ui.js).
     Тексты и числа дел — в данных: BK.STORY.family (src/data/story-russia.js).

     Срок — это и есть «ничего не делать»: не решили за N дней — дело решается само (цена у него своя,
     мягче решения, и она тоже названа заранее). Баланса не касается: живёт только при включённом
     сюжете (CFG.STORY.ON), в прогонах ботов его нет. */
  const FAM = () => (D() && D().family) || null;
  // свои мелкие помощники: story.js — логика без DOM, но блок «Свои люди» собирает разметку сам
  const nwd = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return n + ' ' + (x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const famDefs = () => { const f = FAM(); return Array.isArray(f) ? f : (f ? Object.keys(f).map((k) => f[k]) : []); };
  const famById = (id) => famDefs().filter((d) => d && d.id === id)[0] || null;
  const famName = (d) => d.name || (hero(d.who) ? hero(d.who).name : d.who);
  // без лишних копий: список нитей бывает длинным, а личных дел в нём единицы.
  // Пустой реестр — вовсе без выделения памяти (это вызывается на каждый день и на каждую панель).
  const famThreads = (S, open) => {
    const T = BK.Threads; if (!T || !T.state) return [];
    const R = T.state(S); if (!R || !Array.isArray(R.list) || !R.list.length) return [];
    const out = [];
    for (const t of R.list) if (t && t.src === 'family' && (open ? !t.done : true)) out.push(t);
    return out;
  };
  const famLeft = (S, t) => Math.max(0, Math.round(t.due - S.day));

  // завести дело: обычная нить + ask/act/arg для окна и счётчика
  function famStart(S, def) {
    const T = BK.Threads, R = ensure(S);
    if (!T || !def || !R) return null;
    if (R.famSeen[def.id]) return null;
    if (famThreads(S, true).length) return null;                       // одно личное дело за раз — не заваливаем игрока
    const id = 'fam-' + def.id;
    const t = T.add(S, {
      id, who: famName(def), role: def.role || 'свои люди', kind: 'promise',
      ask: def.ask || def.title || famName(def),
      text: def.text || '',
      due: S.day + (def.days || 4),
      city: null, src: 'family', act: 'fam', arg: id,
      effect: { text: def.effect || 'решится само, и не так, как вы хотели' },
    });
    R.famSeen[def.id] = S.day;
    R.famNext = S.day + (def.gap || 0);
    const I = E()._int || {};
    if (I.toast) I.toast(S, def.title || ('Свои люди: ' + (def.ask || famName(def))), `${def.text || ''} ${T.askText ? T.askText(S, t) : ''}`.trim(), 'info');
    if (I.log) I.log(S, `Свои люди: ${def.ask || famName(def)} — ${def.days || 4} дн., чтобы решить. ${def.text || ''}`, 'info');
    return t;
  }
  // день: заводим новое дело, предупреждаем о сроке, отпускаем просроченное
  function famDay(S) {
    const R = state(S); if (!R || R.mode === 'off') return;
    const T = BK.Threads; if (!T) return;
    const open = famThreads(S, true);
    if (!open.length && S.day < (R.famNext || 0)) return;      // ни дела, ни срока — дальше работы нет вовсе
    // 1) просроченные: «не решили — решилось само» (цену игрок видел заранее)
    const still = [];
    for (const t of open) {
      if (S.day >= t.due) { const def = famById(String(t.id).replace(/^fam-/, '')); famClose(S, t, def, null, true); }
      else still.push(t);
    }
    // 2) предупреждения за 7 / 3 / 1 день
    for (const t of still) {
      const left = famLeft(S, t);
      if (left > 7) continue;
      t.warned = t.warned || {};
      const th = left <= 1 ? 1 : left <= 3 ? 3 : 7;
      if (t.warned[th]) continue;
      t.warned[th] = 1;
      const I = E()._int || {};
      const days = nwd(left, 'день', 'дня', 'дней');
      if (I.toast) I.toast(S, t.ask || ('Свои люди: ' + t.who), `${t.who}: ${t.text} ${left > 0 ? `Осталось ${days} — решите или решится само.` : 'Срок вышел.'}`, th <= 1 ? 'warn' : 'info');
    }
    // 3) пора завести следующее дело
    if (still.length || S.day < (R.famNext || 0)) return;
    const def = pickFam(S, R);
    if (def) famStart(S, def);
  }
  // какое дело начать: сначала те, что пришли из пролога (мама болеет, сестра, комната), потом общие
  function pickFam(S, R) {
    const list = famDefs();
    const ready = (d) => {
      if (!d || R.famSeen[d.id]) return false;
      const w = d.when || {};
      if (w.flag) for (const k of Object.keys(w.flag)) { if (R.f[k] !== w.flag[k]) return false; }
      if (w.flagAny) { if (!Object.keys(w.flagAny).some((k) => R.f[k] === w.flagAny[k])) return false; }
      if (w.rel != null && (R.rel[d.rel || 'family'] || 0) < w.rel) return false;
      if (w.day != null && S.day < w.day) return false;
      if (w.year != null && year(S) < w.year) return false;
      return true;
    };
    const prolog = list.filter((d) => d.from === 'prologue' && ready(d));
    if (prolog.length) return prolog[0];
    const any = list.filter((d) => d.from !== 'prologue' && ready(d));
    if (!any.length) return null;
    // общие дела идут по кругу: берём самое «давно не виденное»
    any.sort((a, b) => (R.famSeen[a.id] || 0) - (R.famSeen[b.id] || 0));
    return any[0];
  }
  // варианты дела — для окна (src/ui/story-ui.js)
  function famOpts(S, id) {
    const t = famThreads(S, true).filter((x) => x.id === id)[0];
    const def = t ? famById(String(id).replace(/^fam-/, '')) : null;
    return (def && def.opts) ? def.opts : [];
  }
  // решение игрока: применяем цену и последствие, нить уходит в «уже отозвалось»
  function famPick(S, id, idx) {
    const T = BK.Threads, R = ensure(S);
    const t = T && T.byId ? T.byId(S, id) : null;
    const def = famById(String(id || '').replace(/^fam-/, ''));
    if (!t || t.done || !def) return { ok: false, msg: 'Этого дела уже нет' };
    const o = (def.opts || [])[+idx];
    if (!o) return { ok: false, msg: 'Нет такого решения' };
    return famClose(S, t, def, o, false);
  }
  function famClose(S, t, def, o, missed) {
    const R = ensure(S), I = E()._int || {}, out = [];
    const relWho = (def && def.rel) || 'family';
    const d = def || {};
    if (o) {
      if (o.cost) { const v = Math.round(o.cost); if (I.spend) I.spend(S, v, 'other'); else S.cash -= v; out.push('деньги'); }
      if (o.rel) { R.rel[relWho] = clamp((R.rel[relWho] || 0) + o.rel, -100, 100); out.push(`${relWho}: отношения ${o.rel > 0 ? '+' : ''}${o.rel}`); }
      if (o.traffic) S.mods.push({ t: 'traffic', m: o.traffic, until: S.day + (o.days || 7), scope: 'global', target: null, src: 'fam' });
      if (o.care) R.m.care = clamp((R.m.care || 0) + o.care, -100, 100);
    } else {
      // не решили: цена названа заранее («решится само»)
      const rel = d.waitRel == null ? -12 : d.waitRel;
      R.rel[relWho] = clamp((R.rel[relWho] || 0) + rel, -100, 100);
      out.push(`${relWho}: отношения ${rel}`);
    }
    t.done = true; t.doneAt = S.day;
    t.ask = null;                                                   // счётчика больше нет: дело закрыто
    const label = o ? (o.label || 'Решено') : 'Не решили — решилось само';
    const line = `${d.ask || t.who}: ${label}.${out.length ? ' ' + out.join('; ') + '.' : ''}`;
    R.log.push({ day: S.day, id: 'fam_' + t.id + '_' + S.day, title: 'Свои люди: ' + (d.ask || t.who), choice: label, chapter: chapter(S, R), fx: ['fam'] });
    while (R.log.length > 120) R.log.shift();
    if (I.log) I.log(S, line, missed ? 'bad' : 'info');
    if (I.toast) I.toast(S, missed ? 'Не успели' : 'Решено', line, missed ? 'warn' : 'good');
    R.famNext = Math.max(R.famNext || 0, S.day + (d.gap || 0));
    try { if (BK.App && BK.App.save) BK.App.save(); } catch (e) { /* сохранит автосейв */ }
    return { ok: true, missed: !!missed, label, out };
  }
  // блок «Свои люди» в «Сводке»: кто ждёт, сколько дней, кнопка «Решить»
  function famDash(S) {
    const T = BK.Threads; if (!T || !T.askText) return '';
    const list = famThreads(S, true);
    if (!list.length) return '';
    const rows = list.map((t) => {
      const left = famLeft(S, t);
      const lvl = left <= 1 ? 'bad' : left <= 7 ? 'warn' : '';
      return `<li><span class="ic">${FAM_ICON}</span><div class="tx"><b>${esc(t.ask || t.who)}</b><small>${esc(t.text || '')}</small>${lvl ? `<small class="fam-left">${left > 0 ? `Осталось ${nwd(left, 'день', 'дня', 'дней')}` : 'сегодня последний день'}</small>` : ''}</div>` +
        `<button class="btn sm ${lvl === 'warn' || lvl === 'bad' ? 'primary' : ''}" data-act="fam" data-arg="${esc(t.id)}">Решить</button></li>`;
    });
    return `<div class="sec fam-sec thr-block"><h3><span class="fam-h">${FAM_ICON}Свои люди</span></h3>
      <ul class="fam-list">${rows.join('')}</ul>
      <p class="hint">Личное дело никуда не денется само: у него есть срок, и он виден здесь каждый день.</p></div>`;
  }
  // для памяти «Требует внимания» (panels.js): состав дел и сроки
  function famKey(S) {
    const list = famThreads(S, true);
    return list.length ? list.map((t) => t.id + ':' + famLeft(S, t)).join(',') : '';
  }
  const FAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/></svg>';

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
    // В летопись (и в PNG-картинку итогов, и в тост) запись попадает уже с именем и родовой формой героя:
    // подстановка на отрисовке есть только у окна сцены, а итоги и картинка рисуют текст как он записан.
    const label = heroText(S, ch.log || ch.label), title = heroText(S, sc.title);
    R.log.push({ day: S.day, id: sc.id, title: title, choice: label, chapter: R.ch, fx: list });
    while (R.log.length > 120) R.log.shift();
    if (S.notify) S.notify.push({ type: 'story', phase: 'done', id: sc.id, title: title, choice: label, out: out.join('; ') });    return { ok: true, scene: sc, choice: ch, out };
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
      // личное (семейное) дело прямо из сцены: { t:'fam', id:'mama', days:5 } — заводим нить с видимым сроком
      case 'fam': {
        const def = (fx.def && typeof fx.def === 'object') ? fx.def : famById(fx.id);
        if (!def) return null;
        const t = famStart(S, Object.assign({}, def, fx.days ? { days: fx.days } : null));
        return t ? `свои люди: ${def.ask || famName(def)}` : null;      }
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
  // Герой по городу партии (src/data/story-cast.js): для Уфы — прежняя запись без изменений.
  function cityHero(S, id) {
    if (BK.STORY_CAST && BK.STORY_CAST.hero) { try { return BK.STORY_CAST.hero(S, id); } catch (e) { /* прежний герой */ } }
    return hero(id);
  }
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
    wrapLines();          // «мёртвые не говорят» — данные реплик могли подключиться позже (порядок файлов в сборке любой)
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
    try { famDay(S); } catch (e) { /* личные дела не должны ломать игру */ }
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
  // Местный слой (src/data/story-cast.js): в этих строках встречаются имена людей и названия
  // («Олег предлагает поговорить…», «Дамир: чем это кончится»). Для партии не в Уфе заменяем
  // их на местные; для Уфы функция возвращает текст как есть, поэтому строки не меняются.
  function castSwap(S, t) { return (BK.STORY_CAST && BK.STORY_CAST.swap) ? BK.STORY_CAST.swap(S, t) : t; }
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
    for (const it of out) { it.t = castSwap(S, it.t); it.d = castSwap(S, it.d); }
    return out;
  }

  /* ---------------- подключение ---------------- */
  // Мёртвые не говорят: после тяжёлого момента (флаг rashidGone) реплика месяца не может прийти
  // от Рашида. Данные реплик не трогаем — на время одного вызова подменяем «кто говорит»
  // у его ситуаций (waste/quality/mentor) на героя, у которого таких текстов нет: вариант просто
  // пропускается, и говорит следующий по весу (src/data/story-lines.js, recordLineOfMonth).
  function goneHeroes(S) {
    const R = state(S), out = [];
    if (R && R.f && R.f.rashidGone) out.push('rashid');
    return out;
  }
  function wrapLines() {
    const data = D();
    if (!data || typeof data.recordLineOfMonth !== 'function' || data.__goneWrap) return;
    data.__goneWrap = true;
    const orig = data.recordLineOfMonth, map = data.lineSituations;
    data.recordLineOfMonth = function (S) {
      const gone = goneHeroes(S);
      if (!gone.length || !map) return orig.apply(this, arguments);
      const saved = {};
      try {
        for (const k of Object.keys(map)) if (gone.indexOf(map[k]) >= 0) { saved[k] = map[k]; map[k] = 'gone'; }
        return orig.apply(this, arguments);
      } finally { for (const k of Object.keys(saved)) map[k] = saved[k]; }
    };
  }
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
  wrapLines();
  // story.js собран раньше src/data/story-lines.js? Тогда обёртка «мёртвые не говорят» встанет
  // на первом же дне (см. wrapLines() в day()): порядок файлов в сборке на это не влияет.

  /* Строка героя в отчёте месяца (BK.STORY.lineHtml, src/data/story-lines.js) — по городу партии
     и по полу героя: имя говорящего и реплику прогоняем через местный слой (для Уфы — как есть)
     и через родовые формы (src/story.js → heroHtml). Обёртка безопасна: если модуля реплик рядом
     нет (прогоны ботов) или слой не подключён — ничего не делаем.

     Важно: подстановки идут ТОЛЬКО вне тегов и по точным фразам — иначе «сам» в реплике Семёна
     («Вот этот батон я бы купил сам») превратился бы в женскую форму. */
  function wrapLineHtml() {
    const D2 = BK.STORY;
    if (!D2 || !D2.lineHtml || D2.__castLine) return false;
    D2.__castLine = true;
    const orig = D2.lineHtml;
    D2.lineHtml = function (S) {
      const html = orig.apply(this, arguments);
      try { return heroHtml(S, BK.STORY_CAST ? BK.STORY_CAST.swap(S, html) : html); } catch (e) { return html; }
    };
    return true;
  }
  wrapLineHtml();
  if (BK.STORY) BK.STORY.wrapLineHtml = wrapLineHtml;   // для проверок и нестандартного порядка сборки

  /* Итоги игры и книга Семёна (BK.StoryHistory, src/ui/story-history.js) собирают текст без подстановок:
     там нет ни {name}, ни {street}, ни городского слоя, ни родовых форм. Файл интерфейса в этой задаче
     не правим — доводим его снаружи, обёрткой готовой разметки: подстановки идут только вне тегов.
     Заодно в книгу Семёна добавляется посвящение с именем героя (если игрок имя задал) — книга
     подписана, как и положено книге о человеке. Вызывается один раз из src/ui/app.js (boot):
     к этому времени BK.StoryHistory уже создан. Нет модуля — нет и правки. */
  function patchHistory() {
    const SH = BK.StoryHistory;
    if (!SH || SH.__hero || typeof SH.summarySection !== 'function') return false;
    SH.__hero = true;
    const orig = SH.summarySection;
    SH.summarySection = function (S) {
      let html; try { html = orig.apply(this, arguments); } catch (e) { return ''; }
      if (!html) return html;
      try { if (BK.STORY_CAST && BK.STORY_CAST.render) html = BK.STORY_CAST.render(S, html); } catch (e) { /* без местных имён */ }
      html = heroHtml(S, html);
      const name = heroOf(S).name;
      if (name) html = html.replace(/(<div class="sh-bl">[\s\S]*?)(<\/div>)/,
        (m, a, b) => a + `<p>Посвящение одно: «${htmlEsc(name)}».</p>` + b);
      return html;
    };
    return true;
  }
  const htmlEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  BK.Story = {
    ensure, state, fill, scene, scenes, pendingScene, resolve, start, day, history, summary, attItems, letter, rivalNear, shareBase, sharesMonthly,
    chapter, hero, chapterName, defaults, fits, cond, cityHero,
    wire, mateKind, mateScore, closeLine,   // сквозные линии: пролог → нити, кто рядом, счёт для концовки
    chapter, hero, chapterName, defaults, fits, cond,
    // личные (семейные) линии: живут в реестре нитей (BK.Threads), но решает их сюжет
    famDay, famStart, famPick, famOpts, famDash, famKey, famList: famThreads, famDefs, famName, famLeft, heroOf, heroSet, heroName, heroNameDat, heroG, isFemale, applyHero, g, heroText, heroHtml, patchHistory,
  };
})();
