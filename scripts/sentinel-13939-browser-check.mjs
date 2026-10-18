// Local HTML fixture, NOT a connected broker or broker DEMO session.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage({viewport:{width:1360,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html><body style="background:#192d32;color:white;font-family:Arial"><h1>Local trade UI fixture</h1><button id="account">Conta de prática</button><section id="trade" style="width:260px;margin-left:30px;padding:18px;background:#143b41"><label>Amount <input aria-label="Amount" value="2"></label><label>Duration <select aria-label="Duration"><option>30 s</option><option>15 s</option></select></label><button onclick="window.fixtureOrder(\'CALL\')">CALL</button><button onclick="window.fixtureOrder(\'PUT\')">PUT</button></section></body></html>');
  const driver=new LocalPlaywrightDriver(),st=driver.state(provider);
  driver.sessions.set(provider,{page,background:false});
  Object.assign(st,{mode:'demo',balanceId:10,balance:1000,symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});
  let now=Date.now(),id=100,clicked=[];
  const context={provider,accountId:'10',activeId:76,mode:'demo',balance:1000,asset:'EUR/USD OTC',durationMs:30000,engine:'automatic',state:'running',licensed:true,analysis:{}};
  const ui=new BrokerUiExecutor(driver,{onSent:r=>bot.sent(r),onAccepted:e=>bot.accepted(e),onSettlement:e=>bot.settle(e)});
  const bot=new SignalExecutor({driver:ui,context:()=>context,clock:()=>now});bot.configure({amount:10,intervalMs:60000,stopLoss:10});
  driver.setExecutionObserver((...args)=>ui.observe(...args));
  await page.exposeFunction('fixtureOrder',async direction=>{
   clicked.push({direction,amount:await page.locator('#trade input').inputValue()});const rid='fixture-'+(++id);
   driver.observeExecution(provider,{name:'sendMessage',request_id:rid,msg:{name:'binary-options.open-option',body:{user_balance_id:10,price:10,active_id:76,direction:direction.toLowerCase()}}},'page-out');
   driver.observeExecution(provider,{name:'option',request_id:rid,msg:{id}},'page-in');
  });
  await page.exposeFunction('__sentinelOverlayAction',async payload=>{
   if(payload.action==='executor-config')bot.configure(payload.patch);
   if(payload.action==='executor-start')await bot.start({confirmedMode:payload.confirmedMode});
   if(payload.action==='executor-stop')bot.stop();
   return{ok:true,message:bot.message};
  });
  const refresh=()=>driver.updateOverlay(provider,{asset:context.asset,validatedAsset:context.asset,assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.39',price:1.1,engine:'automatic',durationMs:30000,uiLanguage:'pt',brokerMode:'demo',autoExecutor:bot.status(),vnext:{mode:'now',expirySeconds:30,nowObservation:{provisionalSide:'CALL',observedAt:Date.now(),evaluatedAt:Date.now()}}});
  assert.equal(await refresh(),true);await page.locator('[data-sentinel-executor-panel] summary').click();
  await page.locator('[data-sentinel-executor-action="start"]').click();
  // Wait for the exposed async handler using its actual state, not a fixed sleep.
  for(let n=0;n<30&&!bot.enabled;n++)await new Promise(r=>setTimeout(r,20));
  assert.equal(bot.enabled,true);assert.equal(clicked.length,0);
  const fire=async(side,offset)=>{
   now+=offset;context.analysis={vnext:{futureEntryAnchor:{context:provider+'|EURUSDOTC|automatic|30000',phase:'fired',side,entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};
   bot.pulse();await bot.inflight;
  };
  await fire('CALL',0);assert.equal(clicked.length,1);assert.equal(clicked[0].amount,'10');assert.equal(bot.executed,1);
  driver.observeExecution(provider,{name:'option-closed',msg:{id,user_balance_id:10,amount:10,profit_amount:18}},'page-in');assert.equal(bot.net,8);
  await fire('PUT',30000);assert.equal(clicked.length,1,'alternate decision must be skipped');
  await fire('PUT',30000);assert.equal(clicked.length,2);assert.equal(clicked[1].direction,'PUT');
  driver.observeExecution(provider,{name:'option-closed',msg:{id,user_balance_id:10,amount:10,profit_amount:0}},'page-in');assert.equal(bot.net,-2);
  bot.stop();await refresh();
  // Unsupported/mismatched broker duration must cause zero clicks.
  await page.locator('#trade select').selectOption({label:'15 s'});
  await assert.rejects(bot.start({confirmedMode:'demo'}),/Duração/);assert.equal(clicked.length,2);
  await page.locator('#trade select').selectOption({label:'30 s'});
  await page.locator('#account').evaluate(e=>e.textContent='Conta real');await assert.rejects(bot.start({confirmedMode:'demo'}),/Conta/);assert.equal(clicked.length,2);await page.locator('#account').evaluate(e=>e.textContent='Conta de prática');
  await page.screenshot({path:'/workspace/scratch/46276b74db84/executor-'+provider+'.png',fullPage:true});
  assert.deepEqual(errors,[]);results.push({provider,fixture:true,clicks:clicked,interval:'alternate-skipped',durationMismatch:'no-click',pageErrors:errors});await page.close();
 }
 await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13939-browser-fixture.json',JSON.stringify({actualBrokerTested:false,results},null,2)+'\n');
 console.log(JSON.stringify({actualBrokerTested:false,results},null,2));
}finally{await browser.close();}
