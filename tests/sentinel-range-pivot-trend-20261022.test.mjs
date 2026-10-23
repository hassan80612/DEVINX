import test from 'node:test';
import assert from 'node:assert/strict';
import {completedRangeStructure} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const makeQuotes=({drift=0,phase=0,seconds=180}={})=>{
 const start=1700000000000,amplitude=.00055,period=30;
 return Array.from({length:seconds+1},(_,i)=>({
  ts:start+i*1000,receivedAt:start+i*1000,
  price:1+drift*i+amplitude*Math.sin((i+phase)*Math.PI*2/period)+.000006*Math.sin(i*1.4)
 }));
};
const assess=(options)=>{
 const quotes=makeQuotes(options),recent=quotes.at(-1);
 return completedRangeStructure(quotes,recent.ts,.000028,recent.price,30000);
};
test('stationary observed range preserves legitimate top and bottom turns',()=>{
 assert.equal(assess({drift:0,phase:12})?.side,'PUT');
 assert.equal(assess({drift:0,phase:24})?.side,'CALL');
});
test('rising HH/HL is not falsely classified as a top reversal',()=>{
 assert.equal(assess({drift:.000006,phase:12}),null);
 assert.equal(assess({drift:.000006,phase:14}),null);
});
test('falling LH/LL is not falsely classified as a bottom reversal',()=>{
 assert.equal(assess({drift:-.000008,phase:0}),null);
 assert.equal(assess({drift:-.000012,phase:0}),null);
});
test('range direction and non-signaling market are not disturbed',()=>{
 assert.equal(assess({drift:0,phase:10})?.side,'PUT');
 assert.equal(assess({drift:0,phase:26})?.side,'CALL');
 assert.equal(assess({drift:0,phase:14})?.ready,false);
});
