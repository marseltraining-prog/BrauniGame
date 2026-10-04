/* Темп вех (живость, vision-plan §4 п. 4, этап В2).
   Прогоняет обычного бота с включёнными вехами и показывает, как часто они приходят:
   когда выдана первая, сколько взято и не вышло, средний промежуток между вехами —
   в игровых днях и в минутах реального времени на скоростях ×1 / ×3 / ×10.
   Критерий этапа: время до первой вехи ≤ 5 минут.

   Запуск: node sim/miles.js [профиль] [сидов] [лет] [сид]
     node sim/miles.js good 8 20        — 8 сидов обычного сильного бота, 20 лет
     node sim/miles.js avg 4 25 --brief — средний бот, короткий вывод
   Вехи в прогонах ботов по умолчанию выключены (sim/load.js): здесь включаются самим файлом. */
process.env.BK_MILES = process.env.BK_MILES || '1';
if (process.env.BK_MILES) delete require.cache[require.resolve('./load')];
const BK = require('./load');
if (!BK.Miles) {
  delete require.cache[require.resolve('../src/milestones.js')];
  delete require.cache[require.resolve('../src/thoughts.js')];
  require('../src/milestones.js'); require('../src/thoughts.js');
}
const { play } = require('./bot');
// Срок должен читаться и после загрузки: сохранение хранит at/until, а не d.
{ const assert = require('assert'); const S = BK.Engine.newGame({seed: 7}); BK.Miles.ensure(S).cur = { k: 'guests', at: 3, until: 17, need: 100, base: 0, got: 1 }; const restored = JSON.parse(JSON.stringify(S)); assert.match(BK.Miles.info(restored).d, /за 14 дней/); }


const SPEEDS = { '×1': 1000, '×3': 333, '×10': 100 };
const pos = [], flags = {};
for (const a of process.argv.slice(2)) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v == null ? true : v; } else pos.push(a); }
const level = pos[0] || 'good', seeds = +(pos[1] || 6), years = +(pos[2] || 20), oneSeed = pos[3] ? +pos[3] : null;
const md = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

console.log(`Вехи: ${level}, ${oneSeed || seeds} сид(ов) × ${years} лет`);
const rows = [], allGap = [], allFirst = [], lastRuns = [];
for (let s = 1; s <= (oneSeed || seeds); s++) {
  const seed = oneSeed || s * 7919;
  const r = play({ level, seed, years, stopOnWin: false });
  const S = r.S, M = BK.Miles.ensure(S);
  const done = (M.done || []).slice();
  const tabs = r.out.filter((o) => o && o.year != null).map((o) => o.year);
  const lastYear = tabs.length ? tabs[tabs.length - 1] : years;
  const win = r.won ? r.won.year : null;
  const gaps = [];
  for (let i = 1; i < done.length; i++) gaps.push(done[i].day - done[i - 1].day);
  const firstDay = done.length ? done[0].day : (M.cur ? M.cur.at : null);
  if (firstDay != null) allFirst.push(firstDay);
  for (const g of gaps) allGap.push(g);
  rows.push({
    сид: seed,
    'первая веха, день': firstDay,
    'первая, мин ×1': firstDay != null ? +(firstDay * SPEEDS['×1'] / 60000).toFixed(2) : null,
    'первая, мин ×3': firstDay != null ? +(firstDay * SPEEDS['×3'] / 60000).toFixed(2) : null,
    взято: M.n, невышло: M.fail,
    'промежуток, дн (медиана)': gaps.length ? md(gaps) : null,
    'промежуток, мин ×1': gaps.length ? +(md(gaps) * SPEEDS['×1'] / 60000).toFixed(2) : null,
    'промежуток, мин ×3': gaps.length ? +(md(gaps) * SPEEDS['×3'] / 60000).toFixed(2) : null,
    'взято в год': +(M.n / Math.max(1, lastYear)).toFixed(1),
    точек: S.stores.filter((x) => x.status !== 'opening').length,
    'год победы': win, 'побед/лет': win ? `${win}` : `${S.lost ? 'банкрот ' + (S.day / 365).toFixed(1) : lastYear}`,
  });
  lastRuns.push(r);
  if (!flags.brief) console.log(`сид ${seed}: взято ${M.n}, не вышло ${M.fail}, первая — ${firstDay != null ? 'день ' + firstDay : 'нет'}`);
}
console.log('\nПо сидам:');
console.table(rows);
const sum = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
let TK = {}, FK = {};
for (let s = 1; s <= (oneSeed || seeds); s++) {
  const r = lastRuns[s - 1]; if (!r) continue;
  const M = BK.Miles.stats(r.S);
  for (const k in M.takeK) TK[k] = (TK[k] || 0) + M.takeK[k];
  for (const k in M.failK) FK[k] = (FK[k] || 0) + M.failK[k];
}
console.log('\nВзятые по видам: ' + sum(TK));
console.log('Невышедшие по видам: ' + sum(FK));
const f = md(allFirst), g = md(allGap);
const line = (ms) => (f * ms / 60000).toFixed(2);
console.log(`\nПервая веха: медиана ${f} игровых дн. = ${line(SPEEDS['×1'])} мин на ×1, ${line(SPEEDS['×3'])} мин на ×3, ${line(SPEEDS['×10'])} мин на ×10`);
if (g) console.log(`Между вехами: медиана ${g} игровых дн. = ${(g * SPEEDS['×1'] / 60000).toFixed(2)} мин на ×1, ${(g * SPEEDS['×3'] / 60000).toFixed(2)} мин на ×3, ${(g * SPEEDS['×10'] / 60000).toFixed(2)} мин на ×10`);
const ok = f != null && f * SPEEDS['×1'] / 60000 <= 5;
console.log(ok ? 'КРИТЕРИЙ ЭТАПА: время до первой вехи ≤ 5 мин — выполнено' : 'КРИТЕРИЙ ЭТАПА НЕ ВЫПОЛНЕН: первая веха приходит позже 5 минут');
process.exitCode = ok ? 0 : 1;
