/* Пиксельный слой в браузере: node qa/pixel.js [папка скриншотов]
   1) Пролог «Бариста»: экран месяца (сцена «Калача»), карточка П1 с пиксельным портретом, «Смена» (гости-пиксели в очереди,
      заказ, огонь и пар анимируются), финалы «Своя точка» и «Жизнь в найме». До финала «Жизнь в найме» пролог проходит через
      смены, которые приходят сами по расписанию (BK.Prologue.dueShift, пропустить нельзя), дилеммы живого сюжета и гостей —
      тест играет смены и закрывает карточки по очереди (prologueTo), поэтому доходит до финала, а не встаёт на «Смене».
   2) «Живая точка» в карточке точки: утро и вечер (очередь, продавцы, витрина, мысли гостей), закрытая точка ночью.
   Экраны 1440 / 390 / 360 в светлой и тёмной теме: вёрстка (layoutCheck), целый множитель canvas, сцена не пустая.
   3) Производительность: живая точка открыта, игра на ×10, 40+ точек — нет задач > 50 мс (CPU×1); сцена не рисуется,
      когда карточка закрыта; кадров сцены не больше ~8–10 в секунду.
   Итог — список проблем; код выхода 1, если они есть. */
const path = require('path');
const fs = require('fs');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'pixel'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const log = (...a) => console.log(...a);
function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}
async function check(p, label, root, mobile) { for (const x of await layoutCheck(p, label, { root, mobile })) issues.push(x); }
// все пиксельные canvas на странице: целый множитель и непустая картинка
async function canvases(p, label, sel) {
  const r = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((c) => c.offsetParent).map((c) => {
    const w = c.getBoundingClientRect().width, k = w / c.width, ctx = c.getContext('2d');
    let filled = 0, colors = new Set();
    try { const d = ctx.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 7) { if (d[i + 3]) { filled++; colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); } } } catch (e) {}
    return { cls: c.className, w: c.width, h: c.height, k: +k.toFixed(3), filled, colors: colors.size };
  }), sel);
  if (!r.length) issues.push(`[${label}] нет пиксельной сцены (${sel})`);
  for (const c of r) {
    if (Math.abs(c.k - Math.round(c.k)) > 0.01) issues.push(`[${label}] ${c.cls}: множитель не целый (${c.k})`);
    if (c.colors < 12) issues.push(`[${label}] ${c.cls}: сцена почти пустая (${c.colors} цветов)`);
  }
  return r;
}
const st = (p) => p.evaluate(() => { const P = BK.App.state && BK.App.state.prologue; return P ? { status: P.status, m: P.m, cards: P.cards.length, card: P.cards[0] && P.cards[0].id, mode: BK.PrologueUI.ui.mode } : null; });

/* ---------------- пролог: путь до финала через смены, которые приходят сами ----------------
   Новые механики пролога, о которых тест должен знать: «Смена» открывается САМА по расписанию
   (BK.Prologue.dueShift / CFG.PROLOGUE.SHIFT_AT) — её нельзя пропустить, и пока она идёт, время стоит;
   сцены, события, дилеммы живого сюжета (src/data/prolog-v2.js) и завсегдатаи-гости (src/data/guests.js)
   приходят обычными карточками. Один шаг: сделать то, что сделал бы игрок, кнопками интерфейса
   (никаких прямых PR.advance/shiftResult — тест проходит игру, как она есть). */
const proStep = (p) => p.evaluate(() => {
  const U = BK.PrologueUI, ui = U && U.ui, P = BK.App.state && BK.App.state.prologue;
  const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; };
  if (!P || P.status !== 'run') return { a: 'done' };
  // смена пришла сама: вступление → «за стойку» → обслужить пару гостей по заказу → «Закончить» → «Готово»
  if (ui.mode === 'shift' && ui.sh) {
    const sh = ui.sh;
    if (sh.state === 'intro') return { a: click('#proSh [data-pa=shiftGo]') ? 'shiftGo' : 'wait' };
    if (sh.state === 'res') return { a: click('#proSh [data-pa=shiftDone]') ? 'shiftDone' : 'wait' };
    if (sh.state === 'play') {
      const g = sh.guests[0];
      if (!g || sh.served >= 3) return { a: click('#proSh [data-pa=shiftEnd]') ? 'shiftEnd' : 'wait' }; // смена сыграна — закрываем, как игрок
      if (g.order.slice().sort().join() !== sh.tray.slice().sort().join()) {   // собрать заказ гостя на поднос
        if (sh.tray.length && click('#proSh [data-pa=shiftTray]')) return { a: 'shiftTray' };
        const need = g.order.filter((id) => sh.tray.indexOf(id) < 0)[0];
        if (need && click(`#proSh [data-pa=shiftItem][data-v="${need}"]`)) return { a: 'shiftItem' };
      }
      return { a: click('#proSh [data-pa=shiftServe]') ? 'shiftServe' : 'wait' };
    }
    return { a: 'wait' };
  }
  // карточка-решение: сцена, событие, дилемма живого сюжета или гость — окно одно и то же
  if (ui.mode === 'card' || P.cards.length) {
    const cv = P.cards[0] || {};
    return { a: click('#proOv .pro-card [data-pa=choose]:not([disabled])') ? 'card' : 'wait', id: cv.id || '', v2: !!cv.v2 };
  }
  // смена уже ждёт, а цикл игры её ещё не открыл — открываем тем же путём, что и цикл (ui.speed > 0)
  if (BK.Prologue.dueShift(P)) { U.shiftOpen(true); return { a: 'shiftOpen' }; }
  P.t = 0.99;   // месяц к концу: время двигает цикл игры на ui.speed
  return { a: 'time' };
});
// довести пролог до финала (status ≠ 'run'), играя пришедшие смены и закрывая карточки
async function prologueTo(p, tag, label) {
  const seen = { shifts: 0, cards: 0, dils: 0, guests: 0, months: 0 };
  for (let i = 0; i < 400; i++) {
    const s = await st(p);
    if (!s || s.status !== 'run') {
      notes.push(`${tag} пролог → «${label}»: смен сыграно ${seen.shifts}, окон ${seen.cards} (дилемм живого сюжета ${seen.dils}, гостей-завсегдатаев ${seen.guests}), месяцев ${s ? s.m : '?'}`);
      return s;
    }
    const r = await proStep(p);
    if (r.a === 'shiftGo') { seen.shifts++; await p.waitForFunction(() => BK.PrologueUI.ui.sh && BK.PrologueUI.ui.sh.state !== 'intro', null, { timeout: 3000 }).catch(() => {}); }
    else if (r.a === 'shiftEnd') await p.waitForSelector('#proSh .sh-res', { timeout: 3000 }).catch(() => {});
    else if (r.a === 'shiftItem' || r.a === 'shiftServe' || r.a === 'shiftTray') await p.waitForTimeout(80);
    else if (r.a === 'card') { seen.cards++; if (r.v2) seen.dils++; else if (/^g_/.test(r.id)) seen.guests++; await p.waitForTimeout(70); }
    else if (r.a === 'time') { seen.months++; await p.waitForTimeout(110); }
    else await p.waitForTimeout(60);
  }
  issues.push(`[${tag}] пролог не дошёл до «${label}» за отведённые шаги: ${JSON.stringify(await st(p))}`);
}

async function prologue(b, vp, dark) {
  const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp[0] === 'm';
  const p = await openPage(b, vp, { dark });
  try {
    await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.click('#startForm button[type=submit]');
    await p.waitForSelector('#proOv .pro-card canvas.pxp', { timeout: 5000 });
    await p.waitForTimeout(450);
    await canvases(p, tag + ' карточка П1', '#proOv canvas.pxp');
    await check(p, tag + ' карточка П1', '#proOv .pro-card', mobile);
    await p.screenshot({ path: path.join(OUT, `${tag}-p01-card.png`) });
    await p.click('#proOv [data-pa=choose][data-v="0"]');
    await p.waitForSelector('#proSh .sh-intro canvas.pxs', { timeout: 4000 });
    await p.click('[data-pa=shiftGo]');
    await p.waitForFunction(() => BK.PrologueUI.ui.sh && BK.PrologueUI.ui.sh.guests.length >= 3, null, { timeout: 12000 }).catch(() => issues.push(`[${tag}] в «Смене» не собралась очередь`));
    await p.waitForTimeout(700);
    const shots = await canvases(p, tag + ' «Смена»', '#proSh canvas.pxs');
    // анимация: огонь/пар/очередь меняют картинку между кадрами
    const same = await p.evaluate(async () => { const c = document.querySelector('#proSh canvas.pxs'); const a = c.toDataURL(); await new Promise((r) => setTimeout(r, 450)); return a === c.toDataURL(); });
    if (same) issues.push(`[${tag}] «Смена»: сцена не анимируется`);
    await check(p, tag + ' «Смена»', '#proSh .sh-in', mobile);
    await p.screenshot({ path: path.join(OUT, `${tag}-shift.png`) });
    if (!shots.length) issues.push(`[${tag}] «Смена» без сцены`);
    await p.click('[data-pa=shiftEnd]'); await p.waitForSelector('#proSh .sh-res'); await p.click('[data-pa=shiftDone]');
    await p.waitForTimeout(300);
    await p.evaluate(() => { BK.PrologueUI.ui.speed = 0; window.scrollTo(0, 0); const el = document.getElementById('proPxSlot'); if (el) el.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(300);
    await canvases(p, tag + ' месяц', '#proPxSlot canvas.pxs');
    await check(p, tag + ' месяц', '#proColA .pro-hero', mobile);
    await p.screenshot({ path: path.join(OUT, `${tag}-month.png`) });
    // дилемма живого сюжета (src/data/prolog-v2.js): окно то же, что у сцен, но сцену ведёт v2.
    // Прыжок к финалу её расписание пропускает — показываем дилемму сами и проверяем пиксельный портрет.
    const dil = await p.evaluate(() => {
      const P = BK.App.state.prologue;
      if (!BK.PrologV2 || !P.v2 || !BK.PrologV2.DIL_IDS.length) return null;
      BK.PrologV2.push(P, BK.PrologV2.DIL_IDS[0]);   // тот же путь, которым игру показывает дилемму (overlay → P.cards)
      const cv = P.cards[P.cards.length - 1];
      return cv && cv.v2 ? cv.id : null;
    });
    if (dil) {
      await p.waitForSelector('#proOv .pro-card canvas.pxp', { timeout: 4000 }).catch(() => issues.push(`[${tag}] дилемма «${dil}»: карточка без портрета`));
      await p.waitForTimeout(300);
      await canvases(p, `${tag} дилемма живого сюжета`, '#proOv .pro-card canvas.pxp');
      await check(p, `${tag} дилемма живого сюжета`, '#proOv .pro-card', mobile);
      await p.screenshot({ path: path.join(OUT, `${tag}-dilemma.png`) });
    } else issues.push(`[${tag}] дилемма живого сюжета не открылась (BK.PrologV2)`);
    // финал «Жизнь в найме»: до него пролог проходит через смены, которые приходят сами по расписанию
    await p.evaluate(() => { const P = BK.App.state.prologue, c = BK.CFG.PROLOGUE; P.m = c.LIFE_MONTHS - 1; P.job = 1; P.cash = 12000; P.box = 0; P.spent = { home: 2600000, food: 3100000, fun: 1500000, sneakers: 180000, trip: 560000 }; P.earned = { salary: 9800000, tips: 900000 }; BK.PrologueUI.ui.speed = 3; P.t = 0.99; });
    await prologueTo(p, tag, 'жизнь в найме');
    await p.waitForSelector('#proOv .pro-final.life canvas.pxs', { timeout: 5000 }).catch(() => issues.push(`[${tag}] финал «Жизнь в найме» без сцены`));
    await p.waitForTimeout(600);
    await canvases(p, tag + ' финал «в найме»', '#proOv .pro-final canvas.pxs');
    await check(p, tag + ' финал «в найме»', '#proOv .pro-card', mobile);
    await p.screenshot({ path: path.join(OUT, `${tag}-final-life.png`) });
    // финал «Своя точка»
    await p.evaluate(() => { const P = BK.App.state.prologue; P.status = 'won'; P.won = { credit: false }; P.sf.gulya = 'with'; P.sf.mentor = 'partner'; BK.PrologueUI.ui.mode = null; });
    await p.waitForSelector('#proOv .pro-final.won canvas.pxs', { timeout: 5000 }).catch(() => issues.push(`[${tag}] финал «Своя точка» без сцены`));
    await p.waitForTimeout(700);
    await canvases(p, tag + ' финал «Своя точка»', '#proOv .pro-final canvas.pxs');
    await check(p, tag + ' финал «Своя точка»', '#proOv .pro-card', mobile);
    await p.screenshot({ path: path.join(OUT, `${tag}-final-won.png`) });
  } catch (e) {
    issues.push(`[${tag}] СБОЙ ПРОЛОГА: ${e.message.split('\n')[0]}`);
    await p.screenshot({ path: path.join(OUT, `${tag}-FAIL-prologue.png`) }).catch(() => {});
  }
  for (const e of p.errs) issues.push(`[${tag}] ${e}`);
  await p.context().close();
}

async function loadState(p, s) {
  await p.evaluate((raw) => { localStorage.setItem('bk-ufa-save-v1', raw); BK.App.ACT.continue(); BK.App.setSpeed(0); window.scrollTo(0, 0); }, JSON.stringify(s));
  await p.waitForTimeout(200);
}
async function live(b, vp, dark, save) {
  const tag = `${vp}${dark ? '-dark' : ''}`, mobile = vp[0] === 'm';
  const p = await openPage(b, vp, { dark });
  try {
    await loadState(p, save);
    const id = await p.evaluate(() => { const S = BK.App.state; const s = S.stores.filter((x) => x.status === 'open').sort((a, c) => (c.today ? c.today.load : 0) - (a.today ? a.today.load : 0))[0]; BK.App.ACT.openStore({ arg: s.id }); return s.id; });
    await p.waitForSelector('#pbody .pxlive canvas.pxs', { timeout: 4000 });
    for (const [h, name] of [[8.3, 'morning'], [18.6, 'evening']]) {
      await p.evaluate((h) => { BK.PixelUI.setHour(h); const el = document.querySelector('#pbody .pxlive'); el.scrollIntoView({ block: 'center' }); }, h);
      await p.waitForTimeout(350);
      await canvases(p, `${tag} живая точка ${name}`, '#pbody .pxlive canvas.pxs');
      await check(p, `${tag} живая точка ${name}`, '#pbody', mobile);
      const txt = await p.evaluate(() => document.querySelector('#pbody .pxlive').innerText);
      if (!/в очереди/.test(txt) || !/Витрина/.test(txt)) issues.push(`[${tag}] живая точка: нет подписи/цифр: ${txt.slice(0, 80)}`);
      const el = await p.$('#pbody .pxlive');
      await el.screenshot({ path: path.join(OUT, `${tag}-live-${name}.png`) });
      if (name === 'morning' && !mobile) await p.screenshot({ path: path.join(OUT, `${tag}-live-page.png`) });
    }
    // витрина утром полнее, чем вечером; ночью очереди нет
    const v = await p.evaluate(() => { const L = BK.PixelUI.liveView, B = L.base; return { m: BK.PixelUI.sceneAt(B, 8.3), e: BK.PixelUI.sceneAt(B, 18.6), n: BK.PixelUI.sceneAt(B, 22.6) }; });
    if (!(v.m.fill > v.e.fill)) issues.push(`[${tag}] витрина вечером не пустеет: ${v.m.fill} → ${v.e.fill}`);
    if (v.n.queue !== 0 || v.n.state !== 'night') issues.push(`[${tag}] ночью: очередь ${v.n.queue}, состояние ${v.n.state}`);
    notes.push(`${tag} живая точка ${id}: утро очередь ${v.m.queue}, витрина ${Math.round(v.m.fill * 100)} %, мысли ${v.m.thoughts.map((x) => x.t).join('/') || '—'}; вечер очередь ${v.e.queue}, витрина ${Math.round(v.e.fill * 100)} %, мысли ${v.e.thoughts.map((x) => x.t).join('/') || '—'}`);
    // панель обновляется (морфинг) — сцена остаётся на месте
    await p.evaluate(() => { BK.App.setSpeed(10); });
    await p.waitForTimeout(1200);
    await p.evaluate(() => { BK.App.setSpeed(0); });
    await canvases(p, `${tag} живая точка после ×10`, '#pbody .pxlive canvas.pxs');
    if (vp === 'd1440' && !dark) {
      await p.evaluate(() => BK.PixelUI.setHour(22.6)); await p.waitForTimeout(250);
      await (await p.$('#pbody .pxlive')).screenshot({ path: path.join(OUT, `${tag}-live-night.png`) });
    }
  } catch (e) {
    issues.push(`[${tag}] СБОЙ ЖИВОЙ ТОЧКИ: ${e.message.split('\n')[0]}`);
    await p.screenshot({ path: path.join(OUT, `${tag}-FAIL-live.png`) }).catch(() => {});
  }
  for (const e of p.errs) issues.push(`[${tag}] ${e}`);
  await p.context().close();
}

async function perf(b, save, throttle) {
  const p = await openPage(b, 'd1440', {});
  const cdp = await p.context().newCDPSession(p);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await loadState(p, save);
  await p.evaluate(() => {
    window.__q = { lt: [], paint: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) __q.lt.push(e.duration); }).observe({ type: 'longtask' });
    const st = BK.Px.scenes.store; BK.Px.scenes.store = function () { __q.paint++; return st.apply(this, arguments); };
    setInterval(() => { const S = BK.App.state; if (S.ev.pending) BK.Engine.resolveEvent(S, 0); if (S.chef.pending) S.chef.pending = null; if (BK.App.ui.modal) BK.App.ACT.closeModal(); }, 100);
    const s = BK.App.state.stores.filter((x) => x.status === 'open')[0]; BK.App.ACT.openStore({ arg: s.id });
  });
  await p.waitForSelector('#pbody .pxlive canvas.pxs');
  await p.evaluate(() => { document.querySelector('#pbody .pxlive').scrollIntoView({ block: 'center' }); BK.App.setSpeed(10); });
  await p.waitForTimeout(500);
  const d0 = await p.evaluate(() => { __q.lt.length = 0; __q.paint = 0; return BK.App.state.day; });
  await p.waitForTimeout(5000);
  const r = await p.evaluate((d0) => ({ days: BK.App.state.day - d0, long: __q.lt.length, longMax: Math.round(Math.max(0, ...__q.lt)), longSum: Math.round(__q.lt.reduce((a, c) => a + c, 0)), paint: __q.paint, stores: BK.App.state.stores.length }), d0);
  notes.push(`перф CPU×${throttle}: ${r.stores} точек, живая точка открыта, ×10: ${r.days} дн/5с, кадров сцены ${r.paint} (${(r.paint / 5).toFixed(1)}/с), задач > 50 мс: ${r.long}${r.long ? ` (макс ${r.longMax}, сумма ${r.longSum} мс)` : ''}`);
  if (throttle <= 1 && r.long > 0) issues.push(`[перф] долгие задачи с открытой живой точкой: ${r.long} (макс ${r.longMax} мс)`);
  if (throttle > 1 && r.longSum > 1000) issues.push(`[перф CPU×${throttle}] долгие задачи ${r.longSum} мс за 5 с`);
  if (r.paint / 5 > 11) issues.push(`[перф] сцена рисуется слишком часто: ${(r.paint / 5).toFixed(1)} кадров/с`);
  // карточка закрыта — сцена не рисуется
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'dash' }); });
  await p.waitForTimeout(600);
  const p0 = await p.evaluate(() => __q.paint);
  await p.waitForTimeout(2000);
  const p1 = await p.evaluate(() => __q.paint);
  if (p1 !== p0) issues.push(`[перф] сцена рисуется при закрытой карточке: ${p1 - p0} кадров за 2 с`);
  notes.push(`перф: после закрытия карточки кадров сцены за 2 с — ${p1 - p0}`);
  for (const e of p.errs) issues.push(`[перф] ${e}`);
  await p.context().close();
}

(async () => {
  log('сохранения ботом…');
  const s2 = botSave(2, 7919), big = botSave(13, 7919);
  const b = await chromium.launch();
  for (const vp of ['d1440', 'm390', 'm360']) for (const dark of [false, true]) {
    log('пролог', vp, dark ? 'тёмная' : 'светлая'); await prologue(b, vp, dark);
    log('живая точка', vp, dark ? 'тёмная' : 'светлая'); await live(b, vp, dark, s2);
  }
  log('производительность'); await perf(b, big, 1); await perf(b, big, 4);
  await b.close();
  const uniq = [...new Set(issues)];
  fs.writeFileSync(path.join(OUT, 'issues.txt'), uniq.join('\n') + '\n\n' + notes.join('\n') + '\n');
  console.log(notes.join('\n'));
  console.log(uniq.length ? uniq.join('\n') : 'Проблем не найдено');
  console.log(`${uniq.length} проблем, ${uniq.filter((x) => /CONSOLE|PAGEERR/.test(x)).length} ошибок консоли. Скриншоты: ${OUT}`);
  process.exit(uniq.length ? 1 : 0);
})();
