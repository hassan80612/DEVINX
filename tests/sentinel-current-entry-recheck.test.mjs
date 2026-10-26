import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentEntryReview,captureEntryReview,currentEntryRejection} from '../sentinel-trading-lab/agent/src/core/current-entry-review.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {setup} from './fixtures/executor-13946.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const context=(provider='exnova')=>({provider,asset:'EUR/USD OTC',engine:'automatic',durationMs:60000,quote:1.1,quoteAt:T});
function review(c,side='CALL',now=T,extra={}){
 return currentEntryReview({candidate:{ready:true,side,...extra},...c,price:c.quote,now});
}
test('same-tick entry is immediately valid; neutral or unfinished observations never require another quote',()=>{
 const c=context(),issued=review(c);assert.equal(currentEntryRejection({issued,context:c,now:T}),null);
 for(const candidate of [{ready:false,side:null},{ready:false,side:'PUT'},{ready:true,side:'CALL'}]){
  c.entryReview=review({...c,quoteAt:T+100},candidate.side,T+100,candidate);
  assert.equal(currentEntryRejection({issued,context:c,now:T+100}),null);
 }
 const signal={at:T,side:'CALL'};
 assert.deepEqual(captureEntryReview({signal,review:issued,context:c}),issued);
 assert.equal(captureEntryReview({signal:{...signal,at:T+1},review:issued,context:c}),null,'a previous frame is not the issuing decision');
});
test('only a newer confirmed opposite decision in the SAME provider/asset/strategy/duration can revoke an unclicked signal',()=>{
 const c=context(),issued=review(c);
 c.entryReview=review({...c,quoteAt:T+100},'PUT',T+100);
 assert.equal(currentEntryRejection({issued,context:c,now:T+100}),'confirmed-opposite-before-entry');
 for(const patch of [{provider:'iq_option'},{asset:'GBP/USD OTC'},{engine:'trend'},{durationMs:30000},{evaluatedAt:T},{evaluatedAt:T+200},{quoteAt:T-1},{quoteAt:T+200},{ready:false}]){
  const current={...c,entryReview:{...c.entryReview,...patch}};
  assert.equal(currentEntryRejection({issued,context:current,now:T+100}),null,JSON.stringify(patch));
 }
 assert.equal(currentEntryRejection({issued,context:c,now:T+3000}),null,'stale evidence never revokes a current signal');
});
test('CALL and PUT reversals are revoked at their existing structural invalidation, not from one contrary tick or an invented distance',()=>{
 for(const side of ['CALL','PUT'])for(const kind of ['confirmed-fast-level-reversal','confirmed-level-structure-reversal']){
  const c=context(),sign=side==='CALL'?1:-1,boundary=c.quote-sign*.0002;
  const issued=review(c,side,T,{priceStructure:{confirmedReversal:{kind,side,invalidation:boundary,turnPrice:boundary}}});
  assert.equal(issued.invalidation,boundary);
  assert.equal(currentEntryRejection({issued,context:{...c,quote:c.quote-sign*.00001,quoteAt:T+100},now:T+100}),null);
  assert.equal(currentEntryRejection({issued,context:{...c,quote:boundary,quoteAt:T+100},now:T+100}),'reversal-invalidated-before-entry');
  const opposite=side==='CALL'?'PUT':'CALL';
  assert.equal(review(c,side,T,{priceStructure:{confirmedReversal:{kind,side:opposite,invalidation:boundary,turnPrice:boundary}}}).invalidation,null);
 }
 const c=context();assert.equal(review(c).invalidation,null,'continuation has no invented price boundary');
});
for(const provider of ['iq_option','exnova'])for(const reason of ['opposite','invalidation'])test(`${provider}: ${reason} received during native control resolution cancels BEFORE the actual click, without LOSS, replay or Martingale reset`,async()=>{
 const x=setup(provider);x.c.brokerBalance=null;x.c.durationMs=60000;x.c.quote=1.1;x.c.quoteAt=T;
 x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();x.bot.martingaleLevel=1;
 x.c.entryReview=review(x.c,'CALL',T,{priceStructure:{confirmedReversal:{kind:'confirmed-fast-level-reversal',side:'CALL',invalidation:1.0998}}});
 let release,controlsStarted,clicks=0;const entered=new Promise(r=>controlsStarted=r),held=new Promise(r=>release=r);
 const ui=new BrokerUiExecutor({state:()=>({symbol:x.c.asset,activeId:x.c.activeId})});
 ui.controls=async()=>{controlsStarted();await held;return{frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async()=>{clicks++}})},callSelector:'#call',putSelector:'#put'};};
 x.driver.execute=(p,o)=>ui.execute(p,o);
 const flight=x.fire('CALL');await entered;x.advance(100);x.c.quoteAt=x.now();
 if(reason==='opposite')x.c.entryReview=review(x.c,'PUT',x.now());else x.c.quote=1.0997;
 release();await flight;
 assert.equal(clicks,0);assert.equal(x.bot.pending,null);assert.equal(x.bot.enabled,true);
 assert.equal(x.bot.martingaleLevel,1);assert.equal(x.bot.net,0);assert.equal(x.bot.sessionWins,0);assert.equal(x.bot.sessionLosses,0);
 assert.match(x.bot.message,/confirmação mudou/);
 const oldExecuted=x.bot.executed;x.bot.pulse();await x.bot.inflight;assert.equal(clicks,0);assert.equal(x.bot.executed,oldExecuted,'the revoked signal is never replayed');
 // An actually NEW signal is immediately eligible with no new cooldown.
 x.driver.execute=async(p,o)=>{assert.ok(o.isValid());o.captureEntry();o.clicked=true;clicks++;return{accepted:true,orderId:'new-'+clicks};};
 x.advance(100);x.c.quote=1.1;x.c.quoteAt=x.now();x.c.entryReview=review(x.c,'CALL',x.now());
 await x.fire('CALL');assert.equal(clicks,2);assert.equal(x.bot.pending.orders.length,2);assert.equal(x.bot.martingaleLevel,1);
});
test('once the first physical click is attempted, sibling clicks keep the established batch and Martingale rules',async()=>{
 const x=setup();x.c.brokerBalance=null;x.c.quote=1.1;x.c.quoteAt=T;
 x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();x.bot.martingaleLevel=1;
 x.c.entryReview=review(x.c);let clicks=0;
 x.driver.execute=async(p,o)=>{
  assert.ok(o.isValid());o.captureEntry();o.clickAttempted=true;o.clicked=true;clicks++;
  x.advance(50);x.c.quoteAt=x.now();x.c.entryReview=review(x.c,'PUT',x.now());
  return{accepted:true,orderId:'sibling-'+clicks};
 };
 await x.fire('CALL');assert.equal(clicks,2);assert.equal(x.bot.pending.orders.length,2);
});
for(const mode of ['call','put'])test(`${mode}-only cadence remains independent of analyst direction and structural invalidation`,async()=>{
 const x=setup();x.c.brokerBalance=null;x.c.quote=1.1;x.c.quoteAt=T;
 x.bot.configure({directionMode:mode});await x.bot.start();x.c.entryReview=review(x.c,mode==='call'?'PUT':'CALL');
 await x.fire();assert.equal(x.calls.length,1);assert.equal(x.calls[0].side,mode.toUpperCase());
});
test('review is private synchronous arithmetic with no timers, I/O or extra model/browser invocation',()=>{
 const module=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/current-entry-review.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(module,/\bawait\b|\bfetch\s*\(|setTimeout\s*\(|setInterval\s*\(|\.evaluate\s*\(|analyzeNowOpportunity\s*\(/);
});
test('runtime publishes the SAME issuing decision before its immediate callback, even while the dashboard still contains the preceding tick',async()=>{
 const x=setup('exnova');x.c.brokerBalance=null;x.c.durationMs=60000;await x.bot.start();
 const vertices=[103,101,102,100,101,100.5,101.5],rows=[];
 for(let k=0;k<vertices.length-1;k++)for(let i=0;i<5;i++)rows.push({ts:T+rows.length*1000,price:vertices[k]+(vertices[k+1]-vertices[k])*i/5});
 rows.push({ts:T+rows.length*1000,price:101.5});const last=rows.at(-1);x.advance(last.ts-T);x.c.quote=last.price;x.c.quoteAt=last.ts;
 const z={low:100,high:100,level:100,confirmedPivots:1,independentTests:3,independentRejections:0,
  supportPivots:1,resistancePivots:0,supportRejections:0,resistanceRejections:0,tests:[{age:1}],windows:[3,10,20,50]};
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({engine:'automatic',asset:x.c.asset,orderDurationMs:60000},'same-tick-review');
 rt.structureCache={get:()=>({candles:50,asOf:T-1000,tolerance:.1,atr:1,averages:[],zones:[z],candleLevelMap:{observedCandles:50,asOf:T-1000,tolerance:.1,levels:[z],windows:[]}})};
 let callbacks=0;rt.lastResult={analysis:{vnext:{nowObservation:{ready:true,side:'PUT'}}}};
 x.bot.context=()=>({...x.c,analysis:rt.lastResult.analysis,entryReview:rt.currentEntryReview});
 rt.onNowOpportunity=anchor=>{
  callbacks++;assert.equal(rt.currentEntryReview.side,anchor.side);assert.equal(rt.currentEntryReview.evaluatedAt,anchor.entryTriggeredAt);
  assert.equal(rt.lastResult.analysis.vnext.nowObservation.side,'PUT','dashboard is intentionally still old');
  x.bot.pulse(anchor);
 };
 const originalNow=Date.now;Date.now=()=>last.ts;
 try{rt._signalValidationGate({analysis:{},settings:rt.settings,now:last.ts,snap:{provider:'exnova',price:last.price,quoteTs:last.ts,quoteHistory:rows,candles:[],historicalCandlesVerified:true}});}
 finally{Date.now=originalNow;}
 await x.bot.inflight;assert.equal(callbacks,1);assert.equal(x.calls.length,1);assert.ok(x.bot.pending.entryGuard);assert.equal(x.bot.pending.entryGuard.invalidation,100.5);
});
