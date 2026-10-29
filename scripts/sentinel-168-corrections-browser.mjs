// Isolated Chromium checks. No signed-in broker, market data or orders.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
const PublishedKeeper=process.env.SENTINEL_BASELINE_KEEPER?(await import(process.env.SENTINEL_BASELINE_KEEPER)).installBrokerNativeExpiryKeeper:null;
const browser=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{
 for(const provider of ['exnova','iq_option']){
  const context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage();
  const html=`<html><body><span id="expiry-label">Tempo de expiração</span>
   <button id="expiry" data-testid="expiry-picker" aria-controls="expiry-menu" aria-valuetext="30 s">30 s</button>
   <div id="expiry-menu" hidden><button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button></div>
   <button id="chart" class="chart-period" aria-controls="chart-menu">30 s</button>
   <div id="chart-menu" hidden><button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button></div>
   <script>for(const id of ['expiry','chart']){const c=document.getElementById(id),m=document.getElementById(id+'-menu');
    c.onclick=()=>m.hidden=!m.hidden;for(const o of m.children)o.onclick=()=>{c.textContent=o.textContent;c.setAttribute('aria-valuetext',o.textContent);m.hidden=true};}</script>
   </body></html>`;
  await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://'+(provider==='exnova'?'exnova.com':'iqoption.com')+'/isolated-correction');
  if(PublishedKeeper){
   await page.evaluate(PublishedKeeper,{provider});
   assert.equal(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs),null,'published detector misses a data-testid-only control');
  }
  await page.evaluate(installBrokerNativeExpiryKeeper,{provider});
  assert.equal(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs),30000);
  // Accessible label plus aria value is an independent supported identity.
  await page.evaluate(()=>{const c=document.getElementById('expiry');c.removeAttribute('data-testid');c.setAttribute('aria-labelledby','expiry-label');
   window.__sentinelNativeExpiryKeeperV3.dispose();delete window.__sentinelNativeExpiryKeeperV3;});
  await page.evaluate(installBrokerNativeExpiryKeeper,{provider});
  assert.equal(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs),30000);
  await page.evaluate(installBrokerChartPeriodKeeper,{provider});
  await context.addInitScript(installBrokerNativeExpiryKeeper,{provider});
  await context.addInitScript(installBrokerChartPeriodKeeper,{provider});
  await page.exposeFunction('__sentinelRequestNativeExpiryPermission',()=>({provider,at:Date.now(),allowed:true}));
  for(const [label,ms,chart] of [['1 min',60000,60],['5 min',300000,300],['30 s',30000,30]]){
   for(const id of ['expiry','chart']){
    await page.locator('#'+id).click();await page.locator('#'+id+'-menu').getByRole('option',{name:label,exact:true}).click();
   }
   // Reload before the 2.5s poll: exact trusted choices must already persist.
   await page.reload();
   await page.waitForFunction(([ms,s])=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms&&
    window.__sentinelBrokerChartPeriodKeeperV1.snapshot().currentSeconds===s&&
    !window.__sentinelNativeExpiryKeeperV3.snapshot().repairing&&
    !window.__sentinelBrokerChartPeriodKeeperV1.snapshot().repairing,[ms,chart],{timeout:12000}).catch(async error=>{console.log('reload diagnostic',provider,label,await page.evaluate(()=>({native:window.__sentinelNativeExpiryKeeperV3?.snapshot(),chart:window.__sentinelBrokerChartPeriodKeeperV1?.snapshot(),expiry:document.getElementById('expiry')?.outerHTML,permission:window.__sentinelNativeExpiryPermissionV3,storage:{...localStorage}})));throw error;});
   const check=await page.evaluate(inspectNativeExpiryBeforeClick,{requiredDurationMs:ms});
   assert.equal(check.currentMs,ms);assert.equal(check.blocked,false);
   assert.equal(await page.evaluate(()=>window.__sentinelBrokerChartPeriodKeeperV1.snapshot().preferredSeconds),chart);
  }
  console.log(JSON.stringify({provider,semanticNativeControl:true,immediateReloadAllThreeDurations:true}));
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body>Isolated analyst</body></html>'}));
 await page.goto('https://exnova.com/isolated-reading');page.on('pageerror',e=>errors.push(e.message));
 const d=new LocalPlaywrightDriver();d.session=async()=>({page,background:false});d.sessions.set('exnova',{page});
 for(const durationMs of [30000,60000,300000]){
  const at=Date.now(),data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.168',durationMs,price:1.1,
   vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'late-quote-no-entry',observedAt:at-6000,quoteAt:at-6000,evaluatedAt:at,marketReading:'REVERSÃO EM TESTE · CALL'}}};
  await d.updateOverlay('exnova',data);
  const label=page.locator('[data-sentinel-decision-label]'),technical=page.locator('[data-sentinel-market-phase]');
  assert.equal(await label.textContent(),'REVERSÃO EM TESTE · CALL');assert.match(await technical.textContent(),/COTAÇÃO ATRASADA/);
  const panel=await page.locator('[data-sentinel-vnext-cards]').evaluate(el=>({...el.dataset}));
  const fresh=Date.now(),frame={asset:panel.asset,engine:panel.engine,durationMs,language:panel.language,state:panel.state,at:fresh,quoteAt:fresh,fresh:true,cards:[],
   observation:{quoteAt:fresh,observedAt:fresh,evaluatedAt:fresh,marketReading:'CONTINUIDADE PERDENDO FORÇA · PUT'}};
  const updates=new LatestOverlayScheduler((provider,frame)=>d.updateMarketTotals(provider,frame),{
   minIntervalMs:1000,slowThresholdMs:150,slowCooldownMs:1000});
  updates.nextAllowedAt=Date.now()+6000; // a cosmetic cooldown must not hold a changed phase
  updates.publish('exnova',frame,{urgent:true});
  await page.waitForFunction(()=>document.getElementById('sentinel-trading-overlay-host').shadowRoot
   .querySelector('[data-sentinel-decision-label]').textContent==='CONTINUIDADE PERDENDO FORÇA · PUT',null,{timeout:2000});
  assert.equal(await label.textContent(),'CONTINUIDADE PERDENDO FORÇA · PUT');assert.match(await technical.textContent(),/^COTAÇÃO ATUAL/);
  assert.equal(await page.evaluate(()=>window.__sentinelLastOverlayData.vnext.nowObservation.ready),false,'text refresh cannot grant an entry');
  await d.updateOverlay('exnova',data); // queued older full card
  assert.equal(await label.textContent(),'CONTINUIDADE PERDENDO FORÇA · PUT','older full render cannot roll back a fresh text reading');
  await d.updateMarketTotals('exnova',{...frame,at:fresh+1,asset:'GBPUSD',observation:{...frame.observation,evaluatedAt:fresh+1,marketReading:'WRONG ASSET'}});
  assert.equal(await label.textContent(),'CONTINUIDADE PERDENDO FORÇA · PUT');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({marketPhaseAndTechnicalLine:true,allThreeDurations:true,refreshWithoutFullRender:true,noEntryPermissionFromText:true,zeroPageErrors:true}));
}finally{await browser.close();}
