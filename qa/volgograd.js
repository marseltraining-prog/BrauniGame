/* Волгоград в браузере (Chromium/WebKit): новая партия, вход, покупка сети, старые сохранения, экраны.
   Скриншоты/наблюдения — для ручного просмотра верхней панели, центра/СЗ, русла/водоёмов и адресов. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{openPage,layoutCheck}=require('./lib');
const legacy=require('../docs/releases/0.9.20-legacy-volgograd.json');
const out=path.join(__dirname,'shots','volgograd');fs.mkdirSync(out,{recursive:true});
let checks=0;const observations=[];
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const geometry=w=>({...w,districts:w.districts.map(({streets,...d})=>d)});
async function world(p){return p.evaluate(()=>({map:BK.MAP,districts:BK.DISTRICTS,center:BK.CENTER_POINT}));}
// Corporate packing canonically rounds positions to tenths; compare that durable contract.
async function places(p){return p.evaluate(()=>BK.App.state.stores.concat(BK.App.state.productions).map(s=>[s.id,Math.round(s.x*10)/10,Math.round(s.y*10)/10,s.address]));}
async function settle(p){await p.waitForTimeout(220);}
async function layout(p,label){
 const found=await layoutCheck(p,label,{mobile:label.includes('m3')});observations.push(...found);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+': page fits viewport');
 ok(!found.some(x=>/HSCROLL документа|МУСОР В ТЕКСТЕ/.test(x)),label+': layout '+found.join('\n'));
 // SVG text collisions and existing dashboard contrast are retained as diagnostics;
 // interactive markers get explicit hit testing below rather than blanket exemptions.
}
// A reload re-reads CFG, so the story is on again; this map test started with it off. Keep it off and close a
// story scene that the reload may have opened over the map (it hid the focused offer in the Volgograd corporate run).
async function reload(p){await p.evaluate(()=>{BK.App.setSpeed(0);BK.App.save();});await p.reload();await p.click('[data-act=continue]');
 await p.evaluate(()=>{BK.CFG.STORY.ON=false;if(document.querySelector('#modal .story-modal'))BK.App.ACT.closeModal();});await settle(p);}
async function layers(p,label){
 const data=await p.evaluate(()=>({city:BK.CITY.id,gen:BK.App.state.startMapGen,bridges:document.querySelectorAll('#map .m-bridge').length,
  districts:document.querySelectorAll('#map .m-klabel').length,pois:document.querySelectorAll('#map .m-poi').length,
  roads:document.querySelectorAll('#map .m-road').length,rails:document.querySelectorAll('#map .m-rail').length,
  waters:document.querySelectorAll('#map .m-sea').length,
  aria:document.querySelector('#map').getAttribute('aria-label'),rivers:BK.MAP.rivers.map(r=>r.name)}));
 ok(data.city==='volgograd',label+': active Volgograd');
 ok(data.bridges===2&&data.districts===9&&data.pois===40&&data.roads===12&&data.rails===3&&data.waters===1,label+': actual rendered geographic layers');
 ok(data.aria.includes('Волгоград')&&data.rivers.length===2&&data.rivers.includes('р. Волга')&&data.rivers.includes('р. Ахтуба'),label+': local accessible labels');
}
async function marker(p,vp){
 await p.evaluate(()=>{BK.App.ACT.tab({arg:'dash'});BK.App.ACT.focusOffer({arg:BK.App.state.offers[0].id});});
 await p.locator('.mapwrap').scrollIntoViewIfNeeded();await settle(p);
 const find=()=>p.evaluate(()=>{
  const all=[...document.querySelectorAll('#map [data-kind]')];
  for(const el of all.filter(e=>e.dataset.kind==='offer')){
   const circle=el.querySelector('circle');if(!circle)continue;const r=circle.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
   if(x<1||x>=innerWidth-1||y<1||y>=innerHeight-1)continue;
   const top=document.elementFromPoint(x,y);if(!top||top.closest('[data-kind]')!==el)continue;
   if(all.some(other=>{if(other===el)return false;const m=other.getScreenCTM();if(!m)return false;const c=new DOMPoint(0,0).matrixTransform(m);return Math.hypot(c.x-x,c.y-y)<36;}))continue;
   return {x,y,id:el.dataset.id};
  }return null;
 });
 let target=await find();for(let i=0;i<6&&!target;i++){await p.evaluate(()=>BK.App.ACT.zoomIn());await settle(p);target=await find();}
 ok(target,'live offer marker has an unobstructed touch target');
 if(vp.startsWith('m'))await p.touchscreen.tap(target.x,target.y);else await p.mouse.click(target.x,target.y);
 await settle(p);
 ok(await p.evaluate(id=>BK.App.ui.tab==='market'&&BK.App.ui.sel&&BK.App.ui.sel.kind==='offer'&&BK.App.ui.sel.id===id,target.id),'real marker opens corresponding market offer');
 ok(await p.locator('#pbody').innerText().then(t=>t.length>20),'market panel populated');
}
(async()=>{
 const b=await(process.env.BR==='webkit'?webkit:chromium).launch(),browser=b.browserType().name();
 try{
  if(!process.argv.includes('--legacy-only'))for(const vp of ['d1440','m390','m360'])for(const dark of [false,true]){
   const label=browser+'/'+vp+'/'+(dark?'dark':'light'),p=await openPage(b,vp,{dark,seed:7919});
   console.log(label);
   const initial=await p.evaluate(()=>({state:JSON.stringify(BK.App.state),world:JSON.stringify({map:BK.MAP,districts:BK.DISTRICTS,city:BK.CITY})}));
   await p.check('[name=startCity][value=volgograd]');
   ok(await p.locator('#startPreview').getAttribute('data-city')==='volgograd',label+': cover selection');
   ok(await p.locator('#cityPreviewChoice').innerText()==='Волгоград',label+': cover city name');
   ok(await p.locator('#startPreview .city-arms').getAttribute('aria-label')==='Стилизованный герб: Волгоград',label+': city arms');
   eq(await p.evaluate(()=>({state:JSON.stringify(BK.App.state),world:JSON.stringify({map:BK.MAP,districts:BK.DISTRICTS,city:BK.CITY})})),initial,label+': preview leaves active world intact');
   ok(await p.locator('#startPreview .m-bridge').count()===2&&await p.locator('#startPreview .m-poi').count()===40,label+': cover uses detailed Volgograd');
   await p.locator('#startPreview').screenshot({path:path.join(out,label.replaceAll('/','-')+'-cover.png')});
   await layout(p,label+' cover');
   await p.evaluate(()=>{BK.CFG.STORY.ON=false;BK.Scenario.pick=()=>null;});
   await p.check('[name=startmode][value=net]');await p.click('#startForm button[type=submit]');
   await p.evaluate(()=>{BK.App.setSpeed(0);const S=BK.App.state;S.cash=1e8;
    if(!BK.Engine.chooseProduction(S,S.prodOffers[0].id).ok||!BK.Engine.rentStore(S,S.offers[0].id).ok)throw Error('Real Volgograd setup failed');BK.App.refresh();BK.App.save();});
   ok(await p.evaluate(()=>BK.App.state.startCity==='volgograd'&&BK.App.state.startMapGen===2),label+': detailed new game');
   const homeWorld=await world(p),homePlaces=await places(p);await layers(p,label);await settle(p);await layout(p,label);
   await p.locator('.mapwrap').screenshot({path:path.join(out,label.replaceAll('/','-')+'-map.png')});
   await marker(p,vp);await layout(p,label+' market');await reload(p);
   eq(await world(p),homeWorld,label+': native reload geometry');eq(await places(p),homePlaces,label+': native reload places');await layers(p,label+' reload');
   await p.evaluate(()=>{const S=BK.App.state;S.cash=1e12;S.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;BK.Corp.ensure(S);
    if(!BK.Engine.enterCity(S,'voronezh').ok||!BK.Engine.switchCity(S,'ufa').ok)throw Error('Real home round trip failed');BK.App.refresh();});
   eq(await world(p),homeWorld,label+': home corporate round trip');eq(await places(p),homePlaces,label+': home preserved places');
   await reload(p);await layers(p,label+' corporate reload');ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  for(const key of ['start','corp','bought']){
   const state=legacy[key];ok(state&&legacy[key+'World'],'legacy fixture '+key);
   const p=await openPage(b,'m390',{save:JSON.stringify(state)});await p.click('[data-act=continue]');await settle(p);
   eq(geometry(await world(p)),geometry(legacy[key+'World']),key+': captured old geometry');
   const expected=state.stores.concat(state.productions).map(s=>[s.id,Math.round(s.x*10)/10,Math.round(s.y*10)/10,s.address]);eq(await places(p),expected,key+': saved coordinates and addresses');
   ok(await p.locator('#map .m-bridge').count()===0,key+': old rendering');
   await p.evaluate(key=>{BK.CFG.STORY.ON=false;const S=BK.App.state;S.phase='play';S.cash=1e12;S.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;BK.Corp.ensure(S);
    if(!BK.Engine.enterCity(S,'voronezh').ok||!BK.Engine.switchCity(S,key==='start'?'ufa':'volgograd').ok)throw Error('Legacy round trip failed');BK.App.refresh();},key);
   await reload(p);eq(geometry(await world(p)),geometry(legacy[key+'World']),key+': old map after travel and native reload');eq(await places(p),expected,key+': legacy places survive travel');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  if(!process.argv.includes('--legacy-only')){
   const p=await openPage(b,'m390',{seed:15838});await p.evaluate(()=>{BK.CFG.STORY.ON=false;BK.Scenario.pick=()=>null;});
   await p.check('[name=startmode][value=net]');await p.click('#startForm button[type=submit]');
   await p.evaluate(()=>{BK.App.setSpeed(0);const S=BK.App.state;S.cash=1e12;
    if(!BK.Engine.chooseProduction(S,S.prodOffers[0].id).ok||!BK.Engine.rentStore(S,S.offers[0].id).ok)throw Error('Real home premises failed before corporate entry');
    S.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;BK.Corp.ensure(S);
    if(!BK.Engine.enterCity(S,'volgograd').ok)throw Error('Real Volgograd corporate entry failed');
    if(!BK.Engine.chooseProduction(S,S.prodOffers[0].id).ok||!BK.Engine.rentStore(S,S.offers[0].id).ok)throw Error('Real corporate premises failed');BK.App.refresh();});
   await layers(p,'corporate entry');ok(await p.evaluate(()=>BK.App.state.corp.cities.volgograd.mapGen===2),'corporate city record detailed');
   const captured=await world(p),locations=await places(p);
   await p.evaluate(()=>{const S=BK.App.state;if(!BK.Engine.switchCity(S,'ufa').ok||!BK.Engine.switchCity(S,'volgograd').ok)throw Error('Corporate return failed');BK.App.refresh();});
   await reload(p);eq(await world(p),captured,'corporate native load geometry');eq(await places(p),locations,'corporate native load places');await marker(p,'m390');
   const acquired=await p.evaluate(()=>{
    // Each search attempt has genuine company records and genuine random e208 context.
    for(let seed=1;seed<=200;seed++){
     const S=BK.Engine.newGame({seed:seed*7919});S.phase='play';S.cash=1e12;S.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;BK.Corp.ensure(S);
     if(!BK.Engine.enterCity(S,'kazan').ok||!BK.Engine.enterCity(S,'ekb').ok)throw Error('Acquisition prerequisites failed');
     S.day=Math.max(366,(BK.CFG.CORP.LAUNCH_DAYS||510)+1);
     const event=BK.CorpEv.byId('e208');if(!BK.CorpEv.eligible(S,event))throw Error('Acquisition event ineligible');BK.CorpEv.start(S,event);
     if(!S.ev.pending||S.ev.pending.ctx.city!=='volgograd')continue;
     const n=S.ev.pending.ctx.n,result=BK.Engine.resolveEvent(S,0);
     if(!result||result.idx!==0||!BK.Engine.switchCity(S,'volgograd').ok)throw Error('Real purchase failed');
     // App.state is read-only. Load the actual purchased state through its native save loader.
     localStorage.setItem(BK.Slots.key(),JSON.stringify(S));
     BK.App.ACT.continue();BK.App.setSpeed(0);BK.App.save();
     return {seed:seed*7919,n,mapGen:S.corp.cities.volgograd.mapGen,bought:S.corp.cities.volgograd.bought};
    }return null;
   });
   ok(acquired&&acquired.bought&&acquired.mapGen===2,'actual e208 purchased Volgograd record');
   await p.reload();await p.click('[data-act=continue]');await settle(p);
   ok(await p.evaluate(n=>BK.App.state.stores.length===n,acquired.n),'purchased store count from genuine event context');
   const boughtWorld=await world(p),boughtPlaces=await places(p);await reload(p);await layers(p,'purchase reload');
   eq(await world(p),boughtWorld,'purchased city native reload geometry');eq(await places(p),boughtPlaces,'purchased city native reload places');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  const report={browser,checks,issues:[],layoutObservations:[...new Set(observations)],limitations:['Financial unlock and mature-city day are explicit prerequisites, not balance checks.','Old street catalogs vary across JavaScript sort implementations; geometry and saved coordinates/addresses are compared.','Full layout observations are retained; horizontal overflow is blocking. SVG label overlap needs screenshot review.', 'Ribbon compression, Volga/Akhtuba contours and the two crossings require manual review; primary address confirmation was not possible (official sites, Wikipedia and OSM blocked from the session).']};
  fs.writeFileSync(path.join(out,browser+'-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`ВОЛГОГРАД UI (${browser}): ${checks} проверок, 0 проблем; ${report.layoutObservations.length} наблюдений вёрстки`);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
