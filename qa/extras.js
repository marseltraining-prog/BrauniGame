/* QA: слоты сохранений, миграция старого сохранения в слот 1 (достижения начисляются тихо), экран достижений,
   тост о достижении, итоговый экран после победы и банкротства, «Меню игры». Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/extras.js [папка=qa/shots/extras]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/extras';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);
const KEY1 = 'bk-ufa-save-v1', KEY = (n) => (n === 1 ? KEY1 : KEY1 + '-slot' + n);

function botSave(years, seed, level) {
  const { play } = require('../sim/bot');
  const r = play({ level: level || 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}
// сохранение «до достижений»: без S.achievements / achx / chron и полей прибыли точек
function preAch(st) {
  const c = JSON.parse(JSON.stringify(st));
  delete c.achievements; delete c.achx; delete c.chron;
  for (const s of c.stores) { delete s.pAll; delete s.pN; delete s.p12; delete s.lossRun; delete s.lossMax; }
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = (document.querySelector('#modal .modal') || document.querySelector('#start:not([hidden])') || document.body).innerText;
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function modalReach(p, label) {
  return p.evaluate((label) => {
    const m = document.querySelector('#modal .modal'); if (!m) return [`[${label}] модалка не открылась`];
    m.scrollTop = m.scrollHeight;
    const btns = [...m.querySelectorAll('.modal-f button')]; const last = btns[btns.length - 1];
    const out = [];
    if (!last) out.push(`[${label}] в модалке нет кнопок`);
    else { const r = last.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.top < 0) out.push(`[${label}] кнопка «${last.textContent.trim()}» вне экрана`); }
    const mr = m.getBoundingClientRect(); if (mr.right > innerWidth + 1 || mr.left < -1) out.push(`[${label}] модалка шире экрана`);
    m.scrollTop = 0;
    return out;
  }, label);
}
// цели пальцем ≥ 40 px для новых элементов (слоты, фильтр достижений, кнопки меню и окон)
async function targets(p, label) {
  return p.evaluate((label) => {
    const out = [];
    for (const el of document.querySelectorAll('.slot-b .btn, .achseg button, .setx .btn, #modal .modal-f .btn, #startForm .btn')) {
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      if (r.height < 39.5) out.push(`[${label}] МАЛЕНЬКАЯ ЦЕЛЬ ${Math.round(r.width)}×${Math.round(r.height)} «${el.textContent.trim().slice(0, 30)}»`);
    }
    return out;
  }, label);
}
async function loadInSlot(p, n, st) {
  await p.evaluate(([k, raw]) => { localStorage.setItem(k, raw); }, [KEY(n), JSON.stringify(st)]);
}

/* ---------- 1. экраны ---------- */
async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5 });
  const shot = async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 150);
    await p.screenshot({ path: path.join(dir, n + '.png'), fullPage: !!o.full });
    issues.push(...await layoutCheck(p, `${tag} ${n}`, { mobile }));
    issues.push(...await textProblems(p, `${tag} ${n}`));
    if (mobile) issues.push(...await targets(p, `${tag} ${n}`));
    if (o.modal) issues.push(...await modalReach(p, `${tag} ${n}`));
  };
  // стартовый экран с тремя играми
  await loadInSlot(p, 1, sv.won); await loadInSlot(p, 2, Object.assign({}, sv.y1, { company: 'Хлебный дом', difficulty: 'hard' })); await loadInSlot(p, 3, Object.assign({}, sv.lost, { company: 'Булочная на Ленина' }));
  await p.reload(); await p.waitForTimeout(200);
  await shot('00-start-slots');
  await p.evaluate(() => { const el = document.getElementById('slots'); document.getElementById('start').scrollTop = el.offsetTop - 60; });
  await shot('00b-start-slots-list');
  await p.click('.slot:nth-of-type(2) [data-sa="askDel"]'); await shot('01-start-confirm-del');
  await p.click('#slots [data-sa="cancel"]');
  // игра: достижения, тост, меню, итоги победы
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(200);
  await p.evaluate(() => { BK.App.setSpeed(0); const S = BK.App.state; S.notify.push({ type: 'ach', id: 'stores10' }, { type: 'ach', id: 'win' }); });
  await realTicks(p, 1); await p.waitForTimeout(300);
  await shot('10-toast-ach');
  await p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; BK.App.ACT.settings(); }); await shot('11-m-settings', { modal: true });
  await p.evaluate(() => BK.App.ACT.achievements()); await shot('12-m-achievements', { modal: true });
  await p.evaluate(() => { const m = document.querySelector('#modal .modal'); m.scrollTop = m.scrollHeight / 2; }); await shot('12b-m-achievements-mid');
  await p.click('#modal [data-achf="off"]'); await shot('13-m-achievements-ahead', { modal: true });
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.evaluate(() => { const S = BK.App.state; S.ev.pending = null; S.chef.pending = null; S.ev.next = S.day + 60; BK.App.ui.modal = null; document.getElementById('modal').innerHTML = ''; S.notify.push({ type: 'won' }); }); await realTicks(p, 1); await p.waitForTimeout(150);
  await shot('20-m-win', { modal: true });
  if (!(await p.locator('#modal [data-act="summary"]').count())) issues.push(`[${tag}] окно победы: нет кнопки «Итоги игры»`);
  await p.click('#modal [data-act="summary"]'); await shot('21-m-summary-win', { modal: true });
  for (const [i, sel] of [['a', '.sumcharts'], ['b', '.sumcols'], ['c', '.timeline']].entries()) {
    const has = await p.evaluate((sel) => { const el = document.querySelector('#modal ' + sel); if (!el) return false; const m = document.querySelector('#modal .modal'); m.scrollTop = el.offsetTop - 60; return true; }, sel[1]);
    if (!has) issues.push(`[${tag}] итоги победы: нет блока ${sel[1]}`); else await shot(`21${sel[0]}-m-summary-win`);
  }
  const sw = await p.evaluate(() => ({ good: document.querySelectorAll('#modal .sumlist.ok li').length, bad: document.querySelectorAll('#modal .sumlist.bad li').length, charts: document.querySelectorAll('#modal .schart').length, dec: document.querySelectorAll('#modal .timeline li').length, best: !!document.querySelector('#modal .sumstore.best'), cont: !!document.querySelector('#modal .modal-f [data-act="closeModal"]'), nw: !!document.querySelector('#sumNew') }));
  if (sw.good < 3 || sw.bad < 3 || sw.good > 5 || sw.bad > 5) issues.push(`[${tag}] итоги: пунктов «верно/лучше» ${sw.good}/${sw.bad} (нужно 3–5)`);
  if (sw.charts < 4) issues.push(`[${tag}] итоги: графиков ${sw.charts}`);
  if (!sw.best) issues.push(`[${tag}] итоги: нет лучшей точки`);
  if (!sw.cont || !sw.nw) issues.push(`[${tag}] итоги победы: нет «Продолжить игру»/«Новая игра»`);
  if (vp === 'd1440' && theme === 'light') notes.push(`итоги победы: верно ${sw.good}, лучше ${sw.bad}, графиков ${sw.charts}, решений ${sw.dec}`);
  await p.click('#modal [data-act="closeModal"]'); await p.waitForTimeout(100);
  if (await p.evaluate(() => !!BK.App.ui.modal)) issues.push(`[${tag}] «Продолжить игру» не закрыла итоги`);
  // банкротство → итоги → «Новая игра» → стартовый экран
  await p.evaluate(() => { BK.App.ACT.continue({ arg: '3' }); });
  await p.waitForTimeout(250);
  await shot('30-m-lost', { modal: true });
  await p.click('#modal [data-act="summary"]'); await shot('31-m-summary-lost', { modal: true });
  const sl = await p.evaluate(() => ({ cont: !!document.querySelector('#modal .modal-f [data-act="closeModal"]'), nw: !!document.querySelector('#sumNew') }));
  if (sl.cont || !sl.nw) issues.push(`[${tag}] итоги банкротства: кнопки неверные (продолжить: ${sl.cont}, новая: ${sl.nw})`);
  await p.click('#sumNew'); await p.waitForTimeout(200);
  if (!(await p.locator('#start:not([hidden]) #slots').count())) issues.push(`[${tag}] «Новая игра» из итогов не открыла стартовый экран`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- 2. слоты и миграция ---------- */
async function slots(b, sv) {
  const tag = 'слоты';
  // старое сохранение (ключ v1, без достижений) → слот 1; достижения начисляются тихо
  const old = preAch(sv.big);
  const p = await openPage(b, 'd1440', { save: JSON.stringify(old), seed: 3 });
  const s1 = await p.evaluate(() => [...document.querySelectorAll('#slots .slot')].map((x) => x.querySelector('b').textContent));
  if (s1[0] !== old.company) issues.push(`[${tag}] старое сохранение не стало слотом 1: ${JSON.stringify(s1)}`);
  if (s1.filter((x) => x === 'Свободный слот').length !== 2) issues.push(`[${tag}] ожидались 2 свободных слота: ${JSON.stringify(s1)}`);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(200);
  await realTicks(p, 2); await p.waitForTimeout(200);
  const m = await p.evaluate(() => { const S = BK.App.state; const days = Object.values(S.achievements); return { n: days.length, same: days.filter((d) => d === days[0]).length, toasts: document.querySelectorAll('#toasts .achtoast').length, chron: Array.isArray(S.chron), x: !!S.achx }; });
  notes.push(`${tag}: старое сохранение (13 лет) → тихо начислено ${m.n} достижений, тостов о достижениях после загрузки: ${m.toasts}`);
  if (m.n < 20) issues.push(`[${tag}] старое сохранение: начислено мало достижений (${m.n})`);
  if (m.toasts > 2) issues.push(`[${tag}] старое сохранение: лавина тостов (${m.toasts})`);
  if (!m.chron || !m.x) issues.push(`[${tag}] старое сохранение: не инициализированы S.chron / S.achx`);
  // автосохранение идёт в активный слот (1), остальные пустые
  await p.evaluate(() => BK.App.save());
  const k = await p.evaluate(() => [localStorage.getItem('bk-ufa-save-v1') ? JSON.parse(localStorage.getItem('bk-ufa-save-v1')).achievements != null : null, localStorage.getItem('bk-ufa-save-v1-slot2'), localStorage.getItem('bk-ufa-slot')]);
  if (!k[0] || k[1] != null) issues.push(`[${tag}] сохранение ушло не в тот слот: ${JSON.stringify(k.map((x) => (typeof x === 'string' ? x.slice(0, 10) : x)))}`);
  // к списку игр → новая игра формой идёт в первый свободный слот (2)
  await p.evaluate(() => BK.App.toStart()); await p.waitForTimeout(150);
  // Слоты проверяем на известном обычном старте: визуальные Math.random до формы
  // иначе меняют зерно, а первый попавшийся цех может съесть деньги на первую точку.
  await p.evaluate(() => { const create = BK.Engine.newGame; BK.Engine.newGame = opts => create({ ...opts, seed: 7919 }); BK.Scenario.pick = () => null; });
  await p.check('[name=startCity][value=ufa]'); await p.check('[name=startmode][value=net]');
  await p.fill('#companyName', 'Вторая сеть'); await p.click('#startForm button[type=submit]'); await p.waitForTimeout(150);
  const prodId = await p.evaluate(() => { const S = BK.App.state; return S.prodOffers.slice().sort((a, b) => BK.Engine.prodOpenCost(S, a).total - BK.Engine.prodOpenCost(S, b).total)[0].id; });
  await p.click('[data-act="rentProd"][data-arg="' + prodId + '"]:not([disabled])'); await p.click('[data-act="rent"]:not([disabled])'); await p.evaluate(() => BK.App.ACT.closeModal());
  await realTicks(p, 3);
  const slot2 = await p.evaluate(() => { BK.App.save(); return [BK.Slots.active, JSON.parse(localStorage.getItem('bk-ufa-save-v1-slot2')).company, JSON.parse(localStorage.getItem('bk-ufa-save-v1')).company]; });
  if (slot2[0] !== 2 || slot2[1] !== 'Вторая сеть' || slot2[2] !== old.company) issues.push(`[${tag}] новая игра не в слоте 2: ${JSON.stringify(slot2)}`);
  const ach0 = await p.evaluate(() => Object.keys(BK.App.state.achievements));
  if (!ach0.includes('prod1') || !ach0.includes('store1')) issues.push(`[${tag}] новая игра: нет первых достижений (${ach0.join(',')})`);
  // перезагрузка: «Продолжить» слота 2 открывает вторую сеть
  await p.reload(); await p.waitForTimeout(200);
  await p.click('[data-act="continue"][data-arg="2"]'); await p.waitForTimeout(200);
  if ((await p.evaluate(() => BK.App.state.company)) !== 'Вторая сеть') issues.push(`[${tag}] «Продолжить» слота 2 открыл не ту игру`);
  // третий слот, затем все заняты → форма не затирает игры
  await p.evaluate(() => BK.App.toStart()); await p.waitForTimeout(100);
  await p.fill('#companyName', 'Третья'); await p.click('#startForm button[type=submit]'); await p.waitForTimeout(100);
  await p.evaluate(() => BK.App.toStart()); await p.waitForTimeout(100);
  await p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
  await p.fill('#companyName', 'Четвёртая'); await p.click('#startForm button[type=submit]'); await p.waitForTimeout(150);
  const full = await p.evaluate(() => ({ start: !document.getElementById('start').hidden, toast: document.getElementById('toasts').innerText, names: [1, 2, 3].map((n) => { const r = localStorage.getItem(BK.Slots.keyOf(n)); return r && JSON.parse(r).company; }) }));
  if (!full.start || !/слоты заняты/.test(full.toast)) issues.push(`[${tag}] все слоты заняты: форма не предупредила (${full.toast.slice(0, 60)})`);
  if (full.names.join('|') !== [old.company, 'Вторая сеть', 'Третья'].join('|')) issues.push(`[${tag}] слоты после попытки 4-й игры: ${full.names.join(' | ')}`);
  // «Новая игра в этот слот» у занятого — с подтверждением
  await p.click('.slot:nth-of-type(3) [data-sa="askNew"]'); await p.waitForTimeout(80);
  if (!(await p.locator('#slots .confirm').count())) issues.push(`[${tag}] замена игры без подтверждения`);
  await p.click('#slots [data-sa="new"][data-sure]'); await p.waitForTimeout(150);
  const rep = await p.evaluate(() => [BK.App.state && BK.App.state.company, BK.Slots.active]);
  if (rep[0] !== 'Четвёртая' || rep[1] !== 3) issues.push(`[${tag}] замена в слоте 3 не сработала: ${JSON.stringify(rep)}`);
  // удаление с подтверждением
  await p.evaluate(() => BK.App.toStart()); await p.waitForTimeout(100);
  await p.click('.slot:nth-of-type(2) [data-sa="askDel"]'); await p.click('#slots [data-sa="del"]'); await p.waitForTimeout(100);
  const del = await p.evaluate(() => [localStorage.getItem('bk-ufa-save-v1-slot2'), [...document.querySelectorAll('#slots .slot b')].map((x) => x.textContent)]);
  if (del[0] != null || del[1][1] !== 'Свободный слот') issues.push(`[${tag}] удаление слота 2 не сработало: ${JSON.stringify(del[1])}`);
  notes.push(`${tag}: слоты после сценария — ${del[1].join(' | ')}`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();

  // хранилище недоступно: игра идёт без сохранений и без ошибок
  const q = await b.newContext({ viewport: { width: 390, height: 844 } });
  const qp = await q.newPage(); const qerr = [];
  qp.on('pageerror', (e) => qerr.push('PAGEERR ' + e.message)); qp.on('console', (mm) => { if (mm.type() === 'error' && !/Failed to load resource/.test(mm.text())) qerr.push('CONSOLE ' + mm.text()); });
  await qp.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await qp.addInitScript(() => { const no = () => { throw new Error('SecurityError'); }; Object.defineProperty(window, 'localStorage', { get: no, configurable: true }); });
  await qp.addInitScript(() => { let x = 5; Math.random = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }); // зерно: иначе изредка нет помещения по карману
  await qp.goto(require('./lib').URL); await qp.waitForTimeout(200);
  const hint = await qp.evaluate(() => (document.querySelector('#slots') || {}).innerText || '');
  if (await qp.locator('#start [data-tutopt="0"]').count()) await qp.click('#start [data-tutopt="0"]'); // без хранилища обучение по умолчанию включено; здесь проверяем сохранения
  await qp.evaluate(() => { BK.Scenario.pick = () => null; });
  await qp.click('#startForm button[type=submit]'); await qp.waitForTimeout(100);
  await qp.click('[data-act="rentProd"]:not([disabled])'); await qp.click('[data-act="rent"]:not([disabled])');
  await qp.waitForTimeout(300); await qp.evaluate(() => { for (let i = 0; i < 5 && document.querySelector('.modal'); i++) BK.App.ACT.closeModal(); }); // окно «Время пошло» появляется после аренды
  await qp.evaluate(() => { BK.App.setSpeed(10); }); await qp.waitForTimeout(1500);
  const ok = await qp.evaluate(() => BK.App.state.day > 3 && Object.keys(BK.App.state.achievements).length >= 2);
  if (!/не сохранится/.test(hint) || !ok) issues.push(`[${tag}] без хранилища: подсказка «${hint.slice(0, 40)}», игра идёт: ${ok}`);
  notes.push(`${tag}: без localStorage — подсказка на старте, игра идёт: ${ok}`);
  errors.push(...qerr.map((e) => `[${tag} без хранилища] ${e}`));
  await q.close();
}

(async () => {
  const t0 = Date.now();
  log('генерирую сохранения ботом…');
  const won = botSave(16, 7919);
  const sv = { won, y1: botSave(1, 7919), big: botSave(13, 7919), lost: null };
  for (let s = 1; s < 30 && !sv.lost; s++) { const r = botSave(3, s * 7919, 'bad'); if (r.lost) sv.lost = r; }
  if (!sv.lost) sv.lost = Object.assign({}, sv.y1, { lost: true });
  log(`  won: ${won.stores.length} точек, достижений ${Object.keys(won.achievements).length}; lost: день ${sv.lost.day}`);
  const b = await chromium.launch();
  log('слоты и миграция'); await slots(b, sv);
  for (const vp of ['d1440', 'm390', 'm360']) for (const th of ['light', 'dark']) { log('экраны', vp, th); await screens(b, vp, th, sv); }
  await b.close();
  const uniq = [...new Set(issues)], errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\nготово за ${Math.round((Date.now() - t0) / 1000)} с, скриншоты: ${OUT}`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
