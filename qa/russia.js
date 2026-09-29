/* QA второго акта (этап Р1): большое сохранение (бот good, 10 лет — накопленный оборот > 10 млрд) → окно «Сеть переросла город»,
   карта России, вход в Казань, цех и точка, 6 месяцев жизни, возврат в Уфу (агрегат Уфы), сохранение/загрузка с двумя городами,
   старое сохранение без S.corp. Экраны 1440 и 390 в светлой и тёмной теме.
   Запуск: node qa/russia.js [папка=qa/shots/russia]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/russia';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return JSON.parse(JSON.stringify(c));
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = (document.querySelector('#modal .modal') || document.body).innerText;
    return (t.match(/.{0,30}(NaN|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function svgText(p, label) { // мусор в подписях карты России и карты города
  const bad = await p.evaluate(() => [...document.querySelectorAll('.rusvg text, #map text')].map((t) => t.textContent).filter((t) => /NaN|undefined|Infinity/.test(t)).slice(0, 3));
  return bad.map((b) => `[${label}] МУСОР НА КАРТЕ: ${b}`);
}
// продвинуть игру на n дней движком: события — первым вариантом, шеф — без изменений; 1-е число — через настоящий цикл
async function live(p, days, act) {
  return p.evaluate(([days, act]) => {
    const S = BK.App.state, E = BK.Engine; BK.App.setSpeed(0);
    const target = S.day + days;
    let rented = 0;
    while (S.day < target && !S.lost) {
      if (S.ev.pending) E.resolveEvent(S, 0);
      if (S.chef.pending) E.chefConfirm(S, [], []);
      S.notify.length = 0;
      E.tick(S);
      if (act && S.day % 7 === 0) { // управлять «как игрок»: закрыть вакансии, открыть выгодные точки
        for (const st of S.stores) { let v = E.vacancies(st); while (v-- > 0 && E.hire(S, st.id).ok); }
        if (S.productions.some((x) => x.status === 'open') && S.stores.length < 6) {
          const o = S.offers.map((x) => ({ x, e: BK.estimateOffer(S, x) })).sort((a, b) => b.e.profit - a.e.profit)[0];
          if (o && o.e.profit > 0 && E.rentStore(S, o.x.id).ok) rented++;
        }
      }
    }
    BK.App.ui.modal = null; document.getElementById('modal').innerHTML = '';
    return { day: S.day, rented };
  }, [days, act]);
}

// закрыть окна (события — первым вариантом, шеф — без изменений), чтобы снять экран карты
async function clear(p) {
  await p.evaluate(() => { const S = BK.App.state, E = BK.Engine; if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); S.notify.length = 0; BK.App.ui.modalQueue.length = 0; BK.App.closeModal(); document.getElementById('toasts').innerHTML = ''; });
  await p.waitForTimeout(100);
}
async function flow(b, sv) {
  const tag = 'd1440-light', dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const p = await openPage(b, 'd1440', { seed: 11 });
  // сохранение кладём один раз (init-скрипт openPage восстанавливал бы его при каждой перезагрузке)
  await p.evaluate((s) => localStorage.setItem('bk-ufa-save-v1', s), JSON.stringify(sv)); await p.reload(); await p.waitForTimeout(200);
  const shot = async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 200);
    await p.screenshot({ path: path.join(dir, n + '.png') });
    issues.push(...await layoutCheck(p, `${tag} ${n}`, {}));
    issues.push(...await textProblems(p, `${tag} ${n}`), ...await svgText(p, `${tag} ${n}`));
  };
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(250);
  // старое сохранение с оборотом > 10 млрд: выход открывается при загрузке, окно — на следующем тике
  const st0 = await p.evaluate(() => { const S = BK.App.state; return { corp: !!S.corp, cum: S.cumRevenue, stores: S.stores.length, active: S.corp && S.corp.active }; });
  if (!st0.corp) issues.push(`[${tag}] выход в Россию не открылся (оборот ${Math.round(st0.cum / 1e9)} млрд)`);
  await realTicks(p, 1); await p.waitForTimeout(300);
  const stamp = await p.evaluate(() => !!document.querySelector('#modal .ru-stamp'));
  if (!stamp) issues.push(`[${tag}] нет окна «Сеть переросла город»`);
  await shot('01-m-unlock');
  await p.click('#ruOpen'); await p.waitForTimeout(700);
  const ru = await p.evaluate(() => ({ open: !document.querySelector('.rumap').hidden, cities: document.querySelectorAll('.ru-city').length, own: document.querySelectorAll('.ru-city.own').length, tab: BK.App.ui.tab }));
  if (!ru.open || ru.cities !== 19 || ru.own !== 1) issues.push(`[${tag}] карта России: открыта ${ru.open}, городов ${ru.cities}, наших ${ru.own}`);
  await shot('02-russia');
  // выбор Казани кликом по кружку
  const kz = await p.evaluate(() => { const r = document.querySelector('.ru-city[data-city="kazan"] .hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(kz.x, kz.y); await p.waitForTimeout(250);
  const selK = await p.evaluate(() => BK.App.ui.ruSel);
  if (selK !== 'kazan') issues.push(`[${tag}] клик по Казани выбрал «${selK}»`);
  await shot('03-russia-kazan-card');
  const locks = await p.evaluate(() => ({ moscow: BK.Engine.enterLock(BK.App.state, 'moscow'), spb: BK.Engine.enterLock(BK.App.state, 'spb') }));
  if (!locks.moscow || !locks.spb) issues.push(`[${tag}] Москва/Петербург не закрыты до 3 городов`);
  await p.click('[data-act="ruEnter"][data-arg="kazan"]'); await p.waitForTimeout(250);
  await shot('04-m-enter');
  const cash0 = await p.evaluate(() => BK.App.state.cash);
  await p.click('#ruEnterOk'); await p.waitForTimeout(800);
  const k1 = await p.evaluate(() => { const S = BK.App.state; return { active: S.corp.active, view: BK.App.ui.view, prodOffers: S.prodOffers.length, offers: S.offers.length, stores: S.stores.length, city: BK.CITY.name, dist: BK.DISTRICTS.length, banner: !document.getElementById('setupbanner').hidden, ufaPacked: !!S.corp.cities.ufa.packed, ufaN: S.corp.cities.ufa.packed ? S.corp.cities.ufa.packed.stores.length : 0, cash: S.cash }; });
  if (k1.active !== 'kazan' || k1.view !== 'city' || k1.city !== 'Казань' || k1.dist < 8 || k1.prodOffers !== 3 || k1.stores !== 0 || !k1.ufaPacked) issues.push(`[${tag}] вход в Казань: ${JSON.stringify(k1)}`);
  notes.push(`вход в Казань: −${Math.round((cash0 - k1.cash) / 1e6)} млн ₽, районов ${k1.dist}, предложений под цех ${k1.prodOffers}, точек ${k1.offers}; Уфа упакована: ${k1.ufaN} точек`);
  await shot('05-kazan-setup');
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.waitForTimeout(200);
  await shot('06-kazan-setup-store');
  await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(300);
  const tut = await p.evaluate(() => !!document.querySelector('#modal .modal'));
  if (tut) { issues.push(`[${tag}] после первой точки в Казани открылось окно-обучалка`); await p.evaluate(() => BK.App.ACT.closeModal()); }
  // 6 месяцев жизни
  const ufaBefore = await p.evaluate(() => ({ n: BK.App.state.corp.cities.ufa.packed.stores.length, h: BK.App.state.history.length }));
  const lv = await live(p, 183, true);
  await realTicks(p, 1);
  const k2 = await p.evaluate((h0) => {
    const S = BK.App.state, u = S.corp.cities.ufa, kz = S.corp.cities.kazan;
    const hs = S.history.slice(h0);
    return { stores: S.stores.length, open: S.stores.filter((s) => s.status === 'open').length, kzRev: kz.hist.slice(-3).map((x) => x[2]), ufaRev: u.hist.slice(-6).map((x) => x[2]), ufaStores: u.hist.slice(-6).map((x) => x[4]), ufaN: u.packed.stores.length,
      c1ok: hs.every((x) => x.c1 != null && Math.abs(x.c1 - u.hist.find((q) => q[0] === x.y && q[1] === x.m)[2]) < 2), rev: hs.map((x) => x.rev), cash: S.cash, lost: S.lost };
  }, ufaBefore.h);
  notes.push(`6 мес. в Казани: открыто точек ${k2.stores} (работают ${k2.open}); выручка Казани за 3 последних мес. ${k2.kzRev.map((v) => Math.round(v / 1e6)).join(' / ')} млн; Уфа на автопилоте: ${k2.ufaRev.map((v) => Math.round(v / 1e6)).join(' / ')} млн, точек ${k2.ufaStores.join('/')}`);
  if (k2.lost) issues.push(`[${tag}] банкротство за 6 месяцев в Казани`);
  if (k2.open < 1 || !(k2.kzRev[k2.kzRev.length - 1] > 0)) issues.push(`[${tag}] Казань не работает: ${JSON.stringify(k2)}`);
  if (k2.ufaRev.some((v) => !(v > 0)) || k2.ufaStores.some((n) => n !== ufaBefore.n) || k2.ufaN !== ufaBefore.n) issues.push(`[${tag}] агрегат Уфы: выручка ${k2.ufaRev.join(',')}, точек ${k2.ufaStores.join(',')} (было ${ufaBefore.n})`);
  if (!k2.c1ok) issues.push(`[${tag}] c1 в истории не совпадает с выручкой Уфы`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' }));
  await shot('07-kazan-6m-dash');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'stores' })); await shot('08-kazan-stores');
  // карта России с двумя городами, клавиша R
  await p.keyboard.press('r'); await p.waitForTimeout(700);
  const ru2 = await p.evaluate(() => ({ view: BK.App.ui.view, own: document.querySelectorAll('.ru-city.own').length, act: (document.querySelector('.ru-city.act') || {}).dataset }));
  if (ru2.view !== 'russia' || ru2.own !== 2) issues.push(`[${tag}] Россия после 6 мес.: ${JSON.stringify(ru2)}`);
  await shot('09-russia-2cities');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'rucities' })); await shot('10-russia-cities-tab');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' }));
  // назад в Уфу
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'ufa' })); await p.waitForTimeout(150);
  await p.click('[data-act="ruGo"][data-arg="ufa"]'); await p.waitForTimeout(200);
  await shot('11-m-go-ufa');
  await p.click('#ruGoOk'); await p.waitForTimeout(800);
  const u3 = await p.evaluate(() => { const S = BK.App.state; return { active: S.corp.active, view: BK.App.ui.view, stores: S.stores.length, staff: S.stores.reduce((a, s) => a + s.staff.length + s.incoming.length, 0), city: BK.CITY.name, kzPacked: !!S.corp.cities.kazan.packed, kzN: S.corp.cities.kazan.packed ? S.corp.cities.kazan.packed.stores.length : -1, rival: !!(S.rival && S.rival.enabled) }; });
  if (u3.active !== 'ufa' || u3.view !== 'city' || u3.stores !== ufaBefore.n || u3.staff < u3.stores * 2 || !u3.kzPacked || u3.kzN !== k2.stores || u3.city !== 'Уфа') issues.push(`[${tag}] возврат в Уфу: ${JSON.stringify(u3)}`);
  notes.push(`возврат в Уфу: точек ${u3.stores}, людей ${u3.staff}; Казань упакована (${u3.kzN} точек)`);
  await realTicks(p, 3); await clear(p);
  await shot('12-ufa-back');
  // сохранение и загрузка с двумя городами
  const before = await p.evaluate(() => { BK.App.save(); const S = BK.App.state; return { day: S.day, cash: Math.round(S.cash), cities: Object.keys(S.corp.cities).join(), size: localStorage.getItem('bk-ufa-save-v1').length }; });
  notes.push(`сохранение с двумя городами: ${Math.round(before.size / 1024)} КБ`);
  await p.reload(); await p.waitForTimeout(200);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => { const S = BK.App.state; return { day: S.day, cash: Math.round(S.cash), cities: Object.keys(S.corp.cities).join(), active: S.corp.active, city: BK.CITY.name }; });
  if (after.day !== before.day || after.cash !== before.cash || after.cities !== before.cities || after.active !== 'ufa' || after.city !== 'Уфа') issues.push(`[${tag}] загрузка: было ${JSON.stringify(before)}, стало ${JSON.stringify(after)}`);
  await realTicks(p, 5);
  // загрузка сохранения, где активна Казань: карта Казани строится заново из зерна
  await p.evaluate(() => { BK.Engine.switchCity(BK.App.state, 'kazan'); BK.App.save(); });
  const kzGeo = await p.evaluate(() => JSON.stringify(BK.DISTRICTS.map((d) => [d.id, d.x, d.y])));
  await p.reload(); await p.waitForTimeout(200);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
  const kz3 = await p.evaluate(() => ({ city: BK.CITY.name, geo: JSON.stringify(BK.DISTRICTS.map((d) => [d.id, d.x, d.y])), stores: BK.App.state.stores.length, ok: BK.App.state.stores.every((s) => BK.DISTRICTS.some((d) => d.id === s.district)) }));
  if (kz3.city !== 'Казань' || kz3.geo !== kzGeo || !kz3.ok) issues.push(`[${tag}] загрузка с активной Казанью: город ${kz3.city}, карта ${kz3.geo === kzGeo ? 'та же' : 'ДРУГАЯ'}, районы точек ${kz3.ok}`);
  await realTicks(p, 3); await clear(p); await shot('13-kazan-loaded');
  // код сохранения → стартовый экран → загрузка (другое «устройство»)
  const code = await p.evaluate(() => { BK.App.ACT.settings(); document.getElementById('copyCode').click(); return document.getElementById('saveCode').value; });
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.evaluate(() => BK.App.toStart()); await p.waitForTimeout(150);
  const startMap = await p.evaluate(() => document.querySelector('.start-map').innerHTML.includes('Инорс'));
  if (!startMap) issues.push(`[${tag}] обложка после Казани — не карта Уфы`);
  await p.evaluate((c) => { document.querySelector('.codeload').open = true; document.getElementById('startCode').value = c; }, code);
  await p.evaluate(() => { const s = BK.Slots; if (s && s.beforeNew) s.beforeNew = () => true; });
  await p.click('#startCodeBtn'); await p.waitForTimeout(300);
  const imp = await p.evaluate(() => ({ s: !!BK.App.state, city: BK.CITY.name, cities: BK.App.state && Object.keys(BK.App.state.corp.cities).length }));
  if (!imp.s || imp.city !== 'Казань' || imp.cities !== 2) issues.push(`[${tag}] загрузка из кода: ${JSON.stringify(imp)}`);
  // сохранение первого акта без S.corp и с оборотом < 10 млрд: как раньше
  const small = await p.evaluate(() => { const S = BK.App.state; return S.day; });
  void small;
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  const state = await p.evaluate(() => { const c = Object.assign({}, BK.App.state); delete c.cache; c.notify = []; return JSON.stringify(c); });
  await p.context().close();
  return JSON.parse(state);
}

async function screens(b, vp, theme, st) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save: JSON.stringify(st) });
  const shot = async (n, o = {}) => {
    await p.waitForTimeout(o.wait || 200);
    await p.screenshot({ path: path.join(dir, n + '.png'), fullPage: !!o.full });
    issues.push(...await layoutCheck(p, `${tag} ${n}`, { mobile }));
    issues.push(...await textProblems(p, `${tag} ${n}`), ...await svgText(p, `${tag} ${n}`));
  };
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(250);
  await realTicks(p, 2); await clear(p);
  await shot('01-city');
  if (mobile) { const vis = await p.evaluate(() => { const b = document.querySelector('.ml-crumb'); const r = b.getBoundingClientRect(); return !b.hidden && r.width > 30 && r.right <= innerWidth; }); if (!vis) issues.push(`[${tag}] кнопка «Россия» на карте не видна`); }
  await p.click('.ml-crumb'); await p.waitForTimeout(700);
  await shot('02-russia');
  if (mobile) await shot('03-russia-full', { full: true }); // панель под картой — снимок всей страницы
  // карточка свободного города и вход
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'ekb' })); await p.waitForTimeout(150);
  if (mobile) await p.evaluate(() => { const c = document.querySelector('.ru-card'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - document.querySelector('.hud').offsetHeight - 12); });
  await shot('04-russia-ekb');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.evaluate(() => BK.App.ACT.ruEnter({ arg: 'ekb' })); await shot('05-m-enter-ekb');
  await p.click('#ruEnterOk'); await p.waitForTimeout(800); await clear(p);
  await shot('06-ekb-setup');
  if (mobile) await shot('07-ekb-setup-full', { full: true });
  // окно выхода в Россию
  await p.evaluate(() => { BK.App.state.notify.push({ type: 'corp' }); }); await realTicks(p, 1); await p.waitForTimeout(250);
  await shot('08-m-unlock');
  await p.evaluate(() => BK.App.ACT.closeModal());
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

// сохранение первого акта (без S.corp, оборот < 10 млрд) — игра как раньше, России нет
async function oldSave(b, sv) {
  const tag = 'старое сохранение';
  const p = await openPage(b, 'd1440', { save: JSON.stringify(sv), seed: 2 });
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(250);
  await realTicks(p, 20);
  const r = await p.evaluate(() => ({ corp: !!BK.App.state.corp, crumb: !document.querySelector('.ml-crumb').hidden, city: BK.CITY.name }));
  if (r.corp || r.crumb || r.city !== 'Уфа') issues.push(`[${tag}] ${JSON.stringify(r)}`);
  await p.keyboard.press('r'); await p.waitForTimeout(300);
  if (await p.evaluate(() => BK.App.ui.view === 'russia')) issues.push(`[${tag}] клавиша R открыла Россию без выхода`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const t0 = Date.now();
  log('генерирую сохранения ботом…');
  const big = botSave(10, 7919);
  // выход в Россию уже был в игре бота — снимаем S.corp, чтобы проверить открытие при загрузке (как у сохранений до Р1)
  const pre = JSON.parse(JSON.stringify(big)); delete pre.corp; for (const h of pre.history) delete h.c1; pre.v = 1;
  if (pre.cumRevenue < 10e9) pre.cumRevenue = 10.2e9;
  const young = botSave(4, 7919); delete young.corp;
  log(`  10 лет: ${big.stores.length} точек, оборот за всё время ${Math.round(big.cumRevenue / 1e9)} млрд; 4 года: ${Math.round(young.cumRevenue / 1e9)} млрд`);
  const b = await chromium.launch();
  log('сценарий (1440, светлая)'); const st = await flow(b, pre);
  log('старое сохранение'); await oldSave(b, young);
  for (const vp of ['d1440', 'm390']) for (const th of ['light', 'dark']) { log('экраны', vp, th); await screens(b, vp, th, st); }
  await b.close();
  const uniq = [...new Set(issues)], errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\nготово за ${Math.round((Date.now() - t0) / 1000)} с, скриншоты: ${OUT}`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
