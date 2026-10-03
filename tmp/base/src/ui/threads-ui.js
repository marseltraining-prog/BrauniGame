/* =====================================================================
   НИТИ ИСТОРИИ — интерфейс (BK.ThreadsUI). Логика — src/threads.js, стили — src/ui/threads.css.
   Что видит игрок:
     • блок «Вас помнят» в «Сводке» (кто, чем грозит, когда отзовётся) с кнопкой «Подробнее»;
     • строки в «Требует внимания» (их отдаёт BK.Threads.attItems — панель только вставляет их);
     • окно-реестр: все нити по разделам «Помнят сейчас» / «Отзовётся» / «Уже отозвалось»,
       с городом, сроком и точной ценой последствия (в том числе «открытие 50 дней вместо 21»).
   Кнопки помечены data-act="threads": app.js такое действие не знает, поэтому окно открывает
   собственный обработчик (как это делают другие модульные окна). Без DOM модуль молчит.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const HAS_DOM = typeof document !== 'undefined';
  const T = () => BK.Threads, H = () => BK.UIH, APP = () => BK.App, E = () => BK.Engine;
  const esc = (s) => (H() ? H().esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="7.5" r="3.4"/><path d="M5.5 20c.7-4 3.4-6 6.5-6s5.8 2 6.5 6"/></svg>';
  const KIND_ICON = {
    grudge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>',
    favor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/></svg>',
    promise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  };
  function date(S, day) { try { return E().fmtDate(day); } catch (e) { return 'день ' + Math.round(day); } }
  function nw(n, a, b, c) { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return n + ' ' + (x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c); }
  function openWhen(S, t) {   // «отзовётся 12 марта 2032»
    return `${t.done ? 'отозвалось' : 'отзовётся'} ${date(S, t.due)}`;
  }
  function left(S, t) {
    const d = t.due - S.day;
    return d > 0 ? `через ${nw(d, 'день', 'дня', 'дней')}` : 'уже';
  }
  function kindCls(k) { return k === 'grudge' ? 'bad' : k === 'favor' ? 'good' : 'warn'; }

  // одна нить в окне
  function row(S, t) {
    const T_ = T(), e = t.effect || {};
    const ot = t.city ? T_.openText(S, t) : '';
    const until = t.until ? `<span class="thr-until">${t.done ? 'давит' : 'продлится'} до ${date(S, t.until)}</span>` : '';
    const fx = e.fx && e.fx.length ? `<div class="thr-fx">Последствия: ${e.fx.map(fxText).filter(Boolean).join('; ')}</div>` : '';
    return `<div class="card thr-card thr-${kindCls(t.kind)}">
      <div class="card-h"><div><div class="card-t">${esc(t.who)}<span class="chip ${kindCls(t.kind)} thr-kind">${esc(T_.kindName(t.kind))}</span></div>
        <div class="card-s">${esc(t.role || 'знакомый')}${t.city ? ` · ${esc(T_.cityName(t.city))}` : ' · вся сеть'}</div></div>
        <span class="thr-when">${t.done ? 'отозвалось ' + date(S, t.doneAt) : openWhen(S, t)}<small>${t.done ? '' : left(S, t)}</small></span></div>
      <div class="thr-body">
        <p class="thr-text">${esc(t.text)}</p>
        <p class="thr-eff"><b>${t.done ? 'Что произошло' : 'Чем отзовётся'}:</b> ${esc(ot ? ((e.text ? e.text + ': ' : '') + ot) : T_.effectText(S, t))}${until ? ' ' + until : ''}</p>
        ${fx}
        <div class="thr-meta">Помнит с ${date(S, t.from)} · ${esc(t.done ? 'нить отозвалась' : 'ждёт своего дня')}</div>
      </div></div>`;
  }
  function fxText(f) {
    const M = { cash: (x) => `деньги ${x.v >= 0 ? '+' : '−'}${BK.fmtMoney(Math.abs(x.v || 0))}`, traffic: (x) => `гости ${Math.round((x.m || 0) * 100)} % на ${x.d} дн.`, check: (x) => `чек ${Math.round((x.m || 0) * 100)} % на ${x.d} дн.`, foodcost: (x) => `себестоимость ${Math.round((x.m || 0) * 100)} % на ${x.d} дн.`, salary: (x) => 'рыночные зарплаты', close: (x) => `закрытие на ${x.d} дн.`, staffQuit: (x) => `уйдут ${x.n || 1} чел.` };
    return (M[f.t] || (() => ''))(f);
  }

  function windowHtml(S) {
    const T_ = T(); T_.ensure(S);
    const all = T_.list(S), act = T_.active(S), wait = T_.waiting(S), past = T_.past(S);
    const sec = (title, items, note) => items.length ? `<div class="sec thr-sec"><h3>${esc(title)} <small>${items.length}</small></h3>${note ? `<p class="hint thr-note">${esc(note)}</p>` : ''}${items.map((t) => row(S, t)).join('')}</div>` : '';
    const works = act.some((t) => (t.effect || {}).openK);
    let s = `<div class="modal-h"><span class="eyebrow">Нити истории</span><h2>Вас помнят: ${all.length}</h2></div><div class="modal-b">
      <p class="thr-lead">Люди помнят ваши решения — и возвращаются. Одни помогают, другие ждут своего дня: у каждой нити есть срок, и последствие видно заранее.</p>`;
    s += sec('Помнят сейчас', act, works ? 'Это уже работает: срок открытия точек в городе считается с этой поправкой.' : 'Это уже работает.');
    s += sec('Отзовётся', wait, 'Пока ничего не меняется — но вы знаете, что и когда будет.');
    s += sec('Уже отозвалось', past);
    if (!all.length) s += `<div class="sec"><div class="empty">Пока никто вас не помнит. Так бывает в начале — но люди запоминают.</div></div>`;
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }

  // блок в «Сводке»: коротко, кто помнит и чем это грозит (у панели — одна строка-хук)
  function dashBlock(S) {
    const T_ = T(); if (!T_ || !T_.summary || !T_.state(S)) return '';
    const R = T_.state(S); if (!R || !R.list.length) return '';
    const act = T_.active(S), wait = T_.waiting(S);
    const line = (t) => {
      const ot = t.city ? T_.openText(S, t) : '';
      const what = t.done ? (ot || T_.effectText(S, t)) : `${t.text.slice(0, 90)}${t.text.length > 90 ? '…' : ''}`;
      return `<li><span class="ic">${KIND_ICON[t.kind] || KIND_ICON.promise}</span><div class="tx"><b>${esc(t.who)}</b><small>${esc(what)}</small></div><span class="thr-when2">${t.done ? (t.until ? 'до ' + date(S, t.until) : 'уже было') : date(S, t.due)}</span></li>`;
    };
    const list = act.concat(wait).slice(0, 3), hidden = act.length + wait.length - list.length;
    return `<div class="sec thr-block"><h3><span class="thr-h">${ICON}Вас помнят${act.length ? `<span class="cnt">${act.length}</span>` : ''}</span><button class="linkbtn" data-act="threads">Подробнее →</button></h3>
      <ul class="thr-list">${list.map(line).join('')}</ul>
      ${hidden > 0 ? `<p class="hint">И ещё ${hidden}…</p>` : ''}</div>`;
  }

  function open() {
    const S = APP() && APP().state; if (!S || !T()) return;
    APP().openModal(windowHtml(S), { closable: true });
    if (BK.Sound) BK.Sound.tap('threads');
  }

  function boot() {
    if (!HAS_DOM) return;
    // app.js действия «threads» не знает — окно открываем сами (как это делают другие модульные окна)
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('[data-act="threads"]');
      if (t) open();
    });
  }
  if (HAS_DOM) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }

  BK.ThreadsUI = { windowHtml, dashBlock, row, open, ICON };
})();
