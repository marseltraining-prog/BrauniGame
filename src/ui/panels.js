/* Содержимое правой панели: вкладки. Каждая функция возвращает HTML. Действия — через data-act. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG;
  const fm = (v) => BK.fmtMoney(v);
  const n0 = (v) => Math.round(v).toLocaleString('ru-RU');
  const pct = (v, d = 0) => { let t = (v * 100).toFixed(d); if (/^-0(\.0+)?$/.test(t)) t = t.slice(1); return t.replace('.', ',').replace('-', '−') + '%'; };
  // склонение: plural(5, 'точка', 'точки', 'точек') → 'точек'
  const plural = (n, one, few, many) => { const a = Math.abs(Math.round(n)) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
  const nw = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;
  // название формата помещения, согласованное по роду
  const FORMAT = { small: ['маленькая', 'маленький формат'], standard: ['стандартная', 'стандартный формат'], large: ['большая', 'большой формат'] };
  const fmtShort = (size) => (FORMAT[size] || [C().SIZES[size].name.toLowerCase()])[0];
  const fmtLong = (size) => (FORMAT[size] || [, C().SIZES[size].name.toLowerCase()])[1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const dname = (id) => (E().byId(BK.DISTRICTS, id) || {}).name || id;
  const lname = (id) => (E().byId(BK.LANDMARKS, id) || {}).name || id;
  const km = (a, b) => (E().dist(a, b) * C().KM_PER_UNIT).toFixed(1).replace('.', ',');
  const stars = (l) => `<span class="stars" title="Уровень ${l} из 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`;
  const btn = (act, label, o = {}) => `<button class="btn ${o.cls || ''}" data-act="${act}"${o.arg != null ? ` data-arg="${esc(o.arg)}"` : ''}${o.arg2 != null ? ` data-arg2="${esc(o.arg2)}"` : ''}${o.dis ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${label}${o.cost != null ? ` <span class="cost">${fm(o.cost)}</span>` : ''}</button>`;
  const kv = (k, v) => `<div class="fact"><span class="fk">${k}</span><span class="fv">${v}</span></div>`;
  const meter = (v, cls) => `<div class="meter ${cls || (v > 0.95 ? 'hot' : v > 0.8 ? 'warm' : 'ok')}"><i style="width:${Math.min(100, v * 100).toFixed(0)}%"></i></div>`;
  const statusChip = (S, st) => {
    if (st.status === 'opening') return `<span class="chip">Открытие через ${st.openDay - S.day} дн.</span>`;
    if (st.status === 'repair') return `<span class="chip warn">Ремонт, ещё ${st.repairUntil - S.day} дн.</span>`;
    if (st.closedUntil > S.day) return `<span class="chip bad">Закрыта на ${st.closedUntil - S.day} дн.</span>`;
    if (!st.staff.length) return `<span class="chip bad">Нет персонала</span>`;
    return `<span class="chip good">Работает</span>`;
  };
  const canPay = (S, c) => S.cash >= c;

  /* ---------- оценка предложения ---------- */
  function estimateOffer(S, o) {
    const sz = C().SIZES[o.size];
    const nStaff = E().recStaff(S, o).target;
    const tmp = Object.assign({}, o, { id: '__tmp', status: 'open', repair: 0, staff: Array.from({ length: nStaff }, () => ({ lvl: 1 })) });
    const ms = E().menuStats(S);
    // среднее по всем дням недели (у БЦ и поликлиник выходные провальные, у ТЦ и парков — наоборот)
    let checks = 0, revDay = 0, demand = 0, thr = 0, chk = 0;
    for (let dow = 0; dow < 7; dow++) {
      const d = E().storeDemand(S, tmp, { dow, m: 4 }, ms);
      const c = Math.min(d.demand, d.thr);
      checks += c / 7; revDay += c * d.check / 7; demand += d.demand / 7; thr = d.thr; chk = d.check;
    }
    const rev = revDay * 30.4;
    const cfg = C(), pl = S.macro.priceLevel;
    const rent = o.area * o.rentM2 * (o.payMode === 'year' ? 1 - cfg.YEARLY_RENT_DISCOUNT : 1);
    const pay = nStaff * E().salaryOf(S, 1) * (1 + cfg.PAYROLL_TAX);
    const del = S.productions.length ? E().deliveryCost(S, tmp) : 0;
    const fc = S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct * (cfg.FOODCOST_MULT || 1);
    const hq = S.stores.length + 1 > (cfg.HQ_FREE_STORES || 0) ? (cfg.HQ_PER_STORE || 0) * pl : 0;
    const cost = rev * (fc + E().currentTaxRate(S)) + rent + pay + del + hq + (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * o.area) * pl;
    return { checks, check: checks ? revDay / checks : chk, rev, profit: rev - cost, load: thr ? demand / thr : 0 };
  }
  BK.estimateOffer = estimateOffer;

  /* ---------- прогноз: хватит ли денег на расчёт 1-го числа ---------- */
  function billsForecast(S) {
    const cfg = C(), E_ = E(), pl = S.macro.priceLevel, tx = 1 + cfg.PAYROLL_TAX;
    let bills = 0;
    for (const st of S.stores) {
      if (st.status === 'opening') continue;
      if (st.payMode === 'month') bills += E_.storeRentMonth(st);
      for (const e of st.staff) bills += E_.salaryOf(S, e.lvl) * tx;
      bills += (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * st.area) * pl + E_.deliveryCost(S, st);
    }
    for (const p of S.productions) bills += E_.prodRentMonth(p) + p.staff * S.pay.baker * tx + (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * p.area) * pl;
    const nEmp = E_.allStaff(S) + E_.bakersTotal(S);
    bills += ((cfg.CULTURE[S.culture] || {}).upkeep || 0) * nEmp * pl + Math.max(0, S.stores.length - (cfg.HQ_FREE_STORES || 0)) * (cfg.HQ_PER_STORE || 0) * pl;
    bills += E_.hrCount(S) * (cfg.HR_SALARY || 0) * tx * pl + E_.trainersCount(S) * (cfg.TRAINER_SALARY || 0) * tx * pl;
    bills += S.loan * (S.macro.keyRate + cfg.LOAN_SPREAD) / 12;
    const t = E_.dateOf(S.day);
    const left = Math.max(0, new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate() - t.d);
    const daily = S.cache && S.cache.dayRev != null ? S.cache.dayRev : 0;
    const fc = S.cache && S.cache.fcPct != null ? S.cache.fcPct : E_.menuStats(S).fcPct;
    const tax = (S.month.rev + daily * left) * E_.currentTaxRate(S);
    return { bills: bills + tax, left, cashAt1: S.cash + daily * left * (1 - fc) - bills - tax };
  }
  BK.billsForecast = billsForecast;

  /* ---------- графики ---------- */
  function revChart(S) {
    const h = S.history.slice(-24);
    if (h.length < 2) return `<div class="empty">График появится после первых месяцев работы.</div>`;
    const W = 400, H = 150, pl = 58, pb = 18, pt = 8;
    const max = Math.max(...h.map((x) => x.rev), ...h.map((x) => x.profit), 1);
    const min = Math.min(0, ...h.map((x) => x.profit));
    const y = (v) => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
    const bw = (W - pl - 4) / h.length;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка и прибыль по месяцам">`;
    // «круглые» деления оси: шаг 1/2/5 × 10^k
    const raw = (max - min) / 3, pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const step = [1, 2, 5, 10].map((k) => k * pow).find((v) => v >= raw) || raw;
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) { s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.abs(v) < 1e-6 ? '0' : fm(v).replace(' ₽', '').replace(/,0(?= )/, '')}</text>`; }
    if (min < 0) s += `<line class="zero" x1="${pl}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>`;
    h.forEach((x, i) => { const yy = y(Math.max(0, x.rev)); s += `<rect class="rev" x="${(pl + 2 + i * bw).toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${Math.max(0, y(0) - yy).toFixed(1)}" rx="1.5" opacity=".85"><title>${E().MONTHS[x.m]} ${x.y}: ${fm(x.rev)}</title></rect>`; });
    const pts = h.map((x, i) => `${(pl + 2 + i * bw + bw / 2 - 1.5).toFixed(1)},${y(x.profit).toFixed(1)}`);
    s += `<polyline class="prof" points="${pts.join(' ')}"/>`;
    const last = pts[pts.length - 1].split(',');
    s += `<circle class="profdot" cx="${last[0]}" cy="${last[1]}" r="3.5"/>`;
    // подписи месяцев: крайние выравниваем к краям, чтобы не обрезались
    [...new Set([0, Math.floor(h.length / 2), h.length - 1])].forEach((i, k, arr) => { const anchor = k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle'; const x = anchor === 'start' ? pl + 2 + i * bw : anchor === 'end' ? pl + 2 + (i + 1) * bw - 3 : pl + 2 + i * bw + bw / 2; s += `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="${anchor}">${E().MONTHS[h[i].m].slice(0, 3)} ${String(h[i].y).slice(2)}</text>`; });
    s += `</svg><div class="legend"><span><i style="background:var(--crust)"></i>Выручка</span><span><i style="background:var(--river)"></i>Прибыль</span></div>`;
    return s;
  }

  function pnlTable(p, full, taxRate) {
    if (!p) return `<div class="empty">Отчёт появится 1-го числа следующего месяца.</div>`;
    const row = (k, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td${cls === 'subr' ? ' class="sub"' : ''}>${k}</td><td>${v}</td></tr>`;
    let s = `<table class="tbl">`;
    s += row('Выручка', fm(p.rev));
    s += row('Себестоимость (фудкост)', '−' + fm(p.fc));
    s += row('Аренда', '−' + fm(p.rent));
    s += row('ФОТ (зарплаты + взносы)', '−' + fm(p.payroll));
    if (p.delivery != null) s += row('Доставка', '−' + fm(p.delivery));
    s += row('Коммунальные платежи', '−' + fm(p.util));
    if (full) {
      s += row('Офис, HR, культура, управление', '−' + fm(p.upkeep || 0));
      s += row('Найм и обучение', '−' + fm((p.hire || 0) + (p.train || 0)));
      s += row('Налоги', '−' + fm(p.tax || 0));
      if (p.interest) s += row('Проценты по кредиту', '−' + fm(p.interest));
      if (p.other) s += row('Прочие расходы (события)', '−' + fm(p.other));
      if (p.income) s += row('Прочие доходы', '+' + fm(p.income));
    } else if (p.profit != null) s += row('Налог (оценка)', '−' + fm(p.rev * (taxRate != null ? taxRate : 0.06)));
    s += `<tr class="tot"><td>Прибыль</td><td class="${p.profit >= 0 ? 'pos' : 'negc'}">${fm(p.profit)}</td></tr>`;
    if (full && p.profit > 0) {
      s += row('→ в резервный фонд', fm(p.toReserve || 0), 'subr');
      s += row('→ премии персоналу', fm(p.bonus || 0), 'subr');
      s += row('→ маркетинг', fm(p.marketing || 0), 'subr');
    }
    s += `</table>`;
    return s;
  }

  /* ---------- предупреждения ---------- */
  function alerts(S) {
    const out = [];
    const cfg = C();
    if (S.cash < 0) out.push({ cls: 'bad', t: 'Кассовый разрыв', d: `На счёте ${fm(S.cash)}. Пополните из резерва или возьмите кредит.`, act: 'tab', arg: 'fin' });
    if (S.negMonths > 0 && !S.lost) out.push({ cls: 'bad', t: `Счёт в минусе ${S.negMonths}-й месяц подряд`, d: `Если и на ${cfg.BANKRUPT_MONTHS}-й расчёт счёт будет в минусе, а резерв пуст, — банкротство.`, act: 'tab', arg: 'fin' });
    if (S.cash >= 0 && S.phase === 'play' && S.stores.length) {
      const f = billsForecast(S);
      if (f.cashAt1 + S.reserve < 0) out.push({ cls: S.negMonths > 0 ? 'bad' : 'warn', t: `К 1-му числу не хватит ≈ ${fm(-(f.cashAt1 + S.reserve))}`, d: `Через ${nw(f.left + 1, 'день', 'дня', 'дней')} спишутся аренда, зарплаты и налоги ≈ ${fm(f.bills)}. Возьмите кредит или отложите покупки.`, act: 'tab', arg: 'fin' });
    }
    if (S.chef.pending) out.push({ cls: 'warn', t: 'Шеф-пекарь ждёт решения', d: '5 новинок на выбор.', act: 'chef' });
    const cu = S.cache ? S.cache.capUse : 0;
    if (cu > 1) out.push({ cls: 'bad', t: 'Производство не справляется', d: `Спрос ${pct(cu)} от мощности — продажи теряются. Купите оборудование.`, act: 'tab', arg: 'prod' });
    else if (cu > 0.88) out.push({ cls: 'warn', t: 'Производство почти на пределе', d: `Загрузка ${pct(cu)}.`, act: 'tab', arg: 'prod' });
    let vac = 0, sad = 0, tired = 0; const vacStores = [];
    for (const st of S.stores) { if (st.status === 'opening') continue; const v = E().vacancies(st); if (v) { vac += v; vacStores.push(st); } for (const e of st.staff) { if (e.mood < cfg.MOOD_UNHAPPY) sad++; if (e.fatigue > 55) tired++; } }
    if (vac) out.push({ cls: 'warn', t: `Вакансий: ${vac}`, d: S.office.hr && S.office.autohireOn ? 'HR-отдел уже ищет людей.' : `${vacStores.length > 1 ? 'Точки' : 'Точка'} ${vacStores.slice(0, 3).map((s) => '№' + s.num).join(', ')}${vacStores.length > 3 ? '…' : ''}. Нехватка людей утомляет остальных.`, act: vacStores.length === 1 ? 'openStore' : 'tab', arg: vacStores.length === 1 ? vacStores[0].id : 'team' });
    if (sad) out.push({ cls: 'bad', t: `Недовольны: ${sad} чел.`, d: 'Кто недоволен дольше месяца — уволится. Поднимите зарплату, премии или культуру.', act: 'tab', arg: 'team' });
    if (tired) out.push({ cls: 'warn', t: `Устали: ${tired} чел.`, d: 'Точки перегружены — добавьте людей в штат или обучите персонал.', act: 'tab', arg: 'stores' });
    if (!S.office.hr && S.stores.length > cfg.HR_REQUIRED_STORES) out.push({ cls: 'warn', t: 'Нужен HR-отдел', d: `Без HR вы успеваете нанять не больше ${nw(cfg.OWNER_HIRES_PER_WEEK, 'человека', 'человек', 'человек')} в неделю.`, act: 'tab', arg: 'team' });
    if (!S.office.academy && S.stores.length > cfg.TRAIN_REQUIRED_STORES) out.push({ cls: 'warn', t: 'Нужен отдел обучения', d: `Вручную вы успеваете провести не больше ${nw(cfg.OWNER_TRAINS_PER_WEEK, 'обучения', 'обучений', 'обучений')} в неделю. Отдел обучения будет учить персонал сам.`, act: 'tab', arg: 'team' });
    if (S.prodOffers.length && S.productions.length) out.push({ cls: 'good', t: 'Можно открыть новое производство', d: 'Ближе к точкам — дешевле доставка и больше мощности.', act: 'tab', arg: 'market' });
    if (S.pay.seller < S.market.seller * 0.97) out.push({ cls: 'warn', t: 'Зарплаты ниже рынка', d: `Рынок платит ${fm(S.market.seller)}, вы — ${fm(S.pay.seller)}.`, act: 'tab', arg: 'team' });
    return out;
  }
  BK.alerts = alerts;

  /* ---------- СВОДКА ---------- */
  function dash(S, ui) {
    const E_ = E();
    if (S.phase === 'setup_prod' || S.phase === 'setup_store') return setupPanel(S, ui);
    const last = S.history[S.history.length - 1];
    const rolling = E_.rolling12(S);
    const open = S.stores.filter((s) => s.status !== 'opening').length;
    let happy = 0, mid = 0, sad = 0;
    for (const st of S.stores) for (const e of st.staff) { const k = BK.moodKind(e.mood); if (k === 'happy') happy++; else if (k === 'mid') mid++; else sad++; }
    let s = `<div class="sec"><div class="kpis">
      <div class="kpi wide"><span class="k">Оборот за 12 месяцев — цель ${fm(C().WIN_ANNUAL_REVENUE)}</span><span class="v">${fm(rolling)} <small class="hint">(${pct(rolling / C().WIN_ANNUAL_REVENUE, 1)})</small></span>${meter(rolling / C().WIN_ANNUAL_REVENUE, 'ok')}</div>
      <div class="kpi"><span class="k">Выручка за месяц</span><span class="v">${last ? fm(last.rev) : '—'}</span><span class="d">с 1-го числа: ${fm(S.month.rev)}</span></div>
      <div class="kpi"><span class="k">Прибыль за месяц</span><span class="v ${last && last.profit < 0 ? 'negc' : ''}">${last ? fm(last.profit) : '—'}</span><span class="d">${last && last.rev ? 'маржа ' + pct(last.profit / last.rev) : '&nbsp;'}</span></div>
      <div class="kpi"><span class="k">Точки</span><span class="v">${open}${S.stores.length > open ? ` <small class="hint">+${S.stores.length - open} скоро</small>` : ''}</span><span class="d">${nw(S.productions.length, 'цех', 'цеха', 'цехов')}</span></div>
      <div class="kpi"><span class="k">Команда</span><span class="v">${E_.allStaff(S) + E_.bakersTotal(S)}</span><span class="d faces" title="Настроение персонала точек">${BK.faceIcon('happy')}${happy} ${BK.faceIcon('mid')}${mid} ${BK.faceIcon('sad')}${sad}<span>· пекарей ${E_.bakersTotal(S)}</span></span></div>
    </div></div>`;
    const al = alerts(S);
    if (al.length) s += `<div class="sec"><h3>Требует внимания</h3>${al.map((a) => `<div class="alert ${a.cls}" data-act="${a.act}" data-arg="${a.arg || ''}"><div><div class="a-t">${a.t}</div><div>${a.d}</div></div></div>`).join('')}</div>`;
    s += `<div class="sec"><h3>Выручка и прибыль <small>последние 24 мес.</small></h3>${revChart(S)}</div>`;
    s += `<div class="sec"><h3>Отчёт за прошлый месяц${last ? ` <small>${E_.MONTHS[last.m]} ${last.y}</small>` : ''}</h3>${pnlTable(last && last.pnl, true)}</div>`;
    return s;
  }

  function setupPanel(S, ui) {
    let s = `<div class="sec"><h3>${S.phase === 'setup_prod' ? 'Шаг 1 из 2' : 'Шаг 2 из 2'}</h3>`;
    if (S.phase === 'setup_prod') {
      s += `<p style="margin:0">Выберите помещение под <b>производство</b>. Отсюда выпечка каждое утро уезжает во все точки. Чем ближе к центру — тем дороже аренда, но дешевле доставка.</p>`;
      s += `</div><div class="sec">${S.prodOffers.map((o) => prodOfferCard(S, o, ui)).join('')}</div>`;
    } else {
      s += `<p style="margin:0">Теперь первая <b>торговая точка</b>. Смотрите на трафик и платёжеспособность района: рядом со школой чек низкий, у бизнес-центра — высокий. Время пойдёт после аренды.</p>`;
      s += `<p class="hint" style="margin:0">Оставьте запас на первые месяцы: зарплаты и аренду платят 1-го числа, а выручка набирается постепенно. Не хватает — возьмите кредит во вкладке «Финансы».</p>`;
      s += `</div><div class="sec">${S.offers.map((o) => offerCard(S, o, ui)).join('')}</div>`;
    }
    return s;
  }

  /* ---------- ТОЧКИ ---------- */
  function stores(S, ui) {
    if (ui.storeId) { const st = E().byId(S.stores, ui.storeId); if (st) return storeDetail(S, st, ui); ui.storeId = null; }
    if (!S.stores.length) return `<div class="empty">Точек пока нет. Выберите помещение на вкладке «Рынок».</div>`;
    const sortKey = ui.storeSort || 'rev';
    const list = S.stores.slice().sort((a, b) => sortKey === 'num' ? a.num - b.num : sortKey === 'profit' ? ((b.last && b.last.profit) || 0) - ((a.last && a.last.profit) || 0) : ((b.last && b.last.rev) || 0) - ((a.last && a.last.rev) || 0));
    let s = `<div class="row sp"><span class="hint">${nw(S.stores.length, 'точка', 'точки', 'точек')} · сортировка</span><div class="seg">${[['rev', 'Выручка'], ['profit', 'Прибыль'], ['num', 'Номер']].map(([k, l]) => `<button data-act="storeSort" data-arg="${k}" aria-pressed="${sortKey === k}">${l}</button>`).join('')}</div></div>`;
    for (const st of list) {
      const mood = BK.storeMood(st);
      const L = st.last;
      s += `<div class="card click" data-act="openStore" data-arg="${st.id}">
        <div class="card-h"><div><div class="card-t">№${st.num} · ${esc(st.address)}</div><div class="card-s">${dname(st.district)} · ${fmtShort(st.size)}, ${st.area} м² · ремонт ${st.repair}/3</div></div>${mood ? BK.faceIcon(mood) : ''}</div>
        <div class="row">${statusChip(S, st)}<span class="chip">Штат ${st.staff.length}/${st.staffTarget}${st.incoming.length ? ` +${st.incoming.length}` : ''}</span>${st.today && !st.today.closed ? `<span class="chip">${n0(st.today.checks)} чеков/день</span>` : ''}</div>
        <div class="grid2">${kv('Выручка, мес', L ? fm(L.rev) : '—')}${kv('Прибыль, мес', L ? `<span class="${L.profit >= 0 ? 'pos' : 'negc'}">${fm(L.profit)}</span>` : '—')}</div>
      </div>`;
    }
    return s;
  }

  function storeDetail(S, st, ui) {
    const cfg = C(), E_ = E();
    const sz = cfg.SIZES[st.size];
    const L = st.last, T = st.today;
    const prod = E_.nearestProd(S, st);
    let s = `<button class="back" data-act="closeStoreView">← Все точки</button>`;
    s += `<div class="sec"><div class="card-h"><div><h2 style="font-family:var(--f-display);font-size:18px">№${st.num} · ${esc(st.address)}</h2><div class="card-s">${dname(st.district)} · ${fmtLong(st.size)}, ${st.area} м²</div></div></div>
      <div class="row">${statusChip(S, st)}${st.landmarks.map((l) => `<span class="chip river">${lname(l)}</span>`).join('')}${st.repair ? `<span class="chip crust">${cfg.REPAIRS[st.repair].name}</span>` : ''}</div></div>`;
    if (T && !T.closed) {
      s += `<div class="sec"><h3>Сегодня</h3><div class="kpis">
        <div class="kpi"><span class="k">Чеков</span><span class="v">${n0(T.checks)}</span><span class="d">трафик ${n0(T.traffic)} чел.</span></div>
        <div class="kpi"><span class="k">Средний чек</span><span class="v">${n0(T.check)} ₽</span><span class="d">выручка ${fm(T.rev)}</span></div>
        <div class="kpi wide"><span class="k">Загрузка персонала${T.load > 1 ? ` — теряем ${fm(T.lost)} в день из-за очередей` : ''}</span><span class="v">${pct(Math.min(T.load, 9.99))}</span>${meter(T.load / 1.1)}</div>
      </div></div>`;
    }
    s += `<div class="sec"><h3>Помещение</h3><div class="grid2">
      ${kv('Аренда', fm(E_.storeRentMonth(st)) + '/мес')}${kv('Ставка', n0(st.rentM2) + ' ₽/м²')}
      ${kv('Оплата', st.payMode === 'year' ? (st.rentPaidUntil > S.day ? 'оплачено до ' + E_.fmtDate(st.rentPaidUntil) : 'раз в год') : 'помесячно')}${kv('Трафик', n0(st.traffic) + ' чел/день')}
      ${kv('Платёжеспособность', n0(st.solv * S.macro.priceLevel) + ' ₽')}${kv('Конкуренция', st.comp > 0.95 ? 'низкая' : st.comp > 0.89 ? 'средняя' : 'высокая')}
      ${kv('Доставка', fm(E_.deliveryCost(S, st)) + '/мес')}${kv('До цеха', prod ? km(prod, st) + ' км' : '—')}
    </div></div>`;
    s += `<div class="sec"><h3>Прошлый месяц</h3>${pnlTable(L, false, E_.currentTaxRate(S))}</div>`;
    // ремонт
    s += `<div class="sec"><h3>Ремонт <small>выручка растёт с каждой ступенью</small></h3><div class="ladder">`;
    for (let i = 1; i <= 3; i++) {
      const r = cfg.REPAIRS[i]; const done = st.repair >= i; const next = st.repair + 1 === i;
      s += `<div class="st ${done ? 'done' : next ? 'next' : ''}"><span class="n">${i}</span><span><b>${r.name}</b><br><span class="hint">гостей +${Math.round((r.conv - 1) * 100)}%, чек +${Math.round((r.check - 1) * 100)}%, закрытие ${r.days} дн.</span></span>
        <span>${done ? '<span class="chip good">Готово</span>' : next ? (st.status === 'repair' ? `<span class="chip warn">Идёт</span>` : btn('repair', 'Начать', { cls: 'sm primary', arg: st.id, cost: E_.repairCost(S, st), dis: st.status !== 'open' || !canPay(S, E_.repairCost(S, st)) })) : ''}</span></div>`;
    }
    s += `</div></div>`;
    // персонал
    const vac = E_.vacancies(st);
    const rec = st.status === 'open' ? E_.recStaff(S, st) : null;
    const trainAllCost = st.staff.reduce((a, e) => a + (e.lvl < 5 ? E_.trainCost(S, e.lvl + 1) : 0), 0);
    s += `<div class="sec"><h3>Персонал <small>для этого формата ${sz.staffMin}–${sz.staffMax} чел.</small></h3>
      <div class="row sp"><div class="row"><span class="hint">Штат</span><div class="stepper"><button data-act="staffTarget" data-arg="${st.id}" data-arg2="-1" aria-label="Меньше">−</button><span>${st.staffTarget} чел.</span><button data-act="staffTarget" data-arg="${st.id}" data-arg2="1" aria-label="Больше">+</button></div></div>
      <div class="row">${vac ? `<span class="chip warn">вакансий ${vac}</span>` : ''}${st.incoming.length ? `<span class="chip">${st.incoming.length > 1 ? 'новички выйдут через' : 'новичок выйдет через'} ${st.incoming.map((x) => Math.max(0, x.day - S.day)).join(', ')} дн.</span>` : ''}</div></div>
      ${rec ? `<div class="hint">${rec.over ? `<span class="negc">Поток гостей требует ~${rec.need} чел. 1-го уровня, а максимум для этого формата — ${sz.staffMax}. Обучайте команду: опытные обслуживают больше гостей.</span>` : `Для нынешнего потока хватит ~${rec.need} чел. 1-го уровня.`}</div>` : ''}
      ${(() => { const hl = E_.ownerHireLeft(S), tl = E_.ownerTrainLeft(S); const parts = []; if (hl !== Infinity) parts.push(`нанять — ещё ${hl}`); if (tl !== Infinity) parts.push(`обучить — ещё ${tl}`); return parts.length ? `<div class="hint ${hl === 0 || tl === 0 ? 'warnc' : ''}">Без ${hl !== Infinity && tl !== Infinity ? 'HR и отдела обучения' : hl !== Infinity ? 'HR-отдела' : 'отдела обучения'} на этой неделе можно ${parts.join(', ')} (вкладка «Команда»).</div>` : ''; })()}
      <div class="row">${btn('quickHire', 'Нанять', { cls: 'sm dark', arg: st.id, cost: E_.hireCost(S, 1), dis: st.staff.length + st.incoming.length >= sz.staffMax, title: 'Случайный кандидат 1–2 уровня. Стоимость найма — 2 зарплаты.' })}${btn('pickCand', 'Выбрать кандидата', { cls: 'sm', arg: st.id })}${trainAllCost ? btn('trainAll', 'Обучить всех', { cls: 'sm', arg: st.id, cost: trainAllCost, dis: !canPay(S, trainAllCost) }) : ''}</div>
      <div>`;
    if (!st.staff.length) s += `<div class="empty">${st.status === 'opening' ? 'Команда выйдет в день открытия.' : 'Никого нет — точка не работает.'}</div>`;
    for (const e of st.staff.slice().sort((a, b) => b.lvl - a.lvl)) {
      const mk = BK.moodKind(e.mood);
      const tc = e.lvl < 5 ? E_.trainCost(S, e.lvl + 1) : 0;
      const confirm = ui.confirmFire === e.id;
      s += `<div class="emp">${BK.faceIcon(mk)}<div style="min-width:0"><div class="nm" title="${esc(e.name)}">${esc(e.name)}</div><div class="meta">${stars(e.lvl)}<span>${BK.STAFF_LVL_NAMES[e.lvl]}</span><span>${fm(E_.salaryOf(S, e.lvl))}</span><span title="Усталость">усталость <span class="fbar"><i style="width:${e.fatigue.toFixed(0)}%"></i></span></span>${e.unhappy > 0 && e.mood < cfg.MOOD_UNHAPPY ? `<span class="negc">недоволен ${e.unhappy} дн. из ${cfg.UNHAPPY_QUIT_DAYS}</span>` : ''}</div></div>
        <div class="acts">${confirm ? `${btn('fire', 'Уволить', { cls: 'sm danger', arg: st.id, arg2: e.id, title: 'Компенсация — месячный оклад' })}${btn('cancelFire', 'Отмена', { cls: 'sm' })}` : `${e.lvl < 5 ? btn('train', 'Учить', { cls: 'sm', arg: st.id, arg2: e.id, cost: tc, dis: !canPay(S, tc), title: `Поднять до уровня ${e.lvl + 1}: обслуживает больше гостей, чек выше, реже увольняется` }) : '<span class="chip crust">макс.</span>'}${btn('askFire', '✕', { cls: 'sm', arg: e.id, title: 'Уволить (компенсация — месячный оклад)' })}`}</div></div>`;
    }
    s += `</div></div>`;
    s += `<div class="sec"><h3>Закрытие</h3>${ui.confirmClose === st.id ? `<div class="confirm">Закрыть точку и продать оборудование за ${fm(st.capex * cfg.CLOSE_REFUND)}? ${btn('closeStore', 'Закрыть', { cls: 'sm danger', arg: st.id })}${btn('cancelClose', 'Отмена', { cls: 'sm' })}</div>` : btn('askClose', 'Закрыть точку', { cls: 'sm danger', arg: st.id })}</div>`;
    return s;
  }

  /* ---------- РЫНОК ---------- */
  function offerCard(S, o, ui) {
    const cfg = C(), E_ = E();
    const c = E_.storeOpenCost(S, o);
    const est = estimateOffer(S, o);
    const rec = E_.recStaff(S, o);
    const sel = ui.sel && ui.sel.kind === 'offer' && ui.sel.id === o.id;
    return `<div class="card${sel ? ' sel' : ''}" data-offer="${o.id}">
      <div class="card-h"><div><div class="card-t">${esc(o.address)}</div><div class="card-s">${dname(o.district)} · ${fmtShort(o.size)}, ${o.area} м²</div></div><button class="btn sm" data-act="focusOffer" data-arg="${o.id}" title="Показать на карте">На карте</button></div>
      <div class="row">${o.landmarks.map((l) => `<span class="chip river">${lname(l)}</span>`).join('')}<span class="chip ${o.payMode === 'year' ? 'crust' : ''}">${o.payMode === 'year' ? 'оплата за год, −12%' : 'оплата помесячно'}</span>${rec.over ? `<span class="chip bad" title="Поток больше, чем успеет обслужить максимальный штат">перегруз: нужно ${rec.need} чел., максимум ${cfg.SIZES[o.size].staffMax}</span>` : `<span class="chip">штат ${rec.target} чел.</span>`}</div>
      <div class="grid2">
        ${kv('Аренда', `${n0(o.rentM2)} ₽/м² · ${fm(o.area * o.rentM2)}`)}${kv('Трафик', n0(o.traffic) + ' чел/день')}
        ${kv('Платёжеспособность', n0(o.solv * S.macro.priceLevel) + ' ₽')}${kv('Конкуренция', o.comp > 0.95 ? 'низкая' : o.comp > 0.89 ? 'средняя' : 'высокая')}
        ${kv('Прогноз выручки', '≈ ' + fm(est.rev) + '/мес')}${kv('Прогноз прибыли', `<span class="${est.profit >= 0 ? 'pos' : 'negc'}">≈ ${fm(est.profit)}/мес</span>`)}
      </div>
      <div class="row sp"><span class="hint">Отделка ${fm(c.fit)}, оборудование ${fm(c.eq)}, найм ${fm(c.hire)}, ${o.payMode === 'year' ? 'аренда за год' : 'депозит'} ${fm(c.rent)}. ${S.cash >= c.total ? `После аренды на счёте останется <b class="${S.cash - c.total < 1.5e6 * S.macro.priceLevel ? 'warnc' : ''}">${fm(S.cash - c.total)}</b>.` : `<span class="negc">Не хватает ${fm(c.total - S.cash)}.</span>`} Предложение действует ещё ${nw(Math.max(0, o.expires - S.day), 'день', 'дня', 'дней')}.</span>
      ${btn('rent', 'Арендовать', { cls: 'primary', arg: o.id, cost: c.total, dis: !canPay(S, c.total) })}</div>
    </div>`;
  }
  function prodOfferCard(S, o, ui) {
    const E_ = E();
    const c = E_.prodOpenCost(S, o);
    const center = BK.CENTER_POINT;
    const avgKm = S.stores.length ? S.stores.reduce((a, st) => a + E_.dist(o, st), 0) / S.stores.length * C().KM_PER_UNIT : E_.dist(o, center) * C().KM_PER_UNIT;
    const del = (C().DELIVERY_BASE + C().DELIVERY_PER_KM * avgKm) * S.macro.priceLevel;
    const sel = ui.sel && ui.sel.kind === 'prodOffer' && ui.sel.id === o.id;
    return `<div class="card${sel ? ' sel' : ''}">
      <div class="card-h"><div><div class="card-t">${esc(o.address)}</div><div class="card-s">${dname(o.district)} · ${o.area} м² · до центра ${km(o, center)} км</div></div><button class="btn sm" data-act="focusProdOffer" data-arg="${o.id}">На карте</button></div>
      <div class="grid2">${kv('Аренда', fm(o.area * o.rentM2) + '/мес')}${kv('Ставка', n0(o.rentM2) + ' ₽/м²')}${kv(S.stores.length ? 'Доставка до точек' : 'Доставка (до центра)', '≈ ' + fm(del) + ' на точку/мес')}${kv('Мощность', n0(C().PROD_BASE_CAPACITY) + ' изд./день')}</div>
      <div class="row sp"><span class="hint">Отделка ${fm(c.fit)}, базовое оборудование ${fm(c.eq)}, депозит ${fm(c.dep)}. Запуск ${C().PROD_OPEN_DAYS} дн.</span>${btn('rentProd', 'Арендовать под цех', { cls: 'primary', arg: o.id, cost: c.total, dis: !canPay(S, c.total) })}</div>
    </div>`;
  }
  function market(S, ui) {
    let s = '';
    if (S.prodOffers.length) s += `<div class="sec"><h3>Помещения под производство</h3>${S.prodOffers.map((o) => prodOfferCard(S, o, ui)).join('')}</div>`;
    const want = E().offersWanted(S);
    s += `<div class="sec"><h3>Помещения для точек <small>${S.offers.length} из ${want}</small></h3>`;
    s += `<div class="row sp"><span class="hint">Новые предложения появляются раз в 1–2 недели. Чем больше точек, тем больше вариантов (до 5).</span>${btn('realtor', 'Риелтор: новая подборка', { cls: 'sm', cost: Math.round(C().REALTOR_FEE * S.macro.priceLevel), dis: !canPay(S, C().REALTOR_FEE * S.macro.priceLevel) })}</div>`;
    if (!S.offers.length) s += `<div class="empty">Свободных помещений сейчас нет — подождите или закажите подборку у риелтора.</div>`;
    s += S.offers.slice().sort((a, b) => estimateOffer(S, b).profit - estimateOffer(S, a).profit).map((o) => offerCard(S, o, ui)).join('');
    s += `</div>`;
    return s;
  }

  /* ---------- ПРОИЗВОДСТВО ---------- */
  function production(S, ui) {
    const cfg = C(), E_ = E();
    if (!S.productions.length) return `<div class="empty">Производства пока нет.</div>`;
    const cap = S.cache ? S.cache.cap : 0, units = S.cache ? S.cache.units : 0;
    let s = `<div class="sec"><h3>Мощность сети</h3><div class="kpis">
      <div class="kpi wide"><span class="k">Спрос / мощность, изделий в день</span><span class="v">${n0(units)} / ${n0(cap)}</span>${meter(cap ? units / cap : 0)}</div>
      <div class="kpi"><span class="k">Фудкост меню</span><span class="v">${pct(S.cache ? S.cache.fcPct : E_.menuStats(S).fcPct, 1)}</span></div>
      <div class="kpi"><span class="k">Пекарей</span><span class="v">${E_.bakersTotal(S)}</span><span class="d">зарплата ${fm(S.pay.baker)}</span></div>
    </div>`;
    const next = S.productions.length === 1 ? cfg.SECOND_PROD_STORES : S.productions.length === 2 ? cfg.THIRD_PROD_STORES : null;
    if (next && !S.prodOffers.length) s += `<div class="hint">Следующее производство можно открыть при ${next} точках (сейчас ${S.stores.length}).</div>`;
    s += `</div>`;
    for (const p of S.productions) {
      const pc = E_.prodCapacity(S, p);
      const served = S.stores.filter((st) => E_.nearestProd(S, st) === p).length;
      s += `<div class="sec card"><div class="card-h"><div><div class="card-t">${p.name} · ${esc(p.address)}</div><div class="card-s">${dname(p.district)} · ${p.area} м² · аренда ${fm(E_.prodRentMonth(p))}/мес · обслуживает ${nw(served, 'точку', 'точки', 'точек')}</div></div>${BK.faceIcon(BK.moodKind(p.morale))}</div>
        ${p.status === 'opening' ? `<span class="chip">Запуск через ${p.openDay - S.day} дн.</span>` : `<div class="grid2">${kv('Мощность', n0(pc) + ' изд./день')}${kv('Загрузка', pct(p.load || 0))}${kv('Пекари', `${p.staff} / нужно ${p.need}`)}${kv('Настроение цеха', Math.round(p.morale))}${kv('Снижение фудкоста', pct(1 - E_.prodFcMult(S, p)))}${kv('Расходы цеха/мес', p.lastCost ? fm(p.lastCost) : '—')}</div>`}
        <div><div class="hint" style="margin-bottom:4px">Оборудование</div>`;
      for (const e of BK.EQUIPMENT) {
        const have = p.equip[e.id] || 0; const price = Math.round(e.price * S.macro.priceLevel);
        const eff = [e.cap ? `+${n0(e.cap)} изд./день` : '', e.fc ? `фудкост −${Math.round(e.fc * 100)}%` : '', e.del ? `доставка −${Math.round(e.del * 100)}%` : '', e.unlock ? 'открывает новые продукты' : ''].filter(Boolean).join(' · ');
        s += `<div class="eq"><div><div class="en">${e.name} ${have ? `<span class="chip good">${have}/${e.max}</span>` : ''}</div><div class="ed">${e.desc}. ${eff}</div></div>
          ${have >= e.max ? '<span class="chip">Установлено</span>' : btn('buyEq', have ? 'Ещё' : 'Купить', { cls: 'sm', arg: p.id, arg2: e.id, cost: price, dis: p.status !== 'open' || !canPay(S, price) })}</div>`;
      }
      s += `</div></div>`;
    }
    return s;
  }

  /* ---------- МЕНЮ ---------- */
  function menu(S, ui) {
    const cfg = C(), E_ = E();
    const ms = E_.menuStats(S);
    const pl = S.macro.priceLevel;
    let s = `<div class="sec"><div class="kpis">
      <div class="kpi"><span class="k">Привлекательность меню</span><span class="v">${ms.appeal.toFixed(2).replace('.', ',')}</span><span class="d">${ms.n} позиций, ${ms.cats} категорий</span></div>
      <div class="kpi"><span class="k">Фудкост</span><span class="v">${pct(S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct, 1)}</span><span class="d">с учётом оборудования</span></div>
      <div class="kpi"><span class="k">Средняя цена</span><span class="v">${n0(ms.avgPrice)} ₽</span><span class="d">индекс ${pct(ms.priceIdx)}</span></div>
      <div class="kpi"><span class="k">Корзина гостя</span><span class="v">${n0(ms.avgPrice * cfg.ITEMS_PER_CHECK)} ₽</span><span class="d">без допродаж</span></div>
    </div>
    <p class="hint" style="margin:0">Цена — одна на всю сеть. Если корзина дороже платёжеспособности района, гостей там заметно меньше. В богатых районах повышение цены поднимает чек, в бедных — отпугивает.</p>
    <div class="row">${btn('allPrices', 'Все цены −5%', { cls: 'sm', arg: '-0.05' })}${btn('allPrices', 'Все цены +5%', { cls: 'sm', arg: '0.05' })}${btn('allPrices', 'Сбросить к рекомендованным', { cls: 'sm', arg: 'reset' })}</div></div>`;
    const nextY = S.chef.pending ? null : E_.dateOf(S.day).y + 1;
    s += `<div class="sec"><h3>Шеф-пекарь</h3>${S.chef.pending ? `<div class="alert warn" data-act="chef"><div><div class="a-t">Шеф подготовил 5 новинок</div><div>Выберите до 2 в меню и выведите до 2 старых позиций.</div></div></div>` : `<div class="hint">Новинки — раз в год. Следующие предложения: январь ${nextY}.</div>`}</div>`;
    s += `<div class="sec"><h3>Меню <small>${S.menu.length} из ${cfg.MENU_MAX}</small></h3><div>`;
    for (const it of S.menu) {
      const p = E_.byId(BK.PRODUCTS, it.id);
      const sug = p.price * pl, price = sug * it.pm, fc = p.fc / it.pm;
      const tr = S.trends[p.cat];
      s += `<div class="prodrow"><div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="pm"><span class="chip" style="background:color-mix(in srgb, ${BK.CATEGORIES[p.cat].color} 18%, transparent);color:${BK.CATEGORIES[p.cat].color}">${BK.CATEGORIES[p.cat].name}</span><span>тренд ${Math.round(tr)}</span><span>фудкост ${pct(fc)}</span><span>рекоменд. ${n0(sug)} ₽</span></div></div>
        <div class="pr"><div class="stepper"><button data-act="price" data-arg="${p.id}" data-arg2="-0.05" aria-label="Дешевле">−</button><span title="${pct(it.pm)} от рекомендованной">${n0(price)} ₽</span><button data-act="price" data-arg="${p.id}" data-arg2="0.05" aria-label="Дороже">+</button></div></div></div>`;
    }
    s += `</div></div>`;
    s += `<div class="sec"><h3>Тренды рынка</h3>`;
    for (const k of Object.keys(BK.CATEGORIES)) s += `<div class="row sp" style="gap:10px"><span style="flex:0 0 150px;font-size:13px">${BK.CATEGORIES[k].name}</span><div style="flex:1">${meter(S.trends[k] / 100, 'ok')}</div><span class="mono" style="width:26px;text-align:right">${Math.round(S.trends[k])}</span></div>`;
    s += `</div>`;
    return s;
  }

  /* ---------- КОМАНДА / ОФИС ---------- */
  function team(S, ui) {
    const cfg = C(), E_ = E();
    let happy = 0, mid = 0, sad = 0, vac = 0, tired = 0;
    for (const st of S.stores) { if (st.status !== 'opening') vac += E_.vacancies(st); for (const e of st.staff) { const k = BK.moodKind(e.mood); if (k === 'happy') happy++; else if (k === 'mid') mid++; else sad++; if (e.fatigue > 55) tired++; } }
    const total = happy + mid + sad;
    const yearAgo = S.history.length >= 12 ? S.history[S.history.length - 12] : null;
    let s = `<div class="sec"><h3>Офис · команда</h3><div class="kpis">
      <div class="kpi"><span class="k">Продавцов и бариста</span><span class="v">${total}</span><span class="d" style="display:flex;gap:6px;align-items:center">${BK.faceIcon('happy')}${happy} ${BK.faceIcon('mid')}${mid} ${BK.faceIcon('sad')}${sad}</span></div>
      <div class="kpi"><span class="k">Уволились всего</span><span class="v">${S.stats.quits}</span><span class="d">нанято: ${S.stats.hires}</span></div>
      <div class="kpi"><span class="k">Вакансии</span><span class="v ${vac ? 'warnc' : ''}">${vac}</span><span class="d">устали: ${tired}</span></div>
      <div class="kpi"><span class="k">Найм одного</span><span class="v">${fm(E_.hireCost(S, 1))}</span><span class="d">2 зарплаты · ${E_.hireDays(S)} дн.</span></div>
    </div>
    <p class="hint" style="margin:0">Настроение зависит от зарплаты относительно рынка, культуры, премий, усталости и нехватки коллег. Недоволен больше ${cfg.UNHAPPY_QUIT_DAYS} дней — увольняется. Обученные сотрудники держатся дольше, но ждут зарплату выше (+${Math.round(cfg.EXPECT_PER_LVL * 100)}% за уровень).</p></div>`;
    // зарплаты
    const payRow = (kind, label) => {
      const r = S.pay[kind] / S.market[kind];
      return `<div class="card"><div class="row sp"><div><div class="card-t">${label}</div><div class="card-s">рынок: ${fm(S.market[kind])} · вы платите ${pct(r)} рынка</div></div>
        <div class="stepper"><button data-act="pay" data-arg="${kind}" data-arg2="-0.02" aria-label="Снизить">−</button><span>${fm(S.pay[kind])}</span><button data-act="pay" data-arg="${kind}" data-arg2="0.02" aria-label="Повысить">+</button></div></div>
        <div class="hint">${r >= 1.1 ? 'Выше рынка — люди держатся за место.' : r >= 0.99 ? 'На уровне рынка — нейтрально.' : 'Ниже рынка — растёт недовольство и текучка, но экономия на ФОТ.'}${kind === 'seller' ? ` ФОТ точек в месяц ≈ ${fm(S.stores.reduce((a, st) => a + st.staff.reduce((b, e) => b + E_.salaryOf(S, e.lvl), 0), 0) * (1 + cfg.PAYROLL_TAX))}.` : ''}</div></div>`;
    };
    s += `<div class="sec"><h3>Зарплаты <small>1-й уровень; выше уровень — выше оклад</small></h3>${payRow('seller', 'Продавцы и бариста')}${payRow('baker', 'Пекари на производстве')}
      <div class="hint">Премиальный фонд: ${pct(S.alloc.bonus)} прибыли (настройка — во вкладке «Финансы»). В прошлом месяце ≈ ${fm(S.lastBonusPerEmp)} на человека.</div></div>`;
    // HR
    const hrU = cfg.OFFICE_UPGRADES.hr;
    const hrN = E_.hrCount(S);
    s += `<div class="sec"><h3>HR-отдел</h3><div class="card">`;
    if (S.office.hr) {
      s += `<div class="row sp"><div><div class="card-t">HR-менеджеров: ${hrN}</div><div class="card-s">1 на каждые ${cfg.HR_STORES_PER} точек · ${fm(hrN * cfg.HR_SALARY * (1 + cfg.PAYROLL_TAX) * S.macro.priceLevel)}/мес</div></div>
        <div class="seg"><button data-act="autohire" data-arg="1" aria-pressed="${S.office.autohireOn}">Автонайм вкл</button><button data-act="autohire" data-arg="0" aria-pressed="${!S.office.autohireOn}">выкл</button></div></div>
        <div class="hint">HR сам закрывает вакансии: человек выходит через 5 дней, чаще сразу на 2-м уровне. Цена найма та же — 2 зарплаты.</div>`;
    } else {
      const left = E_.ownerHireLeft(S);
      s += `<div class="card-t">Отдела пока нет — нанимаете сами</div><div class="card-s">${S.stores.length > cfg.HR_REQUIRED_STORES ? `<span class="negc">Сеть больше ${cfg.HR_REQUIRED_STORES} точек: вы успеваете нанять только ${cfg.OWNER_HIRES_PER_WEEK} чел. в неделю (осталось ${left}), поиск ${cfg.OWNER_HIRE_DAYS_BIG} дн.</span>` : `После ${cfg.HR_REQUIRED_STORES} точек без HR найм станет медленным.`}</div>
        <div class="hint">${hrU.desc}. Зарплата менеджера ${fm(cfg.HR_SALARY * S.macro.priceLevel)} + взносы, 1 на ${cfg.HR_STORES_PER} точек.</div>
        <div>${btn('office', 'Нанять HR-менеджера', { cls: 'primary', arg: 'hr', cost: Math.round(hrU.cost * S.macro.priceLevel), dis: !canPay(S, hrU.cost * S.macro.priceLevel) })}</div>`;
    }
    s += `</div>`;
    s += `</div>`;
    const ac = cfg.OFFICE_UPGRADES.academy;
    const trN = E_.trainersCount(S);
    s += `<div class="sec"><h3>Отдел обучения</h3><div class="card">`;
    if (S.office.academy) {
      s += `<div class="row sp"><div><div class="card-t">Тренеров: ${trN}</div><div class="card-s">1 на ${cfg.TRAINER_STORES_PER} точек · ${fm(trN * cfg.TRAINER_SALARY * (1 + cfg.PAYROLL_TAX) * S.macro.priceLevel)}/мес · обучение −35%</div></div>
        <div class="seg"><button data-act="autotrain" data-arg="1" aria-pressed="${S.office.autotrainOn}">Автообучение вкл</button><button data-act="autotrain" data-arg="0" aria-pressed="${!S.office.autotrainOn}">выкл</button></div></div>
        <div class="row sp"><span class="hint">Обучать всех до уровня</span><div class="stepper"><button data-act="trainTarget" data-arg="-1" aria-label="Ниже">−</button><span>${S.office.trainTarget} · ${BK.STAFF_LVL_NAMES[S.office.trainTarget]}</span><button data-act="trainTarget" data-arg="1" aria-label="Выше">+</button></div></div>
        <div class="hint">Тренеры поднимают каждого сотрудника на один уровень не чаще раза в ${cfg.AUTOTRAIN_GAP_DAYS} дней, по ${cfg.AUTOTRAIN_PER_TRAINER_DAY} обучения в день на тренера. Помните: выше уровень — выше оклад.</div>`;
    } else {
      const left = E_.ownerTrainLeft(S);
      s += `<div class="card-t">Отдела пока нет — обучаете сами</div><div class="card-s">${S.stores.length > cfg.TRAIN_REQUIRED_STORES ? `<span class="negc">Сеть больше ${cfg.TRAIN_REQUIRED_STORES} точек: вручную не больше ${cfg.OWNER_TRAINS_PER_WEEK} обучений в неделю (осталось ${left}).</span>` : `После ${cfg.TRAIN_REQUIRED_STORES} точек без отдела обучение станет медленным.`}</div>
        <div class="hint">${ac.desc}. Зарплата тренера ${fm(cfg.TRAINER_SALARY * S.macro.priceLevel)} + взносы.</div>
        <div>${btn('office', 'Открыть отдел обучения', { cls: 'primary', arg: 'academy', cost: Math.round(ac.cost * S.macro.priceLevel), dis: !canPay(S, ac.cost * S.macro.priceLevel) })}</div>`;
    }
    s += `</div></div>`;
    // культура
    s += `<div class="sec"><h3>Корпоративная культура <small>+настроение всей команды</small></h3><div class="ladder">`;
    for (let i = 1; i < cfg.CULTURE.length; i++) {
      const c = cfg.CULTURE[i]; const done = S.culture >= i, next = S.culture + 1 === i;
      const cost = Math.round(c.cost * S.macro.priceLevel);
      s += `<div class="st ${done ? 'done' : next ? 'next' : ''}"><span class="n">${i}</span><span><b>${c.name}</b><br><span class="hint">настроение +${c.mood} · ${fm(c.upkeep * S.macro.priceLevel)} на сотрудника в месяц</span></span><span>${done ? '<span class="chip good">Есть</span>' : next ? btn('culture', 'Внедрить', { cls: 'sm primary', cost, dis: !canPay(S, cost) }) : ''}</span></div>`;
    }
    s += `</div></div>`;
    // кандидаты
    const openStores = S.stores.filter((st) => st.staff.length + st.incoming.length < cfg.SIZES[st.size].staffMax).sort((a, b) => E_.vacancies(b) - E_.vacancies(a));
    const target = ui.hireStore && E_.byId(S.stores, ui.hireStore) ? ui.hireStore : (openStores[0] && openStores[0].id);
    s += `<div class="sec"><h3>Кандидаты <small>обновляются раз в неделю</small></h3>`;
    if (!S.stores.length) s += `<div class="empty">Сначала откройте точку.</div>`;
    else {
      s += `<div class="field"><label for="hireStore">Нанять в точку</label><select id="hireStore" class="input" data-inp="hireStore">${S.stores.map((st) => `<option value="${st.id}"${st.id === target ? ' selected' : ''}>№${st.num} ${esc(st.address)} — штат ${st.staff.length + st.incoming.length}/${st.staffTarget}${E_.vacancies(st) ? `, вакансий ${E_.vacancies(st)}` : ''}</option>`).join('')}</select></div>`;
      for (const c of S.candidates) {
        const cost = E_.hireCost(S, c.lvl);
        s += `<div class="emp">${BK.faceIcon(c.trait >= 4 ? 'happy' : c.trait <= -4 ? 'sad' : 'mid')}<div style="min-width:0"><div class="nm">${esc(c.name)}</div><div class="meta">${stars(c.lvl)}<span>${BK.STAFF_LVL_NAMES[c.lvl]}</span><span>${c.trait >= 4 ? 'позитивный' : c.trait <= -4 ? 'требовательный' : 'спокойный'} характер</span><span>оклад ${fm(E_.salaryOf(S, c.lvl))}</span></div></div>
          <div class="acts">${btn('hireCand', 'Нанять', { cls: 'sm dark', arg: c.id, arg2: target, cost, dis: !target || !canPay(S, cost) })}</div></div>`;
      }
    }
    s += `</div>`;
    return s;
  }

  /* ---------- ФИНАНСЫ ---------- */
  function finance(S, ui) {
    const cfg = C(), E_ = E();
    const a = S.alloc;
    const rest = Math.max(0, 1 - a.reserve - a.bonus - a.marketing);
    const sl = (key, label, hint) => `<div class="field"><label for="al-${key}">${label} — <b>${pct(a[key])}</b></label><div class="slider"><input type="range" id="al-${key}" min="0" max="60" step="1" value="${Math.round(a[key] * 100)}" data-inp="alloc" data-arg="${key}"><span class="val">${pct(a[key])}</span></div><span class="hint">${hint}</span></div>`;
    const lim = E_.loanLimit(S);
    let s = `<div class="sec"><div class="kpis">
      <div class="kpi"><span class="k">Расчётный счёт</span><span class="v ${S.cash < 0 ? 'negc' : ''}">${fm(S.cash)}</span></div>
      <div class="kpi"><span class="k">Резервный фонд</span><span class="v">${fm(S.reserve)}</span><span class="d">доход ${pct(Math.max(0, S.macro.keyRate - cfg.RESERVE_SPREAD), 1)} годовых</span></div>
      <div class="kpi"><span class="k">Кредит</span><span class="v ${S.loan ? 'warnc' : ''}">${fm(S.loan)}</span><span class="d">ставка ${pct(S.macro.keyRate + cfg.LOAN_SPREAD, 1)}</span></div>
      <div class="kpi"><span class="k">Налог</span><span class="v">${pct(E_.currentTaxRate(S), 1)}</span><span class="d">${S.macro.regime === 'osno' ? 'ОСНО: НДС + 25% прибыли' : 'УСН «доходы»'}</span></div>
    </div></div>`;
    s += `<div class="sec"><h3>Распределение прибыли <small>каждый месяц</small></h3>
      ${sl('reserve', 'Резервный фонд', 'Подушка на карантин, кризис и конкурентов. Сам закрывает кассовый разрыв и приносит проценты.')}
      ${sl('bonus', 'Премии персоналу', 'Поднимают настроение и снижают текучесть.')}
      ${sl('marketing', 'Маркетинг', `Больше гостей в следующем месяце (до +${Math.round(cfg.MARKETING_EFF * 100)}%).`)}
      <div class="kv"><span>Остаётся на развитие</span><span><b>${pct(rest)}</b></span></div></div>`;
    s += `<div class="sec"><h3>Резервный фонд <small>${fm(S.reserve)}</small></h3><div class="row">
      ${btn('reserve', '+1 млн', { cls: 'sm', arg: 1e6, dis: S.cash < 1e6, title: 'Перевести 1 млн со счёта в резерв' })}${btn('reserve', '+10 млн', { cls: 'sm', arg: 1e7, dis: S.cash < 1e7, title: 'Перевести 10 млн со счёта в резерв' })}${btn('reserve', '−1 млн', { cls: 'sm', arg: -1e6, dis: S.reserve < 1e6, title: 'Вернуть 1 млн из резерва на счёт' })}${btn('reserve', '−10 млн', { cls: 'sm', arg: -1e7, dis: S.reserve < 1e7, title: 'Вернуть 10 млн из резерва на счёт' })}${btn('reserve', 'Всё на счёт', { cls: 'sm', arg: -1e15, dis: S.reserve < 1 })}</div>
      <span class="hint">«+» — перевести со счёта в резерв, «−» — вернуть на счёт.</span></div>`;
    s += `<div class="sec"><h3>Кредит <small>лимит ${fm(lim)}</small></h3><div class="row">
      ${btn('loan', 'Взять 5 млн', { cls: 'sm', arg: 5e6, dis: S.loan + 1 > lim })}${btn('loan', 'Взять 20 млн', { cls: 'sm', arg: 2e7, dis: S.loan + 1 > lim })}${btn('repay', 'Погасить 5 млн', { cls: 'sm', arg: 5e6, dis: !S.loan })}${btn('repay', 'Погасить всё', { cls: 'sm', arg: 1e15, dis: !S.loan })}</div>
      <span class="hint">Лимит — средняя месячная выручка × ${cfg.LOAN_MAX_REV_MULT}${S.ev && S.day < (S.ev.creditSqueezeUntil || 0) ? ' (в кризис банки дают вдвое меньше)' : ''}. Проценты списываются 1-го числа.</span></div>`;
    s += `<div class="sec"><h3>Экономика</h3><div class="grid2">
      ${kv('Ключевая ставка', pct(S.macro.keyRate, 1))}${kv('Инфляция (прогноз года)', pct(S.macro.inflation + S.macro.inflAdd, 1))}
      ${kv('Уровень цен к 2027', pct(S.macro.priceLevel))}${kv('Рыночная зарплата', fm(S.market.seller))}
      ${kv('Выручка с начала года', fm(S.yearRev))}${kv('Выручка за всё время', fm(S.cumRevenue))}</div></div>`;
    // по годам
    const years = {};
    for (const h of S.history) { years[h.y] = years[h.y] || { rev: 0, profit: 0, stores: 0 }; years[h.y].rev += h.rev; years[h.y].profit += h.profit; years[h.y].stores = h.stores; }
    const ys = Object.keys(years).sort().reverse();
    if (ys.length) s += `<div class="sec"><h3>По годам <small>выручка / прибыль</small></h3><table class="tbl">${ys.map((y) => `<tr><td>${y} · ${nw(years[y].stores, 'точка', 'точки', 'точек')}</td><td>${fm(years[y].rev)} / <span class="${years[y].profit >= 0 ? 'pos' : 'negc'}">${fm(years[y].profit)}</span></td></tr>`).join('')}</table></div>`;
    return s;
  }

  /* ---------- ЖУРНАЛ ---------- */
  function journal(S, ui) {
    const f = ui.logFilter || 'all';
    let s = `<div class="row sp"><span class="hint">${S.log.length === 1 ? 'Последняя запись' : `Последние ${nw(S.log.length, 'запись', 'записи', 'записей')}`}</span><div class="seg">${[['all', 'Все'], ['good', 'Хорошие'], ['bad', 'Плохие']].map(([k, l]) => `<button data-act="logFilter" data-arg="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div></div><div>`;
    for (const l of S.log) {
      if (f === 'good' && l.kind !== 'good') continue;
      if (f === 'bad' && l.kind !== 'bad' && l.kind !== 'warn') continue;
      s += `<div class="logitem ${l.kind}"><span class="d">${E().fmtDate(l.day).replace(/ \d{4}$/, '')}<br>${E().dateOf(l.day).y}</span><span class="t">${esc(l.text)}</span></div>`;
    }
    return s + `</div>`;
  }

  BK.Panels = { dash, stores, market, production, menu, team, finance, journal, offerCard, prodOfferCard };
  BK.UIH = { fm, n0, pct, esc, dname, lname, btn, kv, meter, stars, km, plural, nw };
})();
