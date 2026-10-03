// Статистика событий за игру: какие события и сколько раз сработали у бота.
// Запуск: node sim/events.js [good|avg|bad] [сидов] [лет]   (по умолчанию good 6 20)
// Показывает: частоту каждого события, год и число точек при срабатывании, выборы игрока,
// сработавшие цепочки (followUp) и проверку, что once-события были не больше одного раза за игру.
const BK = require('./load');
const E = BK.Engine;

const level = process.argv[2] || 'good', seeds = +(process.argv[3] || 6), years = +(process.argv[4] || 20);

let cur = null; // события текущей игры
const origTick = E.tick, origResolve = E.resolveEvent;
E.tick = function (S) {
  const seen = S.stats.eventsSeen;
  const r = origTick(S);
  if (S.stats.eventsSeen > seen && cur) {
    const x = S.ev.recent[0];
    cur.push({ id: x.id, day: S.day, stores: S.stores.filter((s) => s.status !== 'opening').length });
  }
  return r;
};
E.resolveEvent = function (S, idx) {
  const inst = S.ev.pending;
  if (inst && inst.choices && cur) {
    const last = [...cur].reverse().find((x) => x.id === inst.id);
    if (last) last.choice = idx;
  }
  return origResolve(S, idx);
};

const { play } = require('./bot');
const byId = (id) => BK.EVENTS.find((e) => e.id === id);
const isNew = (id) => /^e\d+$/.test(id) && +id.slice(1) > 100;

const agg = {}; // id → { n, games:Set, stores:[], years:[], choices:{} }
const perGame = [];
for (let s = 1; s <= seeds; s++) {
  cur = [];
  const r = play({ seed: s * 7919, level, years });
  const list = cur; cur = null;
  const once = {}; let newN = 0, lateN = 0, lateNew = 0, fu = 0;
  for (const x of list) {
    const e = byId(x.id);
    const a = agg[x.id] || (agg[x.id] = { n: 0, games: new Set(), stores: [], years: [], choices: {} });
    a.n++; a.games.add(s); a.stores.push(x.stores); a.years.push(x.day / 365);
    if (x.choice != null && e.choices) { const l = e.choices[x.choice].label; a.choices[l] = (a.choices[l] || 0) + 1; }
    if (e.once) once[x.id] = (once[x.id] || 0) + 1;
    if (isNew(x.id)) newN++;
    if (e.followUp) fu++;
    if (x.day >= 5 * 365) { lateN++; if (isNew(x.id)) lateNew++; }
  }
  const onceBad = Object.entries(once).filter(([, n]) => n > 1).map(([id]) => id);
  perGame.push({ seed: s, won: r.won ? r.won.year : null, lost: r.lostYear, events: list.length, newEvents: newN,
    'late(5+y)': lateN, 'lateNew': lateNew, followUps: fu, queued: (r.S.ev.queue || []).map((q) => q.id).join(' ') || '-',
    onceOK: onceBad.length ? 'ПОВТОР: ' + onceBad.join(',') : 'да' });
}

const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const rows = Object.entries(agg).map(([id, a]) => {
  const e = byId(id);
  return { id, kind: e.kind + (e.crisis ? '/crisis' : '') + (e.followUp ? '/follow' : '') + (e.once ? '/once' : ''), title: e.title.slice(0, 34),
    minSt: e.minStores || 1, n: a.n, games: a.games.size, medYear: +med(a.years).toFixed(1), medStores: med(a.stores),
    choices: Object.entries(a.choices).map(([l, n]) => `${l.slice(0, 22)}×${n}`).join('; ') };
}).sort((x, y) => x.id.localeCompare(y.id));

console.log(`\n### События: ${level}, ${seeds} сидов × ${years} лет`);
console.log('\n— Новые события (e101+):');
console.table(rows.filter((r) => isNew(r.id)));
console.log('\n— Базовые события (топ-15 по частоте) и кризисы:');
console.table(rows.filter((r) => !isNew(r.id)).sort((a, b) => b.n - a.n).slice(0, 15).map(({ choices, ...r }) => r));
const never = BK.EVENTS.filter((e) => isNew(e.id) && !agg[e.id]).map((e) => e.id);
console.log('\nНовые события, не сработавшие ни разу:', never.length ? never.join(', ') : 'нет');
console.log('\n— По играм:');
console.table(perGame);
const tot = perGame.reduce((a, g) => a + g.events, 0), totNew = perGame.reduce((a, g) => a + g.newEvents, 0);
const late = perGame.reduce((a, g) => a + g['late(5+y)'], 0), lateNew = perGame.reduce((a, g) => a + g.lateNew, 0);
console.log(`Всего событий ${tot}, из них новых ${totNew} (${Math.round(totNew / tot * 100)}%); с 5-го года — ${late}, новых ${lateNew} (${Math.round(lateNew / Math.max(1, late) * 100)}%).`);
