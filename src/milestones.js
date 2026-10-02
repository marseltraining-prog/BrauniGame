/* =====================================================================
   ВЕХИ — короткие задания «живости» (vision-plan §4 п. 4, этап В2).
   Чистая логика, без DOM: одна веха за раз, выдаётся сама и живёт 10–45 игровых дней.
   Взял — маленькая награда на пару недель (выше поток гостей, конверсия или чек), звук, тост и запись в журнал.
   Не успел — веха просто уходит, без штрафа (принцип §2: ошибка не наказывает навсегда).

   Состояние (старые сохранения получают значения по умолчанию — ensure()):
     S.miles = {
       v: 1, on: true,            // выключатель системы
       cur: null,                 // текущая веха: { k, at, until, need, base, got, spot, num, best }
       nextDay: 0,                // раньше этого дня новую веху не выдаём
       n: 0, fail: 0,             // взято / не успел
       done: [{ k, day }],        // последние взятые (не больше KEEP)
       gAvg: 0, chk: 0,           // скользящие средние: гостей в день и среднего чека сети
       rng: 20261001              // свой ГСЧ — поток случайностей движка не сдвигается
     }

   Подключение: обёртка `BK.Engine.tick` (как achievements.js и trainers.js) — сам движок не менялся.
   Награда — через обычные S.mods с пометкой src: 'mile' (движок знает типы traffic / conv / check / aggOrders).
   Числа — CFG.MILES (config.js). Темп проверяет `node sim/miles.js`. Интерфейс — src/ui/lively-ui.js.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, K = () => BK.CFG.MILES;
  const I = () => (BK.Engine._int || {});
  const open = (S) => (S.stores || []).filter((st) => st.status !== 'opening');
  const n0 = (v) => Math.round(v).toLocaleString('ru-RU');
  const fm = (v) => (BK.fmtMoney ? BK.fmtMoney(v) : Math.round(v) + ' ₽');
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd2 = (v) => Math.round(v * 10) / 10;
  const step = (v, s) => Math.round(v / s) * s;

  /* ---------------- состояние ---------------- */
  // Важно: ensure() дозаполняет поля в существующем объекте, а не заменяет его — иначе ссылка на состояние
  // «стареет» после любого вложенного вызова (rnd → ensure) и запись прогресса теряется.
  const DEF = { v: 1, on: true, cur: null, nextDay: 0, n: 0, fail: 0, done: null, gAvg: 0, chk: 0, rng: 20261001 };
  function ensure(S) {
    if (!S) return null;
    const M = S.miles || (S.miles = {});
    for (const k in DEF) if (M[k] === undefined) M[k] = k === 'done' ? [] : DEF[k];
    if (!Array.isArray(M.done)) M.done = [];
    if (!M.cool || typeof M.cool !== 'object') M.cool = {}; // вид вехи, который не вышел, какое-то время не предлагаем
    if (typeof M.rng !== 'number' || !M.rng) M.rng = 20261001;
    if (M.nextDay == null) M.nextDay = S.day || 0;
    return M;
  }
  function rnd(S) { const M = ensure(S); M.rng = (Math.imul(M.rng >>> 0, 1664525) + 1013904223) >>> 0; return M.rng / 4294967296; }
  const rint = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));

  // где вехи уместны: первый акт или активный город второго, есть хоть одна открытая точка;
  // в прологе и в стадии 1 «Своя кофейня» — свои сюжетные вехи, там не мешаем
  function active(S) {
    if (!K().ON) return false;
    if (S && S.miles && S.miles.on === false) return false; // игрок выключил вехи в окне «Вехи»
    if (!S || S.lost || S.won) return false;
    if (S.phase !== 'play') return false;
    if (S.prologue && S.prologue.status === 'run') return false;
    if (BK.Stage1 && BK.Stage1.on && BK.Stage1.on(S)) return false;
    return open(S).length >= 1;
  }

  /* ---------------- что измеряем ---------------- */
  const staffAll = (S) => open(S).reduce((a, st) => a + st.staff.length, 0);
  const fullStores = (S) => open(S).filter((st) => st.staff.length >= (st.staffTarget || 0)).length;
  const guestsDay = (S) => open(S).reduce((a, st) => a + ((st.today && !st.today.closed && st.today.checks) || 0), 0);
  const dayCheck = (S) => { let r = 0, c = 0; for (const st of open(S)) { const t = st.today; if (!t || t.closed || !t.checks) continue; r += (t.check || 0) * t.checks; c += t.checks; } return c ? r / c : 0; };
  const fixedMonth = (S) => {
    const h = (S.history || [])[S.history.length - 1], p = h && h.pnl;
    if (!p) return 2.4e6;
    return Math.max(700e3, (p.rent || 0) + (p.payroll || 0) + (p.util || 0) + (p.tax || 0) + (p.agg || 0) + (p.other || 0));
  };
  const minMood = (S) => { let m = 100; for (const st of open(S)) for (const e of st.staff) m = Math.min(m, e.mood); return m; };
  const avgFat = (S) => { let f = 0, n = 0; for (const st of open(S)) for (const e of st.staff) { f += e.fatigue; n++; } return n ? f / n : 0; };
  const lowRated = (S) => { let b = null; for (const st of open(S)) { const r = E().storeRating(S, st); if (!b || r < b.r) b = { st, r }; } return b; };
  const lvl2 = (S) => { let n = 0; for (const st of open(S)) for (const e of st.staff) if (e.lvl >= 2) n++; return n; };
  const aggOn = (S) => open(S).filter((st) => st.agg).length;

  /* ---------------- виды вех ----------------
     ok(S) — уместна ли сейчас; mk(S) — числа на момент выдачи; val(S,m) — текущее значение;
     hit(S,m) — выполнено; txt(S,m) — { t, d, u }; rw — награда (маленькая и временная). */
  const KINDS = {
    staff: { // Полная смена
      ok: (S) => fullStores(S) < open(S).length,
      mk: (S) => ({ need: open(S).length, base: fullStores(S), d: rint(S, 14, 24) }),
      val: (S) => fullStores(S),
      hit: (S) => fullStores(S) >= open(S).length,
      txt: () => ({ t: 'Полная смена', d: 'Укомплектовать все точки: в каждой — штат по норме', u: 'точ.' }),
      rw: { t: 'traffic', v: 0.04, d: 12 },
    },
    rating: { // Рейтинг точки
      ok: (S) => { const b = lowRated(S); return !!b && b.r < 4.75; },
      mk: (S) => { const b = lowRated(S); return { need: rnd2(Math.min(4.85, b.r + 0.2)), base: rnd2(b.r), spot: b.st.id, num: b.st.num, d: rint(S, 45, 70) }; },
      val: (S, m) => { const st = E().byId(S.stores, m.spot); return st ? rnd2(E().storeRating(S, st)) : 0; },
      hit: (S, m) => { const st = E().byId(S.stores, m.spot); return !!st && E().storeRating(S, st) >= m.need - 0.001; },
      txt: (S, m) => ({ t: `Точка №${m.num} — до ★${String(m.need).replace('.', ',')}`, d: 'Подтянуть рейтинг на картах: обучение, ремонт, свежесть, настроение', u: '★' }),
      rw: { t: 'conv', v: 0.035, d: 12 },
    },
    guests: { // Полные залы
      ok: () => true,
      mk: (S) => { const d = rint(S, 10, 16), day = Math.max(40, Math.round(ensure(S).gAvg || guestsDay(S))); return { need: step(day * d * 1.06, 100), base: 0, got: 0, d }; },
      val: (S, m) => m.got || 0,
      hit: (S, m) => (m.got || 0) >= m.need,
      txt: (S, m) => ({ t: 'Полные залы', d: `Накормить ${n0(m.need)} гостей за ${m.d} дней`, u: 'гостей' }),
      rw: { t: 'traffic', v: 0.045, d: 12 },
    },
    check: { // Чек выше
      ok: (S) => (ensure(S).chk || 0) > 0,
      mk: (S) => { const c = Math.max(1, Math.round(ensure(S).chk)); return { need: step(c * 1.03, 10), base: c, d: rint(S, 32, 50) }; },
      val: (S) => Math.round(ensure(S).chk || 0),
      hit: (S, m) => (ensure(S).chk || 0) >= m.need,
      txt: (S, m) => ({ t: 'Чек выше', d: `Поднять средний чек сети с ${n0(m.base)} до ${n0(m.need)} ₽`, u: '₽' }),
      rw: { t: 'check', v: 0.03, d: 12 },
    },
    mood: { // Без недовольных
      ok: (S) => minMood(S) < 58,
      mk: (S) => ({ need: rint(S, 8, 14), base: 0, got: 0, d: rint(S, 12, 20) }),
      val: (S, m) => m.got || 0,
      hit: (S, m) => (m.got || 0) >= m.need,
      txt: (S, m) => ({ t: 'Без недовольных', d: `${m.need} дней подряд никто в команде не падает духом`, u: 'дн.' }),
      rw: { t: 'conv', v: 0.03, d: 12 },
    },
    fatigue: { // Отдохнувшая команда
      ok: (S) => avgFat(S) > 48,
      mk: (S) => ({ need: rint(S, 7, 12), base: Math.round(avgFat(S)), got: 0, d: rint(S, 12, 18) }),
      val: (S, m) => m.got || 0,
      hit: (S, m) => (m.got || 0) >= m.need,
      txt: (S, m) => ({ t: 'Отдохнувшая команда', d: `${m.need} дней подряд усталость сети ниже 45 % (сейчас ${m.base} %)`, u: 'дн.' }),
      rw: { t: 'traffic', v: 0.035, d: 12 },
    },
    nofire: { // Никто не ушёл
      ok: (S) => staffAll(S) >= 6,
      mk: (S) => ({ need: rint(S, 14, 24), base: staffAll(S), best: staffAll(S), got: 0, d: rint(S, 20, 30) }),
      val: (S, m) => Math.max(m.got || 0, 0),
      hit: (S, m) => (m.got || 0) >= m.need,
      txt: (S, m) => ({ t: 'Никто не ушёл', d: `${m.need} дней подряд команда не теряет людей`, u: 'дн.' }),
      rw: { t: 'conv', v: 0.03, d: 12 },
    },
    reserve: { // Подушка побольше
      ok: (S) => S.reserve < step(fixedMonth(S) * 0.6, 100e3),
      mk: (S) => ({ need: step(fixedMonth(S) * 0.6, 100e3), base: Math.round(S.reserve), d: rint(S, 30, 50) }),
      val: (S) => Math.round(S.reserve),
      hit: (S, m) => S.reserve >= m.need,
      txt: (S, m) => ({ t: 'Подушка побольше', d: `Довести резервный фонд до ${fm(m.need)} — запас прочности на спокойный месяц`, u: '₽' }),
      rw: { t: 'check', v: 0.03, d: 12 },
    },
    cash: { // Денег больше
      ok: (S) => S.cash > 0,
      mk: (S) => ({ need: step(Math.max(S.cash * 1.08, S.cash + 1e6), 500e3), base: Math.round(S.cash), d: rint(S, 28, 48) }),
      val: (S) => Math.round(S.cash),
      hit: (S, m) => S.cash >= m.need,
      txt: (S, m) => ({ t: 'Денег больше', d: `Довести счёт с ${fm(m.base)} до ${fm(m.need)}`, u: '₽' }),
      rw: { t: 'traffic', v: 0.03, d: 12 },
    },
    loan: { // Без долгов
      ok: (S) => S.loan > 0,
      mk: (S) => ({ need: 0, base: Math.round(S.loan), d: rint(S, 60, 120) }),
      val: (S) => Math.round(S.loan),
      hit: (S) => S.loan <= 0,
      txt: (S, m) => ({ t: 'Без долгов', d: `Погасить кредит ${fm(m.base)} — проценты останутся в деле`, u: '₽' }),
      rw: { t: 'conv', v: 0.04, d: 14 },
    },
    loanfree: { // Только свои деньги
      ok: (S) => S.loan <= 0,
      mk: (S) => ({ need: rint(S, 12, 20), base: 0, got: 0, d: rint(S, 16, 26) }),
      val: (S, m) => m.got || 0,
      hit: (S, m) => (m.got || 0) >= m.need,
      txt: (S, m) => ({ t: 'Только свои деньги', d: `${m.need} дней подряд без кредита`, u: 'дн.' }),
      rw: { t: 'traffic', v: 0.03, d: 12 },
    },
    train: { // Опытная команда
      ok: (S) => lvl2(S) > 0 && lvl2(S) < staffAll(S),
      mk: (S) => { const n = Math.max(1, Math.round(open(S).length * 0.5)); return { need: lvl2(S) + n, base: lvl2(S), d: rint(S, 40, 60) }; },
      val: (S) => lvl2(S),
      hit: (S, m) => lvl2(S) >= m.need,
      txt: (S, m) => ({ t: 'Опытная команда', d: `Довести число обучённых (2-й уровень и выше) с ${m.base} до ${m.need}`, u: 'чел.' }),
      rw: { t: 'conv', v: 0.04, d: 12 },
    },
    open: { // Ещё адрес
      ok: (S) => S.offers.length > 0 || S.stores.some((st) => st.status === 'opening'),
      mk: (S) => ({ need: open(S).length + 1, base: open(S).length, d: rint(S, 70, 120) }),
      val: (S) => open(S).length,
      hit: (S, m) => open(S).length >= m.need,
      txt: () => ({ t: 'Ещё адрес', d: 'Открыть новую точку — сеть растёт', u: 'точ.' }),
      rw: { t: 'traffic', v: 0.04, d: 14 },
    },
    agg: { // Больше заказов
      ok: (S) => !!(S.agg && S.agg.on) && aggOn(S) < open(S).length,
      mk: (S) => { const n = Math.max(1, Math.round(open(S).length * 0.34)); return { need: aggOn(S) + n, base: aggOn(S), d: rint(S, 25, 40) }; },
      val: (S) => aggOn(S),
      hit: (S, m) => aggOn(S) >= m.need,
      txt: (S, m) => ({ t: 'Больше заказов', d: `Подключить доставку ещё на ${m.need - m.base} ${(m.need - m.base) === 1 ? 'точке' : 'точках'}`, u: 'точ.' }),
      rw: { t: 'aggOrders', v: 1.06, d: 12, mult: true },
    },
    repair: { // Ремонт точки
      ok: (S) => open(S).some((st) => st.status === 'open' && (st.repair || 0) < (BK.CFG.REPAIRS.length - 1) && S.cash > E().repairCost(S, st) * 1.5),
      mk: (S) => { const st = open(S).filter((x) => x.status === 'open' && (x.repair || 0) < (BK.CFG.REPAIRS.length - 1) && S.cash > E().repairCost(S, x) * 1.5).sort((a, b) => (a.repair || 0) - (b.repair || 0))[0]; return { need: (st.repair || 0) + 1, base: st.repair || 0, spot: st.id, num: st.num, d: rint(S, 40, 62) }; },
      val: (S, m) => { const st = E().byId(S.stores, m.spot); return st ? (st.repair || 0) : 0; },
      hit: (S, m) => { const st = E().byId(S.stores, m.spot); return !!st && (st.repair || 0) >= m.need; },
      txt: (S, m) => ({ t: `Ремонт точки №${m.num}`, d: 'Сделать ремонт — уютнее, выше рейтинг и чек', u: 'ст.' }),
      rw: { t: 'check', v: 0.03, d: 12 },
    },
  };
  const ORDER = ['staff', 'rating', 'guests', 'check', 'mood', 'fatigue', 'reserve', 'train', 'nofire', 'loanfree', 'agg', 'repair', 'cash', 'loan', 'open'];
  const NAME = { 'staff': 'Полная смена', 'rating': 'Рейтинг точки', 'guests': 'Полные залы', 'check': 'Чек выше', 'mood': 'Без недовольных', 'fatigue': 'Отдохнувшая команда', 'nofire': 'Никто не ушёл', 'reserve': 'Подушка побольше', 'cash': 'Денег больше', 'loan': 'Без долгов', 'loanfree': 'Только свои деньги', 'train': 'Опытная команда', 'open': 'Ещё адрес', 'agg': 'Больше заказов', 'repair': 'Ремонт точки' };
  const GROUP = { staff: 'Команда', rating: 'Рейтинг', guests: 'Гости', check: 'Чек', mood: 'Настроение', fatigue: 'Усталость', reserve: 'Резерв', train: 'Обучение', nofire: 'Текучка', loanfree: 'Без долгов', agg: 'Доставка', repair: 'Точка', cash: 'Деньги', loan: 'Кредит', open: 'Рост' };
  const RW_NAME = { traffic: 'гостям сети', conv: 'конверсии', check: 'среднему чеку', aggOrders: 'заказам доставки' };
  const RW_SHORT = { traffic: 'гостям', conv: 'конверсии', check: 'чеку', aggOrders: 'заказам' };

  /* ---------------- выдача / награда / итог ---------------- */
  function logLine(S, text, kind) { const I_ = I(); if (I_.log) I_.log(S, text, kind); }

  function issue(S) {
    const M = ensure(S);
    const cand = ORDER.filter((k) => { if (M.cool[k] && M.cool[k] > S.day) return false; try { return KINDS[k].ok(S); } catch (e) { return false; } });
    if (!cand.length) { M.nextDay = S.day + 5; return null; }
    const fresh = cand.filter((k) => k !== M.lastK);
    // тасуем своим ГСЧ и берём первую веху, которая ещё НЕ выполнена прямо сейчас:
    // иначе бывает веха «на один день» (например, рейтинг уже выше цели) — она гаснет в тот же тик
    const order = (fresh.length ? fresh : cand).slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    let k = null, p = null;
    for (const c of order) {
      let pp; try { pp = KINDS[c].mk(S); } catch (e) { continue; }
      const probe = { k: c, at: S.day, until: S.day + pp.d, need: pp.need, base: pp.base, got: pp.got || 0, spot: pp.spot || null, num: pp.num || 0, best: pp.best || 0 };
      let already = false; try { already = !!KINDS[c].hit(S, probe); } catch (e) { already = false; }
      if (!already) { k = c; p = pp; break; }
    }
    if (!k) { M.nextDay = S.day + 5; return null; }
    M.cur = { k, at: S.day, until: S.day + p.d, need: p.need, base: p.base, got: p.got || 0, spot: p.spot || null, num: p.num || 0, best: p.best || 0 };
    M.lastK = k;
    const t = KINDS[k].txt(S, M.cur);
    logLine(S, `Веха: ${t.t} — ${t.d} (до ${E().fmtDate(M.cur.until)})`, 'info');
    if (BK.Sound) BK.Sound.play('click');
    if (S.notify) S.notify.push({ type: 'mile', phase: 'new', id: k });
    return M.cur;
  }

  function reward(S, m) {
    const rw = KINDS[m.k] && KINDS[m.k].rw; if (!rw) return '';
    const n = ensure(S).n || 0;
    const k = rw.mult ? rw.v : 1 + rw.v * (1 + Math.min(0.6, n * 0.01)); // с опытом чуть щедрее, но не бесконечно
    S.mods.push({ t: rw.t, m: k, until: S.day + rw.d, scope: 'global', src: 'mile' });
    return `+${Math.round((k - 1) * 100)} % к ${RW_NAME[rw.t] || rw.t} на ${rw.d} дн.`;
  }

  function complete(S, m) {
    const M = ensure(S), t = KINDS[m.k].txt(S, m), bonus = reward(S, m);
    M.n++; M.takeK = M.takeK || {}; M.takeK[m.k] = (M.takeK[m.k] || 0) + 1;
    M.cur = null; M.nextDay = S.day + rint(S, K().GAP[0], K().GAP[1]);
    M.done.push({ k: m.k, day: S.day, t: t.t });
    if (M.done.length > K().KEEP) M.done = M.done.slice(-K().KEEP);
    logLine(S, `Веха взята: ${t.t}${bonus ? ` — ${bonus}` : ''}`, 'good');
    if (S.notify) S.notify.push({ type: 'mile', phase: 'done', id: m.k, title: t.t, bonus });
  }
  function expire(S, m) {
    const M = ensure(S), t = KINDS[m.k].txt(S, m);
    M.fail++; M.failK = M.failK || {}; M.failK[m.k] = (M.failK[m.k] || 0) + 1;
    M.cool = M.cool || {}; M.cool[m.k] = S.day + K().COOL_FAIL; // не вышло — этот вид какое-то время не предлагаем
    M.cur = null; M.nextDay = S.day + rint(S, K().GAP_FAIL[0], K().GAP_FAIL[1]);
    logLine(S, `Веха не вышла: ${t.t}`, 'info');
    if (S.notify) S.notify.push({ type: 'mile', phase: 'fail', id: m.k, title: t.t });
  }

  /* ---------------- день ---------------- */
  function day(S) {
    const M = ensure(S); if (!M || !M.on) return;
    if (!active(S)) return;
    // скользящие средние — нужны и для выдачи, и для прогресса
    const g = guestsDay(S), c = dayCheck(S);
    M.gAvg = M.gAvg ? M.gAvg * 0.88 + g * 0.12 : g;
    if (c > 0) M.chk = M.chk ? M.chk * 0.85 + c * 0.15 : c;
    if (!M.cur) { if (S.day >= (M.nextDay || 0)) issue(S); return; }
    const m = M.cur, kd = KINDS[m.k];
    if (!kd) { M.cur = null; return; }
    try { // накопительные показатели
      if (m.k === 'guests') m.got = (m.got || 0) + g;
      else if (m.k === 'mood') m.got = minMood(S) >= 40 ? (m.got || 0) + 1 : 0;
      else if (m.k === 'fatigue') m.got = avgFat(S) < 45 ? (m.got || 0) + 1 : 0;
      else if (m.k === 'nofire') { const n = staffAll(S); if (n >= (m.best || 0)) { m.got = (m.got || 0) + 1; m.best = n; } else { m.got = 0; m.best = n; } }
      else if (m.k === 'loanfree') m.got = S.loan <= 0 ? (m.got || 0) + 1 : 0;
    } catch (e) { /* старое сохранение */ }
    let hit = false;
    try { hit = !!kd.hit(S, m); } catch (e) { hit = false; }
    if (hit) complete(S, m);
    else if (S.day > m.until) expire(S, m);
  }

  /* ---------------- данные для интерфейса ---------------- */
  function info(S) {
    const M = ensure(S); if (!M || !M.cur) return null;
    const m = M.cur, kd = KINDS[m.k]; if (!kd) return null;
    const t = kd.txt(S, m);
    let val = 0; try { val = kd.val(S, m); } catch (e) {}
    const need = m.need || 1;
    let p;
    if (m.k === 'loan') p = m.base ? cl(1 - val / m.base, 0, 1) : 0;
    else if (m.k === 'guests') p = cl(val / need, 0, 1);
    else if (m.k === 'mood' || m.k === 'fatigue' || m.k === 'nofire' || m.k === 'loanfree') p = cl(val / Math.max(1, need), 0, 1);
    else if (m.k === 'staff' || m.k === 'open' || m.k === 'agg' || m.k === 'train' || m.k === 'culture' || m.k === 'repair') p = cl((val - m.base) / Math.max(1, need - m.base), 0, 1);
    else p = cl((val - m.base) / Math.max(1, need - m.base), 0, 1);
    const show = {
      guests: `${n0(val)} / ${n0(need)}`, check: `${n0(val)} / ${n0(need)} ₽`, cash: `${fm(val)} / ${fm(need)}`, reserve: `${fm(val)} / ${fm(need)}`,
      loan: `осталось ${fm(val)}`, rating: `★${String(val).replace('.', ',')} / ★${String(need).replace('.', ',')}`,
      staff: `${val} / ${need}`, open: `${val} / ${need}`, agg: `${val} / ${need}`, train: `${val} / ${need}`, culture: `${val} / ${need}`, repair: `${val} / ${need}`,
      mood: `${val} / ${need} дн.`, fatigue: `${val} / ${need} дн.`, nofire: `${val} / ${need} дн.`, loanfree: `${val} / ${need} дн.`,
    }[m.k] || `${val} / ${need}`;
    const rw = kd.rw || null;
    return {
      k: m.k, group: GROUP[m.k] || 'Веха', t: t.t, d: t.d, u: t.u, p: cl(p, 0, 1), val, need, show,
      left: Math.max(0, m.until - S.day), at: m.at, until: m.until, spot: m.spot, num: m.num,
      reward: rw ? `+${Math.round((rw.mult ? rw.v : 1 + rw.v) * 100 - 100)} % к ${RW_NAME[rw.t] || rw.t} на ${rw.d} дн.` : '',
      rewardShort: rw ? `+${Math.round((rw.mult ? rw.v : 1 + rw.v) * 100 - 100)} % к ${RW_SHORT[rw.t] || rw.t} · ${rw.d} дн.` : '',
    };
  }
  // активные награды вех (что сейчас работает) — для «Сводки»
  function bonuses(S) {
    const out = [];
    for (const x of S.mods || []) if (x.src === 'mile' && x.until > S.day) out.push({ t: RW_NAME[x.t] || x.t, k: x.m, add: x.add, days: x.until - S.day, mult: x.t !== 'aggComm' });
    return out;
  }
  const done = (S) => { const M = ensure(S); return M ? M.done.slice().reverse() : []; };
  const stats = (S) => { const M = ensure(S); return { n: M.n, fail: M.fail, cur: M.cur, nextDay: M.nextDay, on: M.on, takeK: M.takeK || {}, failK: M.failK || {} }; };
  function setOn(S, v) { const M = ensure(S); M.on = !!v; if (!v) M.cur = null; return M.on; }
  function reset(S) { const M = ensure(S); M.cur = null; M.nextDay = S.day + 3; return M; }

  /* ---------------- подключение к движку ---------------- */
  function wrap() {
    const Eng = BK.Engine; if (!Eng || Eng.__miles) return;
    Eng.__miles = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const pre = S ? S.day : null;
      const r = ot.apply(this, arguments);
      if (S && S.day !== pre) { try { day(S); } catch (e) { /* вехи не должны ломать игру */ } }
      return r;
    };
  }
  if (BK.Engine) wrap();

  BK.Miles = { ensure, active, issue, day, info, bonuses, done, stats, setOn, reset, KINDS, ORDER, GROUP, NAME };
})();
