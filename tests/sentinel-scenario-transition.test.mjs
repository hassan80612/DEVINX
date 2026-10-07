import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeMarket} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';

const t=Date.UTC(2026,9,7,12);
const basis='previsão futura V5.0 + reversão estrutural + S/R + candles fechados + regime';
function runtime(){const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;return r}
function analysis(side,{kind='continuation',trigger=100,confirmed=false}={}){
  const call=side==='CALL',p={asset:'TEST',rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,strategyFutureBias:side,strategyFuture:{activeCount:1,evidence:80,confidence:80},callTrigger:trigger,putTrigger:trigger,callInvalidation:90,putInvalidation:110,callRule:kind==='reversal'?'CALL somente se tocar a região e reagir para cima':'CALL somente após romper e sustentar acima do gatilho',putRule:kind==='reversal'?'PUT somente se tocar a região e rejeitar para baixo':'PUT somente após romper e sustentar abaixo do gatilho',basis,scenario:{kind,reversalConfirmed:confirmed}};
  return{quality:{entrySide:call?'BUY':'SELL'},generalConsensus:{rapid:{side},strategies:{side,strength:80}},metrics:{micro:{delta5:call?.01:-.01,delta15:call?.01:-.01},shortModel:{ready:true,reversalCallConfirmed:call&&confirmed,reversalPutConfirmed:!call&&confirmed}},entryPlanner:{horizons:{'30':{...p,horizonSeconds:30},'60':{...p,horizonSeconds:60}}}};
}
const snap=(prices,ts)=>({price:prices.at(-1),quoteTs:ts,quoteHistory:prices.map((price,i)=>({ts:ts-(prices.length-i-1)*200,price}))});

test('actual planner metadata never makes continuation or breakout wait for a reversal',()=>{
  const candles=Array.from({length:180},(_,i)=>({from:t/1000-(180-i)*60,to:t/1000-(179-i)*60,open:100+i*.02,close:100+i*.02+.005,high:100+i*.02+.02,low:100+i*.02-.02}));
  const quotes=Array.from({length:181},(_,i)=>({ts:t-(180-i)*1000,price:103.58-(180-i)*.004}));
  const generated=analyzeMarket({candles,quoteHistory:quotes,quoteTs:t,now:t,durationMs:30000,minConfidence:55}).entryPlanner.horizons['30'];
  assert.match(generated.basis,/reversão/);
  for(const side of ['CALL','PUT'])for(const kind of ['continuation','breakout','forming']){
    const r=runtime(),a=analysis(side,{kind});for(const p of Object.values(a.entryPlanner.horizons))p.basis=generated.basis;
    const price=side==='CALL'?100.01:99.99,o=r._operationalSignalState(a,snap([price,price],t),t);
    assert.equal(o.actionable,true,side+' '+kind);assert.equal(r.operationalSetup.kind,kind);assert.equal(o.confirmation.kind,'continuation');
  }
});
test('real reversal still requires a region touch and a confirmed reaction',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),a=analysis(side,{kind:'reversal',confirmed:true}),price=side==='CALL'?100.01:99.99;
    assert.equal(r._operationalSignalState(a,snap([price,price],t),t).actionable,false);
    const touch=side==='CALL'?99.99:100.01;const o=r._operationalSignalState(a,snap([touch,price,price],t+600),t+600);
    assert.equal(o.actionable,true);assert.equal(o.confirmation.kind,'reversal');
  }
});
test('a confirmed opposite reaction can enter immediately and preserves the original outcome',()=>{
  for(const oldSide of ['CALL','PUT']){
    const r=runtime(),oldPrice=oldSide==='CALL'?100.01:99.99;
    const original=r._operationalSignalState(analysis(oldSide),snap([oldPrice,oldPrice],t),t);
    assert.equal(original.actionable,true);const firstPending=structuredClone(r.signalValidation.pending[0]);
    const newSide=oldSide==='CALL'?'PUT':'CALL',touch=newSide==='CALL'?99.99:100.01,price=newSide==='CALL'?100.02:99.98;
    const o=r._operationalSignalState(analysis(newSide,{kind:'reversal',confirmed:true}),snap([touch,price,price],t+1000),t+1000);
    assert.equal(o.side,newSide);assert.equal(o.actionable,true);assert.equal(o.entryAt,t+1000);assert.equal(o.transition.fromCreatedAt,original.createdAt);assert.equal(o.transition.fromSide,oldSide);
    assert.deepEqual(r.signalValidation.pending[0],firstPending);assert.equal(r.signalValidation.pending.length,2);
    const later=r._operationalSignalState(analysis(newSide,{kind:'reversal',confirmed:true}),snap([price,price],t+5000),t+5000);
    assert.equal(later.state,'ACOMPANHANDO');assert.equal(later.actionable,false);assert.equal(r.signalValidation.pending.length,2);
  }
});
test('opposite forecasts and repeated quotes alone cannot authorize a reversal',()=>{
  for(const confirmed of [false,true]){
    const r=runtime();r._operationalSignalState(analysis('PUT',{trigger:99}),snap([99.5,99.5],t),t);
    const a=analysis('CALL',{kind:'reversal',confirmed}),one=snap([99.99,100.01],t+1000);
    const o=r._operationalSignalState(a,one,t+1000);assert.equal(o.actionable,false);assert.equal(o.side,'PUT');
    assert.equal(r._operationalSignalState(a,one,t+1100).actionable,false);assert.equal(r.signalValidation.pending.length,0);
  }
});
test('opposite candidates respect expiration, barriers, reset and no future quotes',()=>{
  for(const block of ['expiration','barrier','future-touch']){
    const r=runtime();r._operationalSignalState(analysis('PUT',{trigger:99}),snap([99.5,99.5],t),t);
    const a=analysis('CALL',{kind:'reversal',confirmed:true});
    if(block==='expiration')a.entryPlanner.horizons['30'].rawBias='PUT';
    if(block==='barrier')a.entryPlanner.horizons['30'].safety={blocked:true};
    const q=snap([99.99,100.01,100.01],t+1000);if(block==='future-touch')q.quoteHistory[0].ts=t+5000;
    assert.equal(r._operationalSignalState(a,q,t+1000).actionable,false,block);
    r.patchSettings({asset:'OTHER'});assert.equal(r.oppositeOperationalSetup,null);assert.equal(r.operationalSetup,null);
  }
});

test('continuation cannot authorize the old direction during a confirmed short turn',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),a=analysis(side),call=side==='CALL',price=call?100.01:99.99;
    // The 15s trend still favors the forecast, while the 5s reaction has turned.
    a.metrics.micro={delta5:call?-.01:.01,delta15:call?.10:-.10};
    a.metrics.shortModel={ready:true,turnDown:call,turnUp:!call};
    const o=r._operationalSignalState(a,snap([price,price],t),t);
    assert.equal(o.actionable,false);assert.equal(o.state,'AGUARDAR FORÇA');assert.match(o.reason,/virada curta/);assert.equal(r.signalValidation.pending.length,0);
  }
});
test('a forecast cannot enter as its movement weakens and begins to retrace',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),a=analysis(side),call=side==='CALL',price=call?100.01:99.99;
    a.metrics.micro={delta2:call?-.01:.01,delta5:call?.02:-.02,delta15:call?.10:-.10};
    a.metrics.shortModel={ready:true,weakeningUp:call,weakeningDown:!call};
    const o=r._operationalSignalState(a,snap([price,price],t),t);
    assert.equal(o.actionable,false);assert.match(o.reason,/perdeu força/);
  }
});
test('a point already exceeded does not become a late fresh entry',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),a=analysis(side),call=side==='CALL';
    for(const p of Object.values(a.entryPlanner.horizons))p.entryTiming={maxDistance:.05};
    const price=call?100.1:99.9,o=r._operationalSignalState(a,snap([price,price],t),t);
    assert.equal(o.actionable,false);assert.equal(o.state,'AGUARDAR PONTO');assert.equal(r.signalValidation.pending.length,0);
    const recovered=call?100.02:99.98;
    const next=r._operationalSignalState(a,snap([recovered,recovered],t+1000),t+1000);
    assert.equal(next.actionable,true);assert.equal(next.targetAt,o.targetAt);
  }
});
test('forming setup adopts a qualified closer continuation once without resetting the window',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),call=side==='CALL',initial=analysis(side,{kind:'forming',trigger:call?101:99});
    const first=r._operationalSignalState(initial,snap([100,100],t),t);assert.equal(first.actionable,false);
    const a=analysis(side,{kind:'continuation',trigger:100});
    for(const p of Object.values(a.entryPlanner.horizons)){p.scenario.triggerBasis='previous-short-bar';p.entryTiming={maxDistance:.05}}
    const price=call?100.02:99.98,next=r._operationalSignalState(a,snap([price,price],t+1000),t+1000);
    assert.equal(next.actionable,true);assert.equal(next.createdAt,first.createdAt);assert.equal(next.targetAt,first.targetAt);assert.equal(next.trigger,100);
    const moved=analysis(side,{kind:'continuation',trigger:call?100.5:99.5});
    const later=r._operationalSignalState(moved,snap([price,price],t+1500),t+1500);assert.equal(later.trigger,100);
  }
});

test('unvalidated earlier local timing stays in research on a chronological real-price frame',()=>{
  const data=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
  assert.ok(data.candles.every(c=>c.to*1000<=data.now));assert.ok(data.quoteHistory.every(q=>q.ts<=data.now));
  const control=analyzeMarket({...data,quoteTs:data.now,durationMs:30000,minConfidence:55}).entryPlanner.horizons['30'];
  const p=analyzeMarket({...data,quoteTs:data.now,durationMs:30000,minConfidence:55,candidateModel:true}).entryPlanner.horizons['30'];
  const bucket=Math.floor(data.now/5000)*5000-5000,closed=data.quoteHistory.filter(q=>q.ts>=bucket&&q.ts<bucket+5000);
  assert.equal(control.modelRole,'control');assert.equal(control.entryTiming.maxDistance,null);assert.equal(control.scenario.triggerBasis,'structural-level');assert.ok(control.callTrigger>p.callTrigger);
  assert.equal(p.modelRole,'candidate');assert.equal(control.directionReady,true);assert.equal(p.directionReady,false);assert.equal(p.scenario.kind,'continuation');
  assert.equal(p.callTrigger,Math.max(...closed.map(q=>q.price)));assert.equal(p.entryTiming.sourceBarAt,bucket);
  assert.ok(data.quoteHistory.at(-1).price-p.callTrigger<=p.entryTiming.maxDistance);
});
test('lost strength withdraws an active burst and recovery needs a new independently confirmed point',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),call=side==='CALL',price=call?100.01:99.99,a=analysis(side);
    const first=r._operationalSignalState(a,snap([price,price],t),t);assert.equal(first.actionable,true);
    const original=structuredClone(r.signalValidation.pending[0]);
    a.metrics.shortModel={ready:true,weakeningUp:call,weakeningDown:!call};a.metrics.micro.delta2=call?-.01:.01;
    const wait=r._operationalSignalState(a,snap([price,price],t+500),t+500);assert.equal(wait.actionable,false);assert.equal(wait.state,'AGUARDAR FORÇA');
    a.metrics.shortModel={ready:true};a.metrics.micro.delta2=call?.01:-.01;
    for(const p of Object.values(a.entryPlanner.horizons)){p.scenario.triggerBasis='previous-short-bar';p.entryTiming={maxDistance:.05,sourceBarAt:t}}
    const old=r._operationalSignalState(a,snap([price,price],t+4000),t+4000);assert.equal(old.actionable,false);assert.equal(r.signalValidation.pending.length,1);
    for(const p of Object.values(a.entryPlanner.horizons))p.entryTiming.sourceBarAt=t+5000;
    const single={price,quoteTs:t+10000,quoteHistory:[{ts:t+10000,price}]};
    assert.equal(r._operationalSignalState(a,single,t+10000).actionable,false);
    const next=r._operationalSignalState(a,snap([price,price],t+10200),t+10200);
    assert.equal(next.actionable,true);assert.equal(next.targetAt,first.targetAt);assert.notEqual(next.createdAt,first.createdAt);
    assert.equal(next.activeUntil,t+13700);assert.equal(r.signalValidation.pending.length,2);assert.deepEqual(r.signalValidation.pending[0],original);
    assert.equal(r._operationalSignalState(a,snap([price,price],t+14000),t+14000).actionable,false);
  }
});

test('withdrawn entry cannot reuse prices from before its loss of strength',()=>{
  const r=runtime(),a=analysis('CALL'),price=100.01;
  r._operationalSignalState(a,snap([price,price],t),t);
  a.metrics.shortModel={ready:true,weakeningUp:true};a.metrics.micro.delta2=-.01;
  r._operationalSignalState(a,snap([price,price],t+500),t+500);
  a.metrics.shortModel={ready:true};a.metrics.micro.delta2=.01;
  const old={price,quoteTs:t+600,quoteHistory:[{ts:t,price},{ts:t+600,price}]};
  assert.equal(r._operationalSignalState(a,old,t+600).actionable,false);
  assert.equal(r._operationalSignalState(a,snap([price,price],t+800),t+800).actionable,true);
});

test('quotes remaining beyond a level cannot confirm entry while moving the wrong way',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),call=side==='CALL',a=analysis(side),falling=call?[100.03,100.02]:[99.97,99.98];
    const o=r._operationalSignalState(a,snap(falling,t),t);assert.equal(o.actionable,false);assert.equal(r.signalValidation.pending.length,0);
    const restored=call?[100.02,100.03]:[99.98,99.97];
    assert.equal(r._operationalSignalState(a,snap(restored,t+500),t+500).actionable,true);
  }
});
