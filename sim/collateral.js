/* Кредит под залог точки (ROADMAP, этап 2): проверка механики и влияния на баланс.
   node sim/collateral.js            — механика (оценка, лимит, платёж 1-го числа, пени, реструктуризация, изъятие, запрет кредитов)
   node sim/collateral.js good 6 22  — сильный бот, который пользуется залогом: год победы, сколько взял, сколько потерял точек

   Залог у ботов по умолчанию выключен (профиль P.coll не задан), поэтому обычные прогоны не меняются;
   здесь профиль включается мутацией PROFILES.good — только на этот запуск. */
const BK = require('./load');
const E = BK.Engine, CFG = BK.CFG, COLL = BK.Coll;

let bad = 0;
const ok = (cond, what, extra) => { if (!cond) { bad++; console.log('  ✗ ' + what + (extra ? ' — ' + extra : '')); } else console.log('  ✓ ' + what); };

function fresh(years) {
  const { play } = require('./bot');
  const r = play({ level: 'good', seed: 7919, years: years || 3 });
  const S = r.S;
  S.phase = 'play';
  return S;
}

/* ---------- 1. механика ---------- */
function mechanics() {
  console.log('\n# Механика залога');
  const S = fresh(3);
  const free = S.stores.filter((st) => st.status === 'open' && COLL.limit(S, st) > 0);
  ok(free.length > 0, 'есть точка, которую можно заложить', `точек ${S.stores.length}`);
  const st = free[0];
  const val = COLL.value(S, st), lim = COLL.limit(S, st);
  ok(Math.abs(lim - Math.min(CFG.COLL.CAP * S.macro.priceLevel, val * CFG.COLL.LTV)) < 1e3, 'лимит = минимум(потолок, 70 % оценки)', `оценка ${Math.round(val)}, лимит ${Math.round(lim)}`);
  ok(COLL.wear(S, st) > 0 && COLL.wear(S, st) <= CFG.COLL.WEAR_MAX + 1e-9, 'износ считается и не превышает максимум', `${(COLL.wear(S, st) * 100).toFixed(1)} %`);

  const rate = COLL.rate(S);
  ok(rate < E.loanRate(S) + 1e-9, 'ставка ниже обычного кредита', `${(rate * 100).toFixed(1)} % против ${(E.loanRate(S) * 100).toFixed(1)} %`);

  const before = S.cash;
  const r = COLL.take(S, st.id, lim);
  ok(r.ok && Math.abs(S.cash - before - r.sum) < 1, 'деньги пришли на счёт', `${Math.round(r.sum)}`);
  ok(!!st.coll && !!COLL.loanOf(S, st.id), 'точка помечена как залоговая');
  ok(COLL.limit(S, st) === 0, 'повторно под ту же точку не дают');
  ok(!COLL.canTake(S, st).ok, 'вторая попытка отклонена');

  // закрыть заложенную точку нельзя — проверяем на уровне интерфейса (панель), здесь: точка помечена
  const loan = COLL.loanOf(S, st.id);
  const pl = COLL.plan(S, loan.sum);
  ok(Math.abs(loan.pay - pl.pay) <= 1, 'платёж = аннуитет по ставке и сроку', `${Math.round(loan.pay)} × ${loan.term}`);

  // платёж 1-го числа
  const d = E.dateOf(S.day);
  S.day = S.day + ((32 - d.d) % 31 || 0);
  const dayToFirst = (() => { let k = 0; while (E.dateOf(S.day + k).d !== 1) k++; return k; })();
  S.day += dayToFirst;
  const cashBefore = S.cash, remainBefore = loan.remain, monthColl = S.month.coll;
  COLL.monthly(S);
  const remainAfter = COLL.loanOf(S, st.id).remain;
  ok(S.cash < cashBefore, 'платёж 1-го числа списан со счёта', `${Math.round(cashBefore - S.cash)}`);
  ok(remainAfter < remainBefore || remainBefore <= 1, 'тело долга уменьшилось', `${Math.round(remainBefore)} → ${Math.round(remainAfter)}`);
  ok(S.month.coll > monthColl, 'проценты попали в расходы месяца', `${Math.round(S.month.coll)}`);

  // добавляем проценты залога в общий счёт процентов движка
  const pl0 = S.month.coll;
  ok(pl0 > 0, 'S.month.coll заполнен (движок считает его в статье «Проценты»)', String(Math.round(pl0)));

  // просрочка и пени
  S.cash = 0; S.reserve = 0;
  const rem0 = COLL.loanOf(S, st.id).remain;
  COLL.monthly(S);
  const l2 = COLL.loanOf(S, st.id);
  ok(l2.missed === 1, 'первый месяц без платежа — просрочка', 'missed ' + l2.missed);
  ok(l2.remain > rem0, 'пени добавлены в долг', `${Math.round(rem0)} → ${Math.round(l2.remain)}`);

  // реструктуризация
  S.cash = 1e7;
  const rr = COLL.restructure(S, l2.id);
  ok(rr.ok && COLL.loanOf(S, st.id).onlyInt === CFG.COLL.RESTRUCT_MONTHS, 'реструктуризация даёт месяцы «только проценты»', String(CFG.COLL.RESTRUCT_MONTHS));
  ok(!COLL.restructure(S, l2.id).ok, 'второй раз реструктуризацию не дают');
  S.cash = 0; S.reserve = 0;
  COLL.monthly(S);
  ok(COLL.loanOf(S, st.id).missed === 1, 'после реструктуризации счётчик просрочки начался заново');

  // доводим до изъятия
  const loans0 = COLL.status(S).n, stores0 = S.stores.length;
  for (let i = 0; i < CFG.COLL.SEIZE_MONTHS; i++) COLL.monthly(S);
  const stt = COLL.status(S);
  ok(S.stores.length === stores0 - 1, 'банк забрал точку', `${stores0} → ${S.stores.length}`);
  ok(stt.n === loans0 - 1, 'долг по этому кредиту закрыт', `кредитов ${stt.n}`);
  ok(stt.banned && stt.banUntil > S.day, 'новые кредиты закрыты', `до ${E.fmtDate(stt.banUntil)}`);
  const tl = E.takeLoan(S, 1e6);
  ok(tl.ok === false, 'обычный кредит тоже не дают', tl.msg);

  // после запрета — надбавка к ставке
  S.day = stt.banUntil + 1;
  ok(COLL.rateAdd(S) > 0, 'после запрета ставка выше', `+${(COLL.rateAdd(S) * 100).toFixed(1)} п. п.`);
  ok(E.loanRate(S) > S.macro.keyRate + CFG.LOAN_SPREAD + E.diffK(S, 'spreadAdd') + 1e-9, 'движок учитывает надбавку залога в ставке');

  // досрочное погашение
  const S2 = fresh(3);
  const st2 = S2.stores.filter((x) => x.status === 'open')[0];
  const t2 = COLL.take(S2, st2.id, COLL.limit(S2, st2));
  S2.cash += 1e9;
  const rep = COLL.repay(S2, t2.loan.id, 1e12);
  ok(rep.ok && COLL.status(S2).n === 0, 'досрочное погашение закрывает кредит');
  ok(!st2.coll, 'метка залога снята с точки');

  // старое сохранение без S.coll
  const S3 = fresh(2); delete S3.coll;
  let err = null;
  try { COLL.monthly(S3); COLL.attItems(S3); COLL.list(S3); COLL.status(S3); COLL.dueNow(S3); COLL.totalRoom(S3); } catch (e) { err = e.message; }
  ok(!err, 'без S.coll модуль не падает и состояние не создаёт', err || 'ок');
  ok(!S3.coll, 'S.coll не создаётся, пока кредит не взят (сохранения и боты не меняются)');
}

/* ---------- 2. баланс: бот пользуется залогом ---------- */
function balance(level, seeds, years) {
  console.log(`\n# Баланс: ${level} с залогом, ${seeds} сид(ов) × ${years} лет`);
  const { play, PROFILES, summarize } = require('./bot');
  PROFILES[level].coll = true;
  const rows = [];
  for (let s = 1; s <= seeds; s++) {
    const r = play({ level, seed: s * 7919, years });
    const S = r.S, st = COLL.status(S);
    rows.push({ сид: s, 'год победы': r.won ? r.won.year : null, банкрот: r.lost ? +(S.day / 365).toFixed(1) : null, точек: S.stores.length, 'залогов взято': st.taken, 'точек забрано': st.seized, 'долг по залогу': Math.round(st.debt / 1e6) });
  }
  console.table(rows);
  const wins = rows.map((x) => x['год победы']).filter((x) => x != null).sort((a, b) => a - b);
  const med = wins.length ? wins[Math.floor(wins.length / 2)] : null;
  console.log(`побед ${wins.length}/${rows.length}, медиана года победы — ${med == null ? '—' : med}; забрано точек: ${rows.reduce((a, x) => a + x['точек забрано'], 0)}`);
  console.log('эталон без залога: good 3 18 — 3/3, медиана 14,9; good 12 22 — медиана 14,8');
}

const pos = process.argv.slice(2);
if (!pos.length) mechanics();
else balance(pos[0] || 'good', +(pos[1] || 6), +(pos[2] || 22));

console.log(bad ? `\nПРОБЛЕМ: ${bad}` : '\nМеханика в порядке.');
process.exitCode = bad ? 1 : 0;
