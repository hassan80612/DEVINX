import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{for(const durationMs of [30000,60000,300000]){
 const p=await b.newPage({viewport:{width:1280,height:900}}),actions=[];await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<body>Isolated entry picker</body>'}));await p.goto('https://exnova.com/isolated-entry-picker');await p.exposeFunction('__sentinelOverlayAction',payload=>{actions.push(payload);return {ok:true,message:'Aplicado'};});
 const d=new LocalPlaywrightDriver();d.session=async()=>({page:p,background:false});const now=Date.now();
 const data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,state:'running',analysisAgeMs:0,liveAgeMs:0,agentVersion:'13.9.182',durationMs,price:1.1,entryFamily:'automatic',vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'observing-now',observedAt:now,quoteAt:now,evaluatedAt:now,marketReading:'CONTINUIDADE · CALL'}}};
 await d.updateOverlay('exnova',data);const box=p.locator('[data-sentinel-entry-family-picker]');assert.equal(await box.getAttribute('open'),null);await box.locator('summary').click();await p.locator('[data-sentinel-setting="entryFamily"]').selectOption('reversal');assert.ok(actions.some(x=>x.action==='setting'&&x.key==='entryFamily'&&x.value==='reversal'));
 await p.locator('[data-sentinel-setting="entryFamily"]').blur();await d.updateOverlay('exnova',{...data,entryFamily:'reversal'});assert.notEqual(await box.getAttribute('open'),null,'expanded preference must survive the next market frame');assert.equal(await p.locator('[data-sentinel-setting="entryFamily"]').inputValue(),'reversal');
 await box.locator('summary').click();await p.locator('[data-sentinel-expiry-mapping-picker] summary').click();await p.locator('[data-sentinel-action="expiry-map-status"]').click();assert.ok(actions.some(x=>x.action==='expiry-map-status'));
 console.log(JSON.stringify({durationMs,threeOptions:true,commandsDelivered:true,expandedStatePreserved:true,separateExpiryAction:true}));await p.close();
}}finally{await b.close();}
