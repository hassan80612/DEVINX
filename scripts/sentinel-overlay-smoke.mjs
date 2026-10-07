import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

const server=http.createServer((_req,res)=>{res.end('<html><body style="background:#18282a">Sentinel overlay test</body></html>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const driver=new LocalPlaywrightDriver();driver.session=async()=>({page,background:false});
  const now=Date.now(),plan={asset:'TEST',generatedAt:now,confidence:80,modelConfidence:80,callProbability:80,putProbability:20,displayBias:'CALL',outlookReady:true,directionReady:true,currentPrice:100,callTrigger:102,putTrigger:98,callInvalidation:90,putInvalidation:110,validation:{decisionSamples:0}};
  const operational={asset:'TEST',side:'CALL',state:'JANELA ABERTA',createdAt:now,entryWindowEndAt:now+60000,targetAt:now+60000,forecastHorizonSeconds:60,durationMs:30000,sideSupported:true,trigger:101,invalidation:90,technicalConfidence:80,reason:'Aguardando gatilho fixo.'};
  const data={asset:'TEST',validatedAsset:'TEST',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',demoAutopilot:true,executionReady:false,brokerMode:'demo',agentVersion:'13.4.0',forecastHorizonSeconds:60,durationMs:30000,strategyCards:[{slot:1,active:true,label:'Smart Confluence',projectionHorizonSeconds:60,side:'CALL',callPct:70,putPct:30,why:'Tendência e estrutura em confirmação.'},{slot:2,active:true,label:'Price Action',projectionHorizonSeconds:60,side:'AGUARDAR',callPct:53,putPct:47,why:'Aguardando reação na região do preço.'},{slot:3,active:true,label:'Mean Reversion',projectionHorizonSeconds:60,side:'PUT',callPct:38,putPct:62,why:'Exaustão sem confirmação da reversão.'}],metrics:{shortModel:{ready:true}},entryPlanner:{horizons:{'60':plan}},operationalSignal:operational};
  const card=page.locator('[data-sentinel-card="horizon"]');
  assert.equal(await driver.updateOverlay('iq_option',data),true);
  assert.match(await page.locator('[data-sentinel-pilot-status]').innerText(),/PILOTO LIGADO.*AGUARDANDO BOTÕES/);
  const broker=driver.state('iq_option');Object.assign(broker,{symbol:'TEST',uiSymbol:'TEST',mode:'demo'});
  await driver.scanExecutionUi('iq_option');
  assert.equal(broker.executionUi.expirationDurationMs,null,'Sentinel expiry selector must never count as broker expiry');
  assert.equal(broker.executionReady,false,'Sentinel controls must never count as order controls');
  await page.evaluate(()=>{const panel=document.createElement('section');panel.id='broker-panel';panel.innerHTML='<button data-test="deal-button-up">CALL</button><button data-test="deal-button-down">PUT</button><label>Valor <input name="amount" placeholder="Valor"></label><button data-test="expiration">30 s</button>';document.body.append(panel)});
  await driver.scanExecutionUi('iq_option');
  assert.equal(broker.executionReady,true);assert.equal(broker.expirationDurationMs,30000);
  await page.evaluate(()=>{
    document.getElementById('broker-panel').remove();
    window.testOrders=0;const host=document.createElement('div');host.id='closed-broker-panel';document.body.append(host);
    const root=host.attachShadow({mode:'closed'});root.innerHTML='<button>ACIMA</button><button>ABAIXO</button><label>Valor <input name="amount" value="10"></label><button data-test="expiration">30 s</button>';
    root.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>window.testOrders++));
  });
  driver.session=async()=>({page,context:page.context(),background:false});
  const native=await driver._domExecutionUi('iq_option');
  assert.equal(native.buy,true);assert.equal(native.sell,true);assert.equal(native.amount,true);assert.equal(native.expirationDurationMs,30000);
  assert.ok(native.ax.buyBackendId);assert.ok(native.ax.sellBackendId);assert.notEqual(native.ax.buyBackendId,native.ax.sellBackendId);
  await driver.scanExecutionUi('iq_option');assert.equal(broker.executionReady,true);
  assert.equal(await page.evaluate(()=>window.testOrders),0,'read-only recognition must not click an order');
  // Accessibility scans can outlive feed freshness on a busy Windows runner.
  // Supply the next simulated worker frame before checking a live scenario.
  await driver.updateOverlay('iq_option',data);
  assert.match(await card.innerText(),/CALL · CENÁRIO ATIVO/);
  assert.match(await card.innerText(),/FECHA EM/);
  assert.match(await card.innerText(),/MODELO 80 pts/);
  assert.match(await card.innerText(),/Em teste: 0\/60 sinais/);
  assert.match(await card.innerText(),/101\.000/,'display must show the locked engine trigger');
  assert.doesNotMatch(await card.innerText(),/102\.000/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sentinel-future-decision-v13|TEST|60')),null);
  const justBefore=Date.now();
  const entered={...operational,state:'ENTRADA',ready:true,actionable:true,entryAt:justBefore,activeUntil:justBefore+500};
  await driver.updateOverlay('iq_option',{...data,operationalSignal:entered});
  assert.match(await card.innerText(),/ENTRAR AGORA/);
  await page.waitForTimeout(650);
  await page.evaluate(()=>window.__sentinelRenderOverlay(window.__sentinelLastOverlayData));
  assert.match(await card.innerText(),/CALL · CENÁRIO ATIVO/);assert.match(await card.innerText(),/ACOMPANHANDO · ENTRADA ENCERRADA/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  await driver.updateOverlay('iq_option',{...data,operationalSignal:{...operational,state:'ACOMPANHANDO',activeUntil:justBefore+500,entryAt:justBefore,reason:'Oportunidade de entrada encerrada; cenário mantido até o prazo, sem liberar nova entrada.'}});
  assert.match(await card.innerText(),/CALL · ACOMPANHANDO/);
  await driver.updateOverlay('iq_option',data);
  const originalNodes=await page.evaluate(()=>{
    const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
    window.retainedHorizon=root.querySelector('[data-sentinel-card="horizon"]');
    window.retainedSelect=root.querySelector('[data-sentinel-plan-horizon]');
    return {height:window.retainedHorizon.getBoundingClientRect().height};
  });
  for(let i=0;i<8;i++){
    await driver.updateOverlay('iq_option',{...data,operationalSignal:{...operational,state:i%2?'AGUARDAR PRAZO':'JANELA ABERTA',sideSupported:i%2===0,reason:i%2?'Entrada bloqueada: a previsão de 30s precisa confirmar o mesmo lado, a porcentagem e os pontos mínimos.':'Janela aberta; aguardando o preço atingir o gatilho.'}});
    const current=await page.evaluate(()=>{
      const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
      return {sameCard:root.querySelector('[data-sentinel-card="horizon"]')===window.retainedHorizon,sameSelect:root.querySelector('[data-sentinel-plan-horizon]')===window.retainedSelect,height:window.retainedHorizon.getBoundingClientRect().height};
    });
    assert.equal(current.sameCard,true);assert.equal(current.sameSelect,true);
    assert.ok(Math.abs(current.height-originalNodes.height)<2,'scenario must not jump when expiry confirmation changes');
    assert.match(await card.innerText(),i%2?/EM REVALIDAÇÃO/:/CENÁRIO ATIVO/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  }
  const lowerLayout=await page.evaluate(()=>{
    const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
    const cards=[...root.querySelectorAll('[data-sentinel-summary]:not([data-sentinel-summary="average-total"]),[data-sentinel-card="quick-confluence"],[data-sentinel-card="entry-status"],[data-sentinel-card="reversal"],[data-sentinel-card^="strategy-"]')];
    return cards.map(card=>({overflow:card.scrollWidth>card.clientWidth,minFont:Math.min(...[...card.querySelectorAll('*')].filter(el=>el.childNodes.length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>parseFloat(getComputedStyle(el).fontSize)))}));
  });
  assert.equal(lowerLayout.length,9);assert.ok(lowerLayout.every(card=>!card.overflow&&card.minFont>=9.5),JSON.stringify(lowerLayout));
  await driver.updateOverlay('iq_option',{...data,operationalSignal:{...operational,state:'INVALIDADO',reason:'Cenário invalidado pelo preço; entrada bloqueada.'}});
  assert.match(await card.innerText(),/CENÁRIO CANCELADO/);assert.doesNotMatch(await card.innerText(),/PREVISÃO CALL|ENTRAR AGORA/);
  await driver.updateOverlay('iq_option',{...data,operationalSignal:{...operational,state:'JANELA ENCERRADA'}});
  assert.match(await card.innerText(),/JANELA ENCERRADA/);assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  await driver.updateOverlay('iq_option',{...data,operationalSignal:{...operational,state:'AGUARDAR PRAZO',sideSupported:false}});
  assert.match(await card.innerText(),/CALL · EM REVALIDAÇÃO/);assert.match(await card.innerText(),/EM REVALIDAÇÃO · ENTRADA BLOQUEADA/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  await driver.updateOverlay('iq_option',{...data,analysisStale:true});
  assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  await driver.updateOverlay('iq_option',{...data,entryPlanner:{horizons:{'60':{...plan,confidence:72}}}});
  assert.match(await card.innerText(),/MODELO 72 pts/);
  await mkdir('sentinel-test-output',{recursive:true});
  await card.screenshot({path:'sentinel-test-output/scenario-open.png'});
  const dimensions=await card.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,children:[...el.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,text:x.textContent.slice(0,90),right:x.getBoundingClientRect().right}))}));
  console.log('SCENARIO_LAYOUT',JSON.stringify(dimensions));
  assert.equal(dimensions.scrollWidth<=dimensions.clientWidth,true,'scenario must fit its card');
  const status=card.locator('span').filter({hasText:/FECHA EM/}).first();
  assert.equal(await status.evaluate(el=>getComputedStyle(el).fontSize),'16px');
  await mkdir('sentinel-test-output',{recursive:true});
  await card.screenshot({path:'sentinel-test-output/scenario-open.png'});
  const panel=page.locator('#sentinel-trading-overlay');
  await panel.evaluate(el=>{el.style.height='2200px';el.style.maxHeight='none';el.style.width='500px';el.scrollTop=0});
  assert.ok(await page.locator('[data-sentinel-summary="average-total"]').evaluate(el=>el.getBoundingClientRect().height)<160,'average card must not expand to the panel height');
  await panel.screenshot({path:'sentinel-test-output/panel-cards.png'});
  await panel.evaluate(el=>{el.style.width='420px';el.style.height='560px';el.style.maxHeight='calc(100vh - 18px)'});
  const narrow=await page.evaluate(()=>{
    const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
    return [...root.querySelectorAll('[data-sentinel-card],[data-sentinel-summary]')].map(card=>({name:card.getAttribute('data-sentinel-card')||card.getAttribute('data-sentinel-summary'),scroll:card.scrollWidth,width:card.clientWidth,clipped:[...card.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>card.getBoundingClientRect().right+1).map(el=>el.textContent.slice(0,50))}));
  });
  assert.ok(narrow.every(card=>card.scroll<=card.width&&card.clipped.length===0),JSON.stringify(narrow));
  await panel.evaluate(el=>{el.style.width='500px'});
  await page.waitForTimeout(4000); // No new worker payload: the browser clock must expire freshness itself.
  assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  assert.deepEqual(errors,[]);
  console.log('SENTINEL 13.4.0 OVERLAY: engine state, deadlines, fresh feed, confidence, fixed trigger and layout PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
