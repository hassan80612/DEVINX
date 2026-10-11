import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFutureEntryJournal} from '../sentinel-trading-lab/agent/worker/compare-future-entries.mjs';
const at=1800000000000;
const make=(n=930,step=1000)=>Array.from({length:n},(_,i)=>({
 schema:2,type:'market',provider:'iq_option',asset:'EUR/USD OTC',
 ts:at+i*step,quoteTs:at+i*step,
 quote:1.1+.000063*Math.sin(i/19)+.000019*Math.sin(i/6),
 quotes:[{ts:at+i*step,price:1.1+.000063*Math.sin(i/19)+.000019*Math.sin(i/6)}]
}));
test('offline comparator audits SAME real entry and expiry quotes, not decision emission candle',()=>{
 const a=evaluateFutureEntryJournal({events:make(),engineId:'automatic',horizonSeconds:30,stepSeconds:30});
 assert.equal(a.engineId,'automatic');
 assert.equal(a.horizonSeconds,30);
 assert.ok(a.predictions>=2);
 assert.ok(a.all.verified>=1);
 assert.ok(a.all.baselineWins<=a.all.verified);
 assert.ok(a.all.shadowWins<=a.all.verified);
 assert.equal(a.enoughEvidence,false,'one synthetic day can never prove a model better');
 assert.equal(a.preliminarySplit,true);
});
test('no market quotes: no fabricated observations, signals, or apparent 100% accuracy',()=>{
 const a=evaluateFutureEntryJournal({events:[],engineId:'price_action',horizonSeconds:30});
 assert.equal(a.all.predictions,0);
 assert.equal(a.all.verified,0);
 assert.equal(a.all.baselineAccuracy,null);
 assert.equal(a.all.shadowAccuracy,null);
 assert.equal(a.enoughEvidence,false);
});
test('missing original entry or expiry quote cannot be filled by a late print',()=>{
 const events=make(940).filter((ev,i)=>i<350||i%4===0);
 const a=evaluateFutureEntryJournal({events,engineId:'trend',horizonSeconds:30,stepSeconds:30});
 assert.ok(a.all.skipped>=0);
 assert.equal(a.enoughEvidence,false);
});
test('invalid motor and expired user horizon fail explicitly',()=>{
 assert.throws(()=>evaluateFutureEntryJournal({events:make(20),engineId:'not-a-motor'}),/unknown_selected_engine/);
 assert.throws(()=>evaluateFutureEntryJournal({events:make(20),horizonSeconds:-30}),/invalid_time_horizon/);
});
