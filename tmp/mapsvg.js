// SVG статичного слоя карты без браузера: проверяем, что разметка целая и что Уфа не изменилась.
const crypto = require('crypto');
const BK = require('../sim/load');
require('../src/ui/map.js');
const main = (process.argv[2] || 'all');
const cities = main === 'all' ? ['ufa', 'kazan', 'moscow', 'spb', 'sochi', 'nsk'] : [main];
for (const c of cities) {
  BK.useCity(c === 'ufa' ? null : c, 7919);
  const svgF = BK.mapStatic({ id: 'mm' });
  const svgL = BK.mapStatic({ id: 'mm', noLabels: true });
  const bad = /undefined|NaN|\[object/.test(svgF) ? ' ЕСТЬ МУСОР' : '';
  const h = crypto.createHash('sha1').update(svgF).digest('hex').slice(0, 12);
  console.log(`${c.padEnd(7)} ${svgF.length} симв. sha1 ${h} m-poi ${(svgF.match(/m-poi"/g) || []).length} m-road ${(svgF.match(/m-road/g) || []).length} m-rail ${(svgF.match(/m-rail/g) || []).length} m-dlabel ${(svgF.match(/m-dlabel/g) || []).length} m-klabel ${(svgF.match(/m-klabel/g) || []).length} ru ${(svgF.match(/m-river\b/g) || []).length}${bad}`);
}
