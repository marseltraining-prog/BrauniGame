/* Хлебная карта — учёт продаж по продуктам меню (BK.ProdStats). Чистая логика без DOM.
   Движок считает выручку точки целиком (трафик × конверсия × чек), без разбивки по позициям. Этот модуль раскладывает
   фактические итоги дня (выручка, штуки, себестоимость, списания) по продуктам меню — теми же весами, что и движок
   (популярность × тренд категории × цена, надбавки праздников по категориям), — и копит помесячную историю.
   Списания приходят из движка точной суммой за день (пятый аргумент day), раскладываются по себестоимости с поправкой
   на срок годности категории (напитки почти не списываются) и спрос (редко берут — чаще остаётся). Итог по всем продуктам
   всегда равен фактическому итогу дня, а сумма списаний по продуктам — строке «Списания» в отчёте месяца и в окне шеф-пекаря.
   Учёт не тратит случайные числа и ничего не меняет в экономике: только читает итоги дня.

   Состояние: S.prodStats = { v: 1, c: { [город]: { lab: 'г-м', cur: { id: [шт, выручка, себест, списания] }, days, hist: [{ y, m, d (дней с продажами), p: { id: [...] } }] } } }
   Город — S.corp.active (во втором акте) или 'ufa'. Месяц — как в отчёте движка (1-е число относится к прошлому месяцу).
   Старые сохранения: поля нет → создаётся при первом дне, UI пишет «копим статистику» и показывает оценку. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const C = () => BK.CFG;
  const E = () => BK.Engine;
  const HIST_MAX = 24, MD = 30.4; // средний месяц, дней
  const dOf = (h) => h.d || MD;
  // срок годности / остатки по категориям (напитки готовят под заказ — остатков почти нет)
  const PERISH = { bread: 1.0, laminated: 1.2, sweet: 1.1, pies: 1.15, national: 0.95, desserts: 1.3, drinks: 0.08, breakfast: 1.2, healthy: 1.0 };

  function prod(id) { return E().byId(BK.PRODUCTS, id); }
  function cityKey(S) { return S.corp ? S.corp.active : 'ufa'; }
  function ensure(S, key) {
    if (!S.prodStats || typeof S.prodStats !== 'object') S.prodStats = { v: 1, c: {} };
    if (!S.prodStats.c) S.prodStats.c = {};
    if (key == null) return null;
    const c = S.prodStats.c;
    if (!c[key]) c[key] = { lab: '', days: 0, cur: {}, hist: [] };
    return c[key];
  }
  function cityData(S) { const k = cityKey(S); return S.prodStats && S.prodStats.c && k ? S.prodStats.c[k] || null : null; }

  /* ---------- надбавки праздников по категориям (как holidayDay в движке) ---------- */
  let holKey = '', holVal = null;
  function holCat(S, day) {
    const cal = BK.CITY && BK.CITY.cal, key = day + ':' + (cal ? BK.CITY.id : '');
    if (holKey === key) return holVal;
    const H = C().HOLIDAYS || {}, out = {}; let any = false;
    const y = E().dateOf(day).y;
    const list = [].concat(E().holidaysOfYear(y - 1), E().holidaysOfYear(y), E().holidaysOfYear(y + 1));
    for (const h of list) {
      if (!(h.start <= day && day <= h.end)) continue;
      const c = H[h.id]; if (!c || !c.cat) continue;
      const f = cal ? (h.id === 'uraza' || h.id === 'kurban' ? cal.muslim : h.id === 'sabantuy' ? cal.sab : 1) : 1;
      for (const k in c.cat) { out[k] = (out[k] || 0) + c.cat[k] * f; any = true; }
    }
    holKey = key; holVal = any ? out : null;
    return holVal;
  }

  /* ---------- веса продуктов ---------- */
  // u — штуки, r — выручка, c — себестоимость, w — списания
  function weights(S, menu, hol) {
    const rows = []; let su = 0;
    for (const it of menu) {
      const p = prod(it.id); if (!p) continue;
      const u = p.pop * (0.55 + 0.9 * ((S.trends && S.trends[p.cat]) || 50) / 100) * (hol && hol[p.cat] ? 1 + hol[p.cat] : 1);
      rows.push({ id: it.id, p, u, r: u * p.price * (it.pm || 1), c: u * p.fc * p.price }); su += u;
    }
    const avgU = rows.length ? su / rows.length : 1;
    for (const x of rows) x.w = x.c * (PERISH[x.p.cat] != null ? PERISH[x.p.cat] : 1) * Math.min(1.8, Math.max(0.6, Math.sqrt(avgU / x.u)));
    return rows;
  }
  // разложить итоги { units, rev, fc, waste } по продуктам → { id: [шт, выручка, себест, списания] }
  function split(S, menu, tot, hol) {
    const rows = weights(S, menu, hol), out = {};
    let U = 0, R = 0, F = 0, W = 0; for (const x of rows) { U += x.u; R += x.r; F += x.c; W += x.w; }
    for (const x of rows) out[x.id] = [tot.units * x.u / (U || 1), tot.rev * x.r / (R || 1), tot.fc * x.c / (F || 1), tot.waste * x.w / (W || 1)];
    return out;
  }

  /* ---------- учёт дня (вызывается из dailyStores после расчёта выручки) ---------- */
  function monthLabel(t) { // 1-е число — ещё прошлый месяц (как в отчёте движка)
    if (t.d !== 1) return { y: t.y, m: t.m };
    return t.m === 0 ? { y: t.y - 1, m: 11 } : { y: t.y, m: t.m - 1 };
  }
  function push(cd) {
    let any = false; const p = {};
    for (const id in cd.cur) { const a = cd.cur[id]; if (a[0] > 0 || a[1] > 0) any = true; p[id] = [Math.round(a[0]), Math.round(a[1]), Math.round(a[2]), Math.round(a[3])]; }
    if (any && cd.lab) { const [y, m] = cd.lab.split('-').map(Number); cd.hist.push({ y, m, d: cd.days || 1, p }); if (cd.hist.length > HIST_MAX) cd.hist.splice(0, cd.hist.length - HIST_MAX); }
    cd.cur = {}; cd.days = 0;
  }
  function day(S, dayRev, dayFc, dayChecks, dayWaste, dayUnits) { // dayUnits — изделий за день (зал + доставка); без него — по чекам зала
    const key = cityKey(S); if (!key) return;
    const cd = ensure(S, key), t = E().dateOf(S.day), ml = monthLabel(t), lab = ml.y + '-' + ml.m;
    if (cd.lab !== lab) { push(cd); cd.lab = lab; } // город простаивал (был неактивным) — закрыть старый месяц
    if (dayRev > 0 || dayChecks > 0) {
      cd.days = (cd.days || 0) + 1;
      const cfg = C(), wz = (S.cache && S.cache.waste) || { waste: 0 }, M = cfg.FOODCOST_MULT || 1;
      // Списания дня: движок отдаёт точную сумму (engine.js, dailyStores). Без неё (старый вызов) — оценка доли списаний
      // в фудкосте по сети: она завышена, потому что в деньFc входит и фудкост доставки (у заказов списаний нет), а остатки
      // складываются по профилю дня точки (вечерняя скидка), а не по среднему по сети.
      const est = dayFc * Math.max(0, wz.waste) / (M + Math.max(0, wz.waste)); // dayFc = выручка × фудкост/M × (M + доля остатков)
      const waste = dayWaste != null && isFinite(dayWaste) ? Math.max(0, Math.min(dayFc, dayWaste)) : est;
      const parts = split(S, S.menu, { units: dayUnits != null && isFinite(dayUnits) ? dayUnits : dayChecks * cfg.ITEMS_PER_CHECK, rev: dayRev, fc: dayFc - waste, waste }, holCat(S, S.day));
      for (const id in parts) { const a = cd.cur[id] || (cd.cur[id] = [0, 0, 0, 0]), b = parts[id]; a[0] += b[0]; a[1] += b[1]; a[2] += b[2]; a[3] += b[3]; }
    }
    if (t.d === 1) { push(cd); cd.lab = ''; } // отчёт месяца — в историю сразу, чтобы шеф в январе видел декабрь
  }

  /* ---------- оценка: как меню меняет выручку сети ---------- */
  // выручка и штуки сети в «средний» день при данном меню (стандартный день, без праздников и событий дня)
  function simDay(S, menu) {
    const keep = S.menu; let rev = 0, units = 0;
    try {
      S.menu = menu;
      const ms = E().menuStats(S), cfg = C(), t = { dow: 2, m: 4 };
      for (const st of S.stores) {
        if (st.status === 'opening' || !st.staff || !st.staff.length) continue;
        const d = E().storeDemand(S, st, t, ms), ch = Math.min(d.demand, d.thr);
        rev += ch * d.check; units += ch * cfg.ITEMS_PER_CHECK;
      }
    } finally { S.menu = keep; }
    return { rev, units };
  }
  function fcMultNow(S) { // множитель себестоимости цехов (оборудование) × упаковка и потери
    let w = 0, f = 0;
    for (const p of S.productions) if (p.status === 'open') { const c = E().prodCapacity(S, p); w += c; f += c * E().prodFcMult(S, p); }
    return (w > 0 ? f / w : 1) * (C().FOODCOST_MULT || 1);
  }

  /* ---------- сводка для UI ---------- */
  // окно — последние до 12 полных месяцев текущего города
  function summary(S) {
    const cd = cityData(S), hist = cd ? cd.hist : [];
    const win = hist.slice(-12), n = win.length;
    const inMenu = S.menu.map((m) => m.id);
    const tot = { units: 0, rev: 0, fc: 0, waste: 0 }; let days = 0;
    for (const h of win) { days += dOf(h); for (const id in h.p) { const a = h.p[id]; tot.units += a[0]; tot.rev += a[1]; tot.fc += a[2]; tot.waste += a[3]; } }
    const k0 = days > 0 ? MD / days : 0; // всё — в пересчёте на средний месяц (первый месяц после загрузки старого сохранения бывает неполным)
    const base = n ? { units: tot.units * k0, rev: tot.rev * k0, fc: tot.fc * k0, waste: tot.waste * k0 } : null;
    // оценка базы без истории: сегодняшний день × 30,4
    const pl = S.macro.priceLevel, Mk = C().FOODCOST_MULT || 1;
    let estBase = base;
    if (!estBase) {
      const now = simDay(S, S.menu), dayRev = S.cache && S.cache.dayRev > 0 ? S.cache.dayRev : now.rev, k = now.rev > 0 ? dayRev / now.rev : 1;
      const rev = dayRev * 30.4, wz = E().wasteFactors(S, E().menuStats(S));
      const fcShare = E().menuStats(S).fcPct * fcMultNow(S) / (C().FOODCOST_MULT || 1);
      estBase = { units: now.units * k * 30.4, rev, fc: rev * fcShare * (C().FOODCOST_MULT || 1), waste: rev * fcShare * Math.max(0, wz.waste) };
    }
    const est = split(S, S.menu, estBase, null);
    const rows = [];
    for (const it of S.menu) {
      const p = prod(it.id); if (!p) continue;
      let u = 0, r = 0, f = 0, w = 0, m = 0, md = 0, shareDen = 0; const spark = [];
      for (const h of win) {
        const a = h.p[it.id]; let mt = 0; for (const id in h.p) mt += h.p[id][1];
        spark.push(a ? a[1] * MD / dOf(h) : null);
        if (!a) continue;
        u += a[0]; r += a[1]; f += a[2]; w += a[3]; m++; md += dOf(h); shareDen += mt;
      }
      let row;
      if (m) { const k = MD / md; row = { id: it.id, p, est: false, months: m, units: u * k, rev: r * k, share: shareDen > 0 ? r / shareDen : 0, fc: f * k, waste: w * k }; }
      else { const a = est[it.id]; row = { id: it.id, p, est: true, months: 0, units: a[0], rev: a[1], share: estBase.rev > 0 ? a[1] / estBase.rev : 0, fc: a[2], waste: a[3] }; }
      row.price = p.price * pl * it.pm;
      row.margin = row.rev - row.fc - row.waste;
      row.marginPct = row.rev > 0 ? row.margin / row.rev : 0;
      row.wastePct = row.fc + row.waste > 0 ? row.waste / (row.fc / Mk + row.waste) : 0; // доля выпечки (по себестоимости), ушедшая в списание
      row.spark = spark;
      row.trend = trendOf(hist, it.id);
      rows.push(row);
    }
    // Строки «среднего месяца» приводим к итогу окна — это ровно та цифра, что в строке «Списания» отчёта месяца:
    // позиция, ушедшая из меню внутри окна, разное число месяцев у позиций и новинка без истории иначе дают перекос.
    // Множитель один на все строки, поэтому сравнение позиций между собой (доли, флаги) не меняется.
    if (base) {
      const D = { units: 0, rev: 0, fc: 0, waste: 0 }, A = { units: 0, rev: 0, fc: 0, waste: 0 }, kk = {};
      for (const x of rows) { const t = x.est ? A : D; for (const k in D) t[k] += x[k]; }
      for (const k in D) kk[k] = D[k] > 0 ? Math.max(0, base[k] - A[k]) / D[k] : 1;
      for (const x of rows) if (!x.est) { for (const k in D) x[k] *= kk[k]; x.share = base.rev > 0 ? x.rev / base.rev : 0; }
    }
    // средние по меню для флагов
    let R = 0, M = 0, W = 0, F = 0; for (const x of rows) { R += x.rev; M += x.margin; W += x.waste; F += x.fc; }
    const avgMargin = R > 0 ? M / R : 0, avgWaste = F + W > 0 ? W / (F / Mk + W) : 0, fair = rows.length ? 1 / rows.length : 0;
    for (const x of rows) {
      const fl = [];
      if (x.share < fair * 0.6) fl.push({ k: 'share', t: 'малая доля' });
      if (x.wastePct > avgWaste * 1.3 && x.wastePct > 0.03) fl.push({ k: 'waste', t: 'много списаний' });
      if (x.marginPct < avgMargin - 0.07) fl.push({ k: 'margin', t: 'низкая маржа' });
      if (x.trend && x.trend.share != null && x.trend.share < -0.15) fl.push({ k: 'trend', t: 'теряет долю' });
      x.flags = fl;
      x.candidate = (fl.length >= 2 && x.share < fair * 0.9) || x.share < fair * 0.4; // лидеров продаж в кандидаты не записываем
    }
    rows.sort((a, b) => b.rev - a.rev);
    return { months: n, hasData: n > 0, rows, base: estBase, baseEst: !base, avgMargin, avgWaste, fair, city: cityKey(S) };
  }
  // динамика: год к году (нужно 24 мес.), иначе последние 3 мес. к трём предыдущим; pct — штуки в день, share — изменение доли в выручке (к доле 1/N)
  function trendOf(hist, id) {
    const has = (arr) => arr.every((h) => h && h.p[id]);
    // доля — относительно «честной» доли 1/N, чтобы расширение меню само по себе не считалось падением
    const agg = (arr) => { let u = 0, d = 0, sh = 0; for (const h of arr) { const a = h.p[id]; let t = 0, n = 0; for (const k in h.p) { t += h.p[k][1]; n++; } u += a[0]; d += dOf(h); sh += t > 0 ? a[1] / t * n : 0; } return { u: d > 0 ? u / d : 0, sh: sh / arr.length }; };
    const cmp = (a, b, label) => { const A = agg(a), B = agg(b); return B.u > 0 ? { pct: A.u / B.u - 1, share: B.sh > 0 ? A.sh / B.sh - 1 : null, label } : null; };
    let r = null;
    if (hist.length >= 24) { const a = hist.slice(-12), b = hist.slice(-24, -12); if (has(a) && has(b)) r = cmp(a, b, 'к прошлому году'); }
    if (!r && hist.length >= 6) { const a = hist.slice(-3), b = hist.slice(-6, -3); if (has(a) && has(b)) r = cmp(a, b, 'за 3 мес. к 3 предыдущим'); }
    return r || { pct: null, share: null, label: 'мало данных' };
  }

  // оценка меню после изменений: выручка сети, штуки, маржа, списания; по каждому продукту — то же
  function estimate(S, menu, sum) {
    sum = sum || summary(S);
    const b = sum.base, now = simDay(S, S.menu), nx = simDay(S, menu);
    const kR = now.rev > 0 ? nx.rev / now.rev : 1, kU = now.units > 0 ? nx.units / now.units : 1;
    const ms0 = E().menuStats(S), keep = S.menu; S.menu = menu; const ms1 = E().menuStats(S); S.menu = keep;
    const wz0 = E().wasteFactors(S, ms0), wz1 = E().wasteFactors(S, ms1);
    const rev = b.rev * kR, fcShare0 = b.rev > 0 ? b.fc / b.rev : 0;
    const fc = rev * (ms0.fcPct > 0 ? fcShare0 * ms1.fcPct / ms0.fcPct : 0);
    const wasteShare0 = b.rev > 0 ? b.waste / b.rev : 0;
    const waste = rev * (wz0.waste > 0 ? wasteShare0 * (wz1.waste / wz0.waste) * (ms0.fcPct > 0 ? ms1.fcPct / ms0.fcPct : 1) : 0);
    const tot = { units: b.units * kU, rev, fc, waste };
    const per = split(S, menu, tot, null);
    return { tot, per, dRev: rev - b.rev, kRev: kR, margin: rev - fc - waste, marginPct: rev > 0 ? (rev - fc - waste) / rev : 0, wastePct: fc + waste > 0 ? waste / (fc / (C().FOODCOST_MULT || 1) + waste) : 0, appeal0: ms0.appeal, appeal1: ms1.appeal, n: menu.length };
  }
  // карточка новинки: добавить её одну к текущему меню
  function candidate(S, id, sum) {
    const e = estimate(S, S.menu.concat([{ id, pm: 1 }]), sum), a = e.per[id] || [0, 0, 0, 0];
    return { units: a[0], rev: a[1], share: e.tot.rev > 0 ? a[1] / e.tot.rev : 0, margin: a[1] - a[2] - a[3], marginPct: a[1] > 0 ? (a[1] - a[2] - a[3]) / a[1] : 0, wastePct: a[2] + a[3] > 0 ? a[3] / (a[2] / (C().FOODCOST_MULT || 1) + a[3]) : 0, dRev: e.dRev };
  }
  // если вывести позицию: как изменится выручка сети (часть гостей купит другое)
  function removal(S, id, sum) {
    sum = sum || summary(S);
    const e = estimate(S, S.menu.filter((m) => m.id !== id), sum), b = sum.base;
    return { dRev: e.dRev, dMargin: e.margin - (b.rev - b.fc - b.waste) };
  }

  BK.ProdStats = { day, ensure, summary, estimate, candidate, removal, split, simDay, PERISH };
})();
