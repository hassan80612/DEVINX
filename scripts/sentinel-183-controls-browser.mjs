import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{for(const durationMs of [30000,60000,300000]){
 const p=await b.newPage({viewport:{width:1280,height:900}}),actions=[];await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<body>Isolated entry picker</body>'}));await p.goto('https://exnova.com/isolated-entry-picker');await p.exposeFunction('__sentinelOverlayAction',payload=>{actions.push(payload);return {ok:true,message:'Aplicado'};});
 const d=new LocalPlaywrightDriver();d.session=async()=>({page:p,background:false});const now=Date.now();
 const data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,state:'running',analysisAgeMs:0,liveAgeMs:0,agentVersion:'13.9.183',durationMs,price:1.1,entryFamily:'automatic',vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'observing-now',observedAt:now,quoteAt:now,evaluatedAt:now,marketReading:'CONTINUIDADE · CALL'}}};
 await d.updateOverlay('exnova',data);
 const row=p.locator('[data-sentinel-pc-selection-row]'),picker=p.locator('[data-sentinel-setting="entryFamily"]');
 assert.equal(await picker.locator('option').count(),3);
 assert.equal(await p.locator('[data-sentinel-expiry-mapping-picker]').count(),0);
 assert.equal(await p.locator('[data-sentinel-action^="expiry-map-"]').count(),0);
 const selectors=['engine','entryFamily','duration'];const boxes=await Promise.all(selectors.map(key=>p.locator('[data-sentinel-setting="'+key+'"]').boundingBox()));
 assert.ok(boxes.every(box=>box.y===boxes[0].y&&box.height===boxes[0].height),'the three selects share one baseline and height');
 assert.ok(boxes[0].x<boxes[1].x&&boxes[1].x<boxes[2].x,'entry type is directly beside strategy');
 await picker.selectOption('reversal');assert.ok(actions.some(x=>x.action==='setting'&&x.key==='entryFamily'&&x.value==='reversal'));
 await picker.blur();await d.updateOverlay('exnova',{...data,entryFamily:'reversal'});assert.equal(await picker.inputValue(),'reversal');
 await picker.selectOption('automatic');assert.ok(actions.some(x=>x.action==='setting'&&x.key==='entryFamily'&&x.value==='automatic'));
 console.log(JSON.stringify({durationMs,threeOptions:true,commandsDelivered:true,sameRow:true,sameHeight:true,selectionPreserved:true,expiryMappingRemoved:true}));await p.close();
}}finally{await b.close();}
