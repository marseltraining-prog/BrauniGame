/* Общие данные и рендер карты для макетов. Геометрия — из src/data/world.js (не импортируется, скопирована). */
(function () {
  const D = [
    { id: 'center', name: 'Центр', x: 362, y: 800 },
    { id: 'grove', name: 'Зелёная роща', x: 478, y: 712 },
    { id: 'october', name: 'Проспект Октября', x: 548, y: 612 },
    { id: 'sipaylovo', name: 'Сипайлово', x: 690, y: 632 },
    { id: 'glumilino', name: 'Глумилино', x: 612, y: 742 },
    { id: 'chernikovka', name: 'Черниковка', x: 606, y: 468 },
    { id: 'inors', name: 'Инорс', x: 430, y: 478 },
    { id: 'north', name: 'Северная промзона', x: 548, y: 318 },
    { id: 'shaksha', name: 'Шакша', x: 862, y: 138 },
    { id: 'nizh', name: 'Нижегородка', x: 452, y: 902 },
    { id: 'zaton', name: 'Затон', x: 196, y: 728 },
    { id: 'dema', name: 'Дёма', x: 108, y: 902 },
  ];
  const M = {
    belaya: [[140, 0], [250, 150], [322, 300], [338, 420], [322, 560], [296, 650], [286, 740], [268, 830], [232, 900], [262, 960], [360, 986], [444, 994], [560, 1000], [640, 1010]],
    ufa: [[760, -10], [792, 100], [800, 240], [790, 380], [782, 520], [772, 650], [724, 778], [624, 872], [522, 948], [444, 994]],
    dema: [[-10, 1000], [80, 962], [160, 930], [234, 902]],
    rail: [[-10, 540], [200, 575], [382, 605], [470, 520], [540, 400], [640, 230], [700, 110], [740, -10]],
    station: { x: 382, y: 605 },
    city: [[60, 820], [110, 700], [226, 640], [300, 470], [330, 280], [430, 180], [560, 190], [700, 60], [900, 34], [968, 170], [912, 300], [830, 430], [810, 600], [770, 770], [650, 900], [490, 980], [300, 1000], [80, 1000], [24, 930]],
    parks: [{ x: 470, y: 760, r: 26, name: 'Лесопарк' }, { x: 520, y: 690, r: 16, name: 'Кашкадан' }, { x: 668, y: 505, r: 20, name: 'Парк Победы' }],
  };
  // 44 точки: номер, район, настроение, штат, выручка и прибыль за февраль 2039 (млн ₽), рейтинг
  const RAW = [
    // n, district, mood, staff, rev, profit, rating, street
    [1, 'center', 'happy', '8/8', 15.8, 5.1, 4.8, 'ул. Ленина, 14'], [2, 'center', 'happy', '6/6', 13.9, 4.2, 4.7, 'ул. Пушкина, 45'],
    [3, 'october', 'happy', '6/6', 12.4, 3.6, 4.6, 'пр. Октября, 30'], [4, 'sipaylovo', 'happy', '4/4', 8.1, 2.2, 4.5, 'ул. Ю. Гагарина, 12'],
    [5, 'center', 'happy', '6/6', 14.2, 4.4, 4.8, 'ул. К. Маркса, 21'], [6, 'grove', 'happy', '4/4', 9.6, 2.9, 4.7, 'ул. Менделеева, 158'],
    [7, 'october', 'mid', '4/5', 9.8, 2.4, 4.3, 'пр. Октября, 94'], [8, 'chernikovka', 'happy', '4/4', 7.9, 2.1, 4.4, 'ул. Первомайская, 41'],
    [9, 'center', 'happy', '6/6', 13.1, 3.8, 4.6, 'ул. Цюрупы, 97'], [10, 'glumilino', 'happy', '4/4', 7.2, 1.8, 4.4, 'ул. Мингажева, 39'],
    [11, 'center', 'mid', '4/4', 11.6, 3.1, 4.4, 'ул. Гоголя, 60'], [12, 'center', 'sad', '4/6', 10.4, 1.4, 3.9, 'ул. Заки Валиди, 32'],
    [13, 'october', 'happy', '6/6', 12.0, 3.5, 4.6, 'ул. Р. Зорге, 17'], [14, 'glumilino', 'happy', '4/4', 6.8, 1.7, 4.3, 'ул. Шафиева, 25'],
    [15, 'october', 'happy', '4/4', 10.2, 2.9, 4.5, 'бул. Хадии Давлетшиной, 11'], [16, 'grove', 'happy', '4/4', 9.1, 2.7, 4.6, 'ул. Бакалинская, 23'],
    [17, 'center', 'happy', '8/8', 14.9, 4.7, 4.9, 'ул. Октябрьской Рев., 3'], [18, 'inors', 'happy', '4/4', 5.9, 1.3, 4.3, 'ул. Сельская Богородская, 8'],
    [19, 'chernikovka', 'happy', '6/6', 9.4, 2.6, 4.5, 'пр. С. Юлаева, 12'], [20, 'zaton', 'happy', '4/4', 5.6, 1.2, 4.2, 'ул. Судоходная, 5'],
    [21, 'chernikovka', 'mid', '4/4', 7.4, 1.8, 4.2, 'ул. Кольцевая, 180'], [22, 'dema', 'happy', '4/4', 6.1, 1.4, 4.4, 'ул. Правды, 21'],
    [23, 'grove', 'happy', '4/4', 8.8, 2.6, 4.6, 'ул. Лесотехникума, 34'], [24, 'sipaylovo', 'happy', '4/4', 7.6, 2.0, 4.4, 'ул. Королёва, 9'],
    [25, 'october', 'happy', '4/4', 9.3, 2.6, 4.5, 'ул. Комсомольская, 110'], [26, 'grove', 'happy', '6/6', 10.7, 3.2, 4.7, 'ул. Мустая Карима, 70'],
    [27, 'sipaylovo', 'sad', '2/4', 6.2, 0.4, 3.8, 'ул. Академика Королёва, 27'], [28, 'inors', 'happy', '4/4', 5.4, 1.1, 4.2, 'ул. Юбилейная, 2'],
    [29, 'zaton', 'happy', '2/2', 4.3, 0.9, 4.3, 'ул. Ахметова, 318'], [30, 'october', 'happy', '6/6', 11.1, 3.3, 4.6, 'пр. Октября, 146'],
    [31, 'chernikovka', 'sad', '3/6', 7.0, 0.6, 3.7, 'ул. Мира, 14'], [32, 'inors', 'mid', '4/4', 5.1, 0.9, 4.1, 'ул. Сагита Агиша, 6'],
    [33, 'dema', 'mid', '4/4', 5.5, 1.0, 4.1, 'ул. Ухтомского, 18'], [34, 'chernikovka', 'happy', '4/4', 7.8, 2.0, 4.4, 'ул. Победы, 20'],
    [35, 'sipaylovo', 'mid', '4/4', 6.9, 1.5, 4.2, 'ул. Энтузиастов, 4'], [36, 'center', 'happy', '4/4', 11.9, 3.4, 4.6, 'ул. Чернышевского, 82'],
    [37, 'center', 'happy', '6/6', 12.7, 3.7, 4.7, 'ул. Аксакова, 7'], [38, 'october', 'mid', '4/4', 8.6, 2.1, 4.3, 'ул. Жукова, 29'],
    [39, 'chernikovka', 'happy', '4/4', 6.4, 1.6, 4.4, 'ул. Интернациональная, 111'], [40, 'nizh', 'happy', '2/2', 4.1, 0.8, 4.3, 'ул. Мечникова, 9'],
    [41, 'dema', 'sad', '4/4', 3.9, -1.2, 3.6, 'ул. Левитана, 117'], [42, 'glumilino', 'happy', '4/4', 6.6, 1.6, 4.4, 'ул. Интернациональная, 4'],
    [43, 'dema', 'happy', '4/4', 5.8, 1.3, 4.3, 'ул. Дагестанская, 12'], [44, 'nizh', 'happy', '2/2', 4.4, 0.9, 4.2, 'ул. Нежинская, 3'],
  ];
  const dById = Object.fromEntries(D.map((d) => [d.id, d]));
  // детерминированные смещения точек вокруг центра района
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const STORES = RAW.map(([n, d, mood, staff, rev, profit, rating, street]) => {
    const c = dById[d]; const a = rnd() * Math.PI * 2, r = 12 + rnd() * 26;
    return { n, d, dn: c.name, mood, staff, rev, profit, rating, street, x: c.x + Math.cos(a) * r, y: c.y + 6 + Math.sin(a) * r * 0.8 };
  });
  const fixed = { 20: [182, 745], 29: [224, 766], 40: [436, 918], 44: [478, 896], 10: [596, 760], 14: [628, 728], 42: [648, 770], 18: [398, 488], 28: [440, 520], 32: [462, 470] };
  STORES.forEach((s) => { if (fixed[s.n]) { s.x = fixed[s.n][0]; s.y = fixed[s.n][1]; } });

  function smooth(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  function clipPoly(poly, a, b, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c;
      if (fp <= 0) out.push(P);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out;
  }
  const voronoi = (sites) => sites.map((s, i) => {
    let poly = [[-400, -400], [1400, -400], [1400, 1400], [-400, 1400]];
    sites.forEach((o, j) => { if (i !== j) { const a = o.x - s.x, b = o.y - s.y; poly = clipPoly(poly, a, b, a * (s.x + o.x) / 2 + b * (s.y + o.y) / 2); } });
    return poly;
  });
  const pathOf = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';

  const MOODC = { happy: 'var(--face-happy)', mid: 'var(--face-mid)', sad: 'var(--face-sad)' };
  function face(kind, cx, cy, r) {
    const ey = cy - r * 0.2, ex = r * 0.38, my = cy + r * 0.35;
    const mouth = kind === 'happy' ? `M${cx - r * 0.45},${my - r * 0.12} Q${cx},${my + r * 0.42} ${cx + r * 0.45},${my - r * 0.12}`
      : kind === 'sad' ? `M${cx - r * 0.42},${my + r * 0.18} Q${cx},${my - r * 0.32} ${cx + r * 0.42},${my + r * 0.18}`
        : `M${cx - r * 0.4},${my} L${cx + r * 0.4},${my}`;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${MOODC[kind]}" stroke="rgba(0,0,0,.25)" stroke-width="${r * 0.08}"/><circle cx="${cx - ex}" cy="${ey}" r="${r * 0.13}" fill="#1b1b1b"/><circle cx="${cx + ex}" cy="${ey}" r="${r * 0.13}" fill="#1b1b1b"/><path d="${mouth}" stroke="#1b1b1b" stroke-width="${r * 0.14}" fill="none" stroke-linecap="round"/>`;
  }
  const faceIcon = (kind, size) => `<svg class="face" viewBox="0 0 20 20" style="width:${size || 14}px;height:${size || 14}px">${face(kind, 10, 10, 8.5)}</svg>`;

  const FACTORY = 'M-7,6 L-7,-2 L-3,-5 L-3,-1 L1,-4 L1,0 L5,-3 L5,-7 L7,-7 L7,6 Z';
  const OFFICE = 'M-6,6 L-6,-6 L6,-6 L6,6 Z M-3.5,-3.5 h2 v2 h-2 Z M1.5,-3.5 h2 v2 h-2 Z M-3.5,0.5 h2 v2 h-2 Z M1.5,0.5 h2 v2 h-2 Z';
  const PRODS = [{ x: 236, y: 706, name: 'Цех «Затон»' }, { x: 684, y: 476, name: 'Цех «Черниковка»' }, { x: 640, y: 812, name: 'Цех «Глумилино»' }];
  const HQ = { x: 428, y: 772 };
  const OFFERS = [{ x: 490, y: 452 }, { x: 552, y: 300 }, { x: 160, y: 850 }];
  const CLUSTERED = ['center', 'grove', 'october', 'sipaylovo', 'chernikovka', 'dema'];
  const ALERTS = { dema: 'money', sipaylovo: 'staff', chernikovka: 'staff' };

  // Иконки проблем (одна на кластер/точку): штат — силуэт, деньги — ₽ со стрелкой
  function alertBadge(kind, x, y, k) {
    const col = kind === 'money' ? 'var(--bad)' : 'var(--warn)';
    const glyph = kind === 'money'
      ? `<text x="0" y="0.5" text-anchor="middle" dominant-baseline="central" font-family="var(--f-mono)" font-weight="700" font-size="9" fill="#fff">₽</text>`
      : `<circle cx="0" cy="-2.2" r="2.2" fill="#fff"/><path d="M-4,4 Q0,-1.5 4,4 Z" fill="#fff"/>`;
    return `<g class="m-alert" transform="translate(${x},${y}) scale(${k})"><rect x="-7.5" y="-7.5" width="15" height="15" rx="4" fill="${col}"/>${glyph}</g>`;
  }

  function render(svg, o) {
    o = Object.assign({ vb: [-60, -20, 1120, 1040], k: 1, labels: true, clusters: true, routes: true, id: 'm' }, o);
    const k = o.k; // масштаб маркеров
    svg.setAttribute('viewBox', o.vb.join(' '));
    svg.setAttribute('preserveAspectRatio', o.par || 'xMidYMid slice');
    const cells = voronoi(D);
    const [vx, vy, vw, vh] = o.vb;
    let s = `<defs>
      <pattern id="${o.id}-g1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="var(--grid-minor)" stroke-width=".6"/></pattern>
      <pattern id="${o.id}-g5" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#${o.id}-g1)"/><path d="M50 0H0V50" fill="none" stroke="var(--grid-major)" stroke-width="1"/></pattern>
      <clipPath id="${o.id}-city"><path d="${smooth(M.city.concat([M.city[0]]))}Z"/></clipPath></defs>`;
    s += `<rect x="${vx - 500}" y="${vy - 500}" width="${vw + 1000}" height="${vh + 1000}" class="m-land"/>`;
    s += `<g clip-path="url(#${o.id}-city)">`;
    cells.forEach((c, i) => {
      let extra = '';
      if (o.tint && o.tint[D[i].id]) extra = ` style="fill:${o.tint[D[i].id]}"`;
      s += `<path class="m-district${i % 2 ? ' alt' : ''}" d="${pathOf(c)}"${extra}/>`;
    });
    s += `</g>`;
    s += `<rect x="${vx - 500}" y="${vy - 500}" width="${vw + 1000}" height="${vh + 1000}" fill="url(#${o.id}-g5)" pointer-events="none"/>`;
    s += `<path class="m-city-edge" d="${smooth(M.city.concat([M.city[0]]))}Z"/>`;
    for (const p of M.parks) s += `<circle class="m-park" cx="${p.x}" cy="${p.y}" r="${p.r}"/>`;
    s += `<path class="m-rail" d="${smooth(M.rail)}"/>`;
    // реки: мягкий «разлив» + русло
    s += `<path class="m-river-edge" stroke-width="34" d="${smooth(M.belaya)}"/><path class="m-river-edge" stroke-width="24" d="${smooth(M.ufa)}"/>`;
    s += `<path class="m-river" stroke-width="16" d="${smooth(M.belaya)}"/><path class="m-river" stroke-width="11" d="${smooth(M.ufa)}"/><path class="m-river" stroke-width="6" d="${smooth(M.dema)}"/>`;
    if (o.labels) {
      s += `<text class="m-rlabel m-halo" style="stroke:var(--map-land)" transform="translate(258,372) rotate(66)">р. Белая</text>`;
      s += `<text class="m-rlabel m-halo" style="stroke:var(--map-land)" transform="translate(818,520) rotate(86)">р. Уфа</text>`;
      s += `<text class="m-rlabel m-halo" style="stroke:var(--map-land);font-size:11px" transform="translate(40,992) rotate(-20)">р. Дёма</text>`;
      for (const d of D) {
        const dy = o.labelDy && o.labelDy[d.id] != null ? o.labelDy[d.id] : -40;
        const dx = o.labelDx && o.labelDx[d.id] || 0;
        s += `<text class="m-dlabel m-halo" style="font-size:${11.5 * (o.lk || 1)}px;stroke-width:${4 * (o.lk || 1)}px" x="${d.x + dx}" y="${d.y + dy}">${d.name}</text>`;
      }
      for (const p of M.parks) if (p.name !== 'Кашкадан') s += `<text class="m-small m-halo" text-anchor="middle" x="${p.x}" y="${p.y + p.r + 11}">${p.name}</text>`;
      s += `<circle cx="${M.station.x}" cy="${M.station.y}" r="3.5" fill="var(--ink-3)"/><text class="m-small m-halo" x="${M.station.x - 8}" y="${M.station.y + 16}" text-anchor="end">Ж/д вокзал</text>`;
    }
    // маршруты доставки: от ближайшего цеха
    const near = (p) => PRODS.reduce((b, q) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? q : b));
    const groups = {};
    STORES.forEach((st) => { (groups[st.d] = groups[st.d] || []).push(st); });
    const nodes = [];
    for (const d of D) {
      const g = groups[d.id]; if (!g) continue;
      if (o.clusters && CLUSTERED.includes(d.id) && !(o.noCluster || []).includes(d.id)) nodes.push({ cl: true, d: d.id, x: d.x, y: d.y + 8, items: g });
      else g.forEach((st) => nodes.push({ cl: false, st, x: st.x, y: st.y }));
    }
    if (o.routes) for (const n of nodes) { const p = near(n); s += `<line class="m-route" x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}"/>`; }
    for (const p of PRODS) s += `<g class="m-prod" transform="translate(${p.x},${p.y}) scale(${k})"><rect x="-12" y="-12" width="24" height="24" rx="4"/><path d="${FACTORY}"/></g>`;
    s += `<g class="m-hq" transform="translate(${HQ.x},${HQ.y}) scale(${k})"><rect x="-9" y="-9" width="18" height="18" rx="3"/><path d="${OFFICE}" transform="scale(.8)"/></g>`;
    for (const f of OFFERS) s += `<g class="m-offer" transform="translate(${f.x},${f.y}) scale(${k})"><circle r="10"/><path d="M-4.5,0H4.5M0,-4.5V4.5"/></g>`;
    for (const n of nodes) {
      if (n.cl) {
        const cnt = n.items.length, r = (15 + cnt * 1.4) * k, rr = r + 4 * k, C = 2 * Math.PI * rr;
        const share = { happy: 0, mid: 0, sad: 0 }; n.items.forEach((i) => share[i.mood]++);
        let off = 0, ring = '';
        for (const m of ['happy', 'mid', 'sad']) {
          if (!share[m]) continue; const len = C * share[m] / cnt;
          ring += `<circle cx="0" cy="0" r="${rr}" fill="none" stroke="${MOODC[m]}" stroke-width="${4.5 * k}" stroke-dasharray="${Math.max(0, len - 2 * k)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90)"/>`;
          off += len;
        }
        s += `<g class="m-cl" transform="translate(${n.x},${n.y})"><circle cx="0" cy="0" r="${rr + 2.8 * k}" fill="var(--surface)" opacity=".92"/>${ring}<circle class="b" r="${r}"/><text font-size="${(12 + cnt * 0.5) * k}">${cnt}</text></g>`;
        if (o.alerts !== false && ALERTS[n.d]) s += alertBadge(ALERTS[n.d], n.x + rr * 0.78, n.y - rr * 0.78, k * 1.05);
      } else {
        const st = n.st, col = o.profitStroke ? (st.profit < 0 ? 'var(--bad)' : st.profit / st.rev < 0.15 ? 'var(--warn)' : 'var(--good)') : o.moodStroke ? MOODC[st.mood] : 'var(--crust)';
        const sel = o.sel === st.n;
        s += `<g class="m-pt" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)}) scale(${k})">${sel ? '<circle r="20" fill="var(--bad)" opacity=".18"/><circle r="15" fill="none" stroke="var(--bad)" stroke-width="1.2"/>' : ''}<circle class="b" r="11" stroke="${col}"/><text>${st.n}</text></g>`;
      }
    }
    svg.innerHTML = s;
  }

  function spark(vals, w, h, o) {
    o = o || {}; const min = Math.min(...vals), max = Math.max(...vals), pad = 2;
    const X = (i) => pad + (i * (w - pad * 2)) / (vals.length - 1), Y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
    const li = vals.length - 1;
    const area = o.area ? `<path d="${d}L${X(li)},${h}L${X(0)},${h}Z" fill="${o.color || 'var(--ink-3)'}" opacity=".08"/>` : '';
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${area}<path d="${d}" fill="none" stroke="${o.color || 'var(--ink-3)'}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="${o.op || .75}"/><circle cx="${X(li)}" cy="${Y(vals[li])}" r="2.4" fill="${o.last || 'var(--crust)'}"/></svg>`;
  }

  window.MK = { D, M, STORES, PRODS, render, face, faceIcon, spark };
})();
