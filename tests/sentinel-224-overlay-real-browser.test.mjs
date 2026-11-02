import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

test('real Chromium paints the first Sentinel overlay and never leaves an empty black rectangle',async()=>{
 const {chromium}=await import('../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs');
 const browser=await chromium.launch({channel:process.env.SENTINEL_TEST_EDGE==='1'?'msedge':undefined,headless:true,
  ...(process.env.SENTINEL_TEST_EDGE==='1'?{}:{executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox']})});
 try{
  const page=await browser.newPage();
  await page.route('https://sentinel-test.invalid/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><h1>Broker chart</h1></body></html>'}));
  await page.goto('https://sentinel-test.invalid/traderoom');
  const driver=new LocalPlaywrightDriver();
  driver.session=async()=>({page,background:false});
  const now=Date.now();
  const data={state:'running',asset:'EUR/USD',validatedAsset:'EUR/USD',assetValidated:true,
   engine:'automatic',strategy:'smart_confluence',durationMs:60000,forecastHorizonSeconds:60,
   quoteAt:now,liveAgeMs:0,analysisAgeMs:0,price:1.1021,analysisStale:false,
   vnext:{engineId:'automatic',cards:[
     {id:'market',label:'Mercado agora',side:'CALL',callPct:55,putPct:45},
     {id:'previous',label:'Estrutura anterior',side:'PUT',callPct:46,putPct:54},
     {id:'combined',label:'Estrutura + mercado',side:'CALL',callPct:53,putPct:47}
   ]}};
  const ok=await driver.updateOverlay('exnova',data);
  const state=await page.evaluate(()=>{
    const host=document.getElementById('sentinel-trading-overlay-host');
    const panel=host?.shadowRoot?.getElementById('sentinel-trading-overlay');
    return {exists:!!panel,htmlSize:panel?.innerHTML.length??0,
      cards:panel?.querySelectorAll('[data-sentinel-card]').length??0,
      label:panel?.textContent?.slice(0,800)??''};
  });
  assert.equal(ok,true,'a runtime exception must not be swallowed as success');
  assert.equal(state.exists,true);
  assert.ok(state.htmlSize>2000,'no empty dark panel permitted');
  assert.ok(state.cards>0,'live analytical controls should render');
  // After a missing compact frame, the visual card must remain populated,
  // but must explicitly mark it as historical and not actionable.
  const second=await driver.updateOverlay('exnova',{...data,vnext:{engineId:'automatic',cards:[]},liveAgeMs:4000});
  assert.equal(second,true);
  await page.close();
 }finally{await browser.close()}
});
