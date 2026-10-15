import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

function makeRuntime({live=false}={}){
 const r=new DemoTradingRuntime({enableVNext:false});
 r.stateName='running';
 r.settings.engine='automatic';
 r.settings.requireLiveBroker=live;
 r.nextEvalMs=0;
 return r;
}

test('a new quote arriving while a forecast is finishing retains its immediate evaluation',async()=>{
 const r=makeRuntime();
 const observe=r.forecastResearch.observe.bind(r.forecastResearch);
 let requested=false;
 r.forecastResearch.observe=(...args)=>{
   if(!requested){requested=true;r.requestImmediateEvaluation();}
   return observe(...args);
 };
 await r.tick(Date.now(),{skipStatus:true});
 assert.equal(requested,true,'the race was exercised');
 assert.equal(r.immediateEvaluationSerial,1);
 assert.equal(r.nextEvalMs,0,'a finished forecast must not postpone a newly arrived quote');
});

test('with no new quote, the normal analysis cadence is preserved',async()=>{
 const r=makeRuntime();
 const start=Date.now();
 await r.tick(start,{skipStatus:true});
 assert.equal(r.immediateEvaluationSerial,0);
 assert.ok(r.nextEvalMs>start,'no unnecessary busy-loop without new quotes');
});

test('a quote arriving in waiting-for-feed path also keeps its immediate request',async()=>{
 const r=makeRuntime({live:true});
 r._marketSnapshot=()=>{r.requestImmediateEvaluation();return{waitingLive:true,price:1}};
 await r.tick(Date.now(),{skipStatus:true});
 assert.equal(r.immediateEvaluationSerial,1);
 assert.equal(r.nextEvalMs,0);
});

test('when stopped, quote requests cannot schedule a speculative analysis',()=>{
 const r=new DemoTradingRuntime({enableVNext:true});
 r.nextEvalMs=123;
 r.requestImmediateEvaluation();
 assert.equal(r.immediateEvaluationSerial,0);
 assert.equal(r.nextEvalMs,123);
});
