/* Integration assertions for the combined story-depth patch.
   Run AFTER applying all patches, from the repository root:
     node tmp/story-depth/tests/sim/story-depth.js
   Or after moving this file into sim/:
     node sim/story-depth.js
   Prepared during 0.9.12 isolation; do not execute against the map release.
   Real Engine/Story/Threads API, no bot; minimal document adapter only renders
   StoryUI's own disabled buttons. Browser layout remains a separate QA step. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = fs.existsSync(path.join(__dirname, 'load.js'))
  ? path.resolve(__dirname, '..') : path.resolve(__dirname, '../../../..');
process.env.BK_STORY = '1';
process.env.BK_THREADS = '1';
const BK = require(path.join(root, 'sim/load.js'));
const E = BK.Engine, ST = BK.Story, T = BK.Threads;
assert.equal(typeof ST.sceneView, 'function', 'Apply the story-depth patch before running this test');
T.demo = false;
let checks = 0;
function equal(actual, expected, why) { assert.deepEqual(actual, expected, why); checks++; }
function truth(value, why) { assert.ok(value, why); checks++; }
function fresh() {
  const S = E.newGame({ seed: 7919, city: 'ufa' });
  S.phase = 'play'; S.day = 7 * 365; S.cash = 1e9; S.lastMonthRev = 1e8;
  ST.ensure(S); ST.state(S).f.proWired = 'no';
  ST.state(S).seen.s22 = 1;
  return S;
}
function reload(S) {
  // Use the real snapshot serializer, including its cache/notification stripping.
  const N = JSON.parse(BK.Rewind.take(S).json);
  ST.ensure(N); T.ensure(N);
  if (BK.Corp && BK.Corp.applyGlobals) BK.Corp.applyGlobals(N);
  return N;
}
// Load actual StoryUI without firing DOM-ready boot. No fake need predicate.
const previousDocument = global.document;
global.document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; } };
require(path.join(root, 'src/ui/choice-impact.js'));
require(path.join(root, 'src/ui/story-ui.js'));
const UI = BK.StoryUI;
assert.ok(UI, 'StoryUI must expose its real renderer');
function shown(S) {
  BK.App = { state: S };
  const sc = ST.pendingScene(S); truth(sc, 'real pending scene exists');
  UI.ui.line = Math.max(0, sc.lines.length - 1);
  const html = UI.sceneHtml(S, sc);
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)]
    .filter(m => /data-act="storyPick"/.test(m[1]));
  const indices = buttons.map(m => +(m[1].match(/data-arg="(\d+)"/) || [])[1]);
  equal(indices, sc.choices.map((_, i) => i), sc.id + ': presentation preserves choice indices');
  return { sc, buttons, html };
}
function canChoose(S, i) {
  const { buttons } = shown(S);
  const b = buttons.find(m => new RegExp('data-arg="' + i + '"').test(m[1]));
  truth(b, 'button ' + i + ' is present');
  return !/\bdisabled\b/.test(b[1]);
}
function begin(S, id) {
  const sc = ST.scene(id); truth(sc, id + ' exists');
  ST.start(S, sc);
  equal(ST.pendingScene(S).id, id, id + ' is selected through real start/pending');
  return ST.pendingScene(S);
}
function choose(S, id, idx) {
  begin(S, id); truth(canChoose(S, idx), id + ':' + idx + ' available in actual UI');
  const out = ST.resolve(S, idx);
  truth(out.ok, id + ':' + idx + ' resolved');
  equal(out.scene.id, id, 'same scene resolved');
  equal(out.choice.label, ST.scene(id).choices[idx].label, 'same choice index resolved');
  equal(ST.pendingScene(S), null, 'resolve removes pending scene');
  return out;
}

// Already introduced partners survive changes in player behaviour and save/load.
for (const kind of ['helper', 'tyrant']) {
  let S = fresh(), R = ST.state(S);
  R.m = { honesty: kind === 'helper' ? 50 : -50, fair: 0, care: 0, risk: 0 };
  ST.day(S); equal(R.f.mateKind, kind, 'character introduces ' + kind);
  S = reload(S); R = ST.state(S);
  R.m = { honesty: kind === 'helper' ? -100 : 100, fair: 0, care: 0, risk: 0 };
  ST.day(S); equal(R.f.mateKind, kind, 'saved ' + kind + ' does not change personality');
}
{
  const S = fresh(), R = ST.state(S); R.m = { honesty: 0, fair: 0, care: 0, risk: 0 };
  ST.day(S); equal(R.f.mateKind, 'none', 'neutral behaviour introduces nobody');
  R.m.honesty = 100; ST.day(S); equal(R.f.mateKind, 'helper', 'none may become a new helper later');
}

// Every legal kd1 outcome has a usable recovery through the real kd2 UI.
for (const origin of ['owe', 'shadow']) {
  for (const first of [0, 1, 2]) {
    let S = fresh(), R = ST.state(S); R.f.lineDamir = origin;
    begin(S, 'kd1');
    if (!canChoose(S, first)) {
      equal([origin, first], ['shadow', 0], 'only original owed brigadier gate excludes this profile');
      continue;
    }
    const x = ST.resolve(S, first); truth(x.ok, 'kd1 legal option resolved');
    S = reload(S); R = ST.state(S);
    truth(ST.fits(S, R, ST.scene('kd2')), 'kd2 follows actual kd1 outcome');
    const cash = S.cash;
    choose(S, 'kd2', 1);
    equal(cash - S.cash, 120000, 'investigation has the advertised exact cost');
    equal(R.f.lineDamir, 'trusted', 'investigation recovers trust');
    S = reload(S); S.day = 12 * 365; R = ST.state(S);
    truth(ST.fits(S, R, ST.scene('kd3')), 'recovered kd2 reaches kd3');
    choose(S, 'kd3', 0); equal(R.f.lineDamir, 'boss', 'recovered player can appoint Damir');
  }
}

// The neutral final is a real completed outcome without silently adding a moral score.
{
  let S = fresh(), R = ST.state(S); R.f.lineDamir = 'served'; R.seen.kd2 = 1;
  const warm = R.f.lineWarm || 0, cold = R.f.lineCold || 0;
  choose(S, 'kd3', 2);
  equal([R.f.lineDamir, R.f.damirStep], ['worker', 3], 'Damir remains a shift worker, line complete');
  equal([R.f.lineWarm || 0, R.f.lineCold || 0], [warm, cold], 'neutral outcome does not vote for either book');
  S = reload(S); R = ST.state(S);
  begin(S, 'sf2');
  truth(ST.pendingScene(S).lines.some(l => /ключи от смены/.test(l.text)), 'final remembers neutral Damir');
}

// Presentation views neither mutate shared data nor revive an absent mentor.
const originalScenes = JSON.stringify(BK.STORY.scenes);
for (const id of ['kd2', 'kd3', 'sf1b']) {
  let S = fresh(), R = ST.state(S); R.f.rashidGone = true;
  begin(S, id); S = reload(S); R = ST.state(S);
  const v = shown(S).sc;
  truth(v.lines.every(l => l.who !== 'rashid'), id + ' has no live Rashid after loading');
  equal(v.choices.map(c => c.label), ST.scene(id).choices.map(c => c.label), 'views keep choice order');
  if (id === 'sf1b') {
    R.rel.rashid = 100; R.rel.gulya = 100;
    truth(!canChoose(S, 2), 'live Rashid council is disabled even with high relations');
  }
}
{
  const S = fresh(), R = ST.state(S); R.rel.rashid = 100; R.rel.gulya = 100;
  begin(S, 'sf1b'); truth(canChoose(S, 2), 'live council available while Rashid is present');
  R.f.gulya = 'poached'; truth(!canChoose(S, 2), 'live council unavailable after Gulya left');
  truth(ST.pendingScene(S).lines.some(l => l.who === 'oleg' && /мой цех/.test(l.text)), 'Oleg represents departed Gulya');
}
{
  const S = fresh(), R = ST.state(S);
  choose(S, 'kf3', 2); equal(R.f.mateWork, 'no', 'real refusal selects no-partner outcome');
  S.day = 14 * 365; truth(ST.fits(S, R, ST.scene('kf4')), 'kf4 follows the real refusal');
  begin(S, 'kf4'); const v = shown(S).sc;
  truth(v.lines.some(l => /каждый занимается своим/.test(l.text)), 'no-partner branch acknowledges the actual refusal');
  truth(v.lines.every(l => !/два начальника/.test(l.text)), 'no imaginary second boss');
  const before = S.loyaltyMod;
  truth(canChoose(S, 3), 'no-partner branch still has a legal exit');
  ST.resolve(S, 3); equal(S.loyaltyMod - before, 4, 'same choice index gives its original team effect');
}
equal(JSON.stringify(BK.STORY.scenes), originalScenes, 'views do not mutate shared scene definitions');

// Kin rewards are applied by Engine exactly once; no ghost additive modifier.
for (const [id, idx, delta] of [['kf1', 0, 2], ['kf2', 2, -2]]) {
  let S = fresh(), before = S.loyaltyMod;
  choose(S, id, idx);
  equal(S.loyaltyMod - before, delta, id + ' additive kin reward reaches real team state');
  truth(!S.mods.some(m => m.t === 'loyalty' && m.m == null), 'no invalid loyalty multiplier left');
  S = reload(S); const after = S.loyaltyMod;
  truth(!ST.resolve(S, idx).ok, 'closed scene cannot be paid twice');
  equal(S.loyaltyMod, after, 'no second kin payment after reload');
}

// Agreement and first council share one merger reward, including after reload.
{
  let S = fresh(), R = ST.state(S); R.rel.oleg = 100;
  choose(S, 'sf1', 0);
  equal(R.perks.filter(x => x === 'twocrusts').length, 1, 'agreement grants merger once');
  const mods = JSON.parse(JSON.stringify(S.mods));
  S = reload(S); R = ST.state(S);
  choose(S, 'sf1b', 0);
  equal(R.perks.filter(x => x === 'twocrusts').length, 1, 'council does not grant duplicate merger');
  equal(S.mods, mods, 'council adds no duplicate multiplier');
  equal(R.f.olegEnd, 'merge', 'merger outcome survives save/load');
  S = reload(S); truth(!ST.resolve(S, 0).ok, 'resolved council cannot grant a third reward');
}
if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
console.log(JSON.stringify({ ok: true, checks, method: 'real Story/Engine/Threads and renderer; no bot', scope: 'targeted integration; full branch coverage and browser QA still required' }, null, 2));
