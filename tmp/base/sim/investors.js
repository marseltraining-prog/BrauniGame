/* Инвесторы (ROADMAP, этап 2): проверка механики и влияния на баланс.
   node sim/investors.js             — механика: приход после 10 точек, торг, сделка, выплаты 1-го числа, выкуп, польза для дела
   node sim/investors.js good 6 22   — сильный бот, принимающий ВСЕ предложения: год победы против обычного

   В обычных прогонах ботов инвесторы выключены (sim/load.js ставит INV.ON=false), поэтому канонические
   прогоны не меняются; здесь они включаются самим файлом. */
process.env.BK_INV = process.env.BK_INV || '1';
if (process.env.BK_INV) delete require.cache[require.resolve('./load')];
const BK = require('./load');
if (!BK.Inv) { delete require.cache[require.resolve('../src/investors.js')]; require('../src/investors.js'); }
const E = BK.Engine, IV = BK.Inv, CFG = BK.CFG;

let bad = 0;
const ok = (cond, what, extra) => { if (!cond) { bad++; console.log('  ✗ ' + what + (extra ? ' — ' + extra : '')); } else console.log('  ✓ ' + what); };
const { play, PROFILES } = require('./bot');

function grown(years, seed) { // состояние с сетью 10+ точек
  const r = play({ level: 'good', seed: seed || 7919, years: years || 6 });
  const S = r.S; S.phase = 'play';
  return S;
}

/* ---------- 1. механика ---------- */
function mechanics() {
  console.log('\n# Механика инвесторов');
  const S = grown(6);
  const stores = S.stores.filter((s) => s.status !== 'opening').length;
  ok(stores >= CFG.INV.UNLOCK_STORES, `сеть доросла до ${CFG.INV.UNLOCK_STORES} точек`, `точек ${stores}`);
  // в молодой сети (меньше UNLOCK_STORES точек) состояние даже с включёнными инвесторами не создаётся
  const young = play({ level: 'good', seed: 7919, years: 1 }).S; young.phase = 'play';
  const yStores = young.stores.filter((x) => x.status !== 'opening').length;
  IV.day(young);
  ok(yStores < CFG.INV.UNLOCK_STORES && !young.inv, `в сети из ${yStores} точек инвесторы не приходят и состояние не создаётся`);

  // приход инвестора
  const R = IV.ensure(S);
  R.nextDay = S.day;
  IV.day(S);
  const offer = IV.state(S).offer;
  ok(!!offer, 'инвестор пришёл', offer ? offer.name : 'нет');
  ok(offer.sum >= CFG.INV.SUM[0] * S.macro.priceLevel * 0.5 && offer.sum <= CFG.INV.SUM[1] * S.macro.priceLevel * 2.5, 'сумма в разумных пределах', Math.round(offer.sum / 1e6) + ' млн');
  ok(offer.pct > 0 && offer.pct < 0.5, 'доля в разумных пределах', (offer.pct * 100).toFixed(1) + ' %');
  ok(!!CFG.INV.PERKS.find((p) => p.id === offer.perk), 'у инвестора есть польза для дела', offer.perk);

  // торг
  const before = { sum: offer.sum, pct: offer.pct, rounds: offer.rounds, kind: offer.kind };
  const r1 = IV.negotiate(S, 'more');
  const a1 = IV.state(S).offer;
  ok(a1 ? a1.rounds === before.rounds - 1 : true, 'раунд торга израсходован', a1 ? `осталось ${a1.rounds}` : 'ушёл');
  if (a1) ok(a1.sum >= before.sum, '«больше денег» не уменьшает сумму', Math.round(a1.sum / 1e6) + ' млн');
  if (a1) {
    const r2 = IV.negotiate(S, 'less');
    const a2 = IV.state(S).offer;
    if (a2) ok(a2.pct <= a1.pct, '«меньше процент» не увеличивает долю', (a2.pct * 100).toFixed(1) + ' %');
    else ok(true, 'инвестор отказал и ушёл — допустимо');
  }
  // доводим торг до ухода или принимаем
  let guard = 0;
  while (IV.state(S).offer && IV.state(S).offer.rounds >= 0 && guard++ < 8) IV.negotiate(S, 'less');
  const after = IV.state(S).offer;
  if (after) { ok(after.rounds < 0, 'терпение ограничено', `раундов ${after.rounds}`); IV.decline(S); }
  ok(!IV.state(S).offer, 'предложение закрывается (ушёл или отказали)');

  // новая сделка: принимаем
  const S2 = grown(6);
  const R2 = IV.ensure(S2); R2.nextDay = S2.day; IV.day(S2);
  const o2 = IV.state(S2).offer;
  const cash0 = S2.cash;
  const acc = IV.accept(S2);
  ok(acc.ok && S2.cash === cash0 + o2.sum, 'деньги пришли на счёт', Math.round(o2.sum / 1e6) + ' млн');
  ok(IV.status(S2).n === 1, 'сделка в списке');
  ok(IV.perkOf(S2, o2.perk), 'польза инвестора работает', o2.perk);

  // польза «казначейство»: лимит больше и ставка ниже
  const S3 = grown(6);
  const baseLim = E.loanLimit(S3), baseRate = E.loanRate(S3);
  const R3 = IV.ensure(S3);
  R3.deals.push({ id: 'x', name: 'Тест', firm: 'фонд', kind: 'revenue', pct: 0.03, sum: 100e6, perk: 'bank', since: S3.day });
  ok(E.loanLimit(S3) > baseLim, '«казначейство»: лимит кредита больше', `${Math.round(baseLim / 1e6)} → ${Math.round(E.loanLimit(S3) / 1e6)} млн`);
  ok(E.loanRate(S3) < baseRate, '«казначейство»: ставка ниже', `${(baseRate * 100).toFixed(1)} → ${(E.loanRate(S3) * 100).toFixed(1)} %`);

  // польза «бренд»: модификатор гостей
  const S4 = grown(6);
  const R4 = IV.ensure(S4);
  R4.deals.push({ id: 'y', name: 'Тест', firm: 'фонд', kind: 'revenue', pct: 0.03, sum: 100e6, perk: 'brand', since: S4.day });
  IV.syncMods(S4);
  ok((S4.mods || []).some((m) => m.src === 'inv' && m.t === 'traffic'), '«бренд»: +гостей сети через модификатор');

  // польза «связи»: помещения приходят чаще
  const S5 = grown(6), S6 = grown(6);
  IV.ensure(S5).deals.push({ id: 'z', name: 'Тест', firm: 'фонд', kind: 'revenue', pct: 0.03, sum: 100e6, perk: 'offers', since: S5.day });
  ok(IV.perkOf(S5, 'offers') && !IV.perkOf(S6, 'offers'), '«связи в ритейле»: польза видна движку');

  // выплаты 1-го числа
  const S7 = grown(6);
  const R7 = IV.ensure(S7); R7.deals.push({ id: 'w', name: 'Тест', firm: 'фонд', kind: 'profit', pct: 0.1, sum: 100e6, perk: 'brand', since: S7.day });
  const profit = Math.max(0, S7.history[S7.history.length - 1].profit);
  const cash1 = S7.cash;
  S7.month.inv = 0;
  const paid = IV.monthly(S7);
  ok(paid > 0, 'выплата партнёру посчитана', Math.round(paid / 1e6) + ' млн');
  ok(Math.abs(paid - profit * 0.1) < profit * 0.02, 'выплата ≈ доля от прибыли месяца', `${Math.round(paid / 1e6)} против ${Math.round(profit * 0.1 / 1e6)} млн`);
  ok(Math.abs(S7.cash - (cash1 - paid)) < 2, 'деньги списаны со счёта');
  ok((S7.month.inv || 0) > 0, 'выплата попала в статью месяца (в отчёте «Партнёрам»)');

  // выкуп доли
  const d = IV.list(S7)[0];
  ok(d.buyout > d.sum, 'выкуп дороже вложенного', `${Math.round(d.sum / 1e6)} → ${Math.round(d.buyout / 1e6)} млн`);
  S7.cash = d.buyout + 1e6;
  const b = IV.buyout(S7, d.id);
  ok(b.ok && IV.status(S7).n === 0, 'доля выкуплена, сделка закрыта');
  ok(!IV.perkOf(S7, 'brand') || !(S7.mods || []).some((m) => m.src === 'inv'), 'польза снята вместе с долей');

  // при большой доле новые не приходят
  const S8 = grown(6);
  const R8 = IV.ensure(S8);
  R8.deals.push({ id: 'q', name: 'Тест', firm: 'фонд', kind: 'profit', pct: 0.6, sum: 100e6, perk: 'brand', since: S8.day });
  ok(!IV.eligible(S8), 'при опасной доле партнёров новые инвесторы не приходят', `доля ${Math.round(IV.drainShare(S8) * 100)} %`);

  // выключенные инвесторы: состояние не создаётся
  const S9 = grown(6); delete S9.inv;
  const off = CFG.INV.ON; CFG.INV.ON = false;
  IV.day(S9);
  ok(!S9.inv, 'с выключенными инвесторами S.inv не создаётся');
  CFG.INV.ON = off;
}

/* ---------- 2. баланс ---------- */
function balance(level, seeds, years) {
  console.log(`\n# Баланс: ${level}, принимает ВСЕ предложения инвесторов, ${seeds} сид(ов) × ${years} лет`);
  const rows = [];
  for (let s = 1; s <= seeds; s++) {
    const seed = s * 7919;
    const origTick = EE_tick();
    const r = play({ level, seed, years });
    const S = r.S, st = IV.status(S);
    rows.push({
      сид: s, 'год победы': r.won ? r.won.year : null, банкрот: r.lost ? +(S.day / 365).toFixed(1) : null,
      точек: S.stores.filter((x) => x.status !== 'opening').length,
      сделок: st.n, 'привлечено, млн': Math.round(st.invest / 1e6),
      'выплаты, млн/мес': Math.round(st.pay / 1e6), 'доля прибыли %': Math.round(st.share * 100),
    });
  }
  console.table(rows);
  const wins = rows.map((x) => x['год победы']).filter((x) => x != null).sort((a, b) => a - b);
  const med = wins.length ? wins[Math.floor(wins.length / 2)] : null;
  console.log(`побед ${wins.length}/${rows.length}, медиана года победы — ${med == null ? '—' : med}`);
  console.log('эталон без инвесторов: good 3 18 — 3/3, медиана 14,9; good 12 22 — медиана 14,8');
}

// бот принимает любое предложение инвестора — так проверяем самую «щедрую» стратегию
function EE_tick() {
  const Eng = BK.Engine;
  if (!Eng.__invBot) {
    Eng.__invBot = true;
    const ot = Eng.tick;
    Eng.tick = function (S) {
      const r = ot.apply(this, arguments);
      try { const R = IV.state(S); if (R && R.offer) IV.accept(S); } catch (e) {}
      return r;
    };
  }
  return Eng.tick;
}

const pos = process.argv.slice(2);
if (!pos.length) mechanics();
else balance(pos[0] || 'good', +(pos[1] || 6), +(pos[2] || 22));
console.log(bad ? `\nПРОБЛЕМ: ${bad}` : '\nМеханика в порядке.');
process.exitCode = bad ? 1 : 0;
