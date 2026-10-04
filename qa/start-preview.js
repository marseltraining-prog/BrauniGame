/* Обложка: все города, чистота мира, обе темы/движка и нейтральные последствия. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium,webkit}=require('playwright'),{openPage}=require('./lib');
let checks=0;function ok(v,t){assert.ok(v,t);checks++;}
(async()=>{const b=await(process.env.BR==='webkit'?webkit:chromium).launch();try{
for(const vp of ['d1440','d1280','m390','m360'])for(const dark of [false,true]){
 const p=await openPage(b,vp,{dark,seed:7919});
 ok(await p.locator('#startPreview .city-arms').getAttribute('aria-label')==='Стилизованный герб: Уфа','начальный герб');
 const ids=await p.evaluate(()=>BK.CITIES.filter(d=>BK.StartCity.available(d.id)).map(d=>d.id));
 let previous=await p.locator('#startPreview .start-map').innerHTML();
 for(const id of ids.filter(x=>x!=='ufa').concat('ufa')){
  const before=await p.evaluate(()=>{window.__world=[BK.MAP,BK.DISTRICTS,BK.CITY];return JSON.stringify(BK.App.state);});
  await p.check(`[name=startCity][value=${id}]`);
  const info=await p.evaluate(()=>({city:document.querySelector('#startPreview').dataset.city,unchanged:window.__world.every((v,i)=>v===[BK.MAP,BK.DISTRICTS,BK.CITY][i]),state:JSON.stringify(BK.App.state),name:BK.CITY_BY_ID[document.querySelector('[name=startCity]:checked').value].name}));
  ok(info.city===id&&info.unchanged&&info.state===before,'выбор не меняет активный мир '+id);
  const map=await p.locator('#startPreview .start-map').innerHTML();ok(map!==previous,'карта меняется '+id);previous=map;
  ok(await p.locator('#cityPreviewChoice').innerText()===info.name,'подпись города '+id);
  ok(await p.locator('#startPreview .city-arms').getAttribute('aria-label')==='Стилизованный герб: '+info.name,'доступный герб '+id);
 }
 ok(await p.locator('[name=startCity][value=moscow]').isDisabled()&&await p.locator('[name=startCity][value=spb]').isDisabled(),'закрытые столицы');
 const pure=await p.evaluate(()=>{
  const before=[BK.MAP,BK.DISTRICTS,BK.CITY], maps=BK.CITIES.map(d=>BK.mapStatic({id:'test',world:BK.cityPreview(d.id)}));
  const arms=BK.CITIES.map(d=>BK.cityArms(d.id));
  return {pure:before.every((v,i)=>v===[BK.MAP,BK.DISTRICTS,BK.CITY][i]),maps:new Set(maps).size,arms:new Set(arms).size,
   neutral:BK.choiceImpact('', 'Команда', 2)===BK.choiceImpact('', 'Команда', -2),html:BK.choiceImpact('', 'Деньги',-3)};
 });
 ok(pure.pure&&pure.maps===19&&pure.arms===19,'19 разных карт и гербов, чистый рендер');
 ok(pure.neutral&&!/[▲▼]|лучше|хуже|class="fxc (up|dn)/.test(pure.html)&&pure.html.includes('сильно'),'сила одинакова при обоих знаках');
 await p.check('[name=startCity][value=kazan]');
 await p.locator('#startPreview').screenshot({path:path.join(__dirname,'shots',`preview-${vp}-${dark?'dark':'light'}-${process.env.BR||'chromium'}.png`)});
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'нет горизонтальной прокрутки');
 await p.evaluate(()=>{BK.Scenario.pick=()=>null;BK.CFG.STORY.ON=false;});
 await p.check('[name=startmode][value=net]');await p.click('#startForm button[type=submit]');
 await p.evaluate(()=>{BK.App.setSpeed(0);const S=BK.App.state;S.cash=1e8;BK.Engine.chooseProduction(S,S.prodOffers[0].id);BK.Engine.rentStore(S,S.offers[0].id);const e=BK.EVENTS.find(x=>x.choices&&x.choices.length>2);S.ev.pending={id:e.id,kind:e.kind,title:e.title,text:e.text.replace(/\{store\}/g,S.stores[0].address).replace(/\{district\}/g,'Центр').replace(/\{prod\}/g,'цех'),tg:{scope:'store',target:S.stores[0].id},day:S.day,effectsText:[],choices:e.choices.map(c=>({label:c.label,desc:c.desc,cost:100000}))};BK.App.refresh();});
 await p.waitForTimeout(500);
 const all=await p.locator('#modal .choice .fx').allInnerTexts();
 ok(all.length>0,'подсказки реального события');
 ok(await p.locator('#modal .choice .cd').count()===0,'нет пересказа результата под выбором');
 ok(await p.evaluate(()=>[...document.querySelectorAll('#modal .choice')].every(c=>{const ns=[...c.querySelectorAll('[data-strength]')].map(x=>+x.dataset.strength);return ns.every((n,i)=>!i||ns[i-1]>=n);})), 'значки по убыванию силы');
 ok((await p.locator('#modal .choice .cc').allInnerTexts()).every(t=>t.includes('100')), 'цены видны');
 ok(await p.locator('#modal .choice .fxc.up, #modal .choice .fxc.dn').count()===0,'нейтральные цвета');
 ok(!(await p.locator('#modal .choice .fx').allTextContents()).some(t=>/[▲▼]|лучше|хуже/.test(t)),'без направления');
 await p.locator('#modal .modal').screenshot({path:path.join(__dirname,'shots',`impact-${vp}-${dark?'dark':'light'}-${process.env.BR||'chromium'}.png`)});
 await p.click('#modal [data-choice]:not([disabled])');
 ok(await p.evaluate(()=>BK.App.state.startCity==='kazan'),'партию начинает выбранный город');
 await p.evaluate(()=>BK.App.toStart());
 ok(await p.locator('#startPreview .city-arms').getAttribute('aria-label')==='Стилизованный герб: Уфа','возврат к старту');
 const saved=await p.evaluate(()=>localStorage.getItem('bk-ufa-save-v1'));
 await p.check('[name=startCity][value=ekb]');
 ok(await p.evaluate(()=>BK.CITY.id==='kazan'),'предпросмотр Екатеринбурга не подменяет активную Казань');
 ok(await p.evaluate(()=>localStorage.getItem('bk-ufa-save-v1'))===saved,'предпросмотр не пишет сохранение');
 await p.click('[data-act=continue]');
 ok(await p.evaluate(()=>BK.App.state.startCity==='kazan'&&BK.CITY.id==='kazan'),'продолжение возвращает Казань, а не город обложки');
 ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
}
console.log(`ПРЕДПРОСМОТР/ПОДСКАЗКИ ${process.env.BR||'chromium'}: ${checks} проверок, 0 проблем`);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
