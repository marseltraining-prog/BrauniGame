/* Инвесторы — интерфейс (логика — src/investors.js, BK.Inv).
   Где видно: окно торга при приходе инвестора (принять / отказаться / торговаться), блок «Инвесторы»
   во вкладке «Финансы» (доли, выплаты, выкуп), строки в «Требует внимания», тосты и записи в журнале.
   В panels.js / app.js — только хуки (BK.InvUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const IV = BK.Inv, APP = () => BK.App, E = () => BK.Engine;
  const fm = (v) => BK.fmtMoney(v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></svg>';
  const ui = { last: null };

  /* ---------------- окно торга ---------------- */
  function offerHtml(S) {
    const o = IV.state(S) && IV.state(S).offer; if (!o) return '';
    const t = IV.terms(o);
    const months = 12;
    const estimate = o.kind === 'profit'
      ? (S.history.length ? Math.max(0, S.history[S.history.length - 1].profit) * o.pct : 0)
      : (S.history.length ? Math.max(0, S.history[S.history.length - 1].rev) * o.pct : 0);
    return `<div class="modal-h"><span class="eyebrow">Этап 2 · инвестор</span><h2>Инвестор с деньгами</h2></div><div class="modal-b inv-m">
      <p class="hint" style="margin:0">Инвестор даёт деньги за долю в бизнесе: выплаты идут каждый месяц, 1-го числа, отдельной статьёй в отчёте. Долю можно выкупить досрочно — дороже вложенного. Можно согласиться, отказаться или поторговаться: у него в запасе ещё ${nw(o.rounds, 'раунд', 'раунда', 'раундов')} терпения.</p>
      <div class="inv-card">
        <div class="inv-who"><b>${esc(o.name)}</b><span>${esc(o.firm)} · ${esc(t.harshText)}</span></div>
        <div class="inv-nums">
          <span><small>Вкладывает</small><b>${fm(o.sum)}</b></span>
          <span><small>Просит</small><b>${esc(t.pctText)}</b></span>
          <span><small>Это примерно</small><b>${estimate > 0 ? fm(estimate) + ' в месяц' : '—'}</b></span>
          <span><small>Кроме денег</small><b>${esc(t.perkName)}</b></span>
        </div>
        <div class="inv-perk">${esc(t.perkText)}</div>
      </div>
      ${ui.last ? `<div class="inv-last">${esc(ui.last)}</div>` : ''}
      <div class="row inv-acts">
        <button class="btn primary" data-act="invAccept">Согласиться: ${fm(o.sum)}</button>
        <button class="btn" data-act="invMore"${o.rounds < 1 ? ' disabled' : ''}>Дать больше денег</button>
        <button class="btn" data-act="invLess"${o.rounds < 1 ? ' disabled' : ''}>Снизить процент</button>
        <button class="btn" data-act="invSwitch"${o.rounds < 1 ? ' disabled' : ''}>${o.kind === 'profit' ? 'Платить с выручки' : 'Платить с прибыли'}</button>
        <button class="btn danger" data-act="invDecline">Отказаться</button>
      </div>
      <p class="hint" style="margin:0">Если раунды торга кончатся, инвестор уйдёт. Досрочный выкуп доли сразу после сделки — ${fm(Math.round(o.sum * BK.CFG.INV.BUYOUT_MIN))}.</p>
    </div><div class="modal-f"><button class="btn block" data-act="closeModal">Решить позже</button></div>`;
  }
  function openOffer(keep) {
    const S = APP().state; if (!S || !IV || !IV.state(S) || !IV.state(S).offer) { openInfo(keep); return; }
    APP().openModal(offerHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('inv-modal');
  }

  /* ---------------- окно «Инвесторы» (сводка) ---------------- */
  function block(S) {
    const st = IV.status(S), deals = IV.list(S);
    let s = `<div class="sec invb"><h3><span class="inv-h">${ICON}Инвесторы</span><button class="linkbtn" data-act="inv">Подробнее →</button></h3>`;
    if (st.offer) {
      const t = IV.terms(st.offer);
      s += `<div class="inv-offer"><b>Ждёт ответа: ${esc(st.offer.name)}</b><span>${fm(st.offer.sum)} за ${esc(t.pctText)} · ${esc(t.perkText)}</span><button class="btn sm primary" data-act="inv">Обсудить</button></div>`;
    }
    if (!deals.length) {
      s += `<p class="hint" style="margin:0">Инвесторы приходят после ${BK.CFG.INV.UNLOCK_STORES} точек: дают деньги за долю в прибыли или выручке, раз в 2–5 лет.${st.taken ? ` Уже приходили: ${nw(st.taken, 'раз', 'раза', 'раз')}.` : ''}</p>`;
    } else {
      s += `<div class="inv-list">${deals.map((d) => `<article class="inv-card deal">
        <div class="inv-who"><b>${esc(d.name)}</b><span>${esc(d.firm)} · с ${E().fmtDate(d.since)} (${String(d.years).replace('.', ',')} г.)</span></div>
        <div class="inv-nums">
          <span><small>Вложил</small><b>${fm(d.sum)}</b></span>
          <span><small>Забирает</small><b>${d.kind === 'profit' ? pct(d.pct) + ' прибыли' : pct(d.pct) + ' выручки'}</b></span>
          <span><small>Выплата в месяц</small><b>${fm(d.pay)}</b></span>
          <span><small>Выкуп доли</small><b>${fm(d.buyout)}</b></span>
        </div>
        ${d.perkText ? `<div class="inv-perk">${esc(d.perkText)}</div>` : ''}
        <div class="row"><button class="btn sm" data-act="invBuyout" data-arg="${d.id}"${S.cash < d.buyout ? ' disabled' : ''}>Выкупить долю · ${fm(d.buyout)}</button></div>
      </article>`).join('')}</div>`;
      const warn = st.share >= BK.CFG.INV.WARN_SHARE;
      s += `<div class="inv-foot${warn ? ' warnc' : ''}">Партнёрам уходит <b>${fm(st.pay)}</b> в месяц — это <b>${Math.round(st.share * 100)} %</b> прибыли.${warn ? ' Это уже много: подумайте о выкупе долей.' : ''}</div>`;
    }
    return s + '</div>';
  }
  function infoHtml(S) {
    const st = IV.status(S);
    const next = st.nextDay ? E().fmtDate(st.nextDay) : '—';
    return `<div class="modal-h"><span class="eyebrow">Этап 2 · инвесторы</span><h2>Инвесторы</h2></div><div class="modal-b inv-m">
      <p class="hint" style="margin:0">Инвесторы дают деньги за долю в бизнесе. Выплаты — каждый месяц, 1-го числа, отдельной статьёй в отчёте; долю всегда можно выкупить досрочно, но дороже вложенного. Кроме денег инвестор приносит делу пользу: связи в ритейле (помещения приходят чаще), бренд (+3 % гостей сети) или своё казначейство (кредит дешевле и лимит больше).</p>
      <div class="inv-nums big">
        <span><small>Действующих сделок</small><b>${st.n}</b></span>
        <span><small>Привлечено всего</small><b>${fm(st.invest)}</b></span>
        <span><small>Выплаты в месяц</small><b>${fm(st.pay)}</b></span>
        <span><small>Доля прибыли партнёрам</small><b>${Math.round(st.share * 100)} %</b></span>
        <span><small>Выкупить всё</small><b>${fm(st.buyoutAll)}</b></span>
        <span><small>Ждём следующего</small><b>${st.n ? next : '—'}</b></span>
      </div>
      ${st.share >= BK.CFG.INV.WARN_SHARE ? `<div class="inv-warn">Партнёрам уходит ${Math.round(st.share * 100)} % прибыли — новые инвесторы при такой доле не приходят. Выкуп долей вернёт всю прибыль вам.</div>` : ''}
      ${st.offer ? `<div class="inv-offer"><b>Ждёт ответа: ${esc(st.offer.name)}</b><span>${fm(st.offer.sum)} за ${esc(IV.terms(st.offer).pctText)}</span><button class="btn sm primary" data-act="inv">Обсудить</button></div>` : ''}
      ${st.refused ? `<p class="hint" style="margin:0">Отказано или ушло инвесторов: ${st.refused}.</p>` : ''}
    </div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
  }
  function openInfo(keep) {
    const S = APP().state; if (!S) return;
    APP().openModal(infoHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('inv-modal');
  }
  const inModal = () => !!(APP().ui.modal && document.querySelector('#modal .inv-modal'));

  /* ---------------- тосты ---------------- */
  function notify(n) {
    if (n.phase === 'offer') { openOffer(); return; }
    const S = APP().state; if (!S) return;
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast invtoast ' + (n.phase === 'deal' ? 'good' : 'warn');
    el.setAttribute('role', 'status');
    if (n.phase === 'deal') {
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Сделка закрыта</span><b>${esc(n.name)}: ${fm(n.sum)}</b><span class="md">${n.kind === 'profit' ? pct(n.pct) + ' от прибыли' : pct(n.pct) + ' от выручки'} — 1-го числа. Долю можно выкупить.</span></span>`;
    } else {
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Инвестор ушёл</span><b>Ждём следующего</b><span class="md">Раз в 2–5 лет приходят новые.</span></span>`;
    }
    el.addEventListener('click', () => { el.remove(); openInfo(); });
    el.title = 'Открыть инвесторов';
    setTimeout(() => el.remove(), 8000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (BK.Sound) BK.Sound.play(n.phase === 'deal' ? 'fanfare' : 'warn');
  }

  /* ---------------- действия ---------------- */
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    const refresh = (keep) => { APP().save(); APP().refresh(); if (inModal()) { const S = APP().state; (IV.state(S) && IV.state(S).offer) ? openOffer(keep) : openInfo(keep); } };
    Object.assign(A, {
      inv: () => { const S = APP().state; (IV.state(S) && IV.state(S).offer) ? openOffer() : openInfo(); },
      invAccept: () => { const S = APP().state; ui.last = null; const r = IV.accept(S); if (!r.ok) APP().toast('Не получилось', r.msg, 'warn'); else openInfo('keep'); APP().save(); APP().refresh(); },
      invDecline: () => { const S = APP().state; ui.last = null; IV.decline(S); openInfo('keep'); APP().save(); APP().refresh(); },
      invMore: () => step('more'), invLess: () => step('less'), invSwitch: () => step('switch'),
      invBuyout: (d) => { const S = APP().state; const r = IV.buyout(S, d.arg); if (r.ok) APP().toast('Доля выкуплена', `${fm(r.price)} — теперь вся прибыль ваша.`, 'good'); else APP().toast('Не получилось', r.msg, 'warn'); APP().save(); APP().refresh(); if (inModal()) openInfo('keep'); },
    });
    function step(action) {
      const S = APP().state;
      const r = IV.negotiate(S, action);
      if (r.left) { ui.last = null; openInfo('keep'); APP().save(); APP().refresh(); return; }
      ui.last = r.refused
        ? 'Инвестор не согласился. Можно попробовать ещё раз или принять условия.'
        : (r.changed ? r.changed.charAt(0).toUpperCase() + r.changed.slice(1) + '.' : '');
      APP().save(); APP().refresh(); openOffer('keep');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.InvUI = { block, openOffer, openInfo, offerHtml, infoHtml, notify, ICON };
})();
