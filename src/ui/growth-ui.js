/* Рост вглубь — интерфейс (логика — src/growth.js, BK.Growth).
   Где видно: вкладка «Рост» (появляется с первым направлением), окно «Новая возможность» при открытии направления,
   строки в «Требует внимания» (заказы, контракты, франчайзи, простой фабрики), объекты на карте (фабрика, флагман,
   франчайзи, площадки под стройку), строка в легенде карты. В panels.js / app.js / map.js — только хуки (BK.GrowthUI.*). */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  if (typeof document === 'undefined') return;
  const G_ = () => BK.Growth, APP = () => BK.App, H = () => BK.UIH, K = () => BK.CFG.GROWTH, E = () => BK.Engine;
  const fm = (v) => BK.fmtMoney(v), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, a, b, c) => { const x = Math.abs(Math.round(n)) % 100, y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y > 1 && y < 5 ? b : c; };
  const nw = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
  const n0 = (v) => Math.round(v).toLocaleString('ru-RU');
  const pc = (v) => Math.round(v * 100) + ' %';
  const dname = (id) => ((BK.DISTRICTS || []).find((d) => d.id === id) || {}).name || '';
  const date = (d) => { const t = E().dateOf(d); return `${t.d} ${E().MONTHS_G[t.m]}`; };
  const ICON = {
    grow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M7 20v-6M12 20V9M17 20V5"/><path d="M14.5 5.5 17 3l2.5 2.5"/></svg>',
    cater: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17h18"/><path d="M5 17a7 7 0 0 1 14 0"/><path d="M12 7V5M10 5h4"/><path d="M4 20h16"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/></svg>',
    factory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 20V11l5-3v3l5-3v3l5-3V4h3v16z"/><path d="M7 16h2M12 16h2"/></svg>',
    retail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M6 5v14M18 5v14"/><path d="M8.5 9.5h3M12.5 16.5h3"/></svg>',
    fran: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/><path d="M2.5 20c.6-3.5 2.8-5.5 5.5-5.5s4.9 2 5.5 5.5M14.5 14.7c3-.6 5.8 1.2 6.5 5.3"/></svg>',
  };
  // коротко: что даёт и чем рискуем (окно «Новая возможность» и шапки разделов)
  const WHY = {
    cater: { lead: 'Бизнес-центры, заводы и праздники заказывают выпечку партиями — от пары до десятка тысяч изделий к дате.',
      plus: 'Выручка без новых точек. Пики — декабрьские корпоративы, 8 Марта, Сабантуй, 1 сентября.', minus: 'Заказ занимает цех: без свободной мощности точки недополучат выпечку. Сорванный заказ — неустойка и плохие отзывы.' },
    flag: { lead: 'Одна большая пекарня-кафе в центре: витрина бренда, туристы, мастер-классы.',
      plus: 'Узнаваемость: гостей во всех точках больше, франчайзи сильнее, на полках платят дороже.', minus: 'Дорогой ремонт и аренда в центре, прибыль самого кафе скромная — окупается через сеть.' },
    factory: { lead: 'Крупное производство за городом: мощность на полки, франшизу, заказы и полуфабрикаты для своих цехов.',
      plus: 'Изделие дешевле, чем в цехе; полуфабрикаты снижают фудкост цехов сети.', minus: 'Стройка ~8 месяцев. Поломки (обслуживание стоит денег), цена муки гуляет — можно закупить впрок.' },
    retail: { lead: 'Свой бренд на полках супермаркетов: контракт на год, тысячи изделий в день.',
      plus: 'Большие объёмы без аренды и продавцов, бренд на виду — в точки заходят чаще.', minus: 'Сети платят через 30–60 дней — деньги приходят позже. Недопоставка — неустойка, три плохих месяца — расторжение и пятно на бренде.' },
    fran: { lead: 'Партнёры открывают пекарни под вашей вывеской там, где своих мест нет или аренда дорогая.',
      plus: 'Паушальный взнос сразу, 6 % роялти с оборота, закупки изделий у вашей фабрики — сеть растёт без ваших денег.', minus: 'Качество партнёров ниже: скандал у франчайзи бьёт по рейтингу всей сети. Контроль стоит денег.' },
  };

  /* ---------- значки последствий (как в окне события) ---------- */
  function fxc(k, lab, v, tip) {
    const IC = BK.FX_IC || {}, n = Math.min(3, Math.abs(v)), cls = !v ? 'zero' : v > 0 ? 'up' : 'dn';
    return `<span class="fxc ${cls}" title="${esc(tip)}">${IC[k] || ''}${lab ? `<span class="fxn">${lab}</span>` : ''}<span class="ar">${v ? (v > 0 ? '▲' : '▼').repeat(n) : '·'}</span></span>`;
  }
  const risk = (tip) => `<span class="fxc risk" title="${esc(tip)}">${(BK.FX_IC || {}).risk || ''}<span class="fxn">Риск</span></span>`;
  const lvl = (x, a, b) => (Math.abs(x) < 1e-9 ? 0 : Math.abs(x) < a ? 1 : Math.abs(x) < b ? 2 : 3) * Math.sign(x);
  const revM = (S) => Math.max(S.lastMonthRev || 0, 1e6);

  /* ---------- вкладка «Рост» ---------- */
  function tabs(S, T) {
    if (!S || !G_().anyUnlocked(S) || (S.corp && S.corp.active && S.corp.active !== 'ufa')) return T;
    const i = T.findIndex((x) => x[0] === 'market');
    return T.slice(0, i + 1).concat([['grow', 'Рост']], T.slice(i + 1));
  }
  function tabDot(S) { const n = attItems(S).filter((x) => x.lvl !== 'info' || x.dec).length; return n ? 'dot' : 0; }
  function head(S) {
    const GR = G_(), sm = GR.summary(S), L = sm.last;
    const share = L && S.history.length ? sm.rev / Math.max(1, S.history[S.history.length - 1].rev) : 0;
    return `<div class="sec gr-head"><h3><span class="gr-h">${ICON.grow}Рост вглубь</span><small>${sm.unlocked} из 5 направлений</small></h3>
      <p class="hint" style="margin:0">Город не бесконечен: новые точки находятся всё реже. Дальше сеть растёт вглубь — производство, полки, франшиза, флагман и заказы. У каждого направления своя цена и свой риск.</p>
      <div class="kpis"><div class="kpi"><span class="k">Выручка направлений${L ? ', ' + E().MONTHS[L.m] : ''}</span><span class="v">${L ? fm(sm.rev) : '—'}</span><span class="d">${L ? pc(share) + ' оборота сети' : 'итог — после 1-го числа'}</span></div>
      <div class="kpi"><span class="k">Прибыль направлений</span><span class="v${L && sm.profit < 0 ? ' negc' : ''}">${L ? fm(sm.profit) : '—'}</span><span class="d">с экономией фудкоста сети</span></div>
      <div class="kpi"><span class="k" title="Сети супермаркетов платят с отсрочкой — эти деньги уже заработаны, но ещё не на счёте">Ждём оплаты от сетей</span><span class="v">${fm(sm.recv)}</span><span class="d">отсрочка 30–60 дней</span></div>
      <div class="kpi"><span class="k">Франчайзи · контракты</span><span class="v">${sm.fr} · ${sm.contracts}</span><span class="d">${sm.frOpen} работают</span></div></div></div>`;
  }
  function secHead(k, status, extra) {
    return `<h3><span class="gr-h">${ICON[k]}${esc(G_().NAMES[k])}</span>${status || ''}</h3><p class="hint gr-lead">${esc(WHY[k].minus)}</p>${extra || ''}`;
  }
  function panel(S, ui) {
    const GR = G_(); GR.ensure(S);
    if (!GR.anyUnlocked(S)) return `<div class="empty">Рост вглубь откроется, когда сеть вырастет.</div>`;
    let s = head(S);
    for (const k of GR.KEYS) if (GR.unlocked(S, k)) s += ({ cater: catSec, flag: flagSec, factory: facSec, retail: retSec, fran: frSec })[k](S, ui);
    if (BK.Scenario && BK.Scenario.blocks && BK.Scenario.blocks(S, 'flag')) s += `<div class="sec gr-next"><h3><span class="gr-h">${ICON.flag}${esc(GR.NAMES.flag)}</span></h3><p class="hint" style="margin:0">В этой истории флагмана нет: сеть растёт только маленькими кофейнями.</p></div>`;
    const nx = GR.nextUnlock(S);
    if (nx) s += `<div class="sec gr-next"><h3><span class="gr-h">${ICON[nx.key]}Дальше: ${esc(nx.name)}</span></h3><p class="hint" style="margin:0">${esc(WHY[nx.key].lead)} Откроется при <b>${nx.stores}</b> открытых точках (сейчас ${nx.have}) или обороте <b>${fm(nx.rev)}</b> за 12 мес. (сейчас ${fm(nx.rolling)}).</p></div>`;
    return s;
  }
  // мощность на день выдачи/поставки: что скажет план
  function capLine(S, P, what) {
    if (P.fill < 0.999) return `<div class="gr-cap bad">${(BK.FX_IC || {}).risk || ''}Не хватит мощности: выдадим ~${pc(P.fill)} ${what} — неустойка.</div>`;
    if (P.wsOver > 1) return `<div class="gr-cap warn">${(BK.FX_IC || {}).prod || ''}Фабрики не хватает, берём из цехов: точки недополучат ~${n0(P.wsOver)} изд./день.</div>`;
    if (P.fromWs > 1) return `<div class="gr-cap ok">${(BK.FX_IC || {}).prod || ''}Из свободной мощности цехов (${n0(P.fromWs)} изд./день) — точкам хватит.</div>`;
    return `<div class="gr-cap ok">${(BK.FX_IC || {}).prod || ''}С фабрики — мощности хватает.</div>`;
  }

  /* ---------- кейтеринг ---------- */
  function catSec(S) {
    const GR = G_(), g = S.growth, T = g.cat, k = K(), pl = S.macro.priceLevel, L = g.last;
    const status = T.team ? '<span class="chip good">своя команда</span>' : '';
    let s = `<div class="sec gr-sec" id="gr-cater">${secHead('cater', status)}`;
    s += `<div class="row sp"><span class="hint">Выполнено заказов: <b>${T.done}</b>${T.failed ? ` · сорвано: <b class="negc">${T.failed}</b>` : ''}${L && L.rev.cater ? ` · выручка за ${E().MONTHS[L.m]}: <b>${fm(L.rev.cater)}</b>` : ''}</span>
      ${T.team ? '' : H().btn('grTeam', 'Собрать команду', { cls: 'sm', cost: Math.round(k.CAT_TEAM * pl), dis: S.cash < k.CAT_TEAM * pl, title: `Развоз, сервировка, менеджер заказов: заказов и объёма ×${String(k.CAT_TEAM_K).replace('.', ',')}, ${fm(k.CAT_TEAM_MONTH * pl)} в месяц` })}</div>`;
    if (!T.offers.length) s += `<div class="hint">Новых заказов пока нет — больше всего их в декабре, марте, июне и сентябре.</div>`;
    for (const o of T.offers) {
      const P = GR.capPlan(S, o.start, o.units / o.days), v = GR.orderValue(S, o), R = revM(S);
      const fx = fxc('rub', '', lvl(v / R * 100, 1, 4), `Выручка заказа ${fm(v)}`) + fxc('prod', 'Цех', -Math.max(1, lvl(o.units / o.days / Math.max(1, P.fcap + g.ws.cap) * 100, 15, 40)), 'Нагрузка на производство в дни выдачи')
        + fxc('guests', 'Гости', P.wsOver > 1 ? -lvl(P.wsOver / Math.max(1, g.ws.units) * 100, 5, 15) : 0, P.wsOver > 1 ? 'Точки недополучат выпечку' : 'Точкам хватит') + (P.fill < 0.999 ? risk('Можем сорвать заказ') : '');
      s += `<article class="gr-card" data-gid="${o.id}"><div class="gr-ct"><b>${esc(o.client)}</b><span class="hint">${esc(o.what)}</span><span class="gr-left">ответить до ${date(o.until)}</span></div>
        <div class="gr-facts"><span><small>Изделий</small><b>${n0(o.units)}</b></span><span><small>Выдача</small><b>${date(o.start)}${o.days > 1 ? `, ${o.days} дн.` : ''}</b></span><span><small>Оплата</small><b>${fm(v)}</b></span></div>
        ${capLine(S, P, 'заказа')}<div class="gr-row"><span class="gr-fx">${fx}</span><span class="gr-acts"><button class="btn sm primary" data-act="grOrder" data-arg="${o.id}">Принять</button><button class="btn sm" data-act="grOrderNo" data-arg="${o.id}">Отказаться</button></span></div></article>`;
    }
    if (T.acc.length) s += `<div class="gr-list"><div class="hint">Принятые заказы</div>${T.acc.map((o) => `<div class="gr-li"><span>${esc(o.client)}<small>${n0(o.units)} изд. · ${date(o.start)}</small></span><b>${fm(GR.orderValue(S, o))}</b></div>`).join('')}</div>`;
    return s + '</div>';
  }

  /* ---------- флагман ---------- */
  function flagSec(S) {
    const GR = G_(), g = S.growth, f = g.flag, k = K(), pl = S.macro.priceLevel;
    let s = `<div class="sec gr-sec" id="gr-flag">`;
    if (!f) {
      s += secHead('flag', '');
      for (const o of g.flagSites) {
        const c = GR.flagBuildCost(S, o), rent = k.FLAG_RENT * o.rentK * pl, guests = k.FLAG_GUESTS * o.tk, rev = guests * k.FLAG_CHECK * pl * 30.4;
        const fx = fxc('rub', '', -lvl(c / revM(S) * 100, 8, 25), `Ремонт и запуск ${fm(c)}, аренда ${fm(rent)} в месяц`) + fxc('guests', 'Гости', 1, `Гости всех точек +${String(k.FLAG_NET * 100).replace('.', ',')} %`) + fxc('check', 'Чек', 1, 'На полках и у франчайзи бренд сильнее');
        s += `<article class="gr-card" data-gid="${o.id}"><div class="gr-ct"><b>${esc(o.address)}</b><span class="hint">${esc(dname(o.district))} · ${o.area} м² · туристический поток ×${String(o.tk).replace('.', ',')}</span></div>
          <div class="gr-facts"><span><small>Ремонт и запуск</small><b>${fm(c)}</b></span><span><small>Аренда в месяц</small><b>${fm(rent)}</b></span><span><small>Гостей в день</small><b>≈${n0(guests)}</b></span><span><small>Выручка в месяц</small><b>≈${fm(rev)}</b></span></div>
          <div class="gr-row"><span class="gr-fx">${fx}</span><span class="gr-acts"><button class="btn sm primary" data-act="grFlag" data-arg="${o.id}"${S.cash < c ? ' disabled title="Не хватает денег"' : ''}>Открыть флагман · ${fm(c)}</button></span></div></article>`;
      }
      return s + '</div>';
    }
    if (f.status === 'build') {
      const p = (S.day - f.day) / Math.max(1, f.readyDay - f.day);
      return s + secHead('flag', '<span class="chip">ремонт</span>') + `<div class="card"><div class="card-t">${esc(f.address)}</div><div class="card-s">${esc(dname(f.district))} · откроется ${E().fmtDate(f.readyDay)}</div>${H().meter(p, 'ok')}</div></div>`;
    }
    const L = g.last, mc = GR.flagMonthCost(S), day = GR.flagDay(S, E().dateOf(S.day));
    s += secHead('flag', '<span class="chip good">работает</span>');
    s += `<div class="kpis"><div class="kpi"><span class="k">${esc(f.address)}</span><span class="v">≈${n0(day.guests)} гостей</span><span class="d">в день сейчас</span></div>
      <div class="kpi"><span class="k">Выручка · прибыль${L ? ', ' + E().MONTHS[L.m] : ''}</span><span class="v">${L ? fm(L.rev.flag) : '—'}</span><span class="d">${L ? `прибыль ${fm(L.pr.flag)}` : 'после 1-го числа'}</span></div>
      <div class="kpi"><span class="k">Узнаваемость сети</span><span class="v">+${(k.FLAG_NET * GR.flagRamp(S) * 100).toFixed(1).replace('.', ',')} %</span><span class="d">гостей во всех точках</span></div>
      <div class="kpi"><span class="k">Расходы в месяц</span><span class="v">${fm(mc.total)}</span><span class="d">аренда, команда, коммуналка</span></div></div>`;
    s += `<div class="row sp"><span class="hint">Программа для туристов: мастер-классы и экскурсии, гостей ×${String(k.FLAG_TOUR_K).replace('.', ',')} в мае–сентябре, ${fm(k.FLAG_TOUR * pl)} в месяц.</span><div class="seg" role="group" aria-label="Программа для туристов"><button data-act="grTour" data-arg="0" aria-pressed="${!f.tour}">Выкл</button><button data-act="grTour" data-arg="1" aria-pressed="${!!f.tour}">Вкл</button></div></div>`;
    return s + '</div>';
  }

  /* ---------- фабрика ---------- */
  const MAINT = ['Нет', 'Плановое', 'Сервис'];
  function facSec(S) {
    const GR = G_(), g = S.growth, f = g.fac, k = K(), pl = S.macro.priceLevel;
    let s = `<div class="sec gr-sec" id="gr-factory">`;
    if (!f) {
      s += secHead('factory', '');
      for (const o of g.facSites) {
        const c = GR.facBuildCost(S, o), rent = k.FAC_RENT * o.rentK * pl;
        const fx = fxc('rub', '', -3, `Стройка ${fm(c)}, аренда земли ${fm(rent)} в месяц`) + fxc('prod', 'Цех', 3, `+${n0(k.FAC_CAP[0])} изделий в день`) + risk('Поломки и цена муки');
        s += `<article class="gr-card" data-gid="${o.id}"><div class="gr-ct"><b>${esc(o.address)}</b><span class="hint">${esc(dname(o.district))} · логистика ×${String(o.logi).replace('.', ',')}</span></div>
          <div class="gr-facts"><span><small>Стройка и линии</small><b>${fm(c)}</b></span><span><small>Аренда земли</small><b>${fm(rent)}/мес</b></span><span><small>Мощность</small><b>${n0(k.FAC_CAP[0])} изд./день</b></span><span><small>Срок</small><b>${Math.round(k.FAC_DAYS / 30)} мес.</b></span></div>
          <div class="gr-row"><span class="gr-fx">${fx}</span><span class="gr-acts"><button class="btn sm primary" data-act="grFac" data-arg="${o.id}"${S.cash < c ? ' disabled title="Не хватает денег"' : ''}>Строить · ${fm(c)}</button></span></div></article>`;
      }
      return s + '</div>';
    }
    if (f.status === 'build') {
      const p = (S.day - f.day) / Math.max(1, f.readyDay - f.day);
      return s + secHead('factory', '<span class="chip">стройка</span>') + `<div class="card"><div class="card-t">${esc(f.address)}</div><div class="card-s">${esc(dname(f.district))} · запуск ${E().fmtDate(f.readyDay)} · аренда земли уже платится</div>${H().meter(p, 'ok')}</div></div>`;
    }
    const down = f.down > S.day, P = GR.capPlan(S, S.day + 1), cap = GR.facCap(S), L = g.last, mc = GR.facMonthCost(S);
    s += secHead('factory', down ? `<span class="chip bad">простой до ${date(f.down)}</span>` : `<span class="chip good">${f.lvl}-я очередь</span>`);
    const seg = (v, cls, lab) => (v > 0 && cap ? `<i class="${cls}" style="width:${(v / cap * 100).toFixed(1)}%" title="${lab}: ${n0(v)} изд./день"></i>` : '');
    s += `<div class="gr-capbar" role="img" aria-label="Загрузка фабрики">${seg(Math.min(P.fromFac, P.ret), 'c-ret', 'Полки')}${seg(Math.max(0, P.fromFac - P.ret), 'c-cat', 'Заказы')}${seg(P.frGot, 'c-fr', 'Франчайзи')}${seg(P.semis, 'c-semi', 'Полуфабрикаты сети')}</div>
      <div class="gr-legend"><span><i class="c-ret"></i>Полки</span><span><i class="c-cat"></i>Заказы</span><span><i class="c-fr"></i>Франчайзи</span><span><i class="c-semi"></i>Полуфабрикаты</span><span class="hint">${down ? 'стоит' : `свободно ${n0(Math.max(0, P.facFree))} из ${n0(cap)}`}</span></div>`;
    const fk = GR.flourK(S), hedged = f.hedge && f.hedge.until > S.day;
    s += `<div class="kpis"><div class="kpi"><span class="k">Изделие с фабрики</span><span class="v">${n0(GR.facUnit(S))} ₽</span><span class="d">в цехе — ${n0(k.RET_WS_UNIT * pl)} ₽</span></div>
      <div class="kpi"><span class="k">Цена муки</span><span class="v${fk > 1.1 ? ' negc' : ''}">×${fk.toFixed(2).replace('.', ',')}</span><span class="d">${hedged ? `закуплена до ${date(f.hedge.until)}` : `рынок ×${g.flour.toFixed(2).replace('.', ',')}`}</span></div>
      <div class="kpi"><span class="k">Фудкост сети</span><span class="v">−${(k.FAC_NET_CUT * P.cover * 100).toFixed(1).replace('.', ',')} %</span><span class="d">${L ? `сэкономлено ${fm(L.netCut)} за ${E().MONTHS[L.m]}` : 'полуфабрикаты для цехов'}</span></div>
      <div class="kpi"><span class="k">Расходы в месяц</span><span class="v">${fm(mc.total)}</span><span class="d">поломок: ${f.breaks}</span></div></div>`;
    s += `<div class="gr-ctl"><span class="hint">Обслуживание: чем лучше, тем реже поломки (${MAINT.map((m, i) => `${m.toLowerCase()} — ${i ? fm(k.FAC_MAINT[i] * pl) : '0 ₽'}`).join(', ')} в месяц)</span><div class="seg" role="group" aria-label="Обслуживание фабрики">${MAINT.map((m, i) => `<button data-act="grMaint" data-arg="${i}" aria-pressed="${f.maint === i}">${m}</button>`).join('')}</div></div>
      <div class="gr-ctl"><span class="hint">Полуфабрикаты для своих цехов: доля сети (после полок, заказов и франчайзи)</span><div class="seg" role="group" aria-label="Полуфабрикаты для сети">${[0, 0.5, 1].map((v) => `<button data-act="grSemis" data-arg="${v}" aria-pressed="${Math.abs(f.semis - v) < 0.01}">${v * 100} %</button>`).join('')}</div></div>`;
    const hc = GR.hedgeCost(S), ec = GR.facExpCost(S);
    s += `<div class="row">${hedged ? '' : H().btn('grHedge', 'Закупить муку на полгода', { cls: 'sm', cost: hc, dis: S.cash < hc, title: 'Цена муки не изменится полгода; комиссия поставщику сразу' })}${f.lvl < k.FAC_CAP.length ? (f.expDay ? `<span class="chip">${f.lvl + 1}-я очередь — ${E().fmtDate(f.expDay)}</span>` : H().btn('grExpand', `${f.lvl + 1}-я очередь: +${n0(k.FAC_CAP[f.lvl] - k.FAC_CAP[f.lvl - 1])} изд./день`, { cls: 'sm', cost: ec, dis: S.cash < ec })) : ''}</div>`;
    return s + '</div>';
  }

  /* ---------- полки ---------- */
  function retSec(S) {
    const GR = G_(), g = S.growth, R = g.ret, k = K(), pl = S.macro.priceLevel;
    const strikes = (c) => `<span class="gr-strk" role="img" aria-label="Предупреждений ${c.strikes} из ${k.RET_STRIKES}">${Array.from({ length: k.RET_STRIKES }, (_, i) => `<i class="${i < c.strikes ? 'on' : ''}"></i>`).join('')}</span>`;
    let s = `<div class="sec gr-sec" id="gr-retail">${secHead('retail', R.list.length ? `<span class="chip">${nw(R.list.length, 'контракт', 'контракта', 'контрактов')}</span>` : '')}`;
    if (!g.fac || g.fac.status !== 'open') s += `<div class="hint warnc">Без фабрики поставки идут из свободной мощности цехов — дороже, и точкам может не хватить выпечки.</div>`;
    for (const o of R.offers) {
      // план, если взять контракт: ещё o.units к обязательствам
      const extra = GR.capPlan(S, S.day + 1, o.units);
      const price = o.price * pl, rev = o.units * price * 30.4;
      const fx = fxc('rub', '', lvl(rev / revM(S) * 100, 2, 6), `Выручка ≈${fm(rev)} в месяц, деньги — через ${o.pay} дн.`) + fxc('prod', 'Цех', -Math.max(1, lvl(o.units / Math.max(1, extra.fcap + g.ws.cap) * 100, 15, 40)), 'Нагрузка на производство') + fxc('guests', 'Гости', extra.wsOver > 1 ? -lvl(extra.wsOver / Math.max(1, g.ws.units) * 100, 5, 15) : 1, extra.wsOver > 1 ? 'Точки недополучат выпечку' : 'Бренд на полках — гостей в точках чуть больше') + (extra.fill < 0.999 ? risk('Недопоставка — неустойка и страйки') : '');
      s += `<article class="gr-card" data-gid="${o.id}"><div class="gr-ct"><b>Сеть ${esc(o.name)}${o.renew ? ' <span class="chip good">продление</span>' : ''}</b><span class="hint">${esc(o.note)}</span><span class="gr-left">ответить до ${date(o.until)}</span></div>
        <div class="gr-facts"><span><small>Изделий в день</small><b>${n0(o.units)}</b></span><span><small>Цена изделия</small><b>${n0(price)} ₽</b></span><span><small>Выручка в месяц</small><b>≈${fm(rev)}</b></span><span><small>Оплата</small><b>через ${o.pay} дн.</b></span><span><small>Неустойка</small><b>${pc(o.fine)} недопоставки</b></span></div>
        ${capLine(S, extra, 'объёма')}<div class="gr-row"><span class="gr-fx">${fx}</span><span class="gr-acts"><button class="btn sm primary" data-act="grRet" data-arg="${o.id}">Подписать на год</button><button class="btn sm" data-act="grRetNo" data-arg="${o.id}">Отказаться</button></span></div></article>`;
    }
    if (!R.offers.length && R.list.length < (k.RET_MAX_ACTIVE || 9)) s += `<div class="hint">Новых предложений пока нет — сети приходят раз в 2–3 месяца.</div>`;
    if (R.list.length) s += `<div class="gr-list">${R.list.map((c) => `<div class="gr-li"><span>${esc(c.name)} ${strikes(c)}<small>${n0(c.units)} изд./день · до ${E().fmtDate(c.end)}${c.lastFill != null ? ` · поставлено ${pc(c.lastFill)}` : ''}</small></span><b>${fm(c.units * c.price * pl * 30.4)}<small>в месяц</small></b></div>`).join('')}</div>`;
    s += `<div class="hint">Ждём оплаты: <b>${fm(GR.recvTotal(S))}</b> — эти деньги заработаны, но придут на счёт позже.</div>`;
    return s + '</div>';
  }

  /* ---------- франшиза ---------- */
  const CTRL = ['Нет', 'Выборочный', 'Регулярный', 'Тайный покупатель'];
  const starsSeen = (v) => `<span class="gr-stars" role="img" aria-label="Опыт и репутация: ${String(v).replace('.', ',')} из 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${v >= i ? 'on' : v >= i - 0.5 ? 'half' : ''}"></i>`).join('')}</span>`;
  function frSec(S, ui) {
    const GR = G_(), g = S.growth, F = g.fr, k = K(), pl = S.macro.priceLevel;
    let s = `<div class="sec gr-sec" id="gr-fran">${secHead('fran', F.list.length ? `<span class="chip">${nw(F.list.length, 'франчайзи', 'франчайзи', 'франчайзи')}</span>` : '')}`;
    s += `<div class="gr-ctl"><span class="hint">Контроль качества партнёров (на каждого, в месяц): ${CTRL.map((c, i) => `${c.toLowerCase()} — ${i ? fm(k.FR_CTRL[i] * pl) : '0 ₽'}`).join(', ')}. Строже — реже скандалы и точнее видно кандидатов.</span><div class="seg gr-seg4" role="group" aria-label="Контроль качества">${CTRL.map((c, i) => `<button data-act="grCtrl" data-arg="${i}" aria-pressed="${F.ctrl === i}">${c}</button>`).join('')}</div></div>`;
    for (const c of F.cand) {
      const fee = c.fee * pl, sales = k.FR_SALES * pl * (0.55 + 0.6 * Math.min(1, c.seen / 5)), roy = sales * k.FR_ROYALTY;
      const fx = fxc('rub', '', 2, `Взнос ${fm(fee)} сразу, роялти ≈${fm(roy)} в месяц`) + fxc('guests', 'Гости', 0, 'Своих гостей не забирает — район без ваших точек') + (c.seen < 3.5 ? risk('Слабый партнёр — выше риск скандала') : '');
      s += `<article class="gr-card" data-gid="${c.id}"><div class="gr-ct"><b>${esc(c.partner)}</b><span class="hint">${esc(c.bio)}</span><span class="gr-left">ждёт до ${date(c.until)}</span></div>
        <div class="gr-facts"><span><small>Район</small><b>${esc(dname(c.district))}</b></span><span><small>Опыт и репутация</small><b>${starsSeen(c.seen)}</b></span><span><small>Взнос нам</small><b>${fm(fee)}</b></span><span><small>Роялти</small><b>≈${fm(roy)}/мес</b></span></div>
        <div class="gr-row"><span class="gr-fx">${fx}</span><span class="gr-acts"><button class="btn sm primary" data-act="grFran" data-arg="${c.id}"${F.list.length >= k.FR_MAX ? ' disabled' : ''}>Подписать договор</button></span></div></article>`;
    }
    if (!F.cand.length) s += `<div class="hint">Новые партнёры приходят раз в 2–4 месяца.</div>`;
    if (F.list.length) {
      s += `<div class="gr-list">${F.list.map((f) => {
        const conf = ui.grFrClose === f.id, st = f.status === 'opening' ? `откроется ${date(f.openDay)}` : `оборот ${fm(f.lastSales || 0)}/мес · нам ${fm(f.lastInc || 0)}`;
        const act = conf ? `<span class="row"><button class="btn sm danger" data-act="grFranClose" data-arg="${f.id}">Расторгнуть (${fm(f.fee * k.FR_EXIT)})</button><button class="btn sm" data-act="grFranCloseNo">Отмена</button></span>` : `<button class="linkbtn" data-act="grFranAsk" data-arg="${f.id}">Расторгнуть</button>`;
        return `<div class="gr-li"><span>${esc(f.partner)} ${starsSeen(f.seen)}${f.scandals ? ` <span class="chip bad">скандалов: ${f.scandals}</span>` : ''}<small>${esc(dname(f.district))} · ${st}</small></span>${act}</div>`;
      }).join('')}</div>`;
    }
    return s + '</div>';
  }

  /* ---------- «Требует внимания» ---------- */
  function attItems(S) {
    const out = [], GR = G_(); if (!S || S.phase !== 'play' || !S.growth || !GR.anyUnlocked(S)) return out;
    const g = S.growth;
    if (g.fac && g.fac.status === 'open' && g.fac.down > S.day) out.push({ lvl: 'bad', icHtml: ICON.factory, t: `Фабрика стоит до ${date(g.fac.down)}`, d: 'Полки и заказы снабжают цеха — точки могут недополучить выпечку.', b: { act: 'growTab', arg: 'gr-factory', label: 'Фабрика' } });
    for (const c of g.ret.list) if (c.strikes > 0) out.push({ lvl: 'warn', icHtml: ICON.retail, t: `${esc(c.name)}: предупреждение ${c.strikes} из ${K().RET_STRIKES}`, d: `Поставили ${pc(c.lastFill || 0)} за месяц. Нужна мощность или меньше обязательств.`, b: { act: 'growTab', arg: 'gr-retail', label: 'Полки' } });
    if (g.cat.offers.length) out.push({ lvl: 'info', dec: 1, icHtml: ICON.cater, t: `${nw(g.cat.offers.length, 'новый заказ', 'новых заказа', 'новых заказов')} на кейтеринг`, d: `Ответить до ${date(Math.min(...g.cat.offers.map((o) => o.until)))} — иначе уйдут к другим.`, b: { act: 'growTab', arg: 'gr-cater', label: 'Заказы' } });
    if (g.ret.offers.length) out.push({ lvl: 'info', dec: 1, icHtml: ICON.retail, t: `Сеть ${esc(g.ret.offers[0].name)} предлагает контракт`, d: `${n0(g.ret.offers[0].units)} изделий в день на год, оплата через ${g.ret.offers[0].pay} дн.`, b: { act: 'growTab', arg: 'gr-retail', label: 'Условия' } });
    if (g.fr.cand.length && g.fr.list.length < K().FR_MAX) out.push({ lvl: 'info', dec: 1, icHtml: ICON.fran, t: `${nw(g.fr.cand.length, 'партнёр хочет', 'партнёра хотят', 'партнёров хотят')} франшизу`, d: 'Взнос и роялти — но проверьте опыт и репутацию.', b: { act: 'growTab', arg: 'gr-fran', label: 'Кандидаты' } });
    if (GR.unlocked(S, 'factory') && !g.fac && g.facSites.length) out.push({ lvl: 'info', icHtml: ICON.factory, t: 'Можно строить свою фабрику', d: 'Мощность на полки, франшизу и полуфабрикаты для цехов.', b: { act: 'growTab', arg: 'gr-factory', label: 'Площадки' } });
    if (GR.unlocked(S, 'flag') && !g.flag && g.flagSites.length) out.push({ lvl: 'info', icHtml: ICON.flag, t: 'Можно открыть флагман в центре', d: 'Дорого, но узнаваемость поднимет гостей во всех точках.', b: { act: 'growTab', arg: 'gr-flag', label: 'Помещения' } });
    return out;
  }

  /* ---------- окно «Новая возможность» ---------- */
  function unlockModal(n) {
    const S = APP().state; if (!S) return;
    const keys = (n.keys || []).filter((k) => WHY[k]);
    if (!keys.length) return;
    const one = keys.length === 1;
    let h = `<div class="modal-h gr-mh"><span class="eyebrow pos">Новая возможность</span><h2>${one ? esc(G_().NAMES[keys[0]]) : 'Сеть переросла город'}</h2></div><div class="modal-b gr-mb">`;
    if (!one) h += `<p style="margin:0">Сеть выросла — открылось сразу несколько направлений роста вглубь.</p>`;
    for (const k of keys) {
      h += `<div class="gr-op"><div class="gr-op-h"><span class="gr-op-ic">${ICON[k]}</span>${one ? '' : `<b>${esc(G_().NAMES[k])}</b>`}</div><p>${esc(WHY[k].lead)}</p>
        <div class="gr-pm"><div class="pl"><span class="fxc up">${(BK.FX_IC || {}).rub || ''}<span class="ar">▲</span></span><span>${esc(WHY[k].plus)}</span></div><div class="mi"><span class="fxc risk">${(BK.FX_IC || {}).risk || ''}<span class="fxn">Риск</span></span><span>${esc(WHY[k].minus)}</span></div></div></div>`;
    }
    const nx = G_().nextUnlock(S);
    if (nx) h += `<p class="hint" style="margin:0">Следующее — ${esc(nx.name.toLowerCase())}: при ${nx.stores} точках или обороте ${fm(nx.rev)} за год.</p>`;
    h += `</div><div class="modal-f"><button class="btn primary block" data-act="growTab" data-arg="gr-${keys[0]}">Открыть «Рост»</button><button class="btn block" data-act="closeModal">Позже</button></div>`;
    APP().openModal(h, { closable: true });
  }

  /* ---------- карта ---------- */
  const FAC_PATH = 'M-10,7 L-10,-1 L-5,-4.5 L-5,-1 L0,-4.5 L0,-1 L5,-4.5 L5,-9 L8,-9 L8,7 Z';
  const STAR = 'M0,-7 L2,-2.3 L6.9,-2.2 L3.1,1 L4.3,5.7 L0,3 L-4.3,5.7 L-3.1,1 L-6.9,-2.2 L-2,-2.3 Z';
  function mapItems(S, k, isSel) {
    const out = []; if (!S.growth || !G_().anyUnlocked(S) || !G_().ufaOn(S)) return out;
    const g = S.growth, sel = (id) => (isSel && (isSel('gfac', id) || isSel('gflag', id) || isSel('gfr', id) || isSel('gsite', id)) ? ' sel' : '');
    for (const o of g.facSites) out.push(['gs' + o.id, `<g class="m-gsite fac${sel(o.id)}" data-kind="gsite" data-id="${o.id}" transform="translate(${o.x},${o.y}) scale(${k})"><rect x="-15" y="-12" width="30" height="24" rx="4"/><path d="${FAC_PATH}" transform="scale(.8)"/></g>`]);
    for (const o of g.flagSites) out.push(['gs' + o.id, `<g class="m-gsite flag${sel(o.id)}" data-kind="gsite" data-id="${o.id}" transform="translate(${o.x},${o.y}) scale(${k})"><circle r="13"/><path d="${STAR}"/></g>`]);
    for (const f of g.fr.list) out.push(['gf' + f.id, `<g class="m-gfr ${f.status}${sel(f.id)}" data-kind="gfr" data-id="${f.id}" transform="translate(${f.x},${f.y}) scale(${k})"><circle r="7.5"/><text>ф</text></g>`]);
    if (g.fac) { const f = g.fac, dn = f.status === 'open' && f.down > S.day; out.push(['gfac', `<g class="m-gfac ${f.status}${dn ? ' down' : ''}${sel(f.id)}" data-kind="gfac" data-id="${f.id}" transform="translate(${f.x},${f.y}) scale(${k})"><rect x="-17" y="-14" width="34" height="28" rx="4"/><path d="${FAC_PATH}"/>${dn ? '<circle class="m-alert" cx="15" cy="-12" r="6"/><text class="m-alert-t" x="15" y="-12">!</text>' : ''}</g>`]); }
    if (g.flag) { const f = g.flag; out.push(['gflag', `<g class="m-gflag ${f.status}${sel(f.id)}" data-kind="gflag" data-id="${f.id}" transform="translate(${f.x},${f.y}) scale(${k})"><circle class="ring" r="18"/><circle r="14"/><path d="${STAR}" transform="scale(1.25)"/></g>`]); }
    return out;
  }
  function tip(S, kind, id) {
    const g = S.growth; if (!g) return '';
    if (kind === 'gfac' && g.fac) { const f = g.fac; return `<b>Своя фабрика</b><br>${esc(f.address)}<br>${f.status === 'build' ? `Стройка до ${E().fmtDate(f.readyDay)}` : f.down > S.day ? `Простой до ${date(f.down)}` : `${f.lvl}-я очередь · ${n0(G_().facCap(S))} изд./день`}`; }
    if (kind === 'gflag' && g.flag) { const f = g.flag; return `<b>Флагман</b><br>${esc(f.address)}<br>${f.status === 'build' ? `Откроется ${E().fmtDate(f.readyDay)}` : `≈${n0(f.guests || 0)} гостей в день · узнаваемость сети`}`; }
    if (kind === 'gfr') { const f = g.fr.list.find((x) => x.id === id); return f ? `<b>Франчайзи: ${esc(f.partner)}</b><br>${esc(f.address)} · ${esc(dname(f.district))}<br>${f.status === 'opening' ? `Откроется ${date(f.openDay)}` : `Оборот ${fm(f.lastSales || 0)}/мес, нам ${fm(f.lastInc || 0)}`}` : ''; }
    if (kind === 'gsite') {
      const a = g.facSites.find((x) => x.id === id), b = g.flagSites.find((x) => x.id === id);
      if (a) return `<b>Площадка под фабрику</b><br>${esc(a.address)} · ${esc(dname(a.district))}<br>Стройка ${fm(G_().facBuildCost(S, a))}`;
      if (b) return `<b>Помещение под флагман</b><br>${esc(b.address)} · ${esc(dname(b.district))}<br>Ремонт и запуск ${fm(G_().flagBuildCost(S, b))}`;
    }
    return '';
  }
  function legend(S) {
    if (!S.growth || !G_().ufaOn(S)) return '';
    const g = S.growth; let h = '';
    if (g.fac) h += `<span class="lg-r"><svg viewBox="-17 -14 34 28" class="lg-sw" aria-hidden="true"><rect x="-15" y="-12" width="30" height="24" rx="4" fill="var(--crust)"/></svg><span>Фабрика${g.fac.status === 'build' ? ' · стройка' : ''}</span><b>${g.fac.status === 'open' ? g.fac.lvl + '-я' : '—'}</b></span>`;
    if (g.flag) h += `<span class="lg-r"><svg viewBox="-16 -16 32 32" class="lg-sw" aria-hidden="true"><circle r="14" fill="var(--crust)"/></svg><span>Флагман</span><b>1</b></span>`;
    if (g.fr.list.length) h += `<span class="lg-r"><svg viewBox="-9 -9 18 18" class="lg-sw" aria-hidden="true"><circle r="7" fill="var(--surface)" stroke="var(--crust)" stroke-width="2" stroke-dasharray="3 2"/></svg><span>Франчайзи</span><b>${g.fr.list.length}</b></span>`;
    return h;
  }

  /* ---------- действия ---------- */
  function go(sec) {
    const A = APP(); A.closeModal(); A.ACT.tab({ arg: 'grow' });
    if (sec) requestAnimationFrame(() => { const el = document.getElementById(sec); if (el) el.scrollIntoView({ block: 'start' }); });
  }
  function boot() {
    const A = APP() && APP().ACT; if (!A) return;
    const run = (fn, ok) => (d) => { const S = APP().state, r = fn(S, d); if (r && r.ok === false && r.msg) APP().toast('Не получилось', r.msg, 'warn'); else if (r && r.ok && ok) APP().toast(ok, '', 'good'); APP().save(); APP().refresh(); };
    Object.assign(A, {
      growTab: (d) => go(d && d.arg),
      grOrder: run((S, d) => G_().acceptOrder(S, d.arg), 'Заказ принят'),
      grOrderNo: run((S, d) => G_().declineOrder(S, d.arg)),
      grTeam: run((S) => G_().hireTeam(S), 'Команда кейтеринга собрана'),
      grFlag: run((S, d) => G_().buildFlag(S, d.arg), 'Флагман: начат ремонт'),
      grTour: run((S, d) => G_().setTour(S, d.arg === '1')),
      grFac: run((S, d) => G_().buildFactory(S, d.arg), 'Стройка фабрики началась'),
      grMaint: run((S, d) => G_().setMaint(S, +d.arg)),
      grSemis: run((S, d) => G_().setSemis(S, +d.arg)),
      grHedge: run((S) => G_().hedge(S), 'Мука закуплена на полгода'),
      grExpand: run((S) => G_().expandFactory(S), 'Расширение фабрики началось'),
      grRet: run((S, d) => G_().acceptContract(S, d.arg), 'Контракт подписан'),
      grRetNo: run((S, d) => G_().declineOffer(S, d.arg)),
      grCtrl: run((S, d) => G_().setControl(S, +d.arg)),
      grFran: run((S, d) => G_().signFran(S, d.arg), 'Договор франшизы подписан'),
      grFranAsk: (d) => { APP().ui.grFrClose = d.arg; APP().refresh(); },
      grFranCloseNo: () => { APP().ui.grFrClose = null; APP().refresh(); },
      grFranClose: run((S, d) => { APP().ui.grFrClose = null; return G_().closeFran(S, d.arg); }, 'Договор расторгнут'),
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);

  BK.GrowthUI = { tabs, tabDot, panel, attItems, unlockModal, mapItems, tip, legend, ICON, WHY };
})();
