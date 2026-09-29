// Корпоративный профиль бота good (второй акт, этап Р2): сам остаётся в Уфе (подробный город), новые города
// открывает под директоров, нанимает лучших «навыки / оклад», отвечает на просьбы, держит оклады директоров
// не ниже рынка, раз в год выбирает «Директора года».
// Подключение: play({ …, corp: true }) в sim/bot.js (флаг --corp) — без флага бот первого акта не меняется.
const BK = require('./load');
const E = BK.Engine, CFG = BK.CFG;

const score = (d) => (d.seen.ops + d.seen.econ + d.seen.growth * 1.2 + d.seen.people) / Math.pow(d.salary / 1e5, 0.35);
// привлекательность города: ёмкость × доход / аренда, дальние чуть хуже
function cityScore(S, id) {
  const d = BK.CITY_BY_ID[id];
  return d.cap * d.inc / Math.sqrt(d.rent * d.wage) / (1 + d.km / 3000) / (d.big ? 1.3 : 1);
}
function hireFor(S, cityId, opt) {
  const cr = S.corp;
  let cands = cr.dirCand.slice().sort((a, b) => score(b) - score(a));
  if (!cands.length || (opt.pickyGrade && cands[0].grade < 2 && S.cash > 400e6 * S.macro.priceLevel)) {
    const fee = CFG.CORP.DIR_CAND_FEE * S.macro.priceLevel;
    if (S.cash > fee * 20) { E.dirRefresh(S, true); cands = cr.dirCand.slice().sort((a, b) => score(b) - score(a)); }
  }
  const d = cands[0]; if (!d) return null;
  const r = E.dirHire(S, d.id, cityId);
  return r.ok ? r.d : null;
}

function corpMonth(S, P, mem, opt) {
  const cr = S.corp, K = CFG.CORP, pl = S.macro.priceLevel;
  opt = opt || {};
  const st = mem.corp || (mem.corp = { rows: [], fedYear: null, legendYear: null, unlockY: null, entered: [] });
  if (st.unlockY == null) st.unlockY = +(S.day / 365).toFixed(1);
  // 1. входящие: бюджет — если есть деньги, зарплаты и закрытия — да, повышение — да (хороший игрок держит людей)
  for (const it of cr.inbox) {
    if (it.kind === 'award' && !it.done) { E.dirAward(S, it.id, it.noms[0].dir); continue; }
    (it.reqs || []).forEach((r, i) => {
      if (r.st !== 'open') return;
      if (r.t === 'budget') E.dirAnswer(S, it.id, i, S.cash > r.amount * 2 + 50e6 * pl ? 'yes' : S.cash > r.alt * 2 + 30e6 * pl ? 'alt' : 'no');
      else E.dirAnswer(S, it.id, i, 'yes');
    });
  }
  // 2. оклады директоров — не ниже рынка
  for (const d of cr.directors) { const mk = BK.Dir.marketPay(S, d, d.city); if (d.salary < mk * 1.02) E.dirSalary(S, d.id, mk * 1.05 / d.salary); }
  // 3. города без директора (кроме того, где бот сам) — назначить
  for (const id in cr.cities) {
    const c = cr.cities[id];
    if (id === cr.active || c.directorId) continue;
    const free = cr.directors.find((d) => !d.city);
    if (free) E.dirAssign(S, free.id, id); else hireFor(S, id, opt);
  }
  // 4. новый город: по одному, пока запускается не больше MAX_LAUNCHING, при запасе денег
  if (S.day - (st.lastEnter || -999) >= (opt.enterGap || 150)) {
    const ids = BK.CITIES.map((d) => d.id).filter((id) => !cr.cities[id] && !E.enterLock(S, id)).sort((a, b) => cityScore(S, b) - cityScore(S, a));
    const id = ids[0];
    if (id) {
      const cost = E.enterCost(S, id), need = cost + (BK.CITY_BY_ID[id].big ? 150e6 : 60e6) * pl;
      const fixed = S.history.length ? S.history[S.history.length - 1].pnl : null;
      const buf = fixed ? (fixed.rent + fixed.payroll + fixed.util + fixed.upkeep) * 1.5 : 50e6;
      if (S.cash > need * 1.3 + buf) {
        const d = hireFor(S, null, opt);
        if (d) { const r = E.enterCity(S, id, { director: d.id }); if (r.ok) { st.entered.push({ id, y: +(S.day / 365).toFixed(1) }); st.lastEnter = S.day; } }
      }
    }
  }
  // 5. бюджет: при большом запасе денег — щедрее (игрок не держит деньги на счёте)
  const rich = S.cash > 300e6 * pl;
  for (const id in cr.cities) {
    const c = cr.cities[id], d = BK.Dir.dirOf(S, c); if (!d || id === cr.active) continue;
    const want = BK.Dir.proposeCapex(S, c, d) * (rich ? 1.6 : 1);
    if (c.budget.capex < want) E.citySetBudget(S, id, { capex: want });
    if (c.budget.train < 4) E.citySetBudget(S, id, { train: 4 });
  }
}
// ежегодная строка сводки
function corpYear(S, mem) {
  const st = mem.corp; if (!st || !S.corp) return;
  const f = E.fedStatus(S), sm = E.corpSummary(S);
  const h = S.history.slice(-12), prof = h.reduce((a, x) => a + x.profit, 0);
  st.rows.push({ year: +(S.day / 365).toFixed(1), cities: sm.cities.length, 'гор10+': f.cities, stores: sm.stores, dirs: S.corp.directors.length,
    'rev12 млрд': +(f.rev / 1e9).toFixed(1), 'prof12 млрд': +(prof / 1e9).toFixed(2), cash: Math.round(S.cash / 1e6), loan: Math.round(S.loan / 1e6),
    loy: S.corp.directors.length ? Math.round(S.corp.directors.reduce((a, d) => a + d.loyalty, 0) / S.corp.directors.length) : null, pl: +S.macro.priceLevel.toFixed(2) });
  if (S.corp.fed.goalDay != null && st.fedYear == null) st.fedYear = +(S.corp.fed.goalDay / 365).toFixed(1);
  if (S.corp.fed.legendDay != null && st.legendYear == null) st.legendYear = +(S.corp.fed.legendDay / 365).toFixed(1);
}
module.exports = { corpMonth, corpYear, cityScore, hireFor, score };
