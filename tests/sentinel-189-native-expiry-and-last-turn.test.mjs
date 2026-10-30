import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewObservedLastSecondTurn,reviewDirectionBeforeClick} from '../sentinel-trading-lab/agent/worker/entry-direction-before-click.mjs';
const T=1800000000000;
function context({mirror=false,turn=true}={}){
 const xs=[100,100.01,100.022,100.034,100.045,100.057,100.068,100.078,100.09,100.101,turn?100.090:100.111,turn?100.071:100.120];
 const rows=xs.map((x,i)=>({ts:T-(xs.length-i-1)*500,price:mirror?200-x:x}));
 return{quoteHistory:rows,quoteAt:T,quote:rows.at(-1).price};
}
test('an automatic CALL after two opposing ticks at a recent high is skipped BEFORE click',()=>{
 const c=context();
 const signal={side:'CALL',durationMs:60000,observedEntryFamily:'continuation'};
 assert.equal(reviewObservedLastSecondTurn({signal,context:c,now:T}).ok,false);
 assert.equal(reviewDirectionBeforeClick({signal,context:c,now:T}).ok,false);
});
test('PUT at a recent low gets symmetric treatment for both 30s and 1m',()=>{
 for(const durationMs of [30000,60000]){
  const c=context({mirror:true}),signal={side:'PUT',durationMs,observedEntryFamily:'continuation'};
  assert.equal(reviewObservedLastSecondTurn({signal,context:c,now:T}).ok,false);
 }
});
test('a mislabeled old signal cannot bypass the last-second opposite turn',()=>{
 const signal={side:'CALL',durationMs:60000,observedEntryFamily:'reversal'};
 assert.equal(reviewDirectionBeforeClick({signal,context:context(),now:T}).ok,false);
});
test('strong unchanged trend, actual rising reversal, five-minute, fixed CALL or missing quotes remain unchanged',()=>{
 const strong=context({turn:false});
 const signal={side:'CALL',durationMs:60000,observedEntryFamily:'continuation'};
 assert.equal(reviewObservedLastSecondTurn({signal,context:strong,now:T}).ok,true);
 assert.equal(reviewObservedLastSecondTurn({signal:{...signal,observedEntryFamily:'reversal'},context:strong,now:T}).ok,true);
 assert.equal(reviewObservedLastSecondTurn({signal:{...signal,durationMs:300000},context:context(),now:T}).ok,true);
 assert.equal(reviewObservedLastSecondTurn({signal:{...signal,independent:true},context:context(),now:T}).ok,true);
 assert.equal(reviewObservedLastSecondTurn({signal,context:{quote:100,quoteAt:T,quoteHistory:[]},now:T}).ok,true);
});
test('the automatic runtime NEVER rewrites broker expiry while evaluating or reconnecting',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const loop=worker.slice(worker.indexOf('let busy=false;async function loop()'),worker.indexOf('  // Live broker quote events and the dedicated 220ms signed-feed timer'));
 assert.ok(!loop.includes('setNativeExpiryPreference'), 'loop must not restore a stale analyst expiry');
 assert.match(worker,/key==='duration'[\\s\\S]*?setNativeExpiryPreference\\?\\.\\(activeProvider,n,\\{preserveExisting:false\\}\\)/);
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/__sentinelRememberNativeExpiryChoice/);
});
