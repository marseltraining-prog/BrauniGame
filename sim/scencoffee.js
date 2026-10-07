/* =====================================================================
   ИСТОРИЯ «ТОЛЬКО КОФЕЙНИ» (src/data/scen-coffee.js) — проверка правил, цели и темпа.

   Что проверяет:
     1. старт: все предложения — маленькие («кофейни»), путь «Кофейни» задан историей и
        не меняется ни выбором, ни «случайным путём»; чек истории в S.mods;
     2. аренда «чужого» формата невозможна (2б: история не выпадает, если на старте выбран другой путь): подложенное «Стандарт»/«Большая» режется
        в маленькую прямо перед арендой; «риелтор» тоже приносит только маленькие;
     3. рост вглубь: флагман не открывается и не показывается «следующим»;
     4. цель: reached → флаг, уведомление 'reached', done(); срок вышел без цели →
        'expired' и failed(); цель раньше срока → на сроке второго уведомления нет;
     5. сохранение: JSON-круг сохраняет правила (правило помещений и путь);
        обычная игра и старое сохранение без истории — без правил;
     6. сюжет включён: сцены cf* приходят (бот выбирает «по деньгам»);
     7. темп (сюжет выключен, как канонические прогоны): good — победа в коридоре 14–17 лет,
        медленнее обычной Уфы теми же сидами; avg — заметно медленнее good.

   Запуск: node sim/scencoffee.js [сидов=3] [лет good=20] [лет avg=26]
   Сиды — как в sim/scencity.js: seed = i × 7919.
   ===================================================================== */
process.env.BK_STORY = process.env.BK_STORY || '1';
const BK = require('./load');
const E = BK.Engine, SC = BK.Scenario, ST = BK.Story, CFG = BK.CFG;
const { play } = require('./bot');
const seeds = +(process.argv[2] || 3), yGood = +(process.argv[3] || 20), yAvg = +(process.argv[4] || 26);

let bad = 0;
const ok = (c, what, extra) => { if (!c) bad++; console.log(`  ${c ? '✓' : '✗'} ${what}${extra != null ? ' — ' + extra : ''}`); };
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

function fresh(seed) {
  const S = E.newGame({ seed: seed || 7919 });
  SC.set(S, 'coffee'); SC.applyStart(S);
  return S;
}

/* ---------- 1–2. старт и правило помещений ---------- */
console.log('\n# 1–2. Старт истории и правило помещений');
{
  const S = fresh(7919);
  ok(S.offers.length > 0 && S.offers.every((o) => o.size === 'small' && o.area >= 25 && o.area <= 45), 'все стартовые предложения — маленькие кофейни 25–45 м²', S.offers.map((o) => `${o.area} м²${o.cutFrom ? ' (было ' + o.cutFrom + ')' : ''}`).join(', '));
  ok(S.cash === CFG.START_CASH, 'старт 10 млн, как в обычной игре', BK.fmtMoney(S.cash));
  const inf = BK.Strat.info(S);
  ok(inf.id === 'coffee' && inf.chosen && inf.locked === 'coffee', 'путь «Кофейни» выбран и закреплён историей', JSON.stringify({ id: inf.id, locked: inf.locked }));
  BK.Strat.set(S, 'premium'); BK.Strat.setRandom(S); BK.Strat.set(S, null);
  ok(BK.Strat.info(S).id === 'coffee', 'выбор на старте, «случайный путь» и «пусть сложится» путь не меняют');
  ok(S.mods.some((m) => m.src === 'scen' && m.t === 'check' && m.m === 1.25), 'чек истории ×1,25 стоит в S.mods');
  ok(S.mods.filter((m) => m.src === 'strat').length === CFG.STRAT.PATHS.coffee.mods.length, 'модификаторы пути — из CFG.STRAT.PATHS.coffee (без дублей)');
  // подложить «чужое» помещение и арендовать
  E.chooseProduction(S, S.prodOffers[0].id);
  const big = Object.assign({}, S.offers[0], { id: 'oBig', size: 'large', area: 140, scenFit: 0, cutFrom: undefined });
  S.offers.push(big);
  const r = E.rentStore(S, 'oBig');
  ok(r.ok && r.store.size === 'small' && r.store.area <= 45, 'подложенная «Большая» арендуется только как маленькая кофейня', r.ok ? `${r.store.size}, ${r.store.area} м²` : r.msg);
  S.cash += 1e8;
  E.refreshOffers(S);
  ok(S.offers.every((o) => o.size === 'small'), 'подборка риелтора — тоже только маленькие', S.offers.map((o) => o.size).join(','));
}

/* ---------- 2б. выбор истории: явный другой путь важнее ---------- */
{
  const seedsN = Array.from({ length: 300 }, (_, i) => i * 37 + 1);
  const prem = seedsN.filter((x) => SC.pick(x, { city: 'ufa', strat: 'premium' }) === 'coffee').length;
  const own = seedsN.filter((x) => SC.pick(x, { city: 'ufa', strat: 'coffee' }) === 'coffee').length;
  const any = seedsN.filter((x) => SC.pick(x, { city: 'ufa' }) === 'coffee').length;
  ok(prem === 0 && own > 0 && any > 0, 'игроку, выбравшему другой путь, «Только кофейни» не выпадает; без выбора и с «Кофейнями» — выпадает', `premium ${prem}, coffee ${own}, без выбора ${any} из 300`);
}

/* ---------- 3. рост вглубь ---------- */
console.log('\n# 3. Рост вглубь без флагмана');
{
  const S = fresh(7919); S.phase = 'play';
  BK.Growth.ensure(S);
  ok(SC.blocks(S, 'flag') && !SC.blocks(S, 'cater'), 'история закрывает только флагман');
  const nx = BK.Growth.nextUnlock(S);
  ok(nx && nx.key === 'cater', 'первое направление — кейтеринг', nx && nx.key);
  S.growth.un.cater = 1;
  ok(BK.Growth.nextUnlock(S).key === 'factory', 'после кейтеринга «следующим» идёт фабрика, флагман пропущен', BK.Growth.nextUnlock(S).key);
  const U = E.newGame({ seed: 7919 }); BK.Growth.ensure(U); U.growth.un.cater = 1;
  ok(BK.Growth.nextUnlock(U).key === 'flag' && !SC.blocks(U, 'flag'), 'в обычной игре флагман на месте');
}

/* ---------- 4. цель, срок, провал ---------- */
console.log('\n# 4. Цель и срок');
{
  const d = SC.info('coffee');
  ok(d.days === 2920, 'срок истории — 8 лет', d.days + ' дн.');
  // цель не выполнена к сроку
  const S = fresh(7919); S.phase = 'play'; S.notify = [];
  S.day = 2921; SC.day(S);
  ok(SC.failed(S) && S.notify.some((n) => n.type === 'scen' && n.phase === 'expired'), 'срок вышел без цели — провал и окно «История не сложилась»');
  ok(SC.finish(S).ok === false, 'провал не засчитан');
  // цель выполнена раньше срока
  const S2 = fresh(7919); S2.phase = 'play'; S2.notify = [];
  const keepR = E.rolling12; E.rolling12 = () => 2e9;
  S2.stores = Array.from({ length: 30 }, (_, i) => ({ id: 's' + i, status: 'open', size: 'small' }));
  S2.day = 1500; SC.day(S2);
  E.rolling12 = keepR;
  const st2 = SC.state(S2);
  ok(st2.flags.reached === 1500 && S2.notify.some((n) => n.phase === 'reached'), '30 кофеен и 1,5 млрд — цель отмечена сразу (phase reached)');
  ok(d.done(S2, st2) === true && SC.finish(S2).ok === true, 'выполненная цель засчитывается');
  S2.notify = []; S2.day = 2921; SC.day(S2);
  ok(!SC.failed(S2) && !S2.notify.length, 'на сроке после выполненной цели — ни провала, ни второго уведомления');
  const S3 = fresh(7919); S3.phase = 'play';
  S3.stores = Array.from({ length: 30 }, (_, i) => ({ id: 's' + i, status: 'open' }));
  S3.day = 400; SC.day(S3);
  ok(!SC.state(S3).flags.reached, 'без оборота 1,5 млрд одних точек мало');
}

/* ---------- 5. сохранение ---------- */
console.log('\n# 5. Сохранение');
{
  const S = fresh(4242); S.phase = 'play';
  const N = JSON.parse(JSON.stringify(S));
  N.offers.push({ id: 'oX', district: N.offers[0].district, size: 'standard', area: 80, rentM2: 1000, x: 1, y: 1, address: 't', landmarks: [], comp: 1, payMode: 'month', traffic: 5000, solv: 300, expires: 999 });
  SC.fitOffers(N);
  ok(N.offers.every((o) => o.size === 'small') && BK.Strat.info(N).locked === 'coffee', 'после загрузки правило помещений и путь действуют');
  const U = JSON.parse(JSON.stringify(E.newGame({ seed: 4242 })));
  U.offers.push({ id: 'oX', size: 'large', area: 120 });
  ok(SC.fitOffers(U) === 0 && U.offers.some((o) => o.size === 'large'), 'обычная игра и старые сохранения без истории — помещения не режутся');
  ok(!U.strat || !U.strat.lock, 'у старых сохранений пути-замка нет');
}

/* ---------- 6. сюжет: сцены истории ---------- */
const origNew = E.newGame;
const patch = (scen) => { E.newGame = function (o) { const S = origNew.call(this, o); if (scen) { SC.set(S, scen); SC.applyStart(S); } return S; }; };
function scenPick(S, sc) {
  // как в sim/scencity.js: по деньгам, но без концовок, долей и продажи сети
  const val = (ch) => {
    let v = 0;
    for (const fx of (ch.effects || [])) {
      if (fx.t === 'cash' && fx.v) v += fx.v;
      if (fx.t === 'share') v -= 30e6;
      if (fx.t === 'ending') v -= 50e6;
      if (fx.t === 'flag' && fx.k === 'ufa' && fx.v === 'sold') v -= 50e6;
      if (fx.t === 'staffQuit') v -= 1e6 * (fx.n || 1);
    }
    return v - (typeof ch.cost === 'number' ? ch.cost : 0);
  };
  const order = (sc.choices || []).map((c, i) => ({ i, v: val(c) })).sort((a, b) => b.v - a.v).map((x) => x.i);
  for (const i of order) { const r = ST.resolve(S, i); if (r && r.ok) return r; }
  return null;
}
console.log('\n# 6. Сюжет включён: сцены cf* приходят (good, 1 сид, 12 лет)');
{
  patch('coffee');
  const keep = CFG.STORY.ON; CFG.STORY.ON = true;
  const seen = [];
  let reached = null;
  play({ level: 'good', seed: 7919, years: 12, onDay: (S) => {
    const R = ST.state(S); if (R && R.pending) { const sc = ST.pendingScene(S); if (sc) { seen.push(sc.id); scenPick(S, sc); } }
    const st = SC.state(S); if (reached == null && st && st.flags && st.flags.reached) reached = +(st.flags.reached / 365).toFixed(1);
  } });
  CFG.STORY.ON = keep;
  const cf = seen.filter((id) => /^cf/.test(id));
  console.log(`    сцены истории: ${cf.join(' ')}; цель истории — ${reached != null ? reached + '-й год' : 'нет'}`);
  ok(cf.length >= 7, `сцены истории приходят (${cf.length})`, cf.join(' '));
  ok(cf.indexOf('cf7a') >= 0 || cf.indexOf('cf7b') >= 0, 'развязка «Тридцатая кофейня» пришла');
  ok(reached != null && reached <= 8, 'цель истории выполнена за 8 лет (сюжет включён)', reached);
}

/* ---------- 7. темп ---------- */
CFG.STORY.ON = false;
function pass(level, scen, years) {
  patch(scen);
  const rows = [];
  for (let i = 1; i <= seeds; i++) {
    let reached = null, st5 = null;
    const r = play({ level, seed: i * 7919, years, onDay: (S) => {
      const st = SC.state(S); if (reached == null && st && st.flags && st.flags.reached) reached = +(st.flags.reached / 365).toFixed(1);
      if (S.day === 5 * 365) st5 = S.stores.length;
    } });
    const S = r.S;
    rows.push({ won: r.won ? r.won.year : null, lost: r.lostYear, reached, st5, sizes: [...new Set(S.stores.map((s) => s.size))].join('/'), flag: !!(S.growth && S.growth.flag) });
    const x = rows[rows.length - 1];
    console.log(`  ${level} ${scen || 'Уфа'} сид ${i}: ${x.won ? 'победа на ' + x.won + '-м году' : x.lost ? 'банкротство на ' + x.lost : 'без победы за ' + years + ' лет'}`
      + (scen ? `, цель истории — ${x.reached != null ? x.reached + '-й год' : 'нет'}, точки: ${x.sizes}, флагман: ${x.flag ? 'есть' : 'нет'}` : '') + `, точек на 5-м году ${x.st5}`);
  }
  const wins = rows.map((x) => x.won).filter((x) => x != null);
  return { rows, wins, med: med(wins), reachedMed: med(rows.map((x) => x.reached)) };
}
console.log(`\n# 7. Темп (сюжет выключен, ${seeds} сида)`);
const G = pass('good', 'coffee', yGood);
const U = pass('good', null, yGood);
const A = pass('avg', 'coffee', yAvg);
console.log(`  == good «Только кофейни»: побед ${G.wins.length}/${seeds}, медиана ${G.med}; цель истории — медиана ${G.reachedMed}-й год`);
console.log(`  == good обычная Уфа:     побед ${U.wins.length}/${seeds}, медиана ${U.med}`);
console.log(`  == avg «Только кофейни»: побед ${A.wins.length}/${seeds}, медиана ${A.med || '—'}; цель истории к сроку — ${A.rows.filter((x) => x.reached != null && x.reached <= 8).length}/${seeds}`);
ok(G.rows.every((x) => x.sizes === 'small' && !x.flag), 'у бота все точки маленькие, флагмана нет');
ok(G.wins.length === seeds && G.med >= 14 && G.med <= 17, 'good побеждает в коридоре историй (14–17 лет)', `${G.med}`);
ok(U.med != null && G.med > U.med, 'история медленнее обычной Уфы', `${G.med} против ${U.med}`);
ok(G.rows.every((x) => x.reached != null && x.reached <= 8), 'good выполняет цель истории к сроку', G.rows.map((x) => x.reached).join(' / '));
ok(A.wins.length < seeds || A.med > G.med + 3, 'avg заметно медленнее good', `${A.wins.length}/${seeds}, медиана ${A.med || '—'}`);

E.newGame = origNew;
console.log(bad ? `\n✗ проверок не прошло: ${bad}` : '\n✓ «Только кофейни»: все проверки прошли');
process.exit(bad ? 1 : 0);
