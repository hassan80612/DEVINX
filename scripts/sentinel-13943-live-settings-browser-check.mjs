// Local HTML/account-event fixtures only. No real broker session or order.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage({viewport:{width:1360,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<body style="background:#192d32;color:white"><button id="call">ACIMA</button><button id="put">ABAIXO</button></body>');
  await page.evaluate(()=>{window.clicks=[];for(const [id,side] of [['call','CALL'],['put','PUT']])document.getElementById(id).onclick=()=>window.clicks.push(side);});
  const driver=new LocalPlaywrightDriver();driver.sessions.set(provider,{page,background:false});Object.assign(driver.state(provider),{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76,balanceId:10,mode:'demo'});
  const nativeBalance=amount=>driver.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,amount}}});nativeBalance(100);
  let now=Date.now();const c={provider,asset:'EUR/USD OTC',activeId:76,durationMs:30000,engine:'automatic',state:'running',licensed:true,analysis:{}};
  const bot=new SignalExecutor({driver:new BrokerUiExecutor(driver),context:()=>({...c,brokerBalance:driver.accountBalanceSnapshot(provider)}),clock:()=>now});bot.configure({initialBalance:1,amount:10,payoutPercent:80,stopLoss:10});
  driver.setOverlayActionHandler(async(p,payload)=>{assert.equal(p,provider);if(payload.action==='executor-config')bot.configure(payload.patch);if(payload.action==='executor-start')await bot.start();if(payload.action==='executor-stop')bot.stop();return{ok:true,message:bot.message};});
  await driver.installBridge(page,provider);
  const refresh=()=>driver.updateOverlay(provider,{asset:c.asset,validatedAsset:c.asset,assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.43',price:1,engine:c.engine,durationMs:30000,uiLanguage:'pt',autoExecutor:bot.status(),vnext:{mode:'now',expirySeconds:30,nowObservation:{provisionalSide:'CALL',observedAt:Date.now(),evaluatedAt:Date.now()}}});
  const wait=async(predicate)=>{for(let n=0;n<75&&!predicate();n++)await page.waitForTimeout(20);assert.ok(predicate());};
  const edit=async(key,value)=>{const field=page.locator('[data-sentinel-executor-setting="'+key+'"]');assert.ok(await field.isEnabled());await field.fill(String(value));await field.blur();await wait(()=>bot.config[key]===value);await page.waitForTimeout(200);await refresh();};
  await refresh();await page.locator('[data-sentinel-executor-panel] summary').click();await page.locator('[data-sentinel-executor-action="start"]').click();await wait(()=>bot.enabled);await refresh();assert.equal(bot.initialBalance,100);
  assert.match(await page.locator('[data-sentinel-executor-broker-balance]').innerText(),/100.00/);
  await edit('stopAfterMinutes',5);await edit('stopLoss',15);assert.equal(bot.deadlineAt,bot.startedAt+300000);
  const fire=async side=>{c.analysis={vnext:{futureEntryAnchor:{context:[provider,'EURUSDOTC',c.engine,30000].join('|'),phase:'fired',side,entryPrice:1,entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};bot.pulse();await bot.inflight;};
  await fire('CALL');assert.equal(bot.executed,1);nativeBalance(90);bot.watch();assert.equal(bot.status().riskNetPnl,0);
  await page.locator('[data-sentinel-executor-action="stop"]').click();await wait(()=>!bot.enabled);await refresh();await edit('amount',12);await edit('stopAfterMinutes',0);await edit('stopLoss',10);assert.ok(bot.pending);assert.equal(bot.pending.amount,10);
  now+=31001;bot.watch();assert.equal(bot.pending,null);assert.equal(bot.history[0].result,'unknown');await refresh();await page.locator('[data-sentinel-executor-action="start"]').click();await wait(()=>bot.enabled);
  c.engine='trend';now+=30000;await fire('PUT');assert.ok(bot.enabled);assert.deepEqual(await page.evaluate(()=>window.clicks),['CALL','PUT']);nativeBalance(78);bot.watch();assert.ok(bot.enabled);now+=31001;bot.watch();assert.equal(bot.enabled,false);assert.match(bot.message,/stop loss/);await refresh();assert.ok(await page.locator('[data-sentinel-executor-setting="stopAfterMinutes"]').isEnabled());
  assert.deepEqual(errors,[]);results.push({provider,receivedBalance:true,runningEdits:true,stoppedPendingEdits:true,unknownResultUnlock:true,strategyContinues:true,nativeStopLoss:true,clicks:await page.evaluate(()=>window.clicks),pageErrors:errors});await page.close();
 }
 await mkdir('reports',{recursive:true});const report={actualBrokerTested:false,nativeWindowsTested:false,results};await writeFile('reports/sentinel-13943-browser-fixture.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
