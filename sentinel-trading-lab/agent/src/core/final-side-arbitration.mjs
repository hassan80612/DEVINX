// Last-mile single CALL/PUT arbiter. Uses the same received live prices as
// 189/191/192; this is NOT a new strategy, timer, quote source or order path.
// Continuation and reversal pressure are calculated independently before
// allowing the already-qualified candidate to reach the one-shot executor.
import {entryFamilyOf} from './entry-family.mjs';
const signOf=side=>side==='CALL'?1:side==='PUT'?-1:0;
const median=a=>{const b=a.filter(v=>Number.isFinite(v)&&v>0).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};
function causalTape(quoteHistory,at,now,spot){
 if(!(at>0&&now>=at&&now-at<=1950&&spot>0))return null;
 const tape=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),price=Number(q?.price);
  return Number.isFinite(ts)&&ts>=at-25000&&ts<=at&&received<=now&&Number.isFinite(price)&&price>0;
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(tape.length<13||tape.at(-1).ts!==at||tape.at(-1).price!==spot||
  tape.some((q,i)=>i>0&&(q.ts<=tape[i-1].ts||q.ts-tape[i-1].ts>2500)))return null;
 return tape;
}
function atOrBefore(tape,ts){
 for(let i=tape.length-1;i>=0;i--)
  if(tape[i].ts<=ts)return ts-tape[i].ts<=1700?tape[i]:null;
 return null;
}
export function assessCompetingSideEvidence({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(![30000,60000].includes(Number(durationMs)))return null;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const tape=causalTape(quoteHistory,at,clock,spot);
 if(!tape)return null;
 const p12=atOrBefore(tape,at-12000),p4=atOrBefore(tape,at-4000);
 if(!p12||!p4)return null;
 const noise=median(tape.slice(1).map((q,i)=>Math.abs(q.price-tape[i].price)));
 if(!(noise>0))return null;
 const tail=tape.slice(-3);
 const first=tail[1].price-tail[0].price,second=tail[2].price-tail[1].price;
 const former=p4.price-p12.price,live=spot-p4.price;
 const oldSign=Math.sign(former),nowSign=Math.sign(live);
 // A strong trend followed by a real, two-quote opposite move is a TURN
 // candidate, not a reason to buy/sell the direction of the old trend.
 const oldTrend=oldSign!==0&&Math.abs(former)>=noise*4.5;
 const oppositeTurn=oldTrend&&nowSign===-oldSign&&Math.abs(live)>=noise*2.3&&
  oldSign*first<0&&oldSign*second<0;
 // A sudden contrary extension after an already-qualified structural turn
 // invalidates the OLD price, without inventing an opposite-side order.
 const liveOpposition=nowSign!==0&&Math.abs(live)>=noise*2.3&&
  nowSign*first>0&&nowSign*second>0;
 const claimedFamily=entryFamilyOf(candidate);
 const structuralTurn=claimedFamily==='reversal'&&(
  candidate?.priceStructure?.confirmedReversal?.side===candidate.side||
  candidate?.priceStructure?.candleRoute?.event?.candleBacked===true||
  candidate?.priceStructure?.reactionProof?.confirmed===true||
  candidate?.earlyLevelProof?.confirmedTicks>=2);
 return {
  continuity:{side:oldSign>0?'CALL':oldSign<0?'PUT':null,
   significant:oldTrend,firstMove:former,liveMove:live},
  reversal:{side:oppositeTurn?(oldSign>0?'PUT':'CALL'):null,
   independentlyObserved:oppositeTurn,observedCounterMove:live},
  liveOpposition:{side:liveOpposition?(nowSign>0?'CALL':'PUT'):null,confirmed:liveOpposition},
  observedNoise:noise,structuralTurn,claimedFamily
 };
}
export function arbitrateFinalSide({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||!signOf(candidate?.side)||![30000,60000].includes(Number(durationMs)))
  return candidate;
 if(Number(candidate.observedAt)!==Number(quoteAt)||
    Number(candidate.entryPrice)!==Number(price))return candidate;
 const proof=assessCompetingSideEvidence({candidate,quoteHistory,quoteAt,now,price,durationMs});
 if(!proof)return candidate; // Keep existing established admission on absent evidence.
 const side=candidate.side,family=proof.claimedFamily;
 // All strategies share this final side, never switch CALL<->PUT here.
 if(family==='continuation'&&proof.reversal.independentlyObserved&&proof.reversal.side!==side)
  return {...candidate,ready:false,side:null,provisionalSide:side,
   reason:'final-side-confirmed-countermove',sideArbitration:{...proof,decision:'WAIT'}};
 // A reversal must still be moving in its own direction at entry. Earlier
 // closed-candle proof remains valid, but an actively opposing fresh leg is
 // a reason to skip this particular entry price.
 if(family==='reversal'&&proof.liveOpposition.confirmed&&
    proof.liveOpposition.side!==side&&!proof.reversal.independentlyObserved)
  return {...candidate,ready:false,side:null,provisionalSide:side,
   reason:'final-side-reversal-price-invalidation',sideArbitration:{...proof,decision:'WAIT'}};
 return {...candidate,sideArbitration:{...proof,decision:'KEEP',side}};
}
