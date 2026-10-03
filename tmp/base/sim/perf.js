// Производительность второго акта на 19 городах (docs/russia-design.md §8.2 п. 6): месяц агрегата < 5 мс, сохранение < 1 МБ.
// Бот good с корпоративным профилем играет N лет, затем:
//   — размер сохранения (как в localStorage: без cache и уведомлений) и что в нём больше всего весит;
//   — время агрегированного месяца (BK.Corp.monthly: все упакованные города + директора + штаб) и полного 1-го числа (tick).
// Запуск: node sim/perf.js [лет=30] [сид=7919] [--save=файл] — с --save состояние пишется в файл (для qa/full.js / браузера).
const fs = require('fs');
const BK = require('./load');
const { play } = require('./bot');
const E = BK.Engine;
const flags = {}, pos = [];
for (const a of process.argv.slice(2)) { if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v == null ? true : v; } else pos.push(a); }
const years = +(pos[0] || 30), seed = +(pos[1] || 7919);

const t0 = Date.now();
const r = play({ level: 'good', seed, years, corp: true, corpOpt: { level: 'good' } });
const S = r.S;
const strip = (st) => { const c = Object.assign({}, st); delete c.cache; c.notify = []; delete c._botRng; c.stores = c.stores.map((x) => { const y = Object.assign({}, x); delete y._bot; return y; }); return c; };
const json = JSON.stringify(strip(S));
const sm = E.corpSummary(S);
console.log(`Бот good --corp, ${years} лет, сид ${seed}: ${((Date.now() - t0) / 1000).toFixed(1)} с · городов ${sm ? sm.cities.length : 0} · точек ${sm ? sm.stores : S.stores.length} · директоров ${S.corp ? S.corp.directors.length : 0}`);
const kb = (x) => (JSON.stringify(x || null).length / 1024).toFixed(0) + ' КБ';
console.log(`Сохранение: ${(json.length / 1024).toFixed(0)} КБ (${(json.length / 1048576).toFixed(2)} МБ) — цель < 1 МБ`);
if (S.corp) {
  const cr = S.corp, parts = { 'города (упакованные точки)': 0, 'история городов': 0 };
  for (const id in cr.cities) { const c = cr.cities[id]; parts['история городов'] += JSON.stringify(c.hist).length; parts['города (упакованные точки)'] += JSON.stringify(c.packed || null).length; }
  const rows = Object.assign({}, Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, (v / 1024).toFixed(0) + ' КБ'])), {
    'активный город (S.stores…)': kb([strip(S).stores, S.productions, S.offers, S.rival]), 'история сети (S.history)': kb(S.history), 'журнал (S.log)': kb(S.log), 'летопись (S.chron)': kb(S.chron),
    'директора': kb(cr.directors), 'входящие': kb(cr.inbox), 'события и прочее corp': kb(Object.assign({}, cr, { cities: null, directors: null, inbox: null })) });
  console.table(rows);
}
if (flags.save) { fs.writeFileSync(flags.save, json); console.log('записано:', flags.save); }

// время: копия состояния перед 1-м числом → агрегированный месяц отдельно и целый день 1-го числа
function nextFirst(st) { let d = st.day + 1; while (E.dateOf(d).d !== 1) d++; return d; }
const runs = +(flags.runs || 15), agg = [], full = [];
for (let i = 0; i < runs; i++) {
  const A = JSON.parse(json); BK.Corp.ensure(A); A.notify = [];
  const d1 = nextFirst(A);
  while (A.day < d1 - 1) { E.tick(A); A.notify = []; if (A.ev.pending) A.ev.pending = null; if (A.chef.pending) A.chef.pending = null; if (A.phase !== 'play') break; }
  const B = JSON.parse(JSON.stringify(A)); BK.Corp.ensure(B);
  // агрегат отдельно
  B.day += 1; const t = E.dateOf(B.day);
  let s = process.hrtime.bigint(); BK.Corp.monthly(B, t); agg.push(Number(process.hrtime.bigint() - s) / 1e6);
  // полный день 1-го числа (подробный город + агрегат + отчёты)
  s = process.hrtime.bigint(); E.tick(A); full.push(Number(process.hrtime.bigint() - s) / 1e6);
}
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], mx = (a) => Math.max(...a);
console.log(`Агрегированный месяц (все упакованные города, директора, штаб): медиана ${med(agg).toFixed(2)} мс, макс ${mx(agg).toFixed(2)} мс — цель < 5 мс`);
console.log(`Целиком 1-е число (tick): медиана ${med(full).toFixed(2)} мс, макс ${mx(full).toFixed(2)} мс`);
const ok = json.length < 1048576 && med(agg) < 5;
console.log(ok ? 'OK: в пределах целей §8.2 п. 6' : 'ВНИМАНИЕ: превышена цель');
process.exit(ok ? 0 : 1);
