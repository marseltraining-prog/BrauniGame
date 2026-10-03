/* QA: личные тренеры игрока (src/trainers.js, src/ui/trainers-ui.js).
   Сохранение бота avg (3 года) БЕЗ S.player (как старое сохранение) → загрузка → блок в «Сводке» → окно «Личные тренеры» →
   найм тренера 1-го уровня (деньги списаны) → обучение идёт (шкала, плата 1-го числа) → навык 1 (общий сигнал в «Требует внимания»)
   → навыки 3-го уровня: лампочки на карте, подсказки с цифрами в «Требует внимания», «Взгляд тренера» в карточке точки,
   кнопка подсказки в окне ведёт к точке и закрывает окно; сохранение/загрузка навыков. 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/trainers.js [папка=qa/shots/trainers]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/trainers';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], errors = [];
const log = (...a) => console.log(...a);

function botSave(years, seed, level) {
  const { play } = require('../sim/bot');
  const r = play({ level: level || 'avg', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.player; // как сохранение до тренеров
  c.ev = Object.assign({}, c.ev, { pending: null }); c.chef = Object.assign({}, c.chef, { pending: null });
  return c;
}
// прогон дней движком (события — первый вариант, шеф — без изменений)
const runDays = (p, n) => p.evaluate((n) => {
  const S = BK.App.state; BK.App.setSpeed(0);
  for (let i = 0; i < n; i++) {
    if (S.ev.pending) BK.Engine.resolveEvent(S, 0);
    if (S.chef.pending) BK.Engine.chefConfirm(S, [], []);
    if (!BK.Engine.tick(S)) { if (S.phase !== 'play') break; }
  }
  S.notify.length = 0; BK.App.refresh();
  return S.day;
}, n);

async function scenario(b, sv, vp, dark) {
  const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp !== 'd1440';
  const p = await openPage(b, vp, { dark, save: JSON.stringify(sv) });
  const shot = async (name) => { await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  const lay = async (label) => { issues.push(...(await layoutCheck(p, `${tag} ${label}`, { mobile }))); };
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.ACT.tab({ arg: 'dash' }); });
  // старое сохранение: S.player создаётся, блок в «Сводке» с приглашением
  const st0 = await p.evaluate(() => ({ pl: JSON.stringify(BK.App.state.player), dash: !!document.querySelector('#pbody .trn-dash'), btn: !!document.querySelector('#pbody .trn-dash [data-act="trainers"]') }));
  if (!st0.dash || !st0.btn) issues.push(`[${tag}] нет блока «Личные тренеры» в «Сводке»`);
  if (!/"skills":\{\}/.test(st0.pl || '')) issues.push(`[${tag}] старое сохранение: S.player не создан (${st0.pl})`);
  await p.evaluate(() => { const el = document.querySelector('#pbody .trn-dash'); el.scrollIntoView({ block: 'center' }); });
  await shot('01-dash-invite'); await lay('сводка-приглашение');
  // окно тренеров и найм
  await p.evaluate(() => { BK.App.state.cash = Math.max(BK.App.state.cash, 5e7); });
  await p.click('#pbody .trn-dash [data-act="trainers"]'); await p.waitForTimeout(150);
  if (!(await p.locator('#modal .trn-modal').count())) issues.push(`[${tag}] окно тренеров не открылось`);
  await shot('02-modal'); await lay('окно тренеров');
  const locked = await p.evaluate(() => { const c = document.querySelector('.trn-area[data-area="corp"]'); return c ? c.classList.contains('locked') === !BK.Trainers.corpOn(BK.App.state) : false; });
  if (!locked) issues.push(`[${tag}] область «Директора и города» не заблокирована в первом акте`);
  const cash0 = await p.evaluate(() => BK.App.state.cash);
  await p.click('.trn-area[data-area="sales"] [data-act="trHire"][data-arg2="1"]'); await p.waitForTimeout(150);
  const h = await p.evaluate(() => { const S = BK.App.state; return { n: S.player.study.length, fee: BK.Trainers.price(S, 'sales', 1).fee, cash: S.cash, now: !!document.querySelector('.trn-area[data-area="sales"] .trn-prog') }; });
  if (h.n !== 1) issues.push(`[${tag}] тренер не нанят (study=${h.n})`);
  if (Math.abs(cash0 - h.cash - h.fee) > 1) issues.push(`[${tag}] найм: списано ${cash0 - h.cash}, ожидалось ${h.fee}`);
  if (!h.now) issues.push(`[${tag}] в окне нет шкалы обучения`);
  // второй тренер (персонал, уровень 2) и третий — отказ по загрузке
  await p.click('.trn-area[data-area="staff"] [data-act="trHire"][data-arg2="2"]'); await p.waitForTimeout(120);
  const dis = await p.evaluate(() => document.querySelector('.trn-area[data-area="prod"] [data-act="trHire"][data-arg2="1"]').disabled);
  if (!dis) issues.push(`[${tag}] третья программа не заблокирована (загрузка 2 из 2)`);
  await shot('03-modal-studying');
  await p.click('#modal .modal-f [data-act="closeModal"]'); await p.waitForTimeout(100);
  await p.evaluate(() => { const el = document.querySelector('#pbody .trn-dash'); el.scrollIntoView({ block: 'center' }); });
  if (!(await p.locator('#pbody .trn-dash .trn-prog').count())) issues.push(`[${tag}] нет шкалы обучения в «Сводке»`);
  await shot('04-dash-progress'); await lay('сводка-обучение');
  // обучение идёт: 46 дней, плата 1-го числа
  const sp0 = await p.evaluate(() => BK.App.state.player.spent);
  await runDays(p, 46);
  const r1 = await p.evaluate(() => { const S = BK.App.state; return { sk: S.player.skills.sales, st: S.player.study.map((x) => x.area + x.done), spent: S.player.spent, att: [...document.querySelectorAll('#pbody .att .ic.trn')].length, phase: S.phase }; });
  if (r1.phase !== 'play') issues.push(`[${tag}] игра закончилась во время теста (${r1.phase})`);
  if (r1.sk !== 1) issues.push(`[${tag}] навык «Продажи» не получен за 46 дней (${r1.sk}, ${r1.st})`);
  if (!(r1.spent > sp0)) issues.push(`[${tag}] плата 1-го числа не списана`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' }));
  const lvl1 = await p.evaluate(() => BK.Trainers.hints(BK.App.state).filter((x) => x.lvl === 1).length);
  log(`  ${tag}: после 46 дней навык продаж ${r1.sk}, подсказок 1-го уровня ${lvl1}, в «Требует внимания» ${r1.att}`);
  if (lvl1 && !(await p.locator('#pbody .att .ic.trn').count())) issues.push(`[${tag}] подсказки 1-го уровня есть, но нет в «Требует внимания»`);
  // навыки 3-го уровня во всех областях первого акта
  await p.evaluate(() => { const S = BK.App.state; S.player.study = []; Object.assign(S.player.skills, { sales: 3, staff: 3, prod: 3, fin: 3 }); S.day++; BK.App.ACT.tab({ arg: 'dash' }); });
  const r3 = await p.evaluate(() => { const S = BK.App.state, hs = BK.Trainers.hints(S); return { n: hs.length, store: (hs.find((x) => x.storeId) || {}).storeId || null, att: document.querySelectorAll('#pbody .att .ic.trn').length, map: document.querySelectorAll('.m-bdg.trn').length, txt: [...document.querySelectorAll('#pbody .att .it')].filter((x) => x.querySelector('.ic.trn')).map((x) => x.innerText.replace(/\s+/g, ' ')).slice(0, 3) }; });
  log(`  ${tag}: навыки 3 — подсказок ${r3.n}, в «Требует внимания» ${r3.att}, лампочек на карте ${r3.map}`);
  if (!r3.n) issues.push(`[${tag}] навыки 3-го уровня ничего не нашли у бота avg`);
  if (r3.n && !r3.att) issues.push(`[${tag}] нет подсказок в «Требует внимания»`);
  if (r3.store && !r3.map) issues.push(`[${tag}] нет лампочек на карте`);
  for (const t of r3.txt) if (!/Что сделать/.test(t)) issues.push(`[${tag}] подсказка 3-го уровня без «Что сделать»: ${t.slice(0, 80)}`);
  await p.evaluate(() => { const el = document.querySelector('#pbody .att .ic.trn'); if (el) el.scrollIntoView({ block: 'center' }); });
  await shot('05-attention-lvl3'); await lay('требует внимания');
  if (!mobile) { await p.evaluate(() => { document.getElementById('pbody').scrollTop = 0; }); await shot('06-map-lamps'); }
  else { await p.evaluate(() => window.scrollTo(0, 0)); await shot('06-map-lamps'); }
  // карточка точки
  if (r3.store) {
    await p.evaluate((id) => BK.App.ACT.openStore({ arg: id }), r3.store);
    await p.waitForTimeout(120);
    const cs = await p.evaluate(() => ({ n: document.querySelectorAll('#pbody .trn-store .trn-hint').length, t: (document.querySelector('#pbody .trn-store') || {}).innerText || '' }));
    if (!cs.n) issues.push(`[${tag}] нет «Взгляда тренера» в карточке точки`);
    if (cs.n && !/Что сделать/.test(cs.t)) issues.push(`[${tag}] в карточке точки нет «Что сделать»`);
    await p.evaluate(() => { const el = document.querySelector('#pbody .trn-store'); if (el) el.scrollIntoView({ block: 'center' }); });
    await shot('07-store-card'); await lay('карточка точки');
    // всплывающая подсказка на карте
    const tip = await p.evaluate((id) => { const st = BK.Engine.byId(BK.App.state.stores, id); return BK.TrainersUI.tip(BK.App.state, st); }, r3.store);
    if (!/Тренер:/.test(tip)) issues.push(`[${tag}] во всплывающей подсказке точки нет строки тренера`);
  }
  // окно: список подсказок, кнопка ведёт к точке и закрывает окно
  await p.evaluate(() => BK.App.ACT.trainers({ arg: 'hints' })); await p.waitForTimeout(150);
  await shot('08-modal-hints'); await lay('окно-подсказки');
  const go = p.locator('#trnHints [data-act="openStore"]').first();
  if (await go.count()) {
    await go.click(); await p.waitForTimeout(150);
    const r = await p.evaluate(() => ({ modal: !!BK.App.ui.modal, tab: BK.App.ui.tab, sid: BK.App.ui.storeId }));
    if (r.modal || r.tab !== 'stores' || !r.sid) issues.push(`[${tag}] кнопка подсказки не открыла точку: ${JSON.stringify(r)}`);
  } else issues.push(`[${tag}] в окне нет кнопки перехода к точке`);
  // уровень 2: место и причина без цифр
  await p.evaluate(() => { const S = BK.App.state; Object.assign(S.player.skills, { sales: 2, staff: 2, prod: 2, fin: 2 }); S.day++; BK.App.ACT.tab({ arg: 'dash' }); });
  const l2 = await p.evaluate(() => [...document.querySelectorAll('#pbody .att .it')].filter((x) => x.querySelector('.ic.trn')).map((x) => x.innerText));
  if (l2.some((t) => /Что сделать/.test(t))) issues.push(`[${tag}] навык 2-го уровня показывает «Что сделать» (это уровень 3)`);
  // сохранение и загрузка
  const back = await p.evaluate(() => { BK.App.save(); const raw = JSON.parse(localStorage.getItem(BK.Slots.key())); return raw.player && raw.player.skills.sales; });
  if (back !== 2) issues.push(`[${tag}] навык не сохранился (${back})`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  log('сохранение бота avg, 3 года…');
  const sv = botSave(3, 20411, 'avg');
  const b = await chromium.launch();
  for (const [vp, dark] of [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]]) { log(`${vp}${dark ? ' тёмная' : ''}`); await scenario(b, sv, vp, dark); }
  await b.close();
  const all = issues.concat(errors);
  fs.writeFileSync(path.join(OUT, 'issues.txt'), all.join('\n') + '\n');
  log(`\nИтог: ${issues.length} проблем, ${errors.length} ошибок консоли`);
  for (const x of all.slice(0, 40)) log(' - ' + x);
  process.exit(all.length ? 1 : 0);
})();
