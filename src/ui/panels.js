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
  const km = (a, b) => (E().dist(a, b) * E().kmPerUnit()).toFixed(1).replace('.', ',');
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

  /* ---------- тренды, мини-графики, цель (HUD и «Сводка») ---------- */
  const MON3 = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']; // «к янв.», «к мая»
  const MONL = ['янв.', 'фев.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']; // подпись «Выручка, фев.»
  const MONS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  // проценты «3,9 %» (со знаком — если sign)
  const pctS = (v, sign) => { const a = Math.abs(v * 100); return (sign && v < 0 ? '−' : '') + (a >= 10 ? a.toFixed(0) : a.toFixed(1)).replace('.', ',') + ' %'; };
  // изменение к прошлому значению: ▲ 3,9 % / ▼ 1,2 млн ₽ (если база ≤ 0 — в деньгах)
  function delta(cur, prev, tail, o) {
    if (cur == null || prev == null) return '';
    o = o || {};
    let up, txt;
    if (prev > 0 && cur >= 0 && !o.money && cur / prev < 10) { const r = cur / prev - 1; up = r >= 0; txt = pctS(r); } else { const d = cur - prev; up = d >= 0; txt = fm(Math.abs(d)); }
    return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${txt}${tail ? `<span class="dt"> ${tail}</span>` : ''}</span>`;
  }
  // мини-график: линия, последняя точка — акцентом; пунктир нуля, если ряд пересекает ноль
  function spark(vals, w, h) {
    vals = vals.filter((v) => Number.isFinite(v));
    if (vals.length < 2) return '';
    const min = Math.min(...vals), max = Math.max(...vals), pad = 2.5;
    const X = (i) => pad + (i * (w - pad * 2)) / (vals.length - 1), Y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
    const li = vals.length - 1;
    const zero = min < 0 && max > 0 ? `<line x1="0" x2="${w}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--bad)" stroke-width="1" stroke-dasharray="2 2" opacity=".6"/>` : '';
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${zero}<path d="${d}" fill="none" stroke="var(--ink-3)" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/><circle cx="${X(li).toFixed(1)}" cy="${Y(vals[li]).toFixed(1)}" r="2.4" fill="var(--crust)"/></svg>`;
  }
  // «≈ 8 мес.», «≈ 1,9 года», «≈ 12 лет»
  function etaStr(months) {
    if (months < 12) return `≈ ${months} мес.`;
    const y = months / 12, r = y >= 10 ? Math.round(y) : Math.round(y * 10) / 10;
    return '≈ ' + (Number.isInteger(r) ? nw(r, 'год', 'года', 'лет') : String(r).replace('.', ',') + ' года');
  }
  /* Прогресс к цели: оборот за 12 мес., прирост за месяц и оценка срока при текущем темпе.
     Темп — рост средней выручки за 3 мес. к такой же год назад (сезонность сокращается), в первые годы — за полгода.
     Дальше выручка продлевается этим темпом, пока скользящая сумма 12 месяцев не дойдёт до цели. */
  function goalInfo(S) {
    const T = C().WIN_ANNUAL_REVENUE, h = S.history, n = h.length;
    const rolling = E().rolling12(S);
    const sum = (a) => a.reduce((x, y) => x + y.rev, 0);
    const gain = n >= 2 ? rolling - sum(h.slice(-13, -1)) : null;
    const p = Math.min(1, rolling / T);
    let eta = null, why = '';
    if (S.won || rolling >= T) eta = 0;
    else if (n < 6) why = 'оценка срока — после полугода работы';
    else {
      const span = n >= 15 ? 12 : n >= 9 ? 6 : 3;
      const now = sum(h.slice(-3)) / 3, then = sum(h.slice(-3 - span, n - span)) / 3;
      let g = then > 0 && now > 0 ? Math.pow(now / then, 1 / span) - 1 : 0;
      g = Math.max(-0.03, Math.min(0.06, g));
      const win = h.slice(-12).map((x) => x.rev);
      let s = win.reduce((a, b) => a + b, 0), base = now;
      for (let k = 1; k <= 600; k++) {
        base *= 1 + g; win.push(base); s += base;
        if (win.length > 12) s -= win.shift();
        if (s >= T) { eta = k; break; }
      }
      if (eta == null) why = 'выручка не растёт — оценки срока нет';
    }
    const pctTxt = p > 0 && p < 0.001 ? '< 0,1\u00a0%' : p >= 0.1 || p === 0 ? Math.floor(p * 100) + ' %' : (Math.floor(p * 1000) / 10).toFixed(1).replace('.', ',') + ' %';
    return { rolling, p, pctTxt, left: Math.max(0, T - rolling), gain, eta, etaShort: eta ? etaStr(eta) : '', etaLong: S.won || eta === 0 ? 'цель взята' : eta ? `${etaStr(eta)} при текущем росте` : why };
  }
  // полоса прогресса к цели (один цвет — амбер) с отметками 1 / 2,5 / 4 млрд
  const GOAL_MS = [0.2, 0.5, 0.8];
  const goalBar = (p) => `<div class="gbar"><i style="width:${(Math.min(1, p) * 100).toFixed(1)}%"></i>${GOAL_MS.map((m) => `<span class="ms${p >= m ? ' done' : ''}" style="left:${m * 100}%"></span>`).join('')}</div>`;
  // настроение продавцов сети
  function moodCounts(S) {
    let happy = 0, mid = 0, sad = 0;
    for (const st of S.stores) for (const e of st.staff) { const k = BK.moodKind(e.mood); if (k === 'happy') happy++; else if (k === 'mid') mid++; else sad++; }
    return { happy, mid, sad, total: happy + mid + sad };
  }
  const ICO = {
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 13.9c2.4.2 4 1.7 4.5 4.6"/></svg>',
    rub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20V4h5.5a4 4 0 0 1 0 8H6M6 16h8"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>',
    factory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 20V11l5-3v3l5-3v3l5-3V4h3v16z"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 20v-5h4v5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    chef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13c0-4 3.6-7 8-7s8 3 8 7v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 9.5l1 3M13 9l.5 3M16.5 10l-.5 2.5"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></svg>',
  };

  /* ---------- «Требует внимания»: что игроку нужно решить сейчас (собирается из состояния, не из тостов) ---------- */
  function quitReason(S, e, st) {
    const g = (m, f) => BK.byGender(e.name, m, f);
    if (e.fatigue > 50) return g('устал', 'устала') + ' от переработок';
    if (S.pay.seller < S.market.seller * 0.99) return 'зарплата ниже рынка';
    if (st.staff.length < st.staffTarget) return 'не хватает коллег';
    return 'низкий настрой в команде';
  }
  const nums = (list, k = 3) => list.slice(0, k).map((x) => '№' + x.num).join(', ') + (list.length > k ? '…' : '');
  // «Требует внимания» считается не чаще раза в игровой день или при изменении того, на что влияют действия игрока
  let attMemo = null;
  function attention(S) {
    let inc = 0; for (const st of S.stores) inc += st.staff.length * 7 + st.incoming.length + st.staffTarget * 3 + (st.status === 'open' ? 1 : 0);
    const key = [S.day, S.stores.length, inc, Math.round(S.cash / 1e4), Math.round(S.reserve / 1e4), S.loan, !!S.chef.pending, S.office.hr, S.office.academy, S.pay.seller, S.prodOffers.length, S.productions.length, S.phase, S.cache ? S.cache.capUse : 0].join('|');
    if (attMemo && attMemo.S === S && attMemo.key === key) return attMemo.r;
    const r = attentionCalc(S);
    attMemo = { S, key, r };
    return r;
  }
  function attentionCalc(S) {
    const cfg = C(), E_ = E(), items = [];
    const counts = { dash: 0, team: 0, stores: 0, prod: 0, fin: 0, menu: 0, market: 0 };
    if (S.phase !== 'play') return { items, counts };
    const add = (o) => items.push(o);
    const H = S.history, lastM = H[H.length - 1];
    // деньги
    if (S.cash < 0) {
      counts.fin++;
      add({ lvl: 'bad', ic: 'rub', t: S.negMonths > 0 ? `Кассовый разрыв ${S.negMonths}-й месяц` : 'Кассовый разрыв', d: `На счёте ${fm(S.cash)}, резерв пуст. ${S.negMonths > 0 ? `Если и на ${cfg.BANKRUPT_MONTHS}-й расчёт счёт в минусе — банкротство.` : 'Возьмите кредит или отложите покупки.'}`, b: { act: 'tab', arg: 'fin', label: 'Кредит', primary: true } });
    } else if (S.stores.length) {
      const f = billsForecast(S);
      if (f.cashAt1 + S.reserve < 0) { counts.fin++; add({ lvl: S.negMonths > 0 ? 'bad' : 'warn', ic: 'rub', t: `К 1-му числу не хватит ≈ ${fm(-(f.cashAt1 + S.reserve))}`, d: `Через ${nw(f.left + 1, 'день', 'дня', 'дней')} спишутся аренда, зарплаты и налоги ≈ ${fm(f.bills)}.`, b: { act: 'tab', arg: 'fin', label: 'Финансы' } }); }
      // гасить — когда сеть уже работает 3+ месяца и ничего не открывается (иначе совет «погасить» приходит в первые недели,
      // пока расходы ещё не начались, и новичок остаётся без денег к первым зарплатам)
      else if (S.loan > 0 && S.cash > S.loan + f.bills * 1.5 && S.history.length >= 3 && !S.stores.some((s) => s.status === 'opening')) add({ lvl: 'info', ic: 'bank', t: `Кредит ${fm(S.loan)} можно погасить`, d: `Денег хватает; проценты ≈ ${fm(S.loan * (S.macro.keyRate + cfg.LOAN_SPREAD) / 12)} в месяц.`, b: { act: 'repay', arg: 1e15, label: 'Погасить' } });
    }
    // штат: вакансии, перегруз, кто может уволиться
    const vac = [], risk = [], tired = []; let vacN = 0, tiredN = 0;
    for (const st of S.stores) {
      if (st.status === 'opening') continue;
      const v = E_.vacancies(st); if (v) { vac.push(st); vacN += v; }
      let t = 0;
      for (const e of st.staff) {
        if (e.fatigue > 55) t++;
        if (e.mood < cfg.MOOD_UNHAPPY && e.unhappy >= (cfg.UNHAPPY_WARN_AFTER || 5)) risk.push({ e, st, left: Math.max(1, cfg.UNHAPPY_QUIT_DAYS + (e.patience || 0) - e.unhappy) });
      }
      if (t) { tiredN += t; if (!v && t * 2 >= st.staff.length) tired.push(st); }
    }
    const staffStores = new Set(vac.map((s) => s.id).concat(risk.map((r) => r.st.id)));
    counts.team = staffStores.size;
    if (vac.length) {
      vac.sort((a, b) => E_.vacancies(b) - E_.vacancies(a));
      const crit = vac.some((st) => st.staff.length * 2 < st.staffTarget);
      const lim = E_.ownerHireLeft(S) === 0 ? ' · лимит найма на неделю исчерпан — нужен HR' : '';
      add({ lvl: crit ? 'bad' : 'warn', ic: 'team', t: vac.length === 1 ? `Нехватка штата на точке №${vac[0].num}` : `Нехватка штата на ${vac.length} точках`, d: `${vac.length > 1 ? nums(vac) + ' · ' : ''}не хватает ${nw(vacN, 'человека', 'человек', 'человек')}${tiredN ? ` · ${tiredN} чел. устали` : ''}${lim}`, b: { act: 'pickCand', arg: vac[0].id, label: `Нанять ${vacN}`, primary: true } });
    }
    if (risk.length) {
      risk.sort((a, b) => a.left - b.left);
      const r0 = risk[0], st = new Set(risk.map((r) => r.st.id)).size;
      add({ lvl: r0.left <= 7 ? 'bad' : 'warn', ic: 'alert', t: risk.length === 1 ? `Может уволиться через ${r0.left} дн.` : `${risk.length} чел. могут уволиться`, d: risk.length === 1 ? `${esc(r0.e.name)}, №${r0.st.num} · ${quitReason(S, r0.e, r0.st)}` : `Ближайший — через ${r0.left} дн.: ${esc(r0.e.name)}, №${r0.st.num} · ${quitReason(S, r0.e, r0.st)}${st > 1 ? ` · точек: ${st}` : ''}`, b: { act: 'openStore', arg: r0.st.id, label: 'Открыть' } });
    }
    if (tired.length) { add({ lvl: 'warn', ic: 'team', t: tired.length === 1 ? `Команда №${tired[0].num} перегружена` : `Перегружены команды на ${tired.length} точках`, d: `${tired.length > 1 ? nums(tired) + ' · ' : ''}гостей больше, чем успевают обслужить: добавьте людей в штат или обучите`, b: { act: 'openStore', arg: tired[0].id, label: 'Открыть' } }); }
    // точки в убытке 2+ месяца подряд
    const loss = S.stores.filter((st) => st.status !== 'opening' && st.last && (st.lossStreak || 0) >= 2).sort((a, b) => a.last.profit - b.last.profit);
    if (loss.length) {
      counts.stores += loss.length;
      const w = loss[0], mon = lastM ? ' за ' + E_.MONTHS[lastM.m] : ' за месяц';
      add({ lvl: 'bad', ic: 'rub', t: loss.length === 1 ? `Точка №${w.num} в убытке ${w.lossStreak}-й месяц` : `${loss.length} ${plural(loss.length, 'точка', 'точки', 'точек')} в убытке 2+ месяца`, d: loss.length === 1 ? `${dname(w.district)}, ${esc(w.address)} · ${fm(w.last.profit)}${mon}` : `${nums(loss)} · худшая №${w.num}: ${fm(w.last.profit)}${mon}`, b: { act: 'openStore', arg: w.id, label: 'Открыть' } });
    }
    // производство
    const cu = S.cache ? S.cache.capUse : 0;
    if (cu > 0.9 && S.productions.length) {
      counts.prod = 1;
      const open = S.stores.filter((s) => s.status === 'open').length || 1, cap = S.cache.cap || 0, units = S.cache.units || 0;
      const more = Math.floor((cap - units) / (units / open || 1));
      const one = S.productions.length === 1;
      add({ lvl: cu > 1 ? 'bad' : 'warn', ic: 'factory', t: cu > 1 ? `${one ? 'Цех не справляется' : 'Цеха не справляются'}: спрос ${pctS(cu)}` : `${one ? 'Цех загружен' : 'Цеха загружены'} на ${pctS(cu)}`, d: cu > 1 ? 'Продажи теряются — купите оборудование или откройте ещё цех.' : more >= 1 ? `Ещё ${nw(more, 'точка', 'точки', 'точек')} — и выпечки не хватит` : 'Ещё одна точка — и выпечки не хватит', b: { act: 'tab', arg: 'prod', label: 'Оборудование' } });
    }
    // меню, офис, зарплаты, рынок
    if (S.chef.pending) { counts.menu = 1; add({ lvl: 'warn', ic: 'chef', t: 'Шеф-пекарь ждёт решения', d: `5 новинок: добавьте до ${cfg.CHEF_PICK} и выведите до ${cfg.CHEF_REMOVE}.`, b: { act: 'chef', label: 'Выбрать', primary: true } }); }
    if (!S.office.hr && S.stores.length > cfg.HR_REQUIRED_STORES) add({ lvl: 'warn', ic: 'team', t: 'Нужен HR-отдел', d: `Без HR — не больше ${nw(cfg.OWNER_HIRES_PER_WEEK, 'найма', 'наймов', 'наймов')} в неделю, поиск дольше.`, b: { act: 'tab', arg: 'team', label: 'Команда' } });
    if (!S.office.academy && S.stores.length > cfg.TRAIN_REQUIRED_STORES) add({ lvl: 'warn', ic: 'team', t: 'Нужен отдел обучения', d: `Вручную — не больше ${nw(cfg.OWNER_TRAINS_PER_WEEK, 'обучения', 'обучений', 'обучений')} в неделю.`, b: { act: 'tab', arg: 'team', label: 'Команда' } });
    if (S.pay.seller < S.market.seller * 0.97) add({ lvl: 'warn', ic: 'rub', t: 'Зарплаты ниже рынка', d: `Рынок платит ${fm(S.market.seller)}, вы — ${fm(S.pay.seller)}: растёт текучка.`, b: { act: 'tab', arg: 'team', label: 'Зарплаты' } });
    if (S.prodOffers.length && S.productions.length) { counts.market = 1; add({ lvl: 'info', ic: 'factory', t: 'Можно открыть ещё один цех', d: 'Ближе к точкам — дешевле доставка и больше мощности.', b: { act: 'tab', arg: 'market', label: 'Рынок' } }); }
    // ближайший праздник (≤ 7 дней)
    if (E_.upcomingHolidays) for (const h of E_.upcomingHolidays(S, 3)) {
      if (h.active || h.inDays > 7) continue;
      add({ lvl: 'info', ic: 'cal', t: h.inDays === 0 ? `${esc(h.name)} — сегодня` : `${esc(h.name)} через ${nw(h.inDays, 'день', 'дня', 'дней')}`, d: esc(h.effect) });
      break;
    }
    if (BK.TrainersUI) for (const x of BK.TrainersUI.attItems(S)) add(x); // личные тренеры: подсказки навыков (лампочка)
    if (BK.ManagersUI) for (const x of BK.ManagersUI.attItems(S)) add(x); // управляющие: можно нанять / точки без присмотра
    if (BK.GrowthUI) for (const x of BK.GrowthUI.attItems(S)) add(x); // рост вглубь: заказы, контракты, франчайзи, фабрика
    if (BK.LivelyUI) for (const x of BK.LivelyUI.attItems(S)) add(x); // живость: веха подходит к сроку
    if (BK.Coll && BK.Coll.attItems) for (const x of BK.Coll.attItems(S)) add(x); // залог: платёж 1-го числа и просрочка
    if (BK.Inv && BK.Inv.attItems) for (const x of BK.Inv.attItems(S)) add(x); // инвесторы: ждёт ответа / много уходит партнёрам
      if (BK.Story && BK.Story.attItems) for (const x of BK.Story.attItems(S)) add(x); // сюжет: ждёт решения
      if (BK.Strat && BK.Strat.attItems) for (const x of BK.Strat.attItems(S)) add(x); // стратегия сложилась сама
      if (BK.Threads && BK.Threads.attItems) for (const x of BK.Threads.attItems(S)) add(x); // нити истории: «вас помнит инспектор» — открытие в городе дольше
      if (BK.ScenarioUI && BK.ScenarioUI.attItems) for (const x of BK.ScenarioUI.attItems(S)) add(x); // истории: срок вышел, цель не выполнена — игра идёт дальше
    const ord = { bad: 0, warn: 1, info: 2 };
    items.sort((a, b) => ord[a.lvl] - ord[b.lvl]);
    counts.dash = items.filter((x) => x.lvl === 'bad').length;
    return { items, counts };
  }
  BK.attention = attention;
  BK.billsForecast = (S) => billsForecast(S); // обучение новичка и sim/newbie.js
  const attRow = (a) => `<div class="it"><span class="ic ${a.lvl}${a.trn ? ' trn' : ''}">${a.icHtml || ICO[a.ic] || ICO.alert}</span><div class="tx"><div class="tt">${a.t}${a.lvl === 'bad' ? '<span class="new" aria-hidden="true"></span>' : ''}</div><div class="ds">${a.d}</div></div>${a.b ? `<button class="btn${a.b.primary ? ' primary' : ''}" data-act="${a.b.act}"${a.b.arg != null ? ` data-arg="${esc(a.b.arg)}"` : ''}>${a.b.label}</button>` : ''}</div>`;

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

  /* ---------- рейтинг точки на картах ---------- */
  const r1 = (v) => v.toFixed(1).replace('.', ',');
  const RPARTS = [['train', 'Обучение персонала', 'обучите команду'], ['repair', 'Ремонт', 'сделайте следующую ступень ремонта'], ['mood', 'Настроение команды', 'поднимите настроение: зарплата, премии, культура'], ['staff', 'Укомплектованность', 'наберите полный штат'], ['fresh', 'Свежесть выпечки', 'поставьте «Сколько печь» ближе к норме (вкладка «Цех»)']];
  function ratingInfo(S, st) {
    const E_ = E(), cfg = C();
    const r = E_.storeRating(S, st), p = E_.ratingParts(S, st), pen = E_.discPenalty(S);
    const weak = RPARTS.filter(([k]) => p[k] < 4.6).sort((a, b) => cfg.RATING_W[b[0]] * (5 - p[b[0]]) - cfg.RATING_W[a[0]] * (5 - p[a[0]])).slice(0, 2);
    const eff = E_.ratingMult(S, st) - 1;
    const tip = `Рейтинг на картах ${r1(r)} из 5. Складывается из: ${RPARTS.map(([k, l]) => `${l.toLowerCase()} ${r1(p[k])}`).join(', ')}${pen ? `; штраф за частую смену вечерней скидки −${r1(pen)}` : ''}. Меняется плавно, за 1–2 месяца. ${weak.length ? 'Поднимут рейтинг: ' + weak.map((w) => w[2]).join('; ') + '.' : 'Все составляющие на высоте.'} Новых гостей: ${eff >= 0 ? '+' : '−'}${Math.abs(Math.round(eff * 100))}%.`;
    return { r, p, pen, weak, eff, tip };
  }
  const rstars = (r) => `<span class="rstars" style="--r:${Math.round(r / 5 * 100)}%" aria-hidden="true"></span>`;
  const ratingChip = (S, st) => { const i = ratingInfo(S, st); return `<span class="chip rating" title="${esc(i.tip)}">${rstars(i.r)}<b>${r1(i.r)}</b></span>`; };
  function ratingSection(S, st) {
    const i = ratingInfo(S, st);
    let s = `<div class="sec"><h3>Рейтинг на картах <small>${rstars(i.r)} ${r1(i.r)} из 5</small></h3><div class="grid2">`;
    for (const [k, l] of RPARTS) s += kv(l, `${r1(i.p[k])}${meter(i.p[k] / 5, i.p[k] >= 4.3 ? 'ok' : i.p[k] >= 3.5 ? 'warm' : 'hot')}`);
    s += `</div>${i.pen ? `<div class="hint warnc">Гости раздражены частой сменой вечерней скидки: −${r1(i.pen)}★ до ${E().fmtDate(E().wasteState(S).penUntil)}.</div>` : ''}
      <div class="hint">Отзывы гостей на картах: рейтинг меняется плавно, за 1–2 месяца. Сейчас он даёт ${i.eff >= 0 ? '+' : '−'}${Math.abs(Math.round(i.eff * 100))}% новых гостей (3★ — −10%, 5★ — +5%). ${i.weak.length ? 'Поднимут рейтинг: ' + i.weak.map((w) => w[2]).join('; ') + '.' : 'Все составляющие на высоте.'}</div></div>`;
    return s;
  }

  /* ---------- выпечка и списания (вкладка «Цех») ---------- */
  function wastePanel(S) {
    const cfg = C(), E_ = E(), W = E_.wasteState(S);
    const L = cfg.BAKE_LEVELS[W.bake + 3];
    const last = S.history[S.history.length - 1], lp = last && last.pnl;
    const wz = E_.wasteFactors(S, E_.menuStats(S));
    const free = E_.discFreeDay(S), cool = S.day < free, pen = E_.discPenalty(S);
    let s = `<div class="sec" id="waste"><h3>Выпечка и списания <small>на всю сеть</small></h3>
      <p class="hint" style="margin:0">Непроданная к закрытию выпечка списывается — вы теряете её себестоимость. Печь меньше — списаний меньше, но к вечеру полки пустеют и часть гостей уходит без покупки. Печь больше — полки полные, но и выбрасывать приходится больше.</p>
      <div class="field bake"><label for="bakeLvl">Сколько печь — <b>${L.name}</b></label>
        <input type="range" id="bakeLvl" min="-3" max="3" step="1" value="${W.bake}" data-inp="bake" aria-valuetext="${esc(L.name)}">
        <div class="bake-scale" aria-hidden="true"><span>Сильный дефицит</span><span>Норма</span><span>Сильный перерасход</span></div></div>
      ${wasteSummary(S, lp)}
      <div class="field"><span class="flabel">Вечерняя скидка <span class="hint">— за 2 часа до закрытия</span></span>
        <div class="seg disc" role="group" aria-label="Вечерняя скидка">${cfg.EVE_DISCOUNTS.map((d, i) => `<button data-act="eveDisc" data-arg="${i}" aria-pressed="${W.disc === i}">${d ? pct(d) : 'Выкл'}</button>`).join('')}</div>
        <span class="hint">Больше скидка — меньше списаний, но часть гостей ждёт вечера и платит меньше. Гости не любят, когда условия часто меняются: меняйте не чаще раза в ${Math.round(cfg.DISC_CHANGE_DAYS / 30)} месяца.</span></div>`;
    if (pen) s += `<div class="alert warn"><div><div class="a-t">Частая смена скидки раздражает гостей</div><div>Рейтинг всех точек −${r1(cfg.DISC_PENALTY_RATING)}★ до ${E_.fmtDate(W.penUntil)}. Без штрафа менять можно с ${E_.fmtDate(free)}.</div></div></div>`;
    else if (cool) s += `<div class="alert warn"><div><div class="a-t">Частая смена скидки раздражает гостей</div><div>Если сменить скидку сейчас — рейтинг точек −${r1(cfg.DISC_PENALTY_RATING)}★ на месяц. Без штрафа можно с ${E_.fmtDate(free)}.</div></div></div>`;
    const erpN = S.productions.filter((p) => p.equip.erp).length;
    s += `<div class="hint">Меню ${nw(S.menu.length, 'позиция', 'позиции', 'позиций')}: ${wz.menuF > 1.001 ? `списания +${Math.round((wz.menuF - 1) * 100)}% (шире меню — больше остатков)` : wz.menuF < 0.999 ? `списания −${Math.round((1 - wz.menuF) * 100)}% (узкое меню)` : 'списания как обычно'}. ${erpN ? `ERP-планирование: остатков меньше на ${Math.round(cfg.WASTE_ERP_CUT * wz.erp * 100)}%.` : `ERP-планирование в цехе снизит остатки на ${Math.round(cfg.WASTE_ERP_CUT * 100)}%.`}</div></div>`;
    return s;
  }

  /* Итог прошлого месяца по выпечке. Списания — по себестоимости, упущенные продажи — по цене продажи (выручка);
     чтобы их можно было сравнить, упущенная выручка пересчитывается в прибыль: минус себестоимость и налог с выручки
     (аренда и зарплаты от лишних продаж не растут). */
  function wasteSummary(S, lp) {
    if (!lp || lp.waste == null) return `<div class="wastesum"><span class="hint">Итог по списаниям появится после первого месяца работы.</span></div>`;
    const lost = lp.lostBake || 0;
    const fcShare = lp.rev > 0 ? Math.max(0, Math.min(0.9, (lp.fc - lp.waste) / lp.rev)) : 0.35;
    const margin = Math.max(0, 1 - fcShare - E().currentTaxRate(S));
    const lostProfit = lost * margin;
    // соседние деления ползунка: сколько изменятся списания и недополученная прибыль (по таблице BAKE_LEVELS)
    const cfg = C(), i = E().wasteState(S).bake + 3, L = cfg.BAKE_LEVELS[i], D = L.lost > 0 ? lost / L.lost : 0;
    const step = (j) => { const M = cfg.BAKE_LEVELS[j]; if (!M) return null; return { name: M.name, net: -D * (M.lost - L.lost) * margin - lp.waste * (M.waste / L.waste - 1) }; };
    const best = [step(i - 1), step(i + 1)].filter(Boolean).sort((a, b) => b.net - a.net)[0];
    const worse = best && best.net > Math.max(1e4, lp.rev * 0.001) ? `Оценка: на делении «${best.name}» осталось бы ≈ <b>+${fm(best.net)}</b> в месяц (без учёта рейтинга свежести).` : 'По деньгам текущий уровень близок к лучшему.';
    return `<div class="wastesum"><div class="ws-h">Прошлый месяц</div>
      <div class="ws-r"><span>Списано <small>себестоимость выброшенной выпечки</small></span><b>${fm(lp.waste)}</b></div>
      <div class="ws-r"><span>Упущено продаж <small>выручка по цене продажи: к вечеру не хватило выпечки</small></span><b>~${fm(lost)}</b></div>
      <div class="ws-r"><span>…это недополученная прибыль <small>выручка минус себестоимость и налог</small></span><b>≈ ${fm(lostProfit)}</b></div>
      <div class="hint">Сравнивайте списания с недополученной <b>прибылью</b>, а не с выручкой. ${lost > 0 || lp.waste > 0 ? worse : ''}</div></div>`;
  }

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
    bills += S.loan * E().loanRate(S) / 12;
    if (BK.Trainers) bills += BK.Trainers.monthFee(S); // личные тренеры — 1-го числа
    if (BK.Managers) bills += BK.Managers.monthFee(S); // оклады управляющих — 1-го числа
    if (BK.Growth) bills += BK.Growth.monthFee(S); // рост вглубь: фабрика, флагман, команда кейтеринга, контроль франчайзи
    if (BK.Coll) bills += BK.Coll.dueNow(S); // залог: платёж по кредиту под точку — 1-го числа
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
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) { s += `<line class="grid" x1="${pl}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.abs(v) < 1e-6 ? '0' : fm(v).replace(/\s₽/, '').replace(/,0(?=\s)/, '')}</text>`; }
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
    if (p.gRev) s += row('в т. ч. фабрика, полки, франшиза, флагман, заказы', fm(p.gRev), 'subr');
    s += row('Себестоимость (фудкост)', '−' + fm(p.fc - (p.waste || 0)));
    if (p.waste != null) s += row('Списания', '−' + fm(p.waste));
    s += row('Аренда', '−' + fm(p.rent));
    s += row('ФОТ (зарплаты и взносы)', '−' + fm(p.payroll));
    if (p.delivery != null) s += row('Доставка', '−' + fm(p.delivery));
    if (p.agg) s += row(p.aggRev ? `Агрегаторы доставки <small>(выручка доставки ${fm(p.aggRev)})</small>` : 'Агрегаторы доставки', '−' + fm(p.agg));
    s += row('Коммунальные платежи', '−' + fm(p.util));
    if (full) {
      s += row('Офис, HR, культура, управление', '−' + fm(p.upkeep || 0));
      s += row('Найм и обучение', '−' + fm((p.hire || 0) + (p.train || 0)));
      s += row('Налоги', '−' + fm(p.tax || 0));
      if (p.interest) s += row('Проценты по кредиту', '−' + fm(p.interest));
      if (p.inv) s += row('Партнёрам (инвесторы)', '−' + fm(p.inv));
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
    if (full && p.lostBake != null) s += `<div class="kv lostrow" title="Гости, которым к вечеру не хватило выпечки. Это не расход, а недополученная выручка — в прибыль не входит."><span>Упущенные продажи — выручка (оценка)</span><span>~${fm(p.lostBake)}</span></div>`;
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
  // Выручка и прибыль за 12 месяцев: выручка — столбец, прибыль — его нижняя часть (убыток — вниз от нуля), прошлый месяц — акцентом
  function revChart12(S) {
    const h = S.history.slice(-12);
    if (!h.length) return `<div class="empty">График появится после первого месяца работы.</div>`;
    const N = 12, W = 404, H = 112, top = 16, bot = 16;
    const max = Math.max(1, ...h.map((x) => x.rev));
    const minP = Math.min(0, ...h.map((x) => x.profit));
    const negShare = minP < 0 ? Math.min(0.4, -minP / max) : 0;
    const zeroY = top + (H - top - bot) / (1 + negShare);
    const k = (zeroY - top) / max, floorY = H - bot;
    const slot = W / N, bw = Math.min(24, slot * 0.7), off = N - h.length;
    const li = h.length - 1;
    let s = `<svg class="chart12" viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка и прибыль за ${nw(h.length, 'месяц', 'месяца', 'месяцев')}">`;
    h.forEach((x, i) => {
      const cx = (off + i) * slot + slot / 2, x0 = (cx - bw / 2).toFixed(1), cur = i === li;
      const rh = Math.max(0, x.rev) * k, ph = x.profit >= 0 ? Math.min(rh, x.profit * k) : Math.min(floorY - zeroY, -x.profit * k);
      s += `<g><title>${E().MONTHS[x.m]} ${x.y}: выручка ${fm(x.rev)}, ${x.profit >= 0 ? 'прибыль' : 'убыток'} ${fm(Math.abs(x.profit))}</title>`;
      s += `<rect class="rv${cur ? ' cur' : ''}" x="${x0}" y="${(zeroY - rh).toFixed(1)}" width="${bw.toFixed(1)}" height="${rh.toFixed(1)}" rx="3"/>`;
      if (ph > 0.3) s += x.profit >= 0 ? `<rect class="pf${cur ? ' cur' : ''}" x="${x0}" y="${(zeroY - ph).toFixed(1)}" width="${bw.toFixed(1)}" height="${ph.toFixed(1)}" rx="2"/>` : `<rect class="ls${cur ? ' cur' : ''}" x="${x0}" y="${zeroY.toFixed(1)}" width="${bw.toFixed(1)}" height="${ph.toFixed(1)}" rx="2"/>`;
      if ((li - i) % 3 === 0) s += `<text x="${cx.toFixed(1)}" y="${H - 3}" text-anchor="middle"${cur ? ' class="curm"' : ''}>${MONS[x.m]}</text>`;
      s += `</g>`;
    });
    if (negShare) s += `<line class="zero" x1="0" x2="${W}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}"/>`;
    const lx = (off + li) * slot + slot / 2 + bw / 2;
    s += `<text class="lastv" x="${lx.toFixed(1)}" y="${(zeroY - Math.max(0, h[li].rev) * k - 5).toFixed(1)}" text-anchor="end">${fm(h[li].rev).replace(/\u00a0₽$/, '')}</text>`;
    s += `</svg><div class="legend"><span><i class="lg-rv"></i>Выручка</span><span><i class="lg-pf"></i>Из неё прибыль</span>${minP < 0 ? '<span><i class="lg-ls"></i>Убыток</span>' : ''}</div>`;
    return s;
  }
  function goalCard(S) {
    const g = goalInfo(S), T = C().WIN_ANNUAL_REVENUE, r = g.rolling;
    const big = r >= 1e9 ? (r / 1e9).toFixed(2).replace('.', ',') : r >= 1e6 ? (r / 1e6).toFixed(r >= 1e8 ? 0 : 1).replace('.', ',') + '\u00a0млн' : fm(r).replace(/\u00a0₽$/, '');
    return `<div class="goalcard${S.won ? ' won' : ''}">
      <div class="top"><span class="caps">Цель · оборот за 12 мес.</span>${g.gain != null ? `<span class="gd">${g.gain >= 0 ? '▲' : '▼'}\u00a0${fm(Math.abs(g.gain))} за месяц</span>` : ''}</div>
      <div class="big">${big} <span>из ${fm(T).replace(/,00/, '')}</span><em>${g.pctTxt}</em></div>
      ${goalBar(g.p)}
      <div class="ticks" aria-hidden="true"><span style="left:20%">1</span><span style="left:50%">2,5</span><span style="left:80%">4 млрд</span></div>
      <div class="foot"><span>${S.won ? `Взята за ${etaStr(Math.max(1, Math.round((S.wonDay || S.day) / 30.4))).replace('≈ ', '')}` : `Осталось <b class="num">${fm(g.left)}</b>`}</span><span>${g.etaLong}</span></div></div>`;
  }
  function dash(S, ui) {
    const E_ = E();
    if (S.phase === 'setup_prod' || S.phase === 'setup_store') return setupPanel(S, ui);
    const cs = E_.citySetup && E_.citySetup(S);
    if (cs) return citySetupPanel(S, ui, cs);
    const h = S.history, last = h[h.length - 1], prev = h[h.length - 2];
    const open = S.stores.filter((s) => s.status !== 'opening').length, soon = S.stores.length - open;
    const mc = moodCounts(S);
    const to = prev ? 'к ' + MON3[prev.m] : '';
    const revs = h.slice(-12).map((x) => x.rev), profs = h.slice(-12).map((x) => x.profit);
    let s = BK.Russia ? BK.Russia.dashStrip(S) : '';
    s += goalCard(S);
    s += `<div class="dkpis">
      <div class="dkpi"><div class="lab">${last ? 'Выручка за ' + E_.MONTHS[last.m] : 'Выручка с 1-го числа'}</div><div class="v">${fm(last ? last.rev : S.month.rev)}</div>
        <div class="row2">${last && prev ? delta(last.rev, prev.rev, to) : `<span class="delta muted">${last ? 'первый месяц' : 'идёт первый месяц'}</span>`}${spark(revs, 64, 20)}</div>
        ${last ? `<div class="sub">с 1-го числа: <span class="num">${fm(S.month.rev)}</span></div>` : ''}</div>
      <div class="dkpi"><div class="lab">Прибыль${last && last.rev ? ' · маржа ' + pctS(last.profit / last.rev, true) : ''}</div><div class="v${last && last.profit < 0 ? ' negc' : ''}">${last ? fm(last.profit) : '—'}</div>
        <div class="row2">${last && prev ? delta(last.profit, prev.profit, to) : `<span class="delta muted">${last ? 'первый месяц' : 'после 1-го числа'}</span>`}${spark(profs, 64, 20)}</div>
        ${last ? `<div class="sub">за год: <span class="num">${fm(h.slice(-12).reduce((a, x) => a + x.profit, 0))}</span></div>` : ''}</div>
    </div>`;
    s += `<div class="strip"><span>Точки <b>${open}</b>${soon ? ` <span class="delta up" title="открываются">+${soon}</span>` : ''}</span><span class="sep"></span><span>Команда <b>${E_.allStaff(S) + E_.bakersTotal(S)}</b></span><span class="faces" title="Настроение продавцов: довольны / терпят / недовольны">${BK.faceIcon('happy')}${mc.happy} ${BK.faceIcon('mid')}${mc.mid} ${BK.faceIcon('sad')}${mc.sad}</span></div>`;
    s += `<div class="sec"><h3>Выручка и прибыль <small>${h.length >= 12 ? '12 мес.' : nw(h.length, 'месяц', 'месяца', 'месяцев')}</small></h3>${revChart12(S)}</div>`;
    if (BK.LivelyUI) s += BK.LivelyUI.milesBlock(S); // живость: короткая веха (одна за раз)
    if (BK.StoryUI) s += BK.StoryUI.block(S); // сюжет: последнее решение и ожидающая сцена
    if (BK.STORY && BK.STORY.lineHtml) s += BK.STORY.lineHtml(S); // сюжет: реплика героя о самой острой проблеме месяца (одной строкой под «Историей»)
    if (BK.StratUI) s += BK.StratUI.block(S); // стратегии: каким путём вы идёте
    if (BK.ThreadsUI) s += BK.ThreadsUI.dashBlock(S); // нити истории: кто вас помнит, чем это грозит и когда
    if (BK.ManagersUI) s += BK.ManagersUI.inboxBlock(S); // управляющие: предложения «Сделать / Не делать»
    const A = attention(S), items = A.items, MAX = 6;
    const shown = ui.attAll ? items : items.slice(0, MAX);
    s += `<div class="sec att"><h3><span>Требует внимания${items.length ? `<span class="count">${items.length}</span>` : ''}</span>${items.length > MAX ? `<button class="linkbtn" data-act="attAll">${ui.attAll ? 'Свернуть' : `Все ${items.length}`}</button>` : `<button class="linkbtn" data-act="tab" data-arg="log">Журнал →</button>`}</h3>
      ${items.length ? shown.map(attRow).join('') : '<div class="att-ok">Срочных дел нет — сеть работает спокойно.</div>'}</div>`;
    if (BK.LivelyUI) s += BK.LivelyUI.talkBlock(S); // живость: три главные мысли гостей за неделю (рядом с «Требует внимания»)
    if (BK.TrainersUI) s += BK.TrainersUI.dashBlock(S); // личные тренеры
    if (BK.ManagersUI) s += BK.ManagersUI.dashBlock(S); // управляющие точек
    s += holidaysBlock(S).replace('<div class="sec">', '<div class="sec lazy">');
    const nr = E_.networkRating(S), lp = last && last.pnl;
    s += `<div class="dkpis mini">
      <div class="dkpi"><div class="lab">Рейтинг сети на картах</div><div class="v">${nr != null ? `${rstars(nr)} ${r1(nr)}` : '—'}</div><div class="sub">среднее по точкам</div></div>
      <div class="dkpi click" data-act="tab" data-arg="prod"><div class="lab">Списано за месяц</div><div class="v">${lp && lp.waste != null ? fm(lp.waste) : '—'}</div><div class="sub">${lp && lp.waste != null && last.rev ? pctS(lp.waste / last.rev) + ' выручки · «Цех» →' : 'выпечка и списания — «Цех» →'}</div></div>
    </div>`;
    s += `<div class="sec lazy"><h3>Отчёт за прошлый месяц${last ? ` <small>${E_.MONTHS[last.m]} ${last.y}</small>` : ''}</h3>${pnlTable(last && last.pnl, true)}</div>`;
    return s;
  }

  /* ближайшие даты календаря праздников */
  function holidaysBlock(S) {
    const E_ = E(); if (!E_.upcomingHolidays) return '';
    const MG = E_.MONTHS_G;
    const range = (a, b) => { const x = E_.dateOf(a), y = E_.dateOf(b); return a === b ? `${x.d} ${MG[x.m]}` : x.m === y.m ? `${x.d}–${y.d} ${MG[x.m]}` : `${x.d} ${MG[x.m]} — ${y.d} ${MG[y.m]}`; };
    const rows = E_.upcomingHolidays(S, 3).map((h) => {
      const when = h.active ? `идёт<small>ещё ${h.end - S.day + 1} дн.</small>` : h.inDays === 0 ? 'сегодня' : `${h.inDays}<small>${plural(h.inDays, 'день', 'дня', 'дней')}</small>`;
      return `<div class="hol${h.neg ? ' neg' : ''}${h.active ? ' now' : ''}"><div class="when">${when}</div><div class="hb"><div class="ht">${esc(h.name)} <small>${range(h.start, h.end)}</small></div><div class="hd">${esc(h.effect)}</div></div></div>`;
    });
    return rows.length ? `<div class="sec"><h3>Ближайшие даты <small>${!BK.CITY || BK.CITY.id === 'ufa' ? 'календарь Уфы' : esc(BK.CITY.name)}</small></h3>${rows.join('')}</div>` : '';
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

  // запуск нового города (Россия): как старт в Уфе, но время идёт — Уфа и другие города работают на автопилоте
  function citySetupPanel(S, ui, step) {
    const name = esc(BK.CITY ? BK.CITY.name : '');
    let s = BK.Russia ? BK.Russia.dashStrip(S) : '';
    s += `<div class="sec"><h3>${step === 'prod' ? 'Запуск · шаг 1 из 2' : 'Запуск · шаг 2 из 2'} <small>${name}</small></h3>`;
    if (step === 'prod') {
      s += `<p style="margin:0">Новый город начинается с <b>цеха</b>: отсюда выпечка поедет во все точки города. Ближе к центру — дороже аренда, дешевле доставка.</p>`;
      s += `<p class="hint" style="margin:0">Время не стоит: пока вы выбираете, остальные города работают на автопилоте.</p>`;
      s += `</div><div class="sec">${S.prodOffers.map((o) => prodOfferCard(S, o, ui)).join('')}</div>`;
    } else {
      const rc = BK.Corp && BK.Corp.remoteOf && BK.Corp.remoteOf(S); // Р4: снабжение из другого города
      s += `<p style="margin:0">${rc ? `Выпечку везут: ${esc(BK.Corp.supplyName(S, rc))}.` : 'Цех арендован.'} Теперь первая <b>точка</b> — кружки с плюсом на карте. Узнаваемость бренда здесь пока ${pct(S.corp.cities[S.corp.active].aw)}: гостей чуть меньше, чем в Уфе, пока город к вам не привыкнет.</p>`;
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
    let s = (BK.DeliveryUI ? BK.DeliveryUI.netBlock(S) : '') + `<div class="row sp"><span class="hint">${nw(S.stores.length, 'точка', 'точки', 'точек')} · сортировка</span><div class="seg">${[['rev', 'Выручка'], ['profit', 'Прибыль'], ['num', 'Номер']].map(([k, l]) => `<button data-act="storeSort" data-arg="${k}" aria-pressed="${sortKey === k}">${l}</button>`).join('')}</div></div>`;
    for (const st of list) {
      const mood = BK.storeMood(st);
      const L = st.last;
      s += `<div class="card click" data-act="openStore" data-arg="${st.id}">
        <div class="card-h"><div><div class="card-t">№${st.num} · ${esc(st.address)}</div><div class="card-s">${dname(st.district)} · ${fmtShort(st.size)}, ${st.area} м² · ремонт ${st.repair}/3</div></div>${mood ? BK.faceIcon(mood) : ''}</div>
        <div class="row">${statusChip(S, st)}${st.status !== 'opening' ? ratingChip(S, st) : ''}<span class="chip">Штат ${st.staff.length}/${st.staffTarget}${st.incoming.length ? ` +${st.incoming.length}` : ''}</span>${st.today && !st.today.closed ? `<span class="chip">${n0(st.today.checks)} чеков/день</span>` : ''}${BK.DeliveryUI ? BK.DeliveryUI.listChip(S, st) : ''}</div>
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
      <div class="row">${statusChip(S, st)}${st.status !== 'opening' ? ratingChip(S, st) : ''}${st.landmarks.map((l) => `<span class="chip river">${lname(l)}</span>`).join('')}${st.repair ? `<span class="chip crust">${cfg.REPAIRS[st.repair].name}</span>` : ''}${rivalChip(S, st)}</div></div>`;
    if (BK.PixelUI) s += BK.PixelUI.storeSlot(S, st); // «живая точка» вблизи — пиксельная сцена (src/pixel/live.js)
    if (BK.CollUI) s += BK.CollUI.storeLine(S, st); // кредит под залог точки
    if (T && !T.closed) {
      s += `<div class="sec"><h3>Сегодня</h3><div class="kpis">
        <div class="kpi"><span class="k">Чеков</span><span class="v">${n0(T.checks)}</span><span class="d">трафик ${n0(T.traffic)} чел.</span></div>
        <div class="kpi"><span class="k">Средний чек</span><span class="v">${n0(T.check)} ₽</span><span class="d">выручка ${fm(T.rev)}</span></div>
        <div class="kpi wide"><span class="k">Загрузка персонала${T.load > 1 ? ` — теряем ${fm(T.lost)} в день из-за очередей` : ''}</span><span class="v">${pct(Math.min(T.load, 9.99))}</span>${meter(T.load / 1.1)}</div>
      </div></div>`;
    }
    if (BK.TrainersUI) s += BK.TrainersUI.storeBlock(S, st); // «Взгляд тренера»
    if (BK.ManagersUI) s += BK.ManagersUI.storeBlock(S, st); // предложения управляющего по точке
    if (st.status !== 'opening') s += ratingSection(S, st);
    if (BK.DeliveryUI) s += BK.DeliveryUI.storeSection(S, st); // время суток и доставка через агрегаторы
    s += `<div class="sec"><h3>Помещение</h3><div class="grid2">
      ${kv('Аренда', fm(E_.storeRentMonth(st)) + '/мес')}${kv('Ставка', n0(st.rentM2) + ' ₽/м²')}
      ${kv('Оплата', st.payMode === 'year' ? (st.rentPaidUntil > S.day ? 'оплачено до ' + E_.fmtDate(st.rentPaidUntil) : 'раз в год') : 'помесячно')}${kv('Трафик', n0(st.traffic) + ' чел./день')}
      ${kv('Платёжеспособность', n0(st.solv * S.macro.priceLevel) + ' ₽ за визит')}${kv('Конкуренция', st.comp > 0.95 ? 'низкая' : st.comp > 0.89 ? 'средняя' : 'высокая')}
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
      <div class="row">${btn('quickHire', 'Нанять', { cls: 'sm dark', arg: st.id, cost: E_.hireCost(S, 1), dis: st.staff.length + st.incoming.length >= sz.staffMax, title: `Случайный кандидат 1–2 уровня. Найм стоит ${String(cfg.HIRE_COST_SALARIES).replace('.', ',')} зарплаты.` })}${btn('pickCand', 'Выбрать кандидата', { cls: 'sm', arg: st.id })}${trainAllCost ? btn('trainAll', 'Обучить всех', { cls: 'sm', arg: st.id, cost: trainAllCost, dis: !canPay(S, trainAllCost) }) : ''}</div>
      <div>`;
    if (!st.staff.length) s += `<div class="empty">${st.status === 'opening' ? 'Команда выйдет в день открытия.' : 'Никого нет — точка не работает.'}</div>`;
    for (const e of st.staff.slice().sort((a, b) => b.lvl - a.lvl)) {
      const mk = BK.moodKind(e.mood);
      const tc = e.lvl < 5 ? E_.trainCost(S, e.lvl + 1) : 0;
      const confirm = ui.confirmFire === e.id;
      s += `<div class="emp">${BK.faceIcon(mk)}<div style="min-width:0"><div class="nm" title="${esc(e.name)}">${esc(e.name)}</div><div class="meta">${stars(e.lvl)}<span>${BK.STAFF_LVL_NAMES[e.lvl]}</span><span>${fm(E_.salaryOf(S, e.lvl))}</span><span title="Усталость">усталость <span class="fbar"><i style="width:${e.fatigue.toFixed(0)}%"></i></span></span>${e.unhappy > 0 && e.mood < cfg.MOOD_UNHAPPY ? `<span class="negc" title="Если недовольство продлится ${cfg.UNHAPPY_QUIT_DAYS} дн., сотрудник уволится">${BK.byGender(e.name, 'недоволен', 'недовольна')} ${e.unhappy} дн. из ${cfg.UNHAPPY_QUIT_DAYS}</span>` : ''}</div></div>
        <div class="acts">${confirm ? `${btn('fire', 'Уволить', { cls: 'sm danger', arg: st.id, arg2: e.id, title: 'Компенсация — месячный оклад' })}${btn('cancelFire', 'Отмена', { cls: 'sm' })}` : `${e.lvl < 5 ? btn('train', 'Учить', { cls: 'sm', arg: st.id, arg2: e.id, cost: tc, dis: !canPay(S, tc), title: `Поднять до уровня ${e.lvl + 1}: обслуживает больше гостей, чек выше, реже увольняется` }) : '<span class="chip crust">макс.</span>'}${btn('askFire', '✕', { cls: 'sm', arg: e.id, title: 'Уволить (компенсация — месячный оклад)' })}`}</div></div>`;
    }
    s += `</div></div>`;
    s += `<div class="sec"><h3>Закрытие</h3>${st.coll ? `<span class="hint warnc">Точка в залоге банка: закрыть или продать её нельзя, пока кредит не погашен (блок «Кредит под залог»).</span>` : ui.confirmClose === st.id ? `<div class="confirm">Закрыть точку и продать оборудование за ${fm(st.capex * cfg.CLOSE_REFUND)}? ${btn('closeStore', 'Закрыть', { cls: 'sm danger', arg: st.id })}${btn('cancelClose', 'Отмена', { cls: 'sm' })}</div>` : btn('askClose', 'Закрыть точку', { cls: 'sm danger', arg: st.id })}</div>`;
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
      <div class="row">${o.landmarks.map((l) => `<span class="chip river">${lname(l)}</span>`).join('')}<span class="chip ${o.payMode === 'year' ? 'crust' : ''}">${o.payMode === 'year' ? `оплата за год, −${Math.round(cfg.YEARLY_RENT_DISCOUNT * 100)}%` : 'оплата помесячно'}</span>${rec.over ? `<span class="chip bad" title="Поток больше, чем успеет обслужить максимальный штат">перегруз: нужно ${rec.need} чел., максимум ${cfg.SIZES[o.size].staffMax}</span>` : `<span class="chip">штат ${rec.target} чел.</span>`}${rivalChip(S, o)}</div>
      <div class="grid2">
        ${kv('Аренда', `${n0(o.rentM2)} ₽/м² · ${fm(o.area * o.rentM2)}`)}${kv('Трафик', n0(o.traffic) + ' чел./день')}
        ${kv('Платёжеспособность', n0(o.solv * S.macro.priceLevel) + ' ₽ за визит')}${kv('Конкуренция', o.comp > 0.95 ? 'низкая' : o.comp > 0.89 ? 'средняя' : 'высокая')}
        ${kv('Прогноз выручки', '≈ ' + fm(est.rev) + '/мес')}${kv('Прогноз прибыли', `<span class="${est.profit >= 0 ? 'pos' : 'negc'}">≈ ${fm(est.profit)}/мес</span>`)}
      </div>${BK.DeliveryUI ? BK.DeliveryUI.offerLine(S, o) : ''}
      <div class="row sp"><span class="hint">Отделка ${fm(c.fit)}, оборудование ${fm(c.eq)}, найм ${fm(c.hire)}, ${o.payMode === 'year' ? 'аренда за год' : 'депозит'} ${fm(c.rent)}. ${S.cash >= c.total ? `После аренды на счёте останется <b class="${S.cash - c.total < 1.5e6 * S.macro.priceLevel ? 'warnc' : ''}">${fm(S.cash - c.total)}</b>.` : `<span class="negc">Не хватает ${fm(c.total - S.cash)}.</span>`} Предложение действует ещё ${nw(Math.max(0, o.expires - S.day), 'день', 'дня', 'дней')}.</span>
      ${btn('rent', 'Арендовать', { cls: 'primary', arg: o.id, cost: c.total, dis: !canPay(S, c.total) })}</div>
    </div>`;
  }
  function prodOfferCard(S, o, ui) {
    const E_ = E();
    const c = E_.prodOpenCost(S, o);
    const center = BK.CENTER_POINT;
    const avgKm = S.stores.length ? S.stores.reduce((a, st) => a + E_.dist(o, st), 0) / S.stores.length * E_.kmPerUnit() : E_.dist(o, center) * E_.kmPerUnit();
    const del = (C().DELIVERY_BASE + C().DELIVERY_PER_KM * avgKm) * S.macro.priceLevel;
    const sel = ui.sel && ui.sel.kind === 'prodOffer' && ui.sel.id === o.id;
    return `<div class="card${sel ? ' sel' : ''}">
      <div class="card-h"><div><div class="card-t">${esc(o.address)}</div><div class="card-s">${dname(o.district)} · ${o.area} м² · до центра ${km(o, center)} км</div></div><button class="btn sm" data-act="focusProdOffer" data-arg="${o.id}">На карте</button></div>
      <div class="grid2">${kv('Аренда', fm(o.area * o.rentM2) + '/мес')}${kv('Ставка', n0(o.rentM2) + ' ₽/м²')}${kv(S.stores.length ? 'Доставка до точек' : 'Доставка (до центра)', '≈ ' + fm(del) + ' на точку/мес')}${kv('Мощность', n0(C().PROD_BASE_CAPACITY) + ' изд./день')}</div>
      <div class="row sp"><span class="hint">Отделка ${fm(c.fit)}, базовое оборудование ${fm(c.eq)}, депозит ${fm(c.dep)}. Запуск ${C().PROD_OPEN_DAYS} дн.</span>${btn('rentProd', 'Арендовать под цех', { cls: 'primary', arg: o.id, cost: c.total, dis: !canPay(S, c.total) })}</div>
    </div>`;
  }
  function market(S, ui) {
    let s = rivalBlock(S);
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
      <div class="kpi"><span class="k" title="Фудкост — доля себестоимости продуктов в цене. Чем ниже, тем больше остаётся с каждой продажи">Фудкост меню</span><span class="v">${pct(S.cache ? S.cache.fcPct : E_.menuStats(S).fcPct, 1)}</span></div>
      <div class="kpi"><span class="k">Пекарей</span><span class="v">${E_.bakersTotal(S)}</span><span class="d">зарплата ${fm(S.pay.baker)}</span></div>
    </div>`;
    const next = S.productions.length === 1 ? cfg.SECOND_PROD_STORES : S.productions.length === 2 ? cfg.THIRD_PROD_STORES : null;
    if (next && !S.prodOffers.length) s += `<div class="hint">Следующее производство можно открыть при ${next} точках (сейчас ${S.stores.length}).</div>`;
    s += `</div>`;
    s += wastePanel(S);
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
      <div class="kpi"><span class="k">Привлекательность меню</span><span class="v">${ms.appeal.toFixed(2).replace('.', ',')}</span><span class="d">${nw(ms.n, 'позиция', 'позиции', 'позиций')}, ${nw(ms.cats, 'категория', 'категории', 'категорий')}</span></div>
      <div class="kpi"><span class="k" title="Фудкост — доля себестоимости продуктов в цене. Чем ниже, тем больше остаётся с каждой продажи">Фудкост</span><span class="v">${pct(S.cache && S.cache.fcPct ? S.cache.fcPct : ms.fcPct, 1)}</span><span class="d">с учётом оборудования</span></div>
      <div class="kpi"><span class="k">Средняя цена</span><span class="v">${n0(ms.avgPrice)} ₽</span><span class="d">индекс ${pct(ms.priceIdx)}</span></div>
      <div class="kpi"><span class="k">Корзина гостя</span><span class="v">${n0(ms.avgPrice * cfg.ITEMS_PER_CHECK)} ₽</span><span class="d">без допродаж</span></div>
    </div>
    <p class="hint" style="margin:0">Цена — одна на всю сеть. Если корзина дороже платёжеспособности района, гостей там заметно меньше. В богатых районах повышение цены поднимает чек, в бедных — отпугивает.</p>
    <div class="row">${btn('allPrices', 'Все цены −5%', { cls: 'sm', arg: '-0.05' })}${btn('allPrices', 'Все цены +5%', { cls: 'sm', arg: '0.05' })}${btn('allPrices', 'Сбросить к рекомендованным', { cls: 'sm', arg: 'reset' })}</div></div>`;
    const nextY = S.chef.pending ? null : E_.dateOf(S.day).y + 1;
    s += `<div class="sec"><h3>Шеф-пекарь</h3>${S.chef.pending ? `<div class="alert warn" data-act="chef"><div><div class="a-t">Шеф подготовил 5 новинок</div><div>Добавьте в меню до 2 новинок и выведите до 2 старых позиций.</div></div></div>` : `<div class="hint">Новинки — раз в год. Следующие предложения: январь ${nextY}.</div>`}</div>`;
    const MS = BK.MenuStats; // статистика продуктов (ui/menu-stats.js)
    s += `<div class="sec"><h3>Меню <small>${S.menu.length} из ${cfg.MENU_MAX}</small></h3>${MS ? MS.menuHead(S) : ''}<div>`;
    for (const it of S.menu) {
      const p = E_.byId(BK.PRODUCTS, it.id);
      const sug = p.price * pl, price = sug * it.pm, fc = p.fc / it.pm;
      const tr = S.trends[p.cat];
      s += `<div class="prodrow"><div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="pm"><span class="chip cat" style="--cat:${BK.CATEGORIES[p.cat].color}">${BK.CATEGORIES[p.cat].name}</span><span>тренд ${Math.round(tr)}</span><span>фудкост ${pct(fc)}</span><span>рекоменд. ${n0(sug)} ₽</span></div>${MS ? MS.menuRow(S, it.id) : ''}</div>
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
      <div class="kpi"><span class="k">Найм одного человека</span><span class="v">${fm(E_.hireCost(S, 1))}</span><span class="d">${String(cfg.HIRE_COST_SALARIES).replace('.', ',')} зарплаты · ${E_.hireDays(S)} дн.</span></div>
    </div>
    <p class="hint" style="margin:0">Настроение зависит от зарплаты относительно рынка, культуры, премий, усталости и нехватки коллег. Недоволен больше ${cfg.UNHAPPY_QUIT_DAYS} дней — увольняется. Обученные сотрудники держатся дольше, но ждут зарплату выше (+${Math.round(cfg.EXPECT_PER_LVL * 100)}% за уровень).</p></div>`;
    // зарплаты
    const payRow = (kind, label) => {
      const r = S.pay[kind] / S.market[kind];
      return `<div class="card"><div class="row sp"><div><div class="card-t">${label}</div><div class="card-s">рынок: ${fm(S.market[kind])} · вы платите ${pct(r)} рынка</div></div>
        <div class="stepper"><button data-act="pay" data-arg="${kind}" data-arg2="-0.02" aria-label="Снизить">−</button><span>${fm(S.pay[kind])}</span><button data-act="pay" data-arg="${kind}" data-arg2="0.02" aria-label="Повысить">+</button></div></div>
        <div class="hint">${r >= 1.1 ? 'Выше рынка — люди держатся за место.' : r >= 0.99 ? 'На уровне рынка — нейтрально.' : 'Ниже рынка — растёт недовольство и текучка, но экономия на ФОТ.'}${kind === 'seller' ? ` ФОТ точек (зарплаты и взносы) в месяц ≈ ${fm(S.stores.reduce((a, st) => a + st.staff.reduce((b, e) => b + E_.salaryOf(S, e.lvl), 0), 0) * (1 + cfg.PAYROLL_TAX))}.` : ''}</div></div>`;
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
        <div class="hint">HR сам закрывает вакансии: человек выходит через 5 дней, чаще сразу на 2-м уровне. Цена найма та же — ${String(cfg.HIRE_COST_SALARIES).replace('.', ',')} зарплаты.</div>`;
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
      s += `<div class="row sp"><div><div class="card-t">Тренеров: ${trN}</div><div class="card-s">1 на ${cfg.TRAINER_STORES_PER} точек · ${fm(trN * cfg.TRAINER_SALARY * (1 + cfg.PAYROLL_TAX) * S.macro.priceLevel)}/мес · обучение на 35% дешевле</div></div>
        <div class="seg"><button data-act="autotrain" data-arg="1" aria-pressed="${S.office.autotrainOn}">Автообучение вкл</button><button data-act="autotrain" data-arg="0" aria-pressed="${!S.office.autotrainOn}">выкл</button></div></div>
        <div class="row sp"><span class="hint">Обучать всех до уровня</span><div class="stepper"><button data-act="trainTarget" data-arg="-1" aria-label="Ниже">−</button><span>${S.office.trainTarget} · ${BK.STAFF_LVL_NAMES[S.office.trainTarget]}</span><button data-act="trainTarget" data-arg="1" aria-label="Выше">+</button></div></div>
        <div class="hint">Тренеры поднимают каждого сотрудника на один уровень не чаще раза в ${cfg.AUTOTRAIN_GAP_DAYS} дней, по ${nw(cfg.AUTOTRAIN_PER_TRAINER_DAY, 'обучению', 'обучения', 'обучений')} в день на тренера. Помните: выше уровень — выше оклад.</div>`;
    } else {
      const left = E_.ownerTrainLeft(S);
      s += `<div class="card-t">Отдела пока нет — обучаете сами</div><div class="card-s">${S.stores.length > cfg.TRAIN_REQUIRED_STORES ? `<span class="negc">Сеть больше ${cfg.TRAIN_REQUIRED_STORES} точек: вручную не больше ${nw(cfg.OWNER_TRAINS_PER_WEEK, 'обучения', 'обучений', 'обучений')} в неделю (осталось ${left}).</span>` : `После ${cfg.TRAIN_REQUIRED_STORES} точек без отдела обучение станет медленным.`}</div>
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
  /* ---------- ФИНАНСЫ: «водопад» (выручка → статьи расходов → прибыль → распределение) и таблица точек (макет 3) ---------- */
  const FIN_PER = [['m', 'Месяц', 1], ['q', 'Квартал', 3], ['y', 'Год', 12]];
  function finSum(S, n) { // сумма отчётов за последние n месяцев
    const h = S.history.slice(-n).filter((x) => x.pnl);
    if (!h.length) return null;
    const keys = ['rev', 'fc', 'waste', 'rent', 'payroll', 'delivery', 'util', 'upkeep', 'hire', 'train', 'tax', 'interest', 'other', 'income', 'profit', 'toReserve', 'bonus', 'marketing'];
    const o = { n: h.length, from: h[0], to: h[h.length - 1] };
    for (const k of keys) o[k] = h.reduce((a, x) => a + (x.pnl[k] || 0), 0);
    o.dist = h.reduce((a, x) => a + Math.max(0, x.pnl.profit || 0), 0); // распределяется только прибыль прибыльных месяцев (как в движке)
    return o;
  }
  function finUnit(v) { const a = Math.abs(v); return a >= 5e9 ? [1e9, 'млрд ₽', 2] : a >= 5e6 ? [1e6, 'млн ₽', 1] : [1e3, 'тыс. ₽', 0]; }
  function waterfall(S, ui) {
    const per = FIN_PER.find((x) => x[0] === ui.finPeriod) || FIN_PER[0];
    const p = finSum(S, per[2]);
    const seg = `<div class="seg finper">${FIN_PER.map(([k, l]) => `<button data-act="finPeriod" data-arg="${k}" aria-pressed="${per[0] === k}">${l}</button>`).join('')}</div>`;
    const M = E().MONTHS, m3 = (x) => M[x.m].slice(0, 3).toLowerCase();
    const when = p ? (p.n === 1 ? `${M[p.to.m]} ${p.to.y}` : `${m3(p.from)} ${p.from.y} — ${m3(p.to)} ${p.to.y}`) : '';
    let s = `<div class="sec fin-wf"><div class="finhead"><h3>Куда ушла выручка${p ? ` <small>${when}</small>` : ''}</h3>${seg}</div>`;
    if (!p || p.rev <= 0) return s + `<div class="empty">«Водопад» появится 1-го числа следующего месяца — после первого расчёта.</div></div>`;
    const R = p.rev;
    // статьи; мелкие (< 2 % выручки) складываем в «Прочее», чтобы столбики читались
    const raw = [['Фудкост', p.fc - p.waste], ['Списания', p.waste], ['Аренда', p.rent], ['ФОТ', p.payroll], ['Доставка', p.delivery], ['Коммуналка', p.util], ['Управление', p.upkeep], ['Найм', p.hire + p.train], ['Налоги', p.tax], ['Проценты', p.interest], ['Партнёрам', p.inv || 0]];
    const items = []; let other = p.other - p.income;
    for (const [l, v] of raw) { if (!v) continue; if (Math.abs(v) < R * 0.02 && l !== 'Налоги') other += v; else items.push([l, v]); }
    if (Math.abs(other) >= 1) items.push([other >= 0 ? 'Прочее' : 'Доходы', other]);
    const [U, un, dg] = finUnit(R);
    const f = (v) => (v / U).toFixed(dg).replace('.', ',').replace('-', '−');
    const sg = (x) => (x.v > 0 && !x.tot && x.cls !== 'rev' ? '+' : '');
    const bars = [{ l: 'Выручка', a: 0, b: R, cls: 'rev', v: R }];
    let run = R;
    for (const [l, v] of items) { bars.push({ l, a: Math.min(run, run - v), b: Math.max(run, run - v), cls: v >= 0 ? 'exp' : 'inc', v: -v }); run -= v; }
    const profit = p.profit;
    bars.push({ l: 'Прибыль', a: Math.min(0, profit), b: Math.max(0, profit), cls: profit >= 0 ? 'prof' : 'loss', v: profit, tot: true });
    const dist = [];
    if (p.dist > 0) {
      const keep = p.dist - p.toReserve - p.bonus - p.marketing;
      let r2 = p.dist;
      for (const [l, v, c] of [['Резерв', p.toReserve, 'res'], ['Премии', p.bonus, 'bon'], ['Маркетинг', p.marketing, 'mkt']]) { if (v > 0) { dist.push({ l, a: r2 - v, b: r2, cls: c, v: -v }); r2 -= v; } }
      dist.push({ l: 'На счёт', a: 0, b: Math.max(0, keep), cls: 'keep', v: keep, tot: true });
    }
    const all = bars.concat(dist);
    const lo = Math.min(0, ...all.map((x) => x.a)), hi = Math.max(...all.map((x) => x.b));
    const margin = profit / R;
    // вертикальный «водопад» (ПК) — SVG
    const W = 760, pl = 4, gap = dist.length ? 14 : 0, axW = 34;
    const bw = (W - pl - axW - gap) / all.length, stag = bw < 58; // узкие столбики — подписи в две строки «лесенкой»
    const H = stag ? 236 : 222, pt = 20, pb = stag ? 48 : 34;
    const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
    let g = `<svg class="wf" viewBox="0 0 ${W} ${H}" role="img" aria-label="От выручки к прибыли, ${un}: ${esc(all.map((x) => x.l + ' ' + f(x.v)).join(', '))}">`;
    const raw2 = (hi - lo) / 3, pw = Math.pow(10, Math.floor(Math.log10(raw2 || 1))), step = [1, 2, 5, 10].map((k) => k * pw).find((v) => v >= raw2) || raw2;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) g += `<line class="grid" x1="${pl}" x2="${W - axW + 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ax" x="${W - 2}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.abs(v) < 1e-9 ? '0' : f(v).replace(/,0+$/, '')}</text>`;
    if (lo < 0) g += `<line class="zero" x1="${pl}" x2="${W - axW + 4}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
    const xs = (i) => pl + i * bw + (i >= bars.length ? gap : 0);
    all.forEach((x, i) => {
      const x0 = xs(i) + 4, w = bw - 8, y0 = y(x.b), y1 = y(x.a), hh = Math.max(1.5, y1 - y0);
      if (i === bars.length && gap) { const xl = (xs(i) - gap / 2).toFixed(1); g += `<line class="sep" x1="${xl}" x2="${xl}" y1="${pt - 8}" y2="${H - 4}"/>`; }
      g += `<rect class="b ${x.cls}" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="2"><title>${esc(x.l)}: ${fm(x.v)}</title></rect>`;
      // соединитель с началом следующего шага
      const nx = all[i + 1];
      if (nx && i !== bars.length - 1 && !x.tot) { const yc = y(x.cls === 'rev' ? x.b : x.v < 0 ? x.a : x.b); g += `<line class="con" x1="${(x0 + w).toFixed(1)}" x2="${(xs(i + 1) + 4).toFixed(1)}" y1="${yc.toFixed(1)}" y2="${yc.toFixed(1)}"/>`; }
      const below = x.cls === 'loss';
      g += `<text class="val ${x.cls}" x="${(x0 + w / 2).toFixed(1)}" y="${(below ? y1 + 11 : y0 - 5).toFixed(1)}" text-anchor="middle">${sg(x)}${f(x.v)}</text>`;
      g += `<text class="lab${x.tot || x.cls === 'rev' ? ' tot' : ''}" x="${(x0 + w / 2).toFixed(1)}" y="${H - pb + 14 + (stag && i % 2 ? 13 : 0)}" text-anchor="middle">${esc(x.l)}</text>`;
    });
    g += `<text class="cap" x="${pl + 4}" y="${H - 3}">ОТ ВЫРУЧКИ К ПРИБЫЛИ</text>${dist.length ? `<text class="cap" x="${(xs(bars.length) + 4).toFixed(1)}" y="${H - 3}">РАСПРЕДЕЛЕНИЕ</text>` : ''}</svg>`;
    // горизонтальный (телефон) — строки с полосами
    const X = (v) => (v - lo) / (hi - lo || 1) * 100;
    let rows = `<div class="wfr" role="list">`;
    all.forEach((x, i) => {
      if (i === bars.length) rows += `<div class="wfsep">Распределение прибыли</div>`;
      rows += `<div class="wfrow${x.tot || x.cls === 'rev' ? ' tot' : ''}" role="listitem"><span class="l">${esc(x.l)}</span><span class="tr"><i class="${x.cls}" style="left:${X(x.a).toFixed(2)}%;width:${Math.max(0.8, X(x.b) - X(x.a)).toFixed(2)}%"></i></span><span class="v ${x.cls}">${sg(x)}${f(x.v)}</span></div>`;
    });
    rows += `</div>`;
    s += `<div class="finsub">${un} · маржа <b class="${margin >= 0 ? 'pos' : 'negc'}">${pct(margin, 1)}</b>${p.n < per[2] ? ` · данных за ${nw(p.n, 'месяц', 'месяца', 'месяцев')}` : ''}</div><div class="wfbox">${g}</div>${rows}</div>`;
    return s;
  }
  const FIN_COLS = [['num', '№'], ['addr', 'Адрес · район'], ['rating', 'Рейтинг'], ['rev', 'Выручка, ₽'], ['profit', 'Прибыль, ₽'], ['margin', 'Маржа'], ['mood', 'Настроение'], ['staff', 'Штат']];
  function finStores(S, ui) {
    const E_ = E();
    const open = S.stores.filter((st) => st.status !== 'opening' && st.last);
    if (!open.length) return '';
    const key = ui.finSort || 'profit', dir = ui.finDir || (key === 'profit' || key === 'margin' || key === 'rating' ? 1 : -1); // 1 — по возрастанию («от худших»)
    const filt = ui.finFilter || 'all';
    const mg = (st) => (st.last.rev > 0 ? st.last.profit / st.last.rev : -1);
    const val = { num: (st) => st.num, rev: (st) => st.last.rev, profit: (st) => st.last.profit, margin: mg, rating: (st) => E_.storeRating(S, st), staff: (st) => st.staff.length / Math.max(1, st.staffTarget), mood: (st) => { const k = BK.storeMood(st); return k === 'sad' ? 0 : k === 'mid' ? 1 : k === 'happy' ? 2 : -1; } };
    const loss = open.filter((st) => st.last.profit < 0), short = open.filter((st) => st.staff.length < st.staffTarget);
    const list = (filt === 'loss' ? loss : filt === 'short' ? short : open).slice().sort((a, b) => (val[key](a) - val[key](b)) * dir || a.num - b.num);
    const maxAbs = Math.max(1, ...open.map((st) => Math.abs(st.last.profit)));
    const chips = [['all', 'Все', open.length], ['loss', 'Убыточные', loss.length], ['short', 'Нехватка штата', short.length]];
    const lastM = S.history[S.history.length - 1];
    let s = `<div class="sec fin-st"><div class="finhead"><h3>Точки <small>прибыль и маржа${lastM ? ` за ${E_.MONTHS[lastM.m].toLowerCase()}` : ''}</small></h3><div class="finchips">${chips.map(([k, l, n]) => `<button class="finchip" data-act="finFilter" data-arg="${k}" aria-pressed="${filt === k}">${l} <b>${n}</b></button>`).join('')}</div></div>`;
    if (!list.length) return s + `<div class="empty">${filt === 'loss' ? 'Убыточных точек нет.' : 'Везде полный штат.'}</div></div>`;
    const head = FIN_COLS.map(([k, l]) => {
      if (k === 'addr') return `<th class="c-addr">${l}</th>`;
      const on = key === k, arr = on ? (dir > 0 ? '▲' : '▼') : '';
      return `<th class="c-${k}${on ? ' on' : ''}"><button data-act="finSort" data-arg="${k}" aria-pressed="${on}" title="Сортировать: ${l.toLowerCase()}">${l}${arr ? `<i>${arr}</i>` : ''}</button></th>`;
    }).join('');
    const MOOD = { happy: 'довольны', mid: 'терпят', sad: 'недовольны' };
    const fr = (v) => fm(v).replace(/\s₽$/, ''); // «₽» — в заголовке колонки
    let body = '';
    for (const st of list) {
      const L = st.last, m = mg(st), r = E_.storeRating(S, st), mood = BK.storeMood(st);
      const w = Math.min(50, Math.abs(L.profit) / maxAbs * 50);
      const cls = L.profit < 0 ? 'neg' : m < 0.15 ? 'low' : 'ok';
      body += `<tr class="${L.profit < 0 ? 'lossrow' : ''}" data-act="openStore" data-arg="${st.id}"><td class="c-num"><span class="numc ${cls}">${st.num}</span></td><td class="c-addr"><b>${esc(st.address)}</b> <span>${dname(st.district)}<i class="m-stf${st.staff.length < st.staffTarget ? ' warnc' : ''}"> · штат ${st.staff.length}/${st.staffTarget}</i></span></td><td class="c-rating"><span class="rt">★ ${r1(r)}</span></td><td class="c-rev">${fr(L.rev)}</td><td class="c-profit"><span class="pcell"><span class="pbar" aria-hidden="true"><i class="${cls}" style="${L.profit < 0 ? 'right' : 'left'}:50%;width:${w.toFixed(1)}%"></i></span><span class="${L.profit < 0 ? 'negc' : ''}">${fr(L.profit)}</span></span></td><td class="c-margin ${cls}">${L.rev > 0 ? pct(m) : '—'}</td><td class="c-mood">${mood ? `${BK.faceIcon(mood)}<span>${MOOD[mood]}</span>` : '—'}</td><td class="c-staff${st.staff.length < st.staffTarget ? ' warnc' : ''}">${st.staff.length}/${st.staffTarget}</td></tr>`;
    }
    s += `<div class="fintbl-w"><table class="fintbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><span class="hint">Нажмите на строку — откроется карточка точки. Прибыль точки — до общих расходов сети (цех, офис, управление), налог — по текущей ставке.</span></div>`;
    return s;
  }

  function finance(S, ui) {
    const cfg = C(), E_ = E();
    const a = S.alloc;
    const rest = Math.max(0, 1 - a.reserve - a.bonus - a.marketing);
    const sl = (key, label, hint) => `<div class="field"><label for="al-${key}">${label} — <b>${pct(a[key])}</b></label><div class="slider"><input type="range" id="al-${key}" min="0" max="60" step="1" value="${Math.round(a[key] * 100)}" data-inp="alloc" data-arg="${key}"><span class="val">${pct(a[key])}</span></div><span class="hint">${hint}</span></div>`;
    const lim = E_.loanLimit(S);
    let s = `<div class="sec"><div class="kpis">
      <div class="kpi"><span class="k">Расчётный счёт</span><span class="v ${S.cash < 0 ? 'negc' : ''}">${fm(S.cash)}</span></div>
      <div class="kpi"><span class="k">Резервный фонд</span><span class="v">${fm(S.reserve)}</span><span class="d">доход ${pct(Math.max(0, S.macro.keyRate - cfg.RESERVE_SPREAD), 1)} годовых</span></div>
      <div class="kpi"><span class="k">Кредит</span><span class="v ${S.loan ? 'warnc' : ''}">${fm(S.loan)}</span><span class="d">ставка ${pct(E().loanRate(S), 1)}</span></div>
      <div class="kpi"><span class="k">Налог</span><span class="v">${pct(E_.currentTaxRate(S), 1)}</span><span class="d" title="${S.macro.regime === 'osno' ? 'ОСНО — общая система налогообложения: НДС и налог на прибыль' : 'УСН «доходы» — упрощённая система: налог считается с выручки'}">${S.macro.regime === 'osno' ? 'ОСНО: НДС + 25% прибыли' : 'УСН «доходы»'}</span></div>
    </div></div>`;
    const lastM = S.history[S.history.length - 1];
    s += waterfall(S, ui);
    s += finStores(S, ui);
    s += `<div class="fin2"><div class="sec"><h3>Отчёт за прошлый месяц${lastM ? ` <small>${E_.MONTHS[lastM.m]} ${lastM.y}</small>` : ''}</h3>${pnlTable(lastM && lastM.pnl, true)}${BK.STORY && BK.STORY.lineHtml ? BK.STORY.lineHtml(S) : ''}</div>`;
    s += `<div class="sec"><h3>Распределение прибыли <small>каждый месяц</small></h3>
      ${sl('reserve', 'Резервный фонд', 'Подушка на карантин, кризис и конкурентов. Сам закрывает кассовый разрыв (когда на счёте не хватает денег на платежи) и приносит проценты.')}
      ${sl('bonus', 'Премии персоналу', 'Поднимают настроение и снижают текучесть.')}
      ${sl('marketing', 'Маркетинг', `Больше гостей в следующем месяце (до +${Math.round(cfg.MARKETING_EFF * 100)}%).`)}
      <div class="kv"><span>Остаётся на развитие</span><span><b>${pct(rest)}</b></span></div></div></div>`;
    s += `<div class="sec"><h3>Выручка и прибыль <small>последние 24 мес.</small></h3>${revChart(S)}</div>`;
    s += `<div class="sec"><h3>Резервный фонд <small>${fm(S.reserve)}</small></h3><div class="row">
      ${btn('reserve', '+1 млн', { cls: 'sm', arg: 1e6, dis: S.cash < 1e6, title: 'Перевести 1 млн со счёта в резерв' })}${btn('reserve', '+10 млн', { cls: 'sm', arg: 1e7, dis: S.cash < 1e7, title: 'Перевести 10 млн со счёта в резерв' })}${btn('reserve', '−1 млн', { cls: 'sm', arg: -1e6, dis: S.reserve < 1e6, title: 'Вернуть 1 млн из резерва на счёт' })}${btn('reserve', '−10 млн', { cls: 'sm', arg: -1e7, dis: S.reserve < 1e7, title: 'Вернуть 10 млн из резерва на счёт' })}${btn('reserve', 'Всё на счёт', { cls: 'sm', arg: -1e15, dis: S.reserve < 1 })}</div>
      <span class="hint">«+» — перевести со счёта в резерв, «−» — вернуть на счёт.</span></div>`;
    s += `<div class="sec"><h3>Кредит <small>лимит ${fm(lim)}</small></h3><div class="row">
      ${btn('loan', 'Взять 5 млн', { cls: 'sm', arg: 5e6, dis: S.loan + 1 > lim })}${btn('loan', 'Взять 20 млн', { cls: 'sm', arg: 2e7, dis: S.loan + 1 > lim })}${btn('repay', 'Погасить 5 млн', { cls: 'sm', arg: 5e6, dis: !S.loan })}${btn('repay', 'Погасить всё', { cls: 'sm', arg: 1e15, dis: !S.loan })}</div>
      <span class="hint">Лимит — средняя месячная выручка × ${String(+(cfg.LOAN_MAX_REV_MULT * E().diffK(S, 'loanMult')).toFixed(1)).replace('.', ',')}${S.ev && S.day < (S.ev.creditSqueezeUntil || 0) ? ` (в кризис банки урезают лимит на ${Math.round((1 - (cfg.CRISIS_LOAN_MULT != null ? cfg.CRISIS_LOAN_MULT : 1)) * 100)}%)` : ''}. Проценты списываются 1-го числа.</span></div>`;
      if (BK.CollUI) s += BK.CollUI.block(S); // кредит под залог точки (этап 2 ROADMAP)
      if (BK.InvUI) s += BK.InvUI.block(S); // инвесторы (этап 2 ROADMAP)
      // сюжет: лента «История» живёт в «Сводке» (dash) — см. panels.js dash
    s += `<div class="sec"><h3>Экономика</h3><div class="grid2">
      ${kv('Ключевая ставка', pct(S.macro.keyRate, 1))}${kv('Инфляция (прогноз года)', pct(S.macro.inflation + S.macro.inflAdd, 1))}
      ${kv('Уровень цен к 2027 году', pct(S.macro.priceLevel))}${kv('Рыночная зарплата', fm(S.market.seller))}
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

  /* ---------- сеть-соперник ---------- */
  function rivalChip(S, o) { // «рядом конкурент: N точек» — в карточке точки и помещения
    const r = E().rivalNear ? E().rivalNear(S, o) : null; if (!r || !r.n) return '';
    const name = E().rivalSummary(S).name;
    return `<span class="chip bad" title="Точки «${esc(name)}» ближе ~${String((C().RIVAL_RADIUS * E().kmPerUnit()).toFixed(1)).replace('.', ',')} км забирают часть гостей. Чем выше рейтинг вашей точки, тем меньше потеря">рядом «${esc(name)}»: ${nw(r.n, 'точка', 'точки', 'точек')}, −${pct(Math.max(0.01, r.loss))} гостей</span>`;
  }
  function rivalBlock(S) { // «Конкурент: Хлебный двор — N точек, растёт/слабеет» (вкладка «Рынок»; можно вставить и в «Сводку»)
    const r = E().rivalSummary ? E().rivalSummary(S) : null; if (!r) return '';
    const per = r.months >= 12 ? 'за год' : 'с начала игры';
    const trend = r.delta > 0 ? `<span class="negc">растёт: +${r.delta} ${per}</span>` : r.delta < 0 ? `<span class="pos">слабеет: −${-r.delta} ${per}</span>` : `<span class="hint">без изменений ${per}</span>`;
    const hit = S.stores.filter((st) => st.status !== 'opening' && E().rivalNear(S, st).n).length;
    return `<div class="sec rival"><h3>Конкурент <small>сеть «${esc(r.name)}»</small></h3>
      <div class="rival-sum"><i class="rv-mark" aria-hidden="true"></i><div><b>${nw(r.n, 'точка', 'точки', 'точек')}</b> · ${trend}
      <div class="hint">Рядом с соперником ${hit ? nw(hit, 'ваша точка', 'ваши точки', 'ваших точек') : 'ни одной вашей точки'}. Занял помещений с рынка: ${r.grabbed}, закрыл точек из-за вас: ${r.closed}. Высокий рейтинг точки снижает потери гостей, а где у вас несколько сильных точек, соперник уходит.</div></div></div></div>`;
  }
  BK.rivalBlock = rivalBlock;

  BK.Panels = { dash, stores, market, production, menu, team, finance, journal, offerCard, prodOfferCard };
  BK.UIH = { fm, n0, pct, esc, dname, lname, btn, kv, meter, stars, km, plural, nw, pctS, delta, spark, goalInfo, goalBar, moodCounts, MONL, MON3 };
  BK.UIH.rating = { ratingInfo, rstars, r1 };
})();
