import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
const markup=`<!doctype html><html><head><style>
body{font:14px Arial;margin:0}.trade-panel{position:fixed;right:8px;top:90px;width:190px}
.expiry-field{height:56px;border:1px solid #888}
.expiry-label{display:block;height:20px}
#native-expiry{height:28px;width:120px}
#popup{position:fixed;right:8px;top:148px;width:150px;background:white}
#popup>div{height:30px;cursor:pointer;padding:3px}
</style></head><body><div class="trade-panel"><div class="expiry-field">
<span class="expiry-label">Expiration</span><button id="native-expiry" type="button">30 sec</button>
</div></div><script>
const button=document.getElementById('native-expiry');
button.onclick=()=>{
 const old=document.getElementById('popup');if(old){old.remove();return}
 const portal=document.createElement('div');portal.id='popup';
 for(const duration of ['30 sec','1 min','5 min']){
  const row=document.createElement('div');row.textContent=duration;
  row.onclick=()=>{button.textContent=duration;portal.remove()};
  portal.appendChild(row);
 }
 document.body.appendChild(portal);
};
</script></body></html>`;
test('native 1m survives Exnova broker reload with a split label and plain popup rows',async()=>{
 const {chromium}=await import('../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  let permission=true,preference={durationMs:60000,selectedAt:Date.now()-25000};
  await page.route('https://exnova.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:markup}));
  await page.exposeFunction('__sentinelGetNativeExpiryChoice',()=>preference);
  await page.exposeFunction('__sentinelRememberNativeExpiryChoice',async(ms,at)=>{preference={durationMs:ms,selectedAt:at};return true});
  await page.exposeFunction('__sentinelRequestNativeExpiryPermission',()=>({provider:'exnova',at:Date.now(),allowed:permission}));
  await page.addInitScript(installBrokerNativeExpiryKeeper,{provider:'exnova'});
  for(let attempt=0;attempt<2;attempt++){
   if(attempt)await page.reload({waitUntil:'load'});
   else await page.goto('https://exnova.com/traderoom',{waitUntil:'load'});
   const state=await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3?.snapshot());
   assert.ok(state,'must install native keeper on each broker document');
   const result=await page.waitForFunction(()=>document.getElementById('native-expiry')?.textContent==='1 min',null,{timeout:12000}).catch(()=>null);
   assert.ok(result,`Expired at 30 sec after broker refresh ${attempt}: ${JSON.stringify(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3?.snapshot()))}`);
   assert.equal(await page.locator('#native-expiry').textContent(),'1 min');
   assert.equal(preference.durationMs,60000,'auto restore must never overwrite user preference');
  }
 }finally{await browser.close()}
});
test('same restore preserves 5m explicitly and never treats chart timeframe as expiry',async()=>{
 const {chromium}=await import('../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),preference={durationMs:300000,selectedAt:Date.now()-20000};
  await page.route('https://exnova.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:markup.replace('<body>','<body><div style="position:fixed;top:20px;left:10px" aria-label="chart timeframe">1 min</div>')}));
  await page.exposeFunction('__sentinelGetNativeExpiryChoice',()=>preference);
  await page.exposeFunction('__sentinelRequestNativeExpiryPermission',()=>({provider:'exnova',at:Date.now(),allowed:true}));
  await page.addInitScript(installBrokerNativeExpiryKeeper,{provider:'exnova'});
  await page.goto('https://exnova.com/traderoom');
  const result=await page.waitForFunction(()=>document.getElementById('native-expiry')?.textContent==='5 min',null,{timeout:12000}).catch(()=>null);
  assert.ok(result,JSON.stringify(await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3?.snapshot())));
  assert.equal(await page.locator('[aria-label="chart timeframe"]').textContent(),'1 min');
 }finally{await browser.close()}
});
