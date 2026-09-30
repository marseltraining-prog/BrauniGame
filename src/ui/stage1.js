/* =====================================================================
   ИНТЕРФЕЙС СТАДИИ 1 «СВОЯ КОФЕЙНЯ» (BK.Stage1UI). Логика — src/stage1.js (BK.Stage1) поверх обычного движка, числа — CFG.STAGE1.
   Полноэкранный слой #stage1 поверх основной игры (как пролог): свой цикл дней (CFG.STAGE1.DAY_MS), внутри — обычный E.tick(S).
   Раскладка по макету docs/mockups/vision/img/s1-shop.png: сверху HUD (дата и часы, скорость, сегодня / месяц / счёт, ближайшая веха),
   слева — сцена кофейни «вблизи» + «Сегодня по частям дня», «Мысли гостей», лента; справа — вкладки «Точка / Меню / Команда / Деньги»,
   «Совет наставника», вехи главы. Решения — карточки (сцены 1.1–1.8, события кофейни), вехи — карточка с конфетти (s1-milestone.png).
   Картинки — временные и простые: сцена кофейни рисуется ОДНОЙ функцией drawShop(el, S, view), портреты героев — одной portrait(who),
   чтобы потом заменить их пиксельной сценой (docs/vision-plan.md §10) без правок остального интерфейса.
   Связь с ядром — BK.App (state, newGame, save, refresh, toast, toStart, ACT.theme, setSpeed); в app.js только хуки (active, resume, close).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const S1 = () => BK.Stage1, E = () => BK.Engine, C = () => BK.CFG.STAGE1, APP = () => BK.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fm = (v) => BK.fmtMoney(Math.round(v));
  const fmS = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + BK.fmtMoney(Math.abs(Math.round(v)));
  const rub = (v) => Math.round(v).toLocaleString('ru-RU') + ' ₽';
  const S = () => (APP() ? APP().state : null);
  const T = () => { const s = S(); return s && s.stage1; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const ui = { open: false, speed: 1, prev: 1, acc: 0, lastT: 0, tab: 'shop', mode: null, parts: {}, dirty: true, lastRender: 0, pressing: false, loop: false, slipT: 0, ask: null, menu: false };

  /* ---------------- портреты и сцена (одна точка замены на пиксельную графику) ---------------- */
  function portrait(who, big) {
    const h = (S1().HEROES[who]) || S1().HEROES.life;
    return `<span class="s1-av${big ? ' big' : ''}" style="--h:${h.hue}" aria-hidden="true">${esc(h.ini)}</span>`;
  }
  // сцена кофейни «вблизи»: витрина, доска меню, стойка, люди за стойкой, очередь, мысли гостей, «Двор» в окне.
  // view — готовые данные (не лезем в движок из отрисовки): { name, menu[{n,p}], staff[{hero, tired}], queue, thoughts[], closed, opening, dvor, fill, hour }
  function drawShop(el, S, view) {
    if (!el) return;
    const v = view, W = 720, H = 300;
    const shirt = ['#c46f17', '#3b8796', '#8a5a9a', '#2c8a57'];
    const person = (x, y, i, o) => `<g transform="translate(${x} ${y})" class="s1-p${o && o.tired ? ' tired' : ''}"><circle r="13" cy="-30" class="sp-head"/><path d="M-5 -32 h.1 M5 -32 h.1" class="sp-eye"/><path d="${o && o.tired ? 'M-5 -24 q5 -3 10 0' : 'M-5 -25 q5 4 10 0'}" class="sp-mouth"/>${o && o.hat ? `<path d="M-14 -38 q14 -16 28 0" fill="${o.hat}"/>` : ''}<path d="M-17 12 q0 -24 17 -24 q17 0 17 24 z" fill="${shirt[i % 4]}"/>${o && o.tired ? '<path d="M12 -40 q3 5 0 7 q-3 -2 0 -7z" class="sp-drop"/>' : ''}</g>`;
    const guests = [];
    for (let i = 0; i < Math.min(8, v.queue); i++) guests.push(person(60 + i * 44, 272, i + 1, {}));
    const staff = v.staff.slice(0, 4).map((p, i) => person(430 + i * 52, 170, i, { tired: p.tired, hat: p.hero ? '#18223a' : null })).join('');
    const board = v.menu.slice(0, 7).map((m, i) => `<text x="498" y="${58 + i * 17}" class="sc-mi">${esc(m.n.length > 18 ? m.n.slice(0, 17) + '…' : m.n)}</text><text x="690" y="${58 + i * 17}" text-anchor="end" class="sc-mp">${m.p}</text>`).join('');
    const pastry = []; const nf = Math.round(10 * v.fill);
    for (let i = 0; i < 10; i++) pastry.push(`<circle cx="${262 + (i % 5) * 26}" cy="${i < 5 ? 176 : 196}" r="8" class="${i < nf ? 'sc-bun' : 'sc-empty'}"/>`);
    const thought = v.thoughts.slice(0, 3).map((t, i) => `<g transform="translate(${40 + i * 128} ${118 + (i % 2) * 22})"><rect x="0" y="0" width="${Math.max(78, t.length * 7.2 + 18)}" height="24" rx="12" class="sc-th"/><text x="10" y="16" class="sc-tt">${esc(t)}</text></g>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Кофейня вблизи: ${esc(v.name)}${v.closed ? ', закрыто' : ''}" class="s1-svg">
      <rect x="0" y="0" width="${W}" height="${H}" class="sc-wall"/>
      <rect x="18" y="16" width="170" height="92" rx="6" class="sc-win"/><path d="M103 16 v92 M18 62 h170" class="sc-frame"/>
      ${v.dvor ? `<rect x="26" y="24" width="150" height="30" rx="4" class="sc-dvor"/><text x="101" y="43" text-anchor="middle" class="sc-dvt">«Хлебный двор»${v.dvor === 'soon' ? ' · скоро' : ''}</text>` : ''}
      <rect x="220" y="14" width="250" height="38" rx="6" class="sc-sign"/><text x="345" y="39" text-anchor="middle" class="sc-st">${esc(v.name.toUpperCase().slice(0, 22))}</text>
      <path d="M212 56 h266 v14 ${Array.from({ length: 10 }, () => 'q-13.3 12 -26.6 0').join(' ')} z" class="sc-awn"/>
      <rect x="486" y="40" width="216" height="${Math.min(7, v.menu.length) * 17 + 18}" rx="6" class="sc-board"/>${board}
      <rect x="248" y="160" width="146" height="50" rx="8" class="sc-case"/>${pastry.join('')}
      <rect x="648" y="150" width="54" height="56" rx="6" class="sc-mach"/><path d="M660 144 q4 -8 0 -14 M675 144 q4 -8 0 -14" class="sc-steam"/>
      ${staff}
      <rect x="220" y="206" width="486" height="14" rx="3" class="sc-top"/><rect x="226" y="218" width="474" height="30" class="sc-counter"/>
      ${thought}
      ${guests.join('')}
      <rect x="0" y="286" width="${W}" height="14" class="sc-floor"/>
      ${v.closed ? `<g transform="translate(360 110)"><rect x="-90" y="-26" width="180" height="46" rx="10" class="sc-closed"/><text y="4" text-anchor="middle" class="sc-ct">${esc(v.closed)}</text></g>` : ''}
    </svg>`;
  }

  /* ---------------- данные для сцены и HUD ---------------- */
  const pl = () => S().macro.priceLevel;
  function hourOf() { const t = Math.min(0.999, ui.acc / dayMs()); return 7 + t * 15; }
  function dayMs() { return C().DAY_MS[ui.speed] || C().DAY_MS[1]; }
  function thoughts(s) {
    const st = S1().store(s); if (!st || !st.today || st.today.closed) return [];
    const out = [], ms = E().menuStats(s), B = ms.avgPrice * BK.CFG.ITEMS_PER_CHECK, Sv = st.solv * pl();
    if (st.today.load > 0.95) out.push('очередь…');
    if (B > Sv * 1.02) out.push('дорого?');
    const W = E().wasteState(s); if (W.bake <= -1) out.push('нет моих булочек');
    if (E().storeRating(s, st) >= 4.2) out.push('вкусно!');
    if (!out.length) out.push(st.today.load < 0.5 ? 'тихо тут' : 'уютно');
    return out;
  }
  function view(s) {
    const t = s.stage1, st = S1().store(s);
    const dp = st ? E().daypartOf(st) : { m: 0.33, d: 0.33, e: 0.33 };
    const h = hourOf(), part = h < 11 ? dp.m : h < 16 ? dp.d : dp.e;
    const load = st && st.today && !st.today.closed ? st.today.load : 0;
    const staff = st ? st.staff.map((e) => ({ hero: !!e.hero, tired: e.hero ? t.hp < 40 : (e.fatigue || 0) > 45 })) : [];
    const closedTxt = !st ? null : st.status === 'opening' ? `Открытие через ${Math.max(0, st.openDay - s.day)} дн.` : st.status === 'repair' ? 'Ремонт' : (st.today && st.today.closed) ? (t.hero ? 'Закрыто: вы болеете' : 'Закрыто') : null;
    const bake = E().wasteState(s).bake;
    return { name: s.company.replace(/[«»"]/g, ''), menu: s.menu.map((m) => { const p = E().byId(BK.PRODUCTS, m.id); return { n: p.name, p: Math.round(p.price * pl() * m.pm) }; }),
      staff, queue: closedTxt ? 0 : Math.round(clampN(load * 3 * part * 3, 0, 8)), thoughts: closedTxt ? [] : thoughts(s), closed: closedTxt,
      dvor: t.flags.dvorOpen ? 'open' : t.dvorDay ? 'soon' : null, fill: closedTxt ? 0 : clampN(1 - (h - 7) / 15 * (0.9 - bake * 0.12), 0.1, 1), hour: h };
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------------- открыть / закрыть ---------------- */
  function active() { return ui.open; }
  function begin(s) { // из финала пролога: перенос пролога → стадия 1
    s = s || S(); if (!s) return;
    if (s.prologue && s.prologue.status === 'won') { s.prologue.toStage1 = true; BK.Prologue.applyCarry(s); }
    if (BK.PrologueUI) BK.PrologueUI.close();
    S1().start(s);
    ui.speed = 1; ui.tab = 'shop'; ui.mode = null;
    open(); APP().save();
  }
  function resume() { const t = T(); if (t && (S1().on(S()) || t.status === 'failed')) { ui.speed = 1; ui.mode = null; open(); } else close(); }
  function open() {
    let root = $('#stage1');
    if (!root) {
      document.body.insertAdjacentHTML('beforeend', `<div id="stage1" class="s1" aria-label="Своя кофейня">
        <header class="s1-top" id="s1Top"></header>
        <main class="s1-in" id="s1In"></main>
        <div class="s1-slip" id="s1Slip" aria-live="polite" hidden></div>
        <div id="s1Ov"></div><div class="s1-fly" id="s1Fly" aria-hidden="true"></div></div>`);
      root = $('#stage1');
      root.addEventListener('click', onClick);
      root.addEventListener('pointerdown', () => { ui.pressing = true; }, true);
      const up = () => { if (ui.pressing) { ui.pressing = false; ui.dirty = true; } };
      root.addEventListener('pointerup', up, true); root.addEventListener('pointercancel', up, true);
    }
    ui.open = true; ui.parts = {}; ui.dirty = true; ui.acc = 0;
    document.documentElement.classList.add('s1-on');
    render(true);
    if (!ui.loop) { ui.loop = true; requestAnimationFrame(loop); }
  }
  function close() {
    const root = $('#stage1'); if (root) root.remove();
    ui.open = false; ui.mode = null; ui.menu = false;
    document.documentElement.classList.remove('s1-on');
  }

  /* ---------------- цикл ---------------- */
  function loop(t) {
    requestAnimationFrame(loop);
    if (!ui.open) { ui.lastT = t; return; }
    const dt = Math.min(250, t - (ui.lastT || t)); ui.lastT = t;
    const s = S(), tt = s && s.stage1;
    if (!s || !tt) { close(); return; }
    if (tt.status === 'failed' || s.lost) { if (ui.mode !== 'final') showFail(); return; }
    if (tt.status === 'done') { toMain(); return; }
    if (tt.cards.length) { if (ui.mode !== 'card') showCard(); }
    else if (!ui.mode && !ui.menu && tt.status !== 'pick' && ui.speed > 0 && !document.hidden && s.phase === 'play') {
      ui.acc += dt;
      const ms = dayMs();
      if (ui.acc >= ms) {
        ui.acc -= ms; if (ui.acc > ms) ui.acc = 0;
        E().tick(s);
        if (BK.Rewind) BK.Rewind.record(s);
        drain(s);
        ui.dirty = true;
        if (tt.cards.length) showCard();
      }
      scene(false);
    }
    drainFx();
    if (ui.slipT && t > ui.slipT) { ui.slipT = 0; const sl = $('#s1Slip'); if (sl) sl.hidden = true; }
    if (ui.dirty && !ui.pressing && t - ui.lastRender > 300) render();
    else clock();
  }
  // уведомления движка (тосты, итоги месяца, достижения) — в ленту и «записку», окна основной игры здесь не нужны
  function drain(s) {
    const q = s.notify; s.notify = [];
    for (const n of q) {
      if (n.type === 'toast' && !/цех|производств|HR|отдел/i.test(n.title)) slip(`<b>${esc(n.title)}</b><span>${esc(n.text)}</span>`);
      else if (n.type === 'month') APP().save();
      else if (n.type === 'ach' && BK.Extras) slip(`<b>Достижение!</b><span>${esc(n.name || n.title || '')}</span>`);
    }
  }
  function slip(html, ms) { const sl = $('#s1Slip'); if (!sl) return; sl.innerHTML = html; sl.hidden = false; ui.slipT = performance.now() + (ms || 4500); }
  function drainFx() {
    const t = T(); if (!t || !t.fx.length) return;
    const L = t.fx.splice(0, t.fx.length);
    for (const f of L) {
      if (f.kind === 'month') { const r = f.row; slip(`<b>Итог ${esc(E().MONTHS[r.m])}: <span class="${r.profit >= 0 ? 'up' : 'dn'}">${fmS(r.profit)}</span></b><span>Выручка ${fm(r.rev)} · гостей в день ~${r.guests} · ★${r.rating.toFixed(1).replace('.', ',')}${r.share ? ` · партнёрам ${fm(r.share)}` : ''}</span>`, 5500); if (r.profit > 0) coins(); }
      else if (f.kind === 'milestone') ui.msq = (ui.msq || []).concat([f]);
      else if (f.kind === 'sms') slip(`<span class="s1-smsh">${esc(f.who)} · СМС</span><span>${esc(f.text)}</span>`, 6500);
    }
    if (ui.msq && ui.msq.length && !ui.mode && !T().cards.length) showMilestone(ui.msq.shift());
    ui.dirty = true;
  }

  /* ---------------- разметка ---------------- */
  const ICON = {
    pause: '<svg viewBox="0 0 16 14" aria-hidden="true"><rect x="3" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>',
    p1: '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M4 1 L13 7 L4 13 Z" fill="currentColor"/></svg>',
    p3: '<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M1 1 L8 7 L1 13 Z M8 1 L15 7 L8 13 Z" fill="currentColor"/></svg>',
    theme: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4Z" fill="currentColor"/></svg>',
    menu: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="13" cy="8" r="1.6" fill="currentColor"/></svg>',
  };
  function top(s) {
    const t = s.stage1, st = S1().store(s), dt = E().dateOf(s.day), g = S1().nextGoal(s);
    const today = st && st.today && !st.today.closed ? st.today.rev : 0;
    const last = t.months[t.months.length - 1];
    return `<div class="s1-brand"><span class="s1-logo" aria-hidden="true">☕</span><span class="s1-bt"><b>${esc(s.company)}</b><small>${st ? `кофейня · ${esc(st.address)}` : 'своя кофейня · выбор места'}</small></span></div>
      <span class="chip crust s1-ch">Глава 1</span>
      <div class="s1-when"><span class="s1-date">${dt.d} ${E().MONTHS_G[dt.m].slice(0, 3)} ${dt.y}</span><span class="s1-clock" id="s1Clock">${clockTxt()}</span></div>
      <div class="speed s1-speed" role="group" aria-label="Скорость времени">
        <button type="button" data-s1="speed" data-v="0" aria-label="Пауза" title="Пауза (пробел)" aria-pressed="${ui.speed === 0}">${ICON.pause}</button>
        <button type="button" data-s1="speed" data-v="1" aria-label="Скорость 1" title="Обычная скорость" aria-pressed="${ui.speed === 1}">${ICON.p1}</button>
        <button type="button" data-s1="speed" data-v="3" aria-label="Скорость 3" title="Втрое быстрее" aria-pressed="${ui.speed === 3}">${ICON.p3}</button></div>
      <div class="s1-stats">
        <div class="s1-st"><span class="k">Сегодня</span><b>${rub(today)}</b><small>${st && st.today && !st.today.closed ? `${Math.round(st.today.checks)} ${plural(st.today.checks, 'гость', 'гостя', 'гостей')}` : '—'}</small></div>
        <div class="s1-st"><span class="k">${last ? cap(E().MONTHS[last.m]) : 'Месяц'}</span><b class="${last ? (last.profit >= 0 ? 'up' : 'dn') : ''}">${last ? fmS(last.profit) : rub(s.month.rev)}</b><small>${last ? 'прибыль' : 'выручка с 1-го'}</small></div>
        <div class="s1-st"><span class="k">Счёт</span><b class="${s.cash < 0 ? 'dn' : ''}">${rub(s.cash)}</b><small>${s.loan > 0 ? `кредит ${fm(s.loan)}` : s.reserve > 0 ? `резерв ${fm(s.reserve)}` : 'без кредита'}</small></div>
      </div>
      <div class="s1-goal" title="Ближайшая веха главы"><div class="gr"><span class="k">Веха · ${esc(g.name)}</span><span class="gp">${Math.round(g.p * 100)} %</span></div><div class="gv">${esc(g.v || '')}</div><div class="s1-gbar"><i style="width:${(g.p * 100).toFixed(0)}%"></i></div></div>
      <div class="s1-ctl"><button type="button" class="iconbtn" data-s1="theme" aria-label="Сменить тему" title="Тема">${ICON.theme}</button><button type="button" class="iconbtn" data-s1="menu" aria-label="Меню" title="Меню">${ICON.menu}</button></div>`;
  }
  function clockTxt() { const h = hourOf(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 5) * 5; return `${hh}:${String(mm).padStart(2, '0')}${ui.speed === 0 ? ' · пауза' : ''}`; }
  function clock() { const el = $('#s1Clock'); if (el) { const t = clockTxt(); if (el.textContent !== t) el.textContent = t; } }
  function scene(force) { const s = S(); if (!s || !s.stage1 || s.stage1.status === 'pick') return; const now = performance.now(); if (!force && now - (ui.lastScene || 0) < 450) return; ui.lastScene = now; drawShop($('#s1Shop'), s, view(s)); }

  /* ---- выбор места ---- */
  function pickHtml(s) {
    const t = s.stage1;
    const cards = t.spots.map((sp, i) => {
      const c = S1().spotCost(s, sp), pv = S1().spotPreview(s, sp), dp = pv.dp;
      const bar = (k, n) => `<span class="s1-dpb"><i style="height:${Math.round(dp[k] * 100)}%"></i><small>${n}</small></span>`;
      return `<article class="s1-spot"><div class="sp-h"><span class="sp-i" aria-hidden="true">${sp.icon}</span><div><h3>${esc(sp.name)}</h3><small>${esc(sp.address)} · ${esc(sp.dname)}</small></div></div>
        <p class="sp-n">${esc(sp.note)}</p>
        <dl class="sp-dl"><div><dt>Площадь</dt><dd>${sp.area} м²</dd></div><div><dt>Аренда</dt><dd>${fm(sp.area * sp.rentM2)}/мес</dd></div><div><dt>Поток мимо</dt><dd>${sp.traffic.toLocaleString('ru-RU')} чел./день</dd></div><div><dt>Кошелёк района</dt><dd>${rub(sp.solv * pl())} на чек</dd></div>
          <div><dt>Гостей в день</dt><dd>≈ ${pv.guests} <small>через 5 мес.</small></dd></div><div><dt>Средний чек</dt><dd>≈ ${rub(pv.check)}</dd></div></dl>
        <div class="sp-dp" aria-label="Когда идут люди: утро ${Math.round(dp.m * 100)} %, обед ${Math.round(dp.d * 100)} %, вечер ${Math.round(dp.e * 100)} %">${bar('m', 'утро')}${bar('d', 'обед')}${bar('e', 'вечер')}<span class="sp-hrs">Часы: ${sp.hours.map((h) => esc(C().HOURS[h].name)).join(' / ')}</span></div>
        <div class="sp-cost"><span>Отделка ${fm(c.fit)} · оборудование ${fm(c.equip)}${c.machine ? ` <em>(кофемашина Рашида −${fm(c.machine)})</em>` : ''} · депозит ${fm(c.rent)} · закупка ${fm(c.stock)}${c.thrift ? ` · торг −${fm(c.thrift)}` : ''}</span><b>Открыть: ${fm(c.total)}</b><span class="${c.left < 200000 ? 'dn' : ''}">Останется: ${fm(c.left)}${c.left < 200000 ? ' — мало на первые месяцы' : ''}</span></div>
        <button type="button" class="btn primary block" data-s1="pick" data-v="${i}" ${c.left < 0 ? `disabled title="Не хватает ${fm(-c.left)}"` : ''}>${c.left < 0 ? `Не хватает ${fm(-c.left)}` : 'Открыть здесь'}</button></article>`;
    }).join('');
    const f = (s.story && s.story.f) || {};
    return `<section class="s1-pick"><div class="s1-ph"><span class="eyebrow">Глава 1 · Своя точка</span><h2>Где открываемся?</h2><p>В кармане <b>${fm(s.cash)}</b>${t.flags.credit0 ? ` (из них ${fm(t.flags.credit0)} — кредит «Семь рек»)` : ''}${t.flags.rashidIn ? ` — с долей Рашида ${fm(t.flags.rashidIn)}` : ''}. Островок собирают за ${C().OPEN_DAYS} дней. За стойкой — вы${f.gulya === 'with' || f.gulya === 'share' ? ', Гуля ждёт звонка' : ''}. Первые месяцы о вас мало знают — оставьте запас на аренду и зарплаты.</p></div><div class="s1-spots">${cards}</div></section>`;
  }

  /* ---- основной экран ---- */
  function leftHtml(s) {
    const t = s.stage1, st = S1().store(s), dp = E().daypartOf(st), td = st.today || {};
    const cov = C().HOURS[t.hours].cover;
    const parts = [['утро', dp.m * cov[0]], ['обед', dp.d * cov[1]], ['вечер', dp.e * cov[2]]], tot = parts.reduce((a, x) => a + x[1], 0) || 1;
    const g = td.closed ? 0 : td.checks || 0, mx = Math.max(1, ...parts.map((x) => x[1] / tot * g));
    const load = td.load || 0;
    const bars = parts.map(([n, w]) => { const v = w / tot * g; return `<div class="s1-hb"><b>${Math.round(v)}</b><span class="hb"><i class="${load > 1 && w / tot > 0.38 ? 'hot' : ''}" style="height:${Math.max(4, v / mx * 100).toFixed(0)}%"></i></span><small>${n}</small></div>`; }).join('');
    const th = thoughts(s).map((x) => `<li><span class="s1-bub">${esc(x)}</span></li>`).join('');
    const fd = t.feed.slice(-6).reverse().map((f) => `<li class="${f.k}"><span class="fd" aria-hidden="true"></span><span>${esc(f.t)}</span></li>`).join('');
    const lost = td.lost > 0 && !td.closed ? `ушли, не купив: ~${Math.round(td.lost / (td.check || 1))}` : '';
    return `<div class="s1-shop" id="s1Shop"></div>
      <div class="s1-q"><span>${td.closed ? 'Сегодня закрыто' : `загрузка ${Math.round(load * 100)} %`}${lost ? ' · ' + lost : ''}</span><span>${esc(C().HOURS[t.hours].name)}</span></div>
      <div class="s1-cards"><section class="pc s1-hours"><h3>Сегодня по частям дня <small>гостей</small></h3><div class="s1-hbs">${bars}</div>${load > 1 ? '<p class="s1-note dn">В пик очередь теряет гостей — нужен ещё человек за стойкой.</p>' : ''}</section>
      <section class="pc s1-th"><h3>Мысли гостей</h3><ul class="s1-thl">${th || '<li class="muted">Пока никого</li>'}</ul>${t.flags.dvorOpen ? `<p class="s1-note">Напротив — «Хлебный двор»${storyLenin(s)}</p>` : t.dvorDay ? '<p class="s1-note">На пустой витрине напротив: «Хлебный двор. Скоро!»</p>' : ''}</section>
      <section class="pc s1-feed"><h3>Что происходит</h3><ul>${fd}</ul></section></div>`;
  }
  function storyLenin(s) { const l = s.story && s.story.f.lenin; return l === 'pact' ? ' · договор с Олегом: хлеб и пироги — у них' : l === 'fight' ? ' · «битва на улице»' : ''; }
  const TABS = [['shop', 'Точка'], ['menu', 'Меню'], ['team', 'Команда'], ['money', 'Деньги']];
  function rightHtml(s) {
    const tabs = `<nav class="s1-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-s1="tab" data-v="${k}" aria-selected="${ui.tab === k}">${n}</button>`).join('')}</nav>`;
    const body = { shop: tabShop, menu: tabMenu, team: tabTeam, money: tabMoney }[ui.tab](s);
    return `${tabs}<div class="s1-tb">${body}</div>${adviceHtml(s)}${msHtml(s)}`;
  }
  function seg(pa, cur, opts) { return `<div class="s1-seg" role="group">${opts.map(([v, n, dis, title]) => `<button type="button" data-s1="${pa}" data-v="${v}" aria-pressed="${String(v) === String(cur)}"${dis ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(n)}</button>`).join('')}</div>`; }
  function tabShop(s) {
    const t = s.stage1, st = S1().store(s), W = E().wasteState(s), rt = E().storeRating(s, st), dp = E().daypartOf(st);
    const hrs = t.spot.hours.map((h) => [h, C().HOURS[h].name + ` · ${Math.round(S1().hoursCover(dp, h) * 100)} %`]);
    const L = BK.CFG.BAKE_LEVELS, lv = L[W.bake + 3];
    const sw = S1().secondWhy(s);
    const rc = E().repairCost(s, st), rep = BK.CFG.REPAIRS[st.repair + 1];
    return `<section class="s1-sec"><h4>Часы работы <small>доля потока района, которую ловим</small></h4>${seg('hours', t.hours, hrs)}
        <label class="s1-chk"><input type="checkbox" data-s1="dayoff" ${t.dayOff ? 'checked' : ''}> Выходной по воскресеньям <small>${st.staff.length > 1 ? 'точка работает без вас' : 'одни — точка в воскресенье закрыта'} · +силы</small></label></section>
      <section class="s1-sec"><h4>Сколько печь <small>из закупленных заготовок</small></h4>${seg('bake', W.bake, [[-2, 'Меньше'], [-1, 'Чуть меньше'], [0, 'Норма'], [1, 'Чуть больше'], [2, 'Больше']])}
        <p class="s1-hint">${esc(lv.name)}: остатки ×${String(lv.waste).replace('.', ',')}, без выпечки уходят ${Math.round(lv.lost * 100)} % гостей, свежесть ${String(lv.fresh).replace('.', ',')}★</p>
        <h4>Вечерняя скидка</h4>${seg('disc', W.disc, BK.CFG.EVE_DISCOUNTS.map((d, i) => [i, d ? `−${Math.round(d * 100)} %` : 'Нет']))}</section>
      <section class="s1-sec s1-kv"><div><span>Рейтинг на картах</span><b>${rt.toFixed(2).replace('.', ',')}★</b></div><div><span>Постоянные гости</span><b>${Math.round(t.reg)}</b></div><div><span>О вас знают</span><b>${Math.round(t.aware * 100)} %</b></div><div><span>Ремонт</span><b>${st.repair ? esc(BK.CFG.REPAIRS[st.repair].name) : 'нет'}</b></div></section>
      ${rep ? `<section class="s1-sec"><button type="button" class="btn block" data-s1="repair" ${st.status !== 'open' || s.cash < rc ? 'disabled' : ''}>Ремонт «${esc(rep.name)}» · ${fm(rc)} · ${rep.days} дн. закрыто</button><p class="s1-hint">Уютнее — выше рейтинг и чек.</p></section>` : ''}
      <section class="s1-sec s1-second"><h4>Вторая вывеска</h4><p class="s1-hint">${sw ? esc(sw) : 'Эльвира готова: деньги на цех и вторую точку. Кофейня станет точкой №1 сети.'}</p><button type="button" class="btn ${sw ? '' : 'primary '}block" data-s1="second" ${sw ? 'disabled' : ''}>Открыть вторую точку</button></section>`;
  }
  function tabMenu(s) {
    const t = s.stage1, sum = BK.ProdStats ? BK.ProdStats.summary(s) : null, rows = {};
    if (sum) for (const r of sum.rows) rows[r.id] = r;
    const items = s.menu.map((m) => {
      const p = E().byId(BK.PRODUCTS, m.id), r = rows[m.id], price = Math.round(p.price * pl() * m.pm);
      const mg = r ? Math.round(r.marginPct * 100) : Math.round((1 - p.fc * BK.CFG.FOODCOST_MULT * C().BAKEOFF_FC) * 100);
      const sold = r ? Math.round(r.units / 30.4) : 0;
      return `<li class="s1-mi"><div class="mi-n"><b>${esc(p.name)}</b><small>маржа ${mg} %${r && r.est ? ' · оценка' : ''}${r && r.flags && r.flags.length ? ' · ' + esc(r.flags.map((f) => f.t).join(', ')) : ''}</small></div>
        <div class="s1-step"><button type="button" data-s1="price" data-v="${m.id}" data-d="-0.05" aria-label="Дешевле">−</button><b>${price}</b><button type="button" data-s1="price" data-v="${m.id}" data-d="0.05" aria-label="Дороже">+</button></div>
        <span class="mi-s">${sold} шт.<small>в день</small></span><button type="button" class="s1-x" data-s1="menuRm" data-v="${m.id}" aria-label="Убрать ${esc(p.name)}" title="Убрать из меню">×</button></li>`;
    }).join('');
    const ms = E().menuStats(s), st = S1().store(s), B = ms.avgPrice * BK.CFG.ITEMS_PER_CHECK, Sv = st.solv * pl();
    const add = C().MENU_ALL.filter((id) => !s.menu.some((m) => m.id === id)).map((id) => { const p = E().byId(BK.PRODUCTS, id), why = S1().menuWhy(s, id, true); return `<button type="button" class="s1-add" data-s1="menuAdd" data-v="${id}" ${why ? `disabled title="${esc(why)}"` : ''}><b>${esc(p.name)}</b><small>${Math.round(p.price * pl())} ₽</small></button>`; }).join('');
    return `<section class="s1-sec"><h4>Меню и цены <small>${s.menu.length} из ${C().MENU_MAX}</small></h4><p class="s1-hint">Корзина гостя ≈ ${rub(B)} при кошельке района ${rub(Sv)} — ${B > Sv * 1.02 ? '<b class="dn">дороговато: часть гостей уходит</b>' : B < Sv * 0.85 ? 'можно дороже' : 'в самый раз'}.</p><ul class="s1-ml">${items}</ul></section>
      <section class="s1-sec"><h4>Добавить в меню</h4><div class="s1-adds">${add}</div></section>`;
  }
  function tabTeam(s) {
    const t = s.stage1, st = S1().store(s), hw = S1().hireWhy(s);
    const face = (m) => (m >= 65 ? '😊' : m >= 40 ? '😐' : '😟');
    const rows = st.staff.map((e) => e.hero
      ? `<li class="s1-emp hero">${portrait('hero')}<div><b>Вы</b><small>за стойкой · уровень ${e.lvl} · «зарплата себе» ${fm(E().salaryOf(s, e.lvl))}</small><span class="s1-hp" title="Силы: ${Math.round(t.hp)} из 100"><i class="${t.hp < 35 ? 'low' : t.hp < 60 ? 'mid' : ''}" style="width:${Math.round(t.hp)}%"></i></span></div><b class="hpv">${Math.round(t.hp)}</b></li>`
      : `<li class="s1-emp"><span class="s1-av sm" style="--h:${(e.name.charCodeAt(0) * 37) % 360}">${esc(e.name[0])}</span><div><b>${esc(e.name)}</b><small>${esc(BK.STAFF_LVL_NAMES[e.lvl])} · ${fm(E().salaryOf(s, e.lvl))}/мес</small></div><span class="face" title="Настроение ${Math.round(e.mood)}">${face(e.mood)}</span>${e.lvl < BK.CFG.MAX_LVL ? `<button type="button" class="btn sm" data-s1="train" data-v="${e.id}" ${s.cash < E().trainCost(s, e.lvl + 1) ? 'disabled' : ''}>Учить · ${fm(E().trainCost(s, e.lvl + 1))}</button>` : ''}</li>`).join('');
    const inc = st.incoming.map((x) => `<li class="s1-emp inc"><span class="s1-av sm" style="--h:200">${esc(x.p.name[0])}</span><div><b>${esc(x.p.name)}</b><small>выходит через ${Math.max(0, x.day - s.day)} дн.</small></div></li>`).join('');
    const sick = t.hero ? `<li class="s1-emp inc">${portrait('hero')}<div><b>Вы болеете</b><small>вернётесь через ${Math.max(0, t.sick - s.day)} дн.</small></div></li>` : '';
    const gl = S1().gulyaAvail(s) ? `<li class="s1-cand gulya">${portrait('gulya')}<div><b>Гульнара Сафина</b><small>из «Калача» · уровень ${S1().gulyaLvl(s)} · ждёт звонка${s.story && s.story.f.gulya === 'share' ? ' · совладелица 10 %' : ''}</small></div><button type="button" class="btn sm primary" data-s1="gulya" ${hw ? `disabled title="${esc(hw)}"` : ''}>Позвать</button></li>` : '';
    const cands = s.candidates.slice(0, 4).map((c) => `<li class="s1-cand"><span class="s1-av sm" style="--h:${(c.name.charCodeAt(0) * 53) % 360}">${esc(c.name[0])}</span><div><b>${esc(c.name)}</b><small>${esc(BK.STAFF_LVL_NAMES[c.lvl])} · ${fm(E().salaryOf(s, c.lvl))}/мес</small></div><button type="button" class="btn sm" data-s1="hire" data-v="${c.id}" ${hw || s.cash < E().hireCost(s, c.lvl) ? `disabled title="${esc(hw || 'Не хватает денег')}"` : ''}>Нанять · ${fm(E().hireCost(s, c.lvl))}</button></li>`).join('');
    const pk = s.pay.seller / s.market.seller;
    return `<section class="s1-sec"><h4>За стойкой <small>${st.staff.length} из ${BK.CFG.SIZES.small.staffMax}</small></h4><ul class="s1-el">${rows}${sick}${inc}</ul>
        <p class="s1-hint">${st.staff.length <= 1 ? 'Одному тяжело: силы тают быстрее, в пик очередь уходит. Помощник — и силы держатся.' : 'С помощником силы восстанавливаются, а пик не теряет гостей.'}</p></section>
      <section class="s1-sec"><h4>Зарплата <small>рынок ${fm(s.market.seller)}</small></h4>${seg('pay', Math.round(pk * 100), [[100, 'Рынок'], [105, '+5 %'], [110, '+10 %']])}</section>
      <section class="s1-sec"><h4>Нанять <small>найм — 1,5 оклада</small></h4><ul class="s1-el">${gl}${cands || '<li class="muted">Кандидатов пока нет — придут через неделю</li>'}</ul></section>`;
  }
  function tabMoney(s) {
    const t = s.stage1, h = s.history[s.history.length - 1], p = h && h.pnl;
    const row = (n, v, cls) => `<div class="${cls || ''}"><span>${n}</span><b>${v}</b></div>`;
    const pnl = p ? `<div class="s1-pnl">${row('Выручка', fm(p.rev), 'up')}${row('Закупка и списания', '−' + fm(p.fc))}${row('Аренда', '−' + fm(p.rent))}${row('Зарплаты (с «зарплатой себе»)', '−' + fm(p.payroll))}${row('Коммуналка', '−' + fm(p.util))}${row('Налог УСН', '−' + fm(p.tax))}${p.interest ? row('Проценты', '−' + fm(p.interest)) : ''}${(p.hire || 0) + (p.train || 0) + (p.other || 0) > 0 ? row('Найм, учёба, прочее', '−' + fm((p.hire || 0) + (p.train || 0) + (p.other || 0))) : ''}${row('Прибыль', fmS(h.profit), h.profit >= 0 ? 'tot up' : 'tot dn')}</div>` : '<p class="s1-hint">Отчёт — 1-го числа.</p>';
    const mon = t.months.slice(-6).map((m) => `<li><span>${cap(E().MONTHS[m.m]).slice(0, 3)}</span><span class="mb"><i class="${m.profit >= 0 ? 'up' : 'dn'}" style="width:${Math.min(100, Math.abs(m.profit) / 4000).toFixed(0)}%"></i></span><b class="${m.profit >= 0 ? 'up' : 'dn'}">${fmS(m.profit)}</b></li>`).join('');
    const lw = S1().loanWhy(s);
    return `<section class="s1-sec s1-kv"><div><span>Счёт</span><b class="${s.cash < 0 ? 'dn' : ''}">${fm(s.cash)}</b></div><div><span>Резерв</span><b>${fm(s.reserve)}</b></div><div><span>Кредит</span><b>${fm(s.loan)}</b></div><div><span>Ставка</span><b>${(E().loanRate(s) * 100).toFixed(1).replace('.', ',')} %</b></div></section>
      <section class="s1-sec"><h4>Кредит «Семь рек» <small>лимит для одной кофейни ${fm(t.loanMax)}</small></h4><div class="s1-row"><button type="button" class="btn" data-s1="loan" ${lw ? `disabled title="${esc(lw)}"` : ''}>Взять ${fm(Math.min(200000, S1().loanRoom(s)) || 0)}</button><button type="button" class="btn" data-s1="repay" ${s.loan > 0 && s.cash > 0 ? '' : 'disabled'}>Погасить ${fm(Math.min(200000, s.loan))}</button></div>${lw ? `<p class="s1-hint">${esc(lw)}</p>` : ''}</section>
      <section class="s1-sec"><h4>Прошлый месяц</h4>${pnl}${t.share ? `<p class="s1-hint">Доли партнёров (${Math.round(t.share * 100)} % прибыли) списываются 1-го числа.</p>` : ''}</section>
      ${mon ? `<section class="s1-sec"><h4>По месяцам</h4><ul class="s1-mon">${mon}</ul></section>` : ''}`;
  }
  function adviceHtml(s) {
    const a = s.stage1.advice; if (!a || !s.stage1.flags.advisor) return '';
    const act = { hire: ['Кого нанять?', 'team'], price: ['К ценам', 'menu'], bakeLess: ['Печь меньше', 'bake'], hours: ['К часам', 'shop'] }[a.act];
    return `<section class="s1-adv">${portrait(a.who)}<div><b>Совет наставника</b><p>${esc(a.text)}</p>${act ? `<button type="button" class="btn sm primary" data-s1="adv" data-v="${act[1]}">${act[0]}</button> ` : ''}<button type="button" class="btn sm" data-s1="advNo">Позже</button></div></section>`;
  }
  function msHtml(s) {
    const L = S1().msList(s), n = L.filter((x) => x.day != null).length;
    return `<section class="s1-ms"><h4>Вехи главы <small>${n} из ${L.length}</small></h4><ul>${L.map((m) => `<li class="${m.day != null ? 'ok' : ''}"><span class="ck" aria-hidden="true">${m.day != null ? '✓' : ''}</span>${esc(m.name)}</li>`).join('')}</ul></section>`;
  }
  function setPart(id, html) { if (ui.parts[id] === html) return; ui.parts[id] = html; const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function render(force) {
    const s = S(); if (!s || !s.stage1 || !ui.open) return;
    if (!force && ui.pressing) return;
    ui.dirty = false; ui.lastRender = performance.now();
    setPart('s1Top', top(s));
    const t = s.stage1;
    if (t.status === 'pick') { setPart('s1In', pickHtml(s)); return; }
    if (!$('#s1Left')) { ui.parts = { s1Top: ui.parts.s1Top }; $('#s1In').innerHTML = '<div class="s1-grid"><div class="s1-col" id="s1Left"></div><aside class="s1-col s1-side" id="s1Right"></aside></div>'; }
    // сцену перерисовывает scene(); левую колонку — только если изменились данные под сценой
    const L = leftHtml(s);
    if (ui.parts.s1Left !== L) { const shop = $('#s1Shop'); const keep = shop ? shop.innerHTML : ''; setPart('s1Left', L); const sh2 = $('#s1Shop'); if (sh2 && keep) sh2.innerHTML = keep; }
    setPart('s1Right', rightHtml(s));
    scene(true);
    if (ui.menu) menuHtml();
  }

  /* ---------------- карточки ---------------- */
  const FXN = { rub: ['₽', 'Деньги'], guests: ['🙂', 'Гости'], team: ['👥', 'Команда'], hp: ['❤️', 'Силы'], rel: ['🤝', 'Отношения'] };
  function fxChips(fx, risk) {
    const out = [];
    for (const k of Object.keys(FXN)) { const v = fx && fx[k]; if (!v) continue; const up = v > 0, n = Math.min(3, Math.abs(v)); out.push(`<span class="fxc ${up ? 'up' : 'dn'}" title="${FXN[k][1]}: ${up ? 'лучше' : 'хуже'}"><span aria-hidden="true">${FXN[k][0]}</span><span>${FXN[k][1]}</span><span class="ar">${(up ? '▲' : '▼').repeat(n)}</span></span>`); }
    if (risk) out.push('<span class="fxc risk" title="Исход не гарантирован"><span aria-hidden="true">🎲</span><span>Риск</span></span>');
    return out.join('');
  }
  function showCard() {
    const s = S(), cv = S1().card(s); if (!cv) { hideOv(); return; }
    ui.mode = 'card';
    const kind = cv.kind === 'pos' ? 'pos' : cv.kind === 'neg' ? 'neg' : 'hero', LET = 'АБВГДЕ';
    const ey = cv.kind === 'climax' ? 'Кульминация главы' : kind === 'hero' ? 'Сцена · ' + esc(cv.hero.name) : kind === 'pos' ? 'Хорошие новости' : 'Неприятность';
    let h = `<div class="s1-ovbg"><div class="s1-card ${kind}" role="dialog" aria-modal="true" aria-labelledby="s1CardT" tabindex="-1">
      <div class="s1-chd">${portrait(cv.who, true)}<span class="s1-cw"><span class="s1-ey ${kind}">${ey}</span><small>${esc(cv.hero.role)}</small></span></div>
      <h2 id="s1CardT">${esc(cv.title)}</h2><p class="s1-ct">${esc(cv.text)}</p><div class="s1-cc">`;
    if (cv.choices.length > 1) h += `<div class="s1-chq"><h4>Что ответим?</h4><span>▲ — лучше, ▼ — хуже</span></div>`;
    cv.choices.forEach((c, i) => {
      if (cv.choices.length === 1) { h += `<button type="button" class="btn primary block s1-big" data-s1="choose" data-v="${i}">${esc(c.label)}</button>${c.desc ? `<p class="s1-cd">${esc(c.desc)}</p>` : ''}`; return; }
      const fx = fxChips(c.fx, c.risk);
      h += `<button type="button" class="choice" data-s1="choose" data-v="${i}"${c.can ? '' : ' disabled'}><span class="cl">${LET[i]}</span><b>${esc(c.label)}</b><span class="cd">${esc(c.desc || '')}</span><span class="cc">${c.cost ? fm(c.cost) : ''}</span>${!c.can && c.why ? `<span class="cwhy">${esc(c.why)}</span>` : ''}${fx ? `<span class="fx">${fx}</span>` : ''}</button>`;
    });
    h += '</div></div></div>';
    $('#s1Ov').innerHTML = h;
    const d = $('#s1Ov .s1-card'); if (d) d.focus({ preventScroll: true });
  }
  function hideOv() { const o = $('#s1Ov'); if (o) o.innerHTML = ''; ui.mode = null; }
  function choose(i) {
    const s = S(), r = S1().choose(s, i);
    if (!r.ok) { APP().toast('Не получится', r.msg || '', 'warn'); return; }
    hideOv(); ui.dirty = true;
    const t = s.stage1;
    if (t.status === 'done') { toMain(); return; }
    if (t.cards.length) showCard();
    render(true); drainFx(); APP().save();
  }
  function showMilestone(f) {
    const s = S(), t = s.stage1, n = Object.keys(t.ms).length, L = S1().MS.length;
    ui.mode = 'ms';
    const last = t.months[t.months.length - 1];
    const big = f.id === 'plus' && last ? `<div class="s1-msv up">${fmS(last.profit)}<small>прибыль за ${esc(E().MONTHS[last.m])}</small></div>` : f.id === 'g100' ? '<div class="s1-msv">100<small>гостей за день</small></div>' : f.id === 'r45' ? '<div class="s1-msv">4,5★<small>на картах</small></div>' : '';
    const sms = { plus: ['Мама', 'Я видела, у вас очередь была. Горжусь. Покушай.'], g100: ['Семён Аркадьевич', 'Сто человек за день? Это уже не кофейня, это остановка. Рекомендую.'], r45: ['Эльвира', 'Четыре с половиной звезды. Банки такое тоже читают.'], hire: ['Мама', 'Теперь ты начальник? Не обижай людей. И покушай.'], open: ['Ильдар', 'Открылись! Я уже выложил сторис.'], streak: ['Эльвира', 'Три месяца в плюсе. Приходите — поговорим о второй точке.'] }[f.id];
    const nxt = S1().MS.find((m) => t.ms[m.id] == null);
    $('#s1Ov').innerHTML = `<div class="s1-ovbg" data-s1="msClose"><div class="s1-card s1-msc" role="dialog" aria-modal="true" aria-labelledby="s1MsT" tabindex="-1"><span class="s1-star" aria-hidden="true">★</span>
      <span class="s1-ey pos">Веха главы · ${n} из ${L}</span><h2 id="s1MsT">${esc(f.name)}</h2>${big}
      ${nxt ? `<p class="s1-ct">Следующая веха: <b>${esc(nxt.name)}</b></p>` : ''}
      ${sms ? `<div class="s1-sms"><span class="s1-smsh">${esc(sms[0])} · СМС</span>${esc(sms[1])}</div>` : ''}
      <button type="button" class="btn primary block s1-big" data-s1="msClose">Дальше</button></div></div>`;
    confetti();
    const d = $('#s1Ov .s1-card'); if (d) d.focus({ preventScroll: true });
  }
  function confetti() {
    const fly = $('#s1Fly'); if (!fly) return;
    if (globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 28; i++) { const c = document.createElement('span'); c.className = 's1-conf'; c.style.left = (8 + Math.random() * 84) + 'vw'; c.style.setProperty('--hue', String(Math.floor(Math.random() * 360))); c.style.animationDelay = (Math.random() * 0.4) + 's'; fly.appendChild(c); setTimeout(() => c.remove(), 2400); }
  }
  function coins() {
    const fly = $('#s1Fly'), to = $('.s1-stats'); if (!fly || !to) return;
    if (globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = to.getBoundingClientRect(); if (!b.width) return;
    for (let i = 0; i < 6; i++) { const c = document.createElement('span'); c.className = 's1-coin'; c.textContent = '₽'; c.style.left = (b.left + b.width * (0.2 + Math.random() * 0.6)) + 'px'; c.style.top = (b.bottom + 60) + 'px'; c.style.animationDelay = (i * 0.07) + 's'; fly.appendChild(c); setTimeout(() => c.remove(), 1300); }
  }

  /* ---------------- финалы ---------------- */
  function showFail() {
    const s = S(), t = s.stage1;
    ui.mode = 'final';
    const tips = [];
    const L = t.months.filter((m) => m.full);
    const st = S1().store(s);
    if (st && st.staff.length <= 1) tips.push('Одному за стойкой не вытянуть пик: помощник окупается очередью, которая не ушла.');
    if (st) { const ms = E().menuStats(s); if (ms.avgPrice * BK.CFG.ITEMS_PER_CHECK > st.solv * pl() * 1.02) tips.push('Цены выше кошелька района — половина гостей уходит, посмотрев на доску.'); }
    if (E().wasteState(s).bake > 0) tips.push('Пекли с запасом — списания съели прибыль.');
    if (!tips.length) tips.push('Первые месяцы о кофейне мало знают — нужен запас на аренду и зарплаты.');
    const rw = BK.RewindUI ? BK.RewindUI.blockHtml(s, true) : '';
    $('#s1Ov').innerHTML = `<div class="s1-ovbg"><div class="s1-card s1-final" role="dialog" aria-modal="true" aria-labelledby="s1FinT" tabindex="-1">
      <span class="s1-ey neg">Глава 1 · ${L.length} ${plural(L.length, 'месяц', 'месяца', 'месяцев')} работы</span><h2 id="s1FinT">Кофейня закрылась</h2>
      <p class="s1-ct">Деньги кончились, банк больше не даёт. Мама: «Ничего. Рашид тоже не с первого раза. Приходи ужинать». Это не конец истории — можно вернуться назад и сыграть иначе.</p>
      <ul class="s1-tips">${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${rw}
      <div class="s1-fb"><button type="button" class="btn block" data-s1="retry">Открыть кофейню заново</button><button type="button" class="btn block" data-s1="skipNet">Начать сразу со своей сети</button></div></div></div>`;
    if (BK.RewindUI) BK.RewindUI.bind($('#s1Ov'), true);
  }
  // переход в стадию 2: слой закрывается, основная игра — выбор цеха (кофейня уже точка №1)
  function toMain() {
    const s = S(), nx = s.stage1.next;
    close();
    APP().refresh(); APP().save();
    if (nx) APP().toast('Своя сеть!', `Кофейня — точка №1. На счёте ${fm(nx.cash)}${nx.fund ? ` (программа «Семь рек» ${fm(nx.fund)})` : ''}. Выберите помещение под цех.`, 'good');
  }
  function restart(skipNet) {
    const s = S(); if (!s) return;
    const name = s.company, diff = s.difficulty, rival = !!(s.rival && s.rival.enabled), old = s;
    close();
    APP().newGame(name, diff, { rival });
    const n = S(); if (!n) return;
    S1().copyCarry(old, n);
    if (skipNet) { n.stage1 = { v: 1, status: 'skipped' }; APP().refresh(); APP().save(); APP().toast('Своя сеть', 'Стартовый капитал и первая точка — как в обычной игре.', 'good'); return; }
    S1().start(n); ui.tab = 'shop'; open(); APP().save();
  }

  /* ---------------- меню слоя ---------------- */
  function menuHtml() {
    let o = $('#s1Menu');
    const h = `<div class="s1-ovbg" data-s1="menuClose"><div class="s1-card" role="dialog" aria-modal="true" aria-labelledby="s1MenuT" tabindex="-1">
      <h2 id="s1MenuT">Своя кофейня</h2><p class="s1-ct">Одна точка, всё руками: место, часы, меню и цены, сколько печь, кто за стойкой. Время идёт само — пауза пробелом. Цель главы — вторая вывеска: три месяца в плюсе, 100 гостей за день или 4,5★ и деньги на вторую точку.</p>
      ${BK.RewindUI && S().phase === 'play' ? BK.RewindUI.blockHtml(S(), false) : ''}
      ${ui.ask === 'skip' ? '<div class="confirm">Кофейня станет точкой №1, но без итогов главы: деньги на сеть — как в обычном старте. <button type="button" class="btn sm danger" data-s1="skipYes">Перейти</button><button type="button" class="btn sm" data-s1="askNo">Отмена</button></div>' : ''}
      <div class="s1-fb"><button type="button" class="btn primary block" data-s1="menuClose">Вернуться</button>${ui.ask === 'skip' || S().stage1.status === 'pick' ? '' : '<button type="button" class="btn block" data-s1="skipAsk">Хватит одной кофейни — сразу в сеть</button>'}<button type="button" class="btn block" data-s1="toStart">К списку игр</button></div></div></div>`;
    if (!o) { $('#s1Ov').insertAdjacentHTML('beforeend', '<div id="s1Menu"></div>'); o = $('#s1Menu'); }
    if (o.dataset.h !== h) { o.innerHTML = h; o.dataset.h = h; if (BK.RewindUI) BK.RewindUI.bind(o, false); }
  }

  /* ---------------- действия ---------------- */
  function res(r) { if (r && r.ok === false && r.msg) APP().toast('Не получится', r.msg, 'warn'); ui.dirty = true; render(true); if (r && r.ok !== false) APP().save(); return r; }
  function onClick(e) {
    const b = e.target.closest('[data-s1]'); if (!b || b.disabled) return;
    const a = b.dataset.s1, v = b.dataset.v, s = S(); if (!s || !s.stage1) return;
    if ((a === 'menuClose' || a === 'msClose') && b.classList.contains('s1-ovbg') && e.target !== b) return;
    if (b.tagName !== 'INPUT') e.preventDefault();
    const st = S1().store(s);
    switch (a) {
      case 'speed': ui.speed = +v; ui.dirty = true; render(true); break;
      case 'theme': if (APP().ACT && APP().ACT.theme) APP().ACT.theme({}); break;
      case 'menu': ui.menu = true; ui.ask = null; menuHtml(); break;
      case 'menuClose': ui.menu = false; ui.ask = null; { const m = $('#s1Menu'); if (m) m.remove(); } break;
      case 'skipAsk': ui.ask = 'skip'; menuHtml(); break;
      case 'askNo': ui.ask = null; menuHtml(); break;
      case 'skipYes': ui.menu = false; ui.ask = null; S1().finish(s); toMain(); break;
      case 'toStart': ui.menu = false; close(); APP().toStart(); break;
      case 'tab': ui.tab = v; render(true); break;
      case 'pick': { const r = S1().pick(s, +v); res(r); if (r.ok) { ui.parts = {}; render(true); } break; }
      case 'hours': res(S1().setHours(s, v)); break;
      case 'dayoff': res(S1().setDayOff(s, b.checked)); break;
      case 'bake': E().setBake(s, +v); res({ ok: true }); break;
      case 'disc': { const r = E().setEveDiscount(s, +v); if (r.penalty) APP().toast('Скидку сменили слишком скоро', 'Гости раздражены: рейтинг −0,4★ на месяц.', 'warn'); res(r); break; }
      case 'repair': res(E().startRepair(s, st.id)); break;
      case 'second': { const r = S1().openSecond(s); res(r); if (r.ok) showCard(); break; }
      case 'price': { const it = s.menu.find((m) => m.id === v); if (it) E().setPrice(s, v, it.pm + +b.dataset.d); res({ ok: true }); break; }
      case 'menuRm': res(S1().menuRemove(s, v)); break;
      case 'menuAdd': res(S1().menuAdd(s, v)); break;
      case 'train': res(E().train(s, st.id, v)); break;
      case 'hire': res(S1().hire(s, v)); break;
      case 'gulya': res(S1().inviteGulya(s)); break;
      case 'pay': E().setPay(s, 'seller', s.market.seller * (+v) / 100); res({ ok: true }); break;
      case 'loan': res(S1().takeLoan(s, 200000)); break;
      case 'repay': res(E().repayLoan(s, 200000)); break;
      case 'adv': if (v === 'bake') { E().setBake(s, E().wasteState(s).bake - 1); s.stage1.advice = null; res({ ok: true }); } else { ui.tab = v; s.stage1.advice = null; render(true); } break;
      case 'advNo': s.stage1.advice = null; render(true); break;
      case 'choose': choose(+v); break;
      case 'msClose': hideOv(); render(true); drainFx(); break;
      case 'retry': restart(false); break;
      case 'skipNet': restart(true); break;
      default: break;
    }
  }
  window.addEventListener('keydown', (e) => {
    if (!ui.open) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
    if (e.code === 'Space' && !ui.mode) { e.preventDefault(); if (ui.speed) { ui.prev = ui.speed; ui.speed = 0; } else ui.speed = ui.prev || 1; ui.dirty = true; render(true); }
    else if (e.key === '1' && !ui.mode) { ui.speed = 1; render(true); } else if ((e.key === '2' || e.key === '3') && !ui.mode) { ui.speed = 3; render(true); }
    else if (e.key === 'Escape' && ui.menu) { ui.menu = false; const m = $('#s1Menu'); if (m) m.remove(); }
  }, true);

  BK.Stage1UI = { begin, resume, open, close, active, render, drawShop, portrait, toMain, get ui() { return ui; } };
})();
