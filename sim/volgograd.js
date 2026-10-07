/* Volgograd mapGen2: geography, unchanged nine archetypes, legacy saves and real city APIs.
   Legacy fixture docs/releases/0.9.20-legacy-volgograd.json снят tools/capture-legacy-city.js на mapGen1 (до карты);
   переснимать после подключения карты нельзя. */
'use strict';
const assert = require('node:assert/strict');
const BK = require('./load'), E = BK.Engine, C = BK.Corp;
require('../src/ui/map');
const legacy = require('../docs/releases/0.9.20-legacy-volgograd.json');
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
const place = (S, label) => {
  ok(E.chooseProduction(S, S.prodOffers[0].id).ok, label + ': real production');
  ok(E.rentStore(S, S.offers[0].id).ok, label + ': real first store');
};
const unlock = S => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };
BK.useCity('volgograd', 7919);
const detailed = world(), oldDistricts = BK.genCityGeo(BK.CITY_BY_ID.volgograd, 7919, 1).DISTRICTS;
eq(BK.cityMapGen('volgograd'), 2, 'new Volgograd uses mapGen2');
eq(oldDistricts.length, 9, 'legacy definition still has nine districts');
eq(BK.DISTRICTS.length, 9, 'detailed Volgograd retains nine districts');
eq(BK.DISTRICTS.map(d => [d.name, d.arch]), [['Центральный', 'center'], ['Ворошиловский', 'biz'], ['Дзержинский', 'prestige'], ['Краснооктябрьский', 'sleep'], ['Советский', 'sleep'], ['Спартановка', 'sleep'], ['Кировский', 'far'], ['Красноармейский', 'far'], ['Тракторозаводский', 'industrial']], 'original ordered district names/archetypes');
eq(BK.CITY_BY_ID.volgograd.archK, undefined, 'Volgograd still has no archK');
eq([BK.CITY_BY_ID.volgograd.shape, BK.CITY_BY_ID.volgograd.water, BK.CITY_BY_ID.volgograd.muslim, BK.CITY_BY_ID.volgograd.kmK, BK.CITY_BY_ID.volgograd.prod2, BK.CITY_BY_ID.volgograd.hot], ['river-strip', 'strip', 0.15, 1.6, 10, { drinks: 0.2 }], 'unchanged Volgograd features (city-strip delivery ×1.6, second workshop from 10 stores, hot summer)');
for (const [key, value] of Object.entries({ pop: 1.02, inc: 0.85, rent: 0.75, wage: 0.88, comp: 'low', km: 1290, cap: 40 })) eq(BK.CITY_BY_ID.volgograd[key], value, 'unchanged city coefficient ' + key);
for (const [i, d] of BK.DISTRICTS.entries()) {
  eq(d.id, 'volgograd' + i, 'compatible ordered district id');
  eq(d.name, oldDistricts[i].name, 'previous district name ' + d.id);
  eq(d.arch, oldDistricts[i].arch, 'previous archetype ' + d.id);
  // Both generations apply city/archK once. Raw module ranges must not double them.
  for (const key of ['w','rent','solv','traffic','prodRent']) eq(d[key], oldDistricts[i][key], 'previous business range ' + d.id + '/' + key);
  ok(d.kind && d.streets.length === 6 && new Set(d.streets).size === d.streets.length, 'distinct local streets ' + d.id);
  ok(d.lm.length && d.lm.every(id => BK.LANDMARKS.some(l => l.id === id)), 'valid landmark neighbors ' + d.id);
  ok(d.sizeW && Math.abs(Object.values(d.sizeW).reduce((a,b) => a+b, 0) - 1) < 1e-8, 'size distribution ' + d.id);
  ok(inPoly(d, BK.MAP.city) && dry(d), 'district on city land ' + d.name);
  ok(BK.MAP.pois.filter(p => p.d === d.id).length >= 2, 'district has multiple real landmarks ' + d.id);
}
eq(BK.DISTRICTS.flatMap(d => d.streets).length, 54, 'fifty-four district street entries');
eq(new Set(BK.DISTRICTS.flatMap(d => d.streets)).size, 54, 'fifty-four distinct local streets');
eq(BK.MAP.pois.length, 40, 'forty geographic landmarks');
eq(BK.MAP.sea.length, 1, 'Volga-Don canal polygon');
for (const name of ['Волго-Донской канал']) ok(BK.MAP.sea.some(w => w.name === name), 'local water body ' + name);
eq(BK.MAP.parks.length, 4, 'four green landmarks');
eq(BK.MAP.rivers.length, 2, 'Volga and Akhtuba');
for (const river of ['р. Волга', 'р. Ахтуба']) ok(BK.MAP.rivers.some(r => r.name === river), 'local river ' + river);
ok(BK.MAP.roads.length === 12 && BK.MAP.bridges.length === 2 && (BK.MAP.rails || []).length === 3, 'roads, crossings and railway are present');
// Only confirmed Volga crossings: the 2009 bridge from Mamayev Kurgan and the Volzhskaya GES dam.
eq(BK.MAP.bridges.map(b => b.name), ['Мост через Волгу («танцующий»)', 'Плотина Волжской ГЭС'], 'confirmed Volga crossings only');
const volga = BK.MAP.rivers.find(r => r.name === 'р. Волга');
for (const br of BK.MAP.bridges) ok(crosses(br.pts, volga), 'crossing spans the Volga ' + br.name);
// The ribbon city: north (Спартановка) to south (Красноармейский) spans most of the scheme.
const byName = n => BK.DISTRICTS.find(d => d.name === n);
ok(byName('Спартановка').y < byName('Тракторозаводский').y && byName('Тракторозаводский').y < byName('Краснооктябрьский').y && byName('Краснооктябрьский').y < byName('Центральный').y && byName('Центральный').y < byName('Ворошиловский').y && byName('Ворошиловский').y < byName('Кировский').y && byName('Кировский').y < byName('Красноармейский').y, 'riverside districts ordered north to south along the Volga');
ok(byName('Красноармейский').y - byName('Спартановка').y > 700, 'long ribbon city kept long');
// City and every district lie on the right (west) bank: the Volga is east of each district.
for (const d of BK.DISTRICTS) { const pts = volga.pts, i = pts.findIndex((p, k) => k && p[1] >= d.y), a = pts[i - 1], b = pts[i]; ok(d.x < a[0] + (b[0] - a[0]) * (d.y - a[1]) / (b[1] - a[1]), 'right bank ' + d.name); }
// Every bridge actually crosses a drawn river; no road crosses a river away from a listed bridge.
for (const br of BK.MAP.bridges) ok(BK.MAP.rivers.some(r => crosses(br.pts, r)), 'bridge crosses river ' + br.name);
for (const road of BK.MAP.roads) for (const r of BK.MAP.rivers) for (let i = 1; i < road.pts.length; i++) for (let j = 1; j < r.pts.length; j++) {
  if (!segX(road.pts[i - 1], road.pts[i], r.pts[j - 1], r.pts[j])) continue;
  const m = [(road.pts[i - 1][0] + road.pts[i][0]) / 2, (road.pts[i - 1][1] + road.pts[i][1]) / 2];
  ok(BK.MAP.bridges.some(br => br.pts.some(p => Math.hypot(p[0] - road.pts[i - 1][0], p[1] - road.pts[i - 1][1]) < 60 || Math.hypot(p[0] - road.pts[i][0], p[1] - road.pts[i][1]) < 60 || Math.hypot(p[0] - m[0], p[1] - m[1]) < 60)), 'road crosses ' + r.name + ' only at a bridge: ' + road.name);
}
// Big malls are where the economy can see them (Chelyabinsk lost ~3 years without any mall).
// Volgograd: «Европа Сити Молл», Ворошиловский ТЦ, «Мармелад», «Акварель».
eq(BK.DISTRICTS.filter(d => d.lm.includes('mall')).map(d => d.id), ['volgograd0', 'volgograd1', 'volgograd2', 'volgograd4'], 'mall neighbours in districts with real large malls');
for (const p of BK.MAP.pois) ok(inPoly(p, BK.MAP.city) && dry(p), 'landmark on city land ' + p.name);
BK.useCity('volgograd', 123456); eq(world(), detailed, 'detailed geography independent of seed');
for (let seed = 1; seed <= 100; seed++) {
  const S = E.newGame({ seed: seed * 7919, city: 'volgograd' });
  eq(S.startMapGen, 2, 'new start version ' + seed);
  ok(S.offers.concat(S.prodOffers, S.rival && S.rival.stores || []).every(p => dry(p) && inPoly(p, BK.MAP.city)), 'offers/rivals remain on land ' + seed);
  ok(S.offers.concat(S.prodOffers).every(o => BK.DISTRICTS.find(d => d.id === o.district).streets.some(st => o.address.startsWith(st))), 'local offered addresses ' + seed);
}
for (const key of ['start','corp','bought']) {
  ok(legacy[key] && legacy[key + 'World'], 'captured legacy fixture ' + key);
  const S = clone(legacy[key]), positions = S.stores.map(s => [s.id,s.x,s.y,s.address]);
  C.ensure(S); C.applyGlobals(S);
  eq(world(), legacy[key + 'World'], 'captured legacy geography ' + key);
  eq(S.stores.map(s => [s.id,s.x,s.y,s.address]), positions, 'legacy locations/addresses ' + key);
  eq(BK.DISTRICTS.length, 9, 'legacy district count ' + key);
  ok(!BK.MAP.bridges, 'legacy rendering ' + key);
  unlock(S); // Financial prerequisite only; preserve the captured map version and city records.
  ok(E.enterCity(S, 'voronezh').ok, 'legacy travel ' + key);
  ok(E.switchCity(S, key === 'start' ? 'ufa' : 'volgograd').ok, 'legacy return ' + key);
  eq(world(), legacy[key + 'World'], 'legacy map after round trip ' + key);
}
const home = E.newGame({ seed:7919, city:'volgograd' }); place(home, 'Volgograd home'); unlock(home);
// Corp.pack has always stored coordinates rounded to 0.1 map unit.
const packedPositions = S => S.stores.map(s => [s.id,Math.round(s.x * 10) / 10,Math.round(s.y * 10) / 10,s.address]);
const positions = packedPositions(home);
ok(E.enterCity(home, 'voronezh').ok, 'travel from home Volgograd');
ok(E.switchCity(home, 'ufa').ok, 'return to real Volgograd home under historical ufa corporate key');
eq(world(), detailed, 'home map remains detailed'); eq(home.stores.map(s => [s.id,s.x,s.y,s.address]), positions, 'home store preserved');
const entered = E.newGame({ seed:15838 }); unlock(entered);
ok(E.enterCity(entered, 'volgograd').ok, 'real corporate entry Volgograd');
eq(entered.corp.cities.volgograd.mapGen, 2, 'corporate map version'); eq(world(), detailed, 'corporate detailed world');
place(entered, 'corporate Volgograd');
const localPositions = packedPositions(entered);
ok(E.switchCity(entered, 'ufa').ok && E.switchCity(entered, 'volgograd').ok, 'corporate return');
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
  if (!pending || pending.ctx.city !== 'volgograd') continue;
  const cost = pending.choices[0].cost, n = pending.ctx.n, money = S.cash + S.reserve;
  const result = E.resolveEvent(S, 0);
  ok(result && result.idx === 0, 'real event purchase choice');
  ok(S.cash + S.reserve < money - cost, 'price and rebrand charged');
  eq(S.corp.cities.volgograd.mapGen, 2, 'purchased local chain uses detailed generation');
  ok(S.corp.cities.volgograd.bought, 'real purchased city marker');
  ok(E.switchCity(S, 'volgograd').ok, 'mount purchased Volgograd'); eq(world(), detailed, 'purchased geography');
  eq(S.stores.length, n, 'actual offered chain size');
  ok(S.stores.concat(S.productions).every(p => dry(p) && inPoly(p, BK.MAP.city)), 'purchased network on land');
  const saved = clone(S); C.applyGlobals(saved); eq(world(), detailed, 'purchased city survives save/load');
  acquired = true;
}
ok(acquired, 'real e208 Volgograd target found in documented seed search');
console.log(`ВОЛГОГРАД: ${checks} проверок, 0 проблем`);
