import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {brokerInputProbe,normalizeInputDiagnostic} from '../sentinel-trading-lab/agent/worker/broker-input-diagnostic.mjs';
import {installCanvasKeyboardFocus} from '../sentinel-trading-lab/agent/worker/broker-keypad.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});const results=[];
try{for(const provider of ['iq_option','exnova']){
 const page=await browser.newPage();const raw=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('__sentinelOverlayAction',p=>{assert.equal(p.action,'executor-input-diagnostic');raw.push(p.diagnostic);});
 await page.setContent('<canvas width="400" height="250"></canvas><input id="native" value="private-value"><button id="call">CALL</button><button id="put">PUT</button><div id="qt-shadow-container"></div><div id="sentinel-trading-overlay-host"></div>');
 await page.evaluate(()=>{window.orders=0;for(const id of ['call','put'])document.getElementById(id).onclick=()=>window.orders++;document.getElementById('qt-shadow-container').attachShadow({mode:'open'}).innerHTML='<input id="clipboard" type="text" value="never-read-this" style="width:0;height:0;padding:0;border:0">';document.getElementById('sentinel-trading-overlay-host').attachShadow({mode:'open'}).innerHTML='<input value="excluded-analyst-input">';});
 await page.evaluate(installCanvasKeyboardFocus);const before=await page.locator('#native').inputValue();await page.evaluate(brokerInputProbe,{action:'start'});assert.equal(await page.locator('#native').inputValue(),before);assert.equal(await page.evaluate(()=>window.orders),0);
 await page.mouse.click(50,50);await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY');
 await page.locator('#native').click();await page.keyboard.type('9137');await page.evaluate(brokerInputProbe,{action:'stop'});await page.waitForFunction(()=>!window.__sentinelInputProbeActive);await page.waitForTimeout(20);
 const d=normalizeInputDiagnostic(raw.at(-1));assert.equal(d.active,false);assert.equal(d.fieldCount,2);assert.equal(d.fields.some(x=>x.qt&&x.clipboard&&x.width===0),true);assert.equal(d.events.keydown,4);assert.equal(d.events.input,4);assert.equal(d.events.beforeinput,4);assert.equal(d.events.prevented,0);assert.equal(await page.evaluate(()=>window.orders),0);
 const serialized=JSON.stringify(raw);for(const secret of ['private-value','never-read-this','excluded-analyst-input','9137'])assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('"value"'),false);assert.equal(serialized.includes('"key"'),false);
 await page.mouse.click(50,50);await page.waitForFunction(()=>document.activeElement.tagName==='CANVAS');
 // Re-arming does not duplicate key listeners, and stop removes the listener.
 await page.evaluate(brokerInputProbe,{action:'start'});await page.evaluate(brokerInputProbe,{action:'start'});await page.locator('#native').click();await page.keyboard.type('2');await page.evaluate(brokerInputProbe,{action:'stop'});await page.waitForTimeout(20);assert.equal(raw.at(-1).events.keydown,1);const count=raw.length;await page.keyboard.type('3');await page.waitForTimeout(20);assert.equal(raw.length,count);assert.deepEqual(errors,[]);
 results.push({provider,readOnlyProbe:true,noValuesOrKeyNames:true,shadowFieldClassified:true,analystInputsExcluded:true,keyboardEventCountsVerified:true,noDuplicateListeners:true,focusHelperPausedThenRestored:true,realOrders:0});await page.close();
}await writeFile('reports/sentinel-13950-input-probe-browser-fixture.json',JSON.stringify({realBrokerTested:false,nativeWindowsTested:false,results},null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}
