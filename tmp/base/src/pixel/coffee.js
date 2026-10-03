/* =====================================================================
   «СВОЯ КОФЕЙНЯ» — пиксельная сцена стадии 1 (BK.Px.scenes.coffee), docs/vision-plan.md §10.
   Только картинка: все числа и флаги приходят готовыми из src/ui/stage1.js (view(S)) — сцена в движок не смотрит,
   игровой логики здесь нет (ботам не нужна).
   Что на сцене (раскладка — по макету docs/mockups/vision/img/s1-shop.png): окно на улицу (напротив — «Хлебный двор»),
   вывеска с названием и маркиза, полки с хлебом и коробками, меловая доска с ценами из меню, прилавок с витриной,
   кофемашина с паром, касса, кофемолка и стаканы; за прилавком — вы (герой из Px.CAST: четыре варианта по полу
   и возрасту), в зале — 1–3 гостя из готовых обликов Px.GUESTS, столик, пузыри мыслей.
   Живёт: пар над кофемашиной и чашкой, гость подходит к прилавку и уходит, монетка летит в кассу, моргание.
   Реагирует на состояние: открыто / открытие (ящики, заклеенное окно) / ремонт (стремянка, плёнка) / закрыто
   (табличка, пустая витрина, без гостей), полнота витрины к вечеру, свет по часу суток (Px.relight), касса — по выручке дня,
   настроение героя — по силам (T.hp) и настроению сотрудника-героя.
   Слои кэшируются (Px.memo): «за прилавком» (стена, окно, вывеска, полки, доска, пол) и «прилавок», свет запечён;
   каждый кадр — копия слоёв + люди, пар, монетка.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px, { Buf, mix, bay, rng, text, textW, icon, bubble, bubbleW } = Px;
  const SC = () => Px.scenes;
  const Q = {
    wall: ['#f4e6c8', '#e8d5ad', '#fbf0d8'],
    panel: ['#3f6b5a', '#2d4e42', '#5c8a72'],
    wood: ['#5a3522', '#7a4a2c', '#9c6338', '#c0844a', '#d9a566', '#ecc38a'],
    floor: ['#b98450', '#a8743f', '#c99560', '#94653a', '#d8a870'],
    navy: ['#1f2a44', '#16203a', '#2e3d60'],
    crust: ['#c46f17', '#e59a3e', '#f4c27a', '#94500b'],
    steel: ['#6b6a73', '#8f8d94', '#b5b2b2', '#d8d4cc', '#4a4a55'],
    copper: ['#b87333', '#8a4f22', '#e0a05a'],
    sky: ['#bfe3ef', '#a4d3e6', '#dff1f4'],
    facade: ['#cfd7da', '#b0b9c0'],
    glass: ['#cfe8f0', '#ffffff', '#a8c8d0'],
    cream: ['#fbf6ec', '#efe4d0', '#d9ccb5'],
    board: ['#2e3a30', '#3d4f43'],
    dvor: ['#8f7bb0', '#6d5a8c'],
    green: ['#3f6b3a', '#5d8c46', '#8cb35a'],
    box: ['#c99b62', '#e0bb88', '#a87a44'],
  };
  // свет по часу суток: amb и k — множитель фона (≤ 1), лампы и окно — тёплые добавки, tint — тон спрайтов.
  // Так же устроена «живая точка» (src/pixel/store.js): днём множитель белый (картинка как нарисована), ночью — тёмный.
  const LIGHT = {
    morning: { amb: '#ffe9cc', k: 1.0, lamps: 0.22, sun: 0.3, tint: 0.05 },
    day: { amb: '#f2ecdc', k: 1.0, lamps: 0.1, sun: 0.16, tint: 0 },
    evening: { amb: '#e0b48c', k: 0.86, lamps: 0.5, sun: 0.08, tint: 0.12 },
    night: { amb: '#8a90c0', k: 0.55, lamps: 0.78, sun: 0, tint: 0.36 },
    off: { amb: '#a8a2b4', k: 0.62, lamps: 0.08, sun: 0, tint: 0.26 },
  };
  function phaseOf(h, state) {
    if (state === 'closed' && (h < 7.5 || h >= 20.5)) return 'off';
    if (h < 8.5) return 'morning';
    if (h < 16.5) return 'day';
    if (h < 20.5) return 'evening';
    return 'night';
  }

  /* ---------------- раскладка ---------------- */
  function layout(W, H) {
    const L = { W, H, compact: W < 250 };
    L.wall = Math.round(H * 0.64);
    const py = L.wall - 12;                                  // низ стены: панели
    L.cY = L.wall + 3;                                       // верх прилавка
    L.cB = Math.min(H - 1, L.cY + Math.max(12, Math.round(H * 0.1)));
    L.hall = H - L.cB;
    const ww = Math.max(28, Math.min(78, Math.round(W * 0.21)));
    L.win = { x: 5, y: 9, w: ww, h: Math.max(14, py - 13) };
    L.sx0 = L.win.x + L.win.w + 7; L.sx1 = W - 6;
    L.sign = { y: 7, h: L.compact ? 12 : 15 };
    L.aw = { y: L.sign.y + L.sign.h, h: 6 };
    L.board = W >= 300 ? { x: W - 82, y: 26, w: 76, h: Math.min(48, L.wall - 40) } : null;
    L.shelf = { x0: L.sx0 + 3, x1: (L.board ? L.board.x - 6 : W - 8), y1: L.aw.y + L.aw.h + 9, y2: 0 };
    L.shelf.y2 = Math.min(L.wall - 14, L.shelf.y1 + 15);
    if (L.shelf.y2 < L.shelf.y1 + 9) L.shelf.y2 = 0;
    L.c0 = Math.max(2, L.win.x + L.win.w + 4); L.c1 = W - 3;
    const cw = L.c1 - L.c0;
    L.till = { x: L.c0 + 3, w: Math.max(14, Math.min(24, Math.round(cw * 0.09))) };
    L.vit = { x: L.till.x + L.till.w + 5, w: Math.max(28, Math.round(cw * 0.4)) };
    L.hero = L.vit.x + L.vit.w + 6;
    L.mach = { x: Math.max(L.hero + 20, L.c1 - (L.compact ? 26 : 32)), w: L.compact ? 24 : 28 };
    L.table = (W >= 300 && L.hall >= 26) ? { x: W - 34, y: H - 13 } : null;
    L.clock = (L.wall - 12 - 30 > L.aw.y + L.aw.h) ? { x: Math.round(W * 0.42), y: L.wall - 30, r: 7 } : null;
    L.steamAt = [[L.mach.x + 6, L.cY - 20], [L.mach.x + L.mach.w - 6, L.cY - 20]];
    L.lamps = [Math.round((L.sx0 + L.sx1) / 2), Math.round(W * 0.84)];
    return L;
  }
  // вывеска: название обрезается по месту, крупный шрифт — если влезает
  function signLabel(L, name) {
    let s = String(name || 'КОФЕЙНЯ').trim().toUpperCase();
    const max = L.sx1 - L.sx0 - 12;
    const sc = (!L.compact && textW(s, 2) <= max) ? 2 : 1;
    while (s.length > 2 && textW(s, sc) > max) s = s.slice(0, -1);
    return s;
  }

  /* ---------------- слой 1: за прилавком (стена, окно, вывеска, полки, доска, пол) ---------------- */
  function back(L, light, o) {
    const { W, H, wall } = L, b = new Buf(W, H), P = LIGHT[light];
    b.rect(0, 0, W, wall, Q.wall[0]);
    const R = rng(11);
    for (let i = 0; i < W * wall / 20; i++) { const x = (R() * W) | 0, y = (5 + R() * (wall - 16)) | 0; b.set(x, y, R() > 0.5 ? Q.wall[1] : Q.wall[2], 0.75); }
    // потолочная балка и лампы
    b.rect(0, 0, W, 5, '#4a2e22'); b.hl(0, 4, W, '#6a4430'); b.hl(0, 0, W, '#3a2219');
    L.lamps.forEach((x) => { b.vl(x, 4, 4, '#3a2219'); b.rect(x - 3, 8, 7, 3, '#3a2219'); b.rect(x - 2, 9, 5, 2, P.lamps > 0.3 ? '#fff3c0' : '#6a6458'); });
    winDraw(b, L, light, o);
    signDraw(b, L, o);
    shelfDraw(b, L, o.state);
    if (L.board) boardDraw(b, L, o);
    if (L.clock) clockFace(b, L.clock);
    // панели низа стены
    b.rect(0, wall - 12, W, 12, Q.panel[0]); b.hl(0, wall - 12, W, Q.panel[2]); b.hl(0, wall - 1, W, Q.panel[1]);
    for (let x = 4; x < W; x += 20) { b.rect(x, wall - 9, 16, 7, Q.panel[1]); b.hl(x, wall - 9, 16, Q.panel[2]); b.vl(x + 15, wall - 9, 7, Q.panel[1]); }
    SC().floorPlanks(b, W, wall, H);
    // свет: полосы от окна, лампы, общий тон
    if (P.sun > 0) {
      b.beam([[L.win.x + 2, L.win.y + 4], [L.win.x + L.win.w - 2, L.win.y + 4], [L.win.x + L.win.w + 44, H], [L.win.x + 14, H]], '#fff1c4', (x, y) => Math.floor((0.07 + bay(x, y) * 0.03) * 20) / 20 * (1 - (y - L.win.y) / (H - L.win.y + 1)));
      b.glow(L.win.x + L.win.w / 2, L.win.y + 6, L.win.w * 0.6, '#fff0c0', 0.16, { ry: Math.max(8, L.win.h * 0.5) });
    }
    const Ls = [];
    (L.lamps || []).forEach((x) => Ls.push({ c: '#ffd9a0', i: P.lamps, f: Px.point(x, 11, W * 0.24, 1.7, H * 0.55) }));
    if (P.sun > 0) Ls.push({ c: '#fff1c4', i: P.sun, f: Px.point(L.win.x + L.win.w / 2, L.win.y + L.win.h / 2, L.win.w * 1.6, 1.2, L.win.h * 1.7) });
    Px.relight(b, P.amb, Ls, { k: P.k, steps: 5, max: 1.15 });
    return b;
  }
  // окно на улицу: небо, дом напротив, вывеска «Хлебный двор», рама, подоконник с цветком
  function winDraw(b, L, light, o) {
    const w = L.win, dark = light === 'night' || light === 'evening';
    const skyTop = light === 'night' ? '#2a3560' : light === 'evening' ? '#f0a870' : Q.sky[0];
    const skyBot = light === 'night' ? '#4a5a90' : light === 'evening' ? '#f7d9a8' : Q.sky[2];
    for (let y = w.y; y < w.y + w.h; y++) b.hl(w.x, y, w.w, bay(0, y) < (y - w.y) / 18 ? skyTop : skyBot);
    const fy = w.y + Math.round(w.h * 0.42);
    b.rect(w.x, fy, w.w, w.y + w.h - fy, Q.facade[0]);
    b.hl(w.x, fy, w.w, '#b86a4a');
    for (let i = 0; i * 11 + 2 < w.w - 5; i++) { const x = w.x + 2 + i * 11; b.rect(x, fy + 4, 6, 6, dark ? (i % 2 ? '#ffd98a' : '#3a4266') : '#6f8fa6'); b.rect(x + 1, fy + 5, 2, 3, dark ? '#fff3c0' : '#c9e2ec'); }
    if (o.dvor && w.w >= 30 && w.h >= 24) {
      const bw = Math.min(w.w - 8, 40), bx = w.x + 4, by = w.y + 3;   // левая створка: срединный переплёт не режет надпись
      b.rect(bx, by, bw, 9, Q.dvor[0]); b.hl(bx, by, bw, Q.dvor[1]);
      const lab = o.dvor === 'soon' ? 'СКОРО' : 'ДВОР';
      if (textW(lab) <= bw - 3) text(b, bx + Math.round((bw - textW(lab)) / 2), by + 1, lab, '#ffffff');
    }
    // рама (только кант — стекло не закрашиваем)
    b.rect(w.x - 2, w.y - 2, w.w + 4, 2, Q.wood[0]); b.hl(w.x - 2, w.y - 2, w.w + 4, Q.wood[3]);
    b.rect(w.x - 3, w.y + w.h, w.w + 6, 3, Q.wood[3]); b.hl(w.x - 3, w.y + w.h, w.w + 6, Q.wood[5]); b.hl(w.x - 3, w.y + w.h + 2, w.w + 6, Q.wood[0]);
    b.vl(w.x - 2, w.y, 2, Q.wood[1]); b.vl(w.x + w.w, w.y, 3, Q.wood[1]);
    b.vl(w.x + Math.round(w.w / 2) - 1, w.y, w.h, Q.wood[1]);
    b.hl(w.x, w.y + Math.round(w.h * 0.36), w.w, Q.wood[1]);
    b.vl(w.x + Math.round(w.w / 2) - 1, w.y, Math.round(w.h * 0.36), Q.wood[3]);
    for (let i = 0; i < 8 && i < w.h - 2; i++) { b.set(w.x + 3 + i, w.y + 8 - i, '#ffffff', 0.4); b.set(w.x + 4 + i, w.y + 8 - i, '#ffffff', 0.2); }
    // открытие: окно заклеено бумагой
    if (o.state === 'opening') { b.dith(w.x, w.y, w.w, w.h, '#e8e2d2', 0.78); for (let i = 1; i < 4; i++) b.hl(w.x, w.y + Math.round(w.h * i / 4), w.w, '#c9c0ac'); }
    // подоконник и растение
    b.rect(w.x - 4, w.y + w.h + 2, w.w + 8, 3, Q.wood[3]); b.hl(w.x - 4, w.y + w.h + 2, w.w + 8, Q.wood[5]); b.hl(w.x - 4, w.y + w.h + 4, w.w + 8, Q.wood[0]);
    const px = w.x + w.w - 7, pb = w.y + w.h - 2;
    b.rect(px, pb - 5, 5, 5, Q.crust[3]);
    b.ellipse(px + 2, pb - 7, 4, 3, Q.green[1]); b.set(px + 1, pb - 10, Q.green[2]);
  }
  // вывеска и маркиза
  function signDraw(b, L, o) {
    const label = signLabel(L, o.name);
    const sc = (!L.compact && textW(label, 2) <= L.sx1 - L.sx0 - 12) ? 2 : 1;
    const tw = textW(label, sc), pw = tw + (sc === 2 ? 16 : 12), ph = L.sign.h;
    const sx = Math.max(L.sx0, Math.round((L.sx0 + L.sx1) / 2 - pw / 2)), sy = L.sign.y;
    b.rect(sx, sy, pw, ph, Q.navy[1]); b.rect(sx + 1, sy + 1, pw - 2, ph - 2, Q.navy[0]); b.hl(sx + 1, sy + 1, pw - 2, Q.navy[2]);
    b.vl(sx + 6, sy - 3, 3, '#2a1a1c'); b.vl(sx + pw - 7, sy - 3, 3, '#2a1a1c');
    text(b, sx + Math.round((pw - tw) / 2), sy + Math.max(1, Math.round((ph - 7 * sc) / 2)), label, Q.crust[1], sc);
    // маркиза
    const ax = Math.max(0, sx - 4), aw = Math.min(L.W - ax, pw + 8), ay = L.aw.y;
    for (let x = ax; x < ax + aw; x++) { const k = Math.floor((x - ax) / 6) % 2; b.vl(x, ay, L.aw.h, k ? Q.cream[0] : Q.crust[0]); b.set(x, ay + L.aw.h, (x - ax) % 6 < 3 ? (k ? Q.cream[0] : Q.crust[0]) : null); }
    b.hl(ax, ay, aw, Q.crust[3]);
  }
  // пар: колонка полупрозрачных пикселей, колышется со временем (чуть холоднее белого — виден и на кремовой стене)
  function steamC(b, x, y, h, seed, t, a = 0.6) {
    const r = rng(seed + ((t * 3) | 0));
    for (let i = 0; i < h; i++) { const xx = x + Math.round(Math.sin(i / 3 + seed + t * 2.2) * 1.6); const k = 1 - i / h; b.set(xx, y - i, '#eaf1f6', a * k); if (r() > 0.5) b.set(xx + 1, y - i, '#cfdde6', a * 0.75 * k); }
  }
  // часы на стене: циферблат запечён, стрелки — каждый кадр по игровому часу
  function clockFace(b, c) {
    b.ellipse(c.x, c.y, c.r + 1, c.r + 1, '#3a2219'); b.ellipse(c.x, c.y, c.r, c.r, Q.cream[0]);
    b.ellipse(c.x, c.y, c.r - 1, c.r - 1, Q.cream[1], 0.55);
    for (let i = 0; i < 12; i += 3) { const a = i / 12 * Math.PI * 2; b.set(c.x + Math.round(Math.sin(a) * (c.r - 2)), c.y - Math.round(Math.cos(a) * (c.r - 2)), '#3a2219'); }
  }
  function clockHands(b, c, h) {
    const ha = ((h % 12) / 12) * Math.PI * 2, ma = (((h * 60) % 60) / 60) * Math.PI * 2;
    b.line(c.x, c.y, c.x + Math.sin(ha) * (c.r - 4), c.y - Math.cos(ha) * (c.r - 4), '#3a2219');
    b.line(c.x, c.y, c.x + Math.sin(ma) * (c.r - 2), c.y - Math.cos(ma) * (c.r - 2), '#3a2219');
    b.set(c.x, c.y, Q.crust[0]);
  }
  // полки с хлебом, коробками и банками
  function shelfDraw(b, L, state) {
    const s = L.shelf; if (s.x1 - s.x0 < 22) return;
    const pack = state === 'opening' || state === 'repair';   // до открытия и в ремонте на полках коробки, а не готовый хлеб
    [s.y1, s.y2].forEach((y, k) => {
      if (k === 1 && !s.y2) return;
      b.rect(s.x0, y, s.x1 - s.x0, 3, Q.wood[3]); b.hl(s.x0, y, s.x1 - s.x0, Q.wood[5]); b.hl(s.x0, y + 2, s.x1 - s.x0, Q.wood[1]);
      b.vl(s.x0 + 2, y + 3, 2, Q.wood[1]); b.vl(s.x1 - 4, y + 3, 2, Q.wood[1]);
      if (k === 1) b.vl(s.x0 + 2, s.y1 + 3, y - s.y1, Q.wood[1]);
    });
    const R = rng(5), cs = [Q.box[0], Q.panel[0], '#8f4a31', '#3b8796'];
    if (pack) { for (let x = s.x0 + 3; x < s.x1 - 12; x += 13) boxAt(b, x, s.y1 - 7, 10, 6); }
    else for (let x = s.x0 + 2; x < s.x1 - 10; x += 12) SC().loaf(b, x, s.y1 - 6, 9);
    if (s.y2) {
      for (let x = s.x0 + 3; x < s.x1 - 14; x += 13) { const c = cs[(R() * 4) | 0]; b.rect(x, s.y2 - 7, 10, 6, c); b.hl(x, s.y2 - 7, 10, mix(c, '#ffffff', 0.3)); b.vl(x + 9, s.y2 - 6, 5, mix(c, '#000000', 0.25)); }
      if (!pack) SC().loaf(b, s.x1 - 13, s.y2 - 6, 9);
    }
  }
  // меловая доска: название позиции и цена из меню (цены — реальные, из S.menu)
  function boardDraw(b, L, o) {
    const B = L.board, menu = (o.menu || []).slice(0, 4);
    b.rect(B.x, B.y, B.w, B.h, Q.wood[1]); b.rect(B.x + 2, B.y + 2, B.w - 4, B.h - 4, Q.board[0]);
    b.hl(B.x + 2, B.y + 2, B.w - 4, Q.board[1]);
    b.vl(B.x + 4, B.y - 6, 6, Q.wood[1]); b.vl(B.x + B.w - 5, B.y - 6, 6, Q.wood[1]);
    text(b, B.x + 4, B.y + 4, 'МЕНЮ', Q.cream[0]);
    const fit = (s) => textW(s) <= B.w - 22;
    menu.forEach((m, i) => {
      const y = B.y + 14 + i * 8; if (y + 6 > B.y + B.h - 2) return;
      let n = String(m.n || '').toUpperCase();
      if (!fit(n)) {                                   // длинное название: режем по словам, а не посреди слова
        const words = n.split(/\s+/); let out = '';
        for (const wd of words) { const s2 = out ? out + ' ' + wd : wd; if (!fit(s2)) break; out = s2; }
        if (out) n = out;
        else { let s2 = n; while (s2.length > 2 && !fit(s2 + '.')) s2 = s2.slice(0, -1); n = s2 + '.'; }
      }
      text(b, B.x + 4, y, n, '#c9d1c4');
      const pr = String(Math.round(m.p || 0));
      text(b, B.x + B.w - 5 - textW(pr, 1, true), y + 1, pr, Q.crust[2], 1, { small: true });
    });
  }

  /* ---------------- слой 2: прилавок и всё на нём ---------------- */
  function counterDraw(b, L, state) {
    const CY = L.cY, CX = L.c0, CW = L.c1 - L.c0, ph = Math.max(2, L.cB - CY - 12);
    b.rect(CX - 2, CY, CW + 4, 5, Q.wood[4]); b.hl(CX - 2, CY, CW + 4, Q.wood[5]); b.hl(CX - 2, CY + 4, CW + 4, Q.wood[0]);
    b.rect(CX, CY + 5, CW, Math.max(1, L.cB - CY - 5), Q.wood[1]);
    for (let x = CX + 3; x < CX + CW - 10; x += 26) { b.rect(x, CY + 9, 22, ph, Q.wood[2]); b.hl(x, CY + 9, 22, Q.wood[0]); b.vl(x, CY + 9, ph, Q.wood[0]); b.hl(x + 1, CY + 8 + ph, 21, Q.wood[3]); b.vl(x + 21, CY + 10, ph - 1, Q.wood[3]); }
    b.rect(CX, L.cB, CW, 2, Q.wood[0]);
    b.dith(CX, L.cB + 2, CW, Math.min(4, L.H - L.cB - 2), '#5a3a22', (x, y) => 0.5 - (y - L.cB - 2) * 0.12);
    // табличка на перёд прилавка: закрыто / ремонт / скоро
    const tag = state === 'closed' ? 'ЗАКРЫТО' : state === 'repair' ? 'РЕМОНТ' : state === 'opening' ? 'СКОРО' : null;
    if (tag) {
      const tw = textW(tag), w = tw + 8, x = Math.round(CX + CW / 2 - w / 2), y = CY + 7;
      b.rect(x, y, w, 10, Q.cream[0]); b.hl(x, y, w, Q.crust[0]); b.hl(x, y + 9, w, Q.cream[2]);
      text(b, x + 4, y + 2, tag, Q.crust[3]);
    }
  }
  function caseDraw(b, L, fill, state) {
    const V = L.vit, vy = L.cY - 20, vh = 20;
    if (state === 'opening' || state === 'repair') {
      // ремонт/открытие: витрина под плёнкой, ящики на прилавке
      b.rect(V.x, vy + 2, V.w, vh - 2, Q.wood[2]); b.hl(V.x, vy + 2, V.w, Q.wood[3]);
      for (let x = V.x + 2; x < V.x + V.w - 2; x++) { const y = vy + 4 + Math.round((x - V.x) * 0.35); if (y < L.cY - 2) b.set(x, y, (x >> 2) % 2 ? Q.crust[2] : '#2a1a1c'); }
      return;
    }
    b.rect(V.x - 2, vy - 2, V.w + 4, vh + 2, Q.wood[1]);
    b.rect(V.x, vy, V.w, vh, Q.glass[0], 0.5); b.hl(V.x, vy, V.w, Q.glass[1]); b.vl(V.x, vy, vh, Q.glass[1]); b.vl(V.x + V.w - 1, vy, vh, Q.glass[2]);
    b.hl(V.x, vy + 10, V.w, Q.glass[2]);
    const n = Math.max(1, Math.floor((V.w - 3) / 9));
    const top = ['croissant', 'bun', 'croissant', 'echpochmak', 'bun', 'croissant', 'bun'], bot = ['echpochmak', 'chakchak', 'loaf', 'echpochmak', 'chakchak', 'bun', 'croissant'];
    for (let i = 0; i < n; i++) {
      if ((i * 7 + 3) % 10 < fill * 10) icon(b, V.x + 2 + i * 9, vy + 1, top[i % top.length], false);
      if ((i * 3 + 5) % 10 < fill * 10 - 1) icon(b, V.x + 2 + i * 9, vy + 11, bot[i % bot.length], false);
    }
    for (let i = 0; i < 10 && i < V.w; i++) b.set(V.x + 4 + i, vy + 15 - i, '#ffffff', 0.5);
    b.rect(V.x - 2, L.cY - 1, V.w + 4, 1, Q.wood[0]);
  }
  function machineDraw(b, L, state) {
    const M = L.mach, my = L.cY - 20;
    b.rect(M.x, my, M.w, 20, Q.steel[1]); b.rect(M.x, my, M.w, 4, Q.copper[0]); b.hl(M.x, my, M.w, Q.copper[2]);
    b.vl(M.x, my, 20, Q.steel[2]); b.vl(M.x + M.w - 1, my, 20, Q.steel[0]);
    b.rect(M.x + 3, my + 6, M.w - 6, 5, Q.steel[4]);
    b.set(M.x + 6, my + 8, state === 'closed' ? '#5a6a72' : '#e2553f'); b.set(M.x + 9, my + 8, state === 'closed' ? '#5a6a72' : '#52b67f');
    b.rect(M.x + 5, my + 12, 3, 5, Q.steel[0]); b.rect(M.x + M.w - 9, my + 12, 3, 5, Q.steel[0]);   // рожки
    b.vl(M.x + M.w - 4, my + 12, 6, Q.steel[4]);                                                   // капучинатор
    b.rect(M.x + 4, my + 17, 7, 3, Q.cream[0]); b.rect(M.x + M.w - 11, my + 17, 7, 3, Q.cream[0]); // чашки
    if (M.w >= 26) { b.rect(M.x + 3, my - 5, M.w - 6, 5, Q.steel[3]); b.hl(M.x + 3, my - 5, M.w - 6, Q.cream[0]); }
    // кофемолка и стаканчики — если на прилавке есть место
    const gx = L.hero + 22;
    if (gx + 14 < M.x - 6) {
      b.rect(gx, L.cY - 11, 10, 11, Q.steel[0]); b.hl(gx, L.cY - 11, 10, Q.steel[2]);
      b.rect(gx + 1, L.cY - 16, 8, 5, Q.glass[0], 0.7); b.hl(gx + 1, L.cY - 16, 8, Q.glass[1]);
      b.rect(gx + 3, L.cY - 14, 4, 3, '#6a4028');
      const cx2 = M.x - 22;
      if (cx2 > gx + 16) { b.rect(cx2, L.cY - 8, 7, 8, Q.cream[0]); b.rect(cx2 - 3, L.cY - 5, 7, 5, Q.cream[1]); b.hl(cx2 - 3, L.cY - 5, 7, Q.cream[0]); }
    }
    // касса
    if (state !== 'opening') {
      const rx = L.till.x, rw = L.till.w;
      b.rect(rx, L.cY - 12, rw, 12, Q.steel[0]); b.hl(rx, L.cY - 12, rw, Q.steel[2]); b.vl(rx, L.cY - 12, 12, Q.steel[1]); b.vl(rx + rw - 1, L.cY - 12, 12, Q.steel[4]);
      b.rect(rx + 2, L.cY - 18, rw - 4, 6, '#2a1a1c'); b.rect(rx + 3, L.cY - 17, rw - 6, 4, state === 'closed' ? '#5a6a72' : '#9fe0b5');
      b.rect(rx + 1, L.cY - 6, rw - 2, 5, Q.steel[4]); for (let i = 0; i < 3; i++) b.rect(rx + 3 + i * 6, L.cY - 5, 4, 2, Q.steel[2]);
    } else {
      // открытие: коробки и стремянка
      boxAt(b, L.till.x - 2, L.cY - 9, 15, 9); boxAt(b, L.till.x + 9, L.cY - 15, 12, 7);
    }
  }
  function boxAt(b, x, y, w, h) { b.rect(x, y, w, h, Q.box[0]); b.hl(x, y, w, Q.box[1]); b.vl(x + w - 1, y, h, Q.box[2]); b.hl(x + 2, y + Math.round(h / 2), w - 4, Q.box[2]); }
  function ladderAt(b, x, top, bot) { b.line(x, bot, x + 4, top, Q.steel[1]); b.line(x + 7, bot, x + 4, top, Q.steel[1]); for (let y = top + 3; y < bot - 1; y += 4) b.hl(x + Math.max(1, Math.round((y - top) * 0.35)), y, 5, Q.steel[2]); }

  function front(L, light, o) {
    const b = new Buf(L.W, L.H), P = LIGHT[light], state = o.state || 'open';
    caseDraw(b, L, o.fill, state);
    machineDraw(b, L, state);
    counterDraw(b, L, state);
    if (state === 'repair') { ladderAt(b, L.table ? L.table.x - 20 : L.W - 40, L.cB - 34, L.H - 2); b.rect(L.W - 14, L.H - 9, 8, 8, '#3b8796'); b.hl(L.W - 14, L.H - 9, 8, '#6cc0cf'); }
    else if (state === 'opening') ladderAt(b, L.W - 26, L.cB - 32, L.H - 2);
    Px.relight(b, P.amb, lampsOf(L, light, P), { k: P.k, steps: 5, max: 1.15 });
    return b;
  }
  function lampsOf(L, light, P) {
    const Ls = [];
    (L.lamps || []).forEach((x) => Ls.push({ c: '#ffd9a0', i: P.lamps, f: Px.point(x, 11, L.W * 0.24, 1.7, L.H * 0.55) }));
    if (P.sun > 0) Ls.push({ c: '#fff1c4', i: P.sun, f: Px.point(L.win.x + L.win.w / 2, L.win.y + L.win.h / 2, L.win.w * 1.6, 1.2, L.win.h * 1.7) });
    return Ls;
  }

  /* ---------------- герой: варианты по полу и возрасту ---------------- */
  // Пола героя в состоянии игры нет (игра его не спрашивает), поэтому вариант выбирается стабильно в интерфейсе
  // (view(S) → heroLook): за игру он не «переключается», а за полтора года за стойкой герой седеет.
  const HERO_V = {
    young: { hair: 'hero', hairStyle: 'messy', apron: ['#c46f17', '#94500b'] },
    youngF: { hair: 'auburn', hairStyle: 'bob', apron: ['#3b8796', '#235f6b'] },
    old: { hair: 'heroOld', hairStyle: 'neat', apron: ['#c46f17', '#94500b'], glasses: '#6a5050' },
    oldF: { hair: 'grey', hairStyle: 'bun', apron: ['#3b8796', '#235f6b'], glasses: '#6a5050' },
  };
  function heroCast(look) {
    const k = 'cofH_' + (HERO_V[look] ? look : 'young');
    if (!Px.CAST[k]) {
      const v = HERO_V[look] || HERO_V.young, base = Px.CAST.hero;
      Px.CAST[k] = Object.assign({}, base, { hair: Px.HAIR[v.hair] || base.hair, hairStyle: v.hairStyle, apron: v.apron, glasses: v.glasses, __k: k });
    }
    return k;
  }

  /* ---------------- зал: гости, столик, пузыри, монетка ---------------- */
  function hall(b, t, W, H, L, o, light, fg) {
    const state = o.state || 'open';
    const n = state === 'open' ? Math.max(0, Math.min(3, o.guests | 0)) : 0;
    const baseY = H - 29, x0 = L.c0 - 8, step = Math.max(13, Math.min(17, Math.round(W * 0.045)));
    const qn = (L.table && n >= 2) ? n - 1 : n;
    const seed = o.seed || 3;
    const put = (f, x, y, sh) => { if (sh) b.ellipse(x + 8, y + 27, 6, 1.4, '#3a2219', 0.3); b.blit(f, x, y); };
    // гость подходит к прилавку справа и уходит — раз в период
    const period = 7 + n * 0.6, ph = n ? (t % period) / period : 0;
    if (n > 0 && (ph < 0.3 || ph > 0.9)) {
      const k = ph < 0.3 ? ph / 0.3 : 1 - (ph - 0.9) / 0.1;
      const g = Px.GUESTS[(seed * 3 + 1) % Px.GUESTS.length];
      const stepN = (((t * 8) | 0) % 2) ? 1 : 2;
      put(fg(g, { emo: 'smile', step: stepN }), Math.round(W + 4 - k * (W + 4 - x0)), baseY, true);
    }
    // очередь
    for (let i = qn - 1; i >= 0; i--) {
      const g = Px.GUESTS[(seed * 7 + i * 3) % Px.GUESTS.length];
      const emo = i === 0 ? 'smile' : ((seed + i) % 4 === 0 ? 'happy' : 'neutral');
      put(fg(g, { emo, step: 0 }), x0 - i * step, baseY - Math.min(i, 2), false);
    }
    // столик у окна
    if (L.table) {
      const tx = L.table.x, ty = L.table.y;
      if (n >= 2) put(fg(Px.GUESTS[(seed * 5 + 6) % Px.GUESTS.length], { emo: 'happy', upper: true }), tx - 5, H - 32, false);
      b.ellipse(tx, ty, 13, 4, Q.wood[3]); b.ellipse(tx, ty - 1, 12, 3, Q.wood[5]);
      b.rect(tx - 1, ty + 2, 3, Math.max(1, H - ty - 3), Q.wood[1]);
      b.ellipse(tx - 6, ty - 3, 3, 2, Q.cream[0]); b.ellipse(tx - 6, ty - 5, 2, 1.5, Q.crust[1]);
    }
    // пузыри мыслей над гостями (те же фразы, что в списке «Мысли гостей», но значками)
    (o.thoughts || []).slice(0, 2).forEach((m, k) => {
      if (!m || !m.ic || !m.ic.length || k >= Math.max(1, qn)) return;
      const w = bubbleW(m.ic.length), gx = x0 - (k ? step : 0);
      bubble(b, Math.max(1, Math.min(W - w - 1, gx + 8 - Math.round(w / 2))), baseY - 16 - k * 2, m.ic, m.tone || 'norm');
    });
    // монетка в кассу — по выручке дня
    if (state === 'open' && n > 0 && (o.revenue | 0) > 0) {
      const cp = (t % 2.8) / 2.8;
      if (cp < 0.42) {
        const k = cp / 0.42, ex = L.till.x + Math.round(L.till.w / 2), ey = L.cY - 22;
        const sx = x0 + 6, sy = baseY + 4;
        icon(b, Math.round(sx + (ex - sx) * k), Math.round(sy + (ey - sy) * k - Math.sin(k * Math.PI) * 12), 'coin', false);
        if (k > 0.88) { b.set(ex, ey + 4, '#f2e08a'); b.set(ex + 1, ey + 4, '#ffe38a'); }
      }
    }
  }

  /* ---------------- сцена ---------------- */
  function coffee(b, t, W, H, o) {
    o = o || {};
    const state = ['open', 'opening', 'repair', 'closed'].indexOf(o.state) >= 0 ? o.state : 'open';
    const hour = o.hour == null ? 12 : o.hour;
    const light = phaseOf(hour, state);
    const L = Px.memo('cfL|' + W + '|' + H, () => layout(W, H));
    const name = String(o.name || 'КОФЕЙНЯ');
    const mk = (o.menu || []).map((m) => Math.round(m.p || 0)).join(',');
    const fill = Math.max(0, Math.min(1, Math.round((o.fill == null ? 1 : o.fill) * 4) / 4));
    b.copyFrom(Px.memo('cfB|' + W + '|' + H + '|' + light + '|' + state + '|' + (o.dvor || '-') + '|' + name + '|' + mk, () => back(L, light, { name, state, dvor: o.dvor, menu: o.menu })));
    if (L.clock) clockHands(b, L.clock, hour);
    const tintK = LIGHT[light].tint;
    const fg = (who, opt) => { const f = Px.fig(who, opt); if (!f.__id) f.__id = Math.random().toString(36).slice(2); return tintK ? Px.memo('cfT|' + f.__id + '|' + light, () => f.clone().tint(LIGHT[light].amb, tintK)) : f; };
    // вы за стойкой (за прилавком — прилавок рисуется поверх)
    if (o.hero !== false) {
      const look = HERO_V[o.heroLook] ? o.heroLook : 'young', emo = o.heroEmo || 'smile';
      const blink = ((t + 0.7) % 4.3) < 0.14;
      const pose = (state === 'open' && (o.guests | 0) > 0) ? 'tray' : null;
      const hx = L.hero, hy = L.cY - 27;
      b.blit(fg(heroCast(look), { emo: blink && emo !== 'happy' ? 'closed' : emo, pose, drop: !!o.heroDrop }), hx, hy);
      if (pose === 'tray') { b.rect(hx + 3, hy + 18, 11, 1, Q.wood[3]); icon(b, hx + 2, hy + 11, 'cup', false); }
    }
    // прилавок, витрина, кофемашина, касса
    b.blit(Px.memo('cfF|' + W + '|' + H + '|' + light + '|' + state + '|' + fill, () => front(L, light, { state, fill })), 0, 0);
    // пар: кофемашина и чашка в руке
    if (state === 'open') {
      L.steamAt.forEach(([x, y], i) => steamC(b, x, y, 11, 9 + i * 3, t, light === 'night' ? 0.5 : 0.68));
      if (o.hero !== false && (o.guests | 0) > 0) steamC(b, L.hero + 6, L.cY - 8, 6, 5, t + 1.3, 0.55);
    }
    hall(b, t, W, H, L, o, light, fg);
    return b;
  }

  Object.assign(Px.scenes, { coffee, coffeeLayout: (W, H) => Px.memo('cfL|' + W + '|' + H, () => layout(W, H)), HERO_V });
})();
