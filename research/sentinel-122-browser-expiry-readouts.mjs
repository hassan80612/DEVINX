import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick,nativeExpiryPermissionForExecutor} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {patchExecutorReadouts} from '../sentinel-trading-lab/agent/worker/executor-readouts.mjs';
const output=process.argv[2];mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{for(const provider of ['exnova','iq_option']){
 const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 // The hostname is satisfied locally; no real broker request or session.
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<style>body{background:#24364c;color:white}.expiration-root{position:absolute;left:30px;top:45px;width:145px}button{padding:8px}#expiry-options[hidden]{display:none}</style><div class="expiration-root"><button id="expiry" class="expiration-input" aria-label="Expiração" aria-controls="expiry-options">1 min</button><div id="expiry-options" class="expiration-menu" role="listbox" hidden><button role="option">30 s</button><button role="option">1 min</button><button role="option">2 min</button></div></div><button id="trade-call">CALL fixture</button><script>window.__fixtureTrades=0;document.querySelector('#expiry').onclick=()=>{document.querySelector('#expiry-options').hidden=!document.querySelector('#expiry-options').hidden};for(const button of document.querySelectorAll('[role=option]'))button.onclick=()=>{document.querySelector('#expiry').textContent=button.textContent;document.querySelector('#expiry-options').hidden=true};document.querySelector('#trade-call').onclick=()=>window.__fixtureTrades++;</script>`}));
 await page.goto(provider==='exnova'?'https://trade.exnova.com/__local_test__':'https://iqoption.com/__local_test__');
 await page.evaluate(()=>{window.__fixtureNow=Date.now();Date.now=()=>window.__fixtureNow;});
 await page.evaluate(installBrokerNativeExpiryKeeper,{provider});
 const d=new LocalPlaywrightDriver();d.sessions.set(provider,{page,background:false});
 const start=Date.now(),ids=['market-now','prior-structure','total-of-totals'];let blocked=0;
 for(let i=0;i<16;i++){
  const at=start+i*63000;await page.evaluate(at=>window.__fixtureNow=at,at);
  const state={provider,enabled:true,executing:true,arming:false,pending:{},unresolvedBatches:0,config:{amount:1,stopLoss:0,stopWin:0},sessionWins:i,sessionLosses:0,netPnl:i*.86,availableBalance:100+i*.86,message:'Operação em andamento'};
  const cards=ids.map(id=>({id,side:i%2?'CALL':'PUT',callPct:i%2?70:30,putPct:i%2?30:70}));
  await d.updateOverlay(provider,{state:'running',agentVersion:'13.9.122',asset:'EUR/USD OTC',validatedAsset:'EUR/USD OTC',engine:'automatic',durationMs:60000,price:1.13,quoteAt:at,liveAgeMs:0,analysisAgeMs:0,uiLanguage:'pt',autoExecutor:state,marketReadingsAt:at,vnext:{mode:'now',engineId:'automatic',cards,futureEntryAnchor:null}});
  await page.evaluate(patchExecutorReadouts,{revision:at,readout:{},nativeExpiryPermission:nativeExpiryPermissionForExecutor(state,at)});
  if(i===13)await page.evaluate(()=>document.querySelector('#expiry').textContent='30 s');
  const inspection=await page.evaluate(inspectNativeExpiryBeforeClick);
  if(inspection.blocked){blocked++;assert.equal(i,13);}
  if(i===13)assert.equal(await page.locator('#expiry').textContent(),'30 s','do not change a native control during execution');
  await d.updateMarketTotals(provider,{provider,asset:'EUR/USD OTC',engine:'automatic',durationMs:60000,language:'pt',state:'running',at,quoteAt:at,fresh:true,cards});
  const side=await page.locator('#sentinel-trading-overlay-host').locator('[data-sentinel-summary="market-now"] [data-sentinel-reading-side]').textContent();
  assert.equal(side,i%2?'CALL':'PUT','totals update while executor is dispatching');
  const settledAt=at+61000;await page.evaluate(at=>window.__fixtureNow=at,settledAt);
  await page.evaluate(patchExecutorReadouts,{revision:settledAt,readout:{},nativeExpiryPermission:nativeExpiryPermissionForExecutor({...state,executing:false,pending:null},settledAt)});
  await page.waitForFunction(()=>document.querySelector('#expiry').textContent==='1 min'&&!window.__sentinelNativeExpiryKeeperV3.snapshot().repairing);
 }
 assert.equal(blocked,1);assert.equal(await page.evaluate(()=>window.__fixtureTrades),0);
 // Genuine manual preference changes remain authoritative.
 await page.locator('#expiry').click();await page.locator('[role="option"]').filter({hasText:'2 min'}).click();
 await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.poll());
 assert.equal(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs),120000);
 assert.equal((await page.evaluate(inspectNativeExpiryBeforeClick)).blocked,false);
 assert.deepEqual(errors,[]);results.push({provider,cycles:16,rollbackAfterCycle:13,knownMismatchSkipped:blocked,restoredInSafeGap:true,manualTwoMinuteChoicePreserved:true,totalsUpdatedDuringDispatch:true,realBrokerRequests:0,realOrders:0,errors});
 await page.close();
}const report={localChromium:true,acceleratedFixture:true,liveBrokerOrWindowsExecution:false,results};writeFileSync(output+'/122-browser-expiry-readouts.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close()}
