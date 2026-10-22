import test from 'node:test';
import assert from 'node:assert/strict';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {setup} from './fixtures/executor-13946.mjs';

for(const provider of ['iq_option','exnova']){
 const order=()=>({id:'local-1',asset:'EUR/USD OTC',activeId:76,side:'CALL',amount:1,
  entryDeadlineAt:Date.now()+500,clicked:false,captureEntry:()=>{},isValid:()=>true});
 const ui=()=>{const t=new BrokerUiExecutor({state:()=>({symbol:'EUR/USD OTC',activeId:76,screenCandidateSymbol:null})},{ackTimeoutMs:15});return t;};
 test(provider+': failed Playwright click cannot become a fictitious broker order',async()=>{
  const a=ui(),p=order();
  a.controls=async()=>({frame:{locator:()=>({click:async()=>{throw Error('locator timeout before broker request')}})},callSelector:'#call',putSelector:'#put'});
  await assert.rejects(()=>a.execute(provider,p),/locator timeout/);
  assert.equal(p.clickAttempted,true);
  assert.equal(p.clicked,false);
  assert.equal(p.dispatchUncertain,true);
  assert.equal(a.unidentifiedClick?.order,p);
  assert.equal(a.orders.size,0,'no fabricated broker order id');
 });
 test(provider+': failure before click does not mark attempted, clicked or pending',async()=>{
  const a=ui(),p=order();
  a.controls=async()=>{throw Object.assign(Error('button unavailable'),{beforeClick:true})};
  await assert.rejects(()=>a.execute(provider,p),/button unavailable/);
  assert.notEqual(p.clickAttempted,true);
  assert.notEqual(p.clicked,true);
  assert.notEqual(p.dispatchUncertain,true);
  assert.equal(a.unidentifiedClick,null);
 });
 test(provider+': actual completed browser click with missing ACK remains unconfirmed without duplicate click',async()=>{
  const a=ui(),p=order();let clicks=0;
  a.controls=async()=>({frame:{locator:()=>({click:async()=>{clicks++}})},callSelector:'#call',putSelector:'#put'});
  const response=await a.execute(provider,p);
  assert.equal(response.pending,true);
  assert.equal(p.clicked,true);
  assert.equal(clicks,1);
  assert.equal(a.unidentifiedClick?.order,p);
  await assert.rejects(()=>a.execute(provider,order()),/identificação de clique anterior/);
  assert.equal(clicks,1);
 });
 test(provider+': false UI click cannot alter financial WIN LOSS Martingale or claim a broker result',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.driver.execute=async(_p,p)=>{p.clickAttempted=true;p.dispatchUncertain=true;throw Error('Playwright timeout')};
  await x.bot.start();await x.fire();
  assert.equal(x.bot.sessionWins,0);
  assert.equal(x.bot.sessionLosses,0);
  assert.equal(x.bot.closed,0);
  assert.equal(x.bot.executed,0);
  assert.equal(x.bot.net,0);
  assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.unresolvedDetail().waitingResult,0);
  assert.equal(x.bot.unresolvedDetail().waitingId,0);
  assert.equal(x.bot.unresolvedDetail().uncertainAttempts,1);
  assert.match(x.bot.hardHoldReason,/tentativa de clique sem confirmação/);
  const attempted=x.bot.pending;
  x.advance(30001);x.bot.watch();
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.unresolvedDetail().uncertainAttempts,1);
  await x.fire('PUT');
  assert.equal(x.bot.executed,0,'no additional entry while brokerage execution is unknown');
  assert.equal(x.bot.sessionLosses,0);
  assert.equal(x.bot.unresolvedExposure(),1,'worst-case exposure is reserved for risk, NOT booked as a loss');
  assert.notEqual(attempted.orders[0].clicked,true);
 });
}
