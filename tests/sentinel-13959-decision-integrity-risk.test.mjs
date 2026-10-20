import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity,guardContraryCycle} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {setup} from './fixtures/executor-13946.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';

const T=1800000000000;
test('selected TREND specialist uses observed trend; mean reversion is NOT silently replaced by automatic cycle',()=>{
 const quoteHistory=Array.from({length:151},(_,i)=>({
  ts:T-150000+i*1000,receivedAt:T-150000+i*1000,
  price:1.1+i*.00001
 }));
 const args={quoteHistory,price:quoteHistory.at(-1).price,quoteAt:T,now:T,durationMs:30000,qualityPolicy:'adaptive-market-v17'};
 const trend=analyzeNowOpportunity({...args,engineId:'trend'});
 const mean=analyzeNowOpportunity({...args,engineId:'mean_reversion'});
 assert.equal(trend.signalOwner,'selected-specialist');
 assert.equal(trend.contextStrategy,'trend');
 assert.equal(trend.ready,true);
 assert.equal(trend.side,'CALL');
 assert.equal(mean.signalOwner,'selected-specialist');
 assert.equal(mean.contextStrategy,'mean_reversion');
 assert.equal(mean.ready,false);
 assert.equal(mean.side,null);
});
test('opposing unconfirmed fitted cycle returns WAIT instead of guessing contra-structure',()=>{
 const structural={structuralReady:true,structuralSide:'CALL'};
 const projected={ready:true,side:'PUT',reason:'observed-trend-and-30s-cycle-projection'};
 const blocked=guardContraryCycle(structural,projected);
 assert.equal(blocked.ready,false);assert.equal(blocked.side,null);
 assert.equal(blocked.reason,'projection-conflicts-with-confirmed-structure');
 assert.deepEqual(blocked.structuralDisagreement,{structure:'CALL',projection:'PUT'});
 assert.equal(guardContraryCycle(structural,{...projected,side:'CALL'}).ready,true);
 assert.strictEqual(guardContraryCycle({structuralReady:false},projected),projected);
});
test('adaptive cycle calibration never counts six overlapping five-second starts as six independent horizons',()=>{
 const selector=new CompletedExpiryDirection();
 const history=[];
 for(let i=0;i<=6;i++){
  const ts=T+i*5000,price=1.1+i*.00001;
  history.push({ts,receivedAt:ts,price});
  const output=selector.observe({
   context:'exnova|EUR/USD OTC|30000',quoteHistory:history,
   quoteAt:ts,price,now:ts,
   baseline:{ready:true,side:'CALL',fitSelectionCriterion:0},
   projectionTargetAt:ts+30000
  });
  assert.equal(output.side,'CALL');
  assert.equal(selector.pending.length,1,'only one calibration interval may be in flight');
 }
 assert.equal(selector.completed,1);
 assert.equal(selector.lastIssued,T+30000);
});
function settle(x,values){
 const b=x.bot.pending;assert.ok(b);
 assert.equal(b.orders.length,values.length);
 x.advance(60000);
 for(const [i,p] of b.orders.entries())assert.equal(x.bot.settle({
  provider:x.c.provider,orderId:p.orderId,netPnl:values[i],source:'broker'}),true);
}
for(const provider of ['exnova','iq_option']){
 test(provider+': user-controlled loss streak stops only after completed, confirmed losing batches',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({maxConsecutiveLosses:2,martingaleEnabled:true,martingaleLevels:2});
  await x.bot.start();
  await x.fire('CALL');settle(x,[-1]);
  assert.equal(x.bot.consecutiveLossBatches,1);
  assert.equal(x.bot.enabled,true);
  await x.fire('PUT');assert.equal(x.bot.pending.clickCount,2);
  settle(x,[-1,-1]);
  assert.equal(x.bot.consecutiveLossBatches,2);
  assert.equal(x.bot.enabled,false);
  assert.match(x.bot.message,/limite configurado de sequências perdedoras/);
 });
 test(provider+': no streak stop when user sets zero and Martingale maximum is reached',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({maxConsecutiveLosses:0,martingaleEnabled:true,martingaleLevels:0});
  await x.bot.start();
  for(let i=0;i<4;i++){await x.fire('PUT');settle(x,[-1]);}
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.consecutiveLossBatches,4);
 });
}
test('verified-loss cap appears in wire and local PC panel with current streak and unsafe balance warning',()=>{
 const x=setup('exnova');
 x.bot.configure({maxConsecutiveLosses:3,stopLoss:10000});
 x.bot.observeBalance(x.c.brokerBalance);
 const state={...x.bot.status(),provider:'exnova',consecutiveLossBatches:2};
 const remote=unpackExecutor(packExecutor(state));
 assert.equal(remote.config.maxConsecutiveLosses,3);
 assert.equal(remote.consecutiveLossBatches,2);
 const html=executorPanel(state,'pt');
 assert.match(html,/data-sentinel-executor-setting="maxConsecutiveLosses"/);
 assert.match(html,/Atenção: limite de perda/);
 assert.match(html,/Sequências perdedoras confirmadas/);
});
