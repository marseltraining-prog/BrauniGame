// Проверка управляющих точек (src/managers.js) ботом: помогает ли управляющий слабому игроку и окупает ли оклад.
// node sim/managers.js [сидов] [лет] [профили через запятую: none,weak,mid,strong] [--level=avg]
// Бот avg играет как обычно (sim/bot.js); с 5 открытых точек (профили weak/mid/strong) нанимает управляющего заданного
// качества (оклад — по рыночной формуле salaryFor) и принимает ВСЕ его предложения в тот же день. «none» — обычный avg.
// Сравниваем: год победы, банкротства, точки, прибыль за годы 1–10, оклады управляющего, сколько советов верных/лишних.
const BK = require('./load');
const bot = require('./bot');
const E = BK.Engine, MG = BK.Managers;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const seeds = +(args[0] || 6), years = +(args[1] || 25), profs = (args[2] || 'none,weak,mid,strong').split(','), level = flags.level || 'avg';
const NO = new Set(String(flags.no || '').split(',').filter(Boolean)); // --no=price,repair — эти виды отклонять (эксперимент)
const Q = { weak: { obs: 0.25, acc: 0.55, freq: 14 }, mid: { obs: 0.6, acc: 0.8, freq: 10 }, strong: { obs: 0.92, acc: 0.95, freq: 7 } };
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const avg = (a) => { const b = a.filter((x) => x != null && isFinite(x)); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
const M = (v) => Math.round(v / 1e6);

function runProfile(pf) {
  const rows = [];
  for (let s = 1; s <= seeds; s++) {
    const seed = s * 7919;
    let hiredDay = null; const cnt = { yes: 0, right: 0, wrong: 0, k: {} };
    const q = Q[pf];
    let unl = null;
    const r = bot.play({ level, seed, years, onDay(S) {
      if (unl == null && MG.unlocked(S)) unl = S.history.length;
      if (!q) return;
      const R = S.managers;
      if (R && !R.list.length && MG.unlocked(S) && R.cand.length) {
        // кандидат нужного качества: берём первого из пула и задаём качества (оклад — по рынку)
        const c = R.cand[0];
        Object.assign(c, q, { sal0: Math.round(MG.salaryFor(q.obs, q.acc, q.freq) / 5000) * 5000 });
        if (MG.hire(S, c.id).ok) hiredDay = S.day;
      }
      // второй, третий… — когда сеть переросла одного
      if (R && R.list.length && R.list.length < MG.maxManagers(S) && R.cand.length && S.cash > 5e6) {
        const c = R.cand[0]; Object.assign(c, q, { sal0: Math.round(MG.salaryFor(q.obs, q.acc, q.freq) / 5000) * 5000 }); MG.hire(S, c.id);
      }
      if (R) for (const p of MG.open(S)) { if (NO.has(p.kind)) MG.reject(S, p.id); else { const a = MG.accept(S, p.id); if (a.ok) { cnt.yes++; if (p.right) cnt.right++; else cnt.wrong++; cnt.k[p.kind + (p.right ? '' : '✗')] = (cnt.k[p.kind + (p.right ? '' : '✗')] || 0) + 1; } } }
    } });
    const S = r.S, R = S.managers || { list: [], done: [], spent: 0 };
    const prof10 = S.history.slice(0, 120).reduce((a, h) => a + h.profit, 0);
    const prof5 = S.history.slice(0, 60).reduce((a, h) => a + h.profit, 0);
    let prop = 0; for (const m of R.list) prop += m.st.prop;
    // после 5 точек (с месяца, когда можно нанять): маржа, упущенные из-за очередей продажи, выручка на точку в месяц
    const H = unl != null ? S.history.slice(unl) : [];
    let hr = 0, hp = 0, hl = 0, hs = 0; for (const h of H) { hr += h.rev; hp += h.profit; hl += h.pnl.lost || 0; hs += h.stores; }
    const kinds = cnt.k;
    rows.push({ seed: s, won: r.won ? r.won.year : null, lost: r.lostYear, hireY: hiredDay != null ? +(hiredDay / 365).toFixed(1) : null,
      s5: (r.out.find((x) => x.year === 5) || {}).stores ?? null, s10: (r.out.find((x) => x.year === 10) || {}).stores ?? null,
      p5: M(prof5), p10: M(prof10), mgrs: R.list.length, salM: M(R.spent), prop, yes: cnt.yes, right: cnt.right, wrong: cnt.wrong,
      mrg: hr ? +(hp / hr * 100).toFixed(1) : null, lostPct: hr ? +(hl / (hr + hl) * 100).toFixed(1) : null, rps: hs ? +(hr / hs / 1e6).toFixed(2) : null,
      turn: (r.out.find((x) => x.year === 8) || {})['turn%'] ?? null, top: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ') });
  }
  return rows;
}
const title = (pf) => `\n=== ${level} + управляющий: ${pf}${Q[pf] ? ` (наблюдательность ${Q[pf].obs}, точность ${Q[pf].acc}, доклад раз в ${Q[pf].freq} дн., оклад 2027 ≈ ${Math.round(MG.salaryFor(Q[pf].obs, Q[pf].acc, Q[pf].freq) / 1000)} тыс.)` : ''}`;
if (flags.one) process.stdout.write(JSON.stringify(runProfile(flags.one)));
else {
// профили считаются параллельно — отдельными процессами
const { execFile } = require('child_process');
const res = {};
Promise.all(profs.map((pf) => new Promise((ok, bad) => execFile(process.execPath, [__filename, String(seeds), String(years), pf, '--one=' + pf, '--level=' + level].concat(flags.no ? ['--no=' + flags.no] : []), { maxBuffer: 64 << 20, env: Object.assign({}, process.env, { FORCE_COLOR: '0' }) }, (err, out) => (err ? bad(err) : ok((res[pf] = JSON.parse(out))))))) ).then(() => {
  for (const pf of profs) { console.log(title(pf)); if (!flags.brief) console.table(res[pf]); }
  console.log(`\n### Итог (${seeds} сидов × ${years} лет, бот ${level})`);
  const sum = {};
  for (const pf of profs) {
    const rows = res[pf], wins = rows.map((x) => x.won).filter((x) => x != null);
    sum[pf] = { wins: `${wins.length}/${rows.length}`, medWin: med(wins), lost: rows.filter((x) => x.lost != null).length, s10: med(rows.map((x) => x.s10)), p5: Math.round(avg(rows.map((x) => x.p5))), p10: Math.round(avg(rows.map((x) => x.p10))), salM: Math.round(avg(rows.map((x) => x.salM))), yes: Math.round(avg(rows.map((x) => x.yes))), wrongPct: (() => { const y = rows.reduce((a, x) => a + x.yes, 0); return y ? Math.round(rows.reduce((a, x) => a + x.wrong, 0) / y * 100) + '%' : '—'; })(), turn8: med(rows.map((x) => x.turn)), mrg: +avg(rows.map((x) => x.mrg)).toFixed(2), lostPct: +avg(rows.map((x) => x.lostPct)).toFixed(2), rps: +avg(rows.map((x) => x.rps)).toFixed(3) };
  }
  console.table(sum);
  if (res.none) for (const pf of profs) if (pf !== 'none') {
    const d = res[pf].map((x, i) => (res.none[i].lost == null && x.lost == null ? x.p10 - res.none[i].p10 : null));
    console.log(`${pf}: прибыль за 10 лет против обычного avg (без банкротств) — в среднем ${Math.round(avg(d) || 0) >= 0 ? '+' : ''}${Math.round(avg(d) || 0)} млн ₽ по сидам: ${d.map((x) => (x == null ? '—' : (x >= 0 ? '+' : '') + x)).join(' ')}`);
  }
});
}
