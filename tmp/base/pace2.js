// Города без правил истории: сколько лет до победы (бот good). Сравнение Уфа / Москва / Питер.
const BK = require('./sim/load');
const E = BK.Engine, CFG = BK.CFG;
const { play } = require('./sim/bot');
const years = +(process.argv[2] || 20), seeds = +(process.argv[3] || 6);
const want = (process.argv[4] || 'ufa,moscow,spb').split(',');
const orig = E.newGame;
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
for (const city of want) {
  E.newGame = function (o) { return orig.call(this, Object.assign({}, o || {}, city === 'ufa' ? {} : { city })); };
  const w = [], lost = [], chk5 = [], rs5 = [];
  for (let i = 1; i <= seeds; i++) {
    const rows = {};
    const r = play({ level: 'good', seed: i * 7919, years, onDay: (S) => { const t = E.dateOf(S.day); if (t.m === 0 && t.d === 2 && S.history.length) { const h = S.history[S.history.length - 1], ck = (h.pnl && h.pnl.checks) || 0; rows.t = t.y - CFG.START_YEAR; if (rows.t === 5) { chk5.push(ck ? Math.round(h.rev / ck) : null); rs5.push(h.rev ? +(h.pnl.rent / h.rev * 100).toFixed(1) : null); } } } });
    if (r.won) w.push(r.won.year); if (r.lostYear) lost.push(r.lostYear);
    console.log(` ${city} сид ${i}: ${r.won ? 'победа ' + r.won.year : r.lostYear ? 'банкрот ' + r.lostYear : 'без победы'} (точек ${r.S && r.S.stores ? r.S.stores.length : '?'})`);
  }
  console.log(` ${city}: побед ${w.length}/${seeds}, медиана ${med(w) || '—'}, банкротств ${lost.length}${lost.length ? ' (' + lost.join(', ') + ')' : ''}, год 5: чек ${med(chk5)} ₽, аренда ${med(rs5)} % выручки\n`);
}
E.newGame = orig;
