/* Контрольные партии сильного бота в стартовом городе: node tools/city-control.js <город> [сидов=3] [лет=24]
   Печатает JSON: [{seed, won, wSt, lost}] — для docs/releases/<версия>-baseline.json (до/после карты). */
'use strict';
const [city, nSeeds = 3, years = 24] = process.argv.slice(2);
const BK = require('../sim/load'), E = BK.Engine;
const orig = E.newGame;
E.newGame = (o) => orig(Object.assign({}, o, { city }));
const bot = require('../sim/bot');
const out = [];
for (let i = 1; i <= +nSeeds; i++) {
  const seed = i * 7919, r = bot.play({ level: 'good', seed, years: +years });
  const s = bot.summarize ? bot.summarize(r) : {};
  out.push({ seed, won: s.won != null ? s.won : null, wSt: s.wSt, lost: s.lost, city: r.S && r.S.startCity });
}
console.log(JSON.stringify(out));
