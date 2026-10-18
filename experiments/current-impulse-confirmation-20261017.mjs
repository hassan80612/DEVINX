// Research only: continuation must still advance at its release quote.
// Uses the same 3s net/current-step evidence already used for range turns.
export function currentImpulseConfirmation({quoteHistory=[],quoteAt,price,now=quoteAt,side}={}){
 const ts=Number(quoteAt),spot=Number(price),sign=side==='CALL'?1:side==='PUT'?-1:0;
 const none=reason=>({confirmed:false,reason});
 if(!sign||!(ts>0&&ts<=now&&now-ts<=1450&&Number.isFinite(spot)&&spot>0))return none('unverified-current-impulse');
 const byTime=new Map();
 for(const q of quoteHistory){
  const at=Number(q.ts),receivedAt=Number(q.receivedAt??q.ts),p=Number(q.price);
  if(!(at>=ts-6000&&at<=ts&&receivedAt<=now&&p>0&&Number.isFinite(p)))continue;
  const prior=byTime.get(at);
  if(!prior||receivedAt<prior.receivedAt)byTime.set(at,{ts:at,price:p,receivedAt});
 }
 const rows=[...byTime.values()].sort((a,b)=>a.ts-b.ts),last=rows.at(-1),previous=rows.at(-2);
 if(last?.ts!==ts||last.price!==spot||!previous||ts-previous.ts>2500)return none('unverified-current-impulse');
 const target=ts-3000;
 let origin;for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target){origin=rows[i];break;}
 if(!origin||target-origin.ts>2500)return none('current-impulse-reference-unavailable');
 const shortMove=Math.log(spot/origin.price),lastStep=Math.log(spot/previous.price);
 return {confirmed:sign*shortMove>0&&sign*lastStep>=0,
  reason:sign*shortMove>0&&sign*lastStep>=0?'current-continuation-confirmed':'current-continuation-not-confirmed',shortMove,lastStep};
}
export function qualifyCurrentImpulse({candidate,durationMs=30000,...input}){
 if(durationMs!==30000||!candidate?.ready||candidate.reason!=='closed-structure-and-live-impulse')return candidate;
 const evidence=currentImpulseConfirmation({...input,side:candidate.side});
 return evidence.confirmed?candidate:{...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'research-continuation-without-current-followthrough',impulseConfirmation:evidence};
}
