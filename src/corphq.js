/* =====================================================================
   КОРПОРАЦИЯ — этап Р3 (docs/russia-design.md §6.5–6.9, §6.12, §12 п. 4 и 6): штаб, корпоративный университет,
   мотивация (KPI-премии с перекосом, опционы с вестингом, совет директоров, региональные директора),
   переманивание, скрытые черты в действии (воровство, приукрашивание, выгорание, человек соперника), аудит,
   служба безопасности, «цифры не сходятся» при личном визите, федеральный «Хлебный двор» и местные сети (давление в городах).
   Подключается после directors.js; directors.js и corp.js вызывают BK.HQ.* (все вызовы безопасны для сохранений Р1–Р2).
   Состояние (ensure() ставит значения по умолчанию):
     S.corp.hq = { finance, hr, uni (0–3), purchasing, logistics (0–2), brand, security, legal }, hqSince{}, hqFcK, hqDelK
     S.corp.stat = { stolen, caught, poached, left, kpiPaid, optPaid, hqPaid, audits, fund }
     S.corp.rivalOn — «Хлебный двор» включён на старте (S.rival.enabled Уфы); prePressure{id}; perks{id}; creditK; cov; equitySold
     city.pressure (0…1,5) = местные сети (индекс конкуренции) + city.rp (федеральный «Хлебный двор», city.rivalIn)
     Director += known[] (раскрытые скрытые черты), theta (доля уводимой выручки), emb, kpi{keys, bonus}, opt{city, corp, value, grant, vested},
                 board, regional, region[], study{prog, until, evening}, progs[], mba, poachP, burnAt, agentAt, lastAudit, leaveDay
   Все случайности — ГСЧ корпорации (S.corp.rng) и городов: основной поток Уфы не сдвигается.
   ===================================================================== */
var BK = globalThis.BK || (globalThis.BK = {});
(function () {
  const E = BK.Engine, I = E._int, C = () => BK.CFG, K = () => BK.CFG.CORP;
  const CI = () => BK.Corp._int, D = () => BK.Dir;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fm = (v) => BK.fmtMoney(v);
  const def = (id) => BK.CITY_BY_ID[id] || {};
  const cname = (id) => def(id).name || id;
  const cin = (id) => def(id).in || 'в городе ' + cname(id);
  const KEYS = ['finance', 'hr', 'uni', 'purchasing', 'logistics', 'brand', 'security', 'legal'];
  const MAXLV = { uni: 3, logistics: 2 };
  const KPI_KEYS = ['rev', 'profit', 'rating', 'opens', 'turnover'];
  const on = (S) => !!(S && S.corp && S.corp.unlockedDay != null);
  function corpRng(S, fn) { // ГСЧ корпорации; вложенные вызовы идут тем же потоком
    const cr = S.corp; if (cr._rngIn) return fn();
    cr._rngIn = true; try { return CI().withRng(S, cr, 'rng', fn); } finally { delete cr._rngIn; }
  }
  const g = (d, m, f) => (d && d.f ? f : m);
  const has = (d, t) => (d.hidden || []).indexOf(t) >= 0;
  const knows = (d, t) => (d.known || []).indexOf(t) >= 0;

  /* ---------------- состояние по умолчанию ---------------- */
  function ensure(S) {
    const cr = S && S.corp; if (!cr) return;
    if (!cr.hq) cr.hq = {};
    for (const k of KEYS) if (cr.hq[k] == null || cr.hq[k] === false) cr.hq[k] = 0; else if (cr.hq[k] === true) cr.hq[k] = 1;
    if (!cr.hqSince) cr.hqSince = {};
    if (!cr.stat) cr.stat = { stolen: 0, caught: 0, poached: 0, left: 0, kpiPaid: 0, optPaid: 0, hqPaid: 0, audits: 0, fund: 0 };
    if (!cr.perks) cr.perks = {};
    if (!cr.prePressure) cr.prePressure = {};
    if (cr.equitySold == null) cr.equitySold = 0;
    if (cr.rivalOn == null) { const u = cr.cities.ufa; cr.rivalOn = cr.active === 'ufa' ? !!(S.rival && S.rival.enabled) : !!(u && u.packed && u.packed.rival && u.packed.rival.enabled); }
    for (const id in cr.cities) { const c = cr.cities[id]; if (c.pressure == null) { c.rp = c.rp || 0; c.pressure = pressOf(c); } }
    for (const d of cr.directors || []) dirInit(S, d);
    for (const d of cr.dirCand || []) dirInit(S, d);
    if (cr.hqFcK == null) cr.hqFcK = 1;
    if (cr.hqDelK == null) cr.hqDelK = 1;
  }
  function dirInit(S, d) { // поля Р3 у директора (новый или из сохранения Р2)
    if (!d.known) d.known = S.difficulty === 'easy' ? (d.hidden || []).slice() : []; // «Лёгкий»: скрытые черты видны при найме (§12 п. 4)
    if (!d.kpi) d.kpi = { keys: [], bonus: 0 };
    if (!d.progs) d.progs = [];
    if (!d.region) d.region = [];
    if (d.burnAt == null && has(d, 'burnout')) d.burnAt = 36 + ((d.id.length * 7 + (d.skills.ops | 0)) % 13); // детерминированно: 36–48 мес.
    if (d.agentAt == null && has(d, 'rivalAgent')) d.agentAt = 12 + ((d.id.length * 5 + (d.skills.people | 0)) % 13);
    return d;
  }

  /* ---------------- штаб: отделы ---------------- */
  const H = (key) => K().HQ[key];
  const lvlOf = (S, key) => (on(S) && S.corp.hq ? S.corp.hq[key] | 0 : 0);
  function openCost(S, key, lvl) { const h = H(key), o = Array.isArray(h.open) ? h.open[lvl] : h.open; return Math.round(o * S.macro.priceLevel / 1e5) * 1e5; }
  function monthCostAt(S, key, lvl) {
    if (!lvl) return 0; const h = H(key);
    let m = Array.isArray(h.month) ? h.month[lvl] : h.month;
    if (key === 'hr') m += (h.per5 || 0) * Math.floor(Object.keys(S.corp.cities).length / 5);
    return Math.round(m * S.macro.priceLevel);
  }
  const monthCost = (S, key) => monthCostAt(S, key, lvlOf(S, key));
  function hqTotal(S) { let s = 0; for (const k of KEYS) s += monthCost(S, k); return s; }
  function hqOpen(S, key) {
    if (!on(S) || KEYS.indexOf(key) < 0) return { ok: false };
    ensure(S);
    const cr = S.corp, cur = cr.hq[key] | 0, max = MAXLV[key] || 1;
    if (cur >= max) return { ok: false, msg: 'Отдел уже на максимальном уровне' };
    const cost = openCost(S, key, cur + 1);
    if (S.cash < cost) return { ok: false, msg: `Не хватает ${fm(cost - S.cash)}` };
    I.spend(S, cost, 'other');
    cr.hq[key] = cur + 1; if (!cur) cr.hqSince[key] = S.day;
    const nm = (BK.CORP_HQ[key] || {}).name || key;
    const lv = key === 'uni' ? ` — «${BK.CORP_UNI.levels[cur + 1].name}»` : key === 'logistics' ? ` — уровень ${cur + 1}${cur + 1 === 2 ? ' (фабрика заморозки)' : ''}` : '';
    I.log(S, `Штаб: ${cur ? 'улучшен' : 'открыт'} отдел «${nm}»${lv} за ${fm(cost)}. Абонплата ${fm(monthCostAt(S, key, cur + 1))}/мес.`, 'good');
    chron(S, { t: 'hq', key, lvl: cur + 1, cost });
    refreshK(S);
    return { ok: true, cost };
  }
  function hqClose(S, key) {
    if (!on(S) || !lvlOf(S, key)) return { ok: false };
    S.corp.hq[key] = 0; refreshK(S);
    I.log(S, `Штаб: отдел «${(BK.CORP_HQ[key] || {}).name || key}» закрыт.`, 'warn');
    return { ok: true };
  }
  // закупки и логистика — множители для движка (engine.js читает S.corp.hqFcK / hqDelK; без отделов — ровно 1)
  function refreshK(S) {
    const cr = S.corp, k = K();
    if (cr.hq.purchasing) { let n = 0; for (const id in cr.cities) n += BK.Corp.cityStats(S, id).stores; cr.hqFcK = 1 - Math.min(k.PURCH_MAX, k.PURCH_PER100 * n / 100); } else cr.hqFcK = 1;
    cr.hqDelK = k.LOG_DEL[cr.hq.logistics | 0] || 1;
  }
  function rateAdd(S) { // казначейство финдепа и ковенанта банка (e213)
    const cr = S.corp; if (!cr || !cr.hq) return 0;
    return (cr.hq.finance ? -K().FIN_RATE : 0) + (cr.cov && cr.cov.until > S.day ? cr.cov.rateAdd : 0);
  }
  function resAdd(S) { const cr = S.corp; return cr && cr.hq && cr.hq.finance ? K().FIN_RES : 0; }
  // Москва и Петербург: 3 города в сети И финансовый департамент (§12 п. 8)
  function bigLock(S) {
    const n = Object.keys(S.corp.cities).length, need = K().BIG_MIN_CITIES, fin = lvlOf(S, 'finance') > 0;
    if (n >= need && fin) return null;
    if (n < need && !fin) return `Откроется, когда в сети будет ${need} города и финансовый департамент`;
    if (n < need) return `Откроется, когда в сети будет ${need} города`;
    return 'Нужен финансовый департамент в штабе';
  }
  function launchDays(S) { return Math.round(K().LAUNCH_DAYS * (lvlOf(S, 'legal') ? K().LEGAL_LAUNCH_K : 1)); }
  function awSpeedK(S, c) { let k = lvlOf(S, 'brand') ? K().BRAND_AW_K : 1; const d = c && c.directorId && D() ? D().dirById(S, c.directorId) : null; if (d && d.traits.indexOf('mediaStar') >= 0) k *= 1.5; if (c && c.keepSignUntil > S.day) k *= 0.5; return k; }
  function awStartAdd(S) { return lvlOf(S, 'brand') ? K().BRAND_AW_START : 0; }
  function campaign(S) {
    const cr = S.corp; if (!lvlOf(S, 'brand')) return { ok: false, msg: 'Нужен отдел «Бренд»' };
    if (cr.campaignDay != null && S.day - cr.campaignDay < K().BRAND_CAMPAIGN_DAYS) return { ok: false, msg: 'Кампания уже шла в этом году' };
    const cost = Math.round(H('brand').campaign * S.macro.priceLevel / 1e5) * 1e5;
    if (S.cash < cost) return { ok: false, msg: `Не хватает ${fm(cost - S.cash)}` };
    I.spend(S, cost, 'marketing'); cr.campaignDay = S.day;
    for (const id in cr.cities) if (id !== 'ufa') cr.cities[id].aw = clamp(cr.cities[id].aw + K().BRAND_CAMPAIGN_AW, 0, 1);
    I.log(S, `«Федеральная реклама»: узнаваемость +${Math.round(K().BRAND_CAMPAIGN_AW * 100)} % во всех городах (${fm(cost)}).`, 'good');
    chron(S, { t: 'campaign', cost });
    return { ok: true, cost };
  }
  const chron = (S, x) => { if (!S.chron) return; S.chron.push(Object.assign({ day: S.day }, x)); };

  /* ---------------- давление соперников в городах (§5.3 R_c, §12 п. 6) ---------------- */
  function pressOf(c) { if (c.id === 'ufa') return 0; return clamp((K().PRESS_COMP[def(c.id).comp] || 0) + (c.rp || 0), 0, K().PRESS_MAX); }
  // множитель выручки точки: давление «сейчас» против давления в снимке (снимок уже учитывает то, что было при упаковке)
  function rivalMult(S, c, s) {
    if (c.id === 'ufa') return 1;
    const k = K().PRESS_K, rk = C().RIVAL_RATING_K || 0, r = s.rating != null ? s.rating : 4;
    const f = (p) => 1 - k * p * (1 + rk * (4 - r));
    return Math.max(0.5, f(c.pressure || 0)) / Math.max(0.5, f(s.pr0 || 0));
  }
  function rivalEnter(S, cityId, quiet) {
    const cr = S.corp, c = cr.cities[cityId];
    if (!c) { cr.prePressure[cityId] = clamp((cr.prePressure[cityId] || 0) + K().RIVAL_PRESS0, 0, K().PRESS_MAX); return 'pre'; }
    if (cityId === 'ufa' || c.rivalIn) return null;
    c.rivalIn = S.day; c.rp = Math.max(c.rp || 0, K().RIVAL_PRESS0); c.pressure = pressOf(c);
    if (cityId === cr.active && !(S.rival && S.rival.enabled) && I.rivalInit) I.rivalInit(S, true); // в подробном городе — обычная логика соперника
    if (!quiet) {
      I.log(S, `«${C().RIVAL_NAME}» вышел ${cin(cityId)}: давление соперника в городе ${n2(c.pressure)}.`, 'bad');
      D().pushInbox(S, { kind: 'note', tone: 'warn', city: cityId, dname: '', title: `«${C().RIVAL_NAME}» ${cin(cityId)}`, text: `Федеральная сеть идёт за нами: первые вывески уже висят. Выручка точек рядом ниже, сильнее — у точек с низким рейтингом. Держите рейтинг и занимайте места раньше них.` });
    }
    return 'in';
  }
  const n2 = (v) => String((Math.round(v * 100) / 100).toFixed(2)).replace('.', ',');
  function pressureMonthly(S) {
    const cr = S.corp, k = K();
    for (const id in cr.cities) {
      const c = cr.cities[id]; if (id === 'ufa') { c.pressure = 0; continue; }
      if (c.rivalIn) {
        const st = BK.Corp.cityStats(S, id), cap = def(id).cap || 40;
        const dom = st.open >= cap * 0.6 && (st.rating || 0) >= 4.3; // игрок доминирует — соперник отступает
        c.rp = clamp((c.rp || 0) + (dom ? k.RIVAL_PRESS_DOM : k.RIVAL_PRESS_GROW), 0.1, k.RIVAL_PRESS_CAP);
      }
      c.pressure = pressOf(c);
    }
    // федеральный «Хлебный двор» идёт за игроком: выбирает наш город (полгода после входа), где его ещё нет
    if (!cr.rivalOn) return;
    corpRng(S, () => {
      for (const id in cr.cities) {
        const c = cr.cities[id];
        if (id === 'ufa' || c.rivalIn || S.day - c.enteredDay < k.RIVAL_FOLLOW_AFTER) continue;
        const p = k.RIVAL_FOLLOW_P * (0.5 + (k.POACH_COMP[def(id).comp] || 1) / 2);
        if (I.rnd(S) < p) { rivalEnter(S, id); break; }
      }
    });
  }
  // вход в город: давление местных сетей + накопленное до входа (e208 и др.); соперник уже там — с шансом по конкуренции
  function onEnter(S, id) {
    const cr = S.corp, c = cr.cities[id]; if (!c) return;
    c.rp = cr.prePressure[id] || 0; delete cr.prePressure[id];
    if (cr.rivalOn && (def(id).big || def(id).comp === 'vhigh')) { c.rivalIn = S.day; c.rp = Math.max(c.rp, K().RIVAL_PRESS0); }
    c.pressure = pressOf(c);
    const pk = cr.perks[id];
    if (pk && pk.until >= S.day) { c.perk = { prodRent: pk.prodRent || 1 }; delete cr.perks[id]; }
  }

  /* ---------------- найм: HR, хедхантер, проверка при найме ---------------- */
  function candN(S) { return lvlOf(S, 'hr') ? K().HR_CAND_N : K().DIR_CAND_N; }
  function skillErr(S) { return lvlOf(S, 'hr') ? K().HR_SKILL_ERR : K().DIR_SKILL_ERR; }
  function hireCost(S, d) { return Math.round(d.src === 'hunter' ? d.salary * 12 * K().HUNTER_FEE_YEARS : d.salary * K().DIR_HIRE_SALARIES); }
  function checkCand(S, candId) { // проверка кандидата службой безопасности / HR: 0,5 оклада, раскрывает скрытую черту с шансом 50 %
    const cr = S.corp, d = cr.dirCand.find((x) => x.id === candId); if (!d) return { ok: false };
    if (!lvlOf(S, 'hr') && !lvlOf(S, 'security')) return { ok: false, msg: 'Нужен HR-департамент или служба безопасности' };
    if (d.checked) return { ok: false, msg: 'Уже проверен' };
    const cost = Math.round(d.salary * K().CHECK_FEE); if (S.cash < cost) return { ok: false, msg: 'Не хватает денег' };
    I.spend(S, cost, 'hire'); d.checked = true;
    const found = corpRng(S, () => (d.hidden || []).filter((t) => I.rnd(S) < K().CHECK_P));
    for (const t of found) if (!knows(d, t)) d.known.push(t);
    return { ok: true, found, cost };
  }

  /* ---------------- университет (§6.9) ---------------- */
  function seats(S) { return K().UNI_SEATS[lvlOf(S, 'uni')] || 0; }
  function students(S) { return (S.corp.directors || []).filter((d) => d.study); }
  function progCost(S, prog) { return Math.round(K().UNI_PROG[prog] * S.macro.priceLevel * (K().UNI_DISC[lvlOf(S, 'uni')] || 1) / 1e4) * 1e4; }
  function progLock(S, d, prog) {
    const lv = lvlOf(S, 'uni'), p = BK.CORP_UNI.programs[prog]; if (!p) return 'Нет такой программы';
    if (!lv) return 'Нужен корпоративный университет в штабе';
    if ((p.minLevel || 1) > lv) return `Нужна «${BK.CORP_UNI.levels[p.minLevel].name}» (ур. ${p.minLevel})`;
    if (d.study) return 'Уже учится';
    if (d.progs.indexOf(prog) >= 0) return 'Программа уже пройдена';
    if (prog === 'mba' && d.grade >= 5) return 'Выше грейда нет';
    if (students(S).length >= seats(S)) return `Мест нет: ${students(S).length}/${seats(S)}`;
    return null;
  }
  function enroll(S, dirId, prog, evening) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    const lock = progLock(S, d, prog); if (lock) return { ok: false, msg: lock };
    const cost = progCost(S, prog); if (S.cash < cost) return { ok: false, msg: `Не хватает ${fm(cost - S.cash)}` };
    I.spend(S, cost, 'train');
    const m = BK.CORP_UNI.programs[prog].months * (evening ? K().UNI_EVENING_K : 1);
    d.study = { prog, from: S.day, until: S.day + Math.round(m * 30.4), evening: !!evening };
    I.log(S, `${d.name} учится в корпоративном университете: «${BK.CORP_UNI.programs[prog].name}»${evening ? ' (вечерний формат)' : ''}, ${fm(cost)}.`, 'info');
    return { ok: true, cost };
  }
  function finishStudy(S, d) {
    const k = K(), prog = d.study.prog, p = BK.CORP_UNI.programs[prog]; d.study = null; d.progs.push(prog);
    let what = '';
    if (p.skill && p.skill !== 'all') { d.skills[p.skill] = Math.min(k.DIR_CAP[d.grade], d.skills[p.skill] + k.UNI_GAIN); what = `${(BK.DIRECTOR_SKILLS[p.skill] || {}).name} +${k.UNI_GAIN}`; }
    else if (prog === 'mba') { d.grade = Math.min(5, d.grade + 1); for (const s of D().SK) d.skills[s] = Math.min(k.DIR_CAP[d.grade], d.skills[s] + k.UNI_MBA_SKILL); d.loyalty = clamp(d.loyalty + k.UNI_MBA_LOY, 0, 100); d.mba = true; what = `грейд ${d.grade}, навыки +${k.UNI_MBA_SKILL}, лояльность +${k.UNI_MBA_LOY}, рыночная цена +20 %`; }
    else if (prog === 'brand') { d.brandStd = true; what = 'рейтинг города +0,1★'; }
    if (lvlOf(S, 'uni') >= 3) d.loyalty = clamp(d.loyalty + k.UNI_GRAD_LOY, 0, 100);
    I.log(S, `${d.name} ${g(d, 'окончил', 'окончила')} «${p.name}»: ${what}.`, 'good');
    D().pushInbox(S, { kind: 'note', tone: 'good', dir: d.id, dname: d.name, city: d.city, title: `${d.name}: диплом «${p.name}»`, text: `Эффект: ${what}.${lvlOf(S, 'uni') >= 3 ? ` Выпускник Академии бренда — лояльность +${k.UNI_GRAD_LOY}.` : ''}` });
  }
  function ownCandidate(S) { // ур. 2+: раз в год свой кандидат в директора (ур. 3 — до грейда 3)
    const cr = S.corp, lv = lvlOf(S, 'uni'); if (lv < 2) return;
    if (cr.uniOwnDay != null && S.day - cr.uniOwnDay < K().UNI_OWN_DAYS) return;
    if (cr.uniOwnDay == null) { cr.uniOwnDay = S.day - K().UNI_OWN_DAYS + 180; return; } // первый выпуск — через полгода после открытия
    cr.uniOwnDay = S.day;
    const d = corpRng(S, () => D().makeDirector(S, 'own', lv >= 3 ? 3 : 2));
    d.bio = 'Выпускник корпоративного университета: прошёл путь от продавца до управляющего в нашей сети.';
    cr.dirCand.push(d);
    D().pushInbox(S, { kind: 'note', tone: 'good', dir: null, dname: d.name, city: null, title: `Свой кандидат: ${d.name}`, text: `Корпоративный университет выпустил кандидата в директора: ${BK.DIRECTOR_GRADES[d.grade]}, стиль «${BK.DIRECTOR_STYLES[d.style].name}», лояльность ${Math.round(d.loyalty)}. Он в списке кандидатов во вкладке «Директора».` });
  }

  /* ---------------- мотивация: KPI, опционы, совет, регион (§6.6–6.7) ---------------- */
  function setKpi(S, dirId, o) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    if (o.toggle) { const i = d.kpi.keys.indexOf(o.toggle); if (i >= 0) d.kpi.keys.splice(i, 1); else if (d.kpi.keys.length < 3 && KPI_KEYS.indexOf(o.toggle) >= 0) d.kpi.keys.push(o.toggle); else return { ok: false, msg: 'Не больше трёх KPI' }; }
    if (o.keys) d.kpi.keys = o.keys.filter((k) => KPI_KEYS.indexOf(k) >= 0).slice(0, 3);
    if (o.bonus != null) d.kpi.bonus = clamp(Math.round(o.bonus * 20) / 20, 0, 1);
    return { ok: true };
  }
  // перекос навыков от KPI: «директор делает то, что меряют» (добавка к навыкам в eff)
  function kpiSkew(d) {
    const kp = d.kpi; if (!kp || !kp.bonus || !kp.keys.length) return null;
    const k = K(), n = kp.keys.length, str = Math.min(1, kp.bonus / 0.3), o = { ops: 0, econ: 0, growth: 0, people: 0 };
    const add = { rev: 'growth', profit: 'econ', rating: 'ops', turnover: 'people', opens: 'growth' };
    for (const key of kp.keys) o[add[key]] += (key === 'opens' ? k.KPI_SKEW / 2 : k.KPI_SKEW) / n * str;
    if (n === 1) for (const s of D().SK) if (s !== add[kp.keys[0]]) o[s] += k.KPI_PEN * str; // один KPI — остальное запускает
    return o;
  }
  const onlyProfit = (d) => d.kpi && d.kpi.bonus > 0 && d.kpi.keys.length === 1 && d.kpi.keys[0] === 'profit';
  const onlyOpens = (d) => d.kpi && d.kpi.bonus > 0 && d.kpi.keys.length && d.kpi.keys.every((x) => x === 'opens' || x === 'rev');
  function unvested(d) { const o = d.opt; return o && o.corp && o.vested < K().OPT_YEARS ? (K().OPT_YEARS - o.vested) / K().OPT_YEARS : 0; }
  function profit12(S) { let s = 0; for (const x of S.history.slice(-12)) s += x.profit; return s; }
  function grantCorp(S, dirId, share) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    if (unvested(d) > 0) return { ok: false, msg: 'Прежний опцион ещё созревает' };
    share = clamp(share, 0.001, 0.01);
    const value = Math.round(share * K().OPT_YEARS * Math.max(0, profit12(S)));
    d.opt = Object.assign(d.opt || {}, { corp: share, value, grant: S.day, vested: 0 });
    d.loyalty = clamp(d.loyalty + 3, 0, 100);
    I.log(S, `${d.name}: опцион ${pct1(share)} корпорации (≈ ${fm(value)}, вестинг ${K().OPT_YEARS} года).`, 'info');
    chron(S, { t: 'option', dir: d.name, share, value });
    return { ok: true, value };
  }
  function setCityShare(S, dirId, share) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    d.opt = Object.assign(d.opt || { corp: 0, value: 0, grant: null, vested: 0 }, { city: clamp(Math.round(share * 1000) / 1000, 0, 0.05) });
    return { ok: true };
  }
  const pct1 = (v) => String((Math.round(v * 1000) / 10).toFixed(1)).replace('.', ',') + ' %';
  function setBoard(S, dirId, on_) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    const n = S.corp.directors.filter((x) => x.board).length;
    if (on_ && !d.board) { if (n >= K().BOARD_MAX) return { ok: false, msg: `В совете уже ${K().BOARD_MAX} мест` }; d.board = true; d.loyalty = clamp(d.loyalty + K().BOARD_LOY, 0, 100); I.log(S, `${d.name} — в совете директоров.`, 'good'); }
    else if (!on_ && d.board) { d.board = false; d.loyalty = clamp(d.loyalty - 5, 0, 100); }
    return { ok: true };
  }
  function regionCands(S, d) { // соседние города без директора, ближе 600 км к основному
    if (!d.city) return [];
    const cr = S.corp;
    return Object.keys(cr.cities).filter((id) => id !== d.city && id !== cr.active && !cr.cities[id].directorId && BK.roadKm(d.city, id) <= K().REGION_KM);
  }
  function promote(S, dirId) {
    const d = D().dirById(S, dirId); if (!d) return { ok: false };
    if (d.regional) return { ok: false, msg: 'Уже региональный' };
    if (d.grade < K().REGION_GRADE) return { ok: false, msg: `Нужен грейд ${K().REGION_GRADE}+` };
    if (!d.city) return { ok: false, msg: 'Сначала назначьте на город' };
    d.regional = true; d.salary = Math.round(d.salary * K().REGION_PAY / 1000) * 1000;
    I.log(S, `${d.name} — региональный директор: может вести до ${K().REGION_MAX} соседних городов (оклад +40 %).`, 'good');
    const r = regionCands(S, d); if (r.length) addRegion(S, d.id, r[0]);
    return { ok: true };
  }
  function addRegion(S, dirId, cityId) {
    const d = D().dirById(S, dirId), c = S.corp.cities[cityId]; if (!d || !c) return { ok: false };
    if (!d.regional) return { ok: false, msg: 'Сначала повысьте до регионального' };
    if (d.region.length >= K().REGION_MAX - 1) return { ok: false, msg: `В кластере уже ${K().REGION_MAX} города` };
    if (regionCands(S, d).indexOf(cityId) < 0) return { ok: false, msg: 'Город далеко или у него уже есть директор' };
    d.region.push(cityId); c.directorId = d.id; if (!c.budget.capex) { c.budget.capex = D().proposeCapex(S, c, d); c.budget.left = c.budget.capex; }
    D().makePlan(S, c, d);
    I.log(S, `${d.name} ведёт и ${cname(cityId)} (кластер: ${[d.city].concat(d.region).map(cname).join(', ')}).`, 'info');
    return { ok: true };
  }
  function dropRegion(S, d, cityId) {
    const cr = S.corp;
    for (const id of cityId ? [cityId] : d.region.slice()) { if (cr.cities[id] && cr.cities[id].directorId === d.id) cr.cities[id].directorId = null; d.region = d.region.filter((x) => x !== id); }
  }

  /* ---------------- рыночная цена, переманивание (§6.8) ---------------- */
  function priceK(d) { return d.mba ? K().UNI_MBA_PRICE : 1; }
  function poachP(S, d) {
    if (!d.city) return 0;
    const k = K(), c = S.corp.cities[d.city], mk = D().marketPay(S, d, d.city);
    const comp = k.POACH_COMP[def(d.city).comp] || 1;
    let p = k.POACH_BASE * comp * Math.pow(mk / Math.max(1, d.salary), 2) * clamp(1.6 - 1.2 * d.loyalty / 100, 0.1, 1.6) * (1 - k.OPT_POACH * unvested(d)) * (d.grade >= 3 ? k.POACH_GRADE : 1);
    if (lvlOf(S, 'hr')) p *= k.HR_POACH_K;
    p *= k.POACH_DIFF[S.difficulty] || 1;
    if (c && c.rivalIn) p *= 1.15;
    return clamp(p, 0, 0.2);
  }

  /* ---------------- скрытые черты: воровство и приукрашивание в действии ---------------- */
  function theftOf(S, d, c) { // доля выручки, которую уводит директор (0 — честный, пойман или город подробный)
    if (!d || !has(d, 'theft') || d.caught || !d.theta || !c || c.id === S.corp.active) return 0;
    return d.theta * (unvested(d) > 0 ? K().OPT_THEFT : 1);
  }
  function embOf(d) { return d && has(d, 'embellish') && !knows(d, 'embellish') ? d.emb || 0 : 0; }
  // раскрыть черту: воровство — карточка с решением во входящих; приукрашивание — предупреждение
  function reveal(S, d, trait, how, extra) {
    if (!d || !has(d, trait) || knows(d, trait)) return false;
    const cr = S.corp; d.known.push(trait);
    const cityId = d.city, gap = trait === 'theft' ? (d.theta || K().THEFT0) : (d.emb || 0.07);
    const HOW = { security: 'Служба безопасности', finance: 'Финансовый департамент', audit: 'Аудит', visit: 'Личный визит', check: 'Проверка при найме', event: 'Проверка' };
    if (trait === 'theft') {
      d.caught = true; cr.stat.caught++;
      const stolen = Math.round(d.stolen || 0);
      D().pushInbox(S, { kind: 'caught', trait, tone: 'bad', dir: d.id, dname: d.name, city: cityId, how, gap: +gap.toFixed(3), stolen,
        title: how === 'visit' ? `Цифры не сходятся ${cityId ? cin(cityId) : ''}` : `${HOW[how] || 'Проверка'}: ${d.name} ${g(d, 'уводил', 'уводила')} выручку`,
        text: `${how === 'visit' ? `Вы сами открыли кассу: касса и отчёт расходятся на ${pct1(gap)}. ` : ''}${d.name} ${g(d, 'уводил', 'уводила')} ≈ ${pct1(gap)} выручки${cityId ? ' ' + cin(cityId) : ''}; всего ушло около ${fm(stolen)}. Решите, что делать.`,
        choices: ['sue', 'quiet', 'forgive'], done: null, due: S.day + 45 });
      I.log(S, `${HOW[how] || 'Проверка'}: ${d.name}${cityId ? ' (' + cname(cityId) + ')' : ''} — «Нечист на руку», украдено ≈ ${fm(stolen)}.`, 'bad');
      S.notify.push({ type: 'toast', title: how === 'visit' ? 'Цифры не сходятся' : 'Поймали на воровстве', text: `${d.name}: касса и отчёт расходятся на ${pct1(gap)}. Решение — во вкладке «Отчёты».`, kind: 'bad' });
    } else if (trait === 'embellish') {
      D().pushInbox(S, { kind: 'caught', trait, tone: 'warn', dir: d.id, dname: d.name, city: cityId, how, gap: +gap.toFixed(3),
        title: `${HOW[how] || 'Проверка'}: отчёты ${d.name} приукрашены`, text: `KPI в отчётах завышены примерно на ${pct1(gap)}: премии переплачены, план ${cityId ? cin(cityId) : ''} на деле хуже. Отчёты дальше — уже без прикрас.`,
        choices: ['warn', 'fire'], done: null, due: S.day + 45 });
      I.log(S, `${HOW[how] || 'Проверка'}: ${d.name} приукрашивает отчёты (≈ ${pct1(gap)}).`, 'warn');
    } else {
      I.log(S, `${HOW[how] || 'Проверка'}: у ${d.name} черта «${(BK.DIRECTOR_TRAITS[trait] || {}).name || trait}».`, 'warn');
    }
    void extra;
    return true;
  }
  // решение по пойманному: sue — уволить и в суд; quiet — уволить тихо; forgive — простить, оклад −30 %; warn — предупредить; fire — уволить
  function decide(S, repId, choice) {
    const cr = S.corp, it = cr.inbox.find((x) => x.id === repId); if (!it || it.kind !== 'caught' || it.done) return { ok: false };
    const d = D().dirById(S, it.dir), k = K();
    it.done = choice;
    if (!d) { it.done = 'gone'; return { ok: true }; }
    if (choice === 'sue') {
      const back = Math.round((d.stolen || 0) * k.SUE_BACK);
      D().fire(S, d.id, 0);
      if (back > 0) (cr.pending = cr.pending || []).push({ day: S.day + 365, cash: back, text: `Суд с ${d.name}: возвращено ${fm(back)} украденного.` });
      if (it.city && cr.cities[it.city] && it.city !== 'ufa') cr.cities[it.city].aw = clamp(cr.cities[it.city].aw + k.SUE_AW, 0, 1);
      I.log(S, `${d.name}: уволен${g(d, '', 'а')}, иск подан — через год вернут ≈ ${fm(back)}; скандал: узнаваемость ${it.city ? cname(it.city) : ''} −5 %.`, 'warn');
    } else if (choice === 'quiet' || choice === 'fire') { D().fire(S, d.id, 0); }
    else if (choice === 'forgive') {
      d.salary = Math.round(d.salary * k.FORGIVE_PAY / 1000) * 1000; d.theta = 0; d.loyalty = clamp(d.loyalty - 5, 0, 100);
      if (corpRng(S, () => I.rnd(S)) < k.RELAPSE_P) d.relapseDay = S.day + 365; else { d.hidden = d.hidden.filter((t) => t !== 'theft'); }
      I.log(S, `${d.name}: прощен${g(d, '', 'а')}, оклад −30 %.`, 'info');
    } else if (choice === 'warn') { d.hidden = d.hidden.filter((t) => t !== 'embellish'); d.emb = 0; d.loyalty = clamp(d.loyalty - 5, 0, 100); }
    chron(S, { t: 'caught', dir: d.name, choice });
    return { ok: true };
  }
  function auditCost(S, cityId) {
    const c = S.corp.cities[cityId]; if (!c) return 0;
    const rev = c.hist.slice(-12).reduce((a, x) => a + x[2], 0) * (12 / Math.max(1, Math.min(12, c.hist.length)));
    return Math.round(Math.max(K().AUDIT_MIN * S.macro.priceLevel, rev * K().AUDIT_PCT) * (lvlOf(S, 'security') ? K().SEC_AUDIT_K : 1) / 1e5) * 1e5;
  }
  function audit(S, cityId, opts) {
    const cr = S.corp, c = cr.cities[cityId]; if (!c) return { ok: false };
    const d = D().dirOf(S, c); if (!d) return { ok: false, msg: 'У города нет директора' };
    const free = opts && opts.free, cost = free ? 0 : auditCost(S, cityId);
    if (!free && S.cash < cost) return { ok: false, msg: `Не хватает ${fm(cost - S.cash)}` };
    if (cost) I.spend(S, cost, 'other');
    cr.stat.audits++;
    const k = K(), pen = opts && opts.falsePenalty != null ? opts.falsePenalty : k.AUDIT_FALSE;
    const found = corpRng(S, () => ['theft', 'embellish'].filter((t) => has(d, t) && !knows(d, t) && I.rnd(S) < k.AUDIT_P[t]));
    for (const t of found) reveal(S, d, t, 'audit');
    const dishonest = has(d, 'theft') || has(d, 'embellish');
    let loy = 0;
    if (!found.length && !dishonest) { loy = pen; if (d.lastAudit != null && S.day - d.lastAudit < 365) loy += k.AUDIT_AGAIN; d.loyalty = clamp(d.loyalty + loy, 0, 100); }
    d.lastAudit = S.day; d.checked = S.day;
    if (!found.length) D().pushInbox(S, { kind: 'note', tone: loy < 0 ? 'warn' : '', dir: d.id, dname: d.name, city: cityId, title: `Аудит ${cin(cityId)}: касса и отчёты сходятся`, text: `Нарушений не нашли${cost ? ` (аудит — ${fm(cost)})` : ''}.${loy < 0 ? ` ${d.name} ${g(d, 'обижен', 'обижена')} проверкой: лояльность ${loy}.` : ''}` });
    chron(S, { t: 'audit', city: cityId, found: found.length, cost });
    I.log(S, `Аудит ${cin(cityId)}${cost ? ` (${fm(cost)})` : ''}: ${found.length ? 'найдены нарушения' : 'нарушений нет'}.`, found.length ? 'bad' : 'info');
    return { ok: true, found, cost, loy };
  }
  // личный визит («зайти» в город директора): касса без фильтра директора
  function onVisit(S, cityId) {
    const cr = S.corp, c = cr.cities[cityId]; if (!c || !D()) return;
    const d = D().dirOf(S, c); if (!d) return;
    corpRng(S, () => { for (const t of ['theft', 'embellish']) if (has(d, t) && !knows(d, t) && I.rnd(S) < K().VISIT_P[t]) reveal(S, d, t, 'visit'); });
  }

  /* ---------------- 1-е число: штаб, учёба, KPI, опционы, черты, переманивание, соперник ---------------- */
  function monthly(S) {
    const cr = S.corp; ensure(S);
    const k = K(), t = E.dateOf(S.day);
    // абонплата штаба
    const hq = hqTotal(S); if (hq) { I.spend(S, hq, 'upkeep'); cr.stat.hqPaid += hq; }
    refreshK(S);
    ownCandidate(S);
    // отложенные деньги (суд)
    if (cr.pending && cr.pending.length) cr.pending = cr.pending.filter((x) => { if (x.day > S.day) return true; S.cash += x.cash; S.month.income += x.cash; I.log(S, x.text, 'good'); return false; });
    corpRng(S, () => {
      for (const d of cr.directors.slice()) {
        dirInit(S, d);
        if (d.study && S.day >= d.study.until) finishStudy(S, d);
        // вестинг опциона: треть в год
        const o = d.opt;
        if (o && o.corp && o.vested < k.OPT_YEARS && S.day - o.grant >= 365 * (o.vested + 1)) {
          const pay = Math.round(o.value / k.OPT_YEARS); o.vested++; I.spend(S, pay, 'upkeep'); cr.stat.optPaid += pay;
          I.log(S, `${d.name}: созрела ${o.vested}-я треть опциона — ${fm(pay)}.`, 'info');
        }
        // уход после «передачи дел»
        if (d.leaveDay != null && S.day >= d.leaveDay) { leaveNow(S, d, d.leaveTo || 'rival'); continue; }
        // скрытые черты
        if (has(d, 'theft') && !d.caught && d.city) {
          if (!d.theta) d.theta = k.THEFT0; else if (d.cityMonths > 0 && d.cityMonths % 3 === 0) d.theta = Math.min(k.THEFT_MAX, d.theta + k.THEFT_Q);
        }
        if (d.relapseDay != null && S.day >= d.relapseDay) { d.relapseDay = null; d.caught = false; d.known = d.known.filter((x) => x !== 'theft'); d.theta = k.THEFT0; }
        if (has(d, 'embellish') && !knows(d, 'embellish') && !d.emb) d.emb = +I.rr(S, k.EMB[0], k.EMB[1]).toFixed(3);
        if (lvlOf(S, 'security') && has(d, 'theft') && !knows(d, 'theft') && d.city && I.rnd(S) < k.SEC_THEFT_P) reveal(S, d, 'theft', 'security');
        if (lvlOf(S, 'finance') && has(d, 'embellish') && !knows(d, 'embellish') && d.city && I.rnd(S) < k.FIN_EMB_P) reveal(S, d, 'embellish', 'finance');
        if (has(d, 'burnout') && !d.burnQ && d.months >= (d.burnAt || 42) && d.city && BK.CorpEv) { d.burnQ = true; BK.CorpEv.queue(S, { id: 'e217', day: S.day + I.ri(S, 1, 20), dir: d.id }); }
        if (has(d, 'rivalAgent') && d.months >= (d.agentAt || 18) && d.city && d.leaveDay == null) { d.leaveDay = S.day; d.leaveTo = 'agent'; }
        // переманивание: формула §6.8 → событие e202
        d.poachP = +poachP(S, d).toFixed(4);
        if (d.city && d.city !== cr.active && d.leaveDay == null && BK.CorpEv && !BK.CorpEv.queued(S, 'e202', d.id) && I.rnd(S) < d.poachP) {
          const rival = cr.rivalOn && (cr.cities[d.city].rivalIn || I.rnd(S) < 0.4);
          const local = BK.CORP_LOCAL_CHAINS ? I.pick(S, BK.CORP_LOCAL_CHAINS) : 'Пекарни у дома';
          BK.CorpEv.queue(S, { id: 'e202', day: S.day + I.ri(S, 1, 10), dir: d.id, offerPct: I.ri(S, k.POACH_OFFER[0], k.POACH_OFFER[1]), poacher: rival ? `«${C().RIVAL_NAME}»` : `местная сеть «${local}»` });
        }
      }
      // KPI-премии — раз в квартал (январь, апрель, июль, октябрь)
      if (t.m % 3 === 0) for (const d of cr.directors) if (d.city && d.kpi.bonus > 0 && d.kpi.keys.length) payKpi(S, d);
    });
    pressureMonthly(S);
    // дивиденды фонду (e216) и ковенанта банка (e213) — в январе
    if (t.m === 0) {
      const pr = profit12(S);
      if (cr.equitySold > 0 && pr > 0) { const div = Math.round(pr * cr.equitySold); I.spend(S, div, 'other'); cr.stat.fund += div; I.log(S, `Дивиденды фонду (${pct1(cr.equitySold)} корпорации): ${fm(div)}.`, 'warn'); }
      if (cr.cov && cr.cov.margin != null) {
        let rev = 0; for (const x of S.history.slice(-12)) rev += x.rev;
        if (rev > 0 && pr / rev < cr.cov.margin) { cr.cov.until = S.day + 365; I.log(S, `Ковенанта банка нарушена: маржа сети ${pct1(pr / rev)} < ${pct1(cr.cov.margin)} — ставка +${pct1(cr.cov.rateAdd)} на год.`, 'bad'); S.notify.push({ type: 'toast', title: 'Ковенанта банка нарушена', text: `Маржа сети за год ниже ${pct1(cr.cov.margin)}: ставка по кредиту +${pct1(cr.cov.rateAdd)} на год.`, kind: 'bad' }); }
      }
      // доли прибыли городов — раз в год
      for (const d of cr.directors) {
        if (!d.opt || !d.opt.city || !d.city) continue;
        const c = cr.cities[d.city], y = t.y - 1, p = c.hist.filter((x) => x[0] === y).reduce((a, x) => a + x[3], 0);
        if (p > 0) { const pay = Math.round(p * d.opt.city); I.spend(S, pay, 'upkeep'); cr.stat.optPaid += pay; I.log(S, `${d.name}: доля ${pct1(d.opt.city)} прибыли ${cname(d.city)} за ${y} — ${fm(pay)}.`, 'info'); }
      }
    }
  }
  function leaveNow(S, d, to) {
    const cr = S.corp, c = d.city ? cr.cities[d.city] : null;
    const took = c ? takeStaff(S, c, to === 'agent' ? [2, 3] : d.takeStaff || [0, 0], to === 'agent' ? 1 : d.takeP || 0, d.leaveMood || -5) : 0;
    D().removeDir(S, d);
    cr.stat.left++; if (to !== 'agent') cr.stat.poached++;
    const where = to === 'agent' ? `в «${C().RIVAL_NAME}»` : d.leaveWho || 'к конкуренту';
    if (to === 'agent' && c && c.id !== 'ufa') { c.rp = Math.max(c.rp || 0, K().RIVAL_PRESS0); c.pressure = pressOf(c); }
    if (to === 'agent' && !knows(d, 'rivalAgent')) d.known.push('rivalAgent');
    I.log(S, `${d.name} ${g(d, 'ушёл', 'ушла')} ${where}${took ? ` и ${g(d, 'увёл', 'увела')} ${took} лучших продавцов` : ''}.${c ? ' ' + cname(c.id) + ' без директора.' : ''}`, 'bad');
    D().pushInbox(S, { kind: 'note', tone: 'bad', dir: d.id, dname: d.name, city: c ? c.id : null, title: `${d.name} ${g(d, 'ушёл', 'ушла')} ${where}`, text: `${to === 'agent' ? 'Оказалось, это был человек соперника: он пришёл за нашими людьми и рецептами. ' : ''}${took ? `С ${g(d, 'ним', 'ней')} ушли ${took} лучших продавцов, настроение команды упало. ` : ''}${c ? `${cname(c.id)} без директора — назначьте нового.` : ''}` });
    S.notify.push({ type: 'toast', title: `${d.name} ${g(d, 'ушёл', 'ушла')}`, text: c ? `${cname(c.id)} без директора.` : '', kind: 'bad' });
  }
  // увести лучших продавцов из города (упакованного или активного); настроение команды += mood
  function takeStaff(S, c, range, p, mood) {
    if (!range || !range[1] || (p < 1 && corpRng(S, () => I.rnd(S)) >= p)) return 0;
    let n = corpRng(S, () => I.ri(S, range[0], range[1])), took = 0;
    if (c.id === S.corp.active) {
      const all = []; for (const st of S.stores) for (const e of st.staff) all.push({ st, e });
      all.sort((a, b) => b.e.lvl - a.e.lvl);
      for (const x of all.slice(0, n)) { x.st.staff.splice(x.st.staff.indexOf(x.e), 1); took++; S.stats.quits++; }
      for (const st of S.stores) for (const e of st.staff) e.mood = clamp(e.mood + mood, 0, 100);
    } else if (c.packed) {
      const list = c.packed.stores.filter((s) => s.staff.n > 1).sort((a, b) => (b.staff.lv[4] + b.staff.lv[3]) - (a.staff.lv[4] + a.staff.lv[3]));
      for (const s of list) { if (n <= 0) break; for (let l = 4; l >= 2 && n > 0; l--) if (s.staff.lv[l] > 0 && s.staff.n > 1) { s.staff.lv[l]--; s.staff.n--; n--; took++; S.stats.quits++; break; } }
      for (const s of c.packed.stores) s.staff.mood = clamp(s.staff.mood + mood, 0, 100);
    }
    return took;
  }
  // квартальная KPI-премия: премия/4 × средн. clamp((факт/план − 0,9)/0,2; 0; 1,5); у «приукрашивающего» — по завышенным цифрам
  function kpiFacts(S, d) {
    const c = S.corp.cities[d.city]; if (!c || !c.plan) return null;
    const rows = c.hist.slice(-3); if (rows.length < 3) return null;
    const k = K(), emb = 1 + embOf(d);
    const rev = rows.reduce((a, x) => a + x[2], 0), prof = rows.reduce((a, x) => a + x[3], 0), staff = rows.reduce((a, x) => a + (x[6] || 0), 0) / 3, quits = rows.reduce((a, x) => a + (x[8] || 0), 0);
    const planRev = c.plan.monthRev * 3, planProf = planRev * Math.max(0.02, c.plan.margin);
    const rating = rows[2][5] || 0, stores = rows[2][4];
    const el = clamp((S.day - c.plan.from) / 365, 0.25, 1), n0 = c.plan.n0 != null ? c.plan.n0 : stores, planSt = n0 + (c.plan.stores - n0) * el;
    const turn = staff > 0 ? quits / staff / 3 : 0;
    const f = { rev: rev * emb / Math.max(1, planRev), profit: prof * emb / Math.max(1, planProf), rating: Math.min(5, rating * (1 + (emb - 1) / 2)) / k.KPI_RATING, opens: stores / Math.max(1, planSt), turnover: k.KPI_TURN / Math.max(0.004, turn / emb) };
    return f;
  }
  const kpiScore = (x) => clamp((x - K().KPI_OK) / K().KPI_SPAN, 0, K().KPI_CAP);
  function kpiEstimate(S, d) { // ожидаемая выплата за квартал (для UI)
    const f = kpiFacts(S, d); if (!f || !d.kpi.keys.length) return { pay: 0, f: null };
    let s = 0; for (const key of d.kpi.keys) s += kpiScore(f[key]); s /= d.kpi.keys.length;
    return { pay: Math.round(d.kpi.bonus * d.salary * 12 / 4 * s), f, s };
  }
  function payKpi(S, d) {
    const e = kpiEstimate(S, d); if (!e.f) return;
    const cr = S.corp;
    if (e.pay > 0) { I.spend(S, e.pay, 'upkeep'); cr.stat.kpiPaid += e.pay; }
    d.kpiLast = { day: S.day, pay: e.pay, s: +e.s.toFixed(2), f: Object.fromEntries(d.kpi.keys.map((key) => [key, +e.f[key].toFixed(3)])) };
    const N = (key) => (BK.CORP_KPI[key] || {}).name || key;
    D().pushInbox(S, { kind: 'kpi', tone: e.pay > 0 ? 'good' : 'warn', dir: d.id, dname: d.name, city: d.city, pay: e.pay, s: d.kpiLast.s, f: d.kpiLast.f,
      title: `Премия за квартал: ${e.pay > 0 ? fm(e.pay) : 'не заработана'}`, text: d.kpi.keys.map((key) => `${N(key)} ${Math.round(e.f[key] * 100)} % плана`).join(' · ') });
  }

  /* ---------------- модификаторы для модели города (directors.js: eff/mods) ---------------- */
  function skillAdd(S, d, c) { // KPI-перекос и учёба; регион — множитель
    const sk = kpiSkew(d) || null;
    const reg = c && d.city && c.id !== d.city ? K().REGION_SKILL : 1;
    return { add: sk, k: reg };
  }
  function modsAdj(S, d, c, m) { // поправки к объекту mods() города
    const k = K();
    if (d.study && !d.study.evening) m.D *= k.UNI_STUDY_D;
    m.theft = theftOf(S, d, c);
    const uni = lvlOf(S, 'uni');
    if (uni) { m.trainRate *= k.UNI_TRAIN_RATE[uni]; m.trainCostK = k.UNI_TRAIN_COST; }
    if (onlyProfit(d)) { m.trainRate *= 0.7; m.rAdd = (m.rAdd || 0) + k.KPI_PROFIT_RATING; m.repairK = 0.6; }
    if (d.brandStd) m.rAdd = (m.rAdd || 0) + 0.1; else if (d.cityMonths < 6) m.rAdd = (m.rAdd || 0) - 0.1;
    return m;
  }
  function paybackK(d) { return onlyOpens(d) ? K().KPI_OPENS_PB : 1; }

  /* ---------------- сводки для UI ---------------- */
  function optShare(S) { // доля прибыли сети, уходящая директорам в год (опционы + доли городов + KPI-премии)
    const cr = S.corp, pr = profit12(S); if (!(pr > 0)) return { share: 0, sum: 0 };
    let sum = 0;
    for (const d of cr.directors) {
      if (d.opt && d.opt.corp && d.opt.vested < K().OPT_YEARS) sum += d.opt.value / K().OPT_YEARS;
      if (d.opt && d.opt.city && d.city) sum += Math.max(0, cr.cities[d.city].hist.slice(-12).reduce((a, x) => a + x[3], 0)) * d.opt.city;
      if (d.kpi.bonus && d.kpi.keys.length) sum += d.kpi.bonus * d.salary * 12 * 0.8;
    }
    return { share: sum / pr, sum };
  }
  function riskList(S) { // директора с риском переманивания > 1,5 %/мес
    return (S.corp.directors || []).filter((d) => d.city && (d.poachP || 0) > 0.015);
  }

  BK.HQ = { ensure, dirInit, KEYS, MAXLV, KPI_KEYS, lvlOf, openCost, monthCost, monthCostAt, hqTotal, hqOpen, hqClose, refreshK, rateAdd, resAdd, bigLock, launchDays, awSpeedK, awStartAdd, campaign,
    pressOf, rivalMult, rivalEnter, onEnter, candN, skillErr, hireCost, checkCand, seats, students, progCost, progLock, enroll, setKpi, kpiSkew, kpiEstimate, kpiFacts, unvested, grantCorp, setCityShare, setBoard,
    regionCands, promote, addRegion, dropRegion, onlyProfit, corpRng, priceK, poachP, theftOf, embOf, reveal, decide, audit, auditCost, onVisit, monthly, leaveNow, takeStaff, skillAdd, modsAdj, paybackK, optShare, riskList, profit12, knows, has };
  Object.assign(BK.Engine, { hqOpen, hqCampaign: campaign, uniEnroll: enroll, dirKpi: setKpi, dirOption: grantCorp, dirCityShare: setCityShare, dirBoard: setBoard, dirPromote: promote, dirRegion: addRegion,
    cityAudit: audit, caughtDecide: decide, candCheck: checkCand });
})();
