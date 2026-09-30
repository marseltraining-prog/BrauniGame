/* Пролог «Бариста» в браузере: node qa/prologue.js [папка скриншотов]
   Старт с пролога со стартового экрана, сцена П1, первая «Смена» (заказы, допродажа, итог), настройки жизни, копилка/вклад,
   учёба, покупки, несколько месяцев (события и сцены), сохранение и загрузка посреди пролога, финал «Своя точка» (П7 → П8 →
   перенос: бонус к капиталу, навыки, Гуля — первый сотрудник первой точки) и финал «Жизнь в найме» (подготовленное состояние,
   «Попробовать заново», «Сразу своя сеть»), старт «Сразу своя сеть» без пролога. Вёрстка — 1440 / 390 / 360, светлая и тёмная тема.
   Итог — список проблем и ошибок консоли; код выхода 1, если они есть. */
const path = require('path');
const fs = require('fs');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'prologue'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const RUNS = [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]];

async function shot(p, name) { await p.screenshot({ path: path.join(OUT, name + '.png') }); }
async function check(p, label, root, mobile) { for (const x of await layoutCheck(p, label, { root, mobile })) issues.push(x); }
const st = (p) => p.evaluate(() => { const P = BK.App.state && BK.App.state.prologue; return P ? { status: P.status, m: P.m, cards: P.cards.length, card: P.cards[0] && P.cards[0].id, mode: BK.PrologueUI.ui.mode, open: BK.PrologueUI.active() } : null; });

async function startPrologue(p) {
  await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => BK.PrologueUI && BK.PrologueUI.active() && document.querySelector('#prologue .pro-card'), null, { timeout: 5000 });
}
// решить все открытые карточки: первый доступный вариант
async function resolveCards(p, prefer) {
  for (let k = 0; k < 12; k++) {
    const s = await st(p); if (!s || !s.cards || s.status !== 'run') return;
    if (s.mode === 'shift') return;
    const sel = await p.evaluate((pref) => { const bs = [...document.querySelectorAll('#proOv .pro-card [data-pa=choose]:not([disabled])')]; if (!bs.length) return null; const b = bs[Math.min(pref || 0, bs.length - 1)]; return b.dataset.v; }, prefer);
    if (sel == null) { await p.waitForTimeout(150); continue; }
    await p.click(`#proOv .pro-card [data-pa=choose][data-v="${sel}"]`);
    await p.waitForTimeout(120);
  }
}
// идти, решая карточки по одной (первый доступный вариант), пока не выполнится условие или не появится карточка stop
async function until(p, pred, stop) {
  for (let g = 0; g < 60; g++) {
    const s = await st(p);
    if (await p.evaluate(pred)) return true;
    if (s && s.card && s.card === stop) return true;
    if (s && s.cards && s.status === 'run' && s.mode === 'card') {
      const v = await p.evaluate(() => { const b = document.querySelector('#proOv .pro-card [data-pa=choose]:not([disabled])'); return b ? b.dataset.v : null; });
      if (v != null) { await p.click(`#proOv .pro-card [data-pa=choose][data-v="${v}"]`); await p.waitForTimeout(100); continue; }
    }
    await p.evaluate(() => { const P = BK.App.state.prologue; if (P && P.status === 'run' && !P.cards.length) { BK.PrologueUI.ui.speed = 3; P.t = Math.max(P.t, 0.98); } });
    await p.waitForTimeout(150);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  for (const [vp, dark] of RUNS) {
    const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp.startsWith('m'), full = vp === 'd1440' && !dark || vp === 'm390' && dark;
    const p = await openPage(browser, vp, { dark });
    try {
      // --- стартовый экран: выбор «Как начать» ---
      await p.waitForSelector('#startForm .pro-pick');
      await check(p, tag + ' старт', null, mobile);
      if (full || vp === 'm360') await shot(p, `${tag}-01-start`);
      await startPrologue(p);
      const s0 = await st(p);
      if (!s0 || s0.status !== 'run' || s0.card !== 'p01') issues.push(`[${tag}] пролог не начался со сцены П1: ${JSON.stringify(s0)}`);
      await check(p, tag + ' сцена П1', '#proOv .pro-card', mobile);
      await shot(p, `${tag}-02-scene-p01`);
      await resolveCards(p, 0);
      // --- первая «Смена» ---
      await p.waitForSelector('#proSh .sh-intro', { timeout: 3000 }).catch(() => issues.push(`[${tag}] после П1 не открылась первая «Смена»`));
      await check(p, tag + ' смена: вступление', '#proSh .sh-in', mobile);
      await p.click('[data-pa=shiftGo]');
      await p.waitForSelector('#proSh .sh-g.front', { timeout: 3000 });
      // обслужить правильно 3 гостей и сделать ошибку, попробовать допродажу
      for (let i = 0; i < 4; i++) {
        await p.waitForSelector('#proSh .sh-g.front', { timeout: 6000 }).catch(() => {});
        if (i === 1) { const up = await p.$('[data-pa=shiftUp]'); if (up) { await up.click(); await p.waitForTimeout(150); } }
        const order = await p.evaluate(() => { const sh = BK.PrologueUI.ui.sh; return sh && sh.guests[0] ? sh.guests[0].order.slice() : []; });
        if (!order.length) { await p.waitForTimeout(400); continue; }
        const items = i === 3 ? [order[0] === 'esp' ? 'cap' : 'esp'] : order;
        for (const id of items) { await p.click(`#proSh [data-pa=shiftItem][data-v=${id}]`); await p.waitForTimeout(60); }
        if (i === 0) { await check(p, tag + ' смена: игра', '#proSh .sh-in', mobile); await shot(p, `${tag}-03-shift`); }
        await p.click('#proSh [data-pa=shiftServe]');
        await p.waitForTimeout(150);
      }
      const shs = await p.evaluate(() => { const sh = BK.PrologueUI.ui.sh; return { served: sh.served, errors: sh.errors, up: sh.upsells }; });
      if (shs.served < 2 || shs.errors < 1) issues.push(`[${tag}] смена: обслужено ${shs.served}, ошибок ${shs.errors} (ожидалось ≥2 и ≥1)`);
      await p.click('[data-pa=shiftEnd]');
      await p.waitForSelector('#proSh .sh-res');
      await check(p, tag + ' смена: итог', '#proSh .sh-in', mobile);
      await shot(p, `${tag}-04-shift-result`);
      const tips0 = await p.evaluate(() => BK.App.state.prologue.earned.tips);
      await p.click('[data-pa=shiftDone]');
      await p.waitForTimeout(300);
      if (!(tips0 > 0)) issues.push(`[${tag}] «Смена» не дала чаевых`);
      if ((await st(p)).mode) issues.push(`[${tag}] после «Смены» слой не закрылся`);
      // --- главный экран и решения ---
      await p.evaluate(() => { BK.PrologueUI.ui.speed = 0; });
      await check(p, tag + ' главный экран', '#prologue', mobile);
      await shot(p, `${tag}-05-main`);
      if (full) {
        await p.click('[data-pa=home][data-v=room]'); await p.click('[data-pa=food][data-v=eco]'); await p.click('[data-pa=fun][data-v=none]');
        await p.click('[data-pa=extra][data-v="1"]'); await p.click('[data-pa=save][data-v="3"]');
        const cfg = await p.evaluate(() => { const P = BK.App.state.prologue; return [P.home, P.food, P.fun, P.extra, P.saveRate].join(); });
        if (cfg !== 'room,eco,none,1,3') issues.push(`[${tag}] настройки жизни не применились: ${cfg}`);
        await p.evaluate(() => { BK.App.state.prologue.cash = 120000; BK.PrologueUI.render(true); });
        await p.click('[data-pa=toBox]'); await p.waitForTimeout(100);
        await p.click('[data-pa=toDep]'); await p.waitForTimeout(100);
        const money = await p.evaluate(() => { const P = BK.App.state.prologue; return { cash: P.cash, box: P.box, dep: P.dep }; });
        if (!(money.dep > 0) || money.box !== 0) issues.push(`[${tag}] копилка/вклад: ${JSON.stringify(money)}`);
        await p.click('[data-pa=want][data-v=clothes]'); await p.waitForTimeout(100);
        if (!(await p.evaluate(() => (BK.App.state.prologue.spent.clothes || 0) > 0))) issues.push(`[${tag}] покупка «Одежда» не прошла`);
        await p.click('[data-pa=study][data-v=coffee]'); await p.waitForTimeout(100);
        if (!(await p.evaluate(() => BK.App.state.prologue.study && BK.App.state.prologue.study.id === 'coffee'))) issues.push(`[${tag}] запись на курс не прошла`);
        await p.click('[data-pa=fromDep]'); await p.waitForTimeout(100);
        await check(p, tag + ' главный экран после решений', '#prologue', mobile);
        await shot(p, `${tag}-06-main-decisions`);
        // --- несколько месяцев: события и сцены с героями, итог месяца ---
        let seen = new Set();
        for (let k = 0; k < 6; k++) {
          await p.evaluate(() => { BK.PrologueUI.ui.speed = 3; const P = BK.App.state.prologue; P.t = Math.max(P.t, 0.97); });
          for (let w = 0; w < 30; w++) { const s = await st(p); if (s.cards || s.m > k) break; await p.waitForTimeout(100); }
          const s = await st(p);
          if (s.cards && s.card) {
            if (!seen.has(s.card) && seen.size < 3) { await check(p, `${tag} карточка ${s.card}`, '#proOv .pro-card', mobile); await shot(p, `${tag}-07-card-${s.card}`); }
            seen.add(s.card);
            await resolveCards(p, 1);
          }
        }
        await p.evaluate(() => { BK.PrologueUI.ui.speed = 0; });
        if (seen.size < 2) issues.push(`[${tag}] за 6 месяцев почти не было событий: ${[...seen].join(',')}`);
        const sl = await p.evaluate(() => BK.App.state.prologue.hist.length);
        if (sl < 3) issues.push(`[${tag}] месяцы не идут: история ${sl}`);
        // --- сохранение и загрузка посреди пролога ---
        // месяц отводим от границы: после загрузки время сразу идёт на ×1, и месяц на 97–99 % успевал перевалить до проверки (гонка теста)
        const before = await p.evaluate(() => { const P = BK.App.state.prologue; P.t = Math.min(P.t, 0.5); BK.App.save(); return P.m; });
        await p.reload();
        await p.waitForSelector('#slots [data-act=continue]');
        const slotTxt = await p.textContent('#slots .slot');
        if (!/пролог/.test(slotTxt)) issues.push(`[${tag}] слот не показывает, что игра в прологе: ${slotTxt.slice(0, 80)}`);
        await p.click('#slots [data-act=continue]');
        await p.waitForFunction(() => BK.PrologueUI.active(), null, { timeout: 4000 }).catch(() => issues.push(`[${tag}] после загрузки пролог не открылся`));
        const after = await p.evaluate(() => BK.App.state.prologue.m);
        if (after !== before) issues.push(`[${tag}] после загрузки месяц ${after}, а был ${before}`);
        await resolveCards(p);
        // меню: помощь
        await p.click('[data-pa=menu]'); await p.waitForSelector('#proMenu .pro-menu');
        await check(p, tag + ' меню', '#proMenu .pro-card', mobile);
        await p.click('#proMenu [data-pa=menuClose].btn');
      }
      // --- финал «Своя точка» (подготовленное состояние) → П7 → П8 → перенос в основную игру ---
      await p.evaluate(() => { const P = BK.App.state.prologue; P.job = 2; P.stazh = 30; P.rep = 85; P.cash = 1400000; P.box = 300000; P.rel.rashid = 45; P.rel.gulya = 30; P.sk.sales = 70; P.sk.people = 60; P.sk.coffee = 80; P.flags.goalShown = 0; BK.PrologueUI.render(true); });
      if (!(await until(p, () => false, 'goal'))) issues.push(`[${tag}] карточка «Можно открывать своё» не пришла`);
      await p.waitForSelector('#proOv .pro-card');
      await p.click('#proOv [data-pa=choose][data-v="0"]'); // открыть свою точку
      await p.waitForFunction(() => BK.App.state.prologue.cards[0] && BK.App.state.prologue.cards[0].id === 'p07', null, { timeout: 3000 });
      await check(p, tag + ' сцена П7', '#proOv .pro-card', mobile);
      if (full) await shot(p, `${tag}-08-scene-p07`);
      await p.click('#proOv [data-pa=choose][data-v="0"]'); // «И то и другое» → друг
      await p.waitForFunction(() => BK.App.state.prologue.cards[0] && BK.App.state.prologue.cards[0].id === 'p08', null, { timeout: 3000 });
      await p.click('#proOv [data-pa=choose][data-v="0"]'); // Гуля — с вами
      await p.waitForSelector('#proOv .pro-final.won', { timeout: 4000 });
      await p.waitForTimeout(700);
      await check(p, tag + ' финал «Своя точка»', '#proOv .pro-card', mobile);
      await shot(p, `${tag}-09-final-won`);
      const cash0 = await p.evaluate(() => BK.App.state.cash);
      await p.click('[data-pa=finalMain]');
      await p.waitForTimeout(400);
      const main = await p.evaluate(() => { const S = BK.App.state; return { open: BK.PrologueUI.active(), status: S.prologue.status, cash: S.cash, skills: S.player && S.player.skills, story: S.story && S.story.f.mentor, gulya: S.story && S.story.f.gulya, phase: S.phase }; });
      if (main.open || main.status !== 'done') issues.push(`[${tag}] после финала не началась основная игра: ${JSON.stringify(main)}`);
      if (!(main.cash > cash0)) issues.push(`[${tag}] бонус к капиталу не пришёл (${cash0} → ${main.cash})`);
      if (main.cash > cash0 * 1.1501) issues.push(`[${tag}] бонус больше 15 %: ${cash0} → ${main.cash}`);
      if (!main.skills || !Object.keys(main.skills).length) issues.push(`[${tag}] навыки не перенесены: ${JSON.stringify(main.skills)}`);
      if (main.story !== 'friend' || main.gulya !== 'with') issues.push(`[${tag}] S.story не записан: ${main.story}/${main.gulya}`);
      const g = await p.evaluate(() => { const E = BK.Engine, S = BK.App.state; const pr = S.prodOffers[0]; E.chooseProduction(S, pr.id); const o = S.offers.slice().sort((a, b) => E.storeOpenCost(S, a).total - E.storeOpenCost(S, b).total)[0]; const r = E.rentStore(S, o.id); BK.App.refresh(); return r.ok ? r.store.incoming[0].p : null; });
      if (!g || g.name !== 'Гульнара Сафина' || g.lvl < 2) issues.push(`[${tag}] Гуля не пришла первым сотрудником: ${JSON.stringify(g)}`);
      await p.waitForTimeout(300);
      if (full) await shot(p, `${tag}-10-main-game`);
      // --- финал «Жизнь в найме»: новая игра с прологом, подготовленное состояние ---
      await p.evaluate(() => BK.App.toStart());
      await p.waitForSelector('#startForm');
      await startPrologue(p);
      await resolveCards(p);
      await p.waitForSelector('#proSh .sh-intro', { timeout: 3000 }).catch(() => {});
      await p.click('[data-pa=shiftCancel]').catch(() => {});
      await p.evaluate(() => { const P = BK.App.state.prologue, c = BK.CFG.PROLOGUE; P.m = c.LIFE_MONTHS - 1; P.job = 1; P.cash = 12000; P.box = 0; P.spent = { home: 2600000, food: 3100000, fun: 1500000, sneakers: 180000, trip: 560000, car: 816000, phone2: 290000, debt: 40000 }; P.earned = { salary: 9800000, tips: 900000 }; });
      await until(p, () => BK.App.state.prologue.status === 'life');
      await p.waitForSelector('#proOv .pro-final.life', { timeout: 5000 }).catch(() => issues.push(`[${tag}] финал «Жизнь в найме» не открылся`));
      await p.waitForTimeout(700);
      await check(p, tag + ' финал «Жизнь в найме»', '#proOv .pro-card', mobile);
      await shot(p, `${tag}-11-final-life`);
      await p.click('[data-pa=retry]');
      await p.waitForTimeout(300);
      const re = await st(p);
      if (!re || re.status !== 'run' || re.m !== 0) issues.push(`[${tag}] «Попробовать заново» не начал пролог: ${JSON.stringify(re)}`);
      // «Пропустить пролог» из меню → основная игра без бонусов
      await p.waitForSelector('#proSh .sh-intro', { timeout: 3000 }).catch(() => {});
      await p.click('[data-pa=shiftCancel]').catch(() => {});
      await p.evaluate(() => { BK.PrologueUI.ui.speed = 0; });
      await resolveCards(p);
      const cashS = await p.evaluate(() => BK.App.state.cash);
      await p.click('[data-pa=menu]'); await p.click('[data-pa=skipAsk]'); await p.click('[data-pa=skipYes]');
      await p.waitForTimeout(300);
      const sk = await p.evaluate(() => ({ open: BK.PrologueUI.active(), status: BK.App.state.prologue.status, cash: BK.App.state.cash, phase: BK.App.state.phase }));
      if (sk.open || sk.status !== 'skipped' || sk.cash !== cashS || sk.phase !== 'setup_prod') issues.push(`[${tag}] пропуск пролога: ${JSON.stringify(sk)}`);
      // «Сразу своя сеть» со стартового экрана — как раньше, без пролога
      await p.evaluate(() => BK.App.toStart());
      await p.waitForSelector('#startForm');
      await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=net]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
      const btnTxt = await p.textContent('#startForm button[type=submit]');
      if (btnTxt.trim() !== 'Новая игра') issues.push(`[${tag}] кнопка старта «${btnTxt}» вместо «Новая игра»`);
      await p.click('#startForm button[type=submit]');
      await p.waitForTimeout(300);
      const net = await p.evaluate(() => ({ pro: BK.App.state.prologue || null, open: BK.PrologueUI.active(), cash: BK.App.state.cash }));
      if (net.pro || net.open) issues.push(`[${tag}] «Сразу своя сеть» запустила пролог`);
    } catch (e) {
      issues.push(`[${tag}] СБОЙ СЦЕНАРИЯ: ${e.message.split('\n')[0]}`);
      await shot(p, `${tag}-FAIL`).catch(() => {});
    }
    for (const e of p.errs) issues.push(`[${tag}] ${e}`);
    await p.context().close();
    console.log(`${tag}: готово`);
  }
  await browser.close();
  const uniq = [...new Set(issues)];
  fs.writeFileSync(path.join(OUT, 'issues.txt'), uniq.join('\n') + '\n');
  console.log(uniq.length ? uniq.join('\n') : 'Проблем не найдено');
  console.log(`${uniq.length} проблем, ${uniq.filter((x) => /CONSOLE|PAGEERR/.test(x)).length} ошибок консоли. Скриншоты: ${OUT}`);
  process.exit(uniq.length ? 1 : 0);
})();
