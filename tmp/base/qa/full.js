/* Полный QA в браузере: вкладки и модалки на 4 экранах в светлой/тёмной теме, сохранение/загрузка (в т.ч. старые
   сохранения), карта (клик, зум, перетаскивание, тач и pinch), тосты на телефоне, производительность на 40–60 точках,
   ошибки консоли. Большие сохранения генерирует сильный бот из sim/ прямо в Node (детерминированно).
   Запуск: node qa/full.js [папка=qa/shots/full] [экраны=d1440,d1280,m390,m360] [темы=light,dark] [--no-perf]
   Итог: список проблем в <папка>/issues.txt, код выхода 1 — если есть ошибки/проблемы вёрстки. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const OUT = args[0] || 'qa/shots/full';
const VPS = (args[1] || 'd1440,d1280,m390,m360').split(',');
const THEMES = (args[2] || 'light,dark').split(',');
fs.mkdirSync(OUT, { recursive: true });

const issues = [];   // проблемы (вёрстка, логика) — валят прогон
const notes = [];    // замеры и справка
const errors = [];   // pageerror / console.error
const log = (...a) => console.log(...a);
const QA_SEED = 7919;

/* ---------- сохранения от бота ---------- */
function botSave(years, seed, extra) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  if (extra) extra(c);
  return c;
}
// Сохранение первой опубликованной версии (коммит 0fe7e89): её движок и бот достаются из git во временную папку.
const OLD_COMMIT = '0fe7e89';
function oldVersionSave(years, seed) {
  const os = require('os'), { execSync, execFileSync } = require('child_process');
  const dir = path.join(os.tmpdir(), 'bk-old-' + OLD_COMMIT);
  try {
    if (!fs.existsSync(path.join(dir, 'sim', 'bot.js'))) { fs.mkdirSync(dir, { recursive: true }); execSync(`git archive ${OLD_COMMIT} src sim | tar -x -C "${dir}"`, { cwd: path.join(__dirname, '..') }); }
    const code = `const {play}=require('./sim/bot');const r=play({level:'good',seed:${seed},years:${years}});const c=Object.assign({},r.S);delete c.cache;delete c._botRng;c.notify=[];c.stores=c.stores.map(s=>{const x=Object.assign({},s);delete x._bot;return x});process.stdout.write(JSON.stringify(c));`;
    return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: dir, maxBuffer: 64 << 20 }).toString());
  } catch (e) { console.log('  нет git-версии ' + OLD_COMMIT + ', старое сохранение имитируется:', e.message.split('\n')[0]); return null; }
}
// «старое» сохранение: без полей, которых не было в первой опубликованной версии (office.*, flags, свежие поля статистики)
function oldify(st) {
  const c = JSON.parse(JSON.stringify(st));
  delete c.flags; c.office = { hr: c.office.hr, academy: c.office.academy };
  for (const s of c.stores) { delete s.warned; for (const e of s.staff) { delete e.warned; delete e.sadDays; } }
  return c;
}
// 60 точек: к сети из 45 точек добавить копии со сдвигом
function grow(st, n) {
  const src = st.stores.filter((s) => s.status === 'open');
  let num = Math.max(...st.stores.map((s) => s.num));
  for (let i = 0; st.stores.length < n; i++) {
    const b = JSON.parse(JSON.stringify(src[i % src.length]));
    b.id = 'qa' + i; b.num = ++num; b.x = Math.min(960, Math.max(40, b.x + ((i * 37) % 60) - 30)); b.y = Math.min(960, Math.max(40, b.y + ((i * 53) % 60) - 30));
    b.staff.forEach((e, k) => { e.id = `qa${i}e${k}`; });
    st.stores.push(b);
  }
  return st;
}

/* ---------- помощники страницы ---------- */
const MOBILE = (vp) => vp[0] === 'm';
const VPW = Object.fromEntries(Object.entries(require('./lib').VIEWPORTS).map(([k, v]) => [k, v.width]));
async function loadState(p, st) {
  await p.evaluate((raw) => { localStorage.setItem('bk-ufa-save-v1', raw); BK.App.ACT.continue(); BK.App.setSpeed(0); window.scrollTo(0, 0); }, JSON.stringify(st));
  await p.waitForTimeout(150);
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = (document.querySelector('#modal .modal') || document.body).innerText;
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
// кнопки футера модалки достижимы: доскроллить окно вниз и проверить, что последняя кнопка целиком в окне
async function modalReach(p, label) {
  return p.evaluate((label) => {
    const m = document.querySelector('#modal .modal'); if (!m) return [`[${label}] модалка не открылась`];
    m.scrollTop = m.scrollHeight;
    const btns = [...m.querySelectorAll('.modal-f button')]; const last = btns[btns.length - 1];
    const out = [];
    if (!last) out.push(`[${label}] в модалке нет кнопок`);
    else { const r = last.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.top < 0) out.push(`[${label}] кнопка «${last.textContent.trim()}» вне экрана (${Math.round(r.top)}…${Math.round(r.bottom)} при высоте ${innerHeight})`); }
    const mr = m.getBoundingClientRect(); if (mr.right > innerWidth + 1 || mr.left < -1) out.push(`[${label}] модалка шире экрана`);
    m.scrollTop = 0;
    return out;
  }, label);
}

// Каждый сценарий получает новый BrowserContext, но очищаем хранилище явно: так тест не зависит
// от сохранения, предпочтения пролога и списка уже пройденных историй даже при смене реализации context.
async function isolateStart(p) {
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('bk-ufa-tutorial', '0');
  });
  await p.reload();
  await p.waitForSelector('#startForm button[type=submit]');
}

// Общий QA проверяет базовую игру в Уфе. Сюжетные старты имеют собственную матрицу ниже:
// rescue законно начинает с готовой сетью в phase=play, остальные — с выбора цеха.
async function startBaseGame(p) {
  await p.evaluate(() => {
    const mode = document.querySelector('#start input[name=startmode][value=net]');
    if (mode) { mode.checked = true; mode.dispatchEvent(new Event('change', { bubbles: true })); }
    if (BK.Scenario && !BK.Scenario.__qaBaseSet) {
      const set = BK.Scenario.set;
      BK.Scenario.pick = () => 'ufa';
      BK.Scenario.set = (S, id, o) => set(S, id === 'random' ? 'ufa' : id, o);
      BK.Scenario.__qaBaseSet = true;
    }
  });
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => BK.App.state && !document.querySelector('#start:not([hidden])'));
  return p.evaluate(() => ({ phase: BK.App.state.phase, scenario: BK.App.state.story && BK.App.state.story.scenario }));
}

/* ---------- 1. все экраны × темы ---------- */
async function screens(b, vp, theme, saves) {
  const mobile = MOBILE(vp), tag = `${vp}-${theme}`;
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 7 });
  await isolateStart(p);
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const shot = async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 140);
    if (o.full) { // липкий HUD на длинном скриншоте дублируется посередине — снимаем его с «липкости» на время снимка
      await p.screenshot({ path: path.join(dir, n + '-view.png') });
      await p.addStyleTag({ content: '.hud{position:relative!important}' }).then((h) => p.evaluate(() => { window.__qaStyle = document.head.lastElementChild; }));
      await p.screenshot({ path: path.join(dir, n + '.png'), fullPage: true });
      await p.evaluate(() => window.__qaStyle && window.__qaStyle.remove());
    } else await p.screenshot({ path: path.join(dir, n + '.png') });
    issues.push(...await layoutCheck(p, `${tag} ${n}`, { mobile }));
    // на мобильном (isMobile) окно раздувается под широкий контент и innerWidth растёт — сверяем с заданной шириной экрана
    const wide = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) > w + 1 ? `${document.documentElement.scrollWidth}/${innerWidth}` : '', VPW[vp]);
    if (wide) issues.push(`[${tag} ${n}] страница шире экрана ${VPW[vp]}px: ${wide}`);
    issues.push(...await textProblems(p, `${tag} ${n}`));
  };
  const modal = async (n) => { await shot(n); issues.push(...await modalReach(p, `${tag} ${n}`)); };

  // тема реально применилась
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if ((theme === 'dark') !== /rgb\((1\d|[0-9]),/.test(bg)) issues.push(`[${tag}] тема не применилась: фон ${bg}`);

  await shot('00-start');
  const start = await startBaseGame(p);
  if (start.phase !== 'setup_prod' || start.scenario !== 'ufa') issues.push(`[${tag}] базовый старт: ${JSON.stringify(start)}`);
  await shot('01-setup-prod', { full: mobile });
  await p.click('[data-act="rentProd"]:not([disabled])'); await shot('02-setup-store', { full: mobile });
  await p.click('[data-act="rent"]:not([disabled])'); await modal('03-m-tutorial');
  await p.click('#modal [data-act="closeModal"]');
  await realTicks(p, 3);

  // поздняя игра: 41 точка
  await loadState(p, saves.big);
  await shot('10-dash', { full: mobile });
  for (const t of ['stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) {
    await p.evaluate((t) => { BK.App.ACT.tab({ arg: t }); window.scrollTo(0, 0); }, t);
    await shot('11-tab-' + t, { full: mobile });
  }
  await p.evaluate(() => { const S = BK.App.state; const st = S.stores.find((s) => s.staff.length > 3) || S.stores[0]; BK.App.ACT.openStore({ arg: st.id }); window.scrollTo(0, 0); });
  await shot('12-store', { full: mobile });
  // подтверждения внутри карточки
  await p.evaluate(() => { const S = BK.App.state; BK.App.ACT.askClose({ arg: BK.App.ui.storeId }); });
  await shot('13-store-confirm-close', { full: mobile });
  await p.evaluate(() => BK.App.ACT.cancelClose());
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'team' }); BK.App.ACT.pickCand({ arg: BK.App.state.stores[2].id }); });
  await shot('14-team-hire', { full: mobile });

  // модалки
  await p.evaluate(() => {
    const S = BK.App.state; const e = BK.EVENTS.filter((x) => x.choices && x.choices.length > 2).sort((a, b) => b.text.length - a.text.length)[0];
    const st = S.stores[0];
    S.ev.pending = { id: e.id, kind: e.kind, title: e.title, text: e.text.replace(/\{store\}/g, st.address).replace(/\{district\}/g, 'Центр').replace(/\{prod\}/g, 'цех'), tg: { scope: 'store', target: st.id }, day: S.day, effectsText: ['Трафик −20% на 30 дн.'], choices: e.choices.map((c, i) => ({ label: c.label, desc: c.desc, cost: i === 1 ? S.cash + S.reserve + 1e9 : 250000 * i })) };
  });
  await p.waitForTimeout(150); await modal('20-m-event-choice');
  const dis = await p.locator('#modal [data-choice]:disabled').count();
  if (!dis) issues.push(`[${tag}] событие: недоступный по деньгам вариант не выключен`);
  await p.locator('#modal [data-choice]:not([disabled])').first().click(); await p.waitForTimeout(100);
  if (await p.evaluate(() => !!BK.App.state.ev.pending)) issues.push(`[${tag}] событие: выбор не закрыл окно`);

  await p.evaluate(() => { const S = BK.App.state; const e = BK.EVENTS.find((x) => x.crisis); S.ev.pending = { id: e.id, kind: 'neg', crisis: true, title: e.title, text: e.text, tg: { scope: 'global', target: null }, day: S.day, effectsText: ['Трафик −15% на 180 дн.', 'Ключевая ставка +4 п.п.', 'Зарплаты рынка +8%'] }; });
  await p.waitForTimeout(150); await modal('21-m-crisis');
  await p.click('#modal [data-choice]'); await p.waitForTimeout(100);

  await p.evaluate(() => BK.Engine.proposeChef(BK.App.state)); await p.waitForTimeout(150);
  await modal('22-m-chef');
  const picks = p.locator('#modal label.chefitem:has([data-pick]:not([disabled]))');
  for (let i = 0; i < Math.min(2, await picks.count()); i++) { await picks.nth(i).click(); await p.waitForTimeout(60); }
  await p.locator('#modal label.chefitem:has([data-drop])').first().click(); await p.waitForTimeout(60);
  await modal('23-m-chef-picked');
  if (await p.locator('#chefOk').isDisabled()) issues.push(`[${tag}] шеф: «Утвердить» выключена после выбора 2+1`);
  else { await p.click('#chefOk'); await p.waitForTimeout(100); if (await p.evaluate(() => !!BK.App.state.chef.pending)) issues.push(`[${tag}] шеф: решение не принято`); }

  await p.evaluate(() => { const S = BK.App.state; const y = BK.Engine.dateOf(S.day).y - 1; S.notify.push({ type: 'year', y, rev: S.history.filter((h) => h.y === y).reduce((a, h) => a + h.rev, 0) }); });
  await realTicks(p, 1); await p.waitForTimeout(150);
  await modal('24-m-year');
  await p.evaluate(() => BK.App.ACT.closeModal());

  await p.evaluate(() => BK.App.ACT.help()); await modal('25-m-help');
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.evaluate(() => BK.App.ACT.settings()); await modal('26-m-settings');
  await p.click('#newGameBtn'); await modal('27-m-settings-newconfirm');
  await p.evaluate(() => BK.App.ACT.closeModal());

  // победа (сохранение после победы → уведомление)
  await loadState(p, saves.won);
  await p.evaluate(() => { BK.App.state.notify.push({ type: 'won' }); });
  await realTicks(p, 1); await p.waitForTimeout(150);
  await modal('28-m-win');
  await p.evaluate(() => BK.App.ACT.closeModal());
  // банкротство: сохранение с lost=true сразу показывает итог
  await loadState(p, Object.assign({}, saves.y1, { lost: true }));
  await p.waitForTimeout(200);
  await modal('29-m-lost');
  if (!(await p.locator('#modal #newAfter').count())) issues.push(`[${tag}] банкротство: нет кнопки «Начать заново»`);
  await p.click('#modal #newAfter'); await p.waitForTimeout(150);
  if (!(await p.locator('#start:not([hidden]) #startForm').count())) issues.push(`[${tag}] после банкротства не открылся стартовый экран`);

  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- 2. тосты на телефоне ---------- */
async function toasts(b, vp) {
  const p = await openPage(b, vp, { seed: 3 });
  const tag = `${vp} тосты`;
  await isolateStart(p);
  const start = await startBaseGame(p);
  if (start.phase !== 'setup_prod' || start.scenario !== 'ufa') issues.push(`[${tag}] базовый старт: ${JSON.stringify(start)}`);
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.click('[data-act="rent"]:not([disabled])');
  await p.waitForTimeout(100); await p.evaluate(() => BK.App.ACT.closeModal());
  const res = [];
  for (const scroll of ['top', 'panel', 'deep']) {
    await p.evaluate((scroll) => {
      const tabs = document.querySelector('#tabs');
      if (scroll === 'top') window.scrollTo(0, 0);
      else if (scroll === 'panel') window.scrollTo(0, tabs.getBoundingClientRect().top + scrollY - document.querySelector('.hud').offsetHeight);
      else window.scrollTo(0, document.documentElement.scrollHeight);
      document.getElementById('toasts').innerHTML = '';
      const S = BK.App.state;
      S.notify.push({ type: 'toast', title: 'Сотрудник уволился', text: 'Точка №1 (ул. Ленина, 12): осталось 2 человека — наймите замену во вкладке «Команда»', kind: 'bad' });
      S.notify.push({ type: 'toast', title: 'Помещение арендовано', text: 'Открытие через 14 дн.', kind: 'good' });
      S.notify.push({ type: 'event', ev: { title: 'Проверка Роспотребнадзора', text: 'Инспектор нашёл нарушения на точке', kind: 'neg', effectsText: ['Штраф 120 тыс. ₽', 'Трафик −10%'] } });
    }, scroll);
    await realTicks(p, 1); await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(OUT, `toast-${vp}-${scroll}.png`) });
    const r = await p.evaluate(() => {
      const ts = [...document.querySelectorAll('#toasts .toast')].map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
      if (!ts.length) return { n: 0 };
      const box = { top: Math.min(...ts.map((r) => r.top)), bottom: Math.max(...ts.map((r) => r.bottom)), left: Math.min(...ts.map((r) => r.left)), right: Math.max(...ts.map((r) => r.right)) };
      const hit = [];
      const H = innerHeight;
      // вкладки панели, HUD и кнопки зума не должны прятаться под уведомлениями (содержимое панели при прокрутке — допустимо)
      for (const el of document.querySelectorAll('#tabs .tab, .hud button, .mapctl button')) {
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > H) continue;
        if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) hit.push((el.className || el.tagName) + ' «' + el.textContent.trim().slice(0, 20) + '»');
      }
      return { n: ts.length, box, hit: [...new Set(hit)].slice(0, 6), H };
    });
    res.push(`${scroll}: ${r.n} шт. ${r.box ? `y ${Math.round(r.box.top)}…${Math.round(r.box.bottom)}` : ''}${r.hit && r.hit.length ? ' перекрывают: ' + r.hit.join(', ') : ''}`);
    if (r.hit && r.hit.length) issues.push(`[${tag} ${scroll}] тосты закрывают элементы: ${r.hit.join(', ')}`);
  }
  notes.push(`${tag}: ${res.join(' | ')}`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- 3. сохранение / загрузка ---------- */
async function saves(b, sv) {
  const tag = 'сохранения';
  const p = await openPage(b, 'd1440', { seed: 11 });
  await isolateStart(p);
  const start = await startBaseGame(p);
  if (start.phase !== 'setup_prod' || start.scenario !== 'ufa') issues.push(`[${tag}] базовый старт: ${JSON.stringify(start)}`);
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.click('[data-act="rent"]:not([disabled])');
  await p.evaluate(() => BK.App.ACT.closeModal());
  // поиграть ~70 дней через движок, с решениями событий и шефа
  await p.evaluate(() => { const S = BK.App.state, E = BK.Engine; for (let i = 0; i < 70; i++) { E.tick(S); if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); } S.notify = []; BK.App.setSpeed(0); });
  await realTicks(p, 2);
  const snap = () => p.evaluate(() => { const c = Object.assign({}, BK.App.state); delete c.cache; c.notify = []; return JSON.stringify(c); });
  const hud = () => p.evaluate(() => ['#hud-date', '#hud-cash', '#hud-res', '#hud-stores', '#hud-goal'].map((s) => document.querySelector(s).textContent).join(' | '));
  const a = await snap(), ha = await hud();
  await p.reload(); await p.waitForTimeout(150); // pagehide → save
  const cont = await p.locator('[data-act="continue"]').textContent().catch(() => null);
  if (!cont) issues.push(`[${tag}] после перезагрузки нет кнопки «Продолжить»`);
  await p.click('[data-act="continue"]'); await p.waitForTimeout(200);
  const b1 = await snap(), hb = await hud();
  if (a !== b1) issues.push(`[${tag}] состояние после перезагрузки отличается (${a.length} vs ${b1.length} символов)`);
  if (ha !== hb) issues.push(`[${tag}] HUD после загрузки отличается: «${ha}» vs «${hb}»`);
  notes.push(`${tag}: перезагрузка → «${cont && cont.trim()}», состояние ${a === b1 ? 'совпадает' : 'НЕ совпадает'}; HUD: ${hb}`);
  // игра продолжается после загрузки
  const d0 = await p.evaluate(() => BK.App.state.day); await realTicks(p, 3);
  if ((await p.evaluate(() => BK.App.state.day)) <= d0) issues.push(`[${tag}] после загрузки время не идёт`);
  // код сохранения: экспорт → импорт на стартовом экране другого «устройства»
  await p.evaluate(() => BK.App.ACT.settings()); await p.click('#copyCode');
  const code = await p.inputValue('#saveCode');
  const s1 = await snap();
  const p2 = await openPage(b, 'm390', {});
  await p2.click('.codeload summary'); await p2.fill('#startCode', code); await p2.click('#startCodeBtn'); await p2.waitForTimeout(200);
  const s2 = await p2.evaluate(() => { const c = Object.assign({}, BK.App.state); delete c.cache; c.notify = []; return JSON.stringify(c); });
  if (s1 !== s2) issues.push(`[${tag}] импорт кода: состояние отличается`);
  await p2.fill('#startCode', 'x').catch(() => {});
  notes.push(`${tag}: код сохранения ${Math.round(code.length / 1024)} КБ, импорт на другом «устройстве» ${s1 === s2 ? 'совпал' : 'НЕ совпал'}`);
  // битый код и битое сохранение
  const p3 = await openPage(b, 'd1280', { save: '{битое' });
  if (!(await p3.locator('#startForm').count())) issues.push(`[${tag}] битое сохранение ломает стартовый экран`);
  await p3.click('.codeload summary'); await p3.fill('#startCode', 'abc'); await p3.click('#startCodeBtn'); await p3.waitForTimeout(100);
  const t3 = await p3.evaluate(() => document.querySelector('#toasts').innerText);
  if (!/не подошёл/.test(t3)) issues.push(`[${tag}] битый код: нет сообщения об ошибке`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`), ...p2.errs.map((e) => `[${tag} импорт] ${e}`), ...p3.errs.map((e) => `[${tag} битое] ${e}`));
  await p.context().close(); await p2.context().close(); await p3.context().close();

  // старые сохранения: из первой опубликованной версии (поля урезаны) — загрузить, пройти все вкладки, прожить год
  for (const [name, st] of [['старое 3 года', sv.old], ['старое 41 точка', sv.oldBig]]) {
    const q = await openPage(b, 'd1440', { save: JSON.stringify(st) });
    await q.click('[data-act="continue"]'); await q.waitForTimeout(150);
    for (const t of ['dash', 'stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) {
      await q.evaluate((t) => BK.App.ACT.tab({ arg: t }), t); await q.waitForTimeout(60);
      issues.push(...await textProblems(q, `${name} ${t}`));
    }
    const r = await q.evaluate(() => {
      const S = BK.App.state, E = BK.Engine; const d0 = S.day;
      for (let i = 0; i < 400 && !S.lost; i++) { E.tick(S); if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); }
      S.notify = [];
      return { days: S.day - d0, cash: S.cash, stores: S.stores.length, ok: Number.isFinite(S.cash) && Number.isFinite(S.reserve) && S.stores.every((s) => Number.isFinite(s.x) && s.staff.every((e) => Number.isFinite(e.mood))) };
    });
    await realTicks(q, 2);
    for (const t of ['dash', 'stores', 'team']) { await q.evaluate((t) => BK.App.ACT.tab({ arg: t }), t); await q.waitForTimeout(60); issues.push(...await textProblems(q, `${name} после года ${t}`)); }
    if (!r.ok) issues.push(`[${name}] после года игры появились NaN`);
    notes.push(`${name}: загружено, прожито ${r.days} дн., точек ${r.stores}, числа ${r.ok ? 'в порядке' : 'С NaN'}`);
    errors.push(...q.errs.map((e) => `[${name}] ${e}`));
    await q.context().close();
  }
}

/* ---------- 3в. допустимая стартовая фаза каждой истории ---------- */
async function scenarioStartPhases(b) {
  const p = await openPage(b, 'd1440', { seed: QA_SEED });
  await isolateStart(p);
  const expected = { ufa: 'setup_prod', legacy: 'setup_prod', crisis: 'setup_prod', moscow: 'setup_prod', rescue: 'play' };
  const got = [];
  for (const [id, phase] of Object.entries(expected)) {
    const r = await p.evaluate(({ id, seed }) => {
      const mode = document.querySelector('#start input[name=startmode][value=net]');
      if (mode) mode.checked = true;
      BK.App.newGame('QA сценариев', 'normal', { scen: id, seed, rival: false });
      const S = BK.App.state;
      return { id, phase: S.phase, scenario: S.story && S.story.scenario, stores: S.stores.length };
    }, { id, seed: QA_SEED });
    got.push(`${id}:${r.phase}`);
    if (r.phase !== phase || r.scenario !== id) issues.push(`[старт сценариев] ${id}: ожидались ${phase}/${id}, получены ${r.phase}/${r.scenario}`);
    if (id === 'rescue' && !r.stores) issues.push('[старт сценариев] rescue: phase=play без готовой сети');
  }
  notes.push(`стартовые фазы сценариев: ${got.join(', ')}`);
  errors.push(...p.errs.map((e) => `[старт сценариев] ${e}`));
  await p.context().close();
}

/* ---------- 3б. событие при минусе на счёте: игрок не должен застревать в окне ---------- */
async function eventEdge(b, sv) {
  const tag = 'событие без денег';
  const p = await openPage(b, 'd1440', {});
  await loadState(p, sv.y1);
  const setEv = (costs) => p.evaluate((costs) => {
    const S = BK.App.state; S.cash = -1e6; S.reserve = 0; BK.App.ACT.closeModal();
    S.ev.pending = { id: 'e045', kind: 'neg', title: 'Веерные отключения в цехе', text: 'Проверка', tg: { scope: 'production', target: S.productions[0].id }, day: S.day, effectsText: [], choices: costs.map((c, i) => ({ label: 'Вариант ' + i, desc: '', cost: c })) };
  }, costs);
  await setEv([300000, 0]); await p.waitForTimeout(150);
  const a = await p.evaluate(() => [...document.querySelectorAll('#modal [data-choice]')].map((x) => !x.disabled));
  if (!a[1]) issues.push(`[${tag}] бесплатный вариант выключен при минусе на счёте`);
  await p.locator('#modal [data-choice]:not([disabled])').first().click(); await p.waitForTimeout(100);
  await setEv([300000, 500000]); await p.waitForTimeout(150);
  const c = await p.evaluate(() => [...document.querySelectorAll('#modal [data-choice]')].map((x) => !x.disabled));
  if (!c.some(Boolean)) issues.push(`[${tag}] все варианты выключены — игрок застрял`);
  await p.locator('#modal [data-choice]:not([disabled])').first().click(); await p.waitForTimeout(100);
  const left = await p.evaluate(() => !!BK.App.state.ev.pending);
  if (left) issues.push(`[${tag}] окно события не закрылось`);
  notes.push(`${tag}: [300 тыс, 0] → доступны ${JSON.stringify(a)}; [300 тыс, 500 тыс] → ${JSON.stringify(c)}`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- 4. карта ---------- */
async function mapTests(b, vp, sv) {
  const mobile = MOBILE(vp), tag = `${vp} карта`;
  const p = await openPage(b, vp, { seed: 5 });
  await loadState(p, sv.big);
  await p.evaluate(() => BK.App.ACT.zoomReset());
  const vb = () => p.evaluate(() => document.getElementById('map').getAttribute('viewBox').split(' ').map(Number));
  const center = async (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
  const tap = async (pt) => { if (mobile) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(120); };
  const res = [];
  // маркер точки: найти видимый и не перекрытый другими маркерами
  const findTarget = () => p.evaluate(() => {
    // палец «притягивается» к ближайшей кнопке (touch adjustment) — берём точки не ближе 24 px от плавающих элементов карты
    const ui = [...document.querySelectorAll('.maplayers, .maplegend, .mapctl, .mapcart, .mapscale')].map((e) => e.getBoundingClientRect()).filter((q) => q.width);
    const nearUi = (x, y) => ui.some((q) => x > q.left - 24 && x < q.right + 24 && y > q.top - 24 && y < q.bottom + 24);
    for (const el of document.querySelectorAll('#map .m-store')) {
      const r = el.querySelector('circle.b').getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (nearUi(x, y)) continue;
      const top = document.elementFromPoint(x, y); const g = top && top.closest('[data-kind]');
      if (g === el) return { id: el.dataset.id, x, y, d: Math.round(r.width) };
    }
    return null;
  });
  let target = await findTarget();
  // на телефоне при полном отдалении почти все точки в кластерах — приблизить и искать снова
  for (let i = 0; i < 3 && !target; i++) { await p.evaluate(() => BK.App.ACT.zoomIn()); await p.waitForTimeout(250); target = await findTarget(); }
  if (!target) issues.push(`[${tag}] не нашлось кликабельного маркера точки`);
  else {
    await tap(target);
    const u = await p.evaluate(() => ({ tab: BK.App.ui.tab, id: BK.App.ui.storeId }));
    res.push(`клик по точке (⌀${target.d}px) → ${u.tab}/${u.id === target.id ? 'та самая' : u.id}`);
    if (u.tab !== 'stores' || u.id !== target.id) issues.push(`[${tag}] клик по точке не открыл её карточку`);
    if (target.d < (mobile ? 16 : 14)) issues.push(`[${tag}] маркер точки мелкий: ${target.d}px`);
  }
  // предложение аренды (на телефоне клик по точке прокручивает страницу к её карточке — сначала вернуться наверх, потом искать координаты)
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(50);
  // берём «+», не задетый соседними маркерами целиком (центр и края): палец с поправкой касания иначе попадает в соседний кластер
  const off = await p.evaluate(() => { for (const el of document.querySelectorAll('#map .m-offer')) { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const pts = [[x, y], [r.left + 1, y], [r.right - 1, y], [x, r.top + 1], [x, r.bottom - 1]]; if (pts.every(([a, b]) => { const t = document.elementFromPoint(a, b); return t && t.closest('[data-kind]') === el; })) return { id: el.dataset.id, x, y }; } return null; });
  if (off) {
    await p.evaluate(() => window.scrollTo(0, 0)); await tap(off);
    const u = await p.evaluate(() => ({ tab: BK.App.ui.tab, sel: BK.App.ui.sel, card: !!document.querySelector('.card.sel') }));
    res.push(`клик по предложению → ${u.tab}, выделена карточка: ${u.card}`);
    if (u.tab !== 'market' || !u.sel || u.sel.id !== off.id) issues.push(`[${tag}] клик по предложению не открыл «Рынок»`);
  } else notes.push(`[${tag}] предложений на карте не видно`);
  // зум кнопками
  await p.evaluate(() => window.scrollTo(0, 0));
  const v0 = await vb();
  await p.click('.mapctl [data-act="zoomIn"]'); await p.waitForTimeout(60);
  const v1 = await vb();
  await p.click('.mapctl [data-act="zoomOut"]'); await p.click('.mapctl [data-act="zoomOut"]'); await p.waitForTimeout(60);
  const v2 = await vb();
  await p.click('.mapctl [data-act="zoomReset"]'); await p.waitForTimeout(60);
  const v3 = await vb();
  res.push(`кнопки: ${Math.round(v0[2])} → + ${Math.round(v1[2])} → −− ${Math.round(v2[2])} → ⌂ ${Math.round(v3[2])}`);
  if (!(v1[2] < v0[2] && v2[2] > v1[2] && v3[2] === 1000)) issues.push(`[${tag}] кнопки зума работают неверно`);
  const mc = await center('#map');
  if (!mobile) {
    // колесо — зум к курсору, перетаскивание — сдвиг без выбора
    await p.mouse.move(mc.x - 100, mc.y - 50); await p.mouse.wheel(0, -400); await p.waitForTimeout(100);
    const w1 = await vb();
    res.push(`колесо: ширина ${Math.round(w1[2])}`);
    if (!(w1[2] < 1000)) issues.push(`[${tag}] колесо не приближает`);
    const sel0 = await p.evaluate(() => JSON.stringify(BK.App.ui.sel));
    await p.mouse.move(mc.x, mc.y); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(mc.x + i * 25, mc.y + i * 10); await p.mouse.up(); await p.waitForTimeout(80);
    const w2 = await vb();
    res.push(`перетаскивание: x ${Math.round(w1[0])} → ${Math.round(w2[0])}`);
    if (!(w2[0] < w1[0])) issues.push(`[${tag}] перетаскивание мышью не сдвигает карту`);
    if ((await p.evaluate(() => JSON.stringify(BK.App.ui.sel))) !== sel0) issues.push(`[${tag}] перетаскивание сработало как клик`);
    // подсказка при наведении
    const m = await center('#map .m-store'); await p.mouse.move(m.x, m.y); await p.waitForTimeout(80);
    const tip = await p.evaluate(() => { const t = document.querySelector('.maptip'); return !t.hidden && t.textContent; });
    res.push(`подсказка: ${tip ? '«' + tip.slice(0, 30) + '…»' : 'нет'}`);
    if (!tip) issues.push(`[${tag}] нет подсказки при наведении на точку`);
  } else {
    // тач: перетаскивание одним пальцем и pinch двумя, страница при этом не должна прокручиваться
    const cdp = await p.context().newCDPSession(p);
    const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
    const y0 = await p.evaluate(() => scrollY);
    const a = await vb();
    await touch('touchStart', [[mc.x, mc.y]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[mc.x + i * 15, mc.y + i * 12]]); await touch('touchEnd', []); await p.waitForTimeout(100);
    const b1 = await vb();
    res.push(`тач-перетаскивание: x ${Math.round(a[0])} → ${Math.round(b1[0])}, прокрутка страницы ${y0} → ${await p.evaluate(() => scrollY)}`);
    if (!(b1[0] < a[0])) issues.push(`[${tag}] перетаскивание пальцем не сдвигает карту`);
    await touch('touchStart', [[mc.x - 20, mc.y], [mc.x + 20, mc.y]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[mc.x - 20 - i * 12, mc.y], [mc.x + 20 + i * 12, mc.y]]);
    await touch('touchEnd', []); await p.waitForTimeout(100);
    const c1 = await vb();
    res.push(`pinch: ширина ${Math.round(b1[2])} → ${Math.round(c1[2])}`);
    if (!(c1[2] < b1[2])) issues.push(`[${tag}] pinch не приближает`);
    if ((await p.evaluate(() => scrollY)) !== y0) issues.push(`[${tag}] жест на карте прокрутил страницу`);
    // после pinch маркер на приближенной карте снова кликается пальцем
    const t2 = await p.evaluate(() => { for (const el of document.querySelectorAll('#map .m-store')) { const r = el.querySelector('circle.b').getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const m = document.getElementById('map').getBoundingClientRect(); if (x < m.left + 20 || x > m.right - 60 || y < m.top + 20 || y > m.bottom - 20) continue; const t = document.elementFromPoint(x, y); if (t && t.closest('[data-kind]') === el) return { id: el.dataset.id, x, y, d: Math.round(r.width) }; } return null; });
    if (t2) { await p.touchscreen.tap(t2.x, t2.y); await p.waitForTimeout(120); const id = await p.evaluate(() => BK.App.ui.storeId); res.push(`тап после pinch (⌀${t2.d}px): ${id === t2.id ? 'ок' : 'мимо'}`); if (id !== t2.id) issues.push(`[${tag}] тап по точке после pinch не сработал`); }
  }
  notes.push(`${tag}: ${res.join('; ')}`);
  await p.screenshot({ path: path.join(OUT, `map-${vp}.png`) });
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- 5. производительность ---------- */
async function perf(b, vp, st, label, throttle) {
  const p = await openPage(b, vp, {});
  const cdp = await p.context().newCDPSession(p);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await loadState(p, st);
  await p.evaluate(() => {
    const E = BK.Engine; window.__q = { tick: [], lt: [], fr: [] };
    const ot = E.tick; E.tick = function () { const t = performance.now(); const r = ot.apply(this, arguments); __q.tick.push(performance.now() - t); return r; };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) __q.lt.push(e.duration); }).observe({ type: 'longtask' });
    let last = performance.now(); (function f(t) { __q.fr.push(t - last); last = t; requestAnimationFrame(f); })(last);
    // события и шеф в замере не нужны — сразу решаем
    setInterval(() => { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) S.chef.pending = null; if (BK.App.ui.modal) BK.App.ACT.closeModal(); }, 100);
  });
  const out = [];
  for (const tab of ['dash', 'stores', 'team']) {
    await p.evaluate((t) => { BK.App.ACT.tab({ arg: t }); BK.App.setSpeed(10); }, tab);
    await p.waitForTimeout(400);
    const d0 = await p.evaluate(() => { __q.tick.length = __q.lt.length = __q.fr.length = 0; return BK.App.state.day; });
    await p.waitForTimeout(5000);
    const r = await p.evaluate((d0) => {
      const s = (a) => [...a].sort((x, y) => x - y), q = __q, fr = s(q.fr.slice(1)), tk = s(q.tick);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      return { days: BK.App.state.day - d0, tick: +avg(tk).toFixed(1), tickMax: +(tk[tk.length - 1] || 0).toFixed(1), fps: +(1000 / avg(fr)).toFixed(0), frP95: +(fr[Math.floor(fr.length * 0.95)] || 0).toFixed(1), long: q.lt.length, longMax: Math.round(Math.max(0, ...q.lt)), longSum: Math.round(q.lt.reduce((x, y) => x + y, 0)) };
    }, d0);
    out.push(`${tab}: ${r.days} дн/5с, тик ${r.tick} мс (макс ${r.tickMax}), ${r.fps} fps, кадр p95 ${r.frP95} мс, задач >50 мс: ${r.long}${r.long ? ` (макс ${r.longMax}, сумма ${r.longSum} мс)` : ''}`);
    if (throttle <= 1 && r.long > 0) issues.push(`[перф ${label} ${vp}] ${tab}: долгие задачи без замедления CPU: ${r.long} (макс ${r.longMax} мс)`);
    if (throttle > 1 && r.longSum > 1000) issues.push(`[перф ${label} ${vp} CPU×${throttle}] ${tab}: долгие задачи ${r.longSum} мс за 5 с`);
  }
  notes.push(`перф ${label}, ${vp}, CPU×${throttle}: ` + out.join(' | '));
  errors.push(...p.errs.map((e) => `[перф ${label}] ${e}`));
  await p.context().close();
}

(async () => {
  const t0 = Date.now();
  log('генерирую сохранения ботом…');
  const sv = {
    y1: botSave(1, 7919), big: botSave(13, 7919), won: botSave(16, 7919),
    old: oldify(oldVersionSave(3, 11) || botSave(3, 11)), oldBig: oldify(oldVersionSave(12, 11) || botSave(12, 11)),
  };
  sv.big60 = grow(JSON.parse(JSON.stringify(sv.won)), 60); sv.big60.won = false;
  log(`  big: ${sv.big.stores.length} точек, won: ${sv.won.stores.length}, big60: ${sv.big60.stores.length}`);
  const b = await chromium.launch();
  for (const vp of VPS) for (const th of THEMES) { log('экраны', vp, th); await screens(b, vp, th, sv); }
  for (const vp of VPS.filter(MOBILE)) { log('тосты', vp); await toasts(b, vp); }
  log('сохранения'); await saves(b, sv);
  log('событие без денег'); await eventEdge(b, sv);
  log('стартовые фазы сценариев'); await scenarioStartPhases(b);
  for (const vp of VPS.filter((v) => v === 'd1440' || v === 'm390' || v === 'm360')) { log('карта', vp); await mapTests(b, vp, sv); }
  if (!flags.has('--no-perf')) {
    log('производительность');
    await perf(b, 'd1440', sv.big, `${sv.big.stores.length} точек`, 1);
    await perf(b, 'd1440', sv.big60, '60 точек', 1);
    await perf(b, 'm390', sv.big60, '60 точек', 1);
    await perf(b, 'm390', sv.big60, '60 точек', 4);
  }
  await b.close();
  const uniq = [...new Set(issues)];
  const errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\nготово за ${Math.round((Date.now() - t0) / 1000)} с, скриншоты: ${OUT}`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
