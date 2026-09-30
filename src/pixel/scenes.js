/* =====================================================================
   ПИКСЕЛЬНЫЕ СЦЕНЫ (BK.Px.scenes) — только картинка, без игровой логики.
   kalach(b, t, W, H, o) — пекарня-кофейня «Калач» на Пушкина (как docs/mockups/pixel/1-shift.png): окно на улицу,
     дверь «ЦЕХ» с Гулей, вывеска, полки с хлебом, меловое меню, печь с живым огнём и Рашидом, прилавок, витрина,
     кофемашина с паром, герой за стойкой. o.mode: 'month' (экран месяца), 'shift' (мини-игра: очередь гостей с
     пузырями заказов и шкалой терпения), 'life' (финал «Жизнь в найме»: вечер, пустой зал, постаревший герой).
   own(b, t, W, H, o) — финал «Своя точка»: утро, своя вывеска, ленточка, герой машет, Гуля рядом.
   Слои кэшируются (Px.memo): «за прилавком» и «прилавок», свет уже запечён; каждый кадр — копия слоёв + огонь,
   пар, люди, пузыри.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px, { Buf, mix, bay, rng, text, textW, icon, bubble, bubbleW, patience } = Px;
  const P = {
    ol: '#2a1a1c', beam: ['#4a2e22', '#3a2219', '#6a4430'], wall: ['#f1dcb4', '#e6c998', '#d4b07c', '#f8e9c9'],
    brick: ['#b0603f', '#8f4a31', '#c97a55'], wood: ['#5a3522', '#7a4a2c', '#9c6338', '#c0844a', '#d9a566', '#ecc38a'],
    floor: ['#b98450', '#a8743f', '#c99560', '#94653a', '#d8a870'], navy: ['#1f2a44', '#16203a', '#2e3d60'],
    crust: ['#c46f17', '#e59a3e', '#f4c27a', '#94500b'], green: ['#3f6b3a', '#5d8c46', '#8cb35a', '#2d4e2a'],
    sky: ['#bfe3ef', '#a4d3e6', '#dff1f4'], facade: ['#ecd29a', '#d6b574', '#f6e4b8'], grey: ['#6b6a73', '#8f8d94', '#b5b2b2', '#d8d4cc', '#4a4a55'],
    red: ['#c0412d', '#8f2c20', '#e2705a'], cream: ['#fbf6ec', '#efe4d0', '#d9ccb5'], fire: ['#ffe9a8', '#ffc45a', '#ff9a2e', '#e2601c'],
  };
  const loaf = (b, x, y, w = 9) => { b.ellipse(x + w / 2, y + 3, w / 2, 3.2, P.crust[0]); b.ellipse(x + w / 2 - 1, y + 2, w / 2 - 2, 1.6, P.crust[1]); b.set(x + 2, y + 1, P.crust[2]); b.line(x + 3, y + 3, x + 4, y + 2, P.crust[3]); b.line(x + 6, y + 3, x + 7, y + 2, P.crust[3]); };
  const baguette = (b, x, y, h = 14) => { b.rect(x, y, 3, h, P.crust[0]); b.vl(x, y, h, P.crust[1]); for (let i = 3; i < h - 1; i += 4) b.set(x + 2, y + i, P.crust[3]); };
  function bricks(b, x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y += 4) for (let x = x0 - ((y / 4) % 2) * 4; x < x0 + w; x += 8) {
      const bx = Math.max(x, x0), bw = Math.min(x + 7, x0 + w) - bx; if (bw <= 0) continue;
      b.rect(bx, y, bw, Math.min(3, y0 + h - y), P.brick[0]); b.hl(bx, y, bw, P.brick[2]); b.set(bx + bw - 1, y + 2, P.brick[1]);
    }
  }
  // пар: колонка полупрозрачных пикселей, колышется со временем
  function steam(b, x, y, h, seed, t, a = 0.55) {
    const r = rng(seed + ((t * 3) | 0));
    for (let i = 0; i < h; i++) { const xx = x + Math.round(Math.sin(i / 3 + seed + t * 2.2) * 1.6); const k = 1 - i / h; b.set(xx, y - i, '#ffffff', a * k); if (r() > 0.5) b.set(xx + 1, y - i, '#ffffff', a * 0.6 * k); }
  }
  function floorPlanks(b, W, y0, H) {
    for (let y = y0; y < H; y++) {
      const row = Math.floor((y - y0) / 7), c = [P.floor[0], P.floor[1], P.floor[2]][row % 3];
      b.hl(0, y, W, c); if ((y - y0) % 7 === 0) b.hl(0, y, W, P.floor[3]); if ((y - y0) % 7 === 1) b.hl(0, y, W, P.floor[4], 0.35);
    }
    const Rf = rng(3);
    for (let row = 0; row < Math.ceil((H - y0) / 7); row++) { const y = y0 + row * 7; for (let x = (row * 37) % 60; x < W; x += 50 + Rf() * 40 | 0) b.vl(x, y + 1, 6, P.floor[3]); for (let i = 0; i < W / 80; i++) b.hl(Rf() * W | 0, y + 3 + (Rf() * 3 | 0), 4, P.floor[3], 0.4); }
    b.dith(0, y0, W, 4, P.floor[3], (x, y) => 0.6 - (y - y0) * 0.14);
  }
  function rug(b, x, y, w, h) {
    b.rect(x, y, w, h, '#8f2c20'); b.rect(x + 2, y + 2, w - 4, h - 4, '#b0402c'); b.rect(x + 4, y + 4, w - 8, h - 8, '#8f2c20');
    for (let i = x + 4; i < x + w - 4; i += 6) { b.set(i, y + 3, '#e3b341'); b.set(i + 3, y + h - 4, '#e3b341'); }
    const n = Math.max(1, Math.floor(w / 40));
    for (let k = 0; k < n; k++) { const cx = Math.round(x + (k + 0.5) * w / n), cy = Math.round(y + h / 2), r = Math.min(6, Math.floor(h / 2) - 3); for (let d = 0; d <= r; d++) { const e = Math.round((r - d) * 0.5); b.set(cx - d, cy - e, '#e3b341'); b.set(cx + d, cy - e, '#e3b341'); b.set(cx - d, cy + e, '#e3b341'); b.set(cx + d, cy + e, '#e3b341'); } b.rect(cx - 1, cy - 1, 3, 3, '#3f7d5a'); }
    for (let i = x; i < x + w; i += 3) { b.vl(i, y - 2, 2, '#f1dcb4'); b.vl(i, y + h, 2, '#f1dcb4'); }
  }

  /* ---------------- «Калач»: раскладка по ширине ---------------- */
  function kLayout(W, H, mode) {
    const L = { W, H, mode };
    L.wall = mode === 'shift' ? Math.round(H * (H < 110 ? 0.5 : 0.47)) : Math.round(H * 0.58);
    L.cy = L.wall + 4;                              // верх прилавка
    L.cf = L.cy + 6;                                // перёд прилавка
    L.cb = Math.min(H - 6, L.cf + (mode === 'shift' ? 18 : 20)); // низ прилавка
    L.ow = W < 210 ? 48 : 58; L.ox = W - L.ow - 2; // печь справа
    L.win = W >= 250 ? { x: 6, y: 12, w: Math.min(76, Math.round(W * 0.2)), h: L.wall - 26 } : null;
    L.dx = L.win ? L.win.x + L.win.w + 10 : 6; L.dw = 24;  // дверь в цех
    L.menu = W >= 330 ? { x: L.ox - 44, y: Math.round(L.wall * 0.3) } : null;
    const s0 = L.dx + L.dw + 6, s1 = (L.menu ? L.menu.x : L.ox) - 6;   // полоса вывески и полок
    L.s0 = s0; L.s1 = s1;
    L.sign2 = s1 - s0 >= 80 && L.wall >= 50;
    L.c0 = Math.max(2, L.dx - 4); L.c1 = L.ox - 3; // прилавок
    const cw = L.c1 - L.c0;
    L.vit = { x: L.c0 + Math.round(cw * (W < 210 ? 0.2 : 0.26)), w: Math.max(34, Math.round(cw * 0.3)) };
    L.hero = L.vit.x + L.vit.w + 1;
    L.mach = { x: Math.min(L.c1 - 30, L.hero + 18), w: 28 };
    return L;
  }
  function jobSprite(job, old) {
    const base = BK.Px.CAST[old ? 'heroOld' : 'hero'];
    if (!job) return old ? 'heroOld' : 'hero';
    const ap = [null, ['#3b8796', '#235f6b'], ['#6b4a2e', '#4a3220']][job];
    const k = (old ? 'heroOld' : 'hero') + 'J' + job;
    if (!BK.Px.CAST[k]) BK.Px.CAST[k] = Object.assign({}, base, { apron: ap, __k: k });
    return k;
  }

  // слой 1: всё, что за прилавком (стена, окно, дверь, вывеска, полки, печь, пол сзади)
  function kBack(L, light) {
    const { W, H } = L, b = new Buf(W, H), wall = L.wall;
    b.rect(0, 0, W, wall, P.wall[0]);
    const R = rng(7);
    for (let i = 0; i < W * wall / 18; i++) { const x = R() * W | 0, y = 6 + R() * (wall - 18) | 0; b.set(x, y, R() > 0.5 ? P.wall[1] : P.wall[3]); }
    if (L.win) bricks(b, L.dx + 2, 8, 22, 12); if (W > 300) bricks(b, L.ox - 30, wall - 20, 18, 10);
    // балка и лампы
    b.rect(0, 0, W, 5, P.beam[0]); b.hl(0, 4, W, P.beam[1]); b.hl(0, 0, W, P.beam[2]);
    for (let x = 20; x < W; x += 80) { b.rect(x, 0, 5, 7, P.beam[1]); b.hl(x, 0, 5, P.beam[2]); }
    L.lamps = [Math.round(L.s0 + (L.s1 - L.s0) * 0.25), Math.round(L.s0 + (L.s1 - L.s0) * 0.78)];
    // панели низа стены
    const py = wall - 14;
    b.rect(0, py, W, 14, P.wood[2]); b.hl(0, py, W, P.wood[4]); b.hl(0, py + 1, W, P.wood[3]); b.hl(0, wall - 1, W, P.wood[0]);
    for (let x = 4; x < W; x += 22) { b.rect(x, py + 3, 18, 8, P.wood[1]); b.hl(x, py + 3, 18, P.wood[0]); b.vl(x + 17, py + 3, 8, P.wood[3]); }
    // окно на Пушкина
    if (L.win) {
      const { x: WX, y: WY, w: WW, h: WH } = L.win;
      for (let y = WY; y < WY + WH; y++) b.hl(WX, y, WW, bay(0, y) < (y - WY) / 20 ? P.sky[0] : P.sky[2]);
      b.rect(WX, WY + 7, WW, WH - 7, P.facade[0]); b.rect(WX, WY + 5, WW, 2, '#b86a4a');
      for (let i = 0; i * 14 + 3 < WW - 6; i++) { const x = WX + 3 + i * 14; b.rect(x, WY + 10, 7, 9, '#6f8fa6'); b.rect(x + 1, WY + 11, 5, 7, '#8fb3c8'); b.rect(x + 1, WY + 11, 2, 3, '#c9e2ec'); }
      const sy = WY + Math.max(22, WH - 20);
      b.ellipse(WX + WW - 10, WY + 16, 10, 12, P.green[1]); b.ellipse(WX + WW - 13, WY + 13, 6, 6, P.green[2]); b.rect(WX + WW - 11, WY + 26, 2, sy - WY - 26, P.wood[1]);
      b.rect(WX + 2, sy - 11, Math.min(WW - 4, 44), 9, '#f5efe3'); b.rect(WX + 3, sy - 10, Math.min(WW - 6, 42), 7, '#1f4f8a');
      if (WW >= 48) text(b, WX + 4, sy - 10, 'ПУШКИНА', '#ffffff');
      b.rect(WX, sy, WW, WY + WH - sy, P.grey[0]); b.hl(WX, sy, WW, P.grey[2]);
      const tx = WX + 8; b.rect(tx, sy - 4, Math.min(56, WW - 10), 9, P.red[0]); b.hl(tx, sy - 4, Math.min(56, WW - 10), P.red[2]); b.hl(tx, sy + 3, Math.min(56, WW - 10), P.red[1]);
      for (let i = 0; i * 9 + 3 < Math.min(56, WW - 10) - 4; i++) b.rect(tx + 3 + i * 9, sy - 2, 6, 3, '#cfe8f0');
      // рама
      b.rect(WX - 3, WY - 3, WW + 6, 3, P.wood[1]); b.hl(WX - 3, WY - 3, WW + 6, P.wood[3]);
      b.rect(WX - 3, WY + WH, WW + 6, 4, P.wood[3]); b.hl(WX - 4, WY + WH, WW + 8, P.wood[5]); b.hl(WX - 4, WY + WH + 3, WW + 8, P.wood[0]);
      b.rect(WX - 3, WY, 3, WH, P.wood[1]); b.rect(WX + WW, WY, 3, WH, P.wood[1]);
      b.rect(WX + (WW >> 1) - 1, WY, 2, WH, P.wood[1]); b.rect(WX, WY + Math.round(WH * 0.36), WW, 2, P.wood[1]);
      for (let i = 0; i < 10; i++) { b.set(WX + 4 + i, WY + 12 - i, '#ffffff', 0.45); b.set(WX + 7 + i, WY + 12 - i, '#ffffff', 0.25); }
      b.rect(WX + 4, WY + WH - 5, 7, 5, '#b0603f'); b.ellipse(WX + 7, WY + WH - 8, 5, 4, P.green[1]); b.set(WX + 6, WY + WH - 10, '#e2705a');
    }
    // дверь в цех: тёплый свет изнутри
    const DX = L.dx, DW = L.dw, dt = Math.max(16, wall - 44);
    b.rect(DX, dt, DW, wall - dt, P.wood[0]); b.rect(DX + 2, dt + 2, DW - 4, wall - dt - 2, '#5a3a28');
    b.glow(DX + DW / 2, dt + 24, 16, '#ffb04a', 0.35, { ry: 26 });
    b.rect(DX, dt, DW, 2, P.wood[3]); b.vl(DX, dt, wall - dt, P.wood[2]); b.vl(DX + DW - 1, dt, wall - dt, P.wood[1]);
    if (dt - 9 >= 7) text(b, DX + 3, dt - 9, 'ЦЕХ', P.wood[0]); else text(b, DX + 4, dt + 3, 'ЦЕХ', '#f4c27a');
    // вывеска
    const s0 = L.s0, s1 = L.s1, sc = L.sign2 ? 2 : 1, tw = textW('КАЛАЧ', sc), pw = tw + (sc === 2 ? 14 : 10), ph = sc === 2 ? 20 : 13;
    const sx = Math.round((s0 + s1) / 2 - pw / 2), sy = 8;
    b.rect(sx, sy, pw, ph, P.navy[1]); b.rect(sx + 1, sy + 1, pw - 2, ph - 2, P.navy[0]); b.hl(sx + 1, sy + 1, pw - 2, P.navy[2]);
    b.vl(sx + 8, 5, 3, P.ol); b.vl(sx + pw - 9, 5, 3, P.ol);
    const txx = sx + Math.round((pw - tw) / 2), tyy = sy + (sc === 2 ? 3 : 3);
    text(b, txx + 1, tyy + 1, 'КАЛАЧ', P.crust[3], sc); text(b, txx, tyy, 'КАЛАЧ', P.crust[1], sc);
    if (pw + 30 < s1 - s0) text(b, sx + pw + 3, sy + ph - 5, '1994', P.wood[1], 1, { small: true });
    L.sign = { x: sx, y: sy, w: pw, h: ph };
    // полки с хлебом
    const sh1 = sy + ph + 8, sh2 = Math.min(wall - 18, sh1 + 13);
    [sh1, sh2].forEach((y, k) => {
      if (k === 1 && sh2 - sh1 < 10) return;
      b.rect(s0, y, s1 - s0, 3, P.wood[3]); b.hl(s0, y, s1 - s0, P.wood[5]); b.hl(s0, y + 2, s1 - s0, P.wood[1]);
      b.rect(s0 + 3, y + 3, 2, 2, P.wood[1]); b.rect(s1 - 5, y + 3, 2, 2, P.wood[1]);
    });
    for (let x = s0 + 2; x < s1 - 10; x += 12) loaf(b, x, sh1 - 6);
    if (sh2 - sh1 >= 10) {
      // корзина с багетами и банки (сахар — синяя, соль — белая)
      b.rect(s0 + 3, sh2 - 7, 16, 7, P.wood[2]); for (let i = 0; i < 4; i++) baguette(b, s0 + 4 + i * 4, sh2 - 15 - (i % 2) * 2, 10); b.rect(s0 + 2, sh2 - 5, 18, 5, P.wood[3]);
      for (let x = s0 + 24; x < s1 - 22; x += 13) loaf(b, x, sh2 - 6, 10);
      b.rect(s1 - 20, sh2 - 9, 7, 9, '#3a73b8'); b.rect(s1 - 19, sh2 - 10, 5, 1, '#1f4f8a'); b.vl(s1 - 19, sh2 - 8, 7, '#6fa0d8');
      b.rect(s1 - 11, sh2 - 9, 7, 9, '#f5efe3'); b.rect(s1 - 10, sh2 - 10, 5, 1, '#b5b2b2'); b.vl(s1 - 5, sh2 - 8, 8, '#d8d4cc');
    }
    // меловая доска
    if (L.menu) {
      const mx = L.menu.x, my = L.menu.y, mh = Math.min(40, wall - my - 16);
      b.rect(mx, my, 38, mh, P.wood[1]); b.rect(mx + 2, my + 2, 34, mh - 4, '#2e3a30');
      text(b, mx + 4, my + 4, 'МЕНЮ', '#f5efe3');
      for (let i = 0; i < 4 && 14 + i * 6 < mh - 6; i++) { const y = my + 14 + i * 6; b.hl(mx + 4, y + 1, 9 + (i * 5) % 8, '#c9d1c4'); text(b, mx + 23, y - 1, ['150', '170', '85', '95'][i], '#f4c27a', 1, { small: true }); }
    }
    // печь
    const OX = L.ox, OW = L.ow, ot = Math.max(6, wall - 62);
    b.rect(OX + 10, ot - 6, OW - 20, 8, P.grey[0]); b.hl(OX + 10, ot - 6, OW - 20, P.grey[1]);
    b.rect(OX, ot, OW, wall - ot, P.brick[1]); bricks(b, OX + 1, ot + 1, OW - 2, wall - ot - 2);
    const mcx = OX + OW / 2, mw = Math.round(OW * 0.36), mt = ot + Math.round((wall - ot) * 0.36), mb = wall - 6;
    b.rect(mcx - mw - 5, mt - 2, (mw + 5) * 2, mb - mt + 4, P.cream[1]); b.ellipse(mcx, mt - 1, mw + 5, 9, P.cream[1]); b.hl(mcx - mw - 5, mb + 1, (mw + 5) * 2, P.cream[2]);
    b.rect(mcx - mw, mt + 2, mw * 2, mb - mt - 2, '#3a1a10'); b.ellipse(mcx, mt + 3, mw, 6, '#3a1a10');
    b.rect(mcx - mw - 2, mb, mw * 2 + 4, 2, P.grey[4]); b.hl(mcx - mw - 2, mb, mw * 2 + 4, P.grey[1]);
    b.ellipse(mcx, mt - 6, mw + 2, 4, '#6a5a50', 0.25);
    L.mouth = { cx: mcx, top: mt + 2, bot: mb, w: mw };
    // пол за прилавком
    floorPlanks(b, W, wall, H);
    // свет из окна и ламп — запекаем
    kLight(b, L, light, 'back');
    return b;
  }
  // слой 2: прилавок и всё на нём (прозрачный фон)
  function kFront(L, light, shelfFill) {
    const { W, H } = L, b = new Buf(W, H), CX = L.c0, CW = L.c1 - L.c0, CY = L.cy;
    // касса
    const rx = CX + 4; b.rect(rx, CY - 12, 22, 12, P.grey[0]); b.hl(rx, CY - 12, 22, P.grey[1]); b.rect(rx + 3, CY - 16, 16, 5, P.ol); b.rect(rx + 4, CY - 15, 14, 3, '#9fe0b5');
    b.rect(rx + 1, CY - 6, 20, 5, P.grey[4]); for (let i = 0; i < 3; i++) b.rect(rx + 3 + i * 6, CY - 5, 4, 2, P.grey[2]);
    // банка для чаевых
    const jx = rx + 25; b.rect(jx, CY - 10, 8, 10, '#cfe8f0'); b.vl(jx, CY - 10, 10, '#ffffff'); b.rect(jx + 1, CY - 5, 6, 5, '#f2c14e'); b.hl(jx - 1, CY - 11, 10, P.wood[1]);
    // витрина: полнота 0..1
    const V = L.vit, vy = CY - 21, vh = 21;
    b.rect(V.x, vy, V.w, vh, '#cfe8f0', 0.45); b.hl(V.x, vy, V.w, '#ffffff'); b.vl(V.x, vy, vh, '#ffffff'); b.vl(V.x + V.w - 1, vy, vh, '#a8c8d0'); b.hl(V.x, vy + 10, V.w, '#a8c8d0');
    const n = Math.floor((V.w - 3) / 9), f = shelfFill == null ? 1 : shelfFill;
    const top = ['croissant', 'croissant', 'bun', 'croissant', 'bun', 'bun', 'croissant', 'bun', 'croissant'], bot = ['echpochmak', 'chakchak', 'echpochmak', 'echpochmak', 'chakchak', 'echpochmak', 'echpochmak'];
    for (let i = 0; i < n; i++) { if ((i * 7 + 3) % 10 < f * 10) icon(b, V.x + 2 + i * 9, vy + 2, top[i % top.length], false); if ((i * 3 + 5) % 10 < f * 10 - 1) icon(b, V.x + 2 + i * 9, vy + 12, bot[i % bot.length], false); }
    for (let i = 0; i < 12; i++) b.set(V.x + 4 + i, vy + 16 - i, '#ffffff', 0.5);
    b.rect(V.x - 1, CY - 1, V.w + 2, 1, P.wood[0]);
    // кофемашина
    const M = L.mach, my = CY - 20;
    b.rect(M.x, my, M.w, 20, P.grey[1]); b.rect(M.x, my, M.w, 3, P.grey[3]); b.vl(M.x, my, 20, P.grey[2]); b.vl(M.x + M.w - 1, my, 20, P.grey[0]);
    b.rect(M.x + 3, my + 4, M.w - 6, 5, P.grey[4]); b.set(M.x + 6, my + 6, '#e2553f'); b.set(M.x + 9, my + 6, '#52b67f');
    b.rect(M.x + 5, my + 10, 3, 3, P.ol); b.rect(M.x + M.w - 9, my + 10, 3, 3, P.ol); b.rect(M.x + 4, my + 14, 6, 5, '#f5efe3'); b.hl(M.x + 4, my + 14, 6, '#ffffff'); b.rect(M.x + M.w - 10, my + 14, 6, 5, '#f5efe3');
    for (let i = 0; i < 3; i++) b.rect(M.x + 2 + i * 9, my - 4, 7, 4, i % 2 ? '#f5efe3' : P.crust[0]);
    L.steamAt = [[M.x + 7, my + 13], [M.x + M.w - 7, my + 13]];
    if (M.x + M.w + 10 < L.c1) { const gx = M.x + M.w + 3; b.rect(gx, CY - 13, 8, 13, P.ol); b.rect(gx + 1, CY - 19, 6, 6, '#c9e2ec'); b.rect(gx + 2, CY - 16, 4, 3, '#6a4028'); }
    // сам прилавок
    b.rect(CX, CY + 5, CW, L.cb - CY - 5, P.wood[1]);
    for (let x = CX + 3; x < CX + CW - 8; x += 24) { const ph = L.cb - CY - 11; b.rect(x, CY + 9, 20, ph, P.wood[2]); b.hl(x, CY + 9, 20, P.wood[0]); b.vl(x, CY + 9, ph, P.wood[0]); b.hl(x + 1, CY + 8 + ph, 19, P.wood[3]); b.vl(x + 19, CY + 10, ph - 1, P.wood[3]); }
    b.rect(CX - 3, CY, CW + 6, 5, P.wood[4]); b.hl(CX - 3, CY, CW + 6, P.wood[5]); b.hl(CX - 3, CY + 4, CW + 6, P.wood[0]); b.hl(CX - 3, CY + 5, CW + 6, P.wood[0]);
    b.rect(CX, L.cb, CW, 2, P.wood[0]);
    b.dith(CX, L.cb + 2, CW, 4, '#5a3a22', (x, y) => 0.55 - (y - L.cb - 2) * 0.13);
    kLight(b, L, light, 'front');
    return b;
  }
  // свет: день — луч из окна и тёплые лампы; вечер/ночь — тёмный фон, лампы, печь и уличный фонарь в окне
  function kLight(b, L, light, layer) {
    const { W, H } = L;
    if (light === 'night') {
      const lamps = L.lamps || [W * 0.3, W * 0.6];
      Px.relight(b, '#5a5f86', [
        { c: '#ffcf8a', i: 1.1, f: Px.point(lamps[0], 12, W * 0.28, 1.2, H * 0.7) },
        { c: '#ffcf8a', i: 1.0, f: Px.point(lamps[1], 12, W * 0.28, 1.2, H * 0.7) },
        { c: '#ff9a4a', i: 1.3, f: Px.point(L.ox + L.ow / 2, L.wall - 14, 60, 1.3, 50) },
      ], { k: 0.6, steps: 5 });
      return;
    }
    if (layer === 'back' && L.win) {
      const w = L.win;
      b.beam([[w.x + 3, w.y + 5], [w.x + w.w - 3, w.y + 5], [w.x + w.w + 46, H], [w.x + 18, H]], '#fff1c4', (x, y) => { const tt = (y - w.y) / (H - w.y); return Math.floor((0.2 * (1 - tt) + bay(x, y) * 0.05) * 20) / 20; });
      Px.motes(b, [w.x, w.y + 8, w.w + 40, H - w.y - 8], Math.round(W / 10), 12, '#fff8e0', (x, y) => x > w.x + (y - w.y) * 0.1 && x < w.x + w.w + (y - w.y) * 0.25);
    }
    if (layer === 'front' && L.win) { const w = L.win; b.beam([[w.x + 3, w.y + 5], [w.x + w.w - 3, w.y + 5], [w.x + w.w + 46, H], [w.x + 18, H]], '#ffe7a8', (x, y) => ((x + y) % 5 === 0 ? 0 : 0.1)); }
    if (L.lamps) L.lamps.forEach((x) => b.glow(x, 12, 30, '#fff0c0', 0.2, { ry: 20 }));
    // тёплая виньетка
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H * 0.45) / (H * 0.7), d = dx * dx + dy * dy;
      if (d > 0.6) b.shade(x, y, '#6a3a20', Math.min(0.3, (d - 0.6) * 0.5));
    }
  }
  // огонь в печи — каждый кадр
  function fire(b, L, t, night) {
    const M = L.mouth; if (!M) return;
    const f = (a, s) => 1 + Math.sin(t * s + a) * 0.08 + Math.sin(t * s * 2.3 + a * 2) * 0.05;
    const cx = M.cx, by = M.bot - 1, w = M.w;
    b.rect(cx - w + 1, M.top + 1, w * 2 - 2, M.bot - M.top - 1, P.fire[3]);
    b.ellipse(cx, by - 6, (w - 2) * f(0, 5), 7 * f(1, 6), P.fire[2]);
    b.ellipse(cx + Math.sin(t * 4) * 1.5, by - 4, (w - 5) * f(2, 7), 5 * f(3, 8), P.fire[1]);
    b.ellipse(cx + Math.sin(t * 6) * 1, by - 2, (w - 9) * f(4, 9), 3 * f(5, 10), P.fire[0]);
    // хлеб в печи
    loaf(b, cx - w + 3, by - 5, 9); if (w > 14) loaf(b, cx + 2, by - 4, 9);
    // искры
    const r = rng(((t * 5) | 0) + 11); for (let i = 0; i < 3; i++) b.set(cx - w + 2 + r() * w * 2, M.top + 3 + r() * 8, '#ffe9a8', 0.8);
    b.glow(cx, by - 6, w + 14 + Math.sin(t * 5) * 2, '#ffb04a', night ? 0.5 : 0.28, { ry: 18 });
  }
  const put = (b, f, x, y, shadow, flip) => { if (shadow) b.ellipse(x + 8, y + 28, 6, 1.6, '#3a2219', 0.35); b.blit(f, x, y, flip); };

  /* ---------------- сцена «Калач» ---------------- */
  // o: { mode, t, light, heroEmo, heroDrop, job, old, rashidEmo, gulyaEmo, gulya (bool), fill, queue:[{id, look, pat, order[], front}], pos (служебное), served:{t0}, semyon (bool) }
  function kalach(b, t, W, H, o) {
    const mode = o.mode || 'month', light = o.light || 'day', night = light === 'night';
    const L = Px.memo(`kL|${W}|${H}|${mode}`, () => kLayout(W, H, mode));
    const back = Px.memo(`kB|${W}|${H}|${mode}|${light}`, () => kBack(L, light));
    const fill = o.fill == null ? 1 : Math.round(o.fill * 5) / 5;
    const front = Px.memo(`kF|${W}|${H}|${mode}|${light}|${fill}`, () => kFront(L, light, fill));
    b.copyFrom(back);
    fire(b, L, t, night);
    // пар над хлебом на полке/в двери
    // люди за прилавком: Гуля в двери цеха, Рашид у печи, герой
    const blink = (seed) => (t % (3.7 + seed)) < 0.14;
    const tint = (f) => (night ? Px.memo('tn|' + f.__id, () => f.clone().tint('#6a70a0', 0.45)) : f);
    const fg = (who, opt) => { const f = Px.fig(who, opt); if (!f.__id) f.__id = Math.random().toString(36).slice(2); return tint(f); };
    const wall = L.wall;
    if (o.gulya !== false) {
      const gx = L.dx + 4;
      put(b, fg('gulya', { emo: blink(1.3) ? 'closed' : (o.gulyaEmo || 'smile'), pose: 'tray' }), gx, wall - 29, false);
      b.rect(gx + 1, wall - 12, 16, 2, P.grey[2]); b.hl(gx + 1, wall - 12, 16, P.grey[3]);
      icon(b, gx + 2, wall - 17, 'croissant', false); icon(b, gx + 9, wall - 17, 'bun', false);
      if (!night) { steam(b, gx + 5, wall - 18, 7, 5, t, 0.5); steam(b, gx + 12, wall - 18, 8, 6, t, 0.5); }
    }
    // Рашид с лопатой
    const rx = L.ox + Math.max(2, Math.round(L.ow * 0.08)) - 12;
    put(b, fg('rashid', { emo: blink(0.7) ? 'closed' : (o.rashidEmo || 'neutral') }), rx, wall - 28, false);
    b.line(rx + 13, wall - 16, L.mouth.cx - 2, L.mouth.bot - 5, P.wood[3]); b.line(rx + 13, wall - 15, L.mouth.cx - 2, L.mouth.bot - 4, P.wood[1]);
    // герой за стойкой
    const hs = jobSprite(o.job || 0, o.old);
    const hEmo = o.heroEmo || 'smile';
    put(b, fg(hs, { emo: blink(0) && hEmo !== 'happy' ? 'closed' : hEmo, drop: o.heroDrop }), L.hero, L.cy - 27, false);
    // прилавок поверх людей
    b.blit(front, 0, 0);
    if (!night) L.steamAt && L.steamAt.forEach(([x, y], i) => steam(b, x, y, 9, 9 + i * 2, t));
    // вид из зала
    if (mode === 'month' || mode === 'life') {
      if (mode === 'month' && W >= 200) {
        // Семён Аркадьевич у прилавка (спиной) и гостья за столиком
        put(b, fg('semyon', { view: 'back' }), L.vit.x + 4, H - 31, true);
        if (W >= 220) {
          const tx = Math.round(L.c1 - 12);
          if (tx + 30 < W) { b.ellipse(tx + 12, H - 3, 16, 3, '#3a2219', 0.3); put(b, fg('elvira', { emo: 'smile', upper: true }), tx, H - 28, false); b.ellipse(tx + 12, H - 9, 13, 3, P.wood[3]); b.ellipse(tx + 12, H - 10, 12, 2, P.wood[4]); b.rect(tx + 11, H - 7, 3, 7, P.wood[0]); b.rect(tx + 5, H - 13, 5, 3, '#f5efe3'); icon(b, tx + 14, H - 16, 'croissant', false); }
        }
      }
      if (mode === 'life') {
        // пустой зал, часы на стене: поздно
        const sg = L.sign || { x: W / 2, w: 0 }, cx = sg.x + sg.w + 16 < L.ox - 8 ? sg.x + sg.w + 12 : Math.max(L.dx + L.dw + 10, sg.x - 12), cy = 13; b.ellipse(cx, cy, 6, 6, P.ol); b.ellipse(cx, cy, 5, 5, '#f5efe3'); b.line(cx, cy, cx, cy - 3, P.ol); b.line(cx, cy, cx + 3, cy + 1, P.ol);
      }
    }
    // очередь «Смены»
    if (mode === 'shift') drawQueue(b, t, W, H, L, o);
    if (o.bubble) { const bw = bubbleW(o.bubble.length); bubble(b, Math.min(W - bw - 1, L.hero + 8 - bw / 2), L.cy - 44, o.bubble, 'hot'); }
  }
  // гости очереди: плавно подходят к прилавку, шаг ногами, пузырь заказа у первого, шкала терпения у всех
  function drawQueue(b, t, W, H, L, o) {
    const q = o.queue || [], pos = o.pos || (o.pos = {});
    const baseY = H - 31, x0 = L.hero - 4;
    const step = Math.min(17, Math.max(14, Math.floor((x0 - 2) / 5)));
    const items = q.map((g, i) => { const tx = x0 - i * step, ty = baseY - Math.min(i, 3) * 2; let p = pos[g.id]; if (!p) p = pos[g.id] = { x: -18, y: ty }; const dx = tx - p.x; p.x += Math.abs(dx) < 0.6 ? dx : dx * 0.35; p.y = ty; p.moving = Math.abs(dx) > 0.6; return { g, p, i }; });
    for (const k of Object.keys(pos)) if (!q.some((g) => String(g.id) === k)) delete pos[k];
    // сначала дальние (выше), потом ближние
    items.slice().sort((a, c) => a.p.y - c.p.y).forEach(({ g, p, i }) => {
      const look = BK.Px.GUESTS[g.look] || BK.Px.GUESTS[0], who = g.look === 'sem' ? 'semyon' : look;
      const v = Math.max(0, g.pat), emo = v < 0.3 ? 'angry' : i === 0 ? 'smile' : v < 0.55 ? 'worried' : 'neutral';
      const st = p.moving ? (((t * 7) | 0) % 2 ? 1 : 2) : 0;
      put(b, Px.fig(who, { emo, step: st }), p.x, p.y, true);
      patience(b, Math.round(p.x) + 2, Math.round(p.y) - 4, 12, v);
    });
    // пузыри поверх всех
    items.forEach(({ g, p, i }) => {
      const v = Math.max(0, g.pat);
      let ic = null, tone = 'norm';
      if (i === 0 && g.order && g.order.length) { ic = g.order.map((id) => ITEM_IC[id] || 'cup'); tone = 'hot'; }
      else if (v < 0.3) { ic = ['clock', 'angry']; tone = 'bad'; }
      else if (i === 1) ic = ['dots'];
      if (!ic) return;
      const w = bubbleW(ic.length); let bx = Math.round(p.x + 8 - w / 2); bx = Math.max(1, Math.min(W - w - 1, bx));
      bubble(b, bx, Math.round(p.y) - 20, ic, tone);
    });
    // монетки после удачного заказа
    if (o.coin && t - o.coin < 0.9) { const k = (t - o.coin) / 0.9; for (let i = 0; i < 3; i++) icon(b, L.c0 + 30 + i * 5, Math.round(L.cy - 10 - k * 18 - i * 3), 'coin', false); }
  }
  const ITEM_IC = { esp: 'cup', cap: 'latte', lat: 'glass', tea: 'tea', cro: 'croissant', bun: 'bun', ech: 'echpochmak', chk: 'chakchak' };

  /* ---------------- финал «Своя точка» ---------------- */
  // та же улица, что у «живой точки», утро; своя вывеска, ленточка у двери, герой машет, рядом Гуля (и Рашид-партнёр)
  function own(b, t, W, H, o) {
    Px.scenes.store(b, t, W, H, { hour: 8.4, label: 'СВОЯ ТОЧКА', state: 'open', staff: [], fill: 1, steam: true, queue: 0 });
    const L = Px.scenes.storeLayout(W, H);
    const g = L.ground, dx = L.dx;
    // ленточка поперёк входа и бант
    b.hl(dx - 10, g - 12, L.dw + 20, '#e2553f'); b.hl(dx - 10, g - 11, L.dw + 20, '#b0302a');
    const bx = dx + L.dw / 2; b.ellipse(bx, g - 11, 3, 2.2, '#e2553f'); b.line(bx, g - 10, bx - 3, g - 5, '#e2553f'); b.line(bx, g - 10, bx + 3, g - 5, '#b0302a');
    // конфетти
    const r = rng(((t * 4) | 0) + 3);
    for (let i = 0; i < Math.round(W / 10); i++) { const x = r() * W, y = ((r() * H + t * 16 * (0.6 + r())) % (g - 4)); b.set(x, y, ['#e2553f', '#e3b341', '#3b8796', '#52b67f', '#e2705a'][i % 5]); }
    // люди у входа
    const hx = Math.max(2, dx - 20), gy = g - 26;
    if (o.rashid) put(b, Px.fig('rashid', { emo: 'smile' }), hx - 34, gy, true);
    if (o.gulya) put(b, Px.fig('gulya', { emo: 'happy' }), hx - 16, gy, true);
    put(b, Px.fig('hero', { emo: 'happy', pose: ((t * 2) | 0) % 2 ? 'wave' : null }), hx, gy, true);
  }

  Object.assign(Px, { scenes: { kalach, own, ITEM_IC, P, steam, loaf, bricks, rug, floorPlanks } });
})();
