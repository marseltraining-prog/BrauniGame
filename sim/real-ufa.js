/* Настоящая Уфа во втором акте у партии, начатой в другом городе (ключ корпорации ufaCity).
   Запуск: node sim/real-ufa.js */
'use strict';
const assert = require('node:assert/strict');
const BK = require('./load'), E = BK.Engine, C = BK.Corp;
let checks = 0;
const ok = (v, why) => { assert.ok(v, why); checks++; };
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const unlock = (S) => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };
const place = (S, why) => { S.cash = Math.max(S.cash, 1e9); ok(E.chooseProduction(S, S.prodOffers[0].id).ok, why + ': цех'); ok(E.rentStore(S, S.offers[0].id).ok, why + ': точка'); };
const ufaIds = BK.UFA.DISTRICTS.map((d) => d.id);
const inUfa = (S) => S.stores.concat(S.offers).every((o) => ufaIds.includes(o.district));

// 1. Обычная партия в Уфе: псевдонима нет, войти в «вторую Уфу» нельзя.
{
  const S = E.newGame({ seed: 7919 }); place(S, 'Уфа'); unlock(S);
  ok(!C.mapCities(S).some((d) => d.id === 'ufaCity'), 'в уфимской партии настоящей Уфы отдельно нет');
  ok(E.enterLock(S, 'ufaCity'), 'вход в ufaCity закрыт: ' + E.enterLock(S, 'ufaCity'));
  ok(!E.enterCity(S, 'ufaCity').ok, 'enterCity отказывает');
}
// 2. Партия в Казани: настоящая Уфа есть на карте России и в неё можно войти.
for (const home of ['kazan', 'samara', 'moscow']) {
  const S = E.newGame({ seed: 15838, city: home }); place(S, home); unlock(S);
  const homeStores = S.stores.map((s) => [s.id, s.district, s.address]);
  const homeWorld = clone({ d: BK.DISTRICTS.map((d) => d.id) });
  const entry = C.mapCities(S).find((d) => d.id === 'ufaCity');
  ok(entry && entry.name === 'Уфа' && entry.geoId === 'ufa', home + ': Уфа на карте России');
  eq(C.mapCities(S).filter((d) => d.id === 'ufa').length, 1, home + ': домашний город по-прежнему под ключом ufa');
  eq(C.roadKm(S, 'ufa', 'ufaCity'), BK.roadKm(home, 'ufa'), home + ': расстояние до Уфы по таблице');
  ok(!E.enterLock(S, 'ufaCity'), home + ': вход открыт');
  const r = E.enterCity(S, 'ufaCity'); ok(r.ok, home + ': вход в Уфу ' + (r.msg || ''));
  eq(S.corp.active, 'ufaCity', home + ': активна настоящая Уфа');
  ok(BK.DISTRICTS === BK.UFA.DISTRICTS, home + ': карта — уфимская из world.js');
  eq(BK.CITY.name, 'Уфа', home + ': описание города — Уфа');
  ok(inUfa(S), home + ': предложения в районах Уфы');
  place(S, home + ' → Уфа');
  const ufaStores = S.stores.map((s) => [s.id, s.district, s.address]);
  for (let i = 0; i < 70; i++) E.tick(S);
  ok(Number.isFinite(S.cash) && S.stores.length >= 1, home + ': два месяца в Уфе без сбоев');
  ok(E.switchCity(S, 'ufa').ok, home + ': назад домой');
  eq(clone({ d: BK.DISTRICTS.map((d) => d.id) }), homeWorld, home + ': домашняя карта на месте');
  eq(S.stores.map((s) => [s.id, s.district, s.address]), homeStores, home + ': домашние точки на месте');
  for (let i = 0; i < 40; i++) E.tick(S);
  ok(Number.isFinite(S.cash), home + ': месяц дома, Уфа в агрегате');
  ok(E.switchCity(S, 'ufaCity').ok, home + ': снова в Уфу');
  ok(BK.DISTRICTS === BK.UFA.DISTRICTS, home + ': снова уфимская карта');
  eq(S.stores.map((s) => [s.id, s.district, s.address]).slice(0, ufaStores.length), ufaStores, home + ': уфимские точки сохранились');
  // сохранение/загрузка
  const N = JSON.parse(BK.Rewind.take(S).json); C.ensure(N); C.applyGlobals(N);
  ok(BK.DISTRICTS === BK.UFA.DISTRICTS && N.corp.active === 'ufaCity', home + ': загрузка открывает Уфу');
  ok(BK.Dir && BK.Dir.ensure ? (BK.Dir.ensure(N), true) : true, home + ': директора не ломаются');
  for (let i = 0; i < 40; i++) E.tick(N);
  ok(Number.isFinite(N.cash), home + ': после загрузки игра идёт');
}
console.log(`real-ufa: ${checks} проверок — OK`);
