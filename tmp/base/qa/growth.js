/* QA: рост вглубь (src/growth.js, src/ui/growth-ui.js).
   Сохранение бота good (~30 точек) БЕЗ S.growth (как старое сохранение) → загрузка → через несколько дней окно «Новая возможность»
   (несколько направлений сразу) → «Открыть «Рост»» → вкладка «Рост» (9 вкладок, сетка 5×2) → флагман и фабрика: стройка →
   запуск → управление (обслуживание, полуфабрикаты, мука впрок) → заказ кейтеринга (принять), контракт с сетью (подписать,
   дебиторка), франчайзи (подписать, расторгнуть с подтверждением) → объекты на карте, подсказка, клик → событие «Поломка на
   фабрике» с вариантами и значками последствий → «Требует внимания» → сохранение/загрузка.
   1440 / 390 / 360, светлая и тёмная тема. Запуск: node qa/growth.js [папка=qa/shots/growth]
   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/growth';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], errors = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.growth; // как сохранение до роста вглубь
  c.mods = (c.mods || []).filter((m) => !m.src || !/^g-/.test(m.src));
  c.ev = Object.assign({}, c.ev, { pending: null, queue: (c.ev.queue || []).filter((x) => !/^g\d/.test(x.id)) }); c.chef = Object.assign({}, c.chef, { pending: null });
  return c;
}
const runDays = (p, n) => p.evaluate((n) => {
  const S = BK.App.state; BK.App.setSpeed(0);
  for (let i = 0; i < n; i++) {
    if (S.ev.pending) BK.Engine.resolveEvent(S, 0);
    if (S.chef.pending) BK.Engine.chefConfirm(S, [], []);
    if (!BK.Engine.tick(S) && S.phase !== 'play') break;
  }
  S.notify.length = 0; BK.App.ui.modalQueue.length = 0; if (BK.App.ui.modal) BK.App.closeModal(); BK.App.refresh();
  return S.day;
}, n);

async function scenario(b, sv, vp, dark) {
  const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp !== 'd1440';
  const p = await openPage(b, vp, { dark, save: JSON.stringify(sv) });
  const shot = async (name) => { await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  const lay = async (label) => { issues.push(...(await layoutCheck(p, `${tag} ${label}`, { mobile }))); };
  const scrollTo = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'start' }); return !!el; }, sel);
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
  // старое сохранение без S.growth: направления открываются при первом же пересчёте, окно «Новая возможность»
  const s0 = await p.evaluate(() => { const S = BK.App.state; BK.App.setSpeed(0); S.cash = Math.max(S.cash, 2e9); return { had: !!S.growth, stores: S.stores.length }; });
  if (s0.had) issues.push(`[${tag}] в тестовом сохранении уже есть S.growth`);
  await p.evaluate(() => { const S = BK.App.state; for (let i = 0; i < 8; i++) { if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) BK.Engine.chefConfirm(S, [], []); BK.Engine.tick(S); if (S.notify.some((n) => n.type === 'growth')) break; } });
  for (let k = 0; k < 6; k++) { // события и окна, пришедшие раньше, закрываем, пока не покажется «Новая возможность»
    await p.evaluate(() => BK.App.setSpeed(10)); await p.waitForFunction(() => !!document.querySelector('#modal .modal'), null, { timeout: 5000 }).catch(() => {}); await p.evaluate(() => BK.App.setSpeed(0));
    if (await p.locator('#modal .gr-mh').count()) break;
    await p.evaluate(() => { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) BK.Engine.chefConfirm(S, [], []); BK.App.closeModal(); });
    await p.waitForTimeout(150);
  }
  const m1 = await p.evaluate(() => ({ modal: !!document.querySelector('#modal .gr-mh'), txt: (document.querySelector('#modal .modal') || {}).innerText || '', keys: Object.keys(BK.App.state.growth ? BK.App.state.growth.un : {}), fx: document.querySelectorAll('#modal .fxc').length }));
  if (!m1.modal) issues.push(`[${tag}] нет окна «Новая возможность» (открыто: ${m1.keys.join(',')})`);
  if (m1.keys.length < 3) issues.push(`[${tag}] открылось мало направлений: ${m1.keys.join(',')} при ${s0.stores} точках`);
  if (m1.modal && !/Риск/.test(m1.txt)) issues.push(`[${tag}] в окне нет рисков направлений`);
  if (m1.modal && !m1.fx) issues.push(`[${tag}] в окне нет значков`);
  await shot('01-unlock'); await lay('окно «Новая возможность»');
  if (m1.modal) { await p.click('#modal [data-act="growTab"]'); await p.waitForTimeout(200); } else await p.evaluate(() => BK.App.ACT.tab({ arg: 'grow' }));
  const t1 = await p.evaluate(() => ({ tabs: document.querySelectorAll('#tabs .tab').length, grow: !!document.querySelector('#tabs [data-arg="grow"][aria-selected="true"]'), t9: document.querySelector('#tabs').classList.contains('t9'), secs: [...document.querySelectorAll('#pbody .gr-sec')].map((x) => x.id) }));
  if (t1.tabs !== 9 || !t1.t9) issues.push(`[${tag}] вкладок ${t1.tabs} (нужно 9, сетка 5×2)`);
  if (!t1.grow) issues.push(`[${tag}] вкладка «Рост» не открылась`);
  if (t1.secs.length < 3) issues.push(`[${tag}] разделов направлений ${t1.secs.length}: ${t1.secs.join(',')}`);
  await p.evaluate(() => { document.getElementById('pbody').scrollTop = 0; }); await shot('02-tab'); await lay('вкладка «Рост»');
  // все направления сразу (для проверки экрана)
  await p.evaluate(() => { const S = BK.App.state, G = BK.Growth; for (const k of G.KEYS) if (S.growth.un[k] == null) S.growth.un[k] = S.day; for (let i = 0; i < 3; i++) BK.Engine.tick(S); S.notify.length = 0; BK.App.refresh(); });
  // флагман и фабрика: стройка
  const b1 = await p.evaluate(() => {
    const S = BK.App.state, g = S.growth, out = {};
    const fl = document.querySelector('#pbody [data-act="grFlag"]'); if (fl) fl.click(); out.flag = g.flag ? g.flag.status : null;
    const fc = document.querySelector('#pbody [data-act="grFac"]'); if (fc) fc.click(); out.fac = g.fac ? g.fac.status : null;
    return out;
  });
  if (b1.flag !== 'build') issues.push(`[${tag}] флагман не начал строиться: ${b1.flag}`);
  if (b1.fac !== 'build') issues.push(`[${tag}] фабрика не начала строиться: ${b1.fac}`);
  await scrollTo('#gr-factory'); await shot('03-build'); await lay('стройка');
  // запуск: сдвигаем сроки
  await p.evaluate(() => { const S = BK.App.state, g = S.growth; g.flag.readyDay = S.day + 1; g.fac.readyDay = S.day + 1; });
  await runDays(p, 3);
  const o1 = await p.evaluate(() => { const g = BK.App.state.growth; return { flag: g.flag.status, fac: g.fac.status, map: { fac: !!document.querySelector('#map .m-gfac'), flag: !!document.querySelector('#map .m-gflag') } }; });
  if (o1.flag !== 'open' || o1.fac !== 'open') issues.push(`[${tag}] флагман/фабрика не открылись: ${JSON.stringify(o1)}`);
  if (!o1.map.fac || !o1.map.flag) issues.push(`[${tag}] на карте нет фабрики/флагмана: ${JSON.stringify(o1.map)}`);
  // управление фабрикой
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'grow' }));
  await p.click('#pbody [data-act="grMaint"][data-arg="2"]'); await p.click('#pbody [data-act="grSemis"][data-arg="0.5"]');
  const hb = await p.locator('#pbody [data-act="grHedge"]').count(); if (hb) await p.click('#pbody [data-act="grHedge"]');
  const c1 = await p.evaluate(() => { const f = BK.App.state.growth.fac; return { maint: f.maint, semis: f.semis, hedge: !!f.hedge }; });
  if (c1.maint !== 2 || c1.semis !== 0.5) issues.push(`[${tag}] переключатели фабрики не сработали: ${JSON.stringify(c1)}`);
  if (hb && !c1.hedge) issues.push(`[${tag}] мука впрок не закупилась`);
  await p.click('#pbody [data-act="grTour"][data-arg="1"]');
  if (!(await p.evaluate(() => BK.App.state.growth.flag.tour))) issues.push(`[${tag}] программа для туристов не включилась`);
  await scrollTo('#gr-factory'); await shot('04-factory'); await lay('фабрика');
  await scrollTo('#gr-flag'); await shot('05-flag'); await lay('флагман');
  // заказ кейтеринга, контракт, франчайзи — если нет предложений, подкладываем как их делает движок
  await p.evaluate(() => {
    const S = BK.App.state, g = S.growth;
    if (!g.cat.offers.length) g.cat.offers.push({ id: 'coQA', client: 'Бизнес-центр «Уфа-Сити»', what: 'корпоратив', units: 6000, days: 2, start: S.day + 5, price: 120, until: S.day + 4 });
    if (!g.ret.offers.length) g.ret.offers.push({ id: 'roQA', chain: 'sem', name: '«Семейный»', note: 'гипермаркеты', units: 2400, price: 50, pay: 45, fine: 0.5, until: S.day + 20, term: 365 });
    if (!g.fr.cand.length) g.fr.cand.push({ id: 'fcQA', partner: 'ООО «Хлебный дом»', bio: 'владелица двух магазинов у дома', district: 'dema', x: 120, y: 890, address: 'ул. Правды, 12', q: 0.7, seen: 3.5, fee: 3500000, until: S.day + 30 });
    BK.App.refresh();
  });
  await scrollTo('#gr-cater'); await shot('06-cater'); await lay('кейтеринг');
  const oid = await p.evaluate(() => BK.App.state.growth.cat.offers[0].id);
  const catFx = await p.evaluate(() => document.querySelectorAll('#gr-cater .gr-card .fxc').length);
  if (catFx < 3) issues.push(`[${tag}] у заказа нет значков последствий`);
  await p.click(`#pbody [data-act="grOrder"][data-arg="${oid}"]`); await p.waitForTimeout(80);
  if (!(await p.evaluate((id) => BK.App.state.growth.cat.acc.some((o) => o.id === id), oid))) issues.push(`[${tag}] заказ не принят`);
  await scrollTo('#gr-retail'); await shot('07-retail'); await lay('полки');
  const rid = await p.evaluate(() => BK.App.state.growth.ret.offers[0].id);
  await p.click(`#pbody [data-act="grRet"][data-arg="${rid}"]`); await p.waitForTimeout(80);
  await runDays(p, 2);
  const r1 = await p.evaluate(() => ({ n: BK.App.state.growth.ret.list.length, recv: BK.Growth.recvTotal(BK.App.state) }));
  if (!r1.n) issues.push(`[${tag}] контракт не подписан`);
  if (!(r1.recv > 0)) issues.push(`[${tag}] нет дебиторки после поставок по контракту`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'grow' }));
  const cid = await p.evaluate(() => (BK.App.state.growth.fr.cand[0] || {}).id);
  const cash0 = await p.evaluate(() => BK.App.state.cash);
  if (cid) { await p.click(`#pbody [data-act="grFran"][data-arg="${cid}"]`); await p.waitForTimeout(80); }
  const f1 = await p.evaluate(() => ({ n: BK.App.state.growth.fr.list.length, cash: BK.App.state.cash }));
  if (!f1.n) issues.push(`[${tag}] договор франшизы не подписан`);
  if (!(f1.cash > cash0)) issues.push(`[${tag}] паушальный взнос не пришёл`);
  await p.click('#pbody [data-act="grCtrl"][data-arg="3"]');
  await scrollTo('#gr-fran'); await shot('08-fran'); await lay('франшиза');
  // расторжение с подтверждением
  const fid = await p.evaluate(() => BK.App.state.growth.fr.list[BK.App.state.growth.fr.list.length - 1].id);
  await p.click(`#pbody [data-act="grFranAsk"][data-arg="${fid}"]`); await p.waitForTimeout(60);
  if (!(await p.locator('#pbody [data-act="grFranClose"]').count())) issues.push(`[${tag}] нет подтверждения расторжения`);
  await p.click('#pbody [data-act="grFranCloseNo"]');
  // карта: франчайзи, подсказка, клик по фабрике
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'dash' }));
  const mp = await p.evaluate(() => ({ fr: document.querySelectorAll('#map .m-gfr').length, tip: BK.GrowthUI.tip(BK.App.state, 'gfac', BK.App.state.growth.fac.id), lg: /Фабрика/.test((document.querySelector('.mapwrap') || {}).innerText || '') }));
  if (!mp.fr) issues.push(`[${tag}] на карте нет франчайзи`);
  if (!/фабрика/i.test(mp.tip)) issues.push(`[${tag}] нет подсказки у фабрики на карте`);
  if (!mobile) {
    const box = await p.evaluate(() => { const el = document.querySelector('#map .m-gfac'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (box) { await p.mouse.click(box.x, box.y); await p.waitForTimeout(150); if (!(await p.evaluate(() => BK.App.ui.tab === 'grow'))) issues.push(`[${tag}] клик по фабрике на карте не открыл «Рост»`); }
    await p.evaluate(() => { BK.App.ui.sel = null; BK.App.refresh(); });
    await shot('09-map');
  }
  // событие: поломка фабрики
  await p.evaluate(() => { const S = BK.App.state; S.ev.queue = (S.ev.queue || []).concat([{ id: 'g03', day: S.day + 1, tg: { scope: 'global', target: null } }]); S.ev.nextCrisis = Math.max(S.ev.nextCrisis, S.day + 60); S.growth.fac.down = S.day + 10; BK.Engine.tick(S); BK.App.refresh(); BK.App.setSpeed(1); });
  await p.waitForTimeout(400); await p.evaluate(() => BK.App.setSpeed(0));
  const ev = await p.evaluate(() => ({ id: BK.App.state.ev.pending && BK.App.state.ev.pending.id, ch: document.querySelectorAll('#modal .choice').length, fx: document.querySelectorAll('#modal .choice .fxc').length }));
  if (ev.id !== 'g03' || ev.ch !== 3) issues.push(`[${tag}] событие «Поломка на фабрике» не показано: ${JSON.stringify(ev)}`);
  if (ev.ch && !ev.fx) issues.push(`[${tag}] у вариантов события нет значков`);
  await shot('10-event'); await lay('событие поломки');
  if (ev.ch) { await p.click('#modal .choice[data-choice="0"]'); await p.waitForTimeout(150); }
  const dn = await p.evaluate(() => { const S = BK.App.state; return S.growth.fac.down - S.day; });
  if (ev.ch && !(dn >= 2 && dn <= 3)) issues.push(`[${tag}] срочный ремонт: простой ${dn} дн. (нужно 3)`);
  // «Требует внимания»
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.tab({ arg: 'dash' }); });
  const at = await p.evaluate(() => [...document.querySelectorAll('#pbody .att .it')].map((x) => x.innerText).join(' | '));
  if (!/Фабрика стоит|заказ|контракт|франшиз/i.test(at)) issues.push(`[${tag}] в «Требует внимания» нет строк роста вглубь`);
  // сохранение и загрузка
  const back = await p.evaluate(() => { BK.App.save(); const raw = JSON.parse(localStorage.getItem(BK.Slots.key())); return { fac: raw.growth && raw.growth.fac && raw.growth.fac.status, fr: raw.growth && raw.growth.fr.list.length }; });
  if (back.fac !== 'open' || !back.fr) issues.push(`[${tag}] рост вглубь не сохранился: ${JSON.stringify(back)}`);
  await p.evaluate(() => { BK.App.continueGame(JSON.parse(localStorage.getItem(BK.Slots.key()))); }); await p.waitForTimeout(200);
  const re = await p.evaluate(() => { BK.App.setSpeed(0); BK.App.closeModal(); BK.App.ACT.tab({ arg: 'grow' }); return { tab: !!document.querySelector('#tabs [data-arg="grow"]'), secs: document.querySelectorAll('#pbody .gr-sec').length }; });
  if (!re.tab || re.secs < 5) issues.push(`[${tag}] после загрузки нет вкладки/разделов «Рост»: ${JSON.stringify(re)}`);
  await p.evaluate(() => { document.getElementById('pbody').scrollTop = 0; }); await shot('11-after-load');
  // год работы с направлениями: без ошибок
  await runDays(p, 120);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  log('сохранение бота good (~30 точек)…');
  const sv = botSave(8.6, 7919 * 3);
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
