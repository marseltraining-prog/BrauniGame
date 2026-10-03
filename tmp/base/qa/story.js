/* QA: сюжет (этап 2 плана, docs/story.md). Окно сцены с репликами и портретами, выбор с последствиями,
   письма, лента «История» в «Сводке», летопись и итоги игры, сцена не приходит в день события.
   Экраны 1440 / 390 / 360, светлая и тёмная тема.
   Запуск: node qa/story.js [папка=qa/shots/story]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/story';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];

function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S); delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  delete c.story;                       // сохранение «до сюжета»: сюжет включится вместе с игрой
  return c;
}
async function textProblems(p, label) {
  const bad = await p.evaluate(() => {
    const t = ((document.querySelector('#pbody') || {}).innerText || '') + ' ' + ((document.querySelector('#modal .modal') || {}).innerText || '');
    return (t.match(/.{0,30}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,30}/g) || []).slice(0, 3);
  });
  return bad.map((b) => `[${label}] МУСОР В ТЕКСТЕ: ${b.replace(/\s+/g, ' ')}`);
}
async function shot(p, name) { await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, name + '.png') }); }

async function screens(b, vp, theme, sv) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, save: JSON.stringify(sv) });
  await p.evaluate((t) => { BK.App.ACT.theme({ arg: t }); BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); if (BK.App.ui.modal) BK.App.closeModal(); }, theme);
  await p.waitForTimeout(300);

  // 1. сцена: реплики по одной, портрет, варианты
  const first = await p.evaluate(() => {
    const S = BK.App.state;
    BK.Story.ensure(S);
    BK.Story.start(S, BK.Story.scene('s21'));
    BK.App.refresh();
    BK.App.ACT.story();
    const el = document.querySelector('#modal .story-modal');
    return {
      open: !!el, title: el ? el.querySelector('h2').textContent : '', head: el ? el.innerText.slice(0, 90) : '',
      portraits: el ? el.querySelectorAll('canvas').length : 0,
      lines: el ? el.querySelectorAll('.st-line, .st-lines > *').length : 0,
      next: el ? !!el.querySelector('[data-act="storyNext"]') : false,
    };
  });
  if (!first.open) issues.push(`[${tag}] окно сцены не открылось`);
  if (!/глава 2/i.test(first.head)) issues.push(`[${tag}] в шапке сцены нет названия главы: «${first.head.replace(/\s+/g, ' ')}»`);
  if (first.portraits < 1) issues.push(`[${tag}] в окне нет портрета героя`);
  await shot(p, `scene-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} сцена`, { mobile }), ...await textProblems(p, `${tag} сцена`));

  // 2. долистать реплики и выбрать вариант
  const picked = await p.evaluate(() => {
    const S = BK.App.state;
    for (let i = 0; i < 8; i++) { if (!document.querySelector('#modal [data-act="storyNext"]')) break; BK.App.ACT.storyNext(); }
    const btns = document.querySelectorAll('#modal [data-act="storyPick"]');
    const idx = [...btns].findIndex((x) => !x.disabled);
    if (idx < 0) return { ok: false, n: btns.length };
    BK.App.ACT.storyPick({ arg: btns[idx].getAttribute('data-arg') });
    const R = BK.Story.state(S);
    return { ok: true, n: btns.length, log: R.log.length, seen: Object.keys(R.seen).length, toast: !!document.querySelector('#toasts .sttoast'), pending: !!R.pending };
  });
  if (!picked.ok) issues.push(`[${tag}] нет доступного варианта выбора (кнопок ${picked.n})`);
  if (picked.ok && !picked.log) issues.push(`[${tag}] решение не попало в летопись`);
  if (picked.ok && picked.pending) issues.push(`[${tag}] сцена не закрылась после выбора`);

  // 3. лента «История» в «Сводке»
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.tab({ arg: 'dash' }); BK.App.refresh(); });
  await p.waitForTimeout(250);
  const block = await p.evaluate(() => ({ b: !!document.querySelector('.storyb'), txt: (document.querySelector('.storyb') || {}).innerText || '' }));
  if (!block.b) issues.push(`[${tag}] в «Сводке» нет ленты «История»`);
  else if (!/Гуля хочет цех|История/.test(block.txt)) issues.push(`[${tag}] лента «История» пустая: ${block.txt.slice(0, 60)}`);

  // 4. окно летописи
  await p.evaluate(() => BK.App.ACT.storyLog());
  await p.waitForTimeout(300);
  const log = await p.evaluate(() => {
    const el = document.querySelector('#modal .story-modal');
    return { open: !!el, txt: el ? el.innerText : '', chapters: el ? el.querySelectorAll('h4').length : 0 };
  });
  if (!log.open) issues.push(`[${tag}] окно «Летопись» не открылось`);
  if (log.open && !/Глава 2|Гуля хочет цех/.test(log.txt)) issues.push(`[${tag}] в летописи нет записи главы 2`);
  await shot(p, `log-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} летопись`, { mobile }), ...await textProblems(p, `${tag} летопись`));

  // 5. раздел «История» в итогах игры
  await p.evaluate(() => { BK.App.closeModal(); BK.App.ACT.summary(); });
  await p.waitForTimeout(400);
  const sum = await p.evaluate(() => {
    const el = document.querySelector('#modal .modal');
    const t = el ? el.innerText : '';
    return { open: !!el, history: /История|Летопись|Семён/.test(t), png: !!document.querySelector('#modal [data-act="storyPng"], #modal #shPng') };
  });
  if (!sum.open) issues.push(`[${tag}] итоги игры не открылись`);
  if (!sum.history) issues.push(`[${tag}] в итогах нет раздела истории`);
  await shot(p, `summary-${tag}`);
  issues.push(...await layoutCheck(p, `${tag} итоги`, { mobile }), ...await textProblems(p, `${tag} итоги`));

  if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

(async () => {
  const b = await chromium.launch();
  const sv = botSave(5, 7919);
  notes.push(`бот 5 лет: точек ${sv.stores.length}`);
  for (const vp of ['d1440', 'm390', 'm360']) for (const theme of ['light', 'dark']) { console.log(vp, theme); await screens(b, vp, theme, sv); }

  // 6. сцена не приходит в день события и при открытом окне шефа; с выключенным сюжетом состояния нет
  {
    const tag = 'правила';
    const p = await openPage(b, 'd1440', { seed: 5, save: JSON.stringify(sv) });
    await p.evaluate(() => { BK.App.ACT.continue({ arg: '1' }); BK.App.setSpeed(0); if (BK.App.ui.modal) BK.App.closeModal(); });
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const S = BK.App.state;
      BK.Story.ensure(S);
      S.ev.recent = [{ day: S.day, id: 'e999', kind: 'neg', title: 'Проба' }];
      BK.Story.day(S);
      const inEvent = !!(BK.Story.state(S) || {}).pending;
      S.ev.recent = [];
      S.chef = S.chef || {}; S.chef.pending = true;
      BK.Story.day(S);
      const inChef = !!(BK.Story.state(S) || {}).pending;
      S.chef.pending = null;
      return { inEvent, inChef };
    });
    if (r.inEvent) issues.push(`[${tag}] сцена пришла в день события`);
    if (r.inChef) issues.push(`[${tag}] сцена пришла при открытом окне шефа`);
    const off = await p.evaluate(() => {
      const S = BK.App.state; const was = BK.CFG.STORY.ON;
      BK.CFG.STORY.ON = false; delete S.story;
      BK.Story.day(S); const created = !!S.story;
      BK.CFG.STORY.ON = was; return created;
    });
    if (off) issues.push(`[${tag}] с выключенным сюжетом создаётся состояние`);
    if (p.errs.length) issues.push(...p.errs.map((e) => `[${tag}] ${e}`));
    await p.context().close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), notes.concat(issues).join('\n') + '\n');
  console.log(notes.join('\n'));
  if (issues.length) console.log(issues.join('\n'));
  console.log(`Итог: ${issues.length} проблем, ${issues.filter((x) => /PAGEERR|CONSOLE/.test(x)).length} ошибок консоли`);
  process.exit(issues.length ? 1 : 0);
})();
