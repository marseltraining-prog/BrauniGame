/* Музыка меняет сцену по акту: Уфа → Россия → холдинг, без перезапуска и без ошибок.
   Проверяет, что новая тема «Тёплый хлеб» действительно адаптивная, а не один файл на всё. */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
let bad = 0;
const ok = (c, m, x) => { console.log((c ? '  ок   ' : '  БЕДА ') + m + (x === undefined ? '' : ' → ' + x)); if (!c) bad++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL); await p.waitForTimeout(300);
  await p.evaluate(() => { BK.App.newGame('Тест звука', 'normal', { seed: 7919 }); BK.Sound.arm(); BK.Sound.sync(); });
  await p.mouse.click(30, 30);
  await p.evaluate(() => BK.Sound.music('game'));
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => BK.Sound.music()) === 'game', 'старт — тема сети');
  const gameInfo = await p.evaluate(() => BK.Sound.musicInfo('game'));
  ok(gameInfo.bpm === 96 && gameInfo.bars === 16, 'сеть: 96 BPM, 16 тактов', `${gameInfo.bpm} / ${gameInfo.bars}`);
  await p.evaluate(() => {
    const S = BK.App.state; S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S);
    if (!BK.Engine.enterCity(S, 'kazan').ok) throw Error('enter kazan');
    BK.App.refresh();
  });
  await p.waitForTimeout(1600);
  ok(await p.evaluate(() => BK.Sound.music()) === 'russia', 'после входа в Россию — тема России');
  const rInfo = await p.evaluate(() => BK.Sound.musicInfo('russia'));
  ok(rInfo.bpm === 100 && rInfo.cut > gameInfo.cut, 'Россия шире и ярче сети', `${rInfo.bpm} BPM, ${rInfo.cut} Гц`);
  await p.evaluate(() => { const S = BK.App.state; S.holding = { v: 1, path: 'ipo' }; BK.App.refresh(); });
  await p.waitForTimeout(1600);
  ok(await p.evaluate(() => BK.Sound.music()) === 'holding', 'с выбранным холдингом — тема холдинга');
  ok(await p.evaluate(() => BK.Sound.musicInfo('holding').bpm === 84), 'холдинг спокойнее (84 BPM)');
  ok(errs.length === 0, 'ошибок консоли нет', errs.join(' | ') || '0');
  await b.close();
  console.log(`МУЗЫКА ПО АКТАМ: ${bad ? bad + ' проблем' : 'всё в порядке'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
