// Offline baselines: deliberately simple current-flow hypotheses. No Agent use.
export function currentFlowDirection(input,{method='horizon_momentum'}={}){
 const {quoteHistory=[],price,quoteAt,now=quoteAt,durationMs=30000}=input;
 const no=reason=>({ready:false,side:null,reason,observedAt:quoteAt});
 if(durationMs!==30000||!(price>0)||quoteAt>now||now-quoteAt>1450)return no('flow-stale-or-invalid');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&q.ts>=quoteAt-durationMs*6&&
  (q.receivedAt??q.ts)<=now&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1).price!==price)return no('flow-unverified-quote');
 const prior=rows.findLast(q=>q.ts<=quoteAt-durationMs);
 if(!prior||quoteAt-durationMs-prior.ts>1500)return no('flow-history-unavailable');
 let score;
 if(method==='horizon_momentum')score=Math.log(price/prior.price);
 else{
  let fast=Math.log(rows[0].price),slow=fast;
  for(let i=1;i<rows.length;i++){
   const dt=rows[i].ts-rows[i-1].ts,p=Math.log(rows[i].price);
   fast+=(1-Math.exp(-dt/(durationMs/6)))*(p-fast);
   slow+=(1-Math.exp(-dt/durationMs))*(p-slow);
  }
  score=fast-slow;
 }
 if(Math.abs(score)<1e-12)return no('flow-neutral');
 return {ready:true,side:score>0?'CALL':'PUT',reason:'research-'+method,
  observedAt:quoteAt,entryPrice:price,score};
}
