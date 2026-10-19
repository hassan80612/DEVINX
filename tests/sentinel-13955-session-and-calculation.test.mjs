import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {currentStrategyEvidence} from '../sentinel-trading-lab/agent/src/core/now-strategy-evidence.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const settle=async(x,values)=>{
 const batch=x.bot.pending;assert.ok(batch);
 x.advance(31000);
 for(let i=0;i<values.length;i++)
  assert.equal(x.bot.settle({provider:x.c.provider,orderId:batch.orders[i].orderId,netPnl:values[i],source:'broker'}),true);
};

for(const provider of ['iq_option','exnova']){
 test(provider+': explicit Stop zeros current bot session, Start restarts from one click while old broker orders are quarantined',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:4});
  await x.bot.start();await x.fire('CALL');const first=x.bot.pending,oldId=first.orders[0].orderId;
  assert.equal(x.bot.executed,1);
  x.bot.stop('Parado por você',{reset:true});
  assert.equal(x.bot.enabled,false);
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.net,0);assert.equal(x.bot.executed,0);assert.equal(x.bot.closed,0);
  assert.equal(x.bot.history.length,0);assert.equal(x.bot.initialBalance,null);
  assert.equal(x.bot.unresolvedBatches.size,1);
  await x.bot.start();
  assert.equal(x.bot.enabled,true);assert.equal(x.bot.nextClicks(),1);
  assert.equal(x.bot.executed,0);
  x.advance(1000);await x.fire('PUT');
  assert.equal(x.calls.length,2);assert.equal(x.calls.at(-1).side,'PUT');
  assert.equal(x.bot.pending.clickCount,1);
  assert.ok(x.bot.settle({provider,orderId:oldId,netPnl:-1,source:'broker'}));
  assert.equal(x.bot.net,0,'old result must never change new session');
  assert.equal(x.bot.closed,0);assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.unresolvedBatches.size,0);
 });
 test(provider+': completing maximum 4-click Martingale loss returns to one click without switching OFF',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();
  for(const count of [1,2,4]){
   await x.fire('PUT');assert.equal(x.bot.pending.clickCount,count);assert.equal(x.bot.enabled,true);
   await settle(x,Array(count).fill(-1));
   assert.equal(x.bot.enabled,true,'max stage is not stop');
  }
  assert.equal(x.bot.nextClicks(),1);
  x.advance(1000);await x.fire('CALL');assert.equal(x.bot.pending.clickCount,1);
 });
 test(provider+': broker balance insufficient for next full Martingale sequence switches OFF',async()=>{
  const x=setup(provider);x.balance(2);x.bot.configure({martingaleEnabled:true,martingaleLevels:2});
  await x.bot.start();await x.fire();await settle(x,[-1]);
  x.balance(1);
  x.advance(250);await x.fire('PUT');
  assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/saldo insuficiente/i);
  assert.equal(x.calls.length,1);assert.equal(x.bot.nextClicks(),2);
 });
 test(provider+': exhausted received balance switches OFF, even if stop-loss disabled',async()=>{
  const x=setup(provider);x.balance(1);await x.bot.start();await x.fire();
  await settle(x,[-1]);x.balance(0);x.bot.watch();
  assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/saldo da corretora insuficiente/i);
 });
 test(provider+': configured stop-loss still switches OFF and no minute timer does',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({stopLoss:1,stopAfterMinutes:1});
  await x.bot.start();x.advance(61000);x.bot.watch();assert.equal(x.bot.enabled,true);
  await x.fire();await settle(x,[-1]);
  assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/stop-loss|limite de perda/i);
 });
 test(provider+': temporarily paused analyst and changed asset suspend, do not automatically OFF',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  await x.bot.start();x.c.state='paused';x.bot.watch();
  assert.equal(x.bot.enabled,true);assert.match(x.bot.message,/suspenso/);
  x.c.state='running';x.c.asset='EUR/JPY OTC';x.bot.watch();
  assert.equal(x.bot.enabled,true);assert.ok(x.bot.suspensionReason);
  x.c.asset='EUR/USD OTC';x.bot.watch();
  assert.equal(x.bot.enabled,true);assert.equal(x.bot.suspensionReason,null);
 });
}

test('fresh 5s candle series outranks many stale 1m candles without fabricating multi-period EMA',()=>{
 const now=1800000000000;
 const candle=(from,ms,p)=>({from,to:from+ms,open:p,high:p+.0001,low:p-.0001,close:p,receivedAt:from+ms});
 const older=Array.from({length:40},(_,i)=>candle(now-3600000+i*60000,60000,1.1+i*.000001));
 const recent=Array.from({length:12},(_,i)=>candle(now-(12-i)*5000,5000,1.2+i*.000002));
 const result=historicalPriceStructure({candles:[...older,...recent],now});
 assert.equal(result.periodMs,5000);assert.equal(result.asOf,now);assert.equal(result.candles,12);
 const stale=historicalPriceStructure({candles:older,now});
 assert.equal(stale.candles,0,'old context must not override the current market');
});
test('terminal bar cannot claim a confirmed pivot without two future closed bars',()=>{
 const now=1800000000000,rows=Array.from({length:8},(_,i)=>{
  const from=now-(8-i)*60000,p=1.1+i*.00002,hi=i===7?1.99:p+.001;
  return{from,to:from+60000,open:p,close:p,high:hi,low:p-.001,receivedAt:from+60000};
 });
 const structure=historicalPriceStructure({candles:rows,now});
 const last=structure.zones.find(z=>Math.abs(z.level-1.99)<.00001);
 assert.equal(last?.pivots,0);assert.equal(last?.confirmedPivots,0);
});
test('structural bar confirmations never count an incomplete 1-second candle, while live quotes remain available for impulse',()=>{
 const now=1800000000000,quotes=[];
 for(let i=0;i<19;i++){const p=i<16?1.2-i*.00001:1.19980+(i-16)*.00001;
  const ts=now-(19-i)*1000;quotes.push({ts,price:p,receivedAt:ts});}
 const b=currentStrategyEvidence({quotes,quoteAt:quotes.at(-1).ts,price:quotes.at(-1).price,engineId:'trend'});
 quotes.push({ts:now+100,price:1.2003,receivedAt:now+100});
 const a=currentStrategyEvidence({quotes,quoteAt:quotes.at(-1).ts,price:quotes.at(-1).price,engineId:'trend'});
 assert.equal(b.ready,false);
 // Live impulse may legitimately react to a new tick. The invariant being
 // protected is that this tick may not be counted as a CLOSED bar.
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-strategy-evidence.mjs',import.meta.url),'utf8');
 assert.match(source,/barsOf\(rows\)\.filter\(b=>b\.ts\+1000<=quoteAt\)/);
 assert.equal(a.ready,true,'current quote affects live impulse without becoming a closed candle');
});
test('panel never steals physical keyboard focus and 8/16 batch feasibility is measured',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/el\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(s,/el\.addEventListener\('keydown'/);
 const ui=new BrokerUiExecutor({});
 for(const count of [8,16]){
  const x=ui.batchFeasibility('exnova',{count,activeId:76,entryAt:1800000000000,now:1800000000000});
  assert.equal(x.safe,false);
 }
});
