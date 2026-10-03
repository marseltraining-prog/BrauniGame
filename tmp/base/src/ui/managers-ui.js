/* Управляющие точек — интерфейс (логика — src/managers.js, BK.Managers).
   Где видно: «На согласование» в «Сводке» над «Требует внимания» (карточки «Сделать / Не делать» с ценой и значками последствий),
   блок «Управляющие» в «Сводке» (кто за какие точки, когда доклад, статистика), строка в «Требует внимания», когда можно нанять
   или точки остались без присмотра, предложения по точке — в карточке точки, окно «Управляющие» (найм, качества, итоги, история).
   В panels.js / app.js — только хуки (BK.ManagersUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const MG = BK.Managers, APP = () => BK.App, H = () => BK.UIH;
  const fm = (v) => BK.fmtMoney(v), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M8.5 11l2 2 4-4"/><path d="M8.5 17h7"/></svg>';
  const ini = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  const dots = (v, lab) => { const n = Math.max(1, Math.min(5, Math.round(v))); return `<span class="mgr-dots" role="img" aria-label="${lab}: ${n} из 5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const obsN = (m) => 1 + 4 * (m.obs - 0.12) / 0.85, accN = (m) => 1 + 4 * (m.acc - 0.45) / 0.53;
  const qual = (m) => `<div class="mgr-q"><span>Наблюдательность ${dots(obsN(m), 'Наблюдательность')}</span><span>Точность советов ${dots(accN(m), 'Точность')}</span><span>Доклад раз в ${m.freq} дн.</span></div>`;
  const nums = (S, ids) => {
    const n = ids.map((id) => (S.stores.find((x) => x.id === id) || {}).num).filter((x) => x != null).sort((a, b) => a - b);
    if (!n.length) return 'точек пока нет';
    const parts = []; let a = n[0], b = n[0];
    for (let i = 1; i <= n.length; i++) { if (n[i] === b + 1) { b = n[i]; continue; } parts.push(a === b ? `№${a}` : `№${a}–${b}`); a = b = n[i]; }
    return parts.join(', ');
  };

  /* ---------- значки последствий (как в окне события: ₽ — факт, остальное — по мнению управляющего) ---------- */
  function fx(S, p) {
    const IC = BK.FX_IC || {}, R = Math.max(S.lastMonthRev || 0, 1e6);
    const out = [];
    const money = (p.cost / 12 + p.monthly) / R * 100, mn = !(p.cost > 0 || p.monthly > 0) ? 0 : money < 5 ? 1 : money < 20 ? 2 : 3; // любой расход — хотя бы ▼
    out.push(`<span class="fxc ${mn ? 'dn' : 'zero'}" title="Деньги: ${mn ? 'расход' : 'почти без затрат'}">${IC.rub || '₽'}<span class="ar">${mn ? '▼'.repeat(mn) : '·'}</span></span>`);
    for (const [k, lab, nm] of [['team', 'Команда', 'Команда'], ['guests', 'Гости', 'Гости'], ['check', 'Чек', 'Средний чек']]) {
      const v = p.fx[k] || 0; if (!v && k === 'check') continue;
      const n = Math.min(3, Math.abs(v)), cls = !v ? 'zero' : v > 0 ? 'up' : 'dn';
      out.push(`<span class="fxc ${cls}" title="${nm}: ${!v ? 'без изменений' : v > 0 ? 'лучше' : 'хуже'} (по мнению управляющего)">${IC[k === 'guests' ? 'guests' : k] || ''}<span class="fxn">${lab}</span><span class="ar">${v ? (v > 0 ? '▲' : '▼').repeat(n) : '·'}</span></span>`);
    }
    return out.join('');
  }
  function card(S, p, opt) {
    const R = S.managers, m = R.list.find((x) => x.id === p.mid) || { name: 'Управляющий', female: false };
    const left = Math.max(0, p.until - S.day), st = p.storeId ? S.stores.find((x) => x.id === p.storeId) : null;
    const price = `<span class="mgr-price"><span><small>Сразу</small><b>${p.cost ? fm(p.cost) : 'бесплатно'}</b></span>${p.monthly ? `<span><small>В месяц</small><b>+${fm(p.monthly)}</b></span>` : ''}</span>`;
    return `<article class="mgr-card" data-pid="${p.id}" aria-label="Предложение управляющего: ${esc(p.title)}">
      <div class="mgr-ch"><span class="mgr-av" aria-hidden="true">${esc(ini(m.name))}</span><span class="mgr-who">${esc(m.name)}<small>управляющ${m.female ? 'ая' : 'ий'}${st && !(opt && opt.inStore) ? ` · №${st.num}` : ''}</small></span><span class="mgr-left${left <= 2 ? ' soon' : ''}" title="Не ответите — предложение сгорит">${left ? `сгорит через ${nw(left, 'день', 'дня', 'дней')}` : 'сгорит сегодня'}</span></div>
      <div class="mgr-t">${esc(p.title)}</div>
      <div class="mgr-why">«${esc(p.why)}»</div>
      ${p.fact ? `<div class="mgr-fact"><b>Факты:</b> ${esc(p.fact)}</div>` : ''}
      <div class="mgr-row">${price}<span class="mgr-fx" title="₽ — расход точно, остальное — как считает управляющий">${fx(S, p)}</span></div>
      <div class="mgr-acts"><button class="btn primary" data-act="mgrYes" data-arg="${p.id}"${p.cost > 0 && S.cash < p.cost ? ' disabled title="Не хватает денег на счёте"' : ''}>Сделать</button><button class="btn" data-act="mgrNo" data-arg="${p.id}">Не делать</button>${st && !(opt && opt.inStore) ? `<button class="linkbtn" data-act="openStore" data-arg="${st.id}">К точке №${st.num}</button>` : ''}</div>
    </article>`;
  }

  // «На согласование» — над «Требует внимания»
  function inboxBlock(S) {
    if (!MG.any(S)) return '';
    const list = MG.open(S).slice().sort((a, b) => a.until - b.until);
    if (!list.length) return '';
    return `<div class="sec mgr-inbox" id="mgrInbox"><h3><span class="mgr-h">${ICON}На согласование<span class="count">${list.length}</span></span><button class="linkbtn" data-act="mgrOpen">Управляющие →</button></h3>
      <p class="hint mgr-lead">Управляющий сам ничего не делает — только предлагает. «Сделать» исполняется сразу.</p>
      ${list.map((p) => card(S, p)).join('')}</div>`;
  }

  // блок «Управляющие» в «Сводке»
  function dashBlock(S) {
    if (S.phase !== 'play') return '';
    const K = BK.CFG.MANAGERS, open = S.stores.filter((st) => st.status !== 'opening').length;
    if (!MG.any(S)) {
      if (!MG.unlocked(S)) return open >= K.UNLOCK_STORES - 2 ? `<div class="sec mgr-dash lazy"><h3><span class="mgr-h">${ICON}Управляющие</span></h3><div class="hint">С ${K.UNLOCK_STORES} открытых точек можно нанять управляющего: он следит за людьми и точками и приносит готовые решения на согласование. Сейчас — ${open}.</div></div>` : '';
      const R = MG.ensure(S);
      if (!R.cand.length) MG.refreshCand(S);
      const lo = Math.min(...R.cand.map((c) => MG.salary(S, c))), hi = Math.max(...R.cand.map((c) => MG.salary(S, c)));
      return `<div class="sec mgr-dash"><h3><span class="mgr-h">${ICON}Управляющие</span></h3><p class="hint" style="margin:0">Меньше рутины: управляющий следит за людьми и точками и раз в 1–3 недели приносит 0–3 предложения — «Сделать» или «Не делать». Сам ничего не делает. Чем внимательнее и точнее — тем дороже: ${R.cand.length > 1 ? `${fm(lo)}–${fm(hi)}` : fm(lo)} в месяц, найм — 2 оклада.</p><div>${`<button class="btn sm primary" data-act="mgrOpen">Выбрать управляющего</button>`}</div></div>`;
    }
    const R = S.managers, cv = MG.coverage(S);
    let s = `<div class="sec mgr-dash"><h3><span class="mgr-h">${ICON}Управляющие</span><button class="linkbtn" data-act="mgrOpen">Все →</button></h3>`;
    for (const m of R.list) {
      const st = MG.stats(S, m), nx = Math.max(0, m.next - S.day);
      s += `<div class="mgr-line"><span class="mgr-av" aria-hidden="true">${esc(ini(m.name))}</span><div class="tx"><b>${esc(m.name)}</b><span class="hint">${nums(S, cv.map[m.id])} · доклад ${nx ? `через ${nw(nx, 'день', 'дня', 'дней')}` : 'сегодня'} · ${fm(MG.salary(S, m))}/мес</span><span class="hint">Предложил ${st.prop}, сделано ${st.yes}${st.good + st.bad ? ` · итог: полезных ${st.good}, лишних ${st.bad}` : ''}</span></div></div>`;
    }
    if (cv.free.length) s += `<div class="hint warnc">Без присмотра: ${nums(S, cv.free)} — ${R.list.length < MG.maxManagers(S) ? 'наймите ещё одного управляющего' : 'управляющие загружены полностью'}.</div>`;
    return s + '</div>';
  }

  // «Требует внимания»: можно нанять / точки без присмотра
  function attItems(S) {
    const out = [];
    if (!MG.unlocked(S)) return out;
    if (!MG.any(S)) out.push({ lvl: 'info', ic: 'team', icHtml: ICON, t: 'Можно нанять управляющего', d: 'Сеть выросла до 5 точек: управляющий будет приносить готовые решения на согласование.', b: { act: 'mgrOpen', label: 'Кандидаты' } });
    else { const cv = MG.coverage(S); if (cv.free.length && S.managers.list.length < MG.maxManagers(S)) out.push({ lvl: 'info', ic: 'team', icHtml: ICON, t: `${nw(cv.free.length, 'точка', 'точки', 'точек')} без управляющего`, d: `${nums(S, cv.free)} — один управляющий тянет 8–10 точек.`, b: { act: 'mgrOpen', label: 'Нанять' } }); }
    return out;
  }

  // карточка точки
  function storeBlock(S, st) {
    if (!MG.any(S)) return '';
    const m = MG.managerOf(S, st.id), list = MG.forStore(S, st.id);
    if (!m && !list.length) return '';
    return `<div class="sec mgr-store"><h3><span class="mgr-h">${ICON}Управляющий</span>${m ? `<small>${esc(m.name)}</small>` : ''}</h3>${list.length ? list.map((p) => card(S, p, { inStore: true })).join('') : `<div class="hint">${m ? 'Предложений по этой точке сейчас нет.' : 'Точка без присмотра — наймите ещё одного управляющего.'}</div>`}</div>`;
  }

  /* ---------- окно «Управляющие» ---------- */
  const VERD = { yes: 'сделано', no: 'не делали', exp: 'сгорело' };
  function modalHtml(S) {
    const R = MG.ensure(S), K = BK.CFG.MANAGERS, ui = APP().ui;
    if (MG.unlocked(S) || MG.any(S)) MG.refreshCand(S);
    const cv = MG.coverage(S);
    let s = `<div class="modal-h"><span class="eyebrow">Управляющие точек</span><h2>${R.list.length ? 'Ваши управляющие' : 'Нанять управляющего'}</h2></div><div class="modal-b mgr-m">
      <p class="hint" style="margin:0">Управляющий <b>ничего не делает сам</b>: следит за людьми и точками и раз в N дней приносит 0–3 предложения — «Сделать» (исполняется сразу) или «Не делать». Не ответили за ${K.EXPIRE_DAYS} дн. — предложение сгорает. <b>Наблюдательный</b> замечает больше и раньше, <b>точный</b> реже советует лишнее — слабый иногда предложит ненужный найм или вредную скидку. Под каждым советом — факты, чтобы проверить. Один управляющий — ${K.STORES_PER}–${K.STORES_PER + K.CAP_OBS} точек.</p>`;
    for (const m of R.list) {
      const st = MG.stats(S, m), conf = ui.mgrFire === m.id;
      s += `<div class="mgr-person"><div class="mgr-ph"><span class="mgr-av lg" aria-hidden="true">${esc(ini(m.name))}</span><div class="tx"><b>${esc(m.name)}</b><span class="hint">${esc(m.bio)}</span></div><span class="mgr-sal">${fm(MG.salary(S, m))}<small>в месяц</small></span></div>
        ${qual(m)}
        <div class="mgr-stats"><span><b>${st.prop}</b>предложил</span><span><b>${st.yes}</b>сделано</span><span><b>${st.no}</b>не делали</span><span><b>${st.exp}</b>сгорело</span><span class="${st.good + st.bad ? '' : 'mut'}"><b>${st.good}/${st.bad}</b>полезных / лишних</span><span class="${st.val >= 0 ? 'pos' : 'negc'}"><b>${st.good + st.bad ? (st.val >= 0 ? '+' : '') + fm(st.val) : '—'}</b>польза в мес. (оценка)</span></div>
        <div class="row sp"><span class="hint">Точки: ${nums(S, cv.map[m.id])} · вместимость ${MG.capOf(m)}${st.wait ? ` · итог ${nw(st.wait, 'совета', 'советов', 'советов')} — через ${K.VERDICT_DAYS} дн. после решения` : ''}</span>
        ${conf ? `<span class="row"><button class="btn sm danger" data-act="mgrFire" data-arg="${m.id}">Уволить (${fm(MG.salary(S, m) * K.FIRE_SALARIES)})</button><button class="btn sm" data-act="mgrFireNo">Отмена</button></span>` : `<button class="btn sm" data-act="mgrFireAsk" data-arg="${m.id}">Уволить</button>`}</div></div>`;
    }
    if (cv.free.length && R.list.length) s += `<div class="hint warnc">Без присмотра: ${nums(S, cv.free)}.</div>`;
    const can = R.list.length < MG.maxManagers(S);
    s += `<div class="sec mgr-cands"><h3>Кандидаты${R.cand.length ? ` <small>обновятся через ${nw(Math.max(1, K.POOL_DAYS - (S.day - R.candDay)), 'день', 'дня', 'дней')}</small>` : ''}</h3>`;
    if (!MG.unlocked(S) && !R.list.length) s += `<div class="hint">С ${K.UNLOCK_STORES} открытых точек.</div>`;
    else if (!can) s += `<div class="hint">Сейчас хватает ${nw(R.list.length, 'управляющего', 'управляющих', 'управляющих')}: один на ${K.STORES_PER} точек. Следующий понадобится, когда сеть вырастет.</div>`;
    else s += R.cand.map((c) => { const why = MG.whyNot(S, c.id); return `<div class="mgr-person cand"><div class="mgr-ph"><span class="mgr-av lg" aria-hidden="true">${esc(ini(c.name))}</span><div class="tx"><b>${esc(c.name)}</b><span class="hint">${esc(c.bio)}</span></div><span class="mgr-sal">${fm(MG.salary(S, c))}<small>в месяц</small></span></div>${qual(c)}<div class="row sp"><span class="hint">Найм — ${fm(MG.hireCost(S, c))} (2 оклада) · до ${MG.capOf(c)} точек</span><button class="btn sm primary" data-act="mgrHire" data-arg="${c.id}"${why ? ` disabled title="${esc(why)}"` : ''}>Нанять</button></div>${why ? `<div class="hint warnc">${esc(why)}</div>` : ''}</div>`; }).join('') || '<div class="hint">Кандидатов пока нет.</div>';
    s += '</div>';
    const hist = R.done.slice(0, 12);
    if (hist.length) s += `<div class="sec mgr-hist"><h3>Последние решения</h3>${hist.map((d) => { const v = d.st === 'yes' ? (d.v ? (d.right ? '<span class="chip good">полезно</span>' : '<span class="chip bad">лишнее</span>') : '<span class="chip">итог позже</span>') : `<span class="chip">${VERD[d.st]}</span>`; return `<div class="mgr-hl"><span class="hint">${BK.Engine.fmtDate(d.ans)}</span><span>${esc(d.title)}</span>${v}</div>`; }).join('')}</div>`;
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  function open(keep) {
    const S = APP().state; if (!S) return;
    APP().openModal(modalHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const m = document.querySelector('#modal .modal'); if (m) m.classList.add('mgr-modal');
  }
  const inModal = () => !!(APP().ui.modal && document.querySelector('#modal .mgr-modal'));
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    Object.assign(A, {
      mgrOpen: () => open(),
      mgrHire: (d) => { const S = APP().state, r = MG.hire(S, d.arg); if (r.ok) APP().toast('Управляющий нанят', `${r.m.name}: первый доклад — в течение недели.`, 'good'); else APP().toast('Не получилось', r.msg, 'warn'); APP().save(); open('keep'); APP().refresh(); },
      mgrFireAsk: (d) => { APP().ui.mgrFire = d.arg; open('keep'); },
      mgrFireNo: () => { APP().ui.mgrFire = null; open('keep'); },
      mgrFire: (d) => { const S = APP().state, r = MG.fire(S, d.arg); APP().ui.mgrFire = null; if (r.ok) APP().toast('Управляющий уволен', `Компенсация ${fm(r.comp)}.`, 'warn'); APP().save(); open('keep'); APP().refresh(); },
      mgrYes: (d) => { const S = APP().state, r = MG.accept(S, d.arg); if (r.ok) APP().toast('Сделано', r.p.title, 'good'); else APP().toast('Не получилось', r.msg, 'warn'); APP().save(); if (inModal()) open('keep'); APP().refresh(); },
      mgrNo: (d) => { const S = APP().state, r = MG.reject(S, d.arg); if (!r.ok) APP().toast('Не получилось', r.msg, 'warn'); APP().save(); APP().refresh(); },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.ManagersUI = { inboxBlock, dashBlock, attItems, storeBlock, open, modalHtml, card, ICON };
})();
