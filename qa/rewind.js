/* QA: «Переиграть» (src/rewind.js, src/ui/rewind-ui.js).
   Сценарии: «Лёгкий» (6 снимков, откат на максимум), «Нормальный» (3 снимка, откат на 1 месяц, перезагрузка страницы —
   снимки из localStorage), «Хардкор» (кнопки нет, пояснение), банкротство → «Переиграть с …» (и из итогов игры),
   без localStorage (приватный режим: снимки в памяти, честное пояснение), второй акт (переезд в другой город, откат назад
   через переезд — активный город и карта возвращаются). Экраны 1440 / 390, светлая и тёмная тема.
   Запуск: node qa/rewind.js [папка=qa/shots/rewind]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/rewind';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);
const KEY1 = 'bk-ufa-save-v1';

function strip(S) {
  const c = Object.assign({}, S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}
function botSave(o) { const { play } = require('../sim/bot'); return strip(play(o).S); }
// состояние за k месяцев до банкротства слабого бота (снимки 1-го числа из прогона)
function preLost(k) {
  const { play } = require('../sim/bot'); const BK = globalThis.BK;
  for (let s = 1; s < 30; s++) {
    const firsts = [];
    const r = play({ level: 'bad', seed: s * 7919, years: 4, onDay: (S) => { if (BK.Engine.dateOf(S.day).d === 2 && !S.ev.pending && !S.chef.pending) firsts.push(JSON.stringify(strip(S))); } });
    if (r.S.lost && firsts.length > k) return JSON.parse(firsts[firsts.length - k]);
  }
  return null;
}
const add = (label, arr) => issues.push(...arr.map((x) => (x.startsWith('[') ? x : `[${label}] ${x}`)));
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = (document.querySelector('#modal .modal') || document.body).innerText;
    return (t.match(/.{0,30}(NaN|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function targets(p, label) {
  return p.evaluate((label) => {
    const out = [];
    for (const el of document.querySelectorAll('#rwBox .btn, #rwBox .rwopt')) {
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      if (r.height < 39.5) out.push(`[${label}] МАЛЕНЬКАЯ ЦЕЛЬ ${Math.round(r.width)}×${Math.round(r.height)} «${el.textContent.trim().slice(0, 30)}»`);
    }
    return out;
  }, label);
}
const check = (label, cond, msg) => { if (!cond) issues.push(`[${label}] ${msg}`); };

/* ---------- продвижение игры: до дня перед 1-м числом — движком, само 1-е число — через игровой цикл ---------- */
async function toEve(p) {
  await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine; BK.App.setSpeed(0);
    let g = 0;
    while (g++ < 40 && !S.lost) {
      if (S.ev.pending) E.resolveEvent(S, 0);
      if (S.chef.pending) E.chefConfirm(S, [], []);
      if (E.dateOf(S.day + 1).d === 1) break;
      E.tick(S); S.notify.length = 0;
    }
    if (BK.App.ui.modal) BK.App.closeModal();
  });
}
async function settle(p) {
  await p.evaluate(() => { const S = BK.App.state; if (S.lost) return; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) BK.Engine.chefConfirm(S, [], []); BK.App.ui.modalQueue.length = 0; if (BK.App.ui.modal) BK.App.closeModal(); });
}
async function months(p, k, opts = {}) {
  for (let i = 0; i < k; i++) {
    await toEve(p);
    if (await p.evaluate(() => BK.App.state.lost)) return;
    await realTicks(p, 1);
    if (await p.evaluate(() => BK.App.state.lost)) { await p.waitForTimeout(150); return; }
    await settle(p);
  }
  if (!opts.stay) await days(p, 3); // чуть дальше 1-го числа: снимок сегодняшнего дня в список «назад» не входит
}
// n дней движком (без 1-го числа)
async function days(p, n) {
  await p.evaluate((n) => { const S = BK.App.state, E = BK.Engine; for (let i = 0; i < n && !S.lost; i++) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); if (E.dateOf(S.day + 1).d === 1) break; E.tick(S); S.notify.length = 0; } }, n);
  await settle(p); await p.waitForTimeout(350); // запись снимков в хранилище — с задержкой после автосохранения
}
const info = (p) => p.evaluate(() => { const S = BK.App.state; return { day: S.day, lost: !!S.lost, phase: S.phase, list: BK.Rewind.list(S).map((x) => x.day), st: BK.Rewind.status(S), rw: S.rewind || null, city: BK.CITY.id, active: S.corp ? S.corp.active : null, speed: BK.App.ui.speed, log0: S.log[0] && S.log[0].text }; });
async function openMenu(p) { await p.evaluate(() => { if (BK.App.ui.modal) BK.App.closeModal(); BK.App.ACT.settings(); }); await p.waitForTimeout(120); }
async function toastText(p) { return p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.innerText.replace(/\s+/g, ' ')).join(' | ')); }

async function openWith(b, vp, theme, save, opts = {}) {
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, noStorage: opts.noStorage });
  if (save) {
    await p.evaluate(([k, raw]) => { localStorage.setItem(k, raw); localStorage.setItem('bk-ufa-slot', '1'); }, [KEY1, JSON.stringify(save)]);
    await p.reload(); await p.waitForTimeout(150);
    await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(150);
    await settle(p);
  }
  return p;
}
function shooter(p, dir, tag, mobile) {
  return async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 150);
    if (o.scroll) await p.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center' }); }, o.scroll);
    await p.screenshot({ path: path.join(dir, n + '.png'), fullPage: !!o.full });
    add(`${tag} ${n}`, await layoutCheck(p, `${tag} ${n}`, { mobile }));
    add(`${tag} ${n}`, await textProblems(p, `${tag} ${n}`));
    if (mobile) add(`${tag} ${n}`, await targets(p, `${tag} ${n}`));
  };
}
async function done(p, tag) { errors.push(...p.errs.map((e) => `[${tag}] ${e}`)); await p.context().close(); }

/* ---------- «Нормальный»: 3 снимка, откат на 1 месяц, перезагрузка ---------- */
async function normal(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme} normal`, dir = path.join(OUT, `${vp}-${theme}`); fs.mkdirSync(dir, { recursive: true });
  const p = await openWith(b, vp, theme, sv.normal);
  const shot = shooter(p, dir, tag, mobile);
  await openMenu(p);
  await shot('10-menu-empty', { scroll: '#rwBox' });
  check(tag, await p.$('#rwBox') && !(await p.$('#rwGo')), 'до первого 1-го числа кнопка отката есть или нет блока');
  await months(p, 4);
  let I = await info(p);
  check(tag, I.list.length === 3, `снимков ${I.list.length}, ожидалось 3 (нормальный)`);
  await openMenu(p);
  const opts = await p.$$eval('#rwBox input[name=rwpick]', (x) => x.length);
  check(tag, opts === 3, `в меню ${opts} вариантов вместо 3`);
  const btn = await p.textContent('#rwGo');
  check(tag, /вернуться на 1 мес\. назад/.test(btn), `кнопка: «${btn}»`);
  await shot('11-menu-list', { scroll: '#rwBox' });
  await p.click('#rwGo');
  await shot('12-menu-confirm', { scroll: '#rwAsk' });
  const ask = await p.textContent('#rwAsk');
  check(tag, /Вернуться к .*отменится/.test(ask), `текст подтверждения: ${ask}`);
  // отмена ничего не меняет
  await p.click('#rwNo'); await p.waitForTimeout(80);
  check(tag, (await info(p)).day === I.day, 'отмена изменила игру');
  await p.click('#rwGo'); await p.click('#rwYes'); await p.waitForTimeout(250);
  const J = await info(p);
  check(tag, J.day === I.list[0], `после отката на 1 мес. день ${J.day}, ожидался ${Math.max(...I.list)}`);
  check(tag, J.rw && J.rw.n === 1, 'нет отметки о переигровке');
  check(tag, /^Переиграли: /.test(J.log0 || ''), `журнал: ${J.log0}`);
  check(tag, J.speed === 0, 'после отката игра не на паузе');
  const tt = await toastText(p);
  check(tag, /Вернулись в [а-я]+ \d{4}/.test(tt), `тост: ${tt}`);
  await shot('13-after-rewind');
  // журнал показывает запись об откате
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'log' })); await p.waitForTimeout(150);
  check(tag, /Переиграли/.test(await p.textContent('#pbody')), 'в журнале нет записи об откате');
  await shot('14-journal');
  if (vp === 'd1440' && theme === 'light') {
    // перезагрузка страницы: снимки из localStorage
    await months(p, 2);
    const K = await info(p);
    await p.reload(); await p.waitForTimeout(150);
    await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(150); await settle(p);
    const L = await info(p);
    check(tag, L.day === K.day, `после перезагрузки день ${L.day} ≠ ${K.day}`);
    check(tag, L.list.length === K.list.length && L.list.length > 0 && L.st.persisted === L.st.total, `после перезагрузки снимков ${L.list.length} (было ${K.list.length}), в хранилище ${L.st.persisted}/${L.st.total}`);
    notes.push(`нормальный: после перезагрузки снимков ${L.list.length}, символов ${L.st.chars}`);
    await openMenu(p);
    await shot('15-after-reload', { scroll: '#rwBox' });
    // откат на максимум после перезагрузки
    await p.click(`#rwBox input[value="${Math.min(...L.list)}"]`);
    check(tag, /3 мес\./.test(await p.textContent('#rwGo')), 'кнопка не обновилась на 3 мес.');
    await p.click('#rwGo'); await p.click('#rwYes'); await p.waitForTimeout(200);
    check(tag, (await info(p)).day === Math.min(...L.list), 'откат на максимум после перезагрузки не сработал');
    // итоги игры честно показывают переигровки
    await p.evaluate(() => BK.App.ACT.summary()); await p.waitForTimeout(150);
    check(tag, /Переигровок в этой игре: 2/.test(await p.textContent('#modal')), 'в итогах нет числа переигровок');
    await shot('16-summary', { scroll: '.sumrw' });
  }
  await done(p, tag);
}

/* ---------- «Лёгкий»: 6 снимков, откат на максимум ---------- */
async function easy(b, sv) {
  const tag = 'd1440-light easy', dir = path.join(OUT, 'd1440-light');
  const p = await openWith(b, 'd1440', 'light', sv.easy);
  const shot = shooter(p, dir, tag, false);
  await months(p, 8);
  const I = await info(p);
  check(tag, I.list.length === 6, `снимков ${I.list.length}, ожидалось 6 (лёгкий)`);
  await openMenu(p);
  await shot('20-easy-menu', { scroll: '#rwBox' });
  const far = Math.min(...I.list);
  await p.click(`#rwBox input[value="${far}"]`);
  check(tag, /на 6 мес\. назад/.test(await p.textContent('#rwGo')), 'кнопка не «на 6 мес. назад»');
  await p.click('#rwGo'); await p.click('#rwYes'); await p.waitForTimeout(200);
  const J = await info(p);
  check(tag, J.day === far, `после отката на 6 мес. день ${J.day} ≠ ${far}`);
  check(tag, J.list.length === 0, `после отката на самый старый снимок в списке ${J.list.length} (раньше него снимков нет)`);
  notes.push(`лёгкий: 6 снимков, ${Math.round(I.st.chars / 1024)} тыс. символов, в хранилище ${I.st.persisted}`);
  // игра идёт дальше и снова делает снимки
  await months(p, 1);
  check(tag, (await info(p)).list.length === 2, 'после отката новый снимок не появился (ожидались: снимок дня отката + новый)');
  await done(p, tag);
}

/* ---------- «Хардкор» ---------- */
async function hard(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme} hard`, dir = path.join(OUT, `${vp}-${theme}`);
  const p = await openWith(b, vp, theme, sv.hard);
  const shot = shooter(p, dir, tag, mobile);
  await months(p, 2);
  const I = await info(p);
  check(tag, I.list.length === 0 && I.st.total === 0, `на хардкоре есть снимки: ${I.st.total}`);
  await openMenu(p);
  check(tag, !(await p.$('#rwGo')), 'на хардкоре есть кнопка «Переиграть»');
  check(tag, /«Хардкор» вернуться назад нельзя/.test(await p.textContent('#rwBox')), 'нет пояснения для хардкора');
  await shot('30-hard-menu', { scroll: '#rwBox' });
  await done(p, tag);
}

/* ---------- банкротство → «Переиграть с …» ---------- */
async function lost(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme} lost`, dir = path.join(OUT, `${vp}-${theme}`);
  const p = await openWith(b, vp, theme, sv.preLost);
  const shot = shooter(p, dir, tag, mobile);
  for (let i = 0; i < 10 && !(await info(p)).lost; i++) await months(p, 1, { stay: true });
  const I = await info(p);
  if (!I.lost) { issues.push(`[${tag}] банкротство не наступило`); await done(p, tag); return; }
  await p.waitForTimeout(200);
  check(tag, !!(await p.$('#modal #rwGo')), 'на экране банкротства нет «Переиграть»');
  const bt = await p.textContent('#modal #rwGo');
  check(tag, /^Переиграть с \d+ [а-я]+ \d{4}$/.test(bt.trim()), `кнопка на экране банкротства: «${bt}»`);
  await shot('40-lost', { scroll: '#rwBox' });
  // из итогов игры — обратно к «Переиграть»
  await p.evaluate(() => BK.App.ACT.summary()); await p.waitForTimeout(150);
  check(tag, !!(await p.$('#modal [data-act="rewindLost"]')), 'в итогах после банкротства нет «Переиграть…»');
  await p.click('#modal [data-act="rewindLost"]'); await p.waitForTimeout(150);
  await p.click('#modal #rwGo');
  await shot('41-lost-confirm', { scroll: '#rwAsk' });
  check(tag, /Банкротство тоже/.test(await p.textContent('#rwAsk')), 'подтверждение не говорит про банкротство');
  await p.click('#rwYes'); await p.waitForTimeout(250);
  const J = await info(p);
  check(tag, !J.lost && J.phase === 'play' && J.day === I.list[0], `после отката: lost ${J.lost}, phase ${J.phase}, день ${J.day}`);
  check(tag, !/Банкротство/.test(await p.evaluate(() => { const m = document.querySelector('#modal .modal .eyebrow'); return m ? m.textContent : ''; })), 'окно банкротства не закрылось');
  check(tag, J.rw && J.rw.list[0].lost, 'отметка не говорит о банкротстве');
  await shot('42-after-lost-rewind');
  await done(p, tag);
}

/* ---------- без localStorage (приватный режим) ---------- */
async function noStorage(b) {
  const tag = 'd1440-light no-storage', dir = path.join(OUT, 'd1440-light');
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('CONSOLE ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.goto(require('./lib').URL); await p.waitForTimeout(150);
  await p.evaluate(() => { BK.App.newGame('Приватная пекарня', 'normal'); const S = BK.App.state, E = BK.Engine; E.chooseProduction(S, S.prodOffers[0].id); E.takeLoan(S, 5e6); E.rentStore(S, S.offers[0].id); if (BK.App.ui.modal) BK.App.closeModal(); BK.App.ui.modalQueue.length = 0; });
  await settle(p);
  await months(p, 3);
  const I = await info(p);
  check(tag, I.list.length === 3 && I.st.persisted === 0 && I.st.storage === false, `без хранилища: снимков ${I.list.length}, persisted ${I.st.persisted}, storage ${I.st.storage}`);
  await openMenu(p);
  check(tag, /Браузер не дал сохранить снимки/.test(await p.textContent('#rwBox')), 'нет честного пояснения про хранилище');
  const shot = shooter(p, dir, tag, false);
  await shot('50-no-storage', { scroll: '#rwBox' });
  await p.click('#rwGo'); await p.click('#rwYes'); await p.waitForTimeout(200);
  check(tag, (await info(p)).day === Math.max(...I.list), 'откат без хранилища не сработал');
  await done(p, tag);
}

/* ---------- переполнение: сохранение игры важнее снимков ---------- */
async function quota(b, sv) {
  const tag = 'd1440-light quota';
  const p = await openWith(b, 'd1440', 'light', sv.normal);
  // хранилище «почти полное»: снимки не влезают, само сохранение — влезает
  await p.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === BK.Rewind.KEY) throw new DOMException('Quota', 'QuotaExceededError'); return real.call(this, k, v); };
  });
  await months(p, 3);
  const I = await info(p);
  check(tag, I.list.length === 3 && I.st.persisted === 0 && I.st.storeOk === false, `переполнение: снимков ${I.list.length}, в хранилище ${I.st.persisted}, storeOk ${I.st.storeOk}`);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('bk-ufa-save-v1')).day);
  check(tag, saved >= I.day - 31, `сохранение игры не записалось (день ${saved}, в игре ${I.day})`);
  await done(p, tag);
}

/* ---------- второй акт ---------- */
async function corp(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme} corp`, dir = path.join(OUT, `${vp}-${theme}`); fs.mkdirSync(dir, { recursive: true });
  const p = await openWith(b, vp, theme, sv.corp);
  const shot = shooter(p, dir, tag, mobile);
  const other = await p.evaluate(() => { const c = BK.App.state.corp; return Object.keys(c.cities).find((id) => id !== c.active && c.cities[id].packed && c.cities[id].packed.stores.length); });
  if (!other) { issues.push(`[${tag}] нет второго города`); await done(p, tag); return; }
  await months(p, 1);
  const before = await info(p);
  // переезд через интерфейс (окно «Зайти в …»)
  await p.evaluate((id) => BK.App.ACT.ruGo({ arg: id }), other); await p.waitForTimeout(120);
  await p.click('#ruGoOk'); await p.waitForTimeout(400); await settle(p);
  let I = await info(p);
  check(tag, I.active === other && I.city === other, `переезд: активный ${I.active}, карта ${I.city}`);
  await months(p, 2);
  I = await info(p);
  check(tag, I.list.length === 3, `снимков ${I.list.length}`);
  notes.push(`второй акт (${vp}): снимки ${I.st.total}, ${Math.round(I.st.chars / 1024)} тыс. символов, в хранилище ${I.st.persisted}; сохранение ${Math.round(await p.evaluate(() => (localStorage.getItem('bk-ufa-save-v1') || '').length) / 1024)} тыс. символов`);
  await openMenu(p);
  check(tag, (await p.textContent('#rwBox')).includes(await p.evaluate((id) => BK.CITY_BY_ID[id].name, other)), 'в снимках не видно активного города');
  await shot('60-corp-menu', { scroll: '#rwBox' });
  // откат до переезда (самый старый снимок — 1-е число до переезда)
  await p.click(`#rwBox input[value="${Math.min(...I.list)}"]`);
  await p.click('#rwGo'); await p.click('#rwYes'); await p.waitForTimeout(400);
  const J = await info(p);
  check(tag, J.day === Math.min(...I.list) && J.active === before.active && J.city === before.active, `после отката: день ${J.day}, активный ${J.active}, карта ${J.city} (ожидался ${before.active})`);
  await shot('61-corp-after');
  await p.evaluate(() => BK.App.ACT.russia()); await p.waitForTimeout(500);
  await shot('62-corp-russia', { wait: 300 });
  await p.evaluate(() => BK.App.ACT.russia()); await p.waitForTimeout(300);
  // игра после отката идёт дальше без ошибок
  await months(p, 1);
  await done(p, tag);
}

(async () => {
  const t0 = Date.now();
  log('генерирую сохранения ботом…');
  require('../sim/load');
  const sv = {
    normal: botSave({ level: 'good', seed: 7919, years: 1.5 }),
    easy: botSave({ level: 'good', seed: 7919, years: 1.5, difficulty: 'easy' }),
    hard: botSave({ level: 'good', seed: 7919, years: 1.5, difficulty: 'hard' }),
    preLost: preLost(4),
    corp: botSave({ level: 'good', seed: 7919, years: 11.5, corp: true, corpOpt: { level: 'good' } }),
  };
  if (!sv.preLost) issues.push('не нашлось банкротства у слабого бота');
  log(`  corp: ${sv.corp.corp ? Object.keys(sv.corp.corp.cities).join(', ') : 'нет'}, сохранение ${Math.round(JSON.stringify(sv.corp).length / 1024)} КБ`);
  const b = await chromium.launch();
  for (const vp of ['d1440', 'm390']) for (const th of ['light', 'dark']) {
    log('нормальный', vp, th); await normal(b, vp, th, sv);
    log('хардкор', vp, th); await hard(b, vp, th, sv);
    if (sv.preLost) { log('банкротство', vp, th); await lost(b, vp, th, sv); }
  }
  log('лёгкий'); await easy(b, sv);
  log('без localStorage'); await noStorage(b);
  log('переполнение'); await quota(b, sv);
  log('второй акт 1440'); await corp(b, 'd1440', 'light', sv);
  log('второй акт 390 тёмная'); await corp(b, 'm390', 'dark', sv);
  await b.close();
  const uniq = [...new Set(issues)], errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\n${uniq.length} проблем, ${errs.length} ошибок консоли; готово за ${Math.round((Date.now() - t0) / 1000)} с, скриншоты: ${OUT}`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
