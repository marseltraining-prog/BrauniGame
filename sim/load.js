// Загружает игровые модули в Node (глобальный BK)
const path = require('path');
const src = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'data/story.js', 'data/story-cast.js', 'data/scenarios.js', 'data/scen-legacy.js', 'data/scen-rescue.js', 'data/scen-crisis.js', 'data/scen-moscow.js', 'data/story-war.js', 'data/story-russia.js', 'data/story-bridges.js', 'data/world.js', 'data/cities-big.js', 'data/city-kazan.js', 'data/cities.js', 'data/events.js', 'data/events-life.js', 'data/corp-events.js', 'data/strat-events.js', 'engine.js', 'prodstats.js', 'corp.js', 'directors.js', 'corphq.js', 'corpev.js', 'data/achievements.js', 'trainers.js', 'managers.js', 'growth.js', 'rewind.js', 'collateral.js', 'investors.js', 'story.js', 'strategy.js', 'scenario.js', 'start-city.js', 'prologue.js', 'data/prolog-v2.js', 'stage1.js', 'data/guests.js']) {
  delete require.cache[require.resolve(path.join(src, f))];
  require(path.join(src, f));
}
module.exports = globalThis.BK;
// переопределение констант для экспериментов: BK_CFG='{"INFLATION_BASE":0.05}' node sim/bot.js good 6 20
if (process.env.BK_CORP === '0') globalThis.BK.CFG.CORP_ON = false; // BK_CORP=0 — без второго акта (Россия не открывается)
if (process.env.BK_RIVAL === '0') globalThis.BK.CFG.RIVAL_ON = false; // BK_RIVAL=0 — игра без сети-соперника
// Живость (вехи, мысли гостей недели — vision-plan §4, этап В2) в обычных прогонах ботов не подключается:
// канонические прогоны первого акта остаются побайтно прежними. Включается только явно: BK_MILES=1.
// Инвесторы появляются сами после 10 точек — в обычных прогонах ботов выключаем (BK_INV=1 включает),
// чтобы канонические прогоны первого акта оставались побайтно прежними.
if (!process.env.BK_INV) globalThis.BK.CFG.INV.ON = false;
// Сюжет в прогонах ботов выключаем (BK_STORY=1 включает): сцены останавливали бы бота.
if (!process.env.BK_STORY) globalThis.BK.CFG.STORY.ON = false;
// Нити истории (BK_THREADS=1 включает): реестр людей и отложенных последствий. По умолчанию не грузится —
// канонические прогоны первого акта остаются побайтно прежними (нитей нет — поведение игры не меняется).
if (process.env.BK_THREADS) { for (const f of ['threads.js']) { delete require.cache[require.resolve(path.join(src, f))]; require(path.join(src, f)); } }
if (process.env.BK_MILES) {
  for (const f of ['milestones.js', 'thoughts.js']) { delete require.cache[require.resolve(path.join(src, f))]; require(path.join(src, f)); }
}
// вложенные ключи через точку: BK_CFG='{"DIFFICULTY.easy.sev":0.5}'
if (process.env.BK_CFG) for (const [k, v] of Object.entries(JSON.parse(process.env.BK_CFG))) {
  const p = k.split('.'); let o = globalThis.BK.CFG;
  for (const x of p.slice(0, -1)) o = o[x] = Object.assign({}, o[x]);
  o[p[p.length - 1]] = v;
}
