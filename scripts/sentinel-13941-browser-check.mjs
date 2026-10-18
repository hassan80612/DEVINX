// Local HTML fixtures only. No broker session or financial order is used.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor,inspectTradeControls} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage({viewport:{width:1360,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html><body style="background:#192d32;color:white;font-family:Arial"><div id="trade"><button id="call">ACIMA</button><button id="put">ABAIXO</button></div></body></html>');
  // Deliberately no stake, duration, balance or account fields.
  const scan=await page.evaluate(inspectTradeControls,{marker:'scan'});assert.ok(scan.callSelector,scan.error);assert.ok(scan.putSelector);assert.equal(scan.amountSelector,undefined);
  await page.evaluate(()=>{
   window.clicks=[];document.querySelector('#call').onclick=()=>window.clicks.push('CALL');document.querySelector('#put').onclick=()=>window.clicks.push('PUT');
   const host=document.createElement('div');host.id='sentinel-trading-overlay-host';host.dataset.uiVersion='13.9.35';
   const section=document.createElement('section');section.id='sentinel-trading-overlay';section.dataset.controlReady='1';
   section.addEventListener('click',()=>window.legacyClicks=(window.legacyClicks||0)+1);
   host.attachShadow({mode:'open'}).append(section);document.documentElement.append(host);
  });
  const driver=new LocalPlaywrightDriver(),st=driver.state(provider);driver.sessions.set(provider,{page,background:false});
  Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});
  for(const key of ['balance','balanceId','mode','visibleAccountMode','expirationDurationMs'])Object.defineProperty(st,key,{get(){throw Error('unexpected broker read: '+key);},configurable:true});
  let now=Date.now();const context={provider,activeId:76,asset:'EUR/USD OTC',durationMs:30000,engine:'automatic',state:'running',licensed:true,analysis:{},quote:1.1,quoteAt:now,quoteHistory:[]};
  const bot=new SignalExecutor({driver:new BrokerUiExecutor(driver),context:()=>context,clock:()=>now});
  const actions=[];let rejectStart=false;
  driver.setOverlayActionHandler(async(p,payload)=>{
   assert.equal(p,provider);actions.push(payload.action);
   if(payload.action==='executor-config')bot.configure(payload.patch);
   if(payload.action==='executor-start'){if(rejectStart)throw Error('fixture-visible-start-error');await bot.start();}
   if(payload.action==='executor-stop')bot.stop();return{ok:true,message:bot.message};
  });
  await driver.installBridge(page,provider);
  const refresh=()=>driver.updateOverlay(provider,{asset:context.asset,validatedAsset:context.asset,assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.41',price:1.1,engine:'automatic',durationMs:30000,uiLanguage:'pt',autoExecutor:bot.status(),vnext:{mode:'now',expirySeconds:30,nowObservation:{provisionalSide:'CALL',observedAt:Date.now(),evaluatedAt:Date.now()}}});
  assert.equal(await refresh(),true);await page.locator('[data-sentinel-executor-panel] summary').click();
  for(const [key,value] of [['initialBalance','1000'],['payoutPercent','80'],['amount','10']]){
   const field=page.locator('[data-sentinel-executor-setting="'+key+'"]');await field.fill(value);await field.evaluate(e=>e.blur());
  }
  await page.locator('[data-sentinel-executor-setting="intervalMs"]').selectOption('60000');
  for(let n=0;n<50&&bot.config.intervalMs!==60000;n++)await new Promise(r=>setTimeout(r,20));
  assert.equal(bot.config.amount,10);assert.equal(bot.config.intervalMs,60000);
  await page.locator('[data-sentinel-executor-setting="intervalMs"]').blur();await page.waitForTimeout(200);await refresh();await refresh();
  await page.locator('[data-sentinel-executor-action="start"]').click();
  for(let n=0;n<50&&!bot.enabled;n++)await new Promise(r=>setTimeout(r,20));assert.equal(bot.enabled,true);
  assert.equal(actions.filter(a=>a==='executor-start').length,1);assert.equal(await page.evaluate(()=>window.legacyClicks||0),0);
  const fire=async(side,offset)=>{now+=offset;context.quoteAt=now;context.analysis={vnext:{futureEntryAnchor:{context:provider+'|EURUSDOTC|automatic|30000',phase:'fired',side,entryPrice:context.quote,entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};bot.pulse();await bot.inflight;};
  await fire('CALL',0);assert.equal(bot.pending.exitAt,now+30000);assert.equal(bot.enabled,true);assert.equal(bot.executed,1,'no native acknowledgement required');
  context.quote=1.11;context.quoteAt=now+30000;context.quoteHistory=[{ts:context.quoteAt,price:1.11,receivedAt:context.quoteAt}];await fire('PUT',30000);assert.equal(bot.net,8);
  await fire('PUT',30000);assert.deepEqual(await page.evaluate(()=>window.clicks),['CALL','PUT']);
  now+=30000;context.quote=1.12;context.quoteAt=now;context.quoteHistory.push({ts:now,price:1.12,receivedAt:now});bot.watch();assert.equal(bot.net,-2);
  bot.stop();await refresh();rejectStart=true;await page.locator('[data-sentinel-executor-action="start"]').click();
  await page.waitForFunction(()=>document.querySelector('#sentinel-trading-overlay-host').shadowRoot.querySelector('[data-sentinel-executor-action-msg]').textContent.includes('fixture-visible-start-error'));
  assert.match(await page.locator('[data-sentinel-executor-action-msg]').innerText(),/fixture-visible-start-error/);
  assert.deepEqual(errors,[]);results.push({provider,buttonsOnly:true,legacyOverlayReplaced:true,realDriverBridge:true,singleStartHandler:true,noNativeOrderAckNeeded:true,clicks:await page.evaluate(()=>window.clicks),analystCalculationPassed:true,errorShownInsideBot:true,pageErrors:errors});await page.close();
 }
 const d=new LocalPlaywrightDriver();d.setOverlayActionHandler(async()=>({ok:true}));let tries=0;
 const broken={exposeFunction:async()=>{tries++;throw Error('bridge unavailable');}};
 await assert.rejects(d.installBridge(broken,'exnova'),/bridge unavailable/);await assert.rejects(d.installBridge(broken,'exnova'),/bridge unavailable/);assert.equal(tries,2);assert.notEqual(broken.__sentinelOverlayControlExposed,true);
 await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13941-browser-fixture.json',JSON.stringify({actualBrokerTested:false,results,failedBridgeRetryPassed:true},null,2)+'\n');console.log(JSON.stringify({actualBrokerTested:false,results,failedBridgeRetryPassed:true},null,2));
}finally{await browser.close();}
