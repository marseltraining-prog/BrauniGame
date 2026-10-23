/* Общий браузерный сценарий подробной карты города: node qa/citymap.js <город>.
   Выбор города, новая партия, слои, перезагрузка, старые сохранения mapGen 1,
   корпоративный вход и покупка сети e208. 1440/390, обе темы, Chromium/WebKit. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('playwright'), { openPage, layoutCheck } = require('./lib');
const city = process.argv[2] || 'tyumen';
const other = city === 'voronezh' ? 'kazan' : 'voronezh';
const legacy = require(`../docs/releases/0.9.27-legacy-${city}.json`);
const out = path.join(__dirname, 'shots', city); fs.mkdirSync(out, { recursive: true });
let checks = 0; const notes = [];
const ok = (v, label) => { assert.ok(v, label); checks++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const geo = w => ({ map: w.map, districts: w.districts.map(({ streets, ...d }) => d), center: w.center });
const world = p => p.evaluate(() => ({ map: BK.MAP, districts: BK.DISTRICTS, center: BK.CENTER_POINT }));
const places = p => p.evaluate(() => BK.App.state.stores.concat(BK.App.state.productions).map(s => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, s.address]));
const settle = p => p.waitForTimeout(220);
async function layout(p, label) {
  const found = await layoutCheck(p, label, { mobile: label.includes('m390') });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': страница по ширине');
  ok(!found.some(x => /HSCROLL документа|МУСОР В ТЕКСТЕ/.test(x)), label + ': вёрстка ' + found.join('\n'));
}
async function layers(p, label) {
  const d = await p.evaluate(() => ({ city: BK.CITY.id, name: BK.CITY.name, gen: BK.App.state.startMapGen, bridges: document.querySelectorAll('#map .m-bridge').length, districts: document.querySelectorAll('#map .m-klabel').length, pois: document.querySelectorAll('#map .m-poi').length, roads: document.querySelectorAll('#map .m-road').length, rails: document.querySelectorAll('#map .m-rail').length, rivers: document.querySelectorAll('#map .m-river').length, aria: document.querySelector('#map').getAttribute('aria-label'), data: { bridges: BK.MAP.bridges.length, pois: BK.MAP.pois.length, roads: BK.MAP.roads.length, rails: (BK.MAP.rails || []).length, rivers: BK.MAP.rivers.length, districts: BK.DISTRICTS.length } }));
  ok(d.city === city, label + ': активный город');
  ok(d.bridges === d.data.bridges && d.districts === d.data.districts && d.pois === d.data.pois && d.roads === d.data.roads && d.rails === d.data.rails && d.rivers === d.data.rivers, label + ': слои карты ' + JSON.stringify(d));
  ok(d.aria.includes(d.name.slice(0, 5)), label + ': подпись карты для чтения');
}
async function reload(p) {
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.save(); }); await p.reload(); await p.click('[data-act=continue]'); await settle(p);
  await p.evaluate(() => { BK.CFG.STORY.ON = false; if (document.querySelector('#modal .story-modal')) BK.App.ACT.closeModal(); });
}
(async () => {
  const b = await (process.env.BR === 'webkit' ? webkit : chromium).launch(), browser = b.browserType().name();
  const name = await (async () => { const p = await openPage(b, 'd1440', { seed: 7919 }); const n = await p.evaluate(c => BK.CITY_BY_ID[c].name, city); await p.context().close(); return n; })();
  try {
    for (const vp of ['d1440', 'm390']) for (const dark of [false, true]) {
      const label = `${browser}/${city}/${vp}/${dark ? 'dark' : 'light'}`;
      const p = await openPage(b, vp, { dark, seed: 7919 });
      console.log(label);
      const initial = await p.evaluate(() => JSON.stringify({ map: BK.MAP, districts: BK.DISTRICTS, city: BK.CITY }));
      await p.check(`[name=startCity][value=${city}]`);
      await settle(p);
      eq(await p.locator('#startPreview').getAttribute('data-city'), city, label + ': выбор города');
      eq(await p.locator('#cityPreviewChoice').innerText(), name, label + ': название города');
      eq(await p.locator('#startPreview .city-arms').getAttribute('aria-label'), 'Стилизованный герб: ' + name, label + ': герб');
      eq(await p.evaluate(() => JSON.stringify({ map: BK.MAP, districts: BK.DISTRICTS, city: BK.CITY })), initial, label + ': предпросмотр не меняет мир');
      ok(await p.locator('#startPreview .m-river').count() > 0, label + ': предпросмотр рисует реки');
      await p.locator('#startPreview').screenshot({ path: path.join(out, label.replaceAll('/', '-') + '-cover.png') });
      await layout(p, label + ' cover');
      await p.evaluate(() => { BK.CFG.STORY.ON = false; BK.Scenario.pick = () => null; });
      await p.check('[name=startmode][value=net]'); await p.click('#startForm button[type=submit]');
      await p.evaluate(() => { BK.App.setSpeed(0); const S = BK.App.state; S.cash = 1e8; if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('setup'); BK.App.refresh(); BK.App.save(); });
      ok(await p.evaluate(c => BK.App.state.startCity === c && BK.App.state.startMapGen === 2, city), label + ': новая партия на подробной карте');
      const w0 = await world(p), pl0 = await places(p);
      await layers(p, label); await layout(p, label);
      await p.locator('.mapwrap').screenshot({ path: path.join(out, label.replaceAll('/', '-') + '-map.png') });
      await reload(p);
      eq(geo(await world(p)), geo(w0), label + ': геометрия после перезагрузки');
      eq(await places(p), pl0, label + ': точки после перезагрузки');
      await p.evaluate(o => { const S = BK.App.state; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); if (!BK.Engine.enterCity(S, o).ok || !BK.Engine.switchCity(S, 'ufa').ok) throw Error('round trip'); BK.App.refresh(); }, other);
      eq(geo(await world(p)), geo(w0), label + ': карта после поездки домой');
      ok(!p.errs.length, p.errs.join('\n'));
      await p.context().close();
    }
    for (const key of ['start', 'corp', 'bought']) {
      ok(legacy[key] && legacy[key + 'World'], 'снимок старых сохранений ' + key);
      const state = legacy[key];
      const p = await openPage(b, 'm390', { save: JSON.stringify(state) }); await p.click('[data-act=continue]'); await settle(p);
      eq(geo(await world(p)), geo(legacy[key + 'World']), key + ': старая геометрия');
      const expected = state.stores.concat(state.productions).map(s => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, s.address]);
      eq(await places(p), expected, key + ': старые координаты и адреса');
      ok(await p.locator('#map .m-bridge').count() === 0, key + ': прежняя карта без подробных мостов');
      await p.evaluate(() => { BK.CFG.STORY.ON = false; const S = BK.App.state; S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); BK.App.refresh(); });
      await reload(p);
      eq(geo(await world(p)), geo(legacy[key + 'World']), key + ': старая карта после перезагрузки');
      ok(!p.errs.length, p.errs.join('\n'));
      await p.context().close();
    }
    const p = await openPage(b, 'm390', { seed: 15838 }); await p.evaluate(() => { BK.CFG.STORY.ON = false; BK.Scenario.pick = () => null; });
    await p.check('[name=startmode][value=net]'); await p.click('#startForm button[type=submit]');
    await p.evaluate(c => { BK.App.setSpeed(0); const S = BK.App.state; S.cash = 1e12; if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('home setup'); S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); if (!BK.Engine.enterCity(S, c).ok) throw Error('entry'); if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('city setup'); BK.App.refresh(); }, city);
    await layers(p, 'корпоративный вход');
    ok(await p.evaluate(c => BK.App.state.corp.cities[c].mapGen === 2, city), 'корпоративная запись города подробная');
    const w1 = await world(p), pl1 = await places(p);
    await p.evaluate(c => { const S = BK.App.state; if (!BK.Engine.switchCity(S, 'ufa').ok || !BK.Engine.switchCity(S, c).ok) throw Error('return'); BK.App.refresh(); }, city);
    await reload(p);
    eq(geo(await world(p)), geo(w1), 'корпоративная карта после перезагрузки');
    eq(await places(p), pl1, 'корпоративные точки после перезагрузки');
    const acquired = await p.evaluate(c => {
      for (let seed = 1; seed <= 80; seed++) {
        const S = BK.Engine.newGame({ seed: seed * 7919 }); S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S);
        if (!BK.Engine.enterCity(S, 'kazan').ok || !BK.Engine.enterCity(S, 'ekb').ok) throw Error('acq prerequisites');
        S.day = Math.max(366, (BK.CFG.CORP.LAUNCH_DAYS || 510) + 1);
        const ev = BK.CorpEv.byId('e208'); if (!BK.CorpEv.eligible(S, ev)) throw Error('e208 ineligible'); BK.CorpEv.start(S, ev);
        if (!S.ev.pending || S.ev.pending.ctx.city !== c) continue;
        const n = S.ev.pending.ctx.n; const r = BK.Engine.resolveEvent(S, 0);
        if (!r || r.idx !== 0 || !BK.Engine.switchCity(S, c).ok) throw Error('purchase');
        localStorage.setItem(BK.Slots.key(), JSON.stringify(S)); BK.App.ACT.continue(); BK.App.setSpeed(0); BK.App.save();
        return { n, mapGen: S.corp.cities[c].mapGen, bought: S.corp.cities[c].bought };
      } return null;
    }, city);
    ok(acquired && acquired.bought && acquired.mapGen === 2, 'покупка сети e208: подробная карта');
    await p.reload(); await p.click('[data-act=continue]'); await settle(p);
    ok(await p.evaluate(n => BK.App.state.stores.length === n, acquired.n), 'покупка: число точек');
    const w2 = await world(p), pl2 = await places(p); await reload(p);
    eq(geo(await world(p)), geo(w2), 'покупка: карта после перезагрузки');
    eq(await places(p), pl2, 'покупка: точки после перезагрузки');
    ok(!p.errs.length, p.errs.join('\n')); await p.context().close();
    fs.writeFileSync(path.join(out, browser + '-checks.json'), JSON.stringify({ browser, city, checks, notes, limitations: ['Финансовый разблок и зрелый день города — явные предпосылки.'] }, null, 2) + '\n');
    console.log(`${name} UI (${browser}): ${checks} проверок, 0 проблем`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
