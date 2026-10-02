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
  const RU_TABS = [['ru', 'Корпорация'], ['rucities', 'Города'], ['rudirs', 'Директора'], ['ruhq', 'Штаб'], ['ruinbox', 'Отчёты'], ['rucmp', 'Сравнение'], ['fin', 'Финансы'], ['log', 'Журнал']]; // вид «карта России»
  const isRuTab = (t) => /^ru/.test(t || '');
  const RU_WIDE = { rudirs: 1, ruinbox: 1, rucmp: 1, ruhq: 1 }; // широкая панель на ПК (таблицы и отчёты)
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
    const data = (BK.Rewind && BK.Rewind.freshJson(S)) || JSON.stringify(stripState(S)); // 1-го числа — строка снимка «Переиграть»
    try { localStorage.setItem(BK.Slots.key(), data); lastSave = performance.now(); } catch (e) {
      // не хватило места — снимки «Переиграть» уступают его сохранению игры (в памяти они остаются)
      if (BK.Rewind && BK.Rewind.freeStorage()) try { localStorage.setItem(BK.Slots.key(), data); lastSave = performance.now(); } catch (e2) { /* без сохранений */ }
    }
    if (BK.Rewind) BK.Rewind.flush(); // снимки «Переиграть» — после сохранения игры
  }
  function stripState(st) { const c = Object.assign({}, st); delete c.cache; c.notify = []; return c; }
  function loadSave() { try { const raw = localStorage.getItem(BK.Slots.key()); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(stripState(S))))); }
  function importCode(code) { const st = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!st || !st.stores || !st.v) throw new Error('bad'); return st; }
  function migrate(st) {
    st.notify = []; st.flags = st.flags || {};
    if (!st.difficulty) st.difficulty = 'normal'; // сохранения до уровней сложности — «Нормальный»
    if (E.wasteState) E.wasteState(st); // списания и вечерняя скидка — значения по умолчанию для старых сохранений
    st.office = Object.assign({ hr: false, academy: false, autohireOn: true, ownerHires: 0, ownerWeek: 0, autotrainOn: true, trainTarget: 3, ownerTrains: 0, ownerTrainWeek: 0 }, st.office || {});
    if (BK.Ach) BK.Ach.ensure(st); // достижения: уже выполненные в старом сохранении начисляются тихо
    if (BK.Miles) BK.Miles.ensure(st); // вехи (живость): старые сохранения получают значения по умолчанию
    if (BK.Thoughts) BK.Thoughts.ensure(st); // мысли гостей недели
    if (BK.Corp) BK.Corp.ensure(st); // Россия: карта активного города; старое сохранение с оборотом ≥ 10 млрд — выход открывается сразу
    return st;
  }

  /* ---------------- каркас ---------------- */
  function shell() {
    document.body.insertAdjacentHTML('afterbegin', `
<div id="app">
  <header class="hud">
    <div class="brand">${LOGO}<div class="brand-tx"><div class="brand-name" id="hud-name"></div><div class="brand-sub">Хлебная карта</div></div></div>
    <div class="clock"><span class="date" id="hud-date"></span>
      <div class="speed" role="group" aria-label="Скорость времени">
        <button data-speed="0" aria-label="Пауза" title="Пауза (пробел)">${ICON.pause}</button>
        <button data-speed="1" aria-label="Скорость 1" title="1 день в секунду">${ICON.p1}</button>
        <button data-speed="3" aria-label="Скорость 3" title="3 дня в секунду">${ICON.p3}</button>
        <button data-speed="10" aria-label="Скорость 10" title="10 дней в секунду">${ICON.p10}</button>
      </div></div>
    <div class="stats">
      <div class="stat s-cash" title="Деньги на расчётном счёте: из них платите аренду, зарплаты и покупки. Изменение — к концу прошлого месяца"><span class="k">Счёт</span><div class="vr"><span class="v" id="hud-cash"></span><span class="spk" id="hud-cash-sp"></span></div><span class="dl" id="hud-cash-d"></span></div>
      <div class="stat s-rev" title="Выручка сети за прошлый полный месяц и изменение к позапрошлому"><span class="k" id="hud-rev-k">Выручка</span><div class="vr"><span class="v" id="hud-rev"></span><span class="spk" id="hud-rev-sp"></span></div><span class="dl" id="hud-rev-d"></span></div>
      <div class="stat s-res" title="Резервный фонд: подушка безопасности, сам закрывает кассовый разрыв и приносит проценты"><span class="k">Резерв</span><div class="vr"><span class="v" id="hud-res"></span></div><span class="dl muted" id="hud-res-d"></span></div>
      <div class="stat s-st"><span class="k">Точки</span><div class="vr"><span class="v" id="hud-stores"></span><span class="moodbar" id="hud-mood"></span></div><span class="dl muted" id="hud-st-d"></span></div>
      <span class="vsep" aria-hidden="true"></span>
      <div class="stat goal" title="Оборот сети за последние 12 месяцев. Цель — 5 млрд ₽"><div class="gr"><span class="k" id="hud-goal-k"><span class="long">К цели · 5 млрд</span><span class="short">Цель 5 млрд</span></span><span class="gp" id="hud-goal-p"></span></div><div class="gr"><span class="v" id="hud-goal"></span><span class="dl muted" id="hud-goal-eta"></span></div><div id="hud-goalbar"></div></div>
    </div>
    <div class="hudbtns">
      <button class="iconbtn" data-act="sound" aria-label="Звук" title="Звук"></button>
      <button class="iconbtn theme" data-act="theme" aria-label="Сменить тему"></button>
      <button class="iconbtn" data-act="help" title="Как играть" aria-label="Как играть">${ICON.help}</button>
      <button class="iconbtn" data-act="settings" title="Меню игры" aria-label="Меню игры">${ICON.gear}</button>
    </div>
  </header>
  <div class="main">
    <div class="mapwrap">
      <svg class="map" id="map" role="img" aria-label="Карта Уфы с точками сети"></svg>
      <div class="mapctl"><button data-act="zoomIn" aria-label="Приблизить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><button data-act="zoomOut" aria-label="Отдалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button><button data-act="zoomReset" aria-label="Весь город"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg></button></div>
      <div class="maptip" hidden></div>
      <div class="setupbanner" id="setupbanner" hidden></div>
    </div>
    <aside class="panel"><button type="button" class="sheet-grip" aria-label="Развернуть панель"><i aria-hidden="true"></i></button><nav class="tabs" role="tablist" id="tabs"></nav><div class="pbody" id="pbody"></div></aside>
  </div>
</div>
<div class="toasts" id="toasts" aria-live="polite"></div>
<div id="coins" aria-hidden="true"></div>
<div id="modal"></div>
<div id="start"></div>`);
    map = new BK.MapView($('#map'), { onClick: mapClick, tipFor });
    map.tip = $('.maptip');
    if (BK.Russia) { BK.Russia.build($('.mapwrap')); BK.Russia.bindSheet($('.panel')); } // шторка панели на экране России (телефон)
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
  // уровни сложности: числа — в CFG.DIFFICULTY, здесь только тексты для игрока
  const DIFF_UI = {
    easy: { cash: '20 млн ₽', win: '~11 лет', desc: 'Вдвое больше денег, гостей чуть больше, неприятности мягче и реже, команда терпеливее, кредит дешевле.' },
    normal: { cash: '10 млн ₽', win: '~15 лет', desc: 'Баланс по задумке: 70% событий — неприятности, кризис раз в 2–3 года.' },
    hard: { cash: '8 млн ₽', win: '19+ лет', desc: 'Меньше денег и гостей, аренда и кредит дороже, кризисы чаще и больнее, текучка жёстче. Победа не гарантирована.' },
  };
  const diffName = (d) => (C.DIFFICULTY && C.DIFFICULTY[d || 'normal'] ? C.DIFFICULTY[d || 'normal'].name : 'Нормальный');
  function diffPicker() {
    return `<fieldset class="diffpick"><legend>Сложность</legend><div class="diffopts">${['easy', 'normal', 'hard'].map((d) => `<label class="diffopt ${d}"><input type="radio" name="difficulty" value="${d}"${d === 'normal' ? ' checked' : ''}><span class="dn">${diffName(d)}</span><span class="dm">${DIFF_UI[d].cash}<br>победа ${DIFF_UI[d].win}</span></label>`).join('')}</div><p class="diffdesc" id="diffDesc" aria-live="polite">${DIFF_UI.normal.desc}</p></fieldset>`;
  }
  function startScreen() {
    if (BK.useCity) BK.useCity(null); // обложка — карта Уфы
    const el = $('#start');
    el.className = 'start';
    el.hidden = false;
    el.innerHTML = `<div class="start-in"><div class="start-top"><span>Тема</span>${themeSeg()}</div><div>
      <h1>Хлебная<br><em>карта</em></h1>
      <p class="lead">Постройте сеть пекарен от первой точки до городского бренда. Стартовый капитал, одно производство — и весь город на карте.</p>
      <div class="rules">
        <div class="r-diff"><b id="ruleCash">10 млн ₽</b>стартовый капитал</div>
        <div><b>5 млрд ₽</b>цель — оборот за 12 месяцев</div>
        <div class="r-diff"><b id="ruleWin">~15 лет</b>на победу у сильного игрока</div>
        <div><b>100+ событий</b>кризисы, конкуренты, проверки</div>
      </div>
      <form id="startForm">${BK.PrologueUI ? BK.PrologueUI.startOpt() : ''}${diffPicker()}<input class="input" id="companyName" maxlength="40" placeholder="Название сети" value="Пекарня «Каравай»" aria-label="Название сети"><button class="btn primary" type="submit">Новая игра</button></form>
      ${BK.Tutorial ? BK.Tutorial.startOpt() : ''}${rivalOpt()}
      ${BK.Slots.startHtml()}
      <details class="codeload"><summary>Есть код сохранения с другого устройства?</summary>
        <textarea id="startCode" class="input" rows="3" placeholder="Вставьте код сохранения"></textarea>
        <button class="btn" type="button" id="startCodeBtn">Загрузить игру</button></details>
    </div><svg class="start-map" viewBox="0 0 1000 1000" aria-hidden="true">${BK.mapStatic({ id: 'sm' })}</svg></div>`;
    $('#start').querySelectorAll('[data-rival]').forEach((b) => b.addEventListener('click', () => $('#start').querySelectorAll('[data-rival]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    const diffSel = () => { const r = $('#startForm input[name=difficulty]:checked'); return r ? r.value : 'normal'; };
    $('#startForm').addEventListener('change', () => { const d = DIFF_UI[diffSel()]; $('#diffDesc').textContent = d.desc; $('#ruleCash').textContent = d.cash; $('#ruleWin').textContent = d.win; });
    BK.Slots.bind(el);
    if (BK.Tutorial) BK.Tutorial.bindStart(el);
    if (BK.PrologueUI) BK.PrologueUI.bindStart(el); // «Как начать»: пролог «Бариста» или сразу своя сеть
    $('#startForm').addEventListener('submit', (e) => { e.preventDefault(); if (BK.Slots.beforeNew()) startNew($('#companyName').value.trim() || 'Пекарня «Каравай»', diffSel()); });
    $('#startCodeBtn').addEventListener('click', () => {
      try { const st = importCode($('#startCode').value); if (!BK.Slots.beforeNew()) return; continueGame(st); save(); toast('Игра загружена', `${st.company}, ${E.fmtDate(st.day)}`, 'good'); } catch (e) { toast('Код не подошёл', 'Проверьте, что он скопирован целиком.', 'bad'); }
    });
  }
  // сеть-соперник: вкл/выкл для новой игры (по умолчанию — CFG.RIVAL_ON)
  const rivalOpt = () => `<div class="rival-opt"><div class="row"><span>Сеть-соперник «${H.esc(BK.CFG.RIVAL_NAME)}»</span><div class="seg" role="group" aria-label="Сеть-соперник"><button type="button" data-rival="1" aria-pressed="${!!BK.CFG.RIVAL_ON}">вкл</button><button type="button" data-rival="0" aria-pressed="${!BK.CFG.RIVAL_ON}">выкл</button></div></div><small>Растёт вместе с вами, занимает хорошие помещения и отбирает гостей у соседних точек. Без неё игра чуть легче.</small></div>`;
  const rivalPicked = () => { const b = document.querySelector('#start [data-rival="1"]'); return b ? b.getAttribute('aria-pressed') === 'true' : BK.CFG.RIVAL_ON; };
  function hideStart() { const el = $('#start'); el.hidden = true; el.innerHTML = ''; $('#toasts').innerHTML = ''; }
  // новая игра со стартового экрана: пролог «Бариста» (src/ui/prologue.js) или сразу своя сеть
  function startNew(name, difficulty) { if (BK.PrologueUI && BK.PrologueUI.picked() === 'prologue') BK.PrologueUI.begin(name, difficulty); else newGame(name, difficulty); }
  function newGame(name, difficulty, opts) {
    if (BK.PrologueUI) BK.PrologueUI.close();
    if (BK.Stage1UI) BK.Stage1UI.close();
    S = E.newGame({ company: name, difficulty, rival: opts && opts.rival != null ? opts.rival : rivalPicked() });
    if (BK.Tutorial) BK.Tutorial.newGame(S); // «Обучение для новичка» со стартового экрана (tutorial.js)
    if (BK.Rewind) BK.Rewind.attach(S, BK.Slots.active); // «Переиграть»: снимки этой игры (rewind.js)
    ui.tab = 'dash'; ui.sel = null; ui.storeId = null; ui.speed = 1; ui.modalQueue = []; cityView();
    openSeen = null; // живость: не считать уже открытые точки «только что открывшимися»
    hideStart(); closeModal(); map.reset(); renderAll(); save();
  }
  function continueGame(st, raw) { // raw — состояние из снимка «Переиграть» (та же версия, без миграции)
    S = raw ? st : migrate(st); if (BK.Rewind) BK.Rewind.attach(S, BK.Slots.active); ui.modalQueue = []; ui.storeId = null; ui.sel = null; hudCache = ''; cityView(); if (isRuTab(ui.tab)) ui.tab = 'dash';
    openSeen = null; // живость: после загрузки не «звенеть» открытием уже открытых точек
    hideStart(); closeModal(); map.reset(); renderAll();
    if (S.lost) ui.modalQueue.push(openLostModal); // сохранение после банкротства: сразу показать итог, а не «замёрзшую» игру
    if (BK.PrologueUI) BK.PrologueUI.resume(); // сохранение посреди пролога — открыть пролог
    if (BK.Stage1UI && !(BK.PrologueUI && BK.PrologueUI.active())) BK.Stage1UI.resume(); // посреди стадии 1 «Своя кофейня» — открыть кофейню
  }

  /* ---------------- цикл ---------------- */
  function setSpeed(v) { ui.speed = v; acc = 0; renderHud(); }
  // живость (§4 п. 3): заметили, что открылась точка или цех, — колокольчик с ленточкой и монетки у счёта
  let openSeen = null;
  function checkOpening() {
    const now = S.stores.filter((st) => st.status !== 'opening').length + S.productions.filter((p) => p.status === 'open').length;
    if (openSeen != null && now > openSeen) {
      if (BK.Sound) BK.Sound.play('ribbon');
      if (BK.LivelyUI) BK.LivelyUI.burst(8);
    }
    openSeen = now;
  }
  function frame(t) {
    requestAnimationFrame(frame);
    if (!S) return;
    const dt = Math.min(250, t - (lastT || t)); lastT = t;
    if (BK.PrologueUI && BK.PrologueUI.active()) return; // идёт пролог — у него свой цикл (src/ui/prologue.js)
    if (BK.Stage1UI && BK.Stage1UI.active()) return; // стадия 1 «Своя кофейня» — свой цикл (src/ui/stage1.js)
    const running = S.phase === 'play' && ui.speed > 0 && !ui.modal && !S.ev.pending && !S.chef.pending && !S.lost;
    if (running) {
      acc += dt;
      const ms = C.SPEEDS[ui.speed] || 1000;
      let n = 0;
      while (acc >= ms && n < 4) {
        acc -= ms; n++;
        E.tick(S);
        if (BK.Rewind) BK.Rewind.record(S); // «Переиграть»: снимок на 1-е число
        checkOpening(); // живость: «дзынь» и монетки, когда открылась точка или цех
        handleNotify();
        if (ui.modal || S.ev.pending || S.chef.pending) { acc = 0; break; }
      }
      if (n) { ui.dirty = true; map.render(S, ui.sel); if (ui.view === 'russia') BK.Russia.render(S); }
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
      else if (n.type === 'event') { toast(n.ev.title, n.ev.text, n.ev.kind === 'pos' ? 'pos' : 'neg', n.ev.effectsText); if (BK.Sound) BK.Sound.play(n.ev.kind === 'pos' ? 'coin' : 'warn'); }
      else if (n.type === 'month') { save(); if (BK.LivelyUI) BK.LivelyUI.monthFx(n.profit); }
      else if (n.type === 'year') ui.modalQueue.push(() => openYearModal(n));
      else if (n.type === 'won') { if (BK.Sound) BK.Sound.play('fanfare'); ui.modalQueue.unshift(() => openWinModal()); }
      else if (n.type === 'lost') { if (BK.Sound) BK.Sound.play('bad'); ui.modalQueue.unshift(() => openLostModal()); }
      else if (n.type === 'ach' && BK.Extras) BK.Extras.achToast(n);
      else if (n.type === 'mile' && BK.LivelyUI) BK.LivelyUI.mileNotify(n);
      else if (n.type === 'coll' && BK.CollUI) BK.CollUI.notify(n);
      else if (n.type === 'inv' && BK.InvUI) BK.InvUI.notify(n);
      else if (n.type === 'corp') ui.modalQueue.push(openCorpModal);
      else if (n.type === 'growth' && BK.GrowthUI) ui.modalQueue.push(() => BK.GrowthUI.unlockModal(n)); // рост вглубь: «Новая возможность»
      else if (n.type === 'fed' || n.type === 'fedLegend') ui.modalQueue.push(() => openModal(BK.CorpUI.fedModal(S, n.type === 'fedLegend'), { closable: true }));
    }
  }

  /* ---------------- HUD ---------------- */
  let hudCache = '', hudParts = {};
  function renderHud() {
    if (!S) return;
    const key = [S.day, Math.round(S.cash / 1000), Math.round(S.reserve / 1000), S.stores.length, ui.speed, S.company, S.history.length, S.won, S.corp ? S.corp.active : '', ui.view].join('|');
    if (key === hudCache) return; hudCache = key;
    const g = H.goalInfo(S), hist = S.history, last = hist[hist.length - 1], prev = hist[hist.length - 2];
    const set = (id, html) => { if (hudParts[id] === html) return; hudParts[id] = html; document.getElementById(id).innerHTML = html; };
    $('#hud-name').textContent = S.company;
    const t = E.dateOf(S.day);
    set('hud-date', `<span class="long">${E.fmtDate(S.day)}</span><span class="short">${t.d} ${E.MONTHS_G[t.m].slice(0, 3)} ${t.y}</span>`);
    // счёт: изменение — к концу прошлого месяца (закрытие к закрытию), линия — остатки на конец месяцев + сейчас
    const cash = $('#hud-cash'); cash.textContent = H.fm(S.cash); cash.classList.toggle('neg', S.cash < 0);
    set('hud-cash-sp', hist.length ? H.spark(hist.slice(-11).map((x) => x.cash).concat([S.cash]), 40, 18) : '');
    set('hud-cash-d', last && prev ? H.delta(last.cash, prev.cash, 'за мес.') : '');
    // выручка прошлого полного месяца
    set('hud-rev-k', last ? `Выручка, ${H.MONL[last.m]}` : 'Выручка с 1-го');
    set('hud-rev', H.fm(last ? last.rev : S.month.rev));
    set('hud-rev-sp', hist.length > 1 ? H.spark(hist.slice(-12).map((x) => x.rev), 40, 18) : '');
    set('hud-rev-d', last && prev ? H.delta(last.rev, prev.rev, 'к ' + H.MON3[prev.m]) : '<span class="delta muted">первый месяц</span>');
    $('#hud-res').textContent = H.fm(S.reserve);
    set('hud-res-d', `${H.pctS(Math.max(0, S.macro.keyRate - C.RESERVE_SPREAD))} годовых`);
    const open = S.stores.filter((s) => s.status !== 'opening').length, soon = S.stores.length - open;
    set('hud-stores', `${open}${soon ? `<small class="soon" title="открываются">+${soon}</small>` : ''}`);
    const mc = H.moodCounts(S), pc = (n) => (mc.total ? n / mc.total * 100 : 0).toFixed(1);
    set('hud-mood', mc.total ? `<i style="width:${pc(mc.happy)}%;background:var(--face-happy)"></i><i style="width:${pc(mc.mid)}%;background:var(--face-mid)"></i><i style="width:${pc(mc.sad)}%;background:var(--face-sad)"></i>` : '');
    $('#hud-mood').title = mc.total ? `Настроение команды: довольны ${mc.happy}, терпят ${mc.mid}, недовольны ${mc.sad}` : '';
    set('hud-st-d', mc.total ? `${Math.round(mc.happy / mc.total * 100)}\u00a0% довольны` : 'команды пока нет');
    // цель: первый акт — 5 млрд по Уфе; во втором акте (2+ города или победа в Уфе) — «Федеральная сеть»
    const fed = BK.CorpUI && BK.CorpUI.fedMode(S), gs = $('.hud .goal');
    gs.classList.toggle('fed', !!fed);
    if (fed) {
      const hg = BK.CorpUI.hudGoal(S);
      set('hud-goal-k', '<span class="long">Цель · Федеральная сеть</span><span class="short">Федеральная сеть</span>');
      set('hud-goal-p', hg.p); $('#hud-goal').textContent = hg.v; set('hud-goal-eta', ''); set('hud-goalbar', hg.bars);
      gs.title = 'Цель второго акта: 10 городов по 10+ точек и оборот сети 40 млрд ₽ за 12 месяцев';
    } else {
      set('hud-goal-k', '<span class="long">К цели · 5 млрд</span><span class="short">Цель 5 млрд</span>');
      set('hud-goal-p', S.won ? 'взята' : g.pctTxt);
      $('#hud-goal').textContent = H.fm(g.rolling);
      set('hud-goal-eta', S.won ? '' : g.etaShort);
      set('hud-goalbar', H.goalBar(g.p));
      gs.title = 'Оборот сети за последние 12 месяцев. Цель — 5 млрд ₽';
    }
    document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === ui.speed)));
    const ban = $('#setupbanner'), cs = E.citySetup && E.citySetup(S), cn = BK.CITY ? H.esc(BK.CITY.name) : '';
    if (S.phase === 'setup_prod') { ban.hidden = false; ban.innerHTML = '<b>Шаг 1 · Производство</b>Выберите помещение под цех — на карте или в списке справа'; }
    else if (S.phase === 'setup_store') { ban.hidden = false; ban.innerHTML = '<b>Шаг 2 · Первая точка</b>Выберите помещение для пекарни — кружки с плюсом на карте'; }
    else if (cs && ui.view !== 'russia') { ban.hidden = false; ban.innerHTML = cs === 'prod' ? `<b>${cn} · шаг 1 · цех</b>Выберите помещение под производство — квадраты на карте` : `<b>${cn} · шаг 2 · первая точка</b>Выберите помещение — кружки с плюсом на карте`; }
    else ban.hidden = true;
  }

  /* ---------------- панель ---------------- */
  // бейджи вкладок: число проблем (штат — «Команда», убыточные/перегруженные точки — «Точки»), точка — «есть что решить»
  function tabDots() {
    if (!S) return {};
    const c = BK.attention(S).counts;
    return { grow: BK.GrowthUI ? BK.GrowthUI.tabDot(S) : 0, dash: c.dash ? 'dot' : 0, team: c.team, stores: c.stores, prod: c.prod ? 'dot' : 0, menu: c.menu ? 'dot' : 0, market: c.market ? 'dot' : 0, fin: c.fin ? 'dot' : 0, ruinbox: BK.Dir && BK.Corp.on(S) ? BK.Dir.inboxOpen(S) : 0 };
  }
  function renderTabs() {
    const dots = tabDots();
    const mark = (k) => { const v = dots[k]; if (!v || ui.tab === k) return ''; return v === 'dot' ? '<span class="dot" aria-hidden="true"></span>' : `<em class="badge" aria-label="проблем: ${v}">${v}</em>`; };
    const list = ui.view === 'russia' ? RU_TABS : BK.GrowthUI ? BK.GrowthUI.tabs(S, TABS) : TABS; // «Рост» — с первым направлением роста вглубь
    const html = list.map(([k, l]) => `<button class="tab" role="tab" data-act="tab" data-arg="${k}" aria-selected="${ui.tab === k}">${l}${mark(k)}</button>`).join('');
    if (html !== ui.tabsHtml) { $('#tabs').innerHTML = html; ui.tabsHtml = html; $('#tabs').classList.toggle('t9', list.length > 8); }
  }
  function renderPanel() {
    if (!S) return;
    ui.dirty = false;
    renderTabs();
    const body = $('#pbody');
    const scroll = body.scrollTop;
    const fn = { dash: P.dash, stores: P.stores, market: P.market, prod: P.production, menu: P.menu, team: P.team, fin: P.finance, log: P.journal, ru: BK.Russia.panel, rucities: BK.Russia.citiesTab, rudirs: BK.CorpUI.dirsTab, ruhq: BK.CorpUI.hqTab, ruinbox: BK.CorpUI.inboxTab, rucmp: BK.CorpUI.cmpTab, grow: BK.GrowthUI ? BK.GrowthUI.panel : P.dash }[ui.tab] || P.dash;
    const wide = ui.view === 'russia' && !!RU_WIDE[ui.tab], main = $('.main');
    if (main.classList.contains('ru-view') !== (ui.view === 'russia')) main.classList.toggle('ru-view', ui.view === 'russia'); // телефон: панель — шторка поверх карты России
    const finWide = ui.tab === 'fin'; // «Финансы» — широкая панель (водопад и таблица точек), чуть уже корпоративных таблиц
    if (main.classList.contains('ru-wide') !== wide || main.classList.contains('fin-wide') !== finWide) { main.classList.toggle('ru-wide', wide); main.classList.toggle('fin-wide', finWide); if (BK.Russia.isOpen()) requestAnimationFrame(() => BK.Russia.render(S, true)); }
    let html;
    if ((S.phase === 'setup_prod' || S.phase === 'setup_store') && ui.tab !== 'log') html = P.dash(S, ui);
    else if (ui.view !== 'russia' && E.citySetup && E.citySetup(S) && ui.tab !== 'log' && ui.tab !== 'fin') html = P.dash(S, ui); // запуск нового города
    else html = fn(S, ui);
    if (html !== ui.lastHtml) {
      // смена вкладки — полная замена; обновление той же вкладки — точечно (morph), чтобы не пересобирать
      // и не перерисовывать весь список из 40–60 карточек каждые 350 мс на скорости ×10
      if (ui.lastTab === ui.tab + '|' + ui.storeId && body.firstChild) morph(body, html);
      else body.innerHTML = html;
      ui.lastHtml = html; ui.lastTab = ui.tab + '|' + ui.storeId; body.scrollTop = scroll;
    }
    if (BK.PixelUI) BK.PixelUI.afterPanel(S); // «живая точка»: смонтировать/обновить пиксельную сцену
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
      if (x.dataset.keep && x.dataset.keep === y.dataset.keep) continue; // узел со своей жизнью (пиксельная сцена) — не трогать
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
    else if (hit.kind === 'offer') { ui.tab = setupNow() ? 'dash' : 'market'; }
    else if (hit.kind === 'prod') ui.tab = 'prod';
    else if (hit.kind === 'prodOffer') ui.tab = setupNow() ? 'dash' : 'market';
    else if (hit.kind === 'hq') ui.tab = 'team';
    else if (/^g(fac|flag|fr|site)$/.test(hit.kind)) ui.tab = 'grow'; // рост вглубь: фабрика, флагман, франчайзи, площадки
    refresh();
    requestAnimationFrame(() => {
      const card = hit.kind === 'offer' ? document.querySelector(`[data-offer="${hit.id}"]`) : document.querySelector('.card.sel');
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      else $('#pbody').scrollTop = 0;
    });
  }
  const setupNow = () => S.phase !== 'play' || !!(E.citySetup && E.citySetup(S)); // старт игры или запуск нового города
  function tipFor(kind, id) {
    if (!S) return '';
    const e = H.esc;
    if (kind === 'store') {
      const st = E.byId(S.stores, id); if (!st) return '';
      const mood = BK.storeMood(st);
      const rt = st.status !== 'opening' && H.rating ? ` · ${H.rating.r1(E.storeRating(S, st))}★` : '';
      return `<b>№${st.num} · ${e(st.address)}</b>${rt}<br>${H.dname(st.district)} · штат ${st.staff.length}/${st.staffTarget}${mood ? ` · настроение: ${mood === 'happy' ? 'довольны' : mood === 'mid' ? 'так себе' : 'недовольны'}` : ''}<br>${st.last ? 'Выручка за месяц ' + H.fm(st.last.rev) : st.status === 'opening' ? 'Открывается' : 'Первый месяц'}${BK.DeliveryUI ? `<br>${BK.DeliveryUI.tipText(st)}${st.agg ? ' · доставка' : ''}` : ''}${BK.TrainersUI ? BK.TrainersUI.tip(S, st) : ''}${BK.CollUI ? BK.CollUI.tip(S, st) : ''}`;
    }
    if (kind === 'offer') {
      const o = E.byId(S.offers, id); if (!o) return '';
      const est = BK.estimateOffer(S, o);
      return `<b>Свободно: ${e(o.address)}</b><br>${H.dname(o.district)} · ${o.area} м² · ${o.landmarks.map(H.lname).join(', ')}<br>Трафик ${H.n0(o.traffic)} · прогноз ≈ ${H.fm(est.rev)}/мес${BK.DeliveryUI ? '<br>' + BK.DeliveryUI.tipText(o) : ''}`;
    }
    if (kind === 'prod') { const p = E.byId(S.productions, id); return p ? `<b>${p.name}</b><br>${e(p.address)}<br>Загрузка ${H.pct(p.load || 0)}` : ''; }
    if (kind === 'prodOffer') { const o = E.byId(S.prodOffers, id); return o ? `<b>Под производство: ${e(o.address)}</b><br>${H.dname(o.district)} · ${o.area} м² · ${H.fm(o.area * o.rentM2)}/мес` : ''; }
    if (kind === 'hq') return `<b>Офис компании</b><br>Найм, обучение, культура`;
    if (BK.GrowthUI && /^g(fac|flag|fr|site)$/.test(kind)) return BK.GrowthUI.tip(S, kind, id);
    if (kind === 'rival') { const R = E.rivalSummary && E.rivalSummary(S), o = R && R.stores.find((x) => x.id === id); return o ? `<b>«${e(R.name)}» — конкурент</b><br>${e(o.address)} · ${H.dname(o.district)}<br>Забирает часть гостей у ваших точек ближе ~0,9 км` : ''; }
    return '';
  }

  /* ---------------- действия ---------------- */
  function res(r, okMsg) {
    if (r && r.ok === false && r.msg) { if (BK.Sound) BK.Sound.play('deny'); toast('Не получилось', r.msg, 'warn'); } // звук: неудача действия — мягкий низкий тон
    else if (okMsg) { if (BK.Sound) BK.Sound.play('tap'); toast(okMsg, '', 'good'); } // звук: удачное действие кнопки
    refresh();
  }
  const ACT = {
    tab: (d) => { ui.tab = d.arg; if (d.arg !== 'stores') ui.storeId = null; ui.confirmFire = ui.confirmClose = null; $('#pbody').scrollTop = 0; refresh(); },
    openStore: (d) => { ui.tab = 'stores'; ui.storeId = d.arg; ui.sel = { kind: 'store', id: d.arg }; const st = E.byId(S.stores, d.arg); if (st) map.focus(st.x, st.y); $('#pbody').scrollTop = 0; refresh(); },
    closeStoreView: () => { ui.storeId = null; ui.sel = null; refresh(); },
    storeSort: (d) => { ui.storeSort = d.arg; refresh(); },
    finPeriod: (d) => { ui.finPeriod = d.arg; refresh(); },
    finFilter: (d) => { ui.finFilter = d.arg; refresh(); },
    finSort: (d) => { const def = (k) => (k === 'profit' || k === 'margin' || k === 'rating' ? 1 : -1); if ((ui.finSort || 'profit') === d.arg) ui.finDir = -(ui.finDir || def(d.arg)); else { ui.finSort = d.arg; ui.finDir = def(d.arg); } refresh(); },
    logFilter: (d) => { ui.logFilter = d.arg; refresh(); },
    focusOffer: (d) => { const o = E.byId(S.offers, d.arg); if (o) { ui.sel = { kind: 'offer', id: o.id }; map.focus(o.x, o.y); refresh(); } },
    focusProdOffer: (d) => { const o = E.byId(S.prodOffers, d.arg); if (o) { ui.sel = { kind: 'prodOffer', id: o.id }; map.focus(o.x, o.y); refresh(); } },
    rent: (d) => {
      const r = E.rentStore(S, d.arg);
      if (r.ok) { ui.sel = { kind: 'store', id: r.store.id }; toast('Помещение арендовано', `${r.store.address}. Открытие через ${C.OPEN_DAYS} дн.`, 'good'); if (S.phase === 'play' && S.stores.length === 1 && !S.corp) { ui.tab = 'dash'; if (!(BK.Tutorial && BK.Tutorial.active(S))) ui.modalQueue.push(openTutorialModal); } else if (S.corp && S.stores.length === 1) ui.tab = 'dash'; }
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
    continue: (d) => { if (d && d.arg) BK.Slots.setActive(+d.arg); const st = loadSave(); if (st) continueGame(st); },
    achievements: () => BK.Extras.openAchievements(), summary: () => BK.Extras.openSummary(),
    rewindLost: () => { if (S.lost) openLostModal(); }, // «Переиграть» из итогов после банкротства (rewind-ui.js)
    closeModal: () => closeModal(),
    attAll: () => { ui.attAll = !ui.attAll; refresh(); },
    // второй акт: карта России, выбор города, вход и переезд между городами
    russia: () => { if (ui.view === 'russia') cityView(true); else openRussia(); },
    ruBack: () => cityView(true),
    ruSel: (d) => { ui.ruSel = d.arg; BK.Russia.select(d.arg); BK.Russia.sheetShow(); if (ui.tab !== 'ru' && ui.tab !== 'rucities') ui.tab = 'ru'; BK.Russia.render(S, true); refresh(); },
    ruZoom: (d) => BK.Russia.zoom(d.arg),
    ruLayer: (d) => BK.Russia.setLayer(d.arg), // слои карты России (Р4 ч. 2)
    ruEnter: (d) => openEnterModal(d.arg),
    ruGo: (d) => openGoModal(d.arg),
    // директора (этап Р2)
    ruHireFor: (d) => openHireModal({ cityId: d.arg }),
    hireDir: (d) => openHireModal({ candId: d.arg }),
    ruDir: (d) => { const was = ui.tab === 'rudirs' && ui.dirSel === d.arg; ui.tab = 'rudirs'; ui.dirSel = was ? null : d.arg; ui.confirmDirFire = null; refresh(); if (!was) requestAnimationFrame(() => { const el = document.querySelector('.drowc.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }); },
    ruRep: (d) => { ui.tab = 'ruinbox'; ui.repOpen = d.arg; ui.repFilter = 'all'; refresh(); requestAnimationFrame(() => { const el = document.getElementById('rep-' + d.arg); if (el) el.scrollIntoView({ block: 'start' }); }); },
    dirPay: (d) => res(E.dirSalary(S, d.arg, +d.arg2)),
    askDirFire: (d) => { ui.confirmDirFire = d.arg; refresh(); },
    dirFire: (d) => { ui.confirmDirFire = null; ui.dirSel = null; res(E.dirFire(S, d.arg)); },
    dirRefresh: () => res(E.dirRefresh(S, true), 'Кадровое агентство прислало новых кандидатов'),
    repAns: (d) => { const [i, ch] = String(d.arg2).split(':'); res(E.dirAnswer(S, d.arg, +i, ch)); },
    repPraise: (d) => res(E.dirPraise(S, d.arg), 'Директор отмечен: лояльность +2'),
    repAward: (d) => res(E.dirAward(S, d.arg, d.arg2), 'Директор года выбран'),
    repFilter: (d) => { ui.repFilter = d.arg; refresh(); },
    cmpF: (d) => { ui.cmpF = d.arg; refresh(); },
    cmpSort: (d) => { ui.cmpSort = d.arg; refresh(); },
    ruPrio: (d) => res(E.citySetPriority(S, d.arg, d.arg2)),
    ruBudget: (d) => {
      const c = S.corp.cities[d.arg]; if (!c) return; const b = c.budget, a = d.arg2, pl = S.macro.priceLevel;
      const step = Math.max(5e6 * pl, b.capex * 0.1);
      if (a === 'capex+') E.citySetBudget(S, d.arg, { capex: b.capex + step });
      else if (a === 'capex-') E.citySetBudget(S, d.arg, { capex: Math.max(0, b.capex - step) });
      else if (a === 'pay+' || a === 'pay-') E.citySetBudget(S, d.arg, { pay: Math.round(((c.payK || 1) + (a === 'pay+' ? 0.01 : -0.01)) * 100) / 100 });
      else if (a === 'train+' || a === 'train-') E.citySetBudget(S, d.arg, { train: b.train + (a === 'train+' ? 1 : -1) });
      else if (a === 'open1' || a === 'open0') E.citySetBudget(S, d.arg, { open: a === 'open1' });
      else if (a === 'close1' || a === 'close0') E.citySetBudget(S, d.arg, { close: a === 'close1' });
      refresh();
    },
    // корпорация (этап Р3): штаб, университет, мотивация, аудит
    hqOpen: (d) => { const r = E.hqOpen(S, d.arg); res(r, r.ok ? `${(BK.CORP_HQ[d.arg] || {}).name}: ${BK.HQ.lvlOf(S, d.arg) > 1 ? 'уровень ' + BK.HQ.lvlOf(S, d.arg) : 'открыт'}` : null); if (BK.Russia.isOpen()) BK.Russia.render(S, true); },
    hqCampaign: () => res(E.hqCampaign(S), '«Федеральная реклама» запущена'),
    uniEvening: (d) => { ui.uniEvening = d.arg === '1'; refresh(); },
    uniEnroll: (d) => { const [pr, ev] = String(d.arg2).split(':'); const r = E.uniEnroll(S, d.arg, pr, ev === 'e'); res(r, r.ok ? 'Директор записан на программу' : null); },
    dirKpi: (d) => res(E.dirKpi(S, d.arg, { toggle: d.arg2 })),
    dirBonus: (d) => { const x = BK.Dir.dirById(S, d.arg); if (x) res(E.dirKpi(S, d.arg, { bonus: x.kpi.bonus + (+d.arg2) })); },
    dirShare: (d) => { const x = BK.Dir.dirById(S, d.arg); if (x) res(E.dirCityShare(S, d.arg, ((x.opt && x.opt.city) || 0) + (+d.arg2))); },
    dirOption: (d) => { const r = E.dirOption(S, d.arg, 0.003); res(r, r.ok ? `Опцион выдан: ≈ ${H.fm(r.value)} за 3 года` : null); },
    dirBoard: (d) => res(E.dirBoard(S, d.arg, d.arg2 === '1')),
    dirPromote: (d) => res(E.dirPromote(S, d.arg), 'Региональный директор'),
    dirRegion: (d) => { const r = E.dirRegion(S, d.arg, d.arg2); res(r, r.ok ? 'Город добавлен в кластер' : null); BK.Russia.render(S, true); },
    ruAudit: (d) => { const r = E.cityAudit(S, d.arg); res(r, r.ok ? (r.found.length ? 'Аудит нашёл нарушения — решение во «Отчётах»' : 'Аудит: касса и отчёты сходятся') : null); if (r.ok && r.found.length) { ui.tab = 'ruinbox'; ui.repFilter = 'need'; refresh(); } },
    caughtDecide: (d) => res(E.caughtDecide(S, d.arg, d.arg2), 'Решение принято'),
    candCheck: (d) => { const r = E.candCheck(S, d.arg); res(r, r.ok ? (r.found.length ? `Проверка: ${r.found.map((t) => (BK.DIRECTOR_TRAITS[t] || {}).name).join(', ')}` : 'Проверка: нарушений не найдено') : null); },
    aggNet: (d) => { const on = d.arg === '1', r = E.setAggNetwork(S, on); res(r, r.ok ? (on ? `Сеть в агрегаторах доставки: ${E.aggConnected(S)} точек` : 'Сеть отключена от агрегаторов') : null); }, // доставка (delivery.js)
    aggStore: (d) => { const on = d.arg2 === '1', r = E.setAggStore(S, d.arg, on); res(r, r.ok ? (on ? 'Точка подключена к доставке' : 'Доставка на точке отключена') : null); },
    eveDisc: (d) => { const r = E.setEveDiscount(S, +d.arg); if (r.penalty) toast('Гости раздражены сменой скидки', `Рейтинг точек −${String(C.DISC_PENALTY_RATING).replace('.', ',')}★ на месяц.`, 'warn'); refresh(); },
  };
  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = ACT[t.dataset.act];
    if (fn && S || t.dataset.act === 'continue' || t.dataset.act === 'closeModal' || t.dataset.act === 'theme') { e.preventDefault(); if (fn) fn(t.dataset); if (BK.Sound) BK.Sound.tap(t.dataset.act); } // звук: отклик кнопки-действия и вкладки
  }
  function onInput(e) {
    const t = e.target; if (!t.dataset || !t.dataset.inp || !S) return;
    if (t.dataset.inp === 'alloc') {
      const a = Object.assign({}, S.alloc); a[t.dataset.arg] = +t.value / 100; E.setAlloc(S, a);
      const lab = t.closest('.field'); if (lab) { lab.querySelector('b').textContent = H.pct(S.alloc[t.dataset.arg]); lab.querySelector('.val').textContent = H.pct(S.alloc[t.dataset.arg]); }
      ui.dragging = e.type === 'input';
      if (e.type === 'change') { ui.dragging = false; refresh(); }
    } else if (t.dataset.inp === 'hireStore') { ui.hireStore = t.value; refresh(); }
    else if (t.dataset.inp === 'dirAssign' && e.type === 'change') { const r = E.dirAssign(S, t.dataset.arg, t.value || null); res(r, r.ok ? (t.value ? `Директор назначен: ${BK.CITY_BY_ID[t.value].name}` : 'Директор в резерве') : null); BK.Russia.render(S, true); }
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
    if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && BK.Corp && BK.Corp.on(S)) ACT.russia();
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

  /* ---------- значки последствий вариантов события (только оценка для игрока по описанию эффектов; движок не трогаем) ---------- */
  const FX_IC = {
    rub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20V4h5.5a4 4 0 0 1 0 8H6M6 16h8"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 13.9c2.4.2 4 1.7 4.5 4.6"/></svg>',
    guests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14l-1.2 9.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    prod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M3 20V11l5-3v3l5-3v3l5-3V4h3v16z"/></svg>',
    dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/><path d="M12 14l-1.2 3 1.2 1.5 1.2-1.5z"/></svg>',
    risk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
  };
  BK.FX_IC = FX_IC; // значки последствий — и в карточках управляющих (managers-ui.js)
  // ось: [подпись, порог «заметно», порог «сильно», порог «очень сильно»]; первые три показываются всегда
  const FX_AX = { rub: ['', 0.3, 5, 20], team: ['Команда', 1, 12, 25], guests: ['Гости', 1, 15, 50], check: ['Чек', 1, 15, 50], prod: ['Цех', 1, 10, 40], dir: ['Директор', 1, 12, 25] };
  const FX_NAME = { rub: 'Деньги', team: 'Команда', guests: 'Гости', check: 'Средний чек', prod: 'Цех', dir: 'Директор' };
  function choiceFx(S, ev, i) {
    const src = (ev.corp ? BK.CORP_EVENTS : BK.EVENTS) || [];
    const def = src.find((x) => x.id === ev.id), ch = def && def.choices && def.choices[i];
    const v = { rub: 0, team: 0, guests: 0, check: 0, prod: 0, dir: 0 }; let risk = false;
    const R = Math.max(S.lastMonthRev || 0, 1e6), pl = (S.macro && S.macro.priceLevel) || 1;
    const scope = ev.tg && ev.tg.scope;
    const nSt = scope === 'store' ? 1 : Math.max(1, S.stores.filter((s) => s.status !== 'opening' && (scope !== 'district' || s.district === ev.tg.target)).length);
    const mo = (d) => Math.min(d || 365, 365) / 30;
    const walk = (list) => { for (const f of list || []) {
      const m = f.m != null ? f.m - 1 : 0;
      switch (f.t) {
        case 'cash': v.rub += f.v ? f.v * pl / R * 100 : f.perStore ? f.perStore * pl * nSt / R * 100 : f.revPct ? f.revPct * 100 : 0; break;
        case 'tax': v.rub -= f.add * 100 * mo(f.d); break;
        case 'foodcost': v.rub -= m * 30 * mo(f.d); break;
        case 'delivery': v.rub -= m * 5 * mo(f.d); break;
        case 'rent': v.rub -= m * 144; break;
        case 'salary': v.rub -= m * 300; v.team -= m * 300; break;
        case 'lostSales': v.rub -= (f.days || 1) / 30 * 100; break;
        case 'sellEquity': v.rub += 30; break;
        case 'creditLimit': v.rub += 3; break;
        case 'buyChain': v.guests += 50; v.team -= 12; break;
        case 'traffic': case 'conv': case 'competitor': v.guests += m * 100 * mo(f.d); break;
        case 'close': v.guests -= 100 * (f.d || 7) / 30; break;
        case 'awareness': v.guests += f.add * 600; break;
        case 'pressure': v.guests -= f.add * 60; break;
        case 'trend': v.guests += (f.add || 0) / 2; break;
        case 'check': v.check += m * 100 * mo(f.d); break;
        case 'capacity': v.prod += m * 100 * (f.d || 14) / 30; break;
        case 'loyalty': v.team += f.add * 1.5; break;
        case 'staffQuit': v.team -= 6 * (f.n || 1); break;
        case 'staffTrain': v.team += 5 * (f.n || 1); break;
        case 'dirLoyalty': v.dir += f.add * 1.5; break;
        case 'dirSkill': v.dir += f.add; break;
        case 'dirLeave': case 'dirFire': v.dir -= 30; break;
        case 'dirAbsent': v.dir -= (f.d || 30) / 3; break;
        case 'dirPromote': case 'dirTrait': v.dir += 15; break;
        case 'dirOptions': case 'dirSalary': v.dir += 10; v.rub -= 1; break;
        case 'chance': risk = true; break;
        default: break; // schedule (скрытые последствия), offer, audit, reveal — не показываем
      }
    } };
    if (ch) walk(ch.effects);
    const cost = ev.choices[i].cost || 0;
    if (cost > 0) v.rub -= Math.max(cost / R * 100, FX_AX.rub[1]);
    const lvl = (k) => { const a = Math.abs(v[k]), t = FX_AX[k]; return a < t[1] ? 0 : a < t[2] ? 1 : a < t[3] ? 2 : 3; };
    const out = [];
    for (const k of ['rub', 'team', 'guests', 'check', 'prod', 'dir']) {
      const n = lvl(k); if (!n && !['rub', 'team', 'guests'].includes(k)) continue;
      const up = v[k] > 0, cls = !n ? 'zero' : up ? 'up' : 'dn';
      const ar = n ? (up ? '▲' : '▼').repeat(n) : '·';
      const tip = FX_NAME[k] + (n ? `: ${up ? 'лучше' : 'хуже'}${n > 1 ? (n > 2 ? ', очень сильно' : ', заметно') : ''}` : ': без изменений');
      out.push(`<span class="fxc ${cls}" title="${tip}">${FX_IC[k]}${FX_AX[k][0] ? `<span class="fxn">${FX_AX[k][0]}</span>` : ''}<span class="ar" aria-label="${tip}">${ar}</span></span>`);
    }
    if (risk) out.push(`<span class="fxc risk" title="Исход не гарантирован">${FX_IC.risk}<span class="fxn">Риск</span></span>`);
    return out.join('');
  }

  function openEventModal() {
    const ev = S.ev.pending;
    const eyebrow = ev.crisis ? '<span class="eyebrow crisis">Экономический кризис</span>' : `<span class="eyebrow ${ev.kind}">${ev.corp ? 'Корпорация' : ev.kind === 'pos' ? 'Хорошие новости' : 'Событие'}${ev.corp && ev.kind === 'pos' ? ' · хорошие новости' : ''} · ${E.fmtDate(ev.day)}</span>`;
    let html = `<div class="modal-h evh ${ev.crisis ? 'crisis' : ev.kind}">${eyebrow}<h2>${H.esc(ev.title)}</h2></div><div class="modal-b"><p style="margin:0">${H.esc(ev.text)}</p>`;
    if (ev.effectsText && ev.effectsText.length) html += `<div class="effects">${ev.effectsText.map((t) => `<span class="chip ${ev.kind === 'pos' ? 'good' : 'bad'}">${H.esc(t)}</span>`).join('')}</div>`;
    html += `</div><div class="modal-f">`;
    if (ev.choices) {
      // бесплатный вариант доступен всегда (даже при минусе на счёте), иначе игрок застревает в окне;
      // если по деньгам не проходит ничего — открыт самый дешёвый вариант (уйдёт в минус, как и прочие платежи)
      const afford = (c) => !c.dis && (!c.cost || c.cost <= S.cash + S.reserve); // c.dis — корпоративный выбор без нужного отдела штаба / грейда
      const cheapest = ev.choices.some(afford) ? -1 : ev.choices.reduce((b, c, i) => (!c.dis && (ev.choices[b].dis || c.cost < ev.choices[b].cost) ? i : b), 0);
      const LET = 'АБВГДЕЖЗ';
      html += `<div class="chq"><h4>Как ответим?</h4><span>▲ — лучше, ▼ — хуже, число стрелок — сила</span></div>`;
      ev.choices.forEach((c, i) => {
        const can = afford(c) || i === cheapest;
        const why = c.dis ? `Недоступно: ${H.esc(c.dis)}` : !can ? `Недоступно: не хватает ${H.fm(c.cost - S.cash - S.reserve)} (на счёте и в резерве ${H.fm(Math.max(0, S.cash + S.reserve))})` : '';
        let fx = ''; try { fx = choiceFx(S, ev, i); } catch (e) { fx = ''; }
        html += `<button class="choice" data-choice="${i}"${can ? '' : ' disabled'}${c.dis ? ` title="${H.esc(c.dis)}"` : ''}><span class="cl">${LET[i] || i + 1}</span><b>${H.esc(c.label)}</b><span class="cd">${H.esc(c.desc || '')}</span><span class="cc">${c.cost ? H.fm(c.cost) : 'бесплатно'}${c.cost ? '<small>сразу</small>' : ''}</span>${why ? `<span class="cwhy">${FX_IC.risk}${why}</span>` : ''}${fx ? `<span class="fx">${fx}</span>` : ''}</button>`;
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
    const draw = () => {
      openModal(BK.MenuStats.chefHtml(S, pick, drop), { keepScroll: true }); // разметка и статистика продуктов — ui/menu-stats.js
      $('#modal .modal').classList.add('wide', 'chefwide');
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
      <div class="kpi wide"><span class="k">До цели (оборот 12 мес)</span><span class="v">${H.pct(E.rolling12(S) / C.WIN_ANNUAL_REVENUE, 1)}</span>${H.goalBar(E.rolling12(S) / C.WIN_ANNUAL_REVENUE)}</div></div>
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
      <p style="margin:0">${qname(S.company)} стала хлебной картой Уфы. Вы дошли до цели за <b>${years}</b> на уровне «${diffName(S.difficulty)}», открыв ${ufaStoresText()}.</p>
      <div class="kpis"><div class="kpi"><span class="k">Выручка за всё время</span><span class="v">${H.fm(S.cumRevenue)}</span></div><div class="kpi"><span class="k">Команда</span><span class="v">${E.allStaff(S) + E.bakersTotal(S)}</span></div><div class="kpi"><span class="k">Нанято / ушло</span><span class="v">${S.stats.hires} / ${S.stats.quits}</span></div><div class="kpi"><span class="k">Событий пережито</span><span class="v">${S.stats.eventsSeen}</span></div></div>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button><button class="btn block" data-act="summary">Итоги игры</button><button class="btn block" id="newAfter">Новая игра</button></div>`);
    $('#newAfter').addEventListener('click', toStart);
  }
  function ufaStoresText() { // в Уфе (после выхода в Россию активным может быть другой город)
    const u = S.corp && BK.Corp ? BK.Corp.cityStats(S, 'ufa') : null;
    return u && !u.active ? `${H.nw(u.stores, 'точку', 'точки', 'точек')} и ${H.nw(u.prods, 'производство', 'производства', 'производств')}` : `${H.nw(S.stores.length, 'точку', 'точки', 'точек')} и ${H.nw(S.productions.length, 'производство', 'производства', 'производств')}`;
  }
  /* ---------------- второй акт: Россия ---------------- */
  function openCorpModal() {
    const d = E.dateOf(S.day), dt = `${String(d.d).padStart(2, '0')}.${String(d.m + 1).padStart(2, '0')}.${d.y}`;
    openModal(`<div class="modal-h ru-mh"><div class="stamp ru-stamp" aria-hidden="true"><div class="in"><b>РОССИЯ</b><small>${dt} · лист 2</small></div></div><span class="eyebrow pos">Второй акт</span><h2>Сеть переросла город</h2></div><div class="modal-b">
      <p style="margin:0">За всё время сеть собрала <b>${H.fm(S.cumRevenue)}</b> выручки — в Уфе ей стало тесно. Открыт выход в Россию: ${BK.CITIES.length - 1} городов — от Стерлитамака до Новосибирска.</p>
      <ul class="ru-list"><li><b>Новый город</b> начинается как Уфа: регистрация, свой цех и первые точки.</li><li><b>Подробно считается один город</b> — тот, где вы сейчас. Остальные ведут <b>директора</b>: нанимайте их во вкладке «Директора», задавайте бюджет и приоритет, отвечайте на отчёты.</li><li><b>Цель второго акта</b> — «Федеральная сеть»: 10 городов по 10+ точек и 40 млрд ₽ оборота за 12 месяцев.</li><li><b>Цель первого акта</b> не меняется: 5 млрд за 12 месяцев — по обороту Уфы.</li><li>Москва и Петербург откроются, когда в сети будет ${C.CORP.BIG_MIN_CITIES} города.</li></ul>
      </div><div class="modal-f"><button class="btn primary block" id="ruOpen">Открыть карту России</button><button class="btn block" data-act="closeModal">Позже</button></div>`, { closable: true });
    $('#ruOpen').addEventListener('click', () => { closeModal(); openRussia(); });
  }
  function openRussia() {
    if (!S || !BK.Corp || !BK.Corp.on(S)) return;
    const wrap = $('.mapwrap');
    if (ui.view !== 'russia') { ui.prevTab = ui.tab; ui.view = 'russia'; ui.tab = 'ru'; ui.ruSel = S.corp.active; BK.Russia.select(ui.ruSel); }
    if (map.tip) map.tip.hidden = true;
    BK.Russia.open(S, wrap, $('#map'));
    hudCache = ''; refresh();
  }
  function cityView(anim) { // вернуться к карте активного города
    const was = ui.view === 'russia';
    ui.view = 'city';
    if (isRuTab(ui.tab)) ui.tab = ui.prevTab && !isRuTab(ui.prevTab) ? ui.prevTab : 'dash';
    const mn = $('.main'); if (mn) mn.classList.remove('ru-wide', 'fin-wide', 'ru-view');
    const wrap = $('.mapwrap'); if (!wrap || !BK.Russia) return;
    if (!anim || !was) { if (BK.Russia.isOpen()) { const r = wrap.querySelector('.rumap'); if (r) r.hidden = true; wrap.classList.remove('ru-on'); } $('#map').style.visibility = ''; }
    else BK.Russia.close(S, wrap, $('#map'));
    if (S) { hudCache = ''; refresh(); }
  }
  function enterText(id) {
    const d = BK.CITY_BY_ID[id], cur = BK.CITY_BY_ID[S.corp.active];
    return `Вы переедете ${H.esc(d.in)} и будете вести город сами. ${H.esc(cur.name)} перейдёт на автопилот: точки работают, но новых не будет, найм медленный, обучения нет, рейтинг сползает к 3,5★.`;
  }
  function openEnterModal(id) {
    const d = BK.CITY_BY_ID[id], cost = E.enterCost(S, id), lock = E.enterLock(S, id);
    if (lock) { toast('Пока нельзя', lock, 'warn'); return; }
    openModal(`<div class="modal-h"><span class="eyebrow">Новый город</span><h2>Открыть ${H.esc(d.name)}?</h2></div><div class="modal-b">
      <p style="margin:0">Регистрация, разрешения и стартовый маркетинг — <b>${H.fm(cost)}</b>. Дальше — как в начале игры: цех и первые точки из своих денег. Стартовая узнаваемость бренда — ${Math.round(BK.Corp.awStart(S, id) * 100)} %.</p>
      ${BK.CorpUI ? BK.CorpUI.enterChoices(S, id) : `<p class="hint" style="margin:0">${enterText(id)}</p>`}</div>
      <div class="modal-f"><button class="btn primary block" id="ruEnterOk"${S.cash < cost ? ' disabled' : ''}>Открыть город <span class="cost">${H.fm(cost)}</span></button><button class="btn block" data-act="closeModal">Отмена</button></div>`, { closable: true });
    $('#ruEnterOk').addEventListener('click', () => {
      const w = $('#modal input[name="who"]:checked'), who = w ? w.value : '';
      let dirId = null;
      if (who.startsWith('d:')) dirId = who.slice(2);
      else if (who.startsWith('c:')) { const h = E.dirHire(S, who.slice(2), null); if (!h.ok) { toast('Не получилось', h.msg, 'warn'); return; } dirId = h.d.id; }
      const sp = $('#modal input[name="supply"]:checked'), supply = sp && sp.value !== 'own' ? sp.value : null; // Р4: выпечка из другого города
      const r = dirId || supply ? E.enterCity(S, id, { director: dirId, supply }) : E.enterCity(S, id); closeModal();
      if (!r.ok) { toast('Не получилось', r.msg, 'warn'); return; }
      if (dirId) { ui.ruSel = id; BK.Russia.select(id); BK.Russia.render(S, true); refresh(); toast(`${d.name}: запуск начался`, `Директор откроет цех и ${H.nw(r.opened || 0, 'точку', 'точки', 'точек')}. Отчёт — 1-го числа.`, 'good'); }
      else { afterSwitch(); toast(`${d.name}: вход открыт`, supply ? 'Выпечку повезут из другого города — выберите первую точку.' : 'Выберите помещение под цех.', 'good'); }
      save();
    });
  }
  function openHireModal(o) {
    const html = BK.CorpUI.hireModal(S, o); if (!html) return;
    openModal(html, { closable: true });
    const done = (r, msg) => { closeModal(); if (!r.ok) { toast('Не получилось', r.msg || '', 'warn'); return; } toast(msg, '', 'good'); BK.Russia.render(S, true); save(); };
    $('#modal').querySelectorAll('[data-hire]').forEach((b) => b.addEventListener('click', () => { const r = E.dirHire(S, o.candId, b.dataset.hire || null); done(r, r.ok ? `${r.d.name} — ${b.dataset.hire ? 'директор: ' + BK.CITY_BY_ID[b.dataset.hire].name : 'в резерве'}` : ''); }));
    $('#modal').querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => done(E.dirAssign(S, b.dataset.assign, o.cityId), `Директор назначен: ${BK.CITY_BY_ID[o.cityId].name}`)));
    $('#modal').querySelectorAll('[data-cand]').forEach((b) => b.addEventListener('click', () => { const r = E.dirHire(S, b.dataset.cand, o.cityId); done(r, r.ok ? `${r.d.name} — директор: ${BK.CITY_BY_ID[o.cityId].name}` : ''); }));
  }
  function openGoModal(id) {
    const d = BK.CITY_BY_ID[id], cur = BK.CITY_BY_ID[S.corp.active];
    openModal(`<div class="modal-h"><span class="eyebrow">Переезд</span><h2>Зайти ${H.esc(d.in)}?</h2></div><div class="modal-b"><p style="margin:0">Вы берёте управление ${H.esc(d.in)} на себя: люди, цены и новые точки — снова в ваших руках. Команды восстановятся по уровням, но имена будут новые: без вас вы не знали людей лично.</p>
      <p class="hint" style="margin:0">${S.corp.cities[S.corp.active].directorId ? `${H.esc(cur.name)} останется директору — он будет вести город и присылать отчёты.` : `${H.esc(cur.name)} без директора перейдёт на автопилот: точки работают, но новых не будет, найм медленный, обучения нет, рейтинг сползает к 3,5★.`}${S.corp.cities[id].directorId ? ` Директор ${H.esc(d.in)} станет вашим заместителем.` : ''}</p></div>
      <div class="modal-f"><button class="btn primary block" id="ruGoOk">Зайти</button><button class="btn block" data-act="closeModal">Отмена</button></div>`, { closable: true });
    $('#ruGoOk').addEventListener('click', () => { const r = E.switchCity(S, id); closeModal(); if (!r.ok) { toast('Не получилось', r.msg, 'warn'); return; } afterSwitch(); save(); });
  }
  function afterSwitch() { // новый активный город: карта, панель, анимация «приближение»
    ui.sel = null; ui.storeId = null; ui.ruSel = S.corp.active; BK.Russia.select(ui.ruSel); ui.prevTab = 'dash';
    map.reset(); map.render(S, null);
    if (ui.view === 'russia') { BK.Russia.render(S, true); requestAnimationFrame(() => cityView(true)); }
    else { ui.tab = 'dash'; refresh(); }
  }
  function openLostModal() {
    openModal(`<div class="modal-h"><span class="eyebrow neg">Банкротство</span><h2>Сеть не смогла расплатиться с долгами</h2></div><div class="modal-b">
      <p style="margin:0">${H.nw(C.BANKRUPT_MONTHS, 'месячный расчёт', 'месячных расчёта', 'месячных расчётов')} подряд счёт был в минусе, а резервный фонд пуст. Вы продержались ${yearsText(S.day)}, максимум точек в сети — ${Math.max(S.stats.peakStores, S.stores.length)}.</p>
      <p class="hint" style="margin:0">Совет: держите в резерве 2–3 месячных расхода, не открывайте точки на последние деньги и следите за загрузкой производства.</p>
      ${BK.RewindUI ? BK.RewindUI.blockHtml(S, true) : ''}</div><div class="modal-f"><button class="btn${BK.Rewind && BK.Rewind.can(S) ? '' : ' primary'} block" id="newAfter">Начать заново</button><button class="btn block" data-act="summary">Итоги игры</button></div>`);
    $('#newAfter').addEventListener('click', toStart);
    if (BK.RewindUI) BK.RewindUI.bind($('#modal'), true);
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
      <div class="row sp settings-top"><div class="field"><span class="flabel">Тема оформления</span>${themeSeg()}</div><button class="btn" data-act="help">Как играть</button></div>
      <div class="field"><label for="renameIn">Название сети</label><div class="row"><input id="renameIn" class="input" style="flex:1" maxlength="40" value="${H.esc(S.company)}"><button class="btn" id="renameOk">Сохранить</button></div></div>
      <div class="row sp"><span>Уровень сложности</span><b class="diffbadge ${S.difficulty || 'normal'}">${diffName(S.difficulty)}</b></div>
      ${BK.Extras ? BK.Extras.settingsHtml(S) : ''}
      ${BK.Tutorial ? BK.Tutorial.settingsHtml(S) : ''}
      ${BK.RewindUI ? BK.RewindUI.blockHtml(S, false) : ''}
      <p class="hint" style="margin:0">Игра сама сохраняется в этом браузере каждый месяц. Чтобы перенести игру на другое устройство, скопируйте код сохранения и вставьте его там.</p>
      <div class="field"><label for="saveCode">Код сохранения</label><textarea id="saveCode" class="input" rows="3" style="font-family:var(--f-mono);font-size:11px;resize:vertical" placeholder="Вставьте код, чтобы загрузить игру"></textarea></div>
      <div class="row"><button class="btn" id="copyCode">Скопировать код</button><button class="btn" id="loadCode">Загрузить из кода</button></div>
      <div id="newConfirm"></div>
      </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Вернуться в игру</button><button class="btn danger block" id="newGameBtn">Новая игра</button></div>`, { closable: true });
    if (BK.RewindUI) BK.RewindUI.bind($('#modal'), false);
    $('#renameOk').addEventListener('click', () => { S.company = $('#renameIn').value.trim() || S.company; hudCache = ''; save(); toast('Название сохранено', S.company, 'good'); });
    $('#copyCode').addEventListener('click', () => {
      const code = exportCode(); const ta = $('#saveCode'); ta.value = code;
      navigator.clipboard && navigator.clipboard.writeText(code).then(() => toast('Код скопирован', '', 'good'), () => { ta.select(); toast('Выделите и скопируйте код', '', 'warn'); });
      if (!navigator.clipboard) { ta.select(); }
    });
    $('#loadCode').addEventListener('click', () => { try { const st = importCode($('#saveCode').value); continueGame(st); save(); toast('Игра загружена', '', 'good'); } catch (e) { toast('Код не подошёл', 'Проверьте, что он скопирован целиком.', 'bad'); } });
    $('#newGameBtn').addEventListener('click', () => {
      $('#newConfirm').innerHTML = `<div class="confirm">Эта игра останется в своём слоте. Новую можно начать в свободном слоте или вместо любой игры. <button class="btn sm danger" id="newYes">К списку игр</button></div>`;
      $('#newYes').addEventListener('click', toStart);
    });
  }

  function toStart() { save(); if (BK.PrologueUI) BK.PrologueUI.close(); if (BK.Stage1UI) BK.Stage1UI.close(); closeModal(); cityView(); S = null; startScreen(); } // к списку игр: текущая остаётся в своём слоте

  /* ---------------- запуск ---------------- */
  function boot(hot) {
    applyTheme(loadTheme());
    shell();
    applyTheme(ui.theme);
    if (BK.Sound) { BK.Sound.arm(); BK.Sound.sync(); } // живость: звук (кнопка в HUD) — первый жест игрока снимает запрет браузера
    if (hot && hot.state) { continueGame(hot.state); ui.speed = hot.speed != null ? hot.speed : 1; }
    else startScreen();
    requestAnimationFrame(frame);
    if (globalThis.claude && globalThis.claude.hot && globalThis.claude.hot.snapshot) {
      try { globalThis.claude.hot.snapshot(() => (S ? { state: stripState(S), speed: ui.speed } : {})); } catch (e) {}
    }
  }
  BK.App = { boot, get state() { return S; }, ui, ACT, save, setSpeed, openModal, closeModal, toast, newGame, startNew, continueGame, toStart, openRussia, cityView, refresh };
  const h = globalThis.claude && globalThis.claude.hot;
  if (h && h.ready) h.ready(boot); else boot(h && h.data ? h.data : null);
})();
