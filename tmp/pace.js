// Числа по городам: стартовые предложения, чек, аренда, площадь, год победы (бот good, сюжет выключен).
const BK = require('../sim/load');
const E = BK.Engine, CFG = BK.CFG;
const { play } = require('../sim/bot');
const years = +(process.argv[2] || 20), seeds = +(process.argv[3] || 3);
const orig = E.newGame;
function withCity(city) { E.newGame = function (o) { return orig.call(this, Object.assign({}, o || {}, city ? { city } : {})); }; }
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const rows = {};
for (const city of ['ufa', 'moscow', 'spb']) {
  withCity(city === 'ufa' ? null : city);
  const S0 = E.newGame({ seed: 7919 });
  const off = S0.offers.concat(S0.prodOffers);
  console.log(`\n=== ${BK.CITY.name} (id ${BK.CITY.id}), старт: предложений ${S0.offers.length}`);
  console.log('  районы: ' + S0.offers.map((o) => (BK.DISTRICTS.find((d) => d.id === o.district) || {}).name).join(', '));
  console.log('  соседи: ' + S0.offers.map((o) => o.landmarks.map((l) => (BK.LANDMARKS.find((x) => x.id === l) || {}).name).join('+')).join(' | '));
  console.log(`  аренда медиана ${med(off.map((o) => o.rentM2))} ₽/м², чек района ${med(off.map((o) => o.solv))} ₽, площадь ${med(off.map((o) => o.area))} м², поток ${med(off.map((o) => o.traffic))}`);
  console.log(`  размеры: small ${S0.offers.filter((o) => o.size === 'small').length}, standard ${S0.offers.filter((o) => o.size === 'standard').length}, large ${S0.offers.filter((o) => o.size === 'large').length}`);
  const res = [];
  for (let i = 1; i <= seeds; i++) {
    const r = play({ level: 'good', seed: i * 7919, years, onDay: (S) => {
      const t = E.dateOf(S.day);
      if (t.m === 0 && t.d === 2 && S.history.length) { const h = S.history[S.history.length - 1], ck = (h.pnl && h.pnl.checks) || 0;
        res[i] = res[i] || {}; res[i].y = t.y - CFG.START_YEAR; res[i].stores = h.stores; res[i].chk = ck ? Math.round(h.rev / ck) : null; res[i].rentShare = h.rev ? +(h.pnl.rent / h.rev * 100).toFixed(1) : null; res[i].rev = Math.round(h.rev / 1e6); res[i].area = S.stores.length ? med(S.stores.map((s) => s.area)) : null; }
    } });
    const wins = r.won ? r.won.year : null;
    res[i] = Object.assign({ win: wins, lost: r.lostYear, end: (BK.CITY && BK.CITY.id) }, res[i]);
    console.log(`  сид ${i}: ${wins ? 'победа на ' + wins + '-м году' : r.lostYear ? 'банкротство на ' + r.lostYear + '-м году' : 'без победы'}` + (res[i].y5 || res[i][5] ? '' : '') + (res[i][5] ? ` · год 5: чек ${res[i][5].chk} ₽, аренда ${res[i][5].rentShare} % выручки, точек ${res[i][5].stores}` : ''));
  }
  const w = Object.values(res).map((x) => x.win).filter(Boolean);
  rows[city] = res;
  console.log(`  ИТОГ ${BK.CITY.name}: побед ${w.length}/${seeds}, медиана ${med(w) || '—'}`);
}
const y5 = (c) => Object.values(rows[c]).map((x) => x && x[5]).filter(Boolean);
for (const c of ['ufa', 'moscow', 'spb']) { const a = y5(c); console.log(`\nгод 5 · ${c}: чек ${med(a.map((x) => x.chk))} ₽, аренда ${med(a.map((x) => x.rentShare))} % выручки, площадь ${med(a.map((x) => x.area))} м², точек ${med(a.map((x) => x.stores))}, выручка ${med(a.map((x) => x.rev))} млн`); }
E.newGame = orig;
