/* Карта России для макетов второго акта (docs/russia-design.md §3).
   Проекция из документа: x = 60 + (долгота − 27) × 24, y = 40 + (68 − широта) × 34.
   Это стилизация: береговая линия упрощена, государственных границ нет — только суша, моря и реки. */
(function () {
  const P = (lon, lat) => [60 + (lon - 27) * 24, 40 + (68 - lat) * 34];
  const PP = (pts) => pts.map(([lon, lat]) => P(lon, lat));

  function smooth(pts, closed) {
    const n = pts.length; const g = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + (closed ? 'Z' : '');
  }

  // ---------- Моря и озёра (долгота, широта) ----------
  const SEA = {
    arctic: [[24, 71.0], [26, 71.1], [28, 70.9], [30, 70.1], [31.5, 69.8], [33, 69.4], [35, 69.2], [37, 68.9], [39, 68.4], [40.8, 67.9], [41.3, 67.0],
      [40.8, 66.4], [38.5, 66.1], [35.5, 66.3], [33.6, 66.7], [32.6, 67.1], [33.4, 66.2], [34.8, 65.1], [34.8, 64.4], [36.2, 64.0], [37.8, 63.9], [38.3, 64.6], [40.0, 64.5], [40.6, 64.8], [40.2, 65.5], [42.0, 66.3], [44.0, 66.1], [44.2, 66.9], [43.3, 68.1], [43.9, 68.6], [46.0, 68.2], [47.0, 67.7], [50.0, 67.9], [53.0, 68.2], [54.5, 68.6], [57.0, 68.6], [59.0, 68.9], [60.6, 69.6], [64.0, 69.3], [66.5, 69.1], [67.6, 68.5], [68.6, 68.3], [68.9, 69.5], [67.1, 70.8], [66.9, 71.5], [68.6, 72.5], [69.6, 72.9], [72.4, 72.8], [72.8, 71.5], [72.0, 70.2], [72.6, 69.3], [72.5, 68.2], [73.5, 67.5], [72.9, 66.8], [74.0, 66.9], [75.0, 67.7], [76.8, 67.3], [78.4, 67.6], [77.5, 68.4], [76.0, 68.9], [75.0, 69.3], [74.6, 70.5], [73.6, 71.3], [75.0, 72.2], [78.0, 72.3], [80.0, 71.6], [82.0, 70.9], [83.0, 70.2], [82.6, 69.5], [84.0, 69.8], [86.0, 70.6], [87.0, 71.8], [90.0, 72.6], [96, 73.6], [96, 80], [24, 80]],
    novaya: [[53.6, 71.2], [52.5, 72.0], [53.0, 72.9], [55.0, 73.7], [56.5, 74.4], [58.0, 75.3], [60.0, 76.4], [62.0, 76.6], [59.6, 75.0], [57.8, 73.8], [56.2, 73.0], [55.3, 72.0], [56.8, 70.8], [55.0, 70.6]],
    vaygach: [[58.4, 70.0], [59.6, 70.4], [60.6, 69.9], [59.2, 69.7]],
    finland: [[20, 60.3], [24, 60.2], [26, 60.45], [27.8, 60.55], [29.2, 60.2], [30.3, 59.95], [29.2, 59.85], [28.1, 59.5], [26.5, 59.5], [24.5, 59.45], [23.5, 59.2], [20, 58.8]],
    black: [[26, 40], [26.5, 41.3], [28.0, 41.4], [29.2, 41.2], [31.2, 41.1], [33.0, 42.0], [35.0, 42.0], [36.5, 41.3], [38.0, 40.9], [40.0, 41.0], [41.5, 41.6], [41.6, 42.3], [40.5, 43.1], [39.7, 43.6], [38.5, 44.3], [37.3, 44.7], [36.8, 45.1], [36.5, 45.2], [35.5, 45.0], [34.5, 44.5], [33.4, 44.6], [32.5, 45.4], [33.6, 46.0], [32.6, 46.1], [31.8, 46.6], [30.7, 46.5], [29.7, 45.3], [28.8, 44.6], [28.2, 43.5], [27.9, 42.2], [26.5, 41.8]],
    azov: [[35.1, 45.9], [35.4, 45.35], [36.6, 45.4], [37.6, 46.0], [38.3, 46.5], [39.3, 47.2], [38.0, 47.1], [36.5, 46.8], [35.3, 46.4]],
    caspian: [[49.6, 40.4], [49.0, 39.2], [48.9, 38.4], [49.2, 37.6], [50.3, 37.1], [51.6, 36.8], [53.6, 36.9], [54.0, 37.4], [53.9, 38.9], [53.2, 39.6], [53.0, 40.8], [52.8, 41.6], [52.5, 42.6], [51.3, 43.2], [50.4, 44.4], [51.2, 44.6], [51.8, 45.2], [53.0, 45.6], [53.2, 46.5], [52.5, 46.9], [51.0, 47.0], [49.5, 46.5], [48.7, 46.3], [47.8, 45.7], [47.2, 45.2], [46.8, 44.4], [47.4, 43.6], [47.6, 42.8], [48.5, 41.8]],
    ladoga: [[31.0, 60.0], [32.5, 60.4], [32.9, 60.9], [32.4, 61.3], [31.2, 61.75], [30.1, 61.3], [29.9, 60.6], [30.5, 60.1]],
    onega: [[34.5, 61.2], [35.8, 61.0], [36.3, 61.5], [35.8, 62.3], [35.2, 62.9], [34.3, 62.4], [34.9, 61.8]],
  };
  const ISLANDS = ['novaya', 'vaygach'];

  const RIVER = {
    volga: { w: 3.2, pts: [[33.0, 57.2], [35.9, 56.9], [37.5, 57.4], [38.8, 58.05], [39.9, 57.6], [40.9, 57.8], [42.5, 57.1], [44.0, 56.3], [46.0, 56.2], [47.2, 56.1], [49.1, 55.8], [48.8, 54.9], [48.4, 54.3], [49.4, 53.5], [50.1, 53.2], [48.5, 53.1], [47.4, 52.2], [46.0, 51.5], [45.4, 50.2], [44.5, 48.7], [45.8, 47.6], [47.2, 46.9], [48.0, 46.35], [48.5, 45.9]] },
    kama: { w: 2.4, pts: [[52.8, 58.3], [54.2, 60.0], [56.0, 59.9], [56.8, 59.6], [56.6, 58.7], [56.2, 58.0], [55.2, 57.3], [54.3, 56.6], [53.3, 55.9], [52.4, 55.7], [51.0, 55.4], [49.9, 55.3], [49.2, 55.1]] },
    belaya: { w: 1.8, pts: [[58.6, 54.1], [57.4, 53.3], [56.3, 53.5], [55.8, 53.9], [55.9, 54.4], [56.0, 54.75], [55.3, 55.3], [54.4, 55.8], [53.9, 56.0]] },
    ural: { w: 2.0, pts: [[59.4, 54.6], [59.1, 53.4], [58.8, 52.2], [58.6, 51.2], [57.0, 51.6], [55.1, 51.8], [53.3, 51.6], [51.4, 51.2], [51.3, 49.8], [51.7, 48.2], [51.9, 47.1], [51.9, 46.95]] },
    ob: { w: 3.0, pts: [[84.5, 52.6], [83.8, 53.4], [82.9, 55.0], [84.2, 56.6], [85.0, 58.3], [83.0, 59.8], [79.5, 60.8], [76.5, 61.0], [73.4, 61.25], [70.5, 61.1], [69.0, 61.0], [67.0, 62.2], [65.8, 63.8], [65.3, 65.3], [66.6, 66.5], [69.0, 66.6], [71.5, 66.6], [73.0, 66.9]] },
    irtysh: { w: 2.0, pts: [[75.5, 51.0], [74.0, 53.5], [73.4, 55.0], [72.0, 56.4], [70.0, 57.6], [68.3, 58.2], [68.6, 59.6], [69.0, 61.0]] },
  };
  const URALS = [[66.5, 68.4], [64.8, 67.2], [62.5, 65.6], [60.2, 64.2], [59.3, 62.0], [59.0, 60.0], [59.5, 57.8], [59.2, 55.6], [58.9, 53.6], [58.6, 51.6]];

  // ---------- Города (§2.3) ----------
  // id, название, население (млн), широта, долгота
  const CITY = [
    ['ufa', 'Уфа', 1.16, 54.7, 56.0], ['sterl', 'Стерлитамак', 0.28, 53.3, 55.9], ['chelny', 'Наб. Челны', 0.55, 55.7, 52.4],
    ['oren', 'Оренбург', 0.55, 51.8, 55.1], ['chel', 'Челябинск', 1.18, 55.2, 61.4], ['samara', 'Самара', 1.16, 53.2, 50.2],
    ['perm', 'Пермь', 1.03, 58.0, 56.2], ['kazan', 'Казань', 1.32, 55.8, 49.1], ['ekb', 'Екатеринбург', 1.54, 56.8, 60.6],
    ['tyumen', 'Тюмень', 0.85, 57.2, 65.5], ['nn', 'Нижний Новгород', 1.20, 56.3, 44.0], ['volg', 'Волгоград', 1.02, 48.7, 44.5],
    ['vrn', 'Воронеж', 1.05, 51.7, 39.2], ['rnd', 'Ростов-на-Дону', 1.14, 47.2, 39.7], ['krd', 'Краснодар', 1.10, 45.0, 39.0],
    ['sochi', 'Сочи', 0.45, 43.6, 39.7], ['msk', 'Москва', 13.1, 55.8, 37.6], ['spb', 'Санкт-Петербург', 5.6, 59.9, 30.3],
    ['nsk', 'Новосибирск', 1.63, 55.0, 82.9],
  ].map(([id, name, pop, lat, lon]) => { const [x, y] = P(lon, lat); return { id, name, pop, lat, lon, x, y, r: 6 + 16 * Math.log(pop / 0.28) / Math.log(13.1 / 0.28) }; });
  const C = Object.fromEntries(CITY.map((c) => [c.id, c]));

  // Наши города на 11.09.2040. rev/profit — за 12 мес., млрд ₽; dev — выручка на точку против прогноза, %
  const OWN = {
    ufa: { n: 48, rev: 5.12, profit: 0.93, dir: 'АГ', dirName: 'Айдар Галиев', grade: 2, loyal: 78, lt: 1, rating: 4.6, churn: 21, dev: 1.2, since: 'с 2027', active: true, hist: [3.9, 4.0, 4.1, 4.2, 4.3, 4.35, 4.5, 4.6, 4.7, 4.8, 5.0, 5.12] },
    kazan: { n: 22, rev: 2.31, profit: 0.37, dir: 'ГХ', dirName: 'Гульнара Хасанова', grade: 3, loyal: 72, lt: 1, rating: 4.5, churn: 18, dev: 2.4, since: 'апр. 2038', hist: [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.31] },
    chel: { n: 18, rev: 1.52, profit: 0.20, dir: 'ДВ', dirName: 'Дмитрий Воронцов', grade: 3, loyal: 41, lt: -1, rating: 4.2, churn: 29, dev: -1.1, since: 'нояб. 2038', risk: 'poach', hist: [0.7, 0.8, 0.85, 0.95, 1.0, 1.1, 1.2, 1.25, 1.3, 1.4, 1.45, 1.52] },
    sterl: { n: 12, rev: 0.78, profit: 0.09, dir: 'ИЮ', dirName: 'Ильдар Юсупов', grade: 1, loyal: 63, lt: 0, rating: 4.1, churn: 26, dev: -5.2, since: 'июнь 2037', hist: [0.66, 0.68, 0.7, 0.71, 0.72, 0.73, 0.74, 0.75, 0.75, 0.76, 0.77, 0.78] },
    samara: { n: 9, rev: 0.64, profit: -0.04, dir: null, loyal: null, rating: 3.9, churn: 34, dev: -3.8, since: 'май 2039', risk: 'loss', hist: [0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.47, 0.52, 0.56, 0.6, 0.62, 0.64] },
    oren: { n: 3, rev: 0.03, profit: -0.02, dir: 'ЕК', dirName: 'Елена Кравцова', grade: 2, loyal: 66, lt: 1, rating: 4.0, churn: 0, dev: null, since: 'авг. 2040', launch: 0.6, hist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.01, 0.03] },
  };
  const LOCKED = ['msk', 'spb'];

  const fmt = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d).replace('.', ',');

  // Иконка замка (центр 0,0, ~ 12×14)
  const LOCK = (col) => `<rect x="-5.5" y="-1.5" width="11" height="8.5" rx="1.8" fill="${col}"/><path d="M-3.4,-1.5 V-4 a3.4,3.4 0 0 1 6.8,0 V-1.5" fill="none" stroke="${col}" stroke-width="1.8"/>`;

  function alertBadge(kind, x, y, k) {
    const col = kind === 'loss' ? 'var(--bad)' : 'var(--warn)';
    const glyph = kind === 'loss'
      ? `<text x="0" y="0.5" text-anchor="middle" dominant-baseline="central" font-family="var(--f-mono)" font-weight="700" font-size="9" fill="#fff">₽</text>`
      : `<circle cx="-1" cy="-2.4" r="2.1" fill="#fff"/><path d="M-4.8,4 Q-1,-1.2 2.8,4 Z" fill="#fff"/><path d="M2.2,-1.8 L5.2,-4.6 M5.2,-4.6 L2.8,-4.6 M5.2,-4.6 L5.2,-2.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;
    return `<g class="m-alert" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="4" fill="${col}"/>${glyph}</g>`;
  }

  function render(svg, o) {
    o = Object.assign({ vb: [40, -110, 1440, 1204], k: 1, lk: 1, id: 'ru', labels: true, logistics: true, others: true, sel: null, par: 'xMidYMid meet', lockNote: false }, o);
    const k = o.k, lk = o.lk, nk = o.nk || o.k, bk = o.bk || o.k;
    svg.setAttribute('viewBox', o.vb.join(' '));
    svg.setAttribute('preserveAspectRatio', o.par);
    const [vx, vy, vw, vh] = o.vb;
    let s = `<defs>
      <pattern id="${o.id}-g1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--grid-minor)" stroke-width="${0.9 / (o.gk || 1)}"/></pattern>
      <pattern id="${o.id}-g5" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#${o.id}-g1)"/><path d="M100 0H0V100" fill="none" stroke="var(--grid-major)" stroke-width="${1.4 / (o.gk || 1)}"/></pattern>
      <pattern id="${o.id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--crust-soft)"/><path d="M0 0V6" stroke="var(--crust)" stroke-width="2.2"/></pattern>
      <pattern id="${o.id}-sea" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 7 q3.5 -3 7 0 t7 0" fill="none" stroke="var(--river)" stroke-width=".9" opacity=".22"/></pattern>
    </defs>`;
    s += `<rect x="${vx - 400}" y="${vy - 400}" width="${vw + 800}" height="${vh + 800}" fill="var(--district)"/>`;
    s += `<rect x="${vx - 400}" y="${vy - 400}" width="${vw + 800}" height="${vh + 800}" fill="url(#${o.id}-g5)"/>`;
    // рабочая зона листа 27°–90° в. д., 42°–68° с. ш.
    const z0 = P(27, 68), z1 = P(90, 42);
    s += `<rect x="${z0[0]}" y="${z0[1]}" width="${z1[0] - z0[0]}" height="${z1[1] - z0[1]}" fill="none" stroke="var(--ink-3)" stroke-width="${1 / (o.gk || 1)}" stroke-dasharray="14 4 2 4" opacity=".45"/>`;
    // градусная сетка
    for (let lon = 30; lon <= 90; lon += 10) { const a = P(lon, 76), b = P(lon, 34); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--ink-3)" stroke-width="${.8 / (o.gk || 1)}" stroke-dasharray="3 6" opacity=".35"/>`; }
    for (let lat = 40; lat <= 70; lat += 5) { const a = P(20, lat), b = P(100, lat); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--ink-3)" stroke-width="${.8 / (o.gk || 1)}" stroke-dasharray="3 6" opacity=".35"/>`; }
    // моря: «разлив» + вода + береговая линия
    for (const [key, pts] of Object.entries(SEA)) {
      const d = smooth(PP(pts), true);
      if (ISLANDS.includes(key)) { s += `<path d="${d}" fill="var(--district)" stroke="var(--map-edge)" stroke-width="1.4"/>`; continue; }
      s += `<path d="${d}" fill="none" stroke="var(--map-river)" stroke-width="9" opacity=".10" stroke-linejoin="round"/>`;
      s += `<path d="${d}" fill="var(--river-soft)" stroke="var(--map-river)" stroke-width="1.3" stroke-opacity=".55" stroke-linejoin="round"/>`;
      s += `<path d="${d}" fill="url(#${o.id}-sea)"/>`;
    }
    // Уральский хребет — чертёжная штриховка
    {
      const pts = PP(URALS); let hs = '';
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
        for (let t = 0; t < L; t += 7) { const cx = x1 + ux * t, cy = y1 + uy * t, len = 6 + ((i * 7 + t) % 3) * 2.5; hs += `M${(cx - uy * len).toFixed(1)},${(cy + ux * len).toFixed(1)}L${(cx + uy * len).toFixed(1)},${(cy - ux * len).toFixed(1)}`; }
      }
      s += `<path d="${hs}" stroke="var(--rye)" stroke-width="1.1" opacity=".42"/>`;
      s += `<path d="${smooth(pts)}" fill="none" stroke="var(--rye)" stroke-width="1.4" opacity=".5"/>`;
    }
    // реки
    for (const r of Object.values(RIVER)) s += `<path d="${smooth(PP(r.pts))}" fill="none" stroke="var(--map-river)" stroke-width="${r.w * 2.6}" opacity=".12" stroke-linecap="round"/><path class="m-river" d="${smooth(PP(r.pts))}" stroke-width="${r.w}"/>`;

    if (o.labels && o.geoLabels !== false) {
      const t = (cls, lon, lat, rot, txt, fs, extra) => { const [x, y] = P(lon, lat); return `<text class="${cls} m-halo" style="stroke:var(--district);font-size:${fs}px;stroke-width:${4 * lk}px;${extra || ''}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot})">${txt}</text>`; };
      const rl = (lon, lat, rot, txt, f) => t('m-rlabel', lon, lat, rot, txt, 12 * lk * (f || 1));
      const sea = (lon, lat, rot, txt, f) => { const [x, y] = P(lon, lat); return `<text class="m-rlabel" style="font-size:${13 * lk * (f || 1)}px;letter-spacing:.14em;opacity:.85" text-anchor="middle" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot})">${txt}</text>`; };
      s += rl(45.0, 50.9, -62, 'р. Волга') + rl(54.9, 59.9, -8, 'р. Кама') + rl(57.3, 53.05, 20, 'р. Белая', .9) + rl(51.0, 50.6, -82, 'р. Урал') + rl(77.5, 61.6, 4, 'р. Обь') + rl(70.2, 57.3, -34, 'р. Иртыш', .9);
      s += sea(49.5, 69.6, 0, 'БАРЕНЦЕВО МОРЕ') + sea(37.2, 65.4, 0, 'Белое море', .85) + sea(33.3, 43.2, 0, 'ЧЁРНОЕ МОРЕ') + sea(37.2, 46.2, -26, 'Азовское м.', .72) + sea(51.3, 40.0, -76, 'КАСПИЙСКОЕ МОРЕ', .85) + sea(79.5, 71.2, 0, 'КАРСКОЕ МОРЕ', .9);
      s += t('m-small', 59.75, 61.2, -84, 'У Р А Л Ь С К И Й   Х Р Е Б Е Т', 10.5 * lk, 'fill:var(--rye);font-weight:600;letter-spacing:.1em;font-style:italic');
      // подписи градусов у рамки листа
      const gy = o.degY != null ? o.degY : Math.min(z1[1], vy + vh) - 6, gx = o.degX != null ? o.degX : Math.max(z0[0], vx) + 5;
      for (let lon = 30; lon <= 90; lon += 10) { const [x] = P(lon, 0); s += `<text x="${x + 4}" y="${gy}" font-family="var(--f-mono)" font-size="${9.5 * lk}" fill="var(--ink-3)" opacity=".8">${lon}° в. д.</text>`; }
      for (let lat = 40; lat <= 65; lat += 5) { if ((o.degSkip || []).includes(lat)) continue; const [, y] = P(0, lat); s += `<text x="${gx}" y="${y - 5}" font-family="var(--f-mono)" font-size="${9.5 * lk}" fill="var(--ink-3)" opacity=".8">${lat}° с. ш.</text>`; }
    }
    // лист продолжается
    if (o.sheetEdge !== false) {
      const xe = o.sheetEdge || 1462;
      s += `<line x1="${xe}" y1="${vy}" x2="${xe}" y2="${vy + vh}" stroke="var(--ink-2)" stroke-width="1.2" stroke-dasharray="10 6" opacity=".55"/>`;
      s += `<rect x="${xe}" y="${vy}" width="400" height="${vh}" fill="var(--map-land)" opacity=".55"/>`;
    }

    // логистика от Уфы
    const ufa = C.ufa;
    const LOG = [['sterl', 'fresh', '130 км'], ['oren', 'frozen', '370 км'], ['samara', 'frozen', '460 км']];
    if (o.logistics) for (const [id, kind, km] of LOG) {
      const b = C[id]; const mx = (ufa.x + b.x) / 2, my = (ufa.y + b.y) / 2;
      const col = kind === 'fresh' ? 'var(--crust)' : 'var(--river)';
      const bend = id === 'samara' ? -28 : id === 'oren' ? -14 : 14;
      const dx = b.x - ufa.x, dy = b.y - ufa.y, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      const cx = mx + nx * bend, cy = my + ny * bend;
      s += `<path d="M${ufa.x},${ufa.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x},${b.y}" fill="none" stroke="${col}" stroke-width="${2.2 * k}" stroke-dasharray="${kind === 'fresh' ? `${2 * k} ${4 * k}` : `${7 * k} ${4 * k}`}" stroke-linecap="round" opacity=".9"/>`;
      if (o.kmLabels !== false && id !== 'sterl') s += `<text class="m-small m-halo" style="stroke:var(--district);font-family:var(--f-mono);font-size:${9.5 * lk}px;stroke-width:${3.5 * lk}px;fill:${kind === 'fresh' ? 'var(--crust-t)' : 'var(--river-t)'};font-weight:600" x="${(cx * 0.5 + mx * 0.5).toFixed(1)}" y="${(cy * 0.5 + my * 0.5 + (id === 'samara' ? -6 : 14 * lk)).toFixed(1)}" text-anchor="middle">${km}</text>`;
    }

    // города
    const lab = o.labelPos || {};
    const nodes = [];
    for (const c of CITY) {
      const own = OWN[c.id], locked = LOCKED.includes(c.id);
      if (!own && !o.others) continue;
      const lp = Object.assign({ dx: 1, dy: 0, a: 'start' }, lab[c.id] || {});
      if (own) {
        const r = Math.max(c.r, 10.5 + 1.3 * Math.sqrt(own.n)) * k, rr = r + 4.2 * k;
        const ringCol = o.layer === 'loyal' ? (own.loyal == null ? 'var(--bad)' : own.loyal >= 60 ? 'var(--good)' : own.loyal >= 45 ? 'var(--warn)' : 'var(--bad)')
          : own.launch ? 'var(--crust)' : own.profit < 0 ? 'var(--bad)' : own.profit / own.rev >= 0.15 ? 'var(--good)' : 'var(--warn)';
        let g = `<g transform="translate(${c.x.toFixed(1)},${c.y.toFixed(1)})">`;
        if (o.sel === c.id) g += `<circle r="${rr + 11 * k}" fill="var(--crust)" opacity=".16"/><circle r="${rr + 7 * k}" fill="none" stroke="var(--crust)" stroke-width="${1.3 * k}" stroke-dasharray="${3 * k} ${2.5 * k}"/>`;
        g += `<circle r="${rr + 2.6 * k}" fill="var(--surface)" opacity=".94"/>`;
        if (own.launch) {
          const Cc = 2 * Math.PI * rr;
          g += `<circle r="${rr}" fill="none" stroke="var(--line-2)" stroke-width="${4.2 * k}"/><circle r="${rr}" fill="none" stroke="var(--crust)" stroke-width="${4.2 * k}" stroke-dasharray="${Cc * own.launch} ${Cc}" transform="rotate(-90)"/>`;
          g += `<circle r="${r}" fill="url(#${o.id}-hatch)" stroke="var(--crust)" stroke-width="${1.2 * k}"/><circle r="${r * 0.62}" fill="var(--surface)"/>`;
          g += `<text font-family="var(--f-mono)" font-weight="700" font-size="${11 * k}" fill="var(--ink)" text-anchor="middle" dominant-baseline="central">${own.n}</text>`.replace(`font-size="${11 * k}"`, `font-size="${11 * nk}"`);
        } else {
          g += `<circle r="${rr}" fill="none" stroke="${ringCol}" stroke-width="${4.2 * k}"/>`;
          g += `<circle r="${r}" fill="var(--crust)" stroke="var(--surface)" stroke-width="${1.4 * k}"/><circle r="${r - 3 * k}" fill="none" stroke="var(--on-primary)" stroke-opacity=".45" stroke-width="${.9 * k}"/>`;
          g += `<text font-family="var(--f-mono)" font-weight="700" font-size="${(10 + Math.sqrt(own.n) * 0.75) * nk}" fill="var(--on-primary)" text-anchor="middle" dominant-baseline="central">${own.n}</text>`;
        }
        g += `</g>`;
        // бейдж директора
        const bx = c.x + rr * 0.82, by = c.y - rr * 0.82;
        if (o.badges !== false) {
          if (own.dir) g += `<g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) scale(${bk})"><rect x="-10" y="-7.5" width="20" height="15" rx="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="1.4"/><text font-family="var(--f-display)" font-weight="600" font-size="7.2" fill="var(--surface)" text-anchor="middle" dominant-baseline="central" letter-spacing=".04em">${own.dir}</text></g>`;
          else g += `<g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) scale(${bk})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="4" fill="var(--bad)" stroke="var(--surface)" stroke-width="1.4"/><text font-family="var(--f-mono)" font-weight="700" font-size="10" fill="#fff" text-anchor="middle" dominant-baseline="central">!</text></g>`;
          if (own.risk && o.alerts !== false) g += alertBadge(own.risk, c.x + rr * 0.82, c.y + rr * 0.82, bk * 1.05);
        }
        nodes.push(g);
        if (o.labels) {
          const lx = c.x + lp.dx * (rr + 7 * k) + (lp.ox || 0), ly = c.y + (lp.dy ? lp.dy * (rr + 9 * k) : 0) + (lp.oy || 0) + 4 * lk;
          nodes.push(`<text class="m-dlabel m-halo" style="stroke:var(--district);font-size:${11.5 * lk}px;stroke-width:${4.4 * lk}px;fill:var(--ink);font-weight:600;text-anchor:${lp.a}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${c.name}</text>`);
          if (own.active && o.activeTag !== false) nodes.push(`<text class="m-halo" style="stroke:var(--district);stroke-width:${3.5 * lk}px;font-family:var(--f-body);font-size:${10 * lk}px;fill:var(--crust-t);font-weight:600;text-anchor:${lp.a}" x="${lx.toFixed(1)}" y="${(ly + 13 * lk).toFixed(1)}">активный город</text>`);
          if (own.launch && o.activeTag !== false) nodes.push(`<text class="m-halo" style="stroke:var(--district);stroke-width:${3.5 * lk}px;font-family:var(--f-body);font-size:${10 * lk}px;fill:var(--crust-t);font-weight:600;text-anchor:${lp.a}" x="${lx.toFixed(1)}" y="${(ly + 13 * lk).toFixed(1)}">запуск · ${Math.round(own.launch * 100)} %</text>`);
        }
      } else {
        const r = c.r * k;
        let g = `<g transform="translate(${c.x.toFixed(1)},${c.y.toFixed(1)})" opacity="${locked ? .9 : .8}">`;
        g += `<circle r="${r + 3 * k}" fill="var(--district)" opacity=".85"/><circle r="${r}" fill="${locked ? 'var(--surface-3)' : 'var(--surface)'}" fill-opacity="${locked ? .9 : .55}" stroke="var(--ink-3)" stroke-width="${1.3 * k}" stroke-dasharray="${3 * k} ${2.4 * k}"/>`;
        if (!locked) g += `<circle r="${Math.max(1.8, r * .22)}" fill="var(--ink-3)"/>`;
        else g += `<g transform="scale(${k * (r > 16 * k ? 1.35 : 1.15)})">${LOCK('var(--ink-2)')}</g>`;
        g += `</g>`;
        nodes.push(g);
        if (o.labels && (!o.otherLabels || o.otherLabels.includes(c.id))) {
          const lx = c.x + lp.dx * (r + 6 * k) + (lp.ox || 0), ly = c.y + (lp.dy ? lp.dy * (r + 8 * k) : 0) + (lp.oy || 0) + 3.5 * lk;
          nodes.push(`<text class="m-halo" style="stroke:var(--district);stroke-width:${3.5 * lk}px;font-family:var(--f-body);font-size:${(locked ? 12 : 11) * lk}px;fill:var(--ink-3);font-weight:${locked ? 600 : 500};text-anchor:${lp.a}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${c.name}</text>`);
        }
      }
    }
    s += nodes.join('');
    svg.innerHTML = s;
  }

  function toScreen(svg, lon, lat, box) {
    const [x, y] = P(lon, lat); const p = svg.createSVGPoint(); p.x = x; p.y = y;
    const q = p.matrixTransform(svg.getScreenCTM()); const b = (box || svg).getBoundingClientRect();
    return { x: q.x - b.left, y: q.y - b.top };
  }
  const cityScreen = (svg, id, box) => toScreen(svg, C[id].lon, C[id].lat, box);

  // HUD второго акта (§9.1)
  const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/></svg>';
  function HUD2(o) {
    o = o || {};
    const tri = (n) => `<svg width="${6 + n * 6}" height="10" viewBox="0 0 ${6 + n * 6} 10">${Array.from({ length: n }, (_, i) => `<path d="M${i * 6 + 1},1 L${i * 6 + 7},5 L${i * 6 + 1},9Z" fill="currentColor"/>`).join('')}</svg>`;
    const speed = `<div class="speed">${[IC.pause.replace('<svg', '<svg width="12" height="12"'), tri(1), tri(2), tri(3)].map((s, i) => `<span class="${i === 1 ? 'on' : ''}">${s}</span>`).join('')}</div>`;
    const acc = [2.61, 2.72, 2.8, 2.86, 2.95, 3.04, 3.12, 3.2, 3.31, 3.4, 3.52, 3.62];
    const turn = [7.9, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.4, 9.6, 9.9, 10.1, 10.4];
    const crumbs = o.city
      ? `<span class="cr-home">${GLOBE}Россия</span><span class="cr-sep">${IC.chevron}</span><span class="cr-cur">${o.city}</span>${o.cityTag ? `<span class="cr-tag">${o.cityTag}</span>` : ''}`
      : `<span class="cr-home on">${GLOBE}Россия</span><span class="cr-sep">${IC.chevron}</span><span class="cr-link">Уфа</span><span class="cr-tag">активный</span>`;
    return `<header class="hud hud2">
      <div class="brand"><div class="logo">${IC.loaf}</div><div><b>Сеть «Каравай»</b><small>Хлебная карта России</small></div></div>
      <nav class="crumbs">${crumbs}</nav>
      <div class="clock"><span class="date">11 сен 2040</span>${speed}</div>
      <div class="spacer"></div>
      <div class="metric"><span class="caps">Счёт сети</span><div class="row"><span class="v">3,62 млрд ₽</span>${MK.spark(acc, 36, 18)}</div><span class="delta up">▲ 2,8 % за мес.</span></div>
      <div class="metric"><span class="caps">Оборот · 12 мес.</span><div class="row"><span class="v">10,4 млрд ₽</span></div><span class="delta muted">${o.city ? o.cityRev : 'Уфа 5,12 млрд'}</span></div>
      <div class="metric"><span class="caps">Точки</span><div class="row"><span class="v">112</span></div><span class="delta muted">городов 6</span></div>
      <div class="vsep"></div>
      <div class="metric goal2"><span class="caps">Цель · Федеральная сеть</span>
        <div class="gl"><span>Города</span><span class="gb"><i style="width:40%"></i></span><b>4/10</b></div>
        <div class="gl"><span>Оборот</span><span class="gb"><i style="width:26%"></i></span><b>10,4/40</b></div></div>
      <div style="display:flex;gap:6px;margin-left:2px"><span class="icbtn">${IC.theme}</span><span class="icbtn">${IC.gear}</span></div>
    </header>`;
  }
  const HUD2_CSS = `
    .hud2 { gap: 12px; }
    .hud2 .brand b { font-size: 12.5px; }
    .crumbs { display: flex; align-items: center; gap: 4px; height: 34px; padding: 0 8px 0 4px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--line); font-size: 13px; white-space: nowrap; }
    .crumbs svg { width: 15px; height: 15px; }
    .crumbs .cr-home { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: 6px; font-weight: 600; color: var(--ink-2); }
    .crumbs .cr-home.on { background: var(--ink); color: var(--surface); }
    .crumbs .cr-sep { color: var(--ink-3); display: grid; }
    .crumbs .cr-sep svg { width: 13px; height: 13px; }
    .crumbs .cr-cur { font-weight: 600; padding: 0 2px; }
    .crumbs .cr-link { color: var(--ink-2); font-weight: 500; padding: 0 2px; }
    .crumbs .cr-tag { font-size: 10.5px; font-weight: 600; color: var(--crust-t); background: var(--crust-soft); border-radius: 9px; padding: 1px 7px; margin-left: 3px; }
    .hud2 .clock .date { font-size: 12.5px; }
    .goal2 { width: 200px; gap: 3px; }
    .goal2 .gl { display: grid; grid-template-columns: 46px 1fr 50px; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-3); }
    .goal2 .gl b { font-family: var(--f-mono); font-size: 11px; font-weight: 600; color: var(--ink); text-align: right; }
    .goal2 .gb { position: relative; height: 5px; border-radius: 3px; background: var(--surface-3); }
    .goal2 .gb i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--crust); }`;

  window.RU = { P, CITY, C, OWN, LOCKED, render, toScreen, cityScreen, HUD2, HUD2_CSS, GLOBE, LOCK, fmt, alertBadge };
})();
