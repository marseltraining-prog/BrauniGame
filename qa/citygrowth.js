// Направления роста директоров (§19, src/citygrowth.js): карточка города, отчёт директора, итоги по городам.
// Бот good --corp играет 22 года (сид 7919), сохранение грузится в браузер, игра идёт ещё 40 дней (новые отчёты); снимки — qa/shots/citygrowth (1440 и 390, обе темы).
// node qa/citygrowth.js — код выхода 1 при проблемах или ошибках консоли.
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');
const OUT = path.join(__dirname, 'shots', 'citygrowth'); fs.mkdirSync(OUT, { recursive: true });
const issues = [], errors = [];

function makeSave() {
  const { play } = require('../sim/bot');
  const S = play({ level: 'good', seed: 7919, years: 22, corp: true, corpOpt: { level: 'good' } }).S;
  return JSON.parse(JSON.stringify(Object.assign({}, S, { cache: undefined, notify: [], _botRng: undefined }), (k, v) => (k === '_bot' ? undefined : v)));
}

(async () => {
  const sv = makeSave();
  const ids = Object.keys(sv.corp.cities).filter((id) => { const c = sv.corp.cities[id]; return c.gd && c.gd.last && Object.keys(c.gd.on).length; });
  if (!ids.length) { console.log('в партии бота нет городов с направлениями'); process.exit(1); }
  // город с франшизой — самый показательный
  const city = ids.find((id) => sv.corp.cities[id].gd.on.fran != null) || ids[0];
  const small = Object.keys(sv.corp.cities).find((id) => id !== 'ufa' && !sv.corp.cities[id].gd);
  console.log(`городов с направлениями: ${ids.length} (${ids.join(', ')}); показываем ${city}${small ? `, без направлений — ${small}` : ''}`);
  const b = await chromium.launch();
  for (const [vp, theme] of [['d1440', 'light'], ['m390', 'dark']]) {
    const tag = `${vp}-${theme}`;
    const p = await openPage(b, vp, { seed: 11, dark: theme === 'dark' });
    p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
    await p.evaluate((s) => localStorage.setItem('bk-ufa-save-v1', s), JSON.stringify(sv)); await p.reload(); await p.waitForTimeout(300);
    await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(400);
    await p.evaluate(() => { const A = BK.App, S = A.state, E = BK.Engine; A.setSpeed(0); for (let i = 0; i < 40; i++) { E.tick(S); if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef && S.chef.pending) E.chefConfirm(S, [], []); } A.state.notify.length = 0; A.ui.modalQueue.length = 0; A.closeModal(); document.getElementById('toasts').innerHTML = ''; if (A.ui.view !== 'russia') A.ACT.russia(); });
    await p.waitForTimeout(700);
    const shot = async (n) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) }); issues.push(...await layoutCheck(p, `${tag} ${n}`, {})); };
    await p.evaluate((id) => BK.App.ACT.ruSel({ arg: id }), city); await p.waitForTimeout(300);
    const card = await p.evaluate(() => { const el = [...document.querySelectorAll('.cgrow')][0]; if (el) el.scrollIntoView({ block: 'center' }); return { n: document.querySelectorAll('.cgrow .cgl').length, text: el ? el.innerText : '' }; });
    if (!card.n) issues.push(`[${tag}] в карточке города нет строк направлений`);
    console.log(`[${tag}] карточка: ${card.text.replace(/\n/g, ' | ')}`);
    await shot('01-card');
    if (small) { await p.evaluate((id) => BK.App.ACT.ruSel({ arg: id }), small); await p.waitForTimeout(300); const h = await p.evaluate(() => [...document.querySelectorAll('.hint')].map((x) => x.innerText).find((t) => /Направления роста|направлени/.test(t)) || ''); console.log(`[${tag}] без направлений: ${h}`); if (!h) issues.push(`[${tag}] нет подсказки о направлениях у малого города`); }
    // отчёт директора с направлениями
    const rep = await p.evaluate((id) => { const it = BK.App.state.corp.inbox.find((x) => x.kind === 'report' && x.city === id && x.grow); if (!it) return null; BK.App.ACT.ruRep({ arg: it.id }); return it.id; }, city);
    if (!rep) issues.push(`[${tag}] нет отчёта с направлениями`);
    else {
      await p.waitForTimeout(400);
      const r = await p.evaluate((rid) => { const el = document.querySelector(`#rep-${rid} .cgrow`); if (el) el.scrollIntoView({ block: 'center' }); return el ? el.innerText : ''; }, rep);
      if (!r) issues.push(`[${tag}] в отчёте нет блока направлений`);
      console.log(`[${tag}] отчёт: ${r.replace(/\n/g, ' | ')}`);
      await shot('02-report');
    }
    // итоги по городам
    const sum = await p.evaluate(() => { const h = BK.Extras && BK.Extras.citiesHtml ? BK.Extras.citiesHtml(BK.App.state) : ''; return { kpi: /Направления директоров/.test(h), names: /франшиза|кейтеринг|полки|фабрика|флагман/.test(h) }; });
    if (!sum.kpi || !sum.names) issues.push(`[${tag}] итоги по городам без направлений: ${JSON.stringify(sum)}`);
    await p.close();
  }
  await b.close();
  console.log(`\n# Проблемы (${issues.length})\n${issues.join('\n')}\n\n# Ошибки консоли (${errors.length})\n${errors.join('\n')}`);
  process.exit(issues.length || errors.length ? 1 : 0);
})();
