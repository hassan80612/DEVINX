// Real DOM/event/reload checks against isolated HTML only. No broker session.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {installBrokerNativeExpiryKeeper,nativeExpiryMappingCommand,observeNativeExpiryForClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
const html=label=>`<html><body><div class="chart-period" style="position:absolute;left:15px;top:70px">1m</div><button id="call" style="position:absolute;right:20px;top:400px">CALL</button>
<div id="order-box" style="position:absolute;right:20px;top:80px;width:150px;height:80px;background:#ddd">${label?'<div class="label">Tempo</div>':''}<div id="order-value" style="display:inline-block;min-width:90px;height:30px">00:30</div></div>
<div id="choices" style="display:none;position:absolute;right:20px;top:170px;width:150px;background:#aaa"><div class="item" data-value="30">00:30</div><div class="item" data-value="60">01:00</div><div class="item" data-value="300">05:00</div></div>
<script>window.calls=0;document.getElementById('call').onclick=()=>window.calls++;document.getElementById('order-box').onclick=()=>document.getElementById('choices').style.display='block';document.querySelectorAll('.item').forEach(el=>el.onclick=()=>{document.getElementById('order-value').textContent=el.textContent;document.getElementById('choices').style.display='none'});</script></body></html>`;
const snapshot=page=>page.evaluate(()=>window.__sentinelNativeExpiryKeeperV3?.snapshot());
async function poll(p,elapsed=5000){await p.evaluate(ms=>{window.__expiryTestNow+=ms;window.__sentinelNativeExpiryPermissionV3={provider:window.__expiryTestProvider,allowed:true,at:Date.now()};window.__sentinelNativeExpiryKeeperV3.poll({urgent:true});},elapsed);}
async function install(p,provider,preferredMs,allowEmbedded=false){await p.evaluate(({provider,preferredMs})=>{window.__expiryNativeClock=Date.now;window.__expiryTestProvider=provider;window.__expiryTestNow=Date.now()+20000;Date.now=()=>window.__expiryTestNow;localStorage.setItem('sentinel-broker-native-expiration-preference-v3:'+provider,String(preferredMs));window.__sentinelNativeExpiryPermissionV3={provider,allowed:true,at:Date.now()};},{provider,preferredMs});await p.evaluate(installBrokerNativeExpiryKeeper,{provider,requestedMs:preferredMs,allowEmbedded});}
try{
 for(const provider of ['exnova','iq_option'])for(const preferredMs of [30000,60000,300000]){
  const ctx=await b.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage();let labelled=true;
  await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:html(labelled)}));
  const origin=provider==='exnova'?'https://exnova.com':'https://iqoption.com';await p.goto(origin+'/isolated-expiry');await install(p,provider,preferredMs);
  assert.equal((await snapshot(p)).currentMs,30000,'plain labelled div must be discovered automatically');
  await poll(p);await p.waitForFunction(ms=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms,preferredMs);
  assert.equal(await p.locator('#order-value').textContent(),preferredMs===30000?'00:30':preferredMs===60000?'01:00':'05:00');
  // Explicitly map a skin with no semantic label, preserving the prior choice.
  await p.evaluate(()=>window.__sentinelNativeExpiryKeeperV3.dispose());labelled=false;await p.reload();await install(p,provider,preferredMs);
  assert.equal((await snapshot(p)).currentMs,null);
  await p.evaluate(nativeExpiryMappingCommand,{mode:'arm',id:7});
  await p.locator('#call').click();assert.equal(await p.evaluate(()=>window.calls),0,'mapping must consume accidental CALL clicks');
  assert.equal((await snapshot(p)).mapping.armed,true);
  await p.locator('.chart-period').click();assert.equal((await snapshot(p)).mapping.saved,false);
  await p.locator('#order-value').click();assert.equal((await snapshot(p)).mapping.saved,true);assert.equal((await snapshot(p)).mapping.armed,false);
  await poll(p);await p.waitForFunction(ms=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms,preferredMs);
  assert.equal((await snapshot(p)).discoverySource,'mapped');
  await p.evaluate(()=>{document.getElementById('order-value').outerHTML='<div id="order-value" style="display:inline-block;min-width:90px;height:30px">00:30</div>';});
  await poll(p);await p.waitForFunction(ms=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms,preferredMs);

  // Same page reload: saved selector must find the real field and restore it.
  await p.reload();await install(p,provider,preferredMs);await poll(p);await p.waitForFunction(ms=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===ms,preferredMs);
  assert.equal((await snapshot(p)).mapping.status,'mapped');
  const telemetry=await p.evaluate(observeNativeExpiryForClick,{provider,requiredDurationMs:preferredMs});assert.equal(telemetry.blocked,false);assert.equal(telemetry.currentMs,preferredMs);
  // A real manual 30s selection must remain 30s rather than being repaired away.
  await p.locator('#order-value').click();await p.locator('.item[data-value="30"]').click();await p.waitForFunction(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs===30000);await poll(p,15000);assert.equal((await snapshot(p)).preferredMs,30000);assert.equal((await snapshot(p)).currentMs,30000);
  console.log(JSON.stringify({provider,preferredMs,automaticRead:true,automaticRestore:true,optionalMapping:true,reload:true,manual30Respected:true,noTrade:true}));
  await ctx.close();
 }
 const ctx=await b.newContext({viewport:{width:1280,height:800}}),p=await ctx.newPage();
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:r.request().url().includes('embedded-child')?html(false):'<html><body><iframe style="width:1200px;height:700px" src="https://broker-frame.example/embedded-child"></iframe></body></html>'}));
 await p.goto('https://exnova.com/isolated-frames');const f=p.frames().find(f=>f!==p.mainFrame());
 await install(p,'exnova',60000);await install(f,'exnova',60000,true);
 for(const surface of[p,f])await surface.evaluate(()=>{Date.now=window.__expiryNativeClock;window.__sentinelNativeExpiryPermissionV3.at=Date.now();window.__sentinelNativeExpiryKeeperV3.poll();});
 const mappingId=Date.now();await p.evaluate(nativeExpiryMappingCommand,{mode:'arm',id:mappingId});await f.evaluate(nativeExpiryMappingCommand,{mode:'arm',id:mappingId});
 await f.locator('#order-value').click();await f.waitForFunction(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs===60000);
 await p.waitForFunction(()=>window.__sentinelNativeExpiryKeeperV3.snapshot().mapping.armed===false);
 assert.equal((await p.evaluate(observeNativeExpiryForClick,{provider:'exnova',requiredDurationMs:60000})).currentMs,60000,'click frame can use the actual mapped field in another frame');
 await p.evaluate(()=>window.postMessage({type:'sentinel-native-expiry-status-v1',senderId:'fake',report:{provider:'exnova',id:'fake',at:Date.now(),currentMs:30000,mappingStatus:'mapped'}},'*'));
 assert.equal((await p.evaluate(observeNativeExpiryForClick,{provider:'exnova',requiredDurationMs:60000})).currentMs,60000,'an unrelated window cannot replace a mapped frame receipt');
 console.log(JSON.stringify({embeddedFrameMapping:true,otherFramesDisarmed:true,readAcrossFrames:true,unknownWindowIgnored:true}));await ctx.close();
}finally{await b.close();}
