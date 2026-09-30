/* =====================================================================
   СЦЕНА НА СТРАНИЦЕ (BK.Px.stage): canvas низкого разрешения, целый множитель, рисование по требованию.
   - Ширина буфера подстраивается под место (W = ширина слота / множитель), высота — opts.height(W).
   - Статичный слой кэшируется самой сценой (обычно Px.memo по ключу), анимация (огонь, пар, очередь, моргание)
     идёт общим циклом requestAnimationFrame с ограничением кадров (opts.fps) и только пока canvas виден
     (IntersectionObserver), подключён к документу и вкладка не скрыта. Нет видимых анимированных сцен — цикла нет.
   - prefers-reduced-motion: один кадр без анимации.
   - Canvas переживает перерисовку разметки: attach(slot) переносит тот же элемент в новый слот.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px;
  const live = new Set();
  let raf = 0;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) { const s = e.target.__pxStage; if (s) { s.vis = e.isIntersecting; if (s.vis) kick(); } } }) : null;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { for (const e of es) { const s = e.target.__pxStage; if (s) s.fit(); } }) : null;
  function kick() { if (!raf && live.size) raf = requestAnimationFrame(loop); }
  function loop(t) {
    raf = 0;
    let any = false;
    const hidden = typeof document !== 'undefined' && document.hidden;
    for (const s of live) {
      if (!s.cv.isConnected) { s.detachObs(); continue; }
      if (!s.anim || !s.vis || hidden || Px.reduceMotion() || (s.o.active && !s.o.active())) continue;
      any = true;
      if (t - s.last >= 1000 / s.fps - 4) { s.last = t; s.paint(t / 1000); }
    }
    if (any) raf = requestAnimationFrame(loop);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  class Stage {
    constructor(opts) {
      this.o = opts; this.fps = opts.fps || 8; this.anim = opts.anim !== false; this.vis = !io; this.last = 0;
      this.cv = document.createElement('canvas'); this.cv.className = 'pxs ' + (opts.cls || ''); this.cv.__pxStage = this;
      this.cv.setAttribute('role', 'img'); if (opts.label) this.cv.setAttribute('aria-label', opts.label);
      this.W = 0; this.H = 0; this.k = 2; this.buf = null; this.data = opts.data || {};
    }
    attach(slot) {
      if (!slot) return this;
      if (this.cv.parentNode !== slot) slot.appendChild(this.cv);
      this.slot = slot; slot.__pxStage = this;
      if (ro && this.roSlot !== slot) { if (this.roSlot) ro.unobserve(this.roSlot); ro.observe(slot); this.roSlot = slot; }
      if (io && !this.ioOn) { io.observe(this.cv); this.ioOn = true; }
      live.add(this); this.fit(); kick();
      return this;
    }
    detachObs() { live.delete(this); if (io && this.ioOn) { io.unobserve(this.cv); this.ioOn = false; } if (ro && this.roSlot) { ro.unobserve(this.roSlot); this.roSlot = null; } }
    destroy() { this.detachObs(); this.cv.remove(); }
    // размер: целый множитель, ширина буфера по месту
    fit() {
      const slot = this.slot; if (!slot) return;
      const avail = Math.floor(slot.clientWidth || this.o.fallbackW || 320);
      if (avail < 40) return;
      const k = this.o.scale ? this.o.scale(avail) : (avail >= 900 ? 3 : 2);
      const W = Math.max(this.o.minW || 120, Math.min(this.o.maxW || 999, Math.floor(avail / k)));
      const H = this.o.height ? this.o.height(W, k) : Math.round(W * 0.5);
      if (W === this.W && H === this.H && k === this.k && this.buf) return;
      this.W = W; this.H = H; this.k = k;
      this.buf = new Px.Buf(W, H);
      this.cv.width = W; this.cv.height = H;
      this.cv.style.width = W * k + 'px'; this.cv.style.height = H * k + 'px';
      this.paint(performance.now() / 1000);
    }
    set(data) { this.data = data; this.paint(performance.now() / 1000); return this; }
    paint(t) {
      if (!this.buf) return;
      const b = this.buf; b.d.fill(0);
      try { this.o.draw(b, Px.reduceMotion() ? 0 : t, this.W, this.H, this.data || {}); } catch (e) { if (!this.errOnce) { this.errOnce = 1; console.warn('pixel scene', e); } }
      b.toCanvas(this.cv);
    }
  }
  Px.stage = (opts) => new Stage(opts);
  Px.stagesLive = () => live.size;
})();
