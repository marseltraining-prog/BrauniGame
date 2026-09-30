// Корпоративные профили бота (второй акт, этапы Р2–Р3; docs/russia-design.md §8.2):
//   good — лучший город по «потенциал / цена входа», лучшие «навыки / оклад», штаб по мере роста (финдеп → Москва,
//          служба безопасности и университет с 3 директоров, HR, бренд, закупки, юристы), KPI «выручка + прибыль + рейтинг»,
//          опционы директорам грейда 3+, учёба, аудит при отклонении от прогноза, «Директор года», вора — в суд;
//   avg  — города по близости, случайные директора из пула, один KPI (выручка), без опционов и аудитов, на просьбы — случайно;
//   bad  — сразу крупные города (Москва — как только можно) в кредит, самые дешёвые директора, без KPI и контроля.
// Подключение: play({ …, corp: true, corpOpt: { level } }) в sim/bot.js (флаг --corp[=avg|bad]); без флага бот первого акта не меняется.
const BK = require('./load');
const E = BK.Engine, CFG = BK.CFG;

const score = (d) => (d.seen.ops + d.seen.econ + d.seen.growth * 1.2 + d.seen.people) / Math.pow(d.salary / 1e5, 0.35);
// привлекательность города: ёмкость × доход / аренда, дальние чуть хуже
function cityScore(S, id) {
  const d = BK.CITY_BY_ID[id];
  return d.cap * d.inc / Math.sqrt(d.rent * d.wage) / (1 + d.km / 3000) / (d.big ? 1.3 : 1);
}
// детерминированный ГСЧ бота для решений avg (не трогает ГСЧ игры)
function brnd(mem) { mem._cr = ((mem._cr || 12345) * 1103515245 + 12345) % 2147483648; return mem._cr / 2147483648; }
function hireFor(S, cityId, opt, mem) {
  const cr = S.corp, lv = opt.level || 'good';
  let cands = cr.dirCand.slice();
  if (lv === 'bad') cands.sort((a, b) => a.salary - b.salary);
  else cands.sort((a, b) => score(b) - score(a));
  if (lv === 'good' && (!cands.length || (opt.pickyGrade && cands[0].grade < 2 && S.cash > 400e6 * S.macro.priceLevel))) {
    const fee = CFG.CORP.DIR_CAND_FEE * S.macro.priceLevel;
    if (S.cash > fee * 20) { E.dirRefresh(S, true); cands = cr.dirCand.slice().sort((a, b) => score(b) - score(a)); }
  }
  if (!cands.length && S.cash > 50e6 * S.macro.priceLevel) { E.dirRefresh(S, true); cands = cr.dirCand.slice(); }
  const d = lv === 'avg' && cands.length ? cands[Math.floor(brnd(mem) * cands.length)] : cands[0]; if (!d) return null;
  const r = E.dirHire(S, d.id, cityId);
  return r.ok ? r.d : null;
}
function nearestFree(S) { // не наши города по расстоянию до ближайшего нашего
  const own = Object.keys(S.corp.cities);
  return BK.CITIES.filter((d) => !S.corp.cities[d.id] && !E.enterLock(S, d.id)).map((d) => ({ id: d.id, km: Math.min(...own.map((o) => BK.roadKm(o, d.id))) })).sort((a, b) => a.km - b.km).map((x) => x.id);
}
function hq(S, key) { return BK.HQ.lvlOf(S, key); }
function tryHq(S, key, reserve) { const lv = hq(S, key), cost = BK.HQ.openCost(S, key, lv + 1); if (S.cash > cost + reserve) return E.hqOpen(S, key).ok; return false; }

function corpMonth(S, P, mem, opt) {
  const cr = S.corp, pl = S.macro.priceLevel;
  opt = opt || {};
  const fix = opt.level === 'badfix'; // bad, который через год учит или меняет слабых директоров (Р4)
  const lv = fix ? 'bad' : opt.level || 'good';
  const st = mem.corp || (mem.corp = { rows: [], fedYear: null, legendYear: null, unlockY: null, entered: [], dev: {}, audits: 0 });
  if (st.unlockY == null) st.unlockY = +(S.day / 365).toFixed(1);
  const nC = Object.keys(cr.cities).length, dirs = cr.directors.filter((d) => d.city);
  const fixed = S.history.length ? S.history[S.history.length - 1].pnl : null;
  const buf = fixed ? (fixed.rent + fixed.payroll + fixed.util + fixed.upkeep) * 1.5 : 50e6;
  // 1. входящие
  for (const it of cr.inbox) {
    if (it.kind === 'award' && !it.done) { if (lv !== 'bad') E.dirAward(S, it.id, it.noms[lv === 'avg' ? Math.floor(brnd(mem) * it.noms.length) : 0].dir); continue; }
    if (it.kind === 'caught' && !it.done) { if (lv === 'good') E.caughtDecide(S, it.id, it.trait === 'theft' ? 'sue' : 'warn'); else if (lv === 'avg') E.caughtDecide(S, it.id, it.choices[Math.floor(brnd(mem) * it.choices.length)]); continue; }
    (it.reqs || []).forEach((r, i) => {
      if (r.st !== 'open' || lv === 'bad') return; // bad не отвечает — отказ по сроку
      if (lv === 'avg') { E.dirAnswer(S, it.id, i, ['yes', 'alt', 'no'][Math.floor(brnd(mem) * 3)]); return; }
      if (r.t === 'budget') E.dirAnswer(S, it.id, i, S.cash > r.amount * 2 + 50e6 * pl ? 'yes' : S.cash > r.alt * 2 + 30e6 * pl ? 'alt' : 'no');
      else E.dirAnswer(S, it.id, i, 'yes');
    });
  }
  // 2. оклады директоров: good — не ниже рынка; avg — раз в год по просьбе (через отчёты); bad — никогда
  if (lv === 'good') for (const d of cr.directors) { const mk = BK.Dir.marketPay(S, d, d.city); if (d.salary < mk * 1.02) E.dirSalary(S, d.id, mk * 1.05 / d.salary); }
  // 3. штаб
  if (lv === 'good') {
    const r = buf + 150e6 * pl;
    if (nC >= 3 && !hq(S, 'finance')) tryHq(S, 'finance', r);
    if (dirs.length >= 3 && !hq(S, 'security')) tryHq(S, 'security', r);
    if (dirs.length >= 3 && !hq(S, 'uni')) tryHq(S, 'uni', r);
    if (nC >= 3 && !hq(S, 'hr')) tryHq(S, 'hr', r);
    if (nC >= 4 && !hq(S, 'legal')) tryHq(S, 'legal', r);
    if (nC >= 5 && !hq(S, 'brand')) tryHq(S, 'brand', r);
    if (dirs.length >= 6 && hq(S, 'uni') === 1) tryHq(S, 'uni', r + 200e6 * pl);
    const stores = BK.Corp.summary(S).stores;
    if (stores >= 100 && !hq(S, 'purchasing')) tryHq(S, 'purchasing', r);
    if (dirs.length >= 10 && hq(S, 'uni') === 2) tryHq(S, 'uni', r + 500e6 * pl);
    if (hq(S, 'brand') && nC >= 6) E.hqCampaign(S);
  } else if (lv === 'avg') {
    if (nC >= 4 && !hq(S, 'finance')) tryHq(S, 'finance', buf + 200e6 * pl);
    if (dirs.length >= 5 && !hq(S, 'uni')) tryHq(S, 'uni', buf + 200e6 * pl);
  } else if (!hq(S, 'finance') && nC >= 3) tryHq(S, 'finance', 0); // bad — только чтобы открыть Москву
  // 4. города без директора (кроме того, где бот сам) — назначить
  for (const id in cr.cities) {
    const c = cr.cities[id];
    if (id === cr.active || c.directorId) continue;
    const free = cr.directors.find((d) => !d.city);
    if (free) E.dirAssign(S, free.id, id); else hireFor(S, id, Object.assign({}, opt, { level: lv }), mem);
  }
  // 5. мотивация и контроль
  for (const d of cr.directors) {
    if (!d.city) continue;
    if (lv === 'good') {
      if (!d.kpi.keys.length) E.dirKpi(S, d.id, { keys: ['rev', 'profit', 'rating'], bonus: 0.3 });
      const c = cr.cities[d.city];
      if (d.grade >= 3 && BK.HQ.unvested(d) === 0 && !(d.opt && d.opt.corp) && BK.Corp.cityStats(S, d.city).open >= 10) E.dirOption(S, d.id, 0.003);
      if (hq(S, 'uni') && !d.study) {
        const prog = !d.progs.includes('brand') ? 'brand' : hq(S, 'uni') >= 3 && d.grade < 5 && !d.progs.includes('mba') ? 'mba' : ['ops', 'growth', 'people', 'econ'].find((p) => !d.progs.includes(p));
        if (prog && !BK.HQ.progLock(S, d, prog) && S.cash > BK.HQ.progCost(S, prog) * 10) E.uniEnroll(S, d.id, prog, true);
      }
      // аудит: выручка на точку ниже прогноза > 3 % два квартала подряд
      const dv = BK.Dir.cityDev(S, d.city), key = d.city;
      if (dv && dv.dev3 != null && dv.dev3 < -0.03) st.dev[key] = (st.dev[key] || 0) + 1; else st.dev[key] = 0;
      if (st.dev[key] >= 6 && (d.lastAudit == null || S.day - d.lastAudit > 365)) { if (E.cityAudit(S, d.city).ok) st.audits++; st.dev[key] = 0; }
      void c;
    } else if (lv === 'avg') {
      if (!d.kpi.keys.length) E.dirKpi(S, d.id, { keys: ['rev'], bonus: 0.3 });
    }
  }
  // 5б. денежный риск (Р4): реакция на утечку слабого директора — good сразу, avg с опозданием, badfix через год, bad никак
  leakFix(S, mem, st, lv, fix, buf);
  if (lv === 'good') { // совет директоров: трое самых лояльных
    const top = cr.directors.filter((d) => d.city && !d.board).sort((a, b) => b.loyalty - a.loyalty);
    if (cr.directors.filter((d) => d.board).length < 3 && top[0] && top[0].months >= 12) E.dirBoard(S, top[0].id, true);
  }
  // 6. новый город
  if (S.day - (st.lastEnter || -999) >= (opt.enterGap || (lv === 'avg' ? 600 : 150))) { // средний игрок не держит темп штаба: следующий город — не раньше чем через ~1,6 года
    let ids = BK.CITIES.map((d) => d.id).filter((id) => !cr.cities[id] && !E.enterLock(S, id));
    if (lv === 'avg') ids = nearestFree(S);
    else if (lv === 'bad') ids.sort((a, b) => BK.CITY_BY_ID[b].pop - BK.CITY_BY_ID[a].pop);
    else ids.sort((a, b) => cityScore(S, b) - cityScore(S, a));
    const id = ids[0];
    if (id) {
      const cost = E.enterCost(S, id), need = cost + (BK.CITY_BY_ID[id].big ? 150e6 : 60e6) * pl;
      if (lv === 'bad' && S.cash < need) E.takeLoan(S, need - S.cash + 20e6 * pl); // рывок в кредит
      if (S.cash > need * (lv === 'bad' ? 1 : lv === 'avg' ? 1.8 : 1.3) + (lv === 'bad' ? 0 : buf)) {
        const d = hireFor(S, null, Object.assign({}, opt, { level: lv }), mem);
        // Р4: good входит без своего цеха, если рядом наш цех (свежая выпечка) — цех директор построит, когда точек станет больше
        const supply = lv === 'good' && BK.Corp.supplyHubs(S, id).fresh ? 'fresh' : null;
        if (d) { const r = E.enterCity(S, id, { director: d.id, supply }); if (r.ok) { st.entered.push({ id, y: +(S.day / 365).toFixed(1), sup: supply }); st.lastEnter = S.day; } }
      }
    }
  }
  // 7. бюджет городов
  const rich = S.cash > 300e6 * pl;
  for (const id in cr.cities) {
    const c = cr.cities[id], d = BK.Dir.dirOf(S, c); if (!d || id === cr.active) continue;
    const want = BK.Dir.proposeCapex(S, c, d) * (lv === 'bad' ? 2 : lv === 'avg' ? 0.8 : rich ? 1.6 : 1);
    if (c.budget.capex < want) E.citySetBudget(S, id, { capex: want });
    if (lv === 'good' && c.budget.train < 4) E.citySetBudget(S, id, { train: 4 });
  }
  if (lv === 'bad' && S.cash < 0) E.takeLoan(S, -S.cash + 30e6 * pl);
}
const FIX_PROGS = ['ops', 'econ', 'people', 'growth', 'mba'];
function enrollFix(S, d, evening) { // программа навыков (не «Бренд») — снижает нужный уровень
  if (d.study) return true;
  for (const p of FIX_PROGS) if (!BK.HQ.progLock(S, d, p) && S.cash > BK.HQ.progCost(S, p) * 3) return E.uniEnroll(S, d.id, p, evening).ok;
  return false;
}
function replaceDir(S, cityId, d, mem) { // сменить на кандидата заметно сильнее; старого — уволить
  const avg = (x) => (x.seen.ops + x.seen.econ + x.seen.growth + x.seen.people) / 4, cur = (d.skills.ops + d.skills.econ + d.skills.growth + d.skills.people) / 4;
  let c = S.corp.dirCand.filter((x) => x.grade > d.grade || avg(x) > cur + 8).sort((a, b) => avg(b) - avg(a))[0];
  if (!c && S.cash > 50e6 * S.macro.priceLevel) { E.dirRefresh(S, true); c = S.corp.dirCand.filter((x) => x.grade > d.grade || avg(x) > cur + 8).sort((a, b) => avg(b) - avg(a))[0]; }
  if (!c) return false;
  const r = E.dirHire(S, c.id, cityId); if (!r.ok) return false;
  E.dirFire(S, d.id);
  mem.corp.repl = mem.corp.repl || {}; mem.corp.repl[cityId] = S.day; mem.corp.fixes = (mem.corp.fixes || 0) + 1;
  return true;
}
function leakFix(S, mem, st, lv, fix, buf) {
  const cr = S.corp, pl = S.macro.priceLevel;
  for (const id in cr.cities) {
    const c = cr.cities[id]; if (id === cr.active || !c.directorId) continue;
    const d = BK.Dir.dirOf(S, c); if (!d || d.city !== id) continue;
    const L = c.leak || 0, lm = BK.Dir.lossMonths(c), since = (st.repl || {})[id];
    const canRepl = since == null || S.day - since > 365;
    if (lv === 'good') {
      if (L < 0.02) continue;
      if (!hq(S, 'uni')) tryHq(S, 'uni', buf + 50e6 * pl);
      const li = BK.Dir.leakInfo(S, c, d);
      if (L >= 0.08 && d.cityMonths >= 12 && canRepl && li.gap > 12 && replaceDir(S, id, d, mem)) continue;
      enrollFix(S, d, true);
    } else if (lv === 'avg') { // средний игрок замечает красную строку «теряет деньги» не сразу
      if (lm < 4 || brnd(mem) > 0.35) continue;
      if (!hq(S, 'uni')) tryHq(S, 'uni', buf + 100e6 * pl);
      if (!(hq(S, 'uni') && enrollFix(S, d, false)) && canRepl) replaceDir(S, id, d, mem);
    } else if (fix) { // badfix: через год в городе — учить; не помогает — сменить
      if (d.cityMonths < 12 || L < 0.02) continue;
      if (!hq(S, 'uni')) tryHq(S, 'uni', 0);
      if ((L >= 0.1 || !hq(S, 'uni')) && canRepl && replaceDir(S, id, d, mem)) continue;
      enrollFix(S, d, false);
    }
  }
}
// ежегодная строка сводки
function corpYear(S, mem) {
  const st = mem.corp; if (!st || !S.corp) return;
  const f = E.fedStatus(S), sm = E.corpSummary(S), cr = S.corp, s = cr.stat || {};
  const h = S.history.slice(-12), prof = h.reduce((a, x) => a + x.profit, 0);
  st.rows.push({ year: +(S.day / 365).toFixed(1), cities: sm.cities.length, 'гор10+': f.cities, stores: sm.stores, dirs: cr.directors.length,
    'rev12 млрд': +(f.rev / 1e9).toFixed(1), 'prof12 млрд': +(prof / 1e9).toFixed(2), cash: Math.round(S.cash / 1e6), loan: Math.round(S.loan / 1e6),
    loy: cr.directors.length ? Math.round(cr.directors.reduce((a, d) => a + d.loyalty, 0) / cr.directors.length) : null, hq: cr.hq ? Object.values(cr.hq).reduce((a, x) => a + x, 0) : 0,
    ev: cr.ev ? cr.ev.seen || 0 : 0, 'укр млн': Math.round((s.stolen || 0) / 1e6), пойм: s.caught || 0, ушли: s.left || 0, перем: s.poached || 0, pl: +S.macro.priceLevel.toFixed(2),
    'утечка %': (() => { const cs = Object.values(cr.cities).filter((c) => c.id !== 'ufa'); return cs.length ? +(cs.reduce((a, c) => a + (c.leak || 0), 0) / cs.length * 100).toFixed(1) : 0; })(), // Р4: денежный риск
    'убыт.гор': sm.cities.filter((c) => c.id !== 'ufa' && c.prof12 < 0).length });
  if (cr.fed.goalDay != null && st.fedYear == null) st.fedYear = +(cr.fed.goalDay / 365).toFixed(1);
  if (cr.fed.legendDay != null && st.legendYear == null) st.legendYear = +(cr.fed.legendDay / 365).toFixed(1);
}
module.exports = { corpMonth, corpYear, cityScore, hireFor, score };
