import test from 'node:test';
import assert from 'node:assert/strict';
import {fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {executorSignal,SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

const T=1800000000000,PRICE=1.12345;
const value=(reason,side='CALL',extra={})=>({ready:true,reason,side,observedAt:T,entryPrice:PRICE,...extra});
const apply=(candidate,durationMs=300000,now=T)=>
 fiveMinuteReversalOnly({candidate,durationMs,quoteAt:T,now,price:PRICE});

test('five-minute entries never chase continuation, breakout, EMA or a trend correction',()=>{
 for(const reason of ['closed-structure-and-live-impulse','historical-level-breakout',
  'break-retest-continuation','historical-trend-and-live-forecast',
  'observed-multi-interval-trend-correction','causal-expiry-analogue',
  'rejection-followthrough-clear-room']){
  for(const side of ['CALL','PUT']){
   const out=apply(value(reason,side));
   assert.equal(out.ready,false,reason+' '+side);
   assert.equal(out.side,null);
   assert.equal(out.reason,'five-minute-reversal-only-awaiting-proof');
  }
 }
});

test('only current independently proven reversals are admitted on five minutes',()=>{
 for(const side of ['CALL','PUT']){
  for(const kind of ['confirmed-level-structure-reversal']){
   const good=value(kind,side,{priceStructure:{confirmedReversal:{kind,side,confirmedAt:T}}});
   const accepted=apply(good);
   assert.equal(accepted.ready,true,kind);
   assert.equal(accepted.fiveMinuteReversalConfirmed,true);
   assert.equal(apply({...good,priceStructure:{confirmedReversal:{kind,side,confirmedAt:T-5000}}}).ready,false);
   assert.equal(apply({...good,priceStructure:{confirmedReversal:{kind,side:side==='CALL'?'PUT':'CALL',confirmedAt:T}}}).ready,false);
  }
  const breakEvidence=value('failed-breakout-structure-change',side,{
   priceStructure:{observedSequence:{structureChange:{
    kind:'failed-breakout-structure-change',side,confirmedAt:T}}}});
  assert.equal(apply(breakEvidence).ready,true);
  assert.equal(apply(value('closed-range-extreme-reversal-confirmed',side,{
   regime:'observed-range-turn',observedSwingSeconds:240})).ready,true);
  assert.equal(apply(value('closed-range-extreme-reversal-confirmed',side,{
   regime:'observed-range-turn',observedSwingSeconds:30})).ready,false);
  assert.equal(apply(value('confirmed-fast-level-reversal',side,{priceStructure:{
   confirmedReversal:{kind:'confirmed-fast-level-reversal',side,confirmedAt:T}}})).ready,false);
  assert.equal(apply(value('closed-range-extreme-reversal-confirmed',side)).ready,false);
  const reaction=value('historical-level-rejection',side,{
   priceStructure:{reaction:{kind:'rejection',side},
    reactionProof:{confirmed:true,kind:'sustained-level-reversal',durationMs:300000}}});
  assert.equal(apply(reaction).ready,true);
  assert.equal(apply({...reaction,priceStructure:{...reaction.priceStructure,
    reactionProof:{confirmed:false,kind:'provisional-reaction',durationMs:300000}}}).ready,false);
 }
});

test('the five-minute rule does not alter 30s or 1m entries',()=>{
 for(const ms of [30000,60000]){
  const original=value('closed-structure-and-live-impulse','PUT');
  assert.equal(apply(original,ms),original);
 }
 const original=value('closed-structure-and-live-impulse','PUT');
 assert.equal(apply(original,300000,T+2600).ready,false,'delayed proof is not current');
});

test('executor forwards reversal provenance only from the confirmed runtime anchor',()=>{
 const base={context:'exnova|EURUSDOTC|automatic|300000',engineId:'automatic',
  phase:'fired',side:'CALL',entryTriggeredAt:T,exitAt:T+300000,
  entryPrice:PRICE,holdingSeconds:300};
 assert.equal(executorSignal({vnext:{futureEntryAnchor:base}}).fiveMinuteReversalConfirmed,false);
 assert.equal(executorSignal({vnext:{futureEntryAnchor:{
  ...base,fiveMinuteReversalConfirmed:true}}}).fiveMinuteReversalConfirmed,true);
});

test('forced 5m CALL or PUT does not issue timed trades without matching reversal evidence',async()=>{
 for(const [mode,side] of [['call','CALL'],['put','PUT']]){
  let clock=T,executed=0;
  const context={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',
   activeId:7,engine:'automatic',durationMs:300000,quote:PRICE,quoteAt:T,
   analysis:{vnext:{futureEntryAnchor:null}},
   brokerBalance:{provider:'exnova',accountId:'demo',amount:100,receivedAt:T,revision:1}};
  const driver={prepare:async()=>({ready:true}),execute:async()=>{executed++;return{accepted:true,orderId:'x'};}};
  const bot=new SignalExecutor({clock:()=>clock,context:()=>context,driver});
  bot.configure({directionMode:mode,amount:1,stopLoss:0,stopWin:0,martingaleEnabled:false});
  await bot.start();
  bot.pulse();await bot.inflight;
  assert.equal(executed,0);
  context.analysis.vnext.futureEntryAnchor={context:'exnova|EUR/USD OTC|automatic|300000',
   engineId:'automatic',phase:'fired',side:side==='CALL'?'PUT':'CALL',
   entryTriggeredAt:T,exitAt:T+300000,entryPrice:PRICE,holdingSeconds:300,
   fiveMinuteReversalConfirmed:true};
  bot.pulse();await bot.inflight;
  assert.equal(executed,0,'opposite reversal cannot trigger forced '+mode);
 }
});
