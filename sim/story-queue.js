/* Queue regression through the real Story/Engine/Rewind APIs.
   Run from repository root AFTER applying queue/story.patch:
     node sim/story-queue.js
   Isolated fixture scenes exercise scheduling, not the narrative branch graph. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.existsSync(path.join(__dirname, 'load.js'))
  ? path.resolve(__dirname, '..') : path.resolve(__dirname, '../../../..');
process.env.BK_STORY = '1';
process.env.BK_THREADS = '1';
const BK = require(path.join(root, 'sim/load.js'));
const ST = BK.Story, E = BK.Engine;
let checks = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };
const yes = (a, why) => { assert.ok(a, why); checks++; };
const originalScenes = BK.STORY.scenes, originalFamily = BK.STORY.family;
function fixture(id, extra = {}) {
  return Object.assign({ id, ch: 'own', title: id, form: 'dialogue', queueOnly: true,
    lines: [{ who: 'semyon', text: id }], choices: [{ label: 'Continue', effects: [
      { t: 'flag', k: id, v: 'resolved' }, { t: 'journal', text: id + ' resolved' },
    ] }] }, extra);
}
BK.STORY.scenes = [fixture('queueA'), fixture('queueB'), fixture('queueRepeat', { once: false }),
  fixture('queueFallback', { trigger: { any: [{ months: 0 }] }, fallback: { months: 1 } }), fixture('sf1')];
BK.STORY.family = [];
function fresh() {
  const S = E.newGame({ seed: 7919, city: 'ufa' });
  S.phase = 'play'; S.day = 90; S.cash = 1e7;
  const R = ST.ensure(S); R.f.proWired = 'no';
  S.ev = Object.assign({}, S.ev, { pending: null, recent: [] });
  if (S.chef) S.chef.pending = null;
  S.notify = [];
  return S;
}
const q = (id, day) => ({ kind: 'scene', id, day });
const pending = S => ST.state(S).pending && ST.state(S).pending.id;
const sceneNotifications = S => S.notify.filter(n => n.type === 'story' && n.phase === 'scene').map(n => n.id);
function answer(S, id) {
  eq(pending(S), id, id + ' is the actual pending scene');
  yes(ST.resolve(S, 0).ok, id + ' resolves through the real API');
  eq(ST.state(S).f[id], 'resolved', id + ' applies the actual flag effect');
}
try {
  {
    const S = fresh(), R = ST.state(S);
    ST.start(S, ST.scene('queueA'));
    const oldPending = Object.assign({}, R.pending);
    R.queue = [q('queueB', S.day), q('queueRepeat', S.day + 8)];
    eq(ST.start(S, ST.scene('queueB')), null, 'explicit start refuses to replace pending');
    ST.day(S);
    eq(R.pending, oldPending, 'a due scene preserves the current pending scene/date');
    eq(R.queue, [q('queueB', S.day), q('queueRepeat', S.day + 8)], 'pending preserves due/future queue deadlines');
    eq(sceneNotifications(S), ['queueA'], 'no replacement notification');
    answer(S, 'queueA');
    ST.day(S);
    eq(pending(S), 'queueB', 'the next scene opens after the answer');
    eq(R.queue, [q('queueRepeat', S.day + 8)], 'future scene stays scheduled');
  }
  {
    let S = fresh(), R = ST.state(S);
    R.queue = [q('queueA', S.day), q('queueB', S.day)];
    ST.day(S);
    eq(pending(S), 'queueA', 'two due scenes preserve FIFO order');
    eq(R.queue, [q('queueB', S.day)], 'second due scene survives the first start');
    eq(sceneNotifications(S), ['queueA'], 'at most one scene starts in one day call');
    S = JSON.parse(BK.Rewind.take(S).json); R = ST.ensure(S); S.notify = [];
    ST.day(S);
    eq(pending(S), 'queueA', 'save/load preserves the pending scene');
    eq(R.queue, [q('queueB', S.day)], 'save/load preserves the remaining due scene');
    eq(sceneNotifications(S), [], 'reload does not start another scene over pending');
    answer(S, 'queueA'); ST.day(S); answer(S, 'queueB');
    eq(R.queue, [], 'queue drains only after both actual answers');
    eq(R.log.filter(x => x.choice).map(x => x.id), ['queueA', 'queueB'], 'one resolved-choice history entry per scene');
  }
  {
    const S = fresh(), R = ST.state(S);
    R.queue = [q('queueA', S.day), q('queueA', S.day), q('queueB', S.day)];
    ST.day(S); answer(S, 'queueA');
    ST.day(S);
    eq(pending(S), 'queueB', 'duplicate seen-once scene is removed before opening next scene');
    eq(R.queue, [], 'seen-once duplicate does not remain stuck in the queue');
    eq(ST.start(S, ST.scene('queueA')), null, 'explicit start also rejects a seen once scene');
    answer(S, 'queueB');
    eq(ST.start(S, ST.scene('queueA')), null, 'seen once scene stays closed without pending');
    eq(R.log.filter(x => x.choice && x.id === 'queueA').length, 1, 'duplicate has no second effects/history');
    R.queue = [q('queueRepeat', S.day), q('queueRepeat', S.day)];
    ST.day(S); answer(S, 'queueRepeat');
    ST.day(S); answer(S, 'queueRepeat');
    eq(R.log.filter(x => x.choice && x.id === 'queueRepeat').length, 2, 'once:false permits distinct scheduled repeat answers');
    eq(R.queue, [], 'repeat queue drains correctly');
  }
  for (const cause of ['event', 'recent', 'chef']) {
    const S = fresh(), R = ST.state(S);
    R.queue = [q('queueA', S.day)];
    if (cause === 'event') S.ev.pending = { id: 'queue-test-event' };
    if (cause === 'recent') S.ev.recent = [{ day: S.day }];
    if (cause === 'chef') S.chef = Object.assign({}, S.chef, { pending: { id: 'queue-test-chef' } });
    ST.day(S);
    eq(pending(S), null, cause + ' defers a due scene');
    eq(R.queue, [q('queueA', S.day + 2)], cause + ' retains the existing two-day deferral');
    S.day += 2; ST.day(S);
    eq(pending(S), null, cause + ' remains blocked while its window/cooldown remains');
    S.ev.pending = null; S.ev.recent = [];
    if (S.chef) S.chef.pending = null;
    S.day += 2; ST.day(S);
    eq(pending(S), 'queueA', cause + ' deferred scene opens when the obstacle ends');
  }
  {
    const S = fresh(), R = ST.state(S);
    ST.day(S);
    eq(pending(S), null, 'queueOnly is excluded from natural fallback as well as the normal trigger loop');
    R.queue = [q('queueA', S.day + 5)]; ST.day(S);
    eq(pending(S), null, 'a future queue deadline cannot open early');
    eq(R.queue[0].day, S.day + 5, 'future deadline remains exact');
    S.day += 5; ST.day(S);
    eq(pending(S), 'queueA', 'a due scene opens exactly on its queue deadline');
  }
  {
    const S = fresh(), R = ST.state(S);
    S.day = 18 * 365; ST.day(S);
    eq(pending(S), null, 'eighteen years without victory does not invent a final scene');
    eq(R.queue, [], 'no final is scheduled without victory');
    S.won = true; ST.day(S);
    eq(R.queue, [q('sf1', S.day + 30)], 'victory schedules the existing final exactly thirty days later');
    yes(R.wonQueued, 'victory final schedule is recorded');
    ST.day(S);
    eq(R.queue.length, 1, 'repeated victory day does not duplicate the final');
    S.day += 29; ST.day(S);
    eq(pending(S), null, 'final cannot open one day before the scheduled date');
    S.day++; ST.day(S);
    eq(pending(S), 'sf1', 'final opens on victory plus thirty days');
    eq(R.queue, [], 'final schedule is consumed once');
    ST.day(S);
    eq(sceneNotifications(S), ['sf1'], 'final notification is emitted once while awaiting an answer');
  }
  {
    const S = fresh(), R = ST.state(S); R.queue = [q('queueA', S.day)];
    S.lost = true; ST.day(S);
    eq(pending(S), null, 'lost game does not start queued scenes');
    eq(R.queue.length, 1, 'lost game retains queue state');
    S.lost = false; R.mode = 'off'; ST.day(S);
    eq(pending(S), null, 'story off does not start queued scenes');
    eq(R.queue.length, 1, 'story off retains queue state');
  }
  {
    const S = fresh(), R = ST.state(S); S.day = 0;
    ST.start(S, ST.scene('queueA')); answer(S, 'queueA');
    eq(R.seen.queueA, 0, 'scene at day zero is recorded');
    eq(ST.fits(S, R, ST.scene('queueA')), false, 'day-zero scene cannot fit again');
    eq(ST.fits(S, R, fixture('afterZero', { trigger: { after: ['queueA'] } })), true, 'day-zero predecessor counts as seen');
    eq(ST.start(S, ST.scene('queueA')), null, 'day-zero scene cannot restart');
  }
  {
    const S = fresh(), R = ST.state(S);
    const fallback = id => fixture(id, { queueOnly: false,
      trigger: { after: ['queueA'], any: [{ cash: 1e20 }] }, fallback: { months: 1 } });
    BK.STORY.scenes = [fallback('fallbackSeenZero'), fallback('fallbackNext')];
    R.seen.queueA = 0; R.seen.fallbackSeenZero = 0;
    ST.day(S);
    eq(pending(S), 'fallbackNext', 'day-zero completed fallback cannot starve the next fallback');
    eq(R.pending.origin.kind, 'fallback', 'next scene opens through its real fallback path');
  }
  {
    const coverage = JSON.parse(fs.readFileSync(path.join(root, 'docs/story-branches-coverage.json'), 'utf8'));
    const bank = originalScenes.find(sc => sc.id === 'mosBank');
    yes(bank && bank.once === false, 'actual Moscow bank definition is repeatable');
    BK.STORY.scenes = [bank];
    for (const choice of [1, 2, 3]) {
      const target = coverage.successfulTargets.find(t => t.scene === 'mosBank' && t.choice === choice);
      yes(target, 'legally reached bank choice has an actual snapshot');
      let S = JSON.parse(fs.readFileSync(path.join(root, target.stateFile), 'utf8'));
      let R = ST.ensure(S);
      eq(pending(S), 'mosBank', 'actual bank pending survives snapshot load');
      yes(ST.canChoose(S, bank.choices[choice].need), 'bank alternative has real legal premises');
      yes(ST.resolve(S, choice).ok, 'bank alternative resolves');
      const next = R.queue.find(q => q.kind === 'scene' && q.id === 'mosBank');
      yes(next, 'extension/restructuring/penalty schedules the actual next bank scene');
      S = JSON.parse(BK.Rewind.take(S).json); R = ST.ensure(S);
      S.day = next.day - 1; ST.day(S);
      eq(pending(S), null, 'repeat bank demand cannot open early');
      S.day++; ST.day(S);
      eq(pending(S), 'mosBank', 'repeat bank demand opens on the promised day after reload');
      eq(R.pending.origin.kind, 'scheduled', 'bank repeat retains scheduled origin');
      yes(ST.resolve(S, 0).ok, 'repayment closes the repeated demand through real choice');
      eq(R.queue.filter(q => q.kind === 'scene' && q.id === 'mosBank'), [], 'full repayment schedules no further demand');
    }
  }
} finally {
  BK.STORY.scenes = originalScenes; BK.STORY.family = originalFamily;
}
console.log(`Story queue: ${checks} assertions passed`);
