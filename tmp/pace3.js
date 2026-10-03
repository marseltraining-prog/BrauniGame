// Москва со сценарием «Старт в Москве» + Уфа: год победы, год 5 (чек, аренда от выручки).
const BK = require('../sim/load');
const E = BK.Engine, CFG = BK.CFG, SC = BK.Scenario;
const { play } = require('../sim/bot');
const years = +(process.argv[2] || 20), seeds = +(process.argv[3] || 6);
const mode = process.argv[4] || 'ufa';
const orig = E.newGame;
E.newGame = function (o) { const S = orig.call(this, Object.assign({}, o || {}, mode === 'ufa' ? {} : { city: 'moscow' })); if (mode === 'scen') { SC.set(S, 'moscow'); SC.applyStart(S); } return S; };
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const w = [], chk = [], rent = [], rev = [], st5 = [];
for (let i = 1; i <= seeds; i++) {
  const y5 = {};
  const r = play({ level: 'good', seed: i * 7919, years, onDay: (S) => { const t = E.dateOf(S.day); if (t.m === 0 && t.d === 2 && S.history.length) { const h = S.history[S.history.length - 1], ck = (h.pnl && h.pnl.checks) || 0; if (t.y - CFG.START_YEAR === 5) { y5.chk = ck ? Math.round(h.rev / ck) : null; y5.rent = h.rev ? +(h.pnl.rent / h.rev * 100).toFixed(1) : null; y5.rev = Math.round(h.rev / 1e6); y5.st = h.stores; } } } });
  if (r.won) w.push(r.won.year);
  chk.push(y5.chk); rent.push(y5.rent); rev.push(y5.rev); st5.push(y5.st);
  console.log(` ${mode} сид ${i}: ${r.won ? 'победа ' + r.won.year : r.lostYear ? 'банкрот ' + r.lostYear : 'без победы'} · год 5: чек ${y5.chk} ₽, аренда ${y5.rent} %, выручка ${y5.rev} млн, точек ${y5.st}`);
}
console.log(`${mode}: побед ${w.length}/${seeds}, медиана ${med(w) || '—'} · год 5 медиана: чек ${med(chk)} ₽, аренда ${med(rent)} %, выручка ${med(rev)} млн, точек ${med(st5)}`);
E.newGame = orig;
