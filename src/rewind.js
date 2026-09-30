/* «Переиграть» — вернуться на 1…N месяцев назад и сыграть иначе (docs/vision-plan.md §4 п. 6).
   Без DOM (работает и в Node — sim/rewind.js). Интерфейс — src/ui/rewind-ui.js.

   Снимок — состояние игры сразу ПОСЛЕ дневного шага 1-го числа (месячный расчёт уже прошёл, игрок ещё ничего не сделал),
   в том же виде, что и сохранение (без S.cache, notify = []). Движок пересчитывает S.cache в начале каждого дня,
   все ГСЧ (основной, соперника, корпорации и городов) лежат в состоянии — поэтому из снимка игра идёт ровно так же,
   как шла бы без отката (проверка — `node sim/rewind.js`). Глобальные карты активного города (BK.DISTRICTS / BK.MAP)
   восстанавливаются через BK.Corp.applyGlobals.

   Сколько снимков хранить — CFG.REWIND[difficulty] (лёгкий 6, нормальный 3, хардкор 0 — отката нет).
   Хранение: в памяти вкладки (для каждой игры — своя очередь) и в одном ключе localStorage 'bk-ufa-rewind' — только для
   текущей игры и не больше CFG.REWIND.STORE_MAX символов (старые снимки не влезают — остаются только в памяти).
   Ошибка записи (переполнение, приватный режим) — снимки живут только в памяти, игра не ломается.
   Сохранение самой игры важнее: если на него не хватило места, app.js зовёт freeStorage() и пробует ещё раз.

   Откат честно отмечается: S.rewind = { n, days, list[] } переносится в восстановленное состояние (итоги игры показывают
   число переигровок), запись в журнале и в летописи (S.chron, t: 'rewind'). Достижения, полученные после снимка,
   откатываются вместе с состоянием. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG;
  const KEY = 'bk-ufa-rewind', SEP = '\u0001'; // SEP не встречается в JSON.stringify (управляющие символы экранируются)
  const games = {}; // id игры → [{ day, info, json }] по возрастанию дня
  const st = { id: null, storeOk: null, reloadEmpty: false, timer: null };

  const cfgOf = () => Object.assign({ easy: 6, normal: 3, hard: 0, STORE_MAX: 2400000 }, C().REWIND || {});
  function max(S) { const c = cfgOf(), d = (S && S.difficulty) || 'normal'; return c[d] != null ? c[d] : c.normal; }
  const gameId = (S, slot) => `${slot || 1}:${S.seed}`;
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }

  /* ---------- снимок ---------- */
  function strip(S) { const c = Object.assign({}, S); delete c.cache; c.notify = []; return c; }
  function infoOf(S) {
    const other = S.corp && BK.Corp && BK.Corp.otherStores ? BK.Corp.otherStores(S) : 0;
    const h = S.history && S.history[S.history.length - 1];
    return { cash: Math.round(S.cash), reserve: Math.round(S.reserve), loan: Math.round(S.loan || 0), stores: S.stores.length + other, rev: h ? Math.round(h.rev) : 0,
      city: S.corp && S.corp.active && S.corp.active !== 'ufa' ? S.corp.active : null, ev: !!(S.ev && S.ev.pending) };
  }
  function take(S) { return { day: S.day, info: infoOf(S), json: JSON.stringify(strip(S)) }; }

  // после каждого дневного шага (app.js — после E.tick; sim/rewind.js — так же): 1-е число → снимок
  function record(S) {
    if (!S || S.phase !== 'play' || S.lost || !st.id) return false;
    const n = max(S); if (!n) return false;
    if (E().dateOf(S.day).d !== 1) return false;
    const q = games[st.id] || (games[st.id] = []);
    if (q.length && q[q.length - 1].day >= S.day) return false;
    q.push(take(S));
    while (q.length > n) q.shift();
    schedulePersist();
    return true;
  }
  // снимки, на которые можно вернуться: раньше сегодняшнего дня, новые — первыми; months — «на сколько месяцев назад»
  function list(S) {
    if (!S || !st.id) return [];
    const q = (games[st.id] || []).filter((x) => x.day < S.day);
    return q.slice(-max(S)).reverse().map((x, i) => ({ day: x.day, info: x.info, months: i + 1, stored: !!x.stored }));
  }
  function can(S) { return max(S) > 0 && !!list(S).length; }

  /* ---------- откат ---------- */
  // возвращает новое состояние (текущее S не меняется); mark: false — без отметок (проверка детерминизма)
  function restore(S, day, opts) {
    const q = games[st.id] || [];
    const snap = q.find((x) => x.day === day);
    if (!snap || day >= S.day) return null;
    const N = JSON.parse(snap.json);
    N.notify = [];
    if (!opts || opts.mark !== false) {
      const R = { n: 0, days: 0, list: [] };
      if (S.rewind) Object.assign(R, S.rewind, { list: (S.rewind.list || []).slice() });
      R.n += 1; R.days += S.day - day;
      R.list.push({ from: S.day, to: day, lost: !!S.lost });
      if (R.list.length > 40) R.list.splice(0, R.list.length - 40);
      N.rewind = R;
      const fd = E().fmtDate;
      if (N.log) { N.log.unshift({ day: N.day, text: `Переиграли: вернулись с ${fd(S.day)}${S.lost ? ' (банкротство)' : ''} на ${fd(day)}. Всё, что было после, отменено. Переигровок в этой игре: ${R.n}.`, kind: 'info' }); if (N.log.length > 250) N.log.length = 250; }
      if (N.chron) N.chron.push({ t: 'rewind', from: S.day, lost: !!S.lost, n: R.n, day: N.day });
    }
    // будущее, от которого отказались, больше не нужно: оставляем снимки до дня отката включительно
    games[st.id] = q.filter((x) => x.day <= day);
    if (BK.Corp && BK.Corp.applyGlobals) BK.Corp.applyGlobals(N); else if (BK.useCity) BK.useCity(null);
    persist();
    return N;
  }

  /* ---------- привязка к игре и хранилище ---------- */
  // новая игра, загрузка из слота или кода: память этой игры (если была) или снимки из localStorage (если они её)
  function attach(S, slot) {
    if (!S) { st.id = null; return; }
    st.id = gameId(S, slot); st.reloadEmpty = false;
    let q = games[st.id];
    if (!q) {
      q = [];
      const L = ls();
      if (L) {
        try {
          const raw = L.getItem(KEY);
          if (raw) {
            const parts = raw.split(SEP), head = JSON.parse(parts[0]);
            if (head && head.id === st.id && Array.isArray(head.snaps)) head.snaps.forEach((h, i) => { if (parts[i + 1]) q.push({ day: h.day, info: h.info, json: parts[i + 1], stored: true }); });
          }
        } catch (e) { q = []; }
      }
      games[st.id] = q;
      // игра уже шла больше месяца, а снимков нет — после перезагрузки их не удалось взять из браузера
      if (!q.length && max(S) && S.day > 31 && S.phase === 'play') st.reloadEmpty = true;
    }
    games[st.id] = q.filter((x) => x.day <= S.day); // снимки «из будущего» (загрузили более старое сохранение) не нужны
  }
  function schedulePersist() {
    if (!ls()) { st.storeOk = false; return; }
    if (typeof setTimeout === 'undefined' || typeof window === 'undefined') { persist(); return; }
    clearTimeout(st.timer); st.timer = setTimeout(persist, 400); // после автосохранения месяца — оно важнее
  }
  function persist() {
    const L = ls(); if (!L || !st.id) { st.storeOk = false; return; }
    const q = games[st.id] || [];
    const lim = cfgOf().STORE_MAX;
    let k = q.length; // сколько последних снимков пробуем записать
    while (k > 0) {
      const part = q.slice(q.length - k);
      let size = 0; for (const x of part) size += x.json.length;
      if (size <= lim) {
        const head = JSON.stringify({ v: 1, id: st.id, snaps: part.map((x) => ({ day: x.day, info: x.info })) });
        try { L.setItem(KEY, [head].concat(part.map((x) => x.json)).join(SEP)); st.storeOk = true; mark(q, k); return; } catch (e) { /* не влезло — пробуем меньше */ }
      }
      k--;
    }
    try { L.removeItem(KEY); } catch (e) {}
    st.storeOk = q.length ? false : st.storeOk; mark(q, 0);
  }
  // в ключе — только текущая игра: у остальных снимки теперь лишь в памяти
  function mark(q, k) { for (const id in games) if (games[id] !== q) for (const x of games[id]) x.stored = false; if (q) q.forEach((x, i) => { x.stored = i >= q.length - k; }); }
  // сохранению игры не хватило места — освободить ключ снимков (в памяти они остаются)
  function freeStorage() { const L = ls(); if (!L) return false; try { if (L.getItem(KEY) == null) return false; L.removeItem(KEY); st.storeOk = false; mark(null, 0); return true; } catch (e) { return false; } }
  function forget(id) { if (id) delete games[id]; else for (const k in games) delete games[k]; }
  function status(S) {
    const q = st.id ? games[st.id] || [] : [];
    return { max: max(S), total: q.length, persisted: q.filter((x) => x.stored).length, storeOk: st.storeOk, reloadEmpty: st.reloadEmpty && !q.length, storage: !!ls(), chars: q.reduce((a, x) => a + x.json.length, 0) };
  }

  BK.Rewind = { KEY, max, record, list, can, restore, attach, persist, freeStorage, forget, status, take, strip, _games: games };
})();
