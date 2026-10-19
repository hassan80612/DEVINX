// Synthetic delayed, zero-size browser-native editors; no broker connections.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {BrokerTradeParameters} from '../sentinel-trading-lab/agent/worker/broker-trade-parameters.mjs';
import {BrokerTradeParameters as PreviousParameters} from '../tests/fixtures/sentinel-13946-parameter-reference.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});const results=[];
try{for(const provider of ['iq_option','exnova']){
 const page=await browser.newPage({viewport:{width:1000,height:800}});await page.setContent('<style>body{margin:0}</style><canvas id="room" width="1000" height="800"></canvas><native-editors></native-editors>');
 await page.evaluate(()=>{
  const host=document.querySelector('native-editors'),root=host.attachShadow({mode:'open'});root.innerHTML='<input id="stake" aria-label="Valor" value="1" style="position:fixed;width:0;height:0;padding:0;border:0;opacity:0;display:none"><input id="expiry" aria-label="Expiração (s)" data-duration-unit="s" value="30" style="position:fixed;width:0;height:0;padding:0;border:0;opacity:0;display:none">';window.model={stake:'1',expiry:'30'};window.directionClicks=0;window.keyEvents=0;
  document.querySelector('canvas').onclick=e=>{if(e.clientY>=250){window.directionClicks++;return;}const id=e.clientY<140?'stake':'expiry';setTimeout(()=>{const input=root.getElementById(id);input.style.display='block';input.value=window.model[id];input.focus();let typed=false;input.onkeydown=event=>{if(event.key.length===1){typed=true;window.keyEvents++;}};input.onblur=()=>{if(typed)window.model[id]=input.value;input.style.display='none';};},50);};
 });
 const driver={sessions:new Map([[provider,{page}]])},controls={frame:page,canvasSelector:'#room',positions:{amount:{x:850,y:110},duration:{x:850,y:160}}};
 await assert.rejects(new PreviousParameters(driver).apply(provider,controls,{amount:4,durationMs:60000}),/Campo de valor/);
 await page.waitForTimeout(80);await page.keyboard.press('Tab');
 const result=await new BrokerTradeParameters(driver).apply(provider,controls,{amount:4,durationMs:60000});assert.deepEqual(result,{amount:4,durationMs:60000});
 assert.deepEqual(await page.evaluate(()=>window.model),{stake:'4',expiry:'60'});assert.equal(await page.evaluate(()=>window.directionClicks),0);assert.ok(await page.evaluate(()=>window.keyEvents)>0);
 results.push({provider,previousMappedEditorFails:true,delayedShadowEditorDetected:true,zeroSizeFocusedEditorTyped:true,keyboardCommitVerified:true,directionClicks:0,stake:4,durationMs:60000});await page.close();
}await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13947-native-editor-fixture.json',JSON.stringify({realBrokerTested:false,results},null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}
