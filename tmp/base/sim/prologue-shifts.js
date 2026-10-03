// Регрессия сохранённого расписания смен пролога:
// node sim/prologue-shifts.js
const BK = require('./load');
const PR = BK.Prologue;

let bad = 0;
function ok(cond, what, extra) {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${extra == null ? '' : ' — ' + extra}`);
  if (!cond) bad++;
}
function state(seed) {
  const P = PR.create(seed || 1);
  P.cards = []; P.home = 'room'; P.shift = { m: -1 };
  return { prologue: P };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strictlyAfter = (a, from, month) => a.slice(from).every((x) => x > month);

console.log('Расписание смен пролога');

{
  const S = state(1), P = S.prologue;
  ok(PR.shiftAt(P).length === 7, 'базовый режим: 7 смен', PR.shiftAt(P).join(','));
  PR.setExtra(S, 1);
  ok(PR.shiftAt(P).length === 9, 'extra=1: 9 смен', PR.shiftAt(P).join(','));
  PR.setExtra(S, 2);
  ok(PR.shiftAt(P).length === 10, 'extra=2: максимум 10 смен', PR.shiftAt(P).join(','));
}

{
  const S = state(2), P = S.prologue;
  P.m = 8; P.stats.shifts = 3; P.shift.m = 6;
  const before = PR.shiftAt(P), locked = before.slice(0, 4); // три сыграны, четвёртая уже назначена
  PR.setExtra(S, 2);
  const after = PR.shiftAt(P);
  ok(same(after.slice(0, 4), locked), '0→2 не двигает сыгранные и назначенную смену', after.join(','));
  ok(after.length === 10, '0→2 добавляет только будущие смены');
  ok(strictlyAfter(after, 4, P.m), '0→2 не создаёт новую просроченную смену');
}

{
  const S = state(3), P = S.prologue;
  PR.setExtra(S, 2);
  P.m = 9; P.stats.shifts = 4; P.shift.m = 7;
  const before = PR.shiftAt(P), locked = before.slice(0, 5);
  PR.setExtra(S, 0);
  const after = PR.shiftAt(P);
  ok(same(after.slice(0, 5), locked), '2→0 не двигает сыгранные и назначенную смену', after.join(','));
  ok(after.length === 7, '2→0 убирает только лишний будущий хвост');
  ok(strictlyAfter(after, 5, P.m), '2→0 не создаёт новую просроченную смену');
}

{
  const S = state(4), P = S.prologue;
  PR.setExtra(S, 2); P.m = 11; P.stats.shifts = 4; P.shift.m = 8;
  const dates = PR.shiftAt(P), loaded = JSON.parse(JSON.stringify(P));
  ok(same(PR.shiftAt(loaded), dates), 'JSON save/load сохраняет даты без пересчёта');
  ok(same(loaded.shiftSchedule.dates, dates), 'versioned shiftSchedule входит в сохранение');
}

{
  const S = state(5), P = S.prologue;
  P.extra = 2; P.m = 12; P.stats.shifts = 3; P.shift.m = 8;
  delete P.shiftSchedule; // состояние до появления versioned-графика
  const dates = PR.shiftAt(P), due = PR.dueShift(P);
  ok(P.shiftSchedule && P.shiftSchedule.v === 1 && P.shiftSchedule.migrated === 1, 'legacy-сохранение мигрировано');
  ok(dates.length === 10, 'legacy extra=2 получает не больше 10 смен', dates.join(','));
  ok(dates.slice(3).every((x) => x > P.m), 'legacy migration ставит будущие смены после текущего месяца');
  ok(!due, 'legacy migration не создаёт смену, уже просроченную при загрузке');
}

{
  const S = state(6), P = S.prologue;
  P.m = 0;
  const due = PR.dueShift(P), plan = PR.shiftPlan(P);
  ok(due && plan.shift && due.month === plan.shift.month && due.n === plan.shift.n, 'dueShift и shiftPlan читают одну запись графика');
  PR.shiftResult(S, { served: 12, errors: 0, upsells: 2, lost: 0 });
  ok(!PR.dueShift(P), 'в одном месяце нельзя получить вторую накопившуюся смену');
}

console.log(bad ? `ПРОБЛЕМ: ${bad}` : 'ОК: расписание стабильно');
process.exit(bad ? 1 : 0);
