/* =====================================================================
   ИНТЕРФЕЙС ПРОЛОГА «БАРИСТА» (BK.PrologueUI). Логика — src/prologue.js (BK.Prologue), числа — CFG.PROLOGUE.
   Полноэкранный слой #prologue поверх основной игры: пока пролог идёт, основной цикл app.js стоит (хук active()).
   В духе Nintendo (docs/vision-plan.md §4): крупно, живо, отклик на каждое действие (монетки, всплывающие +/−),
   мало цифр (силы/настроение/начальник — полосками и лицами), решения — карточками со значками последствий.
   Связь с ядром: BK.App (state, newGame, save, toStart, refresh, toast, ACT.theme); в app.js только хуки:
   выбор на стартовом экране (startOpt/bindStart/picked/begin), resume() при загрузке, active() в игровом цикле.
   Мини-игра «Смена» — здесь же (shift*): гости, заказ, поднос, допродажа, час пик; итог считает BK.Prologue.shiftResult.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const PR = () => BK.Prologue, C = () => BK.CFG.PROLOGUE, APP = () => BK.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc0 = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /* Местный слой (src/data/story-cast.js): в прологе вместо «Калача», «Семи рек» и Рашида читаются
     наставник, банк и пекарня города партии. Для Уфы swap() возвращает строку как есть. */
  const SW = (t) => { const C = BK.STORY_CAST; if (!C || t == null) return t; try { return C.swapNow ? C.swapNow(String(t)) : C.swap(S(), String(t)); } catch (e) { return t; } };
  const esc = (s) => esc0(SW(s));
  const fm = (v) => BK.fmtMoney(Math.round(v));
  const fmS = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + BK.fmtMoney(Math.abs(Math.round(v)));
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const S = () => (APP() ? APP().state : null);
  const Pp = () => { const s = S(); return s && s.prologue; };
  const PREF = 'bk-ufa-start';
  const ui = { open: false, speed: 1, prev: 1, lastT: 0, mode: null, parts: {}, menu: false, ask: null, dirty: true, lastRender: 0, pressing: false, sh: null, loop: false, slipT: 0 };

  /* ---------------- есть ли физическая клавиатура (задание владельца) ----------------
     Подсказки про клавиши (1-2-3 / Q-W-E / A-S-D, Пробел, Enter) показываем ТОЛЬКО там, где за столом
     есть клавиатура: на телефоне и планшете их быть не должно — там играют касаниями.
     Смотрим не ширину экрана, а сами указатели: fine + hover — мышь/трекпад; coarse вместе с touch —
     палец. Ноутбук с тачскрином остаётся «с клавиатурой» (основной указатель — мышь), телефон — нет. */
  let kbCache = null;
  function hasKb() {
    if (kbCache !== null) return kbCache;
    let fine = true, hover = true, coarse = false;
    try {
      const m = globalThis.matchMedia ? globalThis.matchMedia.bind(globalThis) : null;
      if (m) { fine = m('(pointer: fine)').matches; hover = m('(hover: hover)').matches; coarse = m('(pointer: coarse)').matches; }
    } catch (e) { /* старый браузер: считаем, что клавиатура есть */ }
    const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in globalThis;
    kbCache = !!fine && !!hover && !(coarse && touch);
    return kbCache;
  }
  function kbWatch(root) {
    root.classList.toggle('pro-kb', hasKb());
    try {
      const m = globalThis.matchMedia ? globalThis.matchMedia.bind(globalThis) : null; if (!m) return;
      const upd = () => { kbCache = null; const r = $('#prologue'); if (r) { r.classList.toggle('pro-kb', hasKb()); ui.dirty = true; } };
      const q = m('(pointer: fine)'); if (q.addEventListener) q.addEventListener('change', upd);
      const h = m('(hover: hover)'); if (h.addEventListener) h.addEventListener('change', upd);
    } catch (e) {}
  }
  // в поле ввода (имя сети на стартовом экране и т. п.) клавиши пролога и смены не перехватываем
  function inField(e) {
    const t = (e && e.target) || document.activeElement;
    if (!t) return false;
    const tag = String(t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
  }
  // полка «Смены»: позиция → клавиша. По e.code, а не по e.key: на русской раскладке e.key для Q/W/E/A/S/D — «йцуфыв».
  const SHELF_KEY = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2, KeyQ: 3, KeyW: 4, KeyE: 5, KeyA: 6, KeyS: 7, KeyD: 8 };

  /* ---------------- звук (src/sound.js) ----------------
     Тихий и ненавязчивый: это не аркада. Главное правило — звук привязан к СОБЫТИЮ, а не к отрисовке.
     Цикл пролога (loop → render/bar/drainFx) вызывается десятки раз в секунду, поэтому «звенеть по факту
     перерисовки» нельзя: события проходят через маленькую очередь snd.fx (как pk в основной игре), а
     остальные звуки — только из обработчиков и из кода, который зовётся один раз на событие
     (drainFx / onMonth / showCard / shiftEnd / showFinal). BK.Sound сам делает всё остальное:
     выключенный звук, скрытая вкладка, не чаще раза в 45 мс (`RATE`), подавление дублей `tap`/`deny`. */
  const snd = { fx: [], saw: 0, moSig: '', feedLen: 0, fin: '', cardId: '' };
  // один вход: BK.Sound сам решает про выключенный звук, скрытую вкладку и RATE (45 мс)
  const play = (n, o) => (BK.Sound && BK.Sound.play ? BK.Sound.play(n, o) : false);
  // «дзынь» монет и искорки — только когда вкладка видна (в смене свои SFX)
  const sfx = (n) => (document.hidden ? false : play(n));
  // отклик на нажатие: как в app.js — `tap` после действия, `deny` при отказе (BK.Sound сам не дублирует)
  function tapS() { if (BK.Sound && BK.Sound.tap) BK.Sound.tap('pro'); }
  // очередь событий: звук ждёт ближайшего тика цикла и звучит ровно один раз (не на каждой перерисовке)
  function push(kind, tone, id) { snd.fx.push({ kind, tone: tone || '', id: id || '' }); }
  // «отпечаток» состояния пролога: меняется только на событиях (месяц, лента, карточки, смена, финал)
  function sig() {
    const p = Pp(); if (!p) return '';
    return [p.m, p.status, p.cards.length, p.feed.length, p.stats.shifts, p.flags.mentor || '', p.flags.gulya || '', p.hist.length].join('|');
  }
  function drainSnd() {
    const p = Pp(); if (!p) return;
    const s = sig(); if (s !== snd.moSig) { snd.moSig = s; onSig(); }
    const list = snd.fx.splice(0, snd.fx.length);
    for (const f of list) evSnd(f);
  }
  function evSnd(f) {
    if (f.kind === 'card') return;                                  // карточку озвучивает showCard()
    if (f.kind === 'money') return;                                 // деньги месяца — в onMonth(), один звук на месяц
    if (f.kind === 'cf') { play('ribbon'); return; }                // открыли свою точку — «дзынь» с ленточкой
    if (f.id === 'fired') { play('bad'); return; }                  // уволили — низкий тон
    if (f.id === 'promo') { play('fanfare'); return; }              // повышение
    if (f.tone === 'pos') play('coin');                             // хорошее событие
    else if (f.tone === 'neg') play('warn');                        // плохое событие (70 % случайных — `warn`)
    else if (f.kind === 'idea' || f.kind === 'rec' || f.kind === 'sys') play('click'); // покупка/учёба/привычка — тихий отклик
  }
  function onSig() {
    const p = Pp(); if (!p) return;
    if (p.status !== 'run' && snd.saw < 2) { snd.saw = 2; showFinal(); }        // финал — один звук на финал
    // лента — по индексу (feed режется до 40, поэтому сдвиг считаем аккуратно), фильтруем прошлое игры
    if (p.feed.length && !snd.feedLen) snd.feedLen = p.feed.length;
    else if (p.feed.length !== snd.feedLen) {
      const grown = Math.min(8, Math.max(0, p.feed.length - snd.feedLen));
      const tail = p.feed.slice(p.feed.length - grown);
      snd.feedLen = p.feed.length;
      for (const e of tail) {
        const tone = e.tone || (e.k === 'good' ? 'pos' : e.k === 'bad' ? 'neg' : '');
        if (!tone) continue;
        if (e.k === 'good' && /своя точка|пролог окончен/i.test(e.t || '')) continue; // финал озвучивает showFinal()
        if (e.k === 'bad' && /уволил|копилка|вклад/i.test(e.t || '')) continue;       // увольнение — из разбора месяца
        push('feed', tone);
      }
    }
  }

  /* ---------------- стартовый экран: «Как начать» ---------------- */
  function pref() { try { return localStorage.getItem(PREF) === 'prologue' ? 'prologue' : 'net'; } catch (e) { return 'net'; } }
  function startOpt() {
    const v = pref();
    const opt = (k, ic, t, d) => `<label class="pro-pk${v === k ? ' on' : ''}"><input type="radio" name="startmode" value="${k}"${v === k ? ' checked' : ''}><span class="pk-i" aria-hidden="true">${ic}</span><span class="pk-t"><b>${t}</b><small>${d}</small></span></label>`;
    return `<fieldset class="pro-pick"><legend>Как начать</legend><div class="pro-picks">${opt('prologue', '☕', 'Пролог «Бариста»', SW('15–30 мин · вы за стойкой у Рашида и копите на свою точку'))}${opt('net', '🥐', 'Сразу своя сеть', 'Стартовый капитал и первая точка — как раньше')}</div></fieldset>`;
  }
  function bindStart(el) {
    const btn = () => el.querySelector('#startForm button[type=submit]');
    const upd = () => { const v = picked(); el.querySelectorAll('.pro-pk').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)); const b = btn(); if (b) b.textContent = v === 'prologue' ? 'Начать пролог' : 'Новая игра'; };
    el.querySelectorAll('input[name=startmode]').forEach((r) => r.addEventListener('change', () => { try { localStorage.setItem(PREF, picked()); } catch (e) {} upd(); }));
    upd();
  }
  function picked() { const r = document.querySelector('#start input[name=startmode]:checked'); return r ? r.value : 'net'; }
  // новая игра с прологом: обычная новая игра (тот же слот, сложность, соперник) + S.prologue; обучение основной игры ждёт конца пролога
  function begin(name, difficulty, opts) {
    APP().newGame(name, difficulty, opts);
    const s = S(); if (!s) return;
    PR().start(s);
    s.prologue.tutOn = !!(s.tutorial && s.tutorial.on);
    if (s.tutorial) s.tutorial.on = false;
    ui.speed = 1; ui.mode = null;
    open(); APP().save();
  }

  /* ---------------- открыть / закрыть слой ---------------- */
  function active() { return ui.open; }
  function resume() { const p = Pp(); if (p && (p.status === 'run' || p.status === 'won' || p.status === 'life')) { ui.speed = 1; ui.mode = null; open(); } else close(); }
  function open() {
    let root = $('#prologue');
    if (!root) {
      document.body.insertAdjacentHTML('beforeend', `<div id="prologue" class="pro" aria-label="Пролог «Бариста»">
        <header class="pro-top" id="proTop"></header>
        <div class="pro-mbar"><div class="pro-mb" id="proMb"><i id="proMbI"></i></div><span class="pro-ml" id="proMl"></span></div>
        <main class="pro-in"><div class="pro-grid"><div class="pro-col" id="proColA"></div><div class="pro-col" id="proColB"></div></div></main>
        <div class="pro-slip" id="proSlip" aria-live="polite" hidden></div>
        <div id="proOv"></div><div class="pro-fly" id="proFly" aria-hidden="true"></div></div>`);
      root = $('#prologue');
      root.addEventListener('click', onClick);
      // у выключенной кнопки браузер не рассылает click (а клик по ней — обычное дело: «нет денег»),
      // поэтому мягкий `deny` вешаем на pointerdown: он приходит и для disabled
      root.addEventListener('pointerdown', (e) => { const b = e.target && e.target.closest && e.target.closest('[data-pa]'); if (b && b.disabled) play('deny'); }, true);
      root.addEventListener('pointerdown', () => { ui.pressing = true; }, true);
      const up = () => { if (ui.pressing) { ui.pressing = false; ui.dirty = true; } };
      root.addEventListener('pointerup', up, true); root.addEventListener('pointercancel', up, true);
    }
    ui.open = true; ui.parts = {}; ui.dirty = true;
    kbWatch(root);
    if (BK.Sound) BK.Sound.music('prologue'); // музыка пролога — та же петля, но выше и светлее
    document.documentElement.classList.add('pro-on');
    render(true);
    if (!ui.loop) { ui.loop = true; requestAnimationFrame(loop); }
  }
  function close() {
    const root = $('#prologue'); if (root) root.remove();
    if (BK.Sound) BK.Sound.music('game'); // вернулись в игру — обычный спокойный фон
    ui.open = false; ui.mode = null; ui.menu = false; ui.sh = null;
    document.documentElement.classList.remove('pro-on');
  }

  /* ---------------- цикл ---------------- */
  function loop(t) {
    requestAnimationFrame(loop);
    if (!ui.open) { ui.lastT = t; return; }
    const dt = Math.min(250, t - (ui.lastT || t)); ui.lastT = t;
    const s = S(), p = Pp();
    if (!s || !p) { close(); return; }
    if (ui.mode === 'shift') { shiftTick(dt / 1000); return; }
    if (ui.menu) { bar(); return; }
    if (p.status !== 'run') { if (ui.mode !== 'final' && ui.mode !== 'card') showFinal(); }
    else if (p.cards.length) { if (ui.mode !== 'card') showCard(); }
    // смена пришла сама (расписание BK.Prologue): открываем её, как только время идёт и нет решений — пропустить нельзя
    else if (!ui.mode && ui.speed > 0 && !ui.menu && !document.hidden && PR().dueShift(p)) { shiftOpen(true); }
    else if (!ui.mode && ui.speed > 0 && !ui.menu && !document.hidden) {
      const r = PR().advance(s, dt * ui.speed);
      if (r === 'month') onMonth();
      if (p.cards.length) showCard();
    }
    drainFx();
    bar();
    drainSnd(); // звук: только по событиям из очереди (в цикле ничего не «звенит» от перерисовки)
    if (ui.slipT && t > ui.slipT) { ui.slipT = 0; const sl = $('#proSlip'); if (sl) sl.hidden = true; }
    if (ui.dirty && !ui.pressing && t - ui.lastRender > 200) render();
  }
  function bar() {
    const p = Pp(); if (!p) return;
    const i = $('#proMbI'); if (i) i.style.width = (p.status === 'run' ? p.t * 100 : 100).toFixed(1) + '%';
    const l = $('#proMl');
    if (l) { const txt = `${cap(PR().monName(p))}${ui.speed === 0 ? ' · пауза' : ''}`; if (l.textContent !== txt) l.textContent = txt; }
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function onMonth() {
    const p = Pp(), mo = p.mo; ui.dirty = true;
    render(true);
    if (p.status !== 'run') { APP().save(); return; } // финал — без монеток и итога месяца поверх окна
    if (mo) {
      const g = $('#proSav');
      if (mo.net >= 0) sfx('coin');                                       // зарплата-месяц пришла — короткий «дзынь»
      else if ((mo.notes || []).some((n) => /Не хватило|урезаны|Больничный|без работы|так и не вернул|сгорел|прогорело/.test(n))) sfx('warn'); // месяц со срывом
      else sfx('click');                                                  // месяц закрылся, итог в записке — тихий отклик
      // перераскладка денег по строкам месяца: копилка (или снятие вклада), вклад, жизнь
      const notes = (mo.notes || []).join(' · ');
      if (mo.boxed > 0) sfx('coin');
      else if (/снят|сгорел/i.test(notes)) sfx('warn');
      coins($('#proMb'), g, mo.net >= 0 ? 7 : 3, mo.net < 0);
      float(g, fmS(mo.net), mo.net >= 0 ? 'up' : 'dn', true);
      const inc = (mo.inc.salary || 0) + (mo.inc.tips || 0) + (mo.inc.extra || 0) + (mo.inc.interest || 0);
      let out = 0; for (const k of Object.keys(mo.out)) out += mo.out[k] || 0;
      const sl = $('#proSlip');
      if (sl) {
        sl.innerHTML = `<b>Итог месяца: <span class="${mo.net >= 0 ? 'up' : 'dn'}">${fmS(mo.net)}</span></b><span>Заработано ${fm(inc)} · жизнь ${fm(out)}${mo.boxed ? ` · в копилку ${fm(mo.boxed)}` : ''}</span>${mo.notes.slice(0, 2).map((n) => `<span class="nt">${esc(n)}</span>`).join('')}`;
        sl.hidden = false; ui.slipT = performance.now() + 4200;
      }
    }
    APP().save();
  }

  /* ---------------- отклик: монетки и всплывающие числа ---------------- */
  function float(el, text, cls, big) {
    const fly = $('#proFly'); if (!fly || !el) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const f = document.createElement('span');
    f.className = `pro-float ${cls || ''}${big ? ' big' : ''}`; f.textContent = text;
    f.style.left = Math.round(Math.min(innerWidth - 90, Math.max(8, r.left + r.width / 2 - 40))) + 'px'; f.style.top = Math.round(r.top + 4) + 'px';
    fly.appendChild(f); setTimeout(() => f.remove(), 1300);
  }
  function coins(from, to, n, lose) {
    const fly = $('#proFly'); if (!fly || !from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(); if (!a.width || !b.width) return;
    const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span'); c.className = 'pro-coin' + (lose ? ' lose' : ''); c.textContent = '₽';
      const x0 = lose ? b.left + b.width / 2 : a.left + a.width * (0.2 + 0.6 * Math.random()), y0 = lose ? b.top + 10 : a.top;
      const x1 = lose ? b.left + b.width / 2 + (Math.random() - 0.5) * 120 : b.left + b.width / 2 + (Math.random() - 0.5) * 40, y1 = lose ? b.top + 90 : b.top + b.height / 2;
      c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
      fly.appendChild(c);
      requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transitionDelay = (i * 60) + 'ms'; c.style.transform = `translate(${x1 - x0}px, ${y1 - y0}px) scale(.8)`; c.style.opacity = lose ? '0' : '.2'; }));
      setTimeout(() => c.remove(), 1100 + i * 60);
    }
    setTimeout(() => { if (to && !lose) { to.classList.remove('bump'); void to.offsetWidth; to.classList.add('bump'); } }, 650);
  }
  const FXWHERE = { mood: '#proMood', rep: '#proRep', hp: '#proHp', skill: '#proSk', box: '#proBox', dep: '#proDep', rub: '#proSav' };
  function drainFx() {
    const p = Pp(); if (!p || !p.fx.length) return;
    const list = p.fx.splice(0, p.fx.length);
    for (const f of list) {
      if (f.kind === 'month') continue; // итог месяца — в onMonth
      if (f.kind === 'save') continue; // копилка стадии 1 — не звук пролога
      if (f.kind === 'promo') { push('fx', '', 'promo'); confetti(); continue; } // повышение — фанфары
      if (f.kind === 'rub' && f.where !== 'want') push('rub', f.v >= 0 ? 'pos' : 'neg'); // приход/расход денег — один «дзынь» на событие
      const el = $(FXWHERE[f.kind] || '#proSav');
      if (f.kind === 'mood') float(el, f.v > 0 ? '🙂 +' : '🙁 −', f.v > 0 ? 'up' : 'dn');
      else if (f.kind === 'rep') float(el, f.v > 0 ? '👍' : '👎', f.v > 0 ? 'up' : 'dn');
      else if (f.kind === 'skill') float(el, '⭐ +' + f.v, 'up');
      else if (f.kind === 'box' || f.kind === 'dep') { float(el, '+' + fm(f.v), 'up'); }
      else if (f.kind === 'rub') { float(el, fmS(f.v), f.v >= 0 ? 'up' : 'dn'); if (f.v > 0) coins($('#proMb'), el, 4); }
    }
    ui.dirty = true;
  }
  function confetti() {
    const fly = $('#proFly'); if (!fly) return;
    if (globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('span'); c.className = 'pro-conf'; c.style.left = (10 + Math.random() * 80) + 'vw'; c.style.setProperty('--hue', String(Math.floor(Math.random() * 360)));
      c.style.animationDelay = (Math.random() * 0.4) + 's'; fly.appendChild(c); setTimeout(() => c.remove(), 2400);
    }
  }

  /* ---------------- разметка ---------------- */
  const ICON = {
    pause: '<svg viewBox="0 0 16 14" aria-hidden="true"><rect x="3" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>',
    p1: '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M4 1 L13 7 L4 13 Z" fill="currentColor"/></svg>',
    p3: '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M1 1 L8 7 L1 13 Z M8 1 L15 7 L8 13 Z" fill="currentColor"/></svg>',
    theme: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor"/></svg>',
    menu: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="13" cy="8" r="1.6" fill="currentColor"/></svg>',
  };
  function top(p) {
    const age = PR().age(p), job = C().JOBS[p.job].name;
    return `<div class="pro-brand"><span class="pro-logo" aria-hidden="true">☕</span><span class="pro-bt"><b>Бариста</b><small>${esc0(SW('пролог · «Калач» на Пушкина'))}</small></span></div>
      <div class="pro-when"><span class="chip crust">${PR().year(p)}-й год</span><span class="pro-age">${age} ${plural(age, 'год', 'года', 'лет')} · ${esc(job.toLowerCase())}</span></div>
      <div class="pro-ctl"><div class="speed pro-speed" role="group" aria-label="Скорость времени">
        <button type="button" data-pa="speed" data-v="0" aria-label="Пауза" title="Пауза (пробел)" aria-pressed="${ui.speed === 0}">${ICON.pause}</button>
        <button type="button" data-pa="speed" data-v="1" aria-label="Скорость 1" title="Обычная скорость" aria-pressed="${ui.speed === 1}">${ICON.p1}</button>
        <button type="button" data-pa="speed" data-v="3" aria-label="Скорость 3" title="Втрое быстрее" aria-pressed="${ui.speed === 3}">${ICON.p3}</button></div>
        <button type="button" class="iconbtn" data-pa="theme" aria-label="Сменить тему" title="Тема">${ICON.theme}</button>
        <button type="button" class="iconbtn" data-pa="menu" aria-label="Меню пролога" title="Меню">${ICON.menu}</button></div>`;
  }
  const FACE = (v) => (v >= 70 ? '😄' : v >= 45 ? '🙂' : v >= 25 ? '😐' : '😣');
  const lvlCls = (v) => (v >= 60 ? 'ok' : v >= 30 ? 'mid' : 'low');
  function meter(id, icon, name, v, hint) {
    return `<div class="pro-m ${lvlCls(v)}" id="${id}" title="${esc(hint)}"><span class="pm-i" aria-hidden="true">${icon}</span><span class="pm-n">${name}</span><span class="pm-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}" aria-label="${name}"><i style="width:${Math.max(3, Math.round(v))}%"></i></span><span class="pm-f" aria-hidden="true">${FACE(v)}</span></div>`;
  }
  function hpHint(p) { return p.hp < C().SICK_HP ? 'Силы на исходе: можно заболеть, начальник замечает ошибки. Ешьте нормально, меньше подработок.' : p.hp < 50 ? 'Устаёте. Нормальная еда и меньше подработок вернут силы.' : 'Силы в порядке.'; }
  function moodHint(p) { return p.mood < C().SPLURGE_MOOD ? 'Настроение на нуле — легко сорваться на покупку. Деньги в копилке и на вкладе целее.' : p.mood < 45 ? 'Грустно. Развлечения, отдых и удачные смены поднимут настроение.' : 'Настроение хорошее.'; }
  function repHint(p) { return SW(p.rep < C().REP_WARN ? 'Начальник недоволен — может уволить.' : 'Мнение Рашида о вас: растёт от доп. смен и удачных «Смен», падает от усталости и плохого настроения.'); }
  const beans = (v) => { const n = Math.min(5, 1 + Math.floor(v / 20)); return `<span class="pro-beans" aria-label="уровень ${n} из 5">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`; };

  // стойка «Калача» в пикселях (src/pixel/scenes.js): герой — настроение и силы, Рашид — мнение о вас, огонь и пар живые
  function scene() { return `<div class="pro-px" id="proPxSlot"></div>`; }
  const PX = () => BK.Px && BK.Px.stage && BK.Px.scenes;
  function heroEmo(p) { return p.hp < 30 ? 'tired' : p.mood >= 70 ? 'happy' : p.mood >= 45 ? 'smile' : p.mood >= 25 ? 'neutral' : 'sad'; }
  function monthScene() {
    const slot = document.getElementById('proPxSlot'), p = Pp(); if (!slot || !p || !PX()) return;
    const d = { mode: 'month', heroEmo: heroEmo(p), heroDrop: p.hp < 45, job: p.job, rashidEmo: p.rep >= 72 ? 'smile' : p.rep < 38 ? 'angry' : 'neutral', gulyaEmo: (p.rel && p.rel.gulya > 20) ? 'happy' : 'smile' };
    if (!ui.pxMonth) ui.pxMonth = BK.Px.stage({ cls: 'pro-pxc', fps: 8, label: SW('Пекарня «Калач»: вы за стойкой, Рашид у печи, Гуля с противнем'), height: (W) => (W < 200 ? 112 : 128), scale: (a) => (a >= 760 ? 3 : 2), minW: 150, maxW: 300, active: () => !ui.mode || ui.mode === 'card', draw: (b, t, W, H, dd) => BK.Px.scenes.kalach(b, t, W, H, dd) });
    const k = JSON.stringify(d);
    if (ui.pxMonth.slot !== slot || !ui.pxMonth.cv.isConnected) { ui.pxMonth.data = d; ui.pxMonth.attach(slot); }
    else if (k !== ui.pxMonthKey) ui.pxMonth.set(d);
    ui.pxMonthKey = k;
  }
  function jobLadder(p) {
    const J = C().JOBS, pc = PR().promoCheck(p);
    let s = `<ol class="pro-ladder">${J.map((j, i) => `<li class="${i < p.job ? 'done' : i === p.job ? 'cur' : ''}"><span class="lb">${i < p.job ? '✓' : i + 1}</span><span class="lt">${esc(j.name)}</span></li>`).join('')}</ol>`;
    if (pc && p.status === 'run') {
      const q = pc.q, rows = [];
      const row = (name, v, need) => rows.push(`<span class="pro-req${v >= need ? ' ok' : ''}" title="${name}: ${Math.floor(v)} из ${need}"><span>${name}</span><span class="rb"><i style="width:${Math.min(100, v / need * 100).toFixed(0)}%"></i></span></span>`);
      if (q.coffee) row('Кофе', p.sk.coffee, q.coffee);
      if (q.sales) row('Продажи', p.sk.sales, q.sales);
      if (q.people) row('Люди', p.sk.people, q.people);
      if (p.stazh < C().PROMO_STAZH) row('Начальник', p.rep, q.rep);
      row('Стаж', p.jobM, q.months);
      s += `<div class="pro-next"><span class="nk">До должности «${esc(pc.name.toLowerCase())}»</span>${rows.join('')}</div>`;
    }
    return s;
  }
  // «Вас помнят» — нити живого сюжета: кто вернётся и когда. Показывает, что решения не исчезают.
  function v2Threads(p) {
    const V2 = BK.PrologV2; if (!V2 || !p.v2) return '';
    const list = V2.pending(p); if (!list.length) return '';
    return `<div class="pro-thr"><div class="ptr-h">Вас помнят <small>эти люди вернутся</small></div>${list.map((t) => `<div class="ptr${t.good ? '' : ' bad'}"><span class="ptr-i" aria-hidden="true">${t.good ? '🤝' : '⚠️'}</span><span class="ptr-n">${esc(t.who)}</span><span class="ptr-w">${t.left <= 0 ? 'со дня на день' : `через ${t.left} мес.`}</span></div>`).join('')}</div>`;
  }
  function colA(p) {
    const g = PR().goal(p), c = C();
    const sav = g.sav, credMark = (c.GOAL_CREDIT / c.GOAL * 100).toFixed(1), pct = Math.min(100, sav / c.GOAL * 100);
    let s = `<section class="pc pro-goal"><div class="pg-h"><span class="pg-e">Цель · своя точка</span><span class="pg-ic" aria-hidden="true">🏪</span></div>
      <div class="pg-v" id="proSav">${fm(sav)}</div>
      <div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Накоплено на свою точку"><i style="width:${pct.toFixed(1)}%"></i><b class="pg-mk" style="left:${credMark}%" title="С кредитом хватит ${fm(c.GOAL_CREDIT)}"></b></div>
      <div class="pg-sc"><span>0</span><span style="left:${credMark}%">${fm(c.GOAL_CREDIT)} + кредит</span><span>${fm(c.GOAL)}</span></div>
      <ul class="pg-list">
        <li class="${g.job ? 'ok' : ''}"><span class="ck" aria-hidden="true">${g.job ? '✓' : ''}</span>Должность «управляющий сменой»</li>
        <li class="${sav >= c.GOAL ? 'ok' : ''}"><span class="ck" aria-hidden="true">${sav >= c.GOAL ? '✓' : ''}</span>Накопить ${fm(c.GOAL)} — или ${fm(c.GOAL_CREDIT)} и кредит</li>
        <li class="${g.credit ? 'ok' : ''}"><span class="ck" aria-hidden="true">${g.credit ? '✓' : ''}</span>Для кредита: стаж ${Math.min(p.stazh, c.CREDIT_STAZH)} из ${c.CREDIT_STAZH} мес., начальник доволен</li></ul>`;
    if (g.ok && p.status === 'run' && !p.sf.mentor && !p.cards.length) s += `<button type="button" class="btn primary block pro-big" data-pa="openOwn">Открыть свою точку</button>`;
    if (p.sf.mentor === 'intern' && p.status === 'run') s += `<p class="pro-note">Стажировка в «Хлебном дворе» — ещё ${Math.max(0, p.flags.intern - p.m)} мес.</p>`;
    s += v2Threads(p); // «вас помнят»: кто вернётся и с чем (src/data/prolog-v2.js)
    // деньги: кошелёк → копилка → вклад
    const rate = C().DEP_RATE + (p.depBonus || 0);
    s += `<div class="pro-money">
      <div class="pmy" id="proCash"><span class="pmy-i" aria-hidden="true">👛</span><span class="pmy-n">Кошелёк</span><b class="${p.cash < 0 ? 'neg' : ''}">${fm(p.cash)}</b><small>${p.cash < 0 ? 'минус под 2 % в месяц' : 'на жизнь и покупки'}</small><button type="button" class="btn sm" data-pa="toBox">В копилку</button></div>
      <div class="pmy" id="proBox"><span class="pmy-i" aria-hidden="true">🐷</span><span class="pmy-n">Копилка</span><b>${fm(p.box)}</b><small>срывы её не трогают</small><span class="pmy-b"><button type="button" class="btn sm" data-pa="toDep">На вклад</button><button type="button" class="btn sm" data-pa="fromBox" ${p.box > 0 ? '' : 'disabled'}>Достать</button></span></div>
      <div class="pmy" id="proDep"><span class="pmy-i" aria-hidden="true">🏦</span><span class="pmy-n">Вклад · ${Math.round(rate * 100)} %</span><b>${fm(p.dep + p.depInt)}</b><small>${p.depInt > 0 ? `проценты ${fm(p.depInt)} — раз в год` : 'проценты раз в год'}</small>${ui.ask === 'dep' ? `<span class="pmy-b"><button type="button" class="btn sm danger" data-pa="fromDepYes">Снять, сгорит ${fm(p.depInt)}</button><button type="button" class="btn sm" data-pa="askNo">Нет</button></span>` : `<button type="button" class="btn sm" data-pa="fromDep" ${p.dep > 0 ? '' : 'disabled'}>Снять</button>`}</div></div>`;
    s += `</section>`;
    // герой: стойка, должность, расписание смен (смены приходят сами), состояние, навыки
    s += `<section class="pc pro-hero">${scene()}${jobLadder(p)}
      ${shiftBlock(p)}
      <div class="pro-ms">${meter('proHp', '❤️', 'Силы', p.hp, hpHint(p))}${meter('proMood', '🙂', 'Настроение', p.mood, moodHint(p))}${meter('proRep', '👔', 'Начальник', p.rep, repHint(p))}</div>
      <div class="pro-sk" id="proSk">${['sales', 'coffee', 'people'].map((k) => `<div class="psk" title="${PR().SK_NAME[k]}: ${Math.floor(p.sk[k])} из 100"><span>${PR().SK_NAME[k]}</span>${beans(p.sk[k])}</div>`).join('')}</div></section>`;
    return s;
  }
  // расписание смен: смены приходят сами (5–10 за пролог), игрок их не выбирает и не может пропустить,
  // но может оказаться не готовым. Кнопка только одна — «встать за стойку», и лишь когда смена уже ждёт.
  function shiftBlock(p) {
    const list = PR().shiftAt(p), done = Math.min(PR().shiftsDone(p), list.length);
    const due = PR().dueShift(p), tired = PR().shiftTired(p);
    const when = (m) => cap(PR().monName(p, m));
    const dots = list.map((m, i) => `<i class="${i < done ? 'on' : ''}${i === done && due ? ' now' : ''}" title="${i < done ? `Смена прошла: ${when(m)}` : `Смена: ${when(m)}`}"></i>`).join('');
    let note;
    if (done >= list.length) note = 'Все смены пролога прошли — дальше только своя точка.';
    else if (due) note = `Смена пришла сама: <b>${when(list[done])}</b>. Пропустить её нельзя${tired ? ' — а вы к ней не готовы' : ''}.`;
    else note = `Следующая смена придёт сама — <b>${when(list[done])}</b>. К ней можно быть не готовым.`;
    if (tired && done < list.length) note += ' Вы не выспались: гости будут нетерпеливее.';
    return `<div class="pro-shift" id="proShiftAnchor">
      <div class="ps-top"><span class="ps-t"><span aria-hidden="true">☕</span> ${esc0(SW('Смены в «Калаче»'))}</span><span class="ps-c">${done} из ${list.length}</span></div>
      <div class="ps-dots" role="img" aria-label="Смен пройдено: ${done} из ${list.length}">${dots}</div>
      <p class="ps-w">${note}</p>
      ${due ? `<button type="button" class="btn primary block pro-big pro-shiftbtn ready" data-pa="shift">Встать за стойку<small>смена ждёт вас · ${C().SHIFT_SEC} с</small></button>` : ''}
      <p class="ps-k" data-kb>Продукт — <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · допродажа — <kbd>Пробел</kbd> · отдать заказ — <kbd>Enter</kbd></p>
    </div>`;
  }
  // значки последствий: ▲/▼ × сила (как в окне события основной игры)
  const FXN = { rub: ['₽', 'Деньги'], hp: ['❤️', 'Силы'], mood: ['🙂', 'Настроение'], rep: ['👔', 'Начальник'], skill: ['⭐', 'Навык'], rel: ['🤝', 'Отношения'] };
  function fxChips(fx, risk) {
    const out = [];
    for (const k of Object.keys(FXN)) {
      const v = fx && fx[k]; if (!v) continue;
      const up = v > 0, n = Math.min(3, Math.abs(v));
      out.push(`<span class="fxc ${up ? 'up' : 'dn'}" title="${FXN[k][1]}: ${up ? 'лучше' : 'хуже'}"><span class="fxe" aria-hidden="true">${FXN[k][0]}</span><span class="fxn">${FXN[k][1]}</span><span class="ar" aria-label="${up ? 'лучше' : 'хуже'}">${(up ? '▲' : '▼').repeat(n)}</span></span>`);
    }
    if (risk) out.push('<span class="fxc risk" title="Исход не гарантирован"><span class="fxe" aria-hidden="true">🎲</span><span class="fxn">Риск</span></span>');
    return out.join('');
  }
  function optBtn(pa, v, on, name, price, fx, dis, title) {
    return `<button type="button" class="po${on ? ' on' : ''}" data-pa="${pa}" data-v="${v}" aria-pressed="${on}"${dis ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}><b>${esc(name)}</b><span class="pp">${price}</span>${fx ? `<span class="pfx">${fx}</span>` : ''}</button>`;
  }
  const mini = (hp, mood) => `${hp ? `<i class="${hp > 0 ? 'up' : 'dn'}">❤️${hp > 0 ? '▲' : '▼'}</i>` : ''}${mood ? `<i class="${mood > 0 ? 'up' : 'dn'}">🙂${mood > 0 ? '▲' : '▼'}</i>` : ''}`;
  const sgn = (v, big) => (Math.abs(v) >= big ? Math.sign(v) * 2 : Math.sign(v));
  function colB(p) {
    const c = C(), H = c.HOME, F = c.FOOD, FN = c.FUN;
    const cost = PR().monthCost(p), pay = PR().payOf(p);
    let s = `<section class="pc pro-life"><h3>Как живу <small>решения действуют каждый месяц</small></h3>
      <div class="pl-row"><span class="pl-k">🏠 Жильё</span><div class="pl-o">${Object.keys(H).map((k) => optBtn('home', k, p.home === k, H[k].name, fm(H[k].cost + H[k].transport) + '/мес', mini(H[k].hp, H[k].mood), false, k === 'parents' ? 'Дёшево, но далеко от работы (не больше 1 доп. смены) и дома бывает напряжённо' : '')).join('')}</div></div>
      <div class="pl-row"><span class="pl-k">🍲 Еда</span><div class="pl-o">${Object.keys(F).map((k) => optBtn('food', k, p.food === k, F[k].name, fm(F[k].cost) + '/мес', mini(sgn(F[k].hp, 10), F[k].mood))).join('')}</div></div>
      <div class="pl-row"><span class="pl-k">🎬 Развлечения</span><div class="pl-o">${Object.keys(FN).map((k) => optBtn('fun', k, p.fun === k, FN[k].name, FN[k].cost ? fm(FN[k].cost) + '/мес' : 'бесплатно', mini(FN[k].hp, FN[k].mood))).join('')}</div></div>
      <div class="pl-row"><span class="pl-k">💪 Доп. смены</span><div class="pl-o">${[0, 1, 2].map((n) => optBtn('extra', n, p.extra === n, n ? `${n} в неделю` : 'Нет', n ? '+' + fm(n * c.EXTRA.pay * (1 + p.job * 0.15)) : '—', n ? mini(-1, -1) : '', n > PR().maxExtra(p), n > PR().maxExtra(p) ? 'От родителей далеко ехать — только одна доп. смена' : '')).join('')}</div></div>
      <div class="pl-row"><span class="pl-k">🐷 С зарплаты в копилку</span><div class="pl-o">${c.SAVE_RATES.map((r, i) => optBtn('save', i, p.saveRate === i, r ? Math.round(r * 100) + ' %' : 'Ничего', r ? 'сразу в день зарплаты' : '—', '')).join('')}</div></div>
      <div class="pl-sum"><span>Жизнь стоит <b>${fm(cost)}</b> в месяц</span><span>Оклад <b>${fm(pay)}</b> + чаевые${p.extra ? ' + подработки' : ''}</span></div></section>`;
    // учёба
    const CS = c.COURSES, ic = { coffee: '☕', sales: '📈', lead: '👥' };
    s += `<section class="pc pro-study"><h3>Учёба <small>один курс за раз</small></h3><div class="ps-g">${Object.keys(CS).map((id) => {
      const x = CS[id], why = PR().studyWhy(p, id), cur = p.study && p.study.id === id, done = p.done[id];
      const price = id === 'coffee' && p.flags.disc && !done ? `<s>${fm(x.month)}</s> ${fm(x.month / 2)}` : fm(x.month);
      return `<div class="psc${cur ? ' cur' : ''}${done ? ' done' : ''}"><span class="psc-i" aria-hidden="true">${ic[id]}</span><b>${esc(x.name)}</b><small>${esc(x.who)}</small><span class="psc-m">${x.months} мес. × ${price} · ${PR().SK_NAME[x.skill].toLowerCase()} +${x.add}</span>${done ? '<span class="chip good">пройден</span>' : cur ? `<span class="chip river">идёт · ещё ${p.study.left} мес.</span>` : `<button type="button" class="btn sm" data-pa="study" data-v="${id}" ${why ? `disabled title="${esc(why)}"` : ''}>Записаться</button>${why && why !== 'Уже учитесь — один курс за раз' ? `<span class="psc-w">${esc(why)}</span>` : ''}`}</div>`;
    }).join('')}</div></section>`;
    // хочется
    const W = c.WANTS;
    s += `<section class="pc pro-wants"><h3>Хочется <small>радует, но уносит деньги из кошелька</small></h3><div class="pw-g">${Object.keys(W).map((id) => {
      const w = W[id], why = PR().wantWhy(p, id), price = PR().wantPrice(p, id), sale = price < w.cost, has = (p.wantsCd[id] || 0) > p.m;
      return `<button type="button" class="pw${has ? ' has' : ''}${sale ? ' sale' : ''}" data-pa="want" data-v="${id}" ${why ? `disabled title="${esc(why)}"` : ''}><span class="pw-i" aria-hidden="true">${w.icon}</span><b>${esc(w.name)}</b><span class="pw-p">${sale ? `<s>${fm(w.cost)}</s> ` : ''}${fm(price)}${w.monthly ? ` + ${fm(w.monthly)}/мес` : ''}</span><span class="pw-f">🙂${'▲'.repeat(w.mood >= 20 ? 3 : w.mood >= 10 ? 2 : 1)}</span>${has ? '<span class="pw-has">есть</span>' : why ? `<span class="pw-why">${esc(why)}</span>` : ''}</button>`;
    }).join('')}</div></section>`;
    // лента
    const F2 = p.feed.slice(-7).reverse();
    s += `<section class="pc pro-feed"><h3>Что происходит</h3><ul>${F2.map((f) => `<li class="${f.k}"><span class="fd" aria-hidden="true"></span><span class="ft">${esc(f.t)}</span><span class="fm">${esc(cap(PR().monName(p, f.m)))}</span></li>`).join('')}</ul></section>`;
    return s;
  }
  function setPart(id, html) { if (ui.parts[id] === html) return; ui.parts[id] = html; const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function render(force) {
    const p = Pp(); if (!p || !ui.open) return;
    if (!force && ui.pressing) return;
    ui.dirty = false; ui.lastRender = performance.now();
    setPart('proTop', top(p)); setPart('proColA', colA(p)); setPart('proColB', colB(p));
    monthScene();
    if (ui.menu) menu(); bar();
  }

  /* ---------------- карточки-решения ---------------- */
  function avatar(h, big) { return `<span class="pro-av${big ? ' big' : ''}" style="--h:${h.hue}" aria-hidden="true">${esc(h.ini)}</span>`; }
  // пиксельный портрет говорящего: кто и с какой эмоцией (по карточке); «Жизнь» — сам герой
  const CARD_EMO = {
    p01: 'neutral', p02: 'smirk', p03: 'smile', p04: 'smirk', p05: 'worried', p06: 'neutral', h_school: 'smile', h_lesson: 'neutral', promo: 'happy', goal: 'smile', p07: 'worried', p08: 'smile',
    warn: 'angry', fired: 'angry', err: 'angry', sick: 'tired', splurge: 'worried', e_grandma: 'smile', e_lottery: 'surprised', e_bonus: 'happy', e_guest: 'happy', e_praise: 'happy', e_fest: 'happy',
    e_cashback: 'smile', e_newyear: 'happy', e_phone: 'sad', e_fine: 'sad', e_rent: 'worried', e_cut: 'worried', e_loan: 'worried', e_sneakers: 'smile', e_sea: 'happy', e_bday: 'happy',
    e_short: 'angry', e_parents: 'worried', e_tooth: 'tired', e_wallet: 'sad', e_invest: 'smirk', e_flood: 'surprised', e_blackfri: 'smile', e_quit: 'tired', e_check: 'worried',
  };
  function speaker(cv) {
    const who = cv.who === 'family' ? (cv.id === 'e_parents' ? 'mama' : 'sania') : cv.who === 'friend' ? 'damir' : cv.who === 'life' || !BK.Px || !BK.Px.CAST[cv.who] ? 'hero' : cv.who;
    const emo = CARD_EMO[cv.id] || (cv.kind === 'pos' ? 'happy' : cv.kind === 'neg' ? 'worried' : 'neutral');
    return { who, emo };
  }
  function portrait(cv) {
    if (!BK.Px || !BK.Px.portraitTag) return avatar(cv.hero, true);
    const sp = speaker(cv);
    return `<span class="pxframe" title="${esc(cv.hero.name)}">${BK.Px.portraitTag(sp.who, sp.emo)}</span>`;
  }
  function showCard() {
    const s = S(), cv = PR().card(s); if (!cv) { hideOv(); return; }
    ui.mode = 'card';
    // звук: одна карточка — один звук. showCard() зовётся и из цикла, поэтому помним id открытой карточки
    if (snd.cardId !== cv.id) { snd.cardId = cv.id; snd.saw++; cardSnd(cv); }
    const LET = 'АБВГДЕ', kind = cv.kind === 'pos' ? 'pos' : cv.kind === 'neg' ? 'neg' : 'hero';
    const ey = kind === 'hero' ? esc(cv.hero.name) : kind === 'pos' ? 'Хорошие новости' : 'Жизнь подкинула';
    let h = `<div class="pro-ovbg"><div class="pro-card ${kind}" role="dialog" aria-modal="true" aria-labelledby="proCardT" tabindex="-1">
      <div class="pcd-h">${portrait(cv)}<span class="pcd-w"><span class="eyebrow ${kind}">${ey}</span><small>${esc(cv.hero.role)}</small></span></div>
      <h2 id="proCardT">${esc(cv.title)}</h2><p class="pcd-t">${esc(cv.text)}</p><div class="pcd-c">`;
    if (cv.choices.length > 1) h += `<div class="chq"><h4>Что делаем?</h4><span>▲ — лучше, ▼ — хуже</span></div>`;
    cv.choices.forEach((c, i) => {
      const fx = fxChips(c.fx, c.risk);
      if (cv.choices.length === 1) { h += `<button type="button" class="btn primary block pro-big" data-pa="choose" data-v="${i}">${esc(c.label)}</button>${c.desc ? `<p class="pcd-d">${esc(c.desc)}</p>` : ''}`; return; }
      h += `<button type="button" class="choice" data-pa="choose" data-v="${i}"${c.can ? '' : ' disabled'}><span class="cl">${LET[i]}</span><b>${esc(c.label)}</b><span class="cd">${esc(c.desc || '')}</span><span class="cc">${c.cost ? fm(c.cost) : ''}</span>${!c.can && c.why ? `<span class="cwhy">${esc(c.why)}</span>` : ''}${fx ? `<span class="fx">${fx}</span>` : ''}</button>`;
    });
    h += `</div></div></div>`;
    $('#proOv').innerHTML = h;
    if (BK.Px && BK.Px.hydrate) BK.Px.hydrate($('#proOv'));
    const d = $('#proOv .pro-card'); if (d) d.focus({ preventScroll: true });
  }
  function hideOv() { const o = $('#proOv'); if (o) o.innerHTML = ''; ui.mode = null; }
  // звук появления карточки-сцены: событие месяца — по тону, сцена с героем — тихий отклик окна
  function cardSnd(cv) {
    const t = cv.choices.length ? cv.choices[0].fx || {} : {};
    if (cv.kind === 'pos') play('coin');
    else if (cv.kind === 'neg') play('warn');
    else play('win');
  }
  function choose(i) {
    const s = S(), p = Pp(), r = PR().choose(s, i);
    if (!r.ok) { APP().toast('Не получится', r.msg || '', 'warn'); play('deny'); return; }   // отказ — мягкий низкий тон
    const hadOv = !!$('#proOv .pro-card');
    hideOv(); ui.dirty = true; render(true); drainFx(); snd.fx.length = 0;                   // звук выбора — ровно один
    const pick = p.pick; snd.cardId = '';                                                    // следующая карточка звенит своим звуком
    let vol = '';                                                                            // особый звук поверх обычного
    if (pick) {
      const tone = pick.tone || pick.kind;
      if (pick.id === 'p07' && tone !== 'neg') vol = pick.kind === 'pos' ? 'sparkle' : 'coin';
      else if (tone === 'neg') vol = 'warn';
      else if (tone === 'pos') vol = 'coin';
      else vol = 'click';                                                                    // нейтральный выбор — тихий отклик
    }
    if (vol) play(vol); else tapS();
    // с карточкой ушло и её окно: под слоем не должно оставаться прозрачного .pro-ovbg (иначе он ловит нажатия)
    if (hadOv && !p.cards.length && !$('#proOv .pro-card')) { const o = $('#proOv'); if (o) o.innerHTML = ''; ui.mode = null; }
    if (p.status !== 'run') { APP().save(); showFinal(); return; }
    if (p.cards.length) showCard();
    // смену после карточки не запускаем вручную: её откроет цикл (BK.Prologue.dueShift) — расписание одно для всех
    APP().save();
  }

  /* ---------------- финалы ---------------- */
  const SPENT_IC = { home: '🏠', food: '🍲', fun: '🎬', transport: '🚌', phone: '📶', study: '🎓', health: '💊', fines: '🧾', clothes: '👕', gifts: '🎁', sneakers: '👟', console: '🎮', phone2: '📱', trip: '🏖️', car: '🚗', debt: '💳', loans: '🤝', invest: '🎲', other: '•' };
  function showFinal() {
    const s = S(), p = Pp(); if (!p) return;
    // звук финала — один раз на финал (showFinal зовётся и из цикла, и после выбора развилки П7/П8)
    const key = p.status + ':' + p.m;
    if (snd.fin !== key) { snd.fin = key; if (p.status === 'won' || p.status === 'done') play('fanfare'); else play('warn'); }
    ui.mode = 'final';
    const sm = PR().summary(p), c = C();
    const rows = sm.rows.slice(0, 9), max = Math.max(1, ...rows.map((r) => r.v));
    const where = `<div class="pf-rows">${rows.map((r) => `<div class="pf-r${r.fun ? ' fun' : ''}"><span class="pf-i" aria-hidden="true">${SPENT_IC[r.k] || '•'}</span><span class="pf-n">${esc(r.name)}</span><span class="pf-b"><i style="width:${(r.v / max * 100).toFixed(1)}%"></i></span><b>${fm(r.v)}</b></div>`).join('')}</div>`;
    let h;
    if (p.status === 'won' || p.status === 'done') {
      const cr = PR().carry(p, s), T = PR().TRAITS, M = PR().MENTOR, PK = PR().PERKS, TA = BK.Trainers ? BK.Trainers.AREA : {};
      const gains = [];
      gains.push(`<li><span aria-hidden="true">💰</span><span>${cr.bonus ? `Накопления сверх цели: <b>+${fm(cr.bonus)}</b> к стартовому капиталу` : `Накопления ушли в точку${p.won && p.won.credit ? ' (и кредит банка)' : ''} — капитал сети как обычно`}</span></li>`);
      const sk = Object.keys(cr.skills).map((a) => (TA[a] ? TA[a].short : a));
      if (sk.length) gains.push(`<li><span aria-hidden="true">⭐</span><span>Навыки: <b>${esc(sk.join(', '))}</b> — уровень 1 (подсказки в «Требует внимания»)</span></li>`);
      if (cr.baker) gains.push(`<li><span aria-hidden="true">👩‍🍳</span><span><b>${esc(cr.baker.name)}</b> — первый сотрудник первой точки, уровень ${cr.baker.lvl}</span></li>`);
      if (cr.trait) gains.push(`<li><span aria-hidden="true">${cr.trait === 'thrift' ? '🐷' : '🛍️'}</span><span>Черта «<b>${T[cr.trait].name}</b>»: ${esc(T[cr.trait].desc.charAt(0).toLowerCase() + T[cr.trait].desc.slice(1))}</span></li>`);
      for (const k of cr.perks) gains.push(`<li><span aria-hidden="true">🎁</span><span>${esc(PK[k])}</span></li>`);
      if (cr.mentor) gains.push(`<li><span aria-hidden="true">🤝</span><span>${esc(M[cr.mentor])}</span></li>`);
      h = `<div class="pro-ovbg"><div class="pro-card pro-final won" role="dialog" aria-modal="true" aria-labelledby="proFinT" tabindex="-1">
        ${BK.Px && BK.Px.stage ? '<div class="pf-px" id="proFinPx"></div>' : '<div class="pf-hero" aria-hidden="true">🏪</div>'}<span class="eyebrow pos">Пролог пройден · ${sm.months} мес.</span><h2 id="proFinT">Своя точка!</h2>
        <p class="pcd-t">В ${sm.age} ${plural(sm.age, 'год', 'года', 'лет')} ${esc0(SW('вы уходите из «Калача»'))} с ${fm(sm.sav)}${p.won && p.won.credit ? ' и одобренным кредитом' : ''}. ${BK.Stage1UI ? 'Дальше — своя кофейня: одна точка, всё руками. Потом — сеть.' : 'Дальше — своя сеть: цех, первая точка и весь город на карте.'}</p>
        <div class="pf-sms"><span class="pf-sms-h">СМС ночью · неизвестный номер</span>${esc(PR().hookSms(p))}</div>
        <h3>Что вы берёте с собой</h3><ul class="pf-gain">${gains.join('')}</ul>
        <details class="pf-det"><summary>Куда уходили деньги</summary><p class="pro-note">Заработано ${fm(sm.earned)}, отложено ${fm(sm.sav)}.</p>${where}</details>
        <div class="pf-btns">${BK.Stage1UI ? '<button type="button" class="btn primary block pro-big" data-pa="finalShop">Открыть свою кофейню</button><button type="button" class="btn block" data-pa="finalMain">Пропустить кофейню — сразу своя сеть</button>' : '<button type="button" class="btn primary block pro-big" data-pa="finalMain">Открыть свою сеть</button>'}</div></div></div>`;
    } else {
      const tips = [];
      if (sm.fun > sm.earned * 0.12) tips.push(`На желания ушло ${fm(sm.fun)} — почти ${Math.round(sm.fun / Math.max(1, sm.earned) * 100)} % заработанного.`);
      if ((p.spent.car || 0) > 0) tips.push('Машина в кредит съедала деньги каждый месяц.');
      if ((p.spent.debt || 0) > 0) tips.push(`Проценты по кредитке: ${fm(p.spent.debt)}.`);
      if (p.food === 'cafe') tips.push('Кафе и доставка каждый день — дорогая привычка.');
      if (p.job < 2) tips.push('До управляющего сменой вы так и не дошли — без этого своё дело не открыть.');
      if (!tips.length) tips.push('Копилка и вклад защищают деньги от срывов, а «Смена» и учёба быстрее ведут к повышению.');
      h = `<div class="pro-ovbg"><div class="pro-card pro-final life" role="dialog" aria-modal="true" aria-labelledby="proFinT" tabindex="-1">
        ${BK.Px && BK.Px.stage ? '<div class="pf-px" id="proFinPx"></div>' : '<div class="pf-hero" aria-hidden="true">🕰️</div>'}<span class="eyebrow neg">${sm.months / 12 | 0} лет спустя · ${sm.age} ${plural(sm.age, 'год', 'года', 'лет')}</span><h2 id="proFinT">Вы прожили жизнь, работая в найме</h2>
        <p class="pcd-t">Вы стали «${esc(sm.job.toLowerCase())}», вас любят гости, ${esc0(SW('а Семён Аркадьевич всё так же берёт американо и правду.'))} Заработано <b>${fm(sm.earned)}</b>, осталось <b>${fm(sm.sav)}</b>. Своя точка так и не открылась.</p>
        <h3>Куда ушли деньги</h3>${where}
        <ul class="pf-tips">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="pf-btns"><button type="button" class="btn primary block pro-big" data-pa="retry">Попробовать заново</button><button type="button" class="btn block pro-big2" data-pa="skipMain">Начать сразу со своей сети</button></div></div></div>`;
    }
    $('#proOv').innerHTML = h;
    finalScene(p);
    const d = $('#proOv .pro-card'); if (d) d.focus({ preventScroll: true });
    if (p.status === 'won') confetti();
  }
  // пиксельная сцена финала: «Своя точка» — утро у своей вывески; «Жизнь в найме» — поздний вечер в «Калаче», постаревший герой
  function finalScene(p) {
    const slot = document.getElementById('proFinPx'); if (!slot || !BK.Px || !BK.Px.stage) return;
    const won = p.status === 'won' || p.status === 'done';
    const d = won ? { gulya: p.sf && (p.sf.gulya === 'with' || p.sf.gulya === 'share'), rashid: p.sf && p.sf.mentor === 'partner' }
      : { mode: 'life', light: 'night', old: true, job: p.job, heroEmo: 'tired', rashidEmo: 'neutral', gulya: false, fill: 0.2 };
    if (ui.pxFin) ui.pxFin.destroy();
    ui.pxFin = BK.Px.stage({ cls: 'pro-pxf', fps: 8, data: d, label: won ? 'Своя точка: вывеска, ленточка у входа, вы машете' : SW('Поздний вечер в «Калаче»: вы за той же стойкой'), height: (W) => (W < 200 ? 104 : 120), scale: () => 2, minW: 150, maxW: 320, draw: (b, t, W, H, dd) => (won ? BK.Px.scenes.own(b, t, W, H, dd) : BK.Px.scenes.kalach(b, t, W, H, dd)) });
    ui.pxFin.attach(slot);
  }
  // переход в основную игру (стадия 2) с переносом бонусов
  function toMain(skipped) {
    const s = S(), p = Pp(); if (!s || !p) return;
    play('ribbon'); // открыли своё дело — «дзынь» с ленточкой (до закрытия слоя)
    let cr = null;
    if (!skipped && p.status === 'won') cr = PR().applyCarry(s); else PR().skip(s);
    if (s.tutorial) s.tutorial.on = !!p.tutOn;
    close();
    APP().refresh(); APP().save();
    if (cr) APP().toast('Своя сеть!', cr.bonus ? `Бонус пролога: +${fm(cr.bonus)} к капиталу.` : 'Пролог пройден — выберите помещение под цех.', 'good');
  }
  function retry() {
    const s = S(); if (!s) return;
    const name = s.company, diff = s.difficulty, rival = !!(s.rival && s.rival.enabled), tut = !!(s.prologue && s.prologue.tutOn);
    close();
    begin(name, diff, { rival, strat: (s.strat && s.strat.chosen && s.strat.id) || '', scen: (s.scen && s.scen.id) || 'random' });   // перезапуск пролога сохраняет выбранный путь
    const s2 = S(); if (s2 && s2.prologue) s2.prologue.tutOn = tut;
  }

  /* ---------------- меню пролога ---------------- */
  function menu() {
    let o = $('#proMenu');
    const h = `<div class="pro-ovbg" data-pa="menuClose"><div class="pro-card pro-menu" role="dialog" aria-modal="true" aria-labelledby="proMenuT" tabindex="-1">
      <h2 id="proMenuT">Пролог «Бариста»</h2>
      <p class="pcd-t">${esc0(SW('Вы — бариста у Рашида в «Калаче».'))} Каждый месяц — зарплата и траты на жизнь. Копите на свою точку, растите до управляющего сменой — и открывайте своё дело. Время идёт само: пауза — пробел.</p>
      <ul class="pf-tips"><li>«Как живу» — жильё, еда, развлечения, подработки: чем дешевле, тем быстрее копится, но силы и настроение не бесконечны.</li><li>Копилка и вклад защищают деньги от срывов на покупки.</li><li>«Смена» раз в месяц — чаевые, навык и мнение начальника.</li></ul>
      ${ui.ask === 'skip' ? `<div class="confirm">Пролог закончится без бонусов, начнётся обычная игра. <button type="button" class="btn sm danger" data-pa="skipYes">Пропустить</button><button type="button" class="btn sm" data-pa="askNo">Отмена</button></div>` : ''}
      <div class="pf-btns"><button type="button" class="btn primary block" data-pa="menuClose">Вернуться</button>${ui.ask === 'skip' ? '' : '<button type="button" class="btn block" data-pa="skipAsk">Пропустить пролог — сразу своя сеть</button>'}<button type="button" class="btn block" data-pa="toStart">К списку игр</button></div></div></div>`;
    if (!o) { $('#proOv').insertAdjacentHTML('beforeend', `<div id="proMenu"></div>`); o = $('#proMenu'); }
    if (o.dataset.h !== h) { o.innerHTML = h; o.dataset.h = h; }
  }

  /* ---------------- мини-игра «Смена» ----------------
     Смены приходят сами по расписанию (BK.Prologue.dueShift) — игрок их не выбирает. Полка — три ряда
     по три позиции; на ПК каждая берётся своей клавишей (1-2-3 / Q-W-E / A-S-D), допродажа — Пробелом.
     Подсказки клавиш (элементы data-kb) видны только при физической клавиатуре: класс .pro-kb на слое. */
  function mul(seed) { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const FACES = ['🧔', '👩', '👨‍🦳', '👧', '🧑‍💼', '👵', '🧑‍🎓', '👩‍🦰', '👨', '👱‍♀️'];
  // auto — смена пришла сама (расписание): пропустить её нельзя, поэтому «Не сейчас» не показываем
  function shiftOpen(auto) {
    const p = Pp(), why = PR().shiftWhy(p);
    if (why) { if (!auto) { APP().toast('Смена', why, 'warn'); sfx('deny'); } return; }
    if (ui.mode === 'shift' && ui.sh) return;   // уже идёт — второе окно не открываем
    hideOv();                                    // карточка и меню не должны оставаться под окном смены
    ui.menu = false; const mm = $('#proMenu'); if (mm) mm.remove();
    const plan = PR().shiftPlan(p), first = PR().shiftsDone(p) === 0;
    ui.mode = 'shift';
    ui.sh = { plan, rnd: mul(plan.seed), state: 'intro', t: 0, guests: [], next: 0, tray: [], served: 0, errors: 0, upsells: 0, lost: 0, total: 0, tips: 0, id: 0, first, auto: !!auto, msg: null, tired: !!plan.tired };
    if (auto) play('win');                       // «смена пришла» — звук окна (один раз на смену)
    shiftRender();
  }
  const itemById = (id) => PR().ITEMS.find((x) => x.id === id);
  function newGuest(sh) {
    const R = sh.rnd, items = sh.plan.items, coffee = items.filter((x) => x.cat === 'coffee'), bake = items.filter((x) => x.cat === 'bake');
    const order = [];
    const n = 1 + (R() < 0.55 ? 1 : 0) + (sh.plan.maxItems >= 3 && R() < 0.25 ? 1 : 0);
    for (let i = 0; i < n; i++) { const pool = i === 0 ? (R() < 0.75 ? coffee : bake) : (R() < 0.6 ? bake : coffee); order.push(pool[Math.floor(R() * pool.length)].id); }
    const rush = sh.t / sh.plan.sec > 0.35 && sh.t / sh.plan.sec < 0.75;
    const pat = (sh.plan.patience - (sh.tired ? 3 : 0)) * (rush ? 0.85 : 1);
    sh.total++;
    const sem = sh.total === 1 && sh.first; // первый гость первой смены — Семён Аркадьевич: «Американо и правду!»
    const g = { id: ++sh.id, face: sem ? '👴' : FACES[Math.floor(R() * FACES.length)], order: sem ? ['esp'] : order, pat: sem ? pat + 6 : pat, max: sem ? pat + 6 : pat, asked: false, up: null, note: sh.total === 1 && sh.first ? 'Американо и правду!' : '' };
    g.look = sem ? 'sem' : FACES.indexOf(g.face); // пиксельный облик — по тому же лицу (ГСЧ смены не трогаем)
    return g;
  }
  function shiftTick(dt) {
    const sh = ui.sh; if (!sh || sh.state !== 'play') return;
    sh.t += dt;
    const rush = sh.t / sh.plan.sec > 0.35 && sh.t / sh.plan.sec < 0.75;
    sh.next -= dt;
    let changed = false;
    if (sh.next <= 0 && sh.guests.length < 5) { sh.guests.push(newGuest(sh)); sh.next = (rush ? 1.7 : 3.4) * (0.75 + sh.rnd() * 0.5); changed = true; }
    for (const g of sh.guests.slice()) {
      g.pat -= dt;
      if (g.pat <= 0) { sh.guests.splice(sh.guests.indexOf(g), 1); sh.lost++; changed = true; if (sh.guests.length && g === sh.guests[0]) sh.tray = []; flash('Гость ушёл 😠', 'dn'); }
    }
    if (sh.t >= sh.plan.sec) { shiftEnd(); return; }
    // полоски терпения и таймер — без перерисовки
    const tb = $('#shTime'); if (tb) tb.style.width = (100 - sh.t / sh.plan.sec * 100).toFixed(1) + '%';
    const rz = $('#shRush'); if (rz) rz.hidden = !rush;
    for (const g of sh.guests) { const el = document.getElementById('shg' + g.id); if (el) { const v = Math.max(0, g.pat / g.max); el.style.setProperty('--pat', (v * 100).toFixed(0)); el.classList.toggle('angry', v < 0.3); } }
    if (changed) shiftRender();
  }
  function flash(t, cls) { const sh = ui.sh; if (!sh) return; sh.msg = { t, cls, until: performance.now() + 1100 }; const m = $('#shMsg'); if (m) { m.textContent = t; m.className = 'sh-msg show ' + (cls || ''); clearTimeout(ui.flashT); ui.flashT = setTimeout(() => { const mm = $('#shMsg'); if (mm) mm.className = 'sh-msg'; }, 1000); } }
  function shiftRender() {
    const sh = ui.sh, p = Pp(); if (!sh) return;
    let h;
    if (sh.state === 'intro') {
      h = `<div class="pro-sh" role="dialog" aria-modal="true" aria-labelledby="shT"><div class="sh-in sh-intro">${PX() ? '<div class="sh-scene" id="shScene"></div>' : '<span class="sh-big" aria-hidden="true">☕</span>'}<h2 id="shT">${sh.first ? 'Первая смена' : sh.auto ? 'Смена пришла сама' : esc0(SW('Смена в «Калаче»'))}</h2>
        ${sh.auto ? '<p class="pro-note">Бариста не выбирает, когда работать: смена пришла сама, и пропустить её нельзя.</p>' : ''}
        <ol class="sh-how"><li>Гость показывает заказ — нажмите нужные позиции.</li><li>«Отдать заказ» — если всё верно, будут чаевые.</li><li>«Предложить к заказу» — допродажа: чаевые и навык продаж.</li><li>В час пик очередь растёт, а терпение гостей короче.</li></ol>
        ${sh.tired ? '<p class="pro-note">Вы не выспались: гости покажутся нетерпеливее.</p>' : ''}
        <p class="sh-keys" data-kb>Полка — три ряда по три позиции. Продукт: <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> — верхний ряд, <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> — средний, <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — нижний. Допродажа — <kbd>Пробел</kbd>, отдать заказ — <kbd>Enter</kbd>, убрать с подноса — <kbd>Backspace</kbd>.</p>
        <div class="pf-btns"><button type="button" class="btn primary block pro-big" data-pa="shiftGo">Начать смену · ${sh.plan.sec} с</button>${sh.auto ? '' : '<button type="button" class="btn block" data-pa="shiftCancel">Не сейчас</button>'}</div></div></div>`;
    } else if (sh.state === 'play') {
      const g = sh.guests[0];
      const q = PX() ? sh.guests.map((x, i) => `<span class="sh-g${i === 0 ? ' front' : ''}" id="shg${x.id}" role="img" aria-label="Гость ${i + 1}"></span>`).join('')
        : sh.guests.map((x, i) => `<span class="sh-g${i === 0 ? ' front' : ''}" id="shg${x.id}" style="--pat:${(x.pat / x.max * 100).toFixed(0)}"><span class="sh-f" aria-hidden="true">${x.face}</span></span>`).join('');
      const order = g ? g.order.map((id, i) => `<span class="sh-oi${g.up === i ? ' up' : ''}">${itIc(id)}<small>${esc(itemById(id).name)}</small></span>`).join('') : '';
      const canUp = g && !g.asked;
      h = `<div class="pro-sh" role="dialog" aria-modal="true" aria-label="Смена"><div class="sh-in">
        <div class="sh-top"><div class="sh-tb"><i id="shTime" style="width:${(100 - sh.t / sh.plan.sec * 100).toFixed(1)}%"></i></div><span class="sh-rush" id="shRush" hidden>Час пик!</span>
          <span class="sh-sc"><span title="Обслужено">✅ ${sh.served}</span><span title="Ошибки">❌ ${sh.errors}</span><span title="Ушли">😠 ${sh.lost}</span><b title="Чаевые (примерно)">${fm(sh.tips)}</b></span><button type="button" class="btn sm" data-pa="shiftEnd">Закончить</button></div>
        ${PX() ? `<div class="sh-scene" id="shScene"></div><div class="sh-queue sr" aria-label="Очередь: ${sh.guests.length}">${q}</div>` : `<div class="sh-queue" aria-label="Очередь: ${sh.guests.length}">${q || '<span class="sh-empty">Пока никого — протрите стойку</span>'}</div>`}
        <div class="sh-order">${g ? `<div class="sh-bub">${g.note ? `<span class="sh-note">${esc(g.note)}</span>` : ''}<span class="sh-ol">${order}</span></div>${canUp ? `<button type="button" class="btn sh-upb" data-pa="shiftUp">🥐 Предложить к заказу<kbd data-kb>Пробел</kbd></button>` : ''}` : ''}<span class="sh-msg" id="shMsg" aria-live="polite"></span></div>
        <div class="sh-tray" aria-label="Поднос">${sh.tray.length ? sh.tray.map((id, i) => `<button type="button" class="sh-ti" data-pa="shiftTray" data-v="${i}" title="Убрать с подноса" aria-label="Убрать ${esc(itemById(id).name)}">${itIc(id)}</button>`).join('') : '<span class="sh-empty">Поднос пуст</span>'}<button type="button" class="btn primary sh-serve" data-pa="shiftServe" ${g && sh.tray.length ? '' : 'disabled'}>Отдать заказ<kbd data-kb>Enter</kbd></button></div>
        <div class="sh-items">${sh.plan.items.map((x, i) => `<button type="button" class="sh-it ${x.cat}" data-pa="shiftItem" data-v="${x.id}" aria-label="${esc(x.name)}${hasKb() ? `, клавиша ${esc((sh.plan.keys || [])[i] || '')}` : ''}">${itIc(x.id)}<small>${esc(x.name)}</small><kbd data-kb>${esc((sh.plan.keys || [])[i] || '')}</kbd></button>`).join('')}</div></div></div>`;
    } else {
      const r = sh.result, st = r.stars;
      h = `<div class="pro-sh" role="dialog" aria-modal="true" aria-labelledby="shT"><div class="sh-in sh-res"><span class="sh-stars" aria-label="Оценка ${st} из 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= st ? 'on' : ''}" style="animation-delay:${i * 0.12}s">★</i>`).join('')}</span>
        <h2 id="shT">${st >= 5 ? 'Лучшая смена!' : st >= 4 ? 'Отличная смена' : st >= 3 ? 'Нормальная смена' : 'Тяжёлая смена'}</h2>
        <div class="sh-tipbig" id="shTip">+${fm(r.tips)}<small>чаевые</small></div>
        <div class="sh-rs"><span>✅ Обслужено: <b>${sh.served}</b></span><span>❌ Ошибки: <b>${sh.errors}</b></span><span>🥐 Допродажи: <b>${sh.upsells}</b></span><span>😠 Ушли: <b>${sh.lost}</b></span></div>
        <div class="sh-gain">${Object.keys(r.add).filter((k) => r.add[k] > 0).map((k) => `<span class="chip good">${PR().SK_NAME[k]} +${String(r.add[k]).replace('.', ',')}</span>`).join('')}<span class="chip ${r.rep >= 0 ? 'good' : 'bad'}">Начальник ${r.rep >= 0 ? '👍' : '👎'}</span></div>
        <div class="pf-btns"><button type="button" class="btn primary block pro-big" data-pa="shiftDone">Готово</button></div></div></div>`;
    }
    let el = $('#proSh'); if (!el) { $('#proOv').insertAdjacentHTML('beforeend', '<div id="proSh"></div>'); el = $('#proSh'); }
    el.innerHTML = h;
    if (PX()) { BK.Px.hydrate(el); shiftScene(); }
  }
  // значок позиции: пиксельная иконка (или эмодзи, если пиксельного движка нет)
  function itIc(id) { const it = itemById(id); return PX() ? BK.Px.iconTag(BK.Px.scenes.ITEM_IC[id] || 'cup') : `<span aria-hidden="true">${it.icon}</span>`; }
  // сцена «Смены»: гости-пиксели в очереди с пузырями заказов и шкалой терпения, герой за стойкой, Рашид у печи, Гуля
  function shiftScene() {
    const slot = document.getElementById('shScene'); if (!slot) return;
    if (!ui.pxShift) ui.pxShift = BK.Px.stage({ cls: 'pro-pxs', fps: 10, label: SW('Очередь в «Калаче»: гости с заказами, вы за стойкой'), height: (W) => (W < 200 ? 100 : 124), scale: (a) => (a >= 900 ? 3 : 2), minW: 150, maxW: 360, active: () => ui.mode === 'shift', draw: (b, t, W, H) => {
      const sh = ui.sh, now = performance.now();
      const d = { mode: 'shift', gulya: true, pos: ui.pxPos || (ui.pxPos = {}), queue: [], heroEmo: 'smile', rashidEmo: 'neutral' };
      if (sh) {
        d.queue = sh.state === 'play' ? sh.guests.map((g, i) => ({ id: g.id, look: g.look, pat: g.pat / g.max, order: i === 0 ? g.order : null })) : [];
        d.heroEmo = sh.heroUntil > now ? sh.heroFx : sh.guests.some((g) => g.pat / g.max < 0.3) ? 'worried' : 'smile';
        d.rashidEmo = sh.errors >= 2 ? 'angry' : sh.served >= 3 && !sh.errors ? 'smile' : 'neutral';
        if (sh.coinAt && now - sh.coinAt < 900) d.coin = t - (now - sh.coinAt) / 1000;
      }
      BK.Px.scenes.kalach(b, t, W, H, d);
    } });
    if (!ui.sh || ui.sh.state !== 'play') ui.pxPos = {};
    ui.pxShift.attach(slot);
  }
  function shiftItem(id) { const sh = ui.sh; if (!sh || sh.state !== 'play') return; if (sh.tray.length >= 4) { flash('Поднос полон', 'dn'); play('deny'); return; } sh.tray.push(id); play('tap'); shiftRender(); }
  // позиция полки по клавише: берёт продукт так же, как клик; пустая позиция — понятный отказ, а не молчание
  function shiftCell(i) {
    const sh = ui.sh; if (!sh || sh.state !== 'play') return;
    const x = sh.plan.items[i];
    if (!x) { flash('Здесь ничего нет', 'dn'); play('deny'); return; }
    shiftItem(x.id);
  }
  function shiftServe() {
    const sh = ui.sh, g = sh && sh.guests[0];
    if (!g || !sh.tray.length) { flash(g ? 'Поднос пуст' : 'Гостей нет', 'dn'); play('deny'); return; }
    const a = sh.tray.slice().sort().join(), b = g.order.slice().sort().join();
    if (a === b) {
      sh.served++; if (g.up != null) sh.upsells++;
      const p = Pp(), tip = Math.round(C().SHIFT_TIP * (0.7 + p.sk.sales / 100) + (g.up != null ? C().SHIFT_UPSELL : 0));
      sh.tips += tip; sh.guests.shift(); sh.tray = [];
      sh.heroFx = 'happy'; sh.heroUntil = performance.now() + 900; sh.coinAt = performance.now();
      flash(`Спасибо! +${tip} ₽`, 'up');
      sfx('coin'); // чаевые — короткий «дзынь» (BK.Sound сам держит частоту)
    } else { sh.errors++; sh.tray = []; g.pat = Math.max(1, g.pat - 3); sh.heroFx = 'worried'; sh.heroUntil = performance.now() + 1100; flash('Не тот заказ! 😬', 'dn'); play('deny'); }
    shiftRender();
  }
  function shiftUp() {
    const sh = ui.sh, g = sh && sh.guests[0];
    if (!g) { flash('Гостей нет', 'dn'); play('deny'); return; }
    if (g.asked) { flash('Этому гостю уже предлагали', 'dn'); play('deny'); return; }
    g.asked = true;
    if (sh.rnd() < sh.plan.upsell) {
      const bake = sh.plan.items.filter((x) => x.cat === 'bake' && !g.order.includes(x.id));
      const it = (bake.length ? bake : sh.plan.items)[Math.floor(sh.rnd() * (bake.length || sh.plan.items.length))];
      g.order.push(it.id); g.up = g.order.length - 1; flash(`Давайте! ${it.icon}`, 'up'); play('coin');
    } else { g.pat = Math.max(1, g.pat - 1); flash('Нет, спасибо', 'dn'); play('deny'); } // допродажа не прошла — мягкий отказ
    shiftRender();
  }
  function shiftEnd() {
    const sh = ui.sh; if (!sh || sh.state !== 'play') return;
    sh.state = 'res';
    sh.result = PR().shiftResult(S(), { served: sh.served, errors: sh.errors, upsells: sh.upsells, lost: sh.lost, total: sh.total });
    Pp().fx = Pp().fx.filter((f) => f.where !== 'shift'); // монетки — на экране итога, не второй раз
    if (sh.result.stars >= 4) play('fanfare'); else if (sh.result.stars <= 2) play('warn'); else play('click'); // итог смены
    shiftRender();
    setTimeout(() => { const t = $('#shTip'); if (t) { t.classList.add('bump'); } }, 300);
  }
  function shiftClose() {
    const el = $('#proSh'); if (el) el.remove();
    const tips = ui.sh && ui.sh.result ? ui.sh.result.tips : 0;
    ui.sh = null; ui.mode = null; ui.dirty = true; render(true);
    if (tips) { play('money'); coins($('#proShiftAnchor') || $('.pro-shiftbtn'), $('#proSav'), 6); float($('#proSav'), '+' + fm(tips), 'up', true); } // горсть монет — итог смены
    APP().save();
  }

  /* ---------------- действия ---------------- */
  function res(r, okMsg) { if (r && r.ok === false && r.msg) { APP().toast('Не получится', r.msg, 'warn'); play('deny'); } ui.dirty = true; render(true); drainFx(); if (r && r.ok) APP().save(); return r; }
  // звук кнопки-действия: неудача — `deny`, удача — тихий `tap`; у смены скорости и темы свои звуки
  const ACT_SND = { speed: 0, theme: 0, shift: 0, shiftGo: 0, shiftItem: 0, shiftTray: 0, shiftServe: 0, shiftUp: 0, shiftEnd: 0, shiftDone: 0, choose: 0, finalMain: 0, finalShop: 0, skipYes: 0, skipMain: 0, retry: 0, toStart: 0, menu: 0, menuClose: 0, skipAsk: 0, askNo: 0, openOwn: 0, fromDepYes: 0 };
  function onClick(e) {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    if (b.disabled) { play('deny'); return; }                                            // нажали выключенную кнопку
    const a = b.dataset.pa, v = b.dataset.v, s = S(), p = Pp(); if (!s || !p) return;
    if (!ACT_SND[a]) tapS();                                                            // отклик кнопки-действия
    if (a === 'menuClose' && b.classList.contains('pro-ovbg') && e.target !== b) return; // клик внутри меню — не закрывать
    e.preventDefault();
    switch (a) {
      case 'speed': ui.speed = +v; ui.dirty = true; render(true); break;
      case 'theme': if (APP().ACT && APP().ACT.theme) APP().ACT.theme({}); break;
      case 'menu': ui.menu = true; ui.ask = null; menu(); break;
      case 'menuClose': ui.menu = false; ui.ask = null; { const m = $('#proMenu'); if (m) m.remove(); } break;
      case 'skipAsk': ui.ask = 'skip'; menu(); break;
      case 'askNo': ui.ask = null; if (ui.menu) menu(); ui.dirty = true; render(true); break;
      case 'skipYes': ui.menu = false; ui.ask = null; toMain(true); break;
      case 'toStart': ui.menu = false; close(); APP().toStart(); break;
      case 'home': res(PR().setHome(s, v)); break;
      case 'food': res(PR().setFood(s, v)); break;
      case 'fun': res(PR().setFun(s, v)); break;
      case 'extra': res(PR().setExtra(s, +v)); sfx('click'); break;
      case 'save': res(PR().setSaveRate(s, +v)); sfx('click'); break;
      case 'study': { const r = res(PR().startStudy(s, v)); if (r && r.ok) play('coin'); break; } // записались на курс — оплата
      case 'want': {
        const r = res(PR().buyWant(s, v));
        if (r && r.ok) { play('coin'); float(document.querySelector(`#prologue [data-pa=want][data-v=${v}]`), '−' + fm(r.cost), 'dn'); } // уже прозвучал `tap` кнопки
        break;
      }
      case 'toBox': { const keep = Math.max(0, PR().monthCost(p) - 0), amt = Math.max(0, p.cash - keep); if (amt <= 0) APP().toast('Копилка', `Оставьте в кошельке запас на месяц жизни (${fm(PR().monthCost(p))}).`, 'warn'); else { const r = res(PR().toBox(s, amt)); if (r && r.ok) { sfx('coin'); coins($('#proCash'), $('#proBox'), 4); } } break; }
      case 'fromBox': { const r = res(PR().fromBox(s, Math.min(p.box, 10000))); if (r && r.ok) sfx('coin'); break; }
      case 'toDep': { const r = res(PR().toDep(s, p.box)); if (r && r.ok) { play('coin'); coins($('#proBox'), $('#proDep'), 4); } break; }
      case 'fromDep': if (p.depInt > 0) { ui.ask = 'dep'; ui.dirty = true; render(true); play('win'); } else { const r = res(PR().fromDep(s)); if (r && r.ok) play('coin'); } break;
      case 'fromDepYes': { const r = res(PR().fromDep(s)); if (r && r.ok) play('coin'); break; }
      case 'openOwn': { const r = PR().openOwn(s); if (r.ok) { play('fanfare'); showCard(); } break; }
      case 'choose': choose(+v); break;
      case 'shift': shiftOpen(true); break;   // «встать за стойку»: смена уже пришла сама (кнопка только когда она ждёт)
      case 'shiftGo': startShift(); break;
      case 'shiftCancel': { const el = $('#proSh'); if (el) el.remove(); ui.sh = null; ui.mode = null; play('win', { down: 1 }); break; }
      case 'shiftItem': shiftItem(v); break;
      case 'shiftTray': if (ui.sh) { ui.sh.tray.splice(+v, 1); play('click'); shiftRender(); } break;
      case 'shiftServe': shiftServe(); break;
      case 'shiftUp': shiftUp(); break;
      case 'shiftEnd': shiftEnd(); break;
      case 'shiftDone': shiftClose(); break;
      case 'finalMain': toMain(false); break;
      case 'finalShop': if (BK.Stage1UI) { play('ribbon'); BK.Stage1UI.begin(s); } break; // стадия 1 «Своя кофейня» (src/ui/stage1.js)
      case 'retry': play('tap'); retry(); break;
      case 'skipMain': toMain(true); break;
      default: break;
    }
  }
  // клавиатура (ПК): пробел — пауза, 1/2 — скорость; в «Смене» полка берётся 1-2-3 / Q-W-E / A-S-D,
  // допродажа — пробел, Enter — отдать заказ, Backspace — убрать с подноса. Клавиши по e.code:
  // на русской раскладке e.key для Q/W/E/A/S/D — «йцуфыв». В поле ввода и при удержании — не перехватываем.
  window.addEventListener('keydown', (e) => {
    if (!ui.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inField(e)) return;                 // фокус в текстовом поле — клавиши смены и пролога не наши
    e.stopPropagation();                    // основной игре эти клавиши сейчас не нужны
    const sh = ui.sh;
    if (ui.mode === 'shift' && sh) {
      if (sh.state === 'intro') {           // смену всё равно не пропустить: Enter/пробел — начать
        if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) startShift(); }
        return;
      }
      if (sh.state === 'res') {             // итог смены — Enter/пробел закрывают, как кнопка «Готово»
        if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) shiftClose(); }
        return;
      }
      if (sh.state !== 'play') return;
      if (e.repeat) { e.preventDefault(); return; }   // удержание клавиши не должно «залипать» и копить поднос
      const i = SHELF_KEY[e.code];
      if (i != null) { e.preventDefault(); shiftCell(i); return; }
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); shiftUp(); return; }   // отдельная клавиша допродажи
      if (e.key === 'Enter') { e.preventDefault(); shiftServe(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); if (sh.tray.length) { sh.tray.pop(); shiftRender(); } else { flash('Поднос пуст', 'dn'); play('deny'); } return; }
      return;
    }
    if (ui.mode) return;                                                                  // карточка и финал: клавиши пролога ждут
    if (e.code === 'Space') { e.preventDefault(); if (ui.speed) { ui.prev = ui.speed; ui.speed = 0; } else ui.speed = ui.prev || 1; ui.dirty = true; render(true); }
    else if (e.key === '1') { ui.speed = 1; render(true); } else if ((e.key === '2' || e.key === '3')) { ui.speed = 3; render(true); }
    else if (e.key === 'Escape' && ui.menu) { ui.menu = false; const m = $('#proMenu'); if (m) m.remove(); }
  }, true);
  function startShift() { if (ui.sh) { ui.sh.state = 'play'; ui.sh.next = 0.2; play('tap'); play('win'); shiftRender(); } }

  BK.PrologueUI = { startOpt, bindStart, picked, begin, active, resume, open, close, toMain, render, get ui() { return ui; }, shiftOpen };
})();
