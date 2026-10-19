import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {setup} from './fixtures/executor-13946.mjs';

for(const provider of ['iq_option','exnova']){
 const at=1_800_000_000_000,activeId=76;
 test(provider+': actual latency rules out 8/16 late-click Martingale BEFORE any orders',()=>{
  const driver=new BrokerUiExecutor({});
  const args=count=>({count,activeId,entryAt:at,now:at});
  assert.equal(driver.batchFeasibility(provider,args(1)).safe,true);
  assert.match(driver.batchFeasibility(provider,args(8)).reason,/velocidade de cliques confirmada/);
  driver.confirmedDispatchDurations.set(driver.dispatchKey(provider,activeId),[260,250,240]);
  assert.equal(driver.batchFeasibility(provider,args(8)).safe,false);
  assert.equal(driver.batchFeasibility(provider,args(16)).safe,false);
  const seven=driver.batchFeasibility(provider,args(8));
  assert.equal(seven.estimatedLastClickDelayMs,1820);
  driver.confirmedDispatchDurations.set(driver.dispatchKey(provider,activeId),[180,195,200]);
  assert.equal(driver.batchFeasibility(provider,args(8)).safe,true);
  assert.equal(driver.batchFeasibility(provider,args(16)).safe,false);
  assert.equal(driver.batchFeasibility(provider,{...args(8),now:at+300}).safe,false);
  assert.equal(driver.batchFeasibility(provider,{...args(16),count:1}).safe,true);
 });
 test(provider+': 8 cannot become 6 when preflight rules out a slow broker',async()=>{
  const x=setup(provider);
  x.c.brokerBalance=null;
  const first=x.now();
  const estimator=new BrokerUiExecutor({});
  estimator.confirmedDispatchDurations.set(estimator.dispatchKey(provider,x.c.activeId),[260]);
  x.driver.batchFeasibility=(p,opt)=>estimator.batchFeasibility(p,opt);
  x.bot.configure({martingaleEnabled:true,martingaleLevels:4});
  await x.bot.start();
  x.bot.martingaleLevel=3;
  await x.fire('CALL');
  assert.equal(x.calls.length,0,'all 8 rejected before first paid click');
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.nextClicks(),8,'no synthetic recovery or loss');
  assert.match(x.bot.message,/não cabe no prazo de entrada/);
  assert.equal(x.bot.executed,0);
  assert.equal(x.bot.net,0);
  // A 16-click attempt must not consume a partial sequence either.
  x.bot.martingaleLevel=4;
  x.advance(1800);
  await x.fire('PUT');
  assert.equal(x.calls.length,0);
  assert.equal(x.bot.nextClicks(),16);
  assert.equal(x.bot.enabled,true);
 });
}
test('physical keyboard remains owned by the broker, not the floating analyst',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/el\.focus\(\{preventScroll:true\}\)/);
 assert.doesNotMatch(source,/el\.addEventListener\('keydown'/);
 assert.doesNotMatch(source,/el\.setPointerCapture\(ev\.pointerId\)/);
 assert.match(source,/el\.addEventListener\('pointerdown'/);
 assert.match(source,/el\.addEventListener\('pointermove'/);
});
