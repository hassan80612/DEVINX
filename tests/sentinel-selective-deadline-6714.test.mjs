import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {selectiveEvidence,qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
const now=1800000000000;
const q=Array.from({length:80},(_,i)=>({
 ts:now-(79-i)*4000,
 price:1.02+0.0000006*i+0.000002*Math.sin(i/9)
}));
test('mobile card has no indefinitely stuck expired-plan wording and uses original target timestamp',()=>{
 const card=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.doesNotMatch(card,/PREVISÃO ENCERRADA · AGUARDANDO NOVA/);
 assert.match(card,/const expired=pinned&&now-plannedAt>=400/);
 assert.match(card,/countdownSeconds=pinned&&!expired\?Math\.max\(0,Math\.ceil\(\(plannedAt-now\)\/1000\)\):null/);
 assert.match(card,/expired\?'SEM PREVISÃO DE ENTRADA'/);
});
test('same-quote cache cannot freeze an expired selected entry with a fresh broker quote',()=>{
 const snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'test'};
 const settings={engine:'automatic',forecastMode:'continuous',asset:'TEST',orderDurationMs:30000};
 const base=forwardHorizonMatrix({settings,snap,now,forecastModel:'original-67'});
 assert.equal(base.reused,false);
 const reused=forwardHorizonMatrix({settings,snap,now,previous:base,forecastModel:'original-67'});
 assert.equal(reused.reused,true);
 const expired={...base,entryRows:[...base.entryRows.filter(r=>r.delaySeconds!==30),
   {engineId:'automatic',asset:'TEST',delaySeconds:30,holdingSeconds:30,
   side:'CALL',issuedAt:now-31000,entryAt:now-1000,exitAt:now+29000,
   projectedEntryPrice:1,projectedExitPrice:1.01}]};
 const refreshed=forwardHorizonMatrix({settings,snap,now,previous:expired,forecastModel:'original-67'});
 assert.equal(refreshed.reused,false);
 assert.ok(refreshed.entryRows.some(r=>r.delaySeconds===30&&r.entryAt!==now-1000));
});
test('historical three-bar evidence survives ordinary quote gaps, but current prices remain mandatory',()=>{
 const history=selectiveEvidence({quoteHistory:q,asOf:now+4000});
 assert.ok(history.historySeconds>300,'4s quote history must not reset');
 assert.equal(history.earlyReady,true,'past candle evidence must survive a late latest quote');
 const stale=qualifyStrategyInterval({forecast:{
  side:'CALL',holdingSeconds:30,projectedEntryPrice:1,
  projectedExitPrice:1.01},evidence:history,asOf:now+4000});
 assert.equal(stale.side,null);
 assert.equal(stale.qualification.status,'waiting-quote');
});
test('all selective 67.13 layout removals remain intact',()=>{
 const card=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(card,/forecastMode!=='selective'&&<details className="vnextForecastDetails"/);
 assert.match(card,/forecastHorizonStrip=vnext&&forecastMode!=='selective'\?<details/);
 assert.match(card,/Aguardando confirmação/);
});
