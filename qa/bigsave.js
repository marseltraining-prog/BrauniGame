/* Большое сохранение (1000 точек второго акта, ~1,3 МБ): когда место в localStorage кончается, игра пишет
   сжатое сохранение (BK.SaveCodec), загружает его и показывает в списке слотов; если не влезает и сжатое —
   одно предупреждение «Игра не сохранилась». Состояние: node sim/perf.js 30 7919 --save=A && node sim/perf-big.js A 1000 --save B
   Запуск: node qa/bigsave.js B */
'use strict';
const fs = require('fs');
const { chromium, openPage } = require('./lib');
const file = process.argv[2];
const big = fs.readFileSync(file, 'utf8');
const issues = [], errs = [];
(async () => {
  const b = await chromium.launch();
  const p = await openPage(b, 'd1440', { seed: 11 });
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // 1. Свободно: большое сохранение пишется обычным JSON.
  const r1 = await p.evaluate((json) => { const st = JSON.parse(json); BK.App.continueGame(st); BK.App.setSpeed(0); BK.App.save(); const raw = localStorage.getItem('bk-ufa-save-v1'); return { len: raw.length, packed: BK.SaveCodec.packed(raw) }; }, big);
  if (r1.packed) issues.push('свободное место: сохранение сжато без нужды');
  // 2. Тесно: два других слота почти до предела — обычный JSON не влезает, сжатое влезает.
  // fill(free) — забить хранилище так, чтобы осталось примерно free символов (кусками всё мельче)
  const fillTo = (free) => p.evaluate((free) => {
    let n = 0; for (let sz = 1 << 20; sz >= 512; sz >>= 1) { const s = 'x'.repeat(sz); try { for (;;) localStorage.setItem('bk-fill-' + (n++), s); } catch (e) { n--; } }
    // освободить ~free: удаляем последние куски, пока не наберём
    let freed = 0; for (let k = n; k >= 0 && freed < free; k--) { const v = localStorage.getItem('bk-fill-' + k); if (v) { freed += v.length; localStorage.removeItem('bk-fill-' + k); } }
    return freed;
  }, free);
  // 2. Тесно: место есть только на сжатое (~0,5 млн символов), обычный JSON (1,38 млн) не влезает.
  await p.evaluate(() => localStorage.removeItem('bk-ufa-save-v1'));
  const freed2 = await fillTo(500000);
  const r2 = await p.evaluate(() => {
    BK.App.state.day += 1; BK.App.save();
    const raw = localStorage.getItem('bk-ufa-save-v1');
    return { saved: !!raw, packed: raw ? BK.SaveCodec.packed(raw) : null, kb: raw ? Math.round(raw.length / 1024) : 0, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ') };
  });
  r2.freed = freed2;
  if (!r2.saved || !r2.packed) issues.push('тесно: сжатое сохранение не записано ' + JSON.stringify(r2));
  // 3. Загрузка сжатого и строка слота.
  await p.reload(); await p.waitForTimeout(400);
  const r3 = await p.evaluate(() => { const s = BK.Slots.info(1); const row = document.querySelector('.slot') ? document.querySelector('.slot').textContent : ''; return { info: s && { stores: s.stores, broken: !!s.broken, company: s.company }, row }; });
  if (!r3.info || r3.info.broken || !r3.info.stores) issues.push('слот со сжатым сохранением не читается ' + JSON.stringify(r3.info));
  await p.click('[data-act="continue"][data-arg="1"]'); await p.waitForTimeout(800);
  const r4 = await p.evaluate(() => { const S = BK.App.state; return S && { day: S.day, cities: Object.keys(S.corp.cities).length, packedStores: Object.values(S.corp.cities).reduce((a, c) => a + (c.packed ? c.packed.stores.length : 0), 0) }; });
  if (!r4 || !r4.cities || r4.packedStores < 500) issues.push('сжатое сохранение не загрузилось ' + JSON.stringify(r4));
  // 4. Совсем нет места: одно понятное предупреждение, игра продолжается.
  await p.evaluate(() => localStorage.removeItem('bk-ufa-save-v1'));
  await fillTo(20000); // места почти нет — не влезет и сжатое
  const r5 = await p.evaluate(() => {
    BK.App.save(); BK.App.save();
    return { saved: !!localStorage.getItem('bk-ufa-save-v1'), toasts: [...document.querySelectorAll('.toast')].filter((t) => /не сохранилась/.test(t.textContent)).length };
  });
  if (r5.saved || r5.toasts !== 1) issues.push('нет места: ждали одно предупреждение ' + JSON.stringify(r5));
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('bk-fill-')) localStorage.removeItem(k); });
  await b.close();
  console.log(JSON.stringify({ r1, r2: Object.assign({}, r2, { toast: undefined }), r3: r3.info, r4, r5 }));
  for (const x of issues.concat(errs)) console.log(x);
  console.log(`БОЛЬШОЕ СОХРАНЕНИЕ: ${issues.length} проблем, ${errs.length} ошибок консоли`);
  process.exit(issues.length || errs.length ? 1 : 0);
})();
