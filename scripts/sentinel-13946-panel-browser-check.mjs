import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {setup} from '../tests/fixtures/executor-13946.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});const results=[];
try{for(const provider of ['iq_option','exnova']){
 const x=setup(provider),page=await browser.newPage({viewport:{width:1360,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<body style="background:#192d32;color:white"></body>');
 const driver=new LocalPlaywrightDriver();driver.sessions.set(provider,{page,background:false});Object.assign(driver.state(provider),{symbol:x.c.asset,uiSymbol:x.c.asset,activeId:76});
 driver.setOverlayActionHandler(async(p,payload)=>{assert.equal(p,provider);if(payload.action==='executor-config')x.bot.configure(payload.patch);if(payload.action==='executor-start')await x.bot.start();if(payload.action==='executor-stop')x.bot.stop();return{ok:true,message:x.bot.message};});
 await driver.installBridge(page,provider);
 const refresh=()=>driver.updateOverlay(provider,{asset:x.c.asset,validatedAsset:x.c.asset,assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.46',price:1,engine:x.c.engine,durationMs:x.c.durationMs,uiLanguage:'pt',autoExecutor:{...x.bot.status(),provider},vnext:{mode:'now',expirySeconds:30,nowObservation:{provisionalSide:'CALL',observedAt:Date.now(),evaluatedAt:Date.now()}}});
 const wait=async(fn)=>{for(let i=0;i<75&&!fn();i++)await page.waitForTimeout(20);assert.ok(fn());};
 const edit=async(key,value)=>{const input=page.locator('[data-sentinel-executor-setting="'+key+'"]');assert.ok(await input.isEnabled());await input.fill(String(value));await input.blur();await wait(()=>x.bot.config[key]===value);await page.waitForTimeout(200);await refresh();};
 await refresh();await page.locator('[data-sentinel-executor-panel] summary').click();assert.equal(await page.locator('[data-sentinel-executor-setting="initialBalance"]').count(),0);assert.equal(await page.locator('[data-sentinel-executor-setting="payoutPercent"]').count(),0);
 await page.locator('[data-sentinel-executor-setting="martingaleEnabled"]').check();await wait(()=>x.bot.config.martingaleEnabled===true);await page.waitForTimeout(200);await refresh();await edit('martingaleLevels',2);
 await page.locator('[data-sentinel-executor-action="start"]').click();await wait(()=>x.bot.enabled);await refresh();await edit('stopAfterMinutes',5);await edit('stopLoss',15);await x.fire();const stake=x.bot.pending.amount;
 await page.locator('[data-sentinel-executor-action="stop"]').click();await wait(()=>!x.bot.enabled);await refresh();await edit('amount',2);await edit('stopAfterMinutes',0);await edit('stopLoss',10);assert.equal(x.bot.pending.amount,stake);
 await page.locator('[data-sentinel-executor-setting="martingaleEnabled"]').uncheck();await wait(()=>x.bot.config.martingaleEnabled===false);x.close(-stake);assert.equal(x.bot.nextAmount(),2);assert.equal(x.bot.config.martingaleLevels,2);assert.deepEqual(errors,[]);
 await page.screenshot({path:'reports/sentinel-13946-'+provider+'-panel.png',fullPage:true});results.push({provider,liveEdits:true,stoppedPendingEdits:true,martingaleToggleBoolean:true,manualFieldsRemoved:true,pageErrors:errors});await page.close();
}await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13946-panel-browser-fixture.json',JSON.stringify({actualBrokerOrders:false,results},null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}
