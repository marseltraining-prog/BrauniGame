/* Стратегии — интерфейс (логика — src/strategy.js, BK.Strat).
   Где видно: карточки «Как играем?» на стартовом экране, блок «Стратегия» в «Сводке»,
   строка в «Меню игры», окно «Как вы играете» (выбрать путь или сбросить выбор), тост,
   когда путь сложился сам. В app.js / panels.js / extras.js — только хуки (BK.StratUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const ST = BK.Strat, APP = () => BK.App;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const num = (v) => Math.round(v).toLocaleString('ru-RU');
  const AUTO_ID = 'auto';                                  // «Пусть сложится сама» — значение радиокнопки, выбранное по умолчанию
  const AUTO = { name: 'Пусть сложится сама', icon: '?', short: 'путь определится по вашим решениям',
    text: 'Ничего не выбираем: игра смотрит, как вы ведёте дело, и сама называет ближайший путь — его можно принять или сменить в первые месяцы.' };
  const AUTO_TEXT = 'Можно выбрать путь сразу — или не выбирать: он определится по вашим решениям. Сменить можно в первые месяцы.';

  /* сколько времени идёт игра этим путём — «3 месяца», «1 год 2 месяца» */
  function lasted(days) {
    const m = Math.floor(Math.max(0, days || 0) / 30);
    if (m < 1) return 'меньше месяца';
    const y = Math.floor(m / 12);
    if (!y) return nw(m, 'месяц', 'месяца', 'месяцев');
    const r = m % 12;
    return `${nw(y, 'год', 'года', 'лет')}${r ? ' ' + nw(r, 'месяц', 'месяца', 'месяцев') : ''}`;
  }
  // «плюс и плата одной строкой»: + плюс, − плата
  const pline = (p, cls) => `<p class="st-pl${cls ? ' ' + cls : ''}"><span class="st-p">${PLUS}${esc(p.plus)}</span><span class="st-mm">${MINUS}${esc(p.minus)}</span></p>`;

  /* ---------------- стартовый экран: карточки «Как играем?» ---------------- */
  function startOpt() {
    const auto = `<label class="spath auto">
      <input type="radio" name="strategy" value="${AUTO_ID}" checked>
      <span class="sp-i" aria-hidden="true">${esc(AUTO.icon)}</span>
      <span class="sp-b"><span class="sp-n">${esc(AUTO.name)}</span><span class="sp-m">${esc(AUTO.short)}</span></span>
      <span class="sp-c" aria-hidden="true"></span></label>`;
    const cards = ST.list().map((id) => {
      const p = ST.path(id);
      return `<label class="spath">
        <input type="radio" name="strategy" value="${id}">
        <span class="sp-i" aria-hidden="true">${esc(p.icon)}</span>
        <span class="sp-b"><span class="sp-n">${esc(p.name)}</span><span class="sp-m">${esc(p.short)}</span></span>
        <span class="sp-c" aria-hidden="true"></span></label>`;
    }).join('');
    return `<fieldset class="stratpick"><legend>Как играем?</legend><div class="spaths">${auto}${cards}</div>
      <p class="spdesc" id="stratDesc" aria-live="polite">${esc(AUTO_TEXT)}</p></fieldset>`;
  }
  function bindStart(form) {
    if (!form || form.__stratBind) return;
    form.__stratBind = true;
    // strategyValue — всегда функция-геттер (её зовёт app.js при отправке формы); не затираем её строкой
    const sel = () => { const r = form.querySelector('input[name=strategy]:checked'); return r ? (r.value === AUTO_ID ? '' : r.value) : ''; };
    form.strategyValue = sel;
    const desc = () => document.getElementById('stratDesc');
    form.addEventListener('change', (e) => {
      if (!e.target || e.target.name !== 'strategy') return;
      const d = desc(); if (!d) return;
      const id = form.strategyValue(), p = id ? ST.path(id) : null;
      d.className = 'spdesc' + (p ? ' on' : '');
      d.innerHTML = p
        ? `<span class="spd-n">${esc(p.icon)} ${esc(p.name)}</span><span class="spd-t">${esc(p.text)}</span>${pline(p)}`
        : esc(AUTO_TEXT);
    });
    // начальное состояние: «Пусть сложится сама» — тоже выбор, у него своё пояснение
    const d = desc();
    if (d) { d.className = 'spdesc'; d.textContent = AUTO_TEXT; }
  }

  /* ---------------- блок «Стратегия» в «Сводке» ---------------- */
  function block(S) {
    const info = ST.info(S); if (!info) return '';
    const n = info.id ? ST.path(info.id) : null;
    let s = `<div class="sec stratb"><h3><span class="st-h">${ICON}Стратегия</span><button class="linkbtn" data-act="strat">Подробнее →</button></h3>`;
    if (n) {
      const auto = !info.chosen, de = info.detect;
      const bot = !auto && info.day <= (BK.CFG.STRAT.CHANGE_DAYS || 180);
      s += `<div class="st-card${auto ? ' auto' : ''}">
        <span class="st-ic" aria-hidden="true">${esc(n.icon)}</span>
        <span class="st-b">
          <span class="st-n">${esc(n.name)}<span class="st-tag">${auto ? 'сложилась сама' : 'выбрана вами'}</span></span>
          <span class="st-m">идёте этим путём ${esc(lasted(info.day))}${bot ? ' · можно сменить' : ''}</span>
        </span></div>
        ${pline(n)}
        ${auto && de && de.id && de.id !== info.id ? `<p class="st-note">Последние месяцы похоже на «${esc(ST.path(de.id).name)}» — посмотрите, что это значит.</p>` : ''}
        ${bot ? `<div class="st-acts">${auto ? '' : '<button class="btn sm" data-act="stratPick" data-arg="none">Пусть сложится сама</button>'}<button class="btn sm primary" data-act="strat">Выбрать путь</button></div>` : ''}`;
    } else {
      const d = info.detect || {};
      s += `<div class="st-hint"><span class="st-qi" aria-hidden="true">?</span><span class="st-b">
        <span class="st-n">Путь ещё не определился</span>
        <span class="st-m">${d.id ? `Похоже на «${esc(ST.path(d.id).name)}» — решите, ваш ли это путь.` : `Игра смотрит на чек, размер точек и поток гостей. Обычно путь виден с ${BK.CFG.STRAT.DETECT_MIN_STORES} точек — открывайте точки, и он сложится сам.`}</span>
      </span></div>`;
    }
    return s + '</div>';
  }

  /* ---------------- окно «Как вы играете» ---------------- */
  function metricsHtml(m) {
    return `<div class="st-mets">
      <span><small>Точек</small><b>${m.n}</b></span>
      <span><small>Чек к рынку</small><b>${Math.round(m.checkK * 100)} %</b></span>
      <span><small>Гостей на точку</small><b>${num(m.guestsPerStore)}</b></span>
    </div>`;
  }
  function infoHtml(S) {
    const info = ST.info(S); if (!info) return '';
    const m = ST.metrics(S), cur = info.id, can = !info.chosen || info.day <= (BK.CFG.STRAT.CHANGE_DAYS || 180);
    const cards = ST.list().map((id) => {
      const p = ST.path(id), on = cur === id;
      return `<button type="button" class="spath${on ? ' on' : ''}" data-act="stratPick" data-arg="${id}"${can ? '' : ' disabled'} aria-pressed="${on}">
        <span class="sp-i" aria-hidden="true">${esc(p.icon)}</span>
        <span class="sp-b"><span class="sp-n">${esc(p.name)}${on ? '<span class="sp-tag yours">ваш путь</span>' : ''}</span><span class="sp-m">${esc(p.text)}</span></span>
        <span class="sp-p">${PLUS}${esc(p.plus)}</span>
        <span class="sp-mm">${MINUS}${esc(p.minus)}</span>
        ${can ? `<span class="sp-go">${on ? 'Это уже ваш путь' : 'Играть так'}</span>` : ''}</button>`;
    }).join('');
    return `<div class="modal-h stratm-h"><span class="eyebrow">Четыре пути к победе</span><h2>Как вы играете</h2></div><div class="modal-b strat-m">
      <p class="hint" style="margin:0">Ни один путь не лучше всегда: у каждого своя сильная сторона и своя плата. Можно выбрать сразу — или не выбирать: путь сложится сам по вашим решениям.</p>
      <div class="spaths big">${cards}</div>
      <div class="st-foot">
        <div class="st-now">
          <span><small>Ваш путь</small><b>${cur ? esc(ST.path(cur).icon) + ' ' + esc(ST.path(cur).name) : 'ещё не определился'}</b></span>
          <span><small>Так решено</small><b>${cur ? (info.chosen ? 'вами' : 'сложилось само') : '—'}</b></span>
          <span><small>Идёте этим путём</small><b>${cur ? esc(lasted(info.day)) : '—'}</b></span>
        </div>
        ${metricsHtml(m)}
      </div>
      <p class="hint" style="margin:0">${can
        ? 'Сменить путь или снять выбор («Пусть сложится сама») можно в первые полгода игры.'
        : 'Полгода прошло — стратегия стала вашей историей. Сменить её больше нельзя.'}</p>
      ${can && cur ? `<button type="button" class="btn block st-reset" data-act="stratPick" data-arg="none">Пусть сложится сама — снять выбор</button>` : ''}
    </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
  }
  function openInfo(keep) {
    const S = APP().state; if (!S) return;
    APP().openModal(infoHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('strat-modal');
  }
  const inModal = () => !!(APP().ui.modal && document.querySelector('#modal .strat-modal'));

  /* ---------------- строка в «Меню игры» (рисует extras.js — 3 строки) ---------------- */
  function settingsHtml(S) {
    const i = S ? ST.info(S) : null;
    return `<div class="row sp strat-set"><span>Стратегия<small class="hint">${
      i && i.id ? (i.chosen ? 'выбрана вами' : 'сложилась сама') : 'путь определится по вашим решениям'
    }</small></span><button type="button" class="btn" data-act="strat">${i && i.id ? `${esc(ST.path(i.id).icon)} ${esc(ST.path(i.id).name)}` : 'Стратегия не выбрана'}</button></div>`;
  }

  /* ---------------- тост «Сложилась стратегия» (как у сюжета и инвесторов) ---------------- */
  function notify(n) {
    if (!n || n.phase !== 'detected') return;
    const p = ST.path(n.id); if (!p) return;
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast strtoast good';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Сложилась стратегия</span><b>${esc(p.icon)} ${esc(p.name)}</b><span class="md">${esc(p.plus)}. Плата: ${esc(p.minus)}.</span></span>`;
    el.addEventListener('click', () => { el.remove(); openInfo(); });
    el.title = 'Открыть стратегии';
    setTimeout(() => el.remove(), 9000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (BK.Sound) BK.Sound.play('fanfare');
  }

  /* ---------------- действия ---------------- */
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    if (A.__stratUI) return; A.__stratUI = true;
    Object.assign(A, {
      strat: () => openInfo(),
      stratPick: (d) => {
        const S = APP().state; if (!S) return;
        const was = ST.info(S);                                   // что было до нажатия — для понятного тоста
        const id = d.arg === 'none' ? null : d.arg;
        const r = ST.set(S, id);
        APP().save(); APP().refresh();
        if (r) APP().toast('Стратегия', `Ваш путь: ${ST.path(r).icon} ${ST.path(r).name}`, 'good');
        else APP().toast('Стратегия', was && was.id ? 'Сняли выбор — путь сложится сам по вашим решениям.' : 'Выбор не сделан — путь сложится сам.', 'good');
        if (inModal()) openInfo('keep');
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.StratUI = { block, startOpt, bindStart, openInfo, infoHtml, settingsHtml, notify, ICON };
})();
