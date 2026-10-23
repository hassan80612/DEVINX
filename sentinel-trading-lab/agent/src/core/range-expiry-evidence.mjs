// Strictly causal, broker-read-only range outcome comparisons.
// Never requests quotes, opens orders, waits, or modifies the selected strategy.
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0;
export function assessRangeExpiryEvidence({quotes=[],now,spot,holdingMs,noise,lower,upper,regular=false}={}){
 const horizon=Number(holdingMs);
 if(!regular||![30000,60000,120000,300000].includes(horizon)||
   !(now>0&&valid(spot)&&noise>0&&Number.isFinite(lower)&&Number.isFinite(upper)&&upper>lower))return null;
 const span=upper-lower,position=(Math.log(spot)-lower)/span;
 if(position<.20||position>.80)return null;
 const map=new Map();
 for(const q of quotes){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(!(ts>0&&ts<=now&&received>0&&received<=now&&valid(p)))continue;
  if(!map.has(ts)||received<map.get(ts).receivedAt)map.set(ts,{ts,receivedAt:received,price:p});
 }
 const rows=[...map.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.length<50||rows.at(-1).ts<now-2500)return null;
 const priceAt=t=>{
  let lo=0,hi=rows.length-1,ix=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;
   if(rows[mid].ts<=t){ix=mid;lo=mid+1}else hi=mid-1}
  return ix>=0&&t-rows[ix].ts<=2500?rows[ix].price:null;
 };
 const backMs=12000,previous=priceAt(now-backMs);
 if(!(previous>0))return null;
 const currentFlow=Math.log(spot/previous);
 if(Math.abs(currentFlow)<noise*.055)return null;
 const flowSide=Math.sign(currentFlow),lastAnchor=now-horizon-5000,candidates=[];
 for(const q of rows){
  if(q.ts<=rows[0].ts+backMs+3000||q.ts>lastAnchor)continue;
  const pos=(Math.log(q.price)-lower)/span;
  if(Math.abs(pos-position)>.14)continue;
  const past=priceAt(q.ts-backMs),exit=priceAt(q.ts+horizon);
  if(!(past>0&&exit>0))continue;
  const flow=Math.log(q.price/past);
  if(Math.sign(flow)!==flowSide||Math.abs(flow)<noise*.055)continue;
  const ratio=Math.abs(flow)/Math.max(Math.abs(currentFlow),noise*.02);
  if(ratio<.35||ratio>2.9)continue;
  candidates.push({ts:q.ts,outcome:Math.log(exit/q.price)});
 }
 const independent=[];let newest=Infinity;
 for(let i=candidates.length-1;i>=0;i--){
  if(newest-candidates[i].ts<horizon)continue;
  independent.push(candidates[i]);newest=candidates[i].ts;
  if(independent.length>=8)break;
 }
 if(independent.length<4)return null;
 const votes=independent.filter(v=>Math.abs(v.outcome)>=noise*.12);
 if(votes.length<4)return null;
 const up=votes.filter(v=>v.outcome>0).length,down=votes.length-up;
 const side=up>=Math.ceil(votes.length*.8)?'CALL':
   down>=Math.ceil(votes.length*.8)?'PUT':null;
 if(!side)return null;
 const direction=side==='CALL'?1:-1;
 const values=votes.map(v=>direction*v.outcome).sort((a,b)=>a-b);
 if(values[Math.floor(values.length/2)]<noise*.28)return null;
 // Evidence about expiry outcome, not an unconditional current tick direction.
 if((side==='CALL'&&position>.76)||(side==='PUT'&&position<.24))return null;
 return {ready:true,side,reason:'observed-range-expiry-analogue',
   phase:side===(flowSide>0?'CALL':'PUT')?'continuation':'recovery',
   expiryEvidenceCount:votes.length,
   expiryEvidenceAgreement:Math.round(Math.max(up,down)/votes.length*100),
   observedExpirySeconds:horizon/1000,position};
}
