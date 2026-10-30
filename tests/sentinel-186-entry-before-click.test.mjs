import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoverAlreadyOpenMarket} from '../sentinel-trading-lab/agent/worker/broker-initial-market-recovery.mjs';
import {reviewDirectionBeforeClick} from '../sentinel-trading-lab/agent/worker/entry-direction-before-click.mjs';
import {assessDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
test('already selected asset with null active_id is recovered without a tab switch',async()=>{
 const st={symbol:'EUR/GBP OTC',uiSymbol:'EUR/GBP OTC',activeId:null,assetValidated:false,quoteFeedValidated:false,candleFresh:false},calls=[];
 const driver={liveStatus:()=>({...st}),syncVisibleAsset:async()=>{calls.push('selected-tab');return true},
  domSnapshot:async()=>{calls.push('dom')},requestBaseData:async()=>{calls.push('catalog');st.activeId=123;st.assetValidated=true},
  requestMarketData:async()=>{calls.push('history:'+st.activeId);st.quoteFeedValidated=true;st.candleFresh=true}};
 assert.equal(await recoverAlreadyOpenMarket({provider:'exnova',driver}),true);
 assert.deepEqual(calls,['selected-tab','dom','catalog','selected-tab','history:123']);
 assert.equal(st.symbol,'EUR/GBP OTC');
});
test('healthy same asset is untouched; unresolved broker active_id does not authorize history',async()=>{
 let called=0;const healthy={activeId:123,symbol:'EUR/GBP OTC',assetValidated:true,quoteFeedValidated:true,candleFresh:true};
 const driver={liveStatus:()=>healthy,syncVisibleAsset:async()=>{called++},domSnapshot:async()=>{called++},requestMarketData:async()=>{called++}};
 assert.equal(await recoverAlreadyOpenMarket({provider:'exnova',driver}),true);assert.equal(called,0);
 const unresolved={symbol:'EUR/GBP OTC',activeId:null,assetValidated:false};
 const bad={liveStatus:()=>unresolved,syncVisibleAsset:async()=>true,domSnapshot:async()=>true,requestBaseData:async()=>true,requestMarketData:async()=>{called++}};
 assert.equal(await recoverAlreadyOpenMarket({provider:'exnova',driver:bad}),false);assert.equal(called,0);
});
const T=1800000000000;
function tape(mirror=false){
 const convert=p=>mirror?200-p:p;
 const knots=[[-25000,100],[-20000,100.05],[-12000,100.45],[-7000,100.82],[-4000,100.98],[-2800,101.04],[-2000,100.98],[-1500,100.88],[-1000,100.75],[-500,100.63],[0,100.53]];
 const at=x=>{let i=1;while(i<knots.length-1&&knots[i][0]<x)i++;const [t1,p1]=knots[i-1],[t2,p2]=knots[i];return convert(p1+(p2-p1)*(x-t1)/(t2-t1));};
 const quoteHistory=Array.from({length:101},(_,i)=>({ts:T-25000+i*250,price:at(-25000+i*250)}));
 return {quoteHistory,quoteAt:T,quote:quoteHistory.at(-1).price};
}
test('30s and 1m bot veto weakened CALL/PUT continuation before executing first click',()=>{
 for(const durationMs of [30000,60000])for(const mirror of [false,true]){
  const context=tape(mirror),side=mirror?'PUT':'CALL';
  const state=assessDirectionalPersistence({quoteHistory:context.quoteHistory,quoteAt:T,price:context.quote,now:T,durationMs});
  assert.ok(['weakening','reversal-testing'].includes(state.phase),JSON.stringify(state));
  const v=reviewDirectionBeforeClick({signal:{side,observedEntryFamily:'continuation',durationMs},context,now:T});
  assert.equal(v.ok,false,JSON.stringify(v));
 }
});
test('genuine reversal, independent CALL/PUT, five-minute and unverified tape preserve existing policy',()=>{
 const context=tape(false);
 assert.equal(reviewDirectionBeforeClick({signal:{side:'PUT',observedEntryFamily:'reversal',durationMs:60000},context,now:T}).ok,true);
 assert.equal(reviewDirectionBeforeClick({signal:{side:'CALL',observedEntryFamily:'continuation',durationMs:60000,independent:true},context,now:T}).ok,true);
 assert.equal(reviewDirectionBeforeClick({signal:{side:'CALL',observedEntryFamily:'continuation',durationMs:300000},context,now:T}).ok,true);
 assert.equal(reviewDirectionBeforeClick({signal:{side:'CALL',observedEntryFamily:'continuation',durationMs:60000},context:{quoteHistory:[],quoteAt:T,quote:100},now:T}).ok,true);
});
test('only broker-start and final-order validation are wired to new helpers',()=>{
 const root=new URL('../sentinel-trading-lab/agent/worker/',import.meta.url);
 const worker=readFileSync(new URL('index.mjs',root),'utf8');
 const executor=readFileSync(new URL('signal-executor.mjs',root),'utf8');
 assert.match(worker,/return recoverAlreadyOpenMarket\(\{driver,provider\}\);/);
 assert.match(executor,/return reviewDirectionBeforeClick\(\{signal:queued,context:current,now\}\)\.ok;/);
});
