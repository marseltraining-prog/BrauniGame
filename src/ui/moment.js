/* =====================================================================
   ЗАСТАВКА ТЯЖЁЛОГО МОМЕНТА (BK.Moment) — то, что видит игрок, когда случилось
   непоправимое: смерть близкого, потеря, то, что уже не переиграть.

   Требование владельца (дословно): «если что-то случилось, как смерть, то точно нужна
   заставка с грустной 8-битной музыкой, темнеющим экраном, медленно темнеющим, и намёк,
   что пошло что-то не так — например, врач, который качает головой».

   Что происходит по секундам (полный такт ≈ 8 с, дальше — сколько читает игрок):
     0,0 с  экран начинает медленно темнеть (линейно, 3,2 с — не рывком); включается
            грустная тема: BK.Sound.music('sad') — своя категория «Музыка», тот же движок;
     3,2 с  экран полностью чёрный; под чернотой уже стоит пиксельная сцена-намёк
            (src/pixel/scenes.js → Px.scenes.moment: ночной коридор, дождь в окно, врач
            в дверях — он качает головой); чернота за 2,2 с уходит до 45 %, сцена проявляется;
     5,6 с  первая строка (одна-две, без объяснений и без морали);
     6,8 с  вторая строка;
     7,6 с  кнопка «Дальше»: игрок сам решает, когда вернуться;
     по нажатию — 0,7 с обратного затемнения, музыка возвращается к прежней теме,
            заставка снимается, пауза кончается и игра продолжается (состояние не меняется:
            последствия решения применяет сюжет обычным путём — BK.Story.resolve).

   Заставка — слой поверх всего (#moment, z-index выше окна #modal) и одновременно
   «пустая» модалка (BK.App.openModal + closable:false): так игра встаёт на паузу
   штатным способом, а события и окна шефа не лезут поверх заставки.
   prefers-reduced-motion — без долгого затемнения (один быстрый такт).

   Своей игровой логики здесь нет; сцену с form:'moment' показывает src/ui/story-ui.js,
   она же по кнопке «Дальше» разрешает сцену. Модуль молчит, если DOM нет (боты, Node).
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const HAS_DOM = typeof document !== 'undefined';
  const APP = () => BK.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Такты, секунды. SAD_* — множитель для prefers-reduced-motion: тот же смысл, но без долгой темноты.
  const T = {
    dark: 3.2,      // медленное затемнение до чёрного
    reveal: 2.2,    // проявление сцены из черноты
    line1: 5.6,     // первая строка
    line2: 6.8,     // вторая строка
    btn: 7.6,       // кнопка «Дальше»
    out: 0.7,       // обратное затемнение
  };
  const stage = { el: null, timers: [], scene: null, done: null, prev: 'game', on: false, cvs: null, raf: 0, t0: 0 };

  function reduceMotion() { try { return !!(BK.Px && BK.Px.reduceMotion && BK.Px.reduceMotion()); } catch (e) { return false; } }
  function speed() { return reduceMotion() ? 0.15 : 1; }
  function clearTimers() { for (const id of stage.timers) clearTimeout(id); stage.timers = []; }

  /* ---------- пиксельная сцена: canvas низкого разрешения, целый множитель ----------
     Сцена — маленькая, «карманная»: буфер 132×74 (телефон) или 176×99 (шире 520 px),
     множитель 2 или 3. Крупная сцена на весь экран читалась бы как обои, а нам нужен намёк:
     окно с дождём, лавка, человек в дверях. */
  function mountScene(slot, W0) {
    const W = W0 || 480;
    const bufW = W < 520 ? 132 : 176;
    const bufH = Math.round(bufW * 0.56);
    const cv = document.createElement('canvas');
    cv.className = 'mom-scene-cv';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Ночной коридор. В дверях стоит врач и качает головой');
    cv.width = bufW; cv.height = bufH;
    const k = W < 520 ? 2 : 3;
    cv.style.width = bufW * k + 'px'; cv.style.height = bufH * k + 'px';
    slot.appendChild(cv);
    const Px = BK.Px;
    if (!Px || !Px.scenes || !Px.scenes.moment) return null;    // без пиксельного слоя остаются текст и звук
    const b = new Px.Buf(bufW, bufH);
    const paint = (t) => {
      try {
        b.d.fill(0);
        Px.scenes.moment(b, t, bufW, bufH, {});
        b.toCanvas(cv);
      } catch (e) { /* один неудачный кадр не должен ломать заставку */ }
    };
    stage.cvs = { cv, paint };
    paint(0);
    if (Px.reduceMotion()) return stage.cvs;
    const loop = () => {
      stage.raf = 0;
      if (!stage.on || !cv.isConnected) return;
      paint((performance.now() - stage.t0) / 1000);
      stage.raf = requestAnimationFrame(loop);
    };
    stage.raf = requestAnimationFrame(loop);
    return stage.cvs;
  }

  /* ---------- показать заставку ---------- */
  // o: { id, title, lines:[{who,text}], hold } — текст уже подставлен (BK.StoryUI.sub)
  function play(S, o, done) {
    if (!HAS_DOM) return false;
    if (stage.on) return false;                                  // вторая заставка поверх первой не нужна
    const A = APP(); if (!A) return false;
    const opt = o || {};
    const lines = (opt.lines || []).filter(Boolean).slice(0, 2);
    const root = document.createElement('div');
    root.id = 'moment'; root.className = 'mom';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', opt.title ? String(opt.title) : 'Тяжёлый момент');
    root.innerHTML =
      '<div class="mom-black"></div>' +
      '<div class="mom-scene"><div class="mom-frame"></div>' +
      '<div class="mom-canvas"></div></div>' +
      '<div class="mom-text">' +
      lines.map((l, i) => `<p class="mom-line" data-i="${i}">${l.who ? `<b class="mom-who">${esc(l.who)}</b>` : ''}<span>${esc(l.text || '')}</span></p>`).join('') +
      '</div>' +
      '<div class="mom-act"><button type="button" class="btn primary block mom-next" data-act="momNext">Дальше</button>' +
      '<span class="mom-hint">Медленно темнеет. Так бывает.</span></div>';
    document.body.appendChild(root);
    stage.el = root; stage.done = done || null; stage.on = true; stage.t0 = performance.now();

    // пауза штатным способом: пустая модалка (closable:false) — время стоит, окна не лезут поверх
    try { A.openModal('<div class="mom-hold"></div>', { closable: false }); } catch (e) { /* без модалки заставка всё равно видна */ }

    // грустная тема: своя категория «Музыка», тот же движок синтеза
    stage.prev = (BK.Sound && BK.Sound.music && BK.Sound.music()) || 'game';
    if (BK.Sound) { try { BK.Sound.arm(); BK.Sound.music('sad'); } catch (e) { /* молча: звук не важнее сцены */ } }

    const k = speed();
    const at = (sec, fn) => { stage.timers.push(setTimeout(fn, Math.round(sec * k * 1000))); };
    const slot = $('.mom-canvas', root);
    // 1) медленное затемнение
    requestAnimationFrame(() => root.classList.add('mom-dark'));
    // 2) чёрный экран: под ним появляется сцена, чернота уходит до 45 %
    at(T.dark, () => {
      mountScene(slot, window.innerWidth || 480);
      root.classList.add('mom-snap');                          // без перехода: мгновенно в чёрное
      const black = $('.mom-black', root);
      if (black) black.style.opacity = '1';
      requestAnimationFrame(() => {
        root.classList.remove('mom-snap');
        root.classList.add('mom-reveal');
        if (black) black.style.opacity = '';
      });
    });
    at(T.line1, () => root.classList.add('mom-l1'));
    if (lines.length > 1) at(T.line2, () => root.classList.add('mom-l2'));
    at(T.btn, () => { root.classList.add('mom-ready'); const b = $('.mom-next', root); if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} } });
    return true;
  }

  /* ---------- «Дальше»: обратное затемнение, музыка назад, сцена продолжается ---------- */
  function finish() {
    if (!stage.on || !stage.el) return false;
    const root = stage.el, done = stage.done;
    stage.on = false; stage.done = null;
    clearTimers();
    if (stage.raf) { cancelAnimationFrame(stage.raf); stage.raf = 0; }
    if (BK.Sound) { try { BK.Sound.music(stage.prev === 'sad' ? 'game' : stage.prev); } catch (e) {} } // тема возвращается под затемнением
    root.classList.add('mom-out');
    const drop = () => {
      try { root.remove(); } catch (e) {}
      stage.el = null; stage.cvs = null;
      if (done) { try { done(); } catch (e) { /* сюжет сам разберётся */ } }
      else { const A = APP(); if (A) { try { A.closeModal(); } catch (e) {} } }   // заставку позвали напрямую — закрываем паузу сами
    };
    if (reduceMotion()) drop(); else setTimeout(drop, Math.round(T.out * 1000));
    return true;
  }

  function boot() {
    if (!HAS_DOM) return;
    const A = APP() && APP().ACT;
    if (!A) { setTimeout(boot, 150); return; }
    if (A.__moment) return;
    A.__moment = true;
    A.momNext = () => finish();
    // клавишами тоже можно: Enter/Space/Escape — «Дальше» (заставку нельзя закрыть случайным кликом по фону)
    document.addEventListener('keydown', (e) => {
      if (!stage.on) return;
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.key === 'Escape') { e.preventDefault(); finish(); }
    });
  }
  if (HAS_DOM) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot); }

  BK.Moment = {
    play, show: play, finish, active: () => stage.on,
    T,
    get scene() { return stage.el; },
  };
})();
