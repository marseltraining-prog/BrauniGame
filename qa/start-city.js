/* Выбор города: первая/повторная партия, история, пролог, сохранения, телефон и Safari. */
const assert = require('assert/strict');
const fs = require('fs'), path = require('path');
const { chromium, webkit } = require('playwright');
const { openPage } = require('./lib');
const out = path.join(__dirname, 'shots', 'start-city');
fs.mkdirSync(out, { recursive: true });
let checks = 0;
const check = (v, text) => { assert.ok(v, text); checks++; };
async function fresh(b, vp, dark) {
  const p = await openPage(b, vp, { dark });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('bk-ufa-tutorial', '0'); });
  await p.reload();
  return p;
}
(async () => {
  const br = process.env.BR === 'webkit' ? webkit : chromium;
  const b = await br.launch();
  try {
    for (const vp of ['d1440', 'm390', 'm360']) for (const dark of [false, true]) {
      const p = await fresh(b, vp, dark);
      const start = await p.evaluate(() => ({
        n: document.querySelectorAll('[name=startCity]').length,
        expected: BK.CITIES.length,
        selected: document.querySelector('[name=startCity]:checked').value,
        locked: [...document.querySelectorAll('[name=startCity]:disabled')].map(x => x.value),
        width: document.documentElement.scrollWidth, view: innerWidth,
      }));
      check(start.n === start.expected && start.selected === 'ufa', 'все города, по умолчанию Уфа');
      check(start.locked.sort().join(',') === 'moscow,spb', 'закрыты только Москва и Петербург');
      check(start.width <= start.view + 1, `ширина ${vp}/${dark}`);
      await p.check('[name=startCity][value=kazan]');
      check(await p.locator('#cityDesc').innerText().then(x => x.includes('Казань')), 'описание выбранного города');
      await p.locator('.citypick').screenshot({ path: path.join(out, `${br.name()}-${vp}-${dark ? 'dark' : 'light'}.png`) });
      await p.click('#startForm button[type=submit]');
      await p.evaluate(() => BK.App.setSpeed(0));
      let state = await p.evaluate(() => ({ city: BK.CITY.id, home: BK.App.state.startCity, scen: BK.App.state.scen.id,
        fits: BK.App.state.offers.every(x => BK.DISTRICTS.some(d => d.id === x.district)) }));
      check(state.city === 'kazan' && state.home === 'kazan' && state.scen !== 'moscow' && state.fits, 'Казань и местные помещения');
      await p.evaluate(() => BK.App.save());
      await p.reload();
      await p.click('[data-act=continue]');
      check(await p.evaluate(() => BK.CITY.id === 'kazan' && BK.App.state.startCity === 'kazan'), 'Казань после загрузки');
      check(p.errs.length === 0, p.errs.join('\n'));
      await p.context().close();
    }
    const p = await fresh(b, 'd1440', false);
    check(await p.evaluate(() => {
      for (let seed = 0; seed < 1000; seed++) if (BK.Scenario.pick(seed, { city: 'ufa' }) === 'moscow') return false;
      return !BK.StartCity.complete(BK.Engine.newGame({ seed: 7 }));
    }), 'первая партия не переносит в Москву и не открывает большие города');
    await p.click('#startForm button[type=submit]');
    await p.evaluate(() => { BK.App.state.lost = true; BK.App.save(); BK.App.toStart(); });
    check(await p.locator('[name=startCity]:disabled').count() === 0, 'банкротство открывает большие города');
    await p.reload();
    check(await p.locator('[name=startCity][value=moscow]').isEnabled(), 'разблокировка переживает перезагрузку');
    await p.check('[name=startCity][value=moscow]');
    await p.evaluate(() => BK.Scenario.markDone('legacy'));
    await p.evaluate(() => { BK.Scenario.markDone('rescue'); BK.Scenario.markDone('crisis'); BK.Scenario.markDone('coffee'); }); // 0.9.19: пятая история
    await p.click('#startForm button[type=submit]');
    check(await p.evaluate(() => BK.CITY.id === 'moscow' && BK.App.state.scen.id === 'moscow'), 'московский сценарий только в выбранной Москве');
    await p.context().close();
    const pro = await fresh(b, 'm390', false);
    await pro.check('[name=startCity][value=ekb]');
    await pro.check('[name=startmode][value=prologue]');
    await pro.fill('#heroName', 'Александра');
    await pro.click('[data-hero=f]');
    await pro.click('#startForm button[type=submit]');
    check(await pro.evaluate(() => BK.CITY.id === 'ekb' && BK.App.state.prologue.hero.name === 'Александра'), 'город и имя в прологе');
    await pro.evaluate(() => { BK.PrologueUI.toMain(true); BK.Stage1UI.begin(BK.App.state); BK.App.save(); });
    check(await pro.evaluate(() => BK.CITY.id === 'ekb' && BK.App.state.startCity === 'ekb' && !!BK.App.state.stage1), 'город в своей кофейне');
    check(pro.errs.length === 0, pro.errs.join('\n'));
    await pro.context().close();
    const legacy = await fresh(b, 'd1440', false);
    await legacy.evaluate(() => localStorage.setItem('bk-ufa-scen-done', '["legacy"]'));
    await legacy.reload();
    check(await legacy.locator('[name=startCity][value=spb]').isEnabled(), 'старые завершённые истории открывают города');
    await legacy.context().close();
    const nostore = await fresh(b, 'd1440', false);
    check(await nostore.evaluate(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('нет хранилища'); }, configurable: true });
      BK.StartCity.complete({ won: true });
      return BK.StartCity.available('spb') && BK.StartCity.resolve('нет-города') === 'ufa';
    }), 'без хранилища и неизвестный город');
    await nostore.context().close();
    console.log(`ГОРОД СТАРТА (${br.name()}): ${checks} проверок, 0 проблем`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
