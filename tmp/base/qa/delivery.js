/* QA: доставка через агрегаторы и время суток (ROADMAP, этап 2). Блок сети во вкладке «Точки», раздел в карточке точки,
   «Когда приходят гости» в карточке помещения, слой карты «Время суток», строка в отчёте, переключатели сети и точки,
   старое сохранение без полей агрегатора. Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/delivery.js [папка=qa/shots/delivery]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/delivery';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}
function oldSave(st) { // сохранение до этапа 2: без S.agg и полей точек
  const c = JSON.parse(JSON.stringify(st)); delete c.agg;
  for (const s of c.stores) { delete s.agg; delete s.aggDay; delete s.aggPaid; }
  for (const h of c.history) if (h.pnl) { delete h.pnl.agg; delete h.pnl.aggRev; delete h.pnl.aggOrders; }
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = document.querySelector('#pbody').innerText + ' ' + (document.querySelector('.maplegend') || {}).innerText;
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function start(b, vp, theme, save) {
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save: JSON.stringify(save) });
  await p.evaluate((t) => { BK.App.ACT.theme({ arg: t }); BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); }, theme);
  await p.waitForTimeout(250);
  await p.evaluate(() => { if (BK.App.ui.modal) BK.App.closeModal(); });
  return p;
}
async function shot(p, name, sel) {
  const el = sel ? await p.$(sel) : null;
  if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(80); }
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}

async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await start(b, vp, theme, sv);
  // вкладка «Точки»: блок сети
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'stores' })); await p.waitForTimeout(150);
  if (!(await p.$('#aggnet'))) issues.push(`[${tag}] нет блока «Доставка через агрегаторы»`);
  issues.push(...await layoutCheck(p, `${tag} точки`, { mobile }), ...await textProblems(p, `${tag} точки`));
  await shot(p, `stores-${tag}`, '#aggnet');
  // карточка подключённой точки
  const id = await p.evaluate(() => { const st = BK.App.state.stores.find((s) => s.agg && s.status === 'open') || BK.App.state.stores[0]; BK.App.ACT.openStore({ arg: st.id }); return st.id; });
  await p.waitForTimeout(150);
  if (!(await p.$('#dlvst .dp-bar'))) issues.push(`[${tag}] нет раздела «Время суток и доставка» в карточке точки`);
  await shot(p, `store-${tag}`, '#dlvst');
  issues.push(...await layoutCheck(p, `${tag} карточка точки`, { mobile }), ...await textProblems(p, `${tag} карточка точки`));
  // переключатель на точке
  const before = await p.evaluate((id) => !!BK.Engine.byId(BK.App.state.stores, id).agg, id);
  await p.click('#dlvst [data-act="aggStore"]'); await p.waitForTimeout(120);
  const after = await p.evaluate((id) => !!BK.Engine.byId(BK.App.state.stores, id).agg, id);
  if (before === after) issues.push(`[${tag}] кнопка на точке не переключила доставку`);
  // «Рынок»: карточка помещения
  await p.evaluate(() => { const S = BK.App.state; if (!S.offers.length) BK.Engine.refreshOffers(S); BK.App.ACT.tab({ arg: 'market' }); }); await p.waitForTimeout(150);
  if (!(await p.$('.card[data-offer] .dpbox'))) issues.push(`[${tag}] нет «Когда приходят гости» в карточке помещения`);
  await shot(p, `market-${tag}`, '.card[data-offer] .dpbox');
  issues.push(...await layoutCheck(p, `${tag} рынок`, { mobile }), ...await textProblems(p, `${tag} рынок`));
  // слой карты «Время суток»
  await p.evaluate(() => { const b = document.querySelector('.ml-chip[data-layer="daypart"]'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  await p.click('.ml-chip[data-layer="daypart"]'); await p.waitForTimeout(150);
  if (mobile) await p.evaluate(() => { window.scrollTo(0, 0); const t = document.querySelector('.ml-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
  await p.waitForTimeout(120);
  const lg = await p.evaluate(() => (document.querySelector('.maplegend') || {}).innerText || '');
  if (!/когда приходят гости/i.test(lg)) issues.push(`[${tag}] легенда слоя «Время суток» не показана: ${lg.slice(0, 60)}`);
  const colored = await p.evaluate(() => document.querySelectorAll('.m-store circle.b[class*="t-dp-"], .m-cl').length);
  if (!colored) issues.push(`[${tag}] точки не окрашены по времени суток`);
  await shot(p, `map-daypart-${tag}`, '.mapwrap');
  issues.push(...await layoutCheck(p, `${tag} слой время суток`, { mobile }));
  // подсказка на карте (десктоп)
  if (!mobile) {
    const box = await p.evaluate(() => { const g = document.querySelector('.m-store'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (box) { await p.mouse.move(box.x, box.y); await p.waitForTimeout(120); const tip = await p.evaluate(() => { const t = document.querySelector('.maptip'); return t && !t.hidden ? t.innerText : ''; }); if (!/пик|весь день/.test(tip)) issues.push(`[${tag}] в подсказке карты нет времени суток: ${tip.slice(0, 80)}`); }
  }
  await p.evaluate(() => { const b = document.querySelector('.ml-chip[data-layer="mood"]'); if (b) b.click(); });
  // «Финансы»: строка агрегаторов в отчёте
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'fin' })); await p.waitForTimeout(150);
  const fin = await p.evaluate(() => document.querySelector('#pbody').innerText);
  if (!/Агрегаторы доставки/.test(fin)) issues.push(`[${tag}] в отчёте нет строки «Агрегаторы доставки»`);
  issues.push(...await textProblems(p, `${tag} финансы`));
  // переключатель сети
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'stores' })); await p.waitForTimeout(100);
  const r = await p.evaluate(() => { const S = BK.App.state; BK.App.ACT.aggNet({ arg: '0' }); const off = S.stores.every((s) => !s.agg) && !S.agg.on; S.cash += 1e7; BK.App.ACT.aggNet({ arg: '1' }); const on = S.stores.every((s) => s.agg) && S.agg.on; return { off, on }; });
  if (!r.off || !r.on) issues.push(`[${tag}] переключатель сети не сработал: ${JSON.stringify(r)}`);
  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  log('генерирую сохранения ботом…');
  const sv = botSave(4, 7919);
  notes.push(`бот 4 года: точек ${sv.stores.length}, в агрегаторах ${sv.stores.filter((s) => s.agg).length}`);
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { log(vp, theme); await screens(b, vp, theme, sv); }
  // старое сохранение (до этапа 2)
  {
    const p = await start(b, 'd1440', 'light', oldSave(sv));
    const r = await p.evaluate(() => { const S = BK.App.state; BK.App.ACT.tab({ arg: 'stores' }); const d0 = S.day; BK.App.setSpeed(0); for (let i = 0; i < 40; i++) BK.Engine.tick(S); return { any: S.stores.some((s) => s.agg), on: !!(S.agg && S.agg.on), days: S.day - d0, block: !!document.querySelector('#aggnet'), rev: S.month.rev }; });
    if (r.any || r.on) issues.push('[старое сохранение] агрегатор включился сам');
    if (!r.block) issues.push('[старое сохранение] нет блока доставки');
    if (!(r.days > 0) || !isFinite(r.rev)) issues.push(`[старое сохранение] игра не идёт: ${JSON.stringify(r)}`);
    issues.push(...await textProblems(p, 'старое сохранение'));
    if (p.errs.length) issues.push(...p.errs.map((e) => `[старое сохранение] ${e}`));
    await p.context().close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), notes.concat(issues).join('\n') + '\n');
  log(notes.join('\n'));
  log(issues.length ? issues.join('\n') : '');
  log(`Итог: ${issues.length} проблем, ${issues.filter((x) => /PAGEERR|CONSOLE/.test(x)).length} ошибок консоли`);
  process.exit(issues.length ? 1 : 0);
})();
