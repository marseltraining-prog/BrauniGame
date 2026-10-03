// Регрессия городских коэффициентов: одна и та же экономика точки должна получать
// одинаковые inc/rent/wage в первом акте и в агрегированной модели второго.
const BK = require('./load');
const E = BK.Engine;

let bad = 0;
function ok(v, text, extra) {
  if (!v) bad++;
  console.log(`${v ? '✓' : '✗'} ${text}${extra == null ? '' : ` — ${extra}`}`);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const U = E.newGame({ seed: 7919 });
const uCity = Object.assign({}, BK.CITY);
const uCenter = BK.DISTRICTS.find((d) => d.id === 'center');
const M = E.newGame({ seed: 7919, city: 'moscow' });
const mCity = Object.assign({}, BK.CITY);
const mCenter = BK.DISTRICTS.find((d) => d.arch === 'center');

ok(uCity.inc === 1 && uCity.rent === 1 && uCity.wage === 1,
  'Уфа публикует базовые коэффициенты inc/rent/wage');
ok(mCity.inc === 1.8 && mCity.rent === 3 && mCity.wage === 1.7,
  'Москва публикует коэффициенты из CITIES', `${mCity.inc}/${mCity.rent}/${mCity.wage}`);
const r5 = (v) => Math.round(v / 5) * 5;
ok(mCenter && uCenter && near(mCenter.solv[0], r5(uCenter.solv[0] * mCity.inc))
  && near(mCenter.solv[1], r5(uCenter.solv[1] * mCity.inc)),
  'одинаковый район получает московский inc', `${mCenter && mCenter.solv} против ${uCenter.solv}`);
ok(mCenter && uCenter && near(mCenter.rent[0], uCenter.rent[0] * mCity.rent)
  && near(mCenter.rent[1], uCenter.rent[1] * mCity.rent),
  'одинаковый район получает московский rent', `${mCenter && mCenter.rent} против ${uCenter.rent}`);
ok(M.market.seller === Math.round(U.market.seller * mCity.wage)
  && M.market.baker === Math.round(U.market.baker * mCity.wage),
  'первый акт применяет московский wage к обеим профессиям', `${M.market.seller}/${M.market.baker}`);

M.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE;
BK.Corp.check(M);
const home = M.corp.cities.ufa;
const base = BK.Corp.corpMarket(M);
ok(near(base.seller, U.market.seller) && near(base.baker, U.market.baker),
  'второй акт восстанавливает базовый рынок без двойного wage', `${base.seller}/${base.baker}`);
ok(BK.Corp._int.cityDef(M, 'ufa').id === 'moscow',
  'домашний ключ второго акта сохраняет экономику стартового города');
ok(near(BK.Corp._int.salaryCity(M, home, 1), M.market.seller),
  'агрегированная модель использует тот же московский wage, что первый акт');

console.log(bad ? `✗ ошибок: ${bad}` : '✓ city coefficients: ok');
process.exit(bad ? 1 : 0);
