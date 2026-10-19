// Local broker-shaped fixtures only; calibration and parameter edits never trade.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {canvasControlBridge} from '../sentinel-trading-lab/agent/worker/canvas-executor-targets.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});const results=[];
try{for(const provider of ['iq_option','exnova']){
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}.editor{position:absolute;left:800px;width:130px;height:30px}.editor input{position:absolute;left:60px;width:65px}#amount{top:100px}#duration{top:160px}</style><canvas id="room" width="1000" height="800"></canvas><div class="editor" id="amount" role="combobox" aria-label="Valor"><span>Valor</span><input aria-label="Valor" value="1"></div><div class="editor" id="duration" role="combobox" aria-label="Expiração"><span>Tempo</span><input aria-label="Expiração (s)" data-duration-unit="s" value="30"></div>'}));await page.goto('https://fixture.invalid/traderoom');
 let saved;await page.exposeFunction('__sentinelOverlayAction',p=>{saved=p.binding;});await page.evaluate(()=>{window.directionClicks=0;document.querySelector('canvas').onclick=()=>window.directionClicks++;});
 const binding={format:'sentinel-canvas-targets-v1',origin:'https://fixture.invalid',path:'/traderoom',canvas:{id:'room',domPath:'html:1/body:1/canvas:1',width:1000,height:800,viewportWidth:1000,viewportHeight:800,pixelRatio:1},targets:{CALL:{x:900,y:300},PUT:{x:900,y:400},amount:{x:850,y:110},duration:{x:850,y:170}},durationUnit:'s'};
 // Reusing the exact old points must work, even with HTML controls above canvas.
 for(let round=0;round<2;round++){
  saved=null;await page.evaluate(canvasControlBridge,{action:'calibrate',binding,parametersOnly:true});await page.mouse.click(850,110);await page.mouse.click(850,170);assert.equal(saved,null);await page.locator('button[data-duration-unit="s"]').click();assert.ok(saved);assert.deepEqual(saved.targets,binding.targets);assert.equal(await page.evaluate(()=>window.directionClicks),0);
 }
 const driver={sessions:new Map([[provider,{page}]]),state:()=>({symbol:'EUR/USD OTC',activeId:76})};const ui=new BrokerUiExecutor(driver);ui.restoreBindings({[provider]:saved});
 await ui.prepare(provider,{asset:'EUR/USD OTC',activeId:76,amount:4,durationMs:60000});assert.equal(await page.locator('#amount input').inputValue(),'4');assert.equal(await page.locator('#duration input').inputValue(),'60');assert.equal(await page.evaluate(()=>window.directionClicks),0);
 results.push({provider,samePointsRemappedTwice:true,htmlAboveCanvasMapped:true,nestedComboboxEditorIdentified:true,mappedFieldLabelResolvesItsSingleEditor:true,stakeCommitted:4,expiryCommittedMs:60000,directionClicks:0});await page.close();
}await writeFile('reports/sentinel-13948-remap-browser-fixture.json',JSON.stringify({realBrokerOrders:false,results},null,2)+'\n');console.log(JSON.stringify(results));}finally{await browser.close();}
