// Боты стадии 1 «Своя кофейня»: node sim/stage1.js ideal,normal,weak [сидов] [--v]
// Состояние «пролог пройден» готовится как у игрока (накопления, навыки, развилки П7/П8), дальше бот играет кофейню до
// сцены 1.8 «Вторая вывеска» (переход в стадию 2) или до закрытия. Модель реального времени: день на ×1 (CFG.STAGE1.DAY_MS[1])
// + чтение окна-решения + изменение настроек. Печатает минуты, месяцы, вехи и стартовые условия стадии 2
// («деньги + стоимость точки» против старта основной игры). BK_CFG='{"STAGE1.DAY_MS":{"1":5000}}' — переопределить числа.
const BK = require('./load');
const E = BK.Engine, S1 = BK.Stage1, PR = BK.Prologue, c = () => BK.CFG.STAGE1;

const PROF = {
  // лучший расчёт места, часы по потоку района, цены под кошелёк, Гуля с первого дня, второй помощник по загрузке, обучение, ремонт
  ideal: { sav: [1500000, 1650000], mentor: 'friend', gulya: 'with', pick: 'best', hours: 'best', price: 'fit', hireAt: 0, hire2: 0.85, train: true, repair: true, dayOff: true, bake: 0, second: 0, scene: 'good', waitMin: 0 },
  // место из двух лучших, часы по умолчанию, цены как есть, Гуля — когда устал, без обучения
  normal: { sav: [1500000, 1600000], mentor: 'cold', gulya: 'with', pick: 'top2', hours: 'default', price: 'none', hireAt: 'tired', hire2: 1.05, train: false, repair: false, dayOff: false, bake: 1, second: 25, scene: 'first', waitMin: 0 },
  // «950 тыс. + кредит»: место у остановки (скромный кошелёк района), цены «премиум», сразу полный штат «чтобы не уставать» и зарплата выше рынка,
  // печёт с большим запасом, работает с 7 до 22
  weak: { sav: [950000, 1000000], credit: true, mentor: 'cold', gulya: 'rashid', pick: 'stop', hours: 'full', price: 'premium', hireAt: 'never', hire2: 9, overstaff: 2, payUp: 1.1, train: false, repair: false, dayOff: false, bake: 3, second: 40, scene: 'random', waitMin: 0 },
};
function botRand(seed) { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// «пролог пройден»: новая игра движка + пролог в статусе won с накоплениями профиля → перенос (как кнопка «Открыть свою кофейню»)
function prepared(seed, pf, R) {
  const S = E.newGame({ seed, rival: true });
  PR.start(S); const P = S.prologue;
  const sav = Math.round(pf.sav[0] + (pf.sav[1] - pf.sav[0]) * R());
  Object.assign(P, { status: 'won', m: 20 + Math.floor(R() * 8), cash: 30000, box: 0, dep: sav - 30000, depInt: 0, hp: 70 + Math.floor(R() * 15), stazh: 24, rep: 75, job: 2 });
  P.sk = { sales: 50 + R() * 15, coffee: 55 + R() * 15, people: 48 + R() * 12 };
  P.sf.mentor = pf.mentor; P.sf.gulya = pf.gulya; P.rel.gulya = pf.gulya === 'with' ? 25 : 5; P.rel.semyon = 12; P.rel.rashid = pf.mentor === 'friend' ? 30 : 5;
  P.won = { m: P.m, credit: !!pf.credit, sav, mentor: pf.mentor, gulya: pf.gulya };
  PR.syncStory(S);
  PR.applyCarry(S);
  S1.start(S);
  return S;
}
function pickSpot(S, pf, R) {
  const T = S.stage1, sc = T.spots.map((sp, i) => { const p = S1.spotPreview(S, sp), cost = S1.spotCost(S, sp); return { i, v: p.guests * p.check * 30 * 0.55 - sp.area * sp.rentM2, tr: sp.traffic, ok: cost.left > 250000 }; });
  const ok = sc.filter((x) => x.ok);
  const L = ok.length ? ok : sc;
  if (pf.pick === 'best') return L.sort((a, b) => b.v - a.v)[0].i;
  if (pf.pick === 'top2') { const s = L.slice().sort((a, b) => b.v - a.v); return s[Math.min(s.length - 1, R() < 0.5 ? 0 : 1)].i; }
  return Math.max(0, T.spots.findIndex((sp) => sp.kind === pf.pick));
}
function bestHours(S) {
  const T = S.stage1, st = S1.store(S), dp = E.daypartOf(st);
  let best = T.hours, bv = -1;
  for (const h of T.spot.hours) { const v = S1.hoursCover(dp, h) / Math.pow(c().HOURS[h].hp, 0.5); if (v > bv) { bv = v; best = h; } }
  return best;
}
function sceneChoice(S, cv, pf, R) {
  const can = cv.choices.map((x, i) => (x.can ? i : -1)).filter((i) => i >= 0);
  if (cv.choices.length === 1) return 0;
  if (pf.scene === 'random') return can[Math.floor(R() * can.length)];
  if (pf.scene === 'first') {
    if (cv.id === 's17') return 0; // «не продавайте, я помогу» — тёплый выбор, полгода помощи «Калачу»
    if (cv.id === 's15') return can[0];
    return can[0];
  }
  // good
  const pickId = { s11: 0, s12: 0, s13: 0, s14: 0, s16: 1 };
  if (cv.id === 's17') return S.cash > 1600000 ? 0 : 1; // помочь «Калачу» — только если деньги позволяют (иначе ломается серия прибыльных месяцев)
  if (cv.id === 's15') return can[0];
  if (pickId[cv.id] != null && cv.choices[pickId[cv.id]].can) return pickId[cv.id];
  // события: самый дешёвый доступный вариант, кроме «ждать» при поломке кофемашины
  if (cv.id === 'e_machine' && cv.choices[0].can) return 0;
  if (cv.id === 'e_road' && cv.choices[0].can) return 0;
  if (cv.id === 'e_raise') return 0;
  const cost = (i) => cv.choices[i].cost || 0;
  return can.slice().sort((a, b) => cost(a) - cost(b))[0];
}

function run(profile, seed, verbose) {
  const pf = PROF[profile], R = botRand(seed * 13 + 7);
  const S = prepared(seed * 7919 + 11, pf, R), T = S.stage1;
  let sec = c().BOT_PICK_SEC, cards = 0, sets = 0; const set = (r) => { if (r && r.ok !== false) { sets++; sec += c().BOT_SET_SEC; } };
  set(S1.pick(S, pickSpot(S, pf, R)));
  const st = S1.store(S);
  if (pf.hours === 'best') set(S1.setHours(S, bestHours(S)));
  if (pf.price === 'fit') { // цены под кошелёк района: средний чек ≈ платёжеспособности
    const ms = E.menuStats(S), B = ms.avgPrice * BK.CFG.ITEMS_PER_CHECK, Sv = st.solv * S.macro.priceLevel, k = Math.max(0.85, Math.min(1.1, Sv / B * 0.97));
    for (const it of S.menu) E.setPrice(S, it.id, k); set({});
  } else if (pf.price === 'premium') { for (const it of S.menu) E.setPrice(S, it.id, 1.2); set({}); }
  if (pf.bake) { E.setBake(S, pf.bake); set({}); }
  if (pf.dayOff) set(S1.setDayOff(S, true));
  if (pf.hours === 'full' && S.stage1.spot.hours.includes('full')) set(S1.setHours(S, 'full'));
  if (pf.payUp) { E.setPay(S, 'seller', S.market.seller * pf.payUp); set({}); }
  if (pf.overstaff) for (let k = 0; k < pf.overstaff && S.candidates.length && !S1.hireWhy(S); k++) set(S1.hire(S, S.candidates[0].id));
  let guard = 0, readyDay = null, loanTaken = false;
  while (guard++ < 800) {
    while (T.cards.length) { const cv = S1.card(S); if (cv.id === 'stuck' && process.env.BK_TALK) console.log('   [' + Math.round((S.day - T.openDay) / 30.4) + ' мес.] ' + cv.hero.name + ': ' + cv.text + (process.env.BK_TALK === '2' ? ' {' + JSON.stringify(S1.nextGoal(S)) + ' s17=' + T.seen.s17 + ' od=' + (S.day - T.openDay) + '}' : '')); const i = sceneChoice(S, cv, pf, R); S1.choose(S, i); cards++; sec += cv.choices.length > 1 ? c().BOT_CARD_SEC : c().BOT_INFO_SEC; }
    if (T.status === 'done' || T.status === 'failed') break;
    if (T.status === 'ready') {
      if (readyDay == null) readyDay = S.day;
      if (S.day - readyDay >= pf.second) { S1.openSecond(S); continue; }
    }
    // решения по ходу (раз в неделю)
    if (T.openDay != null && S.day % 7 === 0) {
      const a7 = S1.avg7(T), n = st.staff.length + st.incoming.length;
      if (pf.hireAt === 0 && S1.gulyaAvail(S) && !S1.hireWhy(S)) set(S1.inviteGulya(S));
      if (pf.hireAt === 'tired' && T.hp < 55 && !S1.hireWhy(S) && n < 2 + (T.hero ? -1 : 0) + 1) { if (S1.gulyaAvail(S)) set(S1.inviteGulya(S)); else if (S.candidates.length) set(S1.hire(S, S.candidates[0].id)); }
      if (a7.n >= 7 && a7.load > pf.hire2 && !S1.hireWhy(S) && S.cash > 250000 && S.candidates.length) set(S1.hire(S, S.candidates.slice().sort((a, b) => b.lvl - a.lvl)[0].id));
      if (pf.train && S.cash > 400000 && S.day - T.openDay < 120) for (const e of st.staff) if (!e.hero && e.lvl < 3 && S.day - e.since > 20) set(E.train(S, st.id, e.id));
      if (pf.repair && st.repair === 0 && S.cash > 450000 && S.day - T.openDay > 20 && S.day - T.openDay < 90) set(E.startRepair(S, st.id));
      if (profile === 'normal' && S.cash < 60000 && !loanTaken && !S1.loanWhy(S)) { set(S1.takeLoan(S, S1.loanRoom(S))); loanTaken = true; }
      if (profile === 'weak' && S.cash < 30000 && !loanTaken && !S1.loanWhy(S)) { set(S1.takeLoan(S, S1.loanRoom(S))); loanTaken = true; }
      if (profile === 'normal' && T.hp < 40 && !T.dayOff) set(S1.setDayOff(S, true));
    }
    E.tick(S);
  }
  const days = S.day, min = (sec + days * c().DAY_MS[1] / 1000) / 60;
  const nx = T.next;
  const out = { profile, seed, status: T.status, min: +min.toFixed(1), months: T.openDay != null ? +((S.day - T.openDay) / 30.4).toFixed(1) : 0, spot: T.spot.kind, ms: Object.keys(T.ms).length, cards, sets, sick: T.flags.sickN || 0,
    total: nx ? nx.total : null, cash: nx ? nx.cash : Math.round(S.cash), fund: nx ? nx.fund : 0, value: nx ? nx.value : 0, k: nx ? +(nx.total / nx.start).toFixed(3) : null, rating: +E.storeRating(S, st).toFixed(2), guests: Math.round(S1.avg7(T).checks), reg: Math.round(T.reg) };
  if (verbose) { for (const m of T.months) console.log('   ', m.y, m.m + 1, 'выручка', m.rev, 'прибыль', m.profit, 'гостей', m.guests, '★', m.rating, 'счёт', m.cash); }
  return out;
}

if (require.main === module) {
  const profs = (process.argv[2] || 'ideal,normal,weak').split(','), n = +process.argv[3] || 8, v = process.argv.includes('--v');
  for (const p of profs) {
    const rows = [];
    for (let i = 1; i <= n; i++) { const r = run(p, i, v); rows.push(r); console.log(`${p} #${i}: ${r.status === 'done' ? 'вторая вывеска' : r.status === 'failed' ? 'ЗАКРЫЛАСЬ' : r.status} · ${r.min} мин · ${r.months} мес. · ${r.spot} · вех ${r.ms} · сцен/событий ${r.cards} · болел ${r.sick} · ★${r.rating} · гостей ${r.guests} · пост. ${r.reg}${r.total ? ` · стадия 2: счёт ${(r.cash / 1e6).toFixed(2)} млн + точка ${(r.value / 1e6).toFixed(2)} = ${(r.total / 1e6).toFixed(2)} (×${r.k}), программа банка ${(r.fund / 1e6).toFixed(2)}` : ''}`); }
    const done = rows.filter((r) => r.status === 'done'), med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    console.log(`== ${p}: вторая вывеска ${done.length}/${rows.length}, закрылись ${rows.filter((r) => r.status === 'failed').length}; минут — медиана ${med(done.map((r) => r.min))} (${Math.min(...done.map((r) => r.min))}–${Math.max(...done.map((r) => r.min))}), месяцев — ${med(done.map((r) => r.months))}; «деньги + точка» ×${med(done.map((r) => r.k))} от старта`);
  }
}
module.exports = { run, prepared, PROF };
