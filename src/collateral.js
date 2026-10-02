/* =====================================================================
   КРЕДИТ ПОД ЗАЛОГ ТОЧКИ (ROADMAP, этап 2). Чистая логика, без DOM.
   Банк даёт деньги под конкретную точку: до CFG.COLL.CAP, но не больше LTV от её оценки
   (вложения в открытие и ремонт с износом). Ставка ниже обычного кредита, платёж — 1-го числа
   (аннуитет: равные платежи, внутри — проценты и возврат долга).

   Просрочка: 1-й месяц — пени в долг и предупреждение; 2-й — пени, новые кредиты закрыты,
   один раз можно взять реструктуризацию (3 месяца платим только проценты за комиссию);
   CFG.COLL.SEIZE_MONTHS месяца подряд — банк забирает точку (закрывается без возврата денег,
   долг по этому кредиту закрыт). После изъятия — BAN_DAYS без новых кредитов, потом ставка выше
   на BAN_RATE_ADD (это видно и обычному кредиту: engine.loanRate спрашивает BK.Coll.rateAdd).

   Состояние (старые сохранения — ensure(); пока кредитов не брали, S.coll вообще не создаётся,
   поэтому прогоны ботов и сохранения игроков не меняются):
     S.coll = { v: 1, loans: [ { id, storeId, num, sum, remain, rate, term, pay, takenDay, months, missed, restruct, onlyInt } ],
                banUntil: 0, rateAdd: 0, seized: 0, taken: 0, log: [] }

   Подключение: обёртка BK.Engine.tick (платёж на 1-е число после месячного расчёта) и BK.Engine.takeLoan
   (запрет новых кредитов после изъятия); сам движок не менялся, кроме одной строки в loanRate — надбавки
   к ставке, как это уже сделано для штаба (BK.HQ.rateAdd).
   Числа — CFG.COLL. Интерфейс — src/ui/collateral-ui.js (BK.CollUI). Проверка — node sim/collateral.js, node qa/collateral.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, K = () => BK.CFG.COLL;
  const I = () => (BK.Engine._int || {});
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const open = (S) => (S.stores || []).filter((st) => st.status !== 'opening');
  const byId = (S, id) => (E().byId ? E().byId(S.stores, id) : (S.stores || []).find((x) => x.id === id));

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S) return null;
    const R = S.coll || (S.coll = {});
    if (R.v == null) R.v = 1;
    if (!Array.isArray(R.loans)) R.loans = [];
    if (R.banUntil == null) R.banUntil = 0;
    if (R.rateAdd == null) R.rateAdd = 0;
    if (R.seized == null) R.seized = 0;
    if (R.taken == null) R.taken = 0;
    if (!Array.isArray(R.log)) R.log = [];
    for (const l of R.loans) { if (l.missed == null) l.missed = 0; if (l.onlyInt == null) l.onlyInt = 0; if (l.months == null) l.months = 0; }
    return R;
  }
  // то же, но без создания состояния: для ежедневной проверки и для движка
  const state = (S) => (S && S.coll && typeof S.coll === 'object' ? S.coll : null);
  const rateAdd = (S) => { const R = state(S); return R && R.banUntil > 0 && S.day >= R.banUntil ? (R.rateAdd || 0) : 0; };
  const banned = (S) => { const R = state(S); return !!(R && R.banUntil > S.day); };

  /* ---------------- оценка точки ---------------- */
  function wear(S, st) {
    const age = Math.max(0, S.day - (st.openedDay || st.takenDay || 0));
    return Math.min(K().WEAR_MAX, age / 365 * K().WEAR_YEAR);
  }
  function capexOf(S, st) {
    if (st.capex > 0) return st.capex;
    // старые сохранения: вложений нет — оцениваем по площади и оборудованию
    const cfg = C();
    return st.area * cfg.FITOUT_PER_M2 * S.macro.priceLevel + (cfg.STORE_EQUIP[st.size] || 0) * S.macro.priceLevel;
  }
  function value(S, st) { return Math.round(capexOf(S, st) * (1 - wear(S, st))); }
  function loanOf(S, storeId) { const R = state(S); return R ? (R.loans.find((l) => l.storeId === storeId) || null) : null; }
  // сколько ещё можно взять под эту точку
  function limit(S, st) {
    if (!st || st.status === 'opening') return 0;
    const cur = loanOf(S, st.id);
    const cap = Math.min(K().CAP * S.macro.priceLevel, value(S, st) * K().LTV);
    return Math.max(0, Math.round(cap - (cur ? cur.remain : 0)));
  }
  function canTake(S, st) {
    if (banned(S)) { const R = state(S); return { ok: false, msg: `Банк не даёт кредитов до ${E().fmtDate(R.banUntil)} — просрочка по залогу` }; }
    if (!st || st.status === 'opening') return { ok: false, msg: 'Точка ещё не работает' };
    if (loanOf(S, st.id)) return { ok: false, msg: 'Точка уже в залоге' };
    if (limit(S, st) < K().MIN * S.macro.priceLevel) return { ok: false, msg: 'Оценка точки слишком мала для залога' };
    return { ok: true };
  }

  /* ---------------- ставка и график ---------------- */
  function rate(S) { return Math.max(0.03, E().loanRate(S) + K().SPREAD + (state(S) ? (state(S).rateAdd || 0) : 0)); }
  // аннуитет: равные платежи, проценты + возврат долга
  function annuity(sum, r, n) {
    const m = r / 12;
    if (m <= 0) return sum / n;
    return sum * m / (1 - Math.pow(1 + m, -n));
  }
  function plan(S, sum) { const r = rate(S), n = K().TERM; const pay = annuity(sum, r, n); return { rate: r, term: n, pay: Math.round(pay), total: Math.round(pay * n) }; }

  /* ---------------- взять / погасить ---------------- */
  function take(S, storeId, sum) {
    const st = byId(S, storeId);
    const why = canTake(S, st); if (!why.ok) return why;
    const lim = limit(S, st);
    sum = Math.round(Math.min(sum, lim));
    if (sum < K().MIN * S.macro.priceLevel) return { ok: false, msg: `Минимальная сумма — ${fm(K().MIN * S.macro.priceLevel)}` };
    const R = ensure(S), pl = plan(S, sum);
    const loan = { id: 'cl' + (R.loans.length + 1) + '_' + S.day, storeId: st.id, num: st.num, sum, remain: sum, rate: pl.rate, term: pl.term, pay: pl.pay, takenDay: S.day, months: 0, missed: 0, restruct: false, onlyInt: 0 };
    R.loans.push(loan); R.taken++;
    st.coll = loan.id; // метка «в залоге» — в самой точке (её видят карта, карточка и запрет закрытия)
    S.cash += sum;
    log(S, `Кредит под залог точки №${st.num} (${st.address}): ${fm(sum)} под ${(pl.rate * 100).toFixed(1).replace('.', ',')}% на ${pl.term} мес, платёж ${fm(pl.pay)} 1-го числа. Заложенную точку нельзя закрыть или продать.`, 'warn');
    toast(S, 'Деньги под залог точки', `${st.address}: ${fm(sum)}. Платёж ${fm(pl.pay)} 1-го числа.`, 'warn');
    return { ok: true, loan, sum };
  }
  // досрочное погашение (частичное или полное) со счёта, потом из резерва
  function repay(S, loanId, sum) {
    const R = ensure(S), l = R.loans.find((x) => x.id === loanId); if (!l) return { ok: false, msg: 'Кредит не найден' };
    const free = Math.max(0, S.cash) + Math.max(0, S.reserve);
    sum = Math.round(Math.min(sum || l.remain, l.remain, free));
    if (sum <= 0) return { ok: false, msg: 'Нечем гасить: на счёте и в резерве пусто' };
    payFrom(S, sum);
    l.remain -= sum;
    log(S, `Досрочно погашено ${fm(sum)} по залогу точки №${l.num}. Осталось ${fm(l.remain)}.`, 'good');
    if (l.remain <= 1) closeLoan(S, l, 'погашен');
    return { ok: true, paid: sum };
  }
  function restructure(S, loanId) {
    const R = ensure(S), l = R.loans.find((x) => x.id === loanId); if (!l) return { ok: false, msg: 'Кредит не найден' };
    if (l.restruct) return { ok: false, msg: 'Реструктуризация уже была — второй раз банк не пойдёт' };
    const fee = Math.round(l.remain * K().RESTRUCT_FEE);
    if (S.cash < fee) return { ok: false, msg: `На комиссию нужно ${fm(fee)}` };
    S.cash -= fee; l.restruct = true; l.onlyInt = K().RESTRUCT_MONTHS; l.missed = 0; l.term += K().RESTRUCT_MONTHS;
    log(S, `Реструктуризация по залогу точки №${l.num}: комиссия ${fm(fee)}, ${K().RESTRUCT_MONTHS} мес. платим только проценты.`, 'warn');
    toast(S, 'Реструктуризация', `${st0(S, l)}: ${K().RESTRUCT_MONTHS} месяца платим только проценты.`, 'warn');
    return { ok: true, fee };
  }
  function st0(S, l) { const st = byId(S, l.storeId); return st ? st.address : 'точка №' + l.num; }

  function payFrom(S, sum) { // со счёта, затем из резерва
    const cash = Math.min(sum, Math.max(0, S.cash)); S.cash -= cash;
    let left = sum - cash;
    if (left > 0) { const res = Math.min(left, Math.max(0, S.reserve)); S.reserve -= res; left -= res; }
    return sum - Math.max(0, left);
  }
  function closeLoan(S, l, why) {
    const R = state(S); if (!R) return;
    R.loans = R.loans.filter((x) => x.id !== l.id);
    const st = byId(S, l.storeId); if (st) delete st.coll;
    log(S, `Залог по точке №${l.num} снят: кредит ${why}.`, 'good');
    if (S.notify) S.notify.push({ type: 'coll', phase: 'closed', num: l.num, why });
  }
  function seize(S, l) {
    const R = state(S); if (!R) return;
    const st = byId(S, l.storeId);
    if (st) {
      S.stores = S.stores.filter((x) => x.id !== l.storeId);
      for (const e of st.staff) if (S.stats) S.stats.quits++;
    }
    R.loans = R.loans.filter((x) => x.id !== l.id);
    R.seized++; R.banUntil = S.day + K().BAN_DAYS;
    R.rateAdd = Math.min(0.06, (R.rateAdd || 0) + K().BAN_RATE_ADD);
    R.log.unshift({ day: S.day, num: l.num, sum: l.remain });
    if (R.log.length > 40) R.log.length = 40;
    log(S, `Банк забрал точку №${l.num} (${st ? st.address : '—'}) за просрочку по залогу: ${K().SEIZE_MONTHS} месяца без платежа. Долг по кредиту закрыт, точка ушла с торгов. Новые кредиты — не раньше ${E().fmtDate(R.banUntil)}.`, 'bad');
    toast(S, 'Банк забрал точку', `${st ? st.address : 'точка №' + l.num}: ${K().SEIZE_MONTHS} месяца без платежа. Кредиты закрыты на 2 года.`, 'bad');
    if (S.notify) S.notify.push({ type: 'coll', phase: 'seized', num: l.num, sum: l.remain, until: R.banUntil });
    return true;
  }

  /* ---------------- месяц: платёж 1-го числа ---------------- */
  function monthly(S) {
    const R = state(S); if (!R || !R.loans.length) return;
    for (const l of R.loans.slice()) {
      const m = l.rate / 12;
      const interest = l.remain * m;
      const due = l.onlyInt > 0 ? Math.round(interest) : Math.round(l.pay);
      const free = Math.max(0, S.cash) + Math.max(0, S.reserve);
      if (free >= due && due > 0) {
        payFrom(S, due);
        l.remain = Math.max(0, l.remain + interest - due);   // проценты начислены, разница ушла в тело долга
        if (l.onlyInt > 0) l.onlyInt--;
        l.months++; l.missed = 0;
        S.month.coll = (S.month.coll || 0) + interest;        // проценты — расход месяца (тело долга — нет)
        if (l.remain <= 1) { closeLoan(S, l, 'погашен'); continue; }
      } else {
        l.missed++;
        const pen = Math.round(l.pay * K().PENALTY);
        l.remain += pen;
        const left = K().SEIZE_MONTHS - l.missed;
        if (l.missed >= K().SEIZE_MONTHS) { seize(S, l); continue; }
        log(S, `Просрочка по залогу точки №${l.num}: платёж ${fm(due)} не прошёл, пени ${fm(pen)}. ${left === 1 ? 'Ещё месяц — и банк заберёт точку.' : `До изъятия точки: ${left} мес.`}`, 'bad');
        toast(S, 'Просрочка по залогу', `${st0(S, l)}: платёж ${fm(due)} не прошёл. ${left === 1 ? 'Ещё месяц — и банк заберёт точку.' : `Месяцев до изъятия: ${left}.`}`, 'bad');
        if (S.notify) S.notify.push({ type: 'coll', phase: 'missed', num: l.num, due, left, canRestruct: !l.restruct });
      }
    }
  }
  function day(S) {
    if (!S || S.lost) return;
    if (E().dateOf(S.day).d !== 1) return;
    if (state(S) && state(S).loans.length) monthly(S);
  }

  /* ---------------- данные для интерфейса ---------------- */
  function list(S) {
    const R = state(S); if (!R || !R.loans.length) return [];
    return R.loans.map((l) => {
      const st = byId(S, l.storeId);
      const m = l.rate / 12;
      const interest = Math.round(l.remain * m);
      const left = Math.max(0, l.term - l.months);
      return {
        id: l.id, storeId: l.storeId, num: l.num, address: st ? st.address : 'точка закрыта', status: st ? st.status : 'gone',
        sum: l.sum, remain: Math.round(l.remain), rate: l.rate, pay: l.pay, term: l.term, months: l.months, left,
        interest, principal: Math.max(0, l.pay - interest), missed: l.missed, restruct: l.restruct, onlyInt: l.onlyInt,
        value: st ? value(S, st) : 0, until: l.months + left,
      };
    });
  }
  function status(S) {
    const R = state(S);
    return { n: R ? R.loans.length : 0, debt: R ? Math.round(R.loans.reduce((a, l) => a + l.remain, 0)) : 0, taken: R ? R.taken : 0, seized: R ? R.seized : 0, banUntil: R ? R.banUntil : 0, rateAdd: R ? R.rateAdd : 0, banned: banned(S) };
  }
  // сколько всего можно взять под все точки (для кнопки в «Финансах»)
  function totalRoom(S) { return open(S).reduce((a, st) => a + (loanOf(S, st.id) ? 0 : limit(S, st)), 0); }
  // платёж в этом месяце (для прогноза «К 1-му числу» и «Требует внимания»)
  function dueNow(S) {
    const R = state(S); if (!R || !R.loans.length) return 0;
    return R.loans.reduce((a, l) => a + (l.onlyInt > 0 ? Math.round(l.remain * l.rate / 12) : l.pay), 0);
  }
  function attItems(S) {
    const R = state(S); if (!R || !R.loans.length) return [];
    const out = [];
    const due = dueNow(S), free = Math.max(0, S.cash) + Math.max(0, S.reserve);
    const d = E().dateOf(S.day), daysLeft = d.d === 1 ? 0 : (new Date(Date.UTC(d.y, d.m + 1, 1)) - Date.UTC(d.y, d.m, d.d)) / 86400000;
    if (due && free < due) out.push({ lvl: 'bad', ic: 'rub', t: `На платёж по залогу не хватит ≈ ${fm(due - free)}`, d: `1-го числа банк спишет ${fm(due)}${daysLeft ? ` (через ${daysLeft} дн.)` : ' — сегодня'}. Не хватит ${K().SEIZE_MONTHS} месяца подряд — заберёт точку.`, b: { act: 'tab', arg: 'fin', label: 'Финансы', primary: true } });
    else if (due && daysLeft <= K().WARN_DAYS) out.push({ lvl: 'info', ic: 'rub', t: `1-го числа — платёж по залогу ${fm(due)}`, d: `Денег хватает: на счёте и в резерве ${fm(free)}.`, b: { act: 'tab', arg: 'fin', label: 'Финансы' } });
    for (const l of R.loans) if (l.missed > 0) {
      const left = K().SEIZE_MONTHS - l.missed;
      out.push({ lvl: 'bad', ic: 'alert', t: `Просрочка по залогу: ${st0(S, l)}`, d: left === 1 ? 'Ещё месяц без платежа — и банк заберёт точку.' : `Платежа нет ${l.missed}-й месяц. До изъятия точки: ${left} мес.`, b: { act: 'coll', label: l.restruct ? 'К залогу' : 'Решить' } });
    }
    return out;
  }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__coll) return;
    Eng.__coll = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* залог не должен ломать игру */ } }
      return r;
    };
    const tl = Eng.takeLoan;
    Eng.takeLoan = function (S, amount) {
      if (S && banned(S)) { const R = state(S); return { ok: false, msg: `Банк не даёт кредитов до ${Eng.fmtDate(R.banUntil)} — была просрочка по залогу` }; }
      return tl.apply(this, arguments);
    };
  }
  function log(S, text, kind) { const I_ = I(); if (I_.log) I_.log(S, text, kind); }
  function toast(S, title, text, kind) { const I_ = I(); if (I_.toast) I_.toast(S, title, text, kind); }

  if (BK.Engine) wrap();
  BK.Coll = {
    ensure, state, take, repay, restructure, list, status, limit, value, wear, capexOf, rate, plan, rateAdd, banned,
    totalRoom, dueNow, attItems, loanOf, canTake, monthly, day, TAKEN: 'coll',
  };
})();
