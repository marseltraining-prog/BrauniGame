/* Перенос открытия в сцене s22 «Воскресный ужин» (вариант 0 — deferOpen): реальная пятая точка
   открывается на 3 дня позже, вместе с её начальным штатом; соседние точки и деньги не трогаются.
   Без открывающейся пятой — честный текст и никаких изменений графика.
   Запуск: node sim/defer-open.js */
'use strict';
const assert = require('node:assert/strict');
process.env.BK_STORY = '1';
const BK = require('./load.js');
const E = BK.Engine, ST = BK.Story;
let checks = 0;
const ok = (v, why) => { assert.ok(v, why); checks++; };
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };

function game(n) {
  const S = E.newGame({ seed: 4242, city: 'ufa' });
  S.phase = 'play'; S.cash = 1e9;
  ST.ensure(S);
  for (let i = 0; i < n; i++) {
    let r = { ok: false }, guard = 0;
    while (!r.ok && guard++ < 400) { const o = S.offers[0]; if (o) r = E.rentStore(S, o.id); if (!r.ok) E.tick(S); }
    assert.ok(r.ok, 'аренда точки ' + (i + 1));
  }
  const R = ST.state(S); R.pending = null; R.queue = []; delete R.seen.s22;   // показываем s22 явно
  return S;
}
// Только движок: сюжетные сцены во время перемотки не нужны (s22 уже показана или отвечена).
function tickTo(S, day) { let g = 0; while (S.day < day && g++ < 400) { if (S.ev) S.ev.pending = null; E.tick(S); } }

// 1. Пятая точка ещё открывается — переносим.
{
  const S = game(5);
  const fifth = S.stores.find((s) => s.num === 5);
  ok(fifth && fifth.status === 'opening', 'пятая точка открывается');
  ok(ST.cond(S, ST.state(S), { openingStoreNum: 5 }), 'условие триггера видит открывающуюся пятую');
  const others = S.stores.filter((s) => s !== fifth).map((s) => [s.id, s.openDay]);
  const day0 = fifth.openDay, hires0 = fifth.incoming.map((h) => h.day), cash0 = S.cash;
  ok(ST.start(S, ST.scene('s22')), 'сцена показана');
  const v = ST.pendingScene(S);
  ok(v.choices[0].label.includes('пятой'), 'вариант называет пятую точку');
  ok(v.lines.find((l) => l.who === 'gulya').text.includes(E.fmtDate(day0)), 'Гуля называет настоящую дату');
  const r = ST.resolve(S, 0);
  ok(r.ok, 'выбор принят');
  eq(fifth.openDay, day0 + 3, 'открытие пятой на 3 дня позже');
  eq(fifth.incoming.map((h) => h.day), hires0.map((d) => Math.max(d, day0 + 3)), 'начальный штат выходит к новой дате');
  eq(S.stores.filter((s) => s !== fifth).map((s) => [s.id, s.openDay]), others, 'другие точки не тронуты');
  eq(S.cash, cash0, 'деньги не меняются');
  ok(!(ST.state(S).queue || []).some((q) => q.kind === 'deferOpen'), 'мёртвой записи в очереди нет');
  ok(r.out.some((t) => t.includes('№5')), 'игрок видит итог переноса');
  tickTo(S, day0);
  eq(fifth.status, 'opening', 'в старую дату ещё не открыта');
  tickTo(S, day0 + 3);
  eq(fifth.status, 'open', 'открылась в новую дату');
  eq(fifth.openedDay, day0 + 3, 'день открытия = новая дата');
}
// 2. Вариант 1 (открыть по плану) — график не меняется.
{
  const S = game(5); const fifth = S.stores.find((s) => s.num === 5), d0 = fifth.openDay;
  ST.start(S, ST.scene('s22')); ST.resolve(S, 1);
  eq(fifth.openDay, d0, 'по плану — без переноса');
}
// 3. Пятая уже открыта — честный текст, ничего не переносится.
{
  const S = game(5); const fifth = S.stores.find((s) => s.num === 5);
  tickTo(S, fifth.openDay); eq(fifth.status, 'open', 'пятая открылась');
  ok(!ST.cond(S, ST.state(S), { openingStoreNum: 5 }), 'условие не срабатывает');
  const before = S.stores.map((s) => s.openDay);
  ST.state(S).pending = null;
  ok(ST.start(S, ST.scene('s22')), 'сцена показана');
  const v = ST.pendingScene(S);
  eq(v.choices[0].cost, null, 'без цены переноса');
  ok(!/открыти/i.test(v.lines.find((l) => l.who === 'gulya').text), 'Гуля не говорит про открытие');
  ST.resolve(S, 0);
  eq(S.stores.map((s) => s.openDay), before, 'график не меняется');
}
// 4. Цель запомнена при показе: если пятая успела открыться до ответа — ничего не переносим.
{
  const S = game(5); const fifth = S.stores.find((s) => s.num === 5);
  ST.start(S, ST.scene('s22'));
  eq(ST.state(S).pending.deferOpening, { city: 'ufa', storeId: fifth.id }, 'цель запомнена');
  tickTo(S, fifth.openDay); const d = fifth.openDay;
  ST.resolve(S, 0);
  eq(fifth.openDay, d, 'открытую точку не трогаем');
}
console.log(`defer-open: ${checks} проверок — OK`);
