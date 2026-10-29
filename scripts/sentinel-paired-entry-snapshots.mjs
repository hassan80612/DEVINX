// Compare the same recorded decision instants. No future price enters the
// decision. Settlements annotate existing trades only, never new trade paths.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime as Candidate} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const [baseline,...files]=process.argv.slice(2);
if(!baseline||!files.length)throw Error('Usage: node scripts/sentinel-paired-entry-snapshots.mjs <baseline-agent-core-dir> <events.json>...');
const {DemoTradingRuntime:Baseline}=await import(pathToFileURL(resolve(baseline,'runtime.mjs')));
function replay(Runtime,d){
 const rt=new Runtime({enableVNext:true,forecastModel:'short-probability-v1',precisionProfile:'horizon-balanced-v148'});
 rt.patchSettings({engine:d.engine,asset:d.asset,orderDurationMs:d.durationMs},'offline-comparison');
 const m=d.marketReplay,quotes=m.quotes.map(([ts,price,receivedAt])=>({ts,price,receivedAt})),
  candles=m.candles.map(([from,to,open,high,low,close,volume])=>({from,to,open,high,low,close,volume}));
 const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:d.signalAt,
  snap:{provider:d.provider,price:d.snapshotQuote,quoteTs:d.snapshotQuoteAt,quoteHistory:quotes,candles,
   historicalCandlesVerified:m.historicalCandlesVerified,payout:null}});
 const v=out.analysis?.vnext,o=v?.nowObservation,a=v?.futureEntryAnchor;
 return {ready:a?.phase==='fired',side:a?.phase==='fired'?a.side:null,reason:o?.reason};
}
for(const file of files){
 const events=JSON.parse(readFileSync(file)),decisions=events.filter(x=>x.type==='trade_decision').sort((a,b)=>a.signalAt-b.signalAt),
  accepts=events.filter(x=>x.type==='broker_accepted'),settled=events.filter(x=>x.type==='broker_settlement');
 const cases=decisions.map((d,i)=>{
  const accept=accepts.find(x=>x.batchId===d.batchId||String(x.localId||'').startsWith(d.batchId+'|')),
   result=settled.find(x=>x.orderId===accept?.orderId)?.result||'pending';
  return {n:i+1,recordedSide:d.side,result,before:replay(Baseline,d),after:replay(Candidate,d)};
 });
 const changes=cases.filter(x=>x.before.ready!==x.after.ready||x.before.side!==x.after.side);
 console.log(JSON.stringify({file,decisions:cases.length,baselineMatches:cases.filter(x=>x.before.ready&&x.before.side===x.recordedSide).length,
  keptWins:cases.filter(x=>x.result==='win'&&x.before.ready&&x.after.ready&&x.after.side===x.before.side).length,
  withheldWins:changes.filter(x=>x.result==='win'&&x.before.ready&&!x.after.ready).length,
  withheldLosses:changes.filter(x=>x.result==='loss'&&x.before.ready&&!x.after.ready).length,changes},null,2));
}
