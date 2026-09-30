// Боты пролога «Бариста»: node sim/prologue.js ideal|normal|spender [сидов] [--v]
// Считает, за сколько игровых месяцев и реальных минут профиль доходит до финала «Своя точка» или «жизнь в найме».
// Модель реального времени: месяц на ×1 (CFG.PROLOGUE.MONTH_MS) + чтение окна-решения + «Смена» (если играет) + настройки/покупки.
// BK_CFG='{"PROLOGUE.GOAL":1400000}' — переопределить числа (как в sim/bot.js).
const BK = require('./load');
const PR = BK.Prologue, c = () => BK.CFG.PROLOGUE;

const PROF = {
  // экономно, у родителей, вклад, учёба, мало соблазнов, «Смена» раз в 2–3 месяца
  ideal: { home: 'parents', food: 'eco', fun: 'none', extra: 1, save: 3, depEvery: 1, courses: ['coffee', 'sales', 'lead'], shiftEvery: 4, q: 0.85, wants: { gifts: 0.08 }, tempt: 0.08, invest: 0, loan: 0, hero: 0.95 },
  // снимает комнату, ест нормально, иногда срывается, вклад раз в год
  normal: { home: 'room', food: 'normal', fun: 'some', extra: 1, save: 2, depEvery: 12, courses: ['coffee', 'lead', 'sales'], shiftEvery: 3, q: 0.65, wants: { clothes: 0.35, gifts: 0.25, sneakers: 0.2, trip: 0.15, phone: 0.08, console: 0.04 }, tempt: 0.45, invest: 0.25, loan: 0.5, hero: 0.75 },
  // своя квартира, кафе, всё что хочется, ничего не откладывает
  spender: { home: 'flat', food: 'cafe', fun: 'lots', extra: 0, save: 0, depEvery: 0, courses: [], shiftEvery: 10, q: 0.5, wants: { clothes: 0.7, gifts: 0.5, sneakers: 0.6, trip: 0.5, phone: 0.35, console: 0.3, car: 0.5 }, tempt: 0.9, invest: 0.6, loan: 0.8, hero: 0.5 },
};

function botRand(seed) { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function pickChoice(S, cv, pf, R) {
  const ch = cv.choices, can = ch.map((c, i) => (c.can ? i : -1)).filter((i) => i >= 0);
  const id = cv.id;
  if (id === 'goal') return 0;
  if (id === 'leave') return 0;
  if (id === 'promo') return 0;
  if (id === 'h_rival') return R() < pf.hero ? 1 : 0;
  if (cv.kind === 'hero') return R() < pf.hero ? 0 : can[can.length - 1];
  const tempt = ch.findIndex((c) => c.cashOnly && c.fx && c.fx.mood > 0);
  if (tempt >= 0) return ch[tempt].can && R() < pf.tempt ? tempt : can.find((i) => i !== tempt) != null ? can.find((i) => i !== tempt) : can[0];
  if (id === 'e_invest') return R() < pf.invest && ch[0].can ? 0 : 1;
  if (id === 'e_loan') return R() < pf.loan && ch[0].can ? 0 : 1;
  if (id === 'e_grandma') return pf.save >= 2 ? 0 : 1;
  if (id === 'e_fest') return S.prologue.hp > 50 && pf.extra ? 0 : 1;
  if (id === 'sick') return S.prologue.hp < 20 ? 0 : pf === PROF.ideal ? 1 : 0;
  if (id === 'e_parents') return 0;
  // по умолчанию: самое дешёвое из доступного (бережливые) или случайное
  const cost = (i) => ch[i].cost || 0;
  if (pf.save >= 2) return can.slice().sort((a, b) => cost(a) - cost(b))[0];
  return can[Math.floor(R() * can.length)];
}

function run(profile, seed, verbose) {
  const pf = PROF[profile], R = botRand(seed * 7 + 3);
  const S = { seed };
  const P = PR.start(S);
  let sec = 0, cards = 0, shifts = 0, sets = 0; const T = { mon: 0, card: 0, shift: 0, set: 0 };
  const set = (fn) => { const r = fn(); if (r && r.ok) { sets++; sec += c().BOT_SET_SEC; T.set += c().BOT_SET_SEC; } };
  // стартовые настройки
  PR.setHome(S, pf.home); PR.setFood(S, pf.food); PR.setFun(S, pf.fun); PR.setExtra(S, pf.extra); PR.setSaveRate(S, pf.save); sec += 4 * c().BOT_SET_SEC;
  let guard = 0;
  while (P.status === 'run' && guard++ < 5000) {
    // решения
    while (P.cards.length && P.status === 'run') { const cv = PR.card(S); PR.choose(S, pickChoice(S, cv, pf, R)); cards++; const d = cv.choices.length > 1 ? c().BOT_CARD_SEC : c().BOT_INFO_SEC; sec += d; T.card += d; }
    if (P.status !== 'run') break;
    // начало месяца (t ≈ 0): настройки, учёба, покупки, «Смена»
    if (P.t === 0) {
      // здоровье: бережливые едят экономно, пока силы есть
      if (pf.food === 'eco') { if (P.hp < 45 && P.food !== 'normal') set(() => PR.setFood(S, 'normal')); else if (P.hp > 72 && P.food !== 'eco') set(() => PR.setFood(S, 'eco')); }
      // «проедает всё», но не в бесконечный минус: в долгах — скромнее, из долгов — обратно к комфорту
      if (profile === 'spender') {
        if (P.cash < -30000 && P.food === 'cafe') set(() => PR.setFood(S, 'normal'));
        else if (P.cash < -60000 && P.home === 'flat') set(() => PR.setHome(S, 'room'));
        else if (P.cash > 40000 && P.food !== 'cafe') set(() => PR.setFood(S, 'cafe'));
        else if (P.cash > 80000 && P.home !== 'flat') set(() => PR.setHome(S, 'flat'));
      }
      if (pf.extra) { const want = P.hp > 55 ? Math.min(pf.extra, PR.maxExtra(P)) : 0; if (P.extra !== want) set(() => PR.setExtra(S, want)); }
      for (const id of pf.courses) if (!PR.studyWhy(P, id) && (id !== 'coffee' || P.flags.disc || P.m >= 6 || profile !== 'ideal')) { set(() => PR.startStudy(S, id)); break; }
      if (profile === 'ideal') { const f = P.mood < 38 ? 'some' : P.mood > 50 ? 'none' : P.fun; if (f !== P.fun) set(() => PR.setFun(S, f)); }
      let bought = 0;
      for (const [id, p] of Object.entries(pf.wants)) {
        if (P.m >= 48 && bought) break; // поздние годы летят — не больше одной покупки в месяц
        if (!PR.wantWhy(P, id) && R() < p) { set(() => PR.buyWant(S, id)); bought++; }
      }
      if (pf.depEvery && P.m % pf.depEvery === 0) {
        const buffer = PR.monthCost(P) * 1.5, v = P.box + Math.max(0, P.cash - buffer);
        if (v >= 20000) set(() => PR.toDep(S, v));
      }
      const g = PR.goal(P);
      if (g.ok && P.flags.goalLater) { PR.openOwn(S); continue; }
      // «Смена» по желанию: первые 2 года — с частотой профиля, дальше вдвое реже (приелась)
      const every = pf.shiftEvery * (P.m >= 48 ? 4 : P.m >= 24 ? 2 : 1);
      if (!PR.shiftWhy(P) && P.m % every === 0) { PR.shiftResult(S, PR.simShift(P, pf.q)); shifts++; sec += c().SHIFT_SEC + 10; T.shift += c().SHIFT_SEC + 10; }
    }
    const before = P.m;
    // месяц идёт: до карточки или до конца месяца
    const left = (1 - P.t) * PR.monthMs(P);
    const r = PR.advance(S, left + 1);
    if (r === 'card') { /* время до карточки */ }
    if (P.m > before || r === 'month') { const ms = PR.monthMs(Object.assign({}, P, { m: P.m - 1 })) / 1000; sec += ms; T.mon += ms; } // упрощённо: месяц целиком (карточки ставят на паузу, но не сокращают месяц)
    if (verbose && P.m > before && P.m % 3 === 0) console.log(`  m${P.m} job${P.job} sav ${Math.round(PR.savings(P) / 1000)}k hp ${Math.round(P.hp)} mood ${Math.round(P.mood)} rep ${Math.round(P.rep)} sk ${Math.round(P.sk.sales)}/${Math.round(P.sk.coffee)}/${Math.round(P.sk.people)} min ${(sec / 60).toFixed(1)}`);
  }
  const g = PR.goal(P), cr = P.status === 'won' ? PR.carry(P, { cash: BK.CFG.START_CASH }) : null, sm = PR.summary(P);
  return { T, seed, status: P.status, months: P.won ? P.won.m : P.m, min: sec / 60, sav: g.sav, job: P.job, credit: P.won ? P.won.credit : null, cards, shifts, sick: P.stats.sick, splurge: P.stats.splurge, fired: P.stats.fired,
    trait: cr ? cr.trait : PR.trait(P), bonus: cr ? cr.bonus : 0, skills: cr ? Object.keys(cr.skills).join('+') : '', baker: cr && cr.baker ? cr.baker.lvl : 0, fun: sm.fun, earned: sm.earned };
}

if (require.main === module) {
  const profiles = (process.argv[2] || 'ideal,normal,spender').split(',');
  const n = +(process.argv[3] || 8), verbose = process.argv.includes('--v');
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
  for (const pr of profiles) {
    const rows = [];
    for (let i = 0; i < n; i++) { if (verbose) console.log(`${pr} seed ${i + 1}`); rows.push(run(pr, i + 1, verbose)); }
    console.table(rows.map((r) => ({ seed: r.seed, итог: r.status === 'won' ? (r.credit ? 'точка+кредит' : 'своя точка') : r.status === 'life' ? 'жизнь в найме' : r.status, мес: r.months, мин: +r.min.toFixed(1), накоплено: Math.round(r.sav / 1000) + 'k', должн: r.job, окон: r.cards, смен: r.shifts, болел: r.sick, срывы: r.splurge, увол: r.fired, черта: r.trait || '', бонус: Math.round(r.bonus / 1000) + 'k', навыки: r.skills, пекарь: r.baker, 'соблазны%': Math.round(r.fun / Math.max(1, r.earned) * 100), 'мин: мес/окна/смены': [r.T.mon, r.T.card, r.T.shift].map((x) => (x / 60).toFixed(1)).join('/') })));
    const w = rows.filter((r) => r.status === 'won'), l = rows.filter((r) => r.status === 'life');
    console.log(`${pr}: своя точка ${w.length}/${n}${w.length ? `, медиана ${med(w.map((r) => r.months))} мес. / ${med(w.map((r) => r.min)).toFixed(1)} мин (${Math.min(...w.map((r) => r.min)).toFixed(1)}–${Math.max(...w.map((r) => r.min)).toFixed(1)})` : ''}; жизнь в найме ${l.length}/${n}${l.length ? `, медиана ${med(l.map((r) => r.min)).toFixed(1)} мин (${Math.min(...l.map((r) => r.min)).toFixed(1)}–${Math.max(...l.map((r) => r.min)).toFixed(1)})` : ''}`);
  }
}
module.exports = { run, PROF };
