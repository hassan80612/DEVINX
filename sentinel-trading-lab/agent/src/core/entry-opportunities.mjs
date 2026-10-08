const finite=v=>v!=null&&Number.isFinite(Number(v));
// The window supplies permission to look, not the direction of the entry.
// Both sides are assessed from received quotes and the local structure.

// A level comes from earlier closed 5-second bars (shortModel.sr), not the
// current candle direction. Mapping is available before the next touch.
// A mapped level is *not* an entry: require a fresh touch and two advancing
// quotes after the local extreme, with room before the opposite barrier.
function mappedReaction({side,short,micro,price,quoteTs,recent,now,durationMs}){
  const call=side==='CALL',rawLevel=call?short.sr?.support:short.sr?.resistance,level=Number(rawLevel);
  const opposite=Number(call?short.sr?.resistance:short.sr?.support);
  if(rawLevel==null||!Number.isFinite(level)||level<=0)return {mapped:false,qualified:false};
  const tolerance=Math.max(Math.abs(level)*.000004,Math.abs(Number(micro.expected5)||0)*.2,Math.abs(Number(short.range)||0)*.12);
  const distance=Math.abs(price-level);
  const approaching=distance<=tolerance*3;
  const out={mapped:true,qualified:false,level,tolerance,approaching};
  if(recent.length<3||!approaching)return out;
  const extreme=call?Math.min(...recent.map(q=>q.price)):Math.max(...recent.map(q=>q.price));
  const touch=recent.filter(q=>q.price===extreme).at(-1);
  if(Math.abs(extreme-level)>tolerance*1.6||touch.ts>=quoteTs)return out;
  if(call?price<level-tolerance*1.6:price>level+tolerance*1.6)return out;
  // A two-quote reaction is independent of a lagging 5s/15s candle vote.
  const rebound=recent.filter(q=>q.ts>touch.ts);
  const buffer=Math.max(Math.abs(level)*.000002,tolerance*.20);
  const first=rebound.find(q=>call?q.price>=extreme+buffer:q.price<=extreme-buffer);
  const subsequent=first&&rebound.find(q=>q.ts>first.ts&&q.ts-first.ts>=50&&(call?q.price>=first.price:q.price<=first.price));
  if(!first||!subsequent||quoteTs-subsequent.ts>2000)return out;
  const room=!Number.isFinite(opposite)||opposite<=0||(call?opposite-price>tolerance*1.3:price-opposite>tolerance*1.3);
  if(!room)return {...out,blockedBy:'room'};
  const invalidation=call?extreme-buffer:extreme+buffer;
  if(call?price<=invalidation:price>=invalidation)return out;
  const reaction={qualified:true,side,id:side+'|mapped-level|'+level+'|'+touch.ts,
    trigger:first.price,invalidation,touchAt:touch.ts,confirmedAt:subsequent.ts,
    expiresAt:touch.ts+Math.min(durationMs,5000),advancing:true,roomOk:true,
    mappedLevel:level,preMapped:true};
  if(reaction.expiresAt<=now)return out;
  return {...out,qualified:true,room:true,reaction};
}

export function entryOpportunities({analysis,snap,now,minPoints=55,durationMs=30000}){
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
    const adverse=!mapped.qualified&&(call?short.turnDown===true||short.weakeningUp===true&&Number(micro.delta2)<0:short.turnUp===true||short.weakeningDown===true&&Number(micro.delta2)>0);
    const exhausted=!reversal&&(call?short.callOverextended===true||short.callReversalRisk===true:short.putOverextended===true||short.putReversalRisk===true);
    const localSetup=call?short.callSetup||short.readyCall||short.accelUp:short.putSetup||short.readyPut||short.accelDown;
    const forecastSetup=forecast.rawBias===side&&forecast.scenario?.continuationReady===true;
    const continuation=!reversal&&!!(localSetup||forecastSetup)&&bar.length>=2;
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
    const allowed=fresh&&short.ready===true&&flow&&structure&&room&&!adverse&&!exhausted&&(reversal||continuation)&&score>=minPoints&&timingValid;
    const blockedBy=!fresh?'feed':short.ready!==true?'warmup':!flow?'flow':!structure?'structure':!room?'room':adverse?'opposite-reaction':exhausted?'exhaustion':!(reversal||continuation)?'setup':score<minPoints?'score':!timingValid?'quotes':null;
    const reason={feed:'Cotação fora da leitura atual.',warmup:'Aguardando microestrutura.',flow:'Aguardando fluxo do ponto.',structure:'Aguardando estrutura do ponto.',room:'Preço sem espaço antes da barreira.', 'opposite-reaction':'Reação contrária no ponto.',exhaustion:'Movimento estendido no ponto.',setup:'Aguardando oportunidade estrutural.',score:'Força do ponto abaixo do filtro.',quotes:'Aguardando cotações independentes do ponto.'}[blockedBy]||(mapped.mapped&&mapped.approaching&&!mapped.qualified?'Nível estrutural mapeado; aguardando a primeira reação confirmada.':'Oportunidade local confirmada.');
    const plan={...forecast,entryForecastProbability:Number(call?forecast.callProbability:forecast.putProbability),rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:score,modelConfidence:score,strategyFutureBias:side,strategyFutureConflict:false,strategyFuture:{activeCount:0,confidence:score},reaction,expectedMove,scenario:{kind,reversalConfirmed:reversal,continuationReady:continuation,triggerBasis:reversal?'confirmed-local-reaction':'previous-short-bar'},entryTiming:{maxDistance:repeated?.maxDistance||maxDistance,sourceBarAt:sourceAt},safety:{blocked:false}};
    if(call){plan.callTrigger=trigger;plan.callInvalidation=invalidation;}else{plan.putTrigger=trigger;plan.putInvalidation=invalidation;}
    // Percentages here are internal gating scores, not measured win probabilities.
    plan.callProbability=call?score:100-score;plan.putProbability=100-plan.callProbability;
    return{side,kind,score,allowed,flow,structure,room,fresh,blockedBy,reason,plan,level:mapped.mapped?mapped.level:null,approaching:mapped.approaching===true,structuralReaction:mapped.qualified,key:[side,kind,sourceAt,trigger].join('|')};
  });
}
