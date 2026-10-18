// Local browser fixture. No authenticated broker session or funds are used.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage({viewport:{width:1360,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Deliberately no balance, account-mode labels or duration controls.
  await page.setContent('<html><body style="background:#192d32;color:white;font-family:Arial"><h1>Local controls — no account metadata</h1><section id="trade" style="width:260px;margin-left:30px;padding:18px;background:#143b41"><label>Amount <input aria-label="Amount" value="2"></label><button onclick="window.fixtureOrder(\'CALL\')">CALL</button><button onclick="window.fixtureOrder(\'PUT\')">PUT</button></section></body></html>');
  const driver=new LocalPlaywrightDriver(),st=driver.state(provider);driver.sessions.set(provider,{page,background:false});
  Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});
  for(const key of ['balance','balanceId','mode','visibleAccountMode'])Object.defineProperty(st,key,{get(){throw Error('unnecessary broker metadata read: '+key);},configurable:true});
  let now=Date.now(),id=100;const clicked=[];
  const context={provider,activeId:76,asset:'EUR/USD OTC',durationMs:30000,engine:'automatic',state:'running',licensed:true,analysis:{},quote:1.1,quoteAt:now,quoteHistory:[]};
  for(const key of ['balance','accountId','mode'])Object.defineProperty(context,key,{get(){throw Error('unnecessary context metadata read: '+key);},configurable:true});
  const ui=new BrokerUiExecutor(driver,{onSent:r=>bot.sent(r),onAccepted:e=>bot.accepted(e),onSettlement:e=>bot.settle(e)});
  const bot=new SignalExecutor({driver:ui,context:()=>context,clock:()=>now});driver.setExecutionObserver((...args)=>ui.observe(...args));
  await page.exposeFunction('fixtureOrder',async direction=>{
   clicked.push({direction,amount:await page.locator('#trade input').inputValue()});const rid='fixture-'+(++id);
   driver.observeExecution(provider,{name:'sendMessage',request_id:rid,msg:{name:'binary-options.open-option',body:{price:10,active_id:76,direction:direction.toLowerCase()}}},'page-out');
   driver.observeExecution(provider,{name:'option',request_id:rid,msg:{id}},'page-in');
  });
  await page.exposeFunction('__sentinelOverlayAction',async p=>{
   if(p.action==='executor-config')bot.configure(p.patch);if(p.action==='executor-start')await bot.start();if(p.action==='executor-stop')bot.stop();return{ok:true,message:bot.message};
  });
  const refresh=()=>driver.updateOverlay(provider,{asset:context.asset,validatedAsset:context.asset,assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.40',price:1.1,engine:'automatic',durationMs:30000,uiLanguage:'pt',autoExecutor:bot.status(),vnext:{mode:'now',expirySeconds:30,nowObservation:{provisionalSide:'CALL',observedAt:Date.now(),evaluatedAt:Date.now()}}});
  assert.equal(await refresh(),true);await page.locator('[data-sentinel-executor-panel] summary').click();
  assert.equal(await page.locator('[data-sentinel-executor-setting="accountMode"]').count(),0);
  for(const [key,value] of [['initialBalance','1000'],['payoutPercent','80'],['amount','10']]){const field=page.locator('[data-sentinel-executor-setting="'+key+'"]');await field.fill(value);await field.evaluate(e=>e.blur());}
  await page.locator('[data-sentinel-executor-setting="intervalMs"]').selectOption('60000');
  for(let n=0;n<30&&bot.config.intervalMs!==60000;n++)await new Promise(r=>setTimeout(r,20));
  assert.equal(bot.config.initialBalance,1000);assert.equal(bot.config.payoutPercent,80);assert.equal(bot.config.amount,10);
  await page.locator('[data-sentinel-executor-action="start"]').click();for(let n=0;n<30&&!bot.enabled;n++)await new Promise(r=>setTimeout(r,20));assert.equal(bot.enabled,true);
  const fire=async(direction,offset)=>{now+=offset;context.quoteAt=now;context.analysis={vnext:{futureEntryAnchor:{context:provider+'|EURUSDOTC|automatic|30000',phase:'fired',side:direction,entryPrice:context.quote,entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};bot.pulse();await bot.inflight;};
  await fire('CALL',0);const firstId=bot.pending.orderId;assert.equal(clicked.length,1);assert.equal(clicked[0].amount,'10');assert.equal(bot.pending.entryPrice,1.1);
  context.quote=1.11;context.quoteAt=now+30000;context.quoteHistory=[{ts:context.quoteAt,price:1.11,receivedAt:context.quoteAt}];
  await fire('PUT',30000);assert.equal(bot.net,8);assert.equal(clicked.length,1,'alternate analyst decision skipped');assert.equal(bot.history[0].source,'quote-estimate');
  await fire('PUT',30000);assert.equal(clicked.length,2);assert.equal(clicked[1].direction,'PUT');
  now+=30000;context.quote=1.12;context.quoteAt=now;context.quoteHistory.push({ts:now,price:1.12,receivedAt:now});bot.watch();assert.equal(bot.net,-2);assert.equal(bot.status().calculatedBalance,998);
  // A later official result replaces an estimate; it is never counted twice.
  driver.observeExecution(provider,{name:'option-closed',msg:{id:firstId,amount:10,profit_amount:0}},'page-in');assert.equal(bot.net,-20);assert.equal(bot.closed,2);
  bot.stop();await refresh();assert.match(await page.locator('[data-sentinel-executor-balance]').innerText(),/980.00/);
  await page.screenshot({path:'/workspace/scratch/46276b74db84/executor40-'+provider+'.png',fullPage:true});assert.deepEqual(errors,[]);
  results.push({provider,fixture:true,brokerAccountMetadataReads:0,noAccountModeSelector:true,manualInputsFromPanel:bot.config,clicks:clicked,interval:'alternate-skipped',quoteCalculation:'win-loss-passed',lateSettlementCorrection:'passed',pageErrors:errors});await page.close();
 }
 await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13940-browser-fixture.json',JSON.stringify({actualBrokerTested:false,results},null,2)+'\n');console.log(JSON.stringify({actualBrokerTested:false,results},null,2));
}finally{await browser.close();}
