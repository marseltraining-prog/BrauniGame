// Средние по популяции стартовых предложений Москвы (200 зёрен): сдвинулось ли соседство числа.
const BK = require('../sim/load'); const E = BK.Engine;
const orig = E.newGame;
E.newGame = function (o) { return orig.call(this, Object.assign({}, o || {}, { city: 'moscow' })); };
const acc = { solv: [], rent: [], tr: [], area: [] };
for (let i = 1; i <= 200; i++) { const S = E.newGame({ seed: i * 7919 + 13 }); for (const o of S.offers) { acc.solv.push(o.solv); acc.rent.push(o.rentM2); acc.tr.push(o.traffic); acc.area.push(o.area); } }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`Москва, ${acc.solv.length} предложений: чек средний ${mean(acc.solv).toFixed(1)} медиана ${med(acc.solv)} · аренда ${mean(acc.rent).toFixed(1)}/${med(acc.rent)} · поток ${Math.round(mean(acc.tr))}/${med(acc.tr)} · площадь ${mean(acc.area).toFixed(1)}/${med(acc.area)}`);
E.newGame = orig;
