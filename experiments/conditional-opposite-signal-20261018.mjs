// USER-REQUESTED EXPERIMENT. Does not submit orders, admit signals or read a broker.
// Fixed rule: four CLOSED 10s observed quote bars; mixed body directions OR a
// contrary last-6s move are selected. Continuous one-sided movement is protected.
const other=side=>side==='CALL'?'PUT':'CALL';
const finitePrice=p=>Number.isFinite(Number(p))&&Number(p)>0;
export function observedDirectionContext({quoteHistory=[],quoteAt,price,now=quoteAt}={}){
 const ts=Number(quoteAt),spot=Number(price);
 const unknown=reason=>({kind:'unknown',invert:false,reason});
 if(!(ts>0&&ts<=now&&now-ts<=2500&&finitePrice(spot)))return unknown('invalid-or-stale-quote');
 const byTime=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const at=Number(q?.ts),received=Number(q?.receivedAt??q?.ts),p=Number(q?.price);
  if(!(at>0&&at<=ts&&at>=ts-50000&&received>0&&received<=now&&finitePrice(p)))continue;
  const prior=byTime.get(at);if(!prior||received<prior.receivedAt)byTime.set(at,{ts:at,receivedAt:received,price:p});
 }
 const rows=[...byTime.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==ts||rows.at(-1)?.price!==spot)return unknown('unverified-entry-quote');
 const end=Math.floor(ts/10000)*10000,bars=[];
 for(let start=end-40000;start<end;start+=10000){
  const qs=rows.filter(q=>q.ts>=start&&q.ts<start+10000);
  if(qs.length<2||qs[0].ts-start>3000||start+10000-qs.at(-1).ts>3500||
     qs.some((q,i)=>i&&q.ts-qs[i-1].ts>3500))return unknown('incomplete-closed-observation-bars');
  const first=qs[0].price,last=qs.at(-1).price;
  bars.push({from:start,to:start+10000,open:first,close:last,direction:Math.sign(last-first)});
 }
 const signs=new Set(bars.map(b=>b.direction).filter(Boolean));
 if(signs.size===0)return {kind:'flat',invert:false,bars};
 if(signs.size===2)return {kind:'mixed-candles',invert:true,bars};
 const prior=rows.filter(q=>q.ts<=ts-6000).at(-1);
 if(!prior||ts-6000-prior.ts>2500)return unknown('missing-recent-observation');
 const dominant=[...signs][0],recent=Math.sign(spot-prior.price);
 if(recent===-dominant)return {kind:'pullback',invert:true,bars,dominant,recent};
 return {kind:'one-direction',invert:false,bars,dominant,recent};
}
export function conditionalOppositeSignal({candidate,quoteHistory,quoteAt,price,now=quoteAt,durationMs=30000}={}){
 // WAIT stays WAIT, an active lifecycle remains outside this transform, and an
 // already inverted decision cannot be inverted again accidentally.
 if(Number(durationMs)!==30000||candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
    candidate.conditionalInverse?.applied===true)return candidate;
 const context=observedDirectionContext({quoteHistory,quoteAt,price,now});
 if(!context.invert)return candidate;
 return {...candidate,side:other(candidate.side),
  ...(candidate.provisionalSide?{provisionalSide:other(candidate.side)}:{}),
  reason:'experimental-conditional-opposite',
  conditionalInverse:{applied:true,version:'mixed-or-pullback-v1',originalSide:candidate.side,
   originalReason:candidate.reason,condition:context.kind,context,
   entryAt:Number(quoteAt),durationMs:30000}};
}
