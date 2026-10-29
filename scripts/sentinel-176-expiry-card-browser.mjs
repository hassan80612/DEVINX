// Isolated UI: all requests fulfilled locally; no broker account or orders.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const html=`<html><body><div class="expiration-control"><label>Tempo de expiração</label><button id="expiry"><span>00:30</span></button></div>
<div id="native-menu" hidden><button role="option" data-value="30">30 s</button><button role="option" data-value="60">1 min</button><button role="option" data-value="300">5 min</button></div>
<button class="chart-period" id="chart">30 s</button><div id="chart-menu" hidden><button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button></div>
<script>for(const [id,menuId] of [['expiry','native-menu'],['chart','chart-menu']]){
 let c=document.getElementById(id),m=document.getElementById(menuId);c.onclick=()=>m.hidden=!m.hidden;
 for(const o of m.children)o.onclick=()=>{c.textContent=o.textContent;m.hidden=true;};}
</script></body></html>`;
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{
 for(const provider of ['exnova','iq_option']){
  const c=await b.newContext({viewport:{width:1400,height:900}}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await c.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));
  await p.exposeFunction('__sentinelRequestNativeExpiryPermission',()=>({provider,at:Date.now(),allowed:true}));
  await c.addInitScript(installBrokerNativeExpiryKeeper,{provider});await c.addInitScript(installBrokerChartPeriodKeeper,{provider});
  await p.goto('https://'+(provider==='exnova'?'exnova.com':'iqoption.com')+'/isolated');
  await p.waitForFunction(()=>window.__sentinelNativeExpiryKeeperV3?.snapshot().currentMs===30000);
  for(const [label,ms,sec] of [['1 min',60000,60],['5 min',300000,300],['30 s',30000,30]]){
   for(const [id,menu] of [['expiry','native-menu'],['chart','chart-menu']]){
    await p.locator('#'+id).click();await p.locator('#'+menu).getByRole('option',{name:label,exact:true}).click();
   }
   await p.reload();
   await p.waitForFunction(([ms,sec])=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms&&
    window.__sentinelBrokerChartPeriodKeeperV1.snapshot().currentSeconds===sec&&
    !window.__sentinelNativeExpiryKeeperV3.snapshot().repairing&&
    !window.__sentinelBrokerChartPeriodKeeperV1.snapshot().repairing,[ms,sec],{timeout:16000});
   const check=await p.evaluate(inspectNativeExpiryBeforeClick,{requiredDurationMs:ms});
   assert.equal(check.blocked,false,JSON.stringify({provider,label,check,storage:await p.evaluate(()=>({...localStorage}))}));assert.equal(check.currentMs,ms);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({provider,splitLabelClock:true,unlabelledPortalRestore:true,immediateReloadAllThree:true}));await c.close();
 }
 const p=await b.newPage({viewport:{width:1100,height:850}});
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body>Isolated card</body></html>'}));
 await p.goto('https://exnova.com/card');const d=new LocalPlaywrightDriver();d.session=async()=>({page:p,background:false});
 for(const durationMs of [30000,60000,300000]){
  const now=Date.now(),data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.176',durationMs,price:1.1,
   vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'observing-now',observedAt:now,quoteAt:now,evaluatedAt:now,marketReading:'CONTINUIDADE · CALL'}}};
  data.vnext.opportunityWindow={phase:'fired',windowStartedAt:now-3000,windowEndsAt:now+durationMs,side:'CALL'};
  data.vnext.futureEntryAnchor={engineId:'automatic',asset:'EURUSD',side:'CALL',delaySeconds:durationMs/1000,holdingSeconds:durationMs/1000,issuedAt:now-3000,entryAt:now-3000,entryTriggeredAt:now-3000,exitAt:now+durationMs,projectedEntryPrice:1.1};
  await d.updateOverlay('exnova',data);
  const phase=p.locator('[data-sentinel-market-phase]'),action=p.locator('[data-sentinel-scenario-action]');
  assert.match(await p.locator('[data-sentinel-decision-label]').textContent(),/OPERAÇÃO EM ANDAMENTO/);
  assert.equal(await phase.evaluate(el=>getComputedStyle(el).fontSize),'11px');
  assert.equal(await phase.evaluate(el=>getComputedStyle(el).color),'rgb(125, 211, 252)');
  const before=await phase.boundingBox();
  const height=await action.evaluate(el=>el.parentElement.getBoundingClientRect().height);
  for(const reading of ['', 'REVERSÃO EM TESTE · PUT','CONTINUIDADE PERDENDO FORÇA · CALL']){
   await p.evaluate(reading=>{
    const o=window.__sentinelLastOverlayData.vnext.nowObservation;
    o.marketReading=reading;o.quoteAt=Date.now();o.evaluatedAt=Date.now();
    document.getElementById('sentinel-trading-overlay-host').shadowRoot.getElementById('sentinel-trading-overlay').__sentinelTargetClockTick();
   },reading);
   assert.equal((await phase.boundingBox()).height,before.height);
   assert.equal(await action.evaluate(el=>el.parentElement.getBoundingClientRect().height),height);
  }
 }
 await p.screenshot({path:'/workspace/scratch/3599ae2f921b/176-card-verification.png',fullPage:true});
 console.log(JSON.stringify({cardSecondaryLineStable:true,allThreeDurations:true}));
}finally{await b.close()}
