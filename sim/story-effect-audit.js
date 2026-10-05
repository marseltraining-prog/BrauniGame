/* Contract audit for a REAL pending Story.resolve, not a reachability fixture.
   Caller: const pre = audit.snapshot(S); const out = ST.resolve(S,idx);
           const report = audit.check(BK,S,sc,idx,pre,out);
   This module loads no game, creates no fabricated gates and runs no bot. */
'use strict';
const {isDeepStrictEqual} = require('node:util');
const clone = x => JSON.parse(JSON.stringify(x));
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
function snapshot(S) {
  const BK = globalThis.BK;
  if (!BK || !BK.Rewind || !BK.Rewind.take) throw new Error('Real BK.Rewind.take is required');
  const json = BK.Rewind.take(S).json;
  return {json, state:JSON.parse(json)};
}
function check(BK,S,sc,idx,before,result) {
  const errors=[], unsupported=new Set(), declaredChecks={}, effectCounts={}, encountered=new Set();
  let checks=0;
  const label = sc.id+':'+idx;
  function expect(cond, why, group) {
    checks++; declaredChecks[group]=(declaredChecks[group]||0)+1;
    if (!cond) errors.push(label+' '+why);
  }
  // Compare JSON-durable contracts: live objects may carry optional undefined
  // properties that the real serializer intentionally drops.
  const durable=x=>x===undefined?undefined:clone(x);
  const eq=(a,b,why,group)=>expect(isDeepStrictEqual(durable(a),durable(b)),why,group);
  const near=(a,b,why,group)=>expect(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1e-6,Math.abs(b)*1e-12),why+' (actual '+a+', expected '+b+')',group);
  const B=before.state, R=B.story, A=S.story, choice=(sc.choices||[])[idx];
  expect(!!R && !!R.pending && R.pending.id===sc.id,'audit input was the actual pending scene','resolution');
  expect(!!choice,'same requested choice exists','resolution');
  expect(!!result && result.ok===true,'actual choice resolved successfully','resolution');
  if (!choice || !R || !A || !result || !result.ok) return {errors,checks,declaredChecks,effectCounts,unsupported:[],encountered:[]};
  expect(result.scene && result.scene.id===sc.id,'result identifies the requested scene','resolution');
  eq(A.pending,null,'pending closed','resolution'); eq(A.seen[sc.id],B.day,'seen records actual day','resolution');
  const effects=choice.effects||[], flags={}, rel=clone(R.rel||{}), meters=clone(R.m||{});
  let moneyDelta=0, loan= B.loan||0, loyalty=B.loyaltyMod||0;
  const perks=(R.perks||[]).slice(), perkMods=[], shares=clone(R.shares||[]);
  const queue=(R.queue||[]).map(x=>({exact:x}));
  const oldThreads=(B.threads && B.threads.list)||[];
  let threads=oldThreads.map(x=>({exact:x})), threadN=B.threads ? B.threads.n||0 : 0;
  const closed=clone(B.threads && B.threads.closed || {}), famSeen=clone(R.famSeen||{});
  let famNext=R.famNext, touchedLoyalty=false;
  const sev=BK.Engine.diffK(B,'sev');
  function scaled(add) { return add<0 ? Math.round(add*sev) : add; }
  function appendThread(rec,isFamily) {
    if (!BK.Threads) { unsupported.add('thread: Threads unavailable'); return; }
    const from=rec.from!=null?rec.from:B.day;
    const item={id:rec.id||('th'+(++threadN)),who:rec.who||'знакомый',src:rec.src||null,
      from,due:Math.round(rec.due!=null?rec.due:from+(rec.after!=null?rec.after:365)),done:false};
    if (!isFamily && BK.STORY_CAST && BK.STORY_CAST.swap && BK.STORY_CAST.cityOf(B)!=='ufa')
      item.who=BK.STORY_CAST.swap(B,rec.who||'') || 'знакомый';
    threads.push({fields:item}); if (threads.length>40) threads.shift();
  }
  for (const fx of effects) {
    encountered.add(fx.t); effectCounts[fx.t]=(effectCounts[fx.t]||0)+1;
    switch(fx.t) {
      case 'cash': {
        // Public event-money contract: fixed/per-active-store money is indexed,
        // revenue percentage uses the previous month and the published 1m floor.
        let amount=0;
        if (fx.v!=null) amount=fx.v<0?fx.v*sev:fx.v;
        else if (fx.perStore!=null) amount=(fx.perStore<0?fx.perStore*sev:fx.perStore)*Math.max(1,(B.stores||[]).filter(st=>st.status!=='opening').length);
        if (fx.v!=null || fx.perStore!=null) amount*=B.macro.priceLevel;
        else if (fx.revPct!=null) amount=(fx.revPct<0?fx.revPct*sev:fx.revPct)*Math.max(B.lastMonthRev,1000000);
        moneyDelta+=Math.round(amount); break;
      }
      case 'loan': {
        // Bank limit is a public read-only API, not an emulation of takeLoan.
        const amount=Math.max(0,Math.min(Math.round(fx.v||0),BK.Engine.loanLimit(B)-loan));
        loan+=amount; moneyDelta+=amount; break;
      }
      case 'rel': rel[fx.who]=clamp((rel[fx.who]||0)+fx.add,-100,100); break;
      case 'meter': meters[fx.k]=clamp((meters[fx.k]||0)+fx.add,-100,100); break;
      case 'flag': flags[fx.k]=fx.v; break;
      case 'perk': {
        const p=(BK.STORY.perks||{})[fx.id];
        if (!p) { unsupported.add('perk: undefined '+fx.id); break; }
        if (fx.id==='twocrusts' && perks.includes(fx.id)) break;
        perks.push(fx.id);
        for (const m of p.mods||[]) {
          if (m.t==='loyalty' && m.add!=null) {loyalty=clamp(loyalty+scaled(m.add),-30,30);touchedLoyalty=true;}
          else perkMods.push({t:m.t,m:m.m,until:B.day+(m.d||90),scope:m.scope||'global',src:'story'});
        }
        if (p.flag) flags[p.flag.k]=p.flag.v;
        break;
      }
      case 'loyalty': loyalty=clamp(loyalty+scaled(fx.add),-30,30);touchedLoyalty=true;break;
      case 'share': shares.push({who:fx.who,what:fx.what,pct:fx.pct,buyout:fx.buyout});break;
      case 'schedule': {
        const a=fx.after, range=Array.isArray(a);
        queue.push({fields:{kind:'scene',id:fx.id,p:fx.p},
          min:B.day+(range?Math.round(Math.min(a[0],a[1])):(a||30)),
          max:B.day+(range?Math.round(Math.max(a[0],a[1])):(a||30))});
        break;
      }
      case 'deferOpen': queue.push({exact:{kind:'deferOpen',days:fx.days||3,day:B.day}});break;
      case 'unthread': {
        threads=threads.filter(x=>{
          const t=x.exact||x.fields;
          const match=(fx.src&&t.src===fx.src)||(fx.id&&t.id===fx.id)||(fx.who&&t.who===fx.who);
          if(match && t.src) closed[t.src]=B.day;
          return !match;
        });break;
      }
      case 'thread': if (fx.rec) appendThread(fx.rec,false); else unsupported.add('thread: missing rec');break;
      case 'fam': {
        const def=fx.def && typeof fx.def==='object' ? fx.def : BK.Story.famDefs().find(x=>x.id===fx.id);
        if (!def) {unsupported.add('fam: undefined '+fx.id);break;}
        const open=threads.some(x=>{const t=x.exact||x.fields;return t.src==='family'&&!t.done;});
        if (famSeen[def.id] || open || !BK.Threads) break;
        appendThread({id:'fam-'+def.id,who:BK.Story.famName(def),src:'family',due:B.day+(fx.days||def.days||4)},true);
        famSeen[def.id]=B.day;famNext=B.day+(def.gap||0);break;
      }
      // These get a serialization/replay comparison, but no independent effect
      // oracle here. Core staff/mod/offer effects have separate Engine tests.
      default: unsupported.add(fx.t);break;
    }
  }
  near((S.cash+S.reserve)-(B.cash+B.reserve),moneyDelta,'cash + reserve signed delta','money');
  near(S.loan||0,loan,'actual loan respects available bank room, including partial draw','money');
  eq(A.rel,rel,'relations clamp to their contract boundaries','relations');
  eq(A.m,meters,'hidden styles clamp to their contract boundaries','meters');
  for (const k of Object.keys(flags)) eq(A.f[k],flags[k],'flag '+k+' reflects final ordered effect','flags');
  eq(A.perks,perks,'perk membership/order/deduplication','perks');
  // Generic core modifiers may coexist with perk modifiers; examine only the
  // appended src:story entries, without duplicating core addMod implementation.
  const modsAdded=(S.mods||[]).slice((B.mods||[]).length).filter(m=>m.src==='story');
  eq(clone(modsAdded),clone(perkMods),'exact perk modifier magnitude/scope/expiry','perks');
  eq((S.mods||[]).slice(0,(B.mods||[]).length),B.mods||[],'existing modifiers preserved at resolution','perks');
  for (const mod of (S.mods||[]).slice((B.mods||[]).length).filter(m=>m.scope==='global' && Number.isFinite(m.m))) {
    // Independent expiry boundary: exercise the real multiplier on a separate
    // serialized state with this modifier isolated, never fast-forward the game.
    const boundary=JSON.parse(BK.Rewind.take(S).json); boundary.mods=[clone(mod)];
    boundary.day=mod.until-1;
    near(BK.Engine._int.modMult(boundary,mod.t),mod.m,'modifier active immediately before its deadline','expiry');
    boundary.day=mod.until;
    near(BK.Engine._int.modMult(boundary,mod.t),1,'modifier expires exactly on its deadline','expiry');
    const restored=JSON.parse(BK.Rewind.take(boundary).json);
    near(BK.Engine._int.modMult(restored,mod.t),1,'expired modifier stays inactive after reload','expiry');
  }
  if(touchedLoyalty) eq(S.loyaltyMod,loyalty,'additive perk/team loyalty applied once','perks');
  eq(clone(A.shares||[]),clone(shares),'shares amount/owner/buyout appended exactly once','shares');
  eq((A.queue||[]).length,queue.length,'story queue length (no duplicate schedules)','queue');
  queue.forEach((x,i)=>{
    const actual=(A.queue||[])[i];
    if(x.exact) eq(actual,x.exact,'queue entry '+i+' exact contract','queue');
    else {
      for(const k of Object.keys(x.fields)) eq(actual&&actual[k],x.fields[k],'schedule '+i+' '+k,'queue');
      expect(!!actual && Number.isInteger(actual.day) && actual.day>=x.min && actual.day<=x.max,'schedule '+i+' due within advertised range','queue');
    }
  });
  const afterThreads=S.threads && S.threads.list || [];
  eq(afterThreads.length,threads.length,'thread clear/add count, including registry cap40','threads');
  threads.forEach((x,i)=>{
    if(x.exact) eq(afterThreads[i],x.exact,'retained thread '+i+' unchanged','threads');
    else for(const k of Object.keys(x.fields)) eq(afterThreads[i]&&afterThreads[i][k],x.fields[k],'new thread '+i+' '+k,'threads');
  });
  if(BK.Threads && effects.some(f=>['thread','fam','unthread'].includes(f.t))) {
    eq(S.threads && S.threads.n || 0,threadN,'auto-generated thread sequence','threads');
    eq(S.threads && S.threads.closed || {},closed,'closed source markers survive clear','threads');
  }
  eq(A.famSeen||{},famSeen,'family once marks','family');
  eq(A.famNext,famNext,'family next eligible date','family');
  // Replay the REAL serialized pending state. Full durable output and every RNG
  // stream must match the already-resolved original. Never replay on original S.
  let loaded;
  const durableBeforeReplay=BK.Rewind.take(S).json;
  try {
    loaded=JSON.parse(before.json);
    if(BK.Corp && BK.Corp.applyGlobals) BK.Corp.applyGlobals(loaded);
    const pending=BK.Story.pendingScene(loaded);
    eq(pending&&pending.id,sc.id,'saved pending identifies same scene','saveLoad');
    const replay=BK.Story.resolve(loaded,idx);
    eq(!!replay.ok,!!result.ok,'loaded pending resolves the same choice','saveLoad');
    eq(JSON.parse(BK.Rewind.take(loaded).json),JSON.parse(durableBeforeReplay),'original/loaded resolution durable state and RNG match','saveLoad');
    const closedState=BK.Rewind.take(loaded).json;
    expect(!BK.Story.resolve(loaded,idx).ok,'closed loaded scene cannot resolve a second time','saveLoad');
    eq(BK.Rewind.take(loaded).json,closedState,'second resolve repeats no effects or RNG','saveLoad');
  } catch(err) {
    errors.push(label+' save/load replay exception: '+err.message);
  } finally {
    if(BK.Corp && BK.Corp.applyGlobals) BK.Corp.applyGlobals(S);
  }
  eq(BK.Rewind.take(S).json,durableBeforeReplay,'audit replay did not mutate actual game/RNG','saveLoad');
  return {errors,checks,declaredChecks,effectCounts,encountered:[...encountered].sort(),unsupported:[...unsupported].sort()};
}
module.exports={snapshot,check};
