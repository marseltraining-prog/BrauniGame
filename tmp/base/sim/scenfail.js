/* =====================================================================
   ПРОВАЛ ИСТОРИИ КАК ОТДЕЛЬНЫЙ ЭКРАН (PLAN.md «Задачи по каркасу», п. 6) — проверка.

   Что проверяет:
     1. пока срок истории идёт — провала нет;
     2. срок вышел, цель не выполнена → st.expired, st.flags.saved=false,
        BK.Scenario.failed(S) истинно и в S.notify лежит уведомление phase 'expired'
        с целью истории (его показывает src/ui/scenario-ui.js — окно «История не сложилась»);
     3. повторный вызов дня не дублирует уведомление;
     4. провал НЕ засчитывается в «Пройдено N из 4»: BK.Scenario.finish(S) → ok=false;
     5. спасённая история (цель выполнена к сроку) провалом не считается;
     6. у «Старта в Москве» срока нет — провала истории там не бывает;
     7. обычная игра без истории провала не знает (failed=false).

   Интерфейс (modалка и строка в «Требует внимания») — браузерная проверка qa/scen-ui.js;
   здесь — только логика каркаса, без DOM.

   Запуск: node sim/scenfail.js (код выхода 1 при ошибке).
   ===================================================================== */
process.env.BK_STORY = process.env.BK_STORY || '0'; // сюжет не нужен: проверяем срок сценария
const BK = require('./load');
const E = BK.Engine, SC = BK.Scenario, CFG = BK.CFG;

let bad = 0;
const ok = (c, what, extra) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${what}${extra == null ? '' : ' — ' + extra}`); };

function fresh(scen, city) {
  const S = E.newGame(city ? { seed: 7919, city } : { seed: 7919 });
  S.phase = 'play';
  SC.set(S, scen);
  SC.applyStart(S);
  S.history = [];
  S.notify = [];
  return S;
}
const mkMonth = (cash, reserve, stores) => ({ m: 6, y: 2027, cash, reserve, stores, rev: 1e6, profit: 1e5, staff: 10,
  pnl: { rent: 0, payroll: 0, util: 0, delivery: 0, upkeep: 0, interest: 0, tax: 0, checks: 0 } });

/* 1. срок идёт — провала нет */
let S = fresh('legacy');
S.day = 100; SC.day(S);
ok(!SC.state(S).expired && !SC.failed(S), 'срок не вышел — история не провалена');

/* 2. срок вышел, цель не выполнена */
S.day = 200; SC.day(S);
ok(SC.state(S).expired === true, 'срок вышел — состояние помечено');
ok(SC.state(S).flags.saved === false, 'цель к сроку не выполнена — вердикт сохранён');
ok(SC.failed(S) === true, 'BK.Scenario.failed(S) — истина (срок вышел, цель не выполнена)');
const note = (S.notify || []).find((n) => n.type === 'scen' && n.phase === 'expired');
ok(!!note, 'в S.notify лежит уведомление phase=expired для интерфейса', note ? `id=${note.id}, срок ${note.days} дн.` : 'нет');
ok(!!(note && note.goal), 'в уведомлении есть цель истории («что было нужно»)', note && note.goal);

/* 3. повторный день не дублирует уведомление */
const n0 = S.notify.length; SC.day(S);
ok(S.notify.length === n0, 'повторный day не повторяет «срок вышел»', `${n0}`);

/* 4. провал не засчитывается в «Пройдено N из 4» */
const fin = SC.finish(S);
ok(fin && fin.ok === false, 'BK.Scenario.finish — история не засчитана', fin ? `ok=${fin.ok}` : 'нет ответа');
ok(fin && fin.progress.played.indexOf('legacy') < 0, 'в прогрессе «Пройдено N из 4» провала нет',
  fin ? `пройдено: ${fin.progress.played.length} из ${fin.progress.total}` : '');

/* 5. цель выполнена к сроку — провала нет */
const S2 = fresh('legacy');
S2.history = [mkMonth(1e5, 0, 1), mkMonth(1e5, 0, 1), mkMonth(1e5, 0, 1), mkMonth(1e5, 0, 1), mkMonth(1e5, 0, 1), mkMonth(1e5, 0, 1), mkMonth(1e6, 1e6, 2)];
S2.day = 200; SC.day(S2);
ok(SC.state(S2).flags.saved === true, 'пекарня спасена — вердикт «выполнено»');
ok(SC.failed(S2) === false, 'спасённая история провалом не считается');
const fin2 = SC.finish(S2);
ok(fin2 && fin2.ok === true, 'спасённая история засчитывается (BK.Scenario.finish → ok)', fin2 ? `ok=${fin2.ok}` : '');
ok(fin2 && fin2.progress.played.length === 0, 'без localStorage отметка живёт только в браузере — здесь прогресс пуст', fin2 ? `${fin2.progress.played.length} из ${fin2.progress.total}` : '');

/* 6. «Старт в Москве»: срока нет */
const S3 = fresh('moscow', 'moscow');
S3.day = 4000; SC.day(S3);
ok(!SC.state(S3).expired && !SC.failed(S3), 'у «Старта в Москве» срока нет — провала истории не бывает');

/* 7. обычная игра без истории */
const S4 = E.newGame({ seed: 7919 }); S4.phase = 'play';
ok(SC.failed(S4) === false, 'обычная игра без истории провала не знает');

console.log(bad ? `✗ сценарный провал: ошибок ${bad}` : '✓ сценарный провал: ok');
process.exit(bad ? 1 : 0);
