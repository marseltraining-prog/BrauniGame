/* Большая сеть второго акта: 800–1000 точек. Берёт сохранение sim/perf.js (--save) или играет сам (--make) и размножает упакованные
   точки городов до нужного числа (копии с новыми id), затем меряет размер сохранения и время месяца.
   Запуск: node sim/perf.js 30 7919 --save=/tmp/p.json && node sim/perf-big.js /tmp/p.json [точек=1000] */
'use strict';
const fs = require('fs');
const BK = require('./load'), E = BK.Engine;
// node sim/perf-big.js --make <выход.json> [точек] — сам играет бот good --corp 30 лет (сид 7919) и пишет большое состояние
const argv = process.argv.slice(2), make = argv[0] === '--make';
let S0, want;
if (make) {
  want = +(argv[2] || 1000);
  const { play } = require('./bot');
  S0 = play({ level: 'good', seed: 7919, years: 30, corp: true, corpOpt: { level: 'good' } }).S;
  // как sim/perf.js: без заметок бота (_bot) — в сохранении игрока их нет
  S0 = JSON.parse(JSON.stringify(Object.assign({}, S0, { cache: undefined, notify: [], _botRng: undefined }), (k, v) => (k === '_bot' ? undefined : v)));
} else {
  const rest = argv.filter((a, i) => a !== '--save' && argv[i - 1] !== '--save');
  want = +(rest[1] || 1000);
  S0 = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
}
BK.Corp.ensure(S0);
const packedIds = Object.keys(S0.corp.cities).filter((id) => S0.corp.cities[id].packed);
const count = (S) => S.stores.length + Object.values(S.corp.cities).reduce((a, c) => a + (c.packed ? c.packed.stores.length : 0), 0);
let n = count(S0), k = 0;
while (n < +want) {
  const c = S0.corp.cities[packedIds[k++ % packedIds.length]], src = c.packed.stores[k % c.packed.stores.length];
  const cp = JSON.parse(JSON.stringify(src)); cp.id = src.id + 'x' + k; cp.num = (c.numSeq = (c.numSeq || 0) + 1);
  c.packed.stores.push(cp); n++;
}
const json = JSON.stringify(Object.assign({}, S0, { cache: undefined, notify: [] }));
const out = make ? argv[1] : (argv.indexOf('--save') >= 0 ? argv[argv.indexOf('--save') + 1] : null);
if (out) { fs.mkdirSync(require('path').dirname(out), { recursive: true }); fs.writeFileSync(out, json); } // для qa/bigsave.js
console.log(`точек ${count(S0)} в ${Object.keys(S0.corp.cities).length} городах · сохранение ${(json.length / 1024).toFixed(0)} КБ`);
const nextFirst = (st) => { let d = st.day + 1; while (E.dateOf(d).d !== 1) d++; return d; };
const agg = [], full = [], day = [];
for (let i = 0; i < 8; i++) {
  const A = JSON.parse(json); BK.Corp.ensure(A); A.notify = [];
  const d1 = nextFirst(A);
  while (A.day < d1 - 1) { const t = process.hrtime.bigint(); E.tick(A); day.push(Number(process.hrtime.bigint() - t) / 1e6); A.notify = []; if (A.ev.pending) A.ev.pending = null; if (A.chef.pending) A.chef.pending = null; }
  const B = JSON.parse(JSON.stringify(A)); BK.Corp.ensure(B);
  let t = process.hrtime.bigint(); BK.Corp.monthly(A); agg.push(Number(process.hrtime.bigint() - t) / 1e6);
  t = process.hrtime.bigint(); E.tick(B); full.push(Number(process.hrtime.bigint() - t) / 1e6);
}
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], f = (x) => x.toFixed(2);
console.log(`месяц агрегата: медиана ${f(med(agg))} мс · 1-е число целиком: ${f(med(full))} мс · обычный день: ${f(med(day))} мс`);
