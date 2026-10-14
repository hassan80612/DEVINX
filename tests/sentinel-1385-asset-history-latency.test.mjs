import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {causalForwardPath} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {quoteScopedCausalPath} from '../sentinel-trading-lab/agent/src/core/quote-scoped-causal-path.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const bars=(now,count=60)=>Array.from({length:count},(_,i)=>({from:Math.floor(now/1000)-(count-i)*60,to:Math.floor(now/1000)-(count-i-1)*60,open:1.1,high:1.11,low:1.09,close:1.1}));
function setup(provider){const d=new LocalPlaywrightDriver(),st=d.state(provider),now=Date.now();Object.assign(st,{symbol:'EUR/USD',uiSymbol:'EUR/USD',activeId:1,candleActiveId:1,quote:1.1,lastQuoteAt:now,candles:bars(now)});st.activeMap.set('EURUSD',1);st.activeMap.set('GBPUSD',2);return {d,st,now}}
for(const provider of ['iq_option','exnova']){
 test(provider+': broker history is received even during the live quote sampling slot',()=>{
  const {d,st,now}=setup(provider),events={},ws={on:(k,f)=>events[k]=f},page={on:(k,f)=>{if(k==='websocket')f(ws)}};
  d.attachNetwork(provider,page);st.lastPassiveFrameAt=now;st.candles=[];
  events.framesent({payload:JSON.stringify({name:'sendMessage',request_id:'page-1',msg:{name:'get-candles',body:{active_id:1,size:60}}})});
  events.framereceived({payload:JSON.stringify({name:'candles',request_id:'page-1',msg:{candles:bars(now)}})});
  assert.equal(st.candles.length,60);
 });
 test(provider+': old asset packets do not starve current prices; latest selected quote survives a burst',async()=>{
  const {d,st}=setup(provider),events={};d.attachNetwork(provider,{on:(k,f)=>{if(k==='websocket')f({on:(k,g)=>events[k]=g})}});
  const tick=(id,price)=>events.framereceived({payload:JSON.stringify({name:'quote-generated',msg:{active_id:id,price,time:Date.now()/1000}})});
  st.lastPassiveFrameAt=0;tick(2,9);tick(1,1.101);assert.equal(st.quote,1.101);
  tick(1,1.102);tick(1,1.103);await pause(220);assert.equal(st.quote,1.103);
 });
 test(provider+': switching keeps old subscription identity for unsubscribe and preserves already-received NEW history',async()=>{
  const {d,st,now}=setup(provider);st.subscribedSymbol='EUR/USD';st.subscribedActiveId=1;
  d.applyActiveSelection(provider,{symbol:'GBP/USD',activeId:2,source:'protocol-page'});
  assert.equal(st.subscribedActiveId,1);
  st.candles=bars(now);st.candleActiveId=2;st.quote=1.1;st.lastQuoteAt=now;st.quoteHistory=[{ts:now,price:1.1}];
  d.requestQuoteHistory=async()=>true;d.directFeed=async()=>null;const sent=[];
  d.wsSend=async(_,p)=>{sent.push(p);return {ok:true}};
  await d._requestCandles(provider,{symbol:'GBP/USD',activeId:2,force:true});
  assert.equal(st.candles.length,60);assert.equal(st.quoteHistory.length,1);
  assert.equal(sent[0].name,'unsubscribeMessage');assert.equal(sent[0].msg.params.routingFilters.active_id,1);
  assert.equal(sent[1].name,'subscribeMessage');assert.equal(sent[1].msg.params.routingFilters.active_id,2);
 });
 test(provider+': only actual completed 1s closes backfill the selected asset; latest quote remains live',async()=>{
  const {d,st,now}=setup(provider),received=Date.now(),end=Math.floor(received/1000);
  const history=Array.from({length:200},(_,i)=>({from:end-200+i,to:end-199+i,open:1+i*.00001,close:1+(i+1)*.00001,max:1.01,min:.99}));
  const originalCandles=st.candles.slice();
  d.directFeed=async()=>({ready:true,request:async p=>{d.ingest(provider,{name:'candles',request_id:p.request_id,msg:{active_id:1,candles:[...history,{from:end,to:end+1,open:1,close:2,max:2,min:1}] }},'direct-in');return {name:'candles'};}});
  assert.equal(await d.requestQuoteHistory(provider,{symbol:'EUR/USD',activeId:1}),true);
  assert.equal(st.quote,1.1);assert.equal(st.lastQuoteAt,now);assert.deepEqual(st.candles,originalCandles);
  assert.equal(st.quoteHistory.length,200);assert.ok(st.quoteHistory.every(q=>q.source==='broker-closed-1s'&&q.ts<=received&&q.receivedAt>=q.ts));
  // A fresh genuine tick makes all already received history available NOW.
  st.quoteHistory.push({ts:Date.now()+1,price:history.at(-1).close});
  const fit=causalForwardPath({quoteHistory:st.quoteHistory,asOf:Date.now()+1,holdingSeconds:30,maxSeconds:60});
  assert.equal(fit.status,'causal-forward-path','no 90s fresh-collection wait after switching');
  const count=st.quoteHistory.length;
  st.marketRequests.set('old',{activeId:2,size:1,at:Date.now()});
  d.ingest(provider,{name:'candles',request_id:'old',msg:{active_id:2,candles:history}},'direct-in');
  assert.equal(st.quoteHistory.length,count);
 });
}
test('quote-only automatic analysis does not wait for 50 unused chart candles',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'causal-closed-structure-1379'}),now=Date.now();
 r.setExternalMarket({provider:'iq_option',symbol:'EUR/USD',quote:1.1,quoteTs:now,quoteFeedValidated:true,analysisFeedValidated:false,candles:[],quoteHistory:Array.from({length:200},(_,i)=>({ts:now-(199-i)*1000,price:1+i*.00001}))});
 assert.equal(r._marketSnapshot().waitingLive,false);
 r.externalMarket.quoteFeedValidated=false;assert.equal(r._marketSnapshot().waitingLive,true,'wrong/stale asset is never made valid by removing OHLC dependency');
});
test('auxiliary horizon fits cannot evict the current selected fit before signal confirmation',()=>{
 const now=Date.now(),quoteHistory=Array.from({length:600},(_,i)=>({ts:now-(599-i)*1000,price:1.1+i*.000001}));
 const args={forecastModel:'causal-closed-structure-1379',quoteHistory,asOf:now,holdingSeconds:30,maxSeconds:60};
 const first=quoteScopedCausalPath(args);
 for(const h of [5,10,60,120,300])quoteScopedCausalPath({...args,holdingSeconds:h,maxSeconds:h*2});
 assert.equal(quoteScopedCausalPath(args),first);
});
