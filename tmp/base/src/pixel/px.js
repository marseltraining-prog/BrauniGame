/* =====================================================================
   ПИКСЕЛЬНЫЙ ДВИЖОК (BK.Px) — люди, эмоции, сцены «Калача» и «живая точка» (docs/vision-plan.md §10).
   Перенесён из одобренной пробы docs/mockups/pixel/px.js. Всё рисуется кодом в буфер низкого разрешения
   (Uint8ClampedArray), на экран — canvas с целым множителем и image-rendering: pixelated. Ни одной картинки.
   Состав: цвет и дизеринг Байера, буфер с примитивами (прямоугольник, эллипс, многоугольник, свечение, луч,
   выборочный контур sel-out, попиксельное переосвещение), пиксельный шрифт 5×7 с кириллицей и мелкий 3×5,
   фигуры 16×30 (эмоции, позы, шаг), портреты 48×48, иконки 7×7 и пузыри мыслей, шкала терпения.
   Производительность: готовые буферы кэшируются (Px.memo), сцены рисуются по требованию (Px.stage в scenes.js),
   анимация — только пока сцена видна. Игровой логики здесь нет: движок и боты его не видят.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  'use strict';

  /* ---------- цвет ---------- */
  const cache = {};
  function C(h) {
    if (Array.isArray(h)) return h;
    const v0 = cache[h]; if (v0) return v0;
    const v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    cache[h] = v; return v;
  }
  const mix = (a, b, t) => { a = C(a); b = C(b); return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; };
  // Байер 4×4 — порог дизеринга
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (x, y) => B4[((y & 3) << 2) | (x & 3)];
  // детерминированный ГСЧ (только для картинки: игровые ГСЧ не трогаем)
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  /* ---------- буфер ---------- */
  class Buf {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
    in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { x |= 0; y |= 0; if (!this.in(x, y)) return null; const i = (y * this.w + x) * 4, d = this.d; return d[i + 3] ? [d[i], d[i + 1], d[i + 2], d[i + 3]] : null; }
    set(x, y, c, a = 1) {
      x = Math.floor(x); y = Math.floor(y);
      if (c == null || x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return this;
      c = C(c); const i = (y * this.w + x) * 4, d = this.d;
      if (a >= 1 || d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a >= 1 ? 255 : Math.max(d[i + 3], a * 255); return this; }
      d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
      return this;
    }
    // «свет»: мягкое сложение (screen)
    light(x, y, c, a) {
      x = Math.floor(x); y = Math.floor(y); if (!this.in(x, y) || a <= 0) return;
      c = C(c); const i = (y * this.w + x) * 4, d = this.d;
      for (let k = 0; k < 3; k++) d[i + k] = 255 - (255 - d[i + k]) * (1 - (c[k] / 255) * a);
    }
    // затемнение умножением
    shade(x, y, c, a) {
      x = Math.floor(x); y = Math.floor(y); if (!this.in(x, y) || a <= 0) return;
      c = C(c); const i = (y * this.w + x) * 4, d = this.d;
      for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - a + a * c[k] / 255);
    }
    rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); return this; }
    hl(x, y, w, c, a) { return this.rect(x, y, w, 1, c, a); }
    vl(x, y, h, c, a) { return this.rect(x, y, 1, h, c, a); }
    line(x0, y0, x1, y1, c, a) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (let g = 0; g < 2000; g++) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
      return this;
    }
    ellipse(cx, cy, rx, ry, c, a) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
      return this;
    }
    // заливка многоугольника (чёт-нечет)
    poly(pts, c, a, fn) {
      let y0 = Infinity, y1 = -Infinity; pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const yy = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + (yy - ay) / (by - ay) * (bx - ax));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) fn ? fn(x, y) : this.set(x, y, c, a);
      }
      return this;
    }
    // дизеринговая заливка: level 0..1 или функция (x,y)→level
    dith(x, y, w, h, c, level) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
        const l = typeof level === 'function' ? level(i, j) : level; if (bay(i, j) < l) this.set(i, j, c);
      }
      return this;
    }
    // пиксельное свечение: ступенчатая прозрачность + дизеринг краёв
    glow(cx, cy, r, c, amax, opt = {}) {
      const steps = opt.steps || 5, pow = opt.pow || 1.6, ry = opt.ry || r, mode = opt.mode || 'light', dz = opt.dither == null ? 1 : opt.dither;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy); if (d >= 1) continue;
        let t = Math.pow(1 - d, pow) * steps; t = Math.floor(t + (dz < 1 ? 0.5 + (bay(x, y) - 0.5) * dz : bay(x, y) * 0.999)) / steps;
        if (t <= 0) continue;
        mode === 'light' ? this.light(x, y, c, t * amax) : this.set(x, y, c, t * amax);
      }
      return this;
    }
    // луч: многоугольник с затуханием по функции
    beam(pts, c, fn, mode = 'light') {
      return this.poly(pts, null, 0, (x, y) => { const a = fn(x, y); if (a > 0) mode === 'light' ? this.light(x, y, c, a) : this.set(x, y, c, a); });
    }
    blit(src, x, y, flip = false, alpha = 1) {
      x = Math.round(x); y = Math.round(y);
      const sd = src.d, d = this.d, W = this.w, H = this.h;
      for (let j = 0; j < src.h; j++) {
        const ty = y + j; if (ty < 0 || ty >= H) continue;
        for (let i = 0; i < src.w; i++) {
          const k = (j * src.w + i) * 4, sa = sd[k + 3]; if (!sa) continue;
          const tx = x + (flip ? src.w - 1 - i : i); if (tx < 0 || tx >= W) continue;
          const o = (ty * W + tx) * 4, a = (sa / 255) * alpha;
          if (a >= 1 || !d[o + 3]) { d[o] = sd[k]; d[o + 1] = sd[k + 1]; d[o + 2] = sd[k + 2]; d[o + 3] = Math.max(d[o + 3], a * 255); }
          else { d[o] += (sd[k] - d[o]) * a; d[o + 1] += (sd[k + 1] - d[o + 1]) * a; d[o + 2] += (sd[k + 2] - d[o + 2]) * a; }
        }
      }
      return this;
    }
    // картинка из строк + словаря цветов
    map(x, y, rows, pal, flip = false) {
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.' || ch === ' ' || !(ch in pal)) continue; this.set(x + (flip ? r.length - 1 - i : i), y + j, pal[ch]); } });
      return this;
    }
    // выборочный контур (sel-out): цвет контура — затемнённый соседний
    outline(dark = '#2a1a1c', k = 0.62) {
      const o = new Buf(this.w, this.h); o.d.set(this.d);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n = this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1);
        if (n) o.set(x, y, mix(n, dark, k));
      }
      return o;
    }
    // весь буфер умножить на цвет (ночь/вечер для готовых спрайтов)
    tint(c, a) { const cc = C(c), d = this.d; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - a + a * cc[k] / 255); return this; }
    toCanvas(cv) {
      if (cv.width !== this.w) cv.width = this.w;
      if (cv.height !== this.h) cv.height = this.h;
      const ctx = cv.getContext('2d'); if (!ctx) return cv;
      const id = ctx.createImageData(this.w, this.h); id.data.set(this.d); ctx.putImageData(id, 0, 0);
      return cv;
    }
    clone() { const b = new Buf(this.w, this.h); b.d.set(this.d); return b; }
    copyFrom(src) { this.d.set(src.d); return this; }
  }

  /* ---------- пиксельный шрифт 5×7 (заглавные, кириллица + ә) ---------- */
  const G = {
    'А': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'Б': ['#####', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'В': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], 'Г': ['#####', '#....', '#....', '#....', '#....', '#....', '#....'],
    'Д': ['.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'], 'Е': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'Ё': ['#.#.#', '#####', '#....', '####.', '#....', '#....', '#####'], 'Ж': ['#.#.#', '#.#.#', '#.#.#', '.###.', '#.#.#', '#.#.#', '#.#.#'],
    'З': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'], 'И': ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
    'Й': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'], 'К': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'Л': ['..###', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '#...#'], 'М': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'Н': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], 'О': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'П': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'], 'Р': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'С': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], 'Т': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'У': ['#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'], 'Ф': ['..#..', '.###.', '#.#.#', '#.#.#', '.###.', '..#..', '..#..'],
    'Х': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'], 'Ц': ['#..#.', '#..#.', '#..#.', '#..#.', '#..#.', '#####', '....#'],
    'Ч': ['#...#', '#...#', '#...#', '.####', '....#', '....#', '....#'], 'Ш': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],
    'Щ': ['#.#.#.', '#.#.#.', '#.#.#.', '#.#.#.', '#.#.#.', '######', '.....#'], 'Ъ': ['##...', '.#...', '.#...', '.###.', '.#..#', '.#..#', '.###.'],
    'Ы': ['#...#', '#...#', '#...#', '###.#', '#.#.#', '#.#.#', '###.#'], 'Ь': ['#....', '#....', '#....', '####.', '#...#', '#...#', '####.'],
    'Э': ['.###.', '#...#', '....#', '..###', '....#', '#...#', '.###.'], 'Ю': ['#..#.', '#.#.#', '#.#.#', '###.#', '#.#.#', '#.#.#', '#..#.'],
    'Я': ['.####', '#...#', '#...#', '.####', '..#.#', '.#..#', '#...#'], 'Ә': ['.###.', '#...#', '....#', '#####', '#...#', '#...#', '.###.'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '№': ['#..#...', '##.#...', '#.##.##', '#..#.##', '#..#...', '#..#.##', '#..#...'],
    '·': ['.', '.', '.', '#', '.', '.', '.'], '.': ['.', '.', '.', '.', '.', '.', '#'], ',': ['..', '..', '..', '..', '..', '.#', '#.'],
    '!': ['#', '#', '#', '#', '#', '.', '#'], '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['...', '...', '...', '###', '...', '...', '...'], ':': ['.', '.', '#', '.', '.', '#', '.'], '%': ['##..#', '##.#.', '..#..', '.#...', '#..##', '...##', '.....'],
    '«': ['....', '....', '.#.#', '#.#.', '.#.#', '....', '....'], '»': ['....', '....', '#.#.', '.#.#', '#.#.', '....', '....'],
    ' ': ['...', '...', '...', '...', '...', '...', '...'],
  };
  // мелкий шрифт 3×5 для цифр и табличек
  const G3 = {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'], ' ': ['.', '.', '.', '.', '.'], '.': ['.', '.', '.', '.', '#'], ':': ['.', '#', '.', '#', '.'],
    '₽': ['##.', '#.#', '##.', '###', '#..'], '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'], '%': ['#.#', '..#', '.#.', '#..', '#.#'], '№': ['#.#', '###', '###', '#.#', '#.#'],
  };
  function textW(s, sc = 1, small) { const font = small ? G3 : G; let w = 0; for (const ch of String(s).toUpperCase()) { const g = font[ch] || font[' ']; w += (g[0].length + 1) * sc; } return w - sc; }
  function text(b, x, y, s, c, sc = 1, opt = {}) {
    const font = opt.small ? G3 : G; let cx = x;
    for (const ch of String(s).toUpperCase()) {
      const g = font[ch] || font[' '];
      if (opt.shadow) g.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') b.rect(cx + i * sc + sc, y + j * sc + sc, sc, sc, opt.shadow); });
      g.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') b.rect(cx + i * sc, y + j * sc, sc, sc, c); });
      cx += (g[0].length + 1) * sc;
    }
    return cx;
  }

  /* ---------- палитра персонажей ---------- */
  const K = {
    ol: '#2a1a1c', // общий тёмный контур
    skin: ['#f4cfa6', '#dca47c', '#b97b5c'], skinT: ['#e8b98e', '#c68a64', '#9c6247'], skinD: ['#c98f68', '#a86d4e', '#80503a'],
    eye: '#2a1a1c', blush: '#e8897a', mouth: '#9b4a3c', white: '#fbf6ec', sweat: '#7fc4e8',
  };

  // Голова 12×12. s — кожа, S — тень кожи, h/H/L — волосы/тень/блик, c/C/W/k — головной убор.
  const FACE = [
    '...ssssss...', '..ssssssss..', '.ssssssssss.', '.sssssssssS.', '.sssssssssS.', '.sssssssssS.',
    'sssssssssSSs', 'sssssssssSSs', '.sssssssssS.', '.sssssssssS.', '..sssssssS..', '...SSSSSS...',
  ];
  const HAIR = {
    short: ['...hhhhhh...', '..hLLhhhhh..', '.hLhhhhhhhH.', '.hhhhhhhhhH.', '.hh.hhh.hHH.', '.h........H.', '.h........H.'],
    messy: ['..h.hhhh.h..', '..hLLhhhhhh.', '.hLhhhhhhhHH', '.hhhhhhhhhH.', '.hhhh.hhh.H.', '.h........H.', '.h........H.'],
    neat: ['...hhhhhh...', '..hhLLhhhh..', '.hLhhhhhhhH.', '.hhh.hhhhhH.', '.h........H.', '.h........H.'],
    bald: ['............', '............', '............', '............', '.h........H.', '.h........H.', '.h........H.'],
    bob: ['...hhhhhh...', '..hLLhhhhh..', '.hLhhhhhhhH.', '.hhhhhhhhhH.', 'hhhhhhhhhhHH', 'hh........HH', 'hh........HH', 'hh........HH', 'hh........HH', 'hh........HH', 'hH........HH'],
    long: ['...hhhhhh...', '..hLLhhhhh..', '.hLhhhhhhhH.', '.hhhh.hhhhH.', 'hhh......hHH', 'hh........HH', 'hh........HH', 'hh........HH', 'hh........HH', 'hh........HH', 'hH........HH', 'hH........HH'],
    bun: ['....hhhh....', '...hLhhhH...', '..hhhhhhhh..', '.hLhhhhhhhH.', '.hhhh.hhhhH.', '.h........H.', '.h........H.'],
    curly: ['..hh.hh.hh..', '.hLhhhhhhhh.', 'hhLhhhhhhhHH', 'hhhhhhhhhhHH', 'hhh.hhh.hhHH', 'hh........HH', '.h........H.'],
    beanie: ['...cccccc...', '..cWccccccC.', '.cWcccccccC.', '.cccccccccC.', '.CCCCCCCCCC.', '.h........H.', '.h........H.'],
    cap: ['............', '...cccccc...', '..cWccccccC.', '.ccccccccccC', 'kkkkkkkkCC..', '.h........H.', '.h........H.'],
    baker: ['..cccccccc..', '.cWWcccccccC', '.cWcccccccCC', '.cccccccccC.', '.CCCCCCCCCC.', '.h........H.', '.h........H.'],
    bandana: ['...cccccc...', '..cWcccccc..', '.cWcccccccC.', '.cccccccccC.', '.CCCCCCCCCC.', 'hh........HH', 'hh........H.', '.h..........'],
    // платок бабушки: светлый, с узором и каймой, плотно по щекам, из-под него — седая прядь; узел под подбородком
    scarf: ['...cccccc...', '..cWckcckc..', '.cWcccccckC.', '.ckcccckccC.', '.qqqqqqqqqq.', 'ch........Hc', 'c..........C', 'c..........C', 'c..........C', 'c..........C', '.c........C.', '..cc.CC.CC..'],
  };

  // Тело 12×14 (строки 11..24 фигуры). t/T — верх, a/A — фартук, p/P — низ, f/F — обувь, s — руки.
  const LEGS = { 0: ['...pp..PP...', '...pp..PP...', '...pp..PP...', '..fff..FFF..'], 1: ['...pp..PP...', '..pp....PP..', '..pp....PP..', '.fff....FFF.'], 2: ['...pp.PP....', '....pp.PP...', '....ppPP....', '...fffFFF...'] };
  const TORSO = {
    front: ['.....sS.....', '...ttttTT...', '..tttttttT..', '.tttttttttT.', '.tttttttttT.', '.tttttttttT.', '.tttttttttT.', '.sttttttttS.', '.s.pppppP.S.', '...pppPPP...'],
    apron: ['.....sS.....', '...tatAaT...', '..ttaaaaaT..', '.ttaaaaaaTT.', '.ttaaaaaaTT.', '.ttaaaaaATT.', '.ttaaaaaATT.', '.saaaaaaAAS.', '.s.aaaaaA.S.', '...pppPPP...'],
    coat: ['.....sS.....', '...tttwTT...', '..tttwwttT..', '.ttttttttTT.', '.tttttttttT.', '.ttttt.ttTT.', '.tttttttttT.', '.stttttttTS.', '.s.tttttTT.S', '...tttTTT...'],
    dress: ['.....sS.....', '...ttttTT...', '..tttttttT..', '.tttttttttT.', '.tttttttttT.', '.tttttttttT.', '.ttttttttTT.', '.sttttttttS.', '.stttttttTTS', '..tttttTTT..'],
    back: ['.....sS.....', '...ttttTT...', '..tttttttT..', '.tttttttttT.', '.tttttttttT.', '.tttttttttT.', '.ttttaAtttT.', '.stttttttTS.', '.s.pppppP.S.', '...pppPPP...'],
  };

  // Лицо и эмоции в маленьком спрайте (координаты головы)
  function face(b, ox, oy, sp, emo) {
    const e = K.eye;
    const L = [ox + 3, oy + 6], R = [ox + 8, oy + 6];
    if (emo === 'happy') {
      b.set(L[0] - 1, L[1] + 1, e); b.set(L[0], L[1], e); b.set(L[0] + 1, L[1] + 1, e);
      b.set(R[0] - 1, R[1] + 1, e); b.set(R[0], R[1], e); b.set(R[0] + 1, R[1] + 1, e);
    } else if (emo === 'closed') {
      b.hl(L[0] - 1, L[1] + 1, 2, e); b.hl(R[0], R[1] + 1, 2, e);
    } else if (emo === 'tired') {
      b.hl(L[0] - 1, L[1] + 1, 2, e); b.hl(R[0], R[1] + 1, 2, e); b.set(L[0], L[1] + 2, K.skinD[sp.skin || 0]); b.set(R[0], R[1] + 2, K.skinD[sp.skin || 0]);
    } else {
      b.vl(L[0], L[1], 2, e); b.vl(R[0], R[1], 2, e);
      if (emo === 'surprised') { b.vl(L[0] - 1, L[1], 2, e); b.vl(R[0] + 1, R[1], 2, e); }
    }
    if (sp.glasses) {
      const g = sp.glasses;
      [L, R].forEach(([x, y]) => { b.hl(x - 1, y - 1, 3, g); b.set(x - 1, y, g); b.set(x + 1, y, g); b.set(x + 1, y + 1, mix(sp.skinc, '#ffffff', 0.5)); });
      b.hl(L[0] + 2, L[1] - 1, 3, g);
    }
    const br = sp.brow || mix(sp.hairc, K.ol, 0.3);
    if (emo === 'angry') { b.set(L[0] - 1, L[1] - 2, br); b.set(L[0], L[1] - 1, br); b.set(R[0] + 1, R[1] - 2, br); b.set(R[0], R[1] - 1, br); }
    if (emo === 'sad' || emo === 'worried') { b.set(L[0] + 1, L[1] - 2, br); b.set(L[0], L[1] - 1, br); b.set(R[0] - 1, R[1] - 2, br); b.set(R[0], R[1] - 1, br); }
    if (sp.brows && emo !== 'angry' && emo !== 'sad' && emo !== 'worried') { b.hl(L[0] - 1, L[1] - 2, 3, br); b.hl(R[0] - 1, R[1] - 2, 3, br); }
    if (emo !== 'sad' && emo !== 'tired') { b.set(ox + 1, oy + 8, K.blush, emo === 'happy' ? 0.9 : 0.45); b.set(ox + 10, oy + 8, K.blush, emo === 'happy' ? 0.9 : 0.45); }
    const m = K.mouth, my = oy + 9;
    if (sp.mustache) { b.hl(ox + 3, oy + 8, 6, sp.mustache); b.set(ox + 3, oy + 9, sp.mustache); b.set(ox + 8, oy + 9, sp.mustache); }
    if (sp.beard) { b.hl(ox + 2, oy + 10, 8, sp.beard, 0.55); b.hl(ox + 3, oy + 11, 6, sp.beard, 0.55); }
    if (emo === 'happy') { b.hl(ox + 4, my, 4, m); b.hl(ox + 5, my + 1, 2, '#e46b5c'); }
    else if (emo === 'sad') { b.hl(ox + 5, my, 2, m); b.set(ox + 4, my + 1, m); b.set(ox + 7, my + 1, m); }
    else if (emo === 'angry') { b.hl(ox + 4, my + 1, 4, m); }
    else if (emo === 'surprised') { b.rect(ox + 5, my, 2, 2, m); }
    else if (emo === 'smile' || emo === 'smirk') { b.set(ox + 4, my, m); b.hl(ox + 5, my + 1, 2, m); b.set(ox + 7, my, m); }
    else if (emo === 'tired') { b.hl(ox + 5, my + 1, 2, m); }
    else { b.hl(ox + 5, my, 2, m); }
  }

  // Маленькая фигура (16×30 с полями). opt: view 'front'|'back', emo, body, pose 'wave'|'hold'|'point'|null, step 0/1/2, upper (только верх), drop (капля пота)
  function figure(sp, opt = {}) {
    const view = opt.view || 'front', emo = opt.emo || 'neutral', body = opt.body || sp.body || (sp.apron ? 'apron' : sp.coat ? 'coat' : 'front');
    const b = new Buf(16, 30), ox = 2, oy = 1;
    const sk = sp.skin || 0; sp.skinc = K.skin[sk]; sp.hairc = sp.hair[0];
    const pal = {
      s: K.skin[sk], S: K.skinT[sk], h: sp.hair[0], H: sp.hair[1], L: sp.hair[2] || sp.hair[0], x: sp.hair[0],
      t: sp.top[0], T: sp.top[1], w: sp.top[2] || mix(sp.top[0], '#ffffff', 0.3),
      a: (sp.apron || [])[0], A: (sp.apron || [])[1], p: sp.pants[0], P: sp.pants[1], f: sp.shoes[0], F: sp.shoes[1],
      c: (sp.hat || [])[0], C: (sp.hat || [])[1], W: (sp.hat || [])[2], k: (sp.hat || [])[3], q: (sp.hat || [])[4] || (sp.hat || [])[3],
    };
    // тело: торс + ноги (шаг)
    const torso = view === 'back' ? TORSO.back : (TORSO[body] || TORSO.front);
    const rows = torso.concat(LEGS[opt.step || 0] || LEGS[0]);
    let use = rows.slice(0, opt.upper ? 9 : rows.length);
    // позы: руки
    if (opt.pose && view !== 'back') {
      use = use.map((r) => r.split(''));
      if (opt.pose === 'wave') { use[7][10] = '.'; use[8][10] = '.'; }
      if (opt.pose === 'hold' || opt.pose === 'tray') { use[7][1] = '.'; use[8][1] = '.'; use[7][10] = '.'; use[8][10] = '.'; }
      use = use.map((r) => r.join(''));
    }
    b.map(ox, oy + 11, use, pal);
    if (opt.pose === 'wave' && view !== 'back') { b.vl(ox + 11, oy + 13, 3, pal.t); b.vl(ox + 11, oy + 9, 4, pal.s); b.set(ox + 12, oy + 8, pal.s); b.set(ox + 11, oy + 8, pal.S); }
    if ((opt.pose === 'hold' || opt.pose === 'tray') && view !== 'back') { b.hl(ox + 2, oy + 18, 2, pal.s); b.hl(ox + 8, oy + 18, 2, pal.S); }
    if (view === 'back' && sp.apron) { b.set(ox + 5, oy + 17, sp.apron[0]); b.set(ox + 6, oy + 17, sp.apron[1]); b.set(ox + 4, oy + 18, sp.apron[0]); b.set(ox + 7, oy + 18, sp.apron[1]); }
    // голова
    const hs = HAIR[sp.hairStyle] || HAIR.short;
    if (view === 'back') {
      const sc = sp.hairStyle === 'scarf';
      const back = FACE.map((r, j) => r.replace(/[sS]/g, (m, i) => (j < (sc ? 12 : 10) ? (i > 8 ? (sc ? 'C' : 'H') : (sc ? 'c' : 'h')) : m)));
      b.map(ox, oy, back, pal);
      b.map(ox, oy, hs.map((r) => r.replace(/\./g, ' ')), pal);
      if (sp.hairStyle === 'bun' || (sp.hat && sp.hairStyle === 'bandana')) { b.rect(ox + 4, oy + 8, 4, 3, sp.hair[0]); b.hl(ox + 5, oy + 11, 2, sp.hair[1]); }
      if (sc) { b.rect(ox + 4, oy + 11, 4, 3, pal.c); b.set(ox + 5, oy + 12, pal.k); }
      if (sp.hairStyle === 'bald') { b.rect(ox + 2, oy + 0, 8, 4, K.skin[sk]); b.hl(ox + 3, oy + 1, 3, '#ffffff', 0.35); }
    } else {
      b.map(ox, oy, FACE, pal);
      b.map(ox, oy, hs, pal);
      if (sp.hairStyle === 'bald') b.hl(ox + 4, oy + 1, 2, '#ffffff', 0.4);
      face(b, ox, oy, sp, emo);
      if (sp.hairStyle === 'scarf') { b.rect(ox + 5, oy + 11, 2, 2, pal.C); b.set(ox + 4, oy + 12, pal.c); b.set(ox + 7, oy + 12, pal.c); }
    }
    const o = b.outline(K.ol, 0.6);
    if (opt.drop) { o.set(ox + 12, oy + 3, K.sweat); o.set(ox + 12, oy + 4, K.sweat); o.set(ox + 11, oy + 4, '#bfe6f7'); o.set(ox + 13, oy + 4, '#3f8fb8'); o.set(ox + 12, oy + 5, '#3f8fb8'); }
    return o;
  }

  /* ---------- иконки 7×7 и пузыри ---------- */
  const ICON = {
    cup: { rows: ['..s.s..', '.s.s...', 'wwwww..', 'wkkkwww', 'wwwwd.w', 'wwwwdww', '.wwd...'], pal: { s: '#b9c3cc', w: '#f5efe3', k: '#6a4028', d: '#c9b8a2' } },
    latte: { rows: ['.......', 'fffff..', 'fbfbfww', 'fffffdw', 'wwwwd.w', 'wwwwdww', '.wwd...'], pal: { f: '#f4dfc2', b: '#b86a1c', w: '#f5efe3', d: '#c9b8a2' } },
    glass: { rows: ['.g...g.', '.gfffg.', '.gfffg.', '.gbbbg.', '.gbbbg.', '.gcccg.', '..ggg..'], pal: { g: '#cfe8f0', f: '#f4dfc2', b: '#c89868', c: '#8a5a34' } },
    tea: { rows: ['...g...', '..g....', 'ccccc..', 'cttcc.c', 'cttcc.c', 'ccccc..', '.ccc...'], pal: { g: '#5d8c46', c: '#f5efe3', t: '#b8741c' } },
    croissant: { rows: ['.......', '..ccc..', '.cdcdc.', 'cdcccdc', 'cc...cc', 'c.....c', '.......'], pal: { c: '#e59a3e', d: '#b86a1c' } },
    echpochmak: { rows: ['...c...', '..ccc..', '..cdc..', '.ccdcc.', '.cdcdc.', 'ccccccc', '.......'], pal: { c: '#e5a94a', d: '#b8741c' } },
    bun: { rows: ['.......', '.cccc..', 'cdddcc.', 'cdccdc.', 'cddddc.', '.cccc..', '.......'], pal: { c: '#e59a3e', d: '#b86a1c' } },
    chakchak: { rows: ['..y.y..', '.yyyyy.', 'yyYyYyy', 'yYyyyYy', 'ppppppp', '.PPPPP.', '.......'], pal: { y: '#f2c14e', Y: '#c8871c', p: '#e8e2d6', P: '#b8b0a2' } },
    loaf: { rows: ['.......', '..ccc..', '.cdcdc.', 'ccccccc', 'cCCCCCc', '.......', '.......'], pal: { c: '#d9a05a', d: '#8a5222', C: '#a8682a' } },
    baguette: { rows: ['.....cc', '....cdc', '...cdc.', '..cdc..', '.cdc...', 'cdc....', 'cc.....'], pal: { c: '#e0a860', d: '#9a5a22' } },
    cake: { rows: ['...r...', '.wwwww.', '.pppppp', '.wwwwww', '.pppppp', '.bbbbbb', '.......'], pal: { r: '#e2553f', w: '#fbf6ec', p: '#f0a0b4', b: '#b8741c' } },
    heart: { rows: ['.......', '.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], pal: { r: '#e2553f', w: '#ffb3a3' } },
    bang: { rows: ['..r....', '..r....', '..r....', '..r....', '..r....', '.......', '..r....'], pal: { r: '#d0402c' } },
    dots: { plain: 1, rows: ['.......', '.......', '.......', '.......', 'k.k.k..', '.......', '.......'], pal: { k: '#5d6576' } },
    note: { plain: 1, rows: ['...kk..', '...k.k.', '...k...', '...k...', '.kkk...', 'kkkk...', '.kk....'], pal: { k: '#3b8796' } },
    angry: { rows: ['r.r.r..', '.rrr...', 'rr.rr..', '.rrr...', 'r.r.r..', '.......', '.......'], pal: { r: '#d0402c' } },
    zzz: { plain: 1, rows: ['..kkk..', '....k..', '...k...', '..kkk..', '.......', '.......', '.......'], pal: { k: '#5d6576' } },
    star: { rows: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'], pal: { y: '#e3b341' } },
    coin: { rows: ['..yyy..', '.yYYYy.', 'yYyyyYy', 'yYyyyYy', 'yYyyyYy', '.yYYYy.', '..yyy..'], pal: { y: '#f2c14e', Y: '#b8841c' } },
    rub: { rows: ['.gggg..', '.g...g.', '.g...g.', 'ggggg..', '.g.....', 'gggg...', '.g.....'], pal: { g: '#c0412d' } },
    clock: { rows: ['.kkkkk.', 'kwwkwwk', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', 'kwwwwwk', '.kkkkk.'], pal: { k: '#5d6576', w: '#f5efe3' } },
    no: { plain: 1, rows: ['r.....r', '.r...r.', '..r.r..', '...r...', '..r.r..', '.r...r.', 'r.....r'], pal: { r: '#d0402c' } },
    drop: { plain: 1, rows: ['...b...', '..bbb..', '.bbwbb.', '.bbbbb.', '..bbb..', '.......', '.......'], pal: { b: '#5aa8d8', w: '#dff1f8' } },
  };
  function icon(b, x, y, name, outline = true) {
    const ic = ICON[name]; if (!ic) return;
    if (!outline || ic.plain) { b.map(x, y, ic.rows, ic.pal); return; }
    b.blit(memo('ic|' + name, () => { const t = new Buf(9, 9); t.map(1, 1, ic.rows, ic.pal); return t.outline('#3a2426', 0.7); }), x - 1, y - 1);
  }
  // иконка «нет …»: сама иконка + красный крест поверх
  function iconNo(b, x, y, name) { icon(b, x, y, name); icon(b, x, y, 'no'); }
  // пузырь с иконками; хвостик вниз; tone: 'norm' | 'hot' | 'bad' | 'good'
  function bubble(b, x, y, icons, tone = 'norm') {
    x = Math.round(x); y = Math.round(y);
    const w = icons.length * 9 + 4, h = 13;
    const edge = tone === 'hot' ? '#c46f17' : tone === 'bad' ? '#c0412d' : tone === 'good' ? '#2f8a57' : '#3a2a2a';
    const fill = tone === 'hot' ? '#fff3dc' : '#fffaf0';
    b.rect(x + 1, y, w - 2, 1, edge); b.rect(x + 1, y + h - 1, w - 2, 1, edge); b.rect(x, y + 1, 1, h - 2, edge); b.rect(x + w - 1, y + 1, 1, h - 2, edge);
    b.rect(x + 1, y + 1, w - 2, h - 2, fill);
    b.hl(x + 1, y + h - 2, w - 2, mix(fill, '#c9b79a', 0.45));
    const tx = x + Math.floor(w / 2) - 1;
    b.hl(tx, y + h - 1, 3, fill); b.set(tx - 1, y + h - 1, edge); b.set(tx + 3, y + h - 1, edge);
    b.set(tx, y + h, edge); b.set(tx + 1, y + h, fill); b.set(tx + 2, y + h, edge); b.set(tx + 1, y + h + 1, edge);
    icons.forEach((n, i) => { if (n && n.slice(0, 3) === 'no:') iconNo(b, x + 3 + i * 9, y + 3, n.slice(3)); else icon(b, x + 3 + i * 9, y + 3, n); });
    return w;
  }
  const bubbleW = (n) => n * 9 + 4;
  // шкала терпения над гостем
  function patience(b, x, y, w, t) {
    b.rect(x, y, w, 3, '#3a2a2a'); b.rect(x + 1, y + 1, w - 2, 1, '#5a4a45');
    const c = t > 0.6 ? '#52b67f' : t > 0.3 ? '#e5b53c' : '#e2553f';
    b.rect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * t)), 1, c);
  }

  /* ---------- портрет 48×48 ---------- */
  // p: {skin, hair:[h,H,L], hairStyle, top:[t,T], bg, glasses, mustache, beard, age, hat, lips, brows, earring, lashes}
  function portrait(p, emo = 'neutral', size = 48) {
    const b = new Buf(size, size), cx = 24, cy = 23;
    const sk = K.skin[p.skin || 0], skT = K.skinT[p.skin || 0], skD = K.skinD[p.skin || 0];
    const [h, hS, hL] = p.hair;
    if (p.bg) { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) b.set(x, y, bay(x, y) < y / size * 0.6 ? p.bg[1] : p.bg[0]); }
    const P = new Buf(size, size); // слой персонажа (для контура)
    const hw = (y) => { // полуширина головы
      const t = (y - cy) / 13; if (Math.abs(t) > 1) return -1;
      let w = 10.5 * Math.sqrt(1 - t * t); if (t > 0.25) w *= 1 - (t - 0.25) * 0.55; return w;
    };
    // волосы сзади (длинные)
    if (p.hairStyle === 'long' || p.hairStyle === 'bob') {
      const bot = p.hairStyle === 'long' ? 44 : 34;
      P.poly([[cx - 13, 16], [cx + 13, 16], [cx + 14, bot], [cx - 14, bot]], h);
      P.poly([[cx + 7, 18], [cx + 13, 16], [cx + 14, bot], [cx + 8, bot]], hS);
    }
    // платок: концы спадают на плечи треугольником сзади
    if (p.hairStyle === 'scarf') { const [c, C2] = p.hat; P.poly([[cx - 15, 30], [cx + 15, 30], [cx + 19, 47], [cx - 19, 47]], c); P.poly([[cx + 5, 30], [cx + 15, 30], [cx + 19, 47], [cx + 8, 47]], C2); }
    // плечи и одежда
    P.poly([[cx - 16, 48], [cx - 14, 39], [cx - 7, 35], [cx + 7, 35], [cx + 14, 39], [cx + 16, 48]], p.top[0]);
    P.poly([[cx + 5, 35], [cx + 7, 35], [cx + 14, 39], [cx + 16, 48], [cx + 7, 48]], p.top[1]);
    P.rect(cx - 4, 32, 8, 6, skT); P.rect(cx - 4, 32, 5, 5, sk); P.hl(cx - 4, 36, 8, skD);
    if (p.collar === 'v') P.poly([[cx - 4, 36], [cx + 4, 36], [cx, 42]], skT);
    if (p.collar === 'shirt') { P.poly([[cx - 5, 35], [cx, 40], [cx - 2, 42], [cx - 7, 37]], '#f5efe3'); P.poly([[cx + 5, 35], [cx, 40], [cx + 2, 42], [cx + 7, 37]], '#e3dccd'); P.vl(cx, 40, 8, p.tie || p.top[1]); }
    if (p.collar === 'hood') { P.poly([[cx - 9, 35], [cx - 3, 37], [cx - 4, 40], [cx - 11, 38]], p.top[1]); P.poly([[cx + 9, 35], [cx + 3, 37], [cx + 4, 40], [cx + 11, 38]], p.top[1]); P.vl(cx - 2, 40, 5, '#f5efe3'); P.vl(cx + 2, 40, 4, '#f5efe3'); }
    if (p.apron) { P.poly([[cx - 9, 48], [cx - 8, 40], [cx + 8, 40], [cx + 9, 48]], p.apron[0]); P.poly([[cx + 3, 40], [cx + 8, 40], [cx + 9, 48], [cx + 4, 48]], p.apron[1]); P.line(cx - 8, 40, cx - 5, 35, p.apron[1]); P.line(cx + 8, 40, cx + 5, 35, p.apron[1]); }
    // уши (у платка закрыты)
    if (p.hairStyle !== 'scarf') { P.ellipse(cx - 10.5, 25, 2.2, 3, sk); P.ellipse(cx + 10.5, 25, 2.2, 3, skT); P.set(cx - 11, 25, skD); P.set(cx + 11, 25, skD); }
    if (p.earring) { P.set(cx - 11, 28, p.earring); P.set(cx + 11, 28, p.earring); }
    // лицо с мягкой тенью справа (дизеринг)
    for (let y = 10; y <= 36; y++) { const w = hw(y); if (w < 0) continue; for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) {
      const u = (x - cx) / w; let c = sk;
      if (u > 0.45 + (bay(x, y) - 0.5) * 0.25) c = skT;
      if (y > 31 && u > -0.2) c = skT;
      P.set(x, y, c);
    } }
    // возраст: носогубные складки и морщинки у глаз
    if (p.age) { P.set(cx - 5, 28, skT); P.set(cx - 5, 29, skT); P.set(cx + 4, 28, skD); P.set(cx + 4, 29, skD); P.set(cx - 9, 22, skT); P.set(cx + 8, 22, skD); if (p.age > 1) { P.hl(cx - 3, 15, 5, skT); P.set(cx - 9, 23, skT); P.set(cx + 8, 23, skD); } }
    // нос: переносица, кончик с бликом, тень снизу
    P.set(cx, 23, mix(sk, '#ffffff', 0.18)); P.set(cx + 1, 24, skT); P.set(cx + 1, 25, skT); P.set(cx + 1, 26, skT); P.hl(cx - 1, 27, 3, skD); P.set(cx - 1, 26, mix(sk, '#ffffff', 0.3)); P.set(cx + 2, 27, skT);
    // глаза
    const ey = 22, lx = cx - 6, rx = cx + 3;
    const eye = (x, flip) => {
      if (emo === 'happy') { P.hl(x, ey + 1, 3, K.ol); P.set(x - 1, ey + 2, K.ol); P.set(x + 3, ey + 2, K.ol); return; }
      if (emo === 'closed') { P.hl(x, ey + 2, 3, K.ol); P.set(x + (flip ? 3 : -1), ey + 1, K.ol); return; }
      P.hl(x, ey, 3, K.white); P.hl(x, ey + 1, 3, K.white); P.hl(x, ey + 2, 3, mix(K.white, sk, 0.5));
      const px = x + (emo === 'smirk' ? (flip ? 1 : 0) + 1 : 1);
      P.rect(Math.min(px, x + 1), ey, 2, 3, p.eyec || '#3a2418'); P.rect(Math.min(px, x + 1), ey + 1, 2, 2, K.ol); P.set(Math.min(px, x + 1), ey, '#ffffff');
      P.hl(x - 1, ey - 1, 5, mix(K.ol, sk, 0.15)); // верхнее веко
      if (p.lashes) P.set(flip ? x + 3 : x - 1, ey - 2, K.ol);
      if (emo === 'surprised') P.hl(x, ey - 1, 3, K.white);
      if (emo === 'sad') P.hl(x, ey - 1, 3, mix(sk, K.ol, 0.2));
      if (emo === 'tired') { P.hl(x - 1, ey, 5, mix(sk, K.ol, 0.35)); P.hl(x, ey + 3, 3, skT); }
      if (emo === 'angry') P.set(flip ? x : x + 2, ey, mix(K.ol, sk, 0.15));
      if (p.age) P.set(flip ? x + 3 : x - 1, ey + 3, skT); // мешочки под глазами
    };
    eye(lx, false); eye(rx, true);
    // брови
    const bc = p.browc || mix(h, K.ol, 0.35), bw = p.brows ? 2 : 1;
    const brow = (x, side) => {
      for (let i = 0; i < 4; i++) {
        let dy = 0;
        if (emo === 'angry') dy = side < 0 ? Math.floor(i / 2) : Math.floor((3 - i) / 2);
        if (emo === 'sad' || emo === 'worried') dy = side < 0 ? -Math.floor(i / 2) + 1 : -Math.floor((3 - i) / 2) + 1;
        if (emo === 'surprised') dy = -1;
        if (emo === 'happy') dy = i === 0 || i === 3 ? 0 : -1;
        if (emo === 'smirk' && side > 0) dy = i >= 2 ? -1 : 0;
        for (let k = 0; k < bw; k++) P.set(x + i, ey - 3 + dy + k, bc);
      }
    };
    brow(lx - 1, -1); brow(rx, 1);
    if (emo === 'happy' || p.blush) { P.hl(cx - 9, 27, 2, K.blush); P.hl(cx + 6, 27, 2, K.blush); }
    if (emo === 'worried' || emo === 'tired') P.set(cx + 8, 18, K.sweat);
    // усы/борода
    if (p.beard) { for (let y = 26; y <= 36; y++) { const w = hw(y); if (w < 0) continue; for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) if (y > 29 || Math.abs(x - cx) > 4) P.set(x, y, p.beard[0], p.beard[1] * (y > 27 ? 1 : 0.6)); } }
    if (p.mustache) { P.hl(cx - 4, 29, 8, p.mustache); P.hl(cx - 5, 30, 3, p.mustache); P.hl(cx + 2, 30, 3, p.mustache); P.set(cx - 5, 31, p.mustache); P.set(cx + 4, 31, p.mustache); }
    // рот
    const my = 31, lips = p.lips || K.mouth;
    if (emo === 'happy') { P.hl(cx - 3, my, 6, K.ol); P.hl(cx - 2, my + 1, 4, '#b34a3c'); P.hl(cx - 1, my + 2, 2, '#e46b5c'); P.set(cx - 4, my - 1, K.ol); P.set(cx + 3, my - 1, K.ol); }
    else if (emo === 'smile') { P.hl(cx - 2, my + 1, 4, lips); P.set(cx - 3, my, lips); P.set(cx + 2, my, lips); }
    else if (emo === 'sad') { P.hl(cx - 2, my, 4, lips); P.set(cx - 3, my + 1, lips); P.set(cx + 2, my + 1, lips); }
    else if (emo === 'angry') { P.hl(cx - 3, my + 1, 6, lips); P.hl(cx - 2, my, 4, mix(lips, K.ol, 0.3)); }
    else if (emo === 'surprised') { P.rect(cx - 1, my, 3, 3, K.ol); P.set(cx, my + 1, '#b34a3c'); }
    else if (emo === 'smirk') { P.hl(cx - 2, my + 1, 3, lips); P.set(cx + 1, my, lips); P.set(cx + 2, my, lips); }
    else if (emo === 'worried') { P.hl(cx - 2, my + 1, 4, lips); P.set(cx - 3, my + 2, lips); P.set(cx + 2, my + 2, lips); }
    else if (emo === 'tired') { P.hl(cx - 1, my + 1, 3, lips); }
    else P.hl(cx - 2, my + 1, 4, lips);
    hairFront(P, p, cx, h, hS, hL);
    if (p.glasses) {
      const g = p.glasses;
      [lx - 1, rx - 1].forEach((x) => { P.hl(x, ey - 1, 5, g); P.hl(x, ey + 3, 5, g); P.vl(x, ey - 1, 5, g); P.vl(x + 4, ey - 1, 5, g); P.set(x + 1, ey, mix(K.white, '#bfe0ff', 0.5)); });
      P.hl(lx + 4, ey, rx - lx - 4, g);
    }
    b.blit(P.outline(K.ol, 0.55), 0, 0);
    return b;
  }
  function hairFront(P, p, cx, h, hS, hL) {
    const st = p.hairStyle, top = 8;
    const cap = (y0, y1) => { for (let y = y0; y <= y1; y++) { const t = (y - 23) / 13; const w = 11.5 * Math.sqrt(Math.max(0, 1 - t * t)); P.hl(Math.round(cx - w), y, Math.round(2 * w), h); P.hl(Math.round(cx + w * 0.45), y, Math.round(w * 0.55), hS); } };
    if (st === 'short' || st === 'messy' || st === 'neat' || st === 'curly' || st === 'bun' || st === 'long' || st === 'bob') {
      cap(top + 1, 17);
      if (st === 'short' || st === 'messy') { P.poly([[cx - 11, 15], [cx - 4, 15], [cx - 7, 19], [cx - 11, 22]], h); P.poly([[cx - 4, 15], [cx + 4, 15], [cx + 1, 19]], h); P.poly([[cx + 3, 15], [cx + 11, 15], [cx + 11, 22], [cx + 7, 18]], hS); }
      if (st === 'messy') { P.set(cx - 2, top, h); P.set(cx + 3, top, h); P.set(cx - 12, 17, h); P.set(cx - 12, 18, h); P.set(cx + 12, 16, hS); }
      if (st === 'neat') { P.poly([[cx - 11, 15], [cx - 2, 15], [cx - 11, 21]], h); P.poly([[cx - 1, 15], [cx + 11, 15], [cx + 11, 21], [cx + 6, 17]], hS); P.line(cx - 3, top + 2, cx - 1, 16, hS); }
      if (st === 'curly') { for (let i = 0; i < 18; i++) { const a = Math.PI * (1.05 + i / 17 * 0.9); P.ellipse(cx + Math.cos(a) * 11, 19 + Math.sin(a) * 11, 3, 3, i > 11 ? hS : h); } P.ellipse(cx - 12, 22, 3, 4, h); P.ellipse(cx + 12, 22, 3, 4, hS); }
      if (st === 'bun') { P.ellipse(cx, top - 1, 5, 4, h); P.ellipse(cx + 2, top - 1, 3, 3, hS); P.poly([[cx - 11, 15], [cx - 1, 14], [cx - 11, 20]], h); P.poly([[cx + 1, 14], [cx + 11, 15], [cx + 11, 20]], hS); P.set(cx - 2, top - 3, hL); P.set(cx - 3, top - 2, hL); }
      if (st === 'long' || st === 'bob') { P.poly([[cx - 12, 14], [cx + 1, 14], [cx - 5, 19], [cx - 12, 30]], h); P.poly([[cx + 1, 14], [cx + 12, 14], [cx + 12, 30], [cx + 7, 19]], hS); }
      for (let i = 0; i < 6; i++) P.set(cx - 7 + i, top + 3 - (i > 2 ? 1 : 0), hL);
      P.set(cx - 8, top + 4, hL); P.set(cx - 9, top + 5, hL);
    }
    if (st === 'bald') {
      P.poly([[cx - 12, 16], [cx - 9, 16], [cx - 9, 25], [cx - 12, 25]], h); P.poly([[cx + 9, 16], [cx + 12, 16], [cx + 12, 25], [cx + 9, 25]], hS);
      P.hl(cx - 5, 12, 4, '#ffffff', 0.45); P.hl(cx - 6, 13, 2, '#ffffff', 0.3);
    }
    if (st === 'baker') {
      const [c, C2, W] = p.hat;
      P.ellipse(cx, 9, 13, 7, c); P.ellipse(cx + 6, 10, 6, 5, C2);
      P.rect(cx - 11, 11, 22, 6, c); P.rect(cx + 5, 11, 6, 6, C2); P.hl(cx - 11, 16, 22, C2);
      P.hl(cx - 8, 5, 6, W); P.hl(cx - 10, 6, 3, W);
      P.poly([[cx - 11, 17], [cx - 8, 17], [cx - 9, 23], [cx - 11, 23]], h); P.poly([[cx + 8, 17], [cx + 11, 17], [cx + 11, 23], [cx + 9, 23]], hS);
    }
    if (st === 'bandana') {
      const [c, C2, W, k] = p.hat; cap(top + 1, 16);
      P.poly([[cx - 12, 11], [cx + 12, 11], [cx + 11, 17], [cx - 11, 17]], c); P.ellipse(cx, 11, 11, 5, c); P.poly([[cx + 5, 7], [cx + 12, 11], [cx + 11, 17], [cx + 5, 17]], C2);
      P.hl(cx - 11, 17, 22, C2); for (let i = 0; i < 5; i++) P.set(cx - 8 + i * 4, 13, k || W);
      P.hl(cx - 6, 8, 4, W);
      P.poly([[cx - 12, 17], [cx - 8, 17], [cx - 10, 24], [cx - 12, 24]], h); P.poly([[cx + 8, 17], [cx + 12, 17], [cx + 12, 23], [cx + 10, 23]], hS);
    }
    if (st === 'scarf') {
      // светлый платок с цветочным узором и цветной каймой: обтягивает голову и щёки, седая прядь надо лбом, узел под подбородком
      const [c, C2, W, k, band] = p.hat;
      for (let y = 5; y <= 17; y++) { const t = (y - 17) / 12, w = 13.5 * Math.sqrt(Math.max(0, 1 - t * t)); P.hl(Math.round(cx - w), y, Math.round(2 * w), c); P.hl(Math.round(cx + w * 0.35), y, Math.round(w * 0.65), C2); }
      // бока платка вдоль щёк — узкие, по форме лица
      for (let y = 17; y <= 34; y++) { const t = (y - 23) / 13, w = 10.5 * Math.sqrt(Math.max(0, 1 - t * t)) * (t > 0.25 ? 1 - (t - 0.25) * 0.55 : 1); const L0 = Math.round(cx - w) - 3, R0 = Math.round(cx + w); P.hl(L0, y, 4, c); P.hl(R0 - 1, y, 4, C2); }
      // кайма по краю вокруг лица
      for (let y = 17; y <= 33; y++) { const t = (y - 23) / 13, w = 10.5 * Math.sqrt(Math.max(0, 1 - t * t)) * (t > 0.25 ? 1 - (t - 0.25) * 0.55 : 1); P.set(Math.round(cx - w), y, band); P.set(Math.round(cx + w) - 1, y, band); }
      P.hl(cx - 10, 16, 20, band); P.hl(cx - 10, 17, 20, band);
      // седая прядь из-под платка
      P.hl(cx - 7, 18, 13, h); P.hl(cx - 8, 19, 4, h); P.hl(cx + 4, 19, 4, hS); P.hl(cx - 5, 18, 4, hL);
      // цветочный узор: крестики-цветы
      const flower = (x, y) => { P.set(x, y, k); P.set(x - 1, y, k); P.set(x + 1, y, k); P.set(x, y - 1, k); P.set(x, y + 1, k); P.set(x, y, W || '#e3b341'); };
      [[cx - 7, 9], [cx + 1, 7], [cx + 8, 11], [cx - 11, 14], [cx - 2, 13], [cx + 12, 21], [cx - 13, 24], [cx + 12, 29], [cx - 13, 31]].forEach(([x, y]) => flower(x, y));
      P.hl(cx - 9, 6, 5, mix(c, '#ffffff', 0.5)); P.hl(cx - 11, 7, 3, mix(c, '#ffffff', 0.5));
      // узел под подбородком и концы
      P.ellipse(cx, 37, 4, 2.5, C2); P.set(cx - 1, 36, c); P.poly([[cx - 2, 38], [cx + 1, 38], [cx - 4, 45], [cx - 6, 44]], c); P.poly([[cx, 38], [cx + 3, 38], [cx + 6, 44], [cx + 3, 45]], C2); P.set(cx - 5, 44, band); P.set(cx + 4, 44, band);
    }
    if (st === 'beanie') {
      const [c, C2, W] = p.hat; P.ellipse(cx, 13, 12, 8, c); P.rect(cx - 12, 13, 24, 5, c); P.rect(cx + 5, 10, 7, 8, C2); P.hl(cx - 12, 17, 24, C2); P.hl(cx - 7, 7, 4, W);
    }
  }

  /* ---------- окружение ---------- */
  function stars(b, x0, y0, w, h, n, seed, pal) {
    const r = rng(seed); pal = pal || ['#ffffff', '#fff3c8', '#cfe0ff', '#9fb4e8'];
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(r() * w), y = y0 + Math.floor(Math.pow(r(), 1.4) * h), k = r();
      const c = pal[Math.floor(r() * pal.length)];
      if (k > 0.97) { b.set(x, y, '#ffffff'); b.set(x - 1, y, c, 0.7); b.set(x + 1, y, c, 0.7); b.set(x, y - 1, c, 0.7); b.set(x, y + 1, c, 0.7); }
      else if (k > 0.9) { b.set(x, y, c); b.set(x + 1, y, c, 0.5); }
      else b.set(x, y, c, 0.35 + r() * 0.6);
    }
  }
  function motes(b, pts, n, seed, c, test) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = pts[0] + r() * pts[2], y = pts[1] + r() * pts[3];
      if (test && !test(x, y)) continue;
      const big = r() > 0.85; b.light(x, y, c, big ? 0.9 : 0.55);
      if (big) { b.light(x + 1, y, c, 0.3); b.light(x, y + 1, c, 0.3); }
    }
  }
  // Переосвещение: пиксель × (фон + Σ источников); источники квантуются ступенями с дизерингом Байера.
  // lights: [{ c, i, f: (x,y)→0..1 }]; skip(x,y) — не трогать (самосветящееся)
  function relight(b, amb, lights, opt = {}) {
    const steps = opt.steps || 6, A = C(amb).map((v) => v / 255), max = opt.max || 1.25, dz = opt.dither == null ? 1 : opt.dither, k0 = opt.k == null ? 1 : opt.k;
    const Ls = lights.map((L) => ({ c: L.c, i: L.i, f: L.f, cc: C(L.c).map((v) => v / 255) }));
    const x0 = opt.x0 || 0, y0 = opt.y0 || 0, x1 = opt.x1 == null ? b.w : opt.x1, y1 = opt.y1 == null ? b.h : opt.y1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * b.w + x) * 4, d = b.d; if (!d[i + 3]) continue; if (opt.skip && opt.skip(x, y)) continue;
      let r = A[0] * k0, g = A[1] * k0, bl = A[2] * k0;
      for (const L of Ls) {
        let v = L.f(x, y); if (v <= 0) continue;
        v = Math.floor(v * steps + 0.5 + (bay(x, y) - 0.5) * dz) / steps; if (v <= 0) continue;
        r += L.cc[0] * v * L.i; g += L.cc[1] * v * L.i; bl += L.cc[2] * v * L.i;
      }
      d[i] = Math.min(255, d[i] * Math.min(r, max)); d[i + 1] = Math.min(255, d[i + 1] * Math.min(g, max)); d[i + 2] = Math.min(255, d[i + 2] * Math.min(bl, max));
    }
  }
  const point = (cx, cy, r, pow = 1.5, ry) => (x, y) => { const dx = (x - cx) / r, dy = (y - cy) / (ry || r), dd = Math.sqrt(dx * dx + dy * dy); return dd >= 1 ? 0 : Math.pow(1 - dd, pow); };

  /* ---------- кэш готовых буферов ---------- */
  const MEMO = new Map(), MEMO_MAX = 260;
  function memo(key, fn) {
    let v = MEMO.get(key);
    if (v) { MEMO.delete(key); MEMO.set(key, v); return v; }
    v = fn(); MEMO.set(key, v);
    if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
    return v;
  }

  /* ---------- вывод на страницу ---------- */
  // буфер → canvas с целым множителем (размер задаётся стилем, если не задан классом)
  function show(buf, cv, scale) {
    buf.toCanvas(cv);
    if (scale) { cv.style.width = buf.w * scale + 'px'; cv.style.height = buf.h * scale + 'px'; }
    return cv;
  }
  const reduceMotion = () => !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  Object.assign(BK.Px || (BK.Px = {}), { Buf, C, mix, bay, rng, text, textW, relight, point, figure, bubble, bubbleW, icon, iconNo, ICON, patience, portrait, stars, motes, show, memo, K, reduceMotion });
})();
