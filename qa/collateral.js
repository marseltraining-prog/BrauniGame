/* QA: кредит под залог точки (ROADMAP, этап 2). Блок во вкладке «Финансы», окно выбора точки и суммы,
   взятие кредита, метка на карте и в карточке точки, запрет закрытия, платёж 1-го числа, просрочка и изъятие,
   старое сохранение без S.coll. Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/collateral.js [папка=qa/shots/collateral]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/collateral';
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
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = ((document.querySelector('#pbody') || {}).innerText || '') + ' ' + ((document.querySelector('#modal .modal') || {}).innerText || '');
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function start(b, vp, theme, save) {
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save: JSON.stringify(save) });
  await p.evaluate((t) => { BK.App.ACT.theme({ arg: t }); BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); }, theme);
  await p.waitForTimeout(250);
  await p.evaluate(() => { if (BK.App.ui.modal) BK.App.closeModal(); });
  return p;
}
async function shot(p, name, sel) {
  const el = sel ? await p.$(sel) : null;
  if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(80); }
  await p.screenshot({ path: path.join(OUT, name + '.png') });
}

async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await start(b, vp, theme, sv);
  // 1. «Финансы»: блок залога
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'fin' })); await p.waitForTimeout(250);
  const blk = await p.evaluate(() => ({ b: !!document.querySelector('.collb'), txt: (document.querySelector('.collb') || {}).innerText || '' }));
  if (!blk.b) issues.push(`[${tag}] во «Финансах» нет блока «Кредит под залог точки»`);
  if (!/залог/i.test(blk.txt)) issues.push(`[${tag}] блок залога пустой: ${blk.txt.slice(0, 60)}`);
  await shot(p, `fin-${tag}`, '.collb');
  issues.push(...await layoutCheck(p, `${tag} финансы`, { mobile }), ...await textProblems(p, `${tag} финансы`));
  // 2. окно выбора точки
  const info = await p.evaluate(() => {
    BK.App.ACT.coll();
    const S = BK.App.state;
    const free = S.stores.filter((st) => st.status === 'open' && !BK.Coll.loanOf(S, st.id) && BK.Coll.limit(S, st) > 0);
    return { open: !!document.querySelector('#modal .coll-modal'), picks: document.querySelectorAll('#modal .coll-pick').length, free: free.length, range: !!document.getElementById('collRange'), storeId: free[0] ? free[0].id : null };
  });
  if (!info.open) issues.push(`[${tag}] окно залога не открылось`);
  if (info.free && info.picks !== info.free) issues.push(`[${tag}] в окне ${info.picks} точек из ${info.free} доступных`);
  if (info.free && !info.range) issues.push(`[${tag}] в окне нет выбора суммы`);
  await shot(p, `modal-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} окно залога`, { mobile }), ...await textProblems(p, `${tag} окно залога`));
  // 3. взять кредит
  const took = await p.evaluate(() => {
    const S = BK.App.state;
    const before = S.cash;
    BK.App.ACT.collTake();
    const l = BK.Coll.list(S)[0];
    return { n: BK.Coll.status(S).n, cash: S.cash - before, remain: l ? l.remain : 0, marked: !!(l && BK.Engine.byId(S.stores, l.storeId).coll), storeId: l ? l.storeId : null };
  });
  if (!took.n) issues.push(`[${tag}] кредит под залог не взялся`);
  if (took.cash <= 0) issues.push(`[${tag}] деньги не пришли на счёт: ${Math.round(took.cash)}`);
  if (!took.marked) issues.push(`[${tag}] точка не помечена как залоговая`);
  notes.push(`${tag}: под залог взято ${Math.round(took.cash / 1e6)} млн, долг ${Math.round(took.remain / 1e6)} млн`);
  // 4. карточка точки: строка про залог и запрет закрытия
  await p.evaluate(() => BK.App.closeModal()); await p.waitForTimeout(150);
  const card = await p.evaluate((id) => {
    BK.App.ACT.openStore({ arg: id });
    const t = document.querySelector('#pbody').innerText;
    return { line: /в залоге/i.test(t), noClose: !document.querySelector('[data-act="askClose"]'), block: !!document.querySelector('.coll-store') };
  }, took.storeId);
  if (!card.line || !card.block) issues.push(`[${tag}] в карточке точки нет блока про залог`);
  if (!card.noClose) issues.push(`[${tag}] заложенную точку всё ещё можно закрыть`);
  await shot(p, `store-${tag}`, '.coll-store');
  issues.push(...await layoutCheck(p, `${tag} карточка точки`, { mobile }), ...await textProblems(p, `${tag} карточка точки`));
  // 5. метка на карте и подсказка
  await p.evaluate(() => { BK.App.ACT.tab({ arg: 'stores' }); BK.App.refresh(); }); await p.waitForTimeout(200);
  const map = await p.evaluate(() => ({ badge: document.querySelectorAll('#map .m-bdg.coll').length, tip: !!(BK.CollUI && document.querySelector('#map .m-store')) }));
  if (!map.badge) issues.push(`[${tag}] на карте нет значка залога`);
  // 6. просрочка: платить нечем
  const late = await p.evaluate(() => {
    const S = BK.App.state; S.cash = 0; S.reserve = 0;
    const l = BK.Coll.list(S)[0];
    BK.Coll.monthly(S);
    const L = BK.Coll.list(S)[0];
    const att = BK.attention(S).items.map((x) => x.t).join(' | ');
    BK.App.refresh(); BK.App.ACT.tab({ arg: 'dash' });
    return { missed: L.missed, att: /просрочк|залог/i.test(att), txt: att.slice(0, 120) };
  });
  if (!late.missed) issues.push(`[${tag}] просрочка не засчиталась`);
  if (!late.att) issues.push(`[${tag}] в «Требует внимания» нет просрочки по залогу: ${late.txt}`);
  await p.waitForTimeout(200);
  await shot(p, `late-${tag}`, '.att');
  issues.push(...await layoutCheck(p, `${tag} просрочка`, { mobile }), ...await textProblems(p, `${tag} просрочка`));
  // 7. реструктуризация и изъятие
  const seized = await p.evaluate(() => {
    const S = BK.App.state; S.cash = 1e7;
    const l = BK.Coll.list(S)[0];
    const r = BK.Coll.restructure(S, l.id);
    const restructOk = r.ok;
    S.cash = 0; S.reserve = 0;
    const stores0 = S.stores.length;
    for (let i = 0; i < BK.CFG.COLL.SEIZE_MONTHS + 1; i++) BK.Coll.monthly(S);
    const st = BK.Coll.status(S);
    BK.App.refresh();
    return { restructOk, seized: st.seized, stores: S.stores.length, stores0, ban: st.banned, att: BK.attention(S).items.map((x) => x.t).join(' | ') };
  });
  if (!seized.restructOk) issues.push(`[${tag}] реструктуризация не сработала`);
  if (!seized.seized || seized.stores !== seized.stores0 - 1) issues.push(`[${tag}] банк не забрал точку: ${JSON.stringify(seized)}`);
  if (!seized.ban) issues.push(`[${tag}] после изъятия не закрыты новые кредиты`);
  await p.evaluate(() => BK.App.ACT.tab({ arg: 'fin' })); await p.waitForTimeout(200);
  const fin2 = await p.evaluate(() => document.querySelector('#pbody').innerText);
  if (!/не даёт кредитов/i.test(fin2)) issues.push(`[${tag}] в «Финансах» не сказано про запрет кредитов`);
  await shot(p, `ban-${tag}`, '.collb');
  issues.push(...await layoutCheck(p, `${tag} запрет`, { mobile }), ...await textProblems(p, `${tag} запрет`));
  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  log('генерирую сохранение ботом…');
  const sv = botSave(4, 7919);
  notes.push(`бот 4 года: точек ${sv.stores.length}`);
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { log(vp, theme); await screens(b, vp, theme, sv); }
  // старое сохранение без S.coll
  {
    const tag = 'старое сохранение';
    const old = JSON.parse(JSON.stringify(sv)); delete old.coll;
    for (const st of old.stores) delete st.coll;
    const p = await start(b, 'd1440', 'light', old);
    const r = await p.evaluate(() => {
      const S = BK.App.state;
      BK.App.ACT.tab({ arg: 'fin' });
      return { block: !!document.querySelector('.collb'), coll: !!S.coll, room: BK.Coll.totalRoom(S) };
    });
    if (!r.block) issues.push(`[${tag}] нет блока залога`);
    if (r.coll) issues.push(`[${tag}] S.coll создан без кредита — сохранения и боты не должны меняться`);
    if (!(r.room > 0)) issues.push(`[${tag}] нет доступного лимита под залог: ${r.room}`);
    issues.push(...await textProblems(p, tag));
    if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
    await p.context().close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), notes.concat(issues).join('\n') + '\n');
  log(notes.join('\n'));
  log(issues.length ? issues.join('\n') : '');
  log(`Итог: ${issues.length} проблем, ${issues.filter((x) => /PAGEERR|CONSOLE/.test(x)).length} ошибок консоли`);
  process.exit(issues.length ? 1 : 0);
})();
