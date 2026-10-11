import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const baseState={
  state:'running',killSwitch:false,masterFrozen:false,lastEvalMs:1800000000000,
  settings:{
    engine:'mean_reversion',orderDurationMs:180000,pairResearchEnabled:true,
    pairResearchId:'reversal',strategyAdvisorEnabled:true,
    strategyAdvisorMode:'automatic_advisory',futureResearchEnabled:true,
    entryTimeMode:'fixed',entryLeadSeconds:30,holdingSeconds:180
  },
  lastResult:{asset:'EUR/USD OTC',analysis:{
    vnext:{engineId:'mean_reversion',expirySeconds:180,
      receipt:{engineId:'mean_reversion',asset:'EUR/USD OTC',side:'CALL',
        projectedPrice:1.1,referencePrice:1.099,issuedAt:1800000000000,
        targetAt:1800000180000,expirySeconds:180},
      futureEntryAnchor:{delaySeconds:180,side:'CALL',projectedEntryPrice:1.101,
        projectedExitPrice:1.102,issuedAt:1800000000000,holdingSeconds:180},
      futureEntryRows:[{delaySeconds:180,side:'CALL',projectedEntryPrice:1.101,
        projectedExitPrice:1.102,issuedAt:1800000000000,holdingSeconds:180}],
      strategyAdvisor:{marketPhaseLabel:'Tendência persistente',selectedInterpretation:'cautela neste cenário',
        recommended:{name:'Trend Following'},chartContext:'Micromovimentos 1–15s + estrutura 3–15min'},
      generalFutureResearch:{horizonSeconds:180,confirmedSide:'CALL',status:'research-confirmed',
        possibleExtremes:{peak:{windowSeconds:[60,120]},trough:{windowSeconds:[10,80]}},
        projectedPath:Array.from({length:50},(_,i)=>({secondsFromNow:i,projectedPrice:1.1+i*.000001}))},
      combinedResearch:{pairId:'reversal',status:'research-candidate',
        selected:{side:'CALL',entryAt:1800000030000,exitAt:1800000210000},
        event:'CREATED',futurePath:Array.from({length:80},(_,i)=>({s:i}))},
      cards:[{id:'market',side:'CALL',callPct:55,putPct:45}],
      horizonForecasts:[{horizonSeconds:180,side:'CALL',projectedPrice:1.1,issuedAt:1800000000000}]
    },operationalSignal:{side:'WAIT',actionable:false},generalConsensus:{}
  }}
};
const broker={symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',
  assetValidated:true,analysisFeedValidated:true,lastQuoteAt:1800000000000,quote:1.1};
test('signed mobile snapshot carries all 3 pairs, selected horizon research and advisories, without raw price trajectories',()=>{
 const frame=analystSnapshot(baseState,broker);
 const v=frame.lastResult.analysis.vnext;
 assert.deepEqual(v.sa,['Tendência persistente','cautela neste cenário',
  'Trend Following','Micromovimentos 1–15s + estrutura 3–15min']);
 assert.deepEqual(v.fp,[180,'CALL','research-confirmed',[60,120],[10,80]]);
 assert.deepEqual(v.tp,['reversal','research-candidate','CALL',
  1800000030000,1800000210000,'CREATED']);
 assert.equal(frame.settings.pairResearchEnabled,true);
 assert.equal(frame.settings.holdingSeconds,180);
 assert.equal(frame.settings.futureResearchEnabled,true);
 assert.equal(v.projectedPath,undefined);
 assert.equal(v.combo,undefined);
 assert.equal(JSON.stringify(v).includes('futurePath'),false);
 const bounded=fitAnalystFrame(frame,2920);
 assert.ok(bounded,'No mobile quote/forecast should be dropped on size limit');
 assert.ok(Buffer.byteLength(JSON.stringify(bounded),'utf8')<=2920);
 assert.equal(bounded.liveBroker.quote,1.1);
 assert.equal(bounded.lastResult.analysis.vnext.tp?.[0],'reversal');
 assert.equal(bounded.lastResult.analysis.vnext.fp?.[1],'CALL');
});
test('mobile research summary is conditional, signed, and never gives trading authority',()=>{
 const signed=analystSnapshot({...baseState,lastResult:{
  asset:'EUR/USD OTC',analysis:{vnext:{engineId:'automatic',
    strategyAdvisor:null,generalFutureResearch:null,combinedResearch:null},
   operationalSignal:{actionable:false}}}},broker);
 assert.equal(signed.lastResult.analysis.vnext.sa,undefined);
 assert.equal(signed.lastResult.analysis.vnext.fp,undefined);
 assert.equal(signed.lastResult.analysis.vnext.tp,undefined);
 const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/MobileExperimentalControls.tsx',import.meta.url),'utf8');
 const card=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 for(const tag of ['mobile-experimental-research','mobile-future-path-summary',
  'mobile-pair-research','mobile-strategy-pair-controls'])assert.ok(mobile.includes(tag));
 assert.ok(card.includes('<MobileExperimentalControls s={s} busy={busy} act={act}/>'));
 assert.ok(card.includes('Estratégia ativa'));
 assert.ok(!card.includes('Motor responsável pelo cenário'));
 assert.ok(!card.includes('TOTAIS DO MERCADO · SEM MOTOR'));
 for(const id of ['reversal','levels_breakout','retest'])assert.ok(mobile.includes(id));
 assert.ok(page.includes('watchSignedLiveAnalyst(topic,key,payload'));
 assert.ok(mobile.includes("act('settings',values)"));
 assert.ok(!mobile.includes("control/start"));
 assert.ok(!mobile.includes("control/put"));
 assert.ok(!mobile.includes("control/call"));
});
