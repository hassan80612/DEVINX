import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const component=()=>readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
const style=()=>readFile(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');

test('Mobile full-size card never splits the old enormous SEM ENTRADA headline',async()=>{
 const s=await component(),css=await style();
 assert.doesNotMatch(s,/liveDirection\|\|'SEM ENTRADA'/);
 assert.match(s,/m\.scenarioInactive\?'ENCERRADO':'SEM ENTRADA AGORA'/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.liveScenario:not\(\.liveScenarioCompact\) \.liveDecision>strong/);
 assert.match(css,/white-space:nowrap;overflow:hidden/);
});
test('A closed forecast displays ENDED and not a counterfeit running timer',async()=>{
 const s=await component();
 assert.match(s,/m\.scenarioInactive\?'ENCERRADO':m\.remaining!==null\?m\.remaining\+'s':'—'/);
 assert.match(s,/PRAZO DO CENÁRIO/);
});
test('No fabricated signal price: show just current quote if Agent did not report an executed signal',async()=>{
 const s=await component();
 assert.match(s,/lastSignal\?<div className="mobilePriceComparison"/);
 assert.match(s,/data-testid="mobile-current-quote"/);
 assert.match(s,/Preço em tempo real/);
 assert.doesNotMatch(s,/Aguardando preço de uma entrada confirmada/);
});
test('Phone labels three-totals as information, not a second CALL or PUT instruction',async()=>{
 const s=await component(),css=await style();
 assert.match(s,/LEITURAS TÉCNICAS · NÃO SÃO ORDEM DE ENTRADA/);
 assert.match(s,/VIÉS DE ALTA/);
 assert.match(s,/VIÉS DE BAIXA/);
 assert.match(css,/\.liveAverageDirection\{display:none\}/);
 assert.match(css,/\.liveAverageMobile\{/);
});
test('Compact scenario clock remains within card at narrow phone width',async()=>{
 const css=await style();
 assert.match(css,/\.liveScenarioCompact \.compactScenario \.liveScenarioCountdown\{/);
 assert.match(css,/flex-wrap:nowrap!important;overflow:visible/);
 assert.match(css,/\.liveScenarioCompact \.compactScenario \.liveScenarioCountdown strong\{/);
 assert.match(css,/text-align:center;white-space:nowrap/);
});
