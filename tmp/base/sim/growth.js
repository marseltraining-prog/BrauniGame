/* Рост вглубь (src/growth.js) — разбор по направлениям и годам для одного бота.
   node sim/growth.js <good|avg> [сид=1] [лет=16]
   Колонки (млн ₽ за январь — прошлый полный месяц): выручка кейтеринга / флагмана / полок / франшизы, прибыль по ним и фабрики
   (фабрика: − постоянные расходы + экономия фудкоста сети на полуфабрикатах), число франчайзи и контрактов, фабрика и её загрузка. */
const { play } = require('./bot');
const BK = globalThis.BK;
const lvl = process.argv[2] || 'good', seed = +(process.argv[3] || 1), years = +(process.argv[4] || 16);
const rows = [];
const m1 = (v) => Math.round(v / 1e5) / 10;
const r = play({ level: lvl, seed: seed * 7919, years, onDay: (S) => {
  const t = BK.Engine.dateOf(S.day);
  if (t.m === 0 && t.d === 2 && S.growth && S.growth.last) {
    const G = S.growth, L = G.last, f = G.fac, P = G.lastPlan || {};
    rows.push({ y: t.y - BK.CFG.START_YEAR, st: S.stores.filter((s) => s.status !== 'opening').length, rev: Math.round(S.lastMonthRev / 1e6),
      cat: m1(L.rev.cater), flag: m1(L.rev.flag), ret: m1(L.rev.retail), fr: m1(L.rev.fran),
      pCat: m1(L.pr.cater), pFlag: m1(L.pr.flag), pRet: m1(L.pr.retail), pFr: m1(L.pr.fran), pFac: m1(L.pr.factory), cut: m1(L.netCut), fines: m1(L.fines),
      nFr: G.fr.list.length, nC: G.ret.list.length, units: G.ret.list.reduce((a, c) => a + c.units, 0), fac: f ? f.status + f.lvl : '-', fcap: P.fcap || 0, used: Math.round(P.used || 0), cover: +(P.cover || 0).toFixed(2),
      catOk: G.cat.done, catFail: G.cat.failed, scand: G.fr.scandals, recv: m1(G.recv.reduce((a, x) => a + x.v, 0)), pl: +S.macro.priceLevel.toFixed(2) });
  }
} });
console.table(rows);
console.log(r.won ? `победа на ${r.won.year}-м году, точек ${r.won.stores}` : r.lost ? `банкротство на ${r.lostYear}-м году` : 'без победы');
