// Загружает игровые модули в Node (глобальный BK)
const path = require('path');
const src = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'data/world.js', 'data/cities.js', 'data/events.js', 'data/corp-events.js', 'engine.js', 'corp.js', 'directors.js', 'corphq.js', 'corpev.js', 'data/achievements.js', 'trainers.js']) {
  delete require.cache[require.resolve(path.join(src, f))];
  require(path.join(src, f));
}
module.exports = globalThis.BK;
// переопределение констант для экспериментов: BK_CFG='{"INFLATION_BASE":0.05}' node sim/bot.js good 6 20
if (process.env.BK_CORP === '0') globalThis.BK.CFG.CORP_ON = false; // BK_CORP=0 — без второго акта (Россия не открывается)
if (process.env.BK_RIVAL === '0') globalThis.BK.CFG.RIVAL_ON = false; // BK_RIVAL=0 — игра без сети-соперника
// вложенные ключи через точку: BK_CFG='{"DIFFICULTY.easy.sev":0.5}'
if (process.env.BK_CFG) for (const [k, v] of Object.entries(JSON.parse(process.env.BK_CFG))) {
  const p = k.split('.'); let o = globalThis.BK.CFG;
  for (const x of p.slice(0, -1)) o = o[x] = Object.assign({}, o[x]);
  o[p[p.length - 1]] = v;
}
