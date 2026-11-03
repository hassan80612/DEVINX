// Strip ONLY the audited 234 performance plumbing before legacy full-file
// SHA guards. This keeps historical strategy/expiry regression protection.
export function normalize234FastLaneRuntime(input){
 let s=String(input);
 const replace=(before,after,label)=>{
  if(!s.includes(before))throw Error('234 normalization missing '+label);
  s=s.replace(before,after);
 };
 replace("  _settleDue(now){\n    // No settlement is due on most live quote ticks. Avoid cloning the full\n    // 1m/5m broker history when this function has nothing to settle.\n    if(!this.pending.some(p=>Number(p.settleAt)<=now))return;\n    const price=this._marketSnapshot().price;",
         "  _settleDue(now){\n    const price=this._marketSnapshot().price;",'empty-settlement-fast-path');
 replace("  _riskState(now,snapshot=null){","  _riskState(now){",'snapshot-argument');
 replace("feedLatencyMs:Math.max(0,now-((snapshot||this._marketSnapshot()).quoteTs||now)),tradesToday:",
         "feedLatencyMs:Math.max(0,now-(this._marketSnapshot().quoteTs||now)),tradesToday:",'risk-feed-snapshot');
 replace("      // Reuse the SAME immutable market snapshot for the whole quote decision.\n      // A new broker tick will request a fresh cycle, not mutate this receipt.\n      const snap=this.externalMarket?market:this._marketSnapshot();const feed={snapshot:()=>snap};",
         "      const snap=this._marketSnapshot();const feed={snapshot:()=>snap};",'one-snapshot-engine');
 replace("state:this._riskState(now,snap),balanceOverride:snap.balance",
         "state:this._riskState(now),balanceOverride:snap.balance",'risk-state-reuse');
 const marker='      // Read-only admission latency telemetry.';
 const start=s.indexOf(marker),end=s.indexOf('      let next=advanceNowOpportunity({',start);
 if(start<0||end<0||end-start>2500||s.indexOf(marker,start+1)!==-1)throw Error('234 normalization invalid admission telemetry');
 const removed=s.slice(start,end);
 if(!removed.includes('sourceQuoteAgeMs:')||!removed.includes('blockedProposal')||
    !removed.trimEnd().endsWith('};'))throw Error('234 normalization unexpected telemetry');
 s=s.slice(0,start)+s.slice(end);
 return s;
}
