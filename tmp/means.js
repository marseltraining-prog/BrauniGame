const BK = require('../sim/load');
// средние множители соседства по всем LANDMARKS — эталон для сравнения с районами
const all = BK.LANDMARKS; const mean = (k) => all.reduce((a,l)=>a+l[k],0)/all.length;
console.log('эталон:', { tr: mean('tr').toFixed(4), solv: mean('solv').toFixed(4), rent: mean('rent').toFixed(4) });
for (const city of ['moscow','spb']) {
  BK.useCity(city, 7919);
  let sw=0, sr=0, ss=0, st=0, wsum=0;
  for (const d of BK.DISTRICTS) {
    const lms = d.lm.map(id => BK.LANDMARKS.find(l=>l.id===id));
    if (lms.some(l=>!l)) throw new Error('неизвестный сосед в '+d.id+': '+d.lm);
    const m = (k) => lms.reduce((a,l)=>a+l[k],0)/lms.length;
    wsum += d.w; sw += d.w*m('solv'); sr += d.w*m('rent'); st += d.w*m('tr');
    console.log(` ${d.id.padEnd(9)} ${d.name.padEnd(18)} ${d.arch.padEnd(10)} w${d.w} solv×${m('solv').toFixed(3)} tr×${m('tr').toFixed(3)} rent×${m('rent').toFixed(3)} [${d.rent}] [${d.solv}] [${d.traffic}] pois=${d.pois?d.pois.length:0}`);
  }
  console.log(`${city}: взвешенные средние solv×${(ss/wsum).toFixed(4)} tr×${(st/wsum).toFixed(4)} rent×${(sr/wsum).toFixed(4)} (Σw=${wsum})`);
  console.log(`  prodGroups ${JSON.stringify(BK.MAP.prodGroups)} center ${JSON.stringify(BK.CENTER_POINT)} pois ${BK.MAP.pois.length} roads ${BK.MAP.roads.length} rails ${BK.MAP.rails.length} rivers ${BK.MAP.rivers.length} parks ${BK.MAP.parks.length}`);
}
