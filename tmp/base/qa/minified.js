/* Проверка публикуемой сборки в браузере: node qa/minified.js [chromium|webkit] [min|full]
   Берёт dist/khlebnaya-karta.min.html (или несжатый dist/khlebnaya-karta.html), оборачивает в документ, как это делает
   хостинг Artifact, начинает игру, гоняет ~2 игровых месяца на ×10, открывает все вкладки, «Финансы» (период, сортировка,
   фильтр) и окно события. Ждёт «0 ошибок консоли». WebKit ставится так: cd ~/.bk-tools && npx playwright install webkit */
const fs = require('fs'), os = require('os'), path = require('path');
const pw = require('playwright');
const engine = process.argv[2] || 'chromium', which = process.argv[3] || 'min';
const src = path.join(__dirname, '..', 'dist', which === 'min' ? 'khlebnaya-karta.min.html' : 'khlebnaya-karta.html');
if (!fs.existsSync(src)) { console.error('нет файла ' + src + (which === 'min' ? ' — сначала node build.js --min' : '')); process.exit(1); }
const page = path.join(os.tmpdir(), `bk-${which}-${process.pid}.html`);
fs.writeFileSync(page, '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n' + fs.readFileSync(src, 'utf8') + '\n</body></html>');
(async () => {
  const b = await pw[engine].launch();
  const errs = [], notes = [];
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`[${vp.width}] PAGEERR ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push(`[${vp.width}] CONSOLE ${m.text()}`); });
    await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
    await p.addInitScript(() => { try { localStorage.setItem('bk-ufa-tutorial', '0'); } catch (e) {} let x = 7; Math.random = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
    const t0 = Date.now();
    await p.goto('file://' + page);
    await p.waitForSelector('#startForm button', { timeout: 20000 });
    notes.push(`[${vp.width}] стартовый экран за ${Date.now() - t0} мс`);
    await p.click('#startForm button'); await p.waitForTimeout(300);
    await p.click('[data-act="rentProd"]:not([disabled])'); await p.waitForTimeout(200);
    await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(300);
    const cm0 = await p.$('#modal [data-act="closeModal"]'); if (cm0) await cm0.click();
    // ~2 месяца игры без реального ожидания
    await p.evaluate(() => { const S = BK.App.state; for (let i = 0; i < 65; i++) { if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) S.chef.pending = null; BK.Engine.tick(S); } BK.App.refresh && BK.App.refresh(); });
    await p.evaluate(() => BK.App.setSpeed(10)); await p.waitForTimeout(1500); await p.evaluate(() => BK.App.setSpeed(0));
    for (let k = 0; k < 3; k++) { const c = await p.$('#modal [data-choice]:not([disabled]), #modal [data-act="closeModal"], #chefOk:not([disabled])'); if (c) { await c.click(); await p.waitForTimeout(150); } }
    for (const t of ['dash', 'stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) { await p.evaluate((t) => BK.App.ACT.tab({ arg: t }), t); await p.waitForTimeout(120); }
    await p.evaluate(() => BK.App.ACT.tab({ arg: 'fin' })); await p.waitForTimeout(150);
    for (const sel of ['[data-act="finPeriod"][data-arg="q"]', '[data-act="finSort"][data-arg="rev"]', '[data-act="finSort"][data-arg="rev"]', '[data-act="finFilter"][data-arg="loss"]', '[data-act="finFilter"][data-arg="all"]']) { const el = await p.$(sel); if (el) { await el.click(); await p.waitForTimeout(120); } }
    const fin = await p.evaluate(() => ({ wf: !!document.querySelector('.fin-wf'), rows: document.querySelectorAll('.fintbl tbody tr').length, w: document.documentElement.scrollWidth }));
    notes.push(`[${vp.width}] финансы: водопад ${fin.wf ? 'есть' : 'НЕТ'}, строк точек ${fin.rows}, ширина страницы ${fin.w}`);
    if (fin.w > vp.width + 1) errs.push(`[${vp.width}] горизонтальная прокрутка: ${fin.w}`);
    await p.evaluate(() => { const S = BK.App.state; const e = BK.EVENTS.find((x) => x.choices && x.choices.length > 2); const st = S.stores[0]; S.ev.pending = { id: e.id, kind: e.kind, title: e.title, text: e.text, tg: { scope: 'store', target: st.id }, day: S.day, effectsText: [], choices: e.choices.map((c) => ({ label: c.label, desc: c.desc, cost: 100000 })) }; });
    await p.waitForTimeout(500);
    const fx = await p.evaluate(() => document.querySelectorAll('#modal .fxc').length);
    notes.push(`[${vp.width}] окно события: значков последствий ${fx}`);
    if (!fx) errs.push(`[${vp.width}] в окне события нет значков последствий`);
    await p.click('#modal [data-choice]:not([disabled])'); await p.waitForTimeout(150);
    const st = await p.evaluate(() => ({ day: BK.App.state.day, stores: BK.App.state.stores.length }));
    notes.push(`[${vp.width}] день ${st.day}, точек ${st.stores}`);
    await ctx.close();
  }
  await b.close();
  fs.unlinkSync(page);
  console.log(`${engine} · ${path.basename(src)} (${(fs.statSync(src).size / 1024).toFixed(0)} КБ)`);
  for (const n of notes) console.log('  ' + n);
  console.log(errs.length ? errs.join('\n') : '0 ошибок консоли');
  process.exit(errs.length ? 1 : 0);
})();
