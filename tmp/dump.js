const BK = require('../sim/load');
for (const city of ['moscow','spb']) {
  BK.useCity(city, 7919);
  console.log('\n===', city, BK.CITY.name, 'inc', BK.CITY.inc, 'rent', BK.CITY.rent, 'wage', BK.CITY.wage, 'kmPerUnit', BK.CITY.kmPerUnit);
  for (const d of BK.DISTRICTS) console.log(` ${d.id.padEnd(10)} ${d.name.padEnd(20)} ${String(d.arch).padEnd(9)} ring${d.ring} w${d.w} x${d.x} y${d.y} rent[${d.rent}] solv[${d.solv}] tr[${d.traffic}] prod[${d.prodRent}] streets=${d.streets.length} ${d.streets.join('|')}`);
  console.log(' MAP keys:', Object.keys(BK.MAP), 'rivers', BK.MAP.rivers.length, 'parks', BK.MAP.parks.map(p=>p.name).join(','), 'prodGroups', JSON.stringify(BK.MAP.prodGroups), 'hq', JSON.stringify(BK.MAP.hq));
  console.log(' center', JSON.stringify(BK.CENTER_POINT));
}
