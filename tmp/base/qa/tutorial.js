/* QA: обучение новичка (src/ui/tutorial.js). Проходит все 12 шагов на 1440×900 и 390×844 (и 360×740 — светлая) в светлой и тёмной теме:
   стартовый экран (переключатель по умолчанию «вкл», запоминается), цех и первая точка по советам, пауза, «Сводка», кредит, распределение,
   зарплата, 1-е число, кассовый разрыв, событие с выбором, вторая точка, финал; «Пройти обучение заново» и «Пропустить»; сохранение
   посреди обучения и старое сохранение без обучения. Проверки: карточка в пределах экрана и не закрывает нужную кнопку, обводка вокруг
   цели, цели пальцем ≥ 40 px, контраст текста карточки, нет прокрутки вбок, нет ошибок консоли.
   Запуск: node qa/tutorial.js [папка=qa/shots/tutorial]   Итог — <папка>/issues.txt, код выхода 1 при проблемах. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, tickDays, realTicks } = require('./lib');

const OUT = process.argv[2] || 'qa/shots/tutorial';
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [], errors = [];
const log = (...a) => console.log(...a);

// карточка обучения: в экране, не закрывает ключевую кнопку, обводка на цели, размеры целей, контраст
async function cardCheck(p, label, mobile) {
  return p.evaluate(([label, mobile]) => {
    const out = [], root = document.getElementById('tut'), card = root && root.querySelector('.tut-card');
    if (!root || root.hidden || !card) return [`[${label}] карточка обучения не показана`];
    const W = innerWidth, H = innerHeight, cr = card.getBoundingClientRect();
    if (cr.left < -0.5 || cr.top < -0.5 || cr.right > W + 0.5 || cr.bottom > H + 0.5) out.push(`[${label}] карточка за краем экрана [${Math.round(cr.left)},${Math.round(cr.top)}…${Math.round(cr.right)},${Math.round(cr.bottom)}]`);
    if (document.documentElement.scrollWidth > W + 1) out.push(`[${label}] прокрутка вбок: ${document.documentElement.scrollWidth} > ${W}`);
    const T = BK.Tutorial, S = BK.App.state, ui = BK.App.ui, st = T.STEPS.find((x) => x.id === T.current);
    if (!st) return out.concat([`[${label}] нет текущего шага`]);
    const target = st.target ? st.target(S, ui) : null, key = (st.key && st.key(S, ui)) || target;
    const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (key) {
      const kr = key.getBoundingClientRect();
      if (kr.width && inter(kr, cr) > 1) out.push(`[${label}] карточка закрывает нужный элемент «${key.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}» (${Math.round(inter(kr, cr))} px²)`);
      if (kr.bottom < 0 || kr.top > H) out.push(`[${label}] нужный элемент вне экрана`);
      const cx = kr.left + kr.width / 2, cy = kr.top + kr.height / 2;
      if (cx > 0 && cy > 0 && cx < W && cy < H) { const top = document.elementFromPoint(cx, cy); if (top && !key.contains(top) && !top.contains(key)) out.push(`[${label}] нужный элемент перекрыт: ${top.className || top.tagName}`); }
    }
    if (target) {
      const tr = target.getBoundingClientRect(), rr = root.querySelector('.tut-ring').getBoundingClientRect();
      if (!(rr.left <= tr.left + 1 && rr.top <= tr.top + 1 && rr.right >= tr.right - 1 && rr.bottom >= tr.bottom - 1)) out.push(`[${label}] обводка не вокруг цели`);
    }
    for (const b of card.querySelectorAll('button')) { const r = b.getBoundingClientRect(); if (mobile && (r.height < 39.5 || r.width < 39.5)) out.push(`[${label}] МАЛЕНЬКАЯ ЦЕЛЬ ${Math.round(r.width)}×${Math.round(r.height)} «${b.textContent.trim()}»`); if (r.bottom > H + 0.5) out.push(`[${label}] кнопка «${b.textContent.trim()}» ниже экрана`); }
    // контраст текста карточки
    const parse = (c) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.9) return c; } return [255, 255, 255, 1]; };
    for (const el of card.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el), fg = parse(cs.color), bg = bgOf(el); if (!fg) continue;
      const L1 = lum(fg), L2 = lum(bg), k = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), fs = parseFloat(cs.fontSize);
      const need = fs >= 18 || (fs >= 14 && +cs.fontWeight >= 700) ? 3 : 4.5;
      if (k < need - 0.01) out.push(`[${label}] КОНТРАСТ ${k.toFixed(2)} «${el.textContent.trim().slice(0, 30)}»`);
      if (fs < (mobile ? 10.5 : 10)) out.push(`[${label}] мелкий шрифт ${fs}px «${el.textContent.trim().slice(0, 30)}»`);
    }
    const txt = card.innerText; const junk = txt.match(/.{0,20}(NaN|не число|undefined|Infinity|\[object|null ₽).{0,20}/);
    if (junk) out.push(`[${label}] МУСОР В ТЕКСТЕ: ${junk[0]}`);
    return out;
  }, [label, mobile]);
}
const cur = (p) => p.evaluate(() => (BK.Tutorial.current && !document.getElementById('tut').hidden ? BK.Tutorial.current : null));
async function waitStep(p, id, label) {
  const ok = await p.waitForFunction((id) => BK.Tutorial.current === id && !document.getElementById('tut').hidden, id, { timeout: 4000 }).then(() => true, () => false);
  if (!ok) issues.push(`[${label}] не появился шаг «${id}» (сейчас: ${await p.evaluate(() => BK.Tutorial.current)})`);
  await p.waitForTimeout(260); // анимации обводки и прокрутки
  return ok;
}
async function clickCard(p, what) {
  try { await p.click(`#tut .tut-card [data-tut="${what}"]`, { timeout: 3000 }); } catch (e) { issues.push(`[клик] нет кнопки карточки «${what}» (шаг ${await p.evaluate(() => BK.Tutorial.current)})`); }
  await p.waitForTimeout(120);
}
// кликнуть «настоящий» элемент страницы (как игрок: мышью или пальцем), а не через evaluate
async function tapKey(p) {
  const box = await p.evaluate(() => { const T = BK.Tutorial, S = BK.App.state, ui = BK.App.ui, st = T.STEPS.find((x) => x.id === T.current); const k = (st.key && st.key(S, ui)) || st.target(S, ui); const r = k.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(box.x, box.y); await p.waitForTimeout(150);
}

async function run(b, vp, theme) {
  const mobile = vp[0] === 'm', tag = `${vp}-${theme}`;
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const p = await openPage(b, vp, { dark: theme === 'dark', seed: 5, tutorial: true });
  const shot = async (name, o = {}) => {
    await p.screenshot({ path: path.join(dir, `${name}.png`) });
    if (o.card !== false) issues.push(...await cardCheck(p, `${tag} ${name}`, mobile));
  };
  // стартовый экран: переключатель по умолчанию «вкл» (сохранений нет)
  const def = await p.evaluate(() => document.querySelector('#start [data-tutopt="1"]').getAttribute('aria-pressed'));
  if (def !== 'true') issues.push(`[${tag}] на чистом браузере обучение по умолчанию не включено`);
  await p.evaluate(() => { const el = document.querySelector('.tut-opt'); el.scrollIntoView({ block: 'center' }); });
  await shot('00-start', { card: false });
  issues.push(...await layoutCheck(p, `${tag} старт`, { mobile }));
  if (mobile) { const small = await p.evaluate(() => [...document.querySelectorAll('.tut-opt button')].filter((x) => x.getBoundingClientRect().height < 39.5).length); if (small) issues.push(`[${tag}] переключатель обучения меньше 40 px`); }
  await p.click('#startForm button[type=submit]'); await p.waitForTimeout(200);

  // 1. цех
  await waitStep(p, 'prod', tag); await shot('01-prod');
  const prodOk = await p.evaluate(() => { const pp = BK.TutAdvice.prodPick(BK.App.state); return { best: pp.best.o.district, center: pp.center.o.district, same: pp.best === pp.center }; });
  notes.push(`${tag}: цех — советуем ${prodOk.best}, ближе всех к центру ${prodOk.center}`);
  await tapKey(p);
  if ((await p.evaluate(() => BK.App.state.phase)) !== 'setup_store') issues.push(`[${tag}] клик по подсвеченной кнопке не арендовал цех`);
  // 2. первая точка (в тёмной теме — с запасом денег: кредит не нужен, и шаг 5 «Кредит» проходится отдельно)
  if (theme === 'dark') await p.evaluate(() => { BK.App.state.cash += 4e6; BK.App.refresh(); });
  await waitStep(p, 'store', tag); await shot('02-store');
  if (await p.locator('#tut [data-tut="loan5"]').count()) { await clickCard(p, 'loan5'); await p.waitForTimeout(150); }
  await tapKey(p);
  const afterRent = await p.evaluate(() => ({ phase: BK.App.state.phase, modal: !!BK.App.ui.modal, cash: BK.App.state.cash }));
  if (afterRent.phase !== 'play') issues.push(`[${tag}] клик по подсвеченной кнопке не арендовал точку`);
  if (afterRent.modal) issues.push(`[${tag}] при обучении всё равно открылось старое окно «Время пошло»`);
  // 3. время
  await waitStep(p, 'time', tag); await shot('03-time');
  if ((await p.evaluate(() => BK.App.ui.speed)) !== 0) issues.push(`[${tag}] на шаге «время» игра не на паузе`);
  await clickCard(p, 'ok');
  // 4. «Сводка»
  await waitStep(p, 'dash', tag); await shot('04-dash');
  // сохранение посреди обучения: после перезагрузки шаг продолжается
  await p.evaluate(() => BK.App.save()); await p.reload(); await p.waitForTimeout(200);
  await p.click('[data-act="continue"]'); await p.waitForTimeout(200);
  await waitStep(p, 'dash', `${tag} после перезагрузки`);
  await clickCard(p, 'ok');
  // 5. кредит: сначала вкладка «Финансы», потом «Взять 5 млн»
  const hadLoan = await p.evaluate(() => BK.App.state.loan > 0);
  if (!hadLoan) {
    await waitStep(p, 'loan', tag); await shot('05-loan-tab');
    await tapKey(p); await p.waitForTimeout(250);
    await shot('05b-loan-btn');
    await tapKey(p); await p.waitForTimeout(150);
    if (!(await p.evaluate(() => BK.App.state.loan > 0))) issues.push(`[${tag}] кредит не взят кликом по подсвеченной кнопке`);
  } else notes.push(`${tag}: кредит взят ещё на шаге «первая точка» — шаг 5 пропущен`);
  // 6. распределение прибыли
  await waitStep(p, 'alloc', tag); await shot('06-alloc');
  await clickCard(p, 'alloc');
  const al = await p.evaluate(() => BK.App.state.alloc);
  if (Math.abs(al.reserve) > 0.001 || Math.abs(al.bonus - 0.03) > 0.001 || Math.abs(al.marketing - 0.04) > 0.001) issues.push(`[${tag}] кнопка «0 / 3 / 4%» не выставила распределение: ${JSON.stringify(al)}`);
  // 7. зарплата
  await waitStep(p, 'team', tag); await shot('07-team');
  await clickCard(p, 'pay');
  await p.waitForTimeout(300);
  const sp = await p.evaluate(() => ({ speed: BK.App.ui.speed, cur: BK.Tutorial.current, pay: BK.App.state.pay.seller / BK.App.state.market.seller }));
  if (sp.pay < 1.04) issues.push(`[${tag}] «Рынок +6%» не поднял зарплату (${sp.pay.toFixed(3)})`);
  if (sp.speed === 0) issues.push(`[${tag}] после стартовых шагов время не пошло`);
  if (sp.cur) issues.push(`[${tag}] после стартовых шагов висит шаг «${sp.cur}»`);
  // 8. первое 1-е число
  await tickDays(p, 40); await realTicks(p, 2);
  await waitStep(p, 'first1', tag); await shot('08-first1');
  await clickCard(p, 'ok');
  // 10. событие с выбором (вызываем пораньше, пропуская события без выбора)
  await p.evaluate(() => {
    const S = BK.App.state, E = BK.Engine; BK.App.setSpeed(0);
    for (let k = 0; k < 400 && !(S.ev.pending && S.ev.pending.choices && S.ev.pending.choices.length > 1); k++) {
      if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []);
      if (E.dateOf(S.day + 1).d === 1) S.cash += 3e6; // не уходить в разрыв, пока ищем событие
      S.ev.next = Math.min(S.ev.next, S.day + 1); E.tick(S);
    }
    S.notify = [];
  });
  await waitStep(p, 'event', tag); await shot('10-event');
  const evIdx = await p.evaluate(() => BK.TutAdvice.cheapestChoice(BK.App.state.ev.pending));
  await tapKey(p); await p.waitForTimeout(150);
  const evLeft = await p.evaluate(() => !!BK.App.state.ev.pending);
  if (evLeft) issues.push(`[${tag}] событие не закрылось кликом по подсвеченному варианту ${evIdx}`);
  // 9. кассовый разрыв: денег мало → прогноз «не хватит»
  await p.evaluate(() => { const S = BK.App.state; S.loan = Math.min(S.loan, 1e6); S.cash = 2e5; if (!(BK.TutAdvice.gap(S) > 0)) S.cash = 0; if (!(BK.TutAdvice.gap(S) > 0)) S.cash = -1e5; BK.App.refresh(); });
  await waitStep(p, 'gap', tag); await shot('09-gap');
  for (let k = 0; k < 4 && await p.evaluate(() => BK.Tutorial.current === 'gap'); k++) { if (await p.locator('#tut [data-tut="loan5"]').count()) await clickCard(p, 'loan5'); else await clickCard(p, 'ok'); await p.waitForTimeout(300); }
  if ((await p.evaluate(() => BK.Tutorial.current)) === 'gap') issues.push(`[${tag}] шаг «кассовый разрыв» не закрылся после кредита`);
  // 11. вторая точка: первая в плюсе
  await p.evaluate(() => { const S = BK.App.state; S.cash += 8e6; for (const st of S.stores) if (st.last) st.last.profit = Math.max(st.last.profit, 4e5); BK.App.refresh(); });
  await waitStep(p, 'second', tag); await shot('11-second');
  const rec = await p.evaluate(() => { const n = BK.TutAdvice.nextStore(BK.App.state); return n.ok ? n.pick.o.id : null; });
  if (rec) { await tapKey(p); if ((await p.evaluate(() => BK.App.state.stores.length)) < 2) issues.push(`[${tag}] не открылась вторая точка по подсвеченной кнопке`); }
  else { notes.push(`${tag}: на шаге «вторая точка» подходящего помещения нет`); await clickCard(p, 'ok'); await p.evaluate(() => { const S = BK.App.state; const o = S.offers[0]; if (o) BK.Engine.rentStore(S, o.id); }); }
  if ((await p.evaluate(() => BK.Tutorial.current)) === 'second') await clickCard(p, 'ok');
  // 12. финал
  await waitStep(p, 'final', tag); await shot('12-final');
  await clickCard(p, 'ok');
  const fin = await p.evaluate(() => ({ on: BK.App.state.tutorial.on, done: BK.App.state.tutorial.done.length, speed: BK.App.ui.speed }));
  if (fin.on) issues.push(`[${tag}] после финала обучение не выключилось`);
  notes.push(`${tag}: пройдено шагов ${fin.done} из 12`);
  // «Меню игры» → «Пройти обучение заново» → карточка → «Пропустить обучение»
  await p.evaluate(() => BK.App.ACT.settings()); await p.waitForTimeout(150);
  if (!(await p.locator('#modal [data-act="tutRestart"]').count())) issues.push(`[${tag}] в «Меню игры» нет «Пройти обучение заново»`);
  else {
    await p.locator('#modal [data-act="tutRestart"]').scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(dir, '12b-settings.png') });
    await p.click('#modal [data-act="tutRestart"]'); await p.waitForTimeout(400);
    const c = await cur(p);
    if (!c) issues.push(`[${tag}] после «Пройти обучение заново» карточка не появилась`);
    else { await shot('13-restart'); await clickCard(p, 'skip'); if (await p.evaluate(() => BK.App.state.tutorial.on)) issues.push(`[${tag}] «Пропустить обучение» не выключило обучение`); }
  }
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`));
  await p.context().close();
}

/* ---------- выбор запоминается; старое сохранение — без обучения; выключенное обучение не показывает карточек ---------- */
async function prefs(b) {
  const tag = 'настройки';
  const p = await openPage(b, 'd1440', { seed: 3, tutorial: true });
  await p.click('#start [data-tutopt="0"]'); await p.reload(); await p.waitForTimeout(150);
  if ((await p.evaluate(() => document.querySelector('#start [data-tutopt="0"]').getAttribute('aria-pressed'))) !== 'true') issues.push(`[${tag}] выбор «выкл» не запомнился`);
  await p.click('#startForm button[type=submit]'); await p.waitForTimeout(200);
  await p.click('[data-act="rentProd"]:not([disabled])'); await p.click('[data-act="rent"]:not([disabled])'); await p.waitForTimeout(200);
  const s = await p.evaluate(() => ({ on: BK.App.state.tutorial.on, card: !document.getElementById('tut') || document.getElementById('tut').hidden, modal: !!BK.App.ui.modal }));
  if (s.on || !s.card) issues.push(`[${tag}] обучение «выкл», но карточка показана`);
  if (!s.modal) issues.push(`[${tag}] без обучения не открылось окно «Время пошло»`);
  // старое сохранение (без S.tutorial) — обучение выключено
  const old = await p.evaluate(() => { const c = Object.assign({}, BK.App.state); delete c.cache; delete c.tutorial; c.notify = []; return JSON.stringify(c); });
  const q = await openPage(b, 'd1440', { save: old, tutorial: true });
  await q.click('[data-act="continue"]'); await q.waitForTimeout(400);
  const o = await q.evaluate(() => ({ on: !!(BK.App.state.tutorial && BK.App.state.tutorial.on), hidden: !document.getElementById('tut') || document.getElementById('tut').hidden }));
  if (o.on || !o.hidden) issues.push(`[${tag}] старое сохранение показало обучение`);
  // есть сохранения — по умолчанию выкл (если игрок ничего не выбирал)
  const q2 = await openPage(b, 'd1440', { save: old, tutorial: true });
  await q2.evaluate(() => localStorage.removeItem('bk-ufa-tutorial')); await q2.reload(); await q2.waitForTimeout(150);
  if ((await q2.evaluate(() => document.querySelector('#start [data-tutopt="1"]').getAttribute('aria-pressed'))) !== 'false') issues.push(`[${tag}] при наличии сохранений обучение по умолчанию включено`);
  notes.push(`${tag}: выбор запоминается, старое сохранение — без обучения, есть сохранения — по умолчанию выкл`);
  errors.push(...p.errs.map((e) => `[${tag}] ${e}`), ...q.errs.map((e) => `[${tag} old] ${e}`), ...q2.errs.map((e) => `[${tag} q2] ${e}`));
  for (const x of [p, q, q2]) await x.context().close();
}

(async () => {
  const b = await chromium.launch();
  const t0 = Date.now();
  const only = process.env.TUT_VP;
  for (const [vp, th] of [['d1440', 'light'], ['d1440', 'dark'], ['m390', 'light'], ['m390', 'dark'], ['m360', 'light']]) { if (only && only !== vp + '-' + th) continue; log('▶', vp, th); await run(b, vp, th).catch((e) => issues.push(`[${vp}-${th}] СЦЕНАРИЙ УПАЛ: ${e.message.split('\n')[0]}`)); }
  log('▶ настройки'); await prefs(b);
  await b.close();
  const txt = [`Обучение новичка — ${new Date().toISOString()} (${Math.round((Date.now() - t0) / 1000)} с)`, '', `ПРОБЛЕМЫ: ${issues.length}`, ...issues, '', `ОШИБКИ КОНСОЛИ: ${errors.length}`, ...errors, '', 'ЗАМЕТКИ:', ...notes].join('\n');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), txt);
  log(txt);
  process.exitCode = issues.length || errors.length ? 1 : 0;
})();
