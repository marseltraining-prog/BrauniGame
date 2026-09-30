// «Новичок, следующий советам обучения»: проверка, что советы из src/ui/tutorial.js реально спасают от банкротства.
// Стратегия — только то, что говорит обучение (без расчётов сильного бота):
//  цех — рекомендованный обучением (дешевле всех за 2 года: аренда + доставка); первая точка — лучший «Прогноз прибыли»,
//  после которой на счёте остаётся ≥ 2,5 млн; кредит 5 млн сразу; резерв 0% пока кредит и < 3 точек, премии 3%, маркетинг 4%;
//  зарплата рынок +6% (и снова после индексации в январе); штат — по подсказке «хватит ~N чел.», вакансии — «Нанять»;
//  заглядывает в «Требует внимания» раз в неделю и за 3 дня до 1-го: «К 1-му числу не хватит» → кредит кнопками по 5 млн;
//  события — самый дешёвый вариант, когда денег мало, иначе случайный; следующая точка — когда все точки в плюсе
//  и после аренды остаётся запас на 2 месяца; «Цех загружен» → самое дешёвое оборудование на мощность; кредит гасит по подсказке.
//  Ни обучения персонала, ни ремонтов, ни культуры, ни риелтора, меню и цены не трогает.
// Запуск: node sim/newbie.js [сидов=8] [лет=2] [easy|normal|hard] [--plain] [--quiet]
//  --plain — тот же новичок БЕЗ советов (распределение по умолчанию 15/3/5, без кредита заранее, первая точка — самая «выручечная»,
//  без проверки перед 1-м числом; на кассовый разрыв реагирует кредитом только после тоста) — для сравнения.
const path = require('path');
const BK = require('./load');
require(path.join(__dirname, '..', 'src', 'ui', 'panels.js'));
require(path.join(__dirname, '..', 'src', 'ui', 'tutorial.js'));
const E = BK.Engine, CFG = BK.CFG, A = BK.TutAdvice;

function rnd(S) { S._nbRng = (S._nbRng * 1103515245 + 12345) % 2147483648; return S._nbRng / 2147483648; }
function takeLoanClicks(S, need) { // кнопка «Взять 5 млн», сколько нужно раз
  let n = 0;
  while (need > 0 && n < 10) { const r = E.takeLoan(S, 5e6); if (!r.ok) break; need -= r.amount; n++; }
  return n;
}

function play(seed, years, difficulty, plain) {
  const S = E.newGame({ seed, difficulty });
  S._nbRng = seed % 2147483647;
  const log = { loans: 0, gaps: 0, minCash: Infinity, negDays: 0, firstProfitMonth: null, stores2: null };
  // цех
  const pp = A.prodPick(S);
  const po = plain ? S.prodOffers.slice().sort((a, b) => E.dist(a, BK.CENTER_POINT) - E.dist(b, BK.CENTER_POINT))[0] : pp.best.o; // без советов — «поближе к центру»
  E.chooseProduction(S, po.id);
  // первая точка
  let first;
  if (plain) first = A.storeCands(S).filter((x) => x.left >= 0).sort((a, b) => b.est.rev - a.est.rev)[0];
  else first = A.storePick(S);
  if (!plain && first.loan) takeLoanClicks(S, first.loan); // лучшее помещение — с кредитом, если без него не остаётся запаса
  E.rentStore(S, first.o.id);
  if (!plain) { if (!S.loan) takeLoanClicks(S, 5e6); log.loans++; E.setAlloc(S, A.alloc(S)); }
  let lastYear = E.dateOf(S.day).y, payYear = -1;
  while (S.day < years * 365 && !S.lost) {
    if (S.ev.pending) {
      const ev = S.ev.pending; let i = 0;
      if (ev.choices) {
        const aff = ev.choices.map((c, k) => k).filter((k) => !ev.choices[k].cost || ev.choices[k].cost <= S.cash + S.reserve);
        if (!plain && A.lowMoney(S)) i = A.cheapestChoice(ev);
        else i = aff.length ? aff[Math.floor(rnd(S) * aff.length)] : A.cheapestChoice(ev);
        const c = ev.choices[i]; if (c.cost > 0 && c.cost > S.cash) E.reserveMove(S, -(c.cost - S.cash));
      }
      E.resolveEvent(S, i);
    }
    if (S.chef.pending) E.chefConfirm(S, [], []);
    S.notify.length = 0;
    if (!E.tick(S)) continue;
    const t = E.dateOf(S.day);
    if (process.env.NB_DEBUG == seed && t.d === 1) { const h = S.history[S.history.length - 1]; console.log(`${t.y}-${t.m + 1} ст ${S.stores.length} выр ${(h.rev / 1e6).toFixed(2)} приб ${(h.profit / 1e6).toFixed(2)} счёт ${(S.cash / 1e6).toFixed(1)} рез ${(S.reserve / 1e6).toFixed(1)} кред ${(S.loan / 1e6).toFixed(1)}/${(E.loanLimit(S) / 1e6).toFixed(1)} точки ${S.stores.map((s) => s.last ? Math.round(s.last.profit / 1e3) : 'new').join(',')} штат ${S.stores.map((s) => s.staff.length + '/' + s.staffTarget).join(',')} цех ${(S.cache.capUse || 0).toFixed(2)} ${S.log.slice(0, 3).map((l) => l.text.slice(0, 50)).join(' | ')}`); }
    log.minCash = Math.min(log.minCash, S.cash + S.reserve);
    if (S.cash < 0) log.negDays++;
    if (t.d === 1 && S.cash < 0) { log.gaps++; takeLoanClicks(S, -S.cash + 1e6); } // тост «Кассовый разрыв!» — кредит
    if (t.y !== lastYear) { lastYear = t.y; }
    const daysLeft = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate() - t.d;
    const weekly = S.day % 7 === 0, preFirst = !plain && daysLeft === 3;
    if (!weekly && !preFirst) continue;
    // деньги: «К 1-му числу не хватит»
    if (!plain) { const g = A.gap(S); if (g > 0) { takeLoanClicks(S, g + 1e6 * S.macro.priceLevel); log.loans++; } }
    if (!weekly) continue;
    // зарплаты: рынок +6% (советы) — раз в год после индексации; без советов — по «Зарплаты ниже рынка»
    if (payYear !== t.y || S.pay.seller < S.market.seller * 0.97) {
      payYear = t.y;
      for (const k of ['seller', 'baker']) { const target = plain ? S.market[k] : A.payTarget(S, k); if (S.pay[k] < target * 0.995) E.setPay(S, k, target); }
    }
    if (!plain) E.setAlloc(S, A.alloc(S));
    // штат по подсказке и найм
    for (const st of S.stores) {
      if (st.status !== 'open') continue;
      if (!plain) { const r = E.recStaff(S, st); if (r.target > st.staffTarget) E.setStaffTarget(S, st.id, r.target); }
      let v = E.vacancies(st);
      while (v-- > 0) if (!E.hire(S, st.id).ok) break;
    }
    // цех загружен
    if ((S.cache.capUse || 0) > 0.9) {
      const p = S.productions.find((x) => x.status === 'open');
      const e = p && BK.EQUIPMENT.filter((x) => x.cap > 0 && (p.equip[x.id] || 0) < x.max).sort((a, b) => a.price - b.price)[0];
      if (e && S.cash > e.price * S.macro.priceLevel + (plain ? 0 : A.monthCosts(S))) E.buyEquipment(S, p.id, e.id);
    }
    // кредит можно погасить — только по подсказке в «Требует внимания» (кнопка «Погасить»)
    if (BK.attention(S).items.some((x) => x.b && x.b.act === 'repay')) E.repayLoan(S, 1e15);
    // следующая точка
    if (plain) {
      const c = A.storeCands(S).filter((x) => x.left >= 1e6 && x.est.profit > 0).sort((a, b) => b.est.rev - a.est.rev)[0];
      if (c && S.stores.every((s) => s.status !== 'opening')) E.rentStore(S, c.o.id);
    } else {
      const n = A.nextStore(S);
      if (n.ok) { if (n.loan) takeLoanClicks(S, n.loan); if (E.rentStore(S, n.pick.o.id).ok && S.stores.length === 2) log.stores2 = +(S.day / 30.4).toFixed(1); }
    }
    if (log.firstProfitMonth == null && S.history.length && S.history[S.history.length - 1].profit > 0) log.firstProfitMonth = S.history.length;
  }
  const h = S.history, y1 = h.slice(0, 12).reduce((a, x) => a + x.profit, 0), y2 = h.slice(12, 24).reduce((a, x) => a + x.profit, 0);
  return { seed, lost: S.lost ? +(S.day / 365).toFixed(2) : null, stores: S.stores.length, st2: log.stores2, cash: Math.round(S.cash / 1e6), loan: Math.round(S.loan / 1e6), reserve: Math.round(S.reserve / 1e6), y1p: Math.round(y1 / 1e6), y2p: Math.round(y2 / 1e6), minLiq: +(log.minCash / 1e6).toFixed(1), negDays: log.negDays, gaps: log.gaps, pm1: log.firstProfitMonth, quits: S.stats.quits };
}

if (require.main === module) {
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
  const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const seeds = +(pos[0] || 8), years = +(pos[1] || 2), diff = pos[2] || process.env.BK_DIFF || 'normal', plain = flags.has('--plain');
  const rows = [];
  for (let s = 1; s <= seeds; s++) rows.push(play(s * 7919, years, diff, plain));
  if (!flags.has('--quiet')) console.table(rows);
  const lost = rows.filter((r) => r.lost != null).length;
  console.log(`${plain ? 'новичок без советов' : 'новичок по советам обучения'} · ${diff} · ${seeds} сидов × ${years} г.: банкротств ${lost}/${seeds}, точек (медиана) ${rows.map((r) => r.stores).sort((a, b) => a - b)[Math.floor(rows.length / 2)]}, кассовых разрывов 1-го числа ${rows.reduce((a, r) => a + r.gaps, 0)}`);
  process.exitCode = !plain && lost ? 1 : 0;
}
module.exports = { play };
