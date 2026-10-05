/* Run only AFTER integration: node sim/story-choice-guard.js.
   Real Engine/Story/Rewind and actual StoryUI renderer. The synthetic scene
   isolates the eligibility boundary; sf1b below checks the real absent actor.
   Prepared without running any Engine/test while the parent's runner is active. */
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
BK.Threads.demo = false;
assert.equal(typeof ST.canChoose, 'function', 'Integrate the choice guard before running');
let checks = 0;
function eq(a, b, why) { assert.deepEqual(a, b, why); checks++; }
function ok(v, why) { assert.ok(v, why); checks++; }
function fresh(g) {
  const S = E.newGame({seed:7919, city:'ufa'});
  S.phase = 'play'; S.day = 365; ST.ensure(S);
  const R = ST.state(S);
  R.hero = {name:g === 'f' ? 'Анна' : 'Иван', g};
  R.f.proWired = 'no'; R.rel.oleg = 10; R.m.honesty = 20;
  R.f.guardPermit = 'yes'; R.f.guardAbsent = false;
  return S;
}
function reload(S) {
  const N = JSON.parse(BK.Rewind.take(S).json);
  ST.ensure(N); BK.Threads.ensure(N);
  if (BK.Corp && BK.Corp.applyGlobals) BK.Corp.applyGlobals(N);
  return N;
}
const oldDocument = global.document;
global.document = {readyState:'loading', addEventListener(){}, querySelector(){return null;}};
require(path.join(root, 'src/ui/choice-impact.js'));
require(path.join(root, 'src/ui/story-ui.js'));
const UI = BK.StoryUI;
function disabled(S, index) {
  BK.App = {state:S};
  const sc = ST.pendingScene(S);
  UI.ui.line = Math.max(0, sc.lines.length - 1);
  const html = UI.sceneHtml(S, sc);
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)]
    .filter(m => /data-act="storyPick"/.test(m[1]));
  eq(buttons.length, sc.choices.length, 'renderer preserves the choices');
  const b = buttons.find(m => new RegExp('data-arg="' + index + '"').test(m[1]));
  ok(b, 'target button exists');
  return /\bdisabled\b/.test(b[1]);
}
const BOTH = {rel:{oleg:10}, meter:{honesty:20}, flag:{guardPermit:'yes'}, noFlag:{guardAbsent:true}};
const cases = [
  ...[9,10,11].map(n => ({name:'rel '+n, need:{rel:{oleg:10}}, set:R=>R.rel.oleg=n, allowed:n>=10})),
  ...[19,20,21].map(n => ({name:'meter '+n, need:{meter:{honesty:20}}, set:R=>R.m.honesty=n, allowed:n>=20})),
  {name:'flag match', need:{flag:{guardPermit:'yes'}}, set(){}, allowed:true},
  {name:'flag mismatch', need:{flag:{guardPermit:'yes'}}, set:R=>R.f.guardPermit='no', allowed:false},
  {name:'noFlag absent', need:{noFlag:{guardAbsent:true}}, set(){}, allowed:true},
  {name:'noFlag present', need:{noFlag:{guardAbsent:true}}, set:R=>R.f.guardAbsent=true, allowed:false},
  {name:'combined passes', need:BOTH, set(){}, allowed:true},
  {name:'combined rel fails', need:BOTH, set:R=>R.rel.oleg=9, allowed:false},
  {name:'combined meter fails', need:BOTH, set:R=>R.m.honesty=19, allowed:false},
  {name:'combined flag fails', need:BOTH, set:R=>R.f.guardPermit='no', allowed:false},
  {name:'combined noFlag fails', need:BOTH, set:R=>R.f.guardAbsent=true, allowed:false},
];
const definitions = JSON.stringify(BK.STORY.scenes);
const target = {id:'__choice_guard_fixture', ch:'own', title:'Проверка выбора',
  who:['oleg'], trigger:{}, lines:[{who:'oleg', text:'Вы {ready}?'}], choices:[]};
BK.STORY.scenes.push(target);
try {
  for (const g of ['m','f']) for (const form of ['multi','single','letter']) for (const c of cases) {
    let S = fresh(g), R = ST.state(S);
    c.set(R); target.form = form === 'letter' ? 'letter' : 'scene';
    target.choices = [{label:'Я {ready}', need:c.need, effects:[
      {t:'rel', who:'oleg', add:3}, {t:'meter', k:'care', add:4},
      {t:'flag', k:'guardResolved', v:true}, {t:'schedule', id:'s01', after:[5,10]},
    ]}];
    if (form === 'multi') target.choices.push({label:'Отложить', effects:[]});
    ST.start(S, target);
    const original = JSON.stringify(S);
    eq(ST.canChoose(S,c.need),c.allowed,c.name+' predicate');
    eq(JSON.stringify(S),original,'eligibility query is pure including all RNG');
    eq(disabled(S,0),!c.allowed,c.name+' UI matches API ('+g+', '+form+')');
    S = reload(S); R = ST.state(S);
    eq(ST.pendingScene(S).id,target.id,'pending survives real snapshot serialization');
    const before = JSON.stringify(S), queue = R.queue.length, log = R.log.length;
    const relation = R.rel.oleg, care = R.m.care;
    const out = ST.resolve(S,0);
    eq(out.ok,c.allowed,c.name+' resolution');
    if (!c.allowed) {
      ok(typeof out.msg === 'string' && out.msg.length > 0,'blocked API explains refusal');
      eq(JSON.stringify(S),before,'blocked resolve changes no field or random stream');
      eq(ST.pendingScene(S).id,target.id,'blocked choice preserves pending dialog');
      S = reload(S); R = ST.state(S);
      eq(disabled(S,0),true,'blocked button remains blocked after reload');
      // Changing requirements legitimately allows the same pending choice later.
      R.rel.oleg=10; R.m.honesty=20; R.f.guardPermit='yes'; R.f.guardAbsent=false;
      eq(disabled(S,0),false,'pending choice unlocks when actual requirements are met');
      ok(ST.resolve(S,0).ok,'unlocked pending choice resolves');
      eq(R.rel.oleg,13,'unlocked relation effect applied once');
    } else {
      eq(R.rel.oleg,relation+3,'legal relation effect applied');
    }
    R = ST.state(S);
    eq(R.m.care,care+4,'meter effect applied exactly once');
    eq(R.f.guardResolved,true,'flag effect applied');
    eq(R.queue.length,queue+1,'random schedule effect enqueued once');
    ok(R.queue[queue].day >= S.day+5 && R.queue[queue].day <= S.day+10,'schedule uses legal random delay');
    eq(R.log.length,log+1,'one actual choice in chronicle');
    eq(R.seen[target.id],S.day,'actual seen mark');
    eq(ST.pendingScene(S),null,'successful choice closes pending');
    S = reload(S); R = ST.state(S);
    const closed = JSON.stringify(S);
    eq(ST.resolve(S,0).ok,false,'reloaded closed dialog cannot resolve twice');
    eq(JSON.stringify(S),closed,'second resolve does not repeat any effect/RNG');
    eq(ST.fits(S,R,target),false,'once scene remains ineligible after reload');
  }
  for (const g of ['m','f']) for (const absent of ['rashid','gulya']) {
    let S = fresh(g), R = ST.state(S); R.rel.rashid=100; R.rel.gulya=100;
    if (absent === 'rashid') R.f.rashidGone=true; else R.f.gulya='poached';
    ST.start(S,ST.scene('sf1b')); S=reload(S);
    eq(disabled(S,2),true,'real absent council member blocks UI');
    const before = JSON.stringify(S);
    eq(ST.resolve(S,2).ok,false,'direct API cannot bypass absent council member');
    eq(JSON.stringify(S),before,'real rejected council leaves all state untouched');
    eq(ST.pendingScene(S).id,'sf1b','real rejected council remains pending');
  }
  const empty = {rng:19};
  eq(ST.canChoose(empty,null),true,'no requirements remain free without story');
  eq(ST.canChoose(empty,{flag:{guardPermit:'yes'}}),false,'required choice fails with no story state');
  eq(empty,{rng:19},'predicate does not manufacture a missing story');
} finally {
  BK.STORY.scenes.pop(); global.document = oldDocument;
}
eq(JSON.stringify(BK.STORY.scenes),definitions,'fixture leaves original shared definitions intact');
console.log('Story choice guard: '+checks+' checks passed');
