// Isolated native overlay: no broker session, quotations or order buttons.
import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const Baseline=process.env.SENTINEL_BASELINE_DRIVER?(await import(process.env.SENTINEL_BASELINE_DRIVER)).LocalPlaywrightDriver:null;
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
const reading='CONTINUIDADE PERDENDO FORÇA · CALL';
try{
 for(const durationMs of [30000,60000,300000]){
  const p=await b.newPage({viewport:{width:1100,height:850}});
  await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html><body>Isolated compact card</body></html>'}));
  await p.goto('https://exnova.com/isolated-card');
  const now=Date.now(),data={engine:'automatic',asset:'EURUSD',validatedAsset:'EURUSD',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.177',durationMs,price:1.1,
   autoExecutor:{enabled:true,sessionWins:2,sessionLosses:1},
   vnext:{mode:'now',engineId:'automatic',nowObservation:{ready:false,reason:'observing-now',observedAt:now,quoteAt:now,evaluatedAt:now,marketReading:reading},
    opportunityWindow:{phase:'fired',windowStartedAt:now-3000,windowEndsAt:now+durationMs,side:'CALL'},
    futureEntryAnchor:{engineId:'automatic',asset:'EURUSD',side:'CALL',delaySeconds:durationMs/1000,holdingSeconds:durationMs/1000,issuedAt:now-3000,entryAt:now-3000,entryTriggeredAt:now-3000,exitAt:now+durationMs,projectedEntryPrice:1.1}}};
  const render=async Driver=>{const d=new Driver();d.session=async()=>({page:p,background:false});await d.updateOverlay('exnova',data);return d;};
  let before=null;if(Baseline){await render(Baseline);before=(await p.locator('[data-sentinel-role="horizon-outlook"]').first().boundingBox()).height;}
  await render(LocalPlaywrightDriver);
  const card=p.locator('[data-sentinel-role="horizon-outlook"]').first(),phase=p.locator('[data-sentinel-market-phase]');
  assert.match(await p.locator('[data-sentinel-decision-label]').textContent(),/OPERAÇÃO EM ANDAMENTO/);
  const height=(await card.boundingBox()).height;if(before!=null)assert.ok(height<=before-10,JSON.stringify({before,height}));
  for(const selector of ['[data-sentinel-vnext-clock-value]','[data-sentinel-executor-clock-wl]','[data-sentinel-entry-price]','[data-sentinel-current-quote]'])assert.ok(await p.locator(selector).isVisible(),selector);
  assert.equal(await phase.evaluate(el=>getComputedStyle(el).fontSize),'11px');
  for(const text of ['',reading,'REVERSÃO EM TESTE · PUT']){
   await p.evaluate(text=>{const o=window.__sentinelLastOverlayData.vnext.nowObservation;o.marketReading=text;o.evaluatedAt=o.quoteAt=Date.now();
    document.getElementById('sentinel-trading-overlay-host').shadowRoot.getElementById('sentinel-trading-overlay').__sentinelTargetClockTick();},text);
   assert.equal((await card.boundingBox()).height,height);
  }
  const long='REVERSÃO EM TESTE · PUT · COTAÇÃO ATRASADA · ÚLTIMA LEITURA · CONTEXTO DO PREÇO AINDA SENDO ATUALIZADO';
  await phase.evaluate((el,long)=>el.textContent=long,long);
  assert.equal(await phase.textContent(),long);
  assert.equal(await phase.evaluate(el=>getComputedStyle(el).whiteSpace),'normal');
  assert.ok(await phase.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'all lines must remain visible');
  assert.equal(await phase.evaluate(el=>getComputedStyle(el).overflow),'visible');
  if(durationMs===60000)await p.screenshot({path:'/workspace/scratch/3599ae2f921b/177-compact-card.png',fullPage:true});
  console.log(JSON.stringify({durationMs,beforeHeight:before,afterHeight:height,compactWithoutHiddenFields:true,shortReadingStable:true,longReadingFullyVisible:true}));
  await p.close();
 }
}finally{await b.close()}
