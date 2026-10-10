import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
const t=1_800_000_000_000;
function state(quoteAge=0){
 const last=t-quoteAge*1000;
 return {state:'running',runtimeKind:'remote-agent',remote:{online:true},
  settings:{asset:'EUR/USD OTC',forecastHorizonSeconds:60,orderDurationMs:30000},
  liveBroker:{symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:last,quote:1.231},
  feed:{quoteTs:last,price:1.231},lastEvalMs:t-1000,
  lastResult:{asset:'EUR/USD OTC',analysis:{operationalSignal:{
    asset:'EUR/USD OTC',forecastHorizonSeconds:60,durationMs:30000,
    scenario:{side:'CALL',status:'OPEN',createdAt:t-1500,deadline:t+52000,confidence:74},
    side:'CALL',state:'ENTRADA',ready:true,actionable:true,activeUntil:t+5000,
    entryAnalyst:{independent:true,qualification:{allowed:true},signal:{side:'CALL',state:'ENTRADA',ready:true,actionable:true,activeUntil:t+5000}}
  }}}};
}
test('scenario CALL remains visually readable at 3s, 6s and 20s quote gaps with no actionable trade',()=>{
 for(const age of [3,6,20]){
   const m=liveCardModel(state(age),t);
   assert.equal(m.fresh,false);assert.equal(m.entrySide,null);
   assert.equal(m.side,null,'historical view must NOT masquerade as a current engine direction');
   assert.equal(m.displayScenarioSide,'CALL');
   assert.equal(m.displayScenarioState,'AGUARDANDO COTAÇÃO');
   assert.equal(m.displayScenarioStale,true);
   assert.equal(m.displayScenarioRemaining,52);
 }
});
test('fresh quote restores visible live scenario without false restart and keeps operational authority',()=>{
 const m=liveCardModel(state(1),t);
 assert.equal(m.displayScenarioSide,'CALL');assert.equal(m.displayScenarioStale,false);
 assert.equal(m.fresh,true);
});
test('scenario never survives deadline, asset switch, paused Agent or explicit invalidation',()=>{
 const fixture=state(6);
 fixture.lastResult.analysis.operationalSignal.scenario.deadline=t-1;
 assert.equal(liveCardModel(fixture,t).displayScenarioSide,null);
 fixture.lastResult.analysis.operationalSignal.scenario.deadline=t+52000;
 fixture.lastResult.asset='GBP/USD OTC';
 assert.equal(liveCardModel(fixture,t).displayScenarioSide,null);
 fixture.lastResult.asset='EUR/USD OTC';
 fixture.state='paused';
 assert.equal(liveCardModel(fixture,t).displayScenarioSide,null);
 fixture.state='running';
 fixture.lastResult.analysis.operationalSignal.scenario.closed=true;
 assert.equal(liveCardModel(fixture,t).displayScenarioSide,null);
});
test('mobile only holds an informational scenario while quotation is old',async()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const src=await readFile(new URL('src/components/LiveScenarioCard.tsx',base),'utf8');
 assert.match(src,/mobileScenarioDirection=!m.scenarioInactive&&m.displayScenarioSide/);
 assert.match(src,/ANALISANDO · AGUARDE CONFIRMAÇÃO/);
 assert.match(src,/COTAÇÃO ATRASADA · SEM ENTRADA/);
 assert.match(src,/displayScenarioStale/);
 assert.match(src,/m.entrySide\?'Entrada válida por '/);
});
test('remote cloud error cannot wipe known working scenario or disconnect signed live channel',async()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const src=await readFile(new URL('src/app/console/page.tsx',base),'utf8');
 assert.match(src,/const lastCloudPollAge=Date.now\(\)-remotePolledAt.current/);
 assert.match(src,/lastCloudPollAge<\(streaming\?45000:8000\)/);
 assert.match(src,/prevQuote>cloudQuote/);
 assert.match(src,/A single failed\/slow cloud refresh must NOT unmount the analyst/);
 assert.doesNotMatch(src,/catch\(e:any\)\{\s*setS\(null\);setSource\('remote'\)/);
 assert.match(src,/if\(compactAnalyst\|\|tab==='Market Analysis'\)return null/);
});
test('broker scenario does not paint a confirmed PUT inside the CALL green panel',async()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const src=await readFile(new URL('agent/worker/local-playwright-driver.mjs',base),'utf8');
 assert.match(src,/entryPanelBg=confirmedEntrySide==='CALL'/);
 assert.match(src,/confirmedEntrySide==='PUT'/);
 assert.match(src,/background:\$\{entryPanelBg\}/);
 assert.match(src,/border-left:4px solid \$\{entryPanelBorder\}/);
});
