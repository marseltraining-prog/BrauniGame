/* Статистика: на локальном файле выключена и не ходит в сеть; на github.io включается,
   показывает плашку cookie и отправляет цель play_start. */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
let bad = 0;
const ok = (c, m, x) => { console.log((c ? '  ок   ' : '  БЕДА ') + m + (x === undefined ? '' : ' → ' + x)); if (!c) bad++; };
(async () => {
  const b = await chromium.launch();
  // 1. локально
  let p = await b.newPage(), net = [], errs = [];
  p.on('request', (r) => { if (/mc\.yandex|metrika/.test(r.url())) net.push(r.url()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL); await p.waitForTimeout(700);
  ok(await p.evaluate(() => BK.Analytics && BK.Analytics.on === false), 'локально статистика выключена');
  ok(net.length === 0, 'локально нет запросов к Метрике', net.length);
  ok(errs.length === 0, 'локально без ошибок', errs.join(' | '));
  await p.close();
  // 2. публичный домен (подменяем только документ, Метрику блокируем)
  p = await b.newPage({ viewport: { width: 390, height: 844 } }); net = []; errs = [];
  p.on('request', (r) => { if (/mc\.yandex|metrika/.test(r.url())) net.push(r.url()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.route('https://mc.yandex.ru/**', (r) => r.abort());
  await p.route('https://marseltraining-prog.github.io/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'dist', 'local.html'), 'utf8') }));
  await p.goto('https://marseltraining-prog.github.io/BrauniGame/play/'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => BK.Analytics.on === true), 'на github.io статистика включена');
  ok(await p.locator('#bk-cookie').count() === 1, 'плашка cookie показана');
  ok(net.length >= 1, 'счётчик Метрики запрошен', net.length);
  await p.evaluate(() => BK.App.newGame('Тест', 'normal', { seed: 7919 })); await p.waitForTimeout(300);
  const goals = await p.evaluate(() => (window.ym && window.ym.a || []).filter((x) => x[1] === 'reachGoal').map((x) => x[2]));
  ok(goals.includes('play_start'), 'цель play_start отправлена', goals.join(','));
  ok(errs.length === 0, 'на публичной странице без ошибок', errs.join(' | '));
  await b.close();
  console.log(`СТАТИСТИКА: ${bad ? bad + ' проблем' : 'всё в порядке'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
