import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
for(const provider of ['exnova','iq_option']){
 test(provider+': actual OpenAI OTC broker ID is recognized and replaces EUR/USD without carrying old quotes',()=>{
  const d=new LocalPlaywrightDriver({dataDir:'ignored'}),st=d.state(provider);d.requestMarketData=async()=>true;
  Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76,quote:1.11,candles:[{from:1,open:1,high:1,low:1,close:1}],quoteHistory:[{ts:Date.now(),price:1.11}]});st.activeMap.set('EURUSDOTC',76);st.assets.add('EUR/USD OTC');
  d.ingest(provider,{name:'initialization-data',msg:{binary:{actives:{'9999':{id:9999,name:'OpenAI-OTC'}}}}},'direct-in');
  assert.equal(st.activeMap.get('OPENAIOTC'),9999);
  d.ingest(provider,{name:'sendMessage',request_id:'selected-openai',msg:{name:'get-candles',body:{active_id:9999,size:60}}},'page-out');
  assert.equal(st.symbol,'OPENAI OTC');assert.equal(st.uiSymbol,'OPENAI OTC');assert.equal(st.activeId,9999);assert.equal(st.quote,null);assert.equal(st.quoteHistory.length,0);
  d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.12,time:Date.now()/1000}},'page-in');assert.equal(st.quote,null);
  d.ingest(provider,{name:'quote-generated',msg:{active_id:9999,price:50,time:Date.now()/1000}},'page-in');assert.equal(st.quote,50);
 });
 test(provider+': compact OTC labels preserve OTC identity and unknown ID is never turned into zero',()=>{
  const d=new LocalPlaywrightDriver({dataDir:'ignored'}),st=d.state(provider);d.requestMarketData=async()=>true;st.activeMap.set('GBPUSDOTC',77);st.assets.add('GBP/USD OTC');
  for(const label of ['GBPUSD (OTC)','GBPUSDOTC','GBPUSD-OTC']){assert.equal(d.applyActiveSelection(provider,{symbol:label,source:'broker-validated'}),true);assert.equal(st.activeId,77);assert.equal(st.symbol,'GBP/USD OTC')}
  d.applyActiveSelection(provider,{symbol:'OpenAI (OTC)',source:'broker-validated'});assert.equal(st.activeId,null);assert.equal(st.symbol,'OPENAI OTC');
  if(st.switchRequestTimer)clearTimeout(st.switchRequestTimer);
 });
}
test('one-shot market diagnosis returns bounded price evidence without device credentials or account data',async()=>{
 const {marketDiagnostic}=await import('../sentinel-trading-lab/agent/worker/market-diagnostic.mjs');
 const runtime={stateName:'running',settings:{asset:'OPENAI OTC',engine:'automatic'},lastResult:{analysis:{side:'CALL',vnext:{}}},deviceToken:'never-export'};
 const market={symbol:'OPENAI OTC',activeId:9999,balance:123,accountId:'private',deviceSecret:'never-export',quoteHistory:Array.from({length:1000},(_,i)=>({ts:i,price:10,unrelated:'private'})),candles:Array.from({length:40},(_,i)=>({from:i,to:i+1,open:10,high:11,low:9,close:10}))};
 const sample=marketDiagnostic(runtime,market,1000);assert.equal(sample.quotes.length,600);assert.equal(sample.candles.length,12);assert.equal(sample.analysis.side,'CALL');
 const json=JSON.stringify(sample);for(const secret of ['never-export','private','balance','accountId','deviceToken','deviceSecret'])assert.equal(json.includes(secret),false);
});
