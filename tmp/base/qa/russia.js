/* QA второго акта (этапы Р1–Р2): большое сохранение (бот good, 10 лет — накопленный оборот > 10 млрд) → окно «Сеть переросла город»,
   карта России, вход в Казань, цех и точка, 6 месяцев жизни, возврат в Уфу (агрегат Уфы), сохранение/загрузка с двумя городами,
   старое сохранение без S.corp. Р2: найм директора в Казань, отчёт во входящих, решение просьбы (да / отказ по сроку),
   приоритет и бюджет города, вход в Екатеринбург под директором, Уфа под директором, «Сравнение городов», достижения,
   сохранение Р1 (без полей директоров). Р3: штаб (финдеп → Москва открыта), университет, KPI, аудит нашёл воровство,
   корпоративное событие с выбором (и недоступным вариантом), переманивание; сохранение Р2 (без полей Р3).
   Р4: вход в Стерлитамак без своего цеха (свежая выпечка из Уфы), продажи и поставка, линия снабжения на карте России;
   денежный риск — слабый директор: «теряет деньги» в «Требует внимания», «Сравнении», отчёте и карточке города.
   Р4 ч. 2: вход без таймера и рост цены входа, перегрузка штаба (сигналы, утечка во всех городах, иконки на карте), слои карты
   России, итоги игры по городам; телефон — шторка (три положения, ручка, перетаскивание, выбор города, возврат в город).
   Экраны 1440 / 390 / 360 в светлой и тёмной теме, цели на телефоне ≥ 40 px.
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
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
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
  await directors(p, tag, shot);
  await corpR3(p, tag, shot);
  await r4(p, tag, shot);
  await r42(p, tag, shot);
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
  // Уфа под директором: игрок в Казани, Уфу ведёт директор — отчёт Уфы во входящих, модель с директором
  await live(p, 40, false); await realTicks(p, 1); await clear(p);
  const uf = await p.evaluate(() => { const S = BK.App.state, u = S.corp.cities.ufa; return { dir: u.directorId, mods: !!BK.Dir.mods(S, u), rep: S.corp.inbox.some((it) => it.kind === 'report' && it.city === 'ufa'), rating: u.hist.slice(-1)[0][5], n: u.packed ? u.packed.stores.length : -1 }; });
  if (!uf.dir || !uf.mods || !uf.rep) issues.push(`[${tag}] Уфа под директором: ${JSON.stringify(uf)}`);
  notes.push(`Уфа под директором: ${uf.n} точек, рейтинг ${uf.rating}, отчёт во входящих — ${uf.rep ? 'да' : 'нет'}`);
  const nCities = await p.evaluate(() => Object.keys(BK.App.state.corp.cities).length);
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
  if (!imp.s || imp.city !== 'Казань' || imp.cities !== nCities) issues.push(`[${tag}] загрузка из кода: ${JSON.stringify(imp)}`);
  // сохранение первого акта без S.corp и с оборотом < 10 млрд: как раньше
  const small = await p.evaluate(() => { const S = BK.App.state; return S.day; });
  void small;
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  const state = await p.evaluate(() => { const c = Object.assign({}, BK.App.state); delete c.cache; c.notify = []; return JSON.stringify(c); });
  await p.context().close();
  return JSON.parse(state);
}

// Р2: директора — найм, отчёт, просьба, приоритет и бюджет, вход под директором, сравнение, достижения
async function directors(p, tag, shot) {
  const S0 = await p.evaluate(() => ({ cands: BK.App.state.corp.dirCand.length, dirs: BK.App.state.corp.directors.length }));
  if (S0.cands < 3 || S0.dirs) issues.push(`[${tag}] кандидаты в директора: ${JSON.stringify(S0)}`);
  await p.keyboard.press('r'); await p.waitForTimeout(700);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'rudirs' })); await shot('14-dirs');
  // найм в Казань через окно кандидата
  await p.click('.dcand [data-act="hireDir"]'); await p.waitForTimeout(200);
  await shot('15-m-hire');
  await p.click('#modal [data-hire="kazan"]'); await p.waitForTimeout(200);
  const k1 = await p.evaluate(() => { const S = BK.App.state, c = S.corp.cities.kazan, d = BK.Dir.dirOf(S, c); return { d: d && d.name, cap: c.budget.capex, prio: c.priority, plan: !!c.plan }; });
  if (!k1.d || !(k1.cap > 0) || !k1.plan) issues.push(`[${tag}] найм директора в Казань: ${JSON.stringify(k1)}`);
  notes.push(`директор Казани: ${k1.d}, бюджет года ${Math.round(k1.cap / 1e6)} млн, приоритет ${k1.prio}`);
  // второй — в резерв, затем назначить на Уфу (где игрок — заместитель)
  await p.evaluate(() => { if (!BK.App.state.corp.dirCand.length) BK.Engine.dirRefresh(BK.App.state, true); BK.App.ACT.hireDir({ arg: BK.App.state.corp.dirCand[0].id }); }); await p.waitForTimeout(150);
  await p.click('#modal [data-hire=""]'); await p.waitForTimeout(150);
  await p.evaluate(() => BK.App.ACT.ruHireFor({ arg: 'ufa' })); await p.waitForTimeout(150);
  await p.click('#modal [data-assign]'); await p.waitForTimeout(150);
  const u1 = await p.evaluate(() => ({ ufa: BK.App.state.corp.cities.ufa.directorId, res: BK.App.state.corp.directors.filter((d) => !d.city).length }));
  if (!u1.ufa || u1.res) issues.push(`[${tag}] назначение из резерва на Уфу: ${JSON.stringify(u1)}`);
  // месяц — отчёт Казани во входящих
  await live(p, 35, false); await realTicks(p, 1); await clear(p);
  const r1 = await p.evaluate(() => { const S = BK.App.state; const it = S.corp.inbox.find((x) => x.kind === 'report' && x.city === 'kazan'); return it ? { phrase: it.phrase, rev: it.rev, stores: it.stores } : null; });
  if (!r1 || !r1.phrase || /\{|undefined|NaN/.test(r1.phrase) || !(r1.rev > 0)) issues.push(`[${tag}] отчёт Казани: ${JSON.stringify(r1)}`);
  else notes.push(`отчёт Казани: выручка ${Math.round(r1.rev / 1e6)} млн, точек ${r1.stores}; «${r1.phrase}»`);
  // просьба бюджета → ответ «да»
  await p.evaluate(() => { const c = BK.App.state.corp.cities.kazan; c.wantBudget = { n: 2, cost: 20e6, day: BK.App.state.day }; c.budget.open = false; }); // открытия выключены — просьба не «сгорит» об открытие
  await live(p, 32, false); await realTicks(p, 1); await clear(p);
  await p.evaluate(() => BK.App.ACT.ruRep({ arg: BK.App.state.corp.inbox.find((x) => x.city === 'kazan' && (x.reqs || []).some((r) => r.t === 'budget' && r.st === 'open')).id }));
  await p.waitForTimeout(250); await shot('16-inbox');
  const b0 = await p.evaluate(() => BK.App.state.corp.cities.kazan.budget.capex);
  await p.click('.rep.need [data-act="repAns"][data-arg2="0:yes"]'); await p.waitForTimeout(200);
  const b1 = await p.evaluate(() => { const S = BK.App.state, it = S.corp.inbox.find((x) => (x.reqs || []).some((r) => r.t === 'budget')); return { cap: S.corp.cities.kazan.budget.capex, st: it.reqs.find((r) => r.t === 'budget').st, amount: it.reqs.find((r) => r.t === 'budget').amount }; });
  await p.evaluate(() => { BK.App.state.corp.cities.kazan.budget.open = true; });
  if (b1.st !== 'yes' || Math.abs(b1.cap - b0 - b1.amount) > 1) issues.push(`[${tag}] ответ «да» на бюджет: было ${b0}, ${JSON.stringify(b1)}`);
  // просьба без ответа → отказ по сроку, −1 лояльности (+ помесячный дрейф)
  const l0 = await p.evaluate(() => { const S = BK.App.state; S.corp.cities.kazan.wantBudget = { n: 1, cost: 15e6, day: S.day }; S.corp.cities.kazan.budget.open = false; S.corp.inbox = S.corp.inbox.filter((x) => !(x.reqs || []).some((r) => r.t === 'budget')); return 0; });
  void l0;
  await live(p, 64, false); await realTicks(p, 1); await clear(p);
  const df = await p.evaluate(() => { BK.App.state.corp.cities.kazan.budget.open = true; return BK.App.state.corp.inbox.filter((x) => (x.reqs || []).some((r) => r.st === 'default')).length; });
  if (!df) issues.push(`[${tag}] отказ по умолчанию не сработал`);
  // карточка города: приоритет и бюджет
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'kazan' })); await p.waitForTimeout(200);
  await p.click('[data-act="ruPrio"][data-arg="kazan"][data-arg2="growth"]'); await p.waitForTimeout(100);
  const cap0 = await p.evaluate(() => BK.App.state.corp.cities.kazan.budget.capex);
  await p.click('[data-act="ruBudget"][data-arg="kazan"][data-arg2="capex+"]'); await p.waitForTimeout(100);
  const kc = await p.evaluate(() => ({ prio: BK.App.state.corp.cities.kazan.priority, cap: BK.App.state.corp.cities.kazan.budget.capex }));
  if (kc.prio !== 'growth' || !(kc.cap > cap0)) issues.push(`[${tag}] приоритет/бюджет Казани: ${JSON.stringify(kc)}`);
  await p.evaluate(() => { const c = document.querySelector('.ru-card'); if (c) c.scrollIntoView(); });
  await shot('17-kazan-dir-card');
  // вход в Екатеринбург под директором (ждём, пока штаб освободится)
  await p.evaluate(() => { const S = BK.App.state, E = BK.Engine; let n = 0; while (E.enterLock(S, 'ekb') && n++ < 500) { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); S.notify.length = 0; E.tick(S); } if (S.cash < 3e9) S.cash = 3e9; BK.App.closeModal(); });
  await realTicks(p, 1); await clear(p);
  await p.evaluate(() => { if (!BK.App.state.corp.dirCand.length) BK.Engine.dirRefresh(BK.App.state, true); BK.App.ACT.ruEnter({ arg: 'ekb' }); }); await p.waitForTimeout(200);
  await shot('18-m-enter-dir');
  await p.click('#modal input[name="who"][value^="c:"]'); await p.click('#ruEnterOk'); await p.waitForTimeout(400);
  const e1 = await p.evaluate(() => { const S = BK.App.state, c = S.corp.cities.ekb; return c ? { active: S.corp.active, dir: c.directorId, packed: !!c.packed, stores: c.packed ? c.packed.stores.length : 0, prods: c.packed ? c.packed.productions.length : 0 } : null; });
  if (!e1 || e1.active !== 'ufa' || !e1.dir || !e1.packed || e1.stores < 1 || e1.prods !== 1) issues.push(`[${tag}] вход в Екатеринбург под директором: ${JSON.stringify(e1)}`);
  await live(p, 70, false); await realTicks(p, 1); await clear(p);
  const e2 = await p.evaluate(() => { const S = BK.App.state, h = S.corp.cities.ekb.hist; return { rev: h.length ? h[h.length - 1][2] : 0, open: S.corp.cities.ekb.packed.stores.filter((s) => s.status !== 'opening').length }; });
  if (!(e2.rev > 0) || !e2.open) issues.push(`[${tag}] Екатеринбург под директором не работает: ${JSON.stringify(e2)}`);
  notes.push(`Екатеринбург под директором через 2 мес.: открыто ${e2.open} точек, выручка ${Math.round(e2.rev / 1e6)} млн/мес`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'rucmp' })); await shot('19-cmp');
  const cm = await p.evaluate(() => ({ rows: document.querySelectorAll('table.cmp tbody tr').length, cities: Object.keys(BK.App.state.corp.cities).length }));
  if (cm.rows !== cm.cities) issues.push(`[${tag}] «Сравнение городов»: строк ${cm.rows}, городов ${cm.cities}`);
  await p.evaluate(() => { const d = BK.App.state.corp.directors[0]; BK.App.ACT.ruDir({ arg: d.id }); }); await shot('20-dir-detail');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' })); await shot('21-corp');
  const ach = await p.evaluate(() => ['ru2', 'ru3'].filter((id) => !BK.Ach.isOn(BK.App.state, id)));
  if (ach.length) issues.push(`[${tag}] нет достижений: ${ach.join(', ')}`);
  await p.evaluate(() => { BK.App.state.notify.push({ type: 'fed' }); }); await realTicks(p, 1); await p.waitForTimeout(250);
  const fm = await p.evaluate(() => !!document.querySelector('#modal .ru-stamp'));
  if (!fm) issues.push(`[${tag}] нет окна «Федеральная сеть»`);
  await shot('22-m-fed');
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.evaluate(() => BK.App.cityView(false)); await p.waitForTimeout(200);
}

// Р3: штаб, финдеп → Москва, университет, KPI, аудит с воровством, корпоративное событие, переманивание
async function corpR3(p, tag, shot) {
  await p.keyboard.press('r'); await p.waitForTimeout(700);
  await p.evaluate(() => { const S = BK.App.state; if (S.cash < 3e9) S.cash = 3e9; BK.App.ACT.tab({ arg: 'ruhq' }); });
  const lock0 = await p.evaluate(() => ({ big: BK.HQ.bigLock(BK.App.state), n: Object.keys(BK.App.state.corp.cities).length }));
  if (!lock0.big) issues.push(`[${tag}] Москва открыта без финдепа: ${JSON.stringify(lock0)}`);
  await shot('23-hq');
  await p.click('[data-act="hqOpen"][data-arg="finance"]'); await p.waitForTimeout(200);
  const f1 = await p.evaluate(() => { const S = BK.App.state; return { fin: S.corp.hq.finance, big: BK.HQ.bigLock(S), lock: BK.Engine.enterLock(S, 'moscow') }; });
  if (f1.fin !== 1 || f1.big) issues.push(`[${tag}] финдеп не открыл Москву: ${JSON.stringify(f1)}`);
  else notes.push(`финдеп открыт: Москва — ${f1.lock ? f1.lock : 'можно входить'}`);
  await p.click('[data-act="hqOpen"][data-arg="uni"]'); await p.waitForTimeout(200);
  await p.click('[data-act="hqOpen"][data-arg="hr"]'); await p.waitForTimeout(200);
  // университет и KPI — в карточке директора Казани
  const did = await p.evaluate(() => { const S = BK.App.state, d = BK.Dir.dirOf(S, S.corp.cities.kazan); BK.App.ui.dirSel = null; BK.App.ACT.ruDir({ arg: d.id }); return d.id; });
  await p.waitForTimeout(250);
  await p.click(`.ddet [data-act="uniEnroll"][data-arg="${did}"][data-arg2="ops"]`); await p.waitForTimeout(150);
  await p.click(`.ddet [data-act="dirKpi"][data-arg="${did}"][data-arg2="rev"]`); await p.waitForTimeout(100);
  await p.click(`.ddet [data-act="dirKpi"][data-arg="${did}"][data-arg2="rating"]`); await p.waitForTimeout(100);
  await p.click(`.ddet [data-act="dirBonus"][data-arg="${did}"][data-arg2="0.1"]`); await p.waitForTimeout(100);
  await p.click(`.ddet [data-act="dirBonus"][data-arg="${did}"][data-arg2="0.1"]`); await p.waitForTimeout(100);
  const m1 = await p.evaluate((id) => { const d = BK.Dir.dirById(BK.App.state, id); return { study: d.study && d.study.prog, kpi: d.kpi.keys.join('+'), bonus: d.kpi.bonus }; }, did);
  if (m1.study !== 'ops' || m1.kpi !== 'rev+rating' || Math.abs(m1.bonus - 0.2) > 0.001) issues.push(`[${tag}] университет/KPI: ${JSON.stringify(m1)}`);
  await p.evaluate(() => { const el = document.querySelector('.ddet .mot'); if (el) el.scrollIntoView({ block: 'center' }); });
  await shot('24-dir-motivation');
  // квартал: учёба закончится, KPI-премия выплачена (учёба 3 мес. завершается 1-го числа — ждём с запасом)
  await live(p, 125, false); await realTicks(p, 1); await clear(p);
  const m2 = await p.evaluate((id) => { const S = BK.App.state, d = BK.Dir.dirById(S, id); return d ? { study: !!d.study, progs: d.progs.join(), kpiLast: d.kpiLast ? d.kpiLast.pay : null, paid: S.corp.stat.kpiPaid } : null; }, did);
  if (!m2 || m2.study || m2.progs !== 'ops' || !(m2.paid >= 0) || m2.kpiLast == null) issues.push(`[${tag}] через квартал: ${JSON.stringify(m2)}`);
  else notes.push(`университет: «Операционное управление» окончено; KPI-премия за квартал ${Math.round(m2.kpiLast / 1e3)} тыс. ₽`);
  // аудит: директор Казани «нечист на руку» — аудит находит (шанс для теста 100 %)
  await p.evaluate(() => { const S = BK.App.state, d = BK.Dir.dirOf(S, S.corp.cities.kazan); d.hidden = ['theft']; d.known = []; d.theta = 0.035; d.stolen = 12e6; d.caught = false; BK.CFG.CORP.AUDIT_P.theft = 1; BK.App.ACT.ruSel({ arg: 'kazan' }); });
  await p.waitForTimeout(250);
  await p.click('[data-act="ruAudit"][data-arg="kazan"]'); await p.waitForTimeout(250);
  await p.evaluate(() => { BK.CFG.CORP.AUDIT_P.theft = 0.7; });
  const a1 = await p.evaluate(() => { const S = BK.App.state, it = S.corp.inbox.find((x) => x.kind === 'caught' && !x.done); return it ? { id: it.id, text: it.text, tab: BK.App.ui.tab } : null; });
  if (!a1) issues.push(`[${tag}] аудит не нашёл воровство`);
  else {
    notes.push(`аудит Казани: «${a1.text.slice(0, 90)}…»`);
    await p.evaluate((id) => BK.App.ACT.ruRep({ arg: id }), a1.id); await p.waitForTimeout(250);
    await shot('25-caught');
    await p.click(`[data-act="caughtDecide"][data-arg="${a1.id}"][data-arg2="sue"]`); await p.waitForTimeout(200);
    const a2 = await p.evaluate(() => { const S = BK.App.state; return { dir: S.corp.cities.kazan.directorId, pending: (S.corp.pending || []).length, caught: S.corp.stat.caught }; });
    if (a2.dir || !a2.pending || !a2.caught) issues.push(`[${tag}] решение «в суд»: ${JSON.stringify(a2)}`);
  }
  // корпоративное событие с выбором: анонимное письмо (вариант «служба безопасности» недоступен без отдела)
  await p.evaluate(() => { const S = BK.App.state; if (!S.corp.cities.kazan.directorId) { if (!S.corp.dirCand.length) BK.Engine.dirRefresh(S, true); BK.Engine.dirHire(S, S.corp.dirCand[0].id, 'kazan'); } BK.CorpEv.start(S, BK.CorpEv.byId('e211'), null); });
  await realTicks(p, 1); await p.waitForTimeout(300);
  const ev1 = await p.evaluate(() => ({ modal: !!document.querySelector('#modal .choice'), n: document.querySelectorAll('#modal .choice').length, dis: document.querySelectorAll('#modal .choice[disabled]').length, eyebrow: (document.querySelector('#modal .eyebrow') || {}).textContent || '', corp: !!(BK.App.state.ev.pending && BK.App.state.ev.pending.corp) }));
  if (!ev1.modal || ev1.n !== 3 || ev1.dis < 1 || !ev1.corp || !/Корпорация/.test(ev1.eyebrow)) issues.push(`[${tag}] событие e211: ${JSON.stringify(ev1)}`);
  await shot('26-m-corp-event');
  await p.click('#modal .choice[data-choice="2"]'); await p.waitForTimeout(200);
  const ev2 = await p.evaluate(() => ({ pending: !!BK.App.state.ev.pending, log: BK.App.state.log.slice(0, 5).map((x) => x.text || x).join(' | ') }));
  if (ev2.pending || !/Анонимное письмо: выбрано/.test(ev2.log)) issues.push(`[${tag}] выбор в e211: ${JSON.stringify(ev2)}`);
  // переманивание: e202 из очереди, «Отпустить» — директор уходит через месяц
  const pd = await p.evaluate(() => { const S = BK.App.state, d = BK.Dir.dirOf(S, S.corp.cities.ekb); BK.CorpEv.queue(S, { id: 'e202', day: S.day, dir: d.id, offerPct: 45, poacher: '«Хлебный двор»' }); return d.id; });
  await realTicks(p, 2); await p.waitForTimeout(300);
  const pz = await p.evaluate(() => ({ id: BK.App.state.ev.pending && BK.App.state.ev.pending.id, text: (document.querySelector('#modal .modal-b') || {}).textContent || '' }));
  if (pz.id !== 'e202' || !/45%/.test(pz.text)) issues.push(`[${tag}] переманивание e202: ${JSON.stringify(pz).slice(0, 200)}`);
  await shot('27-m-poach');
  await p.click('#modal .choice[data-choice="3"]'); await p.waitForTimeout(200);
  await live(p, 65, false); await realTicks(p, 1); await clear(p);
  const pg = await p.evaluate((id) => { const S = BK.App.state; return { gone: !BK.Dir.dirById(S, id), ekb: S.corp.cities.ekb.directorId, poached: S.corp.stat.poached }; }, pd);
  if (!pg.gone || pg.ekb === pd || pg.poached < 1) issues.push(`[${tag}] директор не ушёл после «Отпустить»: ${JSON.stringify(pg)}`);
  else notes.push(`переманивание: директор Екатеринбурга ушёл в «Хлебный двор», город без директора`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ruhq' })); await shot('28-hq-after');
  await p.evaluate(() => BK.App.cityView(false)); await p.waitForTimeout(200);
}

// Р4: логистика между городами и денежный риск
async function r4(p, tag, shot) {
  await p.evaluate(() => { const S = BK.App.state; if (S.cash < 3e9) S.cash = 3e9; for (const id in S.corp.cities) if (id !== 'ufa') S.corp.cities[id].enteredDay -= 800; });
  await p.keyboard.press('r'); await p.waitForTimeout(700);
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'sterlitamak' })); await p.waitForTimeout(250);
  await p.click('[data-act="ruEnter"][data-arg="sterlitamak"]'); await p.waitForTimeout(300);
  const m = await p.evaluate(() => { const r = [...document.querySelectorAll('#modal input[name="supply"]')].map((x) => x.value + (x.disabled ? ':off' : '')); return r; });
  if (m.join() !== 'own,fresh,frozen:off') issues.push(`[${tag}] выбор снабжения при входе в Стерлитамак: ${m.join()}`);
  await p.check('#modal input[name="supply"][value="fresh"]');
  await shot('29-m-enter-supply');
  await p.click('#ruEnterOk'); await p.waitForTimeout(800);
  const s1 = await p.evaluate(() => { const S = BK.App.state, c = S.corp.cities.sterlitamak; return { active: S.corp.active, from: c.supplyFrom, mode: c.supplyMode, km: c.supplyKm, setup: BK.Engine.citySetup(S), prods: S.productions.length }; });
  if (s1.active !== 'sterlitamak' || s1.from !== 'ufa' || s1.mode !== 'fresh' || s1.setup !== 'store' || s1.prods) issues.push(`[${tag}] вход без цеха: ${JSON.stringify(s1)}`);
  await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(300);
  await live(p, 75, false); await realTicks(p, 1); await clear(p);
  const s2 = await p.evaluate(() => { const S = BK.App.state, st = S.stores[0]; return { rev: st && st.last ? Math.round(st.last.rev) : 0, del: st ? Math.round(BK.Engine.deliveryCost(S, st)) : 0, remote: Math.round(BK.Corp.remoteDel(S, st) || 0), fill: S.cache && S.cache.fill }; });
  if (!(s2.rev > 0) || s2.del !== s2.remote || s2.fill !== 1) issues.push(`[${tag}] точка без своего цеха: ${JSON.stringify(s2)}`);
  else notes.push(`Стерлитамак без цеха (выпечка из Уфы, ${s1.km} км): выручка точки ${Math.round(s2.rev / 1e6)} млн/мес, поставка ${Math.round(s2.del / 1e3)} тыс. ₽/мес`);
  await p.keyboard.press('r'); await p.waitForTimeout(700);
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'sterlitamak' })); await p.waitForTimeout(300);
  const ln = await p.evaluate(() => ({ n: [...document.querySelectorAll('.ru-sup.fresh')].filter((x) => !x.closest('.ru-legend')).length, lg: /Свежая выпечка из цеха/.test(document.querySelector('.ru-legend').textContent) }));
  if (ln.n !== 1 || !ln.lg) issues.push(`[${tag}] линия снабжения на карте России: ${JSON.stringify(ln)}`);
  await shot('30-russia-supply');
  // денежный риск: слабый директор в городе на автопилоте
  const lid = await p.evaluate(() => {
    const S = BK.App.state, cr = S.corp;
    const ok = (x) => x !== cr.active && cr.cities[x].directorId && cr.cities[x].packed && cr.cities[x].packed.stores.length;
    const id = Object.keys(cr.cities).filter((x) => x !== 'ufa').find(ok) || Object.keys(cr.cities).find(ok);
    const c = cr.cities[id], d = BK.Dir.dirOf(S, c);
    for (const k of BK.Dir.SK) d.skills[k] = 20; d.progs = []; d.study = null; d.cityMonths = 30; c.leak = 0.3;
    return id;
  });
  await live(p, 40, false); await realTicks(p, 1); await clear(p);
  await live(p, 31, false); await realTicks(p, 1); await clear(p);
  const L = await p.evaluate((id) => { const S = BK.App.state, ls = BK.Dir.leakStatus(S, id), att = BK.CorpUI.attention(S).find((x) => x.t.indexOf(BK.CITY_BY_ID[id].name) === 0 && /теряет|утечка/.test(x.t)), rep = S.corp.inbox.find((x) => x.kind === 'report' && x.city === id); return { leak: ls && ls.leak, lossM: ls && ls.lossM, why: ls && ls.whyKeys.join(), att: att ? att.t + ' → ' + att.b : null, rep: !!(rep && rep.leak) }; }, lid);
  if (!L.leak || !L.att || !L.rep) issues.push(`[${tag}] сигналы утечки: ${JSON.stringify(L)}`);
  else notes.push(`денежный риск: ${L.att} (утечка ${Math.round(L.leak * 100)} %, ${L.why})`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' })); await p.waitForTimeout(300);
  await shot('31-leak-attention');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'rucmp' })); await p.waitForTimeout(300);
  const cm = await p.evaluate(() => ({ tag: document.querySelectorAll('.cmp .lossm').length, btn: [...document.querySelectorAll('.cmp button')].some((b) => /Учить|Сменить/.test(b.textContent)) }));
  if (!cm.tag || !cm.btn) issues.push(`[${tag}] «Сравнение»: нет метки или действия при утечке ${JSON.stringify(cm)}`);
  await shot('32-leak-cmp');
  await p.evaluate((id) => BK.App.ACT.ruSel({ arg: id }), lid); await p.waitForTimeout(300);
  const box = await p.evaluate(() => !!document.querySelector('.leakbox'));
  if (!box) issues.push(`[${tag}] карточка города без блока «теряет деньги»`);
  await p.evaluate(() => { const el = document.querySelector('.leakbox'); if (el) el.scrollIntoView({ block: 'center' }); });
  await shot('33-leak-city');
  await p.evaluate(() => { BK.Engine.switchCity(BK.App.state, 'ufa'); BK.App.cityView(false); }); await p.waitForTimeout(200); // дальше сценарий ждёт игрока в Уфе
}

// Р4 ч. 2: вход без таймера, цена входа растёт, перегрузка штаба (сигналы, утечка, иконки), слои карты России, итоги по городам
async function r42(p, tag, shot) {
  await p.evaluate(() => { const S = BK.App.state; if (S.cash < 20e9) S.cash = 20e9; if (BK.App.ui.view !== 'russia') BK.App.ACT.russia(); }); await p.waitForTimeout(700);
  // 1. таймера нет: сразу после входа в город можно входить в следующий, цена растёт
  // (сравниваем цену ОДНОГО И ТОГО ЖЕ города до и после входа в другой: у городов разные базовые ставки —
  //  аренда, дальность, «ворота» — и сравнивать цену разных городов между собой нельзя)
  const t1 = await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine, free = BK.CITIES.map((d) => d.id).filter((id) => !S.corp.cities[id] && !BK.CITY_BY_ID[id].big && !E.enterLock(S, id));
    const a = free[0], b = free[1], costB0 = E.enterCost(S, b), n0 = Object.keys(S.corp.cities).length;
    if (!S.corp.dirCand.length) E.dirRefresh(S, true);
    const h = E.dirHire(S, S.corp.dirCand[0].id, null); const r = E.enterCity(S, a, { director: h.d.id });
    const lockB = E.enterLock(S, b), costB = E.enterCost(S, b);
    return { a, b, ok: r.ok, lockB, costA: costB0, costB, n0, grow: BK.CFG.CORP.ENTER_GROW };
  });
  if (!t1.ok || t1.lockB) issues.push(`[${tag}] вход без таймера: ${JSON.stringify(t1)}`);
  else if (!(t1.costB > t1.costA * 1.15)) issues.push(`[${tag}] цена входа не растёт: ${JSON.stringify(t1)}`);
  else notes.push(`без таймера: вошли ${t1.a} и сразу можно ${t1.b}; цена входа ${Math.round(t1.costA / 1e6)} → ${Math.round(t1.costB / 1e6)} млн ₽ (${t1.n0}-й → ${t1.n0 + 1}-й город)`);
  // 2. «рвёмся вширь»: ещё 4 города под директорами подряд — штаб перегружен
  const t2 = await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine, got = [];
    for (let i = 0; i < 4; i++) {
      const id = BK.CITIES.map((d) => d.id).find((x) => !S.corp.cities[x] && !E.enterLock(S, x)); if (!id) break;
      if (!S.corp.dirCand.length) E.dirRefresh(S, true);
      const h = E.dirHire(S, S.corp.dirCand[0].id, null); if (!h.ok) break;
      if (E.enterCity(S, id, { director: h.d.id }).ok) got.push(id);
    }
    const L = BK.HQ.load(S); BK.Russia.render(S, true);
    return { got, L };
  });
  if (!(t2.L.over > 0)) issues.push(`[${tag}] перегрузка штаба не наступила: ${JSON.stringify(t2)}`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' })); await p.waitForTimeout(300);
  const a1 = await p.evaluate(() => { const at = BK.CorpUI.attention(BK.App.state).find((x) => /^Штаб перегружен/.test(x.t)); const el = document.querySelector('#pbody .hqload.over'); return { att: at ? at.t + ' → ' + at.b : null, box: el ? el.querySelector('.hl-h b').textContent : null, ratt: [...document.querySelectorAll('#pbody .ra b')].some((b) => /^Штаб перегружен/.test(b.textContent)) }; });
  if (!a1.att || !a1.box || !a1.ratt) issues.push(`[${tag}] сигнал перегрузки штаба: ${JSON.stringify(a1)}`);
  else notes.push(`перегрузка: «${a1.box}»; в «Требует внимания»: ${a1.att}`);
  await shot('34-overload-corp');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ruhq' })); await p.waitForTimeout(250);
  const hq = await p.evaluate(() => ({ box: !!document.querySelector('#pbody .hqload.over .hqparts'), txt: (document.querySelector('#pbody .hqload .hl-h b') || {}).textContent }));
  if (!hq.box) issues.push(`[${tag}] вкладка «Штаб» без разбора мощности: ${JSON.stringify(hq)}`);
  await shot('35-overload-hq');
  // 3. утечка от перегрузки растёт во всех городах директоров; иконки на карте
  await live(p, 95, false); await realTicks(p, 1); await clear(p);
  const t3 = await p.evaluate(() => {
    const S = BK.App.state, cr = S.corp, L = BK.HQ.load(S), rows = [];
    for (const id in cr.cities) { const c = cr.cities[id]; if (id === cr.active || !c.directorId) continue; rows.push([id, +(c.leak || 0).toFixed(3), (c.leakWhy || []).join('+')]); }
    return { over: L.over, rows, icons: document.querySelectorAll('.ru-city .ru-prob').length, over1: document.querySelectorAll('.ru-city .ru-prob.p-over').length };
  });
  const lk = t3.rows.filter((r) => r[1] > 0 && /overload/.test(r[2]));
  if (t3.over > 0 && lk.length < Math.max(1, t3.rows.length - 1)) issues.push(`[${tag}] утечка от перегрузки не во всех городах: ${JSON.stringify(t3)}`);
  else notes.push(`через 3 мес. перегрузки (+${t3.over}): утечка в ${lk.length} из ${t3.rows.length} городов директоров (${lk.slice(0, 4).map((r) => r[0] + ' ' + Math.round(r[1] * 100) + '%').join(', ')}), иконок проблем на карте ${t3.icons}`);
  await p.evaluate(() => { if (BK.App.ui.view !== 'russia') BK.App.ACT.russia(); }); await p.waitForTimeout(700);
  await p.evaluate(() => BK.Russia.render(BK.App.state, true)); await p.waitForTimeout(150);
  const ic = await p.evaluate(() => ({ n: document.querySelectorAll('.ru-city .ru-prob').length, lg: /Проблемы/.test(document.querySelector('.ru-legend').textContent) }));
  if (!ic.n || !ic.lg) issues.push(`[${tag}] иконки проблем на карте России: ${JSON.stringify(ic)}`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' })); await shot('36-overload-map');
  // 4. слои карты России
  const lays = {};
  for (const l of ['dirs', 'potential', 'logistics', 'profit']) {
    await p.click(`.ru-lay[data-arg="${l}"]`); await p.waitForTimeout(200);
    lays[l] = await p.evaluate(() => ({ layer: document.querySelector('.rusvg').getAttribute('data-layer'), pressed: (document.querySelector('.ru-lay[aria-pressed="true"]') || {}).dataset.arg, lg: document.querySelector('.ru-legend .lg-t').textContent,
      pot: document.querySelectorAll('.ru-city .free.pot-hi').length, zones: document.querySelectorAll('.ru-zone').length, nodir: document.querySelectorAll('.ru-city .ring.t-nodir, .ru-city .ring.t-good, .ru-city .ring.t-warn, .ru-city .ring.t-bad').length }));
    if (l !== 'profit') await shot('37-layer-' + l);
  }
  if (lays.dirs.layer !== 'dirs' || !/директора/.test(lays.dirs.lg) || !lays.dirs.nodir) issues.push(`[${tag}] слой «Директора»: ${JSON.stringify(lays.dirs)}`);
  if (lays.potential.layer !== 'potential' || !lays.potential.pot) issues.push(`[${tag}] слой «Потенциал»: ${JSON.stringify(lays.potential)}`);
  if (lays.logistics.layer !== 'logistics' || !lays.logistics.zones) issues.push(`[${tag}] слой «Логистика»: ${JSON.stringify(lays.logistics)}`);
  if (lays.profit.pressed !== 'profit') issues.push(`[${tag}] слой «Прибыль» не вернулся: ${JSON.stringify(lays.profit)}`);
  const kept = await p.evaluate(() => localStorage.getItem('bk-ru-layer'));
  if (kept !== 'profit') issues.push(`[${tag}] слой не запомнился: ${kept}`);
  // 5. итоги игры по городам
  await p.evaluate(() => BK.Extras.openSummary()); await p.waitForTimeout(300);
  const sm = await p.evaluate(() => { const el = document.querySelector('#modal .sumcities'); return el ? { rows: el.querySelectorAll('.sumctbl tbody tr').length, best: !!el.querySelector('.sumstore.best'), worst: !!el.querySelector('.sumstore.worst'), cities: Object.keys(BK.App.state.corp.cities).length, dec: [...document.querySelectorAll('#modal .timeline .tt')].filter((t) => /^(Вход|Куплена|Штаб:)/.test(t.textContent)).length } : null; });
  if (!sm || sm.rows !== sm.cities || !sm.best) issues.push(`[${tag}] итоги по городам: ${JSON.stringify(sm)}`);
  else notes.push(`итоги игры: городов в таблице ${sm.rows}, лучший/худший — ${sm.best && sm.worst ? 'есть' : 'частично'}, решений второго акта в «Главных решениях» ${sm.dec}`);
  await p.evaluate(() => { const el = document.querySelector('#modal .sumcities'); if (el) el.scrollIntoView(); });
  await shot('38-summary-cities');
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.evaluate(() => BK.App.cityView(false)); await p.waitForTimeout(200);
}

// телефон: шторка на экране России — три положения, ручка (нажатие и перетаскивание), карта под шторкой
async function sheetCheck(p, tag, shot) {
  await p.evaluate(() => BK.Russia.sheetSet('half', true)); await p.waitForTimeout(350);
  const g = await p.evaluate(() => {
    const pn = document.querySelector('.panel'), cs = getComputedStyle(pn), r = pn.getBoundingClientRect(), m = document.querySelector('.rumap').getBoundingClientRect();
    return { fixed: cs.position === 'fixed', pos: pn.dataset.sheet, top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, mapH: Math.round(m.height), scroll: document.documentElement.scrollHeight - innerHeight, grip: !!pn.querySelector('.sheet-grip') && getComputedStyle(pn.querySelector('.sheet-grip')).display !== 'none' };
  });
  if (!g.fixed || !g.grip || g.pos !== 'half' || g.mapH < g.vh * 0.5) issues.push(`[${tag}] шторка: ${JSON.stringify(g)}`);
  const hs = {};
  for (const pos of ['peek', 'half', 'full']) { await p.evaluate((x) => BK.Russia.sheetSet(x, true), pos); await p.waitForTimeout(380); hs[pos] = await p.evaluate(() => Math.round(document.querySelector('.panel').getBoundingClientRect().height)); await shot('40-sheet-' + pos); }
  if (!(hs.peek < hs.half && hs.half < hs.full)) issues.push(`[${tag}] положения шторки: ${JSON.stringify(hs)}`);
  const hudB = await p.evaluate(() => Math.round(document.querySelector('.hud').getBoundingClientRect().bottom));
  const fullTop = await p.evaluate(() => Math.round(document.querySelector('.panel').getBoundingClientRect().top));
  if (fullTop < hudB - 1) issues.push(`[${tag}] шторка «вся» наезжает на HUD: верх ${fullTop}, HUD до ${hudB}`);
  // нажатие по ручке: full → peek → half
  await p.click('.sheet-grip'); await p.waitForTimeout(380);
  const c1 = await p.evaluate(() => BK.Russia.sheet);
  await p.click('.sheet-grip'); await p.waitForTimeout(380);
  const c2 = await p.evaluate(() => BK.Russia.sheet);
  if (c1 !== 'peek' || c2 !== 'half') issues.push(`[${tag}] нажатие по ручке: ${c1} → ${c2}`);
  // перетаскивание вверх — до «вся»
  const gb = await p.evaluate(() => { const r = document.querySelector('.sheet-grip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(gb.x, gb.y); await p.mouse.down(); await p.mouse.move(gb.x, gb.y - 60, { steps: 4 }); await p.mouse.move(gb.x, 90, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(380);
  const d1 = await p.evaluate(() => BK.Russia.sheet);
  if (d1 !== 'full') issues.push(`[${tag}] перетаскивание шторки вверх: ${d1}`);
  // выбор города на карте при свёрнутой шторке — шторка поднимается, карточка видна
  await p.evaluate(() => BK.Russia.sheetSet('peek', true)); await p.waitForTimeout(350);
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'ufa' })); await p.waitForTimeout(380);
  const s1 = await p.evaluate(() => BK.Russia.sheet);
  if (s1 === 'peek') issues.push(`[${tag}] выбор города не поднял шторку`);
  // вкладки и прокрутка внутри шторки
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'rudirs' })); await p.waitForTimeout(250);
  const sc = await p.evaluate(() => { const b = document.querySelector('#pbody'); return { can: b.scrollHeight > b.clientHeight, ov: getComputedStyle(b).overflowY }; });
  if (sc.ov !== 'auto' && sc.ov !== 'scroll') issues.push(`[${tag}] содержимое шторки не прокручивается: ${JSON.stringify(sc)}`);
  await shot('41-sheet-dirs');
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'ru' })); await p.evaluate(() => BK.Russia.sheetSet('half', true)); await p.waitForTimeout(350);
  // слои на телефоне: строка чипов прокручивается и не вылезает за экран
  const lr = await p.evaluate(() => { const r = document.querySelector('.ru-lays').getBoundingClientRect(); return { r: Math.round(r.right), w: innerWidth, n: document.querySelectorAll('.ru-lay').length }; });
  if (lr.r > lr.w + 1 || lr.n !== 4) issues.push(`[${tag}] слои на телефоне: ${JSON.stringify(lr)}`);
  await p.click('.ru-lay[data-arg="dirs"]'); await p.waitForTimeout(200); await shot('42-sheet-layer-dirs');
  await p.click('.ru-lay[data-arg="profit"]'); await p.waitForTimeout(150);
  // назад в город — шторки нет, страница как раньше
  await p.evaluate(() => BK.App.cityView(false)); await p.waitForTimeout(250);
  const back = await p.evaluate(() => ({ fixed: getComputedStyle(document.querySelector('.panel')).position === 'fixed', grip: getComputedStyle(document.querySelector('.sheet-grip')).display }));
  if (back.fixed || back.grip !== 'none') issues.push(`[${tag}] после возврата в город панель осталась шторкой: ${JSON.stringify(back)}`);
  await p.keyboard.press('r'); await p.waitForTimeout(700);
}

// цели на телефоне: новые кнопки второго акта — не меньше 40 px по высоте
async function touchTargets(p, label) {
  const bad = await p.evaluate(() => [...document.querySelectorAll('#pbody .fchip, #pbody .btn.stp, #pbody .ra .btn, #pbody .rqb .btn, #pbody .dbtns .btn, #pbody .seg.prio button, #pbody .seg.sm button, #pbody .rfoot .btn, #pbody .nom .btn, #pbody .cmpc .btn, #pbody .dcand .btn, #pbody .hqf .btn, #pbody .mot .btn, #pbody .mot .fchip, #pbody .stud .btn, #modal .choice, #modal .wopt')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 39.5; }).slice(0, 5).map((e) => `${e.className} «${e.textContent.trim().slice(0, 20)}» ${Math.round(e.getBoundingClientRect().height)}px`));
  return bad.map((x) => `[${label}] ЦЕЛЬ < 40 px: ${x}`);
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
  const tt = async (n) => { if (mobile) issues.push(...await touchTargets(p, `${tag} ${n}`)); };
  if (mobile) { await sheetCheck(p, tag, shot); await p.evaluate(() => BK.Russia.sheetSet('full', true)); await p.waitForTimeout(350); await shot('03-russia-full'); await tt('03'); await p.evaluate(() => BK.Russia.sheetSet('half', true)); }
  // карточка города под директором
  await p.evaluate(() => BK.App.ACT.ruSel({ arg: 'kazan' })); await p.waitForTimeout(150);
  if (mobile) await p.evaluate(() => { BK.Russia.sheetSet('full', true); const c = document.querySelector('.ru-card'); if (c) c.scrollIntoView({ block: 'start' }); }); // телефон: карточка — в шторке
  await shot('04-kazan'); await tt('04');
  if (mobile) await shot('04b-kazan-full', { wait: 400 });
  await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#pbody').scrollTop = 0; });
  for (const [tab, n] of [['rudirs', '05-dirs'], ['ruinbox', '06-inbox'], ['rucmp', '07-cmp'], ['ruhq', '07b-hq']]) {
    await p.evaluate((t) => { BK.App.ACT.tab({ arg: t }); if (t === 'rudirs') { const d = BK.App.state.corp.directors[0]; if (d) { BK.App.ui.dirSel = d.id; BK.App.ACT.tab({ arg: t }); } } }, tab);
    await shot(n); await tt(n);
    if (mobile) { await p.evaluate(() => BK.Russia.sheetSet('full', true)); await shot(n + '-full', { wait: 400 }); await p.evaluate(() => BK.Russia.sheetSet('half', true)); }
    await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#pbody').scrollTop = 0; });
  }
  await p.evaluate(() => BK.App.ACT.ruHireFor({ arg: 'kazan' })); await shot('08-m-hire'); await tt('08');
  await p.evaluate(() => BK.App.ACT.closeModal());
  const free = await p.evaluate(() => BK.CITIES.map((d) => d.id).find((id) => !BK.App.state.corp.cities[id] && !BK.Engine.enterLock(BK.App.state, id)));
  if (free) { await p.evaluate((id) => BK.App.ACT.ruEnter({ arg: id }), free); await shot('09-m-enter'); await tt('09'); await p.evaluate(() => BK.App.ACT.closeModal()); }
  await p.evaluate(() => { BK.App.state.notify.push({ type: 'fed' }); }); await realTicks(p, 1); await p.waitForTimeout(250);
  await shot('10-m-fed');
  await p.evaluate(() => BK.App.ACT.closeModal());
  // окно выхода в Россию
  await p.evaluate(() => { BK.App.state.notify.push({ type: 'corp' }); }); await realTicks(p, 1); await p.waitForTimeout(250);
  await shot('11-m-unlock');
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

// сохранение Р1: корпорация без полей директоров — грузится, ensure ставит значения по умолчанию
async function r1Save(b, st) {
  const tag = 'сохранение Р1';
  const sv = JSON.parse(JSON.stringify(st)), cr = sv.corp;
  for (const k of ['directors', 'dirCand', 'dirCandDay', 'inbox', 'fed', 'dirYear', 'dirSeq', 'repSeq', 'q0', 'hq', 'hqSince', 'stat', 'perks', 'prePressure', 'equitySold', 'rivalOn', 'hqFcK', 'hqDelK', 'ev', 'creditK', 'cov', 'pending', 'campaignDay', 'uniOwnDay']) delete cr[k];
  for (const id in cr.cities) { const c = cr.cities[id]; for (const k of ['directorId', 'priority', 'budget', 'plan', 'dev', 'wantBudget', 'closeReq', 'budgetCutY', 'pressure', 'rp', 'rivalIn', 'spOffer', 'perk']) delete c[k]; c.hist = c.hist.map((x) => x.slice(0, 7)); if (c.packed) { delete c.packed.fcK0; for (const s of c.packed.stores) { delete s.mn0; delete s.byDir; delete s.pr0; } } }
  const p = await openPage(b, 'd1440', { save: JSON.stringify(sv), seed: 3 });
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(250);
  await live(p, 35, false); await realTicks(p, 1); await clear(p); // гарантированно через 1-е число: строка истории — новой длины
  const r = await p.evaluate(() => { const S = BK.App.state, cr = S.corp; return { dirs: Array.isArray(cr.directors), cand: cr.dirCand.length, inbox: Array.isArray(cr.inbox), budgets: Object.values(cr.cities).every((c) => c.budget && c.dev), hist: Object.values(cr.cities).every((c) => c.hist.slice(-1)[0].length === 9) }; });
  if (!r.dirs || r.cand < 3 || !r.inbox || !r.budgets || !r.hist) issues.push(`[${tag}] ${JSON.stringify(r)}`);
  await p.keyboard.press('r'); await p.waitForTimeout(600);
  for (const t of ['ru', 'rudirs', 'ruhq', 'ruinbox', 'rucmp']) { await p.evaluate((x) => BK.App.ACT.tab({ arg: x }), t); await p.waitForTimeout(150); issues.push(...await textProblems(p, `${tag} ${t}`)); }
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

// сохранение Р2: директора есть, полей Р3 нет — грузится, штаб и мотивация по умолчанию
async function r2Save(b, st) {
  const tag = 'сохранение Р2';
  const sv = JSON.parse(JSON.stringify(st)), cr = sv.corp;
  for (const k of ['hq', 'hqSince', 'stat', 'perks', 'prePressure', 'equitySold', 'rivalOn', 'hqFcK', 'hqDelK', 'ev', 'creditK', 'cov', 'pending', 'campaignDay', 'uniOwnDay']) delete cr[k];
  for (const id in cr.cities) { const c = cr.cities[id]; for (const k of ['pressure', 'rp', 'rivalIn', 'spOffer', 'perk']) delete c[k]; if (c.packed) { delete c.packed.fcK0; for (const s of c.packed.stores) delete s.pr0; } }
  for (const d of cr.directors.concat(cr.dirCand)) for (const k of ['known', 'kpi', 'opt', 'progs', 'region', 'study', 'board', 'regional', 'theta', 'emb', 'poachP', 'kpiLast', 'checked', 'lastAudit', 'stolen', 'caught', 'burnAt', 'agentAt']) delete d[k];
  const p = await openPage(b, 'd1440', { save: JSON.stringify(sv), seed: 4 });
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(250);
  await realTicks(p, 40); await clear(p);
  const r = await p.evaluate(() => { const S = BK.App.state, cr = S.corp; return { hq: cr.hq && cr.hq.finance === 0, stat: !!cr.stat, kpi: cr.directors.every((d) => d.kpi && Array.isArray(d.known)), press: Object.values(cr.cities).every((c) => c.pressure != null) }; });
  if (!r.hq || !r.stat || !r.kpi || !r.press) issues.push(`[${tag}] ${JSON.stringify(r)}`);
  await p.keyboard.press('r'); await p.waitForTimeout(600);
  for (const t of ['ru', 'rudirs', 'ruhq', 'ruinbox']) { await p.evaluate((x) => { BK.App.ACT.tab({ arg: x }); const d = BK.App.state.corp.directors[0]; if (x === 'rudirs' && d) { BK.App.ui.dirSel = d.id; BK.App.ACT.tab({ arg: x }); } }, t); await p.waitForTimeout(150); issues.push(...await textProblems(p, `${tag} ${t}`)); }
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
  log('сохранение Р1'); await r1Save(b, st);
  log('сохранение Р2'); await r2Save(b, st);
  for (const vp of ['d1440', 'm390', 'm360']) for (const th of ['light', 'dark']) { log('экраны', vp, th); await screens(b, vp, th, st); }
  await b.close();
  const uniq = [...new Set(issues)], errs = [...new Set(errors)];
  const txt = ['# Замеры и заметки', ...notes, '', `# Проблемы (${uniq.length})`, ...uniq, '', `# Ошибки консоли (${errs.length})`, ...errs].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log('\n' + txt);
  log(`\nготово за ${Math.round((Date.now() - t0) / 1000)} с, скриншоты: ${OUT}`);
  process.exit(uniq.length || errs.length ? 1 : 0);
})();
