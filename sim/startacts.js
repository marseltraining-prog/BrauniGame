/* В9: стартовые срезы «Сразу Россия» и «Сразу холдинг» — данные, срез, загрузка и живой день. */
'use strict';
const assert=require('node:assert/strict');
const BK=require('./load'),E=BK.Engine,C=BK.Corp;
require('../src/savecodec.js');
let checks=0;const ok=(v,l)=>{assert.ok(v,l);checks++;};const eq=(a,b,l)=>{assert.deepEqual(a,b,l);checks++;};
eq(Object.keys(BK.START_ACTS),['russia','holding'],'two start acts');
const R=BK.StartActs.state('russia'),H=BK.StartActs.state('holding');
for(const [id,S,act] of [['russia',R,2],['holding',H,3]]){
  ok(S&&S.stores.length>=40,id+': stores');
  eq(S.startAct,act,id+': act marker');
  ok(S.day>5000,id+': mature day');
  ok(S.corp&&S.corp.unlockedDay!=null,id+': Russia unlocked');
  eq(S.holding?!!S.holding:false,id==='holding',id+': holding state only for act 3');
  ok(!S.ev.pending&&!(S.chef&&S.chef.pending),id+': no pending modal');
  C.applyGlobals(S);
  ok(BK.CITY&&BK.DISTRICTS.length>0,id+': home map mounted');
  const n=S.stores.length,before=JSON.stringify(S);
  for(let i=0;i<5;i++) E.tick(S);
  eq(S.stores.length,n,id+': five days keep the network');
  ok(JSON.stringify(S)!==before,id+': state moves');
  const again=BK.StartActs.state(id);
  eq(again.day,S.day-5,id+': second read is the same snapshot');
}
eq(H.holding.path,null,'holding start asks for a path');
eq(BK.StartActs.info('russia').stores,46,'info stores');
ok(BK.StartActs.info('holding').name.includes('холдинг'),'info name');
console.log(`СТАРТ В РОССИИ/ХОЛДИНГЕ: ${checks} проверок, 0 проблем`);
