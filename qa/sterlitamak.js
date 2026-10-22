/* Стерлитамак в браузере (Chromium/WebKit): выбор города, новая партия, слои карты, перезагрузка,
   старые сохранения mapGen 1, корпоративный вход и покупка сети. Экраны 1440 и 390, обе темы.
   Запуск: node qa/sterlitamak.js [--legacy-only] */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, webkit } = require('playwright'), { openPage, layoutCheck } = require('./lib');
const legacy = require('../docs/releases/0.9.24-legacy-sterlitamak.json');
const out = path.join(__dirname, 'shots', 'sterlitamak'); fs.mkdirSync(out, { recursive: true });
let checks = 0; const notes = [];
const ok = (v, label) => { assert.ok(v, label); checks++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const clone = x => JSON.parse(JSON.stringify(x));
const geo = w => ({ map: w.map, districts: w.districts.map(({ streets, ...d }) => d), center: w.center });
const world = p => p.evaluate(() => ({ map: BK.MAP, districts: BK.DISTRICTS, center: BK.CENTER_POINT }));
const places = p => p.evaluate(() => BK.App.state.stores.concat(BK.App.state.productions).map(s => [s.id, Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, s.address]));
const settle = p => p.waitForTimeout(220);
async function layout(p, label) {
  const found = await layoutCheck(p, label, { mobile: label.includes('m390') });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ': страница по ширине');
  ok(!found.some(x => /HSCROLL документа|МУСОР В ТЕКСТЕ/.test(x)), label + ': вёрстка ' + found.join('\n'));
  const junk = await p.evaluate(() => (((document.querySelector('#pbody') || {}).innerText || '').match(/.{0,20}(NaN|undefined|Infinity|\[object).{0,20}/g) || []).slice(0, 2));
  ok(!junk.length, label + ': без мусора в тексте');
}
async function layers(p, label) {
  const d = await p.evaluate(() => ({ city: BK.CITY.id, gen: BK.App.state.startMapGen, bridges: document.querySelectorAll('#map .m-bridge').length, districts: document.querySelectorAll('#map .m-klabel').length, pois: document.querySelectorAll('#map .m-poi').length, roads: document.querySelectorAll('#map .m-road').length, rails: document.querySelectorAll('#map .m-rail').length, rivers: document.querySelectorAll('#map .m-river').length, aria: document.querySelector('#map').getAttribute('aria-label') }));
  ok(d.city === 'sterlitamak', label + ': активный Стерлитамак');
  ok(d.bridges === 9 && d.districts === 6 && d.pois === 42 && d.roads === 17 && d.rails === 2 && d.rivers === 4, label + ': слои карты ' + JSON.stringify(d));
  ok(d.aria.includes('Стерлитамак'), label + ': подпись карты для чтения');
}
async function reload(p) {
  await p.evaluate(() => { BK.App.setSpeed(0); BK.App.save(); }); await p.reload(); await p.click('[data-act=continue]'); await settle(p);
  await p.evaluate(() => { BK.CFG.STORY.ON = false; if (document.querySelector('#modal .story-modal')) BK.App.ACT.closeModal(); });
}
(async () => {
  const b = await (process.env.BR === 'webkit' ? webkit : chromium).launch(), browser = b.browserType().name();
  try {
    if (!process.argv.includes('--legacy-only')) for (const vp of ['d1440', 'm390']) for (const dark of [false, true]) {
      const label = `${browser}/${vp}/${dark ? 'dark' : 'light'}`;
      const p = await openPage(b, vp, { dark, seed: 7919 });
      console.log(label);
      const initial = await p.evaluate(() => JSON.stringify({ map: BK.MAP, districts: BK.DISTRICTS, city: BK.CITY }));
      await p.check('[name=startCity][value=sterlitamak]');
      eq(await p.locator('#startPreview').getAttribute('data-city'), 'sterlitamak', label + ': выбор города');
      eq(await p.locator('#cityPreviewChoice').innerText(), 'Стерлитамак', label + ': название города');
      eq(await p.locator('#startPreview .city-arms').getAttribute('aria-label'), 'Стилизованный герб: Стерлитамак', label + ': герб');
      eq(await p.evaluate(() => JSON.stringify({ map: BK.MAP, districts: BK.DISTRICTS, city: BK.CITY })), initial, label + ': предпросмотр не меняет мир');
      ok(await p.locator('#startPreview .m-river').count() > 0, label + ': предпросмотр рисует реки');
      await p.locator('#startPreview').screenshot({ path: path.join(out, label.replaceAll('/', '-') + '-cover.png') });
      await layout(p, label + ' cover');
      await p.evaluate(() => { BK.CFG.STORY.ON = false; BK.Scenario.pick = () => null; });
      await p.check('[name=startmode][value=net]'); await p.click('#startForm button[type=submit]');
      await p.evaluate(() => { BK.App.setSpeed(0); const S = BK.App.state; S.cash = 1e8; if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('setup'); BK.App.refresh(); BK.App.save(); });
      ok(await p.evaluate(() => BK.App.state.startCity === 'sterlitamak' && BK.App.state.startMapGen === 2), label + ': новая партия');
      const w0 = await world(p), pl0 = await places(p);
      await layers(p, label); await layout(p, label);
      await p.locator('.mapwrap').screenshot({ path: path.join(out, label.replaceAll('/', '-') + '-map.png') });
      await reload(p);
      eq(geo(await world(p)), geo(w0), label + ': геометрия после перезагрузки');
      eq(await places(p), pl0, label + ': точки после перезагрузки');
      await p.evaluate(() => { const S = BK.App.state; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); if (!BK.Engine.enterCity(S, 'voronezh').ok || !BK.Engine.switchCity(S, 'ufa').ok) throw Error('round trip'); BK.App.refresh(); });
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
      await p.evaluate(key => { BK.CFG.STORY.ON = false; const S = BK.App.state; S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); if (!BK.Engine.enterCity(S, 'voronezh').ok || !BK.Engine.switchCity(S, key === 'start' ? 'ufa' : 'sterlitamak').ok) throw Error('legacy trip'); BK.App.refresh(); }, key);
      await reload(p);
      eq(geo(await world(p)), geo(legacy[key + 'World']), key + ': старая карта после поездки и перезагрузки');
      ok(!p.errs.length, p.errs.join('\n'));
      await p.context().close();
    }
    if (!process.argv.includes('--legacy-only')) {
      const p = await openPage(b, 'm390', { seed: 15838 }); await p.evaluate(() => { BK.CFG.STORY.ON = false; BK.Scenario.pick = () => null; });
      await p.check('[name=startmode][value=net]'); await p.click('#startForm button[type=submit]');
      await p.evaluate(() => { BK.App.setSpeed(0); const S = BK.App.state; S.cash = 1e12; if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('home setup'); S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S); if (!BK.Engine.enterCity(S, 'sterlitamak').ok) throw Error('entry'); if (!BK.Engine.chooseProduction(S, S.prodOffers[0].id).ok || !BK.Engine.rentStore(S, S.offers[0].id).ok) throw Error('city setup'); BK.App.refresh(); });
      await layers(p, 'корпоративный вход');
      ok(await p.evaluate(() => BK.App.state.corp.cities.sterlitamak.mapGen === 2), 'корпоративная запись города подробная');
      const w1 = await world(p), pl1 = await places(p);
      await p.evaluate(() => { const S = BK.App.state; if (!BK.Engine.switchCity(S, 'ufa').ok || !BK.Engine.switchCity(S, 'sterlitamak').ok) throw Error('return'); BK.App.refresh(); });
      await reload(p);
      eq(geo(await world(p)), geo(w1), 'корпоративная карта после перезагрузки');
      eq(await places(p), pl1, 'корпоративные точки после перезагрузки');
      const acquired = await p.evaluate(() => {
        for (let seed = 1; seed <= 200; seed++) {
          const S = BK.Engine.newGame({ seed: seed * 7919 }); S.phase = 'play'; S.cash = 1e12; S.cumRevenue = BK.CFG.CORP.UNLOCK_REVENUE; BK.Corp.ensure(S);
          if (!BK.Engine.enterCity(S, 'kazan').ok || !BK.Engine.enterCity(S, 'ekb').ok) throw Error('acq prerequisites');
          S.day = Math.max(366, (BK.CFG.CORP.LAUNCH_DAYS || 510) + 1);
          const ev = BK.CorpEv.byId('e208'); if (!BK.CorpEv.eligible(S, ev)) throw Error('e208 ineligible'); BK.CorpEv.start(S, ev);
          if (!S.ev.pending || S.ev.pending.ctx.city !== 'sterlitamak') continue;
          const n = S.ev.pending.ctx.n; const r = BK.Engine.resolveEvent(S, 0);
          if (!r || r.idx !== 0 || !BK.Engine.switchCity(S, 'sterlitamak').ok) throw Error('purchase');
          localStorage.setItem(BK.Slots.key(), JSON.stringify(S)); BK.App.ACT.continue(); BK.App.setSpeed(0); BK.App.save();
          return { seed: seed * 7919, n, mapGen: S.corp.cities.sterlitamak.mapGen, bought: S.corp.cities.sterlitamak.bought };
        } return null;
      });
      ok(acquired && acquired.bought && acquired.mapGen === 2, 'покупка сети e208: подробная карта');
      await p.reload(); await p.click('[data-act=continue]'); await settle(p);
      ok(await p.evaluate(n => BK.App.state.stores.length === n, acquired.n), 'покупка: число точек');
      const w2 = await world(p), pl2 = await places(p); await reload(p);
      eq(geo(await world(p)), geo(w2), 'покупка: карта после перезагрузки');
      eq(await places(p), pl2, 'покупка: точки после перезагрузки');
      ok(!p.errs.length, p.errs.join('\n')); await p.context().close();
    }
    fs.writeFileSync(path.join(out, browser + '-checks.json'), JSON.stringify({ browser, checks, notes, limitations: ['Финансовый разблок и зрелый день города — явные предпосылки, не проверка баланса.', 'Подписи проверялись рамками в SIM; финальный вид — по снимкам.'] }, null, 2) + '\n');
    console.log(`СТЕРЛИТАМАК UI (${browser}): ${checks} проверок, 0 проблем`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
