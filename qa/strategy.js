/* Стратегии (этап 3 плана; логика — src/strategy.js, интерфейс — src/ui/strategy-ui.js): node qa/strategy.js [папка]
   Проверяем:
     1) стартовый экран — «Как играем?»: четыре карточки путей и «Пусть сложится сама» (по умолчанию),
        пояснение меняется при выборе;
     2) выбор применяется к партии: S.strat + постоянные модификаторы пути (S.mods, src: 'strat') и цена открытия;
     3) путь виден в «Меню игры» и его можно сменить или снять в первые полгода;
     4) в прологе «Бариста» выбор пути скрыт — путь выпадает случайно.
   Экраны 1440 / 390 / 360, светлая и тёмная тема. Итог — список проблем и ошибок консоли; код выхода 1, если они есть. */
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'strategy'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const RUNS = [['d1440', false], ['d1440', true], ['m390', false], ['m390', true], ['m360', false], ['m360', true]];
const FULL = new Set(['d1440-light', 'm390-dark']);      // глубокая проверка — ПК и телефон в разных темах
const PATHS = { premium: 'Премиум', folk: 'Народная', coffee: 'Кофейни', cafe: 'Пекарня-кафе' };

async function check(p, label, root, mobile) { for (const x of await layoutCheck(p, label, { root, mobile })) issues.push(x); }
async function shot(p, name) { await p.screenshot({ path: path.join(OUT, name + '.png') }); }
// истории партии в этом тесте не нужны: помечаем все пройденными до нажатия «Новая игра» (выбор живой, без перезагрузки)
const noStories = (p) => p.evaluate(() => { try { localStorage.setItem('bk-ufa-scen-done', JSON.stringify(['legacy', 'rescue', 'crisis', 'moscow', 'coffee'])); } catch (e) {} });

async function startScreen(p, tag, mobile) {
  await p.waitForSelector('#startForm .stratpick');
  const s = await p.evaluate(() => {
    const f = document.querySelector('#startForm .stratpick');
    const labels = [...f.querySelectorAll('.spath')], radios = [...f.querySelectorAll('input[name=strategy]')];
    return {
      hidden: f.hidden, legend: f.querySelector('legend').textContent.trim(),
      auto: labels.filter((l) => l.classList.contains('auto')).length,
      names: labels.map((l) => (l.querySelector('.sp-n') || {}).textContent || ''),
      checked: radios.filter((r) => r.checked).map((r) => r.value),
      desc: document.getElementById('stratDesc').textContent.trim(),
      note: document.getElementById('stratAuto') ? document.getElementById('stratAuto').hidden : null,
      val: f.form.strategyValue ? f.form.strategyValue() : null,
    };
  });
  if (s.hidden) issues.push(`[${tag}] блок «Как играем?» скрыт в обычном старте`);
  if (s.legend !== 'Как играем?') issues.push(`[${tag}] заголовок блока «${s.legend}»`);
  if (s.names.length !== 5 || s.auto !== 1) issues.push(`[${tag}] карточек ${s.names.length} (из них «сложится сама» ${s.auto}), ожидалось 5 и 1`);
  for (const n of Object.values(PATHS)) if (!s.names.includes(n)) issues.push(`[${tag}] нет карточки пути «${n}»: ${s.names.join(', ')}`);
  if (s.checked.join() !== 'auto') issues.push(`[${tag}] по умолчанию выбрано «${s.checked.join() || 'ничего'}», ожидалось «Пусть сложится сама»`);
  if (s.note !== true) issues.push(`[${tag}] подсказка о случайном пути видна в обычном старте`);
  if (!/сложится сама|определится/.test(s.desc)) issues.push(`[${tag}] пояснение по умолчанию: «${s.desc}»`);
  if (s.val !== '') issues.push(`[${tag}] форма без выбора отдаёт «${s.val}» вместо «сложится сама»`);
  // выбор пути: пояснение меняется, значение формы — id пути
  await p.evaluate(() => { const r = document.querySelector('#startForm input[name=strategy][value=premium]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  const sel = await p.evaluate(() => {
    const d = document.getElementById('stratDesc'), pth = BK.Strat.path('premium');
    return { desc: d.textContent.replace(/\s+/g, ' ').trim(), cls: d.className, val: document.querySelector('#startForm').strategyValue(), name: pth.name, plus: pth.plus, minus: pth.minus };
  });
  if (!sel.desc.includes(sel.name) || !sel.desc.includes(sel.plus) || !sel.desc.includes(sel.minus)) issues.push(`[${tag}] пояснение пути: «${sel.desc}»`);
  if (sel.val !== 'premium') issues.push(`[${tag}] форма отдаёт «${sel.val}» вместо premium`);
  await check(p, `${tag} старт`, null, mobile);
  await shot(p, `${tag}-01-start`);
  // обратно «сложится сама» — так и начнём пролог ниже
  await p.evaluate(() => { const r = document.querySelector('#startForm input[name=strategy][value=auto]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
}

async function game(p, tag, mobile) {
  // --- выбор пути применяется к партии ---
  await p.evaluate(() => { const r = document.querySelector('#startForm input[name=strategy][value=premium]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.fill('#companyName', 'Путь QA');
  await noStories(p);
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => { const S = BK.App.state; return S && S.phase === 'setup_prod' && document.getElementById('start').hidden; }, null, { timeout: 8000 });
  const ap = await p.evaluate(() => {
    const S = BK.App.state, St = BK.Strat, pth = St.path('premium');
    return { id: S.strat && S.strat.id, chosen: !!(S.strat && S.strat.chosen), random: !!(S.strat && S.strat.random), openK: St.openMult(S), wantK: pth.openK, info: St.info(S), mods: (S.mods || []).filter((m) => m.src === 'strat').map((m) => `${m.t}:${m.m}`).sort() };
  });
  if (ap.id !== 'premium' || !ap.chosen || ap.random) issues.push(`[${tag}] выбор «Премиум» не применён: ${JSON.stringify({ id: ap.id, chosen: ap.chosen, random: ap.random })}`);
  if (Math.abs(ap.openK - ap.wantK) > 1e-6) issues.push(`[${tag}] цена открытия пути ×${ap.openK}, ожидалось ×${ap.wantK}`);
  const want = ['check:1.12', 'conv:0.98', 'traffic:0.85'];
  if (ap.mods.join() !== want.join()) issues.push(`[${tag}] модификаторы пути: ${ap.mods.join(', ') || 'нет'} (ожидалось ${want.join(', ')})`);
  if (!ap.info || ap.info.name !== 'Премиум') issues.push(`[${tag}] «Сводка» не знает путь: ${JSON.stringify(ap.info && ap.info.name)}`);
  notes.push(`${tag}: путь «Премиум», цена открытия ×${ap.openK}, модификаторы ${ap.mods.join(', ')}`);

  // --- путь виден в «Меню игры» ---
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.ACT.settings(); });
  await p.waitForSelector('#modal .modal');
  const row = await p.evaluate(() => {
    const r = document.querySelector('#modal .strat-set');
    return r ? { txt: r.textContent.replace(/\s+/g, ' ').trim(), btn: (r.querySelector('button') || {}).textContent || '' } : null;
  });
  if (!row) issues.push(`[${tag}] в «Меню игры» нет строки «Стратегия»`);
  else if (!row.btn.includes('Премиум')) issues.push(`[${tag}] строка «Стратегия» показывает «${row.btn}» вместо «★ Премиум»`);
  await check(p, `${tag} меню игры`, null, mobile);
  await shot(p, `${tag}-02-menu`);
  await p.click('#modal .strat-set [data-act=strat]');
  await p.waitForSelector('#modal .strat-modal');
  const w = await p.evaluate(() => {
    const cur = document.querySelector('#modal .strat-modal .spath.on');
    return {
      cards: document.querySelectorAll('#modal .strat-modal .spath').length,
      cur: cur ? cur.textContent.replace(/\s+/g, ' ').trim() : '', yours: /ваш путь/.test(cur ? cur.textContent : ''),
      now: document.querySelector('#modal .st-now') ? document.querySelector('#modal .st-now').textContent.replace(/\s+/g, ' ').trim() : '',
      reset: !!document.querySelector('#modal .strat-modal .st-reset'),
    };
  });
  if (w.cards !== 4) issues.push(`[${tag}] в окне путей ${w.cards} карточек, ожидалось 4`);
  if (!w.cur.includes('Премиум') || !w.yours) issues.push(`[${tag}] текущий путь в окне не отмечен: «${w.cur}»`);
  if (!/Премиум/.test(w.now) || !/вами/.test(w.now)) issues.push(`[${tag}] подвал окна: «${w.now}»`);
  if (!w.reset) issues.push(`[${tag}] нет кнопки «Пусть сложится сама — снять выбор»`);
  await check(p, `${tag} окно путей`, '#modal .modal', mobile);
  await shot(p, `${tag}-03-paths`);

  // --- смена пути: модификаторы заменяются, а не копятся ---
  await p.click('#modal [data-act=stratPick][data-arg=folk]');
  await p.waitForTimeout(250);
  const folk = await p.evaluate(() => ({ id: BK.App.state.strat.id, chosen: BK.App.state.strat.chosen, mods: (BK.App.state.mods || []).filter((m) => m.src === 'strat').map((m) => `${m.t}:${m.m}`).sort(), row: (document.querySelector('#modal .strat-set button') || {}).textContent || '' }));
  if (folk.id !== 'folk' || !folk.chosen) issues.push(`[${tag}] смена пути не прошла: ${JSON.stringify(folk)}`);
  if (folk.mods.join() !== 'check:0.88,conv:1.02,traffic:1.18') issues.push(`[${tag}] модификаторы после смены: ${folk.mods.join(', ')}`);

  // --- снять выбор: «пусть сложится сама» ---
  await p.click('#modal [data-act=stratPick][data-arg=none]');
  await p.waitForTimeout(250);
  const none = await p.evaluate(() => ({ id: BK.App.state.strat.id, chosen: BK.App.state.strat.chosen, mods: (BK.App.state.mods || []).filter((m) => m.src === 'strat').length, block: document.querySelector('#pbody .stratb') ? document.querySelector('#pbody .stratb').textContent.replace(/\s+/g, ' ').trim() : null }));
  if (none.id !== null || none.chosen) issues.push(`[${tag}] «снять выбор» не сработало: ${JSON.stringify(none)}`);
  if (none.mods !== 0) issues.push(`[${tag}] после снятия выбора остались модификаторы пути: ${none.mods}`);
  if (none.block && !/не определился|сложится/.test(none.block)) issues.push(`[${tag}] блок «Стратегия» в «Сводке»: «${none.block}»`);
  // вернём путь и закроем окно
  await p.click('#modal [data-act=stratPick][data-arg=premium]');
  await p.waitForTimeout(200);
  const back = await p.evaluate(() => {
    const b = document.querySelector('#pbody .stratb');
    return { id: BK.App.state.strat.id, block: b ? b.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  if (back.id !== 'premium') issues.push(`[${tag}] путь не вернулся: ${JSON.stringify(back)}`);
  if (back.block && !/Премиум/.test(back.block)) issues.push(`[${tag}] блок «Стратегия» в «Сводке» не показывает путь: «${back.block}»`);
  await check(p, `${tag} сводка`, null, mobile);
  await shot(p, `${tag}-04-dash`);
  await p.evaluate(() => BK.App.ACT.closeModal());
  await p.waitForTimeout(150);
}

async function prologue(p, tag, mobile) {
  // --- в прологе выбор пути скрыт: путь выпадает случайно ---
  await p.evaluate(() => BK.App.toStart());
  await p.waitForSelector('#startForm');
  await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  const h = await p.evaluate(() => ({ pick: document.querySelector('#startForm .stratpick').hidden, note: document.getElementById('stratAuto') ? !document.getElementById('stratAuto').hidden : false, val: document.querySelector('#startForm').strategyValue() }));
  if (!h.pick) issues.push(`[${tag}] в прологе карточки путей видны`);
  if (!h.note) issues.push(`[${tag}] нет пояснения, что в прологе путь выпадет случайно`);
  if (h.val !== 'random') issues.push(`[${tag}] форма в прологе отдаёт «${h.val}» вместо random`);
  await check(p, `${tag} старт-пролог`, null, mobile);
  await shot(p, `${tag}-05-start-prologue`);
  await p.fill('#companyName', 'Пролог и путь');
  await noStories(p);
  await p.click('#startForm button[type=submit]');
  await p.waitForFunction(() => BK.PrologueUI && BK.PrologueUI.active(), null, { timeout: 8000 });
  const pro = await p.evaluate(() => { const S = BK.App.state; return { id: S.strat && S.strat.id, random: !!(S.strat && S.strat.random), chosen: !!(S.strat && S.strat.chosen), list: BK.Strat.list() }; });
  if (!pro.id || pro.list.indexOf(pro.id) < 0) issues.push(`[${tag}] в прологе путь не выпал: ${JSON.stringify(pro)}`);
  if (!pro.random || pro.chosen) issues.push(`[${tag}] путь в прологе не «случайный»: ${JSON.stringify(pro)}`);
  await check(p, `${tag} пролог`, '#proOv .pro-card', mobile);
  await shot(p, `${tag}-06-prologue`);
  notes.push(`${tag}: в прологе путь выпал случайно — «${pro.id}»`);
  await p.evaluate(() => { BK.PrologueUI.close(); });
}

(async () => {
  const browser = await chromium.launch();
  for (const [vp, dark] of RUNS) {
    const tag = `${vp}-${dark ? 'dark' : 'light'}`, mobile = vp[0] === 'm';
    const p = await openPage(browser, vp, { dark, seed: 4242 });
    try {
      await startScreen(p, tag, mobile);
      if (FULL.has(tag)) { await game(p, tag, mobile); await prologue(p, tag, mobile); }
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
  if (notes.length) console.log(notes.map((n) => '· ' + n).join('\n'));
  console.log(`${uniq.length} проблем, ${uniq.filter((x) => /CONSOLE|PAGEERR/.test(x)).length} ошибок консоли. Скриншоты: ${OUT}`);
  process.exit(uniq.length ? 1 : 0);
})();
