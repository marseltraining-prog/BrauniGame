/* Личные тренеры игрока — интерфейс (логика и анализ — src/trainers.js, BK.Trainers).
   Где видно: блок «Личные тренеры» в «Сводке» (навыки, шкала обучения, кнопка), подсказки с лампочкой в «Требует внимания»,
   лампочка у точки на карте и строка во всплывающей подсказке, блок «Взгляд тренера» в карточке точки,
   окно «Личные тренеры» (найм по областям и уровням, загрузка обучения, все подсказки).
   В panels.js / map.js / app.js — только хуки (BK.TrainersUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const TR = BK.Trainers, APP = () => BK.App, H = () => BK.UIH;
  const fm = (v) => BK.fmtMoney(v), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const LAMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
  const LAMP_MAP = '<path class="m-bdg-l" d="M-2.2,3.2 h4.4 M0,-4.4 a3.1,3.1 0 0 0 -1.9,5.6 c.4,.3 .5,.7 .5,1.2 h2.8 c0,-.5 .1,-.9 .5,-1.2 A3.1,3.1 0 0 0 0,-4.4 z"/>';
  const dots = (n, max) => `<span class="trn-dots" aria-label="уровень ${n} из ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

  /* ---------- как подсказка выглядит при уровне навыка ---------- */
  function view(h) {
    const A = TR.AREA[h.area];
    if (h.lvl === 1) return { t: esc(h.cause), d: `Навык «${A.short}» 1-го уровня видит сигнал, но не место. Где и почему — скажет тренер 2-го уровня.`, b: { act: 'trainers', label: 'Тренеры' } };
    if (h.lvl === 2) return { t: `${esc(h.where)}`, d: `${esc(cap(h.cause))}. <span class="trn-more">Цифры и что сделать — навык 3-го уровня.</span>`, b: h.go ? { act: h.go.act, arg: h.go.arg, label: 'Посмотреть' } : null };
    return { t: `${esc(h.where)}: ${esc(h.cause)}`, d: `${esc(cap(h.detail))}. <b>Что сделать:</b> ${esc(h.todo)}.`, b: h.go || null };
  }
  const tag = (h) => `<span class="trn-tag" title="Подсказка навыка «${esc(TR.AREA[h.area].name)}», уровень ${h.lvl}">${esc(TR.AREA[h.area].short)} ${h.lvl}</span>`;
  const btnHtml = (b, cls) => (b ? `<button class="btn ${cls || ''}" data-act="${b.act}"${b.arg != null ? ` data-arg="${esc(b.arg)}"` : ''}>${esc(b.label)}</button>` : '');

  // «Требует внимания»: лучшие подсказки (без тех, что и так там есть)
  function attItems(S) {
    if (!TR.any(S)) return [];
    const K = BK.CFG.TRAINERS;
    return TR.hints(S).filter((h) => !h.dup).slice(0, K.ATT_MAX).map((h) => { const v = view(h); return { lvl: h.sev >= 1.6 ? 'warn' : 'info', ic: 'lamp', icHtml: LAMP, trn: true, t: `${v.t}${tag(h)}`, d: v.d, b: v.b }; });
  }

  // блок в «Сводке»
  function dashBlock(S) {
    if (S.phase !== 'play') return '';
    const P = TR.ensure(S), K = BK.CFG.TRAINERS, AR = TR.AREA;
    let s = `<div class="sec trn-dash"><h3><span>Личные тренеры</span><button class="linkbtn" data-act="trainers">Все тренеры →</button></h3>`;
    for (const x of P.study) {
      const p = x.done / x.days;
      s += `<div class="trn-prog"><div class="trn-pl"><span>${esc(AR[x.area].short)} → уровень ${x.tier}</span><small>ещё ${x.days - x.done} дн.</small></div><div class="meter ok" role="progressbar" aria-label="Обучение: ${esc(AR[x.area].name)}" aria-valuenow="${Math.round(p * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`;
    }
    const has = TR.AREAS.filter((a) => TR.skill(S, a) > 0);
    if (has.length) {
      const n = TR.hints(S).length;
      s += `<div class="trn-skills">${has.map((a) => `<span class="chip trn-chip" title="${esc(AR[a].name)}: ${esc(TR.LEVELS[TR.skill(S, a)])}">${LAMP}${esc(AR[a].short)} ${TR.skill(S, a)}</span>`).join('')}</div>`;
      s += `<div class="hint">${n ? `Навыки видят ${n} ${H().plural(n, 'проблему', 'проблемы', 'проблем')}: главные — в «Требует внимания» (лампочка), на карте и в карточках точек. <button class="linkbtn trn-all" data-act="trainers" data-arg="hints">Все подсказки →</button>` : 'Навыки не видят проблем — сеть в порядке.'}</div>`;
    } else if (!P.study.length) {
      const p = TR.price(S, 'sales', 1);
      s += `<p class="hint" style="margin:0">Наймите тренера для себя: он научит замечать проблемы — где низкий чек, кто на грани увольнения, что съедает прибыль. Чем дороже тренер, тем точнее подсказки. От ${fm(p.fee)}.</p><div>${btnHtml({ act: 'trainers', label: 'Выбрать тренера' }, 'sm primary')}</div>`;
    } else s += `<div class="hint">Пока идёт обучение, подсказок нет. Загрузка: ${P.study.length} из ${K.MAX_PARALLEL}.</div>`;
    return s + '</div>';
  }

  // карточка точки
  function storeBlock(S, st) {
    if (!TR.any(S)) return '';
    const list = TR.forStore(S, st.id);
    if (!list.length) {
      const top = TR.AREAS.filter((a) => a !== 'corp').map((a) => TR.skill(S, a)).reduce((a, b) => Math.max(a, b), 0);
      return top >= 2 ? `<div class="sec trn-store"><h3>${LAMP}Взгляд тренера</h3><div class="hint">По вашим навыкам проблем у этой точки не видно.</div></div>` : '';
    }
    return `<div class="sec trn-store"><h3>${LAMP}Взгляд тренера</h3>${list.map((h) => { const v = view(h); return `<div class="trn-hint lv${h.lvl}"><div class="tx"><div class="tt">${esc(cap(h.cause))}${tag(h)}</div><div class="ds">${h.lvl >= 3 ? `${esc(cap(h.detail))}. <b>Что сделать:</b> ${esc(h.todo)}.` : '<span class="trn-more">Цифры и что сделать — навык 3-го уровня.</span>'}</div></div>${h.lvl >= 3 && h.go && h.go.act !== 'openStore' ? btnHtml(h.go, 'sm') : ''}</div>`; }).join('')}</div>`;
  }

  // карта: лампочка у точки (подсказка уровня 2+) и у кластера, если в нём есть такая точка
  function mapBadge(S, st, x, y) {
    if (!TR.any(S) || !TR.forStore(S, st.id).length) return '';
    return `<g class="m-bdg trn" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="7.5"/>${LAMP_MAP}</g>`;
  }
  function clusterBadge(S, items, x, y) {
    if (!TR.any(S) || !items.some((st) => TR.forStore(S, st.id).length)) return '';
    return mapBadge(S, items.find((st) => TR.forStore(S, st.id).length), x, y);
  }
  function tip(S, st) {
    if (!TR.any(S)) return '';
    const l = TR.forStore(S, st.id); if (!l.length) return '';
    return `<br><span class="trn-tip">Тренер: ${esc(l[0].cause)}${l.length > 1 ? ` (+${l.length - 1})` : ''}</span>`;
  }

  /* ---------- окно «Личные тренеры» ---------- */
  function modalHtml(S) {
    const P = TR.ensure(S), K = BK.CFG.TRAINERS, AR = TR.AREA;
    let s = `<div class="modal-h"><span class="eyebrow">Личные тренеры</span><h2>Чему научиться самому</h2></div><div class="modal-b trn-m">
      <p class="hint" style="margin:0">Тренер учит <b>вас</b> замечать проблемы. Навык не меняет цифры сам — он подсвечивает, куда смотреть: в «Требует внимания», на карте (лампочка у точки) и в карточке точки. Уровень 1 — общий сигнал, 2 — где и почему, 3 — цифры, что сделать и кнопка перехода; он же замечает проблему раньше.</p>
      <div class="trn-load"><span>Загрузка обучения</span>${dots(P.study.length, K.MAX_PARALLEL)}<b>${P.study.length} из ${K.MAX_PARALLEL}</b>${P.study.length ? `<small>1-го числа — ${fm(TR.monthFee(S))}</small>` : ''}</div>`;
    for (const a of TR.AREAS) {
      const A = AR[a], L = TR.skill(S, a), st = TR.studying(S, a), open = TR.areaOpen(S, a);
      s += `<div class="trn-area${open ? '' : ' locked'}" data-area="${a}"><div class="trn-ah"><b>${esc(A.name)}</b>${dots(L, 3)}<span class="hint">${L ? `уровень ${L} — ${TR.LEVELS[L]}` : 'нет навыка'}</span></div><div class="hint">${esc(cap(A.desc))}.</div>`;
      if (!open) { s += `<div class="hint warnc">Откроется во втором акте — после выхода в Россию. Тренеры уровня страны: от ${fm(TR.price(S, a, 1).fee)}.</div></div>`; continue; }
      if (st) {
        const p = st.done / st.days, pr = TR.price(S, a, st.tier);
        s += `<div class="trn-prog"><div class="trn-pl"><span>Учитесь: ${esc(pr.name)} → уровень ${st.tier}</span><small>${st.done} из ${st.days} дн.</small></div><div class="meter ok"><i style="width:${(p * 100).toFixed(1)}%"></i></div><div class="row sp"><span class="hint">${fm(st.month)} 1-го числа, пока идёт обучение</span><button class="btn sm" data-act="trCancel" data-arg="${a}" title="Оплаченное не возвращается">Прервать</button></div></div>`;
      }
      s += '<div class="trn-tiers">';
      for (let t = 1; t <= 3; t++) {
        const p = TR.price(S, a, t), why = TR.whyNot(S, a, t), done = L >= t, now = st && st.tier === t;
        s += `<button class="trn-tier${done ? ' done' : ''}${now ? ' now' : ''}" data-act="trHire" data-arg="${a}" data-arg2="${t}"${why ? ` disabled title="${esc(why)}"` : ''}>
          <span class="tl">Уровень ${t} · ${esc(TR.LEVELS[t])}</span><b>${esc(p.name)}</b><span class="tw">${esc(p.who)}</span>
          <span class="tc">${done ? 'освоено' : now ? 'идёт обучение' : `${fm(p.fee)} + ${fm(p.month)}/мес · ${p.days} дн.`}</span></button>`;
      }
      s += '</div></div>';
    }
    const hs = TR.hints(S);
    s += `<div class="sec trn-hints" id="trnHints"><h3>Что подсвечивают навыки${hs.length ? ` <small>${hs.length}</small>` : ''}</h3>`;
    if (!TR.any(S)) s += '<div class="hint">Навыков пока нет — подсказки появятся после первого обучения.</div>';
    else if (!hs.length) s += '<div class="hint">Проблем не видно — сеть в порядке.</div>';
    else s += hs.map((h) => { const v = view(h); return `<div class="trn-hint lv${h.lvl}"><span class="ic">${LAMP}</span><div class="tx"><div class="tt">${v.t}${tag(h)}</div><div class="ds">${v.d}</div></div>${v.b && v.b.act !== 'trainers' ? btnHtml(v.b, 'sm') : ''}</div>`; }).join('');
    s += `</div></div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  function open(scrollTo) {
    const S = APP().state; if (!S) return;
    APP().openModal(modalHtml(S), { closable: true, keepScroll: scrollTo === 'keep' });
    const m = document.querySelector('#modal .modal'); if (m) m.classList.add('trn-modal');
    if (scrollTo === 'hints') { const el = document.getElementById('trnHints'); if (el) el.scrollIntoView({ block: 'start' }); }
  }
  // переход из подсказки: действие закрывает окно тренеров
  const closeIfOpen = () => { if (APP().ui.modal && document.querySelector('#modal .trn-modal')) { APP().ui.modal = null; document.getElementById('modal').innerHTML = ''; } };
  function go(target) {
    const S = APP().state, A = APP().ACT; if (!S) return;
    const [k, id] = String(target).split(':');
    if (APP().ui.view !== 'russia' && APP().openRussia) APP().openRussia();
    if (k === 'city') A.ruSel({ arg: id });
    else if (k === 'dir') A.ruDir({ arg: id });
    else if (k === 'hq') A.tab({ arg: 'ruhq' });
    else if (k === 'inbox') A.tab({ arg: 'ruinbox' });
  }
  const WRAP = ['openStore', 'tab', 'pickCand', 'ruHireFor'];
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    Object.assign(A, {
      trainers: (d) => open(d && d.arg),
      trHire: (d) => {
        const S = APP().state, r = TR.hire(S, d.arg, +d.arg2);
        if (r.ok) APP().toast('Тренер нанят', `${r.price.name}: ${r.price.days} дн. обучения.`, 'good'); else APP().toast('Не получилось', r.msg, 'warn');
        APP().save(); open('keep'); APP().refresh();
      },
      trCancel: (d) => { const r = TR.cancel(APP().state, d.arg); if (r.ok) APP().toast('Обучение прервано', '', 'warn'); open('keep'); APP().refresh(); },
      trGo: (d) => { closeIfOpen(); go(d.arg); },
    });
    // кнопки подсказок в окне тренеров ведут к точке/вкладке — окно при этом закрывается
    for (const k of WRAP) { const f = A[k]; if (f && !f.__trn) { A[k] = function (d) { closeIfOpen(); return f.apply(this, arguments); }; A[k].__trn = true; } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.TrainersUI = { view, attItems, dashBlock, storeBlock, mapBadge, clusterBadge, tip, open, modalHtml, LAMP };
})();
