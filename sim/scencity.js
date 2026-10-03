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

/* ---- 6.5. проектные карты Москвы и Петербурга (PLAN.md этап 8.3) ----
   Проверяем не «красивость», а то, что карта читается и данные районов полны:
     • у каждого района есть характер, 3+ реальные улицы, соседство (lm) и точки притяжения,
       размер помещения (sizeW) и все id соседей существуют в BK.LANDMARKS;
     • районы не стоят в воде и не ближе 40 ед. друг к другу, контур города замкнут и все
       районы и точки притяжения внутри него;
     • id/arch/вес районов совпадают с прежним генератором (иначе старые сохранения
       и партии не найдут район);
     • «характер соседства» не сдвигает экономику города: взвешенное среднее множителей
       соседей по районам совпадает со средним по всем BK.LANDMARKS (±6 %). */
function polyDist(p, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L));
    best = Math.min(best, Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy)));
  }
  return best;
}
function inPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function cityMaps() {
  console.log('\n# 6.5. Проектные карты Москвы и Петербурга (районы, улицы, соседство, схема)');
  const LEGACY = { // как эти города строились генератором до этапа 8.3 (id, arch, вес)
    moscow: [['center', 1.4], ['biz', 1.3], ['biz', 1.3], ['biz', 1.3], ['prestige', 1.2], ['prestige', 1.2], ['sleep', 1.1], ['sleep', 1.1], ['sleep', 1.1], ['far', 0.9], ['outskirts', 0.5], ['industrial', 0.5]],
    spb: [['center', 1.4], ['biz', 1.3], ['biz', 1.3], ['prestige', 1.2], ['sleep', 1.1], ['sleep', 1.1], ['sleep', 1.1], ['sleep', 1.1], ['student', 1.2], ['far', 0.9], ['industrial', 0.5]],
  };
  const lmean = (ids, key) => {
    const ls = ids.map((id) => BK.LANDMARKS.find((l) => l.id === id)).filter(Boolean);
    return ls.length ? ls.reduce((a, l) => a + l[key], 0) / ls.length : 0;
  };
  const allMean = {};
  for (const key of ['tr', 'solv', 'rent']) allMean[key] = BK.LANDMARKS.reduce((a, l) => a + l[key], 0) / BK.LANDMARKS.length;
  for (const city of ['moscow', 'spb']) {
    BK.useCity(city, 7919);
    const M = BK.MAP, D = BK.DISTRICTS, legacy = LEGACY[city];
    const badStreets = D.filter((d) => !d.streets || d.streets.length < 3).map((d) => d.name);
    const noKind = D.filter((d) => !d.kind).map((d) => d.name);
    const noLm = D.filter((d) => !d.lm || !d.lm.length).map((d) => d.name);
    const badLm = [];
    for (const d of D) for (const id of (d.lm || [])) if (!BK.LANDMARKS.some((l) => l.id === id)) badLm.push(d.name + ':' + id);
    const noPois = D.filter((d) => !(M.pois || []).some((p) => p.d === d.id)).map((d) => d.name);
    const badSize = D.filter((d) => { const w = d.sizeW; return !w || Math.abs(w.small + w.standard + w.large - 1) > 0.02; }).map((d) => d.name);
    const mism = D.filter((d, i) => !legacy[i] || legacy[i][0] !== d.arch || Math.abs(legacy[i][1] - d.w) > 1e-6).map((d) => d.name + '/' + d.arch + '/' + d.w);
    const idsOk = D.every((d, i) => d.id === city + i);
    // вода: районы не в реке/море и не ближе 18 ед. к воде; точки притяжения — то же, но не ближе 6
    const rv = (p) => Math.min(...(M.rivers || []).map((r) => polyDist(p, r.pts) - r.w / 2), 1e9);
    const inWater = D.filter((d) => rv(d) < 18).map((d) => `${d.name} (${rv(d).toFixed(0)})`);
    const poisBad = (M.pois || []).filter((p) => !inPoly(p, M.city) || rv(p) < 6).map((p) => p.name + '(' + p.x + ',' + p.y + ')');
    const poisOut = (M.pois || []).filter((p) => !p.d || !D.some((d) => d.id === p.d)).length;
    const dOut = D.filter((d) => !inPoly(d, M.city)).map((d) => d.name);
    let near = 1e9, pair = '';
    for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) { const t = Math.hypot(D[i].x - D[j].x, D[i].y - D[j].y); if (t < near) { near = t; pair = D[i].name + '–' + D[j].name; } }
    const groups = (M.prodGroups || []).flat();
    const groupsOk = (M.prodGroups || []).length === 3 && D.every((d) => groups.indexOf(d.id) >= 0);
    const roads = (M.roads || []).length, rails = (M.rails || []).length, rings = (M.roads || []).filter((r) => r.ring).length;
    let wsum = 0, solvK = 0, trK = 0, rentK = 0;
    for (const d of D) { wsum += d.w; solvK += d.w * lmean(d.lm, 'solv'); trK += d.w * lmean(d.lm, 'tr'); rentK += d.w * lmean(d.lm, 'rent'); }
    console.log(`  ${BK.CITY.name}: районов ${D.length}, улиц у района ${med(D.map((d) => d.streets.length))}, точек притяжения ${(M.pois || []).length}`
      + `, дорог и колец ${roads} (кольца: ${rings}), ж/д линий ${rails}, рек ${(M.rivers || []).length}, парков ${M.parks.length}`);
    console.log(`    соседство: solv ×${(solvK / wsum).toFixed(3)} (эталон ×${allMean.solv.toFixed(3)}), tr ×${(trK / wsum).toFixed(3)} (${allMean.tr.toFixed(3)}), rent ×${(rentK / wsum).toFixed(3)} (${allMean.rent.toFixed(3)})`);
    console.log('    ' + D.map((d) => `${d.name} [${d.kind}]`).join('; '));
    ok(idsOk && D.length === legacy.length, `${city}: id районов и их число прежние (старые сохранения находят район)`, D.map((d) => d.id).join(','));
    ok(!mism.length, `${city}: arch и вес районов совпадают с прежней картой`, mism.join(', ') || 'все');
    ok(!badStreets.length, `${city}: у каждого района не меньше 3 реальных улиц`, badStreets.join(', ') || `минимум ${Math.min(...D.map((d) => d.streets.length))}`);
    ok(!noKind.length && !noLm.length && !badSize.length, `${city}: у каждого района есть характер, соседство (lm) и типичный размер помещения`, (noKind.concat(noLm, badSize).join(', ') || 'все 100 %'));
    ok(!badLm.length, `${city}: все соседи районов есть в BK.LANDMARKS`, badLm.join(', ') || BK.LANDMARKS.length + ' видов');
    ok(!noPois.length && !poisOut, `${city}: у каждого района есть точки притяжения (вокзалы, БЦ, метро, рынки, парки)`, noPois.join(', ') || `${(M.pois || []).length} точек`);
    ok(!dOut.length && !inWater.length, `${city}: все районы внутри контура города и не в воде`, dOut.concat(inWater).join(', ') || `ближайшая вода ${Math.min(...D.map((d) => rv(d))).toFixed(0)} ед.`);
    ok(near > 40, `${city}: районы не налезают друг на друга`, `ближайшая пара ${pair} — ${near.toFixed(0)} ед.`);
    ok(!poisBad.length, `${city}: точки притяжения внутри города и не в воде`, poisBad.slice(0, 4).join(', ') || 'все');
    ok(roads >= 4 && rails >= 1 && M.city.length >= 8 && (M.rivers || []).length >= 1, `${city}: на схеме есть магистрали и кольца, ж/д, контур и река`, `${roads} дорог, ${rails} ж/д, контур ${M.city.length} точек, ${(M.rivers || []).length} рек`);
    ok(groupsOk, `${city}: группы районов для цехов покрывают все районы`, JSON.stringify(M.prodGroups));
    ok(Math.abs(solvK / wsum - allMean.solv) < 0.06 && Math.abs(trK / wsum - allMean.tr) < 0.06 && Math.abs(rentK / wsum - allMean.rent) < 0.06,
      `${city}: характер соседства не сдвигает экономику города (средние множители в пределах ±6 %)`,
      `solv ${((solvK / wsum - allMean.solv) * 100).toFixed(1)} %, tr ${((trK / wsum - allMean.tr) * 100).toFixed(1)} %, rent ${((rentK / wsum - allMean.rent) * 100).toFixed(1)} %`);
  }
  // обычная игра после этих проверок — снова Уфа
  BK.useCity(null, 7919);
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
cityMaps();
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
