/* QA: управляющие точек (src/managers.js, src/ui/managers-ui.js).
   Сохранение бота avg (5+ точек) БЕЗ S.managers (как старое сохранение) → загрузка → «Можно нанять управляющего» в «Требует внимания»
   и блок в «Сводке» → окно «Управляющие» (2–3 кандидата, оклад растёт с качеством) → найм (списано 2 оклада) → доклад:
   «На согласование» в «Сводке», тост → «Сделать» (исполнено сразу, в истории «сделано») → «Не делать» → сгорание по сроку →
   предложения по точке в карточке точки → оклад 1-го числа → окно со статистикой и историей → сохранение/загрузка.
   1440 / 390 / 360, светлая и тёмная тема. Запуск: node qa/managers.js [папка=qa/shots/managers]
   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/managers';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], errors = [];
const log = (...a) => console.log(...a);

function botSave(years, seed, level) {
  const { play } = require('../sim/bot');
  const r = play({ level: level || 'avg', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.managers; // как сохранение до управляющих
  c.ev = Object.assign({}, c.ev, { pending: null }); c.chef = Object.assign({}, c.chef, { pending: null });
  return c;
}
const runDays = (p, n, stopOnProps) => p.evaluate(([n, stop]) => {
  const S = BK.App.state; BK.App.setSpeed(0);
  let i = 0;
  for (; i < n; i++) {
    if (S.ev.pending) BK.Engine.resolveEvent(S, 0);
    if (S.chef.pending) BK.Engine.chefConfirm(S, [], []);
    if (!BK.Engine.tick(S)) { if (S.phase !== 'play') break; }
    if (stop && BK.Managers.open(S).length) break;
  }
  BK.App.refresh();
  return { day: S.day, i };
}, [n, !!stopOnProps]);
// доклад прямо сейчас: управляющий «внимательный», срок доклада — сегодня; до 40 попыток, пока не принесёт хоть что-то
const forceReport = (p, want) => p.evaluate((want) => {
  const S = BK.App.state, M = BK.Managers, m = S.managers.list[0];
  const keep = { obs: m.obs, acc: m.acc };
  Object.assign(m, { obs: 0.97, acc: want === 'wrong' ? 0 : 0.98 });
  let tries = 0;
  // «испортить» точку, по которой ещё нет предложений: люди недовольны, одного не хватает — будет что предложить
  const busy = new Set(M.open(S).map((x) => x.storeId));
  const st = S.stores.find((x) => x.status === 'open' && x.staff.length > 2 && !busy.has(x.id) && !S.managers.done.some((d) => d.storeId === x.id));
  if (st) { st.staff.pop(); for (const e of st.staff) { e.mood = 34; e.unhappy = 2; e.lvl = Math.min(e.lvl, 2); } }
  while (M.open(S).length === 0 && tries++ < 40) {
    m.next = S.day + 1;
    if (S.ev.pending) BK.Engine.resolveEvent(S, 0);
    if (S.chef.pending) BK.Engine.chefConfirm(S, [], []);
    BK.Engine.tick(S);
  }
  Object.assign(m, keep); m.next = S.day + 400; // дальше — без новых докладов, чтобы проверить сгорание
  S.notify.length = 0; BK.App.refresh();
  return M.open(S).map((x) => ({ id: x.id, kind: x.kind, cost: x.cost, st: x.storeId, right: x.right }));
}, want || '');

async function scenario(b, sv, vp, dark) {
  const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp !== 'd1440';
  const p = await openPage(b, vp, { dark, save: JSON.stringify(sv) });
  const shot = async (name) => { await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  const lay = async (label) => { issues.push(...(await layoutCheck(p, `${tag} ${label}`, { mobile }))); };
  const scrollTo = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'start' }); return !!el; }, sel);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.state.cash = Math.max(BK.App.state.cash, 6e7); BK.App.ACT.tab({ arg: 'dash' }); });
  // старое сохранение без S.managers: открыто 5+ точек — приглашение
  const s0 = await p.evaluate(() => ({ open: BK.App.state.stores.filter((s) => s.status !== 'opening').length, unl: BK.Managers.unlocked(BK.App.state), att: [...document.querySelectorAll('#pbody .att .it')].some((x) => /Можно нанять управляющего/.test(x.innerText)), dash: !!document.querySelector('#pbody .mgr-dash [data-act="mgrOpen"]') }));
  if (!s0.unl) issues.push(`[${tag}] сохранение: ${s0.open} открытых точек — найм не открылся`);
  if (!s0.att) issues.push(`[${tag}] нет «Можно нанять управляющего» в «Требует внимания»`);
  if (!s0.dash) issues.push(`[${tag}] нет блока «Управляющие» в «Сводке»`);
  await scrollTo('#pbody .mgr-dash'); await shot('01-dash-invite'); await lay('сводка-приглашение');
  // окно и кандидаты
  await p.click('#pbody .mgr-dash [data-act="mgrOpen"]'); await p.waitForTimeout(150);
  if (!(await p.locator('#modal .mgr-modal').count())) issues.push(`[${tag}] окно «Управляющие» не открылось`);
  const cands = await p.evaluate(() => { const S = BK.App.state, M = BK.Managers; return S.managers.cand.map((c) => ({ id: c.id, sc: M.score(c.obs, c.acc, c.freq), sal: M.salary(S, c), hire: M.hireCost(S, c) })); });
  if (cands.length < 2 || cands.length > 3) issues.push(`[${tag}] кандидатов ${cands.length} (нужно 2–3)`);
  const srt = cands.slice().sort((a, b) => a.sc - b.sc);
  for (let i = 1; i < srt.length; i++) if (srt[i].sc - srt[i - 1].sc > 0.08 && srt[i].sal <= srt[i - 1].sal) issues.push(`[${tag}] оклад не растёт с качеством: ${JSON.stringify(srt)}`);
  if ((await p.locator('#modal [data-act="mgrHire"]').count()) !== cands.length) issues.push(`[${tag}] кнопок «Нанять» не столько, сколько кандидатов`);
  await shot('02-modal-cands'); await lay('окно-кандидаты');
  const best = srt[srt.length - 1], cash0 = await p.evaluate(() => BK.App.state.cash);
  await p.click(`#modal [data-act="mgrHire"][data-arg="${best.id}"]`); await p.waitForTimeout(150);
  const h = await p.evaluate(() => ({ n: BK.App.state.managers.list.length, cash: BK.App.state.cash, dis: [...document.querySelectorAll('#modal [data-act="mgrHire"]')].every((x) => x.disabled) }));
  if (h.n !== 1) issues.push(`[${tag}] управляющий не нанят`);
  if (Math.abs(cash0 - h.cash - best.hire) > 1) issues.push(`[${tag}] найм: списано ${cash0 - h.cash}, ожидалось 2 оклада ${best.hire}`);
  await shot('03-modal-hired'); await lay('окно-нанят');
  await p.click('#modal .modal-f [data-act="closeModal"]'); await p.waitForTimeout(100);
  // первый доклад — в течение недели сам (как у игрока), если пусто — «внимательный» доклад
  await runDays(p, 8, true);
  let props = await p.evaluate(() => BK.Managers.open(BK.App.state).length);
  log(`  ${tag}: за неделю после найма предложений ${props}`);
  let list = props ? await p.evaluate(() => BK.Managers.open(BK.App.state).map((x) => ({ id: x.id, kind: x.kind, cost: x.cost, st: x.storeId }))) : await forceReport(p);
  if (!list.length) { issues.push(`[${tag}] управляющий не принёс ни одного предложения`); errors.push(...p.errs.map((e) => `[${tag}] ${e}`)); await p.context().close(); return; }
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'dash' }); });
  const ib = await p.evaluate(() => ({ cards: document.querySelectorAll('#pbody .mgr-inbox .mgr-card').length, yes: document.querySelectorAll('#pbody .mgr-inbox [data-act="mgrYes"]').length, no: document.querySelectorAll('#pbody .mgr-inbox [data-act="mgrNo"]').length, fx: document.querySelectorAll('#pbody .mgr-inbox .fxc').length, before: (() => { const a = document.querySelector('#pbody .mgr-inbox'), b = document.querySelector('#pbody .sec.att'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); })() }));
  if (ib.cards !== list.length) issues.push(`[${tag}] карточек на согласование ${ib.cards}, предложений ${list.length}`);
  if (ib.yes !== ib.cards || ib.no !== ib.cards) issues.push(`[${tag}] у карточек нет кнопок «Сделать / Не делать»`);
  if (!ib.fx) issues.push(`[${tag}] нет значков последствий`);
  if (!ib.before) issues.push(`[${tag}] «На согласование» не над «Требует внимания»`);
  await scrollTo('#pbody .mgr-inbox'); await shot('04-inbox'); await lay('на согласование');
  // «Сделать»
  const first = list[0];
  const c1 = await p.evaluate(() => BK.App.state.cash);
  await p.click(`#pbody .mgr-inbox [data-act="mgrYes"][data-arg="${first.id}"]`); await p.waitForTimeout(150);
  const y = await p.evaluate((id) => { const S = BK.App.state, d = S.managers.done.find((x) => x.id === id); return { st: d ? d.st : null, open: BK.Managers.open(S).some((x) => x.id === id), cash: S.cash, yes: S.managers.list[0].st.yes, card: !!document.querySelector(`#pbody [data-pid="${id}"]`) }; }, first.id);
  if (y.st !== 'yes' || y.open || y.card) issues.push(`[${tag}] «Сделать» не сработало: ${JSON.stringify(y)} (${first.kind})`);
  if (first.cost > 0 && Math.abs(c1 - y.cash - first.cost) > first.cost * 0.05 + 1) issues.push(`[${tag}] «Сделать» (${first.kind}): списано ${c1 - y.cash}, цена ${first.cost}`);
  // «Не делать»
  list = await p.evaluate(() => BK.Managers.open(BK.App.state).map((x) => ({ id: x.id, kind: x.kind })));
  if (!list.length) list = await forceReport(p);
  if (list.length) {
    await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' }));
    await p.click(`#pbody .mgr-inbox [data-act="mgrNo"][data-arg="${list[0].id}"]`); await p.waitForTimeout(120);
    const n = await p.evaluate((id) => { const d = BK.App.state.managers.done.find((x) => x.id === id); return d ? d.st : null; }, list[0].id);
    if (n !== 'no') issues.push(`[${tag}] «Не делать» не сработало (${n})`);
  } else issues.push(`[${tag}] нет второго предложения для «Не делать»`);
  // сгорание: не отвечаем EXPIRE_DAYS + 1 день
  list = await p.evaluate(() => BK.Managers.open(BK.App.state).map((x) => x.id));
  if (!list.length) list = (await forceReport(p)).map((x) => x.id);
  const exp = await p.evaluate(() => BK.CFG.MANAGERS.EXPIRE_DAYS);
  await p.evaluate(() => { const S = BK.App.state; S.managers.list[0].next = S.day + 400; });
  await runDays(p, exp + 1);
  const ex = await p.evaluate((ids) => { const S = BK.App.state; return { st: ids.map((id) => (S.managers.done.find((x) => x.id === id) || {}).st), exp: S.managers.list[0].st.exp }; }, list);
  if (!list.length || ex.st.some((x) => x !== 'exp')) issues.push(`[${tag}] предложения не сгорели по сроку: ${JSON.stringify(ex)}`);
  // карточка точки: предложение по точке
  let sp = null;
  for (let k = 0; k < 4 && !sp; k++) { const l = await forceReport(p); sp = (l.find((x) => x.st) || {}).st || null; if (!sp) await p.evaluate(() => { const S = BK.App.state; for (const q of BK.Managers.open(S)) BK.Managers.reject(S, q.id); }); }
  if (sp) {
    await p.evaluate((id) => BK.App.ACT.openStore({ arg: id }), sp); await p.waitForTimeout(120);
    const cs = await p.evaluate(() => ({ n: document.querySelectorAll('#pbody .mgr-store .mgr-card').length }));
    if (!cs.n) issues.push(`[${tag}] в карточке точки нет предложения управляющего`);
    await scrollTo('#pbody .mgr-store'); await shot('05-store'); await lay('карточка точки');
  } else log(`  ${tag}: предложений по конкретной точке не нашлось — карточку точки не проверили`);
  // оклад 1-го числа
  const sp0 = await p.evaluate(() => BK.App.state.managers.spent);
  await p.evaluate(() => { const S = BK.App.state; for (const q of BK.Managers.open(S)) BK.Managers.reject(S, q.id); });
  const dd = await p.evaluate(() => { const S = BK.App.state; let n = 0; while (BK.Engine.dateOf(S.day + n).d !== 1 || n === 0) n++; return n; });
  await runDays(p, dd + 1);
  const sp1 = await p.evaluate(() => BK.App.state.managers.spent);
  if (!(sp1 > sp0)) issues.push(`[${tag}] оклад 1-го числа не списан`);
  // окно со статистикой и историей
  await p.evaluate(() => { const S = BK.App.state; for (const d of S.managers.done) if (d.st === 'yes') d.ans -= 40; BK.App.state.day++; });
  await runDays(p, 1);
  await p.evaluate(() => BK.App.ACT.mgrOpen()); await p.waitForTimeout(150);
  const md = await p.evaluate(() => ({ stats: document.querySelectorAll('#modal .mgr-stats span').length, hist: document.querySelectorAll('#modal .mgr-hl').length, verdict: [...document.querySelectorAll('#modal .mgr-hl .chip')].some((x) => /полезно|лишнее/.test(x.textContent)) }));
  if (md.stats < 6) issues.push(`[${tag}] в окне нет статистики управляющего`);
  if (!md.hist) issues.push(`[${tag}] в окне нет истории решений`);
  if (!md.verdict) issues.push(`[${tag}] в истории нет итога «полезно / лишнее» через ${30} дн.`);
  await shot('06-modal-stats'); await lay('окно-статистика');
  // увольнение с подтверждением
  await p.click('#modal [data-act="mgrFireAsk"]'); await p.waitForTimeout(80);
  if (!(await p.locator('#modal [data-act="mgrFire"]').count())) issues.push(`[${tag}] нет подтверждения увольнения`);
  await p.click('#modal [data-act="mgrFireNo"]'); await p.waitForTimeout(80);
  await p.click('#modal .modal-f [data-act="closeModal"]'); await p.waitForTimeout(80);
  // сохранение и загрузка
  const back = await p.evaluate(() => { BK.App.save(); const raw = JSON.parse(localStorage.getItem(BK.Slots.key())); return { n: raw.managers && raw.managers.list.length, done: raw.managers && raw.managers.done.length }; });
  if (back.n !== 1 || !back.done) issues.push(`[${tag}] управляющий не сохранился: ${JSON.stringify(back)}`);
  // загрузка сохранения тем же путём, что «Продолжить» (перезагрузка страницы вернула бы исходное сохранение теста)
  await p.evaluate(() => { BK.App.continueGame(JSON.parse(localStorage.getItem(BK.Slots.key()))); }); await p.waitForTimeout(200);
  const re = await p.evaluate(() => { BK.App.setSpeed(0); BK.App.ACT.tab({ arg: 'dash' }); return { n: BK.App.state.managers.list.length, dash: !!document.querySelector('#pbody .mgr-dash .mgr-line') }; });
  if (re.n !== 1 || !re.dash) issues.push(`[${tag}] после перезагрузки нет управляющего: ${JSON.stringify(re)}`);
  await scrollTo('#pbody .mgr-dash'); await shot('07-dash-after-reload'); await lay('сводка-после-загрузки');
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  log('сохранение бота avg (5+ точек)…');
  const sv = botSave(3.6, 15838, 'avg');
  log(`точек: ${sv.stores.length}`);
  const b = await chromium.launch();
  for (const [vp, dark] of [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]]) { log(`${vp}${dark ? ' тёмная' : ''}`); await scenario(b, sv, vp, dark); }
  await b.close();
  const all = issues.concat(errors);
  fs.writeFileSync(path.join(OUT, 'issues.txt'), all.join('\n') + '\n');
  log(`\nИтог: ${issues.length} проблем, ${errors.length} ошибок консоли`);
  for (const x of all.slice(0, 40)) log(' - ' + x);
  process.exit(all.length ? 1 : 0);
})();
