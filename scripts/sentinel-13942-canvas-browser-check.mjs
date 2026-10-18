// Local canvas/HTML fixtures, no authenticated broker or financial orders.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor,inspectTradeControls} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),driver=new LocalPlaywrightDriver(),ui=new BrokerUiExecutor(driver),bots=new Map(),reports=[];
driver.setOverlayActionHandler(async(provider,payload)=>{
 const bot=bots.get(provider);
 if(payload.action==='executor-map')await ui.beginCalibration(provider);
 if(payload.action==='executor-map-save'){await ui.saveBinding(provider,payload.binding);bot.message='Mapeado · '+provider;}
 if(payload.action==='executor-start')await bot.start();
 if(payload.action==='executor-stop')bot.stop();
 return{ok:true,message:bot.message};
});
try{
 for(const [provider,origin,points] of [['iq_option','https://iqoption.com',{CALL:{x:1150,y:310},PUT:{x:1150,y:440}}],['exnova','https://exnova.com',{CALL:{x:1080,y:390},PUT:{x:1080,y:530}}]]){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(origin+'/**',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><canvas id="native-room" width="1280" height="900" style="width:1280px;height:900px;display:block"></canvas></body></html>'}));await page.goto(origin+'/traderoom');
  await page.evaluate(points=>{
   window.nativeEvents=[];const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.fillStyle='#1b3439';ctx.fillRect(0,0,1280,900);
   for(const side of ['CALL','PUT']){const p=points[side];ctx.fillStyle=side==='CALL'?'#368957':'#aa3d3d';ctx.fillRect(p.x-65,p.y-40,130,80);ctx.fillStyle='white';ctx.font='bold 24px Arial';ctx.fillText(side,p.x-32,p.y+8);}
   for(const name of ['pointerdown','mousedown','mouseup','click'])canvas.addEventListener(name,event=>window.nativeEvents.push({name,x:event.offsetX,y:event.offsetY}));
  },points);
  const oldScan=await page.evaluate(inspectTradeControls,{marker:'scan'});assert.match(oldScan.error,/Mapear CALL\/PUT/);
  driver.sessions.set(provider,{page,background:false});Object.assign(driver.state(provider),{symbol:'EUR/USD OTC',activeId:76});
  for(const key of ['balance','balanceId','mode','expirationDurationMs'])Object.defineProperty(driver.state(provider),key,{get(){throw Error('unexpected read '+key);},configurable:true});
  let now=Date.now();const context={provider,activeId:76,asset:'EUR/USD OTC',durationMs:30000,engine:'automatic',state:'running',licensed:true,analysis:{},quote:1.1,quoteAt:now,quoteHistory:[]};
  const bot=new SignalExecutor({driver:ui,context:()=>context,clock:()=>now});bot.configure({initialBalance:100,amount:10,payoutPercent:80});bots.set(provider,bot);await driver.installBridge(page,provider);
  const refresh=()=>driver.updateOverlay(provider,{asset:context.asset,validatedAsset:context.asset,assetValidated:true,state:'running',agentVersion:'13.9.42',price:1.1,engine:'automatic',durationMs:30000,uiLanguage:'pt',autoExecutor:{...bot.status(),provider,controlsMapped:!!ui.canvasBindings[provider]},vnext:{mode:'now',expirySeconds:30}});
  await refresh();await page.locator('[data-sentinel-executor-panel] summary').click();await page.locator('[data-sentinel-executor-action="map"]').click();await page.locator('#__sentinel-map-shield').waitFor();
  await page.mouse.click(points.CALL.x,points.CALL.y);assert.deepEqual(await page.evaluate(()=>window.nativeEvents),[],'CALL mapping must not reach native handlers');
  await page.mouse.click(points.PUT.x,points.PUT.y);await page.waitForFunction(()=>!document.getElementById('__sentinel-map-shield'));
  for(let n=0;n<50&&!ui.canvasBindings[provider];n++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(ui.canvasBindings[provider]);
  assert.deepEqual(await page.evaluate(()=>window.nativeEvents),[],'PUT mapping must not place a trade either');assert.deepEqual(ui.canvasBindings[provider].targets,points);
  await page.locator('[data-sentinel-executor-action="start"]').click();for(let n=0;n<50&&!bot.enabled;n++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(bot.enabled,true);
  const fire=async(side)=>{context.analysis={vnext:{futureEntryAnchor:{context:provider,phase:'fired',side,entryPrice:context.quote,entryTriggeredAt:now,exitAt:now+30000,holdingSeconds:30}}};bot.pulse();await bot.inflight;};
  await fire('CALL');assert.equal(bot.enabled,true,bot.message);assert.equal(bot.executed,1);bot.pulse();await bot.inflight;assert.equal(bot.executed,1);
  now+=30000;context.quote=1.11;context.quoteAt=now;await fire('PUT');assert.equal(bot.net,8);assert.equal(bot.executed,2);
  now+=30000;context.quote=1.12;context.quoteAt=now;bot.watch();assert.equal(bot.net,-2);bot.stop();
  const clicks=(await page.evaluate(()=>window.nativeEvents)).filter(e=>e.name==='click');assert.deepEqual(clicks,[{name:'click',...points.CALL},{name:'click',...points.PUT}]);
  assert.equal(await page.locator('#sentinel-trading-overlay-host').getAttribute('data-sentinel-pass-through'),null,'overlay pointer handling restored');
  await page.evaluate(()=>document.querySelector('canvas').style.width='1200px');await assert.rejects(bot.start(),/Tamanho ou zoom mudou/);
  await page.evaluate(()=>document.querySelector('canvas').style.width='1280px');await ui.beginCalibration(provider);await page.keyboard.press('Escape');assert.equal(await page.locator('#__sentinel-map-shield').count(),0);assert.equal((await page.evaluate(()=>window.nativeEvents)).filter(e=>e.name==='click').length,2);
  assert.deepEqual(errors,[]);reports.push({provider,canvasOnly:true,mappingClicksReachBroker:false,targets:points,executionClicks:clicks,duplicateSignalClicks:0,resizeRequiresRemapping:true,escapeCancels:true,overlayRemainsVisible:true,noBrokerMetadataRead:true,pageErrors:errors});
 }
 // A JSON reload retains independent IQ/Exnova targets. Cross-broker use fails.
 const stored=JSON.parse(JSON.stringify(ui.canvasBindings)),restored=new BrokerUiExecutor(driver);restored.restoreBindings(stored);
 assert.notDeepEqual(restored.canvasBindings.iq_option.targets,restored.canvasBindings.exnova.targets);
 for(const provider of ['iq_option','exnova'])assert.ok((await restored.controls(provider)).canvasSelector);
 const mixed=new BrokerUiExecutor(driver);mixed.restoreBindings({iq_option:stored.exnova});await assert.rejects(mixed.controls('iq_option'),/Página mudou/);
 // Custom HTML controls, nested wrappers, and hidden duplicate labels.
 const html=await browser.newPage();await html.setContent('<div class="call-btn" onclick="void 0"><span role="button">ACIMA</span></div><div class="put-btn" onclick="void 0"><span role="button">ABAIXO</span></div><button style="display:none">CALL</button><a href="tel:123">CALL</a>');
 const native=await html.evaluate(inspectTradeControls,{marker:'nested'});assert.ok(native.callSelector,native.error);assert.ok(native.putSelector);await html.close();
 await mkdir('reports',{recursive:true});const report={actualBrokerTested:false,results:reports,separatePersistentMappings:true,crossBrokerMappingRejected:true,nestedHtmlControlsPassed:true};await writeFile('reports/sentinel-13942-canvas-browser-fixture.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
