const BK=require('./load');const E=BK.Engine;
const S=E.newGame({seed:7919});
E.chooseProduction(S,S.prodOffers[1].id);
const o=S.offers[0]; console.log('offer',o, E.storeOpenCost(S,o));
E.rentStore(S,o.id);
console.log('cash after',S.cash);
for(let i=0;i<120;i++){ if(S.ev.pending) E.resolveEvent(S,0); S.notify.length=0; E.tick(S);
 const st=S.stores[0];
 if(i%10==0 && st.today) console.log(i, E.fmtDate(S.day), 'checks',st.today.checks|0,'load',st.today.load.toFixed(2),'chk',st.today.check|0,'rev',st.today.rev|0,'staff',st.staff.length, st.staff.map(e=>Math.round(e.mood)+'/'+Math.round(e.fatigue)).join(' '));
}
console.log(JSON.stringify(S.history.map(h=>h.pnl),null,0));
