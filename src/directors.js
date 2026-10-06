/* =====================================================================
   ДИРЕКТОРА ГОРОДОВ — второй акт, этап Р2 (docs/russia-design.md §5.3, §6.1–6.4, §6.6, §6.10, §8.1).
   Подключается после corp.js; corp.js вызывает BK.Dir.mods / train / monthly / afterMonth / yearly / ensure.
   Всё состояние — внутри S.corp (у сохранений Р1 полей нет — ensure() ставит значения по умолчанию):
     S.corp.directors = [Director]   — нанятые (на городе или в резерве)
     S.corp.dirCand = [Director], dirCandDay — пул кандидатов (обновляется раз в квартал, за плату — сразу)
     S.corp.inbox = [Item]           — входящие: отчёты директоров с просьбами, «Директор года», заметки (до 60)
     S.corp.fed = { goalDay, legendDay } — цель акта «Федеральная сеть» и дополнительная «Лидер рынка»
     S.corp.dirYear = { y: dirId }   — «Директор года» по годам
     city.directorId, city.priority ('growth'|'profit'|'quality'), city.budget = { capex, left, train, close },
     city.plan = { y, from, stores, monthRev, margin }, city.dev = { y, opened, closed }, city.wantBudget, city.closeReq
   Director = { id, name, f, grade, skills{ops,econ,growth,people}, seen{…} (как видно на собеседовании, ±15),
                style, traits[], hidden[] (скрытые черты — только заготовка, механика в Р3), loyalty, loyD, loyWhy[],
                salary (₽/мес), bio, src, city, joined, months, cityMonths, manualM, adaptUntil, praiseDay, pot, hist[] }
   Все случайности — ГСЧ корпорации (S.corp.rng) и городов (city.rng): основной поток Уфы не сдвигается.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, I = E._int, C = () => BK.CFG, K = () => BK.CFG.CORP;
  const CI = () => BK.Corp._int;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SK = ['ops', 'econ', 'growth', 'people'];
  const STYLES = ['growth', 'economy', 'service', 'balance'];
  const PRIO_OF = { growth: 'growth', economy: 'profit', service: 'quality' }; // стиль директора ↔ приоритет города
  const VIS = ['reliable', 'ambitious', 'charismatic', 'cautious', 'gambler', 'mentor', 'cityHall', 'executive', 'mediaStar'];
  const HID = [['theft', 8], ['embellish', 7], ['burnout', 5], ['rivalAgent', 3]];
  const def = (id) => BK.CITY_BY_ID[id] || {};
  const fm = (v) => BK.fmtMoney(v);
  const on = (S) => !!(S && S.corp && S.corp.unlockedDay != null);

  /* ---------------- состояние по умолчанию ---------------- */
  function ensure(S) {
    const cr = S && S.corp; if (!cr) return;
    if (!cr.directors) cr.directors = [];
    if (!cr.inbox) cr.inbox = [];
    if (!cr.fed) cr.fed = { goalDay: null, legendDay: null };
    if (!cr.dirYear) cr.dirYear = {};
    if (cr.dirSeq == null) cr.dirSeq = 0;
    if (cr.repSeq == null) cr.repSeq = 0;
    for (const id in cr.cities) {
      const c = cr.cities[id];
      if (c.directorId === undefined) c.directorId = null;
      if (!c.priority) c.priority = 'profit';
      if (!c.budget) c.budget = { capex: 0, left: 0, train: K().DIR_TRAIN_TARGET, close: true, open: true };
      if (!c.dev) c.dev = { y: E.dateOf(S.day).y, opened: 0, closed: 0 };
    }
    if (!cr.dirCand) { cr.dirCand = []; refreshCands(S, false); }
    if (BK.HQ) BK.HQ.ensure(S); // Р3: штаб, мотивация, скрытые черты — значения по умолчанию
  }

  /* ---------------- кандидаты ---------------- */
  function corpRng(S, fn) { return CI().withRng(S, S.corp, 'rng', fn); }
  function pickW(S, list) { let t = 0; for (const x of list) t += x[1]; let r = I.rnd(S) * t; for (const x of list) { r -= x[1]; if (r < 0) return x[0]; } return list[0][0]; }
  function makeDirector(S, src, maxOwn) { // maxOwn — потолок грейда «своих» (университет 3-го уровня — до 3)
    const K_ = K(), cr = S.corp;
    const grade = src === 'own' ? I.ri(S, 1, maxOwn || 2) : src === 'hunter' ? pickW(S, [[3, 0.5], [4, 0.35], [5, 0.15]]) : pickW(S, [[1, 0.35], [2, 0.4], [3, 0.25]]);
    const f = I.rnd(S) < 0.5;
    const first = I.pick(S, f ? BK.NAMES_F.concat(BK.DIRECTOR_NAMES_F || []) : BK.NAMES_M.concat(BK.DIRECTOR_NAMES_M || []));
    let sur = I.pick(S, BK.SURNAMES.concat(BK.DIRECTOR_SURNAMES || [])); if (f && /(ов|ев|ин)$/.test(sur)) sur += 'а';
    const bios = (BK.DIRECTOR_BIOS || []).filter((b) => grade >= b.g[0] && grade <= b.g[1] && (!b.src || b.src === src || (src === 'market' && b.src !== 'own' && b.src !== 'hunter')));
    const bio = bios.length ? I.pick(S, bios) : null;
    const style = bio && bio.style && I.rnd(S) < 0.7 ? bio.style : I.pick(S, STYLES);
    const cap = K_.DIR_CAP[grade], rg = K_.DIR_SKILL[grade], skills = {};
    for (const k of SK) skills[k] = I.ri(S, rg[0], rg[1]);
    const lean = { growth: 'growth', economy: 'econ', service: 'people' }[style]; if (lean) skills[lean] += 8; // стиль — от сильной стороны
    if (src === 'own') skills.ops += 10;
    const traits = [];
    const nt = I.rnd(S) < 0.45 ? 2 : 1;
    while (traits.length < nt) { const t = I.pick(S, VIS); if (traits.indexOf(t) < 0) traits.push(t); }
    if (traits.indexOf('charismatic') >= 0) skills.people += 10;
    for (const k of SK) skills[k] = clamp(skills[k], 5, cap);
    const hp = (K_.DIR_HIDDEN_P[src] || 0.25) * ({ easy: 0.6, hard: 1.5 }[S.difficulty] || 1);
    const hidden = I.rnd(S) < hp ? [pickW(S, HID)] : [];
    const err = BK.HQ ? BK.HQ.skillErr(S) : K_.DIR_SKILL_ERR, seen = {};
    for (const k of SK) seen[k] = clamp(Math.round(skills[k] + I.rr(S, -err, err)), 0, 100);
    const d = { id: 'd' + (++cr.dirSeq), name: `${first} ${sur}`, f, grade, skills, seen, style, traits, hidden, src,
      loyalty: Math.round(I.rr(S, K_.DIR_LOY0[0], K_.DIR_LOY0[1]) + (src === 'own' ? K_.DIR_LOY_OWN : 0)), loyD: 0, loyWhy: [],
      bio: bio ? bio.t : '', pot: I.ri(S, 1, 3), city: null, joined: null, months: 0, cityMonths: 0, manualM: 0, adaptUntil: 0, praiseDay: -999, hist: [] };
    d.salary = Math.round(marketPay(S, d, null) * I.rr(S, 0.95, 1.1) / 1000) * 1000;
    if (BK.HQ) BK.HQ.dirInit(S, d);
    return d;
  }
  function refreshCands(S, paid) {
    const cr = S.corp, K_ = K();
    if (paid) { const fee = Math.round(K_.DIR_CAND_FEE * S.macro.priceLevel); if (S.cash < fee) return { ok: false, msg: 'Не хватает денег' }; I.spend(S, fee, 'other'); }
    corpRng(S, () => {
      cr.dirCand = [];
      // «свои люди»: самый опытный продавец 4–5-го уровня активного города (§6.2) — если такой есть
      let best = null; for (const st of S.stores) for (const e of st.staff) if (e.lvl >= 4 && (!best || e.lvl > best.e.lvl || (e.lvl === best.e.lvl && e.since < best.e.since))) best = { e, st };
      if (best && !cr.directors.some((d) => d.fromEmp === best.e.id) && I.rnd(S) < 0.6) {
        const d = makeDirector(S, 'own'); d.name = best.e.name; d.f = BK.isFemale(best.e.name); d.fromEmp = best.e.id;
        d.bio = BK.corpText ? txtG(`{g:Прошёл|Прошла} путь от продавца до наставника в нашей сети: точка №${best.st.num}, ${best.st.address}.`, d.f) : '';
        cr.dirCand.push(d);
      }
      const N = BK.HQ ? BK.HQ.candN(S) : K_.DIR_CAND_N, hunt = BK.HQ && BK.HQ.lvlOf(S, 'hr') ? K_.HR_HUNTERS : 0; // HR-департамент: 5 кандидатов, из них 2 — от хедхантера
      while (cr.dirCand.length < N - hunt) cr.dirCand.push(makeDirector(S, 'market'));
      while (cr.dirCand.length < N) cr.dirCand.push(makeDirector(S, 'hunter'));
    });
    cr.dirCandDay = S.day;
    return { ok: true };
  }
  const txtG = (s, f) => String(s).replace(/\{g2?:([^|}]*)\|([^}]*)\}/g, (_, m, w) => (f ? w : m));
  function marketPay(S, d, cityId) {
    const K_ = K(), dc = cityId ? CI().cityDef(S, cityId) : { wage: 1 };
    let avg = 0; for (const k of SK) avg += d.skills[k] / 4;
    return K_.DIR_SALARY[d.grade] * S.macro.priceLevel * Math.sqrt(dc.wage || 1) * (0.8 + 0.4 * avg / 100) * (dc.big ? 1.15 : 1) * (BK.HQ ? BK.HQ.priceK(d) : 1) * (d.regional ? K_.REGION_PAY : 1);
  }

  /* ---------------- найм, назначение, увольнение ---------------- */
  const dirById = (S, id) => (S.corp.directors || []).find((d) => d.id === id) || null;
  const dirOf = (S, c) => (c && c.directorId ? dirById(S, c.directorId) : null);
  function hire(S, candId, cityId) {
    if (!on(S)) return { ok: false };
    const cr = S.corp, d = cr.dirCand.find((x) => x.id === candId); if (!d) return { ok: false, msg: 'Кандидат уже ушёл' };
    const cost = BK.HQ ? BK.HQ.hireCost(S, d) : Math.round(d.salary * K().DIR_HIRE_SALARIES);
    if (S.cash < cost) return { ok: false, msg: `Не хватает ${fm(cost - S.cash)}` };
    I.spend(S, cost, 'hire');
    cr.dirCand = cr.dirCand.filter((x) => x.id !== candId);
    d.joined = S.day;
    cr.directors.push(d);
    I.log(S, `${d.name} ${d.f ? 'принята' : 'принят'} в директора (грейд ${d.grade}, оклад ${fm(d.salary)}/мес).`, 'good');
    if (cityId) assign(S, d.id, cityId);
    return { ok: true, d, cost };
  }
  function assign(S, dirId, cityId, quiet) {
    const cr = S.corp, d = dirById(S, dirId); if (!d) return { ok: false, msg: 'Директор не найден' };
    if (d.city === cityId) return { ok: true };
    if (BK.HQ && d.region && d.region.length) BK.HQ.dropRegion(S, d); // региональный: кластер распадается при переводе
    if (d.city && cr.cities[d.city]) cr.cities[d.city].directorId = null;
    if (!cityId) { d.city = null; d.cityMonths = 0; if (!quiet) I.log(S, `${d.name} — в резерве (половина оклада).`, 'info'); return { ok: true }; }
    const c = cr.cities[cityId]; if (!c) return { ok: false, msg: 'Город не найден' };
    const old = dirOf(S, c);
    if (old && old.city !== cityId && BK.HQ) BK.HQ.dropRegion(S, old, cityId); // город уходит из кластера регионального директора
    else if (old) { if (BK.HQ && old.region && old.region.length) BK.HQ.dropRegion(S, old); old.city = null; old.cityMonths = 0; I.log(S, `${old.name} переведен${old.f ? 'а' : ''} в резерв.`, 'info'); }
    const was = d.city;
    c.directorId = d.id; d.city = cityId; d.cityMonths = 0; d.manualM = 0;
    if (was || c.status === 'run') d.adaptUntil = S.day + 30; // месяц адаптации на новом месте (§6.11)
    c.priority = PRIO_OF[d.style] || c.priority || 'profit'; // по умолчанию — предложение директора
    if (!c.budget.capex) { c.budget.capex = proposeCapex(S, c, d); c.budget.left = Math.round(c.budget.capex * yearLeft(S)); }
    makePlan(S, c, d);
    if (!quiet) I.log(S, `${d.name} — директор ${CI().cityIn(cityId)}.`, 'good');
    return { ok: true };
  }
  function fire(S, dirId, sev) { // sev — окладов выходного пособия (по умолчанию DIR_FIRE_SALARIES; пойманного на воровстве — 0)
    const cr = S.corp, d = dirById(S, dirId); if (!d) return { ok: false };
    const cost = Math.round(d.salary * (sev != null ? sev : K().DIR_FIRE_SALARIES));
    if (cost) I.spend(S, cost, 'other');
    removeDir(S, d);
    I.log(S, `${d.name} ${d.f ? 'уволена' : 'уволен'}${cost ? `: выходное пособие ${fm(cost)}` : ' без выходного пособия'}.`, 'warn');
    return { ok: true, cost };
  }
  function removeDir(S, d) { // снять с города (и кластера) и убрать из списка
    const cr = S.corp;
    if (BK.HQ && d.region && d.region.length) BK.HQ.dropRegion(S, d);
    if (d.city && cr.cities[d.city] && cr.cities[d.city].directorId === d.id) cr.cities[d.city].directorId = null;
    cr.directors = cr.directors.filter((x) => x !== d);
  }
  function setSalary(S, dirId, k) {
    const d = dirById(S, dirId); if (!d) return { ok: false };
    const old = d.salary; d.salary = Math.round(d.salary * k / 1000) * 1000;
    if (d.salary < old) { d.loyalty = clamp(d.loyalty + K().LOY_CUT_PAY, 0, 100); }
    return { ok: true };
  }
  function praise(S, repId) {
    const it = S.corp.inbox.find((x) => x.id === repId); if (!it || it.praised) return { ok: false };
    const d = dirById(S, it.dir); if (!d) return { ok: false, msg: 'Директор уже не работает' };
    if (S.day - d.praiseDay < 90) return { ok: false, msg: 'Отмечать можно не чаще раза в квартал' };
    d.praiseDay = S.day; it.praised = true; d.loyalty = clamp(d.loyalty + K().LOY_PRAISE, 0, 100);
    return { ok: true };
  }
  function setPriority(S, cityId, p) { const c = S.corp.cities[cityId]; if (c && ['growth', 'profit', 'quality'].indexOf(p) >= 0) c.priority = p; return { ok: !!c }; }
  function setBudget(S, cityId, o) {
    const c = S.corp.cities[cityId]; if (!c) return { ok: false }; const b = c.budget;
    if (o.capex != null) {
      const nv = Math.max(0, Math.round(o.capex / 1e6) * 1e6), diff = nv - b.capex;
      const d = dirOf(S, c);
      if (diff < 0 && d && !c.budgetCutY) { d.loyalty = clamp(d.loyalty + K().LOY_CUT, 0, 100); c.budgetCutY = E.dateOf(S.day).y; } // урезали посреди года
      b.capex = nv; b.left = Math.max(0, b.left + diff * yearLeft(S));
    }
    if (o.train != null) b.train = clamp(Math.round(o.train), 1, 5);
    if (o.close != null) b.close = !!o.close;
    if (o.open != null) b.open = !!o.open;
    if (o.pay != null) c.payK = clamp(o.pay, 0.9, 1.25);
    return { ok: true };
  }
  const yearLeft = (S) => { const t = E.dateOf(S.day); return (12 - t.m) / 12; };

  /* ---------------- навыки, лимиты, модификаторы агрегированного месяца ---------------- */
  function eff(S, d, c) { // навыки с поправкой на совпадение приоритета города со стилем (±5%), KPI-перекос и кластер регионального (Р3)
    const m = match(d, c), k = 1 + K().DIR_PRIO_EFF * m, o = {};
    const x = BK.HQ ? BK.HQ.skillAdd(S, d, c) : { add: null, k: 1 };
    for (const s of SK) o[s] = clamp((d.skills[s] + (x.add ? x.add[s] : 0)) * k * x.k, 0, 100);
    return o;
  }
  function match(d, c) { if (!c || d.style === 'balance') return 0; return PRIO_OF[d.style] === c.priority ? 1 : -1; }
  function openLimit(S, c, d) {
    const K_ = K(), g = eff(S, d, c).growth;
    let n = K_.DIR_OPEN_BASE + K_.DIR_OPEN_K * g / 100;
    if (d.style === 'growth') n *= K_.DIR_GROWTH_STYLE_K;
    if (d.style === 'service') n *= 0.85;
    if (c.priority === 'growth') n *= 1.25; else if (c.priority === 'quality') n *= 0.85;
    const ov = BK.HQ && BK.HQ.load ? BK.HQ.load(S).over : 0; // Р4 ч. 2: перегруженный штаб не успевает согласовывать открытия
    if (ov > 0) n *= Math.max(K_.OVER_OPEN_MIN || 0.25, 1 - (K_.OVER_OPEN || 0) * ov);
    return Math.round(n);
  }
  function payback(d, c, S) { // порог окупаемости: стиль × опыт в «Росте» (сильный директор уверенно берёт места с долгой окупаемостью)
    const g = S ? eff(S, d, c).growth : d.skills.growth;
    let p = (K().DIR_PAYBACK[d.style] || 24) * (K().DIR_PB_K[0] + K().DIR_PB_K[1] * g / 100);
    if (c.priority === 'growth') p += 4; else if (c.priority === 'profit') p -= 4;
    if (d.traits.indexOf('cautious') >= 0) p *= 0.85;
    if (BK.HQ) p *= BK.HQ.paybackK(d); // KPI «открытия/выручка» — берёт места похуже
    return p;
  }
  function proposeCapex(S, c, d) { // «предложение директора»: годовой лимит открытий × средняя цена точки
    const per = K().DIR_OPEN_COST * S.macro.priceLevel * (0.6 + 0.4 * (CI().cityDef(S, c.id).rent || 1));
    return Math.round(openLimit(S, c, d) * per / 1e6) * 1e6;
  }
  function mods(S, c) {
    const d = dirOf(S, c); if (!d || c.id === S.corp.active || d.absentUntil > S.day || d.leaveDay != null) return null; // в отпуске или передаёт дела — «владелец заочно»
    const cfg = C(), sk = eff(S, d, c), st = d.style, late = d.cityMonths >= 12;
    let D = K().DIR_D0 + K().DIR_D_K * sk.ops / 100;
    D *= st === 'service' ? 1.02 : st === 'growth' ? 0.99 : st === 'economy' && late ? 0.98 : 1;
    if (d.adaptUntil > S.day) D *= 0.97;
    const has = (t) => d.traits.indexOf(t) >= 0;
    const W = cfg.RATING_W, fresh = cfg.BAKE_LEVELS[clamp(Math.round(E.wasteState(S).bake), -3, 3) + 3].fresh;
    const rAdd0 = 0.1 * (sk.ops - 60) / 40 + (st === 'service' ? 0.2 : 0) - (st === 'economy' && late ? 0.2 : 0) + (c.priority === 'quality' ? 0.1 : 0);
    const m = {
      d, D, eps: has('gambler') ? 2 : has('reliable') ? 0.6 : 1, leak: c.leak || 0, // Р4: утечка слабого директора
      mood: K().DIR_MOOD_PEOPLE * (sk.people - 50) / 50 + (st === 'service' ? 3 : st === 'economy' ? -3 : 0),
      quitK: has('charismatic') ? 0.85 : 1,
      fcK: (1 + 0.04 * (0.5 - sk.econ / 100)) * (st === 'economy' ? 0.97 : 1),
      payK: st === 'service' ? 1.05 : st === 'economy' ? 0.97 : 1,
      rentK: (1 - 0.02 * (sk.econ - 50) / 50) * (st === 'economy' ? 0.98 : 1),
      trainTarget: clamp((c.budget.train || 3) + (c.priority === 'quality' ? 1 : 0), 1, 5),
      trainRate: K().DIR_TRAIN_RATE[0] + K().DIR_TRAIN_RATE[1] * sk.people / 100,
      rating: (s, avgL, mood, n) => {
        const ratio = s.staffTarget ? Math.min(1, n / s.staffTarget) : 1;
        const t = W.train * clamp(cfg.RATING_TRAIN[0] + cfg.RATING_TRAIN[1] * (avgL - 1), 1, 5) + W.repair * cfg.RATING_REPAIR[s.repair || 0]
          + W.mood * clamp(1 + 4 * Math.pow(clamp(mood, 0, 100) / 100, cfg.RATING_MOOD_EXP), 1, 5) + W.staff * clamp(5 - 8 * (1 - ratio), 1, 5) + W.fresh * fresh;
        return clamp(t + rAdd0 + (m.rAdd || 0), 1, 5);
      },
    };
    return BK.HQ ? BK.HQ.modsAdj(S, d, c, m) : m; // Р3: учёба, воровство, университет, KPI «только прибыль», стандарты бренда
  }
  // обучение персонала точки агрегированно: доля людей ниже цели поднимается на уровень (ГСЧ города)
  function train(S, sd, dm, frac) {
    let n = 0, cost = 0; const rate = dm.trainRate * frac, pl = S.macro.priceLevel;
    for (let l = dm.trainTarget - 1; l >= 1; l--) {
      const k = sd.lv[l - 1] || 0; if (!k) continue;
      const x = k * rate; let m = Math.floor(x) + (I.rnd(S) < x - Math.floor(x) ? 1 : 0); m = Math.min(m, k);
      if (!m) continue;
      sd.lv[l - 1] -= m; sd.lv[l] = (sd.lv[l] || 0) + m; n += m;
      cost += m * C().TRAIN_COST[l + 1] * pl * K().DIR_TRAIN_COST * (dm.trainCostK || 1);
    }
    return { n, cost };
  }

  /* ---------------- развитие города под директором: цех, открытия, закрытия ---------------- */
  function packedList(c) { return c.packed ? c.packed.stores : []; }
  function estimate(S, c, o, ms) { // внутри withCity: как бот оценивает помещение (спрос, пропускная способность, расходы, каннибализация)
    const cfg = C(), sz = cfg.SIZES[o.size], pk = c.packed, pl = S.macro.priceLevel;
    const tmp = Object.assign({}, o, { id: 'tmp', status: 'open', repair: 0, staff: [] });
    for (let i = 0; i < sz.staffMax; i++) tmp.staff.push({ lvl: 1 });
    let dem = 0, chk = 0;
    let dW = null, dE = null; // будни и выходные внутри группы одинаковы — два расчёта вместо семи
    for (let dow = 0; dow < 7; dow++) { const d = dow >= 5 ? dE || (dE = E.storeDemand(S, tmp, { dow, m: 4 }, ms)) : dW || (dW = E.storeDemand(S, tmp, { dow, m: 4 }, ms)); dem += d.demand / 7; chk += d.check / 7; }
    const thrPer = cfg.CHECKS_PER_STAFF_BASE + cfg.CHECKS_PER_STAFF_LVL * 0.5;
    const staff = clamp(Math.ceil(dem / (thrPer * 0.8)), sz.staffMin, sz.staffMax);
    const checks = Math.min(dem, staff * thrPer * 0.95), rev = checks * chk * 30.4;
    tmp.cpd = checks;
    const rent = o.area * o.rentM2 * (o.payMode === 'year' ? 1 - cfg.YEARLY_RENT_DISCOUNT : 1);
    const pay = staff * CI().salaryCity(S, c, 1.4) * (1 + cfg.PAYROLL_TAX);
    const util = (cfg.UTIL_BASE + cfg.UTIL_PER_M2 * o.area) * pl;
    const del = S.productions.length || BK.Corp.remoteOf(S) ? E.deliveryCost(S, tmp) : 40000 * pl; // выпечка из другого города — своя формула (§7.2)
    const hq = cfg.HQ_PER_STORE * pl + rev * (cfg.HQ_REV_SHARE || 0);
    const payB = BK.Corp.corpMarket(S).baker * (CI().cityDef(S, c.id).wage || 1) * (c.payKb || c.payK || 1);
    const bakers = checks * cfg.ITEMS_PER_CHECK / cfg.PROD_UNITS_PER_BAKER * payB * (1 + cfg.PAYROLL_TAX);
    let cannibal = 0;
    const R = cfg.CANNIBAL_RADIUS || 26, F = cfg.CANNIBAL_F || 0.86, SK_ = cfg.SATURATION_K;
    let nd = 0; for (const s of pk.stores) if (s.district === o.district) nd++;
    for (const s of pk.stores) {
      if (!s.last || !s.last.frac) continue;
      let f = 1; if (E.near(s, o, R)) f *= F;
      if (s.district === o.district) f *= (1 + SK_ * Math.max(0, nd - 1)) / (1 + SK_ * nd);
      if (f < 1) cannibal += s.last.rev / s.last.frac * (1 - f) * 0.6;
    }
    const profit = rev * (1 - pk.fcPct) - rev * E.currentTaxRate(S) - rent - pay - util - del - hq - bakers - cannibal;
    const capex = o.area * cfg.FITOUT_PER_M2 * pl + cfg.STORE_EQUIP[o.size] * pl + staff * cfg.HIRE_COST_SALARIES * CI().salaryCity(S, c, 1)
      + (o.payMode === 'year' ? o.area * o.rentM2 * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT) : o.area * o.rentM2) + K().DIR_EQUIP * pl;
    return { rev, profit, capex, staff, payback: profit > 0 ? capex / profit : 999 };
  }
  function openPacked(S, c, o, est, free) { // внутри withCity: точка сразу «упакована» со снимком потенциала; free — куплена (e208): без затрат, уже работает
    const cfg = C(), pk = c.packed, pl = S.macro.priceLevel, sz = cfg.SIZES[o.size];
    const staffT = clamp(est.staff, sz.staffMin, sz.staffMax);
    const hireC = staffT * cfg.HIRE_COST_SALARIES * CI().salaryCity(S, c, 1);
    const rent0 = o.payMode === 'year' ? o.area * o.rentM2 * 12 * (1 - cfg.YEARLY_RENT_DISCOUNT) : o.area * o.rentM2;
    const fit = o.area * cfg.FITOUT_PER_M2 * pl + cfg.STORE_EQUIP[o.size] * pl + K().DIR_EQUIP * pl;
    if (!free) { I.spend(S, fit, 'capex'); I.spend(S, hireC, 'hire'); if (o.payMode === 'year') I.spend(S, rent0, 'rent'); else I.spend(S, rent0, 'capex'); }
    const people = []; for (let i = 0; i < staffT; i++) people.push({ lvl: free ? 2 : I.rnd(S) < 0.28 ? 2 : 1, mood: 62 });
    const st = { id: I.nextId(S, 's'), address: o.address, district: o.district, x: o.x, y: o.y, area: o.area, size: o.size, rentM2: o.rentM2, payMode: o.payMode,
      rentPaidUntil: o.payMode === 'year' ? S.day + cfg.OPEN_DAYS + 365 : 0, traffic: o.traffic, solv: o.solv, landmarks: o.landmarks, comp: o.comp,
      status: 'opening', openDay: S.day + cfg.OPEN_DAYS, repair: 0, repairUntil: 0, closedUntil: 0, staff: people, incoming: [], staffTarget: staffT,
      capex: fit + hireC + (o.payMode === 'year' ? 0 : rent0), hist: [], num: (c.numSeq = (c.numSeq || 0) + 1), rating: cfg.RATING_START };
    const ms = E.menuStats(S), wz = E.wasteFactors(S, ms);
    const p = CI().packStore(S, st, ms, wz, pk.fill != null ? pk.fill : 1, BK.Corp.demandMult(S));
    p.status = 'opening'; p.openDay = st.openDay; p.openedDay = null; p.moodOff = undefined; p.mood0 = 62; p.staff.mood = 62; p.byDir = true;
    if (free) { p.status = 'open'; p.openDay = S.day; p.openedDay = S.day - 400; p.bought = true; if (o.payMode === 'year') p.rentPaidUntil = S.day + 365; }
    pk.stores.push(p);
    if (!free) S.stats.hires += staffT;
    return p;
  }
  function buildProd(S, c, forceFirst, free) { // внутри withCity: цех — самое дешёвое по «открытие + 2 года» из трёх предложений
    const cfg = C(), pk = c.packed, pl = S.macro.priceLevel;
    I.genProdOffers(S, 3);
    const wsum = BK.DISTRICTS.length, kmU = E.kmPerUnit();
    const cost = (o) => { let km = 0; for (const d of BK.DISTRICTS) km += E.dist(o, d) * kmU / wsum; return E.prodOpenCost(S, o).total + 24 * (E.prodRentMonth(o) + (cfg.PROD_UTIL_BASE + cfg.PROD_UTIL_PER_M2 * o.area) * pl + (cfg.DELIVERY_BASE + cfg.DELIVERY_PER_KM * km) * pl * 5); };
    const o = S.prodOffers.slice().sort((a, b) => cost(a) - cost(b))[0]; if (!o) return null;
    const oc = E.prodOpenCost(S, o);
    if (!forceFirst && S.cash < oc.total) return null;
    if (!free) I.spend(S, oc.total, 'capex');
    const p = { id: I.nextId(S, 'f'), district: o.district, x: o.x, y: o.y, address: o.address, area: o.area, rentM2: o.rentM2, status: 'opening', openDay: S.day + cfg.PROD_OPEN_DAYS, equip: {}, staff: cfg.PROD_STAFF_BASE + 1, need: cfg.PROD_STAFF_BASE + 1, morale: 65, load: 0, capex: oc.total, name: `Цех №${pk.productions.length + 1}` };
    pk.productions.push(p);
    return { p, cost: oc.total };
  }
  function tryOpen(S, c, d, o) { // o: { tries, first, maxN } — открыть до maxN лучших мест из свежих предложений
    const cr = S.corp, b = c.budget, sk = eff(S, d, c), K_ = K();
    const lk = c.leak || 0; // Р4: слабый директор ошибается в местах сильнее и берёт места с долгой окупаемостью
    const ms = E.menuStats(S), sd = K_.DIR_EST_ERR * (1 - 0.6 * sk.growth / 100) * (1 + K_.LEAK_EST * lk);
    let opened = 0;
    for (let k = 0; k < o.maxN; k++) {
      const cand = [];
      const nOf = 2 + Math.round(sk.growth / 40); // сколько мест смотрит за раз
      for (let i = 0; i < nOf; i++) {
        const of = I.makeStoreOffer(S);
        if (i === 0 && c.spOffer && c.spOffer.n > 0 && c.spOffer.until > S.day) { of.rentM2 = Math.round(of.rentM2 * c.spOffer.rent); of.special = true; } // особое помещение из события (аренда со скидкой)
        const e = estimate(S, c, of, ms);
        const noisy = e.payback * Math.exp(I.gauss(S) * sd); // слабый директор ошибается в оценке чаще
        cand.push({ of, e, noisy });
      }
      cand.sort((a, b2) => a.noisy - b2.noisy);
      const best = cand[0]; if (!best) break;
      if (!o.first && best.noisy > payback(d, c, S) * (1 + K_.LEAK_PB * lk)) { c.dev.why = 'payback'; break; }
      if (b.left < best.e.capex && !o.first) { c.dev.why = 'budget'; c.wantBudget = { n: Math.max(1, Math.min(3, openLimit(S, c, d) - c.dev.opened)), cost: best.e.capex, day: S.day }; break; }
      if (S.cash < best.e.capex + (o.first ? 0 : 5e6 * S.macro.priceLevel)) { c.dev.why = 'cash'; break; }
      c.dev.why = null;
      openPacked(S, c, best.of, best.e);
      if (best.of.special && c.spOffer) c.spOffer.n--;
      b.left = Math.max(0, b.left - best.e.capex); c.dev.opened++; c.dev.mOpened = (c.dev.mOpened || 0) + 1; opened++;
      c.wantBudget = null;
      if (c.dev.opened >= openLimit(S, c, d) && !o.first) break;
    }
    void cr;
    return opened;
  }
  function develop(S, c, d) {
    const cfg = C(), K_ = K(), pk = c.packed; if (!pk) return;
    c.dev.mOpened = 0; c.dev.mClosed = 0;
    BK.Corp.withCity(S, c.id, () => {
      staffRule(S, c, d); aggRule(S, c);
      const rem = BK.Corp.remoteOf(S, c.id); // Р4: снабжение из другого города — свой цех, когда точек достаточно или поставки прервались
      if (!pk.productions.length) {
        if (!rem) { buildProd(S, c, true); return; }
        const own = K_.SUPPLY_OWN_STORES[rem.supplyMode === 'frozen' ? 'frozen' : 'fresh'];
        if (rem.supplyOk === false || pk.stores.length >= own) { const r = buildProd(S, c, rem.supplyOk === false); if (r) { c.budget.left = Math.max(0, c.budget.left - r.cost); I.log(S, `${CI().cityDef(S, c.id).name}: директор строит свой цех — поставки ${rem.supplyMode === 'frozen' ? 'с фабрики заморозки' : 'из другого города'} ${rem.supplyOk === false ? 'прервались' : 'обходятся дороже'}.`, 'info'); } }
      }
      // закрытие: полгода подряд в убытке и старше года (§5.3 п. 6)
      for (const s of pk.stores.slice()) {
        if ((s.lossStreak || 0) < K_.DIR_LOSS_CLOSE || s.status === 'opening' || (s.openedDay != null && S.day - s.openedDay < 365)) continue;
        if (c.budget.close && (c.leak || 0) < K_.LEAK_NOCLOSE) closePacked(S, c, s, d); else if (!c.closeReq) c.closeReq = s.id; // слабый директор сам не закрывает — только просит
      }
      // второй и третий цех — по тем же порогам, что в Уфе
      const nOpen = pk.stores.length, np = pk.productions.length;
      if ((np === 1 && nOpen >= BK.Corp.prod2Stores()) || (np === 2 && nOpen >= cfg.THIRD_PROD_STORES)) { // город-лента — второй цех раньше (Р4)
        const r = buildProd(S, c, false); if (r) c.budget.left = Math.max(0, c.budget.left - r.cost);
      }
      repairs(S, c, d);
      equip(S, c);
      // открытия: не больше годового лимита директора, в пределах бюджета
      const lim = openLimit(S, c, d);
      if (c.budget.open === false) { c.dev.why = 'off'; return; }
      if (c.dev.opened >= lim) c.dev.why = 'limit';
      if (c.dev.opened < lim) tryOpen(S, c, d, { maxN: Math.min(lim - c.dev.opened, Math.max(1, Math.ceil(lim / 6))) });
    });
  }
  /* штат под загрузку (§17): директор, как бот good, держит загрузку команды около цели — нужно людей = загрузка × штат ÷ цель
     (вверх — сразу, вниз — по одному в месяц); загрузка — из прошлого месяца агрегата (зал + доставка).
     Цель — DIR_LOAD_TARGET = [цель, k]: сильный в «Операциях» (85+) держит 0,78, как бот good; слабее — работает «впритык»: + k × (0,85 − операции/100) */
  function staffRule(S, c, d) {
    const cfg = C(), LT = K().DIR_LOAD_TARGET; if (!LT) return;
    const lt = LT[0] + LT[1] * Math.max(0, 0.85 - eff(S, d, c).ops / 100);
    for (const s of c.packed.stores) {
      if (s.status !== 'open' || s.ld == null || !s.staff.n) continue;
      const sz = cfg.SIZES[s.size], need = clamp(Math.ceil(s.ld * s.staff.n / lt), sz.staffMin, sz.staffMax);
      if (need > s.staffTarget) s.staffTarget = need; else if (need < s.staffTarget - 1) s.staffTarget--;
    }
  }
  /* доставка через агрегаторы (§17), внутри withCity: директор подключает точку, когда команда успевает (загрузка < 0,85),
     рейтинг ≥ 3,8★, точка работает 2+ месяца и заказ по оценке прибылен; отключает перегруженную (загрузка > 1,02) при полном штате.
     То же правило, что у бота good в подробном городе. */
  function aggRule(S, c) {
    const cfg = C(), K_ = K(), pk = c.packed; if (!pk || cfg.AGG_SHARE == null) return;
    let unit = null;
    for (const s of pk.stores) {
      if (s.status !== 'open' || s.ld == null) continue;
      if (s.agg) { if (s.ld > K_.DIR_AGG_OFF && s.staff.n >= cfg.SIZES[s.size].staffMax) { s.agg = undefined; s.aggDay = undefined; } continue; }
      if (s.ld >= K_.DIR_AGG_LOAD || (s.rating || 0) < K_.DIR_AGG_RATING || (s.openedDay != null && S.day - s.openedDay < 60)) continue;
      if (unit == null) { // прибыль с заказа в долях чека зала (как у бота good) — считаем, только когда есть кого подключать
        const fc = pk.fcB != null ? pk.fcB : pk.fcPct || 0.33, tax = E.currentTaxRate(S), rate = E.aggCommission(S) + cfg.AGG_PACK;
        unit = cfg.AGG_CHECK * (1 - rate - fc - tax) - cfg.AGG_CANNIBAL * (1 - fc - tax);
      }
      if (unit <= 0) break;
      const cost = E.aggConnectCost(S, s);
      if (cost && S.cash < cost + 5e6 * S.macro.priceLevel) continue;
      if (cost) I.spend(S, cost, 'agg');
      s.agg = true; s.aggPaid = true; s.aggDay = S.day;
    }
  }
  /* оборудование цехов (§17), внутри withCity: то, что снижает фудкост и расходы на доставку, — по окупаемости до DIR_EQ_PAYBACK мес.
     (как бот good), по одной позиции на цех в квартал, из бюджета капвложений. Мощность в агрегате не считается — печи не покупаются. */
  function equip(S, c) {
    const cfg = C(), pk = c.packed, b = c.budget, pl = S.macro.priceLevel, lim = K().DIR_EQ_PAYBACK;
    if (!lim || !pk.productions.length || E.dateOf(S.day).m % 3) return; // раз в квартал
    // быстрый выход: всё полезное уже стоит (обычно у зрелого города)
    let any = false, fleet = false;
    for (const p of pk.productions) if (p.status === 'open') for (const e of BK.EQUIPMENT) if ((e.fc || e.del) && !(p.equip[e.id] > 0)) { any = true; if (e.del) fleet = true; }
    if (!any) return;
    let rev = 0; for (const s of pk.stores) if (s.last && s.last.frac) rev += s.last.rev / s.last.frac;
    const del = fleet ? pk.delM || 0 : 0; // доставка из цехов за месяц (агрегат пишет её в pk.delM)
    if (!rev) return;
    const fcM = rev * (pk.fcB != null ? pk.fcB : pk.fcPct || 0.3) * (CI().prodFcNow(S).fc / (pk.pf0 || 1));
    let capAll = 0; for (const p of pk.productions) capAll += E.prodCapacity(S, p);
    for (const p of pk.productions) {
      if (p.status !== 'open') continue;
      const share = capAll > 0 ? E.prodCapacity(S, p) / capAll : 1, m0 = E.prodFcMult(S, p);
      let best = null;
      for (const e of BK.EQUIPMENT) {
        if ((p.equip[e.id] || 0) > 0 || (!e.fc && !e.del)) continue;
        p.equip[e.id] = 1; const m1 = E.prodFcMult(S, p); delete p.equip[e.id];
        const gain = fcM * share * (m0 - m1) / m0 + (e.del || 0) * del * share, price = e.price * pl;
        if (gain > 0 && price / gain < lim && (!best || price / gain < best.pb)) best = { e, pb: price / gain, price };
      }
      if (!best || b.left < best.price || S.cash < best.price + 5e6 * pl) continue;
      I.spend(S, best.price, 'capex'); b.left -= best.price; p.equip[best.e.id] = 1; p.capex = (p.capex || 0) + best.price;
    }
  }
  // ремонты по окупаемости (как у бота): ступень за раз, из бюджета капвложений; «Экономия» строже, приоритет «Качество» щедрее
  function repairs(S, c, d) {
    const cfg = C(), pk = c.packed, b = c.budget, pl = S.macro.priceLevel;
    const lim = (d.style === 'economy' ? 16 : 24) * (c.priority === 'quality' ? 1.5 : c.priority === 'profit' ? 0.8 : 1) * (BK.HQ && BK.HQ.onlyProfit(d) ? 0.6 : 1); // KPI «только прибыль» — экономит на ремонтах
    const list = [];
    for (const s of pk.stores) {
      if (s.status !== 'open' || (s.repair || 0) >= 3 || !s.last || !s.last.frac || (s.openedDay != null && S.day - s.openedDay < 180)) continue;
      const cur = cfg.REPAIRS[s.repair || 0] || { conv: 1, check: 1 }, nx = cfg.REPAIRS[(s.repair || 0) + 1];
      const rev = s.last.rev / s.last.frac, gain = rev * ((nx.conv / cur.conv) * (nx.check / cur.check) - 1) * 0.35;
      const cost = nx.perM2 * s.area * pl + rev * nx.days / 30 * 0.6;
      if (gain > 0 && cost / gain < lim) list.push({ s, pb: cost / gain, cost: nx.perM2 * s.area * pl, nx });
    }
    list.sort((a, b2) => a.pb - b2.pb);
    for (const x of list.slice(0, 2)) {
      if (b.left < x.cost || S.cash < x.cost + 5e6 * pl) break;
      I.spend(S, x.cost, 'capex'); b.left -= x.cost;
      x.s.repair = (x.s.repair || 0) + 1; x.s.capex = (x.s.capex || 0) + x.cost; x.s.lostDays = (x.s.lostDays || 0) + x.nx.days; // закрыта на ремонт — в следующем месяце
      c.dev.repairs = (c.dev.repairs || 0) + 1;
    }
  }
  function closePacked(S, c, s, d) {
    const refund = Math.round((s.capex || 0) * C().CLOSE_REFUND);
    S.cash += refund; S.month.income += refund;
    const i = c.packed.stores.indexOf(s); if (i >= 0) c.packed.stores.splice(i, 1); // на месте: внутри withCity S.stores — та же ссылка
    c.dev.closed++; c.dev.mClosed = (c.dev.mClosed || 0) + 1;
    I.log(S, `${CI().cityDef(S, c.id).name}: ${d ? d.name + ' закрыл' + (d.f ? 'а' : '') : 'закрыта'} убыточную точку №${s.num} (${s.address}). Продано оборудование на ${fm(refund)}.`, 'warn');
    return refund;
  }
  // покупка местной сети (e208): цех и n работающих точек без затрат (цена сделки — в событии); город без директора
  function buyStores(S, id, n, moodAdd) {
    const c = S.corp.cities[id], ms = E.menuStats(S), wz = E.wasteFactors(S, ms);
    c.packed = { stores: [], productions: [], offersSpecial: [], rival: { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 },
      office: Object.assign({}, S.office, { hr: false, academy: false, ownerHires: 0, ownerTrains: 0 }), fcMs0: ms.fcPct, fill: 1, sales: wz.sales, fcK0: S.corp.hqFcK || 1 };
    Object.assign(c.packed, CI().fcBase(S, ms, wz)); // фудкост без событий и заморозки активного города (§17)
    c.aggFrom = S.day; c.numSeq = 0;
    ensure(S);
    const out = [];
    BK.Corp.withCity(S, id, () => {
      const r = buildProd(S, c, true, true); if (r) { r.p.status = 'open'; r.p.openDay = S.day; }
      for (let i = 0; i < n; i++) {
        const cand = []; for (let j = 0; j < 3; j++) { const of = I.makeStoreOffer(S); cand.push({ of, e: estimate(S, c, of, ms) }); }
        cand.sort((a, b) => b.e.profit - a.e.profit);
        const p = openPacked(S, c, cand[0].of, cand[0].e, true); p.staff.mood = clamp(62 + (moodAdd || 0), 10, 90); out.push(p);
      }
    });
    return out;
  }
  // вход в город под директором: цех и первые точки ставит директор, игрок остаётся в своём городе
  function launch(S, id, dirId) {
    const cr = S.corp, c = cr.cities[id], cfg = C();
    const ms = E.menuStats(S), wz = E.wasteFactors(S, ms);
    c.packed = { stores: [], productions: [], offersSpecial: [], rival: { enabled: false, stores: [], hist: [], ban: {}, opened: 0, closed: 0, grabbed: 0 },
      office: Object.assign({}, S.office, { hr: false, academy: false, ownerHires: 0, ownerTrains: 0 }), fcMs0: ms.fcPct, fill: 1, sales: wz.sales };
    Object.assign(c.packed, CI().fcBase(S, ms, wz)); // фудкост без событий и заморозки активного города (§17)
    c.aggFrom = S.day; c.numSeq = 0;
    ensure(S);
    const r = assign(S, dirId, id, true); if (!r.ok) return r;
    const d = dirById(S, dirId);
    let n = 0;
    const rem = !!c.supplyFrom; // Р4: выпечку везут из другого города — без своего цеха
    BK.Corp.withCity(S, id, () => { if (!rem) { const r = buildProd(S, c, true); if (r && c.perk && c.perk.prodRent) r.p.rentM2 = Math.round(r.p.rentM2 * c.perk.prodRent); } n = tryOpen(S, c, d, { first: true, maxN: K().DIR_LAUNCH_STORES }); });
    I.log(S, `${d.name} запускает ${CI().cityDef(S, id).name}: ${rem ? '' : 'цех и '}${n} ${n === 1 ? 'точка' : n < 5 ? 'точки' : 'точек'} откроются через ${BK.Corp && BK.Corp.openDays ? BK.Corp.openDays(S, id) : 21} дн.`, 'good');
    return { ok: true, opened: n };
  }

  /* ---------------- 1-е число: оклады, развитие, лояльность, навыки ---------------- */
  function monthly(S) {
    const cr = S.corp; ensure(S);
    const K_ = K(), cfg = C();
    for (const d of cr.directors.slice()) {
      const c = d.city ? cr.cities[d.city] : null;
      I.spend(S, d.salary * (c ? 1 : K_.DIR_RESERVE_PAY) * (1 + cfg.PAYROLL_TAX), 'upkeep');
      const busy = d.absentUntil > S.day || d.leaveDay != null;
      if (c && c.packed && c.id !== cr.active && !busy) develop(S, c, d);
      for (const rid of d.region || []) { const rc = cr.cities[rid]; if (rc && rc.packed && rid !== cr.active && rc.directorId === d.id && !busy) develop(S, rc, d); } // кластер регионального
      loyalty(S, d, c);
      d.months++; if (c) d.cityMonths++;
      // навыки растут от практики — в «своих» навыках, до потолка грейда (§6.1)
      const gain = K_.DIR_SKILL_GROW * (d.traits.indexOf('ambitious') >= 0 ? 2 : 1) * (c ? 1 : 0.5);
      const own = { growth: ['growth'], economy: ['econ'], service: ['people', 'ops'], balance: SK }[d.style];
      for (const k of own) d.skills[k] = Math.min(K_.DIR_CAP[d.grade], d.skills[k] + gain / own.length * (own.length > 2 ? 2 : 1));
      if (d.loyalty < K_.LOY_QUIT) quit(S, d);
    }
    // Р4: утечка у слабых директоров (денежный риск) — в городах на автопилоте
    for (const id in cr.cities) { const c = cr.cities[id]; if (!c.packed || id === cr.active) { if (c.leak) leakMonthly(S, c, null); continue; } const d = dirOf(S, c); leakMonthly(S, c, d && !(d.absentUntil > S.day) && d.leaveDay == null ? d : null); }
    if (S.day - (cr.dirCandDay || 0) >= K_.DIR_CAND_DAYS) refreshCands(S, false);
    if (BK.HQ) BK.HQ.monthly(S); // штаб, учёба, KPI, опционы, скрытые черты, переманивание, соперник
  }
  function loyalty(S, d, c) {
    const K_ = K(), why = [];
    const mk = marketPay(S, d, c ? c.id : null), pr = d.salary / Math.max(1, mk);
    const pay = clamp((pr - 1) * 10 * K_.LOY_PAY_K, -K_.LOY_PAY_MAX, K_.LOY_PAY_MAX); if (Math.abs(pay) >= 0.05) why.push(['оклад к рынку', pay]);
    if (c) { const m = match(d, c); if (m > 0) why.push(['приоритет совпадает', K_.LOY_MATCH]); else if (m < 0) why.push(['приоритет против стиля', K_.LOY_MISMATCH]); }
    else why.push(['в резерве', K_.LOY_RESERVE]);
    if (c && c.id === S.corp.active) { d.manualM++; if (d.manualM > K_.LOY_MANUAL_GRACE && d.traits.indexOf('executive') < 0) why.push(['вы управляете сами', K_.LOY_MANUAL]); } else d.manualM = 0;
    if (d.traits.indexOf('reliable') >= 0) why.push(['надёжн' + (d.f ? 'ая' : 'ый'), K_.LOY_RELIABLE]);
    if (d.board) why.push(['совет директоров', K_.BOARD_LOY_M]);
    if (BK.HQ && BK.HQ.unvested(d) > 0) why.push(['опцион созревает', K_.OPT_LOY]); else if (d.opt && d.opt.city > 0) why.push(['доля прибыли города', 0.5]);
    if (d.traits.indexOf('ambitious') >= 0 && d.months >= 36 && !d.regional && !(d.opt && (d.opt.city || d.opt.corp))) why.push(['амбиции: нет повышения или доли', -1]);
    const drift = (60 - d.loyalty) * K_.LOY_DRIFT; why.push(['тянется к 60', drift]);
    let s = 0; for (const w of why) s += w[1];
    d.loyalty = clamp(d.loyalty + s, 0, 100); d.loyD = s; d.loyWhy = why.map((w) => [w[0], +w[1].toFixed(2)]);
  }
  function quit(S, d) {
    const cr = S.corp, c = d.city ? cr.cities[d.city] : null;
    removeDir(S, d); if (BK.HQ) cr.stat.left++;
    I.log(S, `${d.name} ${d.f ? 'ушла' : 'ушёл'} из сети: лояльность упала до ${Math.round(d.loyalty)}.${c ? ' ' + CI().cityDef(S, c.id).name + ' без директора.' : ''}`, 'bad');
    pushInbox(S, { kind: 'note', tone: 'bad', dir: d.id, dname: d.name, city: c ? c.id : null, title: `${d.name} ${d.f ? 'уволилась' : 'уволился'}`, text: `Лояльность упала до ${Math.round(d.loyalty)}: оклад ниже рынка, отказы и личное управление копились месяцами.${c ? ` ${CI().cityDef(S, c.id).name} теперь без директора — назначьте нового.` : ''}` });
    S.notify.push({ type: 'toast', title: `${d.name} ${d.f ? 'уволилась' : 'уволился'}`, text: c ? `${CI().cityDef(S, c.id).name} без директора.` : 'Директор из резерва ушёл.', kind: 'bad' });
  }

  /* ---------------- план года ---------------- */
  function makePlan(S, c, d) {
    const t = E.dateOf(S.day), h = c.hist.filter((x) => x[2] > 0).slice(-12), n = packedList(c).length || (c.id === S.corp.active ? S.stores.length : 0);
    const lim = d ? openLimit(S, c, d) : 0, grow = Math.round(lim * 0.6);
    let monthRev;
    if (h.length >= 3) monthRev = h.reduce((a, x) => a + x[2], 0) / h.length;
    else { let b = 0; for (const s of packedList(c)) b += (s.base || 0) * 30.4 * S.macro.priceLevel; monthRev = b; }
    monthRev *= (1 + 0.5 * grow / Math.max(3, n)) * 1.03;
    const margin = h.length >= 3 ? h.reduce((a, x) => a + x[3], 0) / Math.max(1, h.reduce((a, x) => a + x[2], 0)) : 0.1;
    c.plan = { y: t.y, from: S.day, n0: n, stores: n + grow, monthRev: Math.round(monthRev), margin: +clamp(margin, -0.2, 0.3).toFixed(3) };
  }
  function planFact(S, c) { // выполнение плана по выручке за месяцы текущего плана
    const p = c.plan; if (!p) return null;
    const rows = c.hist.filter((x) => x[0] === p.y && E.dateOf(p.from).m <= x[1]);
    if (!rows.length || !p.monthRev) return null;
    return rows.reduce((a, x) => a + x[2], 0) / (p.monthRev * rows.length);
  }

  /* ---------------- после месячного расчёта: отчёты, просьбы, цель акта ---------------- */
  function pushInbox(S, it) {
    const cr = S.corp; it.id = 'r' + (++cr.repSeq); it.day = S.day;
    cr.inbox.unshift(it);
    if (cr.inbox.length > K().INBOX_MAX) { // лишнее — самое старое без открытых вопросов
      for (let i = cr.inbox.length - 1; i >= 0 && cr.inbox.length > K().INBOX_MAX; i--) if (!openCount(cr.inbox[i])) cr.inbox.splice(i, 1);
    }
    return it;
  }
  const openCount = (it) => (it.reqs || []).filter((r) => r.st === 'open').length;
  // открытая просьба того же вида или отказ меньше 3 месяцев назад — не просить снова
  function hasOpen(S, cityId, t) { return S.corp.inbox.some((it) => it.city === cityId && (it.reqs || []).some((r) => r.t === t && (r.st === 'open' || ((r.st === 'no' || r.st === 'default') && S.day - (r.ans || it.day) < K().REQ_COOLDOWN)))); }
  function afterMonth(S, h) {
    const cr = S.corp, K_ = K(); ensure(S);
    // просьбы без ответа — отказ по умолчанию (−1 лояльности)
    for (const it of cr.inbox) {
      if (it.due == null || it.due > S.day) continue;
      for (const r of it.reqs || []) if (r.st === 'open') { r.st = 'default'; r.ans = S.day; const d = dirById(S, it.dir); if (d) d.loyalty = clamp(d.loyalty + K_.LOY_DEFAULT, 0, 100); }
      if (it.kind === 'award' && !it.done) it.done = 'default';
      if (it.kind === 'caught' && !it.done && BK.HQ) BK.HQ.decide(S, it.id, it.trait === 'theft' ? 'quiet' : 'warn'); // без ответа: вора увольняют тихо, «приукрашивающего» — предупреждают
    }
    for (const id in cr.cities) {
      const c = cr.cities[id], d = dirOf(S, c);
      if (!d || id === cr.active || !c.packed) continue;
      report(S, c, d, h);
    }
    fedCheck(S);
  }
  function report(S, c, d, h) {
    const K_ = K(), cfg = C();
    const row = c.hist[c.hist.length - 1], prev = c.hist[c.hist.length - 2] || null; if (!row) return;
    const list = packedList(c), open = list.filter((s) => s.status !== 'opening');
    let mood = 0, n = 0, missing = 0; for (const s of open) { mood += s.staff.mood * s.staff.n; n += s.staff.n; missing += Math.max(0, s.staffTarget - s.staff.n); }
    mood = n ? mood / n : 60;
    const reqs = [], ctx = { city: CI().cityDef(S, c.id).name, director: d.name };
    // просьбы (не больше двух, без повторов открытых)
    if (c.wantBudget && !hasOpen(S, c.id, 'budget')) {
      const w = c.wantBudget, amount = Math.max(1e6, Math.round(w.n * w.cost / 1e6) * 1e6);
      reqs.push({ t: 'budget', amount, n: w.n, alt: Math.round(amount / 2 / 1e6) * 1e6, st: 'open' });
    }
    const turn = row[6] ? (row[8] || 0) / row[6] : 0;
    if (reqs.length < 2 && (mood < K_.REQ_MOOD || turn > K_.REQ_TURN) && (c.payK || 1) < 1.24 && !hasOpen(S, c.id, 'pay')) reqs.push({ t: 'pay', pct: 5, alt: 3, st: 'open' });
    if (reqs.length < 2 && c.closeReq && !hasOpen(S, c.id, 'close')) { const s = list.find((x) => x.id === c.closeReq); if (s) reqs.push({ t: 'close', store: s.id, n: s.num, months: s.lossStreak || 6, st: 'open' }); else c.closeReq = null; }
    const mk = marketPay(S, d, c.id);
    if (reqs.length < 2 && d.salary < mk * 0.95 && d.loyalty < 60 && !hasOpen(S, c.id, 'raise') && S.day - (d.raiseAsk || -999) > 180) { reqs.push({ t: 'raise', pct: 10, alt: 5, st: 'open' }); d.raiseAsk = S.day; }
    // фраза директора: стиль × ситуация (BK.DIRECTOR_PHRASES)
    const pf = planFact(S, c);
    const emb = BK.HQ ? BK.HQ.embOf(d) : 0; // «Приукрашивает отчёты»: цифры лучше факта, фраза слишком гладкая
    let sit = reqs.length ? { budget: 'budget', pay: 'staff', close: 'kpiFail', raise: 'raise' }[reqs[0].t] : d.loyalty < 30 ? 'quit' : pf != null && pf < 0.9 ? 'kpiFail' : 'ok';
    if (emb && (sit === 'ok' || sit === 'kpiFail')) sit = 'embellish';
    if (!reqs.length && sit === 'ok' && c.rivalIn && S.day - c.rivalIn < 400) sit = 'rival';
    const style = d.style === 'balance' ? corpRng(S, () => I.pick(S, ['growth', 'economy', 'service'])) : d.style;
    const P = (BK.DIRECTOR_PHRASES || {})[style] || {};
    // без финансового департамента отчёт идёт «как прислал директор»: шум ±5 % (§6.12)
    const fin = BK.HQ && BK.HQ.lvlOf(S, 'finance') > 0, nz = fin ? [0, 0] : corpRng(S, () => [I.rr(S, -1, 1) * K_.REPORT_NOISE, I.rr(S, -1, 1) * K_.REPORT_NOISE]);
    const shown = { rev: Math.round(row[2] * (1 + emb) * (1 + nz[0])), profit: Math.round((row[3] + Math.abs(row[2]) * emb * 0.6) + Math.abs(row[2]) * nz[1] * 0.3) };
    const variants = P[sit] || P.ok || ['Месяц прошёл по плану.'];
    const r0 = reqs[0] || {};
    const [text, sPick] = corpRng(S, () => [I.pick(S, variants), open.length ? I.pick(S, open) : null]);
    Object.assign(ctx, { n: r0.n || open.length, amount: r0.amount ? fm(r0.amount) : fm(Math.max(1e6, row[2] * 0.01)), pct: r0.pct || (emb ? Math.round(emb * 100) + 2 : Math.max(1, Math.round(Math.abs((pf || 1) - 1) * 100))), months: 6, district: sPick ? districtName(S, c, sPick.district) : 'Центр', rival: C().RIVAL_NAME || 'Хлебный двор' });
    if (sit === 'ok' && /\{stores\}/.test(text)) ctx.n = open.length;
    let phrase = txtG(text, d.f); phrase = BK.corpText ? BK.corpText(phrase, ctx) : phrase;
    const opened = c.dev.mOpened || 0, closed = c.dev.mClosed || 0;
    const it = pushInbox(S, { kind: 'report', dir: d.id, dname: d.name, city: c.id, y: row[0], m: row[1], fin, emb: emb ? 1 : 0,
      rev: shown.rev, profit: shown.profit, stores: row[4], rating: emb ? Math.min(5, +(row[5] + 0.15).toFixed(2)) : row[5], staff: row[6], fc: row[7], quits: row[8] || 0,
      prev: prev ? { rev: prev[2], profit: prev[3], stores: prev[4], rating: prev[5] } : null,
      plan: c.plan ? { rev: c.plan.monthRev, stores: c.plan.stores, margin: c.plan.margin } : null,
      left: c.budget.left, capex: c.budget.capex, missing, mood: Math.round(mood), phrase, reqs, due: reqs.length ? S.day + 30 : null, opened, closed, dev: row[7] > 0 ? row[2] / row[7] - 1 : null,
      leak: (() => { const ls = leakStatus(S, c.id); return ls ? { pct: +ls.leak.toFixed(3), lossM: ls.lossM, why: ls.why, fix: ls.fix, skill: ls.skill, need: ls.need } : undefined; })() });
    void it; void cfg; void h;
  }
  function districtName(S, c, did) {
    const dc = CI().cityDef(S, c.id);
    if (dc.id === 'ufa') { const d = (BK.UFA && BK.UFA.DISTRICTS || []).find((x) => x.id === did); return d ? d.name : 'центре'; }
    const big = BK.CITY_BIG && BK.CITY_BIG[dc.id];
    if (big) { const d = big.districts.find((x) => x.id === did); return d ? d.name : 'Центр'; }
    const g = BK.genCityGeo ? BK.genCityGeo(dc, c.seed | 0, c.mapGen) : null;
    const d = g && g.DISTRICTS.find((x) => x.id === did); return d ? d.name : 'Центр';
  }
  // ответ на просьбу: 'yes' | 'alt' | 'no'
  function answer(S, repId, idx, choice) {
    const cr = S.corp, it = cr.inbox.find((x) => x.id === repId); if (!it) return { ok: false };
    const r = (it.reqs || [])[idx]; if (!r || r.st !== 'open') return { ok: false, msg: 'Уже решено' };
    const d = dirById(S, it.dir), c = cr.cities[it.city], K_ = K();
    const loy = (v) => { if (d) d.loyalty = clamp(d.loyalty + v, 0, 100); };
    r.ans = S.day;
    if (choice === 'no') { r.st = 'no'; loy(K_.LOY_REFUSE); return { ok: true }; }
    const alt = choice === 'alt';
    if (r.t === 'budget') { const a = alt ? r.alt : r.amount; c.budget.capex += a; c.budget.left += a; c.wantBudget = null; loy(alt ? 0 : 1); }
    else if (r.t === 'pay') { c.payK = clamp((c.payK || 1) + (alt ? r.alt : r.pct) / 100, 0.9, 1.25); loy(1); }
    else if (r.t === 'close') {
      const s = c.packed && c.packed.stores.find((x) => x.id === r.store);
      if (s) closePacked(S, c, s, d); c.closeReq = null; loy(1);
    } else if (r.t === 'raise') { if (d) { d.salary = Math.round(d.salary * (1 + (alt ? r.alt : r.pct) / 100) / 1000) * 1000; loy(alt ? 2 : K_.LOY_RAISE); } }
    r.st = alt ? 'alt' : 'yes';
    return { ok: true };
  }
  function fedStatus(S) {
    const cr = S.corp, K_ = K(), rows = [];
    for (const id in cr.cities) { const st = BK.Corp.cityStats(S, id); rows.push({ id, open: st.open }); }
    rows.sort((a, b) => b.open - a.open);
    const cities = rows.filter((r) => r.open >= K_.FED_STORES).length, rev = BK.Corp.rollingAll(S);
    return { cities, need: K_.FED_CITIES, per: K_.FED_STORES, rev, target: K_.FED_REV, legend: K_.LEGEND_REV, rows, done: cr.fed.goalDay != null, legendDone: cr.fed.legendDay != null };
  }
  function fedCheck(S) {
    const cr = S.corp, f = fedStatus(S);
    if (cr.fed.goalDay == null && f.cities >= f.need && f.rev >= f.target) {
      cr.fed.goalDay = S.day; S.notify.push({ type: 'fed' });
      I.log(S, `ФЕДЕРАЛЬНАЯ СЕТЬ: ${f.cities} городов по ${f.per}+ точек, оборот за 12 месяцев — ${fm(f.rev)}.`, 'good');
    }
    if (cr.fed.legendDay == null && cr.fed.goalDay != null && f.rev >= f.legend) {
      cr.fed.legendDay = S.day; S.notify.push({ type: 'fedLegend' });
      I.log(S, `«Лидер рынка»: оборот сети за 12 месяцев — ${fm(f.rev)}.`, 'good');
    }
  }

  /* ---------------- 1 января: планы, бюджеты, «Директор года», индексация окладов ---------------- */
  function yearly(S, infl) {
    const cr = S.corp; ensure(S);
    const y = E.dateOf(S.day).y, K_ = K();
    const noms = [];
    for (const id in cr.cities) {
      const c = cr.cities[id], d = dirOf(S, c);
      if (c.plan && d && c.plan.y === y - 1) {
        const pf = planFact(S, c);
        if (pf != null) {
          d.hist.push({ y: y - 1, city: id, rev: c.hist.filter((x) => x[0] === y - 1).reduce((a, x) => a + x[2], 0), pf: +pf.toFixed(3) });
          if (d.hist.length > 12) d.hist.shift();
          d.loyalty = clamp(d.loyalty + (pf >= 1 ? K_.LOY_PLAN_OK : pf < 0.9 ? K_.LOY_PLAN_FAIL : 0), 0, 100);
          if (d.cityMonths >= 6) noms.push({ d, pf, city: id });
        }
      }
      c.budget.capex = Math.round(c.budget.capex * (1 + infl) / 1e6) * 1e6; c.budget.left = c.budget.capex; c.budgetCutY = null;
      c.dev = { y, opened: 0, closed: 0 };
      if (d) makePlan(S, c, d); else c.plan = null;
    }
    for (const d of cr.directors) d.salary = Math.round(d.salary * (1 + infl) / 1000) * 1000;
    for (const d of cr.dirCand) d.salary = Math.round(d.salary * (1 + infl) / 1000) * 1000;
    if (noms.length >= 2) {
      noms.sort((a, b) => b.pf - a.pf);
      const top = noms.slice(0, 3);
      pushInbox(S, { kind: 'award', title: `Директор года · ${y - 1}`, y: y - 1, noms: top.map((x) => ({ dir: x.d.id, name: x.d.name, city: x.city, pf: +x.pf.toFixed(3) })), due: S.day + 31, done: null });
    }
  }
  function award(S, repId, dirId) {
    const cr = S.corp, it = cr.inbox.find((x) => x.id === repId); if (!it || it.kind !== 'award' || it.done) return { ok: false };
    const K_ = K();
    for (const n of it.noms) { const d = dirById(S, n.dir); if (!d) continue; if (n.dir === dirId) d.loyalty = clamp(d.loyalty + K_.LOY_AWARD, 0, 100); else if (d.loyalty < 50) d.loyalty = clamp(d.loyalty - 3, 0, 100); }
    it.done = dirId; cr.dirYear[it.y] = dirId;
    const w = it.noms.find((n) => n.dir === dirId);
    I.log(S, `«Директор года ${it.y}» — ${w ? w.name + ' (' + CI().cityDef(S, w.city).name + ')' : ''}.`, 'good');
    return { ok: true };
  }

  /* ---------------- сводки для интерфейса ---------------- */
  function inboxOpen(S) { if (!on(S) || !S.corp.inbox) return 0; let n = 0; for (const it of S.corp.inbox) { n += openCount(it); if ((it.kind === 'award' || it.kind === 'caught') && !it.done) n++; } return n; }
  /* ---------------- денежный риск второго акта (Р4, решение владельца 30.09.2026): «утечка» у слабого директора ----------------
     Директор, чьи навыки ниже нужного для размера города (нужно больше с ростом числа точек), без программ университета
     или со стилем против приоритета города, медленно разоряет город: расходы ползут вверх (фудкост, лишний ФОТ), выручка
     отстаёт, места для открытий выбираются хуже, убыточные точки не закрываются. Первые LEAK_GRACE мес. после входа в город —
     льготный период (ошибки мягкие). Учёба, замена директора, закрытие точек останавливают утечку (она спадает быстрее, чем росла).
     Поля города: leak (0…LEAK_MAX, доля), leakWhy (['skills' | 'nouni' | 'mismatch']), leakNeed — нужный уровень навыков. */
  function leakInfo(S, c, d) {
    const K_ = K(); if (!d || !c) return { target: 0, why: [], gap: 0, need: 0, skill: 0, n: 0 };
    const sk = eff(S, d, c); let skill = 0; for (const k of SK) skill += sk[k] / SK.length;
    const n = packedList(c).length;
    const need = K_.LEAK_NEED0 + K_.LEAK_NEED_K * Math.log2(Math.max(1, n / K_.LEAK_NEED_N0));
    const progs = (d.progs || []).filter((p) => p !== 'brand').length;
    let gap = need - skill - K_.LEAK_PROG * Math.min(4, progs); const why = [];
    if (gap > 0) why.push('skills');
    if (!progs && d.cityMonths >= 12) { gap += K_.LEAK_NOUNI; why.push('nouni'); }
    if (match(d, c) < 0) { gap += K_.LEAK_MISMATCH; why.push('mismatch'); }
    gap = Math.max(0, gap);
    const w = gap > 0 ? why : [];
    // Р4 ч. 2: перегрузка штаба — городов больше, чем тянет штаб: утечка во всех городах директоров (без льготного периода)
    const ov = BK.HQ && BK.HQ.load ? BK.HQ.load(S).over : 0, ovT = ov > 0 ? (K_.OVER_LEAK || 0) * ov : 0;
    if (ovT > 0) w.push('overload');
    return { target: Math.min(K_.LEAK_MAX, K_.LEAK_PER * gap + ovT), skillT: Math.min(K_.LEAK_MAX, K_.LEAK_PER * gap), ovT, over: ov, why: w, gap, need, skill, n, progs };
  }
  function leakMonthly(S, c, d) {
    const K_ = K(), L = c.leak || 0;
    if (!d) { if (L) c.leak = +Math.max(0, L - K_.LEAK_FALL).toFixed(4); if (!c.leak) { delete c.leak; delete c.leakWhy; } return; }
    const li = leakInfo(S, c, d);
    let tgt = li.target;
    if (c.id !== 'ufa' && S.day - c.enteredDay < K_.LEAK_GRACE * 30.4) tgt = Math.min(K_.LEAK_MAX, Math.min(li.skillT, K_.LEAK_GRACE_CAP) + li.ovT); // льготный период после входа (на перегрузку штаба не действует)
    const nx = tgt > L ? Math.min(tgt, L + K_.LEAK_RAMP) : Math.max(tgt, L - K_.LEAK_FALL);
    if (nx > 0) { c.leak = +nx.toFixed(4); c.leakWhy = li.why; c.leakNeed = Math.round(li.need); } else { delete c.leak; delete c.leakWhy; delete c.leakNeed; }
  }
  // сколько месяцев подряд город в убытке (по истории города)
  function lossMonths(c) { let n = 0; for (let i = c.hist.length - 1; i >= 0 && c.hist[i][3] < 0; i--) n++; return n; }
  const LEAK_WHY = { skills: 'навыков директора не хватает на город такого размера', nouni: 'директор не учился в университете', mismatch: 'стиль директора против приоритета города', overload: 'штаб перегружен: городов больше, чем он тянет' };
  // для интерфейса: что происходит и что сделать
  function leakStatus(S, id) {
    const c = S.corp.cities[id]; if (!c) return null;
    const d = dirOf(S, c), lm = lossMonths(c), L = c.leak || 0;
    if (L < K().LEAK_SHOW && lm < 2) return null;
    const li = leakInfo(S, c, d), uni = BK.HQ ? BK.HQ.lvlOf(S, 'uni') : 0;
    const why = (c.leakWhy || []).map((k) => LEAK_WHY[k]).filter(Boolean);
    const wk = c.leakWhy || [], onlyOv = wk.length === 1 && wk[0] === 'overload';
    let fix = onlyOv ? 'разгрузите штаб — откройте отдел, посадите директора в совет, сделайте регионального; не входите в новые города' : !d ? 'назначьте директора' : (c.leakWhy || []).indexOf('nouni') >= 0 || (c.leakWhy || []).indexOf('skills') >= 0 ? (uni ? 'отправьте директора учиться (университет) или замените сильнее' : 'откройте университет в штабе и отправьте директора учиться — или замените сильнее') : (c.leakWhy || []).indexOf('mismatch') >= 0 ? 'смените приоритет города под стиль директора' : 'закройте убыточные точки';
    return { leak: L, lossM: lm, why, whyKeys: c.leakWhy || [], fix, skill: Math.round(li.skill), need: Math.round(li.need), n: li.n, d, over: li.over || 0, ovT: li.ovT || 0, onlyOv };
  }
  function cityDev(S, id) { // для карточки города и сравнения: прогноз, отклонение, текучка
    const c = S.corp.cities[id]; if (!c) return null;
    const h = c.hist.slice(-12), fcRows = h.filter((x) => x[7] > 0);
    const rev = fcRows.reduce((a, x) => a + x[2], 0), fc = fcRows.reduce((a, x) => a + x[7], 0);
    const staff = h.length ? h.reduce((a, x) => a + (x[6] || 0), 0) / h.length : 0, quits = h.reduce((a, x) => a + (x[8] || 0), 0);
    const last3 = c.hist.slice(-3).filter((x) => x[7] > 0), dev3 = last3.length ? last3.reduce((a, x) => a + x[2], 0) / last3.reduce((a, x) => a + x[7], 0) - 1 : null;
    return { dev: fc > 0 ? rev / fc - 1 : null, dev3, turn: staff > 3 && h.length >= 3 ? quits / staff * 12 / h.length : null };
  }

  BK.Dir = { ensure, mods, train, monthly, afterMonth, yearly, launch, hire, assign, fire, setSalary, praise, setPriority, setBudget, answer, award, refreshCands,
    marketPay, openLimit, payback, eff, match, dirById, dirOf, planFact, fedStatus, inboxOpen, cityDev, proposeCapex, PRIO_OF, SK, STYLES,
    makeDirector, pushInbox, makePlan, removeDir, districtName, closePacked, buyStores, leakInfo, leakMonthly, leakStatus, lossMonths };
  Object.assign(BK.Engine, { dirHire: hire, dirAssign: assign, dirFire: fire, dirSalary: setSalary, dirPraise: praise, dirAnswer: answer, dirAward: award, dirRefresh: refreshCands,
    citySetPriority: setPriority, citySetBudget: setBudget, fedStatus });
})();
