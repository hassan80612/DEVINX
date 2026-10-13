import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {lightweightOverlayView} from '../sentinel-trading-lab/agent/worker/lightweight-overlay-view.mjs';

test('PC overlay mirrors the same source prediction without any full status/broker query',()=>{
 let requested=0;
 const market={
  symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',
  marketStatus:'open',quote:1.13651,lastQuoteAt:1800000000000,quoteTs:1800000000000,
  analysisFeedValidated:true,assetValidated:true,brokerMode:'demo',executionReady:true
 };
 const settings={asset:'EUR/USD OTC',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000,
   mode:'demo',demoAutopilot:false};
 const lastResult={asset:'EUR/USD OTC',analysis:{vnext:{
   opportunityWindow:{phase:'fired',windowStartedAt:1800000000000,windowEndsAt:1800000030000},
   futureEntryAnchor:{side:'CALL',entryTriggeredAt:1800000015000}
 },quality:{entryReady:true}}};
 const runtime={settings,externalMarket:market,lastResult,
   lastEvalMs:1800000015000,nextEvalMs:1800000016000,stateName:'running',
   async status(){requested++;throw Error('Never fetch full broker status for a card frame')}};
 const v=lightweightOverlayView(runtime);
 assert.equal(requested,0);
 assert.strictEqual(v.lastResult,lastResult);
 assert.equal(v.liveBroker.symbol,market.symbol);
 assert.equal(v.liveBroker.quote,market.quote);
 assert.equal(v.liveBroker.lastQuoteAt,market.lastQuoteAt);
 assert.equal(v.feed.quoteTs,market.quoteTs);
 assert.equal(v.settings.engine,settings.engine);
 assert.equal(v.lastResult.analysis.vnext.futureEntryAnchor.entryTriggeredAt,1800000015000);
 assert.equal(v.autopilot.enabled,false);
});
test('No extra broker connection or analysis and keep REAL auto trading disarmed',()=>{
 const fake={stateName:'running',settings:{mode:'real',demoAutopilot:true},
   externalMarket:{brokerMode:'real',executionReady:true},lastResult:null,lastEvalMs:0};
 const v=lightweightOverlayView(fake);
 assert.equal(v.autopilot.eligible,false);
 assert.equal(v.settings.demoAutopilot,false);
 assert.equal(fake.settings.demoAutopilot,false);
 assert.equal(v.liveBroker.mode,'real');
});
test('only screen frame status becomes lightweight; full authenticated status stays unchanged',()=>{
 const index=fs.readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 assert.match(index,/const view=lightweightOverlayView\(runtime\)/);
 assert.match(index,/async function status\(\)\{/);
 assert.match(index,/const base=await runtime\.status\(\)/);
 const impl=fs.readFileSync('sentinel-trading-lab/agent/worker/lightweight-overlay-view.mjs','utf8');
 assert.doesNotMatch(impl,/await runtime\.status\(\)/);
 assert.doesNotMatch(impl,/getBalance\(/);
 assert.doesNotMatch(impl,/forecastResearch\.summary\(/);
});
