import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectiveEvidence,qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
const now=1800000000000;const price=()=>1;
const forecast={engineId:'support_resistance',side:'CALL',holdingSeconds:30,delaySeconds:30,
 projectedEntryPrice:1,projectedExitPrice:1.01,issuedAt:now,entryAt:now+30000,exitAt:now+60000};
function feed(step=4000,start=-160000,fn=t=>1+(t+160000)*.0000006){
 const out=[];for(let t=start;t<=0;t+=step)out.push({ts:now+t,price:fn(t)});
 if(out.at(-1).ts!==now)out.push({ts:now,price:fn(0)});
 return out;
}
test('actual sparse 4s quotes qualify three CLOSED bars without pretending 13min continuous',()=>{
 const q=feed();
 const e=selectiveEvidence({quoteHistory:q,asOf:now});
 assert.equal(e.earlyReady,true);
 assert.equal(e.earlyDirection,'CALL');
 assert.ok(e.historySeconds>=160,'real 4s history remains continuous with the 8s tolerance');
 const result=qualifyStrategyInterval({forecast,quoteHistory:q,asOf:now});
 assert.equal(result.side,'CALL');
 assert.equal(result.qualification.evidence,'three-completed-bars');
});
test('sparse observation never bypasses current quote freshness or disagreement',()=>{
 const q=feed(),stale=qualifyStrategyInterval({forecast,quoteHistory:q,asOf:now+4000});
 assert.equal(stale.side,null);assert.equal(stale.qualification.status,'waiting-quote');
 const contrary=qualifyStrategyInterval({forecast:{...forecast,side:'PUT'},quoteHistory:q,asOf:now});
 assert.equal(contrary.side,null);
 const missing=q.filter(x=>x.ts<=now-61000||x.ts>=now-29000);
 assert.equal(selectiveEvidence({quoteHistory:missing,asOf:now}).earlyReady,false);
});
test('six optional horizons never recalculate heavy historical evidence for all horizons',()=>{
 const src=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 assert.match(src,/const chosen=Number\(settings.orderDurationMs\|\|60000\)\/1000/);
 assert.match(src,/autonomousSelectiveEntry/);
 const selective=fs.readFileSync('sentinel-trading-lab/agent/src/core/selective-forward-model.mjs','utf8');
 assert.doesNotMatch(selective,/requiredSeconds=Math.max\(720/);
 assert.match(selective,/ctx.quoteAge>=0&&ctx.quoteAge<=2500/);
});
test('frontend clears the reached forecast and blocks stale remote settings snapshots',()=>{
 const card=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const page=fs.readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 assert.match(card,/const running=windowStartedAt>0&&windowEndsAt>windowStartedAt&&now<windowEndsAt/);
 assert.doesNotMatch(card,/PREVISÃO ENCERRADA · AGUARDANDO NOVA/);
 assert.match(card,/entryPlanDisplayable=entryPlanValid&&\(plannedAt>now\|\|entryMoment\)/);
 assert.match(card,/Aguardando cotação atual/);
 assert.match(page,/const pendingSettingsRef=useRef/);
 assert.match(page,/settings:reconcileSettings\(/);
 assert.match(page,/return reconcileStatus\(data\)/);
 assert.match(page,/setS\(reconcileStatus\(normalizeStatus\(data\)\)\)/);
});
test('predictors remain exactly the same source; only gate, delivery and UI changed',()=>{
 const release=JSON.parse(fs.readFileSync('sentinel-trading-lab/agent/release.json','utf8'));
 assert.equal(release.runtime.forecastModel,'selected-strengths-67.5');
 const f=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 assert.match(f,/autonomousSelectiveEntry/);
 assert.match(f,/singleEngineForecast\(\{settings:\{/);
});
