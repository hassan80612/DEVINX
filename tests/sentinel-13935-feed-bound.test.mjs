import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactObservedQuoteHistory} from '../sentinel-trading-lab/agent/src/core/observed-quote-history.mjs';

const driverSource=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');

test('feed source retains a five-minute chronological window without new polling',()=>{
 assert.match(driverSource,/st\.quoteHistory=compactObservedQuoteHistory\(st\.quoteHistory,\{windowMs:300000,bucketMs:1000\}\)/);
 assert.match(driverSource,/lastQuoteCompactionAt/);
});

test('real OHLC and newest observed timestamp are retained',()=>{
 const start=1_700_000_000_000,rows=[];
 for(let i=0;i<1204;i++)rows.push({ts:start+i*250,price:1+i%4*.001});
 const compact=compactObservedQuoteHistory(rows,{windowMs:300000,bucketMs:1000});
 assert.ok(compact.length<=1204);
 assert.equal(compact.at(-1).ts,rows.at(-1).ts);
 assert.equal(compact.at(-1).price,rows.at(-1).price);
 for(let i=1;i<300;i++){
  const bucket=rows.slice(i*4,i*4+4);
  assert.ok(compact.some(x=>x.ts===bucket[0].ts));
  assert.ok(compact.some(x=>x.ts===bucket.at(-1).ts));
  assert.ok(compact.some(x=>x.price===Math.max(...bucket.map(y=>y.price))&&x.ts>=bucket[0].ts&&x.ts<=bucket.at(-1).ts));
 }
});

test('two-hour fast feed remains bounded; no invented price or future samples',()=>{
 const start=1_700_000_000_000,rows=[];
 let lastCompactedAt=0,max=0;
 for(let i=0;i<7200*4;i++){
  const t=start+i*250,price=1+Math.sin(i/7)*.002;
  rows.push({ts:t,price});
  const oldest=Number(rows[0]?.ts||t);
  if((rows.length>1500||t-oldest>300000)&&
      (t-lastCompactedAt>=1000||rows.length>1800)){
    const reduced=compactObservedQuoteHistory(rows,{windowMs:300000,bucketMs:1000});
    rows.length=0;rows.push(...reduced);lastCompactedAt=t;
  }
  max=Math.max(max,rows.length);
 }
 assert.ok(max<=1800,`buffer leaked: ${max}`);
 assert.ok(rows.at(-1).ts-rows[0].ts<=300000);
 assert.equal(rows.at(-1).ts,start+(7200*4-1)*250);
 assert.ok(rows.every(q=>Number.isFinite(q.price)&&q.ts<=rows.at(-1).ts));
});
