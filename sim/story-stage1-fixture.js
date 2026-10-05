/* Assisted Stage1 branch fixture. Natural card triggers; this revision has not been runtime-tested.
   prepareStage1(BK, stateAfterRealPrologue, {hire:'aidar'|'lara'|'gulya', assistance:[]})
   Plays actual choices, progresses the coffee shop using Engine.tick, and finishes
   through openSecond -> s18:0 -> finish -> chooseProduction. No story flags/seen writes. */
'use strict';
function prepareStage1(BK, S, options = {}) {
  const E = BK.Engine, S1 = BK.Stage1, ST = BK.Story;
  const assistance = options.assistance || [];
  const decisions = [], errors = [];
  const hire = options.hire || 'aidar';
  const maxDays = options.maxDays || 900;
  const add = (kind, extra) => assistance.push(Object.assign({ day: S.day, kind }, extra));
  const fail = msg => { throw new Error(msg); };
  const want = (r, what) => { if (!r || r.ok === false) fail(what + ': ' + (r && r.msg || 'failed')); return r; };
  const topUp = reason => {
    if (!options.cashFloor || S.cash >= options.cashFloor) return;
    const before = S.cash; S.cash = options.cashFloor;
    add('stage1-cash-floor', { reason, before, after: S.cash, injected: S.cash - before });
  };
  if (!S.story || !S.prologue) return { ok: false, state: S, errors: ['Stage1 requires the actual completed prologue state'], assistance, decisions };
  if (S.stage1) return { ok: false, state: S, errors: ['Fresh Stage1 state required; refusing to reset existing coffee shop'], assistance, decisions };
  const storyWasOn = BK.CFG.STORY.ON;
  try {
    // Ordinary Story.tick currently runs during Stage1 too. Disable only that
    // global hook while the isolated fixture runs, then restore in finally.
    BK.CFG.STORY.ON = false;
    add('stage1-main-story-hook-suppressed', { previous: storyWasOn });
    S1.start(S); topUp('opening');
    const choices = S.stage1.spots.map((sp, i) => {
      const cost = S1.spotCost(S, sp), preview = S1.spotPreview(S, sp);
      return { i, affordable: cost.left >= 0, score: preview.guests * preview.check * 30 * 0.55 - sp.area * sp.rentM2 };
    }).filter(x => x.affordable).sort((a, b) => b.score - a.score);
    if (!choices.length) fail('No affordable coffee island; request explicit cashFloor coverage assistance');
    want(S1.pick(S, choices[0].i), 'Stage1.pick');
    const spot = S.stage1.spot, st = S1.store(S), dp = E.daypartOf(st);
    const hours = spot.hours.slice().sort((a, b) => S1.hoursCover(dp, b) / Math.sqrt(BK.CFG.STAGE1.HOURS[b].hp) - S1.hoursCover(dp, a) / Math.sqrt(BK.CFG.STAGE1.HOURS[a].hp));
    want(S1.setHours(S, hours[0]), 'Stage1.setHours');
    want(S1.setDayOff(S, true), 'Stage1.setDayOff');
    const menu = E.menuStats(S), base = menu.avgPrice * BK.CFG.ITEMS_PER_CHECK;
    const price = Math.max(0.85, Math.min(1.1, st.solv * S.macro.priceLevel / base * 0.97));
    for (const item of S.menu) E.setPrice(S, item.id, price);
    const required = ['s13', 's15', 's17'];
    const counts = () => Object.fromEntries(required.map(id => [id, decisions.filter(d => d.id === id).length]));
    const requested = { s13: '«Договорились»', s17: '«Продавайте. Вы заслужили отдых»' };
    if (ST.state(S).f.mentor === 'enemy') fail('Enemy mentor profile is incompatible with the natural s17 letter; use warm profile');
    function indexFor(cv) {
      if (requested[cv.id] != null) {
        const index = cv.choices.findIndex(c => c.label === requested[cv.id]);
        if (index < 0) fail('Requested natural Stage1 choice missing: ' + cv.id + ' ' + requested[cv.id]);
        return index;
      }
      if (cv.id === 's15') {
        const label = hire === 'lara' ? 'Лариса' : hire === 'aidar' ? 'Айдар' : null;
        const index = label ? cv.choices.findIndex(c => c.label === label) : cv.choices.findIndex(c => /Гуля, выходи/.test(c.label));
        if (index < 0) fail('Requested candidate missing from real dynamic s15 choices: ' + hire);
        return index;
      }
      if (cv.id === 's18') return 0;
      const legal = cv.choices.map((c, i) => ({ c, i })).filter(x => x.c.can);
      if (!legal.length) fail('No legal Stage1 choice: ' + cv.id);
      if (cv.id === 's16' && cv.choices[1] && cv.choices[1].can) return 1;
      return legal.sort((a, b) => (a.c.cost || 0) - (b.c.cost || 0))[0].i;
    }
    function drain() {
      let guard = 0;
      while (S1.card(S)) {
        if (++guard > 100) fail('Stage1 card drain did not terminate');
        topUp('choice');
        const cv = S1.card(S);
        if (required.includes(cv.id) && counts()[cv.id] !== 0) fail('Natural Stage1 target card repeated before applying duplicate effects: ' + cv.id);
        if (required.includes(cv.id) && S.day <= 0) fail('Natural Stage1 target card arrived on day zero: ' + cv.id);
        const i = indexFor(cv), choice = cv.choices[i];
        if (!choice || !choice.can) fail('Requested real Stage1 option blocked: ' + cv.id + ':' + i);
        want(S1.choose(S, i), 'Stage1.choose ' + cv.id + ':' + i);
        decisions.push({ id: cv.id, index: i, label: choice.label, day: S.day });
      }
    }
    // Target cards must be produced by Stage1's normal state/time triggers.
    // Never admit cards explicitly: day-zero seen entries previously permitted
    // an accidental natural replay and doubled the Oleg relationship changes.
    for (let n = 0; n < maxDays && S.stage1.status !== 'done'; n++) {
      drain();
      if (S.stage1.status === 'failed' || S.lost) fail('Stage1 failed before real readiness');
      if (S.stage1.status === 'ready' && required.every(id => counts()[id] === 1)) {
        want(S1.openSecond(S), 'Stage1.openSecond');
        drain();
        continue;
      }
      topUp('daily-cash-floor');
      const before = S.day;
      E.tick(S);
      if (S.day <= before) fail('Real Engine.tick did not advance Stage1');
    }
    if (S.stage1.status !== 'done') fail('No real Stage1 readiness/finish with all natural target cards within ' + maxDays + ' days; counts=' + JSON.stringify(counts()) + '; do not fabricate status/streak/months');
    if (!required.every(id => counts()[id] === 1)) fail('Natural Stage1 targets must each resolve exactly once: ' + JSON.stringify(counts()));
    if (!required.every(id => S.stage1.seen[id] > 0 && ST.state(S).seen[id] > 0)) fail('Natural target cards lack positive-day Stage1/Story resolution records');
    if (!decisions.some(d => d.id === 's18' && d.index === 0)) fail('Stage1 finish lacks actual s18 choice');
    const f = ST.state(S).f;
    if (f.kalach !== 'dvor' || (hire !== 'gulya' && f.hire1 !== hire) || (hire === 'gulya' && !S.stage1.flags.gulyaIn)) fail('Actual Stage1 outcomes do not match requested profile');
    if (options.requireSpy && !f.laraSpy) fail('This real Stage1 RNG seed did not make Larisa a spy; try a fresh seed, never force laraSpy');
    if (S.phase === 'setup_prod') {
      topUp('network-production');
      const offer = S.prodOffers.slice().sort((a, b) => E.prodOpenCost(S, a).total - E.prodOpenCost(S, b).total)[0];
      if (!offer) fail('Stage1.finish produced no production offers');
      want(E.chooseProduction(S, offer.id), 'real network chooseProduction');
    }
    if (S.phase !== 'play') fail('Stage1-to-network wrapper did not reach play');
    add('real-stage1-to-network', { hire, hire1: f.hire1, laraSpy: !!f.laraSpy, kalach: f.kalach, oleg: ST.state(S).rel.oleg, days: S.day, storeId: S.stage1.storeId, naturalTargetCounts: counts() });
    return { ok: true, state: S, assistance, decisions, errors, minOlegAfterStage1: ST.state(S).rel.oleg };
  } catch (e) {
    errors.push(e.message);
    return { ok: false, state: S, assistance, decisions, errors };
  } finally {
    BK.CFG.STORY.ON = storyWasOn;
  }
}
module.exports = { prepareStage1 };
