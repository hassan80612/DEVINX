import test from 'node:test';
import assert from 'node:assert/strict';
import {canRenewExpiredScenario} from '../sentinel-trading-lab/agent/src/core/scenario-renewal.mjs';

const baseTs=1791580063950,quoteTs=baseTs+90_000;
const main={status:'JANELA ENCERRADA',deadline:baseTs,side:'CALL',trigger:1.12593832,invalidation:1.12529168};
const plan={rawBias:'CALL',currentPrice:1.1272,callTrigger:1.1279,callInvalidation:1.1261,entryTiming:{sourceBarAt:null}};
const valid=()=>({main,plan,qualified:true,quoteTs,inputQuality:{ready:true,latestTo:quoteTs-20_000}});

test('a qualified forecast can renew after a NEW verified completed candle even without a recent 5-second timing bar',()=>{
  assert.equal(canRenewExpiredScenario(valid()),true);
});

test('do not recycle expired scenarios on the same price levels or stale input',()=>{
  assert.equal(canRenewExpiredScenario({...valid(),plan:{...plan,callTrigger:main.trigger,callInvalidation:main.invalidation}}),false);
  assert.equal(canRenewExpiredScenario({...valid(),inputQuality:{ready:false,latestTo:quoteTs-20_000}}),false);
  assert.equal(canRenewExpiredScenario({...valid(),inputQuality:{ready:true,latestTo:baseTs-1000}}),false);
  assert.equal(canRenewExpiredScenario({...valid(),inputQuality:{ready:true,latestTo:quoteTs+5000}}),false);
});

test('expiry, direction and qualification guards remain intact',()=>{
  assert.equal(canRenewExpiredScenario({...valid(),main:{...main,status:'OPEN'}}),false);
  assert.equal(canRenewExpiredScenario({...valid(),qualified:false}),false);
  assert.equal(canRenewExpiredScenario({...valid(),quoteTs:baseTs-1}),false);
  assert.equal(canRenewExpiredScenario({...valid(),plan:{...plan,rawBias:'NEUTRO',bias:'NEUTRO'}}),false);
});

test('a newer confirmed short setup still renews independently of historical fallback',()=>{
  assert.equal(canRenewExpiredScenario({...valid(),plan:{...plan,entryTiming:{sourceBarAt:quoteTs-4000}},inputQuality:{ready:false}}),true);
});
