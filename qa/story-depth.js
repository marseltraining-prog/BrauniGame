/* Отдельный сюжетный выпуск: реальные семейные окна, сохранение и условные люди.
   Без бота/искусственного HTML. BR=webkit — Safari; по умолчанию Chromium.
   Запуск и все другие проверки выполняются координатором последовательно. */
const fs = require('fs'), path = require('path');
const { chromium, webkit } = require('playwright');
const { openPage, layoutCheck } = require('./lib');
const out = process.argv[2] || path.join(__dirname, 'shots', 'story-depth');
fs.mkdirSync(out, { recursive: true });
const issues = [];
let checks = 0;
function ok(value, label) { checks++; if (!value) issues.push(label); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function layout(p, label, vp) {
  const found = await layoutCheck(p, label, { mobile: vp[0] === 'm', root: '#modal .modal' });
  checks++;
  issues.push(...found);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': горизонтальная прокрутка');
}
async function neutral(p, selector, label) {
  const result = await p.evaluate(selector => [...document.querySelectorAll(selector)].map(row => {
    const chips = [...row.querySelectorAll('[data-strength]')];
    return {
      count: chips.length,
      valid: chips.every(c => /^[0-3]$/.test(c.dataset.strength) && !c.matches('.up, .dn, .good, .bad')),
      sorted: chips.every((c, i) => !i || +chips[i - 1].dataset.strength >= +c.dataset.strength),
      text: chips.map(c => c.textContent + ' ' + c.title).join(' '),
      desc: !!row.querySelector('.cd, .st-desc'),
    };
  }), selector);
  ok(result.length > 0, label + ': нет вариантов');
  ok(result.every(r => r.valid && r.sorted && !/[▲▼]|(?:^|\s)[+−-]\s*\d|лучше|хуже/i.test(r.text)), label + ': знак/цвет/порядок силы');
  ok(result.every(r => !r.desc), label + ': прогнозный desc остаётся в выборе');
  return result;
}

async function startPage(browser, vp, dark, gender) {
  const p = await openPage(browser, vp, { dark, seed: 7919 });
  await p.evaluate(() => { BK.CFG.STORY.ON = false; BK.Scenario.pick = () => null; });
  await p.fill('#heroName', 'Александра-Екатерина Оченьдлиннаяфамилия');
  await p.click(`[data-hero="${gender}"]`);
  await p.check('[name=startmode][value=net]');
  await p.click('#startForm button[type=submit]');
  await p.evaluate(({ dark, gender }) => {
    BK.App.setSpeed(0);
    BK.App.ACT.theme({ arg: dark ? 'dark' : 'light' });
    BK.CFG.STORY.ON = true;
    const S = BK.App.state;
    S.phase = 'play'; S.day = 2000; S.cash = 1e8; S.lastMonthRev = 5e6;
    S.notify = []; S.ev.pending = null; S.chef.pending = null;
    BK.Story.ensure(S);
    BK.Threads.ensure(S);
    if (BK.Story.heroG(S) !== gender || BK.Story.heroName(S).length < 20) throw new Error('Герой не перенесён со стартового экрана');
    BK.App.closeModal(); BK.App.refresh();
  }, { dark, gender });
  return p;
}

async function family(p, id, label, vp, reload) {
  const before = await p.evaluate(id => {
    BK.App.closeModal();
    const S = BK.App.state, R = BK.Story.state(S), T = BK.Threads;
    R.pending = null; R.famSeen = {}; R.famNext = 0; R.rel.family = 0; R.rel.babushka = 0;
    T.ensure(S).list = [];
    S.notify = []; S.cash = 1e8; S.macro.priceLevel = 3;
    const def = BK.Story.famDefs().find(d => d.id === id), t = BK.Story.famStart(S, def);
    if (!t) throw new Error('Не создано семейное дело ' + id);
    return { due: t.due, day: S.day, cash: S.cash, hero: BK.Story.heroOf(S), opts: def.opts.map(o => ({ cost: o.cost || 0, money: o.cost ? BK.fmtMoney(o.cost) : '', rel: o.rel || 0 })),
      actualRel: def.rel || 'family', rel: R.rel[def.rel || 'family'] || 0 };
  }, id);
  await p.evaluate(id => BK.App.ACT.fam({ arg: 'fam-' + id }), id);
  ok(await p.locator('#modal [data-act=famPick]').count() === before.opts.length, label + ': все варианты семьи');
  const familyImpacts = await neutral(p, '#modal [data-act=famPick]', label);
  ok(familyImpacts.every(r => r.count > 0), label + ': нет области/силы семейного влияния');
  const shown = await p.evaluate(() => [...document.querySelectorAll('#modal [data-act=famPick]')].map(b => b.innerText));
  ok(before.opts.every((o, i) => !o.cost || shown[i].includes(o.money)), label + ': реальная семейная цена без инфляции');
  ok(await p.locator('#modal .fam-note').innerText().then(t => /Осталось \d+/.test(t) && t.includes('Если не решите')), label + ': срок/цена бездействия');
  ok(!(await p.locator('#modal').innerText()).match(/\{[^}]+\}|undefined|NaN|Infinity|\[object Object\]/), label + ': сырые подстановки');
  if (id === 'mamaMoney') ok(!/Сынок|доченька/.test(await p.locator('#modal .fam-lead').innerText()), label + ': нейтральное обращение к герою');
  ok(await p.evaluate(() => [...document.querySelectorAll('#modal [data-act=famPick] b')].every(b => b.getBoundingClientRect().width >= 130)), label + ': подпись выбора не сжата значками в столбец');
  await layout(p, label, vp);

  // Сравниваем семантику chips при противоположных эффектах, без HTML snapshot.
  const mirrored = await p.evaluate(id => {
    const S = BK.App.state, def = BK.Story.famDefs().find(d => d.id === id);
    const shape = () => [...document.querySelectorAll('#modal [data-act=famPick] [data-strength]')].map(c => ({ name: c.querySelector('.fxn').textContent,
      strength: c.dataset.strength, value: c.querySelector('.impact-level').textContent, title: c.title, color: getComputedStyle(c).color }));
    const old = def.opts, first = shape(), state = JSON.stringify(S);
    try {
      def.opts = old.map(o => ({ ...o, rel: -(o.rel || 0), traffic: o.traffic ? 2 - o.traffic : o.traffic }));
      BK.App.ACT.fam({ arg: 'fam-' + id });
      return { first, second: shape(), unchanged: state === JSON.stringify(S) };
    } finally { def.opts = old; BK.App.ACT.fam({ arg: 'fam-' + id }); }
  }, id);
  ok(same(mirrored.first, mirrored.second) && mirrored.unchanged, label + ': равная unsigned сила и чистый рендер');
  if (id === 'mama') await p.locator('#modal .modal').screenshot({ path: path.join(out, label.replace(/[^\w-]/g, '_') + '.png') });

  if (reload) {
    await p.evaluate(() => BK.App.save());
    await p.reload();
    await p.click('[data-act=continue]');
    const loaded = await p.evaluate(id => {
      BK.App.setSpeed(0); BK.App.closeModal();
      const S = BK.App.state, t = BK.Threads.byId(S, 'fam-' + id);
      return { due: t && t.due, done: t && !!t.done, day: S.day, cash: S.cash, hero: BK.Story.heroOf(S) };
    }, id);
    ok(loaded.due === before.due && !loaded.done && loaded.day === before.day && loaded.cash === before.cash && same(loaded.hero, before.hero), label + ': pending/срок/деньги/герой после загрузки');
    await p.evaluate(id => BK.App.ACT.fam({ arg: 'fam-' + id }), id);
    await neutral(p, '#modal [data-act=famPick]', label + ' loaded');
  }
  await p.click('#modal [data-act=famPick][data-arg="0"]');
  const result = await p.evaluate(({ id, relWho }) => {
    const S = BK.App.state, t = BK.Threads.byId(S, 'fam-' + id), cash = S.cash;
    const duplicate = BK.Story.famPick(S, 'fam-' + id, 0);
    return { cash, cashAfterDuplicate: S.cash, duplicate: duplicate.ok, done: !!t.done, ask: t.ask, rel: BK.Story.state(S).rel[relWho] };
  }, { id, relWho: before.actualRel });
  ok(result.done && !result.ask && !result.duplicate && result.cashAfterDuplicate === result.cash, label + ': решение исполнено один раз');
  ok(result.cash === before.cash - before.opts[0].cost && result.rel === before.rel + before.opts[0].rel, label + ': фактическая оплата и отношения');
}

async function showScene(p, id, flags) {
  const metadata = await p.evaluate(({ id, flags }) => {
    BK.App.closeModal();
    const S = BK.App.state, R = BK.Story.state(S);
    R.f = { ...flags }; R.rel = Object.fromEntries(Object.keys(R.rel).map(k => [k, 50]));
    R.pending = null; S.notify = []; S.cash = 1e8;
    const sc = BK.Story.scene(id), original = JSON.stringify(sc), before = JSON.stringify(S);
    const view = BK.Story.sceneView(S, sc);
    const clean = before === JSON.stringify(S) && original === JSON.stringify(sc);
    BK.Story.start(S, sc); BK.App.ACT.story();
    return { clean, speakers: view.lines.map(l => l.who), title: view.title, rel: R.rel,
      expectedTexts: view.lines.map(l => BK.StoryUI.sub(S, l.text)), choiceCount: view.choices.length };
  }, { id, flags });
  const lines = [], speakers = [];
  for (let i = 0; i < 12; i++) {
    if (await p.locator('#modal .st-text').count()) {
      lines.push(await p.locator('#modal .st-text').innerText());
      speakers.push(await p.locator('#modal .st-who').innerText());
    }
    if (!await p.locator('#modal [data-act=storyNext]').count()) break;
    await p.click('#modal [data-act=storyNext]');
  }
  return { ...metadata, lines, shownSpeakers: speakers, text: await p.locator('#modal').innerText() };
}

async function conditionalScenes(p, label, vp, gender) {
  const cases = [
    ['sf1b', { rashidGone: true, gulya: 'poached' }],
    ['kd2', { rashidGone: true, lineDamir: 'close' }],
    ['kd3', { rashidGone: true, lineDamir: 'trusted' }],
    ['kf4', { mateWork: 'no' }],
  ];
  for (const [id, flags] of cases) {
    const r = await showScene(p, id, flags), tag = label + '/' + id;
    ok(r.clean, tag + ': view изменяет данные/сохранение');
    ok(r.lines.length === r.expectedTexts.length && same(r.lines, r.expectedTexts), tag + ': UI отображает выбранную view');
    ok(await p.locator('#modal [data-act=storyPick]').count() === r.choiceCount, tag + ': view потеряла варианты решения');
    ok(!(r.text.match(/\{[^}]+\}|undefined|NaN|Infinity/)), tag + ': подстановки');
    if (flags.rashidGone) {
      ok(!r.speakers.includes('rashid') && !r.shownSpeakers.some(x => /Рашид/.test(x)), tag + ': ушедший Рашид говорит живым');
      ok(r.lines.some(t => /записк|тетрад|говорил|записал/i.test(t)), tag + ': пропало узнавание Рашида');
    }
    if (id === 'sf1b') {
      const disabled = await p.locator('#modal [data-act=storyPick]').last().isDisabled();
      ok(disabled, tag + ': живой совет доступен после ухода');
      ok(await p.locator('#modal [data-act=storyPick]').last().locator('.cwhy').count() > 0, tag + ': нет причины недоступности');
      ok(!r.speakers.includes('gulya'), tag + ': ушедшая к Олегу Гуля всё ещё глава нашего цеха');
      await p.locator('#modal .modal').screenshot({ path: path.join(out, (label + '-sf1b').replace(/[^\w-]/g, '_') + '.png') });
    }
    if (id === 'kd2') ok(!await p.locator('#modal [data-act=storyPick][data-arg="1"]').isDisabled(), tag + ': расследование недоступно после отказа');
    if (id === 'kf4') {
      ok(!/два начальника|в каждом разговоре/.test(r.lines.join(' ')), tag + ': назначен отвергнутый партнёр');
      ok(await p.locator('#modal [data-act=storyPick]:not([disabled])').count() >= 1, tag + ': тупик после отказа');
      if (gender === 'f') ok(!r.lines.some((t, i) => /Я сам(?:\s|[.,!?])/.test(t) && r.speakers[i] === 'hero') && !r.lines.some(t => /Ты сказал:/.test(t)), tag + ': мужские формы у героини');
    }
    await neutral(p, '#modal [data-act=storyPick]', tag);
    if (id === 'sf1b' || id === 'kf4') await layout(p, tag, vp);
  }
  // Возвращение к живому прошлому проверяет, что view не «залипла» глобально.
  const alive = await showScene(p, 'sf1b', { gulya: 'own' });
  ok(alive.speakers.includes('rashid') && alive.lines.some(t => /поставщик/.test(t)), label + ': живой Рашид/собственное дело Гули после другой view');
  ok(!await p.locator('#modal [data-act=storyPick]').last().isDisabled(), label + ': допустимый живой совет остался заблокирован');
}

async function scenarios(p, label) {
  const ls = await showScene(p, 'ls5', {});
  const paper = await p.locator('#modal .st-paper').innerText();
  ok(ls.clean && /очеред|вывеск/i.test(paper) && !/ни одного месяца|прибыльный месяц|полгода/i.test(paper), label + '/ls5: неподтверждённая прибыль/срок');
  await p.click('#modal [data-act=storyPick]');
  ok(await p.evaluate(() => BK.Story.state(BK.App.state).seen.ls5 != null), label + '/ls5: запись не подтверждена');

  await p.evaluate(() => { BK.App.state.macro.priceLevel = 2; BK.App.state.lastMonthRev = 5e6; });
  const mos = await showScene(p, 'mos4', {});
  ok(!/в год|ежегодно/.test(mos.text), label + '/mos4: одноразовую выплату назвали ежегодной');
  const expected = await p.evaluate(() => {
    const S = BK.App.state, fx = BK.Story.scene('mos4').choices[0].effects.find(f => f.t === 'cash');
    return { cash: S.cash, cost: Math.round(Math.abs(fx.v) * S.macro.priceLevel), text: BK.fmtMoney(Math.round(Math.abs(fx.v) * S.macro.priceLevel)) };
  });
  ok((await p.locator('#modal [data-act=storyPick][data-arg="0"] .impact-level').allInnerTexts()).includes(expected.text), label + '/mos4: значок не показывает фактическую индексированную цену');
  await p.click('#modal [data-act=storyPick][data-arg="0"]');
  ok(await p.evaluate(() => BK.App.state.cash) === expected.cash - expected.cost, label + '/mos4: фактическое разовое списание');
}

(async () => {
  const type = process.env.BR === 'webkit' ? webkit : chromium, browser = await type.launch();
  try {
    for (const vp of ['d1440', 'm390', 'm360']) for (const dark of [false, true]) for (const gender of ['m', 'f']) {
      const label = `${type.name()}-${vp}-${dark ? 'dark' : 'light'}-${gender}`;
      console.log(label);
      const p = await startPage(browser, vp, dark, gender);
      try {
        for (const id of ['mama', 'sister', 'room', 'mamaMoney', 'babushka'])
          await family(p, id, label + '/' + id, vp, id === 'mama' || (vp === 'd1440' && !dark && gender === 'm'));
        await conditionalScenes(p, label, vp, gender);
        await scenarios(p, label);
        ok(!p.errs.length, label + ': ' + p.errs.join('\n'));
      } finally { await p.context().close(); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, `issues-${type.name()}.txt`), issues.join('\n') + '\n');
  if (issues.length) console.error(issues.join('\n'));
  console.log(`ГЛУБИНА UI ${type.name()}: ${checks} проверок, ${issues.length} проблем`);
  process.exitCode = issues.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
