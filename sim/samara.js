/* Samara mapGen2: geography, unchanged nine archetypes, legacy saves and real city APIs.
   Coordinator runs this only after the map and captured 0.9.14 fixtures are integrated. */
'use strict';
const assert = require('node:assert/strict');
const BK = require('./load'), E = BK.Engine, C = BK.Corp;
require('../src/ui/map');
const legacy = require('../docs/releases/0.9.15-legacy-samara.json');
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
const place = (S, label) => {
  ok(E.chooseProduction(S, S.prodOffers[0].id).ok, label + ': real production');
  ok(E.rentStore(S, S.offers[0].id).ok, label + ': real first store');
};
const unlock = S => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };
BK.useCity('samara', 7919);
const detailed = world(), oldDistricts = BK.genCityGeo(BK.CITY_BY_ID.samara, 7919, 1).DISTRICTS;
eq(BK.cityMapGen('samara'), 2, 'new Samara uses mapGen2');
eq(oldDistricts.length, 9, 'legacy definition still has nine districts');
eq(BK.DISTRICTS.length, 10, 'detailed Samara has ten districts');
for (const [i, d] of BK.DISTRICTS.entries()) {
  eq(d.id, 'samara' + i, 'compatible ordered district id');
  if (i < 9) {
    eq(d.arch, oldDistricts[i].arch, 'previous archetype ' + d.id);
    for (const key of ['w','rent','solv','traffic','prodRent']) eq(d[key], oldDistricts[i][key], 'previous business range ' + d.id + '/' + key);
  } else { eq(d.arch, 'far', 'appended Kuibyshev district archetype'); ok(/Куйбышев/.test(d.name), 'new left-bank district name'); }
  ok(d.kind && d.streets.length >= 5 && new Set(d.streets).size === d.streets.length, 'distinct local streets ' + d.id);
  ok(d.lm.length && d.lm.every(id => BK.LANDMARKS.some(l => l.id === id)), 'valid landmark neighbors ' + d.id);
  ok(d.sizeW && Math.abs(Object.values(d.sizeW).reduce((a,b) => a+b, 0) - 1) < 1e-8, 'size distribution ' + d.id);
  ok(inPoly(d, BK.MAP.city) && dry(d), 'district on city land ' + d.name);
  ok(BK.MAP.pois.filter(p => p.d === d.id).length >= 2, 'district has multiple real landmarks ' + d.id);
}
eq(BK.DISTRICTS.flatMap(d => d.streets).length, 60, 'sixty district street entries');
eq(BK.MAP.pois.length, 40, 'forty geographic landmarks');
eq(BK.MAP.rivers.length, 2, 'two rivers');
for (const river of ['р. Волга','р. Самара']) ok(BK.MAP.rivers.some(r => r.name === river), 'local river ' + river);
ok(BK.MAP.roads.length >= 6 && BK.MAP.bridges.length >= 2 && (BK.MAP.rails || []).length >= 1, 'roads, crossings and railway are present');
for (const p of BK.MAP.pois) ok(inPoly(p, BK.MAP.city) && dry(p), 'landmark on city land ' + p.name);
BK.useCity('samara', 123456); eq(world(), detailed, 'detailed geography independent of seed');
for (let seed = 1; seed <= 100; seed++) {
  const S = E.newGame({ seed: seed * 7919, city: 'samara' });
  eq(S.startMapGen, 2, 'new start version ' + seed);
  ok(S.offers.concat(S.prodOffers, S.rival && S.rival.stores || []).every(p => dry(p) && inPoly(p, BK.MAP.city)), 'offers/rivals remain on land ' + seed);
  ok(S.offers.concat(S.prodOffers).every(o => BK.DISTRICTS.find(d => d.id === o.district).streets.some(st => o.address.startsWith(st))), 'local offered addresses ' + seed);
}
for (const key of ['start','corp', ...(legacy.bought ? ['bought'] : [])]) {
  const S = clone(legacy[key]), positions = S.stores.map(s => [s.id,s.x,s.y,s.address]);
  C.ensure(S); C.applyGlobals(S);
  eq(world(), legacy[key + 'World'], 'captured legacy geography ' + key);
  eq(S.stores.map(s => [s.id,s.x,s.y,s.address]), positions, 'legacy locations/addresses ' + key);
  eq(BK.DISTRICTS.length, 9, 'legacy district count ' + key);
  ok(!BK.MAP.bridges, 'legacy rendering ' + key);
  unlock(S); // Financial prerequisite only; preserve the captured map version and city records.
  ok(E.enterCity(S, 'nnov').ok, 'legacy travel ' + key);
  ok(E.switchCity(S, key === 'start' ? 'ufa' : 'samara').ok, 'legacy return ' + key);
  eq(world(), legacy[key + 'World'], 'legacy map after round trip ' + key);
}
const home = E.newGame({ seed:7919, city:'samara' }); place(home, 'Samara home'); unlock(home);
// Corp.pack has always stored coordinates rounded to 0.1 map unit.
const packedPositions = S => S.stores.map(s => [s.id,Math.round(s.x * 10) / 10,Math.round(s.y * 10) / 10,s.address]);
const positions = packedPositions(home);
ok(E.enterCity(home, 'nnov').ok, 'travel from home Samara');
ok(E.switchCity(home, 'ufa').ok, 'return to real Samara home under historical ufa corporate key');
eq(world(), detailed, 'home map remains detailed'); eq(home.stores.map(s => [s.id,s.x,s.y,s.address]), positions, 'home store preserved');
const entered = E.newGame({ seed:15838 }); unlock(entered);
ok(E.enterCity(entered, 'samara').ok, 'real corporate entry Samara');
eq(entered.corp.cities.samara.mapGen, 2, 'corporate map version'); eq(world(), detailed, 'corporate detailed world');
place(entered, 'corporate Samara');
const localPositions = packedPositions(entered);
ok(E.switchCity(entered, 'ufa').ok && E.switchCity(entered, 'samara').ok, 'corporate return');
eq(entered.stores.map(s => [s.id,s.x,s.y,s.address]), localPositions, 'corporate store preservation');
C.applyGlobals(clone(entered)); eq(world(), detailed, 'corporate map after durable load');
// Reach the actual random e208 context through public APIs, not hand-made event ctx.
let acquired = false;
for (let seed = 1; seed <= 200 && !acquired; seed++) {
  const S = E.newGame({ seed:seed * 7919 }); unlock(S);
  ok(E.enterCity(S, 'kazan').ok && E.enterCity(S, 'ekb').ok, 'real three-city acquisition fixture ' + seed);
  S.day = Math.max(366, (BK.CFG.CORP.LAUNCH_DAYS || 510) + 1); // Mature-city eligibility fixture, not a balance simulation.
  const event = BK.CorpEv.byId('e208');
  ok(BK.CorpEv.eligible(S, event), 'e208 eligible through actual company state');
  BK.CorpEv.start(S, event);
  const pending = S.ev.pending;
  if (!pending || pending.ctx.city !== 'samara') continue;
  const cost = pending.choices[0].cost, n = pending.ctx.n, money = S.cash + S.reserve;
  const result = E.resolveEvent(S, 0);
  ok(result && result.idx === 0, 'real event purchase choice');
  ok(S.cash + S.reserve < money - cost, 'price and rebrand charged');
  eq(S.corp.cities.samara.mapGen, 2, 'purchased local chain uses detailed generation');
  ok(S.corp.cities.samara.bought, 'real purchased city marker');
  ok(E.switchCity(S, 'samara').ok, 'mount purchased Samara'); eq(world(), detailed, 'purchased geography');
  eq(S.stores.length, n, 'actual offered chain size');
  ok(S.stores.concat(S.productions).every(p => dry(p) && inPoly(p, BK.MAP.city)), 'purchased network on land');
  const saved = clone(S); C.applyGlobals(saved); eq(world(), detailed, 'purchased city survives save/load');
  acquired = true;
}
ok(acquired, 'real e208 Samara target found in documented seed search');
console.log(`САМАРА: ${checks} проверок, 0 проблем`);
