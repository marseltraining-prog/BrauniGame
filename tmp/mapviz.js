// Черновой растр карты города (без браузера): районы, вода, кольца, магистрали, ж/д, парки, соседство.
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const BK = require('../sim/load');
const city = process.argv[2] || 'moscow';
BK.useCity(city, 7919);
const W = 1000, H = 1000;
const px = Buffer.alloc(W * H * 3, 255);
const set = (x, y, r, g, b) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
const disc = (cx, cy, rad, r, g, b) => { for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad) set(cx + x, cy + y, r, g, b); };
const line = (a, b, rad, r, g, bl) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let i = 0; i <= n; i++) disc(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, rad, r, g, bl); };
const poly = (pts, rad, r, g, b, close) => { for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], rad, r, g, b); if (close && pts.length > 2) line(pts[pts.length - 1], pts[0], rad, r, g, b); };
const fillPoly = (pts, r, g, b) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } if (inside) set(x, y, r, g, b); } };
const M = BK.MAP;
if (M.city) fillPoly(M.city, 244, 240, 230);
for (const w of M.sea || []) fillPoly(w.pts, 190, 220, 235);
for (const w of M.sea || []) poly(w.pts.slice(0, -2), 1, 90, 130, 170, false);
for (const rd of M.roads || []) { const c = rd.ring ? [120, 100, 80] : [160, 150, 135]; poly(rd.pts, rd.ring ? 1 : 0.6, c[0], c[1], c[2], rd.ring); }
poly(M.city, 1, 120, 110, 95, true);
for (const rv of M.rivers || []) poly(rv.pts, Math.max(1, rv.w / 2), 70, 140, 170, false);
for (const rl of (M.rails || (M.rail ? [M.rail] : []))) { for (let i = 0; i < rl.length - 1; i++) { const a = rl[i], b = rl[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let k = 0; k <= n; k++) { if (k % 8 < 4) set(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 60, 60, 60); } } }
for (const p of M.parks || []) disc(p.x, p.y, p.r, 170, 220, 170);
for (const p of M.pois || []) disc(p.x, p.y, 3, 230, 120, 60);
disc(M.station.x, M.station.y, 5, 0, 0, 0);
const COL = [[200, 40, 40], [40, 90, 220], [30, 150, 60], [200, 120, 0], [140, 40, 180], [0, 150, 150], [200, 40, 140], [90, 90, 90], [20, 20, 20], [160, 80, 40], [60, 60, 200], [10, 120, 90]];
BK.DISTRICTS.forEach((d, i) => { disc(d.x, d.y, 6, ...COL[i % COL.length]); disc(d.x, d.y, 2, 255, 255, 255);
  const lx = d.x + (d.lx || 0), ly = d.y + (d.ly != null ? d.ly : -44); disc(lx, ly, 2, ...COL[i % COL.length]); line([d.x, d.y], [lx, ly], 0.6, ...COL[i % COL.length]); });
function crc32(buf) { let c, crc = 0xffffffff; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const out = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, 'map-' + city + '.png'), out);
console.log('→ tmp/map-' + city + '.png');
BK.DISTRICTS.forEach((d, i) => console.log(` ${String(i).padStart(2)} ${d.id} ${d.name} (${d.x},${d.y}) подпись (${d.x + (d.lx || 0)},${d.y + (d.ly != null ? d.ly : -44)}) arch=${d.arch}`));
