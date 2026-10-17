import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {receivedHistoryInput} from '../tests/fixtures/sentinel-received-history-input.mjs';
import {LocalPlaywrightDriver as Driver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {runtimeMarketFromLive as convert} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {DemoTradingRuntime as Runtime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const base=process.argv[2];if(!base)throw Error('Pass the production Agent directory');
const {LocalPlaywrightDriver:OldDriver}=await import(pathToFileURL(base+'/worker/local-playwright-driver.mjs'));
const {runtimeMarketFromLive:oldConvert}=await import(pathToFileURL(base+'/worker/runtime-market.mjs'));
const {DemoTradingRuntime:OldRuntime}=await import(pathToFileURL(base+'/src/core/runtime.mjs'));
const rows=[];
for(const provider of ['iq_option','exnova'])for(const count of [3,10,20,49,50,100])for(const mirror of [false,true]){
 const now=Math.floor(Date.now()/1000)*1000,outputs=[];
 for(const [name,DriverClass,convertMarket,RuntimeClass] of [['production33',OldDriver,oldConvert,OldRuntime],['candidate',Driver,convert,Runtime]]){
  const {live}=receivedHistoryInput(DriverClass,provider,count,mirror,now);
  const runtime=new RuntimeClass({enableVNext:true,forecastModel:'now-structural-v1'});
  runtime.stateName='running';runtime.settings.asset='EUR/USD';runtime.settings.engine='automatic';
  runtime.setExternalMarket(convertMarket(provider,live,'EUR/USD'));
  const snap=runtime._marketSnapshot();await runtime.tick(now,{skipStatus:true});
  const entry=runtime.lastResult.analysis?.vnext?.futureEntryAnchor;
  assert.equal(runtime.lastResult.order,undefined);
  outputs.push({name,received:live.candles.length,legacyReadiness:live.analysisFeedValidated,
   quoteVerified:live.quoteFeedValidated,historyVerified:snap.historicalCandlesVerified,
   consumed:runtime.structureCache.value?.candles??0,side:entry?.side??null,
   entryAt:entry?.entryAt??null,exitAt:entry?.exitAt??null});
 }
 const [before,after]=outputs;
 assert.equal(after.consumed,count);assert.equal(after.side,mirror?'PUT':'CALL');
 assert.equal(after.entryAt,now);assert.equal(after.exitAt,now+30000);
 if(count<50){assert.equal(before.consumed,0);assert.equal(before.side,null);}
 else{assert.equal(before.consumed,count);assert.equal(before.side,after.side);}
 rows.push({provider,count,mirror,outputs});
}
const report={purpose:'Controlled broker-message ingestion regression, NOT market accuracy or trade outcomes.',
 baselineVersion:'13.9.33',cases:rows.length,
 previouslyDiscardedContext:rows.filter(r=>r.count<50).length,
 previouslyUsableContextPreserved:rows.filter(r=>r.count>=50).length,ordersSent:0,rows};
writeFileSync(new URL('../reports/sentinel-received-history-compare-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,rows:undefined},null,2));
