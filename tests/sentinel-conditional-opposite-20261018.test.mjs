import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalOppositeSignal as invert,observedDirectionContext} from '../experiments/conditional-opposite-signal-20261018.mjs';
import {conditionalOppositeRuntime} from '../experiments/conditional-opposite-runtime-20261018.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime as BaseRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const T=1792364400000;
function input(kind='trend',sign=1){
 const points=[];
 for(let i=-50;i<=0;i++){
  let value=i*.01;
  if(kind==='mixed')value=Math.sin(i*Math.PI/10)*.2;
  if(kind==='pullback')value=i<=-6?i*.01:-.06-(i+6)*.005;
  points.push({ts:T+i*1000,receivedAt:T+i*1000,price:100+sign*value});
 }
 return {quoteHistory:points,quoteAt:T,price:points.at(-1).price,now:T,durationMs:30000};
}
const c=side=>({ready:true,side,observedAt:T,entryPrice:100,reason:'original',expirySeconds:30});
test('mixed closed candles invert CALL and PUT exactly once, keeping admission and entry',()=>{
 for(const side of ['CALL','PUT']){
  const before=c(side),result=invert({...input('mixed'),candidate:before});
  assert.equal(result.side,side==='CALL'?'PUT':'CALL');assert.equal(result.ready,true);
  assert.equal(result.entryPrice,before.entryPrice);assert.equal(result.observedAt,before.observedAt);
  assert.equal(result.conditionalInverse.condition,'mixed-candles');
  assert.strictEqual(invert({...input('mixed'),candidate:result}),result);
 }
});
test('contrary recent movement identifies a pullback symmetrically',()=>{
 for(const sign of [-1,1]){
  const args=input('pullback',sign);assert.equal(observedDirectionContext(args).kind,'pullback');
  assert.equal(invert({...args,candidate:c('CALL')}).side,'PUT');
 }
});
test('continuous one-direction movement stays byte-for-byte unchanged',()=>{
 for(const sign of [-1,1])for(const side of ['CALL','PUT']){
  const candidate=c(side),args=input('trend',sign);assert.equal(observedDirectionContext(args).kind,'one-direction');
  assert.strictEqual(invert({...args,candidate}),candidate);
 }
});
test('WAIT, missing history, stale quotes and other durations never manufacture an opposite entry',()=>{
 const args=input('mixed');
 for(const changes of [{durationMs:15000},{durationMs:60000},{quoteHistory:[]},{now:T+3000}]){
  const candidate=c('PUT');assert.strictEqual(invert({...args,...changes,candidate}),candidate);
 }
 const waiting={ready:false,side:null,reason:'WAIT'};assert.strictEqual(invert({...args,candidate:waiting}),waiting);
});
test('future and late-received quotes cannot select the inversion',()=>{
 const args=input('mixed'),original=invert({...args,candidate:c('CALL')});
 const poison=[...args.quoteHistory,{ts:T+1,receivedAt:T+1,price:1},{ts:T-1,receivedAt:T+1,price:999}];
 assert.deepEqual(invert({...args,quoteHistory:poison,candidate:c('CALL')}),original);
});
test('the one-shot lifecycle holds the inverted side until expiry despite changing conditions',()=>{
 const initial=advanceNowOpportunity({candidate:invert({...input('mixed'),candidate:c('CALL')}),now:T,
  quoteAt:T,asset:'TEST',provider:'exnova',engineId:'automatic',durationMs:30000});
 assert.equal(initial.side,'PUT');assert.equal(initial.exitAt,T+30000);
 for(const gap of [1,6000,15000,29999]){
  const held=advanceNowOpportunity({previous:initial,candidate:c('CALL'),now:T+gap,quoteAt:T+gap,
   asset:'TEST',provider:'exnova',engineId:'automatic',durationMs:30000});
  assert.equal(held.side,'PUT');assert.equal(held.exitAt,initial.exitAt);assert.equal(held.entryReadyNow,false);
 }
});
test('the PC/phone shared anchor contains the actual inverted side',()=>{
 const candidate=invert({...input('mixed'),candidate:c('CALL')});
 const anchor=advanceNowOpportunity({candidate,now:T,quoteAt:T,asset:'TEST',provider:'iq_option',engineId:'automatic',durationMs:30000});
 const frame=analystSnapshot({state:'running',settings:{engine:'automatic',asset:'TEST',orderDurationMs:30000},
  lastResult:{asset:'TEST',analysis:{vnext:{mode:'now',futureEntryAnchor:anchor,nowObservation:{...candidate,price:100,evaluatedAt:T}}}}},
 {symbol:'TEST',validatedSymbol:'TEST',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:T,quote:100});
 assert.equal(frame.lastResult.analysis.vnext.ea[1],'PUT');
});
test('the research runtime loads the inversion after final routes without modifying release sources',async()=>{
 const research=await conditionalOppositeRuntime();
 try{assert.equal(typeof research.DemoTradingRuntime,'function');assert.equal(typeof research.analyzeNowOpportunity,'function');}
 finally{research.cleanup();}
});
test('IQ and Exnova runtime, phone anchor and unchanged mock executor all receive the same opposite side',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
 const prior=JSON.parse(readFileSync(new URL('../reports/sentinel-actual-entry-reference-video-20261018.json',import.meta.url)));
 const entry=prior.entries[0][0],qs=fixture.quoteHistory.filter(q=>q.ts<=entry.at),last=qs.at(-1);
 assert.equal(observedDirectionContext({quoteHistory:qs,quoteAt:last.ts,price:last.price,now:last.ts}).invert,true);
 const research=await conditionalOppositeRuntime();
 try{
  for(const provider of ['iq_option','exnova']){
   const pair=[BaseRuntime,research.DemoTradingRuntime].map(R=>new R({enableVNext:true,forecastModel:'now-structural-v1'}));
   const results=pair.map(r=>r._signalValidationGate({analysis:{asset:fixture.asset},
    snap:{provider,quoteHistory:qs,price:last.price,quoteTs:last.ts,candles:[]},
    settings:{...r.settings,asset:fixture.asset,engine:'automatic',orderDurationMs:30000},now:last.ts}).analysis);
   const normal=results[0].vnext.futureEntryAnchor,opposite=results[1].vnext.futureEntryAnchor;
   assert.ok(normal?.entryReadyNow);assert.ok(opposite?.entryReadyNow);
   assert.equal(opposite.side,normal.side==='CALL'?'PUT':'CALL');assert.equal(opposite.exitAt,normal.exitAt);
   const settings={asset:fixture.asset,engine:'automatic',orderDurationMs:30000};
   const frame=analystSnapshot({state:'running',settings,lastResult:{asset:fixture.asset,analysis:results[1]}},
    {symbol:fixture.asset,validatedSymbol:fixture.asset,lastQuoteAt:last.ts,quote:last.price});
   assert.equal(frame.lastResult.analysis.vnext.ea[1],opposite.side);
   const calls=[],context={provider,asset:fixture.asset,activeId:1,state:'running',licensed:true,
    durationMs:30000,engine:'automatic',analysis:{}};
   const bot=new SignalExecutor({context:()=>context,clock:()=>last.ts,
    driver:{prepare:async()=>{},execute:async(_provider,order)=>{
     assert.ok(order.isValid());order.captureEntry();order.clicked=true;calls.push(order.side);return{clicked:true,clickId:'mock-only'};
    }}});
   bot.configure({initialBalance:10,amount:1,payoutPercent:86});await bot.start();context.analysis=results[1];bot.pulse();await bot.inflight;
   assert.deepEqual(calls,[opposite.side]);assert.equal(bot.pending.side,opposite.side);bot.stop();
  }
 }finally{research.cleanup();}
});
