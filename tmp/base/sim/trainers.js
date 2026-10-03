// Проверка подсказок личных тренеров (src/trainers.js) ботом: находят ли они реальные слабые места.
// node sim/trainers.js [avg|good|bad] [сидов] [лет] [--examples]
// Бот играет как обычно (тренеров не нанимает — экономика та же), а раз в месяц (2-го числа) мы смотрим, что подсветил бы
// игрок с навыками 3-го уровня во всех областях, и сверяем с тем, что случилось потом:
//  - «персонал» (на грани / настроение / нехватка): ушёл ли кто-то из тогдашней команды за 45 дней — у отмеченных точек и у остальных;
//  - «финансы» (аренда / минус): была ли точка в минусе в следующие 3 месяца;
//  - «продажи» (чек / рейтинг): маржа отмеченных точек ниже медианы сети — чаще, чем у остальных;
//  - «цех»: доля списаний, загрузка.
const BK = require('./load');
const bot = require('./bot');
const E = BK.Engine, TR = BK.Trainers;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const level = args[0] || 'avg', seeds = +(args[1] || 3), years = +(args[2] || 6), EX = process.argv.includes('--examples');
const FULL = { sales: 3, staff: 3, prod: 3, fin: 3, corp: 3 };
const L1 = { sales: 1, staff: 1, prod: 1, fin: 1, corp: 1 };
const tot = { months: 0, hints: 0, hintsL1: 0, byKind: {}, staff: { f: [0, 0], u: [0, 0] }, fin: { f: [0, 0], u: [0, 0] }, sales: { f: [0, 0], u: [0, 0] }, examples: [] };
const pct = (a) => (a[1] ? (a[0] / a[1] * 100).toFixed(0) + '%' : '—') + ` (${a[0]}/${a[1]})`;

for (let s = 0; s < seeds; s++) {
  const seed = 1000 + s * 7919;
  const pend = []; // отложенные проверки { day, fn }
  bot.play({ level, seed, years, onDay(S) {
    for (let i = pend.length - 1; i >= 0; i--) if (S.day >= pend[i].day) { pend[i].fn(S); pend.splice(i, 1); }
    const t = E.dateOf(S.day);
    if (t.d !== 2 || S.phase !== 'play' || S.history.length < 2) return;
    const H = TR.hints(S, FULL), H1 = TR.hints(S, L1);
    tot.months++; tot.hints += H.length; tot.hintsL1 += H1.length;
    for (const h of H) tot.byKind[h.area + '/' + h.kind] = (tot.byKind[h.area + '/' + h.kind] || 0) + 1;
    if (EX && tot.examples.length < 14 && H.length && S.day % 5 === 0) tot.examples.push(`[${seed} · ${(S.day / 365).toFixed(1)} г.] ${H[0].where}: ${H[0].cause} — ${H[0].detail}. ${H[0].todo}`);
    const flag = (area, kinds) => new Set(H.filter((h) => h.area === area && kinds.includes(h.kind) && h.storeId).map((h) => h.storeId));
    const open = S.stores.filter((st) => st.status === 'open' && st.last && st.staff.length);
    // персонал: кто из нынешней команды ушёл за 45 дней
    const fS = flag('staff', ['quit', 'mood', 'chain']);
    for (const st of open) {
      const ids = st.staff.map((e) => e.id), k = fS.has(st.id) ? 'f' : 'u';
      pend.push({ day: S.day + 45, fn: (S2) => { const now = new Set(st.staff.map((e) => e.id)); const gone = S2.stores.includes(st) ? ids.filter((id) => !now.has(id)).length : 0; tot.staff[k][0] += gone > 0 ? 1 : 0; tot.staff[k][1]++; } });
    }
    // финансы: минус в следующие 3 месяца
    const fF = flag('fin', ['rent', 'loss']);
    for (const st of open) {
      const k = fF.has(st.id) ? 'f' : 'u'; let neg = false;
      for (const d of [31, 62, 93]) pend.push({ day: S.day + d, fn: () => { if (st.last && st.last.profit < 0) neg = true; if (d === 93) { tot.fin[k][0] += neg ? 1 : 0; tot.fin[k][1]++; } } });
    }
    // продажи: маржа отмеченных точек ниже средней по сети?
    const fSa = flag('sales', ['check', 'rating']); // очереди — это упущенный спрос у сильных точек, с маржой не связаны
    if (open.length >= 3) {
      const mg = open.map((st) => st.last.profit / st.last.rev).sort((a, b) => a - b), med = mg[Math.floor(mg.length / 2)];
      for (const st of open) { const k = fSa.has(st.id) ? 'f' : 'u'; tot.sales[k][0] += st.last.profit / st.last.rev < med ? 1 : 0; tot.sales[k][1]++; }
    }
  } });
}
console.log(`Бот ${level}, ${seeds} сид., ${years} лет: ${tot.months} проверок (раз в месяц)`);
console.log(`Подсказок в месяц: навыки 3-го уровня — ${(tot.hints / tot.months).toFixed(1)}, 1-го уровня (группы) — ${(tot.hintsL1 / tot.months).toFixed(1)}`);
console.log('По видам (сколько раз показаны):', Object.entries(tot.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`Персонал: кто-то ушёл за 45 дней — отмеченные точки ${pct(tot.staff.f)}, остальные ${pct(tot.staff.u)}`);
console.log(`Финансы: точка в минусе в ближайшие 3 мес. — отмеченные ${pct(tot.fin.f)}, остальные ${pct(tot.fin.u)}`);
console.log(`Продажи (чек, рейтинг): маржа ниже медианы сети — отмеченные ${pct(tot.sales.f)}, остальные ${pct(tot.sales.u)}`);
if (EX) { console.log('Примеры (уровень 3):'); for (const x of tot.examples) console.log(' · ' + x); }
