import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('floating card follows active CALL/PUT scenarios independently of actual entry',async()=>{
 const c=await src('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 assert.match(c,/mobileScenarioDirection=!m\.scenarioInactive&&m\.side/);
 assert.match(c,/mobileDecisionText=mobileDirection\?mobileDirection\+' AGORA':mobileScenarioDirection\?'ACOMPANHANDO '/);
 assert.match(c,/mobileScenarioDirection\?'CENÁRIO EM ACOMPANHAMENTO'/);
 assert.match(c,/Cenário.*não é entrada/);
 assert.match(c,/scenarioClock/);
});
test('compact mode return is authenticated navigation to home, never logout or login',async()=>{
 const s=await src('sentinel-trading-lab/src/app/console/page.tsx');
 assert.match(s,/setTab\(next\?'Market Analysis':'Dashboard'\)/);
 assert.match(s,/url\.searchParams\.set\('tab','Dashboard'\)/);
 assert.match(s,/sentinelMobileIntroduction/);
 assert.match(s,/sentinelPcOnly/);
});
test('no fake recorded entry price and no pointless waiting text',async()=>{
 const s=await src('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 assert.match(s,/lastSignal\?<div className="mobilePriceComparison"/);
 assert.doesNotMatch(s,/Aguardando preço de uma entrada confirmada/);
 assert.match(s,/Preço em tempo real/);
});
test('compact cards expose the existing authenticated bot controls, no manual orders',async()=>{
 const s=await src('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 assert.match(s,/data-testid="compact-bot-controls"/);
 assert.match(s,/act\('control\/pause'\)/);
 assert.match(s,/act\('control\/stop'\)/);
 assert.match(s,/onClick=\{start\}/);
 assert.doesNotMatch(s,/Aplicar no PC/);
 assert.match(s,/>Aplicar<\/button>/);
});
test('market countdown and mobile card reserve stable heights',async()=>{
 const c=await src('sentinel-trading-lab/src/app/globals.css');
 assert.match(c,/\.marketWorkspace \.main\{max-width:1130px\}/);
 assert.match(c,/\.liveScenario:not\(\.liveScenarioCompact\) \.liveDecision \.liveScenarioCountdown/);
 assert.match(c,/height:55px;min-height:55px/);
 assert.match(c,/\.liveScenarioCompact \.mobileBotControls/);
});
test('marketing home remains premium and compact on phone and desktop',async()=>{
 const home=await src('sentinel-trading-lab/src/app/console/page.tsx');
 const css=await src('sentinel-trading-lab/src/app/globals.css');
 assert.match(home,/O mercado em movimento/);
 assert.match(home,/sentinelStartQuick/);
 assert.match(css,/\.sentinelStartHero h2\{font-size:clamp\(25px,3\.1vw,40px\)/);
 assert.match(css,/\.sentinelMobileOnly\{display:block\}/);
 assert.match(css,/\.sentinelPcOnly\{display:none!important\}/);
});
