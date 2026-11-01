// Admission-only: do not execute twice on the SAME observed price opportunity.
// Persistent evidence belongs to the analyst's last fired NOW signal, not to a
// UI cycle or broker settlement. No timers, quote collection, clicks, expiry
// edits, or modification of a candidate's side.
import {entryFamilyOf,reactionLevel} from './entry-family.mjs';

const SUPPORTED=new Set([30000,60000]);
const unchanged=candidate=>candidate;
const sign=side=>side==='CALL'?1:side==='PUT'?-1:0;
const finitePositive=x=>Number.isFinite(Number(x))&&Number(x)>0;
const veto=candidate=>({...candidate,ready:false,side:null,
  provisionalSide:candidate.side,
  reason:'Aguardando nova oportunidade estrutural; movimento anterior já utilizado.',
  entryRisk:{kind:'same-opportunity-after-expiry',blocked:true,
    reasons:['same-opportunity-not-renewed']}});

// The last signal is committed only when the analyst issues a REAL new signal.
// A scanning state, post-expiry quote or dashboard refresh cannot erase it.
export function rememberFiredOpportunity({candidate,signal,provider,asset,durationMs}={}){
 if(signal?.phase!=='fired'||!['CALL','PUT'].includes(signal.side))return null;
 const family=entryFamilyOf(candidate),at=Number(signal.entryTriggeredAt);
 const level=reactionLevel(candidate);
 return {provider:String(provider||'').toLowerCase(),asset:String(asset||'').toUpperCase(),
   durationMs:Number(durationMs),at,exitAt:Number(signal.exitAt),side:signal.side,
   family,level:finitePositive(level)?level:null,
   entryPrice:Number(signal.entryPrice),reason:String(candidate?.reason||'')};
}

// Only deny a same-side / same-family repeat if the original entry is known
// AND the complete observed, on-time price path proves it is NOT renewed.
// New directions, genuinely different families and independent levels retain
// the original analyst's own admission rules.
export function reviewDistinctOpportunity({candidate,last,provider,asset,durationMs,
 quoteHistory=[],quoteAt,now,price,tolerance=0}={}){
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
   !SUPPORTED.has(Number(durationMs))||!last||last.side!==candidate.side)return unchanged(candidate);
 const family=entryFamilyOf(candidate);
 if(!family||!last.family||family!==last.family)return unchanged(candidate);
 if(last.provider!==String(provider||'').toLowerCase()||
    last.asset!==String(asset||'').toUpperCase()||
    last.durationMs!==Number(durationMs))return unchanged(candidate);
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),
  priorAt=Number(last.at),priorExit=Number(last.exitAt);
 if(!(finitePositive(last.entryPrice)&&finitePositive(spot)&&priorAt>0&&
    at>priorAt&&at<=clock&&clock-at>=0&&clock-at<=2500&&
    clock>=priorExit&&Number(candidate.observedAt)===at&&
    Number(candidate.entryPrice)===spot))return unchanged(candidate);
 // A different verified level is new structural evidence. Comparing a
 // missing, zero or manufactured level would be unsafe.
 const currentLevel=reactionLevel(candidate);
 const structuralScale=Math.max(Number(tolerance)||0,Math.abs(spot)*0.000005);
 const oldLevelKnown=finitePositive(last.level),newLevelKnown=finitePositive(currentLevel);
 if(oldLevelKnown&&newLevelKnown&&
    Math.abs(currentLevel-last.level)>structuralScale)
   return unchanged(candidate);
 // A different continuation route is already fresh strategy evidence.
 // For reversals, different names may still refer to the SAME historical
 // level; compare that verified level instead of its changing label.
 if(last.reason!==candidate.reason&&
    (family!=='reversal'||!oldLevelKnown||!newLevelKnown))
   return unchanged(candidate);

 // Read the received quote prefix only. Keep this bounded in the hot path.
 const rows=[];
 for(let i=(Array.isArray(quoteHistory)?quoteHistory.length:0)-1;i>=0&&rows.length<360;i--){
   const q=quoteHistory[i],ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
   if(!(ts>priorAt))break;
   if(ts<=at&&received<=clock&&finitePositive(p))rows.push({ts,price:p});
 }
 rows.reverse();
 // Missing coverage is NOT evidence of a repeated opportunity. Existing
 // quote/history integrity gates remain the authority in that case.
 if(rows.length<7||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
    rows[0].ts-priorAt>2500)
   return unchanged(candidate); // Cannot prove reuse if prior-entry tape was lost.
 const d=sign(candidate.side);
 const values=[Number(last.entryPrice),...rows.map(r=>d*r.price)];
 values[0]=d*Number(last.entryPrice);
 const ticks=[];
 for(let i=2;i<values.length;i++){
  const diff=Math.abs(values[i]-values[i-1]);
  if(diff>0&&Number.isFinite(diff))ticks.push(diff);
 }
 ticks.sort((a,b)=>a-b);
 const typical=ticks.length?ticks[Math.floor(ticks.length/2)]:0;
 // Scale to BOTH market noise and verified structure. No absolute pip limit.
 const minTurn=Math.max(Math.abs(spot)*1e-6,typical*2.5,
   Math.max(0,Number(tolerance)||0)*.22);
 if(!(minTurn>0))return unchanged(candidate);
 const latest=values.length-1;
 // A new pullback must be followed by a genuine CURRENT recovery; old
 // retracements consumed before the previous entry never count.
 const recentRise=latest>=4&&values[latest]>values[latest-3]&&
   values[latest]>values[latest-1];
 let peak=values[0],renewed=false;
 for(let i=1;i<latest-1;i++){
  if(peak-values[i]>=minTurn&&
     values[latest]-values[i]>=minTurn&&recentRise){
    renewed=true;break;
  }
  if(values[i]>peak)peak=values[i];
 }
 return renewed?unchanged(candidate):veto(candidate);
}
