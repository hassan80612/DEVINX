import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {combine66WithProbability} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
import {CausalProbabilityReview} from '../sentinel-trading-lab/agent/src/core/causal-probability-review.mjs';
const repoFile=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const good={ready:true,side:'CALL',strength:59,reason:'closed-structure-and-live-impulse'};

test('expiry-aligned 60/40 is a directional score, not a promise, and never opens without evidence',()=>{
 const est={pCall:.32,pPut:.68};
 for(const durationMs of [30000,60000,120000,300000]){
  const proof={approved:true,n:durationMs>=300000?50:durationMs>=120000?30:16,observedOppositeRate:.80};
  const shadow=combine66WithProbability(good,est,{durationMs});
  assert.equal(shadow.side,'CALL');
  assert.equal(shadow.probabilityWeight,.60);
  assert.equal(shadow.structureWeight,.40);
  assert.equal(shadow.calibratedWinProbability,false);
  const winner=combine66WithProbability(good,est,{durationMs,proof});
  assert.equal(winner.side,'PUT');
  assert.equal(winner.probabilityOverride,true);
  assert.ok(winner.blendedDirectionalOppositeScore>.50);
  assert.equal(combine66WithProbability({...good,reason:'closed-range-extreme-reversal-confirmed'},est,{durationMs,proof}).side,'CALL');
  assert.equal(combine66WithProbability({...good,strength:67},est,{durationMs,proof}).side,'CALL');
 }
});
test('60/40 refuses a minority combined score even when opposite is >58%',()=>{
 const est={pCall:.41,pPut:.59},proof={approved:true,n:30,observedOppositeRate:.80};
 const out=combine66WithProbability(good,est,{durationMs:30000,proof});
 assert.equal(out.side,'CALL');
 assert.ok(out.blendedDirectionalSameScore>.50);
});
test('causal 62-point evidence observation matches decision gate, not the old 55-point cutoff',()=>{
 const src=repoFile('sentinel-trading-lab/agent/src/core/causal-probability-review.mjs');
 assert.match(src,/strength<62/);
 assert.doesNotMatch(src,/strength<55/);
 const review=new CausalProbabilityReview();
 const origin=1792600000000;
 const q=Array.from({length:65},(_,i)=>({ts:origin-64000+i*1000,price:1.1+i*.00001}));
 const actual=review.observe({context:'exnova|EUR/USD OTC|automatic|30000',now:origin,
  quoteAt:origin,price:q.at(-1).price,quoteHistory:q,expiryMs:30000,
  original:{...good,strength:59},estimate:{pCall:.30,pPut:.70},marketValid:true});
 assert.equal(actual.n,0);
 assert.equal(review.contexts.get('exnova|EUR/USD OTC|automatic|30000')?.pending?.side,'CALL');
});
for(const provider of ['exnova','iq_option']){
 const ui=()=>new BrokerUiExecutor({state:()=>({activeId:76,symbol:'EUR/USD OTC',screenCandidateSymbol:null})},{ackTimeoutMs:15});
 const order=remaining=>({id:'local-'+provider,side:'CALL',amount:1,asset:'EUR/USD OTC',activeId:76,
  entryDeadlineAt:Date.now()+remaining,captureEntry:()=>{},isValid:()=>true});
 test(provider+': deadline almost expired -> skip BEFORE Playwright click and without phantom order',async()=>{
  const b=ui(),o=order(55);let clicks=0;
  b.controls=async()=>({frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async()=>{clicks++}})},callSelector:'#call',putSelector:'#put'});
  await assert.rejects(()=>b.execute(provider,o),/sem tempo seguro para o clique/);
  assert.equal(clicks,0);
  assert.notEqual(o.clickAttempted,true);
  assert.notEqual(o.dispatchUncertain,true);
  assert.equal(b.unidentifiedClick,null);
  assert.equal(b.orders.size,0);
 });
 test(provider+': sufficiently fresh quote still leads to precisely one click',async()=>{
  const b=ui(),o=order(900);let clicks=0;
  b.controls=async()=>({frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async()=>{clicks++}})},callSelector:'#call',putSelector:'#put'});
  const outcome=await b.execute(provider,o);
  assert.equal(outcome.pending,true);
  assert.equal(clicks,1);
  assert.equal(o.clicked,true);
 });
}
test('fast broker ticks reuse the SAME asset registry rather than clone an increasing map',()=>{
 const d=new LocalPlaywrightDriver({dataDir:'unused-perf-test'}),st=d.state('exnova');
 st.activeMap.set('EURUSDOTC',76);
 st.activeId=76;st.symbol='EUR/USD OTC';st.uiSymbol=st.symbol;
 st.assets.add('EUR/USD OTC');
 const map=st.activeMap,assets=st.assets;
 for(let i=0;i<100;i++){
  d.ingest('exnova',{name:'quote-generated',msg:{body:{active_id:76,price:1.12345},active_id:76}},'page-in');
  assert.equal(st.activeMap,map);
  assert.equal(st.assets,assets);
 }
});
test('no change to broker expiry, native Digital reopen, WIN/LOSS, or chart-navigation controls',()=>{
 const broker=repoFile('sentinel-trading-lab/agent/worker/broker-ui-executor.mjs');
 const worker=repoFile('sentinel-trading-lab/agent/worker/index.mjs');
 const panel=repoFile('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 assert.match(broker,/async recoverDigitalAfterClose\(_provider\)\{return false;\}/);
 assert.match(worker,/runtime\.patchSettings\(\{orderDurationMs:n,forecastHorizonSeconds:30\}/);
 assert.match(panel,/data-sentinel-executor-clock-wl/);
 assert.match(broker,/Date\.now\(\)-cached\.at<=15000/);
 assert.match(broker,/if\(remaining<=80\)throw errorBefore/);
});
