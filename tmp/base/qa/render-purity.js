/* QA-инвариант: открытие «Сводки»/«Финансов», повторный render и reload до следующего
   игрового тика не меняют сохраняемое состояние. Запуск: node build.js && node qa/render-purity.js */
const { chromium, openPage } = require('./lib');
const { play } = require('../sim/bot');

function botSave() {
  const r = play({ level: 'good', seed: 1701, years: 2 });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.story;
  return c;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const p = await openPage(browser, 'd1440', { seed: 17 });
  const problems = [];
  try {
    // opts.save у openPage регистрирует init-script на каждую навигацию; здесь исходный save нужен ровно один раз,
    // иначе тест сам перезапишет его при проверяемом reload.
    await p.evaluate((raw) => localStorage.setItem('bk-ufa-save-v1', raw), JSON.stringify(botSave()));
    await p.reload();
    await p.evaluate(() => { BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); if (BK.App.ui.modal) BK.App.closeModal(); });
    const prepared = await p.evaluate(() => {
      const S = BK.App.state, E = BK.Engine;
      BK.Story.ensure(S);
      let n = 0;
      do {
        if (!E.tick(S)) {
          if (S.ev && S.ev.pending) E.resolveEvent(S, 0);
          else if (S.chef && S.chef.pending) E.chefConfirm(S, [], []);
          else break;
        }
        if (S.ev && S.ev.pending) E.resolveEvent(S, 0);
        if (S.chef && S.chef.pending) E.chefConfirm(S, [], []);
        n++;
      } while (E.dateOf(S.day).d !== 1 && n < 40);
      S.notify = [];
      BK.App.setSpeed(0); BK.App.refresh();
      return { day: S.day, date: E.dateOf(S.day), line: S.story && S.story.lineM, lineMonth: S.story && S.story.lineMonth };
    });
    if (prepared.date.d !== 1) problems.push('не удалось дойти до месячного тика');
    if (!prepared.line || !prepared.lineMonth) problems.push('месячный тик не зафиксировал реплику');
    const oldSave = await p.evaluate(() => {
      const R = BK.App.state.story, mark = R.lineMonth;
      delete R.lineMonth;                                  // формат сохранения до введения маркера
      const before = JSON.stringify(BK.App.state), html = BK.STORY.lineHtml(BK.App.state), same = before === JSON.stringify(BK.App.state);
      R.lineMonth = mark;
      return { html, same };
    });
    if (!oldSave.same || oldSave.html.indexOf('st-line') < 0) problems.push('старый save с lineM без lineMonth не читается чисто');

    const snap = () => p.evaluate(() => {
      const c = Object.assign({}, BK.App.state); delete c.cache; c.notify = [];
      return JSON.stringify(c);
    });
    const before = await snap();
    await p.evaluate(() => {
      for (let i = 0; i < 8; i++) {
        BK.App.ACT.tab({ arg: i % 2 ? 'fin' : 'dash' });
        BK.App.refresh();
        BK.STORY.lineOfMonth(BK.App.state);
        BK.STORY.lineHtml(BK.App.state);
      }
    });
    const afterRender = await snap();
    if (before !== afterRender) problems.push(`render изменил state (${before.length} -> ${afterRender.length})`);

    // Фиксируем точную границу reload: Playwright file:// не гарантирует, что pagehide успеет записать localStorage.
    const persisted = await p.evaluate(() => { BK.App.save(); return localStorage.getItem(BK.Slots.key()); });
    if (before !== persisted) problems.push(`save изменил state (${before.length} -> ${(persisted || '').length})`);
    await p.reload();
    await p.waitForTimeout(120);
    const rawAfterReload = await p.evaluate(() => localStorage.getItem(BK.Slots.key()));
    if (before !== rawAfterReload) problems.push(`reload перезаписал save (${before.length} -> ${(rawAfterReload || '').length})`);
    await p.evaluate(() => { BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); if (BK.App.ui.modal) BK.App.closeModal(); });
    await p.waitForTimeout(120);
    const afterReload = await snap();
    if (before !== afterReload) {
      const a = JSON.parse(before), b = JSON.parse(afterReload);
      const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      problems.push(`reload изменил state (${before.length} -> ${afterReload.length}), поля: ${keys.join(', ')}`);
    }
    if (p.errs.length) problems.push(...p.errs);

    console.log(`render purity: day ${prepared.day}, line ${prepared.line ? prepared.line.hero + '.' + prepared.line.sit : '—'}`);
    console.log(`state bytes: ${before.length}; panels ${before === afterRender ? 'same' : 'DIFF'}; reload ${before === afterReload ? 'same' : 'DIFF'}`);
    console.log(problems.length ? `PROBLEMS: ${problems.length}\n- ${problems.join('\n- ')}` : 'render purity: ok');
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
