/* Сценарии — интерфейс (логика — src/scenario.js, BK.Scenario).
   Где видно: блок «Истории» на стартовом экране (пройдено N из 4, что осталось),
   экран в конце партии («Пройдено N из 4» и кнопка «Начать заново — пройти другую историю»),
   строка о сценарии в итогах игры. В app.js / extras.js — только хуки. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const SC = () => BK.Scenario, APP = () => BK.App;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 7h8M8 11h5"/></svg>';

  /* стартовый экран: сколько историй пройдено и что осталось */
  function startOpt() {
    const p = SC().progress();
    if (!p.total) return '';
    const items = SC().all().map((id) => {
      const d = SC().info(id), was = p.played.indexOf(id) >= 0;
      return `<span class="scen-it${was ? ' done' : ''}" title="${esc(was ? 'пройдено' : 'ещё не пройдено')}">${esc(d.icon)} ${esc(d.name)}${was ? ' ✓' : ''}</span>`;
    }).join('');
    return `<fieldset class="scenpick"><legend>Истории</legend>
      <p class="hint" style="margin:0 0 6px">Сценарий выпадает случайно — но только из тех, что вы ещё не проходили: <b>${p.played.length} из ${p.total}</b> пройдено.</p>
      <div class="scen-list">${items}</div>
      ${p.played.length ? '<button type="button" class="linkbtn" id="scenReset">Сбросить пройденные</button>' : ''}
    </fieldset>`;
  }
  function bindStart(form) {
    const b = form && form.querySelector('#scenReset');
    if (b && !b.__b) { b.__b = 1; b.addEventListener('click', () => { SC().resetDone(); APP().toast('Истории', 'Прогресс историй сброшен — снова выпадают все четыре.', 'warn'); form.querySelector('.scenpick').outerHTML = startOpt(); bindStart(form); }); }
  }

  /* конец партии: пройдено N из 4 и предложение пройти другую */
  function endingHtml(S) {
    const cur = SC().current(S);
    const p = SC().progress();
    if (!p.total) return '';
    const d = cur ? SC().info(cur) : null;
    const rest = p.left.map((id) => SC().info(id).name);
    let s = `<div class="scen-end"><span class="eyebrow">Истории</span>`;
    s += `<p class="scen-end-h">Пройдено <b>${p.played.length} из ${p.total}</b></p>`;
    if (d) s += `<p class="hint" style="margin:2px 0 0">Эта партия — история «${esc(d.icon)} ${esc(d.name)}»${p.played.indexOf(cur) >= 0 ? ' — засчитана' : ''}.</p>`;
    if (rest.length) s += `<p class="hint" style="margin:4px 0 0">Осталось пройти: ${esc(rest.join(', '))}.</p>`;
    else s += `<p class="hint" style="margin:4px 0 0">Вы прошли все четыре истории. Спасибо!</p>`;
    s += `<div class="row" style="margin-top:8px"><button class="btn primary" data-act="scenAgain">Начать заново — пройти другую историю</button></div></div>`;
    return s;
  }
  function forSummary(S) { return SC().current(S) ? endingHtml(S) : ''; }

  function boot() {
    const A = APP() && APP().ACT; if (!A || A.__scenUI) return; A.__scenUI = true;
    Object.assign(A, { scenAgain: () => { APP().closeModal(); if (APP().toStart) APP().toStart(); else location.reload(); } });
    const f = document.querySelector('#startForm'); if (f) bindStart(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.ScenarioUI = { startOpt, bindStart, endingHtml, forSummary, ICON };
})();
