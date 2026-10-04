/* Истории (сценарии, этап 4 плана) в интерфейсе: node qa/scen-ui.js [папка=qa/shots/scen-ui]   (BR=webkit — WebKit)
   Смотрим то, что видит игрок:
     1) стартовый экран с 0 пройденными: четыре карточки, «ещё не пройдена», прогресс «Пройдено 0 из 4»,
        ссылки сброса нет;
     2) стартовый экран с 2 пройденными (localStorage['bk-ufa-scen-done']), сброс — только с подтверждением;
     3) начало партии: карточка «Новая история»; в итогах игры — блок «Пройдено N из 4» и кнопка
        «Начать заново — пройти другую историю»;
     4) «Начать заново» запускает новую партию с другой непройденной историей, обучение новичка при этом цело;
     5) все четыре пройдены: стартовый экран и итоги говорят об этом честно;
     6) пролог «Бариста»: карточка истории не лезет в пролог, появляется в своей сети.
   Экраны 1440 / 390 / 360, светлая и тёмная тема. Итог — список проблем и ошибок консоли; код выхода 1, если они есть. */
const fs = require('fs'), path = require('path');
const { chromium, webkit } = require('playwright');
const { openPage, layoutCheck } = require('./lib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'shots', 'scen-ui'));
fs.mkdirSync(OUT, { recursive: true });
const issues = [], notes = [];
const VIEW = { d1440: 1440, m390: 390, m360: 360 };
const sumRe = (n, t) => new RegExp(`Пройдено\\s*${n}\\s*из\\s*${t}`);

async function check(p, label, opts) { for (const x of await layoutCheck(p, label, opts || {})) issues.push(x); }
async function shot(p, name) { await p.screenshot({ path: path.join(OUT, name + '.png') }); }

// стартовый экран с нужным прогрессом историй: прогресс живёт в localStorage — ставим до перезагрузки
async function open(browser, vp, { dark, done, tutorial } = {}) {
  const p = await openPage(browser, vp, { dark: !!dark, seed: 7919 });
  await p.evaluate((o) => {
    try {
      localStorage.clear();
      if (o.done) localStorage.setItem('bk-ufa-scen-done', JSON.stringify(o.done));
      localStorage.setItem('bk-ufa-tutorial', o.tutorial ? '1' : '0');
    } catch (e) {}
  }, { done: done || null, tutorial: !!tutorial });
  await p.reload();
  await p.waitForSelector('#startForm .scenpick');
  return p;
}
// кнопки и крестики историй не меньше 34 px по высоте — по ним жмут пальцем
async function touchTargets(p, label) {
  const bad = await p.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('.scenpick button, .scen-start button, .scen-end button')) {
      const r = b.getBoundingClientRect(); if (r.width < 1) continue;
      if (r.height < 34) out.push(`${Math.round(r.width)}×${Math.round(r.height)} «${(b.textContent || '').trim().slice(0, 20)}»`);
    }
    return out;
  });
  for (const x of bad) issues.push(`[${label}] кнопка меньше 34 px: ${x}`);
}

(async () => {
  const browser = await (process.env.BR === 'webkit' ? webkit : chromium).launch();
  try {
    /* --- 1. стартовый экран: 0 пройдено, 1440/390/360, обе темы --- */
    for (const vp of ['d1440', 'm390', 'm360']) {
      for (const dark of [false, true]) {
        const tag = `start-0/${vp}/${dark ? 'тёмная' : 'светлая'}`, mobile = vp[0] === 'm';
        const p = await open(browser, vp, { dark });
        const s = await p.evaluate(() => ({
          cards: document.querySelectorAll('.scenpick .scen-card').length,
          done: document.querySelectorAll('.scenpick .scen-card.done').length,
          notDone: [...document.querySelectorAll('.scenpick .scen-card .scen-s')].filter((x) => x.textContent.trim() === 'ещё не пройдена').length,
          sum: document.querySelector('.scen-sum').textContent.replace(/\s+/g, ' ').trim(),
          reset: !!document.querySelector('.scenpick [data-scen-act=ask]'),
        }));
        if (!(s.cards === 4 && s.done === 0 && s.notDone === 4)) issues.push(`[${tag}] карточки: ${JSON.stringify(s)}`);
        if (!sumRe(0, 4).test(s.sum)) issues.push(`[${tag}] прогресс: «${s.sum}»`);
        if (s.reset) issues.push(`[${tag}] «Сбросить пройденные» видно, хотя пройденных нет`);
        await check(p, tag, { mobile });
        if (mobile) await touchTargets(p, tag);
        if (dark && vp === 'd1440') await shot(p, 'start0-1440-dark');
        if (vp === 'm360' && !dark) await shot(p, 'start0-360');
        for (const e of p.errs) issues.push(`[${tag}] ${e}`);
        await p.context().close();
      }
    }

    /* --- 2. 2 пройдено: отметки, сброс с подтверждением, карточка и итоги --- */
    for (const vp of ['d1440', 'm390']) {
      const tag = `start-2/${vp}`, mobile = vp[0] === 'm';
      const p = await open(browser, vp, { done: ['legacy', 'rescue'] });
      const s = await p.evaluate(() => ({
        done: [...document.querySelectorAll('.scenpick .scen-card.done .scen-s')].map((x) => x.textContent.trim()),
        todo: [...document.querySelectorAll('.scenpick .scen-card:not(.done) .scen-s')].map((x) => x.textContent.trim()),
        sum: document.querySelector('.scen-sum').textContent.replace(/\s+/g, ' ').trim(),
      }));
      if (!(s.done.length === 2 && s.todo.length === 2)) issues.push(`[${tag}] карточки: ${JSON.stringify(s)}`);
      if (!s.done.every((x) => x === 'пройдено ✓')) issues.push(`[${tag}] отметка пройденных: ${JSON.stringify(s.done)}`);
      if (!(sumRe(2, 4).test(s.sum) && /выпадет из оставшихся/.test(s.sum))) issues.push(`[${tag}] прогресс: «${s.sum}»`);
      await check(p, tag, { mobile });
      if (mobile) await touchTargets(p, tag);
      await shot(p, `start2-${vp}`);
      // сброс: подтверждение обязательно, до него прогресс не трогаем
      await p.click('.scenpick [data-scen-act=ask]');
      const conf = await p.evaluate(() => ({ yes: !!document.querySelector('[data-scen-act=yes]'), no: !!document.querySelector('[data-scen-act=no]'), raw: localStorage.getItem('bk-ufa-scen-done') }));
      if (!(conf.yes && conf.no)) issues.push(`[${tag}] нет подтверждения сброса`);
      if (!(conf.raw && conf.raw.indexOf('legacy') >= 0)) issues.push(`[${tag}] сброс произошёл до подтверждения`);
      await check(p, `${tag}/подтверждение`, { mobile });
      if (mobile) await shot(p, 'confirm-390');
      await p.click('.scenpick [data-scen-act=no]');
      const cancelled = await p.evaluate(() => !!document.querySelector('.scen-sum') && /Пройдено 2 из 4/.test(document.querySelector('.scen-sum').textContent));
      if (!cancelled) issues.push(`[${tag}] после «Отмены» прогресс поехал`);
      await p.click('.scenpick [data-scen-act=ask]');
      await p.click('.scenpick [data-scen-act=yes]');
      const after = await p.evaluate(() => ({ sum: (document.querySelector('.scen-sum') || {}).textContent || '', raw: localStorage.getItem('bk-ufa-scen-done'), done: document.querySelectorAll('.scenpick .scen-card.done').length }));
      if (!(sumRe(0, 4).test(after.sum) && after.raw === null && after.done === 0)) issues.push(`[${tag}] после сброса: ${JSON.stringify(after)}`);
      // новая партия: карточка «Новая история»
      await p.fill('#companyName', 'Проверка историй');
      await p.click('#startForm button[type=submit]');
      const shown = await p.waitForSelector('#scenStart:not([hidden]) .scs-card', { timeout: 9000 }).then(() => true, () => false);
      if (!shown) issues.push(`[${tag}] карточка «Новая история» не появилась`);
      if (shown) {
        const sc = await p.evaluate(() => {
          const b = document.querySelector('#scenStart .scs-card'), S = BK.App.state;
          return { id: S && S.scen && S.scen.id, text: b.textContent.replace(/\s+/g, ' ').trim(), x: document.querySelector('#scenStart .scs-x').getBoundingClientRect().height, w: b.getBoundingClientRect() };
        });
        if (!(/Новая история/.test(sc.text) && /Что делать:/.test(sc.text) && /пройдено 0 из 4/i.test(sc.text))) issues.push(`[${tag}] карточка: «${sc.text}»`);
        if (sc.x < 34) issues.push(`[${tag}] крестик карточки ${Math.round(sc.x)} px`);
        if (!(sc.w.left >= 0 && sc.w.right <= VIEW[vp])) issues.push(`[${tag}] карточка за краем экрана: ${JSON.stringify(sc.w)}`);
        await check(p, `${tag}/карточка истории`, { root: '#scenStart .scs-card', mobile });
        if (mobile) await touchTargets(p, `${tag}/карточка истории`);
        await shot(p, `card-${vp}`);
        await p.click('#scenStart .scs-x');
        const closed = await p.evaluate(() => document.querySelector('#scenStart').hidden);
        if (!closed) issues.push(`[${tag}] карточка не закрылась крестиком`);
        // блок «Пройдено N из 4» в итогах игры
        const res = await p.evaluate(() => {
          try { BK.Scenario.markDone(BK.App.state.scen.id); BK.App.state.lost = true; BK.Extras.openSummary(); } catch (e) { return 'ошибка: ' + e.message; }
          return { n: BK.Scenario.progress().played.length, total: BK.Scenario.progress().total };
        });
        if (typeof res !== 'object') issues.push(`[${tag}] итоги игры не открылись (${res})`);
        else {
          const has = await p.waitForSelector('#scenEnd', { timeout: 4000 }).then(() => true, () => false);
          if (!has) issues.push(`[${tag}] блока «Пройдено N из 4» в итогах нет`);
          else {
            await p.evaluate(() => { document.querySelector('#scenEnd').scrollIntoView({ block: 'center' }); });
            await p.waitForTimeout(150);
            const sm = await p.evaluate(() => {
              const b = document.querySelector('#scenEnd');
              return { text: b.textContent.replace(/\s+/g, ' ').trim(), again: (b.querySelector('[data-act=scenAgain]') || {}).textContent || '', h: b.querySelector('.scen-end-h').textContent.replace(/\s+/g, ' ').trim() };
            });
            if (!sumRe(res.n, res.total).test(sm.h)) issues.push(`[${tag}] крупный прогресс: «${sm.h}»`);
            if (!/Начать заново — пройти другую историю/.test(sm.again)) issues.push(`[${tag}] кнопка: «${sm.again}»`);
            if (!/не конец|впереди/.test(sm.text)) issues.push(`[${tag}] нет мысли «игра не закончилась»: «${sm.text.slice(0, 120)}»`);
            await check(p, `${tag}/итоги`, { mobile });
            if (mobile) await touchTargets(p, `${tag}/итоги`);
            await shot(p, `sum-${vp}`);
          }
        }
      }
      for (const e of p.errs) issues.push(`[${tag}] ${e}`);
      await p.context().close();
    }

    /* --- 3. «Начать заново» и соседство с обучением новичка --- */
    {
      const tag = 'обучение+заново/d1440';
      const p = await open(browser, 'd1440', { done: ['legacy', 'rescue'], tutorial: true });
      await p.fill('#companyName', 'Проверка');
      await p.click('#startForm button[type=submit]');
      await p.waitForSelector('#scenStart:not([hidden]) .scs-card', { timeout: 9000 }).catch(() => {});
      const hasTut = await p.waitForSelector('.tut-card', { timeout: 9000 }).then(() => true, () => false);
      if (!hasTut) issues.push(`[${tag}] карточка обучения не появилась`);
      // обучение не перекрыто: карточка истории ниже по слою, пересечения проверяем в разные моменты
      let mix = 0, za = '0', zb = '0';
      for (const wait of [400, 1500, 3000]) {
        await p.waitForTimeout(wait);
        const r = await p.evaluate(() => {
          const a = document.querySelector('#scenStart .scs-card'), b = document.querySelector('.tut-card');
          if (!a || !b) return null;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return { mix: !(ra.right <= rb.left || rb.right <= ra.left || ra.bottom <= rb.top || rb.bottom <= ra.top), za: getComputedStyle(document.querySelector('#scenStart')).zIndex, zb: getComputedStyle(document.querySelector('.tut') || b).zIndex };
        });
        if (!r) break;
        if (r.mix) mix++;
        za = r.za; zb = r.zb;
      }
      if (mix !== 0) issues.push(`[${tag}] карточка истории пересекается с обучением (${mix} из 3 моментов)`);
      if (!(+za < +zb)) issues.push(`[${tag}] слой истории ${za} не ниже обучения ${zb}`);
      // Tutorial deliberately shades inactive map controls. Check both live cards
      // and the real highlighted action, rather than treating shaded zoom as clickable.
      await check(p, tag + '/обучение', { root: '.tut-card' });
      await check(p, tag + '/история', { root: '#scenStart .scs-card' });
      const key = await p.evaluate(() => {
        const step = BK.Tutorial.STEPS.find(s => s.id === BK.Tutorial.current);
        const el = step && step.key && step.key(BK.App.state, BK.App.ui);
        return el ? { act: el.dataset.act, arg: el.dataset.arg } : null;
      });
      if (!key) issues.push(`[${tag}] нет подсвеченного действия обучения`);
      else await p.locator(`[data-act="${key.act}"][data-arg="${key.arg}"]`).click({ trial: true, timeout: 3000 })
        .catch(e => issues.push(`[${tag}] подсвеченное действие недоступно: ${e.message}`));
      await shot(p, 'tut-1440');
      const was = await p.evaluate(() => BK.App.state.scen.id);
      await p.evaluate(() => { BK.Scenario.markDone(BK.App.state.scen.id); BK.App.state.lost = true; BK.Extras.openSummary(); });
      await p.waitForSelector('#scenEnd [data-act=scenAgain]');
      await p.click('#scenEnd [data-act=scenAgain]');
      await p.waitForTimeout(500);
      const now = await p.evaluate(() => { const S = BK.App.state; return { id: S && S.scen && S.scen.id, day: S && S.day, modal: !!document.querySelector('#modal .modal'), done: BK.Scenario.done(), tut: !!(S && S.tutorial && S.tutorial.on) }; });
      if (!(now.id && now.id !== was)) issues.push(`[${tag}] новая партия не началась/та же история: ${JSON.stringify(now)} (было ${was})`);
      if (now.done.indexOf(now.id) >= 0) issues.push(`[${tag}] выпала уже пройденная история ${now.id}`);
      if (now.modal) issues.push(`[${tag}] окно итогов не закрылось`);
      if (!now.tut) issues.push(`[${tag}] обучение потерялось при перезапуске из итогов`);
      notes.push(`${tag}: «${was}» → «${now.id}», обучение ${now.tut ? 'сохранено' : 'потеряно'}`);
      await shot(p, 'again-1440');
      for (const e of p.errs) issues.push(`[${tag}] ${e}`);
      await p.context().close();
    }

    /* --- 4. пролог «Бариста»: карточка не лезет в пролог, появляется в своей сети --- */
    {
      const tag = 'пролог/m390';
      const p = await open(browser, 'm390', { done: ['legacy'] });
      await p.evaluate(() => { const r = document.querySelector('#start input[name=startmode][value=prologue]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
      await p.fill('#companyName', 'Через пролог');
      await p.click('#startForm button[type=submit]');
      await p.waitForTimeout(1500);
      const inPro = await p.evaluate(() => ({ pro: !!(BK.PrologueUI && BK.PrologueUI.active()), card: !!document.querySelector('#scenStart') && !document.querySelector('#scenStart').hidden, scen: BK.App.state.scen && BK.App.state.scen.id }));
      if (!(inPro.pro && inPro.scen)) issues.push(`[${tag}] пролог не начался: ${JSON.stringify(inPro)}`);
      if (inPro.card) issues.push(`[${tag}] карточка истории показалась поверх пролога`);
      // пролог заканчиваем тем же путём, что и кнопка «Пропустить пролог» (BK.PrologueUI.toMain)
      await p.evaluate(() => BK.PrologueUI.toMain(true));
      const shown = await p.waitForSelector('#scenStart:not([hidden]) .scs-card', { timeout: 9000 }).then(() => true, () => false);
      if (!shown) issues.push(`[${tag}] после пролога карточка истории не появилась`);
      else {
        const t = await p.evaluate(() => document.querySelector('#scenStart .scs-card').textContent.replace(/\s+/g, ' ').trim());
        if (!/Новая история/.test(t)) issues.push(`[${tag}] карточка: «${t}»`);
        await check(p, `${tag}/после пролога`, { root: '#scenStart .scs-card', mobile: true });
        await touchTargets(p, `${tag}/после пролога`);
        await shot(p, 'prologue-390');
      }
      for (const e of p.errs) issues.push(`[${tag}] ${e}`);
      await p.context().close();
    }

    /* --- 5. все четыре пройдены: итоги и стартовый экран говорят об этом честно --- */
    {
      const tag = 'все 4/м360/тёмная';
      const all = ['legacy', 'rescue', 'crisis', 'moscow'];
      const p = await open(browser, 'm360', { dark: true, done: all });
      if (await p.evaluate(() => !!document.querySelector('.scenpick .scen-card:not(.done)'))) issues.push(`[${tag}] остались непройденные карточки`);
      const sum0 = await p.evaluate(() => document.querySelector('.scen-sum').textContent.replace(/\s+/g, ' ').trim());
      if (!(sumRe(4, 4).test(sum0) && /заново/.test(sum0))) issues.push(`[${tag}] прогресс на старте: «${sum0}»`);
      if (!(await p.evaluate(() => !!document.querySelector('.scenpick [data-scen-act=ask]')))) issues.push(`[${tag}] нет ссылки сброса при 4 из 4`);
      await check(p, tag, { mobile: true });
      await touchTargets(p, tag);
      await p.fill('#companyName', 'Всё пройдено');
      await p.click('#startForm button[type=submit]');
      await p.waitForTimeout(1500);
      if (!(await p.evaluate(() => !BK.App.state.scen.id))) issues.push(`[${tag}] при 4 из 4 выпал сценарий`);
      const sm = await p.evaluate(() => {
        BK.App.state.scen = { v: 1, id: 'moscow', at: 0, flags: {} };   // как будто играли «Старт в Москве» — последнюю из четырёх
        BK.App.state.lost = true; BK.Extras.openSummary();
        const b = document.querySelector('#scenEnd'); if (!b) return null;
        return { text: b.textContent.replace(/\s+/g, ' ').trim(), again: (b.querySelector('[data-act=scenAgain]') || {}).textContent || '', h: b.querySelector('.scen-end-h').textContent.replace(/\s+/g, ' ').trim(), left: !!b.querySelector('.scen-end-left') };
      });
      if (!sm) issues.push(`[${tag}] блока в итогах нет`);
      else {
        if (!sumRe(4, 4).test(sm.h)) issues.push(`[${tag}] крупный прогресс: «${sm.h}»`);
        if (sm.left) issues.push(`[${tag}] показан список «осталось пройти», хотя пройдено всё`);
        if (!/Начать заново/.test(sm.again)) issues.push(`[${tag}] кнопка: «${sm.again}»`);
        if (!/легенда|заново/.test(sm.text)) issues.push(`[${tag}] текст: «${sm.text.slice(0, 100)}»`);
        await p.evaluate(() => document.querySelector('#scenEnd').scrollIntoView({ block: 'center' }));
        await p.waitForTimeout(150);
        await check(p, `${tag}/итоги`, { mobile: true });
        await touchTargets(p, `${tag}/итоги`);
        await shot(p, 'sum-all-360-dark');
      }
      for (const e of p.errs) issues.push(`[${tag}] ${e}`);
      await p.context().close();
    }
  } catch (e) {
    issues.push('ИСКЛЮЧЕНИЕ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  const uniq = [...new Set(issues)];
  fs.writeFileSync(path.join(OUT, 'issues.txt'), uniq.join('\n') + '\n');
  console.log(uniq.length ? uniq.join('\n') : 'Проблем не найдено');
  if (notes.length) console.log(notes.map((n) => '· ' + n).join('\n'));
  console.log(`${uniq.length} проблем, ${uniq.filter((x) => /CONSOLE|PAGEERR/.test(x)).length} ошибок консоли. Скриншоты: ${OUT}`);
  process.exit(uniq.length ? 1 : 0);
})();
