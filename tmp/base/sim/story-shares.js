/* Регрессия: сюжетные доли считаются от заявленной области, а не от всей сети. */
process.env.BK_STORY = '1';
const assert = require('assert');
const BK = require('./load');
const ST = BK.Story;

const store = (id, num, profit) => ({ id, num, last: { profit } });
const S = {
  day: 1, cash: 1e6, month: {}, history: [{ profit: 1000 }],
  stores: [store('s-first', 1, 100), store('s-two', 2, 300), store('loss', 3, -900)],
  prologue: { carry: { store1: 's-first' } },
  corp: { active: 'ufa', cities: {
    ufa: { hist: [[2026, 0, 5000, 400]], packed: null },
    kzn: { hist: [[2026, 0, 8000, 700]], packed: { stores: [store('kzn-7', 7, 250)] } },
  } },
  story: ST.defaults(1),
};

assert.strictEqual(ST.shareBase(S, { what: 'net' }, S.history[0]), 1000, 'net');
assert.strictEqual(ST.shareBase(S, { what: 'store1' }, S.history[0]), 100, 'legacy store1');
assert.strictEqual(ST.shareBase(S, { what: 'store:s-two' }, S.history[0]), 300, 'store id');
assert.strictEqual(ST.shareBase(S, { what: 'store:7' }, S.history[0]), 250, 'packed store num');
assert.strictEqual(ST.shareBase(S, { what: 'city:kzn' }, S.history[0]), 700, 'city');
assert.strictEqual(ST.shareBase(S, { what: 'store:loss' }, S.history[0]), 0, 'loss-making store');
assert.strictEqual(ST.shareBase(S, { what: 'store:missing' }, S.history[0]), 0, 'missing store');
assert.strictEqual(ST.shareBase(S, { what: 'city:missing' }, S.history[0]), 0, 'missing city');
assert.strictEqual(ST.shareBase(S, { what: 'unknown' }, S.history[0]), 0, 'unknown scope');

S.story.shares = [
  { who: 'a', what: 'net', pct: 0.1 },        // 100
  { who: 'b', what: 'store1', pct: 0.3 },    // 30
  { who: 'c', what: 'city:kzn', pct: 0.02 }, // 14
  { who: 'd', what: 'store:loss', pct: 1 },  // 0
];
const before = S.cash;
assert.strictEqual(ST.sharesMonthly(S), 144, 'total payout');
assert.strictEqual(S.cash, before - 144, 'cash charged once');
assert.strictEqual(S.month.inv, 144, 'payout recorded as investment expense');
assert.ok(Number.isFinite(S.cash) && Number.isFinite(S.month.inv), 'finite totals');

console.log('story shares: ok');
