// Загружает игровые модули в Node (глобальный BK)
const path = require('path');
const src = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'data/world.js', 'data/events.js', 'engine.js']) {
  delete require.cache[require.resolve(path.join(src, f))];
  require(path.join(src, f));
}
module.exports = globalThis.BK;
