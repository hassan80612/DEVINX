import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';

const now=Date.UTC(2026,9,10,12,0,44);
const scenario=(entryState,reason)=>({
  state:'running',runtimeKind:'remote-agent',remote:{online:true},
  settings:{asset:'EUR/USD',forecastHorizonSeconds:60,orderDurationMs:60000},
  liveBroker:{validatedSymbol:'EUR/USD',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:now,quote:1.12},
  feed:{quoteTs:now},lastEvalMs:now,
  lastResult:{asset:'EUR/USD',analysis:{
    generalConsensus:{rapid:{callPct:70},strategies:{callPct:65},displayCallPct:69},
    operationalSignal:{
      state:entryState,reason,asset:'EUR/USD',durationMs:60000,forecastHorizonSeconds:60,
      scenario:{side:'CALL',confidence:80,createdAt:now-16000,deadline:now+44000,status:'OPEN',closed:false},
      subanalyst:{mode:'reversal-alert',active:false,status:'OBSERVANDO'},
      entryAnalyst:{independent:false,signal:{state:entryState,reason}}
    }
  }}
});
test('a closed opportunity is not the scenario deadline: 44 seconds remain',()=>{
  const m=liveCardModel(scenario('OPORTUNIDADE CONSUMIDA','Esta oportunidade terminou; aguardando outro ponto estrutural confirmado.'),now);
  assert.equal(m.remaining,44);
  assert.equal(m.state,'JANELA ABERTA');
  assert.equal(m.side,'CALL');
  assert.equal(m.scenarioInactive,false);
  assert.equal(m.opportunityEnded,true);
  assert.equal(m.entrySide,null);
  assert.equal(m.average,68);
});
test('other expired entry states are informational, never signals or scenario closures',()=>{
  for(const state of ['OPORTUNIDADE PERDIDA','OPORTUNIDADE CANCELADA','AGUARDAR PONTO']){
    const m=liveCardModel(scenario(state,''),now);
    assert.equal(m.opportunityEnded,true,state);
    assert.equal(m.remaining,44,state);
  }
  const resumed=liveCardModel(scenario('OBSERVANDO ENTRADA','Aguardando gatilho estrutural.'),now);
  assert.equal(resumed.opportunityEnded,false);
  const stale=scenario('OPORTUNIDADE CONSUMIDA','Esta oportunidade terminou.');
  stale.liveBroker.lastQuoteAt=now-11000;
  assert.equal(liveCardModel(stale,now).opportunityEnded,false);
});
test('React card places same prominent amber notice on desktop and compact mobile',async()=>{
  const react=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');
  assert.equal(react.split('{opportunityNotice}').length-1,2);
  assert.equal(react.split('{scenarioClock}').length-1,2);
  assert.match(react,/Aguardando novo gatilho/);
  assert.match(react,/compact-three-totals-average/);
  assert.match(react,/mobile-price-comparison/);
  assert.match(react,/mobile-technical-readings/);
  assert.match(css,/liveOpportunityState/);
  assert.match(css,/liveScenarioCompact \.compactAverage/);
  assert.match(css,/liveScenarioCountdown/);
});
test('broker overlay differentiates entry expiration from scenario countdown',async()=>{
  const source=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.match(source,/data-sentinel-entry-ended/);
  assert.match(source,/opportunityNoticeHtml/);
  assert.match(source,/futureDecisionStatus=timingClosed\?'00:00 · ENCERRADO'/);
  assert.doesNotMatch(source,/const timingClosed=\[[^\]]*OPORTUNIDADE CONSUMIDA/);
  assert.match(source,/Aguardando novo ponto ou gatilho/);
});
