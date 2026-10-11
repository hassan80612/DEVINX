/**
 * In-memory, outcome-only research audit. A forecast is evaluated solely
 * AFTER its original target using an actual on-time quote. No database,
 * broker orders, strategy gating, score-based veto or prediction rewrite.
 *
 * We audit one sampled immutable forecast per (engine, asset, horizon) at
 * each interval rather than recording each 400ms worker iteration. Sampling
 * changes only research bookkeeping, never when the motor computes.
 */
export function progressHorizonAudit({
  previous=null,forecastRows=[],engineId='automatic',asset='unknown',
  quoteHistory=[],now=Date.now(),newQuote=false
}={}){
  const current=Number(now),before=previous||{};
  const pending=Array.isArray(before.pending)?before.pending:[];
  const ledger={...(before.ledger||{})};
  const lastRecorded={...(before.lastRecorded||{})};
  const sorted=Array.isArray(quoteHistory)?quoteHistory.filter(q=>
    Number.isFinite(Number(q?.ts))&&Number.isFinite(Number(q?.price))&&
    Number(q.price)>0&&Number(q.ts)<=current).sort((a,b)=>Number(a.ts)-Number(b.ts)):[];
  const nextPending=[];
  for(const r of pending){
    if(current<r.targetAt){nextPending.push(r);continue;}
    // Only a tick within 1000ms of the ORIGINAL deadline can settle it.
    // If the quote is missing, wait briefly; never use a later candle close.
    const q=sorted.find(q=>Number(q.ts)>=r.targetAt&&Number(q.ts)<=r.targetAt+1000);
    if(!q){
      if(current-r.targetAt<=15000)nextPending.push(r);
      continue;
    }
    const key=r.key,result=Math.sign(Number(q.price)-r.referencePrice);
    const count=ledger[key]||{engineId:r.engineId,asset:r.asset,horizonSeconds:r.horizonSeconds,
      verified:0,correct:0,draws:0};
    ledger[key]={...count,verified:count.verified+1,
      correct:count.correct+(result!==0&&result===(r.side==='CALL'?1:-1)?1:0),
      draws:count.draws+(result===0?1:0)};
  }
  if(newQuote){
    for(const r of forecastRows){
      if(!['CALL','PUT'].includes(r?.side)||!(Number(r.projectedPrice)>0)||
         !(Number(r.referencePrice)>0)||!(Number(r.targetAt)>current)||
         !(Number(r.issuedAt)<=current))continue;
      const h=Number(r.horizonSeconds),key=[engineId,asset,h].join('|');
      const auditEveryMs=Math.max(5000,Math.min(30000,h*1000));
      if(current-Number(lastRecorded[key]||0)<auditEveryMs)continue;
      lastRecorded[key]=current;
      nextPending.push({key,engineId,asset,horizonSeconds:h,side:r.side,
        referencePrice:Number(r.referencePrice),
        issuedAt:Number(r.issuedAt),targetAt:Number(r.targetAt)});
    }
  }
  const summaries=Object.values(ledger)
    .filter(x=>x.engineId===engineId&&x.asset===asset)
    .sort((a,b)=>a.horizonSeconds-b.horizonSeconds)
    .map(x=>({horizonSeconds:x.horizonSeconds,verified:x.verified,
      correct:x.correct,draws:x.draws}));
  return {pending:nextPending.slice(-1200),lastRecorded,ledger,summaries};
}
