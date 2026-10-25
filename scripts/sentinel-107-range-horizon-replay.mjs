// Causal quote replay of the base engine + one-shot lifecycle. No broker orders.
// The video fixture is older than the new 67-order journal; do not merge results.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {analyzeNowOpportunity as candidate,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const base='36a7dcca579ff5da33b307c34c9467cfd2d16e44';
const file=new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.range-replay-reference.mjs',import.meta.url);
writeFileSync(file,execFileSync('git',['show',base+':sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs']),{flag:'wx'});
try{
 const {analyzeNowOpportunity:original}=await import(file.href);
 const f=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
 const tape=f.quoteHistory;
 const replay=(analyze,durationMs)=>{
  let state=null;const entries=[],times=[];
  for(let i=0;i<tape.length;i++){
   const point=tape[i],now=point.ts,seen=tape.slice(0,i+1);
   const t=performance.now();
   const verdict=analyze({quoteHistory:seen,price:point.price,quoteAt:now,now,
    durationMs,engineId:'automatic',qualityPolicy:'adaptive-market-v17',candles:[]});
   times.push(performance.now()-t);
   const next=advanceNowOpportunity({previous:state,candidate:verdict,now,quoteAt:now,
    asset:f.asset,provider:'recorded-video',engineId:'automatic',durationMs});
   if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt){
    // Future prices are used ONLY to score an already-fixed past decision.
    const exit=tape.find(q=>q.ts>=next.exitAt&&q.ts-next.exitAt<=1500);
    const delta=exit?exit.price-point.price:null;
    entries.push({at:now,side:next.side,entryPrice:point.price,exitAt:next.exitAt,
     exitPrice:exit?.price??null,reason:verdict.reason,
     outcome:delta===null?'pending':delta===0?'tie':
      ((next.side==='CALL'&&delta>0)||(next.side==='PUT'&&delta<0))?'win':'loss'});
   }
   state=next;
  }
  times.sort((a,b)=>a-b);
  return {entries,timing:{samples:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],p99Ms:times[Math.floor(times.length*.99)]}};
 };
 const summarize=rows=>({signals:rows.length,wins:rows.filter(r=>r.outcome==='win').length,
  losses:rows.filter(r=>r.outcome==='loss').length,ties:rows.filter(r=>r.outcome==='tie').length,
  pending:rows.filter(r=>r.outcome==='pending').length});
 const key=r=>r.at+'|'+r.side;
 const result=[];
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const old=replay(original,durationMs),now=replay(candidate,durationMs);
  const oldKeys=new Set(old.entries.map(key)),newKeys=new Set(now.entries.map(key));
  const kept=old.entries.filter(r=>newKeys.has(key(r)));
  const removed=old.entries.filter(r=>!newKeys.has(key(r)));
  const added=now.entries.filter(r=>!oldKeys.has(key(r)));
  result.push({durationMs,baseline:summarize(old.entries),candidate:summarize(now.entries),
   preserved:summarize(kept),removed:summarize(removed),new:summarize(added),
   cpu:{baseline:old.timing,candidate:now.timing},removedEntries:removed,newEntries:added});
 }
 console.log(JSON.stringify({base,source:f.source,sourceSha256:f.sourceSha256,
  scope:'Older recorded-video quotes, base engine + one-shot; no historic candles, broker fill, Windows or same-data replay of the 67 orders',
  note:'Quote-scored changes are not broker-confirmed improvement or a live win rate.',result},null,2));
}finally{unlinkSync(file);}
