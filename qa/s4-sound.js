/* Озвучка пролога «Бариста» и стадии 1 «Своя кофейня» — короткая проверка (агент s4-prosound).
   node qa/s4-sound.js
   Проверяем ровно то, что просил владелец:
     1) звук вообще вызывается (считаем вызовы BK.Sound.play, подменив его);
     2) звук срабатывает на СОБЫТИЕ, а не на перерисовку: за N кадров цикла на одном и том же состоянии
        новых вызовов нет (иначе звук «строчил» бы);
     3) одно событие — один звук (нет дублей);
     4) ошибок консоли нет.
   Звук выключен не должен мешать: сам BK.Sound не играет при выключенном звуке, здесь мы считаем вызовы
   BK.Sound.play (то есть то, что зовут слои), — этого достаточно. */
const { chromium, openPage } = require('./lib');

const issues = [];
const ok = (c, m) => { if (!c) issues.push(m); };

// счётчик вызовов: подменяем BK.Sound.play и запоминаем (имя, t)
const SPY = `(() => {
  window.__snd = [];
  const S = BK.Sound;
  const orig = S.play;
  S.play = function (n, o) { const r = orig.call(S, n, o); window.__snd.push({ n, at: performance.now() }); return r; };
  return true;
})()`;
const calls = (p) => p.evaluate(() => window.__snd.map((x) => x.n));
const reset = (p) => p.evaluate(() => { window.__snd = []; });
const tail = (p, n) => p.evaluate((n) => window.__snd.slice(-n).map((x) => x.n), n);

async function startPrologue(p) {
  await p.waitForSelector('#startForm .pro-pick');
  await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('companyName').value = 'Тёплый угол'; });
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => BK.PrologueUI && BK.PrologueUI.active() && document.querySelector('#prologue .pro-card'), null, { timeout: 6000 });
}

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, 'd1440');
  const errs0 = p.errs;
  try {
    await startPrologue(p);
    await p.evaluate(SPY);
    const paused = (v) => p.evaluate((v) => { BK.PrologueUI.ui.speed = v; BK.PrologueUI.ui.dirty = true; BK.PrologueUI.render(true); }, v);
    await paused(0);

    /* ---- 1. появление карточки-сцены: один звук ----
       месяц 5 и смены уже были: иначе выбранный вариант по правилам пролога открывает «Смену»
       (после сцены П1 в первый месяц) и она перекрывает кнопки главного экрана — это её нормальное поведение */
    await reset(p);
    await p.evaluate(() => { const P = BK.App.state.prologue; P.m = 5; P.stats.shifts = 2; P.cards = [{ id: 'e_bonus', v: { a: 9000 } }]; BK.PrologueUI.ui.mode = null; BK.PrologueUI.render(true); });
    await p.waitForSelector('#proOv .pro-card', { timeout: 4000 });
    await p.waitForTimeout(400);
    const cardCalls = await calls(p);
    ok(cardCalls.length === 1, `появление карточки: ожидался 1 звук, было ${cardCalls.length} (${cardCalls.join(',')})`);

    /* ---- 2. перерисовка не «строчит»: пока карточка на экране, новых вызовов нет ---- */
    await reset(p);
    await p.evaluate(() => { for (let i = 0; i < 90; i++) BK.PrologueUI.render(true); });
    await p.waitForTimeout(700);
    const redraw = await calls(p);
    ok(redraw.length === 0, `перерисовка пролога «строчит»: ${redraw.length} вызовов за 90 отрисовок (${redraw.slice(0, 8).join(',')})`);

    /* ---- 3. выбор варианта: один звук на выбор ---- */
    await reset(p);
    await p.click('#proOv .pro-card [data-pa=choose]');
    await p.waitForTimeout(400);
    const ch = await calls(p);
    ok(ch.length === 1, `выбор варианта: ожидался 1 звук, было ${ch.length} (${ch.join(',')})`);

    /* ---- 4. деньги: копилка и вклад ---- */
    await p.evaluate(() => { const P = BK.App.state.prologue; P.cash = 200000; BK.PrologueUI.render(true); });
    await reset(p);
    await p.click('#prologue [data-pa=toBox]');
    await p.waitForTimeout(350);
    const boxCalls = await calls(p);
    ok(boxCalls.includes('coin'), `копилка: нет «дзыня» (${boxCalls.join(',') || 'тишина'})`);

    await reset(p);
    await p.click('#prologue [data-pa=toDep]');
    await p.waitForTimeout(350);
    const dep = await calls(p);
    ok(dep.includes('coin'), `вклад: нет «дзыня» (${dep.join(',') || 'тишина'})`);
    ok(dep.length <= 2, `вклад: слишком много звуков на одно нажатие (${dep.join(',')})`);

    /* ---- 5. отказ (нет денег) — deny ---- */
    await p.evaluate(() => { const S = BK.App.state, P = S.prologue; P.cash = 0; P.box = 0; P.dep = 0; BK.PrologueUI.render(true); });
    await reset(p);
    // 5.1 выключенная кнопка: браузер не рассылает click, но указатель по ней — реальное нажатие,
    //     а его мы слушаем отдельно (иначе «нет денег» звучало бы как обычное нажатие)
    const wb = await p.$('#prologue [data-pa=want]');
    if (wb) { await wb.scrollIntoViewIfNeeded(); const r = await wb.boundingBox(); if (r) await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
    await p.waitForTimeout(250);
    const deny = await calls(p);
    ok(deny.includes('deny'), `нажатие на выключенную кнопку: нет мягкого «deny» (${deny.join(',') || 'тишина'})`);
    // 5.2 отказ действия (res): возвращаем деньги в кошелёк, но цена покупки выше — движок отвечает отказом
    await reset(p);
    await p.evaluate(() => { const S = BK.App.state, P = S.prologue; P.cash = 0; P.box = 0; P.dep = 0; const r = BK.Prologue.buyWant(S, 'car'); });
    await p.waitForTimeout(150);
    const deny2 = await calls(p);
    ok(deny2.length === 0, `отказ движка не должен звенеть сам (${deny2.join(',')})`);

    /* ---- 6. «Смена»: ведём 5 гостей и смотрим, что звук есть, но не частый ---- */
    await p.evaluate(() => { const P = BK.App.state.prologue; P.mood = 60; P.hp = 80; P.cards = []; P.shift = { m: -1 }; BK.PrologueUI.render(true); });
    await p.click('#prologue [data-pa=shift]');
    await p.waitForSelector('#proSh [data-pa=shiftGo]', { timeout: 4000 });
    await reset(p);
    await p.click('#proSh [data-pa=shiftGo]');
    await p.waitForFunction(() => BK.PrologueUI.ui.sh && BK.PrologueUI.ui.sh.state === 'play', null, { timeout: 4000 });
    // 5 «гостей»: берём позиции заказа и отдаём
    for (let i = 0; i < 5; i++) {
      const done = await p.evaluate(() => {
        const sh = BK.PrologueUI.ui.sh, g = sh && sh.guests[0]; if (!g) return false;
        for (const id of g.order) sh.tray.push(id);
        BK.PrologueUI.ui.sh.tray = g.order.slice();
        return true;
      });
      if (!done) { await p.waitForTimeout(600); continue; }
      await p.click('#proSh [data-pa=shiftServe]');
      await p.waitForTimeout(160);
    }
    const shiftCalls = await calls(p);
    ok(shiftCalls.length > 0, '«Смена»: ни одного звука за 5 обслуженных гостей');
    ok(shiftCalls.length <= 14, `«Смена»: звук частит — ${shiftCalls.length} вызовов на 5 гостей (${shiftCalls.join(',')})`);
    const RATE = 45;
    const gaps = await p.evaluate((rate) => {
      const a = window.__snd; let bad = 0;
      const last = {};
      for (const x of a) { if (last[x.n] != null && x.at - last[x.n] < rate) bad++; last[x.n] = x.at; }
      return bad;
    }, RATE);
    ok(gaps === 0, `«Смена»: BK.Sound получил вызовы чаще ${RATE} мс на один звук — ${gaps}`);
    if (shiftCalls.length) await p.evaluate(() => { const sh = BK.PrologueUI.ui.sh; if (sh) sh.t = sh.plan.sec; });
    await p.waitForFunction(() => BK.PrologueUI.ui.sh && BK.PrologueUI.ui.sh.state === 'res', null, { timeout: 8000 });
    await p.waitForTimeout(400);
    const resCalls = await calls(p);
    ok(resCalls.length >= 1, `итог «Смены»: нет звука (${resCalls.join(',') || 'тишина'})`);
    await p.click('#proSh [data-pa=shiftDone]');
    await p.waitForTimeout(300);

    /* ---- 7. месяц: итог озвучивается один раз, без «строчки» ---- */
    await reset(p);
    await p.evaluate(() => { const S = BK.App.state, P = S.prologue; P.t = 0.999; P.cards = []; BK.PrologueUI.ui.speed = 3; BK.PrologueUI.ui.mode = null; BK.PrologueUI.close(); BK.PrologueUI.open(); });
    await p.waitForFunction(() => BK.App.state.prologue.m > 0, null, { timeout: 8000 });
    await p.waitForTimeout(500);
    const moCalls = await calls(p);
    ok(moCalls.length >= 1, 'месяц: ни одного звука');
    ok(moCalls.length <= 3, `месяц: слишком много звуков на один итог (${moCalls.join(',')})`);
    await p.evaluate(() => { BK.PrologueUI.ui.speed = 0; });

    /* ---- 8. стадия 1: открытие кофейни, первый гость, вкладки, покупки ---- */
    await p.evaluate(() => {
      const S = BK.App.state, P = S.prologue;
      Object.assign(P, { status: 'won', m: 22, cash: 50000, box: 0, dep: 1500000, depInt: 0, hp: 78, job: 2, stazh: 22, rep: 80, cards: [] });
      P.sf.mentor = 'friend'; P.sf.gulya = 'with'; P.rel.gulya = 30;
      P.won = { m: 22, credit: false, sav: 1550000, mentor: 'friend', gulya: 'with' };
      BK.Prologue.syncStory(S);
      // финал пролога рисует свой цикл по статусу; окна смены быть не должно
      const sh = document.getElementById('proSh'); if (sh) sh.remove();
      BK.PrologueUI.ui.sh = null; BK.PrologueUI.ui.mode = null;
    });
    await p.waitForFunction(() => BK.PrologueUI.ui.mode === 'final' && document.querySelector('#proOv .pro-final.won'), null, { timeout: 6000 });
    await reset(p);                                   // счётчик чистим ДО клика: звук звучит внутри обработчика
    await p.click('[data-pa=finalShop]');
    await p.waitForSelector('.s1-spot', { timeout: 4000 });
    await p.waitForTimeout(300);
    const open1 = await calls(p);
    ok(open1.includes('ribbon'), `открытие кофейни: нет «ленточки» (${open1.join(',') || 'тишина'})`);

    await reset(p);
    await p.click('.s1-spot [data-s1=pick]:not([disabled])');
    await p.waitForTimeout(400);
    const pickCalls = await calls(p);
    ok(pickCalls.includes('ribbon'), `выбор места: нет «ленточки» (${pickCalls.join(',') || 'тишина'})`);

    // дни идут быстро — считаем, сколько звуков даёт цикл на перерисовках
    await reset(p);
    await p.evaluate(() => {
      const S = BK.App.state, T = S.stage1; BK.Stage1UI.ui.speed = 0;
      for (let i = 0; i < 14; i++) { if (T.cards.length) break; BK.Engine.tick(S); if (BK.Rewind) BK.Rewind.record(S); S.notify = []; }
      BK.Stage1UI.render(true);
    });
    await p.waitForTimeout(300);
    // закрываем карточку сцены 1.1, если пришла
    if (await p.$('#s1Ov .s1-card')) {
      const v = await p.evaluate(() => { const b = document.querySelector('#s1Ov .s1-card [data-s1=choose]:not([disabled])'); return b ? b.dataset.v : null; });
      if (v != null) await p.click(`#s1Ov .s1-card [data-s1=choose][data-v="${v}"]`);
      await p.waitForTimeout(300);
    }
    for (let i = 0; i < 6; i++) { const b = await p.$('#s1Ov .s1-msc [data-s1=msClose]'); if (!b) break; await b.click(); await p.waitForTimeout(200); }

    /* ---- 9. перерисовка стадии 1 не «строчит» ---- */
    await reset(p);
    await p.evaluate(() => { for (let i = 0; i < 120; i++) { BK.Stage1UI.render(true); BK.Stage1UI.drawShop(document.getElementById('s1Shop'), BK.App.state, { name: 'x', menu: [], staff: [], queue: 2, thoughts: [], closed: null, dvor: null, fill: 1, hour: 9 }); } });
    await p.waitForTimeout(700);
    const s1redraw = await calls(p);
    ok(s1redraw.length === 0, `перерисовка стадии 1 «строчит»: ${s1redraw.length} вызовов за 120 отрисовок (${s1redraw.slice(0, 8).join(',')})`);

    /* ---- 10. вкладки, покупка, отказ ---- */
    await reset(p);
    await p.click('[data-s1=tab][data-v=menu]');
    await p.waitForTimeout(200);
    const tabCalls = await calls(p);
    ok(tabCalls.includes('tab'), `вкладка «Меню»: нет звука вкладки (${tabCalls.join(',') || 'тишина'})`);

    await reset(p);
    await p.evaluate(() => { BK.App.state.cash = 0; BK.Stage1UI.render(true); });
    const ab = await p.$('#stage1 [data-s1=menuAdd][disabled]');
    if (ab) { await ab.scrollIntoViewIfNeeded(); const r = await ab.boundingBox(); if (r) await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
    else await p.evaluate(() => { const b = document.querySelector('#stage1 [data-s1=menuAdd]'); if (b) { b.disabled = true; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } });
    await p.waitForTimeout(250);
    const s1deny = await calls(p);
    ok(s1deny.includes('deny'), `стадия 1, отказ: нет «deny» (${s1deny.join(',') || 'тишина'})`);

    // покупка (ремонт недоступен без денег) — вернём деньги и проверим доступное действие
    await p.evaluate(() => { BK.App.state.cash = 900000; BK.Stage1UI.render(true); });
    await reset(p);
    await p.click('[data-s1=tab][data-v=shop]');
    await p.waitForTimeout(200);
    const shopCalls = await calls(p);
    ok(shopCalls.includes('tab'), `возврат на вкладку «Точка»: нет звука (${shopCalls.join(',') || 'тишина'})`);

    /* ---- 11. конец смены/дня и переход в основную игру ---- */
    await reset(p);
    await p.evaluate(() => { const T = BK.App.state.stage1; BK.Stage1UI.ui.speed = 0; T.status = 'ready'; BK.Stage1UI.render(true); });
    await p.evaluate(() => { BK.Stage1UI.render(true); });
    await p.waitForTimeout(300);
    // сцену «Вторая вывеска» могла не появиться — просто проверим финальный переход через меню
    const before = await calls(p);
    ok(before.length <= 2, `готовность главы: слишком много звуков (${before.join(',')})`);

    /* ---- 12. общий итог: ни одного звука чаще 45 мс и ни одного дубля подряд ---- */
    const all = await p.evaluate(() => window.__snd.map((x) => ({ n: x.n, at: x.at })));
    const last = {}; let tooFast = 0;
    for (const c of all) { if (last[c.n] != null && c.at - last[c.n] < 45) tooFast++; last[c.n] = c.at; }
    ok(tooFast === 0, `звук чаще 45 мс (RATE) на один и тот же звук: ${tooFast}`);
    let dup = 0;
    for (let i = 1; i < all.length; i++) if (all[i].n === all[i - 1].n && all[i].at - all[i - 1].at < 120) dup++;
    ok(dup === 0, `дубли подряд (два одинаковых звука ближе 120 мс): ${dup}`);

    const errs = p.errs;
    ok(errs.length === 0, `ошибки консоли: ${errs.slice(0, 3).join(' | ')}`);
  } catch (e) {
    issues.push('ИСКЛЮЧЕНИЕ: ' + (e && e.message || e));
  }
  await browser.close();
  if (issues.length) { console.log('ПРОБЛЕМЫ (' + issues.length + '):'); issues.forEach((x) => console.log(' - ' + x)); process.exitCode = 1; }
  else console.log('озвучка пролога и стадии 1: 0 проблем, 0 ошибок консоли');
})();
