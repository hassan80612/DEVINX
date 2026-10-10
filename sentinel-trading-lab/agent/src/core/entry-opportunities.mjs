import {reversalStructure} from './reversal-structure.mjs';
const finite=v=>v!=null&&Number.isFinite(Number(v));
// The window supplies permission to look, not the direction of the entry.
// Both sides are assessed from received quotes and the local structure.

// A level comes from earlier closed 5-second bars (shortModel.sr), not the
// current candle direction. Mapping is available before the next touch.
// A mapped level is *not* an entry: require a fresh touch and two advancing
// quotes after the local extreme, with room before the opposite barrier.
function mappedReaction({side,short,micro,price,quoteTs,recent,now,durationMs}){
  const call=side==='CALL',rawLevel=call?short.sr?.support:short.sr?.resistance,level=Number(rawLevel);
  const rawOpposite=call?short.sr?.resistance:short.sr?.support,opposite=Number(rawOpposite);
  if(rawLevel==null||!Number.isFinite(level)||level<=0)return {mapped:false,qualified:false};
  const tolerance=Math.max(Math.abs(level)*.000004,Math.abs(Number(micro.expected5)||0)*.2,Math.abs(Number(short.range)||0)*.12);
  const distance=Math.abs(price-level),approaching=distance<=tolerance*3;
  const out={mapped:true,qualified:false,level,tolerance,approaching,phase:approaching?'watch-touch':'mapped'};
  if(recent.length<4||!approaching)return out;

  // The same level can be attacked repeatedly; no single uptick is a reversal.
  // Compare the rebound to actual quote noise, capped by the zone width so
  // one large approach candle cannot impose a late confirmation.
  const steps=recent.slice(1).map((q,i)=>Math.abs(q.price-recent[i].price)).filter(n=>n>0&&Number.isFinite(n)).sort((a,b)=>a-b);
  if(steps.length<3)return out;
  const noise=steps[Math.floor(steps.length/2)];
  const buffer=Math.max(Math.abs(level)*.000002,tolerance*.25,Math.min(noise*.75,tolerance*.65));
  const extreme=call?Math.min(...recent.map(q=>q.price)):Math.max(...recent.map(q=>q.price));
  const touch=recent.filter(q=>q.price===extreme).at(-1);
  const before=recent.filter(q=>q.ts<touch.ts);
  if(!before.length||Math.abs(extreme-level)>tolerance*1.6||touch.ts>=quoteTs)return out;
  // Approach from the valid side is independent evidence of a tested level.
  const approached=before.some(q=>call?q.price>=level+buffer*.75:q.price<=level-buffer*.75);
  const intoLevel=call?before.at(-1).price>extreme:before.at(-1).price<extreme;
  if(!approached||!intoLevel)return {...out,phase:'no-approach'};
  if(call?extreme<level-tolerance*1.6:extreme>level+tolerance*1.6)return {...out,phase:'broken-level'};
  const rebound=recent.filter(q=>q.ts>touch.ts);
  const first=rebound.find(q=>call?q.price>=extreme+buffer:q.price<=extreme-buffer);
  const second=first&&rebound.find(q=>q.ts>first.ts&&q.ts-first.ts>=50&&
    (call?q.price>=first.price+buffer*.30:q.price<=first.price-buffer*.30));
  if(!first||!second||second.ts-touch.ts>2200||quoteTs-second.ts>1500)
    return {...out,phase:'awaiting-follow-through'};
  // A touch/rebound/touch whipsaw is not a sustained structural reaction.
  const afterFirst=rebound.filter(q=>q.ts>first.ts&&q.ts<=quoteTs);
  const returnedToLevel=afterFirst.some(q=>call?q.price<first.price-buffer*.6:q.price>first.price+buffer*.6);
  const surrendered=call?price<second.price-buffer*.6:price>second.price+buffer*.6;
  if(returnedToLevel||surrendered)return {...out,phase:'failed-retest'};
  const room=rawOpposite==null||!Number.isFinite(opposite)||opposite<=0||
    (call?opposite-price>tolerance*1.3:price-opposite>tolerance*1.3);
  if(!room)return {...out,phase:'no-room',blockedBy:'room'};
  const invalidation=call?extreme-buffer:extreme+buffer;
  if(call?price<=invalidation:price>=invalidation)return {...out,phase:'invalidated'};
  const expectedMove=Math.abs(Number(micro.expected30)||0);
  const maxDistance=Math.max(tolerance*1.75,expectedMove*.25,buffer*2);
  if(call?price-first.price>maxDistance:first.price-price>maxDistance)
    return {...out,phase:'late-price'};
  const reaction={qualified:true,side,id:side+'|mapped-level|'+level+'|'+touch.ts,
    trigger:first.price,invalidation,touchAt:touch.ts,confirmedAt:second.ts,
    expiresAt:touch.ts+Math.min(durationMs,5000),maxDistance,
    advancing:true,roomOk:true,mappedLevel:level,preMapped:true,
    buffer,noise,quoteConfirmations:2};
  if(reaction.expiresAt<=now)return {...out,phase:'expired'};
  return {...out,qualified:true,room:true,phase:'confirmed-reaction',reaction};
}
export function entryOpportunities({analysis,snap,now,minPoints=55,durationMs=30000,entryPolicy='local-v2'}){
  const short=analysis?.metrics?.shortModel||{},micro=analysis?.metrics?.micro||{},forecast=analysis?.entryPlanner?.horizons?.[String(Math.round(durationMs/1000))]||{};
  const quoteTs=Number(snap.quoteTs),price=Number(snap.price),fresh=quoteTs<=now&&now-quoteTs<=2500;
  const points=(snap.quoteHistory||[]).filter(q=>finite(q.ts)&&finite(q.price)&&Number(q.price)>0&&Number(q.ts)<=Math.min(now,quoteTs)&&Number(q.ts)>=now-10000).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
  if(finite(price)&&quoteTs<=now&&!points.some(q=>q.ts===quoteTs))points.push({ts:quoteTs,price});
  const unique=[...new Map(points.map(q=>[q.ts,q])).values()];
  const closedBucket=Math.floor(quoteTs/5000)*5000-5000,bar=unique.filter(q=>q.ts>=closedBucket&&q.ts<closedBucket+5000),recent=unique.filter(q=>q.ts>=quoteTs-5000);
  return ['CALL','PUT'].map(side=>{
    const call=side==='CALL',aligned=call?Number(micro.delta5)>0:Number(micro.delta5)<0;
    const mapped=mappedReaction({side,short,micro,price,quoteTs,recent,now,durationMs});
    const repeated=short.repeatedReaction?.qualified===true&&short.repeatedReaction.side===side&&short.repeatedReaction.expiresAt>now?short.repeatedReaction:null;
    const confirmed=call?short.reversalCallConfirmed===true:short.reversalPutConfirmed===true;
    const located=call?short.reversalCallCandidate||short.failedBreakDown||short.turnUp:short.reversalPutCandidate||short.failedBreakUp||short.turnDown;
    const reversal=!!repeated||mapped.qualified||(confirmed&&!!located);
    const flow=mapped.qualified||aligned&&(call?short.flowReadyCall===true:short.flowReadyPut===true)||aligned&&reversal;
    const structure=mapped.qualified||(call?short.structureReadyCall===true:short.structureReadyPut===true)||reversal;
    const room=mapped.qualified?mapped.room:repeated?repeated.roomOk===true:(call?short.callRoomOk===true:short.putRoomOk===true);
    const adverse=!mapped.qualified&&(call?short.turnDown===true||short.weakeningUp===true&&Number(micro.delta2)<0&&Number(micro.delta5)<0:short.turnUp===true||short.weakeningDown===true&&Number(micro.delta2)>0&&Number(micro.delta5)>0);
    const exhausted=!reversal&&(call?short.callOverextended===true||short.callReversalRisk===true:short.putOverextended===true||short.putReversalRisk===true);
    const localSetup=call?short.callSetup||short.readyCall||short.accelUp:short.putSetup||short.readyPut||short.accelDown;
    const forecastSetup=forecast.rawBias===side&&forecast.scenario?.continuationReady===true;
    // A fresh break of an ALREADY CLOSED 5s range is a legitimate local
    // continuation candidate. Do not wait for a slower trend projection to
    // label the movement after the impulse is over. Preserve the existing
    // technical, flow, freshness, and two-quote execution confirmations.
    const closedRange=bar.length>=2?(call?Math.max(...bar.map(q=>q.price)):Math.min(...bar.map(q=>q.price))):null;
    // Judge the actual acceptance of a completed range, not the colour of
    // the latest candle. One isolated spike beyond a weak prior candle is
    // insufficient; two distinct advancing post-break quotes are evidence.
    // Do NOT cap the size of a sustained breakout or require a retracement.
    const currentQuotes=unique.filter(q=>q.ts>=closedBucket+5000);
    const beyond=closedRange==null?[]:currentQuotes.filter(q=>call?q.price>closedRange:q.price<closedRange);
    const firstBreak=beyond[0]||null;
    const nextAdvance=firstBreak?beyond.find(q=>q.ts>firstBreak.ts&&(call?q.price>firstBreak.price:q.price<firstBreak.price)):null;
    const lostLevel=firstBreak&&currentQuotes.some(q=>q.ts>firstBreak.ts&&(call?q.price<=closedRange:q.price>=closedRange));
    const acceptedBreak=!!nextAdvance&&!lostLevel;
    const firstRangeBreak=closedRange!=null&&acceptedBreak&&
      (call?price>closedRange:price<closedRange)&&
      (call?Number(micro.delta2)>0:Number(micro.delta2)<0)&&
      (call?short.structureReadyCall===true&&short.flowReadyCall===true:
            short.structureReadyPut===true&&short.flowReadyPut===true);
    const continuation=!reversal&&!!(localSetup||forecastSetup||firstRangeBreak)&&bar.length>=2;
    const kind=reversal?'reversal':short.retest?.side===(call?'BUY':'SELL')?'breakout':'continuation';
    const rawScore=Number(call?short.callScore:short.putScore),reversalScore=Number(call?short.reversalCallScore:short.reversalPutScore);
    const score=Math.min(100,Math.max(Number.isFinite(rawScore)?rawScore:0,reversal&&Number.isFinite(reversalScore)?reversalScore:0)+(mapped.qualified?10:0));
    let trigger=null,invalidation=null,reaction=null,sourceAt=closedBucket;
    const expectedMove=Math.max(Math.abs(Number(forecast.expectedMove||0)),Math.abs(Number(micro.expected30||0)),Math.abs(price)*.000002);
    const width=recent.length?Math.max(...recent.map(q=>q.price))-Math.min(...recent.map(q=>q.price)):0;
    const maxDistance=Math.max(expectedMove*.25,width*.25,Math.abs(price)*.000002);
    if(mapped.qualified){trigger=mapped.reaction.trigger;invalidation=mapped.reaction.invalidation;reaction=mapped.reaction;sourceAt=mapped.reaction.touchAt;}
    else if(repeated){trigger=Number(repeated.trigger);invalidation=Number(repeated.invalidation);reaction={...repeated};sourceAt=repeated.touchAt;}
    else if(reversal&&recent.length>=2){
      const extreme=call?Math.min(...recent.map(q=>q.price)):Math.max(...recent.map(q=>q.price));
      const anchor=recent.filter(q=>q.price===extreme).at(-1),buffer=Math.max(width*.08,Math.abs(price)*.000002);
      const after=recent.filter(q=>q.ts>anchor.ts&&(call?q.price>=extreme+buffer:q.price<=extreme-buffer));
      if(after.length){trigger=after[0].price;invalidation=call?extreme-buffer:extreme+buffer;sourceAt=anchor.ts;
        const last=after.at(-1),previous=after.at(-2),advancing=!!previous&&(call?last.price>=previous.price:last.price<=previous.price);
        reaction={qualified:true,side,id:side+'|local-reaction|'+anchor.ts,trigger,invalidation,touchAt:anchor.ts,confirmedAt:after[0].ts,expiresAt:anchor.ts+Math.min(durationMs,10000),maxDistance,advancing,roomOk:room};
      }
    }else if(continuation){trigger=call?Math.max(...bar.map(q=>q.price)):Math.min(...bar.map(q=>q.price));invalidation=call?Math.min(...bar.map(q=>q.price))-maxDistance*.2:Math.max(...bar.map(q=>q.price))+maxDistance*.2;}
    const timingValid=finite(trigger)&&finite(invalidation)&&(!reaction||reaction.expiresAt>now);
    const reversalEvidence=entryPolicy==='structural-reversals-v1'&&reversal?reversalStructure({side,snap,now,durationMs,reaction,expectedMove,oppositeLevel:call?short.sr?.resistance:short.sr?.support}):null;
    if(reversalEvidence?.allowed){
      // Own the structural break as the trigger. Reusing the first uptick's
      // earlier trigger would incorrectly classify a timely break as late.
      trigger=reversalEvidence.level+(call?1:-1)*reversalEvidence.buffer;
      reaction={...reaction,trigger,structuralBreak:reversalEvidence};
    }
    const allowed=fresh&&short.ready===true&&flow&&structure&&room&&!adverse&&!exhausted&&(reversal||continuation)&&score>=minPoints&&timingValid&&(!reversalEvidence||reversalEvidence.allowed);
    const blockedBy=!fresh?'feed':short.ready!==true?'warmup':!flow?'flow':!structure?'structure':!room?'room':adverse?'opposite-reaction':exhausted?'exhaustion':!(reversal||continuation)?'setup':score<minPoints?'score':!timingValid?'quotes':reversalEvidence?.blockedBy??null;
    const reason={feed:'Cotação fora da leitura atual.',warmup:'Aguardando microestrutura.',flow:'Aguardando fluxo do ponto.',structure:'Aguardando estrutura do ponto.',room:'Preço sem espaço antes da barreira.', 'opposite-reaction':'Reação contrária no ponto.',exhaustion:'Movimento estendido no ponto.',setup:'Aguardando oportunidade estrutural.',score:'Força do ponto abaixo do filtro.',quotes:'Aguardando cotações independentes do ponto.','structure-history':'Reação curta sem estrutura anterior identificável.','structure-break':'Reação curta ainda não rompeu a estrutura anterior.','expiration-room':'Reversão sem espaço conhecido para o movimento da expiração.'}[blockedBy]||(mapped.mapped&&mapped.approaching&&!mapped.qualified?'Nível estrutural mapeado; aguardando a primeira reação confirmada.':'Oportunidade local confirmada.');
    const plan={...forecast,entryForecastProbability:Number(call?forecast.callProbability:forecast.putProbability),rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:score,modelConfidence:score,strategyFutureBias:side,strategyFutureConflict:false,strategyFuture:{activeCount:0,confidence:score},reaction,expectedMove,scenario:{kind,reversalConfirmed:reversal,continuationReady:continuation,triggerBasis:reversal?'confirmed-local-reaction':'previous-short-bar'},entryTiming:{maxDistance:repeated?.maxDistance||maxDistance,sourceBarAt:sourceAt},safety:{blocked:false}};
    if(call){plan.callTrigger=trigger;plan.callInvalidation=invalidation;}else{plan.putTrigger=trigger;plan.putInvalidation=invalidation;}
    // Percentages here are internal gating scores, not measured win probabilities.
    plan.callProbability=call?score:100-score;plan.putProbability=100-plan.callProbability;
    return{side,kind,score,allowed,flow,structure,room,fresh,blockedBy,reason,plan,reversalEvidence,level:mapped.mapped?mapped.level:null,approaching:mapped.approaching===true,structuralReaction:mapped.qualified,key:[side,kind,sourceAt,trigger].join('|')};
  });
}

