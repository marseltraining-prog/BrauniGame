// Своя кофейня в каждом городе: реальные помещения и переход в сеть с покупкой пекарни наставника.
const assert = require('assert/strict');
const BK = require('./load');
let checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; };
for (const city of BK.CITIES) {
  const S = BK.Engine.newGame({ seed: 7919, city: city.id });
  BK.Stage1.start(S);
  const T = S.stage1;
  ok(T.spots.length === BK.CFG.STAGE1.SPOTS.length, `${city.id}: все варианты помещений`);
  ok(T.spots.every(s => BK.DISTRICTS.some(d => d.id === s.district)), `${city.id}: районы города`);
  const affordable = T.spots.map((sp, i) => ({ i, cost: BK.Stage1.spotCost(S, sp).total })).filter(x => x.cost <= S.cash);
  ok(affordable.length > 0, `${city.id}: есть доступная кофейня`);
  ok(BK.Stage1.pick(S, affordable.sort((a, b) => a.cost - b.cost)[0].i).ok, `${city.id}: открыть кофейню`);
  T.flags.kalachMine = true;
  BK.Stage1.store(S).status = 'open';
  BK.Stage1.finish(S);
  const kalach = S.stores.find(x => x.kalach); // «Продайте мне»: «Калач» — точка №2 сразу (не предложение аренды)
  ok(kalach && BK.DISTRICTS.some(d => d.id === kalach.district), `${city.id}: пекарня наставника на местной карте`);
  ok(S.stores.length === 2 && !S.offers.some(x => x.kalach), `${city.id}: «Калач» — своя точка №2`);
  const raw = JSON.parse(JSON.stringify(S));
  BK.Corp.ensure(raw);
  ok(BK.CITY.id === city.id, `${city.id}: сохранение после кофейни`);
}
console.log(`СВОЯ КОФЕЙНЯ: ${checks} проверок, 0 проблем`);
