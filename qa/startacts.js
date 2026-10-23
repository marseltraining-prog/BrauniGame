/* В9: старт «Сразу Россия» и «Сразу холдинг» — стартовый экран, готовая сеть, карточка «что было раньше»,
   выбор пути холдинга, сохранение и загрузка. Chromium/WebKit, 1440/390, обе темы. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{openPage,layoutCheck}=require('./lib');
const out=path.join(__dirname,'shots','startacts');fs.mkdirSync(out,{recursive:true});
let checks=0;const notes=[];
const ok=(v,l)=>{assert.ok(v,l);checks++;};const eq=(a,b,l)=>{assert.deepEqual(a,b,l);checks++;};
const settle=p=>p.waitForTimeout(300);
async function layout(p,label){const found=await layoutCheck(p,label,{mobile:label.includes('m390')});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+': ширина');ok(!found.some(x=>/HSCROLL документа|МУСОР В ТЕКСТЕ/.test(x)),label+': '+found.join('\n'));}
async function start(p,mode){await p.check(`[name=startmode][value=${mode}]`);await p.click('#startForm button[type=submit]');await settle(p);}
(async()=>{
 const b=await(process.env.BR==='webkit'?webkit:chromium).launch(),browser=b.browserType().name();
 try{
  for(const vp of ['d1440','m390'])for(const dark of[false,true]){
   const label=`${browser}/${vp}/${dark?'dark':'light'}`;
   // Россия
   let p=await openPage(b,vp,{dark,seed:7919});
   ok(await p.locator('input[name=startmode]').count()===5,label+': пять вариантов старта');
   ok(await p.locator('.pro-pk').filter({hasText:'Сразу кофейня'}).count()===1,label+': карточка кофейни');
   ok(await p.locator('.pro-pk').filter({hasText:'Сразу Россия'}).count()===1,label+': карточка России');
   ok(await p.locator('.pro-pk').filter({hasText:'Сразу холдинг'}).count()===1,label+': карточка холдинга');
   await layout(p,label+' старт');
   await start(p,'russia');
   const R=await p.evaluate(()=>({day:BK.App.state.day,stores:BK.App.state.stores.length,act:BK.App.state.startAct,corp:!!BK.App.state.corp,hold:!!BK.App.state.holding,modal:!!document.querySelector('#modal .modal'),recap:(document.querySelector('#modal')||{}).innerText||''}));
   eq([R.day,R.stores,R.act,R.corp,R.hold],[5418,46,2,true,false],label+': готовая сеть России');
   ok(R.modal&&/Что было раньше/.test(R.recap)&&/46 точек/.test(R.recap),label+': карточка «что было раньше»');
   await p.screenshot({path:path.join(out,label.replaceAll('/','-')+'-russia.png')});
   await p.click('#modal [data-act=closeModal]', { force: true });await settle(p);
   ok(!await p.evaluate(()=>!!document.querySelector('#modal .modal')),label+': карточка закрывается');
   await p.evaluate(()=>{BK.App.setSpeed(0);BK.App.save();});await p.reload();await p.click('[data-act=continue]');await settle(p);
   eq(await p.evaluate(()=>[BK.App.state.day,BK.App.state.stores.length,BK.App.state.startAct]),[5418,46,2],label+': Россия после перезагрузки');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
   // холдинг
   p=await openPage(b,vp,{dark,seed:7919});await start(p,'holding');
   const H=await p.evaluate(()=>({stores:BK.App.state.stores.length,act:BK.App.state.startAct,path:BK.App.state.holding&&BK.App.state.holding.path,modal:(document.querySelector('#modal')||{}).innerText||''}));
   eq([H.stores,H.act,H.path],[46,3,null],label+': сеть перед выбором пути');
   ok(/Что было раньше/.test(H.modal),label+': карточка холдинга');
   await p.click('#modal [data-act=holdChoose]');await settle(p);
   eq(await p.evaluate(()=>[...document.querySelectorAll('#modal [data-act=holdPick]')].map(x=>x.dataset.arg)),['ipo','abroad','franchise'],label+': три пути');
   await p.click('#modal [data-act=holdPick][data-arg=ipo]');await settle(p);
   eq(await p.evaluate(()=>BK.App.state.holding&&BK.App.state.holding.path),'ipo',label+': выбран путь биржи');
   await p.evaluate(()=>{BK.App.setSpeed(0);BK.App.save();});await p.reload();await p.click('[data-act=continue]');await settle(p);
   eq(await p.evaluate(()=>[BK.App.state.stores.length,BK.App.state.holding.path]),[46,'ipo'],label+': холдинг после перезагрузки');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
   // своя кофейня без пролога
   p=await openPage(b,vp,{dark,seed:7919});await start(p,'coffee');
   const C=await p.evaluate(()=>({stage:!!BK.App.state.stage1,status:BK.App.state.stage1&&BK.App.state.stage1.status,spots:BK.App.state.stage1&&BK.App.state.stage1.spots.length,ui:!!document.querySelector('#stage1')}));
   eq([C.stage,C.status,C.spots,C.ui],[true,'pick',3,true],label+': кофейня без пролога');
   await p.evaluate(()=>BK.App.save());await p.reload();await p.click('[data-act=continue]');await settle(p);await p.waitForTimeout(500);
   ok(await p.evaluate(()=>!!document.querySelector('#stage1')),label+': кофейня после перезагрузки');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
   // обычный старт не изменился
   p=await openPage(b,vp,{dark,seed:7919});await start(p,'net');
   eq(await p.evaluate(()=>[BK.App.state.day,BK.App.state.stores.length,BK.App.state.startAct==null]),[0,0,true],label+': обычная новая игра');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  fs.writeFileSync(path.join(out,browser+'-checks.json'),JSON.stringify({browser,checks,notes},null,2)+'\n');
  console.log(`СТАРТ В РОССИИ/ХОЛДИНГЕ (${browser}): ${checks} проверок, 0 проблем`);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
