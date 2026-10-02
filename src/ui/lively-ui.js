/* =====================================================================
   «ЖИВОСТЬ» — интерфейс этапа В2 (vision-plan §4 п. 2–4).
   Три вещи на экране:
     1) «Вехи» в «Сводке» — короткое задание на пару недель, полоса прогресса, срок и награда;
        окно «Вехи» — как это работает, что уже взято, сколько не вышло;
     2) «Что говорят гости» в «Сводке» — три главные мысли сети за неделю (логика — src/thoughts.js);
     3) звук — кнопка в HUD и переключатель в «Меню игры» (логика — src/sound.js), монетки на 1-е число.
   В panels.js / app.js / extras.js — только хуки (BK.LivelyUI.*).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const ML = () => BK.Miles, TH = () => BK.Thoughts, APP = () => BK.App;
  const fm = (v) => BK.fmtMoney(v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/></svg>';
  const TALK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
  const RW_LABEL = { traffic: 'гостям сети', conv: 'конверсии', check: 'среднему чеку', aggOrders: 'заказам доставки' };

  /* ---------------- «Вехи» в «Сводке» ---------------- */
  function milesBlock(S) {
    if (!ML() || !ML().active(S)) return '';
    const st = ML().stats(S), cur = ML().info(S);
    const bonus = ML().bonuses(S);
    let rows = '';
    if (cur) {
      const soon = cur.left <= 4;
      rows = `<div class="mil-cur${soon ? ' soon' : ''}">
        <div class="mil-h"><span class="mil-tag">${esc(cur.group)}</span><b>${esc(cur.t)}</b><span class="mil-left">${cur.left ? `ещё ${nw(cur.left, 'день', 'дня', 'дней')}` : 'последний день'}</span></div>
        <div class="mil-d">${esc(cur.d)}</div>
        <div class="meter mil-m" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(cur.p * 100)}" aria-label="Прогресс вехи"><i style="width:${(cur.p * 100).toFixed(0)}%"></i></div>
        <div class="mil-f"><span class="mil-val">${esc(cur.show)}</span>${cur.rewardShort ? `<span class="mil-rw" title="Награда за веху">${esc(cur.rewardShort)}</span>` : ''}</div>
      </div>`;
    } else {
      rows = '<div class="mil-empty">Подбираем следующую веху…</div>';
    }
    if (bonus.length) {
      rows += `<div class="mil-bonus" title="Награды за взятые вехи работают прямо сейчас">${bonus.map((b) => `<span class="chip good">${b.mult ? `+${Math.round((b.k - 1) * 100)} %` : `+${b.add}`} к ${esc(RW_LABEL[b.t] || b.t)} · ещё ${nw(b.days, 'день', 'дня', 'дней')}</span>`).join('')}</div>`;
    }
    const taken = st.n ? `<span class="count">${st.n}</span>` : '';
    return `<div class="sec mil" id="milBlock"><h3><span class="mil-h3">${ICON}Вехи${taken}</span><button class="linkbtn" data-act="miles">Все вехи →</button></h3>
      <p class="hint mil-lead">${st.n ? 'Короткие задания: одно за раз. Взяли — небольшой бонус, не успели — ничего страшного.' : 'Короткие задания на пару недель — чтобы всегда было, к чему стремиться. За взятые — небольшой бонус.'}</p>
      ${rows}</div>`;
  }
  // строка в «Требует внимания», когда срок вехи подходит
  function attItems(S) {
    if (!ML() || !ML().active(S)) return [];
    const cur = ML().info(S); if (!cur || cur.left > 3) return [];
    return [{ lvl: 'info', ic: 'flag', icHtml: ICON, t: `Веха «${esc(cur.t)}» — ${cur.left ? nw(cur.left, 'день', 'дня', 'дней') : 'последний день'}`, d: `${esc(cur.show)} · ${esc(cur.d)}`, b: { act: 'miles', label: 'Вехи' } }];
  }

  /* ---------------- «Что говорят гости» в «Сводке» ---------------- */
  function talkBlock(S) {
    if (!TH()) return '';
    const ready = TH().ready(S);
    const list = ready ? TH().week(S, 3) : [];
    let body;
    if (!ready) { const d = Math.max(1, TH().days(S) + 1); body = `<p class="hint" style="margin:0">Собираем первые впечатления: ${nw(Math.min(d, 7), 'день', 'дня', 'дней')} из недели. Итог появится в конце недели — а прямо сейчас мысли гостей видно «вблизи», в карточке точки.</p>`; }
    else if (!list.length) body = `<p class="hint" style="margin:0">Гости всем довольны и молчат — ни жалоб, ни восторгов.</p>`;
    else body = `<ul class="talk-l">${list.map((r) => `<li class="talk-${r.tone}"><span class="talk-i" aria-hidden="true">${TALK_ICON}</span><div class="talk-tx"><b>${esc(r.t)}</b><small>${r.n > 1 ? `на ${r.n} ${plural(r.n, 'точке', 'точках', 'точках')}` : 'на точке'} · ${esc(r.todo)}</small></div><button class="linkbtn" data-act="tab" data-arg="${r.act}">${esc(r.label)}</button></li>`).join('')}</ul>`;
    return `<div class="sec talk" id="talkBlock"><h3><span class="talk-h3">${TALK_ICON}Что говорят гости<small>за неделю</small></span></h3>${body}
      <p class="hint talk-foot">Мысли гостей видно и «вблизи» — в карточке точки, по часам.</p></div>`;
  }

  /* ---------------- окно «Вехи» ---------------- */
  function modalHtml(S) {
    const st = ML().stats(S), cur = ML().info(S);
    const byGroup = {};
    for (const k of ML().ORDER) (byGroup[ML().GROUP[k]] || (byGroup[ML().GROUP[k]] = [])).push(k);
    const rowsOf = (keys) => keys.map((k) => {
      const now = cur && cur.k === k;
      const name = (ML().NAME && ML().NAME[k]) || k;
      return `<span class="mil-k${now ? ' now' : ''}" title="${now ? 'Выполняется сейчас' : esc(ML().KINDS[k].txt(S, { k, need: 0, base: 0, num: 0, got: 0 }).d)}">${esc(name)}</span>`;
    }).join('');
    let s = `<div class="modal-h"><span class="eyebrow">Живость · короткие задания</span><h2>Вехи</h2></div><div class="modal-b mil-m2">
      <p class="hint" style="margin:0">Веха — небольшая цель на пару недель. Игра выдаёт её сама, одну за раз: накормить гостей, подтянуть рейтинг точки, довести резерв, обучить людей. Взяли веху — награда работает ${plural(12, 'день', 'дня', 'дней')} (чуть больше гостей, чек или конверсия). Не успели — веха уходит без штрафа, придёт следующая.</p>
      <div class="mil-stat"><span><b>${st.n}</b>${plural(st.n, 'веха взята', 'вехи взяты', 'вех взято')}</span><span><b>${st.fail}</b>не вышло</span></div>`;
    if (cur) {
      s += `<div class="mil-cur big${cur.left <= 4 ? ' soon' : ''}"><div class="mil-h"><span class="mil-tag">${esc(cur.group)}</span><b>${esc(cur.t)}</b><span class="mil-left">${cur.left ? `ещё ${nw(cur.left, 'день', 'дня', 'дней')}` : 'последний день'}</span></div>
        <div class="mil-d">${esc(cur.d)}</div>
        <div class="meter mil-m" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(cur.p * 100)}"><i style="width:${(cur.p * 100).toFixed(0)}%"></i></div>
        <div class="mil-f"><span class="mil-val">${esc(cur.show)}</span>${cur.reward ? `<span class="mil-rw">${esc(cur.reward)}</span>` : ''}</div>
        <div class="row mil-acts"><button class="btn sm" data-act="milesOther">Взять другую веху</button></div></div>`;
    } else s += `<div class="mil-empty">Подбираем следующую веху… <button class="btn sm" data-act="milesNow">Взять веху сейчас</button></div>`;
    const act = ML().bonuses(S);
    if (act.length) s += `<div class="sec mil-bonus-sec"><h3>Сейчас работают награды</h3>${act.map((b) => `<div class="mil-bl"><span>${b.mult ? `+${Math.round((b.k - 1) * 100)} %` : `+${b.add}`} к ${esc(RW_LABEL[b.t] || b.t)}</span><b>ещё ${nw(b.days, 'день', 'дня', 'дней')}</b></div>`).join('')}</div>`;
    s += `<div class="sec"><h3>Какие бывают вехи</h3><div class="mil-groups">${Object.keys(byGroup).map((g) => `<div class="mil-g"><b>${esc(g)}</b><div class="mil-ks">${rowsOf(byGroup[g])}</div></div>`).join('')}</div><p class="hint">Игра выбирает то, что сейчас уместно: если в команде нехватка — предложит укомплектовать смены, если в точке просел рейтинг — подтянуть его.</p></div>`;
    const done = ML().done(S).slice(0, 14);
    if (done.length) s += `<div class="sec"><h3>Последние взятые</h3><div class="mil-hist">${done.map((d) => `<div class="mil-hl"><span>${esc(d.t || (ML().GROUP[d.k] || 'Веха'))}</span><b>${BK.Engine.fmtDate(d.day)}</b></div>`).join('')}</div></div>`;
    s += `<div class="sec"><div class="row sp"><span>Показывать вехи</span><div class="seg" role="group" aria-label="Показывать вехи">${[[1, 'Да'], [0, 'Нет']].map(([v, n]) => `<button type="button" data-act="milesOn" data-arg="${v}" aria-pressed="${String(!!st.on) === String(!!v)}">${n}</button>`).join('')}</div></div><p class="hint" style="margin:0">Выключить можно в любой момент — на игру это не влияет.</p></div>`;
    s += `</div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Закрыть</button></div>`;
    return s;
  }
  function open(keep) {
    const S = APP().state; if (!S || !ML()) return;
    APP().openModal(modalHtml(S), { closable: true, keepScroll: keep === 'keep' });
    const m = document.querySelector('#modal .modal'); if (m) m.classList.add('mil-modal');
  }
  const inModal = () => !!(APP().ui.modal && document.querySelector('#modal .mil-modal'));

  /* ---------------- уведомления ---------------- */
  function mileNotify(n) {
    const S = APP().state; if (!S) return;
    const box = document.getElementById('toasts'); if (!box) return;
    const g = (ML().GROUP[n.id] || 'Веха');
    const el = document.createElement('div');
    el.className = `toast miltoast ${n.phase}`;
    el.setAttribute('role', 'status');
    if (n.phase === 'new') {
      const cur = ML().info(S);
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Новая веха · ${esc(g)}</span><b>${esc(cur ? cur.t : '')}</b><span class="md">${esc(cur ? cur.d : '')}</span></span>`;
      el.title = 'Открыть вехи';
      el.addEventListener('click', () => { el.remove(); open(); });
      setTimeout(() => el.remove(), 9000);
      if (BK.Sound) BK.Sound.play('click');
    } else if (n.phase === 'done') {
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Веха взята!</span><b>${esc(n.title || g)}</b>${n.bonus ? `<span class="md">${esc(n.bonus)}</span>` : ''}</span>`;
      el.title = 'Открыть вехи';
      el.addEventListener('click', () => { el.remove(); open(); });
      setTimeout(() => el.remove(), 8000);
      if (BK.Sound) BK.Sound.play('fanfare');
      burst(6);
    } else {
      el.className = 'toast miltoast fail';
      el.innerHTML = `<span class="mi" aria-hidden="true">${ICON}</span><span class="mt"><span class="ey">Веха не вышла</span><b>${esc(n.title || g)}</b><span class="md">Ничего страшного — придёт следующая.</span></span>`;
      setTimeout(() => el.remove(), 6000);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
  }

  /* ---------------- монетки на 1-е число ---------------- */
  function burst(n) {
    if (document.hidden) return;
    const box = document.getElementById('coins'); if (!box) return;
    if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = document.querySelector('.hud .s-cash') ? document.querySelector('.hud .s-cash').getBoundingClientRect() : { left: innerWidth / 2, top: 40, width: 0, height: 0 };
    for (let i = 0; i < (n || 10); i++) {
      const c = document.createElement('i');
      c.className = 'coin';
      c.style.left = (rect.left + rect.width / 2 + (Math.random() * 90 - 45)) + 'px';
      c.style.top = (rect.top + rect.height * 0.6) + 'px';
      c.style.animationDelay = (i * 55 + Math.random() * 40) + 'ms';
      c.style.setProperty('--dx', (Math.random() * 46 - 23).toFixed(0) + 'px');
      box.appendChild(c);
      setTimeout(() => c.remove(), 1500);
    }
  }
  // итоги месяца: звук кассы + монетки (вызывается из app.js на уведомление «month»)
  function monthFx(profit) {
    if (BK.Sound) BK.Sound.play('money');
    if (profit > 0) burst(profit > 0 ? 12 : 6);
  }
  function coinsHtml() { return '<div id="coins" aria-hidden="true"></div>'; }

  /* ---------------- звук: строка в «Меню игры» ---------------- */
  function soundRow(S) {
    const on = BK.Sound ? BK.Sound.on : false;
    return `<div class="row sp snd-row"><span>Звук<small class="hint">касса, открытие точки, вехи, достижения</small></span>
      <div class="seg snd-seg" role="group" aria-label="Звук игры">
        <button type="button" data-act="sndSet" data-arg="1" data-snd="1" aria-pressed="${on}">Вкл</button>
        <button type="button" data-act="sndSet" data-arg="0" data-snd="0" aria-pressed="${!on}">Выкл</button>
      </div></div>`;
  }

  /* ---------------- действия и кнопка в HUD ---------------- */
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    Object.assign(A, {
      miles: () => open(),
      milesOther: () => { const S = APP().state; if (S && ML()) { ML().reset(S); ML().issue(S); } APP().save(); open('keep'); APP().refresh(); },
      milesNow: () => { const S = APP().state; if (S && ML()) { ML().ensure(S).nextDay = S.day; ML().issue(S); } APP().save(); open('keep'); APP().refresh(); },
      milesOn: (d) => { const S = APP().state; if (S && ML()) { ML().setOn(S, d.arg === '1'); if (d.arg === '1' && !ML().ensure(S).cur) ML().ensure(S).nextDay = S.day; } APP().save(); open('keep'); APP().refresh(); },
      sndSet: (d) => { if (BK.Sound) BK.Sound.set(d.arg === '1'); if (BK.Sound) BK.Sound.sync(); if (d.arg === '1' && BK.Sound) BK.Sound.play('coin'); if (inModal()) open('keep'); },
      sound: () => { if (!BK.Sound) return; const v = BK.Sound.toggle(); if (v) BK.Sound.play('coin'); APP().toast(v ? 'Звук включён' : 'Звук выключен', v ? 'Тихий — громкость браузера регулируется как обычно.' : '', v ? 'good' : 'warn'); },
    });
    if (BK.Sound) BK.Sound.sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.LivelyUI = { milesBlock, attItems, talkBlock, modalHtml, open, mileNotify, monthFx, burst, coinsHtml, soundRow, ICON };
})();
