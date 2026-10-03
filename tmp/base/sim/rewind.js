// Проверка «Переиграть» (src/rewind.js): детерминизм отката и хранилище снимков.
//   1) бот good доводит игру до середины (первый акт; второй акт — с --corp-профилем, города на директорах);
//   2) дальше — простые детерминированные действия (события — выбор бота, найм до нормы, кредит при минусе,
//      новая точка при запасе денег; во втором акте — переезд в другой город посреди окна) N месяцев, снимки 1-го числа;
//   3) откат на 2 месяца и те же действия снова — состояние обязано совпасть с первым прогоном до последнего поля
//      (кроме отметки о переигровке: S.rewind, запись журнала и летописи).
//   Плюс: хранилище (запись/чтение снимков как после перезагрузки, переполнение, без localStorage), лимит по сложности.
// Запуск: node sim/rewind.js [сидов=2] [месяцев=5]   (код выхода 1 — если что-то разошлось)
const BK = require('./load');
const { play, chooseEvent, chooseMenu, PROFILES } = require('./bot');
const E = BK.Engine, R = BK.Rewind;

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = +(pos[0] || 2), months = +(pos[1] || 5);
let fails = 0;
const fail = (m) => { fails++; console.log('  ОШИБКА: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// ---------- детерминированные «действия игрока» ----------
function act(S, P, plan) {
  if (S.ev.pending) E.resolveEvent(S, chooseEvent(S, P));
  if (S.chef.pending) chooseMenu(S, P);
  if (plan && plan[S.day]) plan[S.day](S);
  if (S.day % 7 === 0) {
    for (const st of S.stores) if (st.status !== 'opening' && st.staff.length < st.staffTarget) E.hire(S, st.id);
    if (S.cash < 0) E.takeLoan(S, -S.cash + 2e6 * S.macro.priceLevel);
  }
  if (S.day % 30 === 11 && S.offers.length && S.cash > 40e6 * S.macro.priceLevel) E.rentStore(S, S.offers[0].id);
}
function drive(S, P, untilDay, plan) {
  let guard = 0;
  while (S.day < untilDay && !S.lost && guard++ < 5000) {
    act(S, P, plan);
    S.notify.length = 0;
    if (!E.tick(S)) continue;
    R.record(S);
  }
  act(S, P, null); // действия в последний день (тот же порядок в обоих прогонах)
  return S;
}

// ---------- сравнение ----------
function clean(S) {
  const c = JSON.parse(JSON.stringify(R.strip(S)));
  delete c.rewind;
  const isRw = (x) => x && (x.t === 'rewind' || /^Переиграли: /.test(x.text || ''));
  if (c.log) c.log = c.log.filter((x) => !isRw(x));
  if (c.chron) c.chron = c.chron.filter((x) => !isRw(x));
  return c;
}
function diff(a, b, path) {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: массив ≠ объект`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const d = diff(a[k], b[k], path + '.' + k); if (d) return d; }
  return null;
}
function same(A, B, what) {
  const a = clean(A), b = clean(B);
  // журнал ограничен 250 записями: запись об откате вытесняет одну старую — хвост сравниваем без неё
  if (a.log && b.log) { const n = Math.min(a.log.length, b.log.length); a.log = a.log.slice(0, n); b.log = b.log.slice(0, n); }
  const d = diff(a, b, 'S');
  if (d) fail(`${what}: состояние разошлось — ${d}`); else ok(`${what}: состояние совпало (${(JSON.stringify(a).length / 1024).toFixed(0)} КБ)`);
  return !d;
}

// ---------- заглушка localStorage ----------
function fakeLS(quota) {
  const m = new Map(); let used = 0;
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { v = String(v); const nu = used - (m.has(k) ? m.get(k).length : 0) + v.length; if (quota != null && nu > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } used = nu; m.set(k, v); },
    removeItem: (k) => { if (m.has(k)) { used -= m.get(k).length; m.delete(k); } },
    get used() { return used; },
  };
}

// ---------- сценарий ----------
function scenario(name, S0, P, opts) {
  console.log(`\n=== ${name}: ${E.fmtDate(S0.day)}, точек ${S0.stores.length}${S0.corp ? `, городов ${Object.keys(S0.corp.cities).length}, активный ${S0.corp.active}` : ''}`);
  const json0 = JSON.stringify(R.strip(S0));
  const fresh = () => { const S = JSON.parse(json0); S.notify = []; if (BK.Corp) BK.Corp.applyGlobals(S); return S; };
  const slot = opts.slot || 1;
  // план: во втором акте — переезд в другой город посреди окна
  const t0 = E.dateOf(S0.day);
  const firstOf = (k) => { let d = S0.day; let n = 0; while (n < k) { d++; if (E.dateOf(d).d === 1) n++; } return d; };
  const endDay = firstOf(months) + 12;
  const plan = {};
  if (opts.switchTo) plan[firstOf(months - 1) + 5] = (S) => { const r = E.switchCity(S, opts.switchTo); if (!r.ok) fail('переезд: ' + r.msg); };
  // прогон 1
  const A = fresh(); R.forget(); R.attach(A, slot);
  drive(A, P, endDay, plan);
  const L = R.list(A);
  const mx = R.max(A);
  if (L.length !== Math.min(mx, months)) fail(`снимков ${L.length}, ожидалось ${Math.min(mx, months)}`); else ok(`снимков в списке: ${L.length} (лимит «${A.difficulty}» — ${mx})`);
  if (!mx) { if (R.can(A)) fail('на «Хардкоре» откат доступен'); else ok('на «Хардкоре» отката нет'); return; }
  const sizes = R._games[`${slot}:${A.seed}`].map((x) => x.json.length);
  console.log(`  размер снимка: ${(Math.min(...sizes) / 1024).toFixed(0)}–${(Math.max(...sizes) / 1024).toFixed(0)} КБ, всего ${(sizes.reduce((a, b) => a + b, 0) / 1024).toFixed(0)} КБ`);
  if (opts.switchTo && A.corp.active !== opts.switchTo) fail('переезд не состоялся');
  // откат на 2 месяца и те же действия
  const back = L.find((x) => x.months === Math.min(2, L.length));
  const B = R.restore(A, back.day);
  if (!B) { fail('restore вернул null'); return; }
  if (B.day !== back.day) fail('день после отката ' + B.day);
  if (!B.rewind || B.rewind.n !== 1) fail('нет отметки о переигровке');
  if (opts.switchTo && B.corp.active === opts.switchTo) fail('после отката активный город не вернулся');
  if (opts.switchTo && BK.CITY.id !== B.corp.active) fail(`карта не та: BK.CITY ${BK.CITY.id}, активный ${B.corp.active}`);
  if (R.list(B).some((x) => x.day > back.day)) fail('остались снимки «из будущего»');
  drive(B, P, endDay, plan);
  same(A, B, `откат на ${back.months} мес. (${E.fmtDate(back.day)}) и повтор до ${E.fmtDate(endDay)}`);
  // максимальный откат, как после перезагрузки: снимки из localStorage
  globalThis.localStorage = fakeLS(null);
  const C1 = fresh(); R.forget(); R.attach(C1, slot);
  drive(C1, P, endDay, plan);
  R.persist();
  const stored = R.status(C1).persisted;
  R.forget(); R.attach(C1, slot); // «перезагрузка»: память пуста, снимки — из хранилища
  const L2 = R.list(C1);
  if (L2.length !== stored || !stored) fail(`после перезагрузки снимков ${L2.length}, записано ${stored}`); else ok(`после перезагрузки снимки на месте: ${L2.length}`);
  const far = L2[L2.length - 1];
  const D = R.restore(C1, far.day);
  drive(D, P, endDay, plan);
  same(A, D, `откат на максимум (${far.months} мес., ${E.fmtDate(far.day)}) из хранилища`);
  // переполнение: хранилище меньше одного снимка — снимки только в памяти, откат работает
  globalThis.localStorage = fakeLS(Math.min(...sizes) - 10);
  const F = fresh(); R.forget(); R.attach(F, slot);
  let threw = null;
  try { drive(F, P, endDay, plan); R.persist(); } catch (e) { threw = e; }
  const st = R.status(F);
  if (threw) fail('переполнение хранилища уронило игру: ' + threw.message);
  else if (st.persisted !== 0 || st.storeOk !== false || !R.can(F)) fail(`переполнение: persisted ${st.persisted}, storeOk ${st.storeOk}, can ${R.can(F)}`);
  else ok('переполнение хранилища: снимки только в памяти, откат доступен');
  // без localStorage вовсе (приватный режим с запретом)
  delete globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  const G = fresh(); R.forget(); R.attach(G, slot);
  try { drive(G, P, endDay, plan); const x = R.list(G); const H = R.restore(G, x[0].day); if (!H) throw new Error('нет отката'); ok('без localStorage: снимки в памяти, откат работает'); } catch (e) { fail('без localStorage: ' + e.message); }
  delete globalThis.localStorage;
  if (BK.Corp) BK.Corp.applyGlobals(null);
}

for (let s = 1; s <= seeds; s++) {
  const seed = s * 7919;
  // первый акт: «Лёгкий» и «Нормальный» (2,5 года), «Хардкор» — без отката
  for (const diff of ['easy', 'normal', 'hard']) {
    const r = play({ level: 'good', seed, years: diff === 'hard' ? 1.2 : 2.5, difficulty: diff });
    scenario(`сид ${s}, первый акт, ${diff}`, r.S, Object.assign({}, PROFILES.good), {});
  }
  // банкротство: слабый бот, откат с экрана банкротства
  {
    const r = play({ level: 'bad', seed, years: 4 });
    const S = r.S;
    console.log(`\n=== сид ${s}, банкротство: ${S.lost ? 'на ' + E.fmtDate(S.day) : 'не случилось'}`);
    if (S.lost) {
      // боты сами не откатывают — повторяем тот же прогон, записывая снимки 1-го числа, и возвращаемся с «экрана банкротства»
      let att = false;
      const r2 = play({ level: 'bad', seed, years: 4, onDay: (X) => { if (!att) { R.forget(); R.attach(X, 5); att = true; } R.record(X); } });
      const L = R.list(r2.S);
      if (!L.length) fail('перед банкротством нет снимков');
      else {
        const B = R.restore(r2.S, L[0].day);
        if (!B || B.lost || B.phase !== 'play') fail('после отката игра не живая'); else ok(`банкротство ${E.fmtDate(r2.S.day)} → переиграть с ${E.fmtDate(B.day)} (снимков ${L.length}), счёт ${Math.round(B.cash / 1e6)} млн`);
        if (!B.rewind || !B.rewind.list[0].lost) fail('в отметке нет признака банкротства');
      }
    }
  }
}
// второй акт: good с корпоративным профилем до ~11-го года, затем переезд в город на директоре посреди окна
{
  const seed = 7919;
  const t = Date.now();
  const r = play({ level: 'good', seed, years: 11.5, corp: true, corpOpt: { level: 'good' } });
  const S = r.S;
  const other = S.corp ? Object.keys(S.corp.cities).find((id) => id !== S.corp.active && S.corp.cities[id].packed && S.corp.cities[id].packed.stores.length) : null;
  console.log(`\n(второй акт подготовлен за ${((Date.now() - t) / 1000).toFixed(0)} с)`);
  if (!S.corp || !other) fail('второй акт: нет второго города для проверки');
  else scenario(`второй акт, переезд ${S.corp.active} → ${other}`, S, Object.assign({}, PROFILES.good, { corpLevel: 'good' }), { switchTo: other });
}
console.log(fails ? `\nИТОГ: ошибок ${fails}` : '\nИТОГ: всё совпало, ошибок нет');
process.exit(fails ? 1 : 0);
