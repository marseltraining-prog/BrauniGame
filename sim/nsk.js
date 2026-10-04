/* Подробный Новосибирск: география, местные помещения, обе версии сохранений и второй акт. */
const assert=require('assert/strict');
const BK=require('./load'), E=BK.Engine, C=BK.Corp;
require('../src/ui/map');
const legacy=require('../docs/releases/0.9.12-legacy-nsk.json');
let checks=0;
const ok=(v,text)=>{assert.ok(v,text);checks++;};
const eq=(a,b,text)=>{assert.deepEqual(a,b,text);checks++;};
const world=()=>JSON.parse(JSON.stringify({map:BK.MAP,districts:BK.DISTRICTS,center:BK.CENTER_POINT}));
function inPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function distLine(p,pts){let best=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1];const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy));}return best;}
const dry=p=>!(BK.MAP.sea||[]).some(s=>inPoly(p,s.pts))&&!(BK.MAP.rivers||[]).some(r=>distLine(p,r.pts)<r.w/2+3);
BK.useCity('nsk',7919);const current=world(), definition=BK.CITY_BY_ID.nsk;
eq(BK.DISTRICTS.length,definition.districts.length,'все прежние районы');
const originalDistricts=BK.genCityGeo(definition,7919,1).DISTRICTS;
for(const [i,d] of BK.DISTRICTS.entries()){
 eq(d.id,'nsk'+i,'совместимый id');eq(d.arch,definition.districts[i][1],'совместимый архетип');eq(d.w,originalDistricts[i].w,'вес деловых районов прежний');
 for(const key of ['rent','solv','traffic','prodRent'])eq(d[key],originalDistricts[i][key],'прежние числовые диапазоны '+d.name+'/'+key);
 ok(d.kind&&d.streets.length>=5&&new Set(d.streets).size===d.streets.length,'характер и реальные улицы '+d.name);
 ok(d.lm.length&&d.lm.every(id=>BK.LANDMARKS.some(l=>l.id===id)),'соседство '+d.name);
 ok(d.sizeW&&Math.abs(Object.values(d.sizeW).reduce((a,b)=>a+b,0)-1)<1e-8,'площади '+d.name);
 ok(inPoly(d,BK.MAP.city)&&dry(d),'район на суше '+d.name);
 ok(BK.MAP.pois.filter(p=>p.d===d.id).length>=3,'точки притяжения '+d.name);
}
for(const p of BK.MAP.pois)ok(inPoly(p,BK.MAP.city)&&dry(p),'точка притяжения на суше '+p.name);
ok(BK.MAP.roads.length>=8&&BK.MAP.rails.length>=2&&BK.MAP.bridges.length>=3,'дороги, ж/д, мосты');
ok(BK.MAP.rivers.some(r=>r.name==='р. Обь'),'река Обь');
ok(BK.MAP.sea.length===1&&BK.MAP.rivers.some(r=>r.name==='р. Иня'),'водохранилище и Иня');
const cityMean=key=>BK.DISTRICTS.reduce((s,d)=>s+d.w*d.lm.reduce((n,id)=>n+BK.LANDMARKS.find(l=>l.id===id)[key],0)/d.lm.length,0)/BK.DISTRICTS.reduce((s,d)=>s+d.w,0);
for(const k of ['tr','solv','rent'])ok(Math.abs(cityMean(k)-BK.LANDMARKS.reduce((s,l)=>s+l[k],0)/BK.LANDMARKS.length)<0.06,'средняя экономика соседства '+k);
BK.useCity('nsk',123456);eq(world(),current,'подробная схема не меняется от сида');
for(let seed=1;seed<=100;seed++){
 const S=E.newGame({seed:seed*7919,city:'nsk'});
 eq(S.startMapGen,2,'новая партия помнит версию карты');
 ok(S.offers.concat(S.prodOffers,(S.rival&&S.rival.stores)||[]).every(p=>dry(p)&&inPoly(p,BK.MAP.city)),'помещения и соперники на суше, сид '+seed);
 ok(S.offers.every(o=>BK.DISTRICTS.find(d=>d.id===o.district).streets.some(st=>o.address.startsWith(st))),'адреса местные');
}
for(const [state,expected,label] of [[legacy.start,legacy.startWorld,'старый старт'],[legacy.corp,legacy.corpWorld,'старый вход во втором акте']]){
 const S=JSON.parse(JSON.stringify(state)), coords=S.stores.map(s=>[s.id,s.x,s.y]);C.ensure(S);C.applyGlobals(S);
 eq(world(),expected,label+': география сохранена побайтно');eq(S.stores.map(s=>[s.id,s.x,s.y]),coords,label+': точки на прежних координатах');
 ok(!BK.MAP.bridges,label+': прежняя версия');
}
const home=E.newGame({seed:7919,city:'nsk'});home.phase='play';home.cash=1e12;home.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;C.ensure(home);
ok(E.enterCity(home,'nnov').ok,'выйти из Новосибирска');ok(E.switchCity(home,'ufa').ok,'вернуться в Новосибирск');eq(world(),current,'подробный домашний город после возврата');
const fresh=E.newGame({seed:15838});fresh.phase='play';fresh.cash=1e12;fresh.cumRevenue=BK.CFG.CORP.UNLOCK_REVENUE;C.ensure(fresh);
ok(E.enterCity(fresh,'nsk').ok,'новый вход в Новосибирск');eq(fresh.corp.cities.nsk.mapGen,2,'второй акт сохраняет версию карты');eq(world(),current,'новый вход открывает подробную схему');
C.applyGlobals(JSON.parse(JSON.stringify(fresh)));eq(world(),current,'новая карта после загрузки');
console.log(`НОВОСИБИРСК: ${checks} проверок, 0 проблем`);
