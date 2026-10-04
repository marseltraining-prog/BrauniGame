/* Стадия 1 «Своя кофейня» в браузере: node qa/stage1.js [папка скриншотов]
   Пролог со стартового экрана → подготовленное состояние «накопил» → финал «Своя точка» → «Открыть свою кофейню» → выбор места →
   сцена 1.1 → главный экран (вкладки «Точка / Меню / Команда / Деньги»: часы, «Сколько печь», цена, найм Гули) → месяцы
   (итог месяца, вехи с окном и конфетти, сцены и события) → сохранение и загрузка посреди стадии → «Вторая вывеска» (сцена 1.8) →
   стадия 2: кофейня — точка №1, «деньги + точка» ≈ старт основной игры, выбор цеха → игра идёт. Мягкий финал (кофейня закрылась,
   «Открыть кофейню заново»). Вёрстка — 1440 / 390 / 360, светлая и тёмная тема. Итог — проблемы и ошибки консоли; код 1, если есть. */
const path = require('path');
const fs = require('fs');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'stage1'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [];
const RUNS = [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]];

async function shot(p, name) { await p.screenshot({ path: path.join(OUT, name + '.png') }); }
// Стадия 1 проверяется на «обычной Уфе»: истории (BK.Scenario) — это отдельные правила с первого дня, и,
// например, «Спаси сеть» выдаёт готовую сеть из 6 точек, свой сюжет и свой финал. Тогда партия идёт не по
// сценарию главы: кофейня тонет вместе с чужой сетью, открывается карточка «Кофейня закрылась» — и дальше
// тест жмёт кнопки под её подложкой (.s1-ovbg, position: fixed на весь экран) и получает вечный таймаут.
// Обучение новичка в общих сценариях так же выключается (qa/lib.js). Отмечаем истории пройденными: тогда
// стартовая форма с «scen: random» не выбирает ни одной (BK.Scenario.pick → null → обычная Уфа). В браузере
// выбора истории на форме нет, так что это единственный способ задать обычную партию — и он же штатный
// (кнопка «Сбросить пройденные» на стартовом экране чистит ровно этот ключ).
async function noStories(p) {
  await p.evaluate(() => { try { localStorage.setItem('bk-ufa-scen-done', JSON.stringify(Object.keys((window.BK && BK.SCEN && BK.SCEN.list) || {}))); } catch (e) {} });
}
async function check(p, label, root, mobile) { for (const x of await layoutCheck(p, label, { root, mobile })) issues.push(x); }
// пиксельная сцена кофейни: canvas с целым множителем и непустой картинкой (как в qa/pixel.js)
async function canvases(p, label, sel) {
  const r = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((c) => c.offsetParent).map((c) => {
    const w = c.getBoundingClientRect().width, k = w / c.width, ctx = c.getContext('2d');
    let colors = new Set();
    try { const d = ctx.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 7) if (d[i + 3]) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); } catch (e) {}
    return { cls: c.className, w: c.width, h: c.height, k: +k.toFixed(3), colors: colors.size };
  }), sel);
  if (!r.length) issues.push(`[${label}] нет пиксельной сцены (${sel})`);
  for (const c of r) {
    if (Math.abs(c.k - Math.round(c.k)) > 0.01) issues.push(`[${label}] ${c.cls}: множитель не целый (${c.k})`);
    if (c.colors < 12) issues.push(`[${label}] ${c.cls}: сцена почти пустая (${c.colors} цветов)`);
    if (c.h < 40) issues.push(`[${label}] ${c.cls}: сцена подозрительно низкая (${c.h})`);
  }
  return r;
}
const ovTxt = (p) => p.textContent('#s1ShopOv');
const st = (p) => p.evaluate(() => { const T = BK.App.state && BK.App.state.stage1; return T ? { status: T.status, cards: T.cards.length, card: T.cards[0] && T.cards[0].id, mode: BK.Stage1UI.ui.mode, open: BK.Stage1UI.active(), day: BK.App.state.day } : null; });
// дни «как цикл интерфейса», но быстро: E.tick + снимок «Переиграть» + перерисовка; останавливаемся на карточке
async function days(p, n) {
  return p.evaluate((n) => {
    const S = BK.App.state, T = S.stage1; let k = 0;
    BK.Stage1UI.ui.speed = 0;
    for (; k < n; k++) { if (T.cards.length || T.status !== 'run' && T.status !== 'ready') break; BK.Engine.tick(S); if (BK.Rewind) BK.Rewind.record(S); S.notify = []; }
    BK.Stage1UI.render(true);
    return k;
  }, n);
}
async function waitCard(p) { await p.waitForSelector('#s1Ov .s1-card', { timeout: 4000 }); await p.waitForTimeout(350); }
async function chooseFirst(p) { const v = await p.evaluate(() => { const b = document.querySelector('#s1Ov .s1-card [data-s1=choose]:not([disabled])'); return b ? b.dataset.v : null; }); if (v != null) { await p.click(`#s1Ov .s1-card [data-s1=choose][data-v="${v}"]`); await p.waitForTimeout(200); } return v; }
async function closeMs(p) { for (let i = 0; i < 6; i++) { const b = await p.$('#s1Ov .s1-msc [data-s1=msClose].btn'); if (!b) return; await b.click(); await p.waitForTimeout(250); } }
// Окно вехи («звёздочка», конфетти) открывает цикл слоя очередью fx — оно может появиться в любой момент,
// в том числе сразу после закрытия карточки. Поэтому ловим его по появлению, а не «через ровно 15 дней».
async function msWin(p, tag, mobile, full, n) {
  const el = await p.$('#s1Ov .s1-msc'); if (!el) return 0;
  await check(p, `${tag} веха`, '#s1Ov .s1-card', mobile);
  if (n === 1) await shot(p, `${tag}-07-milestone`);
  await closeMs(p);
  return 1;
}

async function toStage1(p, tag, mobile, full) {
  await p.waitForSelector('#startForm .pro-pick');
  await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('companyName').value = 'Тёплый угол'; });
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => BK.PrologueUI && BK.PrologueUI.active(), null, { timeout: 5000 });
  // подготовленное состояние: пролог пройден (накоплено 1,55 млн, Рашид — друг, Гуля — с вами)
  await p.evaluate(() => {
    const S = BK.App.state, P = S.prologue;
    Object.assign(P, { status: 'won', m: 22, cash: 50000, box: 0, dep: 1500000, depInt: 0, hp: 78, job: 2, stazh: 22, rep: 80, cards: [] });
    P.sk = { sales: 62, coffee: 70, people: 55 }; P.sf.mentor = 'friend'; P.sf.gulya = 'with'; P.rel.gulya = 30; P.rel.semyon = 12; P.rel.rashid = 35;
    P.won = { m: 22, credit: false, sav: 1550000, mentor: 'friend', gulya: 'with' };
    BK.Prologue.syncStory(S);
    const sh = document.getElementById('proSh'); if (sh) sh.remove(); BK.PrologueUI.ui.sh = null; BK.PrologueUI.ui.mode = null;
  });
  await p.waitForSelector('#proOv .pro-final.won', { timeout: 5000 });
  await p.waitForTimeout(500);
  if (full) await shot(p, `${tag}-00-prologue-final`);
  if (!(await p.$('[data-pa=finalShop]'))) issues.push(`[${tag}] в финале пролога нет кнопки «Открыть свою кофейню»`);
  await p.click('[data-pa=finalShop]');
  await p.waitForFunction(() => BK.Stage1UI.active() && document.querySelector('.s1-spot'), null, { timeout: 4000 });
  await p.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch();
  for (const [vp, dark] of RUNS) {
    const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp.startsWith('m'), full = (vp === 'd1440' && !dark) || (vp === 'm390' && dark);
    const p = await openPage(browser, vp, { dark, seed: 7919 });
    await noStories(p);   // партия — «обычная Уфа», без случайной истории (см. noStories)
    try {
      await toStage1(p, tag, mobile, full);
      const s0 = await p.evaluate(() => { const S = BK.App.state; return { cash: S.cash, spots: S.stage1.spots.length, pro: S.prologue.status, phase: S.phase }; });
      if (s0.spots !== 3 || s0.pro !== 'done' || Math.abs(s0.cash - 1550000) > 1000) issues.push(`[${tag}] стадия 1 началась не так: ${JSON.stringify(s0)}`);
      await check(p, tag + ' выбор места', '#stage1', mobile);
      await shot(p, `${tag}-01-pick`);
      // --- выбор места ---
      await p.click('.s1-spot [data-s1=pick]:not([disabled])');
      // сцена кофейни — пиксельная (BK.Px.stage): canvas с целым множителем, «Открытие через N дн.» — текстом поверх сцены
      await p.waitForSelector('#s1Shop canvas.pxs', { timeout: 3000 });
      await p.waitForTimeout(250);
      const ov0 = await ovTxt(p);
      if (!/Открытие через \d+ дн\./.test(ov0)) issues.push(`[${tag}] до открытия на сцене нет «Открытие через N дн.»: ${JSON.stringify(ov0)}`);
      await canvases(p, tag + ' сцена до открытия', '#s1Shop canvas.pxs');
      const s1 = await st(p);
      if (!s1 || s1.status !== 'run') issues.push(`[${tag}] после выбора места стадия не пошла: ${JSON.stringify(s1)}`);
      await days(p, 12);
      await waitCard(p);
      const c1 = await st(p);
      if (c1.card !== 's11') issues.push(`[${tag}] при открытии не пришла сцена 1.1 «Ключи»: ${c1.card}`);
      await check(p, tag + ' сцена 1.1', '#s1Ov .s1-card', mobile);
      await shot(p, `${tag}-02-scene-s11`);
      await chooseFirst(p);
      let ms = await msWin(p, tag, mobile, full, 1);   // веха «Открыться» — звёздочка и конфетти
      await closeMs(p);
      // --- главный экран и вкладки ---
      await days(p, 3);
      await closeMs(p);
      await check(p, tag + ' главный экран', '#stage1', mobile);
      // сцена кофейни — в начале слоя (прокручивается сам слой #stage1, а не окно): пусть попадёт в кадр
      await p.evaluate(() => { const el = document.getElementById('stage1'); if (el) el.scrollTop = 0; window.scrollTo(0, 0); });
      await p.waitForTimeout(150);
      await shot(p, `${tag}-03-main`);
      // сцена открытой кофейни: непустая и живая (пар, гость, монетка)
      await canvases(p, tag + ' сцена открытой кофейни', '#s1Shop canvas.pxs');
      await p.evaluate(() => { const el = document.getElementById('s1Shop'); if (el) el.scrollIntoView({ block: 'center' }); });
      await p.waitForTimeout(300);
      const same = await p.evaluate(async () => { const c = document.querySelector('#s1Shop canvas.pxs'); const a = c.toDataURL(); await new Promise((r) => setTimeout(r, 600)); return a === c.toDataURL(); });
      if (same) issues.push(`[${tag}] сцена кофейни не анимируется`);
      // сцена реагирует на состояние: ремонт и закрытый день — свои подписи и своя картинка
      const ovState = async (f) => { await p.evaluate(f); await p.evaluate(() => BK.Stage1UI.render(true)); await p.waitForTimeout(200); return [await ovTxt(p), await canvases(p, tag + ' состояние', '#s1Shop canvas.pxs')]; };
      const [ovRep] = await ovState(() => { const S = BK.App.state, st = BK.Stage1.store(S); st.status = 'repair'; });
      if (!/Ремонт/.test(ovRep)) issues.push(`[${tag}] в ремонте на сцене нет подписи «Ремонт»: ${JSON.stringify(ovRep)}`);
      if (full) await shot(p, `${tag}-12-scene-repair`);
      const [ovCl] = await ovState(() => { const S = BK.App.state, st = BK.Stage1.store(S); st.status = 'open'; st.today = Object.assign({}, st.today, { closed: true }); });
      if (!/Закрыто/.test(ovCl)) issues.push(`[${tag}] в закрытый день на сцене нет подписи «Закрыто»: ${JSON.stringify(ovCl)}`);
      const [ovOp] = await ovState(() => { const S = BK.App.state, st = BK.Stage1.store(S); st.today = Object.assign({}, st.today, { closed: false }); });
      if (ovOp) issues.push(`[${tag}] в открытый день поверх сцены лишняя подпись: ${JSON.stringify(ovOp)}`);
      await p.click('[data-s1=tab][data-v=menu]');
      const pr0 = await p.evaluate(() => BK.App.state.menu[0].pm);
      await p.click('.s1-mi [data-s1=price][data-d="0.05"]');
      const pr1 = await p.evaluate(() => BK.App.state.menu[0].pm);
      if (!(pr1 > pr0)) issues.push(`[${tag}] цена не изменилась`);
      await check(p, tag + ' вкладка «Меню»', '#stage1', mobile);
      if (full) await shot(p, `${tag}-04-menu`);
      await p.click('[data-s1=tab][data-v=team]');
      await p.click('[data-s1=gulya]');
      const gi = await p.evaluate(() => BK.Stage1.store(BK.App.state).incoming.some((x) => x.p.name === 'Гульнара Сафина'));
      if (!gi) issues.push(`[${tag}] Гуля не вышла на работу`);
      await p.waitForTimeout(200);
      ms += await msWin(p, tag, mobile, full, ms + 1);   // веха «Первый наём»
      await closeMs(p);
      await check(p, tag + ' вкладка «Команда»', '#stage1', mobile);
      if (full) await shot(p, `${tag}-05-team`);
      await p.click('[data-s1=tab][data-v=money]');
      await check(p, tag + ' вкладка «Деньги»', '#stage1', mobile);
      await p.click('[data-s1=tab][data-v=shop]');
      await p.click('[data-s1=bake][data-v="-1"]');
      if ((await p.evaluate(() => BK.Engine.wasteState(BK.App.state).bake)) !== -1) issues.push(`[${tag}] «Сколько печь» не переключился`);
      // --- месяцы: сцены, события, вехи ---
      const seen = new Set();
      for (let k = 0; k < 40; k++) {
        const s = await st(p);
        if (s.status !== 'run') break;
        if (s.card) {
          if (!seen.has(s.card) && seen.size < 3 && full) { await waitCard(p); await check(p, `${tag} карточка ${s.card}`, '#s1Ov .s1-card', mobile); await shot(p, `${tag}-06-card-${s.card}`); }
          seen.add(s.card);
          await waitCard(p).catch(() => {});
          await chooseFirst(p);
          continue;
        }
        const m = await msWin(p, tag, mobile, full, ms + 1);
        if (m) { ms += m; continue; }
        await days(p, 15);
        await p.evaluate(() => BK.Stage1UI.render(true));
        await p.waitForTimeout(80);
        if ((await p.evaluate(() => BK.App.state.day)) > 170) break;
      }
      const sum = await p.evaluate(() => { const T = BK.App.state.stage1; return { months: T.months.length, ms: Object.keys(T.ms), seen: Object.keys(T.seen) }; });
      if (sum.months < 3) issues.push(`[${tag}] месяцы стадии не идут: ${sum.months}`);
      if (!sum.ms.includes('hire') || !sum.ms.includes('open')) issues.push(`[${tag}] вехи не засчитаны: ${sum.ms}`);
      if (sum.seen.filter((x) => /^s1\d/.test(x)).length < 3) issues.push(`[${tag}] сцен главы мало: ${sum.seen}`);
      if (!ms) issues.push(`[${tag}] окно вехи ни разу не открылось`);
      // --- сохранение и загрузка ---
      const before = await p.evaluate(() => { BK.App.save(); return { day: BK.App.state.day, cash: Math.round(BK.App.state.cash) }; });
      await p.reload();
      await p.waitForSelector('#slots [data-act=continue]');
      const slotTxt = await p.textContent('#slots .slot');
      if (!/кофейня/.test(slotTxt)) issues.push(`[${tag}] слот не показывает кофейню: ${slotTxt.slice(0, 90)}`);
      await p.click('#slots [data-act=continue]');
      await p.waitForFunction(() => BK.Stage1UI.active(), null, { timeout: 4000 }).catch(() => issues.push(`[${tag}] после загрузки кофейня не открылась`));
      const after = await p.evaluate(() => ({ day: BK.App.state.day, cash: Math.round(BK.App.state.cash) }));
      if (after.day !== before.day || after.cash !== before.cash) issues.push(`[${tag}] после загрузки ${JSON.stringify(after)}, а было ${JSON.stringify(before)}`);
      for (let i = 0; i < 4; i++) { if ((await st(p)).card) { await waitCard(p); await chooseFirst(p); } await closeMs(p); }
      // меню слоя
      await p.click('[data-s1=menu]'); await p.waitForSelector('#s1Menu .s1-card');
      await check(p, tag + ' меню', '#s1Menu .s1-card', mobile);
      await p.click('#s1Menu [data-s1=menuClose].btn');
      // --- «Вторая вывеска» → стадия 2 ---
      await p.evaluate(() => { const S = BK.App.state, T = S.stage1; T.status = 'ready'; T.cards = []; BK.Stage1UI.render(true); });
      await p.click('[data-s1=tab][data-v=shop]');
      await p.click('[data-s1=second]');
      await waitCard(p);
      if ((await st(p)).card !== 's18') issues.push(`[${tag}] «Открыть вторую точку» не привела к сцене 1.8`);
      await check(p, tag + ' сцена 1.8', '#s1Ov .s1-card', mobile);
      await shot(p, `${tag}-08-scene-s18`);
      await chooseFirst(p);
      await p.waitForTimeout(500);
      const nx = await p.evaluate(() => { const S = BK.App.state, st = S.stores[0]; return { open: BK.Stage1UI.active(), status: S.stage1.status, phase: S.phase, stores: S.stores.length, cash: S.cash, value: st.capex, hero: st.staff.some((e) => e.hero), loan: S.loan, ch: S.story && S.story.ch, evNext: S.ev.next - S.day, prodOffers: S.prodOffers.length }; });
      const tot = nx.cash + nx.value;
      if (nx.open || nx.status !== 'done' || nx.phase !== 'setup_prod' || nx.stores !== 1 || nx.hero || nx.loan || nx.ch !== 'city') issues.push(`[${tag}] переход в стадию 2: ${JSON.stringify(nx)}`);
      if (tot < 8.5e6 || tot > 11.5e6) issues.push(`[${tag}] «деньги + точка» ${Math.round(tot)} — не в пределах ±15 % от 10 млн`);
      if (!(nx.evNext > 0 && nx.evNext < 100) || !nx.prodOffers) issues.push(`[${tag}] сеть не проснулась: ${JSON.stringify(nx)}`);
      await p.waitForTimeout(300);
      await check(p, tag + ' стадия 2: выбор цеха', null, mobile);
      await shot(p, `${tag}-09-stage2-setup`);
      const g = await p.evaluate(() => { const E = BK.Engine, S = BK.App.state; const r = E.chooseProduction(S, S.prodOffers[0].id); for (let i = 0; i < 20; i++) E.tick(S); BK.App.refresh(); const st = S.stores[0]; return { ok: r.ok, phase: S.phase, checks: st.today && st.today.checks, self: S.stage1.selfBake, day: S.day }; });
      if (!g.ok || g.phase !== 'play' || !(g.checks > 0) || g.self !== false) issues.push(`[${tag}] после выбора цеха: ${JSON.stringify(g)}`);
      if (full) { await p.waitForTimeout(300); await shot(p, `${tag}-10-stage2-play`); }
      // --- мягкий финал: кофейня закрылась ---
      if (full || vp === 'm360') {
        await p.evaluate(() => BK.App.toStart());
        await toStage1(p, tag, mobile, false);
        await p.click('.s1-spot [data-s1=pick]:not([disabled])');
        await p.evaluate(() => { const S = BK.App.state, T = S.stage1; T.loanMax = 0; S.cash = -2e6; T.cards = []; T.seen.s11 = 1; T.evNext = 1e9; });
        for (let i = 0; i < 8; i++) { await days(p, 40); await p.evaluate(() => { BK.App.state.stage1.cards = []; }); if ((await st(p)).status === 'failed') break; }
        await p.evaluate(() => BK.Stage1UI.render(true));
        await p.waitForSelector('#s1Ov .s1-final', { timeout: 4000 }).catch(() => issues.push(`[${tag}] мягкий финал не открылся`));
        await p.waitForTimeout(400);
        await check(p, tag + ' кофейня закрылась', '#s1Ov .s1-card', mobile);
        await shot(p, `${tag}-11-fail`);
        await p.click('[data-s1=retry]');
        await p.waitForTimeout(400);
        const re = await p.evaluate(() => ({ st: BK.App.state.stage1 && BK.App.state.stage1.status, cash: BK.App.state.cash, pro: BK.App.state.prologue && BK.App.state.prologue.status }));
        if (re.st !== 'pick' || Math.abs(re.cash - 1550000) > 1000 || re.pro !== 'done') issues.push(`[${tag}] «Открыть кофейню заново»: ${JSON.stringify(re)}`);
      }
      // «Сразу своя сеть» со стартового экрана — как раньше, без стадии 1
      await p.evaluate(() => BK.App.toStart());
      await p.waitForSelector('#startForm');
      await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=net]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
      await p.click('#startForm button[type=submit]');
      await p.waitForTimeout(300);
      const net = await p.evaluate(() => ({ s1: BK.App.state.stage1 || null, open: BK.Stage1UI.active(), cash: BK.App.state.cash, phase: BK.App.state.phase }));
      if (net.s1 || net.open || net.phase !== 'setup_prod') issues.push(`[${tag}] «Сразу своя сеть» задела стадию 1: ${JSON.stringify(net)}`);
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
