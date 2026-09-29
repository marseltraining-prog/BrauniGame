// Загружает игровые модули в Node (глобальный BK)
const path = require('path');
const src = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'data/world.js', 'data/events.js', 'engine.js', 'data/achievements.js']) {
  delete require.cache[require.resolve(path.join(src, f))];
  require(path.join(src, f));
}
module.exports = globalThis.BK;
// переопределение констант для экспериментов: BK_CFG='{"INFLATION_BASE":0.05}' node sim/bot.js good 6 20
if (process.env.BK_CFG) Object.assign(globalThis.BK.CFG, JSON.parse(process.env.BK_CFG));
