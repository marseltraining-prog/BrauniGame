/* Кредит под залог точки — интерфейс (логика — src/collateral.js, BK.Coll).
   Где видно: блок «Кредит под залог точки» во вкладке «Финансы» (действующие кредиты, досрочное погашение,
   реструктуризация, кнопка «Взять под залог»), окно «Деньги под залог точки» (выбор точки и суммы, расчёт платежа),
   строка в карточке точки и запрет её закрыть, значок на карте, строки в «Требует внимания», тосты.
   В panels.js / map.js / app.js — только хуки (BK.CollUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const CL = BK.Coll, APP = () => BK.App, E = () => BK.Engine;
  const fm = (v) => BK.fmtMoney(v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M8 15h8M8 18h5"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  const ui = { storeId: null, sum: 0, confirm: null };

  const open = (S) => (S.stores || []).filter((st) => st.status !== 'opening');
  const free = (S) => open(S).filter((st) => !CL.loanOf(S, st.id) && CL.limit(S, st) > 0);

  /* ---------------- блок в «Финансах» ---------------- */
  function block(S) {
    const st = CL.status(S), loans = CL.list(S), pl = S.macro.priceLevel;
    const minSum = Math.round(BK.CFG.COLL.MIN * pl);
    let s = `<div class="sec collb"><h3><span class="coll-h">${LOCK}Кредит под залог точки</span><button class="linkbtn" data-act="coll">${loans.length ? 'Подробнее' : 'Как это работает'} →</button></h3>`;
    if (st.banned) {
      s += `<div class="coll-ban"><b>Банк не даёт кредитов до ${E().fmtDate(st.banUntil)}</b><span>Была просрочка по залогу — точка ушла банку. Потом ставка будет выше на ${pct(BK.CFG.COLL.BAN_RATE_ADD).replace(' %', ' п. п.')}.</span></div>`;
    }
    if (!loans.length) {
      const room = CL.totalRoom(S), can = !st.banned && room >= minSum;
      s += `<p class="hint" style="margin:0">Деньги под конкретную точку: до ${fm(BK.CFG.COLL.CAP * pl)} (не больше ${Math.round(BK.CFG.COLL.LTV * 100)} % оценки), ставка ниже обычного кредита, платёж — 1-го числа. Заложенную точку нельзя закрыть или продать. ${BK.CFG.COLL.SEIZE_MONTHS} месяца без платежа — банк забирает точку.</p>
        <div class="row"><button class="btn${can ? ' primary' : ''}" data-act="coll"${can ? '' : ' disabled'}>${st.banned ? 'Банк закрыт' : room >= minSum ? `Взять под залог · до ${fm(room)}` : 'Свободных точек для залога нет'}</button></div>`;
    } else {
      s += `<div class="coll-list">${loans.map((l) => card(S, l)).join('')}</div>`;
      const room = CL.totalRoom(S);
      if (!st.banned && room >= minSum) s += `<div class="row"><button class="btn" data-act="coll">Взять ещё · до ${fm(room)}</button></div>`;
      const due = CL.dueNow(S), cash = Math.max(0, S.cash) + Math.max(0, S.reserve);
      s += `<div class="coll-foot ${cash < due ? 'warnc' : ''}">1-го числа банк спишет <b>${fm(due)}</b> — на счёте и в резерве ${fm(cash)}${cash < due ? ' — не хватит!' : ''}.</div>`;
    }
    return s + '</div>';
  }

  function card(S, l) {
    const gone = l.status === 'gone';
    const months = Math.max(0, l.left);
    return `<article class="coll-card${l.missed ? ' late' : ''}">
      <div class="coll-ch"><b>Точка №${l.num}</b><span class="coll-ad">${esc(l.address)}</span><span class="coll-rate">${pct(l.rate)}</span></div>
      <div class="coll-nums">
        <span><small>Взято</small><b>${fm(l.sum)}</b></span>
        <span><small>Осталось вернуть</small><b>${fm(l.remain)}</b></span>
        <span><small>Платёж 1-го числа</small><b>${fm(l.pay)}</b></span>
        <span><small>Осталось платежей</small><b>${months}</b></span>
        <span><small>В платеже процентов</small><b>${fm(l.interest)}</b></span>
      </div>
      ${l.missed ? `<div class="coll-late">Просрочка ${l.missed}-й месяц. ${BK.CFG.COLL.SEIZE_MONTHS - l.missed === 1 ? 'Ещё месяц — и банк заберёт точку.' : `До изъятия точки: ${BK.CFG.COLL.SEIZE_MONTHS - l.missed} мес.`} ${l.restruct ? '' : 'Можно взять реструктуризацию — 3 месяца платить только проценты.'}</div>` : ''}
      ${l.onlyInt ? `<div class="hint">Реструктуризация: ещё ${nw(l.onlyInt, 'месяц', 'месяца', 'месяцев')} платим только проценты (${fm(l.interest)}).</div>` : ''}
      <div class="coll-acts">
        ${gone ? '<span class="hint">Точка закрыта</span>' : `<button class="btn sm" data-act="openStore" data-arg="${l.storeId}">К точке</button>`}
        <button class="btn sm" data-act="collRepay" data-arg="${l.id}"${S.cash > 0 || S.reserve > 0 ? '' : ' disabled'}>Погасить досрочно</button>
        ${l.missed && !l.restruct ? `<button class="btn sm danger" data-act="collRestruct" data-arg="${l.id}">Реструктуризация · ${fm(Math.round(l.remain * BK.CFG.COLL.RESTRUCT_FEE))}</button>` : ''}
      </div></article>`;
  }

  /* ---------------- окно выбора ---------------- */
  function pick(S) {
    const list = free(S);
    if (!ui.storeId || !list.some((x) => x.id === ui.storeId)) ui.storeId = list.length ? list[0].id : null;
    const st = list.find((x) => x.id === ui.storeId) || null;
    const lim = st ? CL.limit(S, st) : 0;
    const minSum = Math.round(BK.CFG.COLL.MIN * S.macro.priceLevel);
    ui.sum = Math.max(minSum, Math.min(ui.sum || lim, lim));
    return { list, st, lim, minSum };
  }
  function modalHtml(S) {
    const stt = CL.status(S), loans = CL.list(S);
    let s = `<div class="modal-h"><span class="eyebrow">Этап 2 · залог</span><h2>Деньги под залог точки</h2></div><div class="modal-b coll-m">
      <p class="hint" style="margin:0">Банк даёт деньги под конкретную точку: до <b>${fm(BK.CFG.COLL.CAP * S.macro.priceLevel)}</b>, но не больше <b>${Math.round(BK.CFG.COLL.LTV * 100)} %</b> оценки (вложения в открытие и ремонт с износом ${Math.round(BK.CFG.COLL.WEAR_YEAR * 100)} % в год). Ставка ниже обычного кредита на ${pct(-BK.CFG.COLL.SPREAD).replace(' %', ' п. п.')}. Платёж — 1-го числа, равными долями ${BK.CFG.COLL.TERM} месяцев. Заложенную точку нельзя закрыть или продать, пока кредит не погашен. <b>${BK.CFG.COLL.SEIZE_MONTHS} месяца без платежа — банк забирает точку</b>, и новые кредиты будут закрыты ${Math.round(BK.CFG.COLL.BAN_DAYS / 365)} года.</p>`;
    if (stt.banned) s += `<div class="coll-ban"><b>Банк не даёт кредитов до ${E().fmtDate(stt.banUntil)}</b><span>Была просрочка по залогу.</span></div>`;
    const p = pick(S);
    if (!p.list.length) {
      s += `<div class="sec"><h3>Свободных точек нет</h3><p class="hint" style="margin:0">Под залог подходит работающая точка, которая ещё не в залоге и стоит достаточно дорого. Оценка растёт от вложений в открытие и ремонт и падает с возрастом.</p></div>`;
    } else {
      s += `<div class="sec"><h3>Выберите точку</h3><div class="coll-picks" role="radiogroup" aria-label="Какую точку заложить">${p.list.map((st) => {
        const lim = CL.limit(S, st), val = CL.value(S, st), w = Math.round(CL.wear(S, st) * 100);
        return `<button type="button" class="coll-pick${st.id === ui.storeId ? ' on' : ''}" data-act="collPick" data-arg="${st.id}"><b>№${st.num} · ${esc(st.address)}</b><small>оценка ${fm(val)}${w ? ` (износ ${w} %)` : ''} · можно взять до ${fm(lim)}</small></button>`;
      }).join('')}</div></div>`;
      const pl = CL.plan(S, p.sum);
      s += `<div class="sec coll-calc"><h3>Сколько взять</h3>
        <div class="coll-range"><input type="range" id="collRange" min="${p.minSum}" max="${p.lim}" step="100000" value="${p.sum}" aria-label="Сумма кредита"><b id="collSum">${fm(p.sum)}</b></div>
        <div class="coll-res" id="collRes">${calcHtml(S, p.sum, pl)}</div>
        <div class="row"><button class="btn primary block" data-act="collTake"${stt.banned ? ' disabled' : ''}>Взять ${fm(p.sum)}</button></div>
        <span class="hint">Платёж списывается 1-го числа со счёта, затем из резерва. Гасить можно досрочно — без штрафа.</span></div>`;
    }
    if (loans.length) s += `<div class="sec"><h3>Действующие залоги <small>${nw(loans.length, 'кредит', 'кредита', 'кредитов')}</small></h3><div class="coll-list">${loans.map((l) => card(S, l)).join('')}</div></div>`;
    if (stt.seized) s += `<div class="sec"><h3>История</h3>${(CL.state(S).log || []).slice(0, 6).map((x) => `<div class="coll-hl"><span>Точка №${x.num} ушла банку</span><b>${E().fmtDate(x.day)} · ${fm(x.sum)}</b></div>`).join('')}</div>`;
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  function calcHtml(S, sum, pl) {
    const total = pl.total;
    return `<div class="coll-nums">
      <span><small>Ставка</small><b>${pct(pl.rate)}</b></span>
      <span><small>Срок</small><b>${pl.term} мес.</b></span>
      <span><small>Платёж 1-го числа</small><b>${fm(pl.pay)}</b></span>
      <span><small>Всего вернёте</small><b>${fm(total)}</b></span>
      <span><small>Переплата</small><b>${fm(total - sum)}</b></span></div>`;
  }
  function openModal(keep) {
    const S = APP().state; if (!S) return;
    APP().openModal(modalHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const el = document.querySelector('#modal .modal'); if (el) el.classList.add('coll-modal');
    bind(document.getElementById('modal'));
  }
  const inModal = () => !!(APP().ui.modal && document.querySelector('#modal .coll-modal'));

  // живой пересчёт суммы в окне
  function bind(root) {
    const r = root && root.querySelector('#collRange'); if (!r) return;
    const refresh = () => {
      const S = APP().state; if (!S) return;
      const sum = +r.value;
      const lbl = root.querySelector('#collSum'), res = root.querySelector('#collRes');
      if (lbl) lbl.textContent = fm(sum);
      if (res) res.innerHTML = calcHtml(S, sum, CL.plan(S, sum));
      const go = root.querySelector('[data-act="collTake"]'); if (go) go.textContent = `Взять ${fm(sum)}`;
      ui.sum = sum;
    };
    r.addEventListener('input', refresh);
  }

  /* ---------------- карточка точки и карта ---------------- */
  function storeLine(S, st) {
    const l = CL.loanOf(S, st.id);
    if (!l) {
      const lim = CL.limit(S, st);
      if (lim < BK.CFG.COLL.MIN * S.macro.priceLevel) return '';
      return `<div class="sec coll-store"><h3>Кредит под залог</h3><div class="kv"><span>Можно взять под эту точку</span><span><b>${fm(lim)}</b> · оценка ${fm(CL.value(S, st))}</span></div>
        <button class="btn block" data-act="collStore" data-arg="${st.id}"${CL.banned(S) ? ' disabled' : ''}>${CL.banned(S) ? 'Банк не даёт кредитов' : 'Взять под залог'}</button></div>`;
    }
    const info = CL.list(S).find((x) => x.id === l.id) || {};
    return `<div class="sec coll-store"><h3><span class="coll-h">${LOCK}Точка в залоге банка</span></h3>
      <div class="coll-nums">
        <span><small>Осталось вернуть</small><b>${fm(info.remain)}</b></span>
        <span><small>Платёж 1-го числа</small><b>${fm(info.pay)}</b></span>
        <span><small>Осталось платежей</small><b>${info.left}</b></span>
      </div>
      ${info.missed ? `<div class="coll-late">Просрочка ${info.missed}-й месяц${info.missed === 1 ? '' : 'а'}: ${BK.CFG.COLL.SEIZE_MONTHS - info.missed === 1 ? 'ещё месяц — и банк заберёт точку' : `до изъятия ${BK.CFG.COLL.SEIZE_MONTHS - info.missed} мес.`}</div>` : ''}
      <div class="row"><button class="btn sm" data-act="collRepay" data-arg="${l.id}">Погасить досрочно</button>${info.missed && !info.restruct ? `<button class="btn sm danger" data-act="collRestruct" data-arg="${l.id}">Реструктуризация</button>` : ''}</div>
      <span class="hint">Пока кредит не погашен, точку нельзя закрыть или продать.</span></div>`;
  }
  // значок на карте: точка в залоге
  function mapBadge(S, st, x, y) {
    if (!CL.state(S) || !CL.loanOf(S, st.id)) return '';
    return `<g class="m-bdg coll" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="7.5"/><path d="M-3,-0.5 h6 M-1.5,-3 v3 M0.5,-3.6 v3.6" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></g>`;
  }
  function tip(S, st) { return CL.state(S) && CL.loanOf(S, st.id) ? '<br><span class="coll-tip">В залоге банка</span>' : ''; }

  /* ---------------- уведомления ---------------- */
  function notify(n) {
    const S = APP().state; if (!S) return;
    const box = document.getElementById('toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast colltoast ' + (n.phase === 'seized' ? 'bad' : n.phase === 'missed' ? 'warn' : 'good');
    el.setAttribute('role', 'status');
    if (n.phase === 'missed') {
      el.innerHTML = `<span class="mi" aria-hidden="true">${LOCK}</span><span class="mt"><span class="ey">Просрочка по залогу</span><b>Платёж ${fm(n.due)} не прошёл</b><span class="md">${n.left === 1 ? 'Ещё месяц — и банк заберёт точку.' : `Месяцев до изъятия точки: ${n.left}.`}${n.canRestruct ? ' Можно взять реструктуризацию.' : ''}</span></span>`;
      el.title = 'Открыть залог';
      el.addEventListener('click', () => { el.remove(); openModal(); });
    } else if (n.phase === 'seized') {
      el.innerHTML = `<span class="mi" aria-hidden="true">${LOCK}</span><span class="mt"><span class="ey">Банк забрал точку</span><b>Точка №${n.num}</b><span class="md">Долг ${fm(n.sum)} закрыт. Новые кредиты — до ${E().fmtDate(n.until)}.</span></span>`;
    } else {
      el.innerHTML = `<span class="mi" aria-hidden="true">${LOCK}</span><span class="mt"><span class="ey">Залог снят</span><b>Точка №${n.num}</b><span class="md">Кредит ${esc(n.why || 'закрыт')} — точку снова можно закрыть или продать.</span></span>`;
    }
    setTimeout(() => el.remove(), 9000);
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    if (BK.Sound) BK.Sound.play(n.phase === 'seized' ? 'bad' : n.phase === 'missed' ? 'warn' : 'coin');
  }

  /* ---------------- действия ---------------- */
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    Object.assign(A, {
      coll: () => openModal(),
      collPick: (d) => { ui.storeId = d.arg; ui.sum = 0; openModal('keep'); },
      collStore: (d) => { ui.storeId = d.arg; ui.sum = 0; openModal(); },
      collTake: () => {
        const S = APP().state; if (!S) return;
        const r = CL.take(S, ui.storeId, ui.sum);
        if (r.ok) { APP().toast('Деньги под залог точки', `${fm(r.sum)} на счёт. Платёж ${fm(r.loan.pay)} 1-го числа.`, 'warn'); ui.sum = 0; }
        else APP().toast('Не получилось', r.msg, 'warn');
        APP().save(); APP().refresh(); openModal('keep');
      },
      collRepay: (d) => {
        const S = APP().state; if (!S) return;
        const l = CL.list(S).find((x) => x.id === d.arg); if (!l) return;
        const r = CL.repay(S, d.arg, l.remain);
        if (r.ok) APP().toast('Погашено досрочно', `${fm(r.paid)}. Осталось ${fm(Math.max(0, l.remain - r.paid))}.`, 'good');
        else APP().toast('Не получилось', r.msg, 'warn');
        APP().save(); APP().refresh(); if (inModal()) openModal('keep');
      },
      collRestruct: (d) => {
        const S = APP().state; if (!S) return;
        const r = CL.restructure(S, d.arg);
        if (r.ok) APP().toast('Реструктуризация', `Комиссия ${fm(r.fee)}. ${BK.CFG.COLL.RESTRUCT_MONTHS} месяца платим только проценты.`, 'warn');
        else APP().toast('Не получилось', r.msg, 'warn');
        APP().save(); APP().refresh(); if (inModal()) openModal('keep');
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.CollUI = { block, open: openModal, modalHtml, storeLine, mapBadge, tip, notify, LOCK, ICON };
})();
