// Last-millisecond check: a selected continuation can weaken while UI click is prepared.
// Read existing broker quote history only: no new delays or broker requests.
import {assessDirectionalPersistence} from '../src/core/now-opportunity-engine.mjs';
import {entryFamilyOf} from '../src/core/entry-family.mjs';
export function reviewDirectionBeforeClick({signal,context,now=Date.now()}={}){
 if(signal?.independent)return{ok:true,reason:'independent-mode'};
 const durationMs=Number(signal?.durationMs);
 if(durationMs!==30000&&durationMs!==60000)return{ok:true,reason:'other-horizon'};
 const turn=reviewObservedLastSecondTurn({signal,context,now});
 if(!turn.ok)return turn;
 const family=signal?.observedEntryFamily||entryFamilyOf({reason:signal?.auditEvidence?.finalReason});
 if(family!=='continuation')return{ok:true,reason:'not-continuation'};
 const state=assessDirectionalPersistence({quoteHistory:context?.quoteHistory||[],
  quoteAt:context?.quoteAt,now,price:context?.quote,durationMs});
 if(!['CALL','PUT'].includes(state.side))return{ok:true,reason:'insufficient-trend',state};
 const same=signal.side===state.side;
 if(same&&['weakening','reversal-testing'].includes(state.phase))
  return{ok:false,reason:'observed-trend-turned',state};
 if(!same&&['continuing','weakening','reversal-testing'].includes(state.phase))
  return{ok:false,reason:'live-direction-conflicts',state};
 return{ok:true,reason:'current-trend-compatible',state};
}

// Causal final quote-turn veto. The original analysis can still say
// "continuing" while the final ticks at a local high/low turn away.
// Apply it at the physical first-click boundary; no new broker IO or wait.
export function reviewObservedLastSecondTurn({signal,context,now=Date.now()}={}){
 if(signal?.independent||!['CALL','PUT'].includes(signal?.side)||
   ![30000,60000].includes(Number(signal?.durationMs)))
  return{ok:true,reason:'outside-short-automatic'};
 const at=Number(context?.quoteAt),clock=Number(now),spot=Number(context?.quote);
 if(!(at>0&&at<=clock&&clock-at<=1950&&spot>0))
  return{ok:true,reason:'no-fresh-quote'};
 const history=Array.isArray(context?.quoteHistory)?context.quoteHistory:[];
 const quotes=history.filter(q=>{
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??ts);
  return ts>=at-12000&&ts<=at&&received<=clock&&p>0&&Number.isFinite(p);
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 // Duplicate-timestamp buffers may contain replacement quotes, not a second tick.
 const rows=[];for(const q of quotes){if(rows.at(-1)?.ts===q.ts)rows[rows.length-1]=q;else rows.push(q)}
 if(rows.length<9||rows.at(-1).ts!==at||rows.at(-1).price!==spot||at-rows[0].ts<3500)
  return{ok:true,reason:'insufficient-current-turn-proof'};
 const last=rows.slice(-3),side=signal.side==='CALL'?1:-1;
 if(last.some((q,i)=>i&&((q.ts-last[i-1].ts)>2000||q.ts<=last[i-1].ts)))
  return{ok:true,reason:'recent-ticks-disconnected'};
 // Two consecutive movements AGAINST the proposed trade, at the boundary.
 if(!(side*(last[1].price-last[0].price)<0&&
      side*(last[2].price-last[1].price)<0))
  return{ok:true,reason:'no-confirmed-opposing-turn'};
 const older=rows.slice(0,-2);
 const peak=side>0?Math.max(...older.map(q=>q.price)):
  Math.min(...older.map(q=>q.price));
 const peakAt=older.filter(q=>q.price===peak).at(-1)?.ts||0;
 if(peakAt<at-6500||peakAt>last[0].ts)
  return{ok:true,reason:'not-recent-extreme'};
 const baseline=rows.find(q=>q.ts>=at-10000)?.price;
 const approach=side*(peak-baseline),retrace=side*(peak-spot);
 if(!(approach>0&&retrace>0))return{ok:true,reason:'no-previous-impulse'};
 const changes=[];
 for(let i=1;i<rows.length-2;i++){
  if(rows[i].ts-rows[i-1].ts<=2000&&rows[i].ts>rows[i-1].ts){
   const delta=Math.abs(rows[i].price-rows[i-1].price);
   if(delta>0)changes.push(delta);
  }
 }
 changes.sort((a,b)=>a-b);
 if(changes.length<5)return{ok:true,reason:'noise-scale-unknown'};
 const normal=changes[Math.floor(changes.length/2)];
 if(!(normal>0&&approach>=normal*4&&
      retrace>=normal*2&&retrace>=approach*.18))
  return{ok:true,reason:'turn-not-substantial'};
 return{ok:false,reason:'two-opposing-ticks-after-recent-extreme',
   evidence:{side:signal.side,turnAt:peakAt,quoteAt:at,
    retraceFraction:Number((retrace/approach).toFixed(3))}};
}
