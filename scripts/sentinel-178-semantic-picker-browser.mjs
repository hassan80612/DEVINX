// Isolated UI: all requests fulfilled locally; no broker account or orders.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {installBrokerNativeExpiryKeeper,observeNativeExpiryForClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const html=`<html><head><meta charset="utf-8"></head><body><div class="plain-field"><label>Tempo</label><button id="field-a"><span>00:30</span></button></div>
<div id="popup-a" hidden><button role="option" data-value="30">30 s</button><button role="option" data-value="60">1 min</button><button role="option" data-value="300">5 min</button></div>
<button title="Período das velas" id="field-b">30 s</button><div id="popup-b" hidden><button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button></div>
<script>for(const [id,menuId] of [['field-a','popup-a'],['field-b','popup-b']]){
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
   for(const [id,menu] of [['field-a','popup-a'],['field-b','popup-b']]){
    await p.locator('#'+id).click();await p.locator('#'+menu).getByRole('option',{name:label,exact:true}).click();
   }
   await p.reload();
   await p.waitForFunction(([ms,sec])=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms&&
    window.__sentinelBrokerChartPeriodKeeperV1.snapshot().currentSeconds===sec&&
    !window.__sentinelNativeExpiryKeeperV3.snapshot().repairing&&
    !window.__sentinelBrokerChartPeriodKeeperV1.snapshot().repairing,[ms,sec],{timeout:16000});
   const check=await p.evaluate(observeNativeExpiryForClick,{provider,requiredDurationMs:ms});
   assert.equal(check.blocked,false,JSON.stringify({provider,label,check,storage:await p.evaluate(()=>({...localStorage}))}));assert.equal(check.currentMs,ms);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({provider,splitLabelClock:true,unlabelledPortalRestore:true,immediateReloadAllThree:true}));await c.close();
 }
}finally{await b.close()}
