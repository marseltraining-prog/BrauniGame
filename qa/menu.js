/* QA: статистика продуктов — окно шеф-пекаря и вкладка «Меню» (src/prodstats.js, src/ui/menu-stats.js).
   Сохранение бота good (6 лет, с историей продаж) и то же сохранение «до статистики» (без S.prodStats — «копим статистику»).
   Экраны 1440 / 390 / 360, светлая и тёмная тема: вёрстка, мусор в тексте, достижимость кнопок, выбор и утверждение меню.
   Запуск: node qa/menu.js [папка=qa/shots/menu]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/menu';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  // слабая позиция (кумыс: низкая популярность и маржа) — год в меню, чтобы в окне шефа был «кандидат на вывод»
  const S = r.S, E = globalThis.BK.Engine;
  if (!S.menu.some((m) => m.id === 'kumis')) S.menu.push({ id: 'kumis', pm: 1 });
  for (let i = 0; i < 400 && !S.lost; i++) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); S.notify.length = 0; E.tick(S); }
  if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []);
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return JSON.parse(JSON.stringify(c));
}
async function loadState(p, st) {
  await p.evaluate((raw) => { localStorage.setItem('bk-ufa-save-v1', raw); BK.App.ACT.continue(); BK.App.setSpeed(0); window.scrollTo(0, 0); }, JSON.stringify(st));
  await p.waitForTimeout(150);
  await p.evaluate(() => { const S = BK.App.state; S.ev.pending = null; S.chef.pending = null; S.notify.length = 0; BK.App.ui.modalQueue.length = 0; BK.App.closeModal(); document.getElementById('toasts').innerHTML = ''; });
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = (document.querySelector('#modal .modal') || document.body).innerText;
    return (t.match(/.{0,30}(NaN|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function modalReach(p, label) {
  return p.evaluate((label) => {
    const m = document.querySelector('#modal .modal'); if (!m) return [`[${label}] модалка не открылась`];
    const keep = m.scrollTop; m.scrollTop = m.scrollHeight;
    const btns = [...m.querySelectorAll('.modal-f button')]; const last = btns[btns.length - 1];
    const out = [];
    if (!last) out.push(`[${label}] в модалке нет кнопок`);
    else { const r = last.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.top < 0) out.push(`[${label}] кнопка «${last.textContent.trim()}» вне экрана`); }
    const mr = m.getBoundingClientRect(); if (mr.right > innerWidth + 1 || mr.left < -1) out.push(`[${label}] модалка шире экрана`);
    m.scrollTop = keep;
    return out;
  }, label);
}

async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5 });
  const shot = async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 150);
    await p.screenshot({ path: path.join(dir, n + '.png'), fullPage: !!o.full });
    issues.push(...await layoutCheck(p, `${tag} ${n}`, { mobile }));
    issues.push(...await textProblems(p, `${tag} ${n}`));
    if (o.modal) issues.push(...await modalReach(p, `${tag} ${n}`));
  };
  const modalTo = (sel) => p.evaluate((sel) => { const m = document.querySelector('#modal .modal'), el = m && m.querySelector(sel); if (el) m.scrollTop = el.offsetTop - 40; return !!el; }, sel);

  /* 1. сохранение со статистикой */
  await loadState(p, sv.full);
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'menu' }); window.scrollTo(0, 0); });
  await shot('10-tab-menu', { full: mobile });
  const tab = await p.evaluate(() => ({ lines: document.querySelectorAll('#pbody .ms-line').length, rows: document.querySelectorAll('#pbody .prodrow').length, est: document.querySelectorAll('#pbody .ms-line.est').length, spark: document.querySelectorAll('#pbody .ms-line .ms-spark path').length, src: (document.querySelector('#pbody .ms-src') || {}).textContent || '' }));
  if (tab.lines !== tab.rows || !tab.rows) issues.push(`[${tag}] вкладка «Меню»: строк статистики ${tab.lines} при ${tab.rows} продуктах`);
  if (tab.est) issues.push(`[${tag}] вкладка «Меню»: при накопленной истории ${tab.est} строк помечены как оценка`);
  if (!tab.spark) issues.push(`[${tag}] вкладка «Меню»: нет мини-графиков`);
  if (!/среднее за 12 месяцев/.test(tab.src)) issues.push(`[${tag}] вкладка «Меню»: подпись источника «${tab.src}»`);

  await p.evaluate(() => BK.Engine.proposeChef(BK.App.state)); await p.waitForTimeout(80);
  await p.evaluate(() => { if (!BK.App.ui.modal) BK.App.ACT.chef(); }); await p.waitForTimeout(150);
  await shot('20-m-chef', { modal: true });
  const ch = await p.evaluate(() => {
    const S = BK.App.state, q = (s) => document.querySelectorAll('#modal ' + s);
    return { news: q('.ms-new').length, cur: q('.ms-cur').length, menu: S.menu.length, pend: S.chef.pending.length, cand: q('.ms-cur.cand').length, flags: q('.ms-cur .ms-flag').length, ifs: q('.ms-cur .ms-if').length, note: q('.ms-note').length, wide: document.querySelector('#modal .modal').getBoundingClientRect().width };
  });
  if (ch.news !== ch.pend) issues.push(`[${tag}] шеф: карточек новинок ${ch.news} из ${ch.pend}`);
  if (ch.cur !== ch.menu) issues.push(`[${tag}] шеф: строк текущего меню ${ch.cur} из ${ch.menu}`);
  if (ch.ifs !== ch.menu) issues.push(`[${tag}] шеф: «если вывести» у ${ch.ifs} из ${ch.menu}`);
  if (ch.note) issues.push(`[${tag}] шеф: «копим статистику» при накопленной истории`);
  if (!ch.cand) issues.push(`[${tag}] шеф: в сохранении со слабой позицией нет «кандидата на вывод»`);
  if (vp === "d1440" && theme === "light") notes.push(`шеф (история 12+ мес.): новинок ${ch.news}, меню ${ch.cur}, кандидатов на вывод ${ch.cand}, пометок ${ch.flags}, ширина окна ${Math.round(ch.wide)} px`);
  if (await modalTo('.ms-cur')) await shot('21-m-chef-menu');
  await p.evaluate(() => { const m = document.querySelector('#modal .modal'); m.scrollTop = m.scrollHeight; }); await shot('22-m-chef-bottom');
  // выбрать новинку и вывести позицию (предпочтительно кандидата)
  await p.evaluate(() => { const m = document.querySelector('#modal .modal'); m.scrollTop = 0; });
  const pick = p.locator('#modal label.chefitem.ms-new:has([data-pick]:not([disabled]))');
  if (await pick.count()) { await pick.first().click(); await p.waitForTimeout(80); } else issues.push(`[${tag}] шеф: нет доступной новинки`);
  const dropSel = (await p.locator('#modal label.ms-cur.cand').count()) ? '#modal label.ms-cur.cand' : '#modal label.ms-cur';
  const dropId = await p.locator(dropSel + ' [data-drop]').first().getAttribute('data-drop');
  await p.locator(dropSel).first().click(); await p.waitForTimeout(80);
  const sum = await p.evaluate(() => (document.querySelector('#modal .ms-sum') || {}).textContent || '');
  if (!/После изменений/.test(sum)) issues.push(`[${tag}] шеф: нет итога «После изменений» после выбора`);
  await p.evaluate(() => { const m = document.querySelector('#modal .modal'); m.scrollTop = m.scrollHeight; });
  await shot('23-m-chef-picked', { modal: true });
  if (await p.locator('#chefOk').isDisabled()) issues.push(`[${tag}] шеф: «Утвердить» выключена после выбора 1+1`);
  else {
    await p.click('#chefOk'); await p.waitForTimeout(120);
    const r = await p.evaluate((id) => ({ pend: !!BK.App.state.chef.pending, has: BK.App.state.menu.some((m) => m.id === id) }), dropId);
    if (r.pend) issues.push(`[${tag}] шеф: решение не принято`);
    if (r.has) issues.push(`[${tag}] шеф: выведенная позиция осталась в меню`);
  }
  // новинка без истории — во вкладке «Меню» помечена как оценка
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'menu' }); window.scrollTo(0, 0); });
  await shot('11-tab-menu-after', { full: mobile });
  const est2 = await p.evaluate(() => document.querySelectorAll('#pbody .ms-line.est').length);
  if (est2 < 1) issues.push(`[${tag}] вкладка «Меню»: новинка без истории не помечена «оценка»`);

  /* 2. старое сохранение — без S.prodStats */
  if (vp === 'd1440' || theme === 'dark') {
    await loadState(p, sv.old);
    await p.evaluate(() => { BK.App.ACT.tab({ arg: 'menu' }); window.scrollTo(0, 0); });
    await shot('30-old-tab-menu', { full: mobile });
    const o1 = await p.evaluate(() => ({ est: document.querySelectorAll('#pbody .ms-line.est').length, rows: document.querySelectorAll('#pbody .prodrow').length, src: (document.querySelector('#pbody .ms-src') || {}).textContent || '' }));
    if (o1.est !== o1.rows) issues.push(`[${tag}] старое сохранение: оценка у ${o1.est} из ${o1.rows}`);
    if (!/копим статистику/.test(o1.src)) issues.push(`[${tag}] старое сохранение: нет «копим статистику» во вкладке`);
    await p.evaluate(() => BK.Engine.proposeChef(BK.App.state)); await p.waitForTimeout(80);
    await p.evaluate(() => { if (!BK.App.ui.modal) BK.App.ACT.chef(); }); await p.waitForTimeout(150);
    await shot('31-old-m-chef', { modal: true });
    if (!(await p.locator('#modal .ms-note').count())) issues.push(`[${tag}] старое сохранение: в окне шефа нет «Копим статистику»`);
    await p.evaluate(() => { const S = BK.App.state; BK.Engine.chefConfirm(S, [], []); BK.App.closeModal(); });
    // месяц игры: статистика начинает копиться и попадает в сохранение
    const d = await p.evaluate(() => { const S = BK.App.state, E = BK.Engine; let n = 0; while (n++ < 40) { E.tick(S); if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); } S.notify.length = 0; BK.App.save(); const raw = JSON.parse(localStorage.getItem('bk-ufa-save-v1')); const c = raw.prodStats && raw.prodStats.c && raw.prodStats.c.ufa; return { months: c ? c.hist.length : -1 }; });
    if (d.months < 1) issues.push(`[${tag}] старое сохранение: через 40 дней история продаж не появилась в сохранении (${d.months})`);
    await p.evaluate(() => { BK.App.ACT.tab({ arg: 'dash' }); BK.App.ACT.tab({ arg: 'menu' }); }); await p.waitForTimeout(100);
    const src = await p.evaluate(() => (document.querySelector('#pbody .ms-src') || {}).textContent || '');
    if (!/среднее за [12] месяц/.test(src)) issues.push(`[${tag}] старое сохранение: после месяца подпись «${src}»`);
  }
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const t0 = Date.now();
  log('генерация сохранения (бот good, 6 лет)…');
  const full = botSave(6, 7919);
  const old = JSON.parse(JSON.stringify(full)); delete old.prodStats;
  const sv = { full, old };
  const b = await chromium.launch();
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { log('экраны', vp, theme); await screens(b, vp, theme, sv); }
  await b.close();
  const uniq = [...new Set(issues)];
  const txt = [`QA статистики продуктов — ${new Date().toISOString()}`, '', ...notes.map((n) => '• ' + n), '', `Проблем: ${uniq.length}`, ...uniq, '', `Ошибок консоли: ${errors.length}`, ...errors].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log(notes.join('\n'));
  log(`\nИтог: ${uniq.length} проблем, ${errors.length} ошибок консоли (${((Date.now() - t0) / 1000).toFixed(0)} с) → ${path.join(OUT, 'issues.txt')}`);
  if (uniq.length) log(uniq.slice(0, 40).join('\n'));
  if (errors.length) log(errors.slice(0, 10).join('\n'));
  process.exit(uniq.length || errors.length ? 1 : 0);
})();
