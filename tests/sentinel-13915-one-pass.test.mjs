import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const T=1800000000000;
const quotes=Array.from({length:142},(_,i)=>({
  ts:T-(141-i)*1000,receivedAt:T-(141-i)*1000,
  price:1.1+(i+1)*.000005+Math.sin(i*.31)*.0000002
}));
const settings={engine:'automatic',asset:'EUR/USD',orderDurationMs:30000,forecastMode:'continuous'};
function check(now){
  const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  const snap={provider:'iq_option',quoteHistory:quotes,quoteTs:T,
    price:quotes.at(-1).price,brokerExpirationDurationMs:null,brokerExpirationConfidence:0};
  return runtime._signalValidationGate({analysis:{asset:'EUR/USD'},snap,settings,now}).analysis;
}
test('no late CALL from an otherwise valid old quote, but the immediate fresh quote fires',()=>{
  const immediate=check(T+100);
  assert.equal(immediate.vnext.futureEntryAnchor.side,'CALL');
  const delayed=check(T+1900);
  assert.equal(delayed.vnext.futureEntryAnchor,null);
  assert.equal(delayed.vnext.nowObservation.reason,'late-quote-no-entry');
  assert.equal(delayed.vnext.opportunityWindow.phase,'scanning');
});
test('PC and mobile show only ANALISANDO while reading provisional quote direction',()=>{
  for(const path of ['sentinel-trading-lab/src/components/LiveScenarioCard.tsx',
   'sentinel-trading-lab/agent/worker/local-playwright-driver.mjs']){
    const source=readFileSync(path,'utf8');
    assert.doesNotMatch(source,/ANALISANDO POSSÍVEL (CALL|PUT)/);
    assert.match(source,/const scanningLabel='ANALISANDO'/);
  }
});
test('retired Vercel hostname only redirects to trusted canonical trading domain',()=>{
  const source=readFileSync('sentinel-trading-lab/src/middleware.ts','utf8');
  assert.match(source,/host==='sentinel-trading-lab\.vercel\.app'/);
  assert.match(source,/target\.host='trading\.devinx\.com\.br'/);
  assert.match(source,/NextResponse\.redirect\(target,308\)/);
});
test('broker quote verified NOW engine feeds the visible card and quote queue does not wait 200ms',()=>{
  const source=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
  assert.match(source,/view\.liveBroker\.quoteFeedValidated!==true/);
  const queue=readFileSync('sentinel-trading-lab/agent/worker/latest-quote-scheduler.mjs','utf8');
  assert.match(queue,/intervalMs=80/);
});
