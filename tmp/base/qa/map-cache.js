/* Регрессия: кэш кластеров не переживает загрузку другого состояния с тем же числом точек. */
const { chromium, openPage } = require('./lib');
const { play } = require('../sim/bot');

function save(seed, prefix) {
  const r = play({ level: 'good', seed, years: 5 });
  const S = JSON.parse(JSON.stringify(r.S));
  delete S.cache; delete S._botRng; S.notify = []; S.ev.pending = null; S.chef.pending = null; S.phase = 'play';
  S.stores = S.stores.slice(0, 3);
  if (S.stores.length < 3) throw new Error('Бот не создал три точки для теста карты');
  const pos = [[110, 120], [500, 520], [880, 850]];
  S.stores.forEach((st, i) => { st.id = prefix + (i + 1); st.num = i + 1; st.x = pos[i][0]; st.y = pos[i][1]; });
  return S;
}

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, 'd1440', { seed: 17 });
  const A = save(117, 'old-'), B = save(991, 'new-');
  await p.evaluate((s) => { BK.App.continueGame(s, true); BK.App.setSpeed(0); BK.App.refresh(); }, A);
  await p.waitForTimeout(100);
  await p.evaluate((s) => { BK.App.continueGame(s, true); BK.App.setSpeed(0); BK.App.refresh(); }, B);
  await p.waitForTimeout(150);
  const ids = await p.evaluate(() => [...document.querySelectorAll('#map [data-kind="store"], #map [data-kind="cluster"]')].map((el) => el.dataset.id));
  const stale = ids.filter((id) => /^old-/.test(id));
  const fresh = ids.filter((id) => /^new-/.test(id));
  const issues = [];
  if (p.errs.length) issues.push(...p.errs);
  if (stale.length) issues.push('На карте остались старые ID: ' + stale.join(', '));
  if (!fresh.length) issues.push('На карте нет маркеров нового состояния: ' + ids.join(', '));
  console.log(`map cache: markers=${ids.join(',') || 'none'} errors=${p.errs.length}`);
  if (issues.length) console.error(issues.join('\n'));
  await p.context().close(); await browser.close();
  process.exit(issues.length ? 1 : 0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
