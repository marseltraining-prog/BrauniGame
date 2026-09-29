/* Сценарий «живой игры» через интерфейс: клики по кнопкам, модалки, вкладки, несколько игровых лет.
   Запуск: node qa/play.js [viewport=d1440] [years=6] [seed]
   Скриншоты — qa/shots/play/, итоговое сохранение — qa/shots/play/save.json */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, tickDays, realTicks, flush } = require('./lib');

const VP = process.argv[2] || 'd1440';
const YEARS = +(process.argv[3] || 6);
const SEED = process.argv[4] ? +process.argv[4] : null;
const OUT = path.join(__dirname, 'shots', 'play-' + VP);
fs.mkdirSync(OUT, { recursive: true });
const mobile = VP.startsWith('m');
const log = (...a) => console.log(...a);
const issues = [];
const shot = async (p, name, full) => { await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full }); };
const S = (p, fn, arg) => p.evaluate(fn, arg);

(async () => {
  const b = await chromium.launch();
  const p = await openPage(b, VP, { seed: SEED });
  const modalSeen = {};
  const stats = { events: 0, choices: 0, chef: 0, years: 0, hiresUI: 0, trainsUI: 0, rentsUI: 0, eqUI: 0, repairsUI: 0, trainLimitHit: 0 };

  async function click(sel, opts = {}) {
    const loc = p.locator(sel).first();
    if (!(await loc.count())) { if (!opts.optional) issues.push(`нет элемента для клика: ${sel}`); return false; }
    if (await loc.isDisabled().catch(() => false)) { if (!opts.optional) issues.push(`элемент выключен: ${sel}`); return false; }
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ timeout: 3000 }).catch((e) => { issues.push(`клик не прошёл ${sel}: ${e.message.split('\n')[0]}`); });
    await p.waitForTimeout(40);
    return true;
  }
  async function toastText() { return p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.innerText.replace(/\s+/g, ' ')).slice(-3)); }
  async function tab(name) { await click(`#tabs [data-arg="${name}"]`); }

  async function handleModals(tag) {
    for (let guard = 0; guard < 12; guard++) {
      await p.waitForTimeout(60);
      const m = await S(p, () => { const m = document.querySelector('#modal .modal'); if (!m) return null; const eb = m.querySelector('.eyebrow'); return { eb: eb ? eb.textContent : '', h: (m.querySelector('h2') || {}).textContent, ch: m.querySelectorAll('[data-choice]').length, dis: m.querySelectorAll('[data-choice]:disabled').length }; });
      if (!m) {
        const st = await S(p, () => ({ ev: !!BK.App.state.ev.pending, chef: !!BK.App.state.chef.pending, q: BK.App.ui.modalQueue.length }));
        if (st.ev || st.chef || st.q) { await p.waitForTimeout(120); continue; }
        return;
      }
      let kind = /Шеф/.test(m.eb) ? 'chef' : /Итоги года/.test(m.eb) ? 'year' : /Победа/.test(m.eb) ? 'win' : /Банкротство/.test(m.eb) ? 'lost' : /кризис/i.test(m.eb) ? 'crisis' : /Событие|Хорошие/.test(m.eb) ? (m.ch > 1 ? 'eventChoice' : 'event') : 'other:' + m.eb;
      if (!modalSeen[kind]) { modalSeen[kind] = 1; await shot(p, `modal-${kind}`); issues.push(...await layoutCheck(p, `модалка ${kind}`, { mobile })); }
      if (kind === 'chef') {
        stats.chef++;
        const picks = await p.locator('#modal [data-pick]:not([disabled])').count();
        for (let i = 0; i < Math.min(2, picks); i++) { await p.locator('#modal label.chefitem:has([data-pick]:not([disabled]):not(:checked))').first().click(); await p.waitForTimeout(30); }
        const menuN = await S(p, () => BK.App.state.menu.length);
        if (menuN >= 9) { await p.locator('#modal label.chefitem:has([data-drop])').first().click(); await p.waitForTimeout(30); }
        if (modalSeen.chef === 1) { modalSeen.chef = 2; await shot(p, 'modal-chef-picked'); }
        const dis = await p.locator('#chefOk').isDisabled();
        if (dis) { issues.push('шеф: кнопка «Утвердить» выключена'); await S(p, () => { BK.Engine.chefConfirm(BK.App.state, [], []); }); await click('#modal [data-act="closeModal"]', { optional: true }); }
        else await click('#chefOk');
        const after = await S(p, () => ({ pending: !!BK.App.state.chef.pending, n: BK.App.state.menu.length }));
        if (after.pending) issues.push('шеф: после «Утвердить» решение не принято');
      } else if (kind === 'event' || kind === 'eventChoice' || kind === 'crisis') {
        stats.events++;
        const n = await p.locator('#modal [data-choice]:not([disabled])').count();
        if (!n) { issues.push(`событие «${m.h}»: все варианты недоступны (нет денег?) — игрок застрял`); await S(p, () => { BK.Engine.resolveEvent(BK.App.state, 0); BK.App.ACT.closeModal(); }); continue; }
        if (m.ch > 1) stats.choices++;
        const idx = Math.floor(Math.random() * n);
        await p.locator('#modal [data-choice]:not([disabled])').nth(idx).click();
      } else if (kind === 'year') { stats.years++; await click('#modal [data-act="closeModal"]'); }
      else if (kind === 'win') { log('ПОБЕДА', await S(p, () => BK.App.state.day)); await click('#modal [data-act="closeModal"]'); }
      else if (kind === 'lost') { return 'lost'; }
      else { await click('#modal [data-act="closeModal"]', { optional: true }); }
    }
  }
  async function advance(days) {
    let left = days;
    for (let guard = 0; left > 0 && guard < 200; guard++) {
      const r = await tickDays(p, left);
      left -= r.d;
      if (r.edge && !r.ev && !r.chef) left -= await realTicks(p, 1);
      await flush(p);
      const res = await handleModals();
      if (res === 'lost') return 'lost';
      const ph = await S(p, () => BK.App.state.phase);
      if (ph === 'lost') { await p.waitForTimeout(200); if ((await handleModals()) === 'lost') return 'lost'; return 'lost-nomodal'; }
    }
  }
  const state = () => S(p, () => { const S = BK.App.state; return { day: S.day, date: BK.Engine.fmtDate(S.day), cash: Math.round(S.cash), res: Math.round(S.reserve), loan: S.loan, stores: S.stores.length, open: S.stores.filter((s) => s.status !== 'opening').length, rolling: Math.round(BK.Engine.rolling12(S)), phase: S.phase, capUse: S.cache && +S.cache.capUse.toFixed(2), vac: S.stores.reduce((a, s) => a + BK.Engine.vacancies(s), 0), staff: BK.Engine.allStaff(S), quits: S.stats.quits, hires: S.stats.hires, lastProfit: S.history.length ? Math.round(S.history[S.history.length - 1].profit) : null, lastRev: S.history.length ? Math.round(S.history[S.history.length - 1].rev) : null, hr: S.office.hr, academy: S.office.academy, prods: S.productions.length, avgLvl: +(S.stores.reduce((a, s) => a + s.staff.reduce((b, e) => b + e.lvl, 0), 0) / Math.max(1, BK.Engine.allStaff(S))).toFixed(2) }; });

  /* ---------- 1. старт ---------- */
  await shot(p, '00-start');
  issues.push(...await layoutCheck(p, 'старт', { mobile }));
  await p.fill('#companyName', 'Хлеб & <Соль> «Тест»');
  await click('#startForm button[type=submit]');
  await p.waitForTimeout(150);
  await shot(p, '01-setup-prod');
  issues.push(...await layoutCheck(p, 'выбор цеха', { mobile }));
  const nameOk = await S(p, () => document.getElementById('hud-name').textContent);
  if (nameOk !== 'Хлеб & <Соль> «Тест»') issues.push('название сети в HUD искажено: ' + nameOk);

  // клик по маркеру предложения цеха на карте
  const prodIds = await S(p, () => BK.App.state.prodOffers.map((o) => o.id));
  const prodMarker = p.locator(`#map g[data-kind="prodOffer"][data-id="${prodIds[1]}"]`);
  await prodMarker.click({ force: true });
  await p.waitForTimeout(100);
  const selOk = await S(p, () => BK.App.ui.sel && BK.App.ui.sel.kind);
  if (selOk !== 'prodOffer') issues.push('клик по маркеру цеха на карте не выделил его: ' + selOk);
  await click(`[data-act="rentProd"][data-arg="${prodIds[1]}"]`);
  await p.waitForTimeout(150);
  if ((await S(p, () => BK.App.state.phase)) !== 'setup_store') issues.push('после аренды цеха фаза не setup_store');
  await shot(p, '02-setup-store');
  issues.push(...await layoutCheck(p, 'выбор точки', { mobile }));

  // лучшая точка по прогнозу
  const best = await S(p, () => { const S = BK.App.state; return S.offers.map((o) => ({ id: o.id, pr: BK.estimateOffer(S, o).profit, c: BK.Engine.storeOpenCost(S, o).total })).filter((x) => x.c < S.cash).sort((a, b) => b.pr - a.pr)[0]; });
  log('первая точка', best);
  await p.locator(`#map g[data-kind="offer"][data-id="${best.id}"]`).click({ force: true });
  await p.waitForTimeout(250);
  const cardSel = await S(p, (id) => { const c = document.querySelector(`[data-offer="${id}"]`); return c && c.classList.contains('sel'); }, best.id);
  if (!cardSel) issues.push('клик по маркеру помещения не подсветил карточку');
  await click(`[data-act="rent"][data-arg="${best.id}"]`);
  await p.waitForTimeout(200);
  await shot(p, '03-tutorial');
  const tut = await S(p, () => (document.querySelector('#modal h2') || {}).textContent);
  if (!/Первая точка/.test(tut || '')) issues.push('нет обучающей модалки после первой аренды: ' + tut);
  issues.push(...await layoutCheck(p, 'обучение', { mobile }));
  await click('#modal [data-act="closeModal"]');

  /* ---------- 2. скорость, пробел, клавиши ---------- */
  await click('[data-speed="3"]'); await p.waitForTimeout(700);
  const sp = await S(p, () => BK.App.ui.speed);
  if (sp !== 3) issues.push('кнопка скорости ×3 не сработала');
  await p.keyboard.press('Space');
  if ((await S(p, () => BK.App.ui.speed)) !== 0) issues.push('пробел не ставит паузу');
  await p.keyboard.press('Space');
  if ((await S(p, () => BK.App.ui.speed)) !== 3) issues.push('пробел не возвращает прежнюю скорость: ' + (await S(p, () => BK.App.ui.speed)));
  await click('[data-speed="0"]');

  /* ---------- 3. первые недели ---------- */
  await advance(24);
  await tab('stores');
  await shot(p, '10-stores-list');
  await click('.card.click[data-act="openStore"]');
  await p.waitForTimeout(100);
  await shot(p, '11-store-detail', mobile);
  issues.push(...await layoutCheck(p, 'карточка точки', { mobile }));
  const st0 = await S(p, () => BK.App.state.stores[0].id);
  // штат +/−
  const tgt0 = await S(p, () => BK.App.state.stores[0].staffTarget);
  await click('[data-act="staffTarget"][data-arg2="1"]');
  const tgt1 = await S(p, () => BK.App.state.stores[0].staffTarget);
  await click('[data-act="staffTarget"][data-arg2="-1"]');
  log('штат', tgt0, '→', tgt1, '→', await S(p, () => BK.App.state.stores[0].staffTarget));
  // выбрать кандидата
  await click('[data-act="pickCand"]');
  await p.waitForTimeout(150);
  if ((await S(p, () => BK.App.ui.tab)) !== 'team') issues.push('«Выбрать кандидата» не открыл вкладку «Команда»');
  const selStore = await p.locator('#hireStore').inputValue().catch(() => null);
  if (selStore !== st0) issues.push('в списке «Нанять в точку» не выбрана нужная точка');
  await shot(p, '12-team', mobile);
  const cBefore = await S(p, () => BK.App.state.stores[0].staff.length + BK.App.state.stores[0].incoming.length);
  const hired = await click('[data-act="hireCand"]:not([disabled])', { optional: true });
  const cAfter = await S(p, () => BK.App.state.stores[0].staff.length + BK.App.state.stores[0].incoming.length);
  log('найм кандидата', hired, cBefore, '→', cAfter, await toastText());
  if (hired) stats.hiresUI++;
  // обратно в точку, учить
  await S(p, (id) => BK.App.ACT.openStore({ arg: id }), st0);
  await p.waitForTimeout(80);
  const lvlBefore = await S(p, () => BK.App.state.stores[0].staff.map((e) => e.lvl).join(','));
  await click('[data-act="train"]:not([disabled])', { optional: true });
  const lvlAfter = await S(p, () => BK.App.state.stores[0].staff.map((e) => e.lvl).join(','));
  log('обучение', lvlBefore, '→', lvlAfter);
  if (lvlBefore === lvlAfter) issues.push('кнопка «Учить» не подняла уровень'); else stats.trainsUI++;
  // уволить → отмена
  await click('[data-act="askFire"]');
  if (!(await p.locator('[data-act="cancelFire"]').count())) issues.push('нет подтверждения увольнения');
  await click('[data-act="cancelFire"]');
  // закрытие → отмена
  await click('[data-act="askClose"]');
  await shot(p, '13-store-close-confirm');
  await click('[data-act="cancelClose"]');
  await click('[data-act="closeStoreView"]');

  /* ---------- 4. меню и цены ---------- */
  await tab('menu');
  await shot(p, '20-menu', mobile);
  issues.push(...await layoutCheck(p, 'меню', { mobile }));
  const pm0 = await S(p, () => BK.App.state.menu[0].pm);
  await click('[data-act="price"][data-arg2="0.05"]');
  await click('[data-act="price"][data-arg2="0.05"]');
  const pm1 = await S(p, () => BK.App.state.menu[0].pm);
  if (!(pm1 > pm0)) issues.push('кнопка цены «+» не работает');
  await click('[data-act="allPrices"][data-arg="0.05"]');
  await click('[data-act="allPrices"][data-arg="reset"]');
  const pmR = await S(p, () => BK.App.state.menu.every((m) => m.pm === 1));
  if (!pmR) issues.push('«Сбросить к рекомендованным» не сбросило цены');

  /* ---------- 5. цех ---------- */
  await tab('prod');
  await shot(p, '21-prod', mobile);
  issues.push(...await layoutCheck(p, 'цех', { mobile }));

  /* ---------- 6. финансы: ползунки, резерв, кредит ---------- */
  await tab('fin');
  await shot(p, '22-fin', mobile);
  issues.push(...await layoutCheck(p, 'финансы', { mobile }));
  const slider = p.locator('#al-reserve');
  await slider.scrollIntoViewIfNeeded();
  const bb = await slider.boundingBox();
  await p.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
  await p.waitForTimeout(80);
  const al1 = await S(p, () => ({ a: BK.App.state.alloc, lab: document.querySelector('label[for=al-reserve] b').textContent, val: document.querySelector('#al-reserve').value }));
  log('ползунок резерва клик 50%', al1);
  if (Math.abs(al1.a.reserve - 0.3) > 0.03) issues.push('ползунок резерва: клик по середине не дал ~30%: ' + al1.a.reserve);
  // перетаскивание ползунка маркетинга
  const sm = p.locator('#al-marketing'); await sm.scrollIntoViewIfNeeded(); const bm = await sm.boundingBox();
  await p.mouse.move(bm.x + 4, bm.y + bm.height / 2); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(bm.x + 4 + i * bm.width * 0.03, bm.y + bm.height / 2); await p.waitForTimeout(50); }
  await p.waitForTimeout(400); // кадр перерисовки не должен сбросить ползунок
  const midDrag = await S(p, () => ({ focus: document.activeElement && document.activeElement.id, v: document.querySelector('#al-marketing') && document.querySelector('#al-marketing').value }));
  await p.mouse.up(); await p.waitForTimeout(100);
  const al2 = await S(p, () => BK.App.state.alloc);
  log('ползунок маркетинга перетаскивание', midDrag, al2);
  if (!midDrag.v || midDrag.focus !== 'al-marketing') issues.push('во время перетаскивания ползунок потерял фокус (панель перерисовалась)');
  // сумма > 100%: поставить все три на максимум
  for (const k of ['reserve', 'bonus', 'marketing']) { const l = p.locator('#al-' + k); await l.scrollIntoViewIfNeeded(); const bx = await l.boundingBox(); await p.mouse.click(bx.x + bx.width - 2, bx.y + bx.height / 2); await p.waitForTimeout(60); }
  const al3 = await S(p, () => ({ a: BK.App.state.alloc, rest: document.querySelector('.kv span:last-child b') && document.querySelector('.kv span:last-child b').textContent, vals: ['reserve', 'bonus', 'marketing'].map((k) => document.querySelector('#al-' + k).value + '/' + document.querySelector(`label[for=al-${k}] b`).textContent) }));
  log('все ползунки на максимум', al3);
  await shot(p, '23-fin-sliders-max');
  // вернуть разумно
  await S(p, () => { BK.Engine.setAlloc(BK.App.state, { reserve: 0.15, bonus: 0.05, marketing: 0.05 }); BK.App.ACT.tab({ arg: 'fin' }); });
  const cash0 = await S(p, () => BK.App.state.cash);
  await click('[data-act="reserve"][data-arg="1000000"]');
  const res1 = await S(p, () => BK.App.state.reserve);
  if (res1 < 999999) issues.push('«+1 млн» в резерв не сработало');
  await click('[data-act="reserve"][data-arg="-1000000000000000"]');
  await click('[data-act="loan"][data-arg="5000000"]');
  const loan = await S(p, () => BK.App.state.loan);
  log('кредит', loan, await toastText());
  if (!loan) issues.push('«Взять 5 млн» не выдало кредит');
  await click('[data-act="repay"][data-arg="5000000"]', { optional: true });
  log('после погашения', await S(p, () => BK.App.state.loan));

  /* ---------- 7. журнал, помощь, меню игры ---------- */
  await tab('log');
  await click('[data-act="logFilter"][data-arg="good"]');
  await click('[data-act="logFilter"][data-arg="bad"]');
  await shot(p, '24-log');
  await click('[data-act="logFilter"][data-arg="all"]');
  await click('.hud [data-act="help"]');
  await shot(p, '25-help');
  issues.push(...await layoutCheck(p, 'помощь', { mobile }));
  await p.keyboard.press('Escape');
  if (await p.locator('#modal .modal').count()) issues.push('Escape не закрыл «Как играть»');
  await click('.hud [data-act="settings"]');
  await shot(p, '26-settings');
  issues.push(...await layoutCheck(p, 'меню игры', { mobile }));
  await p.fill('#renameIn', 'Колосок');
  await click('#renameOk');
  if ((await S(p, () => BK.App.state.company)) !== 'Колосок') issues.push('переименование не сработало');
  await click('#copyCode');
  await p.waitForTimeout(200);
  const code = await p.locator('#saveCode').inputValue();
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
  log('код сохранения', code.length, 'символов; буфер обмена совпадает:', clip === code);
  if (!code || code.length < 100) issues.push('код сохранения пустой');
  if (clip !== code) issues.push('код не попал в буфер обмена');
  // загрузить код: сначала испортить состояние
  const dayBefore = await S(p, () => BK.App.state.day);
  await p.fill('#saveCode', 'мусор');
  await click('#loadCode');
  const tt = await toastText();
  if (!tt.some((t) => /не подошёл/.test(t))) issues.push('на неверный код нет сообщения: ' + tt.join(' | '));
  await p.fill('#saveCode', code);
  await click('#loadCode');
  await p.waitForTimeout(100);
  const loaded = await S(p, () => ({ day: BK.App.state.day, name: BK.App.state.company, modal: !!document.querySelector('#modal .modal') }));
  log('загрузка из кода', loaded);
  if (loaded.day !== dayBefore) issues.push('после загрузки кода день не совпал');
  if (loaded.modal) { issues.push('после «Загрузить из кода» модалка «Меню игры» осталась открытой'); await click('#modal [data-act="closeModal"]', { optional: true }); }
  await click('.hud [data-act="settings"]');
  await click('#newGameBtn');
  await shot(p, '27-newgame-confirm');
  if (!(await p.locator('#newYes').count())) issues.push('нет подтверждения новой игры');
  await p.keyboard.press('Escape');

  /* ---------- 8. карта ---------- */
  await tab('dash');
  const vb0 = await S(p, () => document.getElementById('map').getAttribute('viewBox'));
  await click('[data-act="zoomIn"]'); await click('[data-act="zoomIn"]');
  const vb1 = await S(p, () => document.getElementById('map').getAttribute('viewBox'));
  if (vb0 === vb1) issues.push('кнопка «+» не приближает карту');
  const mb = await p.locator('#map').boundingBox();
  if (!mobile) {
    await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
    const vb2 = await S(p, () => document.getElementById('map').getAttribute('viewBox'));
    if (vb2 === vb1) issues.push('колесо мыши не зумит карту');
    await p.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await p.mouse.down();
    await p.mouse.move(mb.x + mb.width / 2 + 120, mb.y + mb.height / 2 + 60, { steps: 8 }); await p.mouse.up();
    const vb3 = await S(p, () => document.getElementById('map').getAttribute('viewBox'));
    if (vb3 === vb2) issues.push('перетаскивание карты не работает');
    const tabAfterDrag = await S(p, () => BK.App.ui.tab);
    if (tabAfterDrag !== 'dash') issues.push('перетаскивание карты сработало как клик');
    // наведение: подсказка
    const sm0 = p.locator('#map g[data-kind="store"]').first();
    await click('[data-act="zoomReset"]');
    const sb = await sm0.boundingBox();
    await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.waitForTimeout(120);
    const tip = await S(p, () => { const t = document.querySelector('.maptip'); return t.hidden ? null : t.innerText; });
    if (!tip) issues.push('нет подсказки при наведении на точку');
    await shot(p, '30-map-tip');
  }
  await click('[data-act="zoomReset"]');
  // клик по точке → вкладка «Точки»
  await p.locator('#map g[data-kind="store"]').first().click({ force: true }); await p.waitForTimeout(150);
  const t1 = await S(p, () => [BK.App.ui.tab, BK.App.ui.storeId]);
  if (t1[0] !== 'stores' || !t1[1]) issues.push('клик по точке на карте не открыл карточку точки: ' + t1);
  await p.locator('#map g[data-kind="prod"]').first().click({ force: true }); await p.waitForTimeout(150);
  if ((await S(p, () => BK.App.ui.tab)) !== 'prod') issues.push('клик по цеху на карте не открыл вкладку «Цех»');
  await p.locator('#map g[data-kind="offer"]').first().click({ force: true }); await p.waitForTimeout(150);
  if ((await S(p, () => BK.App.ui.tab)) !== 'market') issues.push('клик по свободному помещению не открыл «Рынок»');
  await p.locator('#map g[data-kind="hq"]').first().click({ force: true }); await p.waitForTimeout(150);
  if ((await S(p, () => BK.App.ui.tab)) !== 'team') issues.push('клик по офису не открыл «Команда»');
  // размер маркеров
  const msz = await S(p, () => [...document.querySelectorAll('#map g[data-kind]')].map((g) => { const r = g.getBoundingClientRect(); return [g.dataset.kind, Math.round(r.width), Math.round(r.height)]; }));
  log('размеры маркеров (px)', JSON.stringify(msz.slice(0, 6)));
  for (const [k, w, h] of msz) if (Math.min(w, h) < (mobile ? 18 : 14)) { issues.push(`маркер ${k} слишком мелкий: ${w}×${h}px`); break; }

  /* ---------- 9. годы игры ---------- */
  const monthly = [];
  let lost = false;
  let bossMode = false;
  for (let m = 0; m < YEARS * 12; m++) {
    const r = await advance(30);
    if (r === 'lost' || r === 'lost-nomodal') {
      lost = true; if (r === 'lost-nomodal') issues.push('банкротство без модального окна');
      await shot(p, 'modal-lost'); issues.push(...await layoutCheck(p, 'модалка банкротства', { mobile }));
      log('БАНКРОТСТВО', JSON.stringify(await state()));
      // тестовый «воскреситель»: продолжаем, чтобы проверить интерфейс большой сети
      await S(p, () => { const S = BK.App.state; S.lost = false; S.phase = 'play'; S.negMonths = 0; S.cash += 3e9; BK.App.ACT.closeModal(); });
      bossMode = true; log('--- продолжаем после банкротства со спонсорскими 3 млрд ---');
      continue;
    }
    const st = await state();
    monthly.push(st);
    if (m % 3 === 0) log('мес', m, JSON.stringify(st));
    // после 2 лет честной игры — «спонсор», чтобы проверить интерфейс большой сети
    if (m === 18 && !bossMode) { bossMode = true; await S(p, () => { BK.App.state.cash += 3e9; }); log('--- спонсорские 3 млрд для проверки большой сети ---'); }
    const want = bossMode ? 4 : 1;
    // мало денег — кредит через «Финансы»
    if (!bossMode && st.cash < 1.5e6) {
      await tab('fin');
      if (await click('[data-act="loan"][data-arg="5000000"]:not([disabled])', { optional: true })) { stats.loans = (stats.loans || 0) + 1; log('взят кредит', (await toastText()).slice(-1)[0]); }
    }
    if (!bossMode && st.loan && st.cash > 12e6) { await tab('fin'); await click('[data-act="repay"][data-arg="5000000"]:not([disabled])', { optional: true }); }
    // вакансии: нанять вручную (если нет HR)
    if (st.vac && !(st.hr)) {
      const vacStores = await S(p, () => BK.App.state.stores.filter((s) => s.status !== 'opening' && BK.Engine.vacancies(s) > 0).map((s) => s.id));
      for (const id of vacStores.slice(0, 4)) {
        await S(p, (id) => BK.App.ACT.openStore({ arg: id }), id); await p.waitForTimeout(40);
        const ok = await click('[data-act="quickHire"]:not([disabled])', { optional: true });
        if (ok) { const t = await toastText(); if (t.some((x) => /Не получилось/.test(x))) log('найм не прошёл:', t.slice(-1)[0]); else stats.hiresUI++; }
      }
    }
    // обучение: пока нет отдела обучения — по кнопке
    if (!st.academy && st.cash > 4e6) {
      const sid = await S(p, (m) => { const L = BK.App.state.stores.filter((s) => s.status === 'open' && s.staff.some((e) => e.lvl < 3)); return L.length ? L[m % L.length].id : null; }, m);
      if (sid) {
        await S(p, (id) => BK.App.ACT.openStore({ arg: id }), sid); await p.waitForTimeout(40);
        for (let k = 0; k < (bossMode ? 6 : 2); k++) {
          const ok = await click('[data-act="train"]:not([disabled])', { optional: true });
          if (!ok) break;
          const t = await toastText();
          if (t.some((x) => /отдела обучения/.test(x))) { stats.trainLimitHit++; if (stats.trainLimitHit === 1) { log('лимит ручного обучения:', t.slice(-1)[0]); await shot(p, '40-train-limit'); } break; }
          stats.trainsUI++;
        }
      }
    }
    // ремонт
    if (st.cash > (bossMode ? 5e6 : 8e6)) {
      const rid = await S(p, () => { const s = BK.App.state.stores.find((s) => s.status === 'open' && s.repair < 2 && s.last); return s && s.id; });
      if (rid) { await S(p, (id) => BK.App.ACT.openStore({ arg: id }), rid); await p.waitForTimeout(40); if (await click('[data-act="repair"]:not([disabled])', { optional: true })) stats.repairsUI++; }
    }
    // оборудование, если цех загружен
    if (st.capUse > 0.8) {
      await tab('prod');
      const eqs = ['rotary', 'mixer', 'divider', 'proofer', 'line'];
      for (const e of eqs) { if (await click(`[data-act="buyEq"][data-arg2="${e}"]:not([disabled])`, { optional: true })) { stats.eqUI++; break; } }
    }
    // новые точки
    const fresh = await state();
    if (!bossMode && fresh.open === fresh.stores) {
      const need = await S(p, () => { const S = BK.App.state; const L = S.offers.map((o) => ({ pr: BK.estimateOffer(S, o).profit, c: BK.Engine.storeOpenCost(S, o).total })).filter((x) => x.pr > 0).sort((a, b) => b.pr - a.pr); return L[0] ? L[0].c + 1.5e6 - S.cash : null; });
      if (need > 0) { await tab('fin'); for (let k = 0; k < 4 && need > 0; k++) { if (!(await click('[data-act="loan"][data-arg="5000000"]:not([disabled])', { optional: true }))) break; stats.loans = (stats.loans || 0) + 1; } }
    }
    for (let k = 0; k < want; k++) {
      const cand = await S(p, (boss) => { const S = BK.App.state; const L = S.offers.map((o) => ({ id: o.id, pr: BK.estimateOffer(S, o).profit, c: BK.Engine.storeOpenCost(S, o).total })).filter((x) => x.pr > 0 && S.cash > x.c + (boss ? 5e6 : 1.2e6)).sort((a, b) => b.pr - a.pr); return L[0] || null; }, bossMode);
      if (!cand || (!bossMode && fresh.open < fresh.stores)) break;
      await tab('market');
      if (await click(`[data-act="rent"][data-arg="${cand.id}"]:not([disabled])`, { optional: true })) stats.rentsUI++;
      await handleModals();
    }
    if (bossMode) {
      // пополнить рынок через риелтора
      if (fresh.stores < 60 && m % 2 === 0) { await tab('market'); await click('[data-act="realtor"]:not([disabled])', { optional: true }); }
      // второй/третий цех
      const po = await S(p, () => BK.App.state.prodOffers.length);
      if (po) { await tab('market'); await shot(p, '41-market-prodoffers'); await click('[data-act="rentProd"]:not([disabled])', { optional: true }); log('открыт новый цех', await S(p, () => BK.App.state.productions.length)); }
      // HR и отдел обучения — после порогов
      if (!fresh.hr && fresh.stores > 10) { await tab('team'); await shot(p, '42-team-no-hr', mobile); await click('[data-act="office"][data-arg="hr"]'); log('HR открыт', await S(p, () => BK.App.state.office.hr)); }
      if (!fresh.academy && fresh.stores > 15 && stats.trainLimitHit) {
        await tab('team'); await shot(p, '43-team-no-academy', mobile);
        await click('[data-act="office"][data-arg="academy"]');
        log('отдел обучения открыт', await S(p, () => BK.App.state.office.academy));
        await click('[data-act="trainTarget"][data-arg="1"]');
        await click('[data-act="trainTarget"][data-arg="1"]');
        await click('[data-act="trainTarget"][data-arg="1"]');
        log('цель обучения', await S(p, () => BK.App.state.office.trainTarget));
        await click('[data-act="autotrain"][data-arg="0"]'); await click('[data-act="autotrain"][data-arg="1"]');
        await shot(p, '44-team-academy', mobile);
        issues.push(...await layoutCheck(p, 'команда с отделами', { mobile }));
      }
      // культура и зарплата
      if (m % 6 === 1) { await tab('team'); await click('[data-act="culture"]:not([disabled])', { optional: true }); await click('[data-act="pay"][data-arg="seller"][data-arg2="0.02"]', { optional: true }); }
    }
  }
  const fin = await state();
  log('ИТОГ', JSON.stringify(fin));
  log('статистика', JSON.stringify(stats));

  /* ---------- 10. скриншоты всех вкладок на большой сети ---------- */
  await S(p, () => { if (BK.App.ui.modal) BK.App.ACT.closeModal(); });
  for (const t of ['dash', 'stores', 'market', 'prod', 'menu', 'team', 'fin', 'log']) {
    await tab(t); await p.waitForTimeout(60);
    await shot(p, `50-tab-${t}`, mobile);
    issues.push(...await layoutCheck(p, 'вкладка ' + t, { mobile }));
  }
  await S(p, () => BK.App.ACT.openStore({ arg: BK.App.state.stores[0].id }));
  await shot(p, '51-store-detail-late', mobile);
  issues.push(...await layoutCheck(p, 'карточка точки поздняя', { mobile }));
  await S(p, () => BK.App.ACT.tab({ arg: 'dash' }));
  await shot(p, '52-map-late');

  /* ---------- 11. сохранение и «Продолжить» ---------- */
  const before = await S(p, () => ({ day: BK.App.state.day, stores: BK.App.state.stores.length, cash: Math.round(BK.App.state.cash), name: BK.App.state.company }));
  fs.writeFileSync(path.join(OUT, 'save.json'), await S(p, () => JSON.stringify(Object.assign({}, BK.App.state, { cache: undefined, notify: [] }))));
  await p.reload();
  await p.waitForTimeout(300);
  await shot(p, '60-start-continue');
  const contBtn = p.locator('[data-act="continue"]');
  if (!(await contBtn.count())) issues.push('после перезагрузки нет кнопки «Продолжить»');
  else {
    log('кнопка:', await contBtn.innerText());
    await contBtn.click(); await p.waitForTimeout(200);
    const after = await S(p, () => ({ day: BK.App.state.day, stores: BK.App.state.stores.length, cash: Math.round(BK.App.state.cash), name: BK.App.state.company }));
    log('до/после перезагрузки', before, after);
    if (after.day !== before.day || after.stores !== before.stores) issues.push('«Продолжить» вернул другое состояние');
  }
  log('\nОШИБКИ СТРАНИЦЫ:', p.errs.length ? p.errs.slice(0, 20).join('\n') : 'нет');
  log('\nЗАМЕЧАНИЯ (' + issues.length + '):\n' + [...new Set(issues)].join('\n'));
  fs.writeFileSync(path.join(OUT, 'monthly.json'), JSON.stringify(monthly, null, 1));
  await b.close();
})().catch((e) => { console.error('СБОЙ СЦЕНАРИЯ', e); process.exit(1); });
