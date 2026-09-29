/* Ядро интерфейса: цикл игры, HUD, вкладки, модальные окна, уведомления, сохранения. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, C = BK.CFG, P = BK.Panels, H = BK.UIH;
  const SAVE_KEY = 'bk-ufa-save-v1';
  const $ = (sel, el) => (el || document).querySelector(sel);
  // название сети в кавычках, но без «двойных» кавычек: Пекарня «Каравай» → как есть, Каравай → «Каравай»
  const qname = (n) => (/[«»"„“]/.test(n) ? H.esc(n) : `«${H.esc(n)}»`);
  let S = null;
  const ui = { tab: 'dash', sel: null, storeId: null, speed: 1, paused: false, modal: null, lastPanel: 0, dirty: true, modalQueue: [] };
  let map = null, acc = 0, lastT = 0, lastSave = 0;

  const TABS = [
    ['dash', 'Сводка'], ['stores', 'Точки'], ['market', 'Рынок'], ['prod', 'Цех'],
    ['menu', 'Меню'], ['team', 'Команда'], ['fin', 'Финансы'], ['log', 'Журнал'],
  ];
  const ICON = {
    pause: '<svg viewBox="0 0 16 14"><rect x="3" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>',
    p1: '<svg viewBox="0 0 16 14"><path d="M4 1 L13 7 L4 13 Z" fill="currentColor"/></svg>',
    p3: '<svg viewBox="0 0 16 14"><path d="M1 1 L8 7 L1 13 Z M8 1 L15 7 L8 13 Z" fill="currentColor"/></svg>',
    p10: '<svg viewBox="0 0 16 14"><path d="M0 1 L5.5 7 L0 13 Z M5 1 L10.5 7 L5 13 Z M10 1 L15.5 7 L10 13 Z" fill="currentColor"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 5.2A2.8 2.8 0 1 0 8 10.8 2.8 2.8 0 1 0 8 5.2Zm6.3 3.8-.1-2 1.4-1.2-1.4-2.4-1.8.5-1.6-1-.4-1.9H7.6l-.4 1.9-1.6 1-1.8-.5L2.4 5.8l1.4 1.2-.1 2-1.3 1.2 1.4 2.4 1.8-.6 1.6 1 .4 1.9h2.8l.4-1.9 1.6-1 1.8.6 1.4-2.4Z"/></svg>',
    help: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3v.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="currentColor"/></svg>',
  };
  /* ---------------- тема: авто / светлая / тёмная ---------------- */
  const THEME_KEY = 'bk-ufa-theme';
  const THEMES = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
  const THEME_ICON = {
    auto: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z" fill="currentColor"/></svg>',
  };
  const hostTheme = document.documentElement.getAttribute('data-theme');
  function loadTheme() { try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme(t) {
    ui.theme = t;
    const root = document.documentElement;
    if (t !== 'auto') root.setAttribute('data-theme', t);
    else if (hostTheme) root.setAttribute('data-theme', hostTheme); else root.removeAttribute('data-theme');
    const b = document.querySelector('.hud [data-act="theme"]');
    if (b) { b.innerHTML = THEME_ICON[t]; b.setAttribute('aria-label', `Тема: ${THEMES[t].toLowerCase()}. Сменить тему`); b.title = `Тема: ${THEMES[t].toLowerCase()} (нажмите, чтобы сменить)`; }
    document.querySelectorAll('.themeseg [data-arg]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.arg === t ? 'true' : 'false'));
  }
  function setTheme(t) {
    try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* без хранилища тема живёт до перезагрузки */ }
    applyTheme(t);
  }
  const themeSeg = () => `<div class="themeseg" role="group" aria-label="Тема оформления">${Object.keys(THEMES).map((k) => `<button type="button" data-act="theme" data-arg="${k}" aria-pressed="${ui.theme === k}">${THEME_ICON[k]}${THEMES[k]}</button>`).join('')}</div>`;

  const LOGO = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--crust)"/><path d="M7 19c0-5 4-9 9-9s9 4 9 9v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" fill="#fff"/><path d="M12 13.5l1.5 4M16 12.5v5M20 13.5l-1.5 4" stroke="var(--crust)" stroke-width="1.6" stroke-linecap="round"/></svg>';

  /* ---------------- сохранения ---------------- */
  function save() {
    if (!S) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(stripState(S))); lastSave = performance.now(); } catch (e) { /* хранилище недоступно — игра идёт без сохранений */ }
  }
  function stripState(st) { const c = Object.assign({}, st); delete c.cache; c.notify = []; return c; }
  function loadSave() { try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(stripState(S))))); }
  function importCode(code) { const st = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!st || !st.stores || !st.v) throw new Error('bad'); return st; }
  function migrate(st) {
    st.notify = []; st.flags = st.flags || {};
    if (E.wasteState) E.wasteState(st); // списания и вечерняя скидка — значения по умолчанию для старых сохранений
    st.office = Object.assign({ hr: false, academy: false, autohireOn: true, ownerHires: 0, ownerWeek: 0, autotrainOn: true, trainTarget: 3, ownerTrains: 0, ownerTrainWeek: 0 }, st.office || {});
    return st;
  }

  /* ---------------- каркас ---------------- */
  function shell() {
    document.body.insertAdjacentHTML('afterbegin', `
<div id="app">
  <header class="hud">
    <div class="brand">${LOGO}<div><div class="brand-name" id="hud-name"></div><div class="brand-sub">Хлебная карта Уфы</div></div></div>
    <div class="clock"><span class="date" id="hud-date"></span>
      <div class="speed" role="group" aria-label="Скорость времени">
        <button data-speed="0" aria-label="Пауза" title="Пауза (пробел)">${ICON.pause}</button>
        <button data-speed="1" aria-label="Скорость 1" title="1 день в секунду">${ICON.p1}</button>
        <button data-speed="3" aria-label="Скорость 3" title="3 дня в секунду">${ICON.p3}</button>
        <button data-speed="10" aria-label="Скорость 10" title="10 дней в секунду">${ICON.p10}</button>
      </div></div>
    <div class="stats">
      <div class="stat" title="Деньги на расчётном счёте: из них платите аренду, зарплаты и покупки"><span class="k">Счёт</span><span class="v" id="hud-cash"></span></div>
      <div class="stat" title="Резервный фонд: подушка безопасности, сам закрывает кассовый разрыв"><span class="k">Резерв</span><span class="v" id="hud-res"></span></div>
      <div class="stat"><span class="k">Точки</span><span class="v" id="hud-stores"></span></div>
      <div class="stat goal" title="Оборот сети за последние 12 месяцев. Цель — 5 млрд ₽"><span class="k" id="hud-goal-k">Оборот<span class="long"> 12 мес / 5 млрд</span></span><span class="v" id="hud-goal"></span><div class="bar"><i id="hud-goalbar"></i></div></div>
    </div>
    <div class="hudbtns">
      <button class="iconbtn theme" data-act="theme" aria-label="Сменить тему"></button>
      <button class="iconbtn" data-act="help" title="Как играть" aria-label="Как играть">${ICON.help}</button>
      <button class="iconbtn" data-act="settings" title="Меню игры" aria-label="Меню игры">${ICON.gear}</button>
    </div>
  </header>
  <div class="main">
    <div class="mapwrap">
      <svg class="map" id="map" role="img" aria-label="Карта Уфы с точками сети"></svg>
      <div class="mapctl"><button data-act="zoomIn" aria-label="Приблизить">+</button><button data-act="zoomOut" aria-label="Отдалить">−</button><button data-act="zoomReset" aria-label="Весь город" style="font-size:13px">⌂</button></div>
      <div class="maplegend">
        <span><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="var(--surface)" stroke="var(--crust)" stroke-width="2"/></svg>Точка</span>
        <span><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--river)" stroke-width="1.6" stroke-dasharray="3 2"/></svg>Свободное помещение</span>
        <span><svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="var(--ink)"/></svg>Производство</span>
        <span><svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="var(--crust)"/></svg>Офис</span>
        <span class="lg-rival"><svg viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8" rx="1" transform="rotate(45 7 7)" fill="var(--rival, #9580a8)" fill-opacity=".6"/></svg>Конкурент</span>
        <span>${BK.faceIcon('happy')}${BK.faceIcon('mid')}${BK.faceIcon('sad')}Настроение команды<i class="crowd-note">(издалека — только недовольные)</i></span>
      </div>
      <div class="maptip" hidden></div>
      <div class="setupbanner" id="setupbanner" hidden></div>
    </div>
    <aside class="panel"><nav class="tabs" role="tablist" id="tabs"></nav><div class="pbody" id="pbody"></div></aside>
  </div>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<div id="modal"></div>
<div id="start"></div>`);
    map = new BK.MapView($('#map'), { onClick: mapClick, tipFor });
    map.tip = $('.maptip');
    // высота HUD → CSS-переменная: на телефоне уведомления встают сразу под липкий HUD
    const hud = $('.hud'), setHud = () => document.documentElement.style.setProperty('--hud-h', Math.round(hud.getBoundingClientRect().height) + 'px');
    setHud(); if (globalThis.ResizeObserver) new ResizeObserver(setHud).observe(hud); else window.addEventListener('resize', setHud);
    window.addEventListener('scroll', placeToasts, { passive: true });
    window.addEventListener('resize', placeToasts);
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#pbody')) ui.pressing = true; }, true);
    const release = () => { if (ui.pressing) { ui.pressing = false; ui.pressUntil = performance.now() + 350; } };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  }

  /* ---------------- стартовый экран ---------------- */
  function startScreen() {
    const saved = loadSave();
    const el = $('#start');
    el.className = 'start';
    el.hidden = false;
    el.innerHTML = `<div class="start-in"><div class="start-top"><span>Тема</span>${themeSeg()}</div><div>
      <h1>Хлебная<br>карта <em>Уфы</em></h1>
      <p class="lead">Постройте сеть пекарен от первой точки до городского бренда. 10 млн ₽ на старте, одно производство — и весь город на карте.</p>
      <div class="rules">
        <div><b>10 млн ₽</b>стартовый капитал</div>
        <div><b>5 млрд ₽</b>цель — оборот за 12 месяцев</div>
        <div><b>~15 лет</b>на победу у сильного игрока</div>
        <div><b>100+ событий</b>кризисы, конкуренты, проверки</div>
      </div>
      <form id="startForm"><input class="input" id="companyName" maxlength="40" placeholder="Название сети" value="Пекарня «Каравай»" aria-label="Название сети"><button class="btn primary" type="submit">Новая игра</button></form>
      ${rivalOpt()}
      ${saved ? `<div class="cont"><button class="btn dark" data-act="continue">Продолжить: ${qname(saved.company)}, ${E.fmtDate(saved.day)}${saved.lost ? ' (банкротство)' : ''}</button></div>` : ''}
      <details class="codeload"><summary>Есть код сохранения с другого устройства?</summary>
        <textarea id="startCode" class="input" rows="3" placeholder="Вставьте код сохранения"></textarea>
        <button class="btn" type="button" id="startCodeBtn">Загрузить игру</button></details>
    </div><svg class="start-map" viewBox="0 0 1000 1000" aria-hidden="true">${BK.mapStatic({ id: 'sm' })}</svg></div>`;
    $('#start').querySelectorAll('[data-rival]').forEach((b) => b.addEventListener('click', () => $('#start').querySelectorAll('[data-rival]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    $('#startForm').addEventListener('submit', (e) => { e.preventDefault(); newGame($('#companyName').value.trim() || 'Пекарня «Каравай»'); });
    $('#startCodeBtn').addEventListener('click', () => {
      try { const st = importCode($('#startCode').value); continueGame(st); save(); toast('Игра загружена', `${st.company}, ${E.fmtDate(st.day)}`, 'good'); } catch (e) { toast('Код не подошёл', 'Проверьте, что он скопирован целиком.', 'bad'); }
    });
  }
  // сеть-соперник: вкл/выкл для новой игры (по умолчанию — CFG.RIVAL_ON)
  const rivalOpt = () => `<div class="rival-opt"><div class="row"><span>Сеть-соперник «${H.esc(BK.CFG.RIVAL_NAME)}»</span><div class="seg" role="group" aria-label="Сеть-соперник"><button type="button" data-rival="1" aria-pressed="${!!BK.CFG.RIVAL_ON}">вкл</button><button type="button" data-rival="0" aria-pressed="${!BK.CFG.RIVAL_ON}">выкл</button></div></div><small>Растёт вместе с вами, занимает хорошие помещения и отбирает гостей у соседних точек. Без неё игра чуть легче.</small></div>`;
  const rivalPicked = () => { const b = document.querySelector('#start [data-rival="1"]'); return b ? b.getAttribute('aria-pressed') === 'true' : BK.CFG.RIVAL_ON; };
  function hideStart() { const el = $('#start'); el.hidden = true; el.innerHTML = ''; $('#toasts').innerHTML = ''; }
  function newGame(name) {
    S = E.newGame({ company: name, rival: rivalPicked() });
    ui.tab = 'dash'; ui.sel = null; ui.storeId = null; ui.speed = 1; ui.modalQueue = [];
    hideStart(); closeModal(); map.reset(); renderAll(); save();
  }
  function continueGame(st) {
    S = migrate(st); ui.modalQueue = []; ui.storeId = null; ui.sel = null; hudCache = '';
    hideStart(); closeModal(); map.reset(); renderAll();
    if (S.lost) ui.modalQueue.push(openLostModal); // сохранение после банкротства: сразу показать итог, а не «замёрзшую» игру
  }

  /* ---------------- цикл ---------------- */
  function setSpeed(v) { ui.speed = v; acc = 0; renderHud(); }
  function frame(t) {
    requestAnimationFrame(frame);
    if (!S) return;
    const dt = Math.min(250, t - (lastT || t)); lastT = t;
    const running = S.phase === 'play' && ui.speed > 0 && !ui.modal && !S.ev.pending && !S.chef.pending && !S.lost;
    if (running) {
      acc += dt;
      const ms = C.SPEEDS[ui.speed] || 1000;
      let n = 0;
      while (acc >= ms && n < 4) {
        acc -= ms; n++;
        E.tick(S);
        handleNotify();
        if (ui.modal || S.ev.pending || S.chef.pending) { acc = 0; break; }
      }
      if (n) { ui.dirty = true; map.render(S, ui.sel); }
    }
    // после банкротства — только итоговое окно: событие или шеф, пришедшие в тот же день, его не перекрывают
    if (S.lost) { if (!ui.modal && ui.modalQueue.length) ui.modalQueue.shift()(); }
    else if (S.ev.pending && !ui.modal) openEventModal();
    else if (S.chef.pending && !ui.modal && S.phase === 'play') openChefModal();
    else if (!ui.modal && ui.modalQueue.length) { const m = ui.modalQueue.shift(); m(); }
    renderHud();
    if (ui.dirty && t - ui.lastPanel > 350 && !interacting()) { renderPanel(); ui.lastPanel = t; }
    if (t - lastSave > 30000) save();
  }
  // Не перерисовывать панель, пока игрок нажимает кнопку (иначе клик теряется), тянет ползунок или открыл список.
  function interacting() {
    if (ui.pressing || performance.now() < (ui.pressUntil || 0)) return true;
    const a = document.activeElement;
    if (!a || !$('#pbody').contains(a)) return false;
    return a.tagName === 'SELECT' || (a.tagName === 'INPUT' && ui.dragging);
  }

  function handleNotify() {
    const q = S.notify; S.notify = [];
    for (const n of q) {
      if (n.type === 'toast') toast(n.title, n.text, n.kind, null, n.storeId ? () => ACT.openStore({ arg: n.storeId }) : null);
      else if (n.type === 'event') toast(n.ev.title, n.ev.text, n.ev.kind === 'pos' ? 'pos' : 'neg', n.ev.effectsText);
      else if (n.type === 'month') { save(); }
      else if (n.type === 'year') ui.modalQueue.push(() => openYearModal(n));
      else if (n.type === 'won') ui.modalQueue.unshift(() => openWinModal());
      else if (n.type === 'lost') ui.modalQueue.unshift(() => openLostModal());
    }
  }

  /* ---------------- HUD ---------------- */
  let hudCache = '';
  function renderHud() {
    if (!S) return;
    const rolling = E.rolling12(S);
    const key = [S.day, Math.round(S.cash / 1000), Math.round(S.reserve / 1000), S.stores.length, ui.speed, S.company, Math.round(rolling / 1e6), S.won].join('|');
    if (key === hudCache) return; hudCache = key;
    $('#hud-name').textContent = S.company;
    $('#hud-date').textContent = E.fmtDate(S.day);
    const cash = $('#hud-cash'); cash.textContent = H.fm(S.cash); cash.classList.toggle('neg', S.cash < 0);
    $('#hud-res').textContent = H.fm(S.reserve);
    const open = S.stores.filter((s) => s.status !== 'opening').length;
    $('#hud-stores').textContent = open + (S.stores.length > open ? '+' + (S.stores.length - open) : '');
    $('#hud-goal').innerHTML = H.fm(rolling) + (S.won ? '<span class="long"> · цель взята</span>' : '');
    $('#hud-goalbar').style.width = Math.min(100, rolling / C.WIN_ANNUAL_REVENUE * 100).toFixed(1) + '%';
    document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === ui.speed)));
    const ban = $('#setupbanner');
    if (S.phase === 'setup_prod') { ban.hidden = false; ban.innerHTML = '<b>Шаг 1 · Производство</b>Выберите помещение под цех — на карте или в списке справа'; }
    else if (S.phase === 'setup_store') { ban.hidden = false; ban.innerHTML = '<b>Шаг 2 · Первая точка</b>Выберите помещение для пекарни — кружки с плюсом на карте'; }
    else ban.hidden = true;
  }

  /* ---------------- панель ---------------- */
  function tabDots() {
    const d = {};
    if (!S) return d;
    const al = BK.alerts(S);
    if (al.some((a) => a.cls === 'bad')) d.dash = 1;
    if (S.chef.pending) d.menu = 1;
    if ((S.cache && S.cache.capUse > 1)) d.prod = 1;
    if (S.prodOffers.length && S.productions.length) d.market = 1;
    return d;
  }
  function renderTabs() {
    const dots = tabDots();
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab" role="tab" data-act="tab" data-arg="${k}" aria-selected="${ui.tab === k}">${l}${dots[k] ? '<span class="dot"></span>' : ''}</button>`).join('');
  }
  function renderPanel() {
    if (!S) return;
    ui.dirty = false;
    renderTabs();
    const body = $('#pbody');
    const scroll = body.scrollTop;
    const fn = { dash: P.dash, stores: P.stores, market: P.market, prod: P.production, menu: P.menu, team: P.team, fin: P.finance, log: P.journal }[ui.tab] || P.dash;
    let html;
    if ((S.phase === 'setup_prod' || S.phase === 'setup_store') && ui.tab !== 'log') html = P.dash(S, ui);
    else html = fn(S, ui);
    if (html !== ui.lastHtml) {
      // смена вкладки — полная замена; обновление той же вкладки — точечно (morph), чтобы не пересобирать
      // и не перерисовывать весь список из 40–60 карточек каждые 350 мс на скорости ×10
      if (ui.lastTab === ui.tab + '|' + ui.storeId && body.firstChild) morph(body, html);
      else body.innerHTML = html;
      ui.lastHtml = html; ui.lastTab = ui.tab + '|' + ui.storeId; body.scrollTop = scroll;
    }
  }
  /* Минимальный DOM-diff: узлы с тем же тегом переиспользуются, меняются только отличающиеся атрибуты и текст. */
  function morph(el, html) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    syncChildren(el, tpl.content);
  }
  function syncChildren(a, b) {
    const bs = [...b.childNodes];
    for (let i = 0; i < bs.length; i++) {
      const x = a.childNodes[i], y = bs[i];
      if (!x) { a.appendChild(y); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
      if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      if (x.isEqualNode(y)) continue;
      syncAttrs(x, y);
      syncChildren(x, y);
      if (x.tagName === 'SELECT' && document.activeElement !== x) { const o = y.querySelector('option[selected]'); if (o) x.value = o.value; }
    }
    while (a.childNodes.length > bs.length) a.removeChild(a.lastChild);
  }
  function syncAttrs(x, y) {
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of y.attributes) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === 'INPUT' && document.activeElement !== x) { if (x.type === 'checkbox' || x.type === 'radio') x.checked = y.hasAttribute('checked'); else if (x.value !== (y.getAttribute('value') || '')) x.value = y.getAttribute('value') || ''; }
    if (x.tagName === 'OPTION') x.selected = y.hasAttribute('selected');
  }
  function renderAll() { if (!S) return; renderHud(); ui.dirty = true; renderPanel(); map.render(S, ui.sel); }
  function refresh() { if (!S) return; ui.dirty = true; renderPanel(); map.render(S, ui.sel); hudCache = ''; renderHud(); }

  /* ---------------- карта ---------------- */
  function mapClick(hit) {
    if (!S) return;
    if (!hit) { ui.sel = null; map.render(S, ui.sel); return; }
    ui.sel = hit;
    if (hit.kind === 'store') { ui.tab = 'stores'; ui.storeId = hit.id; }
    else if (hit.kind === 'offer') { ui.tab = S.phase === 'play' ? 'market' : 'dash'; }
    else if (hit.kind === 'prod') ui.tab = 'prod';
    else if (hit.kind === 'prodOffer') ui.tab = S.phase === 'play' ? 'market' : 'dash';
    else if (hit.kind === 'hq') ui.tab = 'team';
    refresh();
    requestAnimationFrame(() => {
      const card = hit.kind === 'offer' ? document.querySelector(`[data-offer="${hit.id}"]`) : document.querySelector('.card.sel');
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      else $('#pbody').scrollTop = 0;
    });
  }
  function tipFor(kind, id) {
    if (!S) return '';
    const e = H.esc;
    if (kind === 'store') {
      const st = E.byId(S.stores, id); if (!st) return '';
      const mood = BK.storeMood(st);
      const rt = st.status !== 'opening' && H.rating ? ` · ${H.rating.r1(E.storeRating(S, st))}★` : '';
      return `<b>№${st.num} · ${e(st.address)}</b>${rt}<br>${H.dname(st.district)} · штат ${st.staff.length}/${st.staffTarget}${mood ? ` · настроение: ${mood === 'happy' ? 'довольны' : mood === 'mid' ? 'так себе' : 'недовольны'}` : ''}<br>${st.last ? 'Выручка за месяц ' + H.fm(st.last.rev) : st.status === 'opening' ? 'Открывается' : 'Первый месяц'}`;
    }
    if (kind === 'offer') {
      const o = E.byId(S.offers, id); if (!o) return '';
      const est = BK.estimateOffer(S, o);
      return `<b>Свободно: ${e(o.address)}</b><br>${H.dname(o.district)} · ${o.area} м² · ${o.landmarks.map(H.lname).join(', ')}<br>Трафик ${H.n0(o.traffic)} · прогноз ≈ ${H.fm(est.rev)}/мес`;
    }
    if (kind === 'prod') { const p = E.byId(S.productions, id); return p ? `<b>${p.name}</b><br>${e(p.address)}<br>Загрузка ${H.pct(p.load || 0)}` : ''; }
    if (kind === 'prodOffer') { const o = E.byId(S.prodOffers, id); return o ? `<b>Под производство: ${e(o.address)}</b><br>${H.dname(o.district)} · ${o.area} м² · ${H.fm(o.area * o.rentM2)}/мес` : ''; }
    if (kind === 'hq') return `<b>Офис компании</b><br>Найм, обучение, культура`;
    if (kind === 'rival') { const R = E.rivalSummary && E.rivalSummary(S), o = R && R.stores.find((x) => x.id === id); return o ? `<b>«${e(R.name)}» — конкурент</b><br>${e(o.address)} · ${H.dname(o.district)}<br>Забирает часть гостей у ваших точек ближе ~0,9 км` : ''; }
    return '';
  }

  /* ---------------- действия ---------------- */
  function res(r, okMsg) {
    if (r && r.ok === false && r.msg) toast('Не получилось', r.msg, 'warn');
    else if (okMsg) toast(okMsg, '', 'good');
    refresh();
  }
  const ACT = {
    tab: (d) => { ui.tab = d.arg; if (d.arg !== 'stores') ui.storeId = null; ui.confirmFire = ui.confirmClose = null; $('#pbody').scrollTop = 0; refresh(); },
    openStore: (d) => { ui.tab = 'stores'; ui.storeId = d.arg; ui.sel = { kind: 'store', id: d.arg }; const st = E.byId(S.stores, d.arg); if (st) map.focus(st.x, st.y); $('#pbody').scrollTop = 0; refresh(); },
    closeStoreView: () => { ui.storeId = null; ui.sel = null; refresh(); },
    storeSort: (d) => { ui.storeSort = d.arg; refresh(); },
    logFilter: (d) => { ui.logFilter = d.arg; refresh(); },
    focusOffer: (d) => { const o = E.byId(S.offers, d.arg); if (o) { ui.sel = { kind: 'offer', id: o.id }; map.focus(o.x, o.y); refresh(); } },
    focusProdOffer: (d) => { const o = E.byId(S.prodOffers, d.arg); if (o) { ui.sel = { kind: 'prodOffer', id: o.id }; map.focus(o.x, o.y); refresh(); } },
    rent: (d) => {
      const r = E.rentStore(S, d.arg);
      if (r.ok) { ui.sel = { kind: 'store', id: r.store.id }; toast('Помещение арендовано', `${r.store.address}. Открытие через ${C.OPEN_DAYS} дн.`, 'good'); if (S.phase === 'play' && S.stores.length === 1) { ui.tab = 'dash'; ui.modalQueue.push(openTutorialModal); } }
      res(r);
    },
    rentProd: (d) => { const r = E.chooseProduction(S, d.arg); if (r.ok) toast('Производство арендовано', `Запуск через ${C.PROD_OPEN_DAYS} дн.`, 'good'); ui.sel = null; res(r); },
    realtor: () => res(E.refreshOffers(S), 'Риелтор принёс новую подборку'),
    repair: (d) => res(E.startRepair(S, d.arg), 'Ремонт начат'),
    train: (d) => res(E.train(S, d.arg, d.arg2)),
    trainAll: (d) => { const r = E.trainAll(S, d.arg); res(r.ok ? r : { ok: false, msg: E.ownerTrainLeft(S) === 0 ? `Лимит ручного обучения на эту неделю исчерпан — откройте отдел обучения во вкладке «Команда»` : 'Некого учить или не хватает денег' }, r.ok ? `Обучено: ${H.nw(r.n, 'сотрудник', 'сотрудника', 'сотрудников')}` : null); },
    quickHire: (d) => { const r = E.hire(S, d.arg); res(r, r.ok ? `${BK.byGender(r.p.name, 'Нанят', 'Нанята')} ${r.p.name}, выйдет через ${E.hireDays(S)} дн.` : null); },
    pickCand: (d) => { ui.hireStore = d.arg; ui.tab = 'team'; refresh(); requestAnimationFrame(() => { const el = $('#hireStore'); if (el) el.scrollIntoView({ block: 'center' }); }); },
    hireCand: (d) => { const r = E.hire(S, d.arg2, d.arg); res(r, r.ok ? `${BK.byGender(r.p.name, 'Нанят', 'Нанята')} ${r.p.name}, выйдет через ${E.hireDays(S)} дн.` : null); },
    askFire: (d) => { ui.confirmFire = d.arg; refresh(); },
    cancelFire: () => { ui.confirmFire = null; refresh(); },
    fire: (d) => { ui.confirmFire = null; res(E.fire(S, d.arg, d.arg2)); },
    staffTarget: (d) => { const st = E.byId(S.stores, d.arg); if (st) E.setStaffTarget(S, st.id, st.staffTarget + (+d.arg2)); refresh(); },
    askClose: (d) => { ui.confirmClose = d.arg; refresh(); },
    cancelClose: () => { ui.confirmClose = null; refresh(); },
    closeStore: (d) => { const r = E.closeStore(S, d.arg); ui.confirmClose = null; ui.storeId = null; ui.sel = null; res(r, r.ok ? `Точка закрыта, возвращено ${H.fm(r.refund)}` : null); },
    buyEq: (d) => res(E.buyEquipment(S, d.arg, d.arg2), 'Оборудование установлено'),
    price: (d) => { const it = S.menu.find((m) => m.id === d.arg); if (it) E.setPrice(S, d.arg, it.pm + (+d.arg2)); refresh(); },
    allPrices: (d) => { if (d.arg === 'reset') S.menu.forEach((m) => { m.pm = 1; }); else E.setAllPrices(S, +d.arg); refresh(); },
    chef: () => openChefModal(),
    pay: (d) => { E.setPay(S, d.arg, S.pay[d.arg] * (1 + (+d.arg2))); refresh(); },
    office: (d) => res(E.buyOffice(S, d.arg), d.arg === 'hr' ? 'HR-отдел открыт' : 'Отдел обучения открыт'),
    autohire: (d) => { S.office.autohireOn = d.arg === '1'; refresh(); },
    autotrain: (d) => { S.office.autotrainOn = d.arg === '1'; refresh(); },
    trainTarget: (d) => { S.office.trainTarget = Math.max(1, Math.min(5, S.office.trainTarget + (+d.arg))); refresh(); },
    culture: () => res(E.buyCulture(S), 'Культура внедрена'),
    reserve: (d) => { E.reserveMove(S, +d.arg); refresh(); },
    loan: (d) => { const r = E.takeLoan(S, +d.arg); res(r, r.ok ? `Кредит получен: +${H.fm(r.amount)}` : null); },
    repay: (d) => { const before = S.loan; const r = E.repayLoan(S, +d.arg); res(r, r.ok ? `Погашено ${H.fm(before - S.loan)}${S.loan ? '' : ' — кредит закрыт'}` : null); },
    zoomIn: () => map.zoom(1 / 1.3), zoomOut: () => map.zoom(1.3), zoomReset: () => map.reset(),
    settings: () => openSettings(), help: () => openHelp(),
    theme: (d) => setTheme(d.arg || { auto: 'light', light: 'dark', dark: 'auto' }[ui.theme || 'auto']),
    continue: () => { const st = loadSave(); if (st) continueGame(st); },
    closeModal: () => closeModal(),
    eveDisc: (d) => { const r = E.setEveDiscount(S, +d.arg); if (r.penalty) toast('Гости раздражены сменой скидки', `Рейтинг точек −${String(C.DISC_PENALTY_RATING).replace('.', ',')}★ на месяц.`, 'warn'); refresh(); },
  };
  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = ACT[t.dataset.act];
    if (fn && S || t.dataset.act === 'continue' || t.dataset.act === 'closeModal' || t.dataset.act === 'theme') { e.preventDefault(); fn(t.dataset); }
  }
  function onInput(e) {
    const t = e.target; if (!t.dataset || !t.dataset.inp || !S) return;
    if (t.dataset.inp === 'alloc') {
      const a = Object.assign({}, S.alloc); a[t.dataset.arg] = +t.value / 100; E.setAlloc(S, a);
      const lab = t.closest('.field'); if (lab) { lab.querySelector('b').textContent = H.pct(S.alloc[t.dataset.arg]); lab.querySelector('.val').textContent = H.pct(S.alloc[t.dataset.arg]); }
      ui.dragging = e.type === 'input';
      if (e.type === 'change') { ui.dragging = false; refresh(); }
    } else if (t.dataset.inp === 'hireStore') { ui.hireStore = t.value; refresh(); }
    else if (t.dataset.inp === 'bake') {
      E.setBake(S, +t.value);
      const lab = t.closest('.field'), L = C.BAKE_LEVELS[E.wasteState(S).bake + 3]; if (lab) lab.querySelector('b').textContent = L.name; t.setAttribute('aria-valuetext', L.name);
      ui.dragging = e.type === 'input';
      if (e.type === 'change') { ui.dragging = false; refresh(); }
    }
  }
  function onKey(e) {
    const tg = e.target.tagName;
    if (!S || tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA' || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && ui.modal && ui.modal.closable) closeModal();
    if (e.code === 'Space') {
      e.preventDefault(); // иначе пробел ещё и «нажмёт» кнопку в фокусе (например, вариант в событии)
      if (ui.modal) return; // пока открыто окно, время и так стоит
      if (ui.speed) { ui.prevSpeed = ui.speed; setSpeed(0); } else setSpeed(ui.prevSpeed || 1);
    }
    if (ui.modal) return;
    if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(3); if (e.key === '3') setSpeed(10);
  }

  /* ---------------- уведомления ---------------- */
  // Телефон: панель стоит под картой, её вкладки «ездят» по экрану при прокрутке. Уведомления встают сверху
  // (под HUD), а когда вкладки поднялись в верхнюю половину экрана — уходят вниз, чтобы не закрывать их.
  const mqPhone = globalThis.matchMedia ? matchMedia('(max-width: 820px)') : { matches: false };
  function placeToasts() {
    const box = $('#toasts'); if (!box || !box.firstChild) return;
    let bottom = false;
    if (mqPhone.matches) { const r = $('#tabs').getBoundingClientRect(); bottom = r.bottom > 0 && r.top < innerHeight * 0.55; }
    box.classList.toggle('bottom', bottom);
  }
  function toast(title, text, kind, effects, onClick) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = `<b>${H.esc(title)}</b>${text ? `<div>${H.esc(text)}</div>` : ''}${effects && effects.length ? `<div class="eff">${effects.map(H.esc).join(' · ')}</div>` : ''}`;
    el.addEventListener('click', () => { el.remove(); if (onClick && S) onClick(); });
    if (onClick) el.title = 'Открыть точку';
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    placeToasts();
    setTimeout(() => el.remove(), effects ? 9000 : 6000);
  }

  /* ---------------- модальные окна ---------------- */
  function openModal(html, opts) {
    ui.modal = Object.assign({ closable: false }, opts || {});
    const keepScroll = opts && opts.keepScroll && $('#modal .modal') ? $('#modal .modal').scrollTop : 0;
    $('#modal').innerHTML = `<div class="modal-bg"${ui.modal.closable ? ' data-bg="1"' : ''}><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
    const bg = $('#modal .modal-bg');
    if (ui.modal.closable) bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
    // фокус — на само окно, а не на первую кнопку: случайный пробел/Enter не выберет вариант за игрока
    const dlg = $('#modal .modal'); dlg.scrollTop = keepScroll; dlg.focus({ preventScroll: true });
  }
  function closeModal() { ui.modal = null; $('#modal').innerHTML = ''; refresh(); }

  function openEventModal() {
    const ev = S.ev.pending;
    const eyebrow = ev.crisis ? '<span class="eyebrow crisis">Экономический кризис</span>' : `<span class="eyebrow ${ev.kind}">${ev.kind === 'pos' ? 'Хорошие новости' : 'Событие'} · ${E.fmtDate(ev.day)}</span>`;
    let html = `<div class="modal-h">${eyebrow}<h2>${H.esc(ev.title)}</h2></div><div class="modal-b"><p style="margin:0">${H.esc(ev.text)}</p>`;
    if (ev.effectsText && ev.effectsText.length) html += `<div class="effects">${ev.effectsText.map((t) => `<span class="chip ${ev.kind === 'pos' ? 'good' : 'bad'}">${H.esc(t)}</span>`).join('')}</div>`;
    html += `</div><div class="modal-f">`;
    if (ev.choices) {
      // бесплатный вариант доступен всегда (даже при минусе на счёте), иначе игрок застревает в окне;
      // если по деньгам не проходит ничего — открыт самый дешёвый вариант (уйдёт в минус, как и прочие платежи)
      const afford = (c) => !c.cost || c.cost <= S.cash + S.reserve;
      const cheapest = ev.choices.some(afford) ? -1 : ev.choices.reduce((b, c, i) => (c.cost < ev.choices[b].cost ? i : b), 0);
      ev.choices.forEach((c, i) => {
        const can = afford(c) || i === cheapest;
        html += `<button class="choice" data-choice="${i}"${can ? '' : ' disabled'}><b>${H.esc(c.label)}</b><span class="cd">${H.esc(c.desc || '')}</span><span class="cc">${c.cost ? H.fm(c.cost) : 'бесплатно'}</span></button>`;
      });
    } else html += `<button class="btn primary block" data-choice="-1">Понятно</button>`;
    html += `</div>`;
    openModal(html);
    $('#modal').querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.choice;
      if (ev.choices) { const c = ev.choices[i]; if (c.cost > 0 && c.cost > S.cash) E.reserveMove(S, -(c.cost - S.cash)); }
      E.resolveEvent(S, i < 0 ? 0 : i);
      closeModal(); save();
    }));
  }

  function openChefModal() {
    if (!S.chef.pending) return;
    const pick = new Set(), drop = new Set();
    const pl = S.macro.priceLevel;
    const draw = () => {
      const after = S.menu.length - drop.size + pick.size;
      let html = `<div class="modal-h"><span class="eyebrow">Шеф-пекарь · новинки ${E.dateOf(S.day).y}</span><h2>Что добавим в меню?</h2></div><div class="modal-b">
        <p class="hint" style="margin:0">Выберите до ${C.CHEF_PICK} новинок и выведите до ${C.CHEF_REMOVE} старых позиций. Цену шеф предлагает сам — изменить её можно во вкладке «Меню».</p><div class="chefgrid">`;
      for (const id of S.chef.pending) {
        const p = E.byId(BK.PRODUCTS, id); const ok = E.eqUnlocked(S, p.req);
        const reqName = p.req ? (E.byId(BK.EQUIPMENT, p.req) || {}).name : '';
        html += `<label class="chefitem ${pick.has(id) ? 'on' : ''} ${ok ? '' : 'locked'}"><input type="checkbox" data-pick="${id}" ${pick.has(id) ? 'checked' : ''} ${ok ? '' : 'disabled'}><span class="cn">${H.esc(p.name)}</span><span class="chip cat" style="--cat:${BK.CATEGORIES[p.cat].color}">${BK.CATEGORIES[p.cat].name}</span>
          <span class="cm"><span>цена ${H.n0(p.price * pl)} ₽</span><span>фудкост ${H.pct(p.fc)}</span><span>тренд ${Math.round(S.trends[p.cat])}</span><span>популярность ${p.pop}</span>${ok ? '' : `<span class="negc">нужно: ${H.esc(reqName)}</span>`}</span></label>`;
      }
      html += `</div><h3 style="font-size:13px;margin-top:6px">Вывести из меню</h3><div class="chefgrid">`;
      for (const it of S.menu) {
        const p = E.byId(BK.PRODUCTS, it.id);
        html += `<label class="chefitem ${drop.has(it.id) ? 'off' : ''}"><input type="checkbox" data-drop="${it.id}" ${drop.has(it.id) ? 'checked' : ''}><span class="cn">${H.esc(p.name)}</span><span class="chip">${BK.CATEGORIES[p.cat].name}</span><span class="cm"><span>тренд ${Math.round(S.trends[p.cat])}</span><span>фудкост ${H.pct(p.fc / it.pm)}</span></span></label>`;
      }
      html += `</div></div><div class="modal-f"><div class="row sp"><span class="hint">В меню станет ${H.nw(after, 'позиция', 'позиции', 'позиций')} (от ${C.MENU_MIN} до ${C.MENU_MAX})</span><button class="btn primary" id="chefOk" ${after < C.MENU_MIN || after > C.MENU_MAX ? 'disabled' : ''}>Утвердить меню</button></div></div>`;
      openModal(html, { keepScroll: true });
      $('#modal').querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('change', () => { const id = b.dataset.pick; if (b.checked) { if (pick.size >= C.CHEF_PICK) { b.checked = false; return; } pick.add(id); } else pick.delete(id); draw(); }));
      $('#modal').querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('change', () => { const id = b.dataset.drop; if (b.checked) { if (drop.size >= C.CHEF_REMOVE) { b.checked = false; return; } drop.add(id); } else drop.delete(id); draw(); }));
      $('#chefOk').addEventListener('click', () => { const r = E.chefConfirm(S, [...pick], [...drop]); if (!r.ok) { toast('Не получилось', r.msg, 'warn'); return; } closeModal(); save(); });
    };
    draw();
  }

  function openYearModal(n) {
    const hist = S.history.filter((h) => h.y === n.y);
    const profit = hist.reduce((a, h) => a + h.profit, 0);
    let staffN = E.allStaff(S);
    openModal(`<div class="modal-h"><span class="eyebrow">Итоги года</span><h2>${n.y}: ${H.fm(n.rev)} выручки</h2></div><div class="modal-b">
      <div class="kpis"><div class="kpi"><span class="k">Прибыль за год</span><span class="v ${profit < 0 ? 'negc' : 'pos'}">${H.fm(profit)}</span></div>
      <div class="kpi"><span class="k">Точек</span><span class="v">${S.stores.length}</span></div>
      <div class="kpi"><span class="k">Команда</span><span class="v">${staffN + E.bakersTotal(S)}</span></div>
      <div class="kpi"><span class="k">Резерв</span><span class="v">${H.fm(S.reserve)}</span></div>
      <div class="kpi wide"><span class="k">До цели (оборот 12 мес)</span><span class="v">${H.pct(E.rolling12(S) / C.WIN_ANNUAL_REVENUE, 1)}</span>${H.meter(E.rolling12(S) / C.WIN_ANNUAL_REVENUE, 'ok')}</div></div>
      <p class="hint" style="margin:0">Цены, аренда и рыночные зарплаты проиндексированы на инфляцию. Проверьте зарплаты во вкладке «Команда».${S.chef.pending ? ' Шеф-пекарь ждёт решения по новинкам.' : ''}</p>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Продолжить</button></div>`, { closable: true });
  }
  // «1,5 года», «2 года», «0,3 года», «11 лет»
  function yearsText(days) {
    const y = days / 365;
    if (y < 1) { const m = Math.max(1, Math.round(days / 30.4)); return H.nw(m, 'месяц', 'месяца', 'месяцев'); }
    const r = Math.round(y * 10) / 10;
    return Number.isInteger(r) ? H.nw(r, 'год', 'года', 'лет') : String(r).replace('.', ',') + ' года';
  }
  function openWinModal() {
    const years = yearsText(S.wonDay);
    openModal(`<div class="modal-h"><span class="eyebrow pos">Победа</span><h2>Оборот сети — ${H.fm(E.rolling12(S))} за год</h2></div><div class="modal-b">
      <p style="margin:0">${qname(S.company)} стала хлебной картой Уфы. Вы дошли до цели за <b>${years}</b>, открыв ${H.nw(S.stores.length, 'точку', 'точки', 'точек')} и ${H.nw(S.productions.length, 'производство', 'производства', 'производств')}.</p>
      <div class="kpis"><div class="kpi"><span class="k">Выручка за всё время</span><span class="v">${H.fm(S.cumRevenue)}</span></div><div class="kpi"><span class="k">Команда</span><span class="v">${E.allStaff(S) + E.bakersTotal(S)}</span></div><div class="kpi"><span class="k">Нанято / ушло</span><span class="v">${S.stats.hires} / ${S.stats.quits}</span></div><div class="kpi"><span class="k">Событий пережито</span><span class="v">${S.stats.eventsSeen}</span></div></div>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button><button class="btn block" id="newAfter">Новая игра</button></div>`);
    $('#newAfter').addEventListener('click', () => { closeModal(); clearSave(); S = null; startScreen(); });
  }
  function openLostModal() {
    openModal(`<div class="modal-h"><span class="eyebrow neg">Банкротство</span><h2>Сеть не смогла расплатиться с долгами</h2></div><div class="modal-b">
      <p style="margin:0">${H.nw(C.BANKRUPT_MONTHS, 'месячный расчёт', 'месячных расчёта', 'месячных расчётов')} подряд счёт был в минусе, а резервный фонд пуст. Вы продержались ${yearsText(S.day)}, максимум точек в сети — ${Math.max(S.stats.peakStores, S.stores.length)}.</p>
      <p class="hint" style="margin:0">Совет: держите в резерве 2–3 месячных расхода, не открывайте точки на последние деньги и следите за загрузкой производства.</p>
      </div><div class="modal-f"><button class="btn primary block" id="newAfter">Начать заново</button></div>`);
    $('#newAfter').addEventListener('click', () => { closeModal(); clearSave(); S = null; startScreen(); });
  }
  function openTutorialModal() {
    openModal(`<div class="modal-h"><span class="eyebrow">Время пошло</span><h2>Первая точка откроется через ${H.nw(C.OPEN_DAYS, 'день', 'дня', 'дней')}</h2></div><div class="modal-b">
      <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
        <li><b>Время</b> идёт само: пауза — пробел, скорость ×1 / ×3 / ×10 вверху.</li>
        <li><b>Смайлики над точками</b> — настроение команды. Кто недоволен больше месяца — уходит. Помогают зарплата, премии, культура и полный штат.</li>
        <li><b>Новые помещения</b> появляются на карте кружками с плюсом. Сравнивайте трафик, платёжеспособность и прогноз прибыли.</li>
        <li><b>Прибыль</b> каждый месяц делится: резервный фонд, премии, маркетинг и развитие («Финансы»).</li>
        <li><b>Производство</b> не бесконечно: когда загрузка подходит к 90%, покупайте оборудование.</li>
        <li><b>Цель</b> — оборот 5 млрд ₽ за 12 месяцев.</li>
      </ul></div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Поехали</button></div>`, { closable: true });
  }
  function openHelp() {
    openModal(`<div class="modal-h"><span class="eyebrow">Как играть</span><h2>Правила «Хлебной карты»</h2></div><div class="modal-b">
      <p style="margin:0"><b>Выручка точки</b> = трафик × конверсия × средний чек. Трафик зависит от места и соседства, конверсия (доля прохожих, которые заходят и покупают) — от меню, ремонта, сервиса и цен, чек — от платёжеспособности района и ваших цен.</p>
      <p style="margin:0"><b>Персонал.</b> Уровни 1–5: выше уровень — больше гостей и чек, меньше текучесть, но и оклад выше. Один сотрудник обслуживает ограниченное число гостей: перегруз → усталость → недовольство → увольнения, и остальным становится ещё тяжелее. Найм стоит ${String(C.HIRE_COST_SALARIES).replace('.', ',')} зарплаты. После ${C.HR_REQUIRED_STORES} точек нужен HR-отдел, после ${C.TRAIN_REQUIRED_STORES} — отдел обучения.</p>
      <p style="margin:0"><b>Производство</b> печёт на все точки. Ближе к центру — дороже аренда, дешевле доставка. Второй цех — от ${C.SECOND_PROD_STORES} точек, третий — от ${C.THIRD_PROD_STORES}.</p>
      <p style="margin:0"><b>Меню.</b> Раз в год шеф предлагает 5 новинок: можно добавить до ${C.CHEF_PICK} и вывести до ${C.CHEF_REMOVE}. Цены меняйте в любой момент. Следите за фудкостом — долей себестоимости продуктов в цене.</p>
      <p style="margin:0"><b>Деньги.</b> Зарплаты, аренду и налоги списывают 1-го числа. Резервный фонд приносит проценты и сам закрывает кассовый разрыв. Если ${H.nw(C.BANKRUPT_MONTHS, 'расчёт', 'расчёта', 'расчётов')} подряд счёт в минусе, а резерв пуст, — банкротство.</p>
      <p style="margin:0"><b>Термины.</b> ФОТ — фонд оплаты труда: зарплаты плюс взносы. УСН — упрощённый налог с выручки; когда выручка за год превысит лимит, сеть перейдёт на ОСНО (НДС и налог на прибыль). Кассовый разрыв — на счёте не хватает денег на платежи.</p>
      <p style="margin:0"><b>События:</b> налоги, проверки, конкуренты, погода, кризис раз в 2–3 года. 70% из них — неприятные.</p>
      <p class="hint" style="margin:0">Клавиши: пробел — пауза, 1 / 2 / 3 — скорость.</p>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Понятно</button></div>`, { closable: true });
  }
  function openSettings() {
    openModal(`<div class="modal-h"><span class="eyebrow">Меню игры</span><h2>${H.esc(S.company)}</h2></div><div class="modal-b">
      <div class="field"><label for="renameIn">Название сети</label><div class="row"><input id="renameIn" class="input" style="flex:1" maxlength="40" value="${H.esc(S.company)}"><button class="btn" id="renameOk">Сохранить</button></div></div>
      <p class="hint" style="margin:0">Игра сама сохраняется в этом браузере каждый месяц. Чтобы перенести игру на другое устройство, скопируйте код сохранения и вставьте его там.</p>
      <div class="field"><label for="saveCode">Код сохранения</label><textarea id="saveCode" class="input" rows="3" style="font-family:var(--f-mono);font-size:11px;resize:vertical" placeholder="Вставьте код, чтобы загрузить игру"></textarea></div>
      <div class="row"><button class="btn" id="copyCode">Скопировать код</button><button class="btn" id="loadCode">Загрузить из кода</button></div>
      <div id="newConfirm"></div>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Вернуться в игру</button><button class="btn danger block" id="newGameBtn">Новая игра</button></div>`, { closable: true });
    $('#renameOk').addEventListener('click', () => { S.company = $('#renameIn').value.trim() || S.company; hudCache = ''; save(); toast('Название сохранено', S.company, 'good'); });
    $('#copyCode').addEventListener('click', () => {
      const code = exportCode(); const ta = $('#saveCode'); ta.value = code;
      navigator.clipboard && navigator.clipboard.writeText(code).then(() => toast('Код скопирован', '', 'good'), () => { ta.select(); toast('Выделите и скопируйте код', '', 'warn'); });
      if (!navigator.clipboard) { ta.select(); }
    });
    $('#loadCode').addEventListener('click', () => { try { const st = importCode($('#saveCode').value); continueGame(st); save(); toast('Игра загружена', '', 'good'); } catch (e) { toast('Код не подошёл', 'Проверьте, что он скопирован целиком.', 'bad'); } });
    $('#newGameBtn').addEventListener('click', () => {
      $('#newConfirm').innerHTML = `<div class="confirm">Текущая игра будет удалена. <button class="btn sm danger" id="newYes">Начать заново</button></div>`;
      $('#newYes').addEventListener('click', () => { closeModal(); clearSave(); S = null; startScreen(); });
    });
  }

  /* ---------------- запуск ---------------- */
  function boot(hot) {
    applyTheme(loadTheme());
    shell();
    applyTheme(ui.theme);
    if (hot && hot.state) { continueGame(hot.state); ui.speed = hot.speed != null ? hot.speed : 1; }
    else startScreen();
    requestAnimationFrame(frame);
    if (globalThis.claude && globalThis.claude.hot && globalThis.claude.hot.snapshot) {
      try { globalThis.claude.hot.snapshot(() => (S ? { state: stripState(S), speed: ui.speed } : {})); } catch (e) {}
    }
  }
  BK.App = { boot, get state() { return S; }, ui, ACT, save, setSpeed };
  const h = globalThis.claude && globalThis.claude.hot;
  if (h && h.ready) h.ready(boot); else boot(h && h.data ? h.data : null);
})();
