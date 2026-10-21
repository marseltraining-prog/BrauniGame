/* =====================================================================
   НАПРАВЛЕНИЯ РОСТА В ГОРОДАХ ДИРЕКТОРОВ — решение владельца 07.10.2026 (docs/waiting-owner.md п. 1, docs/russia-design.md §19).
   Кейтеринг, флагман, фабрика полуфабрикатов, полки в супермаркетах и франшиза в других городах второго акта ведёт ДИРЕКТОР
   сам — у игрока нет кнопок. Игрок видит итог строкой в отчёте директора, в карточке города и в итогах по городам.
   Домашний город (ключ `ufa`) не трогается — там по-прежнему вкладка «Рост» (src/growth.js).
   Правила (числа — BK.CFG.CORP.CITY_GROWTH):
     · открываются только в крупном городе — от MIN_STORES (10) открытых точек; одно направление с 10 точек, ещё одно — каждые
       SLOT_STORES (6) точек сверх, но не больше, чем тянет грейд директора (GRADE_SLOTS); новое — не чаще раза в GAP_DAYS;
       что открыть — по стилю директора (PREF: «Рост» — франшиза и полки, «Экономия» — фабрика, «Сервис» — кейтеринг и флагман);
     · всё считается в агрегированном месяце (вызов из BK.Corp.monthly / settleAgg сразу после расчёта точек города):
       выручка — доля выручки точек города (у франшизы — партнёры), маржа и риски — от качества директора (два навыка по
       направлению) и утечки (§16); флагман даёт гостям точек +2 % (через BK.Dir.mods), фабрика — фудкост точек ниже;
     · пока игрок сам ведёт город (он активен), направления на паузе: ни выручки, ни расходов; без директора — на самотёк.
   Деньги — в общий S.month по обычным статьям (выручка, fc, upkeep, other, capex), в выручку и прибыль города (c.mAcc) и в его
   прогноз (направления не искажают «выручку на точку к прогнозу»). Состояние — c.gd (нет поля — направлений нет: старые
   сохранения грузятся как есть). Свой ГСЧ (c.gd.rng): основной поток случайностей и города не сдвигается.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, I = E._int, C = () => BK.CFG, K = () => BK.CFG.CORP, G = () => BK.CFG.CORP.CITY_GROWTH;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const KEYS = ['cater', 'flag', 'factory', 'retail', 'fran'];
  const NAMES = { cater: 'Кейтеринг', flag: 'Флагман', factory: 'Фабрика полуфабрикатов', retail: 'Полки в супермаркетах', fran: 'Франшиза' };
  const fm = (v) => BK.fmtMoney(v);
  const on = () => { const g = G(); return !!(g && g.ON); };

  function rnd(g) { // mulberry32, как в growth.js
    let t = (g.rng = (g.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function seedOf(S, id) { let h = (S.seed | 0) ^ 0x3c6ef372; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193); return h | 0; }
  // состояние города: { rng, on: { ключ: день открытия }, fr: партнёров, ls: { ключ: месяцев в убытке }, next, last, tot, ev }
  function gdOf(S, c) {
    if (!c.gd || typeof c.gd !== 'object') c.gd = {};
    const g = c.gd;
    if (g.rng == null) g.rng = seedOf(S, c.id);
    if (!g.on || typeof g.on !== 'object') g.on = {};
    if (g.fr == null) g.fr = 0;
    if (!g.ls || typeof g.ls !== 'object') g.ls = {};
    if (g.next == null) g.next = 0;
    if (!g.tot) g.tot = { rev: 0, pr: 0 };
    return g;
  }
  const openStores = (c) => { let n = 0; for (const s of c.packed ? c.packed.stores : []) if (s.status !== 'opening') n++; return n; };
  const nOn = (g) => (g ? Object.keys(g.on).length : 0);
  function director(S, c) { // директор, который сейчас ведёт город (не в отпуске и не передаёт дела), или null
    const d = BK.Dir ? BK.Dir.dirOf(S, c) : null;
    return d && !(d.absentUntil > S.day) && d.leaveDay == null ? d : null;
  }
  function quality(S, c, d, k) { // качество направления: среднее двух навыков директора (с поправками стиля, KPI, кластера) / 100
    if (!d) return G().ABSENT_Q;
    const sk = BK.Dir.eff(S, d, c), two = G().SKILL[k] || ['ops', 'ops'];
    return clamp((sk[two[0]] + sk[two[1]]) / 200, 0, 1);
  }
  function slots(c, d, n) {
    const g = G(); if (!d || n < g.MIN_STORES) return 0;
    return Math.min(g.GRADE_SLOTS[d.grade] || 0, 1 + Math.floor((n - g.MIN_STORES) / g.SLOT_STORES));
  }
  const ramp = (S, day) => clamp((S.day - day) / 30.4 / G().RAMP_M, 0, 1);
  const riskK = (q, L) => Math.pow((1 - q) / 0.4, 2) * (1 + 3 * L);
  // множитель спроса точек города от флагмана (BK.Dir.mods): 1 + 2 % × разгон
  function demandK(S, c) {
    const g = c && c.gd; if (!g || !g.on.flag || !on()) return 1;
    return 1 + (G().D.flag.net || 0) * ramp(S, g.on.flag);
  }

  /* ---------------- месяц: вызывается сразу после расчёта точек упакованного города ---------------- */
  // r — итог cityMonth (r.rev — выручка точек за период, r.fcCost — их фудкост), frac — доля месяца
  function month(S, c, r, frac) {
    if (!on() || !c || c.id === 'ufa' || !c.packed || !(frac > 0) || !r) return null;
    if (!c.gd) { // направлений ещё нет: заводим состояние, только когда город дорос и есть директор
      const d0 = director(S, c); if (!d0 || openStores(c) < G().MIN_STORES) return null;
    }
    const g = gdOf(S, c), cg = G(), D = cg.D, pl = S.macro.priceLevel, tax = E.currentTaxRate(S);
    const d = director(S, c), L = c.leak || 0, n = openStores(c), R = r.rev || 0;
    const dc = BK.Corp._int.cityDef(S, c.id);
    const t = E.dateOf(Math.max(0, S.day - 1));
    const last = { y: t.y, m: t.m, rows: {}, ev: [], opened: null, closed: null, frac: +frac.toFixed(3) };
    let revAll = 0, prAll = 0;
    const book = (rev, cost) => { // выручка — в оборот сети и города; расходы — уже списаны вызывающим
      if (rev > 0) { S.cash += rev; S.month.rev += rev; S.cumRevenue += rev; S.yearRev += rev; revAll += rev; }
      prAll += rev * (1 - tax) - cost;
    };
    for (const k of KEYS) {
      if (g.on[k] == null) continue;
      const q = quality(S, c, d, k), rk = ramp(S, g.on[k]), x = D[k];
      const revK = (cg.REV_Q[0] + cg.REV_Q[1] * q) * (1 - K().LEAK_REV * L);
      const mAdd = cg.MARGIN_Q * (q - cg.Q0) - cg.LEAK_M * L;
      const row = { q: +q.toFixed(2) };
      let rev = 0, cost = 0;
      if (k === 'factory') { // экономия фудкоста точек, постоянные расходы — доля выручки точек
        const broke = rnd(g) < x.risk * riskK(q, L) * frac;
        const save = broke ? 0 : (r.fcCost || 0) * x.cut * (0.6 + 0.8 * q) * rk * (1 - L);
        const fix = R * x.fix + (broke ? x.capex * pl * x.repair : 0);
        if (save) I.spend(S, -save, 'fc'); // фудкост ниже (полуфабрикаты своей фабрики)
        I.spend(S, fix, 'upkeep');
        cost = fix - save; row.save = Math.round(save); row.cut = R > 0 && r.fcCost ? +(save / r.fcCost).toFixed(3) : 0;
        if (broke) { row.broke = 1; last.ev.push(`Фабрика: поломка линии — месяц без экономии, ремонт ${fm(x.capex * pl * x.repair)}`); }
      } else if (k === 'fran') {
        const want = Math.min(x.max, Math.floor(n * x.per));
        const gap = x.gapM / (d && d.style === 'growth' ? 2 : 1);
        if (d && g.fr < want && rnd(g) < frac / gap) { // новый партнёр: взнос
          g.fr++; const fee = x.fee * pl; book(fee, 0); rev += fee; row.signed = 1;
        }
        if (g.fr > 0) {
          const sc = Math.min(0.6, x.risk * g.fr * riskK(q, L) * frac);
          if (rnd(g) < sc) { // скандал у партнёра: рейтинг точек города вниз, партнёр уходит, компенсация
            for (const s of c.packed.stores) if (s.status !== 'opening') s.rating = clamp((s.rating != null ? s.rating : C().RATING_START) - x.hit, 1, 5);
            const comp = x.fee * pl * x.comp; I.spend(S, comp, 'other'); cost += comp; g.fr--;
            g.scand = (g.scand || 0) + 1; row.scandal = 1;
            last.ev.push(`Франшиза: скандал у партнёра — рейтинг точек −${String(x.hit).replace('.', ',')}★, договор расторгнут, компенсация ${fm(comp)}`);
          }
        }
        const inc = g.fr * x.inc * pl * (dc.inc || 1) * frac * revK * Math.max(0.3, rk);
        const ctrl = g.fr * x.ctrl * pl * frac;
        const op = inc * (1 - clamp(x.margin + mAdd, -0.5, 0.95));
        I.spend(S, op, 'fc'); I.spend(S, ctrl, 'upkeep');
        book(inc, 0); rev += inc; cost += op + ctrl; row.fr = g.fr;
      } else { // кейтеринг, полки, флагман: доля выручки точек
        const v = R * x.rev * revK * rk;
        const op = v * (1 - clamp(x.margin + mAdd, -0.5, 0.95)), fix = (x.fix || 0) * pl * frac;
        I.spend(S, op, 'fc'); if (fix) I.spend(S, fix, 'upkeep');
        book(v, 0); rev += v; cost += op + fix;
        if (x.risk && rnd(g) < x.risk * riskK(q, L) * frac) { // сорванный заказ / недопоставка в сеть
          const fine = v * x.fine; I.spend(S, fine, 'other'); cost += fine; row.fine = Math.round(fine);
          last.ev.push(k === 'cater' ? `Кейтеринг: сорван заказ — неустойка ${fm(fine)}` : `Полки: недопоставка в сеть — неустойка ${fm(fine)}`);
        }
        row.pct = R > 0 ? +(v / R).toFixed(3) : 0;
      }
      prAll -= cost; // расходы направления (выручка учтена в book)
      row.rev = Math.round(rev); row.pr = Math.round(rev * (1 - tax) - cost);
      last.rows[k] = row;
      // убыточное направление: сильный директор закрывает сам через CLOSE_M месяцев, слабый тянет дальше
      if (frac >= 0.5) {
        g.ls[k] = row.pr < 0 ? (g.ls[k] || 0) + 1 : 0;
        if (g.ls[k] >= cg.CLOSE_M && d && q >= cg.CLOSE_Q) { closeDir(S, c, g, k); last.closed = k; last.ev.push(`${d.name} ${d.f ? 'закрыла' : 'закрыл'} направление «${NAMES[k].toLowerCase()}»: полгода в убытке`); }
      }
    }
    // открыть новое направление: крупный город, свободный слот, пауза прошла, деньги есть
    const sl = slots(c, d, n);
    if (d && frac >= 0.5 && nOn(g) < sl && S.day >= g.next && S.corp.active !== c.id) {
      const pref = cg.PREF[d.style] || cg.PREF.balance;
      for (const k of pref) {
        if (g.on[k] != null || n < D[k].min || g.no === k) continue;
        const capex = D[k].capex * pl * (k === 'flag' ? (dc.rent || 1) : 1);
        if (S.cash < capex + cg.RESERVE * pl) break; // денег мало — подождём
        I.spend(S, capex, 'capex');
        g.on[k] = S.day; g.ls[k] = 0; g.next = S.day + cg.GAP_DAYS; g.no = undefined;
        last.opened = k; last.ev.push(`${d.name} ${d.f ? 'открыла' : 'открыл'} направление «${NAMES[k].toLowerCase()}» — вложено ${fm(capex)}`);
        I.log(S, `${dc.name}: директор ${d.name} открыл${d.f ? 'а' : ''} направление «${NAMES[k].toLowerCase()}» (${fm(capex)}).`, 'good');
        break;
      }
    }
    if (!nOn(g) && !last.ev.length) { g.last = null; return null; }
    last.rev = Math.round(revAll); last.pr = Math.round(prAll); last.base = Math.round(R);
    g.last = last; g.tot.rev += revAll; g.tot.pr += prAll;
    // в выручку и прибыль города (история, отчёт) и в прогноз — чтобы «к прогнозу» по точкам не искажался
    c.mAcc.rev += revAll; c.mAcc.profit += prAll; c.mAcc.fc = (c.mAcc.fc || 0) + revAll;
    return { rev: revAll, profit: prAll };
  }
  function closeDir(S, c, g, k) {
    delete g.on[k]; delete g.ls[k];
    if (k === 'fran') g.fr = 0;
    g.no = k; // не открывать то же сразу снова
    g.next = Math.max(g.next, S.day + G().GAP_DAYS);
  }

  /* ---------------- для интерфейса (без DOM) ---------------- */
  const pct = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',');
  // строки итога по направлениям за прошлый месяц: [{ k, name, text, tone }]
  function lines(S, id) {
    const c = S.corp && S.corp.cities[id], g = c && c.gd; if (!g || !g.last) return [];
    const out = [], L = g.last, fr = L.frac > 0 ? 1 / L.frac : 1;
    for (const k of KEYS) {
      const r = L.rows[k]; if (!r) continue;
      const pr = r.pr * fr;
      let text;
      if (k === 'fran') text = `${r.fr || 0} ${r.fr === 1 ? 'партнёр' : (r.fr % 10 >= 2 && r.fr % 10 <= 4 && (r.fr % 100 < 12 || r.fr % 100 > 14)) ? 'партнёра' : 'партнёров'}, роялти и закупки ${fm(r.rev * fr)}/мес`;
      else if (k === 'factory') text = `фудкост точек −${pct(r.cut || 0)} %, экономия ${fm((r.save || 0) * fr)}/мес`;
      else if (k === 'flag') text = `+${pct(r.pct || 0)} % выручки, гости точек +${Math.round((G().D.flag.net || 0) * 100)} %`;
      else text = `+${pct(r.pct || 0)} % выручки`;
      out.push({ k, name: NAMES[k], text: `${text} · прибыль ${fm(pr)}/мес`, tone: pr < 0 ? 'bad' : 'good', q: r.q });
    }
    return out;
  }
  // сводка для карточки города: строки, события месяца, подсказка о следующем направлении
  function info(S, id) {
    const c = S.corp && S.corp.cities[id]; if (!c || id === 'ufa' || !on()) return null;
    const g = c.gd, d = BK.Dir ? BK.Dir.dirOf(S, c) : null, n = c.packed ? openStores(c) : BK.Corp.cityStats(S, id).stores, cg = G();
    const sl = d ? slots(c, d, n) : 0, cnt = nOn(g);
    let hint = '';
    if (id === S.corp.active) hint = cnt ? 'Пока вы сами ведёте город, направления на паузе.' : 'Направлениями роста здесь занимается директор, когда вы уезжаете.';
    else if (n < cg.MIN_STORES) hint = `Направления роста директор откроет в крупном городе — с ${cg.MIN_STORES} точек (сейчас ${n}).`;
    else if (!d) hint = cnt ? 'Без директора направления идут на самотёк — маржа падает, новых нет.' : 'Нужен директор — он сам откроет направления роста.';
    else if (cnt < sl) hint = S.day < (g ? g.next : 0) ? `Следующее направление — не раньше ${E.fmtDate(g.next)}.` : 'Директор присматривается к новому направлению.';
    else if (cnt < (cg.GRADE_SLOTS[d.grade] || 0)) hint = `Ещё одно направление — с ${cg.MIN_STORES + cnt * cg.SLOT_STORES} точек.`;
    else if (cnt) hint = `Больше направлений директор грейда ${d.grade} не потянет.`;
    else hint = `Директор грейда ${d.grade} пока не тянет направления роста.`;
    return { lines: lines(S, id), ev: g && g.last ? g.last.ev : [], hint, tot: g ? g.tot : null, keys: g ? KEYS.filter((k) => g.on[k] != null) : [], fr: g ? g.fr : 0 };
  }
  function names(S, id) { const c = S.corp && S.corp.cities[id], g = c && c.gd; return g ? KEYS.filter((k) => g.on[k] != null).map((k) => NAMES[k]) : []; }

  BK.CityGrowth = { month, demandK, lines, info, names, slots, quality, NAMES, KEYS };
})();
