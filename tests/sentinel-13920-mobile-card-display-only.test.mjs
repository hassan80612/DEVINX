import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';

const css=await readFile(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');
const card=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');

test('Seven content sections flow without overlaying the authoritative countdown',()=>{
 assert.match(css,/\.liveScenario \.vnextFutureReceipt\{\s*display:flex;flex-direction:column/);
 assert.doesNotMatch(css,/grid-template-rows:20px 27px 74px 49px 27px 24px/);
 assert.match(css,/\.liveScenario \.vnextTargetCountdown\{height:auto;min-height:80px;max-height:none/);
 assert.match(css,/\.liveScenario \.vnextProjectionValues\{height:auto;min-height:56px;max-height:none/);
 assert.match(css,/\.liveScenario \.vnextProjectionBias\{height:auto;min-height:31px;max-height:none/);
 assert.match(card,/MobileFutureEntryClock/);
 assert.match(card,/vnextProjectionValues/);
});
test('Phone NOW labels translate only at presentation; timers and state remain unchanged',()=>{
 const expected={
  'ANÁLISE EM TEMPO REAL':'REAL-TIME ANALYSIS',
  'ATÉ O VENCIMENTO':'UNTIL EXPIRY',
  'OPERAÇÃO EM ANDAMENTO · ↑ CALL':'OPERATION IN PROGRESS · ↑ CALL',
  'OPERAÇÃO EM ANDAMENTO · ↓ PUT':'OPERATION IN PROGRESS · ↓ PUT',
  'PREÇO NA ENTRADA':'ENTRY PRICE',
  'PREÇO AO VENCER · AGUARDANDO':'EXPIRY PRICE · WAITING',
  'Duração da operação':'Operation duration',
  'HORA DA CORRETORA':'BROKER TIME'
 };
 for(const [pt,en] of Object.entries(expected)){
  assert.equal(sentinelText('en',pt),en);
  assert.equal(sentinelText('pt',pt),pt);
 }
 assert.match(card,/pcAuthoritativeWindow\(/);
 assert.match(card,/pcClockNow\(/);
});
