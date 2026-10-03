/* Производительность подробной Москвы (Р4 ч. 2, russia-design §10): сеть второго акта (бот good --corp), активный город —
   Москва, в ней ~200 точек (к точкам бота — копии со сдвигом, как grow() в qa/full.js). Скорость ×10, CPU×1:
   вкладки «Сводка», «Точки», «Команда» и карта России — ни одной задачи дольше 50 мс; плюс CPU×4 на телефоне — для сведения.
   Запуск: node qa/moscow.js [папка=qa/shots/moscow] [точек=200]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/moscow', N = +(process.argv[3] || 200);
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);

// сеть второго акта: бот good --corp до Москвы; переезд в Москву (подробный город) и рост до N точек копиями
function moscowSave() {
  const { play } = require('../sim/bot');
  const BK = globalThis.BK, E = BK.Engine;
  let r = null;
  for (const years of [15, 17, 19]) { r = play({ level: 'good', seed: 7919, years, corp: true, corpOpt: { level: 'good' } }); if (r.S.corp && r.S.corp.cities.moscow) break; }
  const S = r.S;
  if (!S.corp.cities.moscow) throw new Error('бот не вошёл в Москву');
  const sw = E.switchCity(S, 'moscow'); if (sw && sw.ok === false) throw new Error('переезд в Москву: ' + sw.msg);
  const src = S.stores.filter((s) => s.status === 'open');
  if (!src.length) throw new Error('в Москве нет работающих точек');
  let num = Math.max(0, ...S.stores.map((s) => s.num));
  for (let i = 0; S.stores.length < N; i++) {
    const b = JSON.parse(JSON.stringify(src[i % src.length]));
    b.id = 'qm' + i; b.num = ++num; b.x = Math.min(960, Math.max(40, b.x + ((i * 37) % 90) - 45)); b.y = Math.min(960, Math.max(40, b.y + ((i * 53) % 90) - 45));
    b.staff.forEach((e, k) => { e.id = `qm${i}e${k}`; }); if (b.incoming) b.incoming = [];
    S.stores.push(b);
  }
  // мощности цехов на копии не хватит (выпечки меньше) — замер про интерфейс и тик, не про баланс
  const c = Object.assign({}, S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  const cities = Object.keys(S.corp.cities).length, other = Object.values(S.corp.cities).reduce((a, x) => a + (x.packed ? x.packed.stores.length : 0), 0);
  return { st: JSON.parse(JSON.stringify(c)), info: `${cities} городов, в Москве ${S.stores.length} точек (бот ${src.length} работающих), в других городах ${other}, ${Math.round(S.day / 365 * 10) / 10}-й год` };
}

async function perf(b, vp, st, throttle) {
  const p = await openPage(b, vp, {});
  const cdp = await p.context().newCDPSession(p);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await p.evaluate((raw) => { localStorage.setItem('bk-ufa-save-v1', raw); BK.App.ACT.continue(); BK.App.setSpeed(0); window.scrollTo(0, 0); }, JSON.stringify(st));
  await p.waitForTimeout(300);
  const chk = await p.evaluate(() => ({ city: BK.CITY && BK.CITY.name, stores: BK.App.state.stores.length, marks: document.querySelectorAll('#map .m-store, #map [data-kind="store"], #map .mk').length }));
  if (chk.city !== 'Москва' || chk.stores < N) issues.push(`[${vp}] загрузка: ${JSON.stringify(chk)}`);
  await p.evaluate(() => {
    const E = BK.Engine; window.__q = { tick: [], lt: [], fr: [] };
    const ot = E.tick; E.tick = function () { const t = performance.now(); const r = ot.apply(this, arguments); __q.tick.push(performance.now() - t); return r; };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) __q.lt.push(e.duration); }).observe({ type: 'longtask' });
    let last = performance.now(); (function f(t) { __q.fr.push(t - last); last = t; requestAnimationFrame(f); })(last);
    setInterval(() => { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) S.chef.pending = null; if (BK.App.ui.modal) BK.App.ACT.closeModal(); }, 100);
  });
  const out = [];
  for (const tab of ['dash', 'stores', 'team', 'russia']) {
    await p.evaluate((t) => { if (t === 'russia') { if (BK.App.ui.view !== 'russia') BK.App.ACT.russia(); } else { if (BK.App.ui.view === 'russia') BK.App.cityView(false); BK.App.ACT.tab({ arg: t }); } BK.App.setSpeed(10); }, tab);
    await p.waitForTimeout(600);
    const d0 = await p.evaluate(() => { __q.tick.length = __q.lt.length = __q.fr.length = 0; return BK.App.state.day; });
    await p.waitForTimeout(5000);
    const r = await p.evaluate((d0) => {
      const s = (a) => [...a].sort((x, y) => x - y), q = __q, fr = s(q.fr.slice(1)), tk = s(q.tick);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      return { days: BK.App.state.day - d0, tick: +avg(tk).toFixed(1), tickMax: +(tk[tk.length - 1] || 0).toFixed(1), fps: +(1000 / avg(fr)).toFixed(0), frP95: +(fr[Math.floor(fr.length * 0.95)] || 0).toFixed(1), long: q.lt.length, longMax: Math.round(Math.max(0, ...q.lt)), longSum: Math.round(q.lt.reduce((a, x) => a + x, 0)), lost: BK.App.state.lost };
    }, d0);
    out.push(`${tab}: ${r.days} дн/5с, тик ${r.tick} мс (макс ${r.tickMax}), ${r.fps} fps, кадр p95 ${r.frP95} мс, задач >50 мс: ${r.long}${r.long ? ` (макс ${r.longMax}, сумма ${r.longSum} мс)` : ''}`);
    if (r.days < 20) issues.push(`[${vp} CPU×${throttle}] ${tab}: игра почти стоит — ${r.days} дн. за 5 с на ×10`);
    if (throttle <= 1 && r.long > 0) issues.push(`[${vp}] ${tab}: долгие задачи без замедления CPU: ${r.long} (макс ${r.longMax} мс)`);
    if (throttle > 1 && r.longSum > 1500) notes.push(`[${vp} CPU×${throttle}] ${tab}: долгие задачи ${r.longSum} мс за 5 с (для сведения)`);
    if (r.lost) issues.push(`[${vp}] банкротство во время замера`);
  }
  await p.evaluate(() => BK.App.setSpeed(0));
  await p.screenshot({ path: path.join(OUT, `moscow-${vp}-x${throttle}.png`) });
  notes.push(`${vp}, CPU×${throttle}: ` + out.join(' | '));
  errors.push(...p.errs.map((e) => `[${vp}] ${e}`));
  await p.context().close();
}

(async () => {
  const t0 = Date.now();
  log('генерирую сеть с Москвой…');
  const sv = moscowSave(); log('  ' + sv.info); notes.push(sv.info);
  notes.push(`сохранение: ${Math.round(JSON.stringify(sv.st).length / 1024)} КБ`);
  const b = await chromium.launch();
  log('d1440 ×1'); await perf(b, 'd1440', sv.st, 1);
  log('m390 ×1'); await perf(b, 'm390', sv.st, 1);
  log('m390 ×4'); await perf(b, 'm390', sv.st, 4);
  await b.close();
  const uniq = [...new Set(issues)], errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\nготово за ${Math.round((Date.now() - t0) / 1000)} с`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
