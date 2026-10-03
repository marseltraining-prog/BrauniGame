/* Генерация сохранений для QA: сильный бот играет N лет в движке (Node).
   node qa/gensave.js <лет> <файл> [сид]  → JSON состояния (как в localStorage) */
const fs = require('fs');
const { play } = require('../sim/bot');
const years = +(process.argv[2] || 10), file = process.argv[3] || 'qa/shots/save-big.json', seed = +(process.argv[4] || 7919);
const r = play({ level: 'good', seed, years });
const S = r.S; const c = Object.assign({}, S); delete c.cache; c.notify = []; delete c._botRng; c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
fs.writeFileSync(file, JSON.stringify(c));
console.log(file, 'day', S.day, 'stores', S.stores.length, 'prods', S.productions.length, 'won', !!S.won, 'lost', !!S.lost, (JSON.stringify(c).length / 1024).toFixed(0) + ' KB');
