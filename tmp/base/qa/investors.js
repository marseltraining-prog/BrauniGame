/* QA: инвесторы (ROADMAP, этап 2). Окно торга при приходе инвестора, три способа торговаться,
   согласие и отказ, блок «Инвесторы» во «Финансах» (выплаты, доля, выкуп), строка в «Требует внимания»,
   статья «Партнёрам» в отчёте, польза для дела, старое сохранение без S.inv.
   Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/investors.js [папка=qa/shots/investors]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/investors';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const log = (...a) => console.log(...a);

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.inv; // чистое сохранение «до инвесторов»
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = ((document.querySelector('#pbody') || {}).innerText || '') + ' ' + ((document.querySelector('#modal .modal') || {}).innerText || '');
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
// ставим инвестору приход «сегодня» и вызываем появление
async function summon(p) {
  return p.evaluate(() => {
    const S = BK.App.state;
    BK.Inv.ensure(S).nextDay = S.day;
    BK.Inv.day(S);
    BK.App.refresh();
    const o = BK.Inv.state(S).offer;
    return o ? { name: o.name, sum: o.sum, pct: o.pct, kind: o.kind, perk: o.perk, rounds: o.rounds } : null;
  });
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
  // 1. окно торга
  const o1 = await summon(p);
  if (!o1) issues.push(`[${tag}] инвестор не пришёл`);
  notes.push(`${tag}: ${o1 ? `${o1.name} — ${Math.round(o1.sum / 1e6)} млн за ${(o1.pct * 100).toFixed(1)} % (${o1.kind}), польза ${o1.perk}` : 'нет'}`);
  await p.evaluate(() => BK.App.ACT.inv()); await p.waitForTimeout(300);
  const win = await p.evaluate(() => ({
    open: !!document.querySelector('#modal .inv-modal'),
    acts: document.querySelectorAll('#modal [data-act^="inv"]').length,
    txt: (document.querySelector('#modal .modal') || {}).innerText || '',
  }));
  if (!win.open) issues.push(`[${tag}] окно инвестора не открылось`);
  if (win.acts < 5) issues.push(`[${tag}] в окне мало действий: ${win.acts}`);
  for (const need of ['Вкладывает', 'Просит', 'Кроме денег']) if (!win.txt.includes(need)) issues.push(`[${tag}] в окне нет «${need}»`);
  await shot(p, `offer-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} окно инвестора`, { mobile }), ...await textProblems(p, `${tag} окно инвестора`));
  // 2. торг: три действия
  const neg = await p.evaluate(() => {
    const S = BK.App.state, out = {};
    const before = JSON.parse(JSON.stringify(BK.Inv.state(S).offer));
    out.rounds0 = before.rounds;
    BK.App.ACT.invMore();
    const a = BK.Inv.state(S).offer;
    out.afterMore = a ? { sum: a.sum, pct: a.pct, rounds: a.rounds } : null;
    if (a) { BK.App.ACT.invLess(); const b2 = BK.Inv.state(S).offer; out.afterLess = b2 ? { pct: b2.pct, rounds: b2.rounds } : null; }
    if (BK.Inv.state(S).offer) { BK.App.ACT.invSwitch(); const c2 = BK.Inv.state(S).offer; out.afterSwitch = c2 ? { kind: c2.kind, pct: c2.pct } : null; }
    return out;
  });
  if (neg.afterMore && neg.afterMore.rounds >= neg.rounds0) issues.push(`[${tag}] торг не расходует раунды: ${JSON.stringify(neg)}`);
  if (neg.afterMore && neg.afterMore.sum < o1.sum) issues.push(`[${tag}] «больше денег» уменьшило сумму: ${JSON.stringify(neg)}`);
  notes.push(`${tag}: торг — раундов ${neg.rounds0} → ${neg.afterMore ? neg.afterMore.rounds : 'ушёл'}`);
  // 3. согласие
  const deal = await p.evaluate(() => {
    const S = BK.App.state;
    const before = S.cash;
    if (!BK.Inv.state(S).offer) { BK.Inv.ensure(S).nextDay = S.day; BK.Inv.day(S); }
    const o = BK.Inv.state(S).offer;
    BK.App.ACT.invAccept();
    const st = BK.Inv.status(S);
    return { n: st.n, gain: S.cash - before, pay: st.pay, share: st.share, perk: o ? o.perk : null, perkOn: o ? BK.Inv.perkOf(S, o.perk) : false };
  });
  if (!deal.n) issues.push(`[${tag}] сделка не заключилась`);
  if (deal.gain <= 0) issues.push(`[${tag}] деньги не пришли: ${Math.round(deal.gain)}`);
  if (!deal.perkOn) issues.push(`[${tag}] польза инвестора не работает: ${deal.perk}`);
  notes.push(`${tag}: сделка на ${Math.round(deal.gain / 1e6)} млн, выплаты ${Math.round(deal.pay / 1e6)} млн/мес (${Math.round(deal.share * 100)} % прибыли)`);
  // 4. блок во «Финансах»
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.tab({ arg: 'fin' }); BK.App.refresh(); }); await p.waitForTimeout(250);
  const fin = await p.evaluate(() => ({ b: !!document.querySelector('.invb'), txt: (document.querySelector('.invb') || {}).innerText || '' }));
  if (!fin.b) issues.push(`[${tag}] во «Финансах» нет блока «Инвесторы»`);
  if (!/Забирает/.test(fin.txt) || !/в месяц/.test(fin.txt)) issues.push(`[${tag}] в блоке нет доли или выплаты: ${fin.txt.slice(0, 80)}`);
  await shot(p, `fin-${tag}`, '.invb');
  issues.push(...await layoutCheck(p, `${tag} финансы`, { mobile }), ...await textProblems(p, `${tag} финансы`));
  // 5. статья «Партнёрам» в отчёте месяца
  const row = await p.evaluate(() => {
    const S = BK.App.state;
    S.month.inv = 1234567;
    const r = BK.App.state.history[BK.App.state.history.length - 1];
    if (r) r.pnl.inv = 1234567;
    BK.App.refresh();
    return /Партнёрам/.test(document.querySelector('#pbody').innerText);
  });
  if (!row) issues.push(`[${tag}] в отчёте нет статьи «Партнёрам»`);
  // 6. «Требует внимания»: ждёт ответа / много уходит
  const att = await p.evaluate(() => {
    const S = BK.App.state;
    S.month.inv = 0; if (S.history.length) S.history[S.history.length - 1].pnl.inv = 0;
    const a1 = BK.Inv.attItems(S).map((x) => x.t).join(' | ');
    BK.Inv.ensure(S).nextDay = S.day; BK.Inv.day(S);
    const a2 = BK.Inv.attItems(S).map((x) => x.t).join(' | ');
    return { withOffer: a2, deals: a1 };
  });
  if (!/ждёт ответа/i.test(att.withOffer)) issues.push(`[${tag}] нет строки «ждёт ответа инвестора»: ${att.withOffer.slice(0, 80)}`);
  // 7. выкуп доли
  const buy = await p.evaluate(() => {
    const S = BK.App.state;
    BK.Inv.decline(S);
    const d = BK.Inv.list(S)[0];
    S.cash = d.buyout + 1e6;
    const r = BK.Inv.buyout(S, d.id);
    BK.App.refresh();
    return { ok: r.ok, n: BK.Inv.status(S).n, price: r.price, sum: d.sum };
  });
  if (!buy.ok || buy.n !== 0) issues.push(`[${tag}] выкуп доли не сработал: ${JSON.stringify(buy)}`);
  if (buy.price <= buy.sum) issues.push(`[${tag}] выкуп дешевле вложенного: ${JSON.stringify(buy)}`);
  // 8. окно «Инвесторы» (сводка)
  await p.evaluate(() => BK.App.ACT.inv()); await p.waitForTimeout(250);
  const infoWin = await p.evaluate(() => ({ open: !!document.querySelector('#modal .inv-modal'), txt: (document.querySelector('#modal .modal') || {}).innerText || '' }));
  if (!infoWin.open) issues.push(`[${tag}] окно «Инвесторы» не открылось`);
  if (!/Привлечено всего|Действующих сделок/.test(infoWin.txt)) issues.push(`[${tag}] в окне нет сводки`);
  await shot(p, `info-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} окно инвесторов`, { mobile }), ...await textProblems(p, `${tag} окно инвесторов`));
  await p.evaluate(() => BK.App.closeModal());
  // 9. тост о сделке
  const tst = await p.evaluate(() => {
    BK.InvUI.notify({ phase: 'deal', name: 'Тест', sum: 150e6, pct: 0.12, kind: 'profit' });
    const t = document.querySelector('#toasts .invtoast');
    if (!t) return null;
    const r = t.getBoundingClientRect(), ic = t.querySelector('.mi svg').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), ic: Math.round(Math.max(ic.width, ic.height)) };
  });
  if (!tst) issues.push(`[${tag}] тост о сделке не показан`);
  else if (tst.w > 380 || tst.h > 190 || tst.ic > 48) issues.push(`[${tag}] тост инвестора без оформления: ${JSON.stringify(tst)}`);
  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  log('генерирую сохранение ботом…');
  const sv = botSave(7, 7919);
  notes.push(`бот 7 лет: точек ${sv.stores.length}`);
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { log(vp, theme); await screens(b, vp, theme, sv); }
  // старое сохранение без S.inv
  {
    const tag = 'старое сохранение';
    const p = await start(b, 'd1440', 'light', sv);
    const r = await p.evaluate(() => {
      const S = BK.App.state;
      BK.App.ACT.tab({ arg: 'fin' });
      const block = !!document.querySelector('.invb');
      const before = !!S.inv;
      BK.Inv.day(S); // включаем приход вручную
      return { block, before, after: !!S.inv };
    });
    if (!r.block) issues.push(`[${tag}] нет блока «Инвесторы»`);
    if (r.before) issues.push(`[${tag}] S.inv создан без инвесторов`);
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
