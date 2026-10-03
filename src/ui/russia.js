/* Карта России (второй акт, этап Р1): статичный лист-чертёж 1600×900 в стиле карты Уфы, города кружками,
   переходы город ↔ Россия с анимацией «камера отъехала», панель «Россия» (сводка сети, карточка города, вход в город).
   Движок — BK.Corp / BK.Engine (corp.js). Проекция: x = 60 + (долгота − 27)·24, y = 40 + (68 − широта)·34. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, H = () => BK.UIH, C = () => BK.CFG;
  const P = (lon, lat) => BK.cityProj(lon, lat);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = (v) => BK.fmtMoney(v);
  const W = 1600, HH = 900;

  /* ---------------- география (упрощённо; стилизация, не картография) ---------------- */
  const SEAS = {
    black: { name: 'Чёрное море', at: [34.6, 43.3], pts: [[28.0, 40.6], [27.9, 42.6], [28.5, 43.4], [28.7, 44.3], [29.6, 45.0], [30.3, 45.9], [30.8, 46.5], [31.7, 46.6], [32.6, 46.1], [32.5, 45.4], [33.4, 45.2], [33.5, 44.6], [34.4, 44.5], [35.3, 44.8], [36.5, 45.2], [37.4, 44.8], [38.5, 44.3], [39.7, 43.6], [40.5, 43.1], [41.6, 41.6], [41.6, 40.6]] },
    azov: { name: 'Азовское м.', at: [36.6, 46.2], small: true, pts: [[36.6, 45.4], [35.4, 45.3], [34.9, 45.8], [35.4, 46.4], [36.6, 46.8], [38.2, 47.1], [39.2, 47.2], [38.6, 46.6], [38.0, 46.0], [37.6, 45.6]] },
    caspian: { name: 'Каспийское море', at: [50.3, 43.0], pts: [[48.9, 40.6], [48.5, 41.8], [47.6, 42.9], [47.3, 43.6], [47.0, 44.4], [46.8, 44.9], [47.3, 45.6], [48.0, 46.0], [48.9, 46.3], [49.8, 46.6], [51.0, 47.0], [52.3, 46.9], [53.1, 46.6], [53.0, 45.6], [51.5, 45.3], [50.9, 44.8], [51.3, 44.3], [50.9, 43.7], [51.3, 43.2], [52.0, 42.6], [52.6, 42.0], [53.0, 40.6]] },
    finn: { name: 'Финский зал.', at: [27.6, 60.3], small: true, pts: [[25.5, 59.3], [27.5, 59.45], [28.2, 59.5], [29.0, 59.9], [29.7, 59.95], [30.2, 59.95], [29.9, 60.15], [29.0, 60.2], [28.5, 60.55], [27.8, 60.55], [25.5, 60.4]] },
    ladoga: { lake: true, pts: [[30.4, 60.9], [31.0, 61.6], [32.0, 61.7], [32.8, 61.3], [32.8, 60.6], [32.2, 60.1], [31.2, 60.0], [30.6, 60.4]] },
    onega: { lake: true, pts: [[34.3, 61.0], [35.3, 60.9], [36.4, 61.3], [35.9, 62.3], [35.2, 62.8], [34.5, 62.4], [34.9, 61.8], [34.3, 61.3]] },
    white: { name: 'Белое море', at: [37.2, 65.4], pts: [[32.4, 67.15], [34.2, 66.6], [36.2, 66.2], [38.6, 66.0], [39.8, 66.35], [40.4, 67.0], [40.3, 68.8], [43.3, 68.8], [43.4, 67.7], [44.1, 66.9], [44.2, 66.2], [43.1, 66.4], [41.6, 66.0], [40.3, 65.6], [40.6, 64.8], [40.0, 64.6], [38.6, 64.8], [37.6, 64.5], [37.6, 63.9], [36.2, 64.1], [35.0, 64.4], [34.7, 65.1], [34.8, 65.8], [33.8, 66.2], [32.9, 66.5]] },
    barents: { name: 'Баренцево море', at: [52.0, 68.55], pts: [[20, 80], [95, 80], [95, 69.2]].concat([[45.9, 68.9], [46.3, 68.1], [47.5, 67.7], [49.0, 67.9], [50.5, 68.1], [52.5, 68.35], [53.9, 68.2], [55.5, 68.4], [57.5, 68.5], [59.5, 68.4], [61.0, 68.6], [63.5, 68.4], [65.5, 68.7], [67.0, 68.45], [68.5, 68.7], [70.0, 68.4], [71.1, 68.2], [71.8, 67.4], [71.8, 66.8], [72.6, 66.6], [73.3, 66.9], [73.8, 67.8], [74.6, 68.3], [75.7, 68.0], [76.2, 67.4], [77.6, 67.2], [78.7, 67.6], [79.5, 68.3], [81.0, 68.45], [83.0, 68.9]].reverse(), [[43.3, 68.6], [40.4, 68.2], [36.5, 69.1], [33.0, 69.4], [27.0, 70.0], [20, 70.3]]) },
  };
  const RIVERS = [
    { name: 'Волга', w: 3.2, lab: [[46.5, 51.2], -62], pts: [[32.9, 57.2], [35.9, 56.9], [37.2, 56.7], [38.3, 57.5], [38.8, 58.05], [39.9, 57.6], [40.9, 57.8], [42.1, 57.4], [44.0, 56.33], [46.0, 56.1], [47.25, 56.1], [49.1, 55.8], [49.4, 55.3], [48.4, 54.3], [49.4, 53.5], [50.1, 53.2], [48.4, 53.1], [47.0, 52.4], [46.0, 51.5], [45.4, 50.1], [44.5, 48.7], [46.2, 48.3], [47.3, 47.3], [48.0, 46.35], [48.5, 45.9]] },
    { name: 'Кама', w: 2.6, lab: [[53.9, 57.2], -48], pts: [[52.3, 58.1], [53.5, 59.3], [55.2, 60.0], [56.8, 59.6], [56.8, 59.4], [56.2, 58.0], [55.2, 57.5], [54.1, 56.8], [53.2, 56.2], [52.4, 55.7], [51.8, 55.6], [50.5, 55.5], [49.4, 55.3]] },
    { name: 'Белая', w: 2, lab: [[54.6, 55.95], -28], pts: [[58.5, 54.0], [58.4, 53.97], [57.3, 53.2], [56.3, 53.1], [55.9, 53.6], [55.95, 54.75], [55.5, 55.4], [54.6, 55.8], [54.0, 56.0]] },
    { name: 'Урал', w: 2, lab: [[52.3, 50.9], 0], pts: [[59.4, 54.6], [59.0, 53.4], [58.9, 52.2], [58.6, 51.2], [57.2, 51.5], [55.1, 51.8], [53.0, 51.4], [51.4, 51.2], [51.6, 49.5], [51.9, 47.1]] },
    { name: 'Дон', w: 2.2, lab: [[40.2, 50.3], 0], pts: [[38.3, 53.9], [38.9, 52.6], [39.2, 51.6], [40.2, 50.5], [41.0, 49.5], [42.6, 49.0], [43.5, 48.7], [42.1, 47.6], [40.8, 47.4], [39.7, 47.2], [39.4, 47.1]] },
    { name: 'Обь', w: 3, lab: [[76.8, 61.5], -18], pts: [[83.8, 53.35], [82.9, 55.0], [83.6, 56.4], [82.9, 58.3], [80.5, 59.5], [76.6, 60.9], [73.4, 61.25], [69.0, 61.0], [66.5, 62.6], [65.2, 63.9], [65.6, 65.4], [66.6, 66.5], [70.2, 66.6], [71.9, 66.8]] },
    { name: 'Иртыш', w: 2.2, lab: [[71.5, 57.2], -50], pts: [[74.0, 53.9], [73.4, 55.0], [72.3, 56.7], [69.9, 57.6], [68.25, 58.2], [68.6, 59.6], [69.0, 61.0]] },
  ];
  const URAL = [[59.3, 51.8], [59.0, 54.0], [59.3, 56.5], [59.6, 59.0], [59.8, 61.5], [60.6, 64.0], [62.8, 65.8], [65.0, 67.2], [66.5, 68.3]];
  const BORDERS = [ // государственная граница (пунктиром): запад, Кавказ, Казахстан
    [[39.2, 47.2], [39.8, 47.9], [40.1, 49.6], [38.2, 50.1], [36.2, 50.4], [35.4, 51.1], [34.2, 51.9], [31.8, 52.1], [31.2, 53.0], [32.1, 53.8], [31.0, 55.3], [30.4, 55.7], [28.3, 56.0], [27.7, 56.9], [27.4, 57.8], [28.1, 59.3]],
    [[28.2, 60.6], [29.9, 61.3], [31.5, 62.9], [29.9, 63.7], [30.5, 64.8], [29.1, 65.6], [29.9, 66.8], [28.9, 68.4]],
    [[40.0, 43.4], [41.5, 43.3], [43.0, 42.7], [45.0, 42.6], [46.4, 41.9], [47.8, 41.2]],
    [[47.1, 46.0], [46.8, 48.4], [47.3, 50.1], [48.7, 50.6], [50.8, 51.6], [52.5, 51.5], [54.6, 51.0], [55.7, 50.6], [58.6, 50.9], [60.5, 50.2], [61.4, 50.8], [61.2, 53.9], [62.9, 54.1], [65.2, 54.4], [68.2, 55.2], [71.0, 54.2], [73.5, 53.6], [76.5, 54.0], [78.0, 52.5], [80.0, 51.2], [82.5, 50.8], [85.0, 49.5], [87.3, 49.2]],
  ];
  const LANDS = [['КАЗАХСТАН', 64, 49.3], ['УКРАИНА', 33.0, 49.4], ['БЕЛАРУСЬ', 28.4, 53.9], ['ФИНЛЯНДИЯ', 27.3, 64.4]];
  // подписи городов: сторона, где им не тесно
  const LSIDE = { ufa: 'r', sterlitamak: 'r', chelny: 'b', orenburg: 'r', chelyabinsk: 'r', ekb: 'r', samara: 'l', perm: 'r', kazan: 'l', tyumen: 'r', nnov: 't', volgograd: 'r', voronezh: 'l', rostov: 'l', krasnodar: 'l', sochi: 'r', moscow: 'l', spb: 'r', nsk: 'b' };

  const pts = (a) => a.map(([lo, la]) => { const p = P(lo, la); return [p.x, p.y]; });
  const path = (a, close) => 'M' + a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
  function smooth(a) { // Catmull-Rom → Bezier
    let d = `M${a[0][0].toFixed(1)},${a[0][1].toFixed(1)}`;
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[i - 1] || a[i], p1 = a[i], p2 = a[i + 1], p3 = a[i + 2] || p2;
      d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function staticSheet() {
    let s = `<defs>
      <pattern id="ru-g1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--grid-minor)" stroke-width=".8"/></pattern>
      <pattern id="ru-g5" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#ru-g1)"/><path d="M100 0H0V100" fill="none" stroke="var(--grid-major)" stroke-width="1.4"/></pattern></defs>`;
    s += `<rect x="-3000" y="-3000" width="8000" height="7000" class="m-land"/>`;
    for (const k in SEAS) { const q = SEAS[k]; s += `<path class="ru-sea${q.lake ? ' lake' : ''}" d="${smooth(pts(q.pts.concat([q.pts[0]])))}Z"/>`; }
    s += `<rect x="-3000" y="-3000" width="8000" height="7000" fill="url(#ru-g5)" pointer-events="none"/>`;
    for (const b of BORDERS) s += `<path class="ru-border" d="${smooth(pts(b))}"/>`;
    s += `<path class="ru-ural" d="${smooth(pts(URAL))}"/><path class="ru-ural2" d="${smooth(pts(URAL))}"/>`;
    for (const r of RIVERS) s += `<path class="ru-river" stroke-width="${r.w}" d="${smooth(pts(r.pts))}"/>`;
    for (const k in SEAS) { const q = SEAS[k]; if (!q.name) continue; const p = P(q.at[0], q.at[1]); s += `<text class="ru-slabel${q.small ? ' sm' : ''}" x="${p.x.toFixed(0)}" y="${p.y.toFixed(0)}">${q.name}</text>`; }
    for (const r of RIVERS) { const p = P(r.lab[0][0], r.lab[0][1]); s += `<text class="ru-rlabel" transform="translate(${p.x.toFixed(0)},${p.y.toFixed(0)}) rotate(${r.lab[1]})">${r.name}</text>`; }
    { const p = P(61.6, 60.2); s += `<text class="ru-mlabel" transform="translate(${p.x.toFixed(0)},${p.y.toFixed(0)}) rotate(-84)">Уральские горы</text>`; }
    for (const [n, lo, la] of LANDS) { const p = P(lo, la); s += `<text class="ru-land" x="${p.x.toFixed(0)}" y="${p.y.toFixed(0)}">${n}</text>`; }
    // лист продолжается на восток
    s += `<path class="ru-cont" d="M1556,30V880"/><text class="ru-cont-t" transform="translate(1540,470) rotate(-90)">Лист продолжается → до Владивостока ≈ 9 000 км</text>`;
    return s;
  }

  /* ---------------- вид «Россия» ---------------- */
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
    lock: '<path d="M-3.2,-0.6 v-1.6 a3.2,3.2 0 0 1 6.4,0 v1.6" fill="none" stroke-width="1.4"/><rect x="-4.3" y="-0.8" width="8.6" height="6.2" rx="1.2"/>',
  };
  /* ---------------- звук второго акта (этап «озвучка») ----------------
     Одно событие — один звук. Выход в Россию и взятая «Федеральная сеть» — фанфары, вход в новый город —
     «ленточка», переход на лист России и обратно — «таб», смена слоя карты — тихий щелчок.
     Значок слоя, чей вид и так меняет заголовок панели (Потенциал — новая цена входа), молчит.
     Гарантия одного звука на событие: помним набор «проблемных» городов и «городов, где вы» — новый
     элемент набора и есть событие. Панель перерисовывается каждый игровой день, поэтому без этого
     «утечка» и «убыток» звучали бы постоянно. */
  const SND_LAYER = { profit: 'click', dirs: 'tab', potential: null, logistics: 'tab' };
  function snd(name) { const Sd = BK.Sound; return !!(Sd && name && Sd.play(name)); }
  let sndReady = false, probWas = null, activeWas = null, catWas = null, corpSeen = false;
  // что изменилось с прошлой перерисовки панели: 'ribbon' — приехал директор, 'bad'/'warn' — проблема города, null — ничего
  function citiesSound(S) {
    const cr = S && S.corp; if (!cr || !cr.cities) { sndReady = false; return null; }
    const prob = {};
    for (const id in cr.cities) if (id !== cr.active) { const p = problemOf(S, id); if (p) prob[id] = p; }
    const cat = {};
    for (const id in cr.cities) { const c = cr.cities[id]; cat[id] = c.directorId ? 'dir' : 'none'; }
    if (!sndReady) { probWas = prob; activeWas = cr.active; catWas = cat; sndReady = true; return null; } // первый расчёт — просто запоминаем
    let name = null;
    if (cr.active !== activeWas) { name = 'ribbon'; activeWas = cr.active; } // вошли в новый город (или вернулись в свой)
    if (!name) for (const id in prob) if (!probWas[id] || probWas[id] !== prob[id]) { name = (prob[id] === 'loss' || prob[id] === 'leak') ? 'bad' : 'warn'; break; }
    if (!name) for (const id in cat) {
      if (catWas[id] === 'none' && cat[id] === 'dir') { name = 'ribbon'; break; }   // приехал директор
      if (catWas[id] === 'dir' && cat[id] === 'none') { name = 'bad'; break; }      // город остался без директора
    }
    probWas = prob; catWas = cat;
    return name;
  }
  const view = { el: null, svg: null, gC: null, vb: { x: 0, y: 0, w: W, h: HH }, px: { w: 800, h: 450 }, sel: null, lastKey: '', tip: null, layer: 'profit' };
  try { const l = localStorage.getItem('bk-ru-layer'); if (l && /^(profit|dirs|potential|logistics)$/.test(l)) view.layer = l; } catch (e) { /* без хранилища — «Прибыль» */ }
  /* ---------------- слои карты России (Р4 ч. 2, §3.1, §9.2): Прибыль · Директора · Потенциал · Логистика ---------------- */
  const LI = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const LAYERS = [
    ['profit', 'Прибыль', LI('<path d="M8 20V4h6a4 4 0 0 1 0 8H6M6 16h8"/>')],
    ['dirs', 'Директора', LI('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.3 4.5 1.4 5 4.8"/>')],
    ['potential', 'Потенциал', LI('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>')],
    ['logistics', 'Логистика', LI('<path d="M2.5 7h11v9h-11zM13.5 10h4l3 3.2V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>')],
  ];
  // потенциал не освоенного города: ёмкость × доход ÷ √(аренда × зарплаты), ближе к нашим городам — лучше (как у бота good)
  function potential(S, id) {
    const d = BK.CITY_BY_ID[id], own = Object.keys(S.corp.cities);
    const km = own.length ? Math.min(...own.map((o) => BK.roadKm(o, id))) : d.km;
    return d.cap * d.inc / Math.sqrt(d.rent * d.wage) / (1 + km / 3000);
  }
  function potTiers(S) { // тройки: высокий / средний / низкий — по свободным городам
    const free = BK.CITIES.filter((d) => !S.corp.cities[d.id] && !d.builtin).map((d) => [d.id, potential(S, d.id)]).sort((a, b) => b[1] - a[1]);
    const t = {}; free.forEach(([id], i) => { t[id] = i < Math.ceil(free.length / 3) ? 'hi' : i < Math.ceil(free.length * 2 / 3) ? 'mid' : 'lo'; });
    return t;
  }
  const POT_N = { hi: 'высокий', mid: 'средний', lo: 'низкий' };
  // проблема города — одна иконка (правило §3.1): убыток > утечка > перегрузка штаба; «нет директора» — бейдж «!»
  function problemOf(S, id) {
    const cr = S.corp, c = cr.cities[id]; if (!c) return null;
    const D = BK.Dir; if (!D) return null;
    if (c.hist.length >= 3 && D.lossMonths(c) >= 2) return 'loss';
    if (id === cr.active) return null;
    const ls = D.leakStatus(S, id);
    if (ls && ls.leak >= BK.CFG.CORP.LEAK_SHOW) return ls.onlyOv ? 'over' : 'leak';
    if (c.directorId && BK.HQ && BK.HQ.load && BK.HQ.load(S).over > 0) return 'over';
    return null;
  }
  const PROB = {
    loss: { t: 'Убыток 2+ мес. подряд', g: '<text y="0.4">₽</text>' },
    leak: { t: 'Утечка денег: слабый директор', g: '<path d="M0,-4.2C2.4,-1.2 3.1,0.4 3.1,1.4A3.1,3.1 0 0 1 -3.1,1.4C-3.1,0.4 -2.4,-1.2 0,-4.2Z"/>' },
    over: { t: 'Штаб перегружен', g: '<path d="M-3.4,-2.6H3.4M-3.4,0H3.4M-3.4,2.6H3.4" fill="none" stroke-width="1.5" stroke-linecap="round"/>' },
  };
  function setLayer(l) {
    if (!LAYERS.some((x) => x[0] === l)) return;
    if (view.layer !== l) snd(SND_LAYER[l]); // звук: смена листа карты («Потенциал» — молча: вид меняет лишь цену входа)
    view.layer = l; view.lastKey = '';
    try { localStorage.setItem('bk-ru-layer', l); } catch (e) { /* без хранилища — только до перезагрузки */ }
    if (view.el) view.el.querySelectorAll('.ru-lay').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.arg === l)));
    if (view.S) render(view.S, true);
  }
  function build(wrap) {
    if (view.el) return view;
    const d = document.createElement('div'); d.className = 'rumap'; d.hidden = true;
    d.innerHTML = `<svg class="rusvg" viewBox="0 0 ${W} ${HH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Карта России: города сети">${staticSheet()}<g class="ru-links"></g><g class="ru-cities"></g></svg>
      <div class="ru-top"><span class="ru-crumb"><svg viewBox="0 0 24 24" aria-hidden="true">${''}</svg><b>Россия</b></span><button type="button" class="ru-back" data-act="ruBack"></button><span class="ml-div" aria-hidden="true"></span><div class="ru-lays" role="group" aria-label="Слой карты России">${LAYERS.map(([k, l, ic]) => `<button type="button" class="ru-lay" data-act="ruLayer" data-arg="${k}" aria-pressed="${k === view.layer}">${ic}<span>${l}</span></button>`).join('')}</div></div>
      <div class="maplegend ru-legend"></div>
      <div class="mapctl ru-ctl"><button data-act="ruZoom" data-arg="in" aria-label="Приблизить">${ICON.plus}</button><button data-act="ruZoom" data-arg="out" aria-label="Отдалить">${ICON.minus}</button><button data-act="ruZoom" data-arg="reset" aria-label="Вся карта">${ICON.home}</button></div>
      <div class="mapcart ru-cart"></div><div class="maptip ru-tip" hidden></div>`;
    wrap.appendChild(d);
    view.el = d; view.svg = d.querySelector('.rusvg'); view.gC = d.querySelector('.ru-cities'); view.gL = d.querySelector('.ru-links'); view.tip = d.querySelector('.ru-tip');
    d.querySelector('.ru-crumb svg').outerHTML = BK.ICON_GLOBE || '';
    // размер без учёта transform (во время анимации лист масштабирован ×3)
    const measure = () => { const w = view.svg.clientWidth, h = view.svg.clientHeight; if (w > 0 && h > 0) view.px = { w, h }; };
    view.measure = measure;
    measure();
    if (globalThis.ResizeObserver) new ResizeObserver(() => { measure(); if (view.S) render(view.S, true); }).observe(view.svg);
    bind();
    return view;
  }
  const upp = () => Math.max(view.vb.w / view.px.w, view.vb.h / view.px.h);
  function setVB() { const v = view.vb; view.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`); if (view.S) render(view.S, true); }
  function resetVB() {
    // вписать города: ПК — от Петербурга до Новосибирска, телефон — полоса Москва — Новосибирск (дальше — пальцем)
    const narrow = view.px.w < 700, a = view.px.h / view.px.w;
    const box = narrow ? { x0: 250, x1: 1030, y0: 330, y1: 700 } : { x0: 20, x1: 1490, y0: 290, y1: 880 };
    let w = box.x1 - box.x0, h = w * a;
    if (h < box.y1 - box.y0) { h = box.y1 - box.y0; w = h / a; }
    view.vb = { x: (box.x0 + box.x1) / 2 - w / 2, y: (box.y0 + box.y1) / 2 - h / 2 - (narrow ? 0 : 50), w, h };
    // телефон со шторкой: города — в видимой части над шторкой (шторка закрывает низ листа)
    if (sheetOn() && sheet.el) {
      const top = view.el.getBoundingClientRect().top, ph = sheet.el.getBoundingClientRect().top - top, vis = Math.max(120, Math.min(view.px.h, ph) - 56); // 56 — плашка «Россия» и слои сверху
      const s = view.px.w / w, bh = (box.y1 - box.y0) * s;
      if (vis > 0) { let k = 1; if (bh > vis) { k = bh / vis; view.vb.w = w * k; view.vb.h = h * k; view.vb.x = (box.x0 + box.x1) / 2 - view.vb.w / 2; }
        view.vb.y = (box.y0 + box.y1) / 2 - (56 + vis / 2) / (view.px.w / view.vb.w); }
    }
    setVB();
  }
  function zoom(f, cx, cy) {
    const r = view.svg.getBoundingClientRect(), s = Math.min(r.width / view.vb.w, r.height / view.vb.h);
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const ox = (r.width - view.vb.w * s) / 2, oy = (r.height - view.vb.h * s) / 2;
    const px = view.vb.x + (cx - r.left - ox) / s, py = view.vb.y + (cy - r.top - oy) / s;
    const nw = Math.max(260, Math.min(W * 1.15, view.vb.w * f)), k = nw / view.vb.w;
    view.vb = { x: px - (px - view.vb.x) * k, y: py - (py - view.vb.y) * k, w: nw, h: view.vb.h * k };
    setVB();
  }
  function bind() {
    const el = view.svg, pts = new globalThis.Map(); let start = null, moved = false, pinch = null;
    el.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, vb: Object.assign({}, view.vb) }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.vb.w }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) { hover(e); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoom(pinch.w * pinch.d / Math.max(20, d) / view.vb.w, (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; return; }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
      moved = true; el.classList.add('dragging');
      const r = el.getBoundingClientRect(), s = Math.min(r.width / start.vb.w, r.height / start.vb.h);
      view.vb.x = start.vb.x - dx / s; view.vb.y = start.vb.y - dy / s; setVB();
      view.tip.hidden = true;
    });
    const up = (e) => {
      const wasPinch = pts.size >= 2; pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      el.classList.remove('dragging');
      if (e.type === 'pointerup' && !moved && !wasPinch && start) {
        const t = e.target.closest ? e.target.closest('[data-city]') : null;
        if (t && BK.App) BK.App.ACT.ruSel({ arg: t.dataset.city });
      }
      if (!pts.size) start = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { view.tip.hidden = true; });
  }
  function hover(e) {
    const t = e.target.closest ? e.target.closest('[data-city]') : null;
    if (!t || !view.S) { view.tip.hidden = true; return; }
    view.tip.innerHTML = tipFor(view.S, t.dataset.city); view.tip.hidden = false;
    const r = view.el.getBoundingClientRect();
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x + 250 > r.width) x = e.clientX - r.left - 250; if (y + 100 > r.height) y = e.clientY - r.top - 100;
    view.tip.style.left = x + 'px'; view.tip.style.top = y + 'px';
  }
  const popTxt = (p) => (p >= 1 ? String(p.toFixed(p >= 10 ? 1 : 2)).replace('.', ',') + ' млн' : Math.round(p * 1000) + ' тыс.') + ' жителей';
  function tipFor(S, id) {
    const d = BK.CITY_BY_ID[id], st = BK.Corp.cityStats(S, id);
    if (!d) return '';
    let s = `<b>${esc(d.name)}</b><br>${popTxt(d.pop)}${d.km ? ` · ${H().n0(d.km)} км от Уфы` : ''}`;
    if (st) { const c = S.corp.cities[id], dr = BK.Dir && BK.Dir.dirOf(S, c); s += `<br>${H().nw(st.open, 'точка', 'точки', 'точек')}${st.lastRev != null ? ` · выручка ${fm(st.lastRev)}/мес` : ''}<br>${st.active ? 'Вы управляете сами' + (dr ? ` · заместитель ${esc(dr.name)}` : '') : dr ? `Директор: ${esc(dr.name)} · лояльность ${Math.round(dr.loyalty)}` : 'Нет директора: без роста'}`; }
    else {
      const lock = E().enterLock(S, id); s += `<br>${lock ? esc(lock) : 'Вход ≈ ' + fm(E().enterCost(S, id))}`;
      if (view.layer === 'potential') { const t = potTiers(S)[id]; if (t) s += `<br>Потенциал: ${POT_N[t]}`; }
      if (view.layer === 'logistics' && BK.Corp.supplyHubs) { const hb = BK.Corp.supplyHubs(S, id); s += `<br>${hb.fresh ? `Без своего цеха: свежая выпечка ${esc(BK.CITY_BY_ID[hb.fresh.from].in || '')}, ${hb.fresh.km} км` : hb.frozen ? `Без своего цеха: заморозка, ${hb.frozen.km} км` : 'Нужен свой цех'}`; }
      if (!lock && BK.HQ && BK.HQ.load) { const L = BK.HQ.load(S, 1); if (L.over > 0) s += `<br><span class="tip-warn">После входа штаб перегружен: ${n1(L.load)} при мощности ${n1(L.cap)}</span>`; }
    }
    if (st) { const pr = problemOf(S, id); if (pr) s += `<br><span class="tip-warn">${esc(PROB[pr].t)}</span>`; }
    return s;
  }
  const rad = (d) => 5.5 + 11 * Math.log(d.pop / 0.28) / Math.log(13.1 / 0.28); // радиус кружка (px на экране) растёт с населением
  function render(S, force) {
    if (!view.el || view.el.hidden && !force) return;
    view.S = S;
    const k = upp(), sm = BK.Corp.summary(S); if (!sm) return;
    const own = {}; for (const c of sm.cities) own[c.id] = c;
    const sup = BK.Corp.supplyLinks ? BK.Corp.supplyLinks(S) : [], supTo = {}; for (const l of sup) supTo[l.to] = l; // линии снабжения (Р4, §7.2)
    const L = view.layer, hl = BK.HQ && BK.HQ.load ? BK.HQ.load(S) : null;
    const key = [k.toFixed(3), S.day, view.sel, sm.active, L, hl ? hl.load + '/' + hl.cap : '', sm.cities.map((c) => c.id + c.stores + ':' + c.lastRev + ':' + (S.corp.cities[c.id].directorId || '') + ':' + (S.corp.cities[c.id].leak || 0)).join(), sup.map((l) => l.from + l.to + l.mode + l.ok).join()].join('|');
    if (key === view.lastKey && !force) return;
    view.lastKey = key;
    const narrow = view.px.w < 700;
    view.svg.style.setProperty('--rk', k.toFixed(3));
    view.svg.classList.toggle('far', k > 2.2); // сильно отдалено — без подписей рек и стран
    view.svg.setAttribute('data-layer', L);
    const out = [], labels = [], links = [], zones = [];
    const ufa = P(BK.CITY_BY_ID.ufa.lon, BK.CITY_BY_ID.ufa.lat);
    const pot = L === 'potential' ? potTiers(S) : null;
    const hubsOf = L === 'logistics' && BK.Corp.supplyHubs ? (id) => BK.Corp.supplyHubs(S, id) : null;
    const tally = view.tally = { good: 0, warn: 0, bad: 0, none: 0, nodir: 0, nodir2: 0, hi: 0, mid: 0, lo: 0, hub: 0, fresh: 0, frozen: 0, rfresh: 0, rfrozen: 0, loss: 0, leak: 0, over: 0 };
    for (const d of BK.CITIES) {
      const p = P(d.lon, d.lat), c = own[d.id], r = rad(d) * k, sel = view.sel === d.id;
      if (c && d.id !== 'ufa' && !supTo[d.id]) links.push(`<path class="ru-link" d="M${ufa.x.toFixed(1)},${ufa.y.toFixed(1)}L${p.x.toFixed(1)},${p.y.toFixed(1)}"/>`);
      if (supTo[d.id]) { const l = supTo[d.id], f = BK.CITY_BY_ID[l.from], q = P(f.lon, f.lat); links.push(`<path class="ru-sup ${l.mode}${l.ok ? '' : ' off'}" d="M${q.x.toFixed(1)},${q.y.toFixed(1)}L${p.x.toFixed(1)},${p.y.toFixed(1)}"><title>${esc(d.name)}: ${l.mode === 'frozen' ? 'фабрика заморозки' : 'свежая выпечка'} ${esc(f.in || f.name)}, ${l.km} км${l.ok ? '' : ' — поставки прерваны'}</title></path>`); }
      let g = `<g class="ru-city${c ? ' own' : ''}${c && c.active ? ' act' : ''}${sel ? ' sel' : ''}" data-city="${d.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">`;
      g += `<circle class="hit" r="${(Math.max(r, 12 * k) + 4 * k).toFixed(1)}"/>`;
      if (c) {
        const cc = S.corp.cities[d.id];
        let tone = c.lastRev > 0 ? (c.lastProfit / c.lastRev >= 0.15 ? 'good' : c.lastProfit >= 0 ? 'warn' : 'bad') : 'none';
        if (L === 'dirs') { const dr = BK.Dir && BK.Dir.dirOf(S, cc); tone = dr ? (dr.loyalty >= 55 ? 'good' : dr.loyalty >= 35 ? 'warn' : 'bad') : c.active ? 'none' : 'nodir'; }
        else if (L === 'potential') tone = 'none';
        else if (L === 'logistics') { const rc = BK.Corp.remoteOf && BK.Corp.remoteOf(S, d.id); tone = rc ? (rc.supplyMode === 'frozen' ? 'frozen' : 'fresh') : c.prods ? 'hub' : 'none'; if (tone === 'hub') zones.push(zone(S, d, p)); }
        tally[tone] = (tally[tone] || 0) + 1;
        const R = Math.max(r, 11 * k);
        if (c.active) g += `<circle class="halo" r="${(R + 9 * k).toFixed(1)}"/>`;
        if (sel) g += `<circle class="selring" r="${(R + 5.5 * k).toFixed(1)}" stroke-width="${(2 * k).toFixed(2)}"/>`;
        g += `<circle class="ring t-${tone}" r="${(R + 2.6 * k).toFixed(1)}" stroke-width="${(3 * k).toFixed(2)}"${tone === 'nodir' ? ` stroke-dasharray="${(3 * k).toFixed(1)} ${(2.2 * k).toFixed(1)}"` : ''}/><circle class="b" r="${R.toFixed(1)}" stroke-width="${(1.4 * k).toFixed(2)}"/>`;
        g += `<text class="n" style="font-size:${((c.stores >= 100 ? 9.5 : 11) * k).toFixed(2)}px">${c.stores}</text>`;
        if (c.status === 'launch' && !c.stores) g += `<circle class="launch" r="${(R + 2.6 * k).toFixed(1)}" stroke-width="${(3 * k).toFixed(2)}"/>`;
        const bd = BK.CorpUI && BK.CorpUI.mapBadge(S, d.id); // инициалы директора или «!» — нет директора
        if (bd) { const bw = (bd.t.length > 1 ? 21 : 13) * k, bx = (LSIDE[d.id] || 'r') === 'r' ? -R * 0.72 - bw : R * 0.72, by = -R * 0.72 - 7 * k; g += `<g class="ru-bdg ${bd.cls}" transform="translate(${bx.toFixed(1)},${by.toFixed(1)})"><rect x="0" y="0" width="${bw.toFixed(1)}" height="${(13 * k).toFixed(1)}" rx="${(3 * k).toFixed(1)}" stroke-width="${(1.2 * k).toFixed(2)}"/><text x="${(bw / 2).toFixed(1)}" y="${(6.8 * k).toFixed(1)}" style="font-size:${(8.5 * k).toFixed(2)}px">${esc(bd.t)}</text></g>`; if (bd.t === '!') tally.nodir2++; }
        const pr = problemOf(S, d.id); // иконка проблемы: одна на город
        if (pr) { tally[pr]++; const px = ((LSIDE[d.id] || 'r') === 'r' ? -1 : 1) * R * 0.78, py = R * 0.78; g += `<g class="ru-prob p-${pr}" transform="translate(${px.toFixed(1)},${py.toFixed(1)}) scale(${k.toFixed(3)})"><title>${esc(PROB[pr].t)}</title><circle r="6.4"/>${PROB[pr].g}</g>`; }
      } else {
        const lock = E().enterLock(S, d.id);
        let cls = '';
        if (pot && pot[d.id]) { cls = ' pot-' + pot[d.id]; tally[pot[d.id]]++; }
        if (hubsOf) { const hb = hubsOf(d.id); if (hb.fresh) { cls = ' reach-fresh'; tally.rfresh++; } else if (hb.frozen) { cls = ' reach-frozen'; tally.rfrozen++; } }
        if (sel) g += `<circle class="selring" r="${(r + 5 * k).toFixed(1)}" stroke-width="${(2 * k).toFixed(2)}"/>`;
        g += `<circle class="free${lock ? ' locked' : ''}${cls}" r="${r.toFixed(1)}" stroke-width="${(1.3 * k).toFixed(2)}" stroke-dasharray="${(3 * k).toFixed(1)} ${(2.4 * k).toFixed(1)}"/>`;
        if (lock && d.big) g += `<g class="lk" transform="scale(${(k * 0.95).toFixed(3)})">${ICON.lock}</g>`;
      }
      g += `</g>`;
      out.push([sel || (c && c.active) ? 1 : 0, g]);
      // подпись
      const side = LSIDE[d.id] || 'r', R2 = (c ? Math.max(r, 11 * k) + 5 * k : r) + 5 * k, name = d.short || d.name;
      const lx = side === 'r' ? R2 : side === 'l' ? -R2 : 0, ly = side === 't' ? -R2 - 2 * k : side === 'b' ? R2 + 10 * k : 4 * k;
      const anchor = side === 'r' ? 'start' : side === 'l' ? 'end' : 'middle';
      labels.push(`<text class="ru-clabel${c ? ' own' : ''}${c && c.active ? ' act' : ''}" x="${(p.x + lx).toFixed(1)}" y="${(p.y + ly).toFixed(1)}" text-anchor="${anchor}">${esc(name)}${c && c.active && !narrow ? '<tspan class="here" dx="' + (5 * k).toFixed(1) + '">· вы здесь</tspan>' : ''}</text>`);
    }
    out.sort((a, b) => a[0] - b[0]);
    view.gL.innerHTML = zones.join('') + links.join('');
    view.gC.innerHTML = out.map((x) => x[1]).join('') + `<g class="ru-labels">${labels.join('')}</g>`;
    renderUi(S, sm);
  }
  // зона свежей выпечки вокруг цеха-хаба (слой «Логистика»): эллипс в проекции листа, км по дорогам → по прямой ÷ 1,25
  function zone(S, d, p) {
    const km = (BK.Corp.supplyHubs(S, d.id).freshKm || 150) / 1.25;
    const rx = km / (111.2 * Math.cos(d.lat * Math.PI / 180)) * 24, ry = km / 111.2 * 34;
    return `<ellipse class="ru-zone" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`;
  }
  const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  function renderUi(S, sm) {
    const a = view.el.querySelector('.ru-back'), name = BK.CITY_BY_ID[sm.active] ? BK.CITY_BY_ID[sm.active].name : '';
    const bt = `← ${esc(BK.CITY_BY_ID[sm.active] ? BK.CITY_BY_ID[sm.active].short || name : '')}`;
    if (a.innerHTML !== bt) { a.innerHTML = bt; a.title = `Вернуться на карту: ${name}`; a.setAttribute('aria-label', `Вернуться на карту города ${name}`); }
    const t = view.tally || {}, L = view.layer;
    const sw = (cls) => `<svg viewBox="-9 -9 18 18" class="lg-sw" aria-hidden="true"><circle r="6" class="${cls}"/></svg>`;
    const row = (cls, txt, n) => `<span class="lg-r">${sw(cls)}<span>${txt}</span><b>${n || 0}</b></span>`;
    let lg;
    if (L === 'dirs') lg = `<span class="lg-t">Слой · директора</span>${row('lg-own t-good', 'Лояльность 55 и выше', t.good)}${row('lg-own t-warn', 'От 35 до 55', t.warn)}${row('lg-own t-bad', 'Ниже 35 — могут уйти', t.bad)}${row('lg-own t-nodir', 'Нет директора', t.nodir)}`;
    else if (L === 'potential') lg = `<span class="lg-t">Слой · потенциал входа</span>${row('lg-free pot-hi', 'Высокий', t.hi)}${row('lg-free pot-mid', 'Средний', t.mid)}${row('lg-free pot-lo', 'Низкий', t.lo)}<span class="lg-h"><span>Ёмкость × доход гостей ÷ аренда и зарплаты; ближе к сети — лучше. Цена входа — в карточке города.</span></span>`;
    else if (L === 'logistics') lg = `<span class="lg-t">Слой · логистика</span>${row('lg-own t-hub', 'Свой цех — снабжает соседей', t.hub)}${row('lg-own t-fresh', 'Свежая выпечка из другого города', t.fresh)}${t.frozen ? row('lg-own t-frozen', 'Фабрика заморозки', t.frozen) : ''}${row('lg-free reach-fresh', 'Можно войти без своего цеха', t.rfresh)}${t.rfrozen ? row('lg-free reach-frozen', 'Дотянется заморозка', t.rfrozen) : ''}<span class="lg-h"><svg viewBox="0 0 22 12" class="lg-sw lg-ln" aria-hidden="true"><ellipse class="ru-zone" cx="11" cy="6" rx="9" ry="4.5"/></svg><span>Зона свежей выпечки вокруг цеха — ${BK.Corp.supplyHubs ? BK.Corp.supplyHubs(S, 'ufa').freshKm : 150} км</span></span>`;
    else lg = `<span class="lg-t">Слой · прибыль городов</span>${row('lg-own t-good', 'Маржа 15 % и выше', t.good)}${row('lg-own t-warn', 'От 0 до 15 %', t.warn)}${row('lg-own t-bad', 'Убыток', t.bad)}<span class="lg-h">${sw('lg-free')}<span>Можно открыть — нажмите на город</span></span>`;
    if (L !== 'logistics') lg += supLegend(S);
    // иконки проблем — только те, что есть сейчас
    const pi = (k, txt, n) => `<span class="lg-r"><svg viewBox="-8 -8 16 16" class="lg-sw" aria-hidden="true"><g class="ru-prob p-${k}"><circle r="6.4"/>${PROB[k].g}</g></svg><span>${txt}</span><b>${n}</b></span>`;
    let pr = '';
    if (t.loss) pr += pi('loss', 'Убыток 2+ мес.', t.loss);
    if (t.leak) pr += pi('leak', 'Утечка денег', t.leak);
    if (t.over) pr += pi('over', 'Штаб перегружен', t.over);
    if (t.nodir2) pr += `<span class="lg-r"><svg viewBox="-8 -8 16 16" class="lg-sw" aria-hidden="true"><g class="ru-bdg bad"><rect x="-6" y="-6" width="12" height="12" rx="2.5"/><text y="0.5" style="font-size:9px">!</text></g></svg><span>Нет директора</span><b>${t.nodir2}</b></span>`;
    if (pr) lg += `<span class="lg-t lg-t2">Проблемы</span>${pr}`;
    const lgEl = view.el.querySelector('.ru-legend'); if (lgEl.innerHTML !== lg) lgEl.innerHTML = lg;
    const cart = view.el.querySelector('.ru-cart');
    if (!cart.firstChild) cart.innerHTML = `<div class="ct-in"><div class="ct-c ct-full"><small>Генплан сети</small><div class="ct-t">Россия · лист 2</div></div><div class="ct-c"><small>Масштаб</small><div class="ct-v">1 : 20 000 000</div></div><div class="ct-c"><small>Дата</small><div class="ct-v ct-d"></div></div><div class="ct-c ct-last"><small>Городов · точек</small><div class="ct-v ct-n"></div></div><div class="ct-c ct-last"><small>Штаб: нагрузка / мощность</small><div class="ct-v ct-hq"></div></div></div>`;
    const d = E().dateOf(S.day), dv = `${String(d.d).padStart(2, '0')}.${String(d.m + 1).padStart(2, '0')}.${d.y}`, nv = `${sm.cities.length} · ${sm.stores}`;
    const hl = BK.HQ && BK.HQ.load ? BK.HQ.load(S) : null, hv = hl ? `${n1(hl.load)} / ${n1(hl.cap)}` : '—';
    const cd = cart.querySelector('.ct-d'), cn = cart.querySelector('.ct-n'), ch = cart.querySelector('.ct-hq');
    if (cd.textContent !== dv) cd.textContent = dv; if (cn.textContent !== nv) cn.textContent = nv;
    if (ch && ch.textContent !== hv) { ch.textContent = hv; ch.classList.toggle('negc', !!(hl && hl.over > 0)); }
  }
  function supLegend(S) { // линии снабжения — только когда они есть
    const ls = BK.Corp.supplyLinks ? BK.Corp.supplyLinks(S) : []; if (!ls.length) return '';
    const ln = (cls) => `<svg viewBox="0 0 22 8" class="lg-sw lg-ln" aria-hidden="true"><path class="ru-sup ${cls}" d="M1,4L21,4"/></svg>`;
    let s = '';
    if (ls.some((l) => l.mode !== 'frozen')) s += `<span class="lg-r">${ln('fresh')}<span>Свежая выпечка из цеха</span><b>${ls.filter((l) => l.mode !== 'frozen').length}</b></span>`;
    if (ls.some((l) => l.mode === 'frozen')) s += `<span class="lg-r">${ln('frozen')}<span>Фабрика заморозки</span><b>${ls.filter((l) => l.mode === 'frozen').length}</b></span>`;
    return s;
  }
  // экранная точка города внутри .mapwrap (для анимации)
  function cityScreen(id) {
    const d = BK.CITY_BY_ID[id] || BK.CITY_BY_ID.ufa, p = P(d.lon, d.lat);
    const r = view.px, s = Math.min(r.w / view.vb.w, r.h / view.vb.h);
    const ox = (r.w - view.vb.w * s) / 2, oy = (r.h - view.vb.h * s) / 2;
    return { x: ox + (p.x - view.vb.x) * s, y: oy + (p.y - view.vb.y) * s };
  }
  const reduce = () => globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animT = null;
  // город → Россия: карта города сжимается к своему кружку, лист России проявляется из ×3
  function open(S, wrap, mapEl) {
    build(wrap);
    const was = !view.el.hidden;
    view.el.hidden = false; wrap.classList.add('ru-on');
    if (wrap.parentElement) wrap.parentElement.classList.add('ru-view'); // телефон: панель — шторка (до замера листа)
    view.measure();
    if (!view.inited) { view.inited = true; resetVB(); }
    render(S, true);
    if (was) return;
    snd('tab'); // лист России открылся: карта переключилась, как вкладка (фанфары — за выход в Россию, он звучит в «Сводке»)
    const p = cityScreen(S.corp.active), w = wrap.getBoundingClientRect();
    clearTimeout(animT);
    if (reduce() || !view.el.animate) {
      if (view.el.animate) view.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
      mapEl.style.visibility = 'hidden'; return;
    }
    mapEl.style.transformOrigin = '50% 50%'; mapEl.style.visibility = '';
    const a = mapEl.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(p.x - w.width / 2).toFixed(0)}px, ${(p.y - w.height / 2).toFixed(0)}px) scale(.06)`, opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)' });
    view.el.style.transformOrigin = `${p.x.toFixed(0)}px ${p.y.toFixed(0)}px`;
    view.el.animate([{ transform: 'scale(3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)' });
    a.onfinish = () => { mapEl.style.visibility = 'hidden'; };
  }
  // Россия → город: обратная анимация от кружка города
  function close(S, wrap, mapEl, done) {
    if (!view.el || view.el.hidden) { if (done) done(); return; }
    snd('tab'); // вернулись к карте города
    const p = cityScreen(S.corp.active), w = wrap.getBoundingClientRect();
    mapEl.style.visibility = '';
    const fin = () => { view.el.hidden = true; wrap.classList.remove('ru-on'); view.tip.hidden = true; if (done) done(); };
    if (reduce() || !view.el.animate) { fin(); mapEl.animate && mapEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 }); return; }
    mapEl.style.transformOrigin = '50% 50%';
    mapEl.animate([{ transform: `translate(${(p.x - w.width / 2).toFixed(0)}px, ${(p.y - w.height / 2).toFixed(0)}px) scale(.06)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)' });
    view.el.style.transformOrigin = `${p.x.toFixed(0)}px ${p.y.toFixed(0)}px`;
    const b = view.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(3)', opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.4,0,.2,1)' });
    b.onfinish = fin;
  }
  function isOpen() { return !!(view.el && !view.el.hidden); }
  function select(id) { view.sel = id; view.lastKey = ''; }

  /* ---------------- телефон: шторка на экране России (макет russia-4-mobile; §9.2) ----------------
     Панель «Россия» выдвигается снизу поверх карты. Три положения: «peek» — видны ручка, вкладки и начало сводки;
     «half» — половина экрана (по умолчанию); «full» — почти весь экран под HUD. Ручка: нажатие — следующее положение,
     перетаскивание — вверх/вниз с привязкой к ближайшему. Положение запоминается (localStorage — только удобство). */
  const SHEET = ['peek', 'half', 'full'];
  const sheet = { el: null, pos: 'half' };
  try { const v = localStorage.getItem('bk-ru-sheet'); if (SHEET.indexOf(v) >= 0) sheet.pos = v; } catch (e) { /* без хранилища */ }
  const sheetOn = () => !!(sheet.el && sheet.el.parentElement && sheet.el.parentElement.classList.contains('ru-view') && globalThis.matchMedia && matchMedia('(max-width: 820px)').matches);
  function sheetSet(pos, keep) {
    if (SHEET.indexOf(pos) < 0) return;
    sheet.pos = pos;
    if (sheet.el) { sheet.el.dataset.sheet = pos; if (sheet.el.parentElement) sheet.el.parentElement.dataset.sheet = pos; /* .main[data-sheet] — кнопки масштаба над шторкой */ sheet.el.style.removeProperty('--sheet-drag'); sheet.el.classList.remove('dragging'); const g = sheet.el.querySelector('.sheet-grip'); if (g) g.setAttribute('aria-label', pos === 'full' ? 'Свернуть панель' : 'Развернуть панель'); }
    if (!keep) { try { localStorage.setItem('bk-ru-sheet', pos); } catch (e) { /* без хранилища */ } }
  }
  function sheetCycle() { sheetSet(sheet.pos === 'peek' ? 'half' : sheet.pos === 'half' ? 'full' : 'peek'); }
  function sheetShow() { if (sheetOn() && sheet.pos === 'peek') sheetSet('half', true); } // выбрали город — показать карточку
  function bindSheet(panel) {
    if (!panel || sheet.el) return;
    sheet.el = panel; panel.dataset.sheet = sheet.pos; if (panel.parentElement) panel.parentElement.dataset.sheet = sheet.pos;
    const grip = panel.querySelector('.sheet-grip'); if (!grip) return;
    let st = null;
    grip.addEventListener('pointerdown', (e) => {
      if (!sheetOn()) return;
      st = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false };
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', (e) => {
      if (!st) return;
      const dy = e.clientY - st.y; if (!st.moved && Math.abs(dy) < 6) return;
      st.moved = true; panel.classList.add('dragging');
      const max = window.innerHeight - 40;
      panel.style.setProperty('--sheet-drag', Math.max(96, Math.min(max, st.h - dy)).toFixed(0) + 'px');
    });
    const end = (e) => {
      if (!st) return;
      const moved = st.moved, h = panel.getBoundingClientRect().height; st = null;
      if (!moved) { if (e.type === 'pointerup') sheetCycle(); return; }
      const vh = window.innerHeight, pos = h < vh * 0.33 ? 'peek' : h < vh * 0.72 ? 'half' : 'full';
      sheetSet(pos);
    };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    grip.addEventListener('click', (e) => e.preventDefault());
    grip.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); sheetSet(sheet.pos === 'peek' ? 'half' : 'full'); } else if (e.key === 'ArrowDown') { e.preventDefault(); sheetSet(sheet.pos === 'full' ? 'half' : 'peek'); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheetCycle(); } });
  }

  /* ---------------- панель «Россия» ---------------- */
  const COMPN = (c) => (BK.CITY_COMP[c] || {}).name || c;
  const idx = (v) => '×' + String(v.toFixed(2)).replace('.', ',');
  function chips(d) {
    const t = (v) => (v > 1.02 ? 'warn' : v < 0.98 ? 'good' : '');
    return `<div class="row ru-chips"><span class="chip" title="Платёжеспособность гостей к Уфе">доход ${idx(d.inc)}</span><span class="chip ${t(d.rent)}" title="Ставки аренды к Уфе">аренда ${idx(d.rent)}</span><span class="chip ${t(d.wage)}" title="Рыночные зарплаты к Уфе">зарплаты ${idx(d.wage)}</span><span class="chip ${d.comp === 'high' || d.comp === 'vhigh' ? 'bad' : d.comp === 'low' ? 'good' : ''}">конкуренция ${COMPN(d.comp)}</span></div>`;
  }
  const awBar = (aw) => `<div class="ru-aw" title="Узнаваемость бренда: гостей × (0,85 + 0,15 × узнаваемость)"><span>Узнаваемость</span><div class="meter ok"><i style="width:${Math.round(aw * 100)}%"></i></div><b>${Math.round(aw * 100)} %</b></div>`;
  function cityCard(S, id) {
    const d = BK.CITY_BY_ID[id]; if (!d) return '';
    const h = H(), c = BK.Corp.cityStats(S, id);
    let s = `<div class="card ru-card"><div class="card-h"><div><div class="card-t ru-name">${esc(d.name)}</div><div class="card-s">${popTxt(d.pop)}${d.km ? ` · ${h.n0(d.km)} км от Уфы` : ' · родной город'} · ёмкость ~${d.cap} точек</div></div>${c ? `<span class="chip ${c.active ? 'crust' : hasDir(S, id) ? '' : 'bad'}">${c.active ? 'вы управляете' : modeTxt(S, id)}</span>` : ''}</div>`;
    s += chips(d);
    if (d.feat) s += `<div class="hint">${esc(d.feat)}</div>`;
    if (c) {
      const hist = c.hist.slice(-12);
      s += `<div class="kpis"><div class="kpi"><span class="k">Выручка за месяц</span><span class="v">${c.lastRev != null ? fm(c.lastRev) : '—'}</span><span class="d">${hist.length > 1 ? h.spark(hist.map((x) => x[2]), 64, 18) : 'первый месяц'}</span></div>
        <div class="kpi"><span class="k">Прибыль за месяц</span><span class="v ${c.lastProfit < 0 ? 'negc' : ''}">${c.lastProfit != null ? fm(c.lastProfit) : '—'}</span><span class="d">${c.lastRev ? 'маржа ' + h.pctS(c.lastProfit / c.lastRev, true) : 'до вычета офиса сети'}</span></div>
        <div class="kpi"><span class="k">Точки · цеха</span><span class="v">${c.open}${c.soon ? ` <small class="pos">+${c.soon}</small>` : ''} · ${c.prods}</span><span class="d">команда ${c.staff}</span></div>
        <div class="kpi"><span class="k">Рейтинг на картах</span><span class="v">${c.rating != null ? c.rating.toFixed(1).replace('.', ',') + '★' : '—'}</span><span class="d">${c.active ? 'как в городе' : hasDir(S, id) ? 'ведёт директор' : 'сползает к 3,5★ без вас'}</span></div></div>`;
      if (id !== 'ufa') s += awBar(c.aw);
      const rc = BK.Corp.remoteOf && BK.Corp.remoteOf(S, id); // Р4: снабжение из другого города
      if (rc) s += `<p class="hint ${rc.supplyOk === false ? 'negc' : ''}" style="margin:0">Выпечка: ${esc(BK.Corp.supplyName(S, rc))}, ${rc.supplyKm} км${rc.supplyOk === false ? ' — <b>поставки прерваны</b>: точки без выпечки, нужен свой цех' : '. Свой цех в городе выгоднее, когда точек станет больше.'}</p>`;
      if (BK.CorpUI) s += BK.CorpUI.cityBlocks(S, id);
      if (c.active) s += `<div class="row sp"><span class="hint">Этот город считается подробно: вы нанимаете, учите и открываете точки сами.</span><button class="btn primary" data-act="ruBack">К карте города</button></div>`;
      else s += `<div class="row sp"><span class="hint">${hasDir(S, id) ? 'Зайдите, чтобы вести город самому: директор станет заместителем (дольше 2 месяцев — лояльность падает).' : 'Без директора город только живёт. Зайдите, чтобы вести его самому.'}</span><button class="btn primary" data-act="ruGo" data-arg="${id}">Зайти в город</button></div>`;
    } else {
      const lock = E().enterLock(S, id), cost = E().enterCost(S, id), aw = BK.Corp.awStart(S, id);
      const pk = S.corp.perks && S.corp.perks[id], pre = S.corp.prePressure && S.corp.prePressure[id];
      if (pk && pk.until >= S.day) s += `<div class="perk">Приглашение губернатора до ${esc(E().fmtDate(pk.until))}: регистрация бесплатно, цех ${Math.round((1 - pk.prodRent) * 100)} % дешевле</div>`;
      if (pre) s += `<div class="hint warnc">«${esc(C().RIVAL_NAME)}» уже готовится: давление соперника при входе +${String(pre.toFixed(1)).replace('.', ',')}</div>`;
      if (BK.CorpUI && BK.CorpUI.hqLoadHtml) s += BK.CorpUI.hqLoadHtml(S, { extra: 1 }) + `<p class="hint" style="margin:0">${esc(BK.CorpUI.enterCostNote(S))}.</p>`; // Р4 ч. 2: цена входа и штаб
      s += `<div class="grid2">${h.kv('Вход: регистрация, маркетинг, штаб города', fm(cost))}${h.kv('Стартовая узнаваемость', Math.round(aw * 100) + ' %')}${h.kv('Цех и точки', 'как в начале игры, из своих денег')}${h.kv('Рынок зарплат', fm(BK.Corp.corpMarket(S).seller * d.wage) + '/мес')}</div>`;
      s += `<div class="row sp"><span class="hint ${lock ? 'warnc' : ''}">${lock ? esc(lock) + '.' : S.cash >= cost ? 'Запустите город сами (переезд) или поручите директору — тогда вы останетесь, где были.' : `<span class="negc">Не хватает ${fm(cost - S.cash)}.</span>`}</span>${h.btn('ruEnter', 'Открыть город', { cls: 'primary', arg: id, cost, dis: !!lock || S.cash < cost })}</div>`;
    }
    return s + `</div>`;
  }
  const hasDir = (S, id) => !!(S.corp.cities[id] && S.corp.cities[id].directorId);
  function modeTxt(S, id) { const c = S.corp.cities[id], dr = BK.Dir && BK.Dir.dirOf(S, c); return dr ? 'директор ' + (BK.CorpUI ? BK.CorpUI.initials(dr.name) : '') : 'нет директора'; }
  function panel(S, ui) {
    const h = H(), sm = BK.Corp.summary(S); if (!sm) return '<div class="empty">Россия откроется, когда оборот сети за всё время дойдёт до 10 млрд ₽.</div>';
    snd(citiesSound(S)); // звук: приехал директор / у города проблема / город остался без директора
    const hs = S.history, last = hs[hs.length - 1];
    const roll = BK.Corp.rollingAll(S);
    let s = `<div class="sec ru-head"><div class="dkpis">
      <div class="dkpi"><div class="lab">Выручка сети${last ? ' за ' + E().MONTHS[last.m] : ''}</div><div class="v">${fm(last ? last.rev : S.month.rev)}</div><div class="sub">за 12 мес.: <span class="num">${fm(roll)}</span></div></div>
      <div class="dkpi"><div class="lab">Прибыль сети</div><div class="v ${last && last.profit < 0 ? 'negc' : ''}">${last ? fm(last.profit) : '—'}</div><div class="sub">${h.nw(sm.cities.length, 'город', 'города', 'городов')} · ${h.nw(sm.stores, 'точка', 'точки', 'точек')}</div></div></div></div>`;
    if (BK.CorpUI) s = `<div class="sec">${BK.CorpUI.fedCard(S)}</div>` + s + (BK.CorpUI.hqLoadHtml ? `<div class="sec">${BK.CorpUI.hqLoadHtml(S, { btn: true })}</div>` : '') + BK.CorpUI.attentionHtml(S, 5);
    // доля городов в выручке за 12 мес.
    const tot = sm.cities.reduce((a, c) => a + Math.max(0, c.rev12), 0);
    if (tot > 0) {
      const cols = ['var(--crust)', 'var(--river)', 'var(--good)', 'var(--warn)', 'var(--rye)', 'var(--ink-3)'];
      const list = sm.cities.slice().sort((a, b) => b.rev12 - a.rev12);
      s += `<div class="sec"><h3>Доля городов в выручке <small>12 мес.</small></h3><div class="ru-stack">${list.map((c, i) => `<i style="width:${(Math.max(0, c.rev12) / tot * 100).toFixed(1)}%;background:${cols[i % cols.length]}" title="${esc(c.name)}: ${fm(c.rev12)}"></i>`).join('')}</div><div class="ru-stack-l">${list.map((c, i) => `<span><i style="background:${cols[i % cols.length]}"></i>${esc(BK.CITY_BY_ID[c.id].short || c.name)} ${h.pct(Math.max(0, c.rev12) / tot)}</span>`).join('')}</div></div>`;
    }
    const sel = ui.ruSel || sm.active;
    s += `<div class="sec"><h3>${BK.Corp.cityStats(S, sel) ? 'Город' : 'Новый город'} <small>нажмите на кружок на карте</small></h3>${cityCard(S, sel)}</div>`;
    s += `<div class="sec"><h3>Наши города</h3>${sm.cities.map((c) => cityRow(S, c, sel)).join('')}
      <p class="hint" style="margin:0">Подробно считается только город, где вы сейчас. Остальные ведут директора: раз в месяц нанимают и учат людей, открывают и закрывают точки в пределах бюджета и присылают отчёт. Город без директора только живёт.</p></div>`;
    s += `<div class="sec"><h3>Куда дальше <small>ближайшие к сети</small></h3>${nextCities(S).slice(0, 4).map((id) => freeRow(S, id, sel)).join('')}<button class="linkbtn" data-act="tab" data-arg="rucities">Все города России →</button></div>`;
    return s;
  }
  function cityRow(S, c, sel) {
    const h = H(), d = BK.CITY_BY_ID[c.id];
    return `<div class="card click ru-row${sel === c.id ? ' sel' : ''}" data-act="ruSel" data-arg="${c.id}"><div class="card-h"><div><div class="card-t">${esc(d.name)} ${c.active ? '<span class="chip crust">вы здесь</span>' : hasDir(S, c.id) ? `<span class="chip">${esc(modeTxt(S, c.id))}</span>` : '<span class="chip bad">нет директора</span>'}</div><div class="card-s">${h.nw(c.open, 'точка', 'точки', 'точек')}${c.soon ? ` (+${c.soon})` : ''} · ${c.rating != null ? c.rating.toFixed(1).replace('.', ',') + '★' : 'нет рейтинга'}${c.id !== 'ufa' ? ' · узнаваемость ' + Math.round(c.aw * 100) + ' %' : ''}</div></div>
      <div class="ru-rv"><b>${c.lastRev != null ? fm(c.lastRev) : '—'}</b><span class="${c.lastProfit < 0 ? 'negc' : 'pos'}">${c.lastProfit != null ? (c.lastProfit >= 0 ? '+' : '') + fm(c.lastProfit) : 'первый месяц'}</span></div></div></div>`;
  }
  function nextCities(S) { // не наши города по расстоянию до ближайшего нашего
    const own = Object.keys(S.corp.cities);
    return BK.CITIES.filter((d) => !S.corp.cities[d.id]).map((d) => ({ id: d.id, km: Math.min(...own.map((o) => BK.roadKm(o, d.id))) })).sort((a, b) => a.km - b.km).map((x) => x.id);
  }
  function freeRow(S, id, sel) {
    const h = H(), d = BK.CITY_BY_ID[id], lock = E().enterLock(S, id);
    return `<div class="card click ru-row${sel === id ? ' sel' : ''}" data-act="ruSel" data-arg="${id}"><div class="card-h"><div><div class="card-t">${esc(d.name)}${lock && d.big ? ' <span class="chip">закрыт</span>' : ''}</div><div class="card-s">${popTxt(d.pop)} · ${h.n0(d.km)} км от Уфы · конкуренция ${COMPN(d.comp)}</div></div><div class="ru-rv"><b>${fm(E().enterCost(S, id))}</b><span>вход</span></div></div></div>`;
  }
  function citiesTab(S, ui) {
    if (!BK.Corp.on(S)) return '';
    snd(citiesSound(S)); // звук: те же события городов, что и на панели «Россия»
    const sel = ui.ruSel || S.corp.active;
    let s = `<div class="sec"><h3>Выбранный город</h3>${cityCard(S, sel)}</div>`;
    s += `<div class="sec"><h3>Все города <small>${BK.CITIES.length}, по близости к сети</small></h3>`;
    s += Object.keys(S.corp.cities).map((id) => cityRow(S, BK.Corp.cityStats(S, id), sel)).join('');
    s += nextCities(S).map((id) => freeRow(S, id, sel)).join('') + `</div>`;
    return s;
  }
  // полоса в «Сводке» города: сеть в России одной строкой.
  // Здесь же звучат события, которые видно и без карты России: выход в Россию (окно «Сеть переросла город») —
  // фанфары, вход в новый город (переезд) — «ленточка». Полоса рисуется на «Сводке» каждого города, поэтому
  // после переезда она и сообщает о новом городе.
  function dashStrip(S) {
    if (!BK.Corp.on(S)) return '';
    if (!corpSeen) { corpSeen = true; snd('fanfare'); }
    else snd(citiesSound(S)); // вход в новый город и прочие события городов
    const sm = BK.Corp.summary(S), others = sm.cities.filter((c) => !c.active);
    if (!others.length) return `<div class="ru-strip"><span>${BK.ICON_GLOBE || ''}Открыт выход в Россию: можно открыть второй город.</span><button class="btn sm primary" data-act="russia">Карта России</button></div>`;
    const h = H(), rev = others.reduce((a, c) => a + (c.lastRev || 0), 0), n = others.reduce((a, c) => a + c.open, 0), has = others.some((c) => c.lastRev != null);
    return `<div class="ru-strip"><span>${BK.ICON_GLOBE || ''}<span>Другие города: ${others.map((c) => esc(BK.CITY_BY_ID[c.id].short || c.name)).join(', ')} — ${h.nw(n, 'точка', 'точки', 'точек')}${has ? `, ${fm(rev)} за месяц` : ', отчёт — 1-го числа'}</span></span><button class="btn sm" data-act="russia">Россия</button></div>`;
  }

  BK.Russia = { build, render, open, close, isOpen, select, setLayer, bindSheet, sheetSet, sheetCycle, sheetShow, get sheet() { return sheet.pos; }, potential, problemOf, citiesSound, get layer() { return view.layer; }, zoom: (a) => (a === 'reset' ? resetVB() : zoom(a === 'in' ? 1 / 1.3 : 1.3)), panel, citiesTab, dashStrip, cityCard, tipFor };
})();
