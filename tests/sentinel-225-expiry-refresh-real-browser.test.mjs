import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';

const pageHtml=`<!doctype html><html><head><style>
body{margin:0;font:14px Arial;background:#15171b;color:#eee}
#chart{position:absolute;top:35px;left:20px;width:800px;height:500px}
#chart-timeframe{position:absolute;top:10px;left:50px}
#trade-panel{position:absolute;right:16px;top:100px;width:245px;background:#262e35;padding:16px}
.expiration-row{display:flex;flex-direction:column;gap:4px;position:relative}
.expiration-caption{font-size:12px}
#expiry-toggle{height:34px;text-align:left;background:#202932;color:white;border:1px solid #647480;cursor:pointer}
#expiry-popup{display:none;background:#33404a;position:absolute;top:54px;left:0;width:100%;z-index:3}
#expiry-popup button{display:block;width:100%;height:30px;background:#33404a;color:white;border:0}
</style></head><body><div id="chart">CHART <b id="chart-timeframe">30 s</b></div>
<div id="trade-panel"></div><script>
const choices=['30 s','1 min','5 min'];
window.mountBrokerPicker=function(defaultLabel='30 s'){
 const panel=document.getElementById('trade-panel');
 panel.innerHTML='<div class="expiration-row"><span class="expiration-caption">Expiration</span><button id="expiry-toggle" type="button">'+defaultLabel+'</button></div><div id="expiry-popup">'+choices.map(x=>'<button role="option" data-choice="'+x+'">'+x+'</button>').join('')+'</div>';
 const opener=document.getElementById('expiry-toggle'),popup=document.getElementById('expiry-popup');
 opener.addEventListener('click',()=>popup.style.display=popup.style.display==='block'?'none':'block');
 popup.addEventListener('click',event=>{
  const choice=event.target.closest('[data-choice]');if(!choice)return;
  opener.textContent=choice.dataset.choice;popup.style.display='none';
 });
};
window.mountBrokerPicker();
</script></body></html>`;
async function withBrowser(testFunc){
 const {chromium}=await import('../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs');
 const useEdge=process.env.SENTINEL_TEST_EDGE==='1';
 const browser=await chromium.launch(useEdge?{channel:'msedge',headless:true}:{headless:true,executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route('https://exnova.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:pageHtml}));
  await page.goto('https://exnova.com/traderoom');
  await testFunc(page);
 }finally{await browser.close()}
}
for(const [ms,label] of [[60000,'1 min'],[300000,'5 min']]){
 test('225 real Edge: Exnova SPA rebuild restores chosen '+label+' without changing chart 30s',async()=>{
  await withBrowser(async page=>{
   await page.evaluate(({ms})=>{
    localStorage.setItem('sentinel-broker-native-expiration-preference-v3:exnova',String(ms));
    localStorage.setItem('sentinel-broker-native-expiration-preference-v3:exnova:selectedAt',String(Date.now()-3000));
    window.__sentinelRequestNativeExpiryPermission=()=>Promise.resolve({provider:'exnova',at:Date.now(),allowed:true});
    window.__sentinelGetNativeExpiryChoice=()=>Promise.resolve({durationMs:ms,selectedAt:Date.now()-3000});
    window.__sentinelNativeExpiryPermissionV3={provider:'exnova',at:Date.now(),allowed:true};
   },{ms});
   await page.evaluate(installBrokerNativeExpiryKeeper,{provider:'exnova',requestedMs:ms,requestedAt:Date.now()-3000});
   await page.waitForFunction(label=>document.querySelector('#expiry-toggle')?.textContent===label,label,{timeout:12000});
   const before=await page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.snapshot());
   assert.equal(before.currentMs,ms);assert.equal(before.preferredMs,ms);
   // Broker wipes its native picker on quote/asset refresh without a navigation.
   await page.evaluate(()=>window.mountBrokerPicker('30 s'));
   await page.waitForFunction(label=>document.querySelector('#expiry-toggle')?.textContent===label,label,{timeout:12000});
   const after=await page.evaluate(()=>({
    snapshot:window.__sentinelNativeExpiryKeeperV3.snapshot(),
    chart:document.querySelector('#chart-timeframe').textContent,
    picker:document.querySelector('#expiry-toggle').textContent
   }));
   assert.equal(after.snapshot.currentMs,ms);
   assert.equal(after.picker,label);assert.equal(after.chart,'30 s');
  });
 });
}
