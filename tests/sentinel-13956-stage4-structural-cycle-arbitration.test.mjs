import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity,advanceNowOpportunity,reconcileExpiryDirection} from
 '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const structural={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',entryPrice:1.2,observedAt:1000};
const forecast={ready:true,side:'PUT',reason:'observed-trend-and-30s-cycle-projection',predictedPrice:1.1};
const selected={ready:true,side:'CALL',entryPrice:1.2,observedAt:1000};

test('stage 4: opposing cycle NEVER silently replaces a qualified structural CALL, even if wide selector agrees',()=>{
 const r=reconcileExpiryDirection({structural,forecast,selected});
 assert.equal(r.ready,false);assert.equal(r.side,null);
 assert.equal(r.entryPrice,null);assert.equal(r.reason,'unverified-forecast-structure-conflict');
});
test('stage 4: opposing adaptive wide-cycle decision is also blocked, even if narrow forecast agrees',()=>{
 const r=reconcileExpiryDirection({structural,forecast:{...forecast,side:'CALL'},selected:{...selected,side:'PUT'}});
 assert.equal(r.ready,false);assert.equal(r.side,null);
});
test('stage 4: opposite case PUT structure versus CALL projection is symmetric',()=>{
 const r=reconcileExpiryDirection({structural:{...structural,side:'PUT'},forecast:{...forecast,side:'CALL'},selected:{...selected,side:'PUT'}});
 assert.equal(r.ready,false);assert.equal(r.side,null);
});
test('stage 4: agreeing directions preserve the original selected decision and its entry timestamp exactly',()=>{
 const r=reconcileExpiryDirection({structural,forecast:{...forecast,side:'CALL'},selected});
 assert.equal(r,selected);assert.equal(r.side,'CALL');assert.equal(r.observedAt,1000);
});
test('stage 4: an unavailable cycle or unqualified original does not manufacture a new veto',()=>{
 assert.equal(reconcileExpiryDirection({structural,forecast:{ready:false,side:null},selected}),selected);
 assert.equal(reconcileExpiryDirection({structural:{ready:false,side:null},forecast,selected}),selected);
});
test('stage 4 integration: selector cannot flip a full-market ready structural signal into an entry',()=>{
 const T=Date.UTC(2026,9,19,17,0,0);
 const history=Array.from({length:181},(_,i)=>({
  ts:T-(180-i)*1000,receivedAt:T-(180-i)*1000,
  price:1.1*Math.exp(i*.000002)
 }));
 const args={quoteHistory:history,price:history.at(-1).price,quoteAt:T,now:T,
  durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
  candles:[],expiryDirectionContext:'iq_option|EUR/USD|30000'};
 const normal=analyzeNowOpportunity(args);
 assert.equal(normal.ready,true,'established upward trend must remain callable');
 assert.equal(normal.side,'CALL');
 const opposing=analyzeNowOpportunity({...args,expiryDirectionSelector:{
  observe:({baseline})=>({...baseline,ready:true,side:'PUT'})
 }});
 assert.equal(opposing.ready,false,'adaptive cycle cannot impose an unproven opposite direction');
 assert.equal(opposing.side,null);
 assert.equal(opposing.reason,'unverified-forecast-structure-conflict');
 const state=advanceNowOpportunity({candidate:opposing,now:T,quoteAt:T,
  asset:'EUR/USD',provider:'iq_option',engineId:'automatic',durationMs:30000});
 assert.equal(state.phase,'scanning','conflicted prediction must not become a CALL/PUT order');
 assert.equal(state.side,null);
});
