/* Путь «За рубеж» (третий акт, фаза 2): проверка механики без браузера.
   Запуск: node sim/holding-abroad.js [сид] [лет]
   Что проверяем: выбор пути и сцена, вход в страну (партнёр/свой), рост точек,
   месячная выручка и курс, сцены (меню, курс, проверка, Гуля), цель 10 млрд за 12 мес.,
   концовка «Хлеб без границ», сохранение и совместимость без холдинга. */
'use strict';
process.env.BK_HOLDING = '1';
const BK = require('./load');
const E = BK.Engine, H = BK.Holding, K = () => BK.CFG.HOLDING.ABROAD;
const S0 = (() => { const { play } = require('./bot'); const S = play({ level: 'good', seed: +(process.argv[2] || 7), years: 1 }).S; S.cash = 20e9; return S; })();
let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; if (!cond) { fails++; console.log('✗ ' + msg + (extra != null ? ' — ' + JSON.stringify(extra) : '')); } else console.log('✓ ' + msg); };
BK.CFG.STORY.ON = false;
// шаг игры: события и шеф не должны ставить время на паузу
const step = (S) => { if (S.ev.pending) E.resolveEvent(S, 0); if (S.chef.pending) E.chefConfirm(S, [], []); return E.tick(S); };
// победа и открытие третьего акта
S0.won = true; S0.wonDay = S0.day;
for (let i = 0; i < 15; i++) step(S0);
H.day(S0);
ok(!!H.state(S0), 'третий акт открылся после победы');
ok(H.state(S0).path == null, 'путь ещё не выбран');
const r = H.choose(S0, 'abroad');
ok(r.ok && H.state(S0).path === 'abroad', 'путь «За рубеж» выбирается');
ok(!!H.pendingScene(S0) && H.pendingScene(S0).id === 'h_ab1', 'сцена «Ташкентский партнёр» ждёт решения');
let sc = H.pendingScene(S0);
ok(H.resolve(S0, 0).ok, 'выбор партнёра применяется');
ok(H.state(S0).abroad.defaultMode === 'local', 'по умолчанию — местный партнёр');
// вход в три страны
const enter = (id, mode) => { const rr = H.abEnter(S0, id, mode); ok(rr.ok, `вход в ${id} (${mode}) оплачен`, rr); return rr; };
enter('kz', 'local');
for (let i = 0; i < 50; i++) step(S0);
H.day(S0);
ok(H.state(S0).abroad.c.kz.open, 'Казахстан открылся');
ok(H.state(S0).abroad.c.kz.stores === K().OPEN_STORES, 'сразу три точки');
ok(!!H.pendingScene(S0) && H.pendingScene(S0).id === 'h_ab2', 'сцена «Самса или батон» ждёт');
if (H.pendingScene(S0)) H.resolve(S0, 0);
ok(H.state(S0).abroad.menu === 'local', 'выбрано местное меню');
enter('uz', 'own');
for (let i = 0; i < 100; i++) step(S0);
H.day(S0);
ok(H.state(S0).abroad.c.uz.open, 'Узбекистан открылся со своим директором');
ok(H.state(S0).abroad.c.uz.mode === 'own', 'режим «свой директор» сохранён');
enter('kg', 'local');
for (let i = 0; i < 100; i++) step(S0);
H.day(S0);
ok(H.state(S0).abroad.c.kg.open, 'Кыргызстан открылся');
ok(H.state(S0).abroad.hist.length >= 3, 'месячная история зарубежной выручки копится', H.state(S0).abroad.hist.length);
ok(H.state(S0).abroad.c.kz.rev > 0, 'выручка Казахстана идёт', H.state(S0).abroad.c.kz.rev);
ok(H.state(S0).abroad.c.kz.stores > K().OPEN_STORES, 'директор открывает новые точки', H.state(S0).abroad.c.kz.stores);
ok(H.state(S0).abroad.paidIn > 0, 'прибыль приходит на счёт', H.state(S0).abroad.paidIn);
// докручиваем до цели (не больше 8 лет), по дороге решаем сцены первым доступным вариантом
let guard = 0;
while (!H.state(S0).abroad.goalDay && guard++ < 8 * 365 && !S0.lost) {
  step(S0); H.day(S0);
  if (H.pendingScene(S0)) { const cv = H.pendingScene(S0); const i = cv.choices.findIndex((c) => c.ok); if (i >= 0) H.resolve(S0, i); }
}
const A = H.state(S0).abroad;
ok(!!A.goalDay, 'цель «10 млрд за 12 месяцев и три страны» взята', { rev12: H.abInfo(S0).rev12, open: H.abInfo(S0).open, day: S0.day });
ok(S0.storyEnding === 'abroad' || H.state(S0).ending === 'abroad', 'концовка «Хлеб без границ»', { ending: H.state(S0).ending, storyEnding: S0.storyEnding });
// сохранение и старые партии
const raw = JSON.stringify(S0);
const S2 = JSON.parse(raw);
ok(H.state(S2).path === 'abroad' && H.state(S2).abroad.c.kz.open, 'сохранение хранит страны и путь');
const old = require('./bot').play({ level: 'good', seed: 3, years: 1 }).S;
const before = JSON.stringify({ cash: Math.round(old.cash), day: old.day });
for (let i = 0; i < 40; i++) step(old);
ok(!old.holding, 'без победы холдинг не создаётся');
ok(JSON.stringify({ cash: Math.round(old.cash), day: old.day }) !== before, 'обычная партия идёт');
// без холдинга (ON=false) путь не открывается — как в ботах
const ON = BK.CFG.HOLDING.ON; BK.CFG.HOLDING.ON = false;
const S3 = E.newGame({ seed: 9 }); S3.won = true; S3.wonDay = S3.day;
for (let i = 0; i < 20; i++) step(S3);
ok(!S3.holding, 'при выключенном холдинге старые боты не меняются');
BK.CFG.HOLDING.ON = ON;
console.log(`\n${fails ? '✗' : '✓'} «За рубеж»: ${n - fails}/${n} проверок`);
process.exit(fails ? 1 : 0);
