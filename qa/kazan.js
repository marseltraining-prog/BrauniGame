/* Казань: обе темы, телефон/Safari, карта, выбор помещения и старые сохранения. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium,webkit}=require('playwright');
const {openPage,layoutCheck}=require('./lib');
const legacy=require('../docs/releases/0.9.9-legacy-kazan.json');
const out=path.join(__dirname,'shots','kazan');fs.mkdirSync(out,{recursive:true});
let checks=0;const ok=(v,text)=>{assert.ok(v,text);checks++;};
(async()=>{
 const br=process.env.BR==='webkit'?webkit:chromium,b=await br.launch();
 try{
  if(!process.argv.includes('--legacy-only')) for(const vp of ['d1440','m390','m360'])for(const dark of [false,true]){
   const p=await openPage(b,vp,{dark,seed:7919});
   await p.evaluate(()=>{BK.CFG.STORY.ON=false;BK.Scenario.pick=()=>null;});
   await p.check('[name=startCity][value=kazan]');await p.check('[name=startmode][value=net]');await p.click('#startForm button[type=submit]');
   const info=await p.evaluate(()=>{
    BK.App.setSpeed(0);const S=BK.App.state;S.cash=1e8;
    const a=BK.Engine.chooseProduction(S,S.prodOffers[0].id),c=BK.Engine.rentStore(S,S.offers[0].id);if(!a.ok||!c.ok)throw Error('Не создана сеть для проверки карты');
    BK.App.refresh();BK.App.save();
    return {city:BK.CITY.id,gen:S.startMapGen,bridges:document.querySelectorAll('#map .m-bridge').length,
     labels:document.querySelectorAll('#map .m-klabel').length,pois:document.querySelectorAll('#map .m-poi').length,
     roads:document.querySelectorAll('#map .m-road').length,rails:document.querySelectorAll('#map .m-rail').length,
     aria:document.querySelector('#map').getAttribute('aria-label'),water:BK.MAP.labels.map(l=>l.text)};
   });
   ok(info.city==='kazan'&&info.gen===2,'новая подробная Казань');
   ok(info.bridges===4&&info.labels===10&&info.pois>=40&&info.roads>=8&&info.rails>=2,'все слои на карте');
   ok(info.aria.includes('Казани')&&info.water.includes('Волга')&&info.water.includes('р. Казанка'),'местные подписи');
   await p.waitForTimeout(200);
   const layout=await layoutCheck(p,vp+'/'+dark,{ignoreMapText:true});
   // SVG-схема допускает геометрическое пересечение линий; проверяем ширину самой страницы отдельно.
   ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'нет горизонтальной прокрутки');
   ok(!layout.some(x=>/HSCROLL документа|МУСОР В ТЕКСТЕ/.test(x)),layout.join('\n'));
   await p.locator('.mapwrap').screenshot({path:path.join(out,`${br.name()}-${vp}-${dark?'dark':'light'}.png`)});
   await p.evaluate(()=>{BK.App.ACT.tab({arg:'dash'});BK.App.ACT.focusOffer({arg:BK.App.state.offers[0].id});});
   const findOffer=()=>p.evaluate(()=>{
    const markers=[...document.querySelectorAll('#map [data-kind]')];
    for(const el of document.querySelectorAll('#map [data-kind=offer]')){
     const r=el.querySelector('circle').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
     const top=document.elementFromPoint(x,y);if(!top||top.closest('[data-kind]')!==el)continue;
     if(markers.some(other=>{if(other===el)return false;const c=new DOMPoint(0,0).matrixTransform(other.getScreenCTM());return Math.hypot(c.x-x,c.y-y)<36;}))continue;
     return {x,y,id:el.dataset.id};
    }return null;
   });
   let offer=await findOffer();for(let i=0;i<5&&!offer;i++){await p.evaluate(()=>BK.App.ACT.zoomIn());await p.waitForTimeout(250);offer=await findOffer();}
   ok(offer,'есть доступное предложение');
   if(vp[0]==='m')await p.touchscreen.tap(offer.x,offer.y);else await p.mouse.click(offer.x,offer.y);
   await p.waitForTimeout(120);
   ok(await p.evaluate(offerId=>BK.App.ui.tab==='market'&&BK.App.ui.sel&&BK.App.ui.sel.kind==='offer'&&BK.App.ui.sel.id===offerId,offer.id),'помещение открывает рынок');
   await p.evaluate(()=>BK.App.save());await p.reload();await p.click('[data-act=continue]');
   ok(await p.evaluate(()=>BK.App.state.startMapGen===2&&BK.MAP.bridges.length===4),'новая география после загрузки');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  for(const [state,old,label]of [[legacy.start,legacy.startWorld,'старый старт'],[legacy.corp,legacy.corpWorld,'старый второй акт']]){
   const p=await openPage(b,'m390',{save:JSON.stringify(state)});
   await p.evaluate(()=>{BK.CFG.STORY.ON=false;});await p.click('[data-act=continue]');
   const got=await p.evaluate(()=>({map:BK.MAP,districts:BK.DISTRICTS,center:BK.CENTER_POINT}));
   // В старом генераторе улицы перемешаны случайным Array.sort: Node/браузеры
   // дают разные каталоги даже в одной версии. География и сохранённые адреса — контракт загрузки.
   const geometry=w=>({...w,districts:w.districts.map(({streets,...d})=>d)});
   assert.deepEqual(geometry(JSON.parse(JSON.stringify(got))),geometry(old),label+': прежняя география');checks++;
   assert.deepEqual(await p.evaluate(()=>BK.App.state.stores.map(s=>s.address)),state.stores.map(s=>s.address),label+': сохранённые адреса');checks++;
   ok(await p.locator('#map .m-bridge').count()===0,label+': прежняя отрисовка');
   ok(!p.errs.length,p.errs.join('\n'));await p.context().close();
  }
  console.log(`КАЗАНЬ UI (${br.name()}): ${checks} проверок, 0 проблем`);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
