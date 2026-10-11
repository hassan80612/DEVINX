import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {forwardHorizonMatrix,FORWARD_HORIZONS} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {progressHorizonAudit} from '../sentinel-trading-lab/agent/src/core/forward-horizon-audit.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const now=1800000000000;
const asset='EUR/USD OTC';
const quoteHistory=Array.from({length:460},(_,i)=>({
  ts:now-(459-i)*1000,
  price:1.1+0.0000017*i+Math.sin(i/11)*0.00002+Math.sin(i/41)*0.00005
}));
const snap={quoteHistory,quoteTs:now,price:quoteHistory.at(-1).price,provider:'iq_option'};
const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');

test('each one of the 9 selectable engines calculates all real future expiration targets',()=>{
  assert.deepEqual(FORWARD_HORIZONS,[5,10,30,60,120,300]);
  for(const engine of SCENARIO_ENGINES){
    const settings={asset,engine:engine.id,orderDurationMs:30000};
    const chosen=singleEngineForecast({settings,snap,now});
    const matrix=forwardHorizonMatrix({settings,snap,now,primary:chosen});
    assert.deepEqual(matrix.rows.map(r=>r.horizonSeconds),FORWARD_HORIZONS,engine.id);
    assert.equal(matrix.rows.length,6);
    for(const r of matrix.rows){
      if(r.side){
        assert.ok(['CALL','PUT'].includes(r.side),engine.id+' '+r.horizonSeconds);
        assert.ok(r.projectedPrice>0);
        assert.equal(r.targetAt,r.issuedAt+r.horizonSeconds*1000);
        assert.equal(r.actionable,false);
      }else assert.equal(r.projectedPrice,null);
    }
    const selected=matrix.rows.find(r=>r.horizonSeconds===30);
    assert.equal(selected.projectedPrice,chosen.receipt?.projectedPrice??null);
  }
});

test('selected expiration is an actual new independent calculation, not a relabeled 30s candle',()=>{
  const settings={asset,engine:'automatic',orderDurationMs:15000,forecastHorizonSeconds:60};
  const primary=singleEngineForecast({settings,snap,now});
  const matrix=forwardHorizonMatrix({settings,snap,now,primary});
  assert.ok(matrix.rows.some(x=>x.horizonSeconds===15));
  assert.equal(matrix.rows.find(x=>x.horizonSeconds===15).targetAt,now+15000);
  const far=matrix.rows.find(x=>x.horizonSeconds===300);
  assert.equal(far.targetAt,now+300000);
  const direct=singleEngineForecast({settings:{...settings,orderDurationMs:300000},snap,now});
  assert.equal(far.projectedPrice,direct.receipt?.projectedPrice??null);
  const previous=forwardHorizonMatrix({settings,snap,now,primary,previous:matrix});
  assert.equal(previous.reused,true,'the same quote should not burn CPU rebuilding 7 forecasts');
  const later={...snap,quoteTs:now+1000,price:snap.price+0.00001,
    quoteHistory:[...quoteHistory,{ts:now+1000,price:snap.price+0.00001}]};
  const newer=forwardHorizonMatrix({settings,snap:later,now:now+1000,
    primary:singleEngineForecast({settings,snap:later,now:now+1000}),previous:matrix});
  assert.equal(newer.reused,false,'a new quote must recalculate every expiry immediately');
});

test('historical-only multi-horizon research never uses a quote from the future',()=>{
  const settings={asset,engine:'price_action',orderDurationMs:10000};
  const a=forwardHorizonMatrix({settings,snap,now});
  const injected={...snap,quoteHistory:[...quoteHistory,{ts:now+10000,price:400}]};
  const b=forwardHorizonMatrix({settings,snap:injected,now});
  assert.deepEqual(a.rows.map(x=>[x.horizonSeconds,x.side,x.projectedPrice]),
    b.rows.map(x=>[x.horizonSeconds,x.side,x.projectedPrice]));
});

test('runtime sends future horizon forecasts but its chosen expiry alone anchors the countdown; no trade actions',()=>{
  const runtime=new DemoTradingRuntime({enableVNext:true});
  runtime.patchSettings({asset,engine:'mean_reversion',orderDurationMs:10000,forecastHorizonSeconds:60});
  const g=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
  assert.equal(g.allowed,false);
  assert.equal(g.analysis.vnext.receipt?.targetAt,now+10000);
  assert.equal(g.analysis.vnext.targetAnchor.targetAt,now+10000);
  assert.ok(g.analysis.vnext.horizonForecasts.find(x=>x.horizonSeconds===120));
  assert.equal(g.analysis.strategyConfluence,null);
  const frame=analystSnapshot({state:'running',lastEvalMs:now,agentVersion:'13.4.66',
    settings:runtime.settings,lastResult:{asset,analysis:g.analysis}},
    {symbol:asset,validatedSymbol:asset,quote:snap.price,
      lastQuoteAt:now,assetValidated:true,analysisFeedValidated:true});
  assert.deepEqual(frame.lastResult.analysis.vnext.hf.map(x=>x[0]),[5,10,30,60,120,300]);
  const fitted=fitAnalystFrame(frame);
  assert.ok(fitted,'mobile must not lose a prediction because the packet was oversized');
  assert.ok(Buffer.byteLength(JSON.stringify(fitted))+73<=3000);
  assert.equal(fitted.lastResult.analysis.vnext.hf.length,6);
});

test('PC and both mobile cards show one chosen expiry, prediction countdown and fixed-sized forecast matrix',async()=>{
  const [pc,mobile,model,css]=await Promise.all([
    read('agent/worker/local-playwright-driver.mjs'),
    read('src/components/LiveScenarioCard.tsx'),
    read('src/lib/live-card-model.ts'),read('src/app/globals.css')
  ]);
  assert.match(pc,/data-sentinel-vnext-horizon-matrix/);
  assert.match(pc,/d\.vnext\?\.horizonForecasts/);
  assert.match(pc,/ATÉ A PREVISÃO/);
  assert.match(pc,/PREVISÃO FIXA/);
  assert.match(mobile,/ATÉ O ALVO PREVISTO/);
  assert.match(mobile,/HORÁRIO PREVISTO/);
  assert.match(mobile,/data-testid="future-horizon-matrix"/);
  assert.equal((mobile.match(/\{forecastHorizonStrip\}/g)||[]).length,2);
  assert.equal((mobile.match(/\{forecastReceipt\}/g)||[]).length,2);
  assert.match(model,/vnextHorizons/);
  assert.match(css,/\.liveScenario \.vnextForwardHorizons\{[\s\S]*?height:160px;min-height:160px;max-height:160px/);
});

test('future horizon outcomes are checked only against a quote at the ORIGINAL deadline',()=>{
 const first=progressHorizonAudit({engineId:'automatic',asset,now,newQuote:true,
  forecastRows:[{horizonSeconds:5,side:'CALL',issuedAt:now,targetAt:now+5000,
    referencePrice:1.1,projectedPrice:1.1003}],
  quoteHistory});
 assert.equal(first.summaries.length,0);
 assert.equal(first.pending.length,1);
 const notYet=progressHorizonAudit({previous:first,engineId:'automatic',asset,
  now:now+3000,newQuote:false,quoteHistory});
 assert.equal(notYet.pending.length,1);
 assert.equal(notYet.summaries.length,0);
 const completed=progressHorizonAudit({previous:notYet,engineId:'automatic',asset,
  now:now+5000,newQuote:false,
  quoteHistory:[...quoteHistory,{ts:now+5000,price:1.1001}]});
 assert.deepEqual(completed.summaries,[{horizonSeconds:5,verified:1,correct:1,draws:0}]);
 const noFuture=progressHorizonAudit({engineId:'automatic',asset,now,newQuote:true,
  forecastRows:[{horizonSeconds:5,side:'CALL',issuedAt:now,targetAt:now+5000,
    referencePrice:1.1,projectedPrice:1.1003}],quoteHistory});
 const tooLate=progressHorizonAudit({previous:noFuture,engineId:'automatic',asset,
  now:now+8000,newQuote:false,quoteHistory:[...quoteHistory,{ts:now+8000,price:1.2000}]});
 assert.equal(tooLate.summaries.length,0,
   'a quote 3s after deadline must never masquerade as the actual future outcome');
});
