import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMarket} from './strategy.mjs';

const now=Date.now();
const candles=Array.from({length:100},(_,i)=>{
  const value=1+i*.0001;
  const from=Math.floor(now/1000)-60*(100-i);
  return{from,to:from+60,open:value,high:value+.00005,low:value-.00005,close:value};
});
const quotes=(change,count=80)=>Array.from({length:count},(_,i)=>({ts:now-(count-1-i)*1000,price:1.01+i*change}));
const analyze=(quoteHistory)=>analyzeMarket({candles,quoteHistory,now,quoteTs:now,durationMs:30000});

test('each horizon uses its own observed window and conditional bias',()=>{
  const p=analyze(quotes(.000004)).entryPlanner.horizons;
  assert.equal(p['30'].bias,'CALL');
  assert.equal(p['900'].bias,'CALL');
  assert.notEqual(p['30'].observedMove,p['900'].observedMove);
  assert.equal(p['30'].automaticExecution,false);
});

test('short reversal does not inherit the long horizon bias',()=>{
  const p=analyze(quotes(-.000002)).entryPlanner.horizons;
  assert.equal(p['30'].bias,'NEUTRO');
  assert.equal(p['900'].bias,'CALL');
});

test('short outlook waits for enough microflow even with long candles',()=>{
  const p=analyze(quotes(.000004,15)).entryPlanner.horizons;
  assert.equal(p['30'].outlookReady,false);
  assert.equal(p['30'].bias,'NEUTRO');
  assert.equal(p['300'].outlookReady,true);
});

test('stale feed cannot create a horizon outlook',()=>{
  const a=analyzeMarket({candles,quoteHistory:quotes(.000004),now,quoteTs:now-10000,freshnessMs:5000});
  assert.equal(a.side,'WAIT');
  assert.equal(a.entryPlanner,undefined);
});
