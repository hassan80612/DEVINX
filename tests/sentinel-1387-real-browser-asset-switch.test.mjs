import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const require=createRequire(new URL('../sentinel-trading-lab/agent/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const {wsServer:WebSocketServer}=require('./node_modules/playwright-core/lib/utilsBundle.js');
const available=existsSync(chromium.executablePath().replace(/chromium-\d+\/chrome-linux\/chrome$/,'chromium_headless_shell-1193/chrome-linux/headless_shell'));
function driver(page){const d=new LocalPlaywrightDriver({dataDir:'ignored'}),st=d.state('exnova');Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPUSDOTC',77);st.assets.add('EUR/USD OTC');st.assets.add('GBP/USD OTC');d.sessions.set('exnova',{page});d.requestMarketData=async()=>true;return {d,st};}
test('restored broker socket created BEFORE Agent attachment still identifies later selected asset',{skip:!available},async()=>{
 const server=createServer((_req,res)=>res.end('<script>window.ws=new WebSocket("ws://"+location.host);</script>'));
 const ws=new WebSocketServer({server});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ws?.readyState===1);
 const {d,st}=driver(page);await d.attachNetwork('exnova',page);
 await page.evaluate(()=>ws.send(JSON.stringify({name:'sendMessage',request_id:'switch-existing-socket',msg:{name:'get-candles',body:{active_id:77,size:60}}})));
 await page.waitForTimeout(250);assert.equal(st.activeId,77);assert.equal(st.symbol,'GBP/USD OTC');
 }finally{await browser.close();await new Promise(r=>ws.close(r));await new Promise(r=>server.close(r))}
});
test('cached selected tab in a child frame is confirmed after broker renders beyond 300ms',{skip:!available},async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<iframe style="width:800px;height:200px"></iframe>');const frame=page.frames()[1];
 await frame.setContent('<button role="tab" aria-selected="true" id="eur">EUR/USD OTC</button><button role="tab" aria-selected="false" id="gbp">GBP/USD OTC</button><script>gbp.onclick=()=>setTimeout(()=>{eur.setAttribute("aria-selected","false");gbp.setAttribute("aria-selected","true")},550)</script>');
 const {d,st}=driver(page);await d.installBridge(page,'exnova');await frame.locator('#gbp').click();await page.waitForTimeout(1450);
 assert.equal(st.activeId,77);assert.equal(st.symbol,'GBP/USD OTC');assert.equal(st.screenCandidateSymbol,null);
 }finally{await browser.close()}
});
test('OpenAI OTC named cached tab is read from the actual selected child-frame element',{skip:!available},async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<iframe style="width:800px;height:200px"></iframe>');const frame=page.frames()[1];
 await frame.setContent('<button role="tab" aria-selected="true" id="eur">EUR/USD OTC</button><button role="tab" aria-selected="false" id="stock">OpenAI (OTC)</button><script>stock.onclick=()=>{eur.setAttribute("aria-selected","false");stock.setAttribute("aria-selected","true")}</script>');
 const {d,st}=driver(page);st.activeMap.set('OPENAIOTC',9999);st.assets.add('OPENAI OTC');await d.installBridge(page,'exnova');await frame.locator('#stock').click();await page.waitForTimeout(500);
 assert.equal(st.activeId,9999);assert.equal(st.symbol,'OPENAI OTC');assert.equal(st.screenCandidateSymbol,null);
 }finally{await browser.close()}
});
test('periodic full DOM read cannot restore an inactive EUR/USD tab over selected OpenAI OTC',{skip:!available},async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<button role="tab" aria-selected="false">EUR/USD OTC</button><button role="tab" aria-selected="true">OpenAI (OTC)</button>');
 const {d,st}=driver(page);st.activeMap.set('OPENAIOTC',9999);st.assets.add('OPENAI OTC');st.symbol='OPENAI OTC';st.uiSymbol='OPENAI OTC';st.activeId=9999;st.quote=50;
 await d.domSnapshot('exnova');assert.equal(st.activeId,9999);assert.equal(st.symbol,'OPENAI OTC');
 }finally{await browser.close()}
});
