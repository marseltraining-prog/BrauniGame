/* =====================================================================
   «ЖИВАЯ ТОЧКА» — пиксельная сцена торговой точки вблизи (BK.Px.scenes.store), vision-plan §4 п. 1–2, §10.
   Только картинка: все числа приходят готовыми из src/pixel/live.js (по реальному состоянию точки).
   o: { hour 6..24, queue (чел.), staff:[{emo, drop}], fill 0..1 (витрина), steam, courier, thoughts:[{ic[], tone}],
        state: 'open'|'opening'|'repair'|'closed'|'night', num, disc (вечерняя скидка, %), look (сид внешности гостей), rival }
   Свет по часу: рассвет → день → закат → сумерки → ночь (небо, общий свет, лампы, окна изнутри).
   Слои кэшируются по ширине/высоте/получасу/состоянию; каждый кадр — люди, очередь (движется), пар, курьер, пузыри.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const Px = BK.Px, { Buf, mix, bay, rng, text, textW, icon, bubble, bubbleW } = Px;
  const SC = () => Px.scenes;
  // ключевые кадры неба и света по часам
  const SKY = [
    [5, '#27396e', '#e08a6a', '#8a80b0', 0.62], [7, '#f6c89a', '#bcd8ea', '#ffe2c0', 0.96], [9, '#a4d3e6', '#dff1f4', '#ffffff', 1],
    [15.5, '#a4d3e6', '#e6f3f2', '#ffffff', 1], [18, '#f0a870', '#f7d9a8', '#ffd0a0', 0.88], [20, '#5a5a9a', '#e08a6a', '#9a88b8', 0.7],
    [21.5, '#101a38', '#33477e', '#5a6aa0', 0.52], [24, '#0b1128', '#1d2d5c', '#4a5a90', 0.46],
  ];
  function skyAt(h) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h <= SKY[i + 1][0]) { a = SKY[i]; b = SKY[i + 1]; break; }
    const k = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
    return { top: mix(a[1], b[1], k), bot: mix(a[2], b[2], k), amb: mix(a[3], b[3], k), lum: a[4] + (b[4] - a[4]) * k };
  }
  const isDark = (h) => h >= 19.5 || h < 6.5;
  const hexOf = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

  function layout(W, H) {
    const L = { W, H };
    L.ground = H - 11;                                   // верх тротуара
    L.fx = Math.round(W * (W < 220 ? 0.4 : 0.44));       // фасад
    L.fr = W - (W < 220 ? 20 : 26);                      // правый край фасада (дальше — место курьеру)
    L.ft = 12;
    L.sign = { y: L.ft, h: 11 };
    L.aw = L.ft + 11;                                     // маркиза
    L.dw = 14; L.dx = L.fx + 4;                          // дверь слева — очередь уходит влево по тротуару
    L.win = { x: L.dx + L.dw + 5, y: L.aw + 9, w: L.fr - (L.dx + L.dw + 5) - 5, h: L.ground - (L.aw + 9) - 3 };
    L.cnt = L.win.y + L.win.h - 10;                      // прилавок внутри
    return L;
  }
  // слой 1: небо, дома, фасад, интерьер за стеклом (без людей)
  function back(L, hb, state) {
    const { W, H } = L, b = new Buf(W, H), sk = skyAt(hb), dark = isDark(hb), g = L.ground;
    for (let y = 0; y < g; y++) { const k = y / g; for (let x = 0; x < W; x++) b.set(x, y, bay(x, y) < k ? sk.bot : sk.top); }
    if (dark) Px.stars(b, 0, 0, W, 26, Math.round(W / 6), 5);
    if (hb >= 6 && hb < 20) { const sx = W * (0.12 + (hb - 6) / 14 * 0.25), sy = 6 + Math.abs(hb - 13) * 1.1; b.glow(sx, sy, 16, '#fff4c8', 0.5, { ry: 12 }); b.ellipse(sx, sy, 4, 4, hb > 17 ? '#ffc890' : '#fff6d6'); }
    else if (dark) { b.ellipse(W * 0.2, 8, 4, 4, '#f4eed8'); b.ellipse(W * 0.2 + 2, 7, 3.5, 3.5, sk.top); }
    // дома за точкой
    const R = rng(33), bc = ['#d8c4a4', '#cbb8a0', '#e0ccb0', '#bfb2a2'];
    for (let x = -6; x < W; x += 20 + (R() * 12 | 0)) {
      const hh = 14 + (R() * 22 | 0), top = g - 16 - hh, c = bc[(R() * 4) | 0];
      b.rect(x, top, 22, g - top, c); b.hl(x, top, 22, mix(c, '#ffffff', 0.25));
      for (let yy = top + 5; yy < g - 12; yy += 9) for (let xx = x + 4; xx < x + 18; xx += 8) b.rect(xx, yy, 3, 4, dark ? (R() > 0.45 ? '#ffd98a' : '#3a4266') : mix(c, '#7f9fb0', 0.45));
    }
    // фасад точки
    const { fx, fr, ft } = L, fw = fr - fx;
    b.rect(fx - 2, ft - 4, fw + 4, 4, '#8f4a31'); b.hl(fx - 2, ft - 4, fw + 4, '#b0603f');
    b.rect(fx, ft, fw, g - ft, '#f1dcb4'); b.vl(fx + fw - 1, ft, g - ft, '#d4b07c'); b.vl(fx, ft, g - ft, '#f8e9c9');
    SC().bricks(b, fx + 1, g - 8, fw - 2, 8);
    // труба с паром (пар — каждый кадр)
    b.rect(fr - 12, ft - 12, 6, 8, '#8f4a31'); b.hl(fr - 13, ft - 12, 8, '#6a4430');
    // вывеска
    const S = L.sign; b.rect(fx + 3, S.y + 1, fw - 6, S.h - 2, '#1f2a44'); b.hl(fx + 3, S.y + 1, fw - 6, '#2e3d60');
    // маркиза
    for (let x = fx - 3; x < fr + 3; x++) { const k = Math.floor((x - fx + 3) / 6) % 2; b.vl(x, L.aw, 6, k ? '#fbf6ec' : '#c46f17'); b.set(x, L.aw + 6, (x - fx) % 6 < 3 ? (k ? '#fbf6ec' : '#c46f17') : null); }
    b.hl(fx - 3, L.aw, fr - fx + 6, '#94500b');
    // окно: интерьер
    const w = L.win;
    b.rect(w.x - 2, w.y - 2, w.w + 4, w.h + 4, '#7a4a2c');
    b.rect(w.x, w.y, w.w, w.h, state === 'repair' ? '#d8cfc0' : '#f4dfc2');
    if (state !== 'repair') {
      // полки с хлебом у задней стены
      const sy = w.y + 6;
      b.hl(w.x + 2, sy + 5, w.w - 4, '#9c6338'); b.hl(w.x + 2, sy + 6, w.w - 4, '#7a4a2c');
      for (let x = w.x + 3; x < w.x + w.w - 10; x += 11) SC().loaf(b, x, sy - 1, 9);
      b.rect(w.x + w.w - 12, w.y + 2, 9, 7, '#2e3a30'); b.hl(w.x + w.w - 11, w.y + 4, 6, '#c9d1c4'); b.hl(w.x + w.w - 11, w.y + 6, 4, '#f4c27a');
    } else {
      // ремонт: стремянка, ведро, плёнка
      b.line(w.x + 8, w.y + w.h - 2, w.x + 14, w.y + 6, '#8f8d94'); b.line(w.x + 18, w.y + w.h - 2, w.x + 14, w.y + 6, '#8f8d94');
      for (let y = w.y + 10; y < w.y + w.h - 2; y += 5) b.hl(w.x + 10, y, 7, '#8f8d94');
      b.rect(w.x + w.w - 14, w.y + w.h - 8, 7, 7, '#3b8796');
    }
    // дверь
    const dx = L.dx, dy = w.y - 2;
    b.rect(dx, dy, L.dw, g - dy, '#7a4a2c'); b.rect(dx + 2, dy + 2, L.dw - 4, 13, '#cfe8f0'); b.hl(dx + 2, dy + 2, L.dw - 4, '#ffffff'); b.set(dx + L.dw - 4, dy + 22, '#e3b341');
    b.rect(dx - 1, g - 1, L.dw + 2, 2, '#5a3522');
    // тротуар и бордюр
    b.rect(0, g, W, H - g, '#b5b2b2'); b.hl(0, g, W, '#d8d4cc'); for (let x = 0; x < W; x += 12) b.vl(x + ((x / 12) % 2) * 6, g + 1, H - g - 3, '#a2a0a0');
    b.rect(0, H - 3, W, 3, '#8f8d94'); b.hl(0, H - 3, W, '#c9c6c0');
    // фонарь слева
    const lx = Math.max(6, Math.round(L.fx * 0.18));
    b.vl(lx, 18, g - 18, '#2e3d60'); b.vl(lx + 1, 18, g - 18, '#1f2a44'); b.rect(lx - 3, 14, 8, 4, '#1f2a44'); b.rect(lx - 2, 18, 6, 2, dark ? '#fff3c0' : '#d8d4cc');
    L.lamp = [lx + 1, 19];
    // свет
    const interior = (x, y) => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h;
    const lights = [];
    if (dark) lights.push({ c: '#ffd890', i: 1.25, f: Px.point(lx + 1, 20, 34, 1.3, 40) });
    if (dark && state !== 'night') lights.push({ c: '#ffcf8a', i: 1.0, f: Px.point(w.x + w.w / 2, w.y + w.h, w.w * 0.9, 1.4, 26) });
    Px.relight(b, hexOf(sk.amb), lights, { k: sk.lum, steps: 5, skip: state === 'night' ? null : interior });
    if (state === 'night') Px.relight(b, '#8a7a90', [{ c: '#ffcf8a', i: 0.8, f: Px.point(w.x + w.w * 0.7, w.y + 4, 20, 1.2) }], { k: 0.6, x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.h });
    else if (hb >= 17.5 || hb < 7) b.glow(w.x + w.w / 2, w.y + 6, w.w * 0.5, '#fff0c0', 0.22, { ry: 10 });
    // вывеска: подсветка букв ночью
    return b;
  }
  // слой 2: прилавок и витрина (полнота), стекло, надписи на двери
  function glass(L, hb, state, fill, disc, num, o_label) {
    const { W, H } = L, b = new Buf(W, H), w = L.win, dark = isDark(hb), cy = L.cnt;
    const sk = skyAt(hb);
    if (state !== 'repair') {
      b.rect(w.x, cy, w.w, w.y + w.h - cy, '#c0844a'); b.hl(w.x, cy, w.w, '#ecc38a'); b.hl(w.x, cy + 1, w.w, '#9c6338');
      // витрина
      const vx = w.x + 2, vw = w.w - 4, vy = cy - 8;
      b.rect(vx, vy, vw, 8, '#dff3f6', 0.5); b.hl(vx, vy, vw, '#ffffff'); b.vl(vx, vy, 8, '#ffffff'); b.vl(vx + vw - 1, vy, 8, '#a8c8d0');
      const n = Math.floor((vw - 2) / 8), items = ['croissant', 'bun', 'echpochmak', 'loaf', 'croissant', 'bun', 'chakchak', 'cake'];
      for (let i = 0; i < n; i++) if (((i * 7 + 3) % 10) / 10 < fill - 0.02) icon(b, vx + 1 + i * 8, vy, items[i % items.length], false);
      if (disc && hb >= 17 && hb < 22) { b.rect(vx + 2, vy - 8, 17, 7, '#e2553f'); text(b, vx + 3, vy - 7, '-' + disc + '%', '#ffffff', 1, { small: true }); }
    }
    // блик стекла
    for (let i = 0; i < 9; i++) { b.set(w.x + 3 + i, w.y + 10 - i, '#ffffff', dark ? 0.12 : 0.4); b.set(w.x + 6 + i, w.y + 10 - i, '#ffffff', dark ? 0.06 : 0.22); }
    b.vl(w.x + (w.w >> 1), w.y, w.h, '#7a4a2c', 0.9);
    // вывеска: номер точки
    const S = L.sign, fw = L.fr - L.fx, lab0 = o_label || (num != null ? 'ТОЧКА ' + num : 'ХЛЕБ'), label = textW(lab0) <= fw - 10 ? lab0 : String(num != null ? num : ''), tw = textW(label);
    text(b, Math.round(L.fx + (L.fr - L.fx) / 2 - tw / 2), S.y + 3, label, dark ? '#ffcf6b' : '#e59a3e');
    if (dark) b.glow(L.fx + (L.fr - L.fx) / 2, S.y + 6, tw / 2 + 6, '#ffb347', 0.25, { ry: 6 });
    // табличка на двери
    const dy = w.y + 16;
    const tag = state === 'night' || state === 'closed' ? 'ЗАКРЫТО' : state === 'opening' ? 'СКОРО' : state === 'repair' ? 'РЕМОНТ' : null;
    if (tag) { const tw2 = textW(tag, 1, false); const tx = Math.round(w.x + w.w / 2 - tw2 / 2 - 2); b.rect(tx, dy, tw2 + 4, 9, '#fbf6ec'); b.hl(tx, dy, tw2 + 4, '#c0412d'); text(b, tx + 2, dy + 1, tag, '#c0412d'); }
    if (state === 'repair') { for (let x = w.x - 2; x < w.x + w.w + 2; x++) { const y = w.y + Math.round((x - w.x) * 0.35) + 4; if (y < w.y + w.h) b.set(x, y, (x >> 2) % 2 ? '#e3b341' : '#2a1a1c'); } }
    if (state !== 'night' && state !== 'repair' && !dark) { /* днём стекло чуть отражает небо */ for (let y = w.y; y < w.y + 4; y++) b.hl(w.x, y, w.w, hexOf(sk.bot), 0.18); }
    return b;
  }
  const put = (b, f, x, y, shadow) => { if (shadow) b.ellipse(x + 8, y + 28, 6, 1.5, '#3a2a2a', 0.3); b.blit(f, x, y); };
  // гостю — облик по номеру в очереди и сиду точки
  const look = (seed, k) => Px.GUESTS[(seed * 7 + k * 3) % Px.GUESTS.length];

  function store(b, t, W, H, o) {
    const L = Px.memo(`sL|${W}|${H}`, () => layout(W, H));
    const h = o.hour == null ? 12 : o.hour, hb = Math.round(h * 2) / 2, state = o.state || 'open', dark = isDark(hb);
    const fill = Math.round((o.fill == null ? 1 : o.fill) * 10) / 10;
    b.copyFrom(Px.memo(`sB|${W}|${H}|${hb}|${state}`, () => back(L, hb, state)));
    const w = L.win, sk = skyAt(hb);
    // тон для людей на улице
    const tintK = dark ? 0.5 : sk.lum < 0.97 ? 0.2 : 0;
    const tone = (f, key) => (tintK ? Px.memo('st|' + key + '|' + hb, () => f.clone().tint(hexOf(sk.amb), tintK)) : f);
    // продавцы за прилавком (внутри — тёплый свет, без тона)
    if (state === 'open' || state === 'night') {
      const staff = state === 'night' ? [{ emo: 'tired' }] : (o.staff || []);
      const n = Math.min(staff.length, Math.max(1, Math.floor((w.w - 6) / 15)));
      for (let i = 0; i < n; i++) {
        const s = staff[i], sx = Math.round(w.x + 3 + (w.w - 18) * (n === 1 ? 0.5 : i / (n - 1))), blink = ((t + i * 1.7) % 4.1) < 0.13;
        const f = Px.fig(Px.STAFF[i % Px.STAFF.length], { emo: blink && s.emo !== 'happy' ? 'closed' : s.emo, drop: s.drop && ((t * 1.5 + i) % 3) < 2, upper: true });
        b.blit(f, sx, L.cnt - 26);
      }
    }
    b.blit(Px.memo(`sG|${W}|${H}|${hb}|${state}|${fill}|${o.disc || 0}|${o.num}|${o.label || ''}`, () => glass(L, hb, state, fill, o.disc, o.num, o.label)), 0, 0);
    // пар: над свежим хлебом утром и из трубы
    if (o.steam && state === 'open') { for (let i = 0; i < 3; i++) SC().steam(b, w.x + 8 + i * Math.round((w.w - 16) / 2), L.cnt - 9, 7, i + 1, t, 0.55); }
    if (state !== 'repair') SC().steam(b, L.fr - 9, L.ft - 13, 10, 7, t, dark ? 0.35 : 0.5);
    // очередь от двери влево; раз в период первый заходит, остальные делают шаг
    const q = state === 'open' ? Math.max(0, o.queue | 0) : 0;
    const g = L.ground, slot = 12, x0 = L.dx - 13, fit = Math.max(1, Math.floor((x0 - 4) / slot) + 1), shown = Math.min(q, fit);
    const period = Math.max(1.6, 4.2 - q * 0.25), ph = q ? (t % period) / period : 0, mv = ph > 0.78 ? (ph - 0.78) / 0.22 : 0, cyc = q ? Math.floor(t / period) : 0;
    const ppl = [];
    for (let i = 0; i < shown + (mv > 0 && q > fit ? 1 : 0); i++) {
      let x = x0 - i * slot + mv * slot, y = g - 26 + (i % 2);
      if (i === 0 && mv > 0) { x = x0 + mv * 10; }
      const gi = cyc + i, f = look(o.look || 1, gi);
      const angry = o.long && i >= 2, emo = angry ? 'angry' : i === 0 ? 'smile' : (gi % 5 === 0 ? 'happy' : 'neutral');
      const moving = mv > 0 && mv < 1, step = moving ? (((t * 8) | 0) % 2 ? 1 : 2) : 0;
      const alpha = i === 0 && mv > 0.5 ? 1 - (mv - 0.5) * 2 : 1;
      ppl.push({ x, y, f: tone(Px.fig(f, { emo, step, view: i === 0 && mv > 0 ? 'back' : 'front' }), `${f.__k}|${emo}|${step}|${i === 0 && mv > 0}`), alpha, i });
    }
    ppl.sort((a, c) => a.y - c.y).forEach((p) => { if (p.x < -16) return; b.ellipse(p.x + 8, p.y + 28, 6, 1.5, '#3a2a2a', 0.3 * p.alpha); b.blit(p.f, p.x, p.y, false, p.alpha); });
    if (q > fit) { const s = '+' + (q - fit); b.rect(1, g - 30, textW(s, 1, true) + 4, 8, '#fffaf0'); text(b, 3, g - 29, s, '#3a2a2a', 1, { small: true }); }
    // курьер агрегатора: подъезжает и уезжает
    if (o.courier && state === 'open') {
      const cp = (t % 9) / 9, cx0 = W - 20, dxp = cp < 0.2 ? (1 - cp / 0.2) * 26 : cp > 0.8 ? (cp - 0.8) / 0.2 * 26 : 0;
      const cx = Math.round(cx0 + dxp), cy = g - 25;
      if (cx < W) {
        const wr = (x) => { b.ellipse(x, g + 1, 3.5, 3.5, '#2a1a1c'); b.ellipse(x, g + 1, 2, 2, mix('#b5b2b2', '#ffffff', 0.2)); };
        wr(cx + 2); wr(cx + 14); b.line(cx + 2, g + 1, cx + 8, g - 5, '#2f8a57'); b.line(cx + 8, g - 5, cx + 14, g + 1, '#2f8a57'); b.line(cx + 8, g - 5, cx + 12, g - 8, '#2a1a1c');
        b.blit(tone(Px.fig('courier', { emo: 'smile', upper: true }), 'cour'), cx, cy);
        b.rect(cx + 9, cy + 9, 8, 7, '#52b67f'); b.hl(cx + 9, cy + 9, 8, '#8fd4a8'); b.rect(cx + 12, cy + 11, 2, 2, '#fbf6ec');
      }
    }
    // мысли гостей: 1–2 пузыря над людьми (или над дверью, если очереди нет)
    const th = (o.thoughts || []).slice(0, 2);
    th.forEach((m, k) => {
      const wdt = bubbleW(m.ic.length), p = ppl.find((pp) => pp.i === (k === 0 ? Math.min(1, shown - 1) : Math.min(shown - 1, 3)));
      let bx = p ? p.x + 8 - wdt / 2 : L.dx - 4 - k * (wdt + 4) - wdt / 2, by = p ? p.y - 15 : g - 44 - k * 3;
      if (k === 1 && p && ppl.length < 3) { bx -= wdt + 3; }
      const bob = Math.round(Math.sin(t * 2 + k) * 0.6);
      bubble(b, Math.max(1, Math.min(W - wdt - 1, Math.round(bx))), by + bob, m.ic, m.tone || 'norm');
    });
  }
  Object.assign(Px.scenes, { store, skyAt, storeLayout: (W, H) => Px.memo(`sL|${W}|${H}`, () => layout(W, H)) });
})();
