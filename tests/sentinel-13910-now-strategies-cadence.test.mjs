import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {analyzeMarket} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=1800000000000;
const engines=['automatic','price_action','support_resistance','trend','mean_reversion','breakout','trendline_breakout','fibonacci_retest','smart_confluence'];
const quotes=Array.from({length:150},(_,i)=>({ts:T-(149-i)*1000,price:1.1+i*.000005+Math.sin(i*.31)*.0000002}));
const candles=Array.from({length:100},(_,i)=>{const open=1.08+i*.0001;return {from:T/1000-(100-i)*60,to:T/1000-(99-i)*60,open,close:open+.00008,high:open+.00012,low:open-.00002};});
const snap=q=>({provider:'exnova',quoteHistory:q,price:q.at(-1).price,quoteTs:q.at(-1).ts,candles});
const make=()=>new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
test('every selected strategy survives settings updates and Agent restart',()=>{
 for(const engine of engines){
  const r=make();r.patchSettings({engine});assert.equal(r.settings.engine,engine);
  const restored=make().restore(r.snapshotPersistent());assert.equal(restored.settings.engine,engine);
  assert.equal(restored.settings.forecastMode,'continuous');
 }
});
test('selected specialist uses its own existing current-side calculation',()=>{
 for(const engineId of engines.slice(1)){
  const expected=analyzeMarket({candles,quoteHistory:quotes,strategy:engineId,minConfidence:74,durationMs:30000,quoteTs:T,now:T,freshnessMs:2500});
  const result=analyzeNowOpportunity({candles,quoteHistory:quotes,price:quotes.at(-1).price,quoteAt:T,now:T,durationMs:30000,engineId});
  assert.equal(result.engineId,engineId);
  assert.equal(result.side,expected.side==='BUY'?'CALL':expected.side==='SELL'?'PUT':null);
  assert.equal(result.strength,expected.confidence);
  assert.equal(Object.hasOwn(result,'projectedExitPrice'),false);
 }
});
test('real runtime keeps analyzing through 30s expiry and reissues on first new quote, without warmup reset',()=>{
 const r=make();r.settings.asset='EUR/USD';r.settings.orderDurationMs=30000;
 const gate=(q,now)=>r._signalValidationGate({analysis:{asset:'EUR/USD'},snap:snap(q),settings:r.settings,now}).analysis;
 const a=gate(quotes,T+100);assert.equal(a.vnext.futureEntryAnchor.entryTriggeredAt,T+100);
 const observed=[...quotes];
 for(let i=1;i<=29;i++){
  observed.push({ts:T+i*1000,price:quotes.at(-1).price+i*.000005});
  const a=gate(observed,T+i*1000+100);
  assert.equal(a.vnext.futureEntryAnchor.entryTriggeredAt,T+100);
  assert.equal(a.vnext.nowObservation.evaluatedAt,T+i*1000+100);
 }
 observed.push({ts:T+30000,price:quotes.at(-1).price+30*.000005});
 assert.equal(gate(observed,T+30100).vnext.futureEntryAnchor,null,'pre-expiry quote cannot authorize another call');
 observed.push({ts:T+30200,price:quotes.at(-1).price+31*.000005});
 const next=gate(observed,T+30300);
 assert.equal(next.vnext.futureEntryAnchor.entryTriggeredAt,T+30300);
 assert.equal(next.vnext.futureEntryAnchor.exitAt,T+60300);
 assert.equal(r.vnextWindowOutcomes.length,2);
});
test('unchanged broker prices still carry the exact latest live timestamp into analysis',()=>{
 for(const provider of ['exnova','iq_option']){
  const d=new LocalPlaywrightDriver({dataDir:'ignored'}),st=d.state(provider);
  Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76,quoteHistory:[]});
  const original=Date.now;Date.now=()=>T+150;
  try{for(const offset of [0,50,100,150])d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1,time:(T+offset)/1000}},'page-in');}finally{Date.now=original;}
  assert.equal(st.quoteHistory.at(-1).ts,st.lastQuoteAt);
  const result=analyzeNowOpportunity({quoteHistory:st.quoteHistory,price:st.quote,quoteAt:st.lastQuoteAt,now:T+150,durationMs:30000});
  assert.notEqual(result.reason,'live-quote-unverified');
 }
});
test('both PC and site display the real strategy selector and live evaluation',()=>{
 const site=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const pc=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.equal(site.includes('<strong>ANÁLISE AGORA</strong>'),false);
 assert.equal(pc.includes("ANÁLISE AGORA · ESTRUTURA"),false);
 assert.ok(site.includes('now-live-reading'));assert.ok(pc.includes('data-sentinel-now-live-reading'));
});
