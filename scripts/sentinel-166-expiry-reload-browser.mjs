// Isolated DOM integration test. All broker-origin requests are fulfilled
// locally; no real broker session, balance, quotation or trading is accessed.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';
const html=`<!doctype html><html><body>
 <button id="expiry" class="expiration-input" aria-controls="expiry-menu">30 s</button>
 <div id="expiry-menu" class="expiration-menu" hidden>
  <button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button>
 </div>
 <button id="chart" class="chart-duration-timeframe" aria-controls="chart-menu">30 s</button>
 <div id="chart-menu" class="chart-timeframe-menu" hidden>
  <button role="option">30 s</button><button role="option">1 min</button><button role="option">5 min</button>
 </div><script>
 for(const id of ['expiry','chart']){
  const control=document.getElementById(id),menu=document.getElementById(id+'-menu');
  control.onclick=()=>{menu.hidden=!menu.hidden};
  for(const option of menu.children)option.onclick=()=>{control.textContent=option.textContent;menu.hidden=true};
 }
 </script></body></html>`;
const browser=await chromium.launch({headless:true,
 ...(process.env.SENTINEL_TEST_BROWSER?{executablePath:process.env.SENTINEL_TEST_BROWSER}:{}),
 args:['--no-sandbox']});
try{
 for(const provider of ['iq_option','exnova']){
  const context=await browser.newContext({viewport:{width:1400,height:900}});
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=await context.newPage();let busy=false,renewals=0;
  await page.exposeFunction('__sentinelRequestNativeExpiryPermission',()=>{
   renewals++;return {provider,at:Date.now(),allowed:!busy};
  });
  await context.addInitScript(({provider})=>{
   const native='sentinel-broker-native-expiration-preference-v3:'+provider;
   const chart='sentinel-broker-chart-period-preference-v1:'+provider;
   if(!localStorage.getItem(native))localStorage.setItem(native,'60000');
   if(!localStorage.getItem(chart))localStorage.setItem(chart,'300');
  },{provider});
  await context.addInitScript(installBrokerNativeExpiryKeeper,{provider});
  await context.addInitScript(installBrokerChartPeriodKeeper,{provider});
  await page.goto('https://'+(provider==='iq_option'?'iqoption.com':'exnova.com')+'/isolated-expiry-test');
  const ready=async(native,chart)=>page.waitForFunction(([n,c])=>
   document.getElementById('expiry').textContent===n&&document.getElementById('chart').textContent===c&&
   !window.__sentinelNativeExpiryKeeperV3.snapshot().repairing&&
   !window.__sentinelBrokerChartPeriodKeeperV1.snapshot().repairing,[native,chart],{timeout:12000});
  await ready('1 min','5 min');
  await page.locator('#expiry').click();await page.locator('#expiry-menu').getByRole('option',{name:'5 min',exact:true}).click();
  await page.locator('#chart').click();await page.locator('#chart-menu').getByRole('option',{name:'1 min',exact:true}).click();
  await page.waitForFunction(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs===300000&&
   window.__sentinelBrokerChartPeriodKeeperV1.snapshot().preferredSeconds===60);
  await page.reload();await ready('5 min','1 min');
  const mismatch=await page.evaluate(inspectNativeExpiryBeforeClick,{requiredDurationMs:60000});
  assert.equal(mismatch.blocked,true);assert.equal(mismatch.currentMs,300000);
  busy=true;await page.reload();await page.waitForTimeout(3200);
  assert.equal(await page.locator('#expiry').textContent(),'30 s','busy executor must prevent native repair');
  assert.equal(await page.locator('#chart').textContent(),'1 min','chart preference remains separate');
  busy=false;await ready('5 min','1 min');
  const childNavigation=page.waitForEvent('framenavigated',frame=>frame.url().endsWith('/isolated-child'));
  await page.evaluate(()=>{const child=document.createElement('iframe');child.src='/isolated-child';document.body.append(child);});
  const child=await childNavigation;
  // Match LocalPlaywrightDriver's existing framenavigated fallback as well
  // as the init script, including documents created after initial attach.
  await child.evaluate(installBrokerNativeExpiryKeeper,{provider});
  await child.waitForFunction(()=>document.getElementById('expiry')?.textContent==='5 min',null,{timeout:10000})
   .catch(async error=>{console.log('child-diagnostic',await child.evaluate(()=>({
    href:location.href,keeper:window.__sentinelNativeExpiryKeeperV3?.snapshot?.(),
    bridge:typeof window.__sentinelRequestNativeExpiryPermission,
    permission:window.__sentinelNativeExpiryPermissionV3,visibility:document.visibilityState,
    label:document.getElementById('expiry')?.textContent})));throw error;});
  assert.ok(renewals>0);
  console.log(JSON.stringify({provider,reload:true,manualSelection:true,livePermissionRenewals:renewals,
   busyClickProtected:true,childFrame:true,nativeAndChartIndependent:true,knownMismatchSkipped:true}));
  await context.close();
 }
}finally{await browser.close();}
