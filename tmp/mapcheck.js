const BK = require('../sim/load');
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L)); return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy)); };
const distPoly = (p, pts) => Math.min(...pts.slice(0, -1).map((a, i) => distSeg(p, a, pts[i + 1])));
const inPoly = (p, pts) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
let bad = 0;
for (const city of ['moscow', 'spb']) {
  BK.useCity(city, 7919);
  const M = BK.MAP;
  console.log(`\n=== ${city}: районов ${BK.DISTRICTS.length}, точек притяжения ${M.pois.length}`);
  for (const d of BK.DISTRICTS) {
    const rv = Math.min(...M.rivers.map((r) => distPoly(d, r.pts) - r.w / 2));
    const seaD = (M.sea || []).length ? (inPoly(d, M.sea[0].pts) ? -1 : distPoly(d, M.sea[0].pts.slice(0, -2))) : 999;
    const cityIn = inPoly(d, M.city);
    const nb = Math.min(...BK.DISTRICTS.filter((o) => o !== d).map((o) => Math.hypot(o.x - d.x, o.y - d.y)));
    const poisBad = (M.pois || []).filter((p) => p.d === d.id && (!inPoly(p, M.city) || Math.min(...M.rivers.map((r) => distPoly(p, r.pts) - r.w / 2)) < 6));
    const mark = (!cityIn ? ' ВНЕ ГОРОДА' : '') + (rv < 18 ? ` К РЕКЕ ${rv.toFixed(0)}` : '') + (seaD < 12 ? ` В ВОДЕ` : '') + (nb < 45 ? ` БЛИЗКО К ${nb.toFixed(0)}` : '') + (poisBad.length ? ` POI вне/в воде ${poisBad.length}` : '');
    if (mark) bad++;
    console.log(` ${d.id.padEnd(9)} ${d.name.padEnd(18)} река ${rv.toFixed(0).padStart(4)} море ${seaD === 999 ? '  —' : seaD.toFixed(0).padStart(4)} город ${cityIn ? 'да ' : 'НЕТ'} сосед ${nb.toFixed(0).padStart(3)}${mark}`);
  }
  for (const p of M.pois) if (!inPoly(p, M.city)) { console.log(`  ! POI «${p.name}» (${p.x},${p.y}) вне контура`); }
  const xs = M.city.map((p) => p[0]), ys = M.city.map((p) => p[1]);
  console.log(` контур x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`);
  for (const l of M.labels) console.log(` подпись «${l.text}» (${l.x},${l.y}) в городе ${inPoly({ x: l.x, y: l.y }, M.city)}`);
}
console.log(bad ? `\nпроблем: ${bad}` : '\nкарты в порядке');
// какие именно точки притяжения не проходят проверку
for (const city of ['moscow','spb']) { BK.useCity(city, 7919); const M = BK.MAP;
  for (const p of M.pois) { const rv = Math.min(...M.rivers.map((r) => distPoly(p, r.pts) - r.w/2)); if (!inPoly(p, M.city) || rv < 6) console.log(`  ${city} POI «${p.name}» (${p.x},${p.y}) город ${inPoly(p,M.city)} вода ${rv.toFixed(1)} район ${p.d}`); } }
