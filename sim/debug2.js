const BK=require('./load');const E=BK.Engine;
const S=E.newGame({seed:+(process.argv[2]||5)});
E.chooseProduction(S,S.prodOffers[0].id);
const o=S.offers.slice().sort((a,b)=>E.storeOpenCost(S,a).total-E.storeOpenCost(S,b).total)[0]; console.log(E.rentStore(S,o.id).ok, S.cash|0);
for(let i=0;i<200;i++){ if(S.ev.pending) E.resolveEvent(S,0); if(S.chef.pending) E.chefConfirm(S,[],[]); S.notify.length=0; E.tick(S);
 const st=S.stores[0];
 if(i%8==0) console.log(i, E.fmtDate(S.day), st.status, 'staff',st.staff.length,'inc',st.incoming.length, st.today?('chk '+(st.today.checks|0)+' load '+(st.today.load||0).toFixed(2)+' closed '+st.today.closed):'', st.staff.map(e=>Math.round(e.mood)+'/'+Math.round(e.fatigue)+'/'+e.trait).join(' '), 'cU', st.closedUntil);
}
console.log('phase',S.phase,'lost',S.lost,'pending',!!S.ev.pending, !!S.chef.pending,'cash',S.cash|0,'res',S.reserve|0,'neg',S.negMonths, 'cap', S.cache.cap, 'mods', JSON.stringify(S.mods));
console.log(S.history.map(h=>[h.m, h.rev|0, h.profit|0, h.cash|0].join(':')).join(' | '));
