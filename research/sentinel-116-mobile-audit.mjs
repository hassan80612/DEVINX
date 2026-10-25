import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const output=process.argv[2];mkdirSync(output,{recursive:true});
const url=new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url);
const require=createRequire(url),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let language='pt';const component=new Module(fileURLToPath(url));
component.require=name=>name==='./SentinelLocale'?{useSentinelLocale:()=>({t:s=>sentinelText(language,s),language})}:
 name==='../lib/live-card-model'?require('../lib/live-card-model.ts'):require(name);
component._compile(ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,fileURLToPath(url));
const now=Date.now(),start=now-14000;
const state={state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:{engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:30000},
 liveBroker:{symbol:'EUR/USD OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:now,quote:1.12949},lastEvalMs:now,
 autoExecutor:{sessionWins:7,sessionLosses:7},lastResult:{asset:'EUR/USD OTC',analysis:{vnext:{mode:'now',engineId:'automatic',expirySeconds:30,
 nowObservation:{evaluatedAt:now,observedAt:now},opportunityWindow:{phase:'fired',windowStartedAt:start,windowEndsAt:start+30000,entryAt:start,entryTriggeredAt:start},
 futureEntryAnchor:{engineId:'automatic',side:'PUT',delaySeconds:30,holdingSeconds:30,issuedAt:start,entryAt:start,entryTriggeredAt:start,exitAt:start+30000,projectedEntryPrice:1.12983}}}}};
const css=readFileSync(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const checks=[];
try{for(language of ['pt','en'])for(const width of [320,390,710]){
 const markup=renderToStaticMarkup(React.createElement(component.exports.LiveScenarioCard,{s:state,busy:false,act:async()=>{},compact:true,onToggleCompact:()=>{}}));
 const page=await browser.newPage({viewport:{width,height:1200}});
 await page.setContent('<style>'+css+'</style><main class="app compactAnalyst" style="padding:10px">'+markup+'</main>');
 const pair=page.locator('[data-testid="mobile-entry-and-quote"]'),clock=page.locator('[data-testid="forecast-countdown-clock"]');
 assert.equal(await pair.count(),1);assert.equal(await page.locator('.mobileCurrentQuoteOnly').count(),0);
 const result=await page.evaluate(()=>{
  const pair=document.querySelector('[data-testid="mobile-entry-and-quote"]'),clock=document.querySelector('[data-testid="forecast-countdown-clock"]');
  const boxes=[...pair.children].map(e=>e.getBoundingClientRect());
  return{sameRow:Math.abs(boxes[0].top-boxes[1].top)<1,separate:boxes[0].right<=boxes[1].left,
   unclipped:[...clock.querySelectorAll('small,span,b,strong')].every(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),
   horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 assert.ok(result.sameRow&&result.separate&&result.unclipped&&!result.horizontalOverflow,JSON.stringify({width,language,...result}));
 checks.push({width,language,...result});
 if(width===390&&language==='pt')await page.screenshot({path:output+'/116-card-mobile.png',fullPage:true});
 await page.close();
}console.log(JSON.stringify({actualReactComponent:true,syntheticData:true,checks},null,2));
}finally{await browser.close()}
