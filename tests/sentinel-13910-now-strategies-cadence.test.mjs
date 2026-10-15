import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
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
test('selected strategies use native live setups without legacy candle or confidence prerequisites',()=>{
 for(const engineId of engines.slice(1)){
  const input={quoteHistory:quotes,price:quotes.at(-1).price,quoteAt:T,now:T,durationMs:30000,engineId};
  const result=analyzeNowOpportunity(input);
  assert.equal(result.engineId,engineId);
  assert.deepEqual(analyzeNowOpportunity({...input,candles:[],minConfidence:100}),result);
  assert.deepEqual(analyzeNowOpportunity({...input,candles,minConfidence:1}),result);
  assert.equal(Object.hasOwn(result,'projectedExitPrice'),false);
  if(['trend','breakout','price_action','smart_confluence'].includes(engineId))assert.equal(result.side,'CALL',engineId);
  if(['mean_reversion','support_resistance','fibonacci_retest'].includes(engineId))assert.equal(result.ready,false,'a trend alone must not invent a '+engineId+' setup');
 }
 const source=readFileSync('sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs','utf8');
 assert.equal(source.includes('analyzeMarket'),false);
});
test('NOW quote validation does not wait on an unrelated candle feed for any strategy',()=>{
 for(const engine of engines){
  const r=make();r.settings.engine=engine;
  r.externalMarket={quoteFeedValidated:true,analysisFeedValidated:false,feedValidated:false,
   quoteHistory:quotes,quote:quotes.at(-1).price,quoteTs:T,candles:[]};
  const snap=r._marketSnapshot();assert.equal(snap.waitingLive,false,engine);
  assert.equal(snap.quoteHistory.length,quotes.length);
 }
});
test('all strategies reject flat or unavailable evidence and ignore future arrivals',()=>{
 for(const engineId of engines){
  const input={quoteHistory:quotes,price:quotes.at(-1).price,quoteAt:T,now:T,durationMs:30000,engineId};
  const result=analyzeNowOpportunity(input);
  assert.deepEqual(analyzeNowOpportunity({...input,quoteHistory:[...quotes,
   {ts:T+1000,price:99},{ts:T-100,receivedAt:T+1000,price:99}]}),result,engineId);
  assert.equal(analyzeNowOpportunity({...input,price:1.1,quoteHistory:quotes.map(q=>({...q,price:1.1}))}).ready,false,engineId);
 }
});
test('specialist setups confirm an observed level turn, mean return, Fibonacci retest and line break',()=>{
 const wave=Array.from({length:150},(_,i)=>({ts:T+i*1000,
  price:1.1+.0006*Math.sin(i*2*Math.PI/43)+i*.0000005}));
 const lines=Array.from({length:70},(_,i)=>({ts:T+i*1000,
  price:1.1+.00015*Math.sin(i*2*Math.PI/15)-i*.000001}));
 for(let i=70;i<80;i++)lines.push({ts:T+i*1000,price:lines[69].price+(i-69)*.0001});
 for(const [engineId,history,index,side] of [
  ['support_resistance',wave,15,'PUT'],['mean_reversion',wave,14,'PUT'],
  ['fibonacci_retest',wave,86,'CALL'],['trendline_breakout',lines,72,'CALL']]){
  const q=history[index],input={quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,engineId};
  assert.equal(analyzeNowOpportunity(input).side,side,engineId);
  const mirrored=history.map(q=>({...q,price:2.2-q.price}));
  assert.equal(analyzeNowOpportunity({...input,quoteHistory:mirrored,price:mirrored[index].price}).side,
   side==='CALL'?'PUT':'CALL',engineId+' inverse setup');
 }
});
test('real runtime keeps analyzing through 30s expiry and reissues on first new quote, without warmup reset',()=>{
 for(const engine of ['automatic','trend','smart_confluence','price_action','breakout']){
 const r=make();r.settings.asset='EUR/USD';r.settings.orderDurationMs=30000;
 r.settings.engine=engine;
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
 }
});
test('Windows installer and updater use the existing canonical product domain',()=>{
 const root='sentinel-trading-lab/';
 const go=readFileSync(root+'agent-launcher.go','utf8');
 assert.ok(go.includes('https://trading.devinx.com.br/console?tab=Broker%20Connection'));
 for(const path of ['public/downloads/install-agent-v88.ps1','agent/worker/install-agent-update.ps1',
  'agent/worker/auto-update.ps1','agent/worker/tray-host.ps1']){
  assert.match(readFileSync(root+path,'utf8'),/\$site\s*=\s*'https:\/\/trading\.devinx\.com\.br'/);
 }
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
