/* =====================================================================
   ГОРОД СТАРТА ИСТОРИИ (PLAN.md «Задачи по каркасу», п. 1 и 2) — проверка.

   Что проверяет:
     1. партия со сценарием «Старт в Москве» идёт в МОСКВЕ: BK.CITY, районы предложений (moscow*),
        аренда/чек/площадь отличаются от Уфы, стартовые деньги истории;
     2. партия БЕЗ истории — прежняя Уфа (город, районы, числа);
     3. сохранение московской партии открывается в Москве (JSON + BK.Corp.ensure, как migrate
        в src/ui/app.js), а старое сохранение без поля S.startCity — в Уфе, как раньше
        (в т. ч. старое сохранение «Старта в Москве», которое до правки каркаса игралось в Уфе);
     4. рост вглубь (BK.Growth) в Москве не падает: фабрика и флагман получают площадки из районов
        активной карты (в старой сборке здесь был TypeError в genFlagSites/genFacSites);
     5. сцены истории mos1…mos8 приходят, а рост вглубь работает (сюжет включён, выбор в сцене — по деньгам);
     6. темп и числа: та же партия без истории (Уфа) — аренда/чек/поток, год победы. Темп считается
        с ВЫКЛЮЧЕННЫМ сюжетом (как канонические прогоны sim/bot.js), чтобы числа были сравнимы с шапкой
        src/data/scen-moscow.js; сюжет включается только в проходе 5.

   Запуск: node sim/scencity.js [лет=20] [сидов=3]
   Селектор сидов — как в sim/bot.js: seed = i × 7919.
   ===================================================================== */
process.env.BK_STORY = process.env.BK_STORY || '1'; // сюжет включён: проверяем, что сцены истории приходят
const BK = require('./load');
const E = BK.Engine;
const SC = BK.Scenario, ST = BK.Story, CFG = BK.CFG;
const years = +(process.argv[2] || 20), seeds = +(process.argv[3] || 3); // 20 лет — чтобы победа в целевом коридоре 14–16 успела случиться
const { play } = require('./bot');

let bad = 0;
const ok = (c, what, extra) => { if (!c) bad++; console.log(`  ${c ? '✓' : '✗'} ${what}${extra != null ? ' — ' + extra : ''}`); };
const med = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const r0 = (v) => (v == null ? null : Math.round(v));
const uniq = (a) => [...new Set(a.filter(Boolean))];
const dOf = (id) => (BK.DISTRICTS || []).find((x) => x.id === id);
const dname = (id) => { const d = dOf(id); return d ? d.name : '?'; };
const dnames = (ids) => uniq(ids.map(dname)).join(', ');
const archOf = (id) => { const d = dOf(id); return (d && d.arch) || '—'; };
const onMap = (a) => a.every((o) => !o || !o.district || !!dOf(o.district));

/* ---------------- создание игры, как в src/ui/app.js ---------------- */
const origNew = E.newGame;
let fixed = null;
// В новой сборке город и история известны движку ДО генерации предложений (opts.city + S.startCity).
// В старой — города в newGame нет, поэтому город ставится после (имитация прежнего поведения).
function patchNew(city, scen) {
  E.newGame = function (opts) {
    const o = Object.assign({}, opts || {});
    if (city) o.city = city;
    const S = origNew.call(this, o);
    if (fixed == null) fixed = ('startCity' in S);
    if (!fixed && city && BK.useCity) BK.useCity(city, S.seed); // старая сборка: город после предложений
    if (scen) { SC.set(S, scen); SC.applyStart(S); }
    return S;
  };
}
const restoreNew = () => { E.newGame = origNew; };

function snapshot(S) {
  const off = (S.offers || []).concat(S.prodOffers || []);
  return {
    city: (BK.CITY && BK.CITY.id) || '?', name: (BK.CITY && BK.CITY.name) || '?',
    inc: BK.CITY && BK.CITY.inc, rentK: BK.CITY && BK.CITY.rent, wage: BK.CITY && BK.CITY.wage,
    sellerMarket: S.market && S.market.seller, bakerMarket: S.market && S.market.baker,
    startCity: S.startCity === undefined ? '(нет поля)' : String(S.startCity),
    scen: (S.scen && S.scen.id) || '—', cash: r0(S.cash),
    n: off.length, districts: dnames(off.map((o) => o.district)), ok: onMap(off),
    rent: r0(med(off.map((o) => o.rentM2))), solv: r0(med(off.map((o) => o.solv))),
    area: r0(med(off.map((o) => o.area))), traffic: r0(med(off.map((o) => o.traffic))),
  };
}
const head = (s) => `город ${s.name} (BK.CITY=${s.city}), история ${s.scen}, S.startCity=${s.startCity}`;
const line = (s) => `предложений ${s.n}, районы: ${s.districts || '—'}`;
const money = (s) => `аренда медиана ${s.rent} ₽/м², чек района ${s.solv} ₽, площадь ${s.area} м², поток ${s.traffic} чел/день, счёт ${BK.fmtMoney(s.cash)}`;

/* ---------------- 1–2. старт: Москва против Уфы ---------------- */
function starts() {
  console.log('\n# 1–2. Город на старте истории');
  const fixTxt = () => (fixed ? 'город передаётся в newGame (opts.city), поле S.startCity есть' : 'СТАРАЯ сборка: город ставится после newGame');
  patchNew('moscow', 'moscow');
  const mos = snapshot(E.newGame({ seed: 7919 }));
  patchNew(null, null);
  const ufa = snapshot(E.newGame({ seed: 1234 }));
  restoreNew();
  console.log('  фикс: ' + fixTxt());
  console.log('  Москва: ' + head(mos));
  console.log('    ' + line(mos));
  console.log('    ' + money(mos));
  console.log('  Уфа:    ' + head(ufa));
  console.log('    ' + line(ufa));
  console.log('    ' + money(ufa));
  ok(mos.city === 'moscow', 'сценарий «Старт в Москве» начинается в Москве', head(mos));
  ok(mos.ok && mos.districts.indexOf('?') < 0, 'районы предложений — московские (все есть в карте Москвы)', mos.districts);
  ok(ufa.city === 'ufa' && ufa.ok, 'обычная игра без истории — Уфа, как раньше', head(ufa));
  ok(mos.inc === 1.8 && mos.rentK === 3 && mos.wage === 1.7,
    'коэффициенты Москвы inc/rent/wage переданы в движок', `${mos.inc}/${mos.rentK}/${mos.wage}`);
  ok(ufa.inc === 1 && ufa.rentK === 1 && ufa.wage === 1,
    'базовые коэффициенты Уфы не изменились', `${ufa.inc}/${ufa.rentK}/${ufa.wage}`);
  ok(mos.sellerMarket === Math.round(CFG.MARKET_SALARY_SELLER * 1.7)
    && mos.bakerMarket === Math.round(CFG.MARKET_SALARY_BAKER * 1.7),
  'зарплатный рынок Москвы учитывает wage=1,70', `${mos.sellerMarket}/${mos.bakerMarket}`);
  ok(ufa.sellerMarket === CFG.MARKET_SALARY_SELLER && ufa.bakerMarket === CFG.MARKET_SALARY_BAKER,
    'зарплатный рынок Уфы остался базовым', `${ufa.sellerMarket}/${ufa.bakerMarket}`);
  ok(mos.rent > ufa.rent * 2, 'аренда в Москве заметно выше уфимской', `${mos.rent} против ${ufa.rent} ₽/м² (×${(mos.rent / ufa.rent).toFixed(2)})`);
  ok(mos.solv > ufa.solv * 1.3, 'платёжеспособность районов выше (выше чек)', `${mos.solv} против ${ufa.solv} ₽ (×${(mos.solv / ufa.solv).toFixed(2)})`);
  ok(mos.cash === 10500000, 'стартовые деньги истории «всё, что было»', BK.fmtMoney(mos.cash));
  return { mos, ufa };
}

/* ---------------- 3. сохранение и загрузка ---------------- */
function saveLoad() {
  console.log('\n# 3. Сохранение: тот же город после загрузки');
  const viaSave = (S) => { const N = JSON.parse(JSON.stringify(S)); N.notify = []; BK.Corp.ensure(N); return N; };
  patchNew('moscow', 'moscow');
  const S = E.newGame({ seed: 4242 });
  restoreNew();
  const cityAtSave = BK.CITY.id;
  const N = viaSave(S);
  ok(BK.CITY.id === 'moscow' && cityAtSave === 'moscow', 'сохранение московской партии открывается в Москве', `BK.CITY=${BK.CITY.id}`);
  ok(onMap((N.offers || []).concat(N.prodOffers || [])), 'районы загруженного состояния есть в карте Москвы');

  // старое сохранение обычной игры: поля S.startCity до правки не было вовсе
  const old = JSON.parse(JSON.stringify(S));
  delete old.startCity; old.scen = null;
  old.offers = [{ id: 'o1', district: 'grove', rentM2: 1500, solv: 300, area: 120, traffic: 5000, size: 'standard', x: 400, y: 400, address: 'ул. Тест, 1', landmarks: [], comp: 0.9, payMode: 'month', expires: 99 }];
  viaSave(old);
  ok(BK.CITY.id === 'ufa', 'старое сохранение (нет S.startCity) открывается в Уфе, как раньше', `BK.CITY=${BK.CITY.id}`);

  // старое сохранение «Старта в Москве»: история записана, а мир — уфимский (так было до правки каркаса)
  const oldMos = JSON.parse(JSON.stringify(old));
  oldMos.scen = { v: 1, id: 'moscow', at: 0, flags: {} };
  viaSave(oldMos);
  ok(BK.CITY.id === 'ufa', 'старое сохранение «Старта в Москве» (мир собран под Уфу) не ломается — остаётся в Уфе', `BK.CITY=${BK.CITY.id}`);

  // новое состояние, у которого поля нет, но мир — московский (страховка по районам)
  const newMos = JSON.parse(JSON.stringify(S));
  delete newMos.startCity;
  viaSave(newMos);
  ok(BK.CITY.id === 'moscow', 'состояние с московским миром и историей, но без поля — тоже Москва', `BK.CITY=${BK.CITY.id}`);
}

/* ---------------- 4. второй акт: домашний город партии ---------------- */
function russiaHome() {
  console.log('\n# 4. Второй акт: домашний город московской партии — Москва, чужой город — Казань');
  patchNew('moscow', 'moscow');
  const S = E.newGame({ seed: 7919 });
  restoreNew();
  S.phase = 'play'; S.cumRevenue = 2e10; delete S.corp;
  BK.Corp.check(S);
  const hasCorp = !!S.corp;
  BK.Corp.applyGlobals(S);
  const home = BK.CITY.id;
  S.corp.active = 'kazan';
  S.corp.cities.kazan = { id: 'kazan', name: 'Казань', seed: 7, mapGen: 1, packed: null, hist: [], mAcc: { rev: 0, profit: 0, agg: 0 } };
  BK.Corp.applyGlobals(S);
  const away = BK.CITY.id;
  S.corp.active = 'ufa';
  BK.Corp.applyGlobals(S);
  const back = BK.CITY.id;
  // и внутри упакованного домашнего города (withCity — так его считает агрегированный месяц)
  S.corp.cities.ufa.packed = { stores: [], productions: [], offersSpecial: [], rival: null, office: null, fcPct: 1 };
  const inside = BK.Corp.withCity(S, 'ufa', () => (BK.CITY && BK.CITY.id) || '?');
  console.log(`  Россия открыта: ${hasCorp}; дома — ${home}, в Казани — ${away}, вернулись — ${back}, внутри упакованного дома — ${inside}`);
  ok(hasCorp && home === 'moscow' && away === 'kazan' && back === 'moscow' && inside === 'moscow',
    'второй акт держит московскую карту дома (в т. ч. внутри упакованного города) и казанскую — в Казани', `${home} → ${away} → ${back}/${inside}`);
}

/* ---------------- 4–6. партия ботом: рост вглубь, сцены, числа ---------------- */
// выбор в сцене «по деньгам, но без распродажи будущего»: кэш в плюс, доли/концовки/увольнения — в минус,
// недоступные варианты (need) отсеиваются через ST.resolve
function scenPick(S, sc) {
  const val = (ch) => {
    let v = 0;
    for (const fx of (ch.effects || [])) {
      if (fx.t === 'cash' && fx.v) v += fx.v;
      if (fx.t === 'share') v -= 30e6;
      if (fx.t === 'ending') v -= 50e6;
      if (fx.t === 'flag' && fx.k === 'ufa' && fx.v === 'sold') v -= 50e6;
      if (fx.t === 'staffQuit') v -= 1e6 * (fx.n || 1);
      if (fx.t === 'loyalty' && fx.add < 0) v += fx.add * 0.1e6;
    }
    if (typeof ch.cost === 'number') v -= ch.cost;
    return v;
  };
  const order = (sc.choices || []).map((c, i) => ({ i, v: val(c) })).sort((a, b) => b.v - a.v).map((x) => x.i);
  for (const i of order) { const r = ST.resolve(S, i); if (r && r.ok) return r; }
  return { ok: false };
}
function run(level, seed, city, scen, storyOn) {
  patchNew(city, scen);
  const keepStory = CFG.STORY.ON;
  CFG.STORY.ON = !!storyOn;
  const seen = [], yrows = {};
  let cityEnd = null;
  const r = play({
    level, seed, years,
    onDay: (S) => {
      cityEnd = (BK.CITY && BK.CITY.id) || null;
      if (storyOn && ST) { const R = ST.state(S); if (R && R.pending) { const sc = ST.pendingScene(S); if (sc) { seen.push(sc.id); scenPick(S, sc); } } }
      const t = E.dateOf(S.day);
      if (t.m === 0 && t.d === 2 && S.history.length) { // раз в год, как строки sim/bot.js
        const h = S.history[S.history.length - 1], ck = (h.pnl && h.pnl.checks) || 0;
        yrows[t.y - CFG.START_YEAR] = {
          rev: r0(h.rev), chk: ck ? r0(h.rev / ck) : null, guests: ck ? +(ck / 30.4).toFixed(0) : null,
          stores: h.stores, rentShare: h.rev ? +(h.pnl.rent / h.rev * 100).toFixed(1) : null, profit: r0(h.profit),
        };
      }
    },
  });
  CFG.STORY.ON = keepStory;
  restoreNew();
  const G = r.S && r.S.growth;
  const growth = G ? {
    un: Object.keys(G.un || {}),
    fac: G.fac ? { d: G.fac.district, a: archOf(G.fac.district), name: dname(G.fac.district) } : null,
    flag: G.flag ? { d: G.flag.district, a: archOf(G.flag.district), name: dname(G.flag.district) } : null,
    facSites: (G.facSites || []).map((x) => x.district), flagSites: (G.flagSites || []).map((x) => x.district),
    fr: ((G.fr && G.fr.list) || []).length, ret: ((G.ret && G.ret.list) || []).length,
  } : null;
  return { r, growth, scenes: uniq(seen), yrows, cityEnd, stores: (r.S.stores || []).length };
}
const growthTxt = (g) => `рост вглубь: открыто [${(g.un || []).join(', ') || '—'}]`
  + `, фабрика ${g.fac ? '«' + g.fac.name + '»/' + g.fac.a : '—'}`
  + `, площадки фабрики [${dnames(g.facSites || []) || '—'}]${(g.facSites || []).length ? ' (' + uniq(g.facSites.map(archOf)).join('/') + ')' : ''}`
  + `, флагман ${g.flag ? '«' + g.flag.name + '»/' + g.flag.a : '—'}`
  + `, площадки флагмана [${dnames(g.flagSites || []) || '—'}]${(g.flagSites || []).length ? ' (' + uniq(g.flagSites.map(archOf)).join('/') + ')' : ''}`;
const growthOk = (g) => {
  const gs = (g.facSites || []).concat(g.flagSites || [], g.fac ? [g.fac.d] : [], g.flag ? [g.flag.d] : []);
  return { gs, ok: gs.length > 0 && gs.every((d) => !!dOf(d)) };
};

/* ---- 4–5. сцены истории: Москва, сюжет включён ---- */
function storyPass() {
  const n = Math.min(2, seeds);
  console.log(`\n# 4–5. Москва, сюжет включён: сцены истории приходят, карта не съезжает (${n} сида)`);
  for (let i = 1; i <= n; i++) {
    let m = null;
    try { m = run('good', i * 7919, 'moscow', 'moscow', true); }
    catch (e) { console.log(`  ✗ сид ${i}: партия упала — ${e.message}`); bad++; continue; }
    const g = m.growth || {};
    const won = m.r.won ? m.r.won.year : null;
    console.log(`  сид ${i}: ${won ? 'победа на ' + won + '-м году' : m.r.lostYear ? 'партия кончилась на ' + m.r.lostYear + '-м году' : 'без победы'}`
      + `, точек ${m.stores}, город — ${m.cityEnd}`);
    console.log(`    сцены истории: ${m.scenes.length} (${m.scenes.join(' ') || '—'})`);
    if (g.un && g.un.length) console.log('    ' + growthTxt(g));
    ok(m.cityEnd === 'moscow', `сид ${i}: карта московская (история не уводит в Уфу)`, `BK.CITY=${m.cityEnd}`);
    const mos = ['mos1', 'mos2', 'mos3', 'mos4', 'mos5', 'mos6', 'mos7', 'mos8'].filter((id) => m.scenes.indexOf(id) >= 0);
    ok(mos.length >= 5, `сид ${i}: сцены истории приходят (${mos.length} из 8 ключевых)`, m.scenes.join(' '));
  }
}

/* ---- 6. темп и числа: Москва против Уфы, сюжет выключен (как канонические прогоны ботов) ---- */
function oneRun(kind, i, scen, storyOn) {
  const m = run('good', i * 7919, kind === 'moscow' ? 'moscow' : null, scen, !!storyOn);
  return { i, won: m.r.won ? m.r.won.year : null, lost: m.r.lostYear, y5: m.yrows[5], y10: m.yrows[10], city: m.cityEnd, stores: m.stores, growth: m.growth || {} };
}
function summary(tag, rows) {
  const wins = rows.map((x) => x.won).filter(Boolean).sort((a, b) => a - b);
  const y5 = rows.map((x) => x.y5).filter(Boolean);
  console.log(`  == ${tag}: побед ${wins.length}/${rows.length}, медиана года победы ${med(wins) || '—'}`
    + `, год 5: аренда ${med(y5.map((x) => x.rentShare))} % выручки, чек ${med(y5.map((x) => x.chk))} ₽,`
    + ` гостей/точку ${med(y5.map((x) => (x.guests ? Math.round(x.guests / x.stores) : null)))}/день, точек ${med(y5.map((x) => x.stores))}`);
  return { wins, y5 };
}
function pacePass() {
  console.log(`\n# 6. Темп и числа, сюжет выключен (${seeds} сидов, ${years} лет, seed = i × 7919)`);
  const res = {};
  for (const kind of ['moscow', 'ufa']) {
    const rows = [];
    for (let i = 1; i <= seeds; i++) {
      const x = oneRun(kind, i, kind === 'moscow' ? 'moscow' : null, false);
      rows.push(x);
      const r5 = x.y5;
      console.log(`  ${kind === 'moscow' ? 'Москва' : 'Уфа   '} сид ${i}: ${x.won ? 'победа на ' + x.won + '-м году' : x.lost ? 'банкротство на ' + x.lost + '-м году' : 'без победы'}`
        + `, город ${x.city}`
        + (r5 ? ` · год 5: выручка ${Math.round(r5.rev / 1e6)} млн, чек ${r5.chk} ₽, гостей/точку ${r5.guests ? Math.round(r5.guests / r5.stores) : '—'}/день, аренда ${r5.rentShare} % выручки, точек ${r5.stores}` : ''));
      if (kind === 'moscow') console.log('    ' + growthTxt(x.growth));
      ok(x.city === (kind === 'moscow' ? 'moscow' : 'ufa'), `${kind} сид ${i}: город в конце партии — ${x.city}`, `BK.CITY=${x.city}`);
      if (kind === 'moscow') {
        const go = growthOk(x.growth);
        ok(go.ok, `moscow сид ${i}: рост вглубь не упал, площадки — районы активной карты (${go.gs.length})`,
          go.gs.map((d) => dname(d) + '/' + archOf(d)).join(', '));
      }
    }
    res[kind] = Object.assign(rows, summary(kind === 'moscow' ? 'Москва' : 'Уфа', rows));
  }
  return res;
}

/* ---- 7. Москва БЕЗ правил истории (только город): насколько правила делают историю честнее ---- */
function cityOnlyPass() {
  console.log(`\n# 7. Контроль: та же Москва, но БЕЗ правил истории (город тот же, истории нет)`);
  const rows = [];
  for (let i = 1; i <= seeds; i++) {
    const x = oneRun('moscow', i, null, false); // город Москва, сценарий не выбран
    rows.push(x);
    console.log(`  сид ${i}: ${x.won ? 'победа на ' + x.won + '-м году' : x.lost ? 'банкротство на ' + x.lost + '-м году' : 'без победы'}, город ${x.city}, точек ${x.stores}`
      + (x.y5 ? ` · год 5: чек ${x.y5.chk} ₽, аренда ${x.y5.rentShare} % выручки, точек ${x.y5.stores}` : ''));
  }
  return summary('Москва без правил истории', rows);
}

starts();
saveLoad();
russiaHome();
storyPass();
const P = pacePass();
const C = cityOnlyPass();
const mosYear = med(P.moscow.wins);
// Коридор 14–16 лет можно проверить только горизонтом не короче него: при `12 3`
// победы в принципе не наступают, и это не ошибка баланса, а короткий прогон.
if (years >= 14) {
  ok(mosYear != null && mosYear >= 14 && mosYear <= 16,
    'медиана победы сценария «Старт в Москве» — в целевом коридоре 14–16 лет', mosYear == null ? 'нет побед' : `${mosYear} года`);
} else {
  console.log(`  — медиана победы «Старта в Москве»: горизонт ${years} лет короче коридора 14–16, проверка не считается`
    + ` (для неё — node sim/scencity.js 20 3)`);
}

const m5 = P.moscow.y5, u5 = P.ufa.y5;
console.log('\n# Итог: Москва против Уфы (год 5, бот good, сюжет выключен)');
const cmp = (label, unit, map) => {
  const a = med(m5.map(map)), b = med(u5.map(map));
  console.log(`  ${label}: ${a}${unit} в Москве против ${b}${unit} в Уфе`);
  return [a, b];
};
const [chkM, chkU] = cmp('чек', ' ₽', (x) => x.chk);
const [rentM, rentU] = cmp('аренда', ' % выручки', (x) => x.rentShare);
const [revM, revU] = cmp('выручка месяца', ' млн ₽', (x) => Math.round(x.rev / 1e6));
ok(chkM > chkU * 1.3, 'в Москве чек выше уфимского', `${chkM} против ${chkU} ₽`);
ok(rentM > rentU, 'в Москве аренда съедает больше выручки', `${rentM} против ${rentU} %`);
console.log(`  год победы: Москва с историей ${med(P.moscow.wins) || '—'} против Москвы без правил истории ${med(C.wins) || '—'} (Уфа ${med(P.ufa.wins) || '—'})`);
// «С историей медленнее, чем просто московский чек» видно только там, где история успевает выиграть:
// при коротком горизонте (например, `12 3`) сравнить нечего — это не провал баланса.
if (med(P.moscow.wins) != null) {
  ok(med(C.wins) < med(P.moscow.wins), 'правила «Старта в Москве» делают историю честнее — медленнее, чем просто московский чек', `${med(C.wins)} против ${med(P.moscow.wins)}`);
} else {
  console.log('  — сравнение «с историей медленнее»: с историей на этом горизонте побед нет, проверка не считается');
}
void revM; void revU;

console.log(bad ? `\n✗ проверок не прошло: ${bad}` : '\n✓ все проверки города истории прошли');
process.exit(bad ? 1 : 0);
