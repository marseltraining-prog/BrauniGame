/* Карта Уфы — «градплан на миллиметровке»: статичный слой (районы, сетка, реки, подписи),
   динамические маркеры с кластерами при отдалении, слои «Прибыль / Настроение / Штат / Доставка»,
   стрелка севера, масштабная линейка и картуш. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const kmU = () => 1 / (BK.Engine && BK.Engine.kmPerUnit ? BK.Engine.kmPerUnit() : 1 / 33); // единиц карты в 1 км (Уфа — 33)
  const MIN_W = 160; // предельное приближение (ширина окна в единицах карты)
  const LAYER_KEY = 'bk-ufa-maplayer';

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

  // сдвиги подписей районов, чтобы не садились на скопления точек (как в макете)
  const LABEL_DY = { center: -46, zaton: -46, dema: -48, nizh: -36, glumilino: -44, inors: -44 };
  const LABEL_DX = { zaton: -20, glumilino: 20 };

  function staticLayer(opts) {
    const M = BK.MAP, id = opts.id;
    const cells = voronoi(BK.DISTRICTS);
    const city = smooth(M.city.concat([M.city[0]])) + 'Z';
    let s = `<defs><clipPath id="${id}-city"><path d="${city}"/></clipPath>
      <pattern id="${id}-g1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="var(--grid-minor)" stroke-width=".6"/></pattern>
      <pattern id="${id}-g5" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#${id}-g1)"/><path d="M50 0H0V50" fill="none" stroke="var(--grid-major)" stroke-width="1"/></pattern></defs>`;
    s += `<rect x="-2000" y="-2000" width="5000" height="5000" class="m-land"/>`;
    s += `<g clip-path="url(#${id}-city)">`;
    cells.forEach((c, i) => { s += `<path class="m-district${i % 2 ? ' alt' : ''}" data-d="${BK.DISTRICTS[i].id}" d="${pathOf(c, true)}"/>`; });
    s += `</g>`;
    // миллиметровка: один элемент с паттерном поверх земли и районов
    s += `<rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#${id}-g5)" pointer-events="none"/>`;
    s += `<path class="m-city-edge" d="${city}"/>`;
    for (const p of M.parks) s += `<circle class="m-park" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`;
    s += `<path class="m-rail" d="${smooth(M.rail)}"/>`;
    // море / залив (сгенерированные города у воды)
    for (const w of M.sea || []) s += `<path class="m-sea" d="${pathOf(w.pts, true)}"/><path class="m-coast" d="${pathOf(w.pts.slice(0, -2))}"/>`;
    // реки: мягкий «разлив» и русло
    if (M.rivers) {
      for (const r of M.rivers) s += `<path class="m-river-edge" stroke-width="${(r.w * 2.1).toFixed(0)}" d="${smooth(r.pts)}"/>`;
      for (const r of M.rivers) s += `<path class="m-river" stroke-width="${r.w}" d="${smooth(r.pts)}"/>`;
    } else {
      s += `<path class="m-river-edge" stroke-width="34" d="${smooth(M.belaya)}"/><path class="m-river-edge" stroke-width="24" d="${smooth(M.ufa)}"/>`;
      s += `<path class="m-river" stroke-width="16" d="${smooth(M.belaya)}"/><path class="m-river" stroke-width="11" d="${smooth(M.ufa)}"/><path class="m-river" stroke-width="6" d="${smooth(M.dema)}"/>`;
    }
    for (const l of M.labels) s += `<text class="m-rlabel${l.sea ? ' sea' : ''}" transform="translate(${l.x},${l.y}) rotate(${l.rot})">${l.text}</text>`;
    if (!opts.noLabels) {
      for (const d of BK.DISTRICTS) s += `<text class="m-dlabel" x="${d.x + (LABEL_DX[d.id] || 0)}" y="${d.y + (LABEL_DY[d.id] != null ? LABEL_DY[d.id] : -40)}">${d.name}</text>`;
      for (const p of M.parks) if (p.name !== 'Кашкадан') s += `<text class="m-small" x="${p.x}" y="${p.y + p.r + 11}" text-anchor="middle">${p.name}</text>`;
      s += `<circle cx="${M.station.x}" cy="${M.station.y}" r="3.5" fill="var(--ink-3)"/><text class="m-small" x="${M.station.x - 8}" y="${M.station.y + 16}" text-anchor="end">${M.station.name}</text>`;
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

  /* ---------- слои ---------- */
  const IC = {
    rub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20V4h5.5a4 4 0 0 1 0 8H6M6 16h8"/></svg>',
    mood: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.4 2.1 2 3.5 2s2.5-.6 3.5-2"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 13.9c2.4.2 4 1.7 4.5 4.6"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5Z"/></svg>',
  };
  BK.ICON_GLOBE = IC.globe;
  const LAYERS = [['profit', 'Прибыль', IC.rub], ['mood', 'Настроение', IC.mood], ['staff', 'Штат', IC.team], ['delivery', 'Доставка', IC.truck], ['daypart', 'Время суток', IC.clock]];
  const DP_COL = { m: 'var(--dp-m)', d: 'var(--dp-d)', e: 'var(--dp-e)', flat: 'var(--line-2)' }; // слой «Время суток» (цвета — delivery.css)
  const DP_ROWS = [['m', 'Пик утром'], ['d', 'Пик в обед'], ['e', 'Пик вечером'], ['flat', 'Ровно весь день']];
  const TONE_COL = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', none: 'var(--line-2)' };
  const MOOD_COL = { happy: 'var(--face-happy)', mid: 'var(--face-mid)', sad: 'var(--face-sad)' };
  const MOOD_TONE = { happy: 'good', mid: 'warn', sad: 'bad' };
  // значки проблем: не больше трёх типов, по приоритету — закрыта, убыток, нехватка штата
  const PROB = { closed: 'Закрыта', money: 'Убыток за месяц', staff: 'Нехватка штата' };
  const PROB_ORDER = ['closed', 'money', 'staff'];
  function badge(kind, x, y) {
    const glyph = kind === 'money' ? '<text class="m-bdg-t" x="0" y=".6">₽</text>'
      : kind === 'staff' ? '<circle cx="0" cy="-2.2" r="2.2" class="m-bdg-g"/><path d="M-4,4 Q0,-1.5 4,4 Z" class="m-bdg-g"/>'
      : '<path d="M-3,-3 L3,3 M3,-3 L-3,3" class="m-bdg-x"/>';
    return `<g class="m-bdg ${kind}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="4"/>${glyph}</g>`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nw = (n, a, b, c) => { const m = n % 10, h = n % 100; return `${n} ${m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c}`; };

  // состояние точки для слоёв: тон (good/warn/bad/none) и проблема
  function storeInfo(S, st, layer) {
    const E = BK.Engine, cfg = BK.CFG;
    const opening = st.status === 'opening';
    const closed = st.status === 'repair' || (st.status === 'open' && ((st.closedUntil && st.closedUntil > S.day) || !st.staff.length));
    const min = (cfg.SIZES[st.size] || cfg.SIZES.standard).staffMin;
    const vac = opening ? 0 : E.vacancies(st);
    let prob = null;
    if (closed) prob = 'closed';
    else if (st.last && st.last.profit < 0) prob = 'money';
    else if (!opening && (vac > 0 || st.staff.length < min)) prob = 'staff';
    const mood = opening ? null : storeMood(st);
    let tone = 'none';
    if (layer === 'profit') { if (st.last && st.last.rev > 0) { const mg = st.last.profit / st.last.rev; tone = mg >= 0.15 ? 'good' : mg >= 0 ? 'warn' : 'bad'; } else if (st.last) tone = 'bad'; }
    else if (layer === 'mood') tone = mood ? MOOD_TONE[mood] : 'none';
    else if (layer === 'staff') { if (!opening) { const n = st.staff.length; tone = n >= st.staffTarget ? 'good' : n >= min ? 'warn' : 'bad'; } }
    else if (layer === 'delivery') tone = st.agg ? 'good' : 'none'; // подключена к агрегаторам
    else if (layer === 'daypart' && E.daypartOf) tone = 'dp-' + E.daypartOf(st).peak;
    return { st, tone, prob, mood, vac, cls: opening ? 'opening' : st.status === 'repair' ? 'repair' : closed ? 'closed' : 'open' };
  }

  function Map(el, opts) {
    this.el = el; this.opts = opts || {};
    this.vb = { x: 0, y: 0, w: 1000, h: 1000 };
    this.layer = 'mood';
    try { const l = localStorage.getItem(LAYER_KEY); if (LAYERS.some((x) => x[0] === l)) this.layer = l; } catch (e) {}
    el.setAttribute('viewBox', '0 0 1000 1000');
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.innerHTML = staticLayer({ id: 'mm' }) + '<g class="routes"></g><g class="markers"></g>';
    this.gR = el.querySelector('.routes'); this.gM = el.querySelector('.markers');
    this.cityId = (BK.CITY && BK.CITY.id) || 'ufa'; this.cityMap = BK.MAP;
    this.wrap = el.parentNode;
    this.px = { w: 800, h: 800 };
    this.buildUi();
    this.measure();
    if (globalThis.ResizeObserver) new ResizeObserver(() => { this.measure(); this.setVB(); this.showChip(); }).observe(el);
    this.bind();
  }
  // размеры SVG кэшируются: render вызывается на каждом тике, и чтение getBoundingClientRect там заставляло бы браузер пересчитывать вёрстку
  Map.prototype.measure = function () { const r = this.el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) this.px = { w: r.width, h: r.height }; };
  Map.prototype.upp = function () { return Math.max(this.vb.w / this.px.w, this.vb.h / this.px.h); }; // единиц карты на пиксель (meet)

  Map.prototype.buildUi = function () {
    const w = this.wrap; if (!w) return;
    const div = (cls, html) => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; w.appendChild(d); return d; };
    this.uiLayers = div('maplayers');
    this.uiLayers.setAttribute('role', 'group'); this.uiLayers.setAttribute('aria-label', 'Слой карты');
    this.uiLayers.innerHTML = `<button type="button" class="ml-crumb" data-act="russia" hidden title="Карта России (R)"></button><span class="ml-div" hidden aria-hidden="true"></span><button type="button" class="ml-toggle" aria-label="Легенда слоя" aria-expanded="false">${IC.layers}</button>` +
      LAYERS.map(([k, n, i]) => `<button type="button" class="ml-chip" data-layer="${k}" title="${n}" aria-label="${n}" aria-pressed="${this.layer === k}">${i}<span>${n}</span></button>`).join('');
    this.uiLegend = div('maplegend');
    this.uiNorth = div('mapnorth', '<svg viewBox="0 0 30 42" aria-hidden="true"><circle cx="15" cy="27" r="13" fill="none" stroke="currentColor" stroke-width="1"/><path d="M15 2 L21 27 L15 23 L9 27Z" fill="currentColor"/><path d="M15 23 L21 27 L15 38 L9 27Z" fill="none" stroke="currentColor" stroke-width="1"/></svg><span>С</span>');
    this.uiNorth.setAttribute('aria-hidden', 'true');
    this.uiScale = div('mapscale'); this.uiScale.setAttribute('aria-hidden', 'true');
    this.uiCart = div('mapcart');
    this.uiLayers.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.classList.contains('ml-crumb')) return;
      if (b.classList.contains('ml-toggle')) { const open = !w.classList.contains('legend-open'); w.classList.toggle('legend-open', open); b.setAttribute('aria-expanded', String(open)); return; }
      this.setLayer(b.dataset.layer);
    });
  };
  // активный чип — в видимую часть строки (на телефоне строка прокручивается), страницу при этом не трогаем
  Map.prototype.showChip = function () {
    const row = this.uiLayers, b = row && row.querySelector('[aria-pressed="true"]'); if (!b || row.scrollWidth <= row.clientWidth) return;
    const l = b.offsetLeft - 10, r = b.offsetLeft + b.offsetWidth + 10;
    if (l < row.scrollLeft) row.scrollLeft = l; else if (r > row.scrollLeft + row.clientWidth) row.scrollLeft = r - row.clientWidth;
  };
  Map.prototype.setLayer = function (k) {
    if (!LAYERS.some((x) => x[0] === k)) return;
    this.layer = k;
    try { localStorage.setItem(LAYER_KEY, k); } catch (e) {}
    this.uiLayers.querySelectorAll('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === k)));
    this.showChip();
    if (this.lastS) this.render(this.lastS, this.lastSel);
  };

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
    this.anim = null;
    const r = this.el.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const p = this.toMap(cx, cy);
    const nw = Math.max(MIN_W, Math.min(1300, this.vb.w * f));
    const k = nw / this.vb.w;
    this.vb.x = p.x - (p.x - this.vb.x) * k; this.vb.y = p.y - (p.y - this.vb.y) * k;
    this.vb.w = nw; this.vb.h = nw; this.setVB();
  };
  Map.prototype.reset = function () { this.anim = null; this.vb = { x: 0, y: 0, w: 1000, h: 1000 }; this.setVB(); };
  Map.prototype.focus = function (x, y) {
    this.anim = null;
    if (this.vb.w > 700) { this.vb.w = this.vb.h = 600; }
    this.vb.x = x - this.vb.w / 2; this.vb.y = y - this.vb.h / 2; this.setVB();
  };
  // плавный подлёт (клик по кластеру)
  Map.prototype.flyTo = function (x, y, w) {
    const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = Object.assign({}, this.vb), to = { x: x - w / 2, y: y - w / 2, w, h: w };
    if (reduce) { this.vb = to; this.setVB(); return; }
    const t0 = performance.now(), dur = 320, token = {};
    this.anim = token;
    const step = (t) => {
      if (this.anim !== token) return;
      const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3);
      // ширину интерполируем в логарифме — зум выглядит равномерным
      const cw = Math.exp(Math.log(from.w) + (Math.log(to.w) - Math.log(from.w)) * e);
      const cx = from.x + from.w / 2 + (x - from.x - from.w / 2) * e, cy = from.y + from.h / 2 + (y - from.y - from.h / 2) * e;
      this.vb = { x: cx - cw / 2, y: cy - cw / 2, w: cw, h: cw }; this.setVB();
      if (q < 1) requestAnimationFrame(step); else this.anim = null;
    };
    requestAnimationFrame(step);
  };
  Map.prototype.zoomCluster = function (id) {
    const c = this.clusterById && this.clusterById[id]; if (!c) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const st of c.items) { x0 = Math.min(x0, st.x); y0 = Math.min(y0, st.y); x1 = Math.max(x1, st.x); y1 = Math.max(y1, st.y); }
    // вписать точки кластера в ~половину окна, но приближать хотя бы в 1,8 раза — иначе он не распадётся
    const w = Math.max(MIN_W, Math.min(this.vb.w / 1.8, Math.max(x1 - x0, y1 - y0) * 2.4 + 60));
    if (this.tip) this.tip.hidden = true;
    this.flyTo((x0 + x1) / 2, (y0 + y1) / 2, w);
  };
  Map.prototype.bind = function () {
    const el = this.el, self = this;
    const pts = new globalThis.Map();
    let start = null, moved = false, pinch = null;
    el.addEventListener('wheel', (e) => { e.preventDefault(); self.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { self.anim = null; start = { x: e.clientX, y: e.clientY, vb: Object.assign({}, self.vb) }; moved = false; }
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
        if (t && t.dataset.kind === 'cluster') self.zoomCluster(t.dataset.id);
        else if (self.opts.onClick) self.opts.onClick(t ? { kind: t.dataset.kind, id: t.dataset.id } : null);
      }
      if (!pts.size) start = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (self.tip) self.tip.hidden = true; });
  };
  Map.prototype.clusterTip = function (id) {
    const c = this.clusterById && this.clusterById[id]; if (!c) return '';
    const nums = c.items.map((st) => st.num).sort((a, b) => a - b);
    const probs = {}; for (const i of c.infos) if (i.prob) probs[i.prob] = (probs[i.prob] || 0) + 1;
    const ds = [...new Set(c.items.map((st) => (BK.DISTRICTS.find((d) => d.id === st.district) || {}).name).filter(Boolean))];
    const pl = PROB_ORDER.filter((k) => probs[k]).map((k) => `${PROB[k].toLowerCase()}: ${probs[k]}`).join(' · ');
    return `<b>${nw(c.items.length, 'точка', 'точки', 'точек')} · ${esc(ds.slice(0, 2).join(', '))}${ds.length > 2 ? '…' : ''}</b><br>№${nums.slice(0, 8).join(', №')}${nums.length > 8 ? '…' : ''}${pl ? '<br>' + pl : ''}<br><span class="tip-hint">Нажмите, чтобы приблизить</span>`;
  };
  Map.prototype.hover = function (e) {
    if (!this.tip) return;
    const t = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (!t) { this.tip.hidden = true; return; }
    const html = t.dataset.kind === 'cluster' ? this.clusterTip(t.dataset.id) : this.opts.tipFor ? this.opts.tipFor(t.dataset.kind, t.dataset.id) : '';
    if (!html) { this.tip.hidden = true; return; }
    this.tip.innerHTML = html; this.tip.hidden = false;
    const r = this.el.parentNode.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 250 > r.width) x = e.clientX - r.left - 250;
    if (y + 90 > r.height) y = e.clientY - r.top - 90;
    this.tip.style.left = x + 'px'; this.tip.style.top = y + 'px';
  };
  Map.prototype.markerScale = function () {
    return Math.max(0.4, Math.min(3.2, this.upp() * 1.15));
  };

  /* Кластеры: агломеративно сливаем ближайшие узлы, пока их кружки на экране перекрываются.
     Зависит только от масштаба (не от сдвига), поэтому при перетаскивании кластеры не «прыгают». */
  const clRad = (n) => 11 + Math.min(n, 30) * 0.45; // радиус кружка кластера при scale(1); кольцо и подложка — ещё +5,5
  function clusterize(stores, upp, keepId, kpx) {
    // маленькая сеть: сливаем только сильно перекрытые кружки — номера важнее аккуратности
    const slack = stores.length <= 8 ? -0.45 : 0;
    const RPX_STORE = 12.5 * kpx, rpxCluster = (n) => (clRad(n) + 5.5) * kpx;
    const nodes = stores.map((st) => ({ x: st.x, y: st.y, items: [st], keep: st.id === keepId }));
    for (;;) {
      let best = null, bd = 1e9;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]; if (a.keep) continue;
        const ra = a.items.length > 1 ? rpxCluster(a.items.length) : RPX_STORE;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]; if (b.keep) continue;
          const rb = b.items.length > 1 ? rpxCluster(b.items.length) : RPX_STORE;
          const d = Math.hypot(a.x - b.x, a.y - b.y) / upp; // в пикселях
          const q = d - (ra + rb) * (1 + slack) - (slack ? 0 : 3); // кружки ближе 3 px друг к другу сливаем
          if (q < 0 && q < bd) { bd = q; best = [i, j]; }
        }
      }
      if (!best) break;
      const a = nodes[best[0]], b = nodes[best[1]], n = a.items.length + b.items.length;
      a.x = (a.x * a.items.length + b.x * b.items.length) / n; a.y = (a.y * a.items.length + b.y * b.items.length) / n;
      a.items = a.items.concat(b.items); nodes.splice(best[1], 1);
    }
    return nodes;
  }

  /* Маркеры обновляются точечно: если набор узлов тот же, заменяем только изменившиеся <g>.
     На ×10 за тик меняются 1–2 кружка (кольцо настроения, значок), а не все 60. */
  Map.prototype.patch = function (parts) {
    const keys = parts.map((q) => q[0]).join('|'), prev = this.lastParts;
    if (!prev || keys !== this.lastKeys || this.gM.children.length !== parts.length) {
      this.gM.innerHTML = parts.map((q) => q[1]).join('');
    } else {
      let tmp = null;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i][1] === prev[i][1]) continue;
        tmp = tmp || document.createElementNS('http://www.w3.org/2000/svg', 'g');
        tmp.innerHTML = parts[i][1];
        this.gM.replaceChild(tmp.firstElementChild, this.gM.children[i]);
      }
    }
    this.lastParts = parts; this.lastKeys = keys;
  };
  // другой город (Россия): перестроить статичный слой и сбросить кеши маркеров
  Map.prototype.setCity = function () {
    const id = (BK.CITY && BK.CITY.id) || 'ufa';
    if (this.cityId === id && this.cityMap === BK.MAP) return false;
    const first = this.cityId == null;
    this.cityId = id; this.cityMap = BK.MAP;
    if (first) return false;
    this.el.innerHTML = staticLayer({ id: 'mm' }) + '<g class="routes"></g><g class="markers"></g>';
    this.gR = this.el.querySelector('.routes'); this.gM = this.el.querySelector('.markers'); this.gRv = null;
    this.lastParts = null; this.lastKeys = null; this.lastR = null; this.lastRv = null; this.ckey = null;
    this.el.setAttribute('aria-label', `Карта: ${(BK.CITY && BK.CITY.name) || 'Уфа'}, точки сети`);
    this.anim = null; this.vb = { x: 0, y: 0, w: 1000, h: 1000 }; this.el.setAttribute('viewBox', '0 0 1000 1000');
    return true;
  };
  Map.prototype.render = function (S, sel) {
    const E = BK.Engine;
    this.setCity();
    this.lastS = S; this.lastSel = sel;
    const layer = this.layer, upp = this.upp(), kk = this.markerScale(), k = kk.toFixed(3);
    const isSel = (kind, id) => sel && sel.kind === kind && sel.id === id;
    const selStore = sel && sel.kind === 'store' ? sel.id : null;
    // подписи держат экранный размер, но при сильном отдалении на телефоне мельчают, чтобы не закрывать город
    const lk = Math.max(0.45, Math.min(1.6, upp * 0.95)).toFixed(2);
    if (lk !== this.lastLk) { this.el.style.setProperty('--lk', lk); this.lastLk = lk; }
    const far = upp > 1.9; if (far !== this.lastFar) { this.el.classList.toggle('far', far); this.lastFar = far; }
    const wrap = this.wrap;
    if (wrap) { const play = S.phase === 'play'; if (play !== this.lastPlay) { wrap.classList.toggle('m-setup', !play); this.lastPlay = play; } }
    if (wrap) { const cs = !!(E.citySetup && E.citySetup(S)); if (cs !== this.lastCs) { wrap.classList.toggle('m-citysetup', cs); this.lastCs = cs; } } // запуск нового города (Россия)

    // кластеры пересчитываем только при смене масштаба, числа точек или выделения
    const ckey = upp.toFixed(3) + '|' + S.stores.length + '|' + selStore;
    // на предельном приближении кластеров нет: точки показываем все, даже если стоят вплотную
    if (ckey !== this.ckey) { this.ckey = ckey; this.nodes = this.vb.w <= MIN_W + 1 ? S.stores.map((st) => ({ x: st.x, y: st.y, items: [st] })) : clusterize(S.stores, upp, selStore, kk / upp); }
    const infoById = {}; for (const st of S.stores) infoById[st.id] = storeInfo(S, st, layer);
    this.clusterById = {};

    // маршруты доставки: в слое «Доставка» — ярко, в остальных — еле видны
    let r = '';
    const seen = new Set();
    for (const n of this.nodes) {
      for (const st of n.items) {
        if (st.status === 'opening') continue;
        const p = E.nearestProd(S, st); if (!p) continue;
        const tx = n.items.length > 1 ? n.x : st.x, ty = n.items.length > 1 ? n.y : st.y;
        const key = p.id + ':' + tx.toFixed(0) + ',' + ty.toFixed(0); if (seen.has(key)) continue; seen.add(key);
        r += `<line class="m-route" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"/>`;
      }
    }
    r = `<g class="rt-${layer === 'delivery' ? 'on' : 'off'}">${r}</g>`;
    if (r !== this.lastR) { this.gR.innerHTML = r; this.lastR = r; }

    const pre = [], offers = [], singles = [], clusters = []; let selM = null;
    const hq = BK.MAP.hq || { x: 402, y: 772 };
    pre.push(['hq', `<g class="m-hq" data-kind="hq" data-id="hq" transform="translate(${hq.x},${hq.y}) scale(${k})"><rect x="-9" y="-9" width="18" height="18" rx="3"/><path d="${OFFICE}" transform="scale(.8)"/></g>`]);
    if (BK.GrowthUI) pre.push(...BK.GrowthUI.mapItems(S, k, isSel)); // рост вглубь: фабрика, флагман, франчайзи, площадки
    for (const o of S.prodOffers) pre.push(['po' + o.id, `<g class="m-prodoffer${isSel('prodOffer', o.id) ? ' sel' : ''}" data-kind="prodOffer" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><rect x="-13" y="-13" width="26" height="26" rx="4"/><path d="${FACTORY}"/></g>`]);
    for (const o of S.offers) {
      const pulse = S.phase === 'setup_store' || S.stores.length < 2 ? ' pulse' : '';
      const dpo = layer === 'daypart' && E.daypartOf ? ' dp-' + E.daypartOf(o).peak : '';
      offers.push(['o' + o.id, `<g class="m-offer${dpo}${isSel('offer', o.id) ? ' sel' : ''}${pulse}" data-kind="offer" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><circle r="11"/><path d="M-4.5,0 H4.5 M0,-4.5 V4.5"/></g>`]);
    }
    for (const p of S.productions) {
      let g = `<g class="m-prod ${p.status}${isSel('prod', p.id) ? ' sel' : ''}" data-kind="prod" data-id="${p.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) scale(${k})"><rect x="-13" y="-13" width="26" height="26" rx="4"/><path d="${FACTORY}"/>`;
      if (p.status === 'open' && (p.load || 0) > 0.95) g += `<circle class="m-alert" cx="12" cy="-12" r="6"/><text class="m-alert-t" x="12" y="-12">!</text>`;
      pre.push(['p' + p.id, g + `</g>`]);
    }
    const cfg = BK.CFG;
    for (const n of this.nodes) {
      if (n.items.length > 1) {
        const infos = n.items.map((st) => infoById[st.id]);
        const id = n.items[0].id; this.clusterById[id] = { items: n.items, infos, x: n.x, y: n.y };
        const cnt = n.items.length, rad = clRad(cnt), rr = rad + 3, C = 2 * Math.PI * rr;
        // кольцо долей: в слое «Настроение» — по людям, в остальных — по точкам
        let parts;
        if (layer === 'mood') {
          const c = { happy: 0, mid: 0, sad: 0 };
          for (const st of n.items) for (const e of st.staff) c[BK.moodKind(e.mood)]++;
          parts = ['happy', 'mid', 'sad'].map((q) => [MOOD_COL[q], c[q]]);
        } else if (layer === 'daypart') {
          const c = { m: 0, d: 0, e: 0, flat: 0 }; for (const i of infos) c[i.tone.slice(3)]++;
          parts = ['m', 'd', 'e', 'flat'].map((q) => [DP_COL[q], c[q]]);
        } else if (layer === 'delivery') { const n = infos.filter((i) => i.tone === 'good').length; parts = [['var(--good)', n], ['var(--map-route)', infos.length - n]]; }
        else {
          const c = { good: 0, warn: 0, bad: 0, none: 0 };
          for (const i of infos) c[i.tone]++;
          parts = ['good', 'warn', 'bad', 'none'].map((q) => [TONE_COL[q], c[q]]);
        }
        const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
        let off = 0, ring = '';
        if (!parts.some((p) => p[1])) ring = `<circle r="${rr}" class="ring" stroke="var(--line-2)"/>`;
        for (const [col, v] of parts) {
          if (!v) continue; const len = C * v / tot, gap = parts.filter((p) => p[1]).length > 1 ? 1.6 : 0;
          ring += `<circle r="${rr}" class="ring" stroke="${col}" stroke-dasharray="${Math.max(0.5, len - gap).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"/>`;
          off += len;
        }
        const pr = PROB_ORDER.find((q) => infos.some((i) => i.prob === q));
        clusters.push(['c' + id, `<g class="m-cl" data-kind="cluster" data-id="${id}" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)}) scale(${k})"><circle class="bg" r="${(rr + 2.5).toFixed(1)}"/><g transform="rotate(-90)">${ring}</g><circle class="b" r="${rad.toFixed(1)}"/><text style="font-size:${(11.5 + Math.min(cnt, 20) * 0.3).toFixed(1)}px">${cnt}</text>${pr ? badge(pr, rr * 0.74, -rr * 0.74) : ''}${BK.TrainersUI ? BK.TrainersUI.clusterBadge(S, n.items, -rr * 0.74, -rr * 0.74) : ''}</g>`]);
      } else {
        const st = n.items[0], inf = infoById[st.id];
        const s1 = isSel('store', st.id);
        let g = `<g class="m-store ${inf.cls}${s1 ? ' sel' : ''}" data-kind="store" data-id="${st.id}" transform="translate(${st.x.toFixed(1)},${st.y.toFixed(1)}) scale(${k})">`;
        const rad = st.size === 'large' ? 13 : st.size === 'small' ? 10 : 11.5;
        if (s1) g += `<circle class="halo" r="${rad + 8}"/><circle class="halo2" r="${rad + 4}"/>`;
        if (BK.CollUI) g += BK.CollUI.mapBadge(S, st, -rad - 4, -rad - 4); // залог банка
        g += `<circle class="b t-${inf.tone}" r="${rad}"/><text>${st.num}</text>`;
        // смайлик: у довольных — только вблизи, иначе на большой сети карта рябит; у остальных — всегда
        if (layer === 'mood' && inf.mood && (inf.mood !== 'happy' || upp < 0.75)) g += faceSvg(inf.mood, rad * 0.8, -rad - 4, 6);
        if (inf.prob) g += badge(inf.prob, -rad * 0.85, -rad * 0.85);
        if (BK.TrainersUI) g += BK.TrainersUI.mapBadge(S, st, rad * 0.85, -rad * 0.85); // лампочка: подсказка личного тренера
        g += `</g>`;
        if (s1) selM = ['s' + st.id, g]; else singles.push(['s' + st.id, g]);
      }
    }
    // кластеры поверх одиночных точек, выделенная точка — поверх всего
    this.patch(pre.concat(offers, singles, clusters, selM ? [selM] : []));
    this.renderUi(S, infoById);
    this.renderRivals(S, k);
  };
  // сеть-соперник: приглушённые ромбы отдельным слоем под маркерами игрока (слой создаётся при первой отрисовке)
  Map.prototype.renderRivals = function (S, k) {
    const R = BK.Engine.rivalSummary ? BK.Engine.rivalSummary(S) : null;
    if (!this.gRv) { this.gRv = document.createElementNS('http://www.w3.org/2000/svg', 'g'); this.gRv.setAttribute('class', 'rivals'); this.gM.parentNode.insertBefore(this.gRv, this.gM); }
    let h = '';
    if (R) for (const o of R.stores) h += `<g class="m-rival" data-kind="rival" data-id="${o.id}" transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)}) scale(${k})"><rect x="-5.5" y="-5.5" width="11" height="11" rx="1.5" transform="rotate(45)"/></g>`;
    if (h !== this.lastRv) { this.gRv.innerHTML = h; this.lastRv = h; (this.el.parentNode || this.el).classList.toggle('has-rival', !!h); }
  };

  /* ---------- легенда, линейка, картуш ---------- */
  const ring3 = (cols) => { // значок кластера для легенды
    const C = 2 * Math.PI * 10; let off = 0, s = '';
    for (const [c, f] of cols) { s += `<circle r="10" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="${(C * f - 1.2).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90)"/>`; off += C * f; }
    return `<svg viewBox="-13 -13 26 26" class="lg-cl" aria-hidden="true">${s}<circle r="7.5" fill="var(--surface)" stroke="var(--line-2)"/><text text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" fill="var(--ink)" font-family="var(--f-mono)">8</text></svg>`;
  };
  const dot = (col, dash) => `<svg viewBox="0 0 16 16" class="lg-sw" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="var(--surface)" stroke="${col}" stroke-width="2.4"${dash ? ' stroke-dasharray="2.5 2"' : ''}/></svg>`;
  const bdgIcon = (k) => `<svg viewBox="-8 -8 16 16" class="lg-sw" aria-hidden="true">${badge(k, 0, 0)}</svg>`;
  Map.prototype.renderUi = function (S, infoById) {
    if (!this.uiLegend) return;
    // «хлебные крошки» второго акта: Россия › город (кнопка ведёт на карту России)
    const ru = !!(S.corp && S.corp.unlockedDay != null), cn = (BK.CITY && BK.CITY.name) || 'Уфа', ck = ru ? cn : '';
    if (ck !== this.lastCrumb) {
      this.lastCrumb = ck;
      const b = this.uiLayers.querySelector('.ml-crumb'), dv = this.uiLayers.querySelector('.ml-div');
      b.hidden = dv.hidden = !ru;
      b.innerHTML = `${IC.globe}<span class="cr-ru">Россия</span><span class="cr-sep" aria-hidden="true">›</span><b>${esc(cn)}</b>`;
      b.setAttribute('aria-label', `Россия › ${cn}. Открыть карту России`);
    }
    const E = BK.Engine, layer = this.layer;
    const infos = S.stores.map((st) => infoById[st.id]);
    const row = (sw, label, v) => `<span class="lg-r">${sw}<span>${label}</span><b>${v}</b></span>`;
    let h = '';
    if (layer === 'mood') {
      const c = { happy: 0, mid: 0, sad: 0 };
      for (const st of S.stores) for (const e of st.staff) c[BK.moodKind(e.mood)]++;
      h += `<span class="lg-t">Слой · настроение команды</span>`;
      h += row(BK.faceIcon('happy'), 'Довольны', c.happy) + row(BK.faceIcon('mid'), 'Терпят', c.mid) + row(BK.faceIcon('sad'), 'Недовольны', c.sad);
      h += `<span class="lg-h">${ring3([['var(--face-happy)', 0.7], ['var(--face-mid)', 0.2], ['var(--face-sad)', 0.1]])}<span>Кластер: число точек,<br>кольцо — доли людей</span></span>`;
    } else if (layer === 'profit') {
      const c = { good: 0, warn: 0, bad: 0, none: 0 }; for (const i of infos) c[i.tone]++;
      h += `<span class="lg-t">Слой · маржа за месяц</span>`;
      h += row(dot('var(--good)'), '15 % и выше', c.good) + row(dot('var(--warn)'), 'От 0 до 15 %', c.warn) + row(dot('var(--bad)'), 'Убыток', c.bad);
      if (c.none) h += row(dot('var(--line-2)', true), 'Ещё нет отчёта', c.none);
      h += `<span class="lg-h">${ring3([['var(--good)', 0.7], ['var(--warn)', 0.2], ['var(--bad)', 0.1]])}<span>Кластер: число точек,<br>кольцо — доли по марже</span></span>`;
    } else if (layer === 'staff') {
      const c = { good: 0, warn: 0, bad: 0, none: 0 }; let vac = 0;
      for (const i of infos) { c[i.tone]++; vac += i.vac; }
      h += `<span class="lg-t">Слой · штат точек</span>`;
      h += row(dot('var(--good)'), 'Полный штат', c.good) + row(dot('var(--warn)'), 'Есть вакансии', c.warn) + row(dot('var(--bad)'), 'Меньше минимума', c.bad);
      h += `<span class="lg-h">${ring3([['var(--good)', 0.7], ['var(--warn)', 0.2], ['var(--bad)', 0.1]])}<span>Открытых вакансий: <b class="num">${vac}</b><br>кольцо — доли точек</span></span>`;
    } else if (layer === 'daypart') {
      const c = { m: 0, d: 0, e: 0, flat: 0 }; for (const i of infos) c[i.tone.slice(3)]++;
      h += `<span class="lg-t">Слой · когда приходят гости</span>`;
      for (const [q, l] of DP_ROWS) h += row(dot(DP_COL[q]), l, c[q]);
      h += `<span class="lg-h">${ring3([['var(--dp-m)', 0.4], ['var(--dp-d)', 0.2], ['var(--dp-e)', 0.4]])}<span>Кластер: доли точек по пику,<br>свободные помещения — тем же цветом</span></span>`;
    } else {
      h += `<span class="lg-t">Слой · доставка из цехов</span>`;
      const na = S.stores.filter((st) => st.agg).length;
      h += row(dot('var(--good)'), 'В агрегаторах доставки', na) + row(dot('var(--line-2)', true), 'Без агрегаторов', S.stores.length - na);
      for (const p of S.productions) {
        const n = S.stores.filter((st) => st.status !== 'opening' && E.nearestProd(S, st) === p).length;
        h += `<span class="lg-r"><svg viewBox="0 0 16 16" class="lg-sw" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="var(--prod-bg)"/></svg><span>${esc(p.name)}${p.status === 'open' ? ` · ${nw(n, 'точка', 'точки', 'точек')}` : ' · открывается'}</span><b>${Math.round((p.load || 0) * 100)} %</b></span>`;
      }
      if (BK.GrowthUI) h += BK.GrowthUI.legend(S);
      h += `<span class="lg-h"><svg viewBox="0 0 26 10" class="lg-rt" aria-hidden="true"><path d="M1 5H25" stroke="var(--map-route)" stroke-width="1.8" stroke-dasharray="2 3.5" stroke-linecap="round"/></svg><span>Маршрут от ближайшего цеха,<br>справа — загрузка цеха</span></span>`;
    }
    const probs = {}; for (const i of infos) if (i.prob) probs[i.prob] = (probs[i.prob] || 0) + 1;
    const pk = PROB_ORDER.filter((q) => probs[q]);
    if (pk.length) h += `<span class="lg-p">${pk.map((q) => `<span>${bdgIcon(q)}${PROB[q]}: ${probs[q]}</span>`).join('')}</span>`;
    if (h !== this.lastLegend) { this.uiLegend.innerHTML = h; this.lastLegend = h; }

    // масштабная линейка: шаг 0,5–10 км, чтобы деление было не короче 22 px
    const pxKm = kmU() / this.upp();
    const step = [0.5, 1, 2, 5, 10].find((q) => pxKm * q >= 22) || 10, w = pxKm * step;
    const f = (v) => String(v).replace('.', ',');
    const sc = `<div class="sc-bars" style="width:${(w * 2).toFixed(0)}px"><i></i><i></i><i></i></div><div class="sc-lbl" style="width:${(w * 2).toFixed(0)}px"><span style="left:0">0</span><span style="left:${w.toFixed(0)}px">${f(step)} км</span><span style="left:${(w * 2).toFixed(0)}px">${f(step * 2)}</span></div>`;
    if (sc !== this.lastSc) { this.uiScale.innerHTML = sc; this.lastSc = sc; }

    // картуш: лист = год игры
    const d = E.dateOf(S.day), sheet = d.y - BK.CFG.START_YEAR + 1;
    const denom = this.upp() * (1e6 / kmU()) / 0.2646; // 1 px ≈ 0,2646 мм на экране 96 dpi
    const mag = Math.pow(10, Math.floor(Math.log10(denom)) - 1), den = Math.round(denom / mag) * mag;
    const nm = /[«»"„“]/.test(S.company) ? S.company : `«${S.company}»`;
    const open = S.stores.filter((st) => st.status !== 'opening').length;
    // картуш строится один раз, дальше меняется только текст полей (дата — каждый игровой день)
    if (!this.ct) {
      this.uiCart.innerHTML = `<div class="ct-in"><div class="ct-c ct-full"><small>Градплан сети</small><div class="ct-t"></div></div>
      <div class="ct-c"><small>Масштаб</small><div class="ct-v"></div></div>
      <div class="ct-c"><small>Дата</small><div class="ct-v"></div></div>
      <div class="ct-c ct-last"><small>Точек</small><div class="ct-v"></div></div>
      <div class="ct-c ct-last"><small>Исполнил</small><div class="ct-v ct-name"></div></div></div>`;
      this.ct = [...this.uiCart.querySelectorAll('.ct-t, .ct-v')];
    }
    const vals = [`${(BK.CITY && BK.CITY.name) || 'Уфа'} · лист ${sheet}`, `1 : ${den.toLocaleString('ru-RU')}`, `${String(d.d).padStart(2, '0')}.${String(d.m + 1).padStart(2, '0')}.${d.y}`,
      `${open}${S.stores.length > open ? '+' + (S.stores.length - open) : ''} · цехов ${S.productions.length}`, nm];
    vals.forEach((v, i) => { if (this.ct[i].textContent !== v) this.ct[i].textContent = v; });
  };

  BK.MapView = Map;
  BK.mapStatic = staticLayer;
})();
