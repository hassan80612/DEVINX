// Last-millisecond check: a selected continuation can weaken while UI click is prepared.
// Read existing broker quote history only: no new delays or broker requests.
import {assessDirectionalPersistence} from '../src/core/now-opportunity-engine.mjs';
import {entryFamilyOf} from '../src/core/entry-family.mjs';
export function reviewDirectionBeforeClick({signal,context,now=Date.now()}={}){
 if(signal?.independent)return{ok:true,reason:'independent-mode'};
 const durationMs=Number(signal?.durationMs);
 if(durationMs!==30000&&durationMs!==60000)return{ok:true,reason:'other-horizon'};
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
