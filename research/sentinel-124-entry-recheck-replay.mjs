// Recorded-price dispatch replay. Analysis sees only the received prefix;
// later prices score outcomes only AFTER the admission decision is complete.
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {currentEntryRejection} from '../sentinel-trading-lab/agent/src/core/current-entry-review.mjs';
import {maxSignalAgeMs} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-continuation-prices.json',import.meta.url)));
const tape=fixture.quoteHistory,cases=[];
const tally=rows=>Object.fromEntries(['win','loss','tie','pending'].map(k=>[k,rows.filter(x=>x.outcome===k).length]));
for(const engine of ['automatic','trend','support_resistance','smart_confluence','fibonacci_retest'])for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 runtime.patchSettings({engine,orderDurationMs:durationMs},'recorded-dispatch-replay');
 const timeline=[],signals=[];let last=0;
 for(let i=0;i<tape.length;i++){
  const q=tape[i];const out=runtime._signalValidationGate({analysis:{},settings:runtime.settings,now:q.ts,snap:{provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:tape.slice(0,i+1),candles:fixture.candles,historicalCandlesVerified:true,payout:null}});
  timeline.push({at:q.ts,review:runtime.currentEntryReview});
  const a=out.analysis.vnext.futureEntryAnchor;
  if(a?.entryReadyNow&&a.entryTriggeredAt!==last){last=a.entryTriggeredAt;signals.push({anchor:a,issued:runtime.currentEntryReview});}
 }
 for(const dispatchMs of [0,300,600]){
  const rows=[];
  for(const {anchor,issued} of signals){
   if(dispatchMs>maxSignalAgeMs(durationMs))continue; // Existing deadline, same for both versions.
   const clickAt=anchor.entryTriggeredAt+dispatchMs;
   let seen=-1;for(let i=0;i<tape.length&&tape[i].ts<=clickAt;i++)seen=i;
   if(seen<0||clickAt-tape[seen].ts>2500)continue;
   const q=tape[seen],context={provider:'iq_option',asset:runtime.settings.asset,engine,durationMs,quote:q.price,quoteAt:q.ts,entryReview:timeline[seen].review};
   const blocked=currentEntryRejection({issued,context,now:clickAt});
   // Admission is now decided. Only the scoring step can read the outcome.
   const exit=tape.find(p=>p.ts>=clickAt+durationMs&&p.ts-clickAt-durationMs<=1500);
   const outcome=!exit?'pending':exit.price===q.price?'tie':(exit.price>q.price)===(anchor.side==='CALL')?'win':'loss';
   rows.push({at:anchor.entryTriggeredAt,side:anchor.side,clickAt,entry:q.price,outcome,blocked});
  }
  const baseline=tally(rows),candidate=tally(rows.filter(x=>!x.blocked));
  cases.push({engine,durationMs,dispatchMs,baseline,candidate,skipped:rows.filter(x=>x.blocked),strictlyWorse:candidate.loss>baseline.loss&&candidate.win<=baseline.win||candidate.win<baseline.win&&candidate.loss>=baseline.loss});
 }
}
console.log(JSON.stringify({source:'tests/fixtures/sentinel-continuation-prices.json',scope:'Same issued signals, received feed before each assumed physical dispatch; existing deadlines apply to both versions.',limits:['One 179-second recording shared by all settings, not independent trials.','Dispatch delays are assumed, not measured live fills.','This cannot establish live win rate or future profitability.'],cases},null,2));
