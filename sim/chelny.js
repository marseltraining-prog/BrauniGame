/* Набережные Челны, mapGen 2: география, прежние архетипы и экономика, старые сохранения,
   реальные городские API. Снимок старых сохранений — docs/releases/0.9.25-legacy-chelny.json
   (снят tools/capture-legacy-city.js ДО подключения карты, переснимать нельзя). */
'use strict';
const assert = require('node:assert/strict');
const BK = require('./load'), E = BK.Engine, C = BK.Corp;
require('../src/ui/map');
const legacy = require('../docs/releases/0.9.25-legacy-chelny.json');
let checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const clone = x => JSON.parse(JSON.stringify(x));
const world = () => clone({ map: BK.MAP, districts: BK.DISTRICTS, center: BK.CENTER_POINT });
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function lineDistance(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a[0] - t * dx, p.y - a[1] - t * dy));
  }
  return best;
}
const dry = p => !(BK.MAP.sea || []).some(s => inPoly(p, s.pts)) && !(BK.MAP.rivers || []).some(r => lineDistance(p, r.pts) < r.w / 2 + 3);
const segX = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
const crosses = (pts, river) => pts.slice(1).some((b, i) => river.pts.slice(1).some((d, j) => segX(pts[i], b, river.pts[j], d)));
const place = (S, label) => { ok(E.chooseProduction(S, S.prodOffers[0].id).ok, label + ': real production'); ok(E.rentStore(S, S.offers[0].id).ok, label + ': real first store'); };
const unlock = S => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };

BK.useCity('chelny', 7919);
const detailed = world(), oldDistricts = BK.genCityGeo(BK.CITY_BY_ID.chelny, 7919, 1).DISTRICTS;
eq(BK.cityMapGen('chelny'), 2, 'new Sterlitamak uses mapGen 2');
eq(oldDistricts.length, 7, 'legacy definition has seven districts');
eq(BK.DISTRICTS.length, 7, 'detailed map keeps seven districts');
eq(BK.DISTRICTS.map(d => [d.name, d.arch]), [['Новый город', 'center'], ['Проспект Мира', 'biz'], ['ГЭС', 'sleep'], ['Комсомольский', 'sleep'], ['ЗЯБ', 'far'], ['Сидоровка', 'far'], ['Промзона КАМАЗа', 'industrial']], 'original ordered district names/archetypes');
for (const [i, d] of BK.DISTRICTS.entries()) {
  eq(d.id, 'chelny' + i, 'compatible ordered district id');
  eq(d.name, oldDistricts[i].name, 'previous name ' + d.id);
  eq(d.arch, oldDistricts[i].arch, 'previous archetype ' + d.id);
  eq(d.w, oldDistricts[i].w, 'previous weight ' + d.id);
  // У схемы свои диапазоны: трафик выше (город компактнее), аренда чуть выше, платёжеспособность близка.
  ok(d.rent.every((v, j) => Math.abs(v / oldDistricts[i].rent[j] - 1) < 0.12), 'rent close to the old range ' + d.id);
  ok(d.solv.every((v, j) => Math.abs(v / oldDistricts[i].solv[j] - 1) < 0.08), 'solvency close to the old range ' + d.id);
  ok(d.traffic.every((v, j) => Math.abs(v / oldDistricts[i].traffic[j] - 1) < 0.3), 'traffic within a quarter of the old range ' + d.id);
  ok(d.kind && d.streets.length >= 6 && new Set(d.streets).size === d.streets.length, 'distinct local streets ' + d.id);
  ok(!(d.lm || []).length || d.lm.every(id => BK.LANDMARKS.some(l => l.id === id)), 'landmark neighbors (empty = all, as the generator) ' + d.id);
  ok(d.sizeW && Math.abs(Object.values(d.sizeW).reduce((a, b) => a + b, 0) - 1) < 1e-8, 'size distribution ' + d.id);
  ok(inPoly(d, BK.MAP.city) && dry(d), 'district on city land ' + d.name);
  ok(BK.MAP.pois.filter(p => p.d === d.id).length >= 3, 'district has real landmarks ' + d.id);
}
eq(BK.DISTRICTS.flatMap(d => d.streets).length, 54, '54 district street entries');
eq(new Set(BK.DISTRICTS.flatMap(d => d.streets)).size, 54, '54 distinct local streets');
ok(BK.MAP.pois.length >= 40, 'at least forty geographic landmarks');
eq(BK.MAP.rivers.length, 3, 'three rivers');
for (const name of ['р. Кама', 'р. Челна', 'р. Мелекеска']) ok(BK.MAP.rivers.some(r => r.name === name), 'local river ' + name);
eq(BK.MAP.roads.length, 24, '24 roads');
eq(BK.MAP.bridges.length, 12, 'twelve crossings');
eq((BK.MAP.rails || []).length, 2, 'two railway lines');
eq(BK.MAP.parks.length, 4, 'four parks');
ok(BK.MAP.labels.length >= 6, 'map labels present');
for (const br of BK.MAP.bridges) {
  ok(BK.MAP.rivers.some(r => crosses(br.pts, r)), 'bridge crosses water: ' + br.name);
  ok(br.pts.some(pt => BK.MAP.roads.some(rd => lineDistance({ x: pt[0], y: pt[1] }, rd.pts) < 18) || (BK.MAP.rails || []).some(rl => lineDistance({ x: pt[0], y: pt[1] }, rl) < 18)), 'bridge stands on a road/rail: ' + br.name);
}
// Every road/rail crossing of water must be at a listed bridge.
const paths = BK.MAP.roads.map(rd => ({ name: rd.name, pts: rd.pts })).concat((BK.MAP.rails || []).map((pts, i) => ({ name: 'rail' + (i + 1), pts })));
for (const path of paths) for (const r of BK.MAP.rivers) for (let i = 1; i < path.pts.length; i++) for (let j = 1; j < r.pts.length; j++) {
  if (!segX(path.pts[i - 1], path.pts[i], r.pts[j - 1], r.pts[j])) continue;
  const m = [(path.pts[i - 1][0] + path.pts[i][0]) / 2, (path.pts[i - 1][1] + path.pts[i][1]) / 2];
  ok(BK.MAP.bridges.some(br => br.pts.some(p => Math.hypot(p[0] - m[0], p[1] - m[1]) < 40)), 'water crossed only at a bridge: ' + (path.name || 'rail') + ' / ' + r.name);
}
for (const p of BK.MAP.pois) ok(inPoly(p, BK.MAP.city) && dry(p), 'landmark on city land ' + p.name);
for (const l of BK.MAP.labels) ok(l.x > 20 && l.x < 980 && l.y > 20 && l.y < 980, 'label inside sheet ' + l.text);
BK.useCity('chelny', 123456); eq(world(), detailed, 'detailed geography independent of seed');
for (let seed = 1; seed <= 24; seed++) {
  const S = E.newGame({ seed: seed * 7919, city: 'chelny' });
  eq(S.startMapGen, 2, 'new start version ' + seed);
  ok(S.offers.concat(S.prodOffers, S.rival && S.rival.stores || []).every(p => inPoly(p, BK.MAP.city)), 'offers/rivals stay inside the city ' + seed);
  ok(S.offers.concat(S.prodOffers).every(o => BK.DISTRICTS.find(d => d.id === o.district).streets.some(st => o.address.startsWith(st))), 'local offered addresses ' + seed);
}
for (const key of ['start', 'corp', 'bought']) {
  ok(legacy[key] && legacy[key + 'World'], 'captured legacy fixture ' + key);
  const S = clone(legacy[key]), positions = S.stores.map(s => [s.id, s.x, s.y, s.address]);
  C.ensure(S); C.applyGlobals(S);
  eq(world(), legacy[key + 'World'], 'captured legacy geography ' + key);
  eq(S.stores.map(s => [s.id, s.x, s.y, s.address]), positions, 'legacy locations/addresses ' + key);
  eq(BK.DISTRICTS.length, 7, 'legacy district count ' + key);
  ok(!BK.MAP.bridges, 'legacy rendering ' + key);
  unlock(S);
  ok(E.enterCity(S, 'voronezh').ok, 'legacy travel ' + key);
  ok(E.switchCity(S, key === 'start' ? 'ufa' : 'chelny').ok, 'legacy return ' + key);
  eq(world(), legacy[key + 'World'], 'legacy map after round trip ' + key);
}
const home = E.newGame({ seed: 7919, city: 'chelny' }); place(home, 'Sterlitamak home'); unlock(home);
const packed = S => S.stores.map(s => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, s.address]);
const positions = packed(home);
ok(E.enterCity(home, 'voronezh').ok, 'travel from home Sterlitamak');
ok(E.switchCity(home, 'ufa').ok, 'return to historical home key');
eq(world(), detailed, 'home map remains detailed');
eq(home.stores.map(s => [s.id, s.x, s.y, s.address]), positions, 'home store preserved');
const entered = E.newGame({ seed: 15838 }); unlock(entered);
ok(E.enterCity(entered, 'chelny').ok, 'real corporate entry Sterlitamak');
eq(entered.corp.cities.chelny.mapGen, 2, 'corporate map version');
eq(world(), detailed, 'corporate detailed world');
place(entered, 'corporate Sterlitamak');
const localPositions = packed(entered);
ok(E.switchCity(entered, 'ufa').ok && E.switchCity(entered, 'chelny').ok, 'corporate return');
eq(entered.stores.map(s => [s.id, s.x, s.y, s.address]), localPositions, 'corporate store preservation');
C.applyGlobals(clone(entered)); eq(world(), detailed, 'corporate map after durable load');
console.log(`НАБЕРЕЖНЫЕ ЧЕЛНЫ: ${checks} проверок, 0 проблем`);
