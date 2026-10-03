/* =====================================================================
   НИТИ ИСТОРИИ (BK.Threads) — фундамент «живого сюжета», часть 1 (docs/story-v2.md, этап 7).

   Реестр людей, которые что-то о вас помнят: кто он, чем обижен или что обещал, когда это
   отзовётся и что произойдёт. Нить приходит через годы, но её ВИДНО заранее («Требует внимания»
   и окно «Вас помнят»), и она меняет механику, а не только текст: обиженный человек затягивает
   открытие ваших точек в городе (openGap → срок открытия × множитель), благодарный — ускоряет.

   Запись: { id, who, role, kind: 'favor'|'grudge'|'promise', text, city, from, due, effect, done,
              doneAt, until, src }
     who    — имя;  role — кто он («пожарный инспектор»);
     text   — что помнит («вы выставили его из кофейни — он этого не забыл»);
     city   — город или null (null — вся сеть);
     from   — день, когда запомнил;  due — день, когда отзовётся;
     effect — что произойдёт: { text, openK (множитель срока открытия в городе), days (сколько длится),
              fx: [обычные эффекты событий — применяет BK.Engine._int.applyEffects] };
     done   — уже отозвалось;  until — до какого дня длится последствие (для openK).

   Состояние — S.threads = { v, list, n }. Пока ни одной нити нет, поля нет вовсе: игра и боты
   работают ровно как раньше (проверка — node sim/threads.js, node sim/bot.js good 3 18 --summary).
   Старые сохранения не ломаются: ensure() дозаполняет всё, чего не хватает.

   Без DOM. Интерфейс — src/ui/threads-ui.js + threads.css. Обёртка BK.Engine.tick (после дня —
   сроки и fire), движок не менялся. Числа — CFG.OPEN_DAYS (базовый срок открытия точки).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const C = () => BK.CFG, I = () => (BK.Engine && BK.Engine._int) || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const def = (id) => (BK.CITY_BY_ID || {})[id] || null;
  const cityName = (id) => (def(id) || {}).name || String(id == null ? '' : id);
  const cityIn = (id) => (def(id) || {}).in || ('в ' + cityName(id));            // «в Казани»
  const KINDS = { favor: 'благодарность', grudge: 'обида', promise: 'обещание' };
  let DEMO = true;   // живой пример нити владельца (обиженный завсегдатай → инспектор). Боты модуль не грузят.

  /* ---------------- состояние ---------------- */
  function defaults() { return { v: 1, list: [], n: 0 }; }
  function state(S) { return S && S.threads && S.threads.v ? S.threads : null; }
  function ensure(S) {                       // безопасные значения по умолчанию (в т. ч. для старых сохранений)
    if (!S) return null;
    if (S.threads && S.threads.v) {
      const R = S.threads;
      if (!Array.isArray(R.list)) R.list = [];
      if (R.n == null) R.n = R.list.length;
      return R;
    }
    S.threads = defaults();
    return S.threads;
  }

  /* ---------------- чтение ---------------- */
  function list(S) { const R = state(S); return R ? R.list.slice() : []; }
  function byId(S, id) { return list(S).find((t) => t.id === id) || null; }
  function due(S) { return list(S).filter((t) => !t.done && S.day >= t.due); }             // созревшие, но ещё не отозвались
  function waiting(S) { return list(S).filter((t) => !t.done).sort((a, b) => a.due - b.due); }
  // нить отозвалась и ещё давит: пока не вышел срок; без срока — пока нить не закрыли (clear)
  function lingering(S, t) { return !!(t.done && (t.until == null ? !!((t.effect || {}).openK) : S.day <= t.until)); }
  function active(S) { return list(S).filter((t) => lingering(S, t)).sort((a, b) => (a.until || 0) - (b.until || 0)); }
  function past(S) { return list(S).filter((t) => t.done && !lingering(S, t)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)); }
  function base() { const cfg = C(); if (!cfg) return 21; if (cfg.OPEN_DAYS_BASE == null) cfg.OPEN_DAYS_BASE = cfg.OPEN_DAYS; return cfg.OPEN_DAYS_BASE || 21; }

  /* ---------------- множитель срока открытия в городе ----------------
     Пока нить не отозвалась (не done) — механика не меняется: игрок видит предупреждение заранее.
     После — множитель действует, пока не вышел срок (until). Город null — вся сеть. */
  function openGap(S, city) {
    const R = state(S); if (!R || !R.list.length) return 1;
    let k = 1;
    for (const t of R.list) {
      if (!t.done || !lingering(S, t)) continue;
      const e = t.effect || {}; if (!e.openK) continue;
      if (t.city && city && t.city !== city) continue;              // чужая нить
      if (t.city && !city) continue;
      k *= clamp(e.openK, 0.5, 3);
    }
    return clamp(k, 0.5, 3);
  }
  function openDays(S, city) { return Math.max(1, Math.round(base() * openGap(S, city))); }
  function addDays(S, city) { return openDays(S, city) - base(); }   // на сколько дней дольше (+) или быстрее (−)

  /* ---------------- тексты ---------------- */
  function nwd(n, a, b, c) { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return n + ' ' + (x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c); }
  function date(S, day) { try { return BK.Engine.fmtDate(day); } catch (e) { return 'день ' + Math.round(day); } }
  function openText(S, t) {              // «в Самаре открытие точек дольше на 29 дней (50 вместо 21)»
    const e = t.effect || {}; if (!e.openK || !t.city) return '';
    const d = openDays(S, t.city), b = base(), add = Math.abs(d - b);
    return `${cityIn(t.city)} открытие точек ${e.openK >= 1 ? 'дольше' : 'быстрее'} на ${nwd(add, 'день', 'дня', 'дней')} (${d} вместо ${b})`;
  }
  function effectText(S, t) {
    const e = t.effect || {}, out = [];
    if (e.text) out.push(e.text);
    const ot = openText(S, t);
    if (ot) out.push(ot + (e.days ? ` — ${nwd(Math.max(1, Math.round(e.days / 30)), 'месяц', 'месяца', 'месяцев')}` : ''));
    if (!out.length && e.fx && e.fx.length) out.push('деньги и дела сети');
    return out.join(': ') || 'пока ничем';
  }
  function short(S, t) { return t.role || t.who; }
  function kindName(k) { return KINDS[k] || 'обещание'; }

  /* ---------------- запись ---------------- */
  function normFx(fx) {
    if (!fx) return {};
    if (Array.isArray(fx)) return { fx: fx.slice() };
    const e = Object.assign({}, fx);
    if (e.fx && !Array.isArray(e.fx)) e.fx = [e.fx];
    if (e.openK != null) e.openK = clamp(+e.openK, 0.5, 3);
    if (e.days != null) e.days = Math.max(1, Math.round(e.days));
    return e;
  }
  // add(S, { who, role, kind, text, city, from, due|after, effect, src })
  function add(S, o) {
    if (!S || !o) return null;
    const R = ensure(S); if (!R) return null;
    const from = o.from != null ? o.from : S.day;
    const t = {
      id: o.id || ('th' + (++R.n)),
      who: o.who || 'знакомый',
      role: o.role || '',
      kind: KINDS[o.kind] ? o.kind : 'promise',
      text: o.text || '',
      city: o.city || null,
      from,
      due: Math.round(o.due != null ? o.due : from + (o.after != null ? o.after : 365)),
      effect: normFx(o.effect),
      done: false, doneAt: null, until: null,
      src: o.src || null,
    };
    R.list.push(t);
    while (R.list.length > 40) R.list.shift();          // реестр не растёт бесконечно
    const i = I();
    if (i.log) i.log(S, `Вас помнит ${t.who}${t.role ? ` (${t.role})` : ''}: ${t.text}`, 'info');
    if (i.toast) i.toast(S, 'Вас помнят', `${t.who}${t.role ? ` — ${t.role}` : ''}. ${t.text}`, 'info');
    chronicle(S, t, t.text, 'Вас помнит ' + t.who);
    refresh(S);
    return t;
  }
  // списать нить: помирились, человек ушёл, обещание закрыто вручную
  function clear(S, id) {
    const R = state(S); if (!R) return null;
    const i = R.list.findIndex((t) => t.id === id); if (i < 0) return null;
    const t = R.list.splice(i, 1)[0];
    const I_ = I(); if (I_.log) I_.log(S, `Вас больше не помнит ${t.who}: нить закрыта.`, 'info');
    refresh(S);
    return t;
  }
  function fire(S) {                 // применить созревшее: обычные эффекты игры + последствие на сроки
    const R = state(S); if (!R) return [];
    const out = [];
    for (const t of R.list) {
      if (t.done || S.day < t.due) continue;
      t.done = true; t.doneAt = S.day;
      const e = t.effect || {};
      if (e.days) t.until = S.day + e.days;
      let res = [];
      if (e.fx && e.fx.length) { try { res = BK.Engine.applyEffects(S, e.fx, { scope: 'global', target: null }) || []; } catch (err) { res = []; } }
      const txt = effectText(S, t) + (res.length ? ` (${res.join('; ')})` : '');
      const i = I();
      if (i.log) i.log(S, `Отозвалось: ${t.who} — ${txt}`, t.kind === 'grudge' ? 'bad' : 'good');
      if (i.toast) i.toast(S, t.kind === 'grudge' ? 'Вас помнят — и не по-доброму' : 'Вас помнят', `${t.who}: ${txt}`, t.kind === 'grudge' ? 'warn' : 'good');
      chronicle(S, t, txt, 'Вас помнит ' + t.who);
      out.push(t);
    }
    if (out.length) refresh(S);   // срок открытия в городе пересчитываем сразу: игрок это увидит в тот же день
    return out;
  }

  /* ---------------- летопись (S.story.log) и итоги игры ----------------
     Запись той же формы, что пишет сюжет: она попадает в «Летопись по главам» и в раздел
     «История» на экране итогов игры («Вас помнит …»). Без сюжета (боты) — ничего не пишем. */
  function chronicle(S, t, txt, title) {
    try {
      if (!(BK.Story && BK.Story.state && BK.Story.state(S))) return;
      const R = S.story; if (!R || !Array.isArray(R.log)) return;
      R.log.push({ day: S.day, id: 'th_' + t.id + '_' + S.day, title, choice: txt, chapter: BK.Story.chapter ? BK.Story.chapter(S, R) : 'city', fx: ['threads'] });
      while (R.log.length > 120) R.log.shift();
    } catch (e) { /* нить не должна ломать игру */ }
  }
  // короткая сводка для итогов игры и окна реестра
  function summary(S) {
    const R = state(S); if (!R) return null;
    const a = active(S), p = waiting(S), d = past(S);
    return { n: R.list.length, active: a.length, waiting: p.length, past: d.length, list: R.list.slice(), openGap: (city) => openGap(S, city) };
  }

  /* ---------------- «Требует внимания» ---------------- */
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.4"/><path d="M5.5 20c.7-4 3.4-6 6.5-6s5.8 2 6.5 6"/></svg>';
  function attItems(S) {
    const R = state(S); const out = [];
    if (!R || !R.list.length) return out;
    for (const t of active(S)) {                                   // уже отозвалось и давит сейчас
      if (out.length >= 2) break;
      const ot = openText(S, t);
      out.push({
        lvl: 'warn', ic: 'alert', icHtml: ICON,
        t: `Вас помнит ${short(S, t)}`,
        d: `${t.who}: ${ot || effectText(S, t)}${t.until ? ` — до ${date(S, t.until)}` : ''}. Что ещё помнит — в окне «Вас помнят».`,
        b: { act: 'threads', label: 'Подробнее' },
      });
    }
    const p = waiting(S);
    if (p.length && out.length < 3) {                              // отзовётся: предупреждаем заранее
      const t = p[0], soon = t.due - S.day;
      out.push({
        lvl: soon <= 30 ? 'warn' : 'info', ic: 'chat', icHtml: ICON,
        t: `Вас помнит ${short(S, t)}`,
        d: `${t.who}${t.role ? ` — ${t.role}` : ''}: ${t.text} Отзовётся ${date(S, t.due)}${t.city ? ` (${cityIn(t.city)})` : ''}${soon <= 90 ? `, через ${nwd(Math.max(0, soon), 'день', 'дня', 'дней')}` : ''}.`,
        b: { act: 'threads', label: 'Подробнее' },
      });
    }
    return out;
  }

  /* ---------------- пример владельца: обиженный завсегдатай → пожарный инспектор ----------------
     Пока нити из пролога не подключены (части 2–3), игра показывает одну живую нить сама:
     войдя в новый город, вы узнаёте, что недавний знакомый служит в пожарной инспекции —
     и через полтора месяца это отзовётся задержкой открытий в этом городе. */
  function demo(S) {
    if (!DEMO || !S || !S.corp || S.corp.unlockedDay == null) return null;
    const R = state(S);
    if (R && R.list.some((t) => t.src === 'inspector')) return null;
    const ids = Object.keys(S.corp.cities || {});
    if (ids.length < 2) return null;                                  // второго города ещё нет
    const city = S.corp.active && S.corp.active !== 'ufa' ? S.corp.active : ids.filter((x) => x !== 'ufa')[0];
    if (!city) return null;
    return spawn(S, 'inspector', { city });
  }
  const TEMPLATES = {
    // пример владельца (docs/story-v2.md §5): завсегдатай, которого вы обидели, — теперь инспектор
    inspector: {
      who: 'Рустам Ахметов', role: 'пожарный инспектор', kind: 'grudge', src: 'inspector',
      text: 'Завсегдатай, которого вы выставили из кофейни за скандал. Теперь от него зависят разрешения и приёмка ваших точек — и он этого не забыл.',
      after: 45,
      effect: { openK: 2.4, days: 540, text: 'тянет с разрешениями и приёмкой' },
    },
    // благодарность: человек помнит добро — в его городе открываться быстрее
    supplier: {
      who: 'Азамат Хайруллин', role: 'поставщик муки', kind: 'favor',
      text: 'Однажды вы выручили его с мукой в кризис. Он помнит и считает это долгом.',
      after: 20,
      effect: { openK: 0.8, days: 365, text: 'подсказывает подрядчиков и ускоряет приёмку' },
    },
    // обещание: обещал вернуться с деньгами — и вернулся
    promise: {
      who: 'Марат Гайнуллин', role: 'знакомый по рынку', kind: 'promise',
      text: 'Обещал вернуться с деньгами, когда встанет на ноги.',
      after: 240,
      effect: { fx: [{ t: 'cash', v: 2e6 }], text: 'вернул долг с процентами' },
    },
  };
  function spawn(S, key, o) {
    const T = TEMPLATES[key]; if (!T) return null;
    const rec = Object.assign({}, T, o || {});
    rec.effect = Object.assign({}, T.effect, (o && o.effect) || {});
    return add(S, rec);
  }

  /* ---------------- день ---------------- */
  function day(S) {
    if (!S || S.lost) return;
    demo(S);
    const R = state(S); if (!R || !R.list.length) return;   // нитей нет — игры не касаемся вовсе
    fire(S);
    refresh(S);                                            // срок мог выйти или, наоборот, начаться
  }
  // пересчитать «срок открытия в городе» по нитям (corp.js: applyGlobals → OPEN_DAYS = база × openGap).
  // Вызывается после каждого дня, при записи/закрытии нити и перед арендой точки — чтобы число дней
  // в журнале и в карточке совпадало с тем, что посчитает движок.
  function refresh(S) {
    if (!S) return;
    const R = state(S);
    try {
      const cr = S.corp, mounted = cr && cr._with ? cr._with : (cr && cr.active ? cr.active : 'ufa');
      // при «смонтированном» чужом городе (withCity) карту не переключаем — считаем только его срок
      if (R && R.list.length && cr && !cr._with && BK.Corp && BK.Corp.applyGlobals) { BK.Corp.applyGlobals(S); return; }
      const cfg = C(); if (!cfg || !cfg.OPEN_DAYS) return;
      if (cfg.OPEN_DAYS_BASE == null) cfg.OPEN_DAYS_BASE = cfg.OPEN_DAYS;
      cfg.OPEN_DAYS = Math.max(1, Math.round(cfg.OPEN_DAYS_BASE * openGap(S, mounted)));
    } catch (e) { /* нити не должны ломать игру */ }
  }

  /* ---------------- подключение ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__threads) return;
    Eng.__threads = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* нити не должны ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();
  // перед арендой точки держим CFG.OPEN_DAYS актуальным: иначе сразу после загрузки сохранения
  // (до первого дня) точка открылась бы по базовому сроку, а не по нити
  function wrapRent() {
    const Eng = BK.Engine; if (!Eng || !Eng.rentStore || Eng.__threadsRent) return;
    Eng.__threadsRent = true;
    const or = Eng.rentStore;
    Eng.rentStore = function (S) { try { refresh(S); } catch (e) { /* нити не должны ломать игру */ } return or.apply(this, arguments); };
  }
  if (BK.Engine) wrapRent();
  // базовый срок открытия точки запоминаем один раз: нити меняют только множитель (corp.js читает CFG.OPEN_DAYS)
  if (BK.CFG && BK.CFG.OPEN_DAYS && BK.CFG.OPEN_DAYS_BASE == null) BK.CFG.OPEN_DAYS_BASE = BK.CFG.OPEN_DAYS;

  BK.Threads = {
    ensure, state, list, byId, due, waiting, active, past, lingering, fire, add, clear, spawn,
    openGap, openDays, addDays, base, baseDays: base, attItems, summary, day, refresh, openText, effectText, short, kindName,
    cityName, cityIn, KINDS, TEMPLATES, defaults,
    get demo() { return DEMO; }, set demo(v) { DEMO = !!v; },
  };
})();
