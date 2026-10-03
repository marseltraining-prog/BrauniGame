/* qa/moment.js — заставка тяжёлого момента (BK.Moment) и личные (семейные) линии (BK.Story.fam*).
   Проверяем то, что просил владелец, а не «файл существует»:
     1. заставка показывается в тяжёлый момент: экран МЕДЛЕННО темнеет (чернота растёт во времени,
        а не появляется одним кадром), из черноты проявляется пиксельная сцена-намёк, строк — не больше двух;
     2. играет своя грустная 8-битная тема: BK.Sound.music() === 'sad' (у неё свой темп, минор и тембр —
        числа берём из BK.Sound.musicInfo('sad'));
     3. кнопка «Дальше» появляется, после неё заставка снимается, тема возвращается к игровой,
        пауза кончается и игра продолжается (сцена разрешена, состояние не сломано);
     4. личная линия видна ЗАРАНЕЕ: строка «Мама болеет — 4 дня, чтобы решить» в «Требует внимания»
        и блок «Свои люди» в «Сводке»; окно «Решить» применяет выбор, строка исчезает;
     5. 0 ошибок в консоли.
   Запуск: export NODE_PATH=~/.bk-tools/node_modules && node build.js && node qa/moment.js  */
const path = require('path');
const { chromium } = require('playwright');
const { openPage } = require('./lib');

let bad = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ок   ' : '  БЕДА ') + msg + (extra === undefined ? '' : ' → ' + extra)); if (!cond) bad++; };

// Сохранение для проверки: 12 лет игры «хорошим» ботом (сюжет в ботах выключен, поэтому состояние чистое),
// в него сюжет включим уже на странице.
function botSave(years, seed) {
  const { play } = require('../sim/bot');
  const r = play({ level: 'good', seed, years });
  const c = Object.assign({}, r.S);
  delete c.cache; delete c._botRng; c.notify = [];
  c.stores = c.stores.map((st) => { const x = Object.assign({}, st); delete x._bot; return x; });
  return c;
}

(async () => {
  const save = botSave(12, 20261003);
  const browser = await chromium.launch();
  const p = await openPage(browser, 'd1440');
  await p.evaluate((st) => {
    BK.CFG.STORY.ON = true;
    BK.App.continueGame(st);
    // сюжет включаем вручную: в сохранении бота его нет
    BK.Story.ensure(BK.App.state);
    const R = BK.Story.state(BK.App.state);
    R.f.zakvaska = 'mine'; R.f.ufa = 'russia';
    BK.App.state.story.seen.s36 = BK.App.state.day;    // закваска уже отдана — момент можно показывать
    R.famNext = BK.App.state.day + 1e6;                // личные дела заводим в тесте сами: так проверка детерминированная
    BK.App.setSpeed(0);                                // время стоит: ни события, ни сцены не мешают проверке
  }, save);
  await p.waitForTimeout(300);
  await p.keyboard.press('Tab');                        // первый жест: браузер разрешает звук

  /* ---------- 1. момент: медленное затемнение, сцена, музыка ---------- */
  console.log('1. Заставка тяжёлого момента');
  const shown = await p.evaluate(() => {
    const S = BK.App.state;
    BK.Story.start(S, BK.Story.scene('s4m1'));
    return BK.StoryUI.openScene();
  });
  ok(shown === true, 'заставка показана (сцена s4m1 → BK.Moment)');
  const at = async (ms, what) => p.evaluate((a) => {
    const root = document.getElementById('moment');
    const black = root && root.querySelector('.mom-black');
    return {
      what: a.what, has: !!root,
      black: black ? +(black.getBoundingClientRect && getComputedStyle(black).opacity) : null,
      phase: root ? root.className : '',
      canvas: !!(root && root.querySelector('.mom-scene-cv')),
      canvPix: (() => { const cv = root && root.querySelector('.mom-scene-cv'); if (!cv) return 0; try { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; } catch (e) { return -1; } })(),
      lines: root ? [...root.querySelectorAll('.mom-line')].map((el) => ({ t: el.textContent.trim().slice(0, 60), op: +getComputedStyle(el).opacity })) : [],
      btn: root ? (() => { const b = root.querySelector('.mom-next'); return b ? +getComputedStyle(b.closest('.mom-act')).opacity : -1; })() : -1,
      mood: BK.Sound ? BK.Sound.music() : '?',
      paused: !!BK.App.ui.modal,
    };
  }, { what });
  const s0 = await p.evaluate(() => ({
    has: !!document.getElementById('moment'),
    black: +(document.getElementById('moment').querySelector('.mom-black').getBoundingClientRect(), getComputedStyle(document.getElementById('moment').querySelector('.mom-black')).opacity),
    mood: BK.Sound.music(), paused: !!BK.App.ui.modal,
  }));
  ok(s0.has, 'слой #moment появился');
  ok(s0.paused, 'игра на паузе (модалка-держатель), время стоит');
  ok(s0.mood === 'sad', 'зазвучала грустная тема: BK.Sound.music() = sad', s0.mood);
  ok(s0.black < 0.25, 'в первый кадр экран ещё светлый (чернота ' + s0.black.toFixed(2) + ')');
  const mid = await (async () => { await p.waitForTimeout(1400); return at(1400, 'середина затемнения'); })();
  const dark = await (async () => { await p.waitForTimeout(2100); return at(3500, 'экран должен быть чёрным'); })();
  console.log('   t≈0,0 с:', JSON.stringify({ black: s0.black, mood: s0.mood }));
  console.log('   t≈1,4 с:', JSON.stringify({ black: mid.black, phase: mid.phase }));
  console.log('   t≈3,5 с:', JSON.stringify({ black: dark.black, canvas: dark.canvas, phase: dark.phase }));
  ok(mid.black > s0.black + 0.15, 'экран темнеет медленно (за 1,4 с чернота выросла с ' + s0.black.toFixed(2) + ' до ' + mid.black.toFixed(2) + ')');
  ok(dark.canvas, 'из темноты проявилась пиксельная сцена-намёк (canvas есть)');
  const late = await (async () => { await p.waitForTimeout(3000); return at(6500, 'сцена и строки'); })();
  console.log('   t≈6,5 с:', JSON.stringify({ black: late.black, pix: late.canvPix, lines: late.lines.length, mood: late.mood }));
  ok(late.canvPix > 200, 'сцена нарисована кодом (непустых пикселей ' + late.canvPix + ')');
  ok(late.lines.length >= 1 && late.lines.length <= 2, 'строк не больше двух (' + late.lines.length + ')');
  ok(late.lines[0].op > 0.5, 'первая строка проявилась');
  ok(late.black > 0.2 && late.black < 0.7, 'после проявления экран приглушён, но сцену видно (чернота ' + late.black.toFixed(2) + ')');
  const ready = await (async () => { await p.waitForTimeout(2000); return at(8500, 'кнопка'); })();
  ok(ready.btn > 0.5, 'кнопка «Дальше» проявилась (прозрачность ' + ready.btn + ')');
  const info = await p.evaluate(() => BK.Sound.musicInfo('sad'));
  console.log('   тема: ' + JSON.stringify(info));
  ok(info.mood === 'sad' && info.bpm <= 70, 'у темы свой неспешный темп (' + info.bpm + ' BPM)');
  ok(/минор/.test(info.key), 'тональность минорная (' + info.key + ')');
  ok(info.bars >= 8 && info.leadNotes > 20, 'это мелодия, а не «та же петля» (' + info.bars + ' тактов, ' + info.leadNotes + ' нот)');

  /* ---------- 2. «Дальше»: возврат в игру ---------- */
  console.log('2. «Дальше» — возврат в игру');
  await p.click('#moment .mom-next');
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => {
    const S = BK.App.state;
    return { has: !!document.getElementById('moment'), mood: BK.Sound.music(), paused: !!BK.App.ui.modal,
      pending: S.story.pending, gone: S.story.f.rashidGone, ev: !!S.ev.pending,
      log: (S.story.log.filter((x) => /Ночной звонок/.test(x.title || '')).slice(-1)[0] || {}).choice || '' };
  });
  console.log('   ' + JSON.stringify(after));
  ok(!after.has, 'заставка снялась');
  ok(after.mood === 'game', 'музыка вернулась к игровой теме', after.mood);
  ok(after.gone === true, 'последствие применено обычным путём (флаг rashidGone)');
  ok(after.pending == null, 'сцена закрыта — очередь пуста');
  ok(!!after.log, 'решение записано в летопись («Ночной звонок»: ' + after.log + ')');

  /* ---------- 3. личная линия видна заранее ---------- */
  console.log('3. Личная линия: видно заранее и есть срок');
  const fam = await p.evaluate(() => {
    const S = BK.App.state;
    BK.Threads.ensure(S);
    const t = BK.Story.famStart(S, BK.Story.famDefs().filter((d) => d.id === 'mama')[0]);
    BK.App.setSpeed(0);
    BK.App.refresh();
    const dash = document.getElementById('pbody').innerHTML;
    return { id: t && t.id, ask: t && t.ask, due: t && (t.due - S.day), dashFam: /Свои люди/.test(dash), dashAsk: /Мама болеет/.test(dash) };
  });
  console.log('   ' + JSON.stringify(fam));
  ok(!!fam.id, 'дело заведено в реестре нитей (BK.Threads)');
  ok(fam.due === 4, 'срок виден: 4 дня', fam.due);
  const att = await p.evaluate(() => {
    const items = BK.Threads.attItems(BK.App.state);
    const row = items.filter((x) => /Мама болеет/.test(x.t))[0] || null;
    // строка «Требует внимания» рисуется панелью: проверим, что она попала в разметку
    BK.App.refresh();
    const html = document.getElementById('pbody').innerHTML;
    return { row: row && { t: row.t, d: row.d, act: row.b.act, label: row.b.label }, inHtml: /Мама болеет — 4 дня, чтобы решить/.test(html) };
  });
  console.log('   ' + JSON.stringify(att));
  ok(!!att.row, 'строка в «Требует внимания»', att.row && att.row.t);
  ok(/4 дня, чтобы решить/.test(att.row.t), 'в строке — срок «4 дня, чтобы решить»', att.row.t);
  ok(att.row.act === 'fam' && att.row.label === 'Решить', 'у строки кнопка «Решить» (окно дела)');
  ok(att.inHtml, 'строка и блок «Свои люди» видны в панели');
  // предупреждение о сроке приходит тостом, а не падением на голову
  const warn = await p.evaluate(() => {
    const S = BK.App.state; let got = null;
    const I = BK.Engine._int;
    const old = I.toast; I.toast = (s, title, text, kind) => { got = { title, text, kind }; return old.call(I, s, title, text, kind); };
    const t = BK.Threads.byId(S, 'fam-mama');
    t.warned = {}; t.due = S.day + 1;      // подводим срок
    BK.Story.famDay(S); BK.Story.famDay(S);
    I.toast = old;
    return got;
  });
  console.log('   ' + JSON.stringify(warn));
  ok(!!warn && /Осталось|Срок/.test(warn.text || ''), 'предупреждение о сроке приходит заранее', warn && warn.title);

  /* ---------- 4. окно «Решить» ---------- */
  console.log('4. «Решить»: выбор применяется, дело закрывается');
  const before = await p.evaluate(() => BK.App.state.story.rel.family);
  await p.click('#pbody [data-act="fam"]');
  await p.waitForTimeout(400);
  const win = await p.evaluate(() => {
    const m = document.querySelector('#modal .modal');
    return { open: !!m, opts: m ? [...m.querySelectorAll('[data-act="famPick"]')].map((b) => b.textContent.trim().slice(0, 40)) : [], note: m ? (m.querySelector('.fam-note') || {}).textContent || '' : '' };
  });
  console.log('   ' + JSON.stringify(win));
  ok(win.open && win.opts.length >= 3, 'окно дела открылось, вариантов ' + win.opts.length);
  ok(/решится само/.test(win.note), 'цена «ничего не делать» названа заранее', win.note.trim().slice(0, 70));
  await p.click('#modal [data-act="famPick"][data-arg="0"]');
  await p.waitForTimeout(500);
  const done = await p.evaluate(() => {
    const S = BK.App.state;
    const t = BK.Threads.byId(S, 'fam-mama');
    BK.App.refresh();
    return { closed: !document.querySelector('#modal .modal'), done: t.done, rel: S.story.rel.family,
      att: BK.Threads.attItems(S).filter((x) => /Мама болеет/.test(x.t)).length,
      html: /Мама болеет — /.test(document.getElementById('pbody').innerHTML) };
  });
  console.log('   ' + JSON.stringify(done));
  ok(done.closed, 'окно закрылось');
  ok(done.done === true, 'нить дела закрыта');
  ok(done.rel > before, 'решение изменило состояние (отношения ' + before + ' → ' + done.rel + ')');
  ok(done.att === 0 && !done.html, 'строка и блок больше не показываются');

  /* ---------- 5. игра продолжается, консоль чистая ---------- */
  console.log('5. Игра продолжается');
  const day0 = await p.evaluate(() => BK.App.state.day);
  await p.evaluate(() => BK.App.setSpeed(10));
  await p.waitForTimeout(2500);
  const after2 = await p.evaluate(() => ({ day: BK.App.state.day, lost: !!BK.App.state.lost, speed: BK.App.ui.speed }));
  console.log('   ' + JSON.stringify(after2));
  ok(after2.day > day0, 'время идёт (день ' + day0 + ' → ' + after2.day + ')');
  ok(!after2.lost, 'игра не сломалась');
  ok(p.errs.length === 0, 'ошибок консоли нет', p.errs.join(' | ') || '0');

  await browser.close();
  console.log(bad ? '\nМОМЕНТ: ' + bad + ' проблема(ы)' : '\nМОМЕНТ: всё в порядке');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });