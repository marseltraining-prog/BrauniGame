// Пассивный игрок: открывает цех и первую точку и дальше ничего не делает
// (события — бесплатный вариант, меню — без изменений). Проверяем, как быстро тает команда
// и приходят ли предупреждения ДО увольнений.
// Запуск: node sim/passive.js [сидов] [дней]
const BK = require('./load');
const E = BK.Engine;
const { estStore } = require('./bot');

function run(seed, days) {
  const S = E.newGame({ seed });
  const po = S.prodOffers.slice().sort((a, b) => E.prodOpenCost(S, a).total - E.prodOpenCost(S, b).total)[1] || S.prodOffers[0];
  E.chooseProduction(S, po.id);
  // первая точка — самая быстрая окупаемость среди доступных (как подсказывает интерфейс «окупаемость»)
  const aff = S.offers.filter((o) => E.storeOpenCost(S, o).total <= S.cash - 1e6).map((o) => ({ o, e: estStore(S, o) })).sort((a, b) => a.e.payback - b.e.payback);
  const first = aff.length ? aff[0].o : S.offers[0];
  if (!E.rentStore(S, first.id).ok) return null;
  const st = S.stores[0];
  const res = { seed, size: st.size, start: st.staffTarget, warnDay: null, firstWarnKind: null, firstQuit: null, quits: 0, staff90: null, staff180: null, minCash: Infinity, lost: false, moods: [] };
  let quitsLogged = 0;
  while (S.day < days && !S.lost) {
    if (S.ev.pending) { const ch = S.ev.pending.choices; let i = 0; if (ch) { i = ch.findIndex((c) => !c.cost); if (i < 0) i = 0; } E.resolveEvent(S, i); }
    if (S.chef.pending) E.chefConfirm(S, [], []);
    S.notify.length = 0;
    if (!E.tick(S)) continue;
    for (const n of S.notify) {
      if (n.type === 'toast' && /недовол|увол|устал|выгор/i.test(n.title + ' ' + n.text) && res.warnDay == null && !/уволил/i.test(n.title)) { res.warnDay = S.day; res.firstWarnKind = n.title; }
    }
    if (S.stats.quits > quitsLogged) { if (res.firstQuit == null) res.firstQuit = S.day; quitsLogged = S.stats.quits; }
    if (S.day === 90) res.staff90 = st.staff.length + '/' + st.staffTarget;
    if (S.day % 30 === 0 && st.staff.length) res.moods.push(Math.round(st.staff.reduce((a, e) => a + e.mood, 0) / st.staff.length) + (st.today ? '@' + st.today.load.toFixed(2) : ''));
    res.minCash = Math.min(res.minCash, S.cash);
  }
  res.staff180 = st.staff.length + '/' + st.staffTarget;
  res.quits = S.stats.quits; res.lost = S.lost; res.minCash = Math.round(res.minCash / 1e6);
  res.moods = res.moods.join(' ');
  return res;
}

if (require.main === module) {
  const seeds = +(process.argv[2] || 8), days = +(process.argv[3] || 180);
  const rows = [];
  for (let s = 1; s <= seeds; s++) { const r = run(s * 7919, days); if (r) rows.push(r); }
  console.table(rows);
}
module.exports = { run };
