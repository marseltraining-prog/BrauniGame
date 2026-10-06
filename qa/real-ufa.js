/* Настоящая Уфа на карте России у партии, начатой в Казани (ключ ufaCity): кружок есть, вход работает,
   карта — уфимская, домашний город подписан Казанью. node qa/real-ufa.js → qa/shots/real-ufa */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium, openPage, layoutCheck, realTicks } = require('./lib');
const BK = require('../sim/load'), E = BK.Engine, C = BK.Corp;
const OUT = path.join(__dirname, 'shots', 'real-ufa'); fs.mkdirSync(OUT, { recursive: true });
const issues = [], errs = [];
// сохранение: Казань, цех и точка, оборот для выхода в Россию
const S = E.newGame({ seed: 15838, city: 'kazan', company: 'Пекарня «Каравай»' });
S.cash = 1e9; E.chooseProduction(S, S.prodOffers[0].id); E.rentStore(S, S.offers[0].id);
for (let i = 0; i < 40; i++) E.tick(S);
S.phase = 'play'; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; C.ensure(S);
const sv = Object.assign({}, S); delete sv.cache; sv.notify = [];
{ const on = BK.CFG.STORY.ON; try { BK.CFG.STORY.ON = true; BK.Story.ensure(sv).mode = 'off'; } finally { BK.CFG.STORY.ON = on; } } // сцены не закрывают карту
(async () => {
  const b = await chromium.launch();
  for (const vp of ['d1440', 'm390']) {
    const p = await openPage(b, vp, { seed: 11 });
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`[${vp}] ${m.text()}`); });
    await p.evaluate((s) => localStorage.setItem('bk-ufa-save-v1', s), JSON.stringify(sv)); await p.reload(); await p.waitForTimeout(300);
    await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(300);
    await p.evaluate(() => { const S = BK.App.state; BK.App.setSpeed(0); S.notify.length = 0; BK.App.ui.modalQueue.length = 0; });
    await p.click('[data-act="russia"]'); await p.waitForTimeout(700);
    const ru = await p.evaluate(() => {
      const t = (id) => !!document.querySelector(`.ru-city[data-city="${id}"]`);
      return { n: document.querySelectorAll('.ru-city').length, ufaCity: t('ufaCity'), home: t('ufa'), kazan: t('kazan'), nan: [...document.querySelectorAll('.rusvg text')].some((x) => /NaN|undefined/.test(x.textContent)) };
    });
    if (ru.n !== 19) issues.push(`[${vp}] на карте ${ru.n} городов, ждали 19 (18 без Казани + настоящая Уфа + дом)`);
    if (!ru.ufaCity) issues.push(`[${vp}] нет кружка настоящей Уфы`);
    if (!ru.home) issues.push(`[${vp}] нет домашнего города`);
    const labels = await p.evaluate(() => [...document.querySelectorAll('.rusvg text')].map((x) => x.textContent));
    if (!labels.some((x) => x.startsWith('Уфа')) || !labels.some((x) => x.startsWith('Казань'))) issues.push(`[${vp}] подписи «Уфа»/«Казань» на карте: ${labels.includes('Уфа')}/${labels.includes('Казань')}`);
    if (ru.kazan) issues.push(`[${vp}] Казань показана дважды`);
    if (ru.nan) issues.push(`[${vp}] NaN/undefined в подписях карты`);
    await p.screenshot({ path: path.join(OUT, vp + '-russia.png') });
    const pt = await p.evaluate(() => { const r = document.querySelector('.ru-city[data-city="ufaCity"] .hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250);
    const sel = await p.evaluate(() => BK.App.ui.ruSel);
    if (sel !== 'ufaCity') issues.push(`[${vp}] клик по Уфе выбрал «${sel}»`);
    await p.screenshot({ path: path.join(OUT, vp + '-card.png') });
    issues.push(...await layoutCheck(p, `${vp} карточка Уфы`, {}));
    await p.click('[data-act="ruEnter"][data-arg="ufaCity"]'); await p.waitForTimeout(250);
    await p.click('#ruEnterOk'); await p.waitForTimeout(800);
    const k = await p.evaluate(() => { const S = BK.App.state; return { active: S.corp.active, city: BK.CITY.name, ufaWorld: BK.DISTRICTS === BK.UFA.DISTRICTS, offers: S.offers.length }; });
    if (k.active !== 'ufaCity' || k.city !== 'Уфа' || !k.ufaWorld || !k.offers) issues.push(`[${vp}] вход в Уфу: ${JSON.stringify(k)}`);
    await p.screenshot({ path: path.join(OUT, vp + '-ufa.png') });
    issues.push(...await layoutCheck(p, `${vp} Уфа`, {}));
    await p.close();
  }
  await b.close();
  for (const x of issues.concat(errs)) console.log(x);
  console.log(`НАСТОЯЩАЯ УФА UI: ${issues.length} проблем, ${errs.length} ошибок консоли`);
  process.exit(issues.length || errs.length ? 1 : 0);
})();
