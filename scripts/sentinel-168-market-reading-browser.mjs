// Isolated market display; no account, broker prices or order controls.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html><body>Isolated market display</body></html>'}));
 await page.goto('https://exnova.com/isolated-market-reading');page.on('pageerror',e=>errors.push(e.message));
 const driver=new LocalPlaywrightDriver();driver.session=async()=>({page,background:false});
 const reading=(phase,label,trendSide)=>marketReading({phase,label,trendSide,quoteAt:Date.now(),now:Date.now(),candidate:{ready:false,reason:'insufficient-quote-variation'}});
 const now=Date.now(),first=reading('continuing','CONTINUIDADE','CALL');
 const data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.168',durationMs:60000,price:1.1,
  vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'insufficient-quote-variation',observedAt:now,evaluatedAt:now,marketReading:first}}};
 assert.equal(await driver.updateOverlay('exnova',data),true);
 const label=page.locator('[data-sentinel-decision-label]'),phase=page.locator('[data-sentinel-market-phase]');
 assert.equal(await label.textContent(),'CONTINUIDADE · CALL');
 assert.equal(await phase.textContent(),'CONTINUIDADE · CALL');
 for(const text of [reading('weakening','CONTINUIDADE PERDENDO FORÇA','CALL'),reading('reversal-testing','REVERSÃO EM TESTE','CALL')]){
  await page.evaluate(text=>{
   window.__sentinelLastOverlayData.vnext.nowObservation.marketReading=text;
   document.getElementById('sentinel-trading-overlay-host').shadowRoot.getElementById('sentinel-trading-overlay').__sentinelTargetClockTick();
  },text);
  assert.equal(await label.textContent(),text);assert.equal(await phase.textContent(),text);
  assert.doesNotMatch(await label.textContent(),/COTAÇÃO|AGORA/);
 }
 assert.deepEqual(errors,[]);console.log('phase and direction restored: continuation CALL, weakening CALL, reversal testing PUT; zero page errors');
}finally{await browser.close();}
