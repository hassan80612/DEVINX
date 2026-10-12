import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const base=1800000000000, asset='EUR/USD OTC';
const quotes=Array.from({length:2400},(_,i)=>({
 ts:base-(2399-i)*1000,
 price:1.1+.0002*Math.sin(i/19)+.00008*Math.sin(i/47)+i*.00000003
}));
const snapshot={quoteHistory:quotes,quoteTs:base,price:quotes.at(-1).price,provider:'iq_option'};
function engine(){const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'selected-strengths-67.5'});
 r.patchSettings({asset,engine:'automatic',forecastMode:'continuous',orderDurationMs:30000});return r;}
function evalAt(runtime,snap,now){
 return runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now})
  .analysis.vnext.futureEntryAnchor;
}
test('new PC and phone count the SAME immutable target before expiry, and expired stale result is cleared by Agent',()=>{
 const runtime=engine(),first=evalAt(runtime,snapshot,base);
 if(first){assert.ok(first.entryAt>base&&first.entryAt<=base+30000);assert.equal(first.exitAt,first.entryAt+30000);}
 const updated={ts:base+1000,price:snapshot.price+0.000003};
 const before=evalAt(runtime,{...snapshot,quoteTs:updated.ts,price:updated.price,
   quoteHistory:[...quotes.slice(1),updated]},base+1000);
 if(first&&before&&before.side===first.side)assert.equal(before.entryAt,first.entryAt,'same-direction candidate keeps its original calculated moment');
 const expired=evalAt(runtime,snapshot,base+30050);
 assert.equal(expired,null,'expired cached side cannot be recycled into the next countdown');
 const frame=analystSnapshot({state:'running',settings:runtime.settings,
   lastEvalMs:base+30050,lastResult:{asset,analysis:{vnext:{engineId:'automatic',
     futureEntryAnchor:expired}}}},{symbol:asset,validatedSymbol:asset,quote:snapshot.price,
     lastQuoteAt:base,assetValidated:true,analysisFeedValidated:true});
 assert.equal(frame.lastResult.analysis.vnext.ea,null,'mobile must get expired receipt removal');
});
test('a new, fresh calculated forecast must use its own future timestamp',()=>{
 const runtime=engine();evalAt(runtime,snapshot,base);
 const next=base+31000;
 const newQuotes=Array.from({length:31},(_,i)=>({ts:base+1000+i*1000,
   price:snapshot.price+0.000003*(i+1)}));
 const q=[...quotes,...newQuotes];
 const second=evalAt(runtime,{...snapshot,quoteTs:next,price:newQuotes.at(-1).price,
   quoteHistory:q},next);
 if(second){
   assert.ok(['CALL','PUT'].includes(second.side));
   assert.ok(second.issuedAt>base);
   assert.ok(second.entryAt>next,'new count must not begin on past deadline');
 }
});
test('PC overlay immediately receives changed Agent entry, even with an open selector',()=>{
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 const overlay=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(pc,/runtime.lastResult\?\.analysis\?\.vnext\?\.futureEntryAnchor\?\.entryAt/);
 assert.match(pc,/a.vnext\?\.futureEntryAnchor\?\.entryAt/);
 assert.doesNotMatch(overlay,/if\(el.dataset.selectLock==='1'\|\|\(focused/);
 assert.match(overlay,/current===focused\|\|el.dataset.selectLock==='1'/);
 assert.match(overlay,/const entryPlanActive=entryPlanReady&&windowRunning/);
 assert.match(overlay,/if\(!active&&decision\)/);assert.match(overlay,/phase==='cancelled'\?'JANELA SEM ENTRADA'/);
 assert.doesNotMatch(overlay,/HORÁRIO PREVISTO ATINGIDO/);
});
test('phone uses natural local time from the exact original entry, never a 400ms grace or a fabricated restart',()=>{
 const phone=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(phone,/const running=windowStartedAt>0&&windowEndsAt>windowStartedAt&&now<windowEndsAt/);
 assert.match(phone,/Math\.ceil\(\(windowEndsAt-now\)\/1000\)/);
 assert.doesNotMatch(phone,/PREVISÃO ENCERRADA · AGUARDANDO NOVA/);
 assert.doesNotMatch(phone,/HORÁRIO PREVISTO ATINGIDO/);
 assert.doesNotMatch(phone,/now-plannedAt>=400/);
});
