// Достижимость контента пролога: node sim/prologue-reach.js [сидов на профиль] [профили]
// Отвечает на вопрос задания (docs/story-v2.md): ни одна из 8 историй, ни одна дилемма живого сюжета
// и ни одна гостевая карточка не пропала, а смен за партию остаётся 5–10.
// Считается по логу партии: сид → история (P.v2.story), показанные дилеммы (P.v2.seen),
// сыгранные карточки гостей (P.flags.gs_*) и число «Смен» (P.stats.shifts).
// Тексты и числа расписания здесь ни при чём — это измеритель, как node sim/prologue.js.
// По умолчанию 64 сида: история выбирается по зерну (PrologV2.STORIES[(seed>>>3) % 8]),
// и на 64 сидах выпадают все восемь (самая редкая, «Долг за курсы», — на 56-м).
const BK = require('./load');
const { run } = require('./prologue.js');

const n = +(process.argv[2] || 64);
const profiles = (process.argv[3] || 'ideal,normal,spender').split(',');
const V2 = BK.PrologV2, G = BK.Guests;
const storyAll = (V2 && V2.STORY_IDS) || [];
const dilAll = (V2 && V2.DIL_IDS) || [];
const guestAll = G ? G.PLAN.map((p) => p.id) : [];

const story = {}, dil = {}, guest = {}, shifts = [];
for (const p of profiles) for (let s = 1; s <= n; s++) {
  const r = run(p, s, false);
  if (r.story) story[r.story] = (story[r.story] || 0) + 1;
  for (const d of r.dils) dil[d] = (dil[d] || 0) + 1;
  for (const g of r.guests) guest[g] = (guest[g] || 0) + 1;
  shifts.push(r.shifts);
}
const miss = (all, seen) => all.filter((x) => !seen[x]);
const line = (name, all, seen, extra) => {
  const m = miss(all, seen);
  console.log(`${name}: ${Object.keys(seen).length}/${all.length}${m.length ? '  НЕ ВСТРЕЧЕНЫ: ' + m.join(', ') : '  — все'}`);
  return m.length === 0;
};
let ok = true;
ok = line('истории', storyAll, story) && ok;
ok = line('дилеммы', dilAll, dil) && ok;
ok = line('гостевые карточки', guestAll, guest) && ok;
console.log(`смен за партию: ${Math.min.apply(null, shifts)}–${Math.max.apply(null, shifts)} (цель 5–10)`);
const badShift = shifts.some((x) => x < 5 || x > 10);
if (badShift) { console.log('ПРОБЛЕМА: смен вне 5–10'); ok = false; }
console.log('проверено партий:', profiles.length * n, `(${profiles.join(', ')} × ${n})`);
console.log(ok ? 'ОК: весь контент пролога достижим' : 'ПРОБЛЕМА');
process.exit(ok ? 0 : 1);
