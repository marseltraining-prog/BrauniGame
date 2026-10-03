/* Пролог «Бариста» в браузере: node qa/prologue.js [папка скриншотов]
   Старт с пролога со стартового экрана, сцена П1, пришедшая сама «Смена» (расписание, заказы, допродажа, итог),
   настройки жизни, копилка/вклад, учёба, покупки, несколько месяцев (события и сцены), сохранение и загрузка посреди пролога,
   финал «Своя точка» (П7 → П8 → перенос: бонус к капиталу, навыки, Гуля — первый сотрудник первой точки) и финал
   «Жизнь в найме» (подготовленное состояние, «Попробовать заново», «Сразу своя сеть»), старт «Сразу своя сеть» без пролога.
   Вёрстка — 1440 / 390 / 360, светлая и тёмная тема. Итог — список проблем и ошибок консоли; код выхода 1, если они есть. */
const path = require('path');
const fs = require('fs');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'prologue'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const RUNS = [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]];

async function shot(p, name) { await p.screenshot({ path: path.join(OUT, name + '.png') }); }
async function check(p, label, root, mobile) { for (const x of await layoutCheck(p, label, { root, mobile })) issues.push(x); }
const st = (p) => p.evaluate(() => { const P = BK.App.state && BK.App.state.prologue; return P ? { status: P.status, m: P.m, cards: P.cards.length, card: P.cards[0] && P.cards[0].id, mode: BK.PrologueUI.ui.mode, open: BK.PrologueUI.active(), shifts: P.stats.shifts } : null; });
// «Смена» приходит сама по расписанию (BK.Prologue.dueShift) — в тесте её нельзя пропустить: играем до конца,
// а там, где смена только мешает (подготовленные состояния), сразу заканчиваем и закрываем
async function playShift(p, fast) {
  const s = await st(p); if (!s || s.mode !== 'shift') return false;
  for (let i = 0; i < 8; i++) {
    if (await p.$('#proSh [data-pa=shiftGo]')) { await p.click('#proSh [data-pa=shiftGo]'); await p.waitForTimeout(90); }
    if (fast && await p.$('#proSh [data-pa=shiftEnd]')) { await p.click('#proSh [data-pa=shiftEnd]'); await p.waitForTimeout(90); }
    if (await p.$('#proSh [data-pa=shiftDone]')) { await p.click('#proSh [data-pa=shiftDone]'); await p.waitForTimeout(180); }
    const t = await st(p); if (!t || t.mode !== 'shift') return true;
  }
  return true;
}

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
    if (await playShift(p, true)) continue;   // пришедшая смена держит время: играем её и идём дальше
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
      // --- «Смена» приходит сама (владелец: не на выбор, а по расписанию 5–10 раз за пролог) ---
      // кнопка ручного запуска смены убрана: в блоке расписания остаётся только «встать за стойку», если смена уже ждёт
      const stray = await p.evaluate(() => [...document.querySelectorAll('#prologue [data-pa=shift]')].filter((b) => !b.closest('.pro-shift')).length);
      if (stray) issues.push(`[${tag}] в прологе осталась кнопка ручного запуска смены`);
      await p.waitForSelector('#proSh .sh-intro', { timeout: 3000 }).catch(() => issues.push(`[${tag}] после П1 не открылась первая «Смена»`));
      const sh0 = await p.evaluate(() => ({ auto: BK.PrologueUI.ui.sh.auto, cancel: !!document.querySelector('#proSh [data-pa=shiftCancel]'), plan: BK.Prologue.shiftAt(), items: BK.Prologue.shiftPlan(BK.App.state.prologue).items.length }));
      if (!sh0.auto) issues.push(`[${tag}] первая смена не «пришла сама»`);
      if (sh0.cancel) issues.push(`[${tag}] пришедшую смену можно пропустить кнопкой «Не сейчас»`);
      if (!(sh0.plan.length >= 5 && sh0.plan.length <= 10)) issues.push(`[${tag}] смен в расписании ${sh0.plan.length} (нужно 5–10): ${sh0.plan}`);
      if (sh0.items !== 9) issues.push(`[${tag}] на полке ${sh0.items} позиций, ожидалось 9 (три ряда по три)`);
      await check(p, tag + ' смена: вступление', '#proSh .sh-in', mobile);
      await p.click('[data-pa=shiftGo]');
      await p.waitForSelector('#proSh .sh-g.front', { timeout: 3000 });
      // полка три на три и подсказки клавиш: на ПК видны, на телефоне — нет
      const shelf = await p.evaluate(() => {
        const kb = document.querySelector('#prologue').classList.contains('pro-kb');
        const shelfKeys = [...document.querySelectorAll('#proSh .sh-it kbd')];
        const hints = [...document.querySelectorAll('#proSh [data-kb]')].filter((e) => getComputedStyle(e).display !== 'none').length;
        return { kb, cols: getComputedStyle(document.querySelector('.sh-items')).gridTemplateColumns.split(' ').length, shown: shelfKeys.filter((k) => getComputedStyle(k).display !== 'none').length, all: shelfKeys.length, hints, labels: shelfKeys.map((k) => k.textContent.trim()).join(','), up: (document.querySelector('[data-pa=shiftUp]') || {}).textContent || '' };
      });
      if (shelf.cols !== 3) issues.push(`[${tag}] полка не в три колонки (${shelf.cols})`);
      if (shelf.labels !== '1,2,3,Q,W,E,A,S,D') issues.push(`[${tag}] клавиши полки: ${shelf.labels}`);
      if (mobile && (shelf.kb || shelf.hints)) issues.push(`[${tag}] на телефоне видны подсказки клавиш: режим клавиатуры ${shelf.kb}, подсказок ${shelf.hints}`);
      if (!mobile && (!shelf.kb || shelf.shown !== 9)) issues.push(`[${tag}] на ПК не видны клавиши полки: режим ${shelf.kb}, видно ${shelf.shown} из ${shelf.all}`);
      if (!mobile && !/Пробел/.test(shelf.up)) issues.push(`[${tag}] у допродажи нет подписи клавиши: «${shelf.up}»`);
      // клавиши полки берут продукт так же, как клик; допродажа — Пробел; Enter — отдать заказ
      if (!mobile) {
        const KEYS = ['Digit1', 'Digit2', 'Digit3', 'KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD'];
        const ids = await p.evaluate(() => BK.Prologue.shiftPlan(BK.App.state.prologue).items.map((x) => x.id));
        const ord = await p.evaluate(() => { const sh = BK.PrologueUI.ui.sh; return sh && sh.guests[0] ? sh.guests[0].order.slice() : []; });
        for (const id of ord) { await p.keyboard.press(KEYS[ids.indexOf(id)]); await p.waitForTimeout(40); }
        const tr = await p.evaluate(() => BK.PrologueUI.ui.sh.tray.slice());
        if (tr.join() !== ord.join()) issues.push(`[${tag}] клавиши полки не собрали заказ: ${tr.join()} вместо ${ord.join()}`);
        await p.keyboard.press('Space');
        if (!(await p.evaluate(() => !!(BK.PrologueUI.ui.sh.guests[0] && BK.PrologueUI.ui.sh.guests[0].asked)))) issues.push(`[${tag}] Пробел не сделал допродажу`);
        await p.keyboard.press('Enter');
        await p.waitForTimeout(150);
      }
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
      const done1 = await st(p);
      if (done1.shifts !== 1) issues.push(`[${tag}] счётчик смен после первой: ${done1.shifts}`);
      if (done1.mode === 'shift') issues.push(`[${tag}] смена пришла второй раз в том же месяце`);
      if (!(await p.$('#proShiftAnchor'))) issues.push(`[${tag}] нет блока расписания смен`);
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
        // --- несколько месяцев: события и сцены с героями, итог месяца, пришедшие сами смены ---
        let seen = new Set();
        for (let k = 0; k < 6; k++) {
          await p.evaluate(() => { BK.PrologueUI.ui.speed = 3; const P = BK.App.state.prologue; P.t = Math.max(P.t, 0.97); });
          for (let w = 0; w < 30; w++) {
            if (await playShift(p, true)) { w = -1; continue; }   // смена по расписанию: играем её и ждём месяц дальше
            const s = await st(p); if (s.cards || s.m > k) break; await p.waitForTimeout(100);
          }
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
        const shifts6 = (await st(p)).shifts;
        if (shifts6 < 2) issues.push(`[${tag}] за несколько месяцев пришла всего ${shifts6} смена(ы) — расписание не работает`);
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
      // Первое помещение: цех и точка выбираются по цене (а не «первыми в списке»), при нехватке берём кредит —
      // как советует обучение новичка и как делает qa/rewind.js. Если банк больше не даёт (лимит 6 млн), тест
      // добирает деньги на счёте, как qa/play.js: иначе шаг зависел от случая — самый дорогой цех в списке мог
      // съесть почти весь стартовый капитал, и «Гуля не пришла» падало не по делу.
      const g = await p.evaluate(() => {
        const E = BK.Engine, S = BK.App.state, cheap = (arr, f) => arr.slice().sort((a, b) => f(S, a).total - f(S, b).total)[0];
        if (S.prodOffers.length) E.chooseProduction(S, cheap(S.prodOffers, E.prodOpenCost).id);
        const o = cheap(S.offers, E.storeOpenCost), need = E.storeOpenCost(S, o).total;
        if (S.cash < need) { E.takeLoan(S, need - S.cash + 1e6); if (S.cash < need) S.cash += need - S.cash + 1e6; }
        const r = E.rentStore(S, o.id); BK.App.refresh();
        return r.ok ? r.store.incoming[0].p : null;
      });
      if (!g || g.name !== 'Гульнара Сафина' || g.lvl < 2) issues.push(`[${tag}] Гуля не пришла первым сотрудником: ${JSON.stringify(g)}`);
      await p.waitForTimeout(300);
      if (full) await shot(p, `${tag}-10-main-game`);
      // --- финал «Жизнь в найме»: новая игра с прологом, подготовленное состояние ---
      await p.evaluate(() => BK.App.toStart());
      await p.waitForSelector('#startForm');
      await startPrologue(p);
      await resolveCards(p);
      await playShift(p, true);   // первая смена приходит сразу после П1 — для этого финала она не нужна
      // расписание уже прошло: подготовленному финалу «жизнь в найме» смены больше не мешают
      await p.evaluate(() => { const P = BK.App.state.prologue, c = BK.CFG.PROLOGUE; P.m = c.LIFE_MONTHS - 1; P.stats.shifts = BK.Prologue.shiftAt().length; P.job = 1; P.cash = 12000; P.box = 0; P.spent = { home: 2600000, food: 3100000, fun: 1500000, sneakers: 180000, trip: 560000, car: 816000, phone2: 290000, debt: 40000 }; P.earned = { salary: 9800000, tips: 900000 }; });
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
      await resolveCards(p);
      await playShift(p, true);   // смена после П1 приходит сама: играем её, иначе она перекроет меню
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
