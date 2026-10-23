/* Четыре последних подробных города (0.9.27): Тюмень, Воронеж, Краснодар, Сочи.
   Структура, география, вода, мосты, старые сохранения и реальные городские API — одним прогоном. */
'use strict';
const assert = require('node:assert/strict');
const BK = require('./load'), E = BK.Engine, C = BK.Corp;
require('../src/ui/map');
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
const place = (S, label) => { S.cash = 1e12; ok(E.chooseProduction(S, S.prodOffers[0].id).ok, label + ': real production'); ok(E.rentStore(S, S.offers[0].id).ok, label + ': real first store'); };
const unlock = S => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };
const CITIES = ['tyumen', 'voronezh', 'krasnodar', 'sochi'];
for (const id of CITIES) {
  const def = BK.CITY_BY_ID[id], legacy = require(`../docs/releases/0.9.27-legacy-${id}.json`);
  BK.useCity(id, 7919);
  const detailed = world(), old = BK.genCityGeo(def, 7919, 1).DISTRICTS, label = def.name;
  eq(BK.cityMapGen(id), 2, label + ': mapGen 2');
  eq(old.length, def.districts.length, label + ': legacy district count ' + old.length);
  eq(BK.DISTRICTS.length, def.districts.length, label + ': detailed district count');
  eq(BK.DISTRICTS.map(d => [d.name, d.arch]), def.districts.map(([n, a]) => [n, a]), label + ': original names/archetypes/order');
  for (const [i, d] of BK.DISTRICTS.entries()) {
    eq(d.id, id + i, label + ': compatible district id ' + i);
    ok(d.w > 0, `${label}: positive weight ${d.id}`);
    for (const key of ['rent', 'solv', 'traffic', 'prodRent']) ok(Array.isArray(d[key]) && d[key].length === 2 && d[key].every(v => v > 0), `${label}: positive ${key} ${d.id}`);
    ok(d.kind && d.streets.length >= 4, label + ': local streets ' + d.id);
    ok(!(d.lm || []).length || d.lm.every(x => BK.LANDMARKS.some(l => l.id === x)), label + ': landmark neighbors ' + d.id);
    ok(d.sizeW && Math.abs(Object.values(d.sizeW).reduce((a, b) => a + b, 0) - 1) < 1e-8, label + ': size distribution ' + d.id);
    ok(inPoly(d, BK.MAP.city) && dry(d), label + ': district on land ' + d.name);
    ok(BK.MAP.pois.filter(p => p.d === d.id).length >= 2, label + ': district landmarks ' + d.id);
  }
  const streets = BK.DISTRICTS.flatMap(d => d.streets);
  ok(streets.length >= 50 && new Set(streets).size === streets.length, `${label}: at least 50 distinct streets (${streets.length})`);
  ok(BK.MAP.pois.length >= 36, `${label}: at least 36 landmarks (${BK.MAP.pois.length})`);
  ok(BK.MAP.rivers.length >= 1, label + ': river present');
  ok(BK.MAP.rivers.every(r => r.name && r.name.length > 1), label + ': river names');
  ok(BK.MAP.roads.length >= 10, `${label}: roads (${BK.MAP.roads.length})`);
  ok(BK.MAP.bridges.length >= 2, `${label}: bridges (${BK.MAP.bridges.length})`);
  ok((BK.MAP.rails || []).length >= 1, label + ': railway');
  ok(BK.MAP.parks.length >= 2, label + ': parks');
  ok((BK.MAP.labels || []).length >= 5, label + ': labels');
  for (const br of BK.MAP.bridges) {
    ok(BK.MAP.rivers.some(r => crosses(br.pts, r)), label + ': bridge crosses water ' + br.name);
    ok(br.pts.some(pt => BK.MAP.roads.some(rd => lineDistance({ x: pt[0], y: pt[1] }, rd.pts) < 18) || (BK.MAP.rails || []).some(rl => lineDistance({ x: pt[0], y: pt[1] }, rl) < 18)), label + ': bridge on road/rail ' + br.name);
  }
  const paths = BK.MAP.roads.map(rd => ({ name: rd.name, pts: rd.pts })).concat((BK.MAP.rails || []).map((pts, i) => ({ name: 'rail' + (i + 1), pts })));
  let unbridged = 0;
  for (const path of paths) for (const r of BK.MAP.rivers) for (let i = 1; i < path.pts.length; i++) for (let j = 1; j < r.pts.length; j++) {
    if (!segX(path.pts[i - 1], path.pts[i], r.pts[j - 1], r.pts[j])) continue;
    const m = [(path.pts[i - 1][0] + path.pts[i][0]) / 2, (path.pts[i - 1][1] + path.pts[i][1]) / 2];
    if (!BK.MAP.bridges.some(br => br.pts.some(p => Math.hypot(p[0] - m[0], p[1] - m[1]) < 45))) unbridged++;
  }
  eq(unbridged, 0, label + ': every water crossing has a bridge');
  for (const p of BK.MAP.pois) ok(inPoly(p, BK.MAP.city) && dry(p), label + ': landmark on land ' + p.name);
  for (const l of BK.MAP.labels) ok(l.x > 10 && l.x < 990 && l.y > 10 && l.y < 990, label + ': label inside ' + l.text);
  BK.useCity(id, 123456); eq(world(), detailed, label + ': geography independent of seed');
  for (let seed = 1; seed <= 12; seed++) {
    const S = E.newGame({ seed: seed * 7919, city: id });
    eq(S.startMapGen, 2, `${label}: new start version ${seed}`);
    ok(S.offers.concat(S.prodOffers, S.rival && S.rival.stores || []).every(p => p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 1000), `${label}: offers on the sheet ${seed}`);
    ok(S.offers.concat(S.prodOffers).every(o => BK.DISTRICTS.find(d => d.id === o.district).streets.some(st => o.address.startsWith(st))), `${label}: local addresses ${seed}`);
  }
  for (const key of ['start', 'corp', 'bought']) {
    ok(legacy[key] && legacy[key + 'World'], label + ': legacy fixture ' + key);
    const S = clone(legacy[key]), positions = S.stores.map(s => [s.id, s.x, s.y, s.address]);
    C.ensure(S); C.applyGlobals(S);
    eq(world(), legacy[key + 'World'], `${label}: legacy geography ${key}`);
    eq(S.stores.map(s => [s.id, s.x, s.y, s.address]), positions, `${label}: legacy places ${key}`);
    ok(!BK.MAP.bridges, `${label}: legacy rendering ${key}`);
    unlock(S);
    C.applyGlobals(clone(S)); eq(world(), legacy[key + 'World'], `${label}: legacy map after durable load ${key}`);
  }
  const home = E.newGame({ seed: 7919, city: id }); place(home, label + ' home'); unlock(home);
  const packed = S => S.stores.map(s => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, s.address]);
  const positions = packed(home);
  ok(E.enterCity(home, id === 'voronezh' ? 'kazan' : 'voronezh').ok, label + ': travel from home');
  ok(E.switchCity(home, 'ufa').ok, label + ': return home');
  eq(world(), detailed, label + ': home map remains detailed');
  eq(home.stores.map(s => [s.id, s.x, s.y, s.address]), positions, label + ': home store preserved');
  const entered = E.newGame({ seed: 15838 }); unlock(entered);
  ok(E.enterCity(entered, id).ok, label + ': corporate entry');
  eq(entered.corp.cities[id].mapGen, 2, label + ': corporate map version');
  eq(world(), detailed, label + ': corporate world');
  place(entered, label + ' corporate');
  const local = packed(entered);
  ok(E.switchCity(entered, 'ufa').ok && E.switchCity(entered, id).ok, label + ': corporate return');
  eq(entered.stores.map(s => [s.id, s.x, s.y, s.address]), local, label + ': corporate store preserved');
  C.applyGlobals(clone(entered)); eq(world(), detailed, label + ': corporate map after durable load');
  console.log(`  ${label}: ${BK.MAP.rivers.length} реки, ${BK.MAP.bridges.length} мостов, ${BK.MAP.pois.length} мест, ${streets.length} улиц`);
}
console.log(`ЧЕТЫРЕ ГОРОДА: ${checks} проверок, 0 проблем`);
