// Passive, local-only decision and broker-settlement audit.
// Whitelisted primitive evidence; never include credentials, balances or browser DOM.
const numberOrNull=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const short=(x,max=90)=>x==null?null:String(x).slice(0,max);
const keys=['micro','momentum','history','location','setup','reversal','acceleration','mtf'];
export function decisionAudit({signal,context,mode,martingaleLevel,clickCount,now=Date.now()}={}){
 const a=context?.analysis||{},op=a.operationalSignal||{};
 const seconds=Math.round(Number(signal?.durationMs||0)/1000);
 const plan=a.entryPlanner?.horizons?.[String(seconds)]||{};
 const families=plan.evidenceFamilies||{};
 const evidence=Object.fromEntries(keys.map(k=>[k,numberOrNull(families[k]?.signal)]));
 const research=op.entryResearch||{};
 // In NOW the callback fires BEFORE runtime.lastResult is replaced.
 // Use the attached snapshot from the same fired tick, never the stale card.
 const proof=mode==='automatic'&&signal?.auditEvidence?.source==='now-structural-v1'&&
  Number(signal.auditEvidence.signalAt)===Number(signal?.at)&&
  signal.auditEvidence.finalSide===signal?.side?signal.auditEvidence:null;
 const level=x=>x&&numberOrNull(x.level)!==null?{level:numberOrNull(x.level),touches:numberOrNull(x.touches)}:null;
 return {
  type:'trade_decision',ts:now,provider:short(context?.provider,30),asset:short(context?.asset,45),
  batchId:short(signal?.id,1024),engine:short(context?.engine,90),
  directionMode:short(mode,24),independent:signal?.independent===true,
  side:signal?.side==='CALL'?'CALL':signal?.side==='PUT'?'PUT':null,
  durationMs:numberOrNull(signal?.durationMs),signalAt:numberOrNull(signal?.at),
  signalPrice:numberOrNull(signal?.entryPrice),snapshotQuote:numberOrNull(context?.quote),
  snapshotQuoteAt:numberOrNull(context?.quoteAt),
  martingaleLevel:numberOrNull(martingaleLevel),clickCount:numberOrNull(clickCount),
  structure:{
   provenance:proof?'fired-tick-now':'analysis-snapshot',
   regime:short(proof?(proof.regime??proof.marketShape):a.entryPlanner?.regime?.label,75),
   entryKind:short(proof?(proof.levelReaction??proof.contextStrategy):op.entryKind,75),
   side:short(proof?proof.finalSide:op.side,8),state:short(proof?'FIRED_NOW':op.state,75),
   reason:short(proof?proof.finalReason:op.reason,180),
   technicalStrength:numberOrNull(proof?proof.finalStrength:(op.decisionStrength??op.strength)),
   rawReason:short(proof?.rawReason,180),rawSide:short(proof?.rawSide,8),
   contextStrategy:short(proof?.contextStrategy,75),marketShape:short(proof?.marketShape,90),
   support:level(proof?.support),resistance:level(proof?.resistance),
   levelReaction:short(proof?.levelReaction,90),
   // Exactly three non-sensitive market movements, present only if an actual
   // fired trade inherited a verified same-tick horizon-reaction proof.
   levelExpiryProof:proof?.levelExpiryProof?{
    confirmed:proof.levelExpiryProof.confirmed===true,
    reason:short(proof.levelExpiryProof.reason,90),
    durationMs:numberOrNull(proof.levelExpiryProof.durationMs),
    moves:Array.isArray(proof.levelExpiryProof.moves)?
      proof.levelExpiryProof.moves.slice(0,3).map(numberOrNull):null
   }:null,
   observedNetMove:numberOrNull(proof?.observedNetMove),
   observedImpulse:numberOrNull(proof?.observedImpulse),
   noise:numberOrNull(proof?.noise),alignedBars:numberOrNull(proof?.alignedBars),
   barSeconds:numberOrNull(proof?.barSeconds),
   rangePosition:numberOrNull(proof?.rangePosition),
   quoteAt:numberOrNull(proof?.quoteAt),snapshotAt:numberOrNull(proof?.snapshotAt),
   structuralConflict:proof?.structuralConflict?{
    structure:short(proof.structuralConflict.structure,8),
    projection:short(proof.structuralConflict.projection,8)}:null,
   agreement:numberOrNull(plan.agreement),
   dataQuality:numberOrNull(plan.dataQuality),
   callProbability:numberOrNull(plan.callProbability),
   putProbability:numberOrNull(plan.putProbability),
   evidence
  },
  probability:{
   qualified:research.qualified===true,
   samples:numberOrNull(proof?null:research.samples),
   estimated:numberOrNull(proof?(signal?.side==='CALL'?proof.probabilityCall:proof.probabilityPut):research.probability),
   source:short(proof?proof.probabilitySource:research.probabilitySource,75)
  }
 };
}
export function acceptedAudit(event,now=Date.now()){
 return {type:'broker_accepted',ts:now,provider:short(event?.provider,30),
  localId:short(event?.localId,1100),orderId:short(event?.orderId,180),
  entryPrice:numberOrNull(event?.entryPrice),exitAt:numberOrNull(event?.exitAt)};
}
export function settlementAudit(event,now=Date.now()){
 if(event?.source&&event.source!=='broker')return null;
 if(!event?.orderId||!event?.provider||numberOrNull(event?.netPnl)===null)return null;
 const pnl=Number(event.netPnl);
 return {type:'broker_settlement',ts:now,provider:short(event.provider,30),orderId:short(event.orderId,180),
  netPnl:pnl,result:pnl>0?'win':pnl<0?'loss':'tie',
  entryPrice:numberOrNull(event.entryPrice),exitPrice:numberOrNull(event.exitPrice)};
}
const outcomeKey=e=>String(e.provider)+'|'+String(e.orderId);
const batchFromLocalId=id=>{const s=String(id||'');const p=s.lastIndexOf('|click-');return p<0?null:s.slice(0,p);};
export function summarizeTradeAudit(events,{minSamples=20}={}){
 const decisions=new Map(),accepted=new Map(),settled=new Map();
 for(const e of events){
  if(e?.type==='trade_decision'&&e.batchId&&e.provider)decisions.set(e.provider+'|'+e.batchId,e);
  if(e?.type==='broker_accepted'&&e.orderId&&e.provider&&e.localId)accepted.set(outcomeKey(e),e);
  if(e?.type==='broker_settlement'&&e.orderId&&e.provider&&Number.isFinite(e.netPnl))settled.set(outcomeKey(e),e);
 }
 const rows=[];let orphanSettlements=0;
 for(const [id,result] of settled){
  const broker=accepted.get(id),batchId=batchFromLocalId(broker?.localId);
  const d=decisions.get(result.provider+'|'+batchId);
  if(!d){orphanSettlements++;continue;}
  if(result.result==='tie')continue;
  rows.push({
   provider:result.provider,asset:d.asset,mode:d.directionMode,side:d.side,durationMs:d.durationMs,
   martingaleLevel:d.martingaleLevel,clickCount:d.clickCount,independent:d.independent,
   regime:d.structure?.regime||'unknown',kind:d.structure?.entryKind||'unknown',
   outcome:result.result,netPnl:result.netPnl,at:d.ts
  });
 }
 // Judge analyst accuracy only on first, unmultiplied automatic entries.
 // Manual fixed CALL/PUT and Martingale extra clicks must not skew it.
 const analyst=rows.filter(r=>r.mode==='automatic'&&!r.independent&&r.martingaleLevel===0&&r.clickCount===1);
 const group=(field,subset=rows)=>Object.values(subset.reduce((acc,row)=>{
  const key=String(row[field]??'unknown');
  const a=acc[key]??={key,count:0,wins:0,losses:0,netPnl:0};
  a.count++;a.wins+=row.outcome==='win'?1:0;a.losses+=row.outcome==='loss'?1:0;a.netPnl+=row.netPnl;return acc;
 },{})).map(x=>({...x,winRate:x.count>=minSamples?Math.round(x.wins/x.count*10000)/100:null}))
 .sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
 return {kind:'broker-confirmed-trade-audit',matched:rows.length,
  decisions:decisions.size,accepted:accepted.size,settled:settled.size,
  orphanSettlements,unresolvedAccepted:[...accepted.keys()].filter(id=>!settled.has(id)).length,minSamples,
  analystFirstClickSettlements:analyst.length,excludedFromAnalystAccuracy:rows.length-analyst.length,
  byMode:group('mode'),byRegime:group('regime',analyst),byEntryKind:group('kind',analyst),
  byDuration:group('durationMs',analyst),bySide:group('side',analyst),byAsset:group('asset',analyst),
  note:'Market-condition win rates refer only to single-click automatic entries without martingale. Broker-confirmed outcomes only; unresolved orders excluded, not counted as losses or wins. No claim of predictive improvement.'};
}
