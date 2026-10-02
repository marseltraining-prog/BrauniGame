/* =====================================================================
   ИНВЕСТОРЫ (ROADMAP, этап 2). Чистая логика, без DOM.
   После CFG.INV.UNLOCK_STORES открытых точек раз в 2–5 лет приходит инвестор:
   даёт деньги (100–200 млн ₽ × уровень цен) за долю — в прибыли или в выручке.
   Можно принять, отказаться или торговаться (больше денег / меньше процент / другой тип выплаты):
   у инвестора 2–3 раунда терпения, характер (жёсткий или мягкий) влияет на уступки.
   Выплаты — 1-го числа, отдельной статьёй в отчёте; долю можно выкупить досрочно, дороже вложенного.

   Кроме денег инвестор приносит делу пользу (CFG.INV.PERKS): связи в ритейле (помещения приходят
   чаще), бренд и реклама (+3 % гостей сети) или своё казначейство (ставка по кредитам ниже, лимит
   больше). Это не отсебятина: проверено ботом — к 10 точкам у сильного игрока 117 млн свободного
   кредитного лимита и ноль долга, то есть одни только деньги ему не нужны, и без пользы для дела
   предложение было бы бессмысленным.

   Состояние (старые сохранения — ensure(); пока инвесторов не было, S.inv не создаётся,
   поэтому прогоны ботов и сохранения игроков не меняются):
     S.inv = { v: 1, offer: null | { id, name, kind, pct, sum, perk, rounds, harsh, day, until },
               deals: [ { id, name, kind, pct, sum, perk, since } ],
               nextDay: 0, n: 0, refused: 0, rng: 20261002, log: [] }

   Подключение: обёртка BK.Engine.tick (приход инвестора и выплаты 1-го числа). Сам движок не менялся,
   кроме трёх маленьких хуков: статья месяца S.month.inv, лимит кредита и ставка (польза «казначейство»),
   и частота прихода помещений (польза «связи в ритейле»).
   Числа — CFG.INV. Интерфейс — src/ui/investors-ui.js (BK.InvUI).
   Проверка — node sim/investors.js, node qa/investors.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG, K = () => BK.CFG.INV;
  const I = () => (BK.Engine._int || {});
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const open = (S) => (S.stores || []).filter((st) => st.status !== 'opening');
  const state = (S) => (S && S.inv && typeof S.inv === 'object' ? S.inv : null);

  const NAMES = ['Артур Валиев', 'Фонд «Урал-Капитал»', 'Марина Дёмина', 'Тимур Хабибуллин', 'Фонд «Растущие рынки»',
    'Ильдар Сафин', 'Елена Королёва', 'Группа «Первый хлеб»', 'Руслан Мухаметшин', 'Ирина Белова'];
  const FIRMS = ['частный инвестор', 'фонд', 'семейный офис', 'стратегический партнёр', 'фонд', 'частный инвестор'];

  /* ---------------- состояние ---------------- */
  function ensure(S) {
    if (!S) return null;
    const R = S.inv || (S.inv = {});
    if (R.v == null) R.v = 1;
    if (R.offer === undefined) R.offer = null;
    if (!Array.isArray(R.deals)) R.deals = [];
    if (!Array.isArray(R.log)) R.log = [];
    if (R.nextDay == null) R.nextDay = 0;
    if (R.n == null) R.n = 0;
    if (R.refused == null) R.refused = 0;
    if (typeof R.rng !== 'number' || !R.rng) R.rng = 20261002;
    return R;
  }
  function rnd(S) { const R = ensure(S); R.rng = (Math.imul(R.rng >>> 0, 1664525) + 1013904223) >>> 0; return R.rng / 4294967296; }
  const rint = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));
  const rnum = (S, a, b) => a + rnd(S) * (b - a);

  /* ---------------- польза от инвестора ---------------- */
  function perkOf(S, id) { const R = state(S); return !!(R && R.deals.some((d) => d.perk === id)); }

  /* ---------------- цифры ---------------- */
  const lastMonth = (S) => { const h = S.history || []; return h.length ? h[h.length - 1] : null; };
  // сколько уходит партнёрам в месяц при текущем состоянии
  function monthlyPay(S) {
    const R = state(S); if (!R || !R.deals.length) return 0;
    const m = lastMonth(S); if (!m) return 0;
    let sum = 0;
    for (const d of R.deals) sum += payOf(d, m);
    return Math.round(sum);
  }
  const payOf = (d, m) => (d.kind === 'profit' ? Math.max(0, m.profit) * d.pct : Math.max(0, m.rev) * d.pct);
  // доля, которую забирают партнёры, от прибыли месяца (для предупреждения)
  function drainShare(S) {
    const m = lastMonth(S); if (!m) return 0;
    const profit = Math.max(0, m.profit); if (profit <= 0) return 0;
    return cl(monthlyPay(S) / profit, 0, 2);
  }
  // цена выкупа доли: дороже вложенного, растёт со временем
  function buyoutPrice(S, d) {
    const years = Math.max(0, (S.day - d.since) / 365);
    const k = Math.max(K().BUYOUT_MIN, K().BUYOUT_K + K().BUYOUT_YEAR * years);
    return Math.round(d.sum * k);
  }

  /* ---------------- приход инвестора ---------------- */
  function eligible(S) {
    if (!K().ON) return false;
    if (!S || S.lost || S.won || S.phase !== 'play') return false;
    if (open(S).length < K().UNLOCK_STORES) return false;
    const R = state(S);
    if (R && R.offer) return false;
    if (drainShare(S) >= K().MAX_SHARE) return false;
    return true;
  }
  function makeOffer(S) {
    const R = ensure(S);
    const pl = S.macro.priceLevel;
    const harsh = rnd(S) < K().HARSH_P;
    const penalty = (state(S) && state(S).banUntil > S.day) || (BK.Coll && BK.Coll.banned && BK.Coll.banned(S)) ? K().DEBT_PENALTY : 1; // после изъятия залога условия хуже
    const kind = rnd(S) < 0.55 ? 'profit' : 'revenue';
    let pct = kind === 'profit' ? rnum(S, K().PROFIT_PCT[0], K().PROFIT_PCT[1]) : rnum(S, K().REV_PCT[0], K().REV_PCT[1]);
    let sum = rnum(S, K().SUM[0], K().SUM[1]) * pl / penalty;
    if (harsh) { pct *= 1.12; }
    const name = NAMES[rint(S, 0, NAMES.length - 1)];
    const firm = FIRMS[rint(S, 0, FIRMS.length - 1)];
    const perk = K().PERKS[rint(S, 0, K().PERKS.length - 1)].id;
    R.offer = {
      id: 'inv' + (R.n + 1) + '_' + S.day, name, firm, kind, harsh, perk,
      pct: Math.round(pct * 1000) / 1000,
      sum: Math.round(sum / 1e6) * 1e6,
      rounds: rint(S, K().PATIENCE[0], K().PATIENCE[1]),
      day: S.day, until: S.day + 30,
    };
    R.n++;
    const t = terms(R.offer);
    log(S, `Пришёл инвестор: ${name} (${firm}). Предлагает ${fm(R.offer.sum)} за ${t.pctText} — ${t.kindText}. Кроме денег: ${t.perkText}.`, 'warn');
    if (S.notify) S.notify.push({ type: 'inv', phase: 'offer', id: R.offer.id });
    return R.offer;
  }
  function terms(o) {
    const perk = (K().PERKS.find((p) => p.id === o.perk) || {});
    return {
      kindText: o.kind === 'profit' ? 'доля в прибыли' : 'доля в выручке',
      pctText: (o.pct * 100).toFixed(1).replace('.', ',') + ' % ' + (o.kind === 'profit' ? 'от прибыли' : 'от выручки'),
      perkText: perk.text || '',
      perkName: perk.name || '',
      harshText: o.harsh ? 'жёсткий: уступает неохотно' : 'мягкий: готов торговаться',
      payText: (o.pct * 100).toFixed(1).replace('.', ',') + ' %',
    };
  }

  /* ---------------- торг ---------------- */
  function negotiate(S, action) {
    const R = state(S); if (!R || !R.offer) return { ok: false, msg: 'Предложения нет' };
    const o = R.offer;
    o.rounds--;
    if (o.rounds < 0) { const n = o.name; R.offer = null; R.refused++; log(S, `${n} устал торговаться и ушёл.`, 'warn'); if (S.notify) S.notify.push({ type: 'inv', phase: 'left' }); return { ok: true, left: true }; }
    const soft = !o.harsh;
    const chance = cl((soft ? 0.72 : 0.4) + o.rounds * 0.12, 0.1, 0.95);
    if (rnd(S) > chance) {
      log(S, `${o.name} не согласился. ${o.rounds ? `Осталось раундов торга: ${o.rounds}.` : 'Это был последний раунд.'}`, 'warn');
      return { ok: true, refused: true, rounds: o.rounds };
    }
    let what = '';
    if (action === 'more') {
      const k = rnum(S, K().MORE_K[0], K().MORE_K[1]);
      const add = Math.round(o.sum * (k - 1) / 1e6) * 1e6;
      o.sum += add; o.pct = Math.round(o.pct * 1.06 * 1000) / 1000;
      what = `добавил ${fm(add)} (теперь ${fm(o.sum)}), но доля выросла до ${(o.pct * 100).toFixed(1).replace('.', ',')} %`;
    } else if (action === 'less') {
      const k = rnum(S, K().LESS_K[0], K().LESS_K[1]);
      const was = o.pct; o.pct = Math.round(o.pct * k * 1000) / 1000;
      what = `уступил по доле: ${(was * 100).toFixed(1).replace('.', ',')} % → ${(o.pct * 100).toFixed(1).replace('.', ',')} %`;
    } else if (action === 'switch') {
      const was = o.kind;
      o.kind = o.kind === 'profit' ? 'revenue' : 'profit';
      // при смене типа доля приводится к сопоставимой: от выручки она меньше
      o.pct = o.kind === 'revenue' ? Math.round(o.pct * 0.3 * 1000) / 1000 : Math.round(o.pct * 3.2 * 1000) / 1000;
      o.pct = cl(o.pct, 0.01, 0.45);
      what = `согласился на ${o.kind === 'profit' ? 'долю в прибыли' : 'долю в выручке'} — ${(o.pct * 100).toFixed(1).replace('.', ',')} %`;
    }
    log(S, `${o.name} после торга: ${what}.`, 'warn');
    return { ok: true, changed: what, rounds: o.rounds };
  }
  function accept(S) {
    const R = ensure(S); const o = R.offer; if (!o) return { ok: false, msg: 'Предложения нет' };
    R.deals.push({ id: o.id, name: o.name, firm: o.firm, kind: o.kind, pct: o.pct, sum: o.sum, perk: o.perk, since: S.day });
    R.offer = null;
    S.cash += o.sum;
    const t = terms(o);
    log(S, `Сделка с инвестором: ${o.name} вложил ${fm(o.sum)} за ${t.pctText}. Выплаты — 1-го числа, отдельной статьёй. Долю можно выкупить досрочно.`, 'good');
    toast(S, 'Инвестор в деле', `${o.name}: ${fm(o.sum)} на счёт. ${t.pctText} партнёру — 1-го числа.`, 'good');
    if (S.notify) S.notify.push({ type: 'inv', phase: 'deal', id: o.id, name: o.name, sum: o.sum, pct: o.pct, kind: o.kind });
    syncMods(S);
    return { ok: true, deal: R.deals[R.deals.length - 1] };
  }
  function decline(S) {
    const R = ensure(S); const o = R.offer; if (!o) return { ok: false };
    R.offer = null; R.refused++;
    log(S, `Отказано инвестору ${o.name}.`, 'info');
    return { ok: true };
  }
  function buyout(S, id) {
    const R = ensure(S); const d = R.deals.find((x) => x.id === id); if (!d) return { ok: false, msg: 'Сделки нет' };
    const price = buyoutPrice(S, d);
    if (S.cash < price) return { ok: false, msg: `Нужно ${fm(price)}` };
    S.cash -= price;
    R.deals = R.deals.filter((x) => x.id !== id);
    log(S, `Выкуплена доля ${d.name}: ${fm(price)} (вложил ${fm(d.sum)}). Партнёр больше не получает выплат.`, 'good');
    toast(S, 'Доля выкуплена', `${d.name}: заплатили ${fm(price)}. Теперь вся прибыль ваша.`, 'good');
    syncMods(S);
    return { ok: true, price };
  }

  /* ---------------- польза «бренд»: модификатор гостей ---------------- */
  function syncMods(S) {
    if (!S || !Array.isArray(S.mods)) return;
    S.mods = S.mods.filter((m) => m.src !== 'inv');
    if (perkOf(S, 'brand')) S.mods.push({ t: 'traffic', m: 1.03, until: S.day + 3650, scope: 'global', src: 'inv' });
  }

  /* ---------------- ежемесячные выплаты ---------------- */
  function monthly(S) {
    const R = state(S); if (!R || !R.deals.length) return 0;
    const m = lastMonth(S); if (!m) return 0;
    let total = 0;
    for (const d of R.deals) {
      const pay = Math.round(payOf(d, m));
      if (pay <= 0) continue;
      total += pay;
      if (I().spend) I().spend(S, pay, 'inv'); else { S.cash -= pay; S.month.inv = (S.month.inv || 0) + pay; }
    }
    if (total > 0) {
      log(S, `Выплаты партнёрам за ${E().MONTHS[m.m]}: ${fm(total)} (${R.deals.length === 1 ? 'один инвестор' : R.deals.length + ' инвестора'}).`, 'info');
      if (drainShare(S) >= K().WARN_SHARE) toast(S, 'Партнёрам уходит много', `${(drainShare(S) * 100).toFixed(0)} % прибыли — во «Финансах» видно, сколько и кого можно выкупить.`, 'warn');
    }
    return total;
  }

  /* ---------------- день ---------------- */
  function day(S) {
    if (!K().ON) return; // в прогонах ботов инвесторы выключены (sim/load.js): состояние не создаётся
    if (!S || S.lost) return;
    const R = state(S);
    if (!R) {
      // состояния нет: смотрим только, не пора ли позвать первого инвестора
      if (open(S).length >= K().UNLOCK_STORES) { const r = ensure(S); if (!r.nextDay) r.nextDay = S.day + rint(S, K().FIRST_DELAY[0], K().FIRST_DELAY[1]); }
      else return;
    }
    const M = ensure(S);
    if (M.offer && M.offer.until && S.day > M.offer.until) { const n = M.offer.name; M.offer = null; M.refused++; log(S, `${n} не дождался ответа и ушёл.`, 'info'); if (S.notify) S.notify.push({ type: 'inv', phase: 'left' }); }
    if (!M.nextDay) M.nextDay = S.day + 30;
    if (S.day >= M.nextDay && !M.offer && eligible(S)) {
      makeOffer(S);
      M.nextDay = S.day + rint(S, K().GAP[0], K().GAP[1]);
    }
    if (E().dateOf(S.day).d === 1 && M.deals.length) monthly(S);
  }

  /* ---------------- данные для интерфейса ---------------- */
  function list(S) {
    const R = state(S); if (!R || !R.deals.length) return [];
    const m = lastMonth(S) || { profit: 0, rev: 0 };
    return R.deals.map((d) => ({
      id: d.id, name: d.name, firm: d.firm, kind: d.kind, pct: d.pct, sum: d.sum, perk: d.perk, since: d.since,
      pay: Math.round(payOf(d, m)), buyout: buyoutPrice(S, d), profit: buyoutPrice(S, d) - d.sum,
      years: Math.round((S.day - d.since) / 365 * 10) / 10,
      perkText: (K().PERKS.find((p) => p.id === d.perk) || {}).text || '',
    }));
  }
  function status(S) {
    const R = state(S);
    return {
      n: R ? R.deals.length : 0, offer: R ? R.offer : null, taken: R ? R.n : 0, refused: R ? R.refused : 0,
      invest: R ? R.deals.reduce((a, d) => a + d.sum, 0) : 0,
      pay: monthlyPay(S), share: drainShare(S),
      buyoutAll: R ? R.deals.reduce((a, d) => a + buyoutPrice(S, d), 0) : 0,
      nextDay: R ? R.nextDay : 0,
    };
  }
  function attItems(S) {
    const R = state(S); const out = [];
    if (R && R.offer) {
      const o = R.offer, t = terms(o);
      out.push({ lvl: 'info', ic: 'rub', t: `Ждёт ответа инвестор: ${fm(o.sum)} за ${t.pctText}`, d: `${o.name} (${o.firm}). Кроме денег: ${t.perkText}. Осталось ${Math.max(0, o.until - S.day)} дн.`, b: { act: 'inv', label: 'Обсудить', primary: true } });
    }
    const st = status(S);
    if (st.n && st.share >= K().WARN_SHARE) out.push({ lvl: 'warn', ic: 'rub', t: `Партнёрам уходит ${Math.round(st.share * 100)} % прибыли`, d: `Выплаты ${fm(st.pay)} в месяц. Доли можно выкупить — всего за ${fm(st.buyoutAll)}.`, b: { act: 'inv', label: 'Инвесторы' } });
    return out;
  }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__inv) return;
    Eng.__inv = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* инвесторы не должны ломать игру */ } }
      return r;
    };
  }
  function log(S, text, kind) { const I_ = I(); if (I_.log) I_.log(S, text, kind); }
  function toast(S, title, text, kind) { const I_ = I(); if (I_.toast) I_.toast(S, title, text, kind); }

  if (BK.Engine) wrap();
  BK.Inv = {
    ensure, state, perkOf, terms, makeOffer, negotiate, accept, decline, buyout, list, status, attItems,
    monthlyPay, drainShare, buyoutPrice, eligible, syncMods, monthly, day, NAMES,
  };
})();
