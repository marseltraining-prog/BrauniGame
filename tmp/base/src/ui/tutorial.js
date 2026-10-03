/* Обучение новичка: пошаговые карточки с подсветкой элементов интерфейса в первые месяцы игры.
   Состояние — S.tutorial = { on, step, done: [ид шагов], seen: {} } (старые сохранения — выкл).
   Советы (BK.TutAdvice) — чистые функции без DOM: их же использует sim/newbie.js («новичок по советам»),
   чтобы проверить, что советы обучения действительно спасают от банкротства. */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = () => BK.Engine, C = () => BK.CFG;
  const PREF_KEY = 'bk-ufa-tutorial'; // выбор «Обучение для новичка» на стартовом экране: '1' / '0'

  /* ================= советы (без DOM) ================= */
  const A = {
    // цех: открытие + 2 года аренды и коммуналки + доставка на ~5 точек, разбросанных по городу
    prodCost2y(S, o) {
      const cfg = C(), E_ = E(), D = BK.DISTRICTS;
      let km = 0; for (const d of D) km += E_.dist(o, d) * E_.kmPerUnit() / D.length;
      const del = (cfg.DELIVERY_BASE + cfg.DELIVERY_PER_KM * km) * S.macro.priceLevel;
      const rent = E_.prodRentMonth(o) + (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * o.area) * S.macro.priceLevel;
      return { total: E_.prodOpenCost(S, o).total + 24 * (rent + del * 5), rent, del, km };
    },
    prodPick(S) {
      const list = S.prodOffers.map((o) => ({ o, c: A.prodCost2y(S, o), toCenter: E().dist(o, BK.CENTER_POINT) * E().kmPerUnit() })).sort((a, b) => a.c.total - b.c.total);
      return list.length ? { best: list[0], worst: list[list.length - 1], center: list.slice().sort((a, b) => a.toCenter - b.toCenter)[0], list } : null;
    },
    // сколько держать на счёте после открытия точки: зарплаты и аренда 1-го числа, пока выручка растёт
    cushion(S) { return 2.5e6 * S.macro.priceLevel; },
    // точки: прогноз прибыли и сколько останется на счёте
    storeCands(S) {
      if (!BK.estimateOffer) return [];
      return S.offers.map((o) => { const est = BK.estimateOffer(S, o), capex = E().storeOpenCost(S, o).total; return { o, est, capex, left: S.cash - capex }; });
    },
    // свободный кредитный лимит (кнопки «Взять 5 млн»)
    loanRoom(S) { return Math.max(0, E().loanLimit(S) - S.loan); },
    // первая точка: лучший прогноз прибыли среди тех, после которых (с кредитом) на счёте остаётся ≥ 2,5 млн
    storePick(S) {
      const room = A.loanRoom(S), cands = A.storeCands(S);
      const safe = cands.filter((x) => x.est.profit > 0 && x.left + room >= A.cushion(S)).sort((a, b) => b.est.profit - a.est.profit);
      if (safe.length) { const x = safe[0]; return Object.assign({ safe: true, loan: x.left < A.cushion(S) ? A.loanFor(S, A.cushion(S) - x.left) : 0 }, x); }
      const c = cands.filter((x) => x.left >= 0).sort((a, b) => b.left - a.left);
      return c.length ? Object.assign({ safe: false, loan: 0 }, c[0]) : null;
    },
    // постоянные расходы месяца (аренда, зарплаты, доставка, цех, проценты) — без налога
    monthCosts(S) { const f = BK.billsForecast ? BK.billsForecast(S) : null; return f ? f.bills : 0; },
    // «К 1-му числу не хватит»: сколько не хватит (0 — хватает)
    gap(S) {
      if (!BK.billsForecast || !S.stores.some((s) => s.status !== 'opening')) return 0;
      const f = BK.billsForecast(S); return Math.max(0, -(f.cashAt1 + S.reserve));
    },
    // сколько кредита взять кнопками по 5 млн, чтобы закрыть разрыв с запасом
    loanFor(S, need) { return Math.ceil((need + 1e6 * S.macro.priceLevel) / 5e6) * 5e6; },
    // вторая (и следующая) точка: все открытые точки сами в плюсе за прошлый месяц, ничего не открывается,
    // есть помещение с хорошим прогнозом, и после аренды (можно с кредитом) на счёте останется запас на 2 месяца
    // обязательных платежей 1-го числа (их покрывает и выручка, поэтому запас ≈ 1 месяц расходов + подушка)
    nextStore(S) {
      const open = S.stores.filter((s) => s.status !== 'opening');
      if (!open.length || open.length < S.stores.length) return { ok: false, why: 'opening' };
      if (open.some((s) => !s.last)) return { ok: false, why: 'first-month' };
      if (open.some((s) => s.last.profit <= 0)) return { ok: false, why: 'loss' };
      // вторая точка — даже если сеть в целом в минусе (одну точку цех не окупает); третья и дальше — только когда сеть в плюсе
      const last = S.history[S.history.length - 1];
      if (S.stores.length >= 2 && (!last || last.profit <= 0)) return { ok: false, why: 'net' };
      const bills = A.monthCosts(S), pl = S.macro.priceLevel;
      const room = Math.max(0, A.loanRoom(S) - bills); // часть лимита держим про запас — на месяц расходов
      const cands = A.storeCands(S).filter((x) => x.est.profit >= 1.5e5 * pl).map((x) => Object.assign(x, { need: x.capex + Math.max(A.cushion(S), bills) }));
      if (!cands.length) return { ok: false, why: 'offers' };
      const ok = cands.filter((x) => S.cash + room >= x.need).sort((a, b) => b.est.profit - a.est.profit);
      if (!ok.length) return { ok: false, why: 'cash', cands };
      const pick = ok[0];
      return { ok: true, pick, bills, loan: S.cash >= pick.need ? 0 : pick.need - S.cash };
    },
    // распределение прибыли по советам обучения
    alloc(S) { return { reserve: S.loan > 0 && S.stores.length < 3 ? 0 : 0.1, bonus: 0.03, marketing: 0.04 }; },
    payTarget(S, kind) { return S.market[kind] * 1.06; },
    // событие: когда денег мало — самый дешёвый вариант
    lowMoney(S) { return S.cash + S.reserve < Math.max(3e6 * S.macro.priceLevel, A.monthCosts(S) * 1.5); },
    cheapestChoice(ev) { if (!ev || !ev.choices) return 0; let b = 0; ev.choices.forEach((c, i) => { if ((c.cost || 0) < (ev.choices[b].cost || 0)) b = i; }); return b; },
  };
  BK.TutAdvice = A;
  BK.TutPref = {
    get() { try { const v = localStorage.getItem(PREF_KEY); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; } },
    set(on) { try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (e) { /* без хранилища выбор живёт до перезагрузки */ } },
  };
})();

/* ================= интерфейс обучения ================= */
(function () {
  if (typeof document === 'undefined') return; // sim/* в Node — только советы
  const E = () => BK.Engine, C = () => BK.CFG, A = BK.TutAdvice;
  const APP = () => BK.App, H = () => BK.UIH;
  const fm = (v) => BK.fmtMoney(v), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = (s, el) => (el || document).querySelector(s);
  const phone = () => innerWidth <= 820;
  const dn = (id) => (E().byId(BK.DISTRICTS, id) || {}).name || id;
  const pctx = (v) => String(Math.round(v * 1000) / 10).replace('.', ',') + '%';
  const TOTAL = 12;
  // советы с оценкой помещений считаются не каждый кадр, а при изменении дня, денег, кредита или рынка
  const memoS = {};
  const memo = (name, S, fn) => { const k = [S.day, Math.round(S.cash), S.loan, S.offers.length, S.stores.length, S.prodOffers.length, S.phase].join('|'); const m = memoS[name]; if (m && m.S === S && m.k === k) return m.v; const v = fn(); memoS[name] = { S, k, v }; return v; };
  const prodPick = (S) => memo('prod', S, () => A.prodPick(S)), storePick = (S) => memo('store', S, () => A.storePick(S)), nextStore = (S) => memo('next', S, () => A.nextStore(S));

  /* ---------- состояние ---------- */
  function st(S) { if (!S.tutorial) S.tutorial = { on: false, step: null, done: [] }; return S.tutorial; }
  const isDone = (S, id) => st(S).done.indexOf(id) >= 0;
  const on = (S) => !!(S && S.tutorial && S.tutorial.on);
  const tab = (t) => { const ui = APP().ui; if (ui.tab !== t) APP().ACT.tab({ arg: t }); };
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find((el) => re.test(el.textContent));
  const secBy = (re) => { const h = byText('#pbody .sec > h3', re); return h ? h.parentElement : null; };
  const loan5 = () => { APP().ACT.loan({ arg: 5e6 }); };

  /* ---------- звук обучения (этап «озвучка») ----------
     Одно событие — один звук: появление карточки — тихий щелчок, выполнение шага — короткий «тап»,
     финал обучения — «ленточка», выключили обучение — тихий щелчок. Идущие подряд события (шаг выполнен
     и сразу появился следующий) звучат один раз: между своими звуками держим паузу 150 мс. */
  let sndAt = 0;
  function snd(name, hard) {
    const Sd = BK.Sound; if (!Sd || !name) return false;
    const now = globalThis.performance ? performance.now() : Date.now();
    if (!hard && now - sndAt < 150) return false; // не строчить
    if (!Sd.play(name)) return false;             // в скрытой вкладке и при выключенном звуке — тишина
    sndAt = now; return true;
  }

  /* ---------- шаги ----------
     seq — идут по порядку сразу после старта; остальные срабатывают по ситуации (trig).
     target(S, ui) → элемент для обводки; key — что обязательно должно остаться видно (по умолчанию target).
     done(S, ui) → шаг выполнен сам (карточка закрывается); ok — подпись кнопки «прочитал» (нет — нужно действие игрока). */
  const STEPS = [
    { id: 'prod', seq: true, n: 1, skip: (S) => S.phase !== 'setup_prod', done: (S) => S.phase !== 'setup_prod',
      start(S) { const p = prodPick(S); if (p) APP().ACT.focusProdOffer({ arg: p.best.o.id }); },
      target(S) { const p = prodPick(S); const b = p && $(`#pbody [data-act="rentProd"][data-arg="${p.best.o.id}"]`); return b ? b.closest('.card') : null; },
      key(S) { const p = prodPick(S); return p && $(`#pbody [data-act="rentProd"][data-arg="${p.best.o.id}"]`); },
      title: 'Цех — не в центре',
      body(S) {
        const p = prodPick(S); if (!p) return '';
        const row = (x) => `<li${x === p.best ? ' class="best"' : ''}><span>${esc(dn(x.o.district))}, до центра ${String(x.toCenter.toFixed(1)).replace('.', ',')} км</span><b>${fm(x.c.total)}</b></li>`;
        return `<p>Цех печёт для всех точек. В центре аренда дороже всего, а экономия на доставке мала — одна-две точки её не окупят. Сравните, во сколько цех обойдётся <b>за 2 года</b> (открытие, аренда, доставка):</p>
          <ul class="tut-list">${p.list.map(row).join('')}</ul>
          <p>Нажмите <b>«Арендовать под цех»</b> на подсвеченной карточке.</p>`;
      } },
    { id: 'store', seq: true, n: 2, skip: (S) => S.phase === 'play', done: (S) => S.phase === 'play',
      start(S) { const p = storePick(S); if (p) APP().ACT.focusOffer({ arg: p.o.id }); },
      target(S) { const p = storePick(S); return p ? $(`#pbody [data-offer="${p.o.id}"]`) : null; },
      key(S) { const p = storePick(S); return p ? $(`#pbody [data-act="rent"][data-arg="${p.o.id}"]`) : null; },
      title: 'Первая точка: прогноз и запас',
      body(S) {
        const p = storePick(S);
        const gen = `<p>Главное — строка <b>«Прогноз прибыли»</b>: столько точка даст в месяц, когда раскрутится. Первые недели гостей ~60% от прогноза, а зарплаты и аренда — 1-го числа, поэтому после аренды оставьте на счёте <b>≥ ${fm(A.cushion(S))}</b>. Оплата «за год» уже учтена в строке «останется».</p>`;
        if (!p) return gen;
        const needLoan = p.left < A.cushion(S) && A.loanRoom(S) > 0;
        const rec = p.safe ? `<p class="tut-rec">Советуем: <b>${esc(p.o.address)}</b> — прогноз ≈ <b>${fm(p.est.profit)}/мес</b>. ${needLoan ? `Своих денег на запас не хватит: сначала <b>кредит 5 млн</b> (это нормально — расскажем дальше), тогда останется ≈ ${fm(p.left + Math.min(5e6, A.loanRoom(S)))}.` : `После аренды останется ${fm(p.left)}.`}</p>`
          : `<p class="tut-rec">Запаса не оставляет ни одно помещение. Возьмите то, после которого останется больше денег (<b>${esc(p.o.address)}</b>), и сразу кредит.</p>`;
        return rec + gen;
      },
      acts(S) { const p = storePick(S); return p && p.left < A.cushion(S) && A.loanRoom(S) > 0 ? [{ id: 'loan5', label: 'Взять кредит 5 млн', primary: true }] : []; } },
    { id: 'time', seq: true, n: 3, pause: true, start: () => { if (phone()) window.scrollTo(0, 0); }, target: () => $('.hud .speed'), title: 'Время и пауза',
      body(S) { const s0 = S.stores[0], d = s0 && s0.status === 'opening' ? Math.max(0, s0.openDay - S.day) : 0; return `<p>Время пошло: <b>1 секунда — 1 день</b>. Пауза — эта кнопка${phone() ? '' : ' или пробел'}, ×3 и ×10 — быстрее.${d ? ` Точка откроется через ${H().nw(d, 'день', 'дня', 'дней')}.` : ''}</p><p>На важных шагах обучения игра сама встаёт на паузу.</p>`; }, ok: 'Понятно' },
    { id: 'dash', seq: true, n: 4, pause: true, start: () => tab('dash'), target: () => $('#pbody .sec.att'), title: '«Сводка» и «Требует внимания»',
      body: () => `<p>«Сводка» — главный экран. Блок <b>«Требует внимания»</b> — список дел: <span class="tut-bad">красное</span> — срочно, <span class="tut-warn">жёлтое</span> — скоро, у каждого дела есть кнопка.</p><p>Заглядывайте сюда раз в неделю и обязательно <b>за 2–3 дня до 1-го числа</b> — в этот день списываются аренда и зарплаты.</p>`, ok: 'Понятно' },
    { id: 'loan', seq: true, n: 5, pause: true, skip: (S) => S.loan > 0 && !st(S).restart, done: (S) => S.loan > 0 && APP().ui.tab === 'fin',
      target: (S, ui) => (ui.tab === 'fin' ? $('#pbody [data-act="loan"][data-arg="5000000"]') : $('#tabs [data-arg="fin"]')),
      title: 'Кредит — до первого 1-го числа',
      body(S, ui) {
        const r = E().loanRate(S);
        const head = ui.tab === 'fin' ? '<p>Нажмите <b>«Взять 5 млн»</b>.</p>' : '<p>Откройте вкладку <b>«Финансы»</b>.</p>';
        return `${head}<p>Кредит на старте — это нормально: первые месяцы точка раскручивается и сеть в минусе, а зарплаты, аренду и цех платить 1-го числа. Проценты ≈ ${fm(5e6 * r / 12)} в месяц.</p><p>Без запаса легко получить <b>кассовый разрыв</b> (денег не хватает на платежи), а 3 месяца подряд в минусе — банкротство. Вернёте, когда сеть выйдет в плюс, — «Требует внимания» подскажет.</p>`;
      }, ok: 'Не сейчас', okPlain: true },
    { id: 'alloc', seq: true, n: 6, pause: true, start: () => tab('fin'),
      target: () => { const i = $('#al-reserve'); return i ? i.closest('.sec') : null; },
      done: (S) => { const a = S.alloc, w = A.alloc(S); return Math.abs(a.reserve - w.reserve) < 0.005 && Math.abs(a.bonus - w.bonus) < 0.005 && Math.abs(a.marketing - w.marketing) < 0.005; },
      title: 'Как делить прибыль',
      body(S) {
        const r = E().loanRate(S), rr = Math.max(0, S.macro.keyRate - C().RESERVE_SPREAD);
        return `<p>Прибыль месяца делится по этим ползункам. Пока есть кредит и меньше 3 точек:</p><ul class="tut-list plain"><li><b>Резерв 0%</b> — копить под ${pctx(rr)}, занимая под ${pctx(r)}, невыгодно.</li><li><b>Премии 3%</b> — команда довольнее, реже уходит.</li><li><b>Маркетинг 4%</b> — больше гостей.</li></ul><p>Кредит погашен и точек 3+ — ставьте резерв 10–15%.</p>`;
      },
      acts: () => [{ id: 'alloc', label: 'Поставить 0 / 3 / 4%', primary: true }], ok: 'Сделаю сам' },
    { id: 'team', seq: true, n: 7, pause: true, start: () => tab('team'),
      target: () => { const b = $('#pbody [data-act="pay"][data-arg="seller"]'); return b ? b.closest('.card') : null; },
      done: (S) => S.pay.seller >= S.market.seller * 1.04,
      title: 'Зарплата и штат',
      body: () => `<p>Платите <b>на уровне рынка или чуть выше</b> — на 5–10% (3 нажатия «+»). Ниже рынка люди уходят, а найм нового стоит ${String(C().HIRE_COST_SALARIES).replace('.', ',')} зарплаты.</p><p>Сколько людей нужно точке, подскажет её карточка («Точки»): «хватит ~N чел.». Людей не хватает — в «Требует внимания» будет кнопка «Нанять».</p>`,
      acts: () => [{ id: 'pay', label: 'Рынок +6%', primary: true }], ok: 'Сделаю сам' },
    { id: 'first1', n: 8, pause: true, trig: (S) => S.history.length >= 1, start: () => tab('dash'),
      target: () => secBy(/Отчёт за прошлый месяц/), key: () => { const s = secBy(/Отчёт за прошлый месяц/); return s && s.querySelector('h3'); },
      title: '1-е число: день платежей',
      body: (S) => { const h = S.history[S.history.length - 1]; return `<p>1-го числа списались аренда, зарплаты, коммуналка, доставка, цех и налог — всё в «Отчёте за прошлый месяц»${h ? `, итог <b>${fm(h.profit)}</b>` : ''}.</p><p>Новая точка сначала получает <b>~60% гостей</b> и раскручивается до полного потока месяцев за 5. Минус в первые месяцы — нормально, если хватает денег на следующее 1-е число.</p>`; }, ok: 'Понятно' },
    { id: 'gap', n: 9, pause: true, trig: (S) => A.gap(S) > 0 || S.cash < 0, start: () => tab('dash'), done: (S) => A.gap(S) <= 0 && S.cash >= 0,
      target: () => byText('#pbody .sec.att .it', /К 1-му числу|Кассовый разрыв/) || $('.hud .s-cash'),
      key: () => { const it = byText('#pbody .sec.att .it', /К 1-му числу|Кассовый разрыв/); return it ? it.querySelector('.btn') || it : null; },
      title: 'К 1-му числу не хватит денег',
      body: (S) => {
        const g = Math.max(A.gap(S), -S.cash), room = A.loanRoom(S);
        const clicks = Math.max(1, Math.round(A.loanFor(S, g) / 5e6));
        return `${room >= 1e5 ? `<p class="tut-rec">Возьмите кредит сейчас: «Взять 5 млн»${clicks > 1 ? ` — ${clicks} раза` : ''} (здесь или во вкладке «Финансы»).</p>` : '<p class="tut-bad">Кредитный лимит исчерпан — отложите покупки и выбирайте в событиях самые дешёвые варианты.</p>'}<p>Прогноз: к 1-му числу не хватит <b>≈ ${fm(g)}</b>. Если 1-го числа счёт в минусе, зарплату выдают с задержкой — команда недовольна, а 3 таких месяца подряд — банкротство.</p>`;
      },
      acts: (S) => (A.loanRoom(S) >= 1e5 ? [{ id: 'loan5', label: 'Взять 5 млн', primary: true }] : []), ok: 'Понятно' },
    { id: 'event', n: 10, modal: true, trig: (S) => !!(S.ev.pending && S.ev.pending.choices && S.ev.pending.choices.length > 1), done: (S) => !S.ev.pending,
      target: (S) => { const ev = S.ev.pending; return ev && ev.choices ? $(`#modal [data-choice="${A.cheapestChoice(ev)}"]`) : null; },
      title: 'Событие: выбирайте по деньгам',
      body(S) {
        const low = A.lowMoney(S);
        return `<p>Пока вы не выберете, время стоит. На счёте <b>${fm(S.cash)}</b>${S.reserve > 0 ? ` и ${fm(S.reserve)} в резерве` : ''}.</p>${low ? '<p>Денег мало — берите <b>самый дешёвый вариант</b> (подсвечен), даже если он хуже: главное — дожить до 1-го числа без минуса.</p>' : `<p>Денег хватает — можно заплатить за лучший исход, но оставьте запас на 1-е число (≈ ${fm(A.monthCosts(S))}). Когда денег мало — всегда <b>самый дешёвый вариант</b> (подсвечен).</p>`}`;
      }, ok: 'Понятно' },
    { id: 'second', n: 11, pause: true, trig: (S) => { const o = S.stores.filter((x) => x.status !== 'opening'); return o.length >= 1 && o.every((x) => x.last && x.last.profit > 0); },
      start: () => tab('market'),
      target(S) { const n = nextStore(S); return (n.ok && $(`#pbody [data-offer="${n.pick.o.id}"]`)) || $('#tabs [data-arg="market"]'); },
      key(S) { const n = nextStore(S); return (n.ok && $(`#pbody [data-act="rent"][data-arg="${n.pick.o.id}"]`)) || null; },
      title: 'Когда открывать вторую точку',
      body(S) {
        const n = nextStore(S);
        let rec = '';
        if (n.ok) rec = `<p class="tut-rec">Сейчас подходит: <b>${esc(n.pick.o.address)}</b> — прогноз ≈ <b>${fm(n.pick.est.profit)}/мес</b>${n.loan > 0 ? `; не хватает ${fm(n.loan)} — сначала кредит` : ''}.</p>`;
        else if (n.why === 'cash') rec = '<p class="tut-rec">Сейчас денег на запас не хватает — подождите месяц-другой: выручка растёт, а с ней и кредитный лимит.</p>';
        else if (n.why === 'offers') rec = '<p class="tut-rec">Сейчас на рынке нет помещения с хорошим прогнозом — новые появляются раз в 1–2 недели.</p>';
        return `${rec}<p>Точка в плюсе. Цех рассчитан на 5–8 точек, поэтому с одной точкой сеть в целом в минусе. Следующую открывайте, когда:</p><ul class="tut-list plain"><li>все точки в плюсе за прошлый месяц;</li><li>после аренды останется ≥ ${fm(A.cushion(S))} — можно с кредитом, но не выбирайте лимит до конца;</li><li>третью и дальше — только когда в плюсе вся сеть («Сводка» → «Прибыль»).</li></ul>`;
      },
      acts: (S) => { const n = nextStore(S); return n.ok && n.loan > 0 && A.loanRoom(S) > 0 ? [{ id: 'loan5', label: 'Взять 5 млн', primary: true }] : []; }, ok: 'Понятно' },
    { id: 'final', n: 12, pause: true, trig: (S) => isDone(S, 'second') && (S.stores.length >= 2 || S.day >= 240), target: () => $('.hud .goal'),
      title: 'Дальше — сами',
      body: () => `<ul class="tut-list plain"><li>Больше ${C().HR_REQUIRED_STORES} точек — нужен <b>HR-отдел</b> («Команда»), иначе найм медленный.</li><li>Больше ${C().TRAIN_REQUIRED_STORES} — <b>отдел обучения</b>.</li><li>Цех загружен на 90% — докупайте оборудование («Цех»).</li><li>Кредит погашен и точек 3+ — резерв 10–15%.</li><li>Цель — <b>5 млрд ₽</b> оборота за 12 месяцев.</li></ul><p>Пройти обучение заново — «Меню игры» (шестерёнка).</p>`,
      ok: 'Завершить обучение' },
  ];
  const STEP = {}; STEPS.forEach((s) => { STEP[s.id] = s; });

  /* ---------- выбор текущего шага ---------- */
  function pick(S) {
    const T = st(S);
    if (!isDone(S, 'event') && isDone(S, 'store') && STEP.event.trig(S)) return 'event'; // событие с выбором — вне очереди
    if (T.step && STEP[T.step] && !isDone(S, T.step)) return T.step;
    for (const s of STEPS) {
      if (!s.seq || isDone(S, s.id)) continue;
      if (s.skip && s.skip(S)) { T.done.push(s.id); continue; }
      return s.id;
    }
    for (const id of ['gap', 'first1', 'second', 'final']) if (!isDone(S, id) && STEP[id].trig(S)) return id; // по ситуации — по важности
    return null;
  }

  /* ---------- DOM ---------- */
  let root = null, ring = null, card = null, cur = null, curHtml = '', scrolledFor = null, pausedBy = null, lastCheck = 0, lastDay = -1;
  function build() {
    if (root) return;
    root = document.createElement('div'); root.id = 'tut'; root.className = 'tut'; root.hidden = true;
    root.innerHTML = '<div class="tut-ring" aria-hidden="true"></div><div class="tut-card" role="dialog" aria-modal="false" aria-labelledby="tut-t"><i class="tut-arrow" aria-hidden="true"></i><div class="tut-in"></div></div>';
    document.body.appendChild(root);
    ring = root.querySelector('.tut-ring'); card = root.querySelector('.tut-card');
    card.addEventListener('click', onCardClick);
  }
  function hide() { if (root && !root.hidden) { root.hidden = true; document.documentElement.classList.remove('tut-on'); } }
  function render(S, s) {
    const ui = APP().ui;
    const acts = s.acts ? s.acts(S, ui) : [];
    const html = `<div class="tut-eb"><span>Обучение · шаг ${s.n} из ${TOTAL}</span><span class="tut-dots" aria-hidden="true">${STEPS.map((x) => `<i class="${isDone(S, x.id) ? 'd' : x.id === s.id ? 'c' : ''}"></i>`).join('')}</span></div>
      <h3 id="tut-t">${s.title}</h3><div class="tut-tx">${s.body(S, ui)}</div>
      <div class="tut-f">${acts.map((a) => `<button type="button" class="btn${a.primary ? ' primary' : ''}" data-tut="${a.id}">${a.label}</button>`).join('')}${s.ok ? `<button type="button" class="btn${acts.length || s.okPlain ? '' : ' primary'}" data-tut="ok">${s.ok}</button>` : ''}${s.id === 'final' ? '' : '<button type="button" class="btn ghost" data-tut="skip">Пропустить обучение</button>'}</div>`;
    if (html !== curHtml) { card.querySelector('.tut-in').innerHTML = html; curHtml = html; }
  }
  function onCardClick(e) {
    const b = e.target.closest('[data-tut]'); if (!b) return;
    const S = APP().state; if (!S) return;
    const k = b.dataset.tut, s = STEP[cur];
    if (k === 'skip') { finish(S, true); return; }
    if (k === 'ok') { complete(S, cur); return; }
    if (k === 'loan5') loan5();
    else if (k === 'alloc') { E().setAlloc(S, A.alloc(S)); APP().refresh(); }
    else if (k === 'pay') { for (const kind of ['seller', 'baker']) E().setPay(S, kind, A.payTarget(S, kind)); APP().refresh(); }
    curHtml = ''; lastCheck = 0;
    if (s && s.done && s.done(S, APP().ui)) complete(S, cur);
  }
  function complete(S, id) {
    const T = st(S);
    if (id && T.done.indexOf(id) < 0) T.done.push(id);
    T.step = null; delete T.restart;
    cur = null; curHtml = ''; scrolledFor = null;
    if (id === 'final') { finish(S, false); return; } // финал озвучивает finish: «ленточка»
    snd('tap'); // шаг выполнен
    // снять паузу, которую ставило обучение, — если следующий шаг её не требует
    const next = pick(S);
    if (pausedBy && (!next || !STEP[next].pause)) { APP().setSpeed(pausedBy); pausedBy = null; }
    lastCheck = 0; hide();
  }
  function finish(S, skipped) {
    const T = st(S); T.on = false; T.step = null; delete T.restart;
    if (pausedBy) { APP().setSpeed(pausedBy); pausedBy = null; }
    cur = null; curHtml = ''; hide();
    snd(skipped ? 'click' : 'ribbon', !skipped); // финал обучения — «ленточка» (одно событие — один звук)
    if (skipped) APP().toast('Обучение выключено', 'Включить снова — «Меню игры» (шестерёнка) → «Пройти обучение заново».', 'good');
    else APP().toast('Обучение пройдено', 'Удачи! Цель — 5 млрд ₽ оборота за 12 месяцев.', 'good');
    APP().save();
  }

  /* ---------- позиционирование ---------- */
  const hudH = () => { const h = $('.hud'); return phone() && h ? h.getBoundingClientRect().height : 0; };
  const visibleRect = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  function ensureVisible(key, fixed) {
    if (!key) return;
    if (!phone()) {
      const r = key.getBoundingClientRect(), sc = key.closest('#pbody, .modal'), box = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      if (r.top < box.top + 8 || r.bottom > box.bottom - 8) key.scrollIntoView({ block: 'center' });
      return;
    }
    if (fixed) { key.scrollIntoView({ block: 'nearest' }); return; }
    const ch = card.getBoundingClientRect().height, top = hudH() + 10, bottom = innerHeight - ch - 18;
    const r = key.getBoundingClientRect();
    if (r.top >= top && r.bottom <= bottom) return;
    window.scrollBy(0, r.height <= bottom - top ? r.top - top - Math.max(0, (bottom - top - r.height) / 3) : r.bottom - bottom);
  }
  function place(target, key, fixedT) {
    const W = innerWidth, Hh = innerHeight, M = 8, G = 16;
    const tr = target && visibleRect(target);
    if (tr) { const p = 5; Object.assign(ring.style, { display: 'block', left: tr.left - p + 'px', top: tr.top - p + 'px', width: tr.width + 2 * p + 'px', height: tr.height + 2 * p + 'px' }); }
    else ring.style.display = 'none';
    root.classList.toggle('dim', !tr);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y, side = 'none';
    if (phone()) {
      // место под карточкой внизу страницы: иначе последнюю карточку списка нельзя прокрутить выше неё
      const pad = Math.round(ch + 24) + 'px';
      if (document.documentElement.style.getPropertyValue('--tut-pad') !== pad) document.documentElement.style.setProperty('--tut-pad', pad);
      // телефон: карточка прижата к низу; к верху — если нужный элемент в окне внизу (варианты события)
      const kr = (key && visibleRect(key)) || tr;
      const topDock = !!(kr && fixedT && kr.top + kr.height / 2 > Hh / 2);
      x = M; y = topDock ? M : Hh - ch - M;
      card.classList.toggle('top', topDock);
      if (tr) side = topDock ? (tr.top > y + ch ? 'down' : 'none') : (tr.bottom < y ? 'up' : 'none');
    } else if (!tr) { x = (W - cw) / 2; y = (Hh - ch) / 2; }
    else {
      const fits = (a, b) => a >= M && b >= M && a + cw <= W - M && b + ch <= Hh - M;
      const cy = Math.min(Hh - ch - M, Math.max(M, tr.top + tr.height / 2 - ch / 2)), cx = Math.min(W - cw - M, Math.max(M, tr.left + tr.width / 2 - cw / 2));
      const o = [['left', tr.left - G - cw, cy], ['right', tr.right + G, cy], ['up', cx, tr.bottom + G], ['down', cx, tr.top - G - ch]].find((q) => fits(q[1], q[2]));
      if (o) { side = o[0]; x = o[1]; y = o[2]; } else { x = W - cw - M; y = Hh - ch - M; }
    }
    card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
    // стрелка смотрит на центр цели
    const ar = card.querySelector('.tut-arrow');
    card.dataset.side = side;
    if (tr && side !== 'none') {
      if (side === 'left' || side === 'right') ar.style.cssText = `top:${Math.round(Math.min(ch - 24, Math.max(12, tr.top + tr.height / 2 - y - 7)))}px;left:${side === 'left' ? cw - 8 : -8}px`;
      else ar.style.cssText = `left:${Math.round(Math.min(cw - 24, Math.max(12, tr.left + tr.width / 2 - x - 7)))}px;top:${side === 'up' ? -8 : ch - 8}px`;
    } else ar.style.cssText = 'display:none';
  }

  /* ---------- цикл ---------- */
  function tick() {
    const app = APP(); if (!app || !app.ui) return;
    const S = app.state, ui = app.ui, startEl = document.getElementById('start');
    if (!on(S) || S.lost || (S.corp && S.corp.active && S.corp.active !== 'ufa') || ui.view === 'russia' || (startEl && !startEl.hidden)) { if (cur && (!S || !on(S))) { cur = null; curHtml = ''; } hide(); return; }
    build();
    const now = performance.now();
    if (now - lastCheck > 250 || S.day !== lastDay || (cur === 'event') !== !!S.ev.pending) {
      lastCheck = now; lastDay = S.day;
      if (cur && STEP[cur].done && STEP[cur].done(S, ui)) { complete(S, cur); return; }
      const id = pick(S);
      if (id !== cur) {
        cur = id; curHtml = ''; scrolledFor = null;
        if (id && id !== 'event') st(S).step = id;
        if (id) {
          snd('click'); // появилась карточка шага
          const s = STEP[id];
          if (s.start && !ui.modal) s.start(S, ui);
          if (s.pause && ui.speed > 0) { pausedBy = pausedBy || ui.speed; app.setSpeed(0); }
        }
      }
    }
    if (!cur) { hide(); return; }
    const s = STEP[cur];
    // поверх другое окно (итоги года, шеф) — карточку прячем, шаг ждёт
    if ((ui.modal && !s.modal) || (!ui.modal && s.modal)) { hide(); return; }
    render(S, s);
    if (root.hidden) { root.hidden = false; document.documentElement.classList.add('tut-on'); }
    const target = s.target ? s.target(S, ui) : null;
    const key = (s.key && s.key(S, ui)) || target;
    const fixedT = !!(target && target.closest('#modal, .hud'));
    const sk = cur + '|' + ui.tab + '|' + (key ? key.tagName + key.className : '');
    place(target, key, fixedT);
    if (key && scrolledFor !== sk) { scrolledFor = sk; ensureVisible(key, fixedT); place(target, key, fixedT); }
  }
  function loop() {
    try { tick(); } catch (e) { if (!loop.err) { loop.err = 1; console.warn('Обучение:', e && e.message); } } // обучение не должно ронять игру
    requestAnimationFrame(loop);
  }

  /* ---------- стартовый экран, новая игра, меню ---------- */
  function defaultOn() {
    const p = BK.TutPref.get(); if (p != null) return p;
    try { if (BK.Slots) for (let n = 1; n <= BK.Slots.N; n++) if (BK.Slots.info(n)) return false; } catch (e) { /* нет хранилища */ }
    return true; // сохранений нет — скорее всего, новичок
  }
  function startOpt() {
    const v = defaultOn();
    return `<div class="rival-opt tut-opt"><div class="row"><span>Обучение для новичка</span><div class="seg" role="group" aria-label="Обучение для новичка"><button type="button" data-tutopt="1" aria-pressed="${v}">вкл</button><button type="button" data-tutopt="0" aria-pressed="${!v}">выкл</button></div></div><small>Подсказки по шагам в первые месяцы: где поставить цех, как не уйти в минус к 1-му числу и когда открывать вторую точку.</small></div>`;
  }
  function bindStart(el) {
    el.querySelectorAll('[data-tutopt]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-tutopt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      BK.TutPref.set(b.dataset.tutopt === '1');
    }));
  }
  const picked = () => { const b = document.querySelector('#start [data-tutopt="1"]'); return b ? b.getAttribute('aria-pressed') === 'true' : defaultOn(); };
  function newGame(S) { S.tutorial = { on: picked(), step: null, done: [] }; cur = null; curHtml = ''; pausedBy = null; }
  function restart() {
    const S = APP().state; if (!S) return;
    S.tutorial = { on: true, step: null, done: [], restart: true };
    cur = null; curHtml = ''; pausedBy = null; sndAt = 0;
    APP().closeModal(); APP().toast('Обучение запущено', 'Подсказки появятся по шагам.', 'good');
    snd('click'); // «пройти заново»: дальше карточку озвучит появление первого шага
  }
  const settingsHtml = () => '<div class="row sp tut-set"><span>Обучение для новичка</span><button type="button" class="btn" data-act="tutRestart">Пройти обучение заново</button></div>';

  BK.Tutorial = { startOpt, bindStart, newGame, restart, settingsHtml, active: on, STEPS, get current() { return cur; } };
  const boot = () => { if (BK.App && BK.App.ACT) BK.App.ACT.tutRestart = restart; requestAnimationFrame(loop); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot)); else setTimeout(boot);
})();
