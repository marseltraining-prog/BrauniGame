/* Стратегии — интерфейс (логика — src/strategy.js, BK.Strat).
   Где видно: карточки «Как играем?» на стартовом экране, блок «Стратегия» в «Сводке»,
   окно со всеми четырьмя путями (можно выбрать или сменить в первые месяцы), тост, когда путь
   сложился сам. В app.js / panels.js — только хуки (BK.StratUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const ST = BK.Strat, APP = () => BK.App;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';

  /* ---------------- стартовый экран ---------------- */
  function startOpt() {
    const cards = ST.list().map((id) => {
      const p = ST.path(id);
      return `<label class="spath"><input type="radio" name="strategy" value="${id}">
        <span class="sp-i">${esc(p.icon)}</span><span class="sp-n">${esc(p.name)}</span><span class="sp-m">${esc(p.short)}</span></label>`;
    }).join('');
    return `<fieldset class="stratpick"><legend>Как играем?</legend><div class="spaths">
      <label class="spath auto"><input type="radio" name="strategy" value="" checked>
        <span class="sp-i">?</span><span class="sp-n">Пусть сложится сама</span><span class="sp-m">игра сама увидит, во что вы играете</span></label>
      ${cards}</div>
      <p class="hint" id="stratDesc" style="margin:6px 0 0">Можно выбрать путь сразу — или не выбирать: он определится по вашим решениям. Сменить можно в первые месяцы.</p></fieldset>`;
  }
  function bindStart(form) {
    if (!form || form.__stratBind) return;
    form.__stratBind = true;
    const sel = () => { const r = form.querySelector('input[name=strategy]:checked'); return r ? r.value : ''; };
    form.strategyValue = sel;
    form.addEventListener('change', (e) => {
      form.strategyValue = sel();
      if (!e.target || e.target.name !== 'strategy') return;
      const d = document.getElementById('stratDesc'); if (!d) return;
      const id = e.target.value, p = id ? ST.path(id) : null;
      d.textContent = p ? `${p.name}: ${p.text} Плюс: ${p.plus}. Плата: ${p.minus}.` : 'Можно выбрать путь сразу — или не выбирать: он определится по вашим решениям.';
    });
  }

  /* ---------------- сводка ---------------- */
  function block(S) {
    const info = ST.info(S); if (!info) return '';
    const n = info.id ? ST.path(info.id) : null;
    let s = `<div class="sec stratb"><h3><span class="st-h">${ICON}Стратегия</span><button class="linkbtn" data-act="strat">Подробнее →</button></h3>`;
    if (n) {
      s += `<p class="strat-line"><b>${esc(n.icon)} ${esc(n.name)}</b> <span class="hint">${info.chosen ? 'выбрана вами' : 'сложилась сама'}${info.day > 60 ? `, ${Math.round(info.day / 30)} мес.` : ''}</span></p>`;
      s += `<p class="hint" style="margin:0">${esc(n.plus)}. Плата: ${esc(n.minus)}.</p>`;
    } else {
      const d = info.detect || {};
      s += `<p class="hint" style="margin:0">Путь ещё не определился.${d.id ? ` Похоже на «${esc(ST.path(d.id).name)}».` : ' Открывайте точки, и он сложится сам.'}</p>`;
    }
    return s + '</div>';
  }

  /* ---------------- окно ---------------- */
  function infoHtml(S) {
    const info = ST.info(S), m = ST.metrics(S), cur = info.id;
    const can = !info.chosen || info.day <= (BK.CFG.STRAT.CHANGE_DAYS || 180);
    return `<div class="modal-h"><span class="eyebrow">Этап 3 · стратегия</span><h2>Как вы играете</h2></div><div class="modal-b strat-m">
      <p class="hint" style="margin:0">Четыре пути к победе. Ни один не лучше всегда: у каждого своя сильная сторона и своя плата. Можно вести игру любым — или не выбирать: путь сложится сам по вашим решениям.</p>
      <div class="spaths big">${ST.list().map((id) => {
        const p = ST.path(id), on = cur === id;
        return `<button class="spath${on ? ' on' : ''}" data-act="stratPick" data-arg="${id}"${can ? '' : ' disabled'}>
          <span class="sp-i">${esc(p.icon)}</span><span class="sp-n">${esc(p.name)}${on ? ' · ваш путь' : ''}</span>
          <span class="sp-m">${esc(p.text)}</span>
          <span class="sp-p">+ ${esc(p.plus)}</span><span class="sp-mm">− ${esc(p.minus)}</span></button>`;
      }).join('')}</div>
      <div class="strat-now">
        <span><small>Ваш путь</small><b>${cur ? esc(ST.path(cur).name) : 'ещё не определился'}</b></span>
        <span><small>Точек</small><b>${m.n}</b></span>
        <span><small>Чек к рынку</small><b>${Math.round(m.checkK * 100)} %</b></span>
        <span><small>Гостей на точку</small><b>${Math.round(m.guestsPerStore).toLocaleString('ru-RU')}</b></span>
      </div>
      <p class="hint" style="margin:0">${can ? 'Сменить путь можно в первые полгода игры.' : 'Полгода прошло — стратегия стала вашей историей.'}</p>
    </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
  }
  function openInfo() { const S = APP().state; if (!S) return; APP().openModal(infoHtml(S), { closable: true }); }

  /* ---------------- тост ---------------- */
  function notify(n) {
    if (n.phase !== 'detected') return;
    const p = ST.path(n.id); if (!p) return;
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast strattoast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Сложилась стратегия</span><b>${esc(p.icon)} ${esc(p.name)}</b><span class="md">${esc(p.plus)}. Плата: ${esc(p.minus)}.</span></span>`;
    el.addEventListener('click', () => { el.remove(); openInfo(); });
    el.title = 'Открыть стратегии';
    setTimeout(() => el.remove(), 9000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (BK.Sound) BK.Sound.play('ribbon');
  }

  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    if (A.__stratUI) return; A.__stratUI = true;
    Object.assign(A, {
      strat: () => openInfo(),
      stratPick: (d) => {
        const S = APP().state;
        const id = d.arg === 'none' ? null : d.arg;
        const r = ST.set(S, id);
        APP().save(); APP().refresh();
        APP().toast('Стратегия', r ? `Ваш путь: ${ST.path(r).name}` : 'Стратегия сброшена', 'good');
        openInfo();
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.StratUI = { block, startOpt, bindStart, openInfo, infoHtml, notify, ICON };
})();
