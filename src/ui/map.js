/* Карта Уфы: статичный слой (районы, реки) + динамические маркеры. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  function clipPoly(poly, a, b, c) { // оставить точки с a*x + b*y <= c
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c;
      if (fp <= 0) out.push(P);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out;
  }
  function voronoi(sites) {
    return sites.map((s, i) => {
      let poly = [[-60, -60], [1060, -60], [1060, 1060], [-60, 1060]];
      sites.forEach((o, j) => {
        if (i === j) return;
        const a = o.x - s.x, b = o.y - s.y, mx = (s.x + o.x) / 2, my = (s.y + o.y) / 2;
        poly = clipPoly(poly, a, b, a * mx + b * my);
      });
      return poly;
    });
  }
  const pathOf = (pts, close) => 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
  function smooth(pts) { // Catmull-Rom → Bezier
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  function staticLayer(opts) {
    const M = BK.MAP;
    const cells = voronoi(BK.DISTRICTS);
    let s = `<defs><clipPath id="${opts.id}-city"><path d="${smooth(M.city.concat([M.city[0]]))}Z"/></clipPath>
      <pattern id="${opts.id}-grain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="currentColor" opacity=".08"/></pattern></defs>`;
    s += `<rect x="-2000" y="-2000" width="5000" height="5000" class="m-land"/>`;
    s += `<g clip-path="url(#${opts.id}-city)">`;
    cells.forEach((c, i) => { s += `<path class="m-district${i % 2 ? ' alt' : ''}" data-d="${BK.DISTRICTS[i].id}" d="${pathOf(c, true)}"/>`; });
    s += `<rect x="-60" y="-60" width="1120" height="1120" fill="url(#${opts.id}-grain)" style="color:var(--ink)" pointer-events="none"/>`;
    s += `</g>`;
    for (const p of M.parks) s += `<circle class="m-park" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`;
    s += `<path class="m-rail" d="${smooth(M.rail)}"/>`;
    s += `<path class="m-river" stroke-width="18" d="${smooth(M.belaya)}"/>`;
    s += `<path class="m-river" stroke-width="12" d="${smooth(M.ufa)}"/>`;
    s += `<path class="m-river" stroke-width="7" d="${smooth(M.dema)}"/>`;
    for (const l of M.labels) s += `<text class="m-rlabel" transform="translate(${l.x},${l.y}) rotate(${l.rot})">${l.text}</text>`;
    if (!opts.noLabels) {
      for (const d of BK.DISTRICTS) s += `<text class="m-dlabel" x="${d.x}" y="${d.y - 44}">${d.name}</text>`;
      for (const p of M.parks) s += `<text class="m-small" x="${p.x}" y="${p.y + 3}" text-anchor="middle">${p.name}</text>`;
      s += `<text class="m-small" x="${M.station.x + 10}" y="${M.station.y - 8}">${M.station.name}</text>`;
      s += `<circle cx="${M.station.x}" cy="${M.station.y}" r="3.5" fill="var(--ink-3)"/>`;
    }
    return s;
  }

  function faceSvg(kind, cx, cy, r) {
    const cls = kind === 'happy' ? 'happy' : kind === 'sad' ? 'sad' : 'mid';
    const ey = cy - r * 0.2, ex = r * 0.38, my = cy + r * 0.35;
    const mouth = kind === 'happy' ? `M${cx - r * 0.45},${my - r * 0.12} Q${cx},${my + r * 0.42} ${cx + r * 0.45},${my - r * 0.12}`
      : kind === 'sad' ? `M${cx - r * 0.42},${my + r * 0.18} Q${cx},${my - r * 0.32} ${cx + r * 0.42},${my + r * 0.18}`
      : `M${cx - r * 0.4},${my} L${cx + r * 0.4},${my}`;
    return `<g class="m-face ${cls}"><circle cx="${cx}" cy="${cy}" r="${r}"/><circle class="eye" cx="${cx - ex}" cy="${ey}" r="${r * 0.13}"/><circle class="eye" cx="${cx + ex}" cy="${ey}" r="${r * 0.13}"/><path d="${mouth}"/></g>`;
  }
  BK.faceSvg = faceSvg;
  BK.faceIcon = function (kind) { return `<svg class="face" viewBox="0 0 20 20" aria-hidden="true">${faceSvg(kind, 10, 10, 8.5)}</svg>`; };
  BK.moodKind = function (m) { return m >= BK.CFG.MOOD_HAPPY ? 'happy' : m >= BK.CFG.MOOD_UNHAPPY ? 'mid' : 'sad'; };
  function storeMood(st) {
    if (!st.staff.length) return null;
    let sum = 0, sad = 0; for (const e of st.staff) { sum += e.mood; if (e.mood < BK.CFG.MOOD_UNHAPPY) sad++; }
    const avg = sum / st.staff.length;
    return sad >= Math.max(1, st.staff.length / 3) ? 'sad' : BK.moodKind(avg);
  }
  BK.storeMood = storeMood;
  const FACTORY = 'M-7,6 L-7,-2 L-3,-5 L-3,-1 L1,-4 L1,0 L5,-3 L5,-7 L7,-7 L7,6 Z';
  const OFFICE = 'M-6,6 L-6,-6 L6,-6 L6,6 Z M-3.5,-3.5 h2 v2 h-2 Z M1.5,-3.5 h2 v2 h-2 Z M-3.5,0.5 h2 v2 h-2 Z M1.5,0.5 h2 v2 h-2 Z';

  function Map(el, opts) {
    this.el = el; this.opts = opts || {};
    this.vb = { x: 0, y: 0, w: 1000, h: 1000 };
    el.setAttribute('viewBox', '0 0 1000 1000');
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.innerHTML = staticLayer({ id: 'mm' }) + '<g class="routes"></g><g class="markers"></g>';
    this.gR = el.querySelector('.routes'); this.gM = el.querySelector('.markers');
    this.bind();
  }
  Map.prototype.setVB = function () {
    const v = this.vb; this.el.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
    if (this.lastS && !this.pendingR) { this.pendingR = true; requestAnimationFrame(() => { this.pendingR = false; this.render(this.lastS, this.lastSel); }); }
  };
  Map.prototype.toMap = function (cx, cy) {
    const r = this.el.getBoundingClientRect();
    const s = Math.min(r.width / this.vb.w, r.height / this.vb.h);
    const ox = (r.width - this.vb.w * s) / 2, oy = (r.height - this.vb.h * s) / 2;
    return { x: this.vb.x + (cx - r.left - ox) / s, y: this.vb.y + (cy - r.top - oy) / s, s };
  };
  Map.prototype.zoom = function (f, cx, cy) {
    const r = this.el.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const p = this.toMap(cx, cy);
    const nw = Math.max(220, Math.min(1300, this.vb.w * f));
    const k = nw / this.vb.w;
    this.vb.x = p.x - (p.x - this.vb.x) * k; this.vb.y = p.y - (p.y - this.vb.y) * k;
    this.vb.w = nw; this.vb.h = nw; this.setVB();
  };
  Map.prototype.reset = function () { this.vb = { x: 0, y: 0, w: 1000, h: 1000 }; this.setVB(); };
  Map.prototype.focus = function (x, y) {
    if (this.vb.w > 700) { this.vb.w = this.vb.h = 600; }
    this.vb.x = x - this.vb.w / 2; this.vb.y = y - this.vb.h / 2; this.setVB();
  };
  Map.prototype.bind = function () {
    const el = this.el, self = this;
    const pts = new globalThis.Map();
    let start = null, moved = false, pinch = null;
    el.addEventListener('wheel', (e) => { e.preventDefault(); self.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vb: Object.assign({}, self.vb) }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: self.vb.w }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) { self.hover(e); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = pinch.w * pinch.d / Math.max(20, d);
        self.zoom(target / self.vb.w, (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
      moved = true; el.classList.add('dragging');
      const r = el.getBoundingClientRect(); const s = Math.min(r.width / start.vb.w, r.height / start.vb.h);
      self.vb.x = start.vb.x - dx / s; self.vb.y = start.vb.y - dy / s; self.setVB();
      if (self.tip) self.tip.hidden = true;
    });
    const up = (e) => {
      const wasPinch = pts.size >= 2;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      el.classList.remove('dragging');
      if (e.type === 'pointerup' && !moved && !wasPinch && start) {
        const t = e.target.closest ? e.target.closest('[data-kind]') : null;
        if (self.opts.onClick) self.opts.onClick(t ? { kind: t.dataset.kind, id: t.dataset.id } : null);
      }
      if (!pts.size) start = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', (e) => { if (self.tip) self.tip.hidden = true; });
  };
  Map.prototype.hover = function (e) {
    if (!this.tip || !this.opts.tipFor) return;
    const t = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (!t) { this.tip.hidden = true; return; }
    const html = this.opts.tipFor(t.dataset.kind, t.dataset.id);
    if (!html) { this.tip.hidden = true; return; }
    this.tip.innerHTML = html; this.tip.hidden = false;
    const r = this.el.parentNode.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 250 > r.width) x = e.clientX - r.left - 250;
    if (y + 90 > r.height) y = e.clientY - r.top - 90;
    this.tip.style.left = x + 'px'; this.tip.style.top = y + 'px';
  };
  Map.prototype.markerScale = function () {
    const r = this.el.getBoundingClientRect();
    const px = Math.min(r.width, r.height) || 800;
    const upp = this.vb.w / px; // единиц карты на пиксель
    return Math.max(0.6, Math.min(3.2, upp * 1.15));
  };
  Map.prototype.render = function (S, sel) {
    const E = BK.Engine;
    this.lastS = S; this.lastSel = sel;
    const k = this.markerScale().toFixed(3);
    // большая сеть на мелком масштабе: маршруты бледнее, смайлики — только у недовольных, иначе карта превращается в кашу
    const crowded = S.stores.length > 24 && this.vb.w > 560;
    (this.el.parentNode || this.el).classList.toggle('crowded', crowded);
    let r = '';
    for (const st of S.stores) {
      if (st.status === 'opening') continue;
      const p = E.nearestProd(S, st); if (!p) continue;
      r += `<line class="m-route" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${st.x.toFixed(1)}" y2="${st.y.toFixed(1)}"/>`;
    }
    // DOM трогаем, только если разметка изменилась: на ×10 с 40–60 точками это убирает лишние пересчёты стилей и перерисовку карты
    if (r !== this.lastR) { this.gR.innerHTML = r; this.lastR = r; }
    let m = '';
    const isSel = (k, id) => sel && sel.kind === k && sel.id === id;
    // офис
    const hq = { x: 402, y: 772 };
    m += `<g class="m-hq" data-kind="hq" data-id="hq" transform="translate(${hq.x},${hq.y}) scale(${k})" style="cursor:pointer"><rect x="-9" y="-9" width="18" height="18" rx="3"/><path d="${OFFICE}" transform="scale(.8)"/></g>`;
    for (const o of S.prodOffers) m += `<g class="m-prodoffer${isSel('prodOffer', o.id) ? ' sel' : ''}" data-kind="prodOffer" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><rect x="-13" y="-13" width="26" height="26" rx="4"/><path d="${FACTORY}"/></g>`;
    for (const o of S.offers) {
      const pulse = S.phase === 'setup_store' || S.stores.length < 2 ? ' pulse' : '';
      m += `<g class="m-offer${isSel('offer', o.id) ? ' sel' : ''}${pulse}" data-kind="offer" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><circle r="11"/><path d="M-4.5,0 H4.5 M0,-4.5 V4.5"/></g>`;
    }
    for (const p of S.productions) {
      m += `<g class="m-prod ${p.status}${isSel('prod', p.id) ? ' sel' : ''}" data-kind="prod" data-id="${p.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) scale(${k})"><rect x="-13" y="-13" width="26" height="26" rx="4"/><path d="${FACTORY}"/>`;
      if (p.status === 'open' && (p.load || 0) > 0.95) m += `<circle class="m-alert" cx="12" cy="-12" r="6"/><text class="m-alert-t" x="12" y="-12">!</text>`;
      m += `</g>`;
    }
    for (const st of S.stores) {
      const closed = st.status === 'open' && ((st.closedUntil && st.closedUntil > S.day) || !st.staff.length);
      const cls = st.status === 'opening' ? 'opening' : st.status === 'repair' ? 'repair' : closed ? 'closed' : 'open';
      m += `<g class="m-store ${cls}${isSel('store', st.id) ? ' sel' : ''}" data-kind="store" data-id="${st.id}" transform="translate(${st.x.toFixed(1)},${st.y.toFixed(1)}) scale(${k})">`;
      const rad = st.size === 'large' ? 13 : st.size === 'small' ? 9.5 : 11;
      m += `<circle class="b" r="${rad}"/><text>${st.num}</text>`;
      const mood = storeMood(st);
      if (mood && st.status !== 'opening' && (!crowded || mood === 'sad' || isSel('store', st.id))) m += faceSvg(mood, rad * 0.75, -rad - 5, 6.5);
      const vac = E.vacancies(st);
      if (st.status !== 'opening' && (vac > 0 || st.staff.length < BK.CFG.SIZES[st.size].staffMin)) m += `<circle class="m-alert" cx="${-rad * 0.8}" cy="${-rad * 0.8}" r="5.5"/><text class="m-alert-t" x="${-rad * 0.8}" y="${-rad * 0.8}">${vac || '!'}</text>`;
      m += `</g>`;
    }
    if (m !== this.lastM) { this.gM.innerHTML = m; this.lastM = m; }
    this.renderRivals(S, k);
  };
  // сеть-соперник: приглушённые ромбы отдельным слоем под маркерами игрока (слой создаётся при первой отрисовке)
  Map.prototype.renderRivals = function (S, k) {
    const R = BK.Engine.rivalSummary ? BK.Engine.rivalSummary(S) : null;
    if (!this.gRv) { this.gRv = document.createElementNS(NS, 'g'); this.gRv.setAttribute('class', 'rivals'); this.gM.parentNode.insertBefore(this.gRv, this.gM); }
    let h = '';
    if (R) for (const o of R.stores) h += `<g class="m-rival" data-kind="rival" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><rect x="-5.5" y="-5.5" width="11" height="11" rx="1.5" transform="rotate(45)"/></g>`;
    if (h !== this.lastRv) { this.gRv.innerHTML = h; this.lastRv = h; (this.el.parentNode || this.el).classList.toggle('has-rival', !!h); }
  };
  BK.MapView = Map;
  BK.mapStatic = staticLayer;
})();
