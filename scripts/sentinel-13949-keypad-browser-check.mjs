import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {installCanvasKeyboardFocus} from '../sentinel-trading-lab/agent/worker/broker-keypad.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});const results=[];
try{for(const provider of ['iq_option','exnova']){
 const page=await browser.newPage({viewport:{width:1000,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<style>body{margin:0}#trade{position:absolute;left:700px;top:100px}#presets,#pad,#expiryMenu{display:none}#pad{width:170px}#pad button{width:50px;height:40px}#outside{position:absolute;left:10px;top:10px}</style><input id="outside" aria-label="Outro campo"><div id="trade"><input id="amount" aria-label="Investimento" readonly value="1"><div id="presets"><button id="calc"><svg class="calculator-icon" width="20" height="20"><rect width="20" height="20"></rect></svg></button><div id="pad">${['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k=>`<button ${k==='⌫'?'aria-label="Backspace"':''} data-key="${k==='⌫'?'backspace':k}">${k}</button>`).join('')}</div></div><div id="expiry" role="combobox" aria-label="Expiração">Expiração <span>30 seg</span></div><ul id="expiryMenu"><li>5 seg</li><li>10 seg</li><li>15 seg</li><li>30 seg</li><li>1 min</li></ul><button id="call">ACIMA</button><button id="put">ABAIXO</button></div>`);
 await page.evaluate(()=>{
  window.orders=0;window.raw='1';const el=id=>document.getElementById(id);
  el('amount').onclick=()=>{el('presets').style.display=el('presets').style.display==='block'?'none':'block';};
  el('calc').onclick=()=>el('pad').style.display='block';
  el('pad').onclick=e=>{const k=e.target.dataset.key;if(!k)return;window.raw=k==='backspace'?window.raw.slice(0,-1):window.raw+k;el('amount').value=window.raw;};
  el('expiry').onclick=()=>el('expiryMenu').style.display=el('expiryMenu').style.display==='block'?'none':'block';
  for(const li of el('expiryMenu').children)li.onclick=()=>{el('expiry').querySelector('span').textContent=li.textContent;el('expiryMenu').style.display='none';};
  el('call').onclick=el('put').onclick=()=>window.orders++;
 });
 const driver={sessions:new Map([[provider,{page}]]),state:()=>({symbol:'EUR/USD OTC',activeId:76})};const ui=new BrokerUiExecutor(driver);let manualAllowed=true;
 await page.exposeFunction('__sentinelOverlayAction',payload=>ui.manualKey(provider,payload,()=>manualAllowed));
 await ui.prepare(provider,{asset:'EUR/USD OTC',activeId:76,amount:4.25,durationMs:60000});assert.equal(await page.locator('#amount').inputValue(),'4.25');assert.equal(await page.locator('#expiry span').textContent(),'1 min');assert.equal(await page.evaluate(()=>window.orders),0);
 // A physical keyboard edits the same read-only field through its real keypad.
 await page.locator('#amount').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('2.5');await page.waitForFunction(()=>document.getElementById('amount').value==='2.5');await page.keyboard.press('Backspace');await page.waitForFunction(()=>document.getElementById('amount').value==='2.');await page.keyboard.type('8');await page.waitForFunction(()=>document.getElementById('amount').value==='2.8');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('presets').style.display==='none');
 await page.locator('#outside').fill('abc');await page.locator('#outside').press('3');assert.equal(await page.locator('#outside').inputValue(),'abc3');assert.equal(await page.locator('#amount').inputValue(),'2.8');
 manualAllowed=false;await assert.rejects(ui.manualKey(provider,{key:'9'},()=>manualAllowed),/Pare o bot/);assert.equal(await page.locator('#amount').inputValue(),'2.8');
 assert.equal(await page.evaluate(()=>window.orders),0);assert.deepEqual(errors,[]);results.push({provider,readonlyAmountSetByMouse:true,decimalAmountVerified:4.25,popupMinuteSelected:true,physicalKeyboardForwarded:true,ctrlAAndBackspaceAndEnter:true,unrelatedInputPreserved:true,runningBotRejectsManualEdits:true,realBrokerOrders:false});await page.close();
}
const page=await browser.newPage();await page.setContent('<canvas width="300" height="200"></canvas><input id="real">');await page.evaluate(()=>{window.typed='';document.querySelector('canvas').onkeydown=e=>window.typed+=e.key;});await page.mouse.click(30,30);await page.keyboard.type('1');assert.equal(await page.evaluate(()=>window.typed),'');await page.evaluate(installCanvasKeyboardFocus);await page.mouse.click(30,30);await page.waitForFunction(()=>document.activeElement.tagName==='CANVAS');await page.keyboard.type('2');assert.equal(await page.evaluate(()=>window.typed),'2');await page.evaluate(()=>{document.querySelector('canvas').addEventListener('pointerup',()=>document.getElementById('real').focus());});await page.mouse.click(30,30);await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>document.activeElement.id),'real');await page.close();results.push({canvasKeyboardFocusRestored:true,realEditorFocusPreserved:true});
await writeFile('reports/sentinel-13949-keypad-browser-fixture.json',JSON.stringify({results,nativeWindowsTested:false,realBrokerTested:false},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}
