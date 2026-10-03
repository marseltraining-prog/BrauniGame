/* Проверка швов «живого сюжета» пролога: все функции, которые src/data/prolog-v2.js
   зовёт через BK.Prologue.*, должны существовать.
   node sim/pro2-hooks.js   (код выхода 1, если чего-то нет)

   Зачем отдельная проверка. Симуляторы и сборка грузят файлы в РАЗНОМ порядке:
     sim/load.js — prologue.js, потом data/prolog-v2.js  → «мостик» bridge() из v2 успевает
                  поставить функции *2, и ошибка не видна;
     build.js    — data/prolog-v2.js, потом prologue.js  → bridge() работает, когда BK.Prologue
                  ещё нет, и функции должны быть в самом прологе.
   Ошибка `BK.Prologue.feed2 is not a function` жила именно из-за этого: браузер падал на
   первой же дилемме, а симуляторы и боты ходили мимо. Поэтому проверяем ОБА порядка. */
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src');

// 1. какие BK.Prologue.X вообще зовёт файл сюжета (единственный источник истины — вызовы)
const txt = fs.readFileSync(path.join(src, 'data', 'prolog-v2.js'), 'utf8');
const names = [...new Set([...txt.matchAll(/BK\.Prologue\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))].sort();
if (!names.length) { console.error('В src/data/prolog-v2.js не найдено ни одного вызова BK.Prologue.*'); process.exit(1); }

// 2. грузим модули в заданном порядке и смотрим, что получилось
function fresh(order) {
  for (const f of Object.keys(require.cache)) delete require.cache[f];
  globalThis.BK = {};
  for (const f of order) require(path.join(src, f));
  return globalThis.BK;
}
const bad = [];
for (const [label, order] of [['сборка (v2 → пролог), как build.js', ['data/prolog-v2.js', 'prologue.js']], ['симуляторы (пролог → v2), как sim/load.js', ['prologue.js', 'data/prolog-v2.js']]]) {
  const BK = fresh(order);
  const PR = BK.Prologue || {};
  const miss = names.filter((n) => typeof PR[n] !== 'function');
  console.log(`${miss.length ? '✗' : '✓'} ${label}: вызовов ${names.length}, не хватает ${miss.length}${miss.length ? ' — ' + miss.join(', ') : ''}`);
  if (miss.length) bad.push(`${label}: нет ${miss.join(', ')}`);
}

// 3. живой прогон: каждый вариант каждой дилеммы должен отработать без исключений —
//    это и есть все вызовы BK.Prologue.* из файла сюжета
const BK = fresh(['config.js', 'data/prolog-v2.js', 'prologue.js', 'engine.js']);
function newState(seed) {
  const S = { seed, rng: 1, cash: 1e6, stores: [], staff: [], player: { skills: {} } };
  return { S, P: BK.Prologue.start(S) };
}
const ids = Object.keys(BK.PrologV2.DILEMMAS);
const fails = [];
let tried = 0;
for (const id of ids) {
  const def = BK.PrologV2.DILEMMAS[id];
  const n = def.choices({}).length;
  for (let i = 0; i < n; i++) {
    const { P } = newState(1000 + i);
    try { def.choices(P)[i].do(P, {}); tried++; }
    catch (e) { fails.push(`${id}[${i}]: ${e.message}`); }
  }
}
console.log(`${fails.length ? '✗' : '✓'} дилеммы: вариантов проверено ${tried} (${ids.length} дилемм), исключений ${fails.length}${fails.length ? '\n   ' + fails.join('\n   ') : ''}`);
if (fails.length) bad.push('дилеммы: упало вариантов — ' + fails.length);

// 4. обычный ход времени: дилеммы и сцены разбираются через card()/choose() без ошибок
{
  const { S, P } = newState(4242);
  BK.Prologue.advance(S, 1e9);
  let played = 0;
  for (let i = 0; i < 12; i++) {
    if (!P.cards.length) { BK.Prologue.advance(S, 3e9); if (!P.cards.length) break; }
    const cv = BK.Prologue.card(S); if (!cv) break;
    const can = cv.choices.findIndex((c) => c.can);
    if (!BK.Prologue.choose(S, can < 0 ? 0 : can).ok) break;
    played++;
  }
  console.log(`${played > 1 ? '✓' : '✗'} ход времени: разобрано карточек ${played}, ошибок нет (лента ${P.feed.length}, летопись ${P.slog.length}, нити ${(P.v2 && P.v2.threads || []).length})`);
  if (played < 2) bad.push('ход времени: разобрано меньше двух карточек');
}

// 5. каждая функция должна сама вызываться и не портить состояние на странных аргументах
{
  const { P } = newState(77);
  const odd = [undefined, null, '', 0, -1, NaN, Infinity, 'текст', {}, [], { a: 1 }, () => {}];
  let thrown = 0;
  for (const fn of names) {
    for (const a of odd) { try { BK.Prologue[fn](P, a, a, a); } catch (e) { thrown++; fails.push(`${fn}(${String(a)}): ${e.message}`); } }
    for (const p of [null, undefined, {}]) { try { BK.Prologue[fn](p, 1, 'other', 'x'); } catch (e) { thrown++; fails.push(`${fn}(P=${JSON.stringify(p)}): ${e.message}`); } }
  }
  // все хуки отработали: нить и летопись заводятся, деньги не уходят в NaN, отношения в границах
  BK.Prologue.thread2(P, { id: 'check', who: 'Проверка', gist: 'тест', dir: -1, due: P.m + 1, fx: 'debt' });
  BK.Prologue.storyLog2(P, { what: 'check', line: 'тест' });
  BK.Prologue.fx2(P, 'rub', -1234, 'check');
  BK.Prologue.feed2(P, 'тест', 'hero');
  BK.Prologue.rel2(P, { rashid: 1e9, gulya: -1e9 });
  BK.Prologue.style2(P, 'care', 1e9);
  BK.Prologue.pay2(P, 300, 'fines'); BK.Prologue.spend2(P, 300, 'fines');
  const okRel = P.rel.rashid <= 100 && P.rel.gulya >= -100;
  const okMon = isFinite(P.cash) && P.spent.fines >= 300;
  const okLen = P.feed.length <= 40 && P.slog.length <= 120 && P.fx.length <= 30;
  const okTh = (P.v2.threads || []).some((t) => t.id === 'check');
  console.log(`${!thrown && okRel && okMon && okLen && okTh ? '✓' : '✗'} надёжность: странных вызовов ${names.length * (odd.length + 3)}, исключений ${thrown}; границы ${okRel ? 'ок' : 'НЕТ'}, деньги ${okMon ? 'ок' : 'НЕТ'}, длины ${okLen ? 'ок' : 'НЕТ'}, нить ${okTh ? 'ок' : 'НЕТ'}`);
  if (thrown || !okRel || !okMon || !okLen || !okTh) bad.push('надёжность: исключений ' + thrown + ', границы/деньги/длины/нить — ' + [okRel, okMon, okLen, okTh].join('/'));
}

if (bad.length) { console.error('\nПроблемы:\n - ' + bad.join('\n - ')); process.exit(1); }
console.log('\nВсе функции BK.Prologue.* из src/data/prolog-v2.js на месте в обоих порядках загрузки, дилеммы играются.');
