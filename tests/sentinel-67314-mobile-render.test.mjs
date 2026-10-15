import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';

// Render the actual React card, including its clock and model, with only
// locale context replaced. No mock of the projection visibility rules.
const url=new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url);
const require=createRequire(url),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const component=new Module(fileURLToPath(url));
component.require=name=>name==='./SentinelLocale'?{useSentinelLocale:()=>({t:s=>s,locale:'pt'})}:
 name==='../lib/live-card-model'?require('../lib/live-card-model.ts'):require(name);
component._compile(ts.transpileModule(readFileSync(url,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText,fileURLToPath(url));
const {LiveScenarioCard}=component.exports;
const start=1800000000000;
function state(){return {
 state:'running',runtimeKind:'remote-agent',remote:{online:true},
 settings:{engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:30000},
 liveBroker:{symbol:'EUR/USD OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:start+20000,quote:1.2345},
 lastEvalMs:start+20000,lastResult:{asset:'EUR/USD OTC',analysis:{vnext:{
  engineId:'automatic',expirySeconds:30,
  opportunityWindow:{phase:'open',windowStartedAt:start,windowEndsAt:start+30000,entryAt:start+10000},
  futureEntryAnchor:{side:'CALL',delaySeconds:30,holdingSeconds:30,
   issuedAt:start,entryAt:start+10000,exitAt:start+40000,
   projectedEntryPrice:1.23456,projectedExitPrice:1.23478}
 }}}
};}
function render(s,now){
 const original=Date.now;Date.now=()=>now;
 try{return renderToStaticMarkup(React.createElement(LiveScenarioCard,{
  s,busy:false,act:async()=>{},compact:true,onToggleCompact:()=>{}
 }));}finally{Date.now=original;}
}
test('phone retains PC projection after estimated entry time while its real window is open',()=>{
 const html=render(state(),start+20000);
 assert.match(html,/1\.23456/);assert.match(html,/1\.23478/);
 assert.match(html,/00:10/);assert.match(html,/CALL · JANELA ABERTA · AGUARDE/);
 assert.doesNotMatch(html,/ENTRADA AGORA/);
});
test('expired or different-asset window cannot keep an active price projection',()=>{
 assert.doesNotMatch(render(state(),start+31000),/1\.23456|1\.23478/);
 const changed=state();changed.lastResult.asset='GBP/USD OTC';
 assert.doesNotMatch(render(changed,start+20000),/1\.23456|1\.23478/);
});
test('confirmed direction and original entry timestamp survive after brief AGORA indication',()=>{
 const s=state();s.lastResult.analysis.vnext.opportunityWindow.phase='fired';
 s.lastResult.analysis.vnext.futureEntryAnchor.entryTriggeredAt=start+10000;
 const html=render(s,start+20000);
 assert.match(html,/ENTRADA JÁ SINALIZADA · ↑ CALL/);
 assert.match(html,/1\.23456/);assert.doesNotMatch(html,/ENTRADA AGORA/);
});
test('NOW card renders the enabled strategy menu and fresh quote while waiting for entry',()=>{
 const s=state();s.lastResult.analysis.vnext.mode='now';
 s.lastResult.analysis.vnext.opportunityWindow={phase:'scanning',windowStartedAt:null,windowEndsAt:0};
 s.lastResult.analysis.vnext.futureEntryAnchor=null;
 const html=render(s,start+20000);
 assert.match(html,/Estratégia ativa/);
 assert.match(html,/<select aria-label="Estratégia responsável pelo cenário">/);
 assert.match(html,/<option value="mean_reversion"/);
 assert.match(html,/Preço atual.*1\.23450/);
 assert.match(html,/Última análise/);
 assert.doesNotMatch(html,/<strong>ANÁLISE AGORA<\/strong>/);
});
