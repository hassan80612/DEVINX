import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';

const engine=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
const pc=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
const agent=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
test('first confirmed boundary turn can qualify without a mandatory third pivot',()=>{
 assert.doesNotMatch(engine,/if\(pivots\.length===2\)return /);
 assert.match(engine,/earlyRangeProof&&position/);
 assert.match(engine,/closed-range-extreme-reversal-confirmed/);
 assert.doesNotMatch(engine,/const leg=closes\.slice\(-5\)/);
 assert.doesNotMatch(engine,/legPath>=\.65/);
 assert.match(engine,/const shortExpirySwingGuard=Number\(holdingMs\)>=60000;/);
 assert.match(engine,/if\(shortExpirySwingGuard&&regular&&Number\(holdingMs\)\/1000>half\*1\.35\)/);
});
test('range mismatch is observational and does not insert a timed delay',()=>{
 const origin=Date.UTC(2026,9,1);
 const rows=Array.from({length:460},(_,i)=>({
   ts:origin+i*1000,receivedAt:origin+i*1000,
   price:1.1+.0007*Math.sin(2*Math.PI*i/48)+.000007*Math.sin(i*1.7)
 }));
 let seenGuard=false,thirdSeen=false;
 for(let i=180;i<rows.length;i++){
  const q=rows[i],input={quoteHistory:rows.slice(0,i+1),price:q.price,quoteAt:q.ts,now:q.ts,engineId:'automatic'};
  const a=analyzeNowOpportunity({...input,durationMs:60000});
  const b=analyzeNowOpportunity({...input,durationMs:30000});
  if(a.reason==='range-expiry-exceeds-observed-swing')seenGuard=true;
  if(a.reason==='range-awaiting-third-confirmed-turn'||b.reason==='range-awaiting-third-confirmed-turn')thirdSeen=true;
  assert.equal(Object.hasOwn(a,'waitUntil'),false);
  assert.equal(Object.hasOwn(a,'scheduleAt'),false);
 }
 assert.equal(seenGuard,true,'regular 48s range should not authorize a 60s expiration');
 // Third-turn evidence is guarded in the source, independent of when the
 // generated synthetic wave first has sufficient history.
 assert.doesNotMatch(engine,/if\(pivots\.length===2\)return /);
});
test('PC and mobile WIN/LOSS by countdown originate exclusively from broker executor session',()=>{
 assert.match(pc,/data-sentinel-executor-clock-wl/);
 const clockStart=pc.indexOf('data-sentinel-vnext-clock data-mode=');
 const clockEnd=pc.indexOf('data-sentinel-probability-30s',clockStart);
 const clock=pc.slice(clockStart,clockEnd);
 assert.ok(clockStart>=0&&clockEnd>clockStart,'PC countdown markup must exist');
 assert.ok(clock.includes('minmax(95px,.78fr) minmax(78px,.56fr) minmax(145px,1.16fr)'),'three clock columns must fit side-by-side');
 assert.ok(clock.indexOf('data-sentinel-vnext-clock-value')<clock.indexOf('data-sentinel-executor-clock-wl'));
 assert.ok(clock.indexOf('data-sentinel-executor-clock-wl')<clock.indexOf("MOMENTO DE ENTRADA"));
 assert.match(clock,/data-sentinel-executor-clock-wl style="display:flex;flex-direction:column/);
 assert.match(clock,/height:auto;min-height:74px/);
 assert.match(pc,/Number\(d\.autoExecutor\.sessionWins\|\|0\)/);
 assert.match(pc,/Number\(d\.autoExecutor\.sessionLosses\|\|0\)/);
 assert.match(mobile,/data-testid="mobile-countdown-executor-wl"/);
 assert.match(mobile,/s\.autoExecutor\.sessionWins/);
 assert.match(mobile,/s\.autoExecutor\.sessionLosses/);
 assert.match(agent,/autoExecutor:\{\.\.\.executor\.status\(\)/);
 const payload=packExecutor({enabled:true,config:{amount:1},sessionWins:7,sessionLosses:5});
 const decoded=unpackExecutor(payload);
 assert.equal(decoded.sessionWins,7);
 assert.equal(decoded.sessionLosses,5);
});
