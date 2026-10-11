/**
 * Research-only audit of ACTUAL FUTURE ENTRY, not now->H price direction.
 * Samples immutable scheduled forecasts, observes real market quotes at t+H
 * and t+H+hold, and credits an outcome only when both exist on-time.
 * No Supabase, broker orders, strategy veto, altered countdown or UI writes.
 */
const matched=(quotes,target,now,maxLagMs=1100)=>{
 if(!(target>0)||now<target)return null;
 for(const q of Array.isArray(quotes)?quotes:[]){
  const ts=Number(q?.ts),price=Number(q?.price);
  if(Number.isFinite(ts)&&Number.isFinite(price)&&price>0&&
    ts>=target&&ts<=Math.min(now,target+maxLagMs))return{ts,price};
 }
 return null;
};
export function progressFutureEntryAudit({
 previous=null,plan=null,quoteHistory=[],now=Date.now()
}={}){
 const old=previous||{};
 const pending=Array.isArray(old.pending)?old.pending:[];
 const ledger={...(old.ledger||{})};
 const next=[];
 for(const item of pending){
  if(now<item.exitAt){next.push(item);continue;}
  // No extrapolated candle close and no unbounded late settlement.
  const entry=matched(quoteHistory,item.entryAt,now);
  const exit=matched(quoteHistory,item.exitAt,now);
  if(!entry||!exit){
   if(now-item.exitAt<=15000)next.push(item);
   continue;
  }
  const movement=Math.sign(exit.price-entry.price);
  const key=[item.engineId,item.asset,item.delaySeconds,item.regime].join('|');
  const seen=ledger[key]||{
    engineId:item.engineId,asset:item.asset,delaySeconds:item.delaySeconds,
    regime:item.regime,verified:0,correct:0,draws:0,
    baselineCorrect:0,baselineVerified:0,
    candidateCorrect:0,candidateVerified:0
  };
  ledger[key]={...seen,verified:seen.verified+1,
   correct:seen.correct+(movement!==0&&movement===(item.side==='CALL'?1:-1)?1:0),
   draws:seen.draws+(movement===0?1:0),
   baselineVerified:seen.baselineVerified+(item.baselineSide?1:0),
   baselineCorrect:seen.baselineCorrect+
    (item.baselineSide&&movement!==0&&movement===(item.baselineSide==='CALL'?1:-1)?1:0),
   candidateVerified:seen.candidateVerified+(item.candidateSide?1:0),
   candidateCorrect:seen.candidateCorrect+
    (item.candidateSide&&movement!==0&&movement===(item.candidateSide==='CALL'?1:-1)?1:0)};
 }
 const last=old.lastRegistered||null;
 const newKey=plan?.side&&['CALL','PUT'].includes(plan.side)&&
   Number(plan.issuedAt)>0&&Number(plan.entryAt)>now&&Number(plan.exitAt)>Number(plan.entryAt)?
   [plan.engineId,plan.asset,plan.delaySeconds,plan.issuedAt].join('|'):null;
 if(newKey&&newKey!==last){
  // Only ONE registered immutable primary forecast; repeated 400ms ticks
  // are not counted as independent observations.
  next.push({engineId:plan.engineId,asset:plan.asset,
    delaySeconds:Number(plan.delaySeconds),entryAt:Number(plan.entryAt),
    exitAt:Number(plan.exitAt),side:plan.side,
    baselineSide:plan.baselineSide||null,
    candidateSide:plan.candidateSide||null,regime:plan.researchRegime||'unclassified'});
 }
 const activeEngine=plan?.engineId;
 const activeAsset=plan?.asset;
 const summaries=Object.values(ledger)
  .filter(x=>!activeEngine||(x.engineId===activeEngine&&x.asset===activeAsset))
  .sort((a,b)=>a.delaySeconds-b.delaySeconds);
 return{pending:next.slice(-500),lastRegistered:newKey||last,ledger,summaries};
}
