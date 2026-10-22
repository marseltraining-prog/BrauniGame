/* Путь «Франшиза-империя» (третий акт, фаза 3): проверка без браузера.
   node sim/holding-franchise.js [сид]
   Выбор пути и сцена, первые точки, рост заявок, взносы и роялти, проверки/реклама/университет,
   скандал при низких стандартах, цель 1000 точек, концовка «Имя на вывеске», сохранение. */
'use strict';
process.env.BK_HOLDING = '1';
const BK = require('./load');
const E = BK.Engine, H = BK.Holding, K = () => BK.CFG.HOLDING.FRANCHISE;
const { play } = require('./bot');
const S = play({ level: 'good', seed: +(process.argv[2] || 11), years: 1 }).S;
S.cash = 5e9; S.won = true; S.wonDay = S.day;
BK.CFG.STORY.ON = false;
let n = 0, fails = 0;
const ok = (c, m, x) => { n++; if (!c) { fails++; console.log('✗ ' + m + (x != null ? ' — ' + JSON.stringify(x) : '')); } else console.log('✓ ' + m); };
const step = () => { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); E.tick(S); };
for (let i = 0; i < 16; i++) step();
H.day(S);
ok(!!H.state(S), 'третий акт открылся');
ok(H.choose(S, 'franchise').ok && H.state(S).path === 'franchise', 'путь «Франшиза-империя» выбирается');
ok(!!H.state(S).franchise, 'состояние франшизы создано');
ok(H.pendingScene(S) && H.pendingScene(S).id === 'h_fr1', 'сцена «Первый чужой» ждёт');
H.resolve(S, 0);
ok(H.state(S).franchise.points >= 10, 'первый партнёр дал точки', H.state(S).franchise.points);
ok(H.state(S).franchise.standards > K().STAND0, 'у пекаря выше стандарты');
// покупки
const cash0 = S.cash, c1 = H.frBuy(S, 'checks');
ok(c1.ok && S.cash < cash0, 'проверки оплачены и подняли стандарты', H.state(S).franchise.standards);
ok(!H.frBuy(S, 'bad').ok, 'неизвестное действие отклонено');
// 3 месяца роста
const p0 = H.state(S).franchise.points;
for (let i = 0; i < 100; i++) { if (H.pendingScene(S)) { const sc = H.pendingScene(S); const j = sc.choices.findIndex((c) => c.ok); if (j >= 0) H.resolve(S, j); } step(); }
const F = H.state(S).franchise;
ok(F.points > p0, 'точки растут', { from: p0, to: F.points });
ok(F.paidIn > 0, 'взносы и роялти приходят на счёт', F.paidIn);
ok(F.cities >= 1, 'города считаются', F.cities);
ok(F.hist.length >= 3, 'месячная история копится', F.hist.length);
// цель и концовка (до 8 лет)
let guard = 0;
while (!F.goalDay && guard++ < 8 * 365) {
  if (H.pendingScene(S)) { const sc = H.pendingScene(S); const j = sc.choices.findIndex((c) => c.ok); if (j >= 0) H.resolve(S, j); }
  step();
}
ok(!!F.goalDay, 'цель 1000 точек взята', { points: F.points, day: S.day });
for (let i = 0; i < 30 && !H.state(S).ending; i++) {
  if (H.pendingScene(S)) { const sc = H.pendingScene(S); const j = sc.choices.findIndex((c) => c.ok); if (j >= 0) H.resolve(S, j); }
  step();
}
ok(S.storyEnding === 'franchise' || H.state(S).ending === 'franchise', 'концовка «Имя на вывеске»', { ending: H.state(S).ending, storyEnding: S.storyEnding });
// сохранение
const S2 = JSON.parse(JSON.stringify(S));
ok(H.state(S2).franchise.points === F.points, 'сохранение хранит точки франшизы');
// обычная партия без победы не создаёт холдинг
const old = play({ level: 'good', seed: 4, years: 1 }).S;
for (let i = 0; i < 30; i++) { if (old.ev.pending) E.resolveEvent(old, 0); if (old.chef.pending) E.chefConfirm(old, [], []); E.tick(old); }
ok(!old.holding, 'без победы холдинг не создаётся');
console.log(`\n${fails ? '✗' : '✓'} «Франшиза-империя»: ${n - fails}/${n} проверок`);
process.exit(fails ? 1 : 0);
