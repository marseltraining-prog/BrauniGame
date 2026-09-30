/* Второй акт, этап Р2: интерфейс директоров — цель «Федеральная сеть», «Требует внимания», блоки города (директор, бюджет и цели,
   план/факт), вкладки «Директора», «Отчёты» (входящие с просьбами), «Сравнение городов», окна найма и победы акта.
   Движок — BK.Dir (directors.js). Стиль — макеты docs/mockups/russia-1…4. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, H = () => BK.UIH, C = () => BK.CFG, K = () => BK.CFG.CORP, D = () => BK.Dir;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = (v) => BK.fmtMoney(v);
  const cname = (id) => (BK.CITY_BY_ID[id] || {}).name || id;
  const cshort = (id) => { const d = BK.CITY_BY_ID[id] || {}; return d.short || d.name || id; };
  const cin = (id) => (BK.CITY_BY_ID[id] || {}).in || 'в городе ' + cname(id);
  const initials = (n) => String(n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const g = (d, m, f) => (d && d.f ? f : m);
  const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const pc1 = (v) => (v >= 0 ? '+' : '−') + n1(Math.abs(v * 100)) + ' %';
  const MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const PRIO = { growth: 'Рост', profit: 'Прибыль', quality: 'Качество' };
  const SKN = { ops: 'Операции', econ: 'Экономия', growth: 'Рост', people: 'Люди' };
  const STN = (s) => ((BK.DIRECTOR_STYLES || {})[s] || {}).name || s;
  const GRN = (gr) => (BK.DIRECTOR_GRADES || [])[gr] || '';
  const TR = (t) => (BK.DIRECTOR_TRAITS || {})[t] || { name: t, desc: '' };
  const on = (S) => !!(S && S.corp && S.corp.unlockedDay != null && BK.Dir);
  const dateTxt = (day) => { const t = E().dateOf(day); return `${t.d} ${E().MONTHS_G[t.m]}`; };

  const av = (name, cls, sub) => `<span class="dav ${cls || ''}" aria-hidden="true">${esc(initials(name))}${sub || ''}</span>`;
  function loyBar(d, big) {
    const L = Math.round(d.loyalty), t = d.loyD || 0, cls = L < 35 ? 'bad' : L < 55 ? 'warn' : 'good';
    const arr = Math.abs(t) < 0.05 ? '' : `<span class="ld ${t > 0 ? 'up' : 'down'}">${t > 0 ? '▲' : '▼'}${big ? ' ' + (t > 0 ? '+' : '−') + n1(Math.abs(t)) + '/мес' : ''}</span>`;
    return `<span class="loy ${cls}${big ? ' big' : ''}" title="Лояльность ${L} из 100"><span class="lm"><i style="width:${L}%"></i></span><b>${L}</b>${arr}</span>`;
  }
  function skillRows(d, cand) {
    const cap = K().DIR_CAP[d.grade];
    return `<div class="dsk">${D().SK.map((k) => { const v = Math.round(cand ? d.seen[k] : d.skills[k]); return `<span class="sn">${SKN[k]}</span><span class="sb"><i style="width:${Math.min(100, v)}%"></i><em style="left:${cap}%" title="Потолок грейда ${cap}"></em></span><b>${cand ? '≈' : ''}${v}</b>`; }).join('')}</div>`;
  }
  const skillMini = (d) => `<span class="dmini" title="${D().SK.map((k) => SKN[k] + ' ' + Math.round(d.skills[k])).join(' · ')}">${D().SK.map((k) => `<i style="height:${Math.max(8, Math.round(d.skills[k]))}%"></i>`).join('')}</span>`;
  function traitChips(S, d, cand) {
    let s = d.traits.map((t) => `<span class="chip" title="${esc(TR(t).desc)}">${esc(g(d, TR(t).name, TR(t).name.replace(/ый$|ий$/, 'ая')))}</span>`).join('');
    const kn = (d.known || []).filter((t) => TR(t).hidden !== false);
    s += kn.map((t) => `<span class="chip bad" title="${esc(TR(t).desc)}">${esc(TR(t).name)}${t === 'theft' && d.caught ? ' · пойман' + g(d, '', 'а') : ''}</span>`).join('');
    if (S.difficulty === 'easy') { if (!kn.length) s += `<span class="chip good" title="На «Лёгком» скрытые черты видны при найме">скрытых черт нет</span>`; }
    else if (d.checked && !kn.length) s += `<span class="chip good" title="Проверка не нашла нарушений (но и не гарантирует их отсутствие)">проверен${g(d, '', 'а')}: нарушений нет</span>`;
    else if (!kn.length) s += `<span class="chip dashed" title="Скрытые черты раскрывают служба безопасности, финансовый департамент, аудит, личный визит в город или проверка при найме">? скрытая черта не проверена</span>`;
    return `<div class="row ru-chips">${s}</div>`;
  }
  const styleChip = (d, c) => { const m = c ? D().match(d, c) : 0; return `<span class="chip ${m > 0 ? 'good' : m < 0 ? 'bad' : ''}" title="${esc(((BK.DIRECTOR_STYLES || {})[d.style] || {}).desc || '')}">Стиль: ${STN(d.style)}${c ? (m > 0 ? ' · совпадает с приоритетом, +5 %' : m < 0 ? ' · против приоритета, −5 %' : '') : ''}</span>`; };

  /* ---------------- цель акта ---------------- */
  function fedMode(S) { return on(S) && (Object.keys(S.corp.cities).length >= 2 || S.won); }
  function fedCard(S) {
    if (!on(S)) return '';
    const f = D().fedStatus(S), h = H();
    const segs = []; for (let i = 0; i < f.need; i++) { const r = f.rows[i]; const p = r ? Math.min(1, r.open / f.per) : 0; segs.push(`<span class="fs${p >= 1 ? ' full' : ''}"><i style="width:${(p * 100).toFixed(0)}%"></i><small>${r && r.open ? esc(cshort(r.id).slice(0, 3)) : ''}</small></span>`); }
    const lack = f.rows.filter((r) => r.open < f.per).sort((a, b) => b.open - a.open)[0];
    const pRev = Math.min(1, f.rev / f.target);
    const top = f.done ? `<span class="gd">взята ${esc(E().fmtDate(S.corp.fed.goalDay))}</span>` : `<span class="gd">${esc(etaFed(S, f))}</span>`;
    let s = `<div class="goalcard fedcard"><div class="top"><span class="caps">Цель акта · Федеральная сеть</span>${top}</div>
      <div class="fr"><span>Города с ${f.per}+ точками</span><b class="big2">${f.cities} <span>из ${f.need}</span></b></div><div class="fsegs">${segs.join('')}</div>
      <div class="fr"><span>Оборот сети за 12 мес.</span><b class="big2">${n1(f.rev / 1e9)} <span>из ${Math.round(f.target / 1e9)} млрд ₽</span></b></div>${h.goalBar(pRev)}
      <div class="foot"><span>${f.done ? (f.legendDone ? '«Лидер рынка» взят' : `«Лидер рынка»: ${n1(f.rev / 1e9)} из ${Math.round(f.legend / 1e9)} млрд`) : lack ? `${esc(cname(lack.id))}: до ${f.per} точек — ${f.per - lack.open}` : 'Нужны новые города'}</span><span>затем «Лидер рынка» · ${Math.round(f.legend / 1e9)} млрд</span></div></div>`;
    return s;
  }
  function etaFed(S, f) { // грубо: при темпе роста оборота сети за год
    const hs = S.history; if (hs.length < 24) return 'прогноз — через год';
    const a = hs.slice(-12).reduce((x, y) => x + y.rev, 0), b = hs.slice(-24, -12).reduce((x, y) => x + y.rev, 0);
    if (!(b > 0) || a <= b) return 'оборот не растёт';
    const gr = Math.min(0.6, a / b - 1), yrs = Math.log(f.target / Math.max(1, f.rev)) / Math.log(1 + gr);
    if (yrs > 25) return 'оборот растёт медленно';
    return yrs <= 0 ? 'оборот взят' : `≈ ${yrs < 1 ? Math.max(1, Math.round(yrs * 12)) + ' мес.' : n1(yrs) + ' г.'} по обороту`;
  }
  // HUD: две полосы «Города» и «Оборот»
  function hudGoal(S) {
    const f = D().fedStatus(S);
    return { k: 'Цель · Федеральная сеть', p: f.done ? 'взята' : `${f.cities}/${f.need}`, v: `${n1(f.rev / 1e9)} / ${Math.round(f.target / 1e9)} млрд`,
      bars: `<div class="hfed"><span>Города</span><span class="hb"><i style="width:${Math.min(100, f.cities / f.need * 100).toFixed(0)}%"></i></span><b>${f.cities}/${f.need}</b><span>Оборот</span><span class="hb"><i style="width:${Math.min(100, f.rev / f.target * 100).toFixed(1)}%"></i></span><b>${n1(f.rev / 1e9)}/${Math.round(f.target / 1e9)}</b></div>` };
  }

  /* ---------------- Р4 ч. 2: мощность штаба и перегрузка (BK.HQ.load) ---------------- */
  const n1h = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  function hqOverTitle(S, L) { return `Штаб перегружен: ${H().nw(L.cities, 'город', 'города', 'городов')} при мощности ${n1h(L.cap)}${Math.abs(L.load - L.cities) >= 0.05 ? ` (нагрузка ${n1h(L.load)})` : ''}`; }
  function hqOverText(L) { const k = K(); return `утечка +${Math.round(Math.min(k.LEAK_MAX, k.OVER_LEAK * L.over) * 100)} % во всех городах директоров, открытий −${Math.round(Math.min(1 - (k.OVER_OPEN_MIN || 0.25), (k.OVER_OPEN || 0) * L.over) * 100)} %`; }
  // полоса «нагрузка / мощность»: opts.extra — «если войти ещё в город», opts.btn — кнопка «Штаб», opts.parts — разбор
  function hqLoadHtml(S, opts) {
    if (!on(S) || !BK.HQ || !BK.HQ.load) return '';
    opts = opts || {};
    const k = K(), L = BK.HQ.load(S, opts.extra || 0), wNew = 1 + (k.HQ_W_NEW || 0);
    const cls = L.over > 0 ? 'over' : L.load > L.cap - wNew + 0.001 ? 'near' : '';
    const max = Math.max(L.cap, L.load) * 1.08;
    let head;
    if (opts.extra) head = L.over > 0 ? `После входа штаб перегружен: ${H().nw(L.cities, 'город', 'города', 'городов')} при мощности ${n1h(L.cap)}` : `После входа: нагрузка ${n1h(L.load)} при мощности ${n1h(L.cap)}`;
    else head = L.over > 0 ? hqOverTitle(S, L) : `Штаб: нагрузка ${n1h(L.load)} при мощности ${n1h(L.cap)}`;
    let sub;
    if (L.over > 0) sub = `${opts.extra ? 'Будет ' : ''}${hqOverText(L)}. Разгрузить: отдел штаба (+${n1h(k.HQ_CAP_DEPT)} за уровень, в полную силу через год), место в совете директоров (+${n1h(k.HQ_CAP_BOARD)}), региональный директор (город кластера — ${n1h(k.HQ_W_REGION)}); с новыми городами подождать.`;
    else { const free = L.cap - L.load, n = Math.floor(free / wNew + 1e-9); sub = opts.extra ? `Штаб потянет: запас ${n1h(free)}. Новый город первые полтора года весит до ${n1h(wNew)}.` : n > 0 ? `Запас ${n1h(free)} — ещё ${H().nw(n, 'город', 'города', 'городов')} без перегрузки (новый город первые полтора года весит до ${n1h(wNew)}).` : `Запас ${n1h(free)} — новый город (до ${n1h(wNew)}) перегрузит штаб: сначала отдел или место в совете.`; }
    let s = `<div class="hqload ${cls}"><div class="hl-h"><b>${esc(head)}</b><span class="num">${n1h(L.load)} / ${n1h(L.cap)}</span></div><div class="hl-bar" role="progressbar" aria-label="Нагрузка штаба" aria-valuemin="0" aria-valuemax="${n1h(L.cap)}" aria-valuenow="${n1h(L.load)}"><i style="width:${Math.min(100, L.load / max * 100).toFixed(1)}%"></i><em style="left:${(L.cap / max * 100).toFixed(1)}%" title="Мощность штаба"></em></div><span class="hl-s${L.over > 0 ? ' negc' : ''}">${esc(sub)}</span>`;
    if (opts.parts) s += `<dl class="hqparts"><dt>Мощность: сами с помощниками</dt><dd>${n1h(k.HQ_CAP0)}</dd><dt>Отделы штаба (уровней ${BK.HQ.KEYS.reduce((a, x) => a + BK.HQ.lvlOf(S, x), 0)}, новые — в силу за год)</dt><dd>+${n1h(k.HQ_CAP_DEPT * L.dept)}</dd><dt>Совет директоров (${L.board})</dt><dd>+${n1h(k.HQ_CAP_BOARD * L.board)}</dd>
      <dt>Нагрузка: городов</dt><dd>${L.cities}</dd>${L.fresh ? `<dt class="sub">запуск новых городов (первые 1,5 года)</dt><dd>+${n1h(L.fresh)}</dd>` : ''}${L.nodir ? `<dt class="sub">без директора (${L.nodir})</dt><dd>+${n1h(L.nodir * (k.HQ_W_NODIR - 1))}</dd>` : ''}${L.region ? `<dt class="sub">в кластерах региональных (${L.region})</dt><dd>−${n1h(L.region * (1 - k.HQ_W_REGION))}</dd>` : ''}</dl>`;
    if (opts.btn && L.over > 0) s += `<div class="row"><button class="btn sm primary" data-act="tab" data-arg="ruhq">Штаб</button></div>`;
    return s + `</div>`;
  }
  // цена входа: во сколько раз дороже из-за числа городов
  function enterCostNote(S) {
    const n = Object.keys(S.corp.cities).length, g = BK.Corp.enterGrowK ? BK.Corp.enterGrowK(S) : 1;
    return g > 1.001 ? `${n + 1}-й город: вход ×${n1h(g)} — каждый следующий дороже на ${Math.round((K().ENTER_GROW - 1) * 100)} %` : `Второй город: вход без надбавки; дальше каждый дороже на ${Math.round((K().ENTER_GROW - 1) * 100)} %`;
  }

  /* ---------------- «Требует внимания» ---------------- */
  function attention(S) {
    const cr = S.corp, out = [];
    if (BK.HQ && BK.HQ.load) { const L = BK.HQ.load(S); if (L.over > 0) out.push({ w: 10, ico: '≡', cls: 'bad', t: hqOverTitle(S, L), s: hqOverText(L) + ' — откройте отдел, место в совете, регионального', act: 'tab', arg: 'ruhq', b: 'Штаб', prim: true }); } // Р4 ч. 2
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (id === cr.active) continue;
      if (!c.directorId) { const st = BK.Corp.cityStats(S, id); out.push({ w: 9, ico: '!', cls: 'bad', t: `${cname(id)}: нет директора`, s: `${H().nw(st.open, 'точка', 'точки', 'точек')} без роста, рейтинг сползает к 3,5★`, act: 'ruHireFor', arg: id, b: 'Назначить', prim: true }); }
    }
    for (const it of cr.inbox) {
      const n = (it.reqs || []).filter((r) => r.st === 'open').length;
      if (n) { const r0 = it.reqs.find((r) => r.st === 'open'); out.push({ w: 7, ico: initials(it.dname), t: `${cname(it.city)}: ${reqTitle(S, it, r0)}`, s: `ответ до ${dateTxt(it.due)} — иначе отказ (−1 лояльности)`, act: 'ruRep', arg: it.id, b: 'Ответить' }); }
      if (it.kind === 'caught' && !it.done) out.push({ w: 10, ico: '!', cls: 'bad', t: it.title, s: 'решите судьбу директора', act: 'ruRep', arg: it.id, b: 'Решить', prim: true });
      if (it.kind === 'award' && !it.done) out.push({ w: 8, ico: '★', cls: 'crust', t: it.title, s: 'выберите лучшего из номинантов', act: 'ruRep', arg: it.id, b: 'Выбрать', prim: true });
    }
    for (const d of cr.directors) {
      if (d.loyalty < 40) out.push({ w: 6, ico: initials(d.name), cls: 'warn', t: `${d.city ? cname(d.city) + ': ' : ''}лояльность падает`, s: `${d.name} · ${Math.round(d.loyalty)}${d.loyD < 0 ? ' ▼' : ''} · оклад ${pc1(d.salary / D().marketPay(S, d, d.city) - 1)} к рынку`, act: 'ruDir', arg: d.id, b: 'Мотивация' });
      if (!d.city) out.push({ w: 5, ico: initials(d.name), t: `${d.name} в резерве`, s: 'получает половину оклада', act: 'ruDir', arg: d.id, b: 'Назначить' });
      else if ((d.poachP || 0) > 0.015 && d.loyalty >= 40) out.push({ w: 5, ico: initials(d.name), cls: 'warn', t: `${cname(d.city)}: директора могут переманить`, s: `${d.name} · ${n1(d.poachP * 100)} % в месяц — оклад, опционы, лояльность`, act: 'ruDir', arg: d.id, b: 'Мотивация' });
      if (d.leaveDay != null && d.city) out.push({ w: 8, ico: initials(d.name), cls: 'bad', t: `${cname(d.city)}: ${d.name} передаёт дела`, s: `уходит ${dateTxt(d.leaveDay)} — найдите замену`, act: 'ruHireFor', arg: d.city, b: 'Замена' });
    }
    for (const id in cr.cities) {
      if (id === cr.active) continue;
      const dv = D().cityDev(S, id); const st = BK.Corp.cityStats(S, id);
      if (dv && dv.dev3 != null && dv.dev3 < -0.05 && cr.cities[id].directorId) out.push({ w: 4, ico: '▼', cls: 'warn', t: `${cname(id)}: выручка ниже прогноза`, s: `${pc1(dv.dev3)} на точку за 3 мес. — воровство, плохие места или слабый директор`, act: 'ruAudit', arg: id, b: 'Аудит' });
      else if (dv && dv.dev3 != null && dv.dev3 < -0.05) out.push({ w: 4, ico: '▼', cls: 'warn', t: `${cname(id)}: выручка ниже прогноза`, s: `${pc1(dv.dev3)} на точку за 3 мес.`, act: 'tab', arg: 'rucmp', b: 'Сравнить' });
      const ls = D().leakStatus && D().leakStatus(S, id);
      if (ls && ls.onlyOv) { /* утечка только от перегрузки штаба — одной строкой выше */ }
      else if (ls) { const a = leakAct(S, ls, id); out.push({ w: ls.lossM >= 3 ? 9 : 6, ico: '₽', cls: 'bad', t: leakTitle(ls, id), s: leakText(ls), act: a.a, arg: a.arg, b: a.b, prim: a.prim }); } // Р4: денежный риск
      else if (st.lastProfit != null && st.lastProfit < 0 && st.months >= 6) out.push({ w: 3, ico: '₽', cls: 'bad', t: `${cname(id)}: убыток за месяц`, s: fm(st.lastProfit), act: 'tab', arg: 'rucmp', b: 'Сравнить' });
    }
    return out.sort((a, b) => b.w - a.w);
  }
  /* ---------------- денежный риск (Р4): «город теряет деньги» — почему и что сделать ---------------- */
  function leakAct(S, ls, id) { // «Учить» — карточка директора (университет), иначе «Сменить»
    const uni = BK.HQ && BK.HQ.lvlOf(S, 'uni') > 0, train = ls.d && ls.whyKeys.some((k) => k === 'skills' || k === 'nouni');
    if (ls.onlyOv) return { a: 'tab', arg: 'ruhq', b: 'Штаб', prim: true }; // Р4 ч. 2: перегрузка штаба
    if (!ls.d) return { a: 'ruHireFor', arg: id, b: 'Назначить', prim: true };
    if (train && uni && !ls.d.study) return { a: 'ruDir', arg: ls.d.id, b: 'Учить', prim: true };
    if (ls.whyKeys.length === 1 && ls.whyKeys[0] === 'mismatch') return { a: 'ruSel', arg: id, b: 'Приоритет' };
    return { a: 'ruHireFor', arg: id, b: 'Сменить', prim: !ls.d.study };
  }
  function leakTitle(ls, id) { return `${cname(id)}: ${ls.lossM >= 2 ? `теряет деньги ${ls.lossM} мес. подряд` : `утечка денег ${Math.round(ls.leak * 100)} %`}`; }
  function leakText(ls) {
    const why = ls.why.length ? ls.why.join('; ') : 'убыточные точки';
    return `${why}${ls.whyKeys.indexOf('skills') >= 0 ? ` (навыки ${ls.skill} при нужных ${ls.need} для ${ls.n} точек)` : ''}. Что сделать: ${ls.fix}.`;
  }
  function leakBox(S, id, ls) {
    if (!ls) return '';
    const a = leakAct(S, ls, id);
    return `<div class="leakbox"><b>${esc(leakTitle(ls, id))}</b><span>Расходы ползут вверх, выручка отстаёт${ls.leak >= 0.01 ? ` — утечка ≈ ${Math.round(ls.leak * 100)} % выручки` : ''}. ${esc(leakText(ls))}</span>${ls.d && ls.d.study ? `<span class="hint">Директор учится — утечка спадёт после диплома.</span>` : `<button class="btn sm ${a.prim ? 'primary' : ''}" data-act="${a.a}" data-arg="${esc(a.arg)}">${a.b}</button>`}</div>`;
  }
  function attentionHtml(S, max) {
    const a = attention(S); if (!a.length) return '';
    return `<div class="sec"><h3>Требует внимания <em class="badge">${a.length}</em><button class="linkbtn" data-act="tab" data-arg="ruinbox">Отчёты →</button></h3><div class="ratt">${a.slice(0, max || 5).map((x) => `<div class="ra"><span class="dav ${x.cls || ''}">${esc(x.ico)}</span><div class="rt"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></div><button class="btn sm ${x.prim ? 'primary' : ''}" data-act="${x.act}" data-arg="${esc(x.arg)}">${x.b}</button></div>`).join('')}</div></div>`;
  }

  /* ---------------- блоки карточки города ---------------- */
  function cityBlocks(S, id) { // для своего города: директор, бюджет и цели, план/факт
    if (!on(S)) return '';
    const cr = S.corp, c = cr.cities[id]; if (!c) return '';
    const d = D().dirOf(S, c), active = id === cr.active, h = H();
    let s = '';
    if (active) {
      if (d) s += `<div class="dcard mini"><div class="dh">${av(d.name)}<div><b>Заместитель: ${esc(d.name)}</b><span>${GRN(d.grade)} · вы управляете ${d.manualM ? d.manualM + '-й месяц' : 'с этого месяца'}${d.traits.indexOf('executive') < 0 ? ` · после ${K().LOY_MANUAL_GRACE} мес. лояльность −2/мес` : ''}</span></div></div><div class="drow"><span>Лояльность</span>${loyBar(d, true)}</div></div>`;
      return s;
    }
    // директор
    s += `<div class="rsub"><span class="caps">Директор города</span>${d ? `<small>в сети ${h.nw(d.months, 'месяц', 'месяца', 'месяцев')}</small>` : ''}</div>`;
    if (d) {
      s += `<div class="dcard"><div class="dh">${av(d.name, 'lg')}<div><b class="dn">${esc(d.name)}</b><span>${GRN(d.grade)} · грейд ${d.grade}${d.adaptUntil > S.day ? ' · адаптация до ' + dateTxt(d.adaptUntil) : ''}</span></div></div>
        ${skillRows(d)}<div class="row ru-chips">${styleChip(d, c)}</div>${traitChips(S, d)}
        <div class="drow"><span>Лояльность</span>${loyBar(d, true)}</div>
        <div class="drow"><span>Оклад</span><b class="num">${fm(d.salary)}/мес</b></div><div class="hint">Рынок ${fm(D().marketPay(S, d, id))} · ${pc1(d.salary / D().marketPay(S, d, id) - 1)} к рынку</div>
        ${d.study ? `<p class="hint" style="margin:0">Учится: «${esc(BK.CORP_UNI.programs[d.study.prog].name)}» до ${dateTxt(d.study.until)}${d.study.evening ? ' (вечерний формат)' : ' — выручка города −3 %'}.</p>` : ''}${d.absentUntil > S.day ? `<p class="hint warnc" style="margin:0">В отпуске до ${dateTxt(d.absentUntil)}: город «без директора».</p>` : ''}${id !== d.city ? `<p class="hint" style="margin:0">Региональный директор: основной город — ${esc(cname(d.city))}, здесь навыки ×0,75.</p>` : ''}
        <div class="row dbtns"><button class="btn sm primary" data-act="ruDir" data-arg="${d.id}">Мотивация</button><button class="btn sm" data-act="ruHireFor" data-arg="${id}">Сменить</button>${H().btn('ruAudit', 'Аудит', { cls: 'sm', arg: id, cost: BK.HQ.auditCost(S, id), dis: S.cash < BK.HQ.auditCost(S, id), title: 'Внешний аудит: раскроет воровство с шансом 70 %, приукрашивание — 80 %. Честный директор обидится (−3, второй аудит за год — ещё −5).' })}</div></div>`;
    } else {
      const res = cr.directors.filter((x) => !x.city);
      s += `<div class="dcard none"><div class="dh"><span class="dav bad">!</span><div><b>Нет директора</b><span>Город только живёт: новых точек нет, найм из вашего лимита, рейтинг сползает к 3,5★, выручка × 0,95.</span></div></div>
        <div class="row dbtns"><button class="btn sm primary" data-act="ruHireFor" data-arg="${id}">${res.length ? 'Назначить директора' : 'Нанять директора'}</button></div></div>`;
    }
    if (D().leakStatus) s += leakBox(S, id, D().leakStatus(S, id)); // Р4: денежный риск
    // конкуренты: местные сети и федеральный «Хлебный двор»
    if (id !== 'ufa') { const p = c.pressure || 0; s += `<div class="drow"><span>Давление конкурентов</span><b class="num">${n1(p)}${p ? ` · выручка ≈ −${n1(p * K().PRESS_K * 100)} %` : ''}</b></div><p class="hint" style="margin:0">Местные сети (конкуренция ${esc((BK.CITY_COMP[(BK.CITY_BY_ID[id] || {}).comp] || {}).name || '')})${c.rivalIn ? ` и «${esc(C().RIVAL_NAME)}» — с ${esc(E().fmtDate(c.rivalIn))}` : ''}. Сильнее бьёт по точкам с низким рейтингом.</p>`; }
    // план / факт
    if (d && c.plan) {
      const st = BK.Corp.cityStats(S, id), pf = D().planFact(S, c);
      const rows = c.hist.filter((x) => x[0] === c.plan.y && E().dateOf(c.plan.from).m <= x[1]);
      const rev = rows.reduce((a, x) => a + x[2], 0), prof = rows.reduce((a, x) => a + x[3], 0), planRev = c.plan.monthRev * Math.max(1, rows.length);
      const bar = (p, cls) => `<span class="pfb ${cls}"><i style="width:${Math.min(100, p * 100).toFixed(0)}%"></i><em style="left:${Math.min(100, (rows.length ? rows.length : 1) / Math.max(1, 12 - E().dateOf(c.plan.from).m) * 100).toFixed(0)}%"></em></span>`;
      const tone = (p) => (p >= 0.98 ? 'good' : p >= 0.9 ? 'warn' : 'bad');
      const pSt = st.stores / Math.max(1, c.plan.stores), mg = rev > 0 ? prof / rev : 0;
      s += `<div class="rsub"><span class="caps">План / факт ${c.plan.y}</span><small>| — где должны быть сейчас</small></div><div class="pf">
        <span>Точки</span>${bar(pSt, tone(pSt + 0.1))}<b>${st.stores} из ${c.plan.stores}</b>
        <span>Выручка</span>${bar(pf != null ? rev / (c.plan.monthRev * 12 / 1) : 0, tone(pf || 1))}<b>${fm(rev)} · ${pf != null ? Math.round(pf * 100) + ' %' : '—'}</b>
        <span>Маржа</span>${bar(Math.max(0, mg) / Math.max(0.05, c.plan.margin), tone(mg + 0.02 >= c.plan.margin ? 1 : 0.9))}<b>${h.pctS(mg, true)} · план ${h.pctS(c.plan.margin, true)}</b></div>`;
      void planRev;
    }
    // бюджет и цели
    const b = c.budget, pk = c.payK || 1;
    const stp = (arg2, lab, dis) => `<button class="btn sm stp" data-act="ruBudget" data-arg="${id}" data-arg2="${arg2}"${dis ? ' disabled' : ''} aria-label="${lab}">${arg2.endsWith('-') ? '−' : '+'}</button>`;
    s += `<div class="rsub"><span class="caps">Бюджет и цели</span><small>${d ? 'по умолчанию — предложение директора' : 'без директора не тратится'}</small></div><div class="bud">
      <div class="bl"><span>Капвложения на год</span><span class="bv">${stp('capex-', 'Меньше')}<b>${fm(b.left)} / ${fm(b.capex)}</b>${stp('capex+', 'Больше')}</span></div>
      <div class="bl"><span>Зарплаты персонала</span><span class="bv">${stp('pay-', 'Ниже', pk <= 0.905)}<b>${pk >= 1 ? '+' : '−'}${Math.round(Math.abs(pk - 1) * 100)} % к рынку</b>${stp('pay+', 'Выше', pk >= 1.245)}</span></div>
      <div class="bl"><span>Обучение персонала</span><span class="bv">${stp('train-', 'Ниже', b.train <= 1)}<b>до уровня ${b.train}</b>${stp('train+', 'Выше', b.train >= 5)}</span></div>
      <div class="bl"><span>Новые точки</span><span class="seg sm" role="group"><button type="button" data-act="ruBudget" data-arg="${id}" data-arg2="open1" aria-pressed="${b.open !== false}">открывать</button><button type="button" data-act="ruBudget" data-arg="${id}" data-arg2="open0" aria-pressed="${b.open === false}">нет</button></span></div>
      <div class="bl"><span>Убыточные точки</span><span class="seg sm" role="group"><button type="button" data-act="ruBudget" data-arg="${id}" data-arg2="close1" aria-pressed="${!!b.close}">закрывает сам</button><button type="button" data-act="ruBudget" data-arg="${id}" data-arg2="close0" aria-pressed="${!b.close}">спросит</button></span></div>
      <div class="bl pr"><span>Приоритет</span><span class="seg prio" role="group">${Object.keys(PRIO).map((p) => `<button type="button" data-act="ruPrio" data-arg="${id}" data-arg2="${p}" aria-pressed="${c.priority === p}">${PRIO[p]}</button>`).join('')}</span></div></div>`;
    if (d) { const lim = D().openLimit(S, c, d), why = { payback: 'подходящих мест нет — ищет', budget: 'кончился бюджет — попросит в отчёте', cash: 'на счёте сети мало денег', limit: 'годовой лимит выбран', off: 'открытия выключены' }[c.dev.why]; s += `<p class="hint" style="margin:0">Открыто в этом году: ${c.dev.opened} из ${lim} (лимит директора)${why ? ' · ' + why : ''}. Порог окупаемости места — ${Math.round(D().payback(d, c, S))} мес.</p>`; }
    return s;
  }

  /* ---------------- вкладка «Директора» ---------------- */
  function dirsTab(S, ui) {
    if (!on(S)) return '';
    const cr = S.corp, h = H();
    const pay = cr.directors.reduce((a, d) => a + d.salary * (d.city ? 1 : K().DIR_RESERVE_PAY), 0);
    const avgL = cr.directors.length ? cr.directors.reduce((a, d) => a + d.loyalty, 0) / cr.directors.length : 0;
    let s = `<div class="sec"><h3>Директора <small>${cr.directors.length ? `${h.nw(cr.directors.length, 'человек', 'человека', 'человек')} · лояльность в среднем ${Math.round(avgL)} · оклады ${fm(pay)}/мес` : 'пока никого'}</small></h3>`;
    if (!cr.directors.length) s += `<div class="empty">Директор ведёт город без вас: нанимает и учит людей, открывает точки в пределах бюджета и раз в месяц присылает отчёт. Наймите первого из кандидатов ниже.</div>`;
    const sel = ui.dirSel;
    s += `<div class="dlist">${cr.directors.map((d) => dirRow(S, d, sel === d.id)).join('')}</div></div>`;
    // кандидаты
    const next = Math.max(0, (cr.dirCandDay || 0) + K().DIR_CAND_DAYS - S.day), fee = Math.round(K().DIR_CAND_FEE * S.macro.priceLevel);
    s += `<div class="sec"><h3>Кандидаты <small>новые через ${h.nw(next, 'день', 'дня', 'дней')}</small></h3>
      <p class="hint" style="margin:0">На собеседовании навыки видны с погрешностью ±${K().DIR_SKILL_ERR}. Найм — ${K().DIR_HIRE_SALARIES} оклада. «Свои люди» — опытные продавцы вашей сети: лояльнее и сильнее в операциях.</p>
      ${cr.dirCand.map((d) => candCard(S, d)).join('') || '<div class="empty">Кандидатов нет.</div>'}
      <div class="row sp"><span class="hint">Кадровое агентство соберёт новый список сразу.</span>${h.btn('dirRefresh', 'Обновить сейчас', { cost: fee, dis: S.cash < fee })}</div></div>`;
    return s;
  }
  function dirRow(S, d, open) {
    const c = d.city ? S.corp.cities[d.city] : null, mk = D().marketPay(S, d, d.city);
    let s = `<div class="card click drowc${open ? ' sel' : ''}" data-act="ruDir" data-arg="${d.id}"><div class="dh">${av(d.name)}<div><b>${esc(d.name)}</b><span>${d.city ? esc(cname(d.city)) + (d.city === S.corp.active ? ' · вы здесь' : '') : 'резерв'} · ${GRN(d.grade)} · ${STN(d.style)}</span></div>${skillMini(d)}${loyBar(d)}</div>
      <div class="dsum"><span>Оклад <b>${fm(d.salary)}</b> · рынок ${fm(mk)}</span>${d.hist.length ? `<span>план ${d.hist[d.hist.length - 1].y}: <b class="${d.hist[d.hist.length - 1].pf >= 1 ? 'pos' : 'negc'}">${Math.round(d.hist[d.hist.length - 1].pf * 100)} %</b></span>` : ''}</div></div>`;
    if (open) s += dirDetail(S, d, c);
    return s;
  }
  function dirDetail(S, d, c) {
    const h = H(), cr = S.corp, mk = D().marketPay(S, d, d.city);
    const why = (d.loyWhy || []).filter((w) => Math.abs(w[1]) >= 0.05).map((w) => `${esc(w[0])} ${w[1] > 0 ? '+' : '−'}${n1(Math.abs(w[1]))}`).join(' · ');
    const opts = [['', 'В резерв (половина оклада)']].concat(Object.keys(cr.cities).map((id) => { const o = D().dirOf(S, cr.cities[id]); return [id, cname(id) + (o && o !== d ? ` (сейчас ${o.name})` : id === cr.active ? ' (вы здесь — заместитель)' : '')]; }));
    const fire = Math.round(d.salary * K().DIR_FIRE_SALARIES);
    return `<div class="card ddet">${d.bio ? `<p class="hint" style="margin:0">${esc(txtG(d.bio, d.f))}</p>` : ''}${skillRows(d)}
      <div class="row ru-chips">${styleChip(d, c)}</div>${traitChips(S, d)}
      <div class="drow"><span>Лояльность</span>${loyBar(d, true)}</div><p class="hint" style="margin:0">${why || 'Лояльность тянется к 60.'}${d.loyalty < 30 ? ' Ниже ' + K().LOY_QUIT + ' — уйдёт.' : ''}</p>
      <div class="drow"><span>Оклад</span><b class="num">${fm(d.salary)}/мес</b></div>
      <p class="hint" style="margin:0">Рынок ${fm(mk)} · ${pc1(d.salary / mk - 1)} к рынку · в год со взносами ${fm(d.salary * 12 * (1 + C().PAYROLL_TAX))}. Каждые +10 % к рынку — +1 лояльности в месяц; урезать оклад — −3 сразу.</p>
      <div class="row dbtns"><button class="btn sm" data-act="dirPay" data-arg="${d.id}" data-arg2="0.9">−10 %</button><button class="btn sm" data-act="dirPay" data-arg="${d.id}" data-arg2="1.05">+5 %</button><button class="btn sm primary" data-act="dirPay" data-arg="${d.id}" data-arg2="1.1">+10 %</button></div>
      ${motivation(S, d)}
      <div class="field"><label for="as-${d.id}">Город</label><select id="as-${d.id}" class="input" data-inp="dirAssign" data-arg="${d.id}">${opts.map((o) => `<option value="${o[0]}"${(d.city || '') === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
      ${d.hist.length ? `<div class="dhist">${d.hist.slice(-4).map((x) => `<span>${x.y} · ${esc(cshort(x.city))}</span><b class="num">${fm(x.rev)}</b><b class="num ${x.pf >= 1 ? 'pos' : x.pf < 0.9 ? 'negc' : ''}">${Math.round(x.pf * 100)} % плана</b>`).join('')}</div>` : ''}
      <div class="row sp"><span class="hint">Уволить — ${K().DIR_FIRE_SALARIES} оклада выходного пособия${d.city ? ', город останется без директора' : ''}.</span>${BK.App && BK.App.ui.confirmDirFire === d.id ? `<button class="btn sm danger" data-act="dirFire" data-arg="${d.id}">Точно уволить · ${fm(fire)}</button>` : `<button class="btn sm danger" data-act="askDirFire" data-arg="${d.id}">Уволить</button>`}</div></div>`;
  }
  const txtG = (s, f) => String(s).replace(/\{g2?:([^|}]*)\|([^}]*)\}/g, (_, m, w) => (f ? w : m));
  function candCard(S, d) {
    const cost = BK.HQ.hireCost(S, d), canCheck = (BK.HQ.lvlOf(S, 'hr') || BK.HQ.lvlOf(S, 'security')) && !d.checked && S.difficulty !== 'easy', ck = Math.round(d.salary * K().CHECK_FEE);
    return `<div class="card dcand"><div class="dh">${av(d.name)}<div><b>${esc(d.name)}</b><span>${GRN(d.grade)} · грейд ${d.grade} · потенциал ${d.months >= 6 ? '★'.repeat(d.pot) : '?'}</span></div>${d.src === 'own' ? '<span class="chip crust">свои люди</span>' : d.src === 'hunter' ? '<span class="chip">хедхантер</span>' : ''}</div>
      ${d.bio ? `<p class="hint" style="margin:0">${esc(txtG(d.bio, d.f))}</p>` : ''}${skillRows(d, true)}<div class="row ru-chips">${styleChip(d)}</div>${traitChips(S, d, true)}
      <div class="row sp"><span>Просит <b class="num">${fm(d.salary)}/мес</b> · лояльность ${Math.round(d.loyalty)}</span><span class="row dbtns">${canCheck ? H().btn('candCheck', 'Проверить', { cls: 'sm', arg: d.id, cost: ck, dis: S.cash < ck, title: 'Проверка службой безопасности / HR: раскрывает скрытую черту с шансом 50 %' }) : ''}${H().btn('hireDir', 'Нанять', { cls: 'primary', arg: d.id, cost, dis: S.cash < cost })}</span></div></div>`;
  }

  /* ---------------- Р3: мотивация в карточке директора (KPI, опционы, совет, регион, учёба) ---------------- */
  const KPN = (k) => ((BK.CORP_KPI || {})[k] || {}).name || k;
  const pctF = (v) => n1(v * 100) + ' %';
  function motivation(S, d) {
    const h = H(), HQ = BK.HQ, k = K(), cr = S.corp;
    let s = `<div class="rsub"><span class="caps">Мотивация</span><small>${d.city ? `переманят: ${pctF(d.poachP || HQ.poachP(S, d))} в месяц` : 'в резерве'}</small></div>`;
    // KPI-премия
    const est = d.city ? HQ.kpiEstimate(S, d) : { pay: 0 };
    s += `<div class="mot"><div class="mh"><b>Премия за KPI</b><span class="bv">${`<button class="btn sm stp" data-act="dirBonus" data-arg="${d.id}" data-arg2="-0.1"${d.kpi.bonus <= 0 ? ' disabled' : ''} aria-label="Меньше">−</button>`}<b class="num">${Math.round(d.kpi.bonus * 100)} % оклада</b>${`<button class="btn sm stp" data-act="dirBonus" data-arg="${d.id}" data-arg2="0.1"${d.kpi.bonus >= 1 ? ' disabled' : ''} aria-label="Больше">+</button>`}</span></div>
      <div class="row ru-chips fchips">${HQ.KPI_KEYS.map((key) => `<button class="fchip" data-act="dirKpi" data-arg="${d.id}" data-arg2="${key}" aria-pressed="${d.kpi.keys.indexOf(key) >= 0}" title="${esc(((BK.CORP_KPI || {})[key] || {}).desc || '')}">${esc(KPN(key))}</button>`).join('')}</div>
      <p class="hint" style="margin:0">${d.kpi.keys.length && d.kpi.bonus ? `Раз в квартал ≈ ${fm(est.pay || 0)} при нынешних цифрах${d.kpiLast ? ` · прошлая выплата ${fm(d.kpiLast.pay)}` : ''}. ${d.kpi.keys.length === 1 ? 'Один KPI — перекос: ' + esc(((BK.CORP_KPI || {})[d.kpi.keys[0]] || {}).desc || '') : 'Набор KPI — без перекоса, директор работает ровнее.'}` : 'Выберите 1–3 KPI и размер премии (0–100 % годового оклада). Директор оптимизирует то, что меряют.'}</p></div>`;
    // опционы и доля
    const unv = HQ.unvested(d), o = d.opt || {}, corpOpt = Math.round(0.003 * k.OPT_YEARS * Math.max(0, HQ.profit12(S)));
    s += `<div class="mot"><div class="mh"><b>Доля прибыли города</b><span class="bv"><button class="btn sm stp" data-act="dirShare" data-arg="${d.id}" data-arg2="-0.005"${!(o.city > 0) ? ' disabled' : ''} aria-label="Меньше">−</button><b class="num">${n1((o.city || 0) * 100)} %</b><button class="btn sm stp" data-act="dirShare" data-arg="${d.id}" data-arg2="0.005"${(o.city || 0) >= 0.05 ? ' disabled' : ''} aria-label="Больше">+</button></span></div>
      <div class="mh"><b>Опцион корпорации</b>${unv > 0 ? `<span class="num">${n1(o.corp * 100)} % · ≈ ${fm(o.value)}</span>` : h.btn('dirOption', 'Дать 0,3 %', { cls: 'sm', arg: d.id, title: `Стоимость ≈ ${fm(corpOpt)} (доля × 3 годовые прибыли), выплата третями за 3 года. Пока не созрел: лояльность +1/мес, переманить сложнее, у нечестного директора — меньше соблазна.` })}</div>
      ${unv > 0 ? `<div class="vest">${[0, 1, 2].map((i) => `<i class="${i < o.vested ? 'on' : ''}"></i>`).join('')}</div><p class="hint" style="margin:0">Созрело ${o.vested}/3 · следующая треть — ${dateTxt(o.grant + 365 * (o.vested + 1))}</p>` : ''}</div>`;
    // признание, регион
    const nb = cr.directors.filter((x) => x.board).length;
    s += `<div class="row dbtns">${d.board ? h.btn('dirBoard', 'Вывести из совета', { cls: 'sm', arg: d.id, arg2: '0', title: 'Лояльность −5' }) : h.btn('dirBoard', `В совет директоров · ${nb}/${k.BOARD_MAX}`, { cls: 'sm', arg: d.id, arg2: '1', dis: nb >= k.BOARD_MAX, title: `+${k.BOARD_LOY} лояльности сразу и +${String(k.BOARD_LOY_M).replace('.', ',')} в месяц` })}`;
    if (d.grade >= k.REGION_GRADE && d.city && !d.regional) s += h.btn('dirPromote', 'Сделать региональным', { cls: 'sm', arg: d.id, title: 'Кластер до 3 соседних городов (ближе 600 км): на основном навыки полностью, на остальных — ×0,75. Оклад +40 %.' });
    s += `</div>`;
    if (d.regional) {
      const rc = HQ.regionCands(S, d);
      s += `<p class="hint" style="margin:0">Региональный директор: ${[d.city].concat(d.region).map((id) => esc(cname(id))).join(', ')}.</p>${rc.length && d.region.length < k.REGION_MAX - 1 ? `<div class="row dbtns">${rc.slice(0, 3).map((id) => h.btn('dirRegion', '+ ' + esc(cname(id)), { cls: 'sm', arg: d.id, arg2: id })).join('')}</div>` : ''}`;
    }
    // учёба
    const lv = HQ.lvlOf(S, 'uni');
    if (d.study) s += `<p class="hint" style="margin:0">Учится: «${esc(BK.CORP_UNI.programs[d.study.prog].name)}» до ${dateTxt(d.study.until)}${d.study.evening ? ' (вечерний формат)' : ' — выручка города −3 %'}.</p>`;
    else if (lv) {
      const ev = !!(BK.App && BK.App.ui.uniEvening);
      s += `<div class="rsub"><span class="caps">Учиться</span><span class="seg sm" role="group"><button type="button" data-act="uniEvening" data-arg="0" aria-pressed="${!ev}">днём</button><button type="button" data-act="uniEvening" data-arg="1" aria-pressed="${ev}">вечером</button></span></div><div class="row dbtns">${Object.keys(BK.CORP_UNI.programs).map((pr) => { const lock = HQ.progLock(S, d, pr), c = HQ.progCost(S, pr); if (d.progs.indexOf(pr) >= 0) return ''; return h.btn('uniEnroll', esc(BK.CORP_UNI.programs[pr].name), { cls: 'sm', arg: d.id, arg2: pr + (ev ? ':e' : ''), cost: c, dis: !!lock || S.cash < c, title: lock || BK.CORP_UNI.programs[pr].desc }); }).join('')}</div>${d.progs.length ? `<p class="hint" style="margin:0">Окончено: ${d.progs.map((pr) => esc(BK.CORP_UNI.programs[pr].name)).join(', ')}.</p>` : ''}`;
    } else s += `<p class="hint" style="margin:0">Учить директоров можно в корпоративном университете — вкладка «Штаб».</p>`;
    return s;
  }

  /* ---------------- Р3: вкладка «Штаб» — отделы, университет, контроль ---------------- */
  function hqEffect(S, key) {
    const HQ = BK.HQ, k = K(), lv = HQ.lvlOf(S, key);
    switch (key) {
      case 'finance': return 'Отчёты без шума ±5 %, «приукрашивание» ловится 15 %/мес, кредит −0,5 п. п., резерв +0,5 п. п.';
      case 'hr': return `5 кандидатов вместо 3 (2 от хедхантера), погрешность ±${k.HR_SKILL_ERR}, проверка при найме, переманивают на 25 % реже`;
      case 'uni': return lv ? `${BK.CORP_UNI.levels[lv].name}: мест ${HQ.students(S).length}/${HQ.seats(S)}${lv >= 2 ? ', программы −30 %, свой кандидат раз в год' : ''}` : 'Программы для директоров, обучение персонала быстрее и дешевле';
      case 'purchasing': { let n = 0; for (const id in S.corp.cities) n += BK.Corp.cityStats(S, id).stores; return `Фудкост −${n1(Math.min(k.PURCH_MAX, k.PURCH_PER100 * n / 100) * 100)} % при ${n} точках (−1 % за 100, до −4 %), мука дорожает вдвое мягче`; }
      case 'logistics': return lv ? `Доставка на точки −${Math.round((1 - k.LOG_DEL[lv]) * 100)} %${lv >= 2 ? ', фабрика заморозки: метели не страшны' : ''}` : 'Доставка дешевле; ур. 2 — фабрика заморозки';
      case 'brand': return `Узнаваемость растёт ×1,5, новые города стартуют с +10 %${lv ? '' : ''}`;
      case 'security': return `Проверка директоров ${Math.round(k.SEC_THEFT_P * 100)} %/мес, аудит вдвое дешевле, рейдеры не страшны${lv ? ` · поймано: ${S.corp.stat.caught}` : ''}`;
      case 'legal': return `Вход в новый город на ${Math.round((1 - k.LEGAL_LAUNCH_K) * 100)} % дешевле, штрафы −30 %, защита от рейдеров`;
      default: return '';
    }
  }
  function hqTab(S) {
    if (!on(S)) return '';
    const HQ = BK.HQ, h = H(), cr = S.corp;
    const n = HQ.KEYS.filter((k) => HQ.lvlOf(S, k)).length, tot = HQ.hqTotal(S), last = S.history[S.history.length - 1], rev = last ? last.rev : 0;
    const os = HQ.optShare(S);
    let s = `<div class="sec"><h3>Штаб <small>отделов ${n} из 8 · ${fm(tot)}/мес${rev ? ' — ' + n1(tot / rev * 100) + ' % оборота' : ''}</small></h3>
      ${hqLoadHtml(S, { parts: true })}
      <div class="optline ${os.share > K().OPT_WARN ? 'bad' : ''}"><i></i>Опционы, доли и премии директоров: <b class="num">${n1(os.share * 100)} %</b> прибыли · порог ${Math.round(K().OPT_WARN * 100)} %${os.share > K().OPT_WARN ? ' — отдаёте слишком много' : ''}</div>
      <div class="hqgrid">`;
    for (const key of HQ.KEYS) {
      const lv = HQ.lvlOf(S, key), max = HQ.MAXLV[key] || 1, D0 = BK.CORP_HQ[key], nx = lv < max ? HQ.openCost(S, key, lv + 1) : 0;
      const hot = key === 'finance' && !lv;
      const st = lv ? (max > 1 ? `<span class="chip good">ур. ${lv}</span>` : '<span class="chip good">работает</span>') : '<span class="chip">не открыт</span>';
      const foot = lv ? `<span class="num">${fm(HQ.monthCost(S, key))}/мес${cr.hqSince[key] != null ? ` · с ${E().MONTHS_G[E().dateOf(cr.hqSince[key]).m].slice(0, 3)}. ${E().dateOf(cr.hqSince[key]).y}` : ''}</span>` : `<span>Открыть <b class="num">${fm(nx)}</b> · ${fm(HQ.monthCostAt(S, key, 1))}/мес</span>`;
      const b = lv < max ? h.btn('hqOpen', lv ? 'Улучшить' : 'Открыть', { cls: `sm${hot ? ' primary' : ''}`, arg: key, cost: lv ? nx : null, dis: S.cash < nx }) : key === 'brand' ? h.btn('hqCampaign', 'Реклама', { cls: 'sm', cost: Math.round(K().HQ.brand.campaign * S.macro.priceLevel / 1e5) * 1e5, dis: cr.campaignDay != null && S.day - cr.campaignDay < K().BRAND_CAMPAIGN_DAYS, title: '«Федеральная реклама»: узнаваемость +15 % во всех городах, раз в год' }) : '';
      s += `<div class="card hqc${lv ? ' on' : ''}${hot ? ' hot' : ''}">${hot ? '<span class="ribbon">Откроет Москву и Петербург</span>' : ''}<div class="hqh"><b>${esc(D0.name)}</b>${st}</div><p>${esc(hqEffect(S, key))} · мощность штаба +${n1h(K().HQ_CAP_DEPT)}${max > 1 ? ' за уровень' : ''}</p><small class="hint">${esc(D0.when)}</small><div class="hqf">${foot}${b}</div></div>`;
    }
    s += `</div></div>`;
    // университет
    const lv = HQ.lvlOf(S, 'uni'), P = BK.CORP_UNI.programs;
    s += `<div class="sec"><h3>Корпоративный университет <small>${lv ? `${esc(BK.CORP_UNI.levels[lv].name)} · мест ${HQ.students(S).length}/${HQ.seats(S)}${lv >= 2 ? ' · цены −30 %' : ''}` : 'не открыт'}</small></h3>`;
    const studs = HQ.students(S);
    if (studs.length) s += studs.map((d) => { const p = P[d.study.prog], tot2 = d.study.until - d.study.from, done = clampN((S.day - d.study.from) / Math.max(1, tot2)); return `<div class="stud">${av(d.name)}<div><b>${esc(d.name)}</b>${d.city ? ' · ' + esc(cname(d.city)) : ''}<span>${esc(p.name)}${d.study.evening ? ' · вечер' : ''} · до ${dateTxt(d.study.until)}</span><span class="pfb good"><i style="width:${Math.round(done * 100)}%"></i></span></div><b class="num pos">${p.skill && p.skill !== 'all' ? esc(SKN[p.skill]) + ' +10' : d.study.prog === 'mba' ? 'грейд +1' : '+0,1★'}</b></div>`; }).join('');
    else if (lv) s += `<div class="empty">Никто не учится. Записать директора — кнопки «Учиться» в его карточке (вкладка «Директора»).</div>`;
    s += `<div class="uniwrap"><table class="cmp uni"><thead><tr><th>Программа</th><th class="r">Срок</th><th class="r">Цена</th><th class="r">Эффект</th></tr></thead><tbody>${Object.keys(P).map((k2) => { const p = P[k2]; return `<tr class="${(p.minLevel || 1) > Math.max(1, lv) ? 'lock' : ''}"><td>${esc(p.name)}${p.minLevel ? ` (ур. ${p.minLevel})` : ''}</td><td class="r num">${p.months} мес.</td><td class="r num">${fm(HQ.progCost(S, k2) || Math.round(K().UNI_PROG[k2] * S.macro.priceLevel))}</td><td class="r num pos">${p.skill && p.skill !== 'all' ? esc(SKN[p.skill]) + ' +10' : k2 === 'mba' ? 'грейд +1' : 'рейтинг +0,1★'}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="hint" style="margin:0">${esc(BK.CORP_UNI.eveningNote)} Пока директор учится днём, выручка его города −3 %. MBA поднимает и рыночную цену выпускника на 20 % — удерживайте окладом или опционом.</p></div>`;
    // контроль
    const st = cr.stat, aud = cr.inbox.filter((it) => it.kind === 'caught' || (it.kind === 'note' && /^Аудит/.test(it.title || ''))).slice(0, 6);
    s += `<div class="sec"><h3>Контроль <small>аудиты ${st.audits} · поймано ${st.caught} · ушли ${st.left}${st.poached ? ` (переманили ${st.poached})` : ''}</small></h3>
      <p class="hint" style="margin:0">Воровство видно не в отчёте, а в «Сравнении»: выручка на точку ниже прогноза месяцами, а у соседей нет. Ловят служба безопасности (10 %/мес), аудит (70 %), личный визит в город (35 %) и анонимные письма.</p>
      ${aud.length ? aud.map((it) => `<div class="stud"><span class="dav ${it.kind === 'caught' ? 'bad' : 'good'}">${it.kind === 'caught' ? '!' : '✓'}</span><div><b>${esc(it.title)}</b><span>${esc(E().fmtDate(it.day))}${it.kind === 'caught' && !it.done ? ' · нужен ответ' : ''}</span></div>${it.kind === 'caught' && !it.done ? `<button class="btn sm primary" data-act="ruRep" data-arg="${it.id}">Решить</button>` : ''}</div>`).join('') : (st.audits || st.caught ? '<div class="empty">Свежих результатов нет — старые проверки в журнале.</div>' : '<div class="empty">Проверок ещё не было. Аудит города — кнопка «Аудит» в карточке города.</div>')}
      ${cr.equitySold ? `<p class="hint" style="margin:0">Фонду принадлежит ${n1(cr.equitySold * 100)} % корпорации: каждый январь он забирает свою долю прибыли (выплачено ${fm(st.fund)}).</p>` : ''}${cr.creditK ? `<p class="hint" style="margin:0">Кредитная линия банка: лимит ×${n1(cr.creditK)}${cr.cov ? `, ковенанта «маржа сети > ${Math.round(cr.cov.margin * 100)} %»${cr.cov.until > S.day ? ' — нарушена, ставка +3 п. п.' : ''}` : ''}.</p>` : ''}</div>`;
    return s;
  }
  const clampN = (v) => Math.max(0, Math.min(1, v));

  /* ---------------- вкладка «Отчёты» ---------------- */
  function reqTitle(S, it, r) {
    const R = BK.DIRECTOR_REQUESTS || {};
    if (r.t === 'budget') return `бюджет ${fm(r.amount)} на ${H().nw(r.n, 'точку', 'точки', 'точек')}`;
    if (r.t === 'pay') return `зарплаты персоналу +${r.pct} %`;
    if (r.t === 'close') return `закрыть точку №${r.n}`;
    if (r.t === 'raise') return `повышение оклада +${r.pct} %`;
    return (R[r.t] || {}).title || r.t;
  }
  function reqBlock(S, it, r, i) {
    const c = S.corp.cities[it.city], st = r.st, h = H(), d = D().dirById(S, it.dir);
    let title = '', amt = '', desc = '', yes = '', alt = '', no = '';
    if (r.t === 'budget') { title = `Бюджет на ${h.nw(r.n, 'точку', 'точки', 'точек')}`; amt = '+' + fm(r.amount); desc = `Остаток бюджета года ${fm(c ? c.budget.left : 0)} · годовой ${fm(c ? c.budget.capex : 0)}. Директор нашёл места, но денег на открытие не хватает.`; yes = `Дать ${fm(r.amount)}`; alt = `${fm(r.alt)} — половину`; no = 'Не сейчас'; }
    else if (r.t === 'pay') { title = `Поднять зарплаты персоналу на ${r.pct} %`; amt = `к рынку ${Math.round(((c ? c.payK : 1) - 1) * 100)} %`; desc = `Настроение команды ${it.mood}, ушло за месяц ${it.quits} чел. Выше зарплата — довольнее команда и меньше текучка, но ФОТ растёт.`; yes = 'Согласовать'; alt = `+${r.alt} % вместо ${r.pct}`; no = 'Оставить как есть'; }
    else if (r.t === 'close') { title = `Закрыть убыточную точку №${r.n}`; amt = `${r.months} мес. в минусе`; desc = 'Директор закроет точку и перераспределит людей; вернётся 15 % вложений.'; yes = `Разрешить закрыть №${r.n}`; no = 'Пусть ещё поработает'; }
    else if (r.t === 'raise') { title = `Повышение оклада на ${r.pct} %`; amt = d ? fm(d.salary * r.pct / 100) + '/мес' : ''; desc = `Оклад ${d ? fm(d.salary) : '—'}, рынок ${d ? fm(D().marketPay(S, d, it.city)) : '—'}. Согласие — лояльность +${K().LOY_RAISE}.`; yes = `Поднять на ${r.pct} %`; alt = `+${r.alt} %`; no = 'Отказать'; }
    const done = st !== 'open' ? `<span class="rst ${st === 'no' || st === 'default' ? 'no' : 'yes'}">${{ yes: 'согласовано', alt: 'согласовано частично', no: 'отказано', default: 'нет ответа — отказ' }[st]}</span>` : '';
    return `<div class="rq${st !== 'open' ? ' done' : ''}"><div class="rqh"><span class="caps">Просьба ${i + 1}</span><b>${esc(title)}</b><span class="num">${esc(amt)}</span></div><p>${esc(desc)}</p>
      ${st === 'open' ? `<div class="row rqb"><button class="btn primary" data-act="repAns" data-arg="${it.id}" data-arg2="${i}:yes">${esc(yes)}</button>${alt ? `<button class="btn" data-act="repAns" data-arg="${it.id}" data-arg2="${i}:alt">${esc(alt)}</button>` : ''}<button class="btn" data-act="repAns" data-arg="${it.id}" data-arg2="${i}:no">${esc(no)} <span class="negc">лояльность ${K().LOY_REFUSE}</span></button></div>` : done}</div>`;
  }
  function kpi(lab, v, sub, tone) { return `<div class="rk"><span class="rl"><i class="t-${tone || 'none'}"></i>${lab}</span><b>${v}</b><small>${sub || ''}</small></div>`; }
  function reportCard(S, it, full) {
    const h = H();
    if (it.kind === 'caught') {
      const L = { sue: ['Уволить и подать в суд', 'вернём ~30 % украденного через год; скандал — узнаваемость −5 %'], quiet: ['Уволить тихо', 'без выходного пособия и без шума'], forgive: ['Простить, оклад −30 %', 'воровать перестанет, но с шансом 40 % через год снова'], warn: ['Предупредить', 'отчёты станут честными, лояльность −5'], fire: ['Уволить', 'без выходного пособия'] };
      return `<div class="card rep caught ${it.tone || ''}${!it.done ? ' need' : ''}" id="rep-${it.id}"><div class="rh"><span class="dav ${it.tone || 'bad'}">${esc(initials(it.dname) || '!')}</span><div><b>${esc(it.title)}</b><span>${esc(E().fmtDate(it.day))}${it.city ? ' · ' + esc(cname(it.city)) : ''}</span></div>${!it.done ? '<span class="chip bad">Нужен ответ</span>' : ''}</div><p style="margin:0">${esc(it.text)}</p>
        ${!it.done ? `<div class="row rqb">${(it.choices || []).map((c, i) => `<button class="btn${i ? '' : ' primary'}" data-act="caughtDecide" data-arg="${it.id}" data-arg2="${c}" title="${esc(L[c][1])}">${esc(L[c][0])}</button>`).join('')}</div><p class="hint" style="margin:0">Нет ответа до ${dateTxt(it.due)} — ${it.trait === 'theft' ? 'уволим тихо' : 'предупредим'}.</p>` : `<span class="rst ${it.done === 'forgive' || it.done === 'warn' ? 'yes' : 'no'}">решение: ${esc((L[it.done] || ['—'])[0].toLowerCase())}</span>`}</div>`;
    }
    if (it.kind === 'kpi') return `<div class="card rep note ${it.tone || ''}"><div class="rh">${av(it.dname)}<div><b>${esc(it.title)}</b><span>${esc(it.dname)}${it.city ? ' · ' + esc(cname(it.city)) : ''} · ${esc(E().fmtDate(it.day))}</span></div></div><p style="margin:0" class="num">${esc(it.text)}</p></div>`;
    if (it.kind === 'note') return `<div class="card rep note ${it.tone || ''}"><div class="rh"><span class="dav ${it.tone || ''}">${esc(initials(it.dname) || '!')}</span><div><b>${esc(it.title)}</b><span>${esc(E().fmtDate(it.day))}</span></div></div><p style="margin:0">${esc(it.text)}</p></div>`;
    if (it.kind === 'award') {
      return `<div class="card rep award${!it.done ? ' need' : ''}"><div class="rh"><span class="dav crust">★</span><div><b>${esc(it.title)}</b><span>Номинанты — лучшие по выполнению плана</span></div>${!it.done ? '<span class="chip bad">Нужен ответ</span>' : ''}</div>
        ${it.noms.map((n) => `<div class="nom">${av(n.name)}<div><b>${esc(n.name)}</b><span>${esc(cname(n.city))} · план ${Math.round(n.pf * 100)} %</span></div>${!it.done ? `<button class="btn sm primary" data-act="repAward" data-arg="${it.id}" data-arg2="${n.dir}">Наградить</button>` : it.done === n.dir ? '<span class="chip good">директор года</span>' : ''}</div>`).join('')}
        <p class="hint" style="margin:0">Победителю — лояльность +${K().LOY_AWARD}; номинанты с лояльностью ниже 50 обидятся (−3).${!it.done ? ` Нет ответа до ${dateTxt(it.due)} — награды в этом году не будет.` : ''}</p></div>`;
    }
    const open = (it.reqs || []).filter((r) => r.st === 'open').length;
    const head = `<div class="rh">${av(it.dname)}<div><b>Отчёт за ${MON[it.m]} ${it.y}</b><span>${esc(it.dname)} · ${esc(cname(it.city))}</span></div>${open ? `<span class="chip bad">Нужен ответ · ${open}</span>` : it.praised ? '<span class="chip good">отмечен ★</span>' : ''}</div>`;
    if (!full) return `<div class="card click rep short" data-act="ruRep" data-arg="${it.id}">${head}<div class="rsum"><span>выручка <b>${fm(it.rev)}</b></span><span>прибыль <b class="${it.profit < 0 ? 'negc' : ''}">${fm(it.profit)}</b></span><span>точки <b>${it.stores}</b></span></div></div>`;
    const p = it.prev, pl = it.plan, mg = it.rev ? it.profit / it.rev : 0;
    const dl = (a, b) => (b != null && b > 0 ? `${a >= b ? '▲' : '▼'} ${n1(Math.abs(a / b - 1) * 100)} %` : '');
    const tone = (a, b) => (b == null || !b ? 'none' : a >= b * 0.98 ? 'good' : a >= b * 0.9 ? 'warn' : 'bad');
    const turn = it.staff ? it.quits / it.staff : 0;
    let s = `<div class="card rep full${open ? ' need' : ''}" id="rep-${it.id}">${head}<div class="rkpi">
      ${kpi('Выручка', fm(it.rev), `${dl(it.rev, p && p.rev)}${pl ? ' · план ' + fm(pl.rev) : ''}`, tone(it.rev, pl && pl.rev))}
      ${kpi('Прибыль', fm(it.profit), p ? dl(it.profit, p.profit) : '', it.profit < 0 ? 'bad' : pl ? tone(mg, pl.margin) : 'none')}
      ${kpi('Маржа', h.pctS(mg, true), pl ? 'план ' + h.pctS(pl.margin, true) : '', pl ? (mg + 0.005 >= pl.margin ? 'good' : mg + 0.02 >= pl.margin ? 'warn' : 'bad') : 'none')}
      ${kpi('Точки', String(it.stores), `${it.opened ? '+' + it.opened : ''}${it.closed ? ' −' + it.closed : ''}${pl ? ' · план ' + pl.stores : ''}`, pl ? tone(it.stores, pl.stores * 0.9) : 'none')}
      ${kpi('Рейтинг', it.rating ? n1(it.rating) + '★' : '—', p && p.rating ? (it.rating >= p.rating ? '▲ ' : '▼ ') + n1(Math.abs(it.rating - p.rating)) : '', it.rating >= 4.3 ? 'good' : it.rating >= 3.8 ? 'warn' : 'bad')}
      ${kpi('Текучка', n1(turn * 100) + ' %/мес', `ушли ${it.quits} чел.`, turn < 0.02 ? 'good' : turn < 0.04 ? 'warn' : 'bad')}
      ${kpi('Бюджет', fm(it.left), 'остаток из ' + fm(it.capex), it.left > 0 ? 'good' : 'warn')}
      ${kpi('Персонал', it.staff + ' чел.', it.missing ? 'нехватка ' + it.missing : 'штат полный', it.missing ? 'warn' : 'good')}</div>
      <blockquote class="rq-q">«${esc(it.phrase)}»<small>${it.dev != null ? `Выручка на точку к прогнозу: ${pc1(it.dev)}` : 'Прогноз — со второго месяца'} · ${it.fin ? 'цифры сверены финансовым департаментом' : 'отчёт директора без проверки: точность ±5 %'}</small></blockquote>`;
    if (it.leak) { const lk = it.leak; s += `<div class="leakbox"><b>${lk.lossM >= 2 ? `Город теряет деньги ${lk.lossM} мес. подряд` : `Утечка денег ≈ ${Math.round(lk.pct * 100)} % выручки`}</b><span>${esc((lk.why && lk.why.length ? lk.why.join('; ') : 'убыточные точки') + (lk.skill ? ` (навыки ${lk.skill} при нужных ${lk.need})` : '') + '. Что сделать: ' + lk.fix + '.')}</span></div>`; } // Р4: денежный риск
    s += (it.reqs || []).map((r, i) => reqBlock(S, it, r, i)).join('');
    const d = D().dirById(S, it.dir), canPraise = d && !it.praised && S.day - d.praiseDay >= 90;
    s += `<div class="rfoot"><span class="hint">${open ? `Нет ответа до ${dateTxt(it.due)} — отказ по умолчанию (−1 лояльности).` : 'Все вопросы решены.'}</span>${d ? `<button class="btn sm" data-act="repPraise" data-arg="${it.id}"${canPraise ? '' : ' disabled'} title="${canPraise ? 'Благодарность в ответ на отчёт: +2 лояльности, не чаще раза в квартал' : 'Отмечать можно не чаще раза в квартал'}">★ Отметить · +${K().LOY_PRAISE}</button>` : ''}</div></div>`;
    return s;
  }
  function inboxTab(S, ui) {
    if (!on(S)) return '';
    const cr = S.corp, n = D().inboxOpen(S);
    const f = ui.repFilter || 'all';
    let list = cr.inbox;
    if (f === 'need') list = list.filter((it) => (it.reqs || []).some((r) => r.st === 'open') || ((it.kind === 'award' || it.kind === 'caught') && !it.done));
    else if (f !== 'all') list = list.filter((it) => it.city === f);
    const cities = [...new Set(cr.inbox.map((it) => it.city).filter(Boolean))];
    let s = `<div class="sec"><h3>Отчёты директоров ${n ? `<em class="badge">${n}</em>` : ''}<small>раз в месяц, 1-го числа</small></h3>
      <div class="row ru-chips fchips"><button class="fchip" data-act="repFilter" data-arg="all" aria-pressed="${f === 'all'}">Все ${cr.inbox.length}</button><button class="fchip" data-act="repFilter" data-arg="need" aria-pressed="${f === 'need'}">Нужен ответ ${n}</button>${cities.map((id) => `<button class="fchip" data-act="repFilter" data-arg="${id}" aria-pressed="${f === id}">${esc(cshort(id))}</button>`).join('')}</div>`;
    if (!list.length) s += `<div class="empty">${cr.inbox.length ? 'Здесь пусто.' : 'Отчёты придут 1-го числа от директоров городов. Наймите директора во вкладке «Директора» и назначьте его в город.'}</div>`;
    const shown = new Set();
    s += list.slice(0, 40).map((it) => {
      const need = (it.reqs || []).some((r) => r.st === 'open') || ((it.kind === 'award' || it.kind === 'caught') && !it.done);
      const first = it.kind === 'report' && !shown.has(it.city); if (it.kind === 'report') shown.add(it.city);
      return reportCard(S, it, it.kind !== 'report' || need || first || ui.repOpen === it.id);
    }).join('');
    return s + '</div>';
  }

  /* ---------------- вкладка «Сравнение городов» ---------------- */
  function cmpRows(S) {
    const cr = S.corp;
    return Object.keys(cr.cities).map((id) => {
      const st = BK.Corp.cityStats(S, id), c = cr.cities[id], d = D().dirOf(S, c), dv = D().cityDev(S, id);
      const open = cr.inbox.find((it) => it.city === id && (it.reqs || []).some((r) => r.st === 'open'));
      const ls = id !== cr.active && D().leakStatus ? D().leakStatus(S, id) : null;
      let act = null;
      if (id === cr.active) act = null;
      else if (!d) act = { a: 'ruHireFor', arg: id, b: 'Назначить', prim: true };
      else if (ls) act = leakAct(S, ls, id); // Р4: город теряет деньги — учить или сменить директора
      else if (open) act = { a: 'ruRep', arg: open.id, b: 'Ответить' };
      else if (d.loyalty < 40) act = { a: 'ruDir', arg: d.id, b: 'Мотивация' };
      else if (c.dev.why === 'budget') act = { a: 'ruSel', arg: id, b: 'Дать бюджет' };
      else act = { a: 'ruSel', arg: id, b: 'Город', link: true };
      const act0 = id === cr.active; // подробный город: прогноза агрегата нет
      return { id, st, c, d, dev: dv && !act0 ? dv.dev : null, dev3: dv && !act0 ? dv.dev3 : null, turn: dv ? dv.turn : null, rev12: st.rev12, margin: st.rev12 > 0 ? st.prof12 / st.rev12 : null, rating: st.rating, act, ls, loss: st.prof12 < 0 || (st.lastProfit != null && st.lastProfit < 0) || !!(ls && ls.lossM) };
    });
  }
  function cmpTab(S, ui) {
    if (!on(S)) return '';
    const h = H(), f = ui.cmpF || 'all', sort = ui.cmpSort || 'rev12';
    let rows = cmpRows(S);
    const cnt = { all: rows.length, loss: rows.filter((r) => r.loss).length, nodir: rows.filter((r) => !r.d && r.id !== S.corp.active).length, low: rows.filter((r) => r.dev != null && r.dev < -0.03).length };
    if (f === 'loss') rows = rows.filter((r) => r.loss); else if (f === 'nodir') rows = rows.filter((r) => !r.d && r.id !== S.corp.active); else if (f === 'low') rows = rows.filter((r) => r.dev != null && r.dev < -0.03);
    const key = { rev12: (r) => r.rev12, dev: (r) => (r.dev == null ? 9 : r.dev), margin: (r) => (r.margin == null ? -9 : r.margin), rating: (r) => r.rating || 0, turn: (r) => r.turn || 0, loy: (r) => (r.d ? r.d.loyalty : -1), name: (r) => r.st.name };
    const asc = sort === 'dev' || sort === 'name';
    rows.sort((a, b) => { const x = key[sort](a), y = key[sort](b); return typeof x === 'string' ? x.localeCompare(y) : asc ? x - y : y - x; });
    const chip = (k, lab) => `<button class="fchip" data-act="cmpF" data-arg="${k}" aria-pressed="${f === k}">${lab} <b>${cnt[k]}</b></button>`;
    let s = `<div class="sec"><h3>Сравнение городов <small>12 мес.</small></h3><div class="row ru-chips fchips">${chip('all', 'Все')}${chip('loss', 'Убыточные')}${chip('nodir', 'Без директора')}${chip('low', 'Ниже прогноза')}</div>`;
    const th = (k, lab, cls) => `<th class="${cls || ''}"><button class="thb${sort === k ? ' on' : ''}" data-act="cmpSort" data-arg="${k}">${lab}${sort === k ? (asc ? ' ▲' : ' ▼') : ''}</button></th>`;
    const devBar = (v) => { if (v == null) return '<span class="muted">—</span>'; const cls = v < -0.05 ? 'bad' : v < -0.03 ? 'warn' : 'good'; const w = Math.min(50, Math.abs(v) * 500); return `<span class="devb ${cls}"><span class="db"><i style="${v < 0 ? 'right:50%' : 'left:50%'};width:${w.toFixed(0)}%"></i></span><b>${pc1(v)}</b></span>`; };
    const tone = (r) => (r.st.lastRev > 0 ? (r.st.lastProfit / r.st.lastRev >= 0.15 ? 'good' : r.st.lastProfit >= 0 ? 'warn' : 'bad') : 'none');
    const who = (r) => (r.d ? `${av(r.d.name, 'sm')}<span class="cw"><b>${esc(r.d.name)}</b>${loyBar(r.d)}</span>` : r.id === S.corp.active ? `<span class="cw"><b>вы управляете</b><small>${r.st.name === 'Уфа' ? 'родной город' : 'активный город'}</small></span>` : `<span class="dav sm bad">!</span><span class="cw"><b class="negc">Нет директора</b><small>${r.st.months} мес. в сети</small></span>`);
    const since = (r) => { const t = E().dateOf(r.c.enteredDay); return r.id === 'ufa' ? 'с ' + C().START_YEAR : `с ${E().MONTHS_G[t.m].slice(0, 4)}. ${t.y}`; };
    const lossTag = (r) => (r.ls ? `<small class="negc lossm">${r.ls.lossM >= 2 ? `в минусе ${r.ls.lossM} мес.` : 'утечка ' + Math.round(r.ls.leak * 100) + ' %'} · ${esc(r.ls.whyKeys.map((k) => ({ skills: 'слабые навыки', nouni: 'не учился', mismatch: 'стиль ≠ приоритет' })[k]).join(', ') || 'убыточные точки')}</small>` : ''); // Р4: денежный риск
    const act = (r) => (r.act ? (r.act.link ? `<button class="linkbtn" data-act="${r.act.a}" data-arg="${r.act.arg}">${r.act.b} →</button>` : `<button class="btn sm ${r.act.prim ? 'primary' : ''}" data-act="${r.act.a}" data-arg="${r.act.arg}">${r.act.b}</button>`) : '<span class="muted">—</span>');
    s += `<div class="cmpwrap"><table class="cmp"><thead><tr>${th('name', 'Город')}${th('loy', 'Директор · лояльность')}${th('rev12', 'Выручка, 12 мес.', 'r')}${th('dev', 'На точку к прогнозу', 'c')}${th('margin', 'Маржа', 'r')}${th('rating', 'Рейтинг', 'r')}${th('turn', 'Текучка', 'r')}<th class="r">Что сделать</th></tr></thead><tbody>`;
    s += rows.map((r) => `<tr class="${r.dev != null && r.dev < -0.05 ? 'bad' : r.dev != null && r.dev < -0.03 ? 'warn' : ''}"><td><span class="ccir t-${tone(r)}">${r.st.stores}</span><span class="cw"><b>${esc(r.st.name)}</b><small>${since(r)}${r.id === S.corp.active ? ' · вы здесь' : ''}</small>${lossTag(r)}</span></td><td><span class="cdir">${who(r)}</span></td>
      <td class="r num">${h.spark(r.c.hist.slice(-12).map((x) => x[2]), 44, 16)} ${fm(r.rev12)}</td><td class="c">${r.id === S.corp.active ? '<span class="muted">подробно</span>' : devBar(r.dev)}</td>
      <td class="r num ${r.margin != null && r.margin < 0 ? 'negc' : ''}">${r.margin != null ? h.pctS(r.margin, true) : '—'}</td><td class="r num">${r.rating ? '★ ' + n1(r.rating) : '—'}</td><td class="r num">${r.turn != null ? Math.round(r.turn * 100) + ' %' : '—'}</td><td class="r">${act(r)}</td></tr>`).join('');
    const all = cmpRows(S), tot = all.reduce((a, r) => a + r.rev12, 0), pr = all.reduce((a, r) => a + r.st.prof12, 0), ds = S.corp.directors;
    s += `</tbody><tfoot><tr><td><b>Вся сеть · ${all.reduce((a, r) => a + r.st.stores, 0)} точек</b></td><td>${ds.length ? `${h.nw(ds.length, 'директор', 'директора', 'директоров')} · в среднем ${Math.round(ds.reduce((a, d) => a + d.loyalty, 0) / ds.length)}` : 'директоров нет'}</td><td class="r num">${fm(tot)}</td><td></td><td class="r num">${tot > 0 ? h.pctS(pr / tot, true) : '—'}</td><td></td><td></td><td></td></tr></tfoot></table></div>`;
    // телефон: карточки
    s += `<div class="cmpcards">${rows.map((r) => `<div class="card cmpc"><div class="card-h"><span class="ccir t-${tone(r)}">${r.st.stores}</span><div class="cw"><b>${esc(r.st.name)}</b><small>${since(r)}</small>${lossTag(r)}</div>${act(r)}</div><div class="cdir">${who(r)}</div>
      <div class="cg"><span>Выручка 12 мес.<b class="num">${fm(r.rev12)}</b></span><span>К прогнозу${r.id === S.corp.active ? '<b class="muted">подробно</b>' : devBar(r.dev)}</span><span>Маржа<b class="num">${r.margin != null ? h.pctS(r.margin, true) : '—'}</b></span><span>Рейтинг · текучка<b class="num">${r.rating ? n1(r.rating) + '★' : '—'} · ${r.turn != null ? Math.round(r.turn * 100) + ' %' : '—'}</b></span></div></div>`).join('')}</div>`;
    s += `<p class="hint" style="margin:0"><span class="lgw warn"></span>ниже прогноза на 3 %+ <span class="lgw bad"></span>на 5 %+ — слабый директор, текучка или устаревшие точки. Прогноз — выручка точек «как при снимке»: без директора, случайностей и перемен в команде.</p></div>`;
    return s;
  }

  /* ---------------- окна ---------------- */
  // найм/назначение: для города (cityId) — кандидаты и резерв; для кандидата (candId) — куда поставить
  function hireModal(S, o) {
    const cr = S.corp, h = H();
    const cities = Object.keys(cr.cities).filter((id) => !cr.cities[id].directorId);
    if (o.candId) {
      const d = cr.dirCand.find((x) => x.id === o.candId); if (!d) return null;
      const cost = BK.HQ.hireCost(S, d);
      const opts = cities.map((id) => `<button class="choice" data-hire="${id}"><b>${esc(cname(id))}</b><span class="cd">${id === cr.active ? 'вы здесь — будет заместителем, пока вы управляете сами' : `${h.nw(BK.Corp.cityStats(S, id).open, 'точка', 'точки', 'точек')} без директора`}</span><span class="cc">${fm(cost)}</span></button>`).join('')
        + `<button class="choice" data-hire=""><b>В резерв</b><span class="cd">Половина оклада; можно поставить на новый город при входе</span><span class="cc">${fm(cost)}</span></button>`;
      return `<div class="modal-h"><span class="eyebrow">Найм директора</span><h2>${esc(d.name)} — куда?</h2></div><div class="modal-b"><p style="margin:0">${GRN(d.grade)}, стиль «${STN(d.style)}», оклад ${fm(d.salary)}/мес. Найм — ${d.src === 'hunter' ? 'хедхантеру 25 % годового оклада' : K().DIR_HIRE_SALARIES + ' оклада'}.</p></div><div class="modal-f">${opts}<button class="btn block" data-act="closeModal">Отмена</button></div>`;
    }
    const id = o.cityId, res = cr.directors.filter((x) => !x.city);
    const cur = D().dirOf(S, cr.cities[id]);
    let opts = res.map((d) => `<button class="choice" data-assign="${d.id}"><b>${esc(d.name)} · из резерва</b><span class="cd">${GRN(d.grade)} · ${STN(d.style)} · лояльность ${Math.round(d.loyalty)}</span><span class="cc">бесплатно</span></button>`).join('');
    opts += cr.dirCand.map((d) => { const cost = BK.HQ.hireCost(S, d); return `<button class="choice" data-cand="${d.id}"${S.cash < cost ? ' disabled' : ''}><b>${esc(d.name)} · ${GRN(d.grade)}${d.src === 'own' ? ' · свои люди' : ''}</b><span class="cd">${STN(d.style)} · ${D().SK.map((k) => SKN[k] + ' ≈' + d.seen[k]).join(', ')} · ${fm(d.salary)}/мес</span><span class="cc">${fm(cost)}</span></button>`; }).join('');
    return `<div class="modal-h"><span class="eyebrow">Директор города</span><h2>${cur ? 'Сменить директора' : 'Директор'} ${esc(cin(id))}</h2></div><div class="modal-b"><p style="margin:0">${cur ? `${esc(cur.name)} уйдёт в резерв (половина оклада). ` : ''}Новый директор месяц адаптируется (выручка −3 %). Приоритет города по умолчанию — по его стилю.</p></div><div class="modal-f">${opts || '<div class="empty">Нет кандидатов — обновите список во вкладке «Директора».</div>'}<button class="btn block" data-act="closeModal">Отмена</button></div>`;
  }
  // вход в город: кто запускает
  function enterChoices(S, id) {
    const cr = S.corp, res = cr.directors.filter((x) => !x.city);
    let s = hqLoadHtml(S, { extra: 1 }) + `<fieldset class="whopick"><legend>Кто запускает город</legend><label class="wopt"><input type="radio" name="who" value="" checked><span><b>Я сам</b><small>Переезд: цех и точки выбираете вы, ${esc(cname(cr.active))} ${cr.cities[cr.active].directorId ? 'останется директору' : 'перейдёт на автопилот'}</small></span></label>`;
    s += res.map((d) => `<label class="wopt"><input type="radio" name="who" value="d:${d.id}"><span><b>${esc(d.name)} · из резерва</b><small>${GRN(d.grade)} · ${STN(d.style)} — цех и ${K().DIR_LAUNCH_STORES} точки откроет сам, вы останетесь ${esc(cin(cr.active))}</small></span></label>`).join('');
    s += cr.dirCand.map((d) => `<label class="wopt"><input type="radio" name="who" value="c:${d.id}"><span><b>Нанять: ${esc(d.name)}</b><small>${GRN(d.grade)} · ${STN(d.style)} · найм ${fm(d.salary * K().DIR_HIRE_SALARIES)} — запустит город сам</small></span></label>`).join('');
    return s + '</fieldset>' + supplyChoices(S, id);
  }
  // вход в город: формат снабжения (Р4, §7.1 п. 2, §7.2)
  function supplyChoices(S, id) {
    const h = BK.Corp.supplyHubs(S, id), k = K(), pl = S.macro.priceLevel, lk = S.corp.hqDelK || 1;
    const per = (D, km) => fm((D[0] + D[1] * km) * pl * lk);
    const opt = (v, title, sub, dis) => `<label class="wopt${dis ? ' dis' : ''}"><input type="radio" name="supply" value="${v}"${v === 'own' ? ' checked' : ''}${dis ? ' disabled' : ''}><span><b>${title}</b><small>${sub}</small></span></label>`;
    let s = `<fieldset class="whopick"><legend>Откуда выпечка</legend>`;
    s += opt('own', 'Свой цех', 'Как в начале игры: помещение под цех, пекари, оборудование. Дороже на старте, дешевле потом.');
    const fr = h.fresh;
    s += fr ? opt('fresh', `Свежая выпечка из цеха ${esc(cin(fr.from))} · ${fr.km} км`, `Без своего цеха: поставка ≈ ${per(k.DEL_FRESH, fr.km)} в месяц на точку + пекари цеха ${esc(cin(fr.from))}${fr.km > k.FRESH_FAR_KM ? `; дальше ${k.FRESH_FAR_KM} км — свежесть −${String(k.FRESH_FAR_RATING).replace('.', ',')}★` : ''}. Свой цех можно открыть позже.`)
      : opt('fresh', 'Свежая выпечка из другого города', `Нужен наш цех ближе ${h.freshKm} км${h.lvl < 1 ? ` (с логистикой 1-го уровня в штабе — ${k.FRESH_KM_L1} км)` : ''}.`, true);
    const fz = h.frozen;
    s += fz ? opt('frozen', `Фабрика заморозки ${esc(cin(fz.from))} · ${fz.km} км`, `Поставка ≈ ${per(k.DEL_FROZEN, fz.km)} в месяц на точку, фудкост +${Math.round(k.FROZEN_FC * 100)} п. п., свежесть −${String(k.FROZEN_RATING).replace('.', ',')}★. Быстро «воткнуть флажок»; свой цех потом выгоднее.`)
      : opt('frozen', 'Фабрика заморозки', h.lvl < 2 ? 'Нужна логистика 2-го уровня в штабе.' : `Нет нашего цеха ближе ${k.FROZEN_KM} км.`, true);
    return s + '</fieldset>';
  }
  function fedModal(S, legend) {
    const f = D().fedStatus(S), d = E().dateOf(S.day), dt = `${String(d.d).padStart(2, '0')}.${String(d.m + 1).padStart(2, '0')}.${d.y}`;
    const yrs = n1((S.day - S.corp.unlockedDay) / 365);
    if (legend) return `<div class="modal-h ru-mh"><div class="stamp ru-stamp" aria-hidden="true"><div class="in"><b>ЛИДЕР</b><small>${dt}</small></div></div><span class="eyebrow pos">Дополнительная цель</span><h2>«Лидер рынка»: ${fm(f.rev)} за год</h2></div><div class="modal-b"><p style="margin:0">Оборот сети за 12 месяцев перевалил за ${Math.round(f.legend / 1e9)} млрд ₽. Вы построили одну из крупнейших пекарных сетей страны.</p></div><div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button><button class="btn block" data-act="summary">Итоги игры</button></div>`;
    return `<div class="modal-h ru-mh"><div class="stamp ru-stamp" aria-hidden="true"><div class="in"><b>ФЕДЕРАЛЬНАЯ</b><small>${dt} · акт II</small></div></div><span class="eyebrow pos">Победа второго акта</span><h2>Федеральная сеть</h2></div><div class="modal-b">
      <p style="margin:0">${H().nw(f.cities, 'город', 'города', 'городов')} по ${f.per}+ точек и <b>${fm(f.rev)}</b> оборота за 12 месяцев — за ${yrs} ${/1$/.test(yrs) && !/11$/.test(yrs) ? 'год' : 'года'} после выхода в Россию.</p>
      <div class="kpis"><div class="kpi"><span class="k">Городов</span><span class="v">${Object.keys(S.corp.cities).length}</span></div><div class="kpi"><span class="k">Точек в сети</span><span class="v">${BK.Corp.summary(S).stores}</span></div><div class="kpi"><span class="k">Директоров</span><span class="v">${S.corp.directors.length}</span></div><div class="kpi"><span class="k">Выручка за всё время</span><span class="v">${fm(S.cumRevenue)}</span></div></div>
      <p class="hint" style="margin:0">Дальше — необязательная цель «Лидер рынка»: ${Math.round(f.legend / 1e9)} млрд ₽ за 12 месяцев.</p></div>
      <div class="modal-f"><button class="btn primary block" data-act="closeModal">Играть дальше</button><button class="btn block" data-act="summary">Итоги игры</button></div>`;
  }

  // бейдж директора на карте России: инициалы или «!»
  function mapBadge(S, id) {
    if (!on(S)) return null;
    const c = S.corp.cities[id]; if (!c) return null;
    const d = D().dirOf(S, c);
    if (d) return { t: initials(d.name), cls: d.loyalty < 40 ? 'warn' : '' };
    if (id !== S.corp.active) return { t: '!', cls: 'bad' };
    return null;
  }

  BK.CorpUI = { fedMode, fedCard, hudGoal, attentionHtml, attention, hqLoadHtml, hqOverTitle, enterCostNote, cityBlocks, dirsTab, inboxTab, cmpTab, hireModal, enterChoices, supplyChoices, fedModal, mapBadge, initials, hqTab, motivation };
})();
