/* Снимает «старые сохранения» города ДО подключения подробной карты (mapGen 1):
   start — партия, начатая в городе; corp — вход в город во втором акте; bought — покупка местной сети (e208).
   Запуск: node tools/capture-legacy-city.js <город> <версия>  → docs/releases/<версия>-legacy-<город>.json
   Нельзя переснимать после подключения карты: файл фиксирует прежнюю географию. */
'use strict';
const fs = require('fs'), path = require('path');
const [city, version] = process.argv.slice(2);
if (!city || !version) { console.error('usage: node tools/capture-legacy-city.js <city> <version>'); process.exit(2); }
const BK = require('../sim/load'), E = BK.Engine, C = BK.Corp;
if (BK.cityMapGen(city) !== 1) { console.error(city + ': уже подробная карта (mapGen ' + BK.cityMapGen(city) + ') — снимать поздно'); process.exit(1); }
const clone = (x) => JSON.parse(JSON.stringify(x));
const durable = (S) => JSON.parse(BK.Rewind.take(S).json);
const world = () => clone({ map: BK.MAP, districts: BK.DISTRICTS, center: BK.CENTER_POINT });
const unlock = (S) => { S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S); };
const place = (S) => { if (!E.chooseProduction(S, S.prodOffers[0].id).ok) throw new Error('production'); if (!E.rentStore(S, S.offers[0].id).ok) throw new Error('store'); };
const out = {};
{ const S = E.newGame({ seed: 7919, city }); place(S); for (let i = 0; i < 40; i++) E.tick(S);
  out.start = durable(S); C.applyGlobals(clone(out.start)); out.startWorld = world(); }
{ const S = E.newGame({ seed: 15838 }); unlock(S);
  if (!E.enterCity(S, city).ok) throw new Error('enter'); place(S);
  out.corp = durable(S); C.applyGlobals(clone(out.corp)); out.corpWorld = world(); }
for (let seed = 1; seed <= 200 && !out.bought; seed++) {
  const S = E.newGame({ seed: seed * 7919 }); unlock(S);
  if (!(E.enterCity(S, 'kazan').ok && E.enterCity(S, 'ekb').ok)) continue;
  S.day = Math.max(366, (BK.CFG.CORP.LAUNCH_DAYS || 510) + 1);
  const ev = BK.CorpEv.byId('e208'); if (!BK.CorpEv.eligible(S, ev)) continue;
  BK.CorpEv.start(S, ev); const p = S.ev.pending;
  if (!p || p.ctx.city !== city) continue;
  E.resolveEvent(S, 0);
  if (!S.corp.cities[city] || !S.corp.cities[city].bought) continue;
  if (!E.switchCity(S, city).ok) continue;
  out.bought = durable(S); out.boughtSeed = seed * 7919; C.applyGlobals(clone(out.bought)); out.boughtWorld = world();
}
const file = path.join(__dirname, '..', 'docs', 'releases', version + '-legacy-' + city + '.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log(file, Object.keys(out).join(','), (fs.statSync(file).size / 1024 | 0) + ' КБ');
