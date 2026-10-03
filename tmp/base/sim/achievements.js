// Статистика достижений по ботам: сколько и какие получены по годам игры.
// Запуск: node sim/achievements.js [уровни=good,avg,bad] [сидов=6] [лет=18] [--list]
// Цель: у good первое — в первые дни, за первый год 10–15, дальше 2–4 в год; недостижимых (кроме секретных) нет.
const BK = require('./load');
const { play } = require('./bot');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const levels = (args[0] || 'good,avg,bad').split(',');
const seeds = +(args[1] || 6), years = +(args[2] || 18);
const LIST = BK.Ach.LIST;
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const fmtDay = (d) => (d == null ? '—' : d < 60 ? d + ' дн.' : (d / 365).toFixed(1).replace('.', ',') + ' г.');

const all = {};
for (const lvl of levels) {
  const runs = [];
  for (let s = 1; s <= seeds; s++) {
    const r = play({ level: lvl, seed: s * 7919, years });
    runs.push({ ach: Object.assign({}, r.S.achievements), day: r.S.day, lost: r.S.lost, won: r.won ? r.won.year : null });
  }
  all[lvl] = runs;
  const nY = Math.ceil(years);
  console.log(`\n### ${lvl}: ${seeds} сидов × ${years} лет (побед ${runs.filter((r) => r.won != null).length}, банкротств ${runs.filter((r) => r.lost).length})`);
  // по годам: медиана/мин/макс числа полученных за год
  const rows = [];
  for (let y = 0; y < nY; y++) {
    const per = runs.filter((r) => r.day > y * 365).map((r) => Object.values(r.ach).filter((d) => d >= y * 365 && d < (y + 1) * 365).length);
    if (!per.length) break;
    rows.push({ год: y + 1, игр: per.length, медиана: med(per), мин: Math.min(...per), макс: Math.max(...per) });
  }
  console.table(rows);
  const first = runs.map((r) => Math.min(...Object.values(r.ach)));
  const cnt = runs.map((r) => Object.keys(r.ach).length);
  console.log(`первое достижение: день ${med(first)} (мин ${Math.min(...first)}, макс ${Math.max(...first)}); всего получено: медиана ${med(cnt)} из ${LIST.length} (мин ${Math.min(...cnt)}, макс ${Math.max(...cnt)})`);
  const by = LIST.map((a) => { const ds = runs.map((r) => r.ach[a.id]).filter((d) => d != null); return { id: a.id, name: a.name, рдк: a.rar, секр: a.secret ? 'да' : '', получили: `${ds.length}/${runs.length}`, 'медиана': fmtDay(med(ds)) }; });
  if (flags.has('--list') || lvl === levels[0]) console.table(by);
  else console.log('не получил никто:', by.filter((x) => x.получили.startsWith('0/')).map((x) => x.id).join(', ') || '—');
}
// недостижимые: не получил ни один бот ни одного уровня (секретные — отдельно)
const never = LIST.filter((a) => !levels.some((l) => all[l].some((r) => r.ach[a.id] != null)));
console.log(`\nНе получил ни один бот: ${never.filter((a) => !a.secret).map((a) => a.id + ' (' + a.name + ')').join(', ') || '— (все обычные достижения достижимы)'}`);
console.log(`Секретные без получения: ${never.filter((a) => a.secret).map((a) => a.id).join(', ') || '—'}`);
