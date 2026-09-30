/* Сверка учёта продаж по продуктам (src/prodstats.js): бот good играет N лет, затем
   сумма по продуктам за месяц сравнивается с отчётом движка и печатается сводка окна шефа.
   node sim/prodstats.js [лет=3] [сид=7919]  → код выхода 1, если суммы расходятся */
const { play } = require('./bot');
const BK = globalThis.BK, PS = BK.ProdStats;
const years = +(process.argv[2] || 3), seed = +(process.argv[3] || 7919);
const S = play({ level: 'good', seed, years }).S;
const cd = S.prodStats.c[S.corp ? S.corp.active : 'ufa'];
console.log(`лет ${years}, сид ${seed}: месяцев в истории ${cd.hist.length}, prodStats ${(JSON.stringify(S.prodStats).length / 1024).toFixed(1)} КБ, всё сохранение ${(JSON.stringify(S).length / 1024).toFixed(0)} КБ`);
let bad = 0;
for (const h of cd.hist.slice(-3)) {
  const hh = S.history.find((x) => x.y === h.y && x.m === h.m);
  let rv = 0, fc = 0, w = 0; for (const id in h.p) { rv += h.p[id][1]; fc += h.p[id][2]; w += h.p[id][3]; }
  if (!hh) { console.log('нет отчёта за', h.y, h.m); continue; }
  const rep = S.corp ? hh.c1 : hh.rev;
  const d = Math.abs(rv - rep) / Math.max(1, rep), dw = Math.abs(w - (hh.pnl.waste || 0)) / Math.max(1, hh.pnl.waste || 0);
  console.log(`${h.y}-${h.m + 1}: выручка по продуктам ${Math.round(rv)} / отчёт ${Math.round(rep)} (${(d * 100).toFixed(2)}%), себест.+списания ${Math.round(fc + w)} / ${Math.round(hh.fc)}, списания ${Math.round(w)} / ${Math.round(hh.pnl.waste || 0)}`);
  if (d > 0.01 || dw > 0.01) bad++;
}
const sum = PS.summary(S);
const f = (v, k = 0) => (v * 100).toFixed(k) + '%';
for (const x of sum.rows) {
  const rm = PS.removal(S, x.id, sum);
  console.log(`${x.p.name.padEnd(30)} ${String(Math.round(x.units)).padStart(7)} шт ${String(Math.round(x.rev / 1e3)).padStart(6)} т₽ доля ${f(x.share, 1).padStart(6)} спис ${f(x.wastePct, 1).padStart(5)} маржа ${f(x.marginPct).padStart(4)} дин ${x.trend.pct != null ? f(x.trend.pct) + " доля " + f(x.trend.share) : "—"} | вывести: ${Math.round(rm.dRev / 1e3)} т₽ ${x.flags.map((q) => q.t).join(', ')}${x.candidate ? ' ← КАНДИДАТ' : ''}`);
}
for (const id of ['croissant', 'cappuccino', 'kumis', 'medovik', 'glutenfree']) {
  const c = PS.candidate(S, id, sum);
  console.log(`+ ${id.padEnd(12)} ≈${Math.round(c.units)} шт ≈${Math.round(c.rev / 1e3)} т₽ доля ${f(c.share, 1)} маржа ${f(c.marginPct)} сеть ${c.dRev >= 0 ? '+' : ''}${Math.round(c.dRev / 1e3)} т₽`);
}
process.exit(bad ? 1 : 0);
