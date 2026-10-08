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
  await page.clock.install({time:Date.now()-1000});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.clock.pauseAt(Date.now());
  const driver=new LocalPlaywrightDriver();driver.session=async()=>({page,background:false});
  const update=async payload=>{
    // Assert entry deadlines against a controlled browser clock. Runner speed
    // must not consume a simulated entry before its visible state is checked.
    await page.clock.setSystemTime(Date.now());
    return driver.updateOverlay('iq_option',payload);
  };
  const now=Date.now(),plan={asset:'TEST',generatedAt:now,confidence:80,modelConfidence:80,callProbability:80,putProbability:20,displayBias:'CALL',outlookReady:true,directionReady:true,currentPrice:100,callTrigger:102,putTrigger:98,callInvalidation:90,putInvalidation:110,validation:{decisionSamples:0}};
  const operational={asset:'TEST',side:'CALL',state:'JANELA ABERTA',createdAt:now,entryWindowEndAt:now+60000,targetAt:now+60000,forecastHorizonSeconds:60,durationMs:30000,sideSupported:true,trigger:101,invalidation:90,technicalConfidence:80,reason:'Aguardando gatilho fixo.'};
  const data={asset:'TEST',validatedAsset:'TEST',assetValidated:true,analysisAgeMs:0,liveAgeMs:0,state:'running',demoAutopilot:true,executionReady:false,brokerMode:'demo',agentVersion:'13.4.10',forecastHorizonSeconds:60,durationMs:30000,strategyCards:[{slot:1,active:true,label:'Smart Confluence',projectionHorizonSeconds:60,side:'CALL',callPct:70,putPct:30,why:'Tendência e estrutura em confirmação.'},{slot:2,active:true,label:'Price Action',projectionHorizonSeconds:60,side:'AGUARDAR',callPct:53,putPct:47,why:'Aguardando reação na região do preço.'},{slot:3,active:true,label:'Mean Reversion',projectionHorizonSeconds:60,side:'PUT',callPct:38,putPct:62,why:'Exaustão sem confirmação da reversão.'}],metrics:{shortModel:{ready:true}},entryPlanner:{horizons:{'60':plan}},operationalSignal:operational};
  const card=page.locator('[data-sentinel-card="horizon"]');
  const analyst=card.locator('[data-sentinel-subanalyst-status]');
  assert.equal(await update(data),true);
  assert.match(await analyst.innerText(),/Subanalista:\s*OBSERVANDO ENTRADA/);
  assert.equal(await page.locator('[data-sentinel-card="independent-subanalyst"]').count(),0);
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
  // The broker may show an editable amount as a numeric display in a closed component.
  // Detect the investment display, excluding the balance, and verify read-only scans.
  await page.evaluate(()=>{
    document.getElementById('closed-broker-panel').remove();
    const host=document.createElement('div');host.id='closed-broker-value-panel';document.body.append(host);
    const root=host.attachShadow({mode:'closed'});
    root.innerHTML='<div>Balance <button>$46,400.00</button></div><button>CALL</button><button>PUT</button><section><label>Invest</label><button id="amount-display">$10,000.00</button></section><button data-test="expiration">30 s</button>';
    root.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>window.testOrders++));
  });
  const amountDisplay=await driver._domExecutionUi('iq_option');
  assert.equal(amountDisplay.amount,true);assert.equal(amountDisplay.amountEditable,false);
  assert.equal(amountDisplay.amountValue,'$10,000.00');assert.doesNotMatch(amountDisplay.amountText,/46,400/);
  await driver.scanExecutionUi('iq_option');assert.equal(broker.executionReady,true);
  assert.equal(await page.evaluate(()=>window.testOrders),0);
  await page.evaluate(()=>{
    document.getElementById('closed-broker-value-panel').remove();
    const host=document.createElement('div');host.id='readonly-broker-value-panel';document.body.append(host);
    const root=host.attachShadow({mode:'closed'});root.innerHTML='<button>CALL</button><button>PUT</button><section><label>Invest</label><span>$10,000.00</span></section>';
  });
  assert.equal((await driver._domExecutionUi('iq_option')).amount,false,'a passive number is not a writable investment control');
  // Accessibility scans can outlive feed freshness on a busy Windows runner.
  // Supply the next simulated worker frame before checking a live scenario.
  await update(data);
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');
  const callActionColor=await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el).color);
  assert.equal(callActionColor,await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el.closest('[data-sentinel-card]')).borderLeftColor));
  const putWaiting={...data,entryPlanner:{horizons:{'60':{...plan,displayBias:'PUT',callProbability:20,putProbability:80}}},operationalSignal:{...operational,side:'PUT',state:'AGUARDAR PRAZO',sideSupported:false}};
  await update(putWaiting);
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO PUT');
  const putActionColor=await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el).color);
  assert.notEqual(putActionColor,callActionColor);
  assert.equal(putActionColor,await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el.closest('[data-sentinel-card]')).borderLeftColor));
  assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  await mkdir('sentinel-test-output',{recursive:true});
  await card.screenshot({path:'sentinel-test-output/scenario-put-wait.png'});
  const reversedAnalysis={...putWaiting,operationalSignal:{...operational,state:'JANELA ABERTA',futureSide:'PUT',oppositeOpportunity:{side:'PUT'},actionable:false,ready:false}};
  await update(reversedAnalysis);
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');
  assert.doesNotMatch(await card.innerText(),/Leitura atual PUT/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  assert.equal(await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el).color),callActionColor);
  await card.screenshot({path:'sentinel-test-output/scenario-opposite-analysis.png'});
  for(const confidence of [46,48,51,52,54]){
    const weak={...data,minConfidence:55,entryPlanner:{horizons:{'60':{...plan,confidence,modelConfidence:confidence,rawBias:'PUT',callProbability:20,putProbability:80}}},operationalSignal:{...operational,state:'AGUARDAR PRAZO',ready:false,actionable:false}};
    await update(weak);
    assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');
    assert.equal(await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el).color),callActionColor);
    assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  }
  const cancelled={...putWaiting,operationalSignal:{...putWaiting.operationalSignal,state:'INVALIDADO',ready:false,actionable:false}};
  for(const side of ['CALL','PUT']){
    await update({...cancelled,entryPlanner:{horizons:{'60':{...plan,rawBias:side,callProbability:side==='CALL'?80:20,putProbability:side==='PUT'?80:20}}}});
    assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CANCELADO');
    assert.equal(await card.locator('[data-sentinel-scenario-action]').evaluate(el=>getComputedStyle(el).color),putActionColor);
    assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  }


  await update(data);
  assert.match(await card.innerText(),/FECHA EM/);
  assert.match(await card.innerText(),/MODELO 80 pts/);
  assert.match(await card.innerText(),/ainda sem resultados medidos/);
  assert.match(await card.innerText(),/101\.000/,'display must show the locked engine trigger');
  assert.doesNotMatch(await card.innerText(),/102\.000/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sentinel-future-decision-v13|TEST|60')),null);
  await mkdir('sentinel-test-output',{recursive:true});
  const justBefore=Date.now();
  const entered={...operational,state:'ENTRADA',ready:true,actionable:true,entryAt:justBefore,activeUntil:justBefore+500};
  await update({...data,operationalSignal:entered});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');
  assert.match(await card.locator('[data-sentinel-scenario-status]').innerText(),/FECHA EM [1-9]\d?s/);
  assert.match(await card.locator('[data-sentinel-scenario-phase]').innerText(),/ENTRADA DISPONÍVEL POR 1s · EXPIRAÇÃO 30 s/);
  await page.clock.runFor(650);
  assert.match(await card.innerText(),/CENÁRIO CALL/);assert.match(await card.innerText(),/ACOMPANHANDO · ENTRADA ENCERRADA/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  await update({...data,operationalSignal:{...operational,state:'ACOMPANHANDO',activeUntil:justBefore+500,entryAt:justBefore,reason:'Oportunidade de entrada encerrada; cenário mantido até o prazo, sem liberar nova entrada.'}});
  assert.match(await card.innerText(),/CENÁRIO CALL/);
  const putEntryAt=Date.now();
  await update({...data,entryPlanner:{horizons:{'60':{...plan,displayBias:'PUT',callProbability:20,putProbability:80}}},operationalSignal:{...operational,side:'PUT',state:'ENTRADA',ready:true,actionable:true,entryAt:putEntryAt,activeUntil:putEntryAt+3000}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO PUT');
  await card.screenshot({path:'sentinel-test-output/scenario-enter.png'});
  await update(data);
  const originalNodes=await page.evaluate(()=>{
    const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
    window.retainedHorizon=root.querySelector('[data-sentinel-card="horizon"]');
    window.retainedSelect=root.querySelector('[data-sentinel-plan-horizon]');
    return {height:window.retainedHorizon.getBoundingClientRect().height};
  });
  for(let i=0;i<8;i++){
    await update({...data,operationalSignal:{...operational,state:i%2?'AGUARDAR PRAZO':'JANELA ABERTA',sideSupported:i%2===0,reason:i%2?'Entrada bloqueada: a previsão de 30s precisa confirmar o mesmo lado, a porcentagem e os pontos mínimos.':'Janela aberta; aguardando o preço atingir o gatilho.'}});
    const current=await page.evaluate(()=>{
      const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
      return {sameCard:root.querySelector('[data-sentinel-card="horizon"]')===window.retainedHorizon,sameSelect:root.querySelector('[data-sentinel-plan-horizon]')===window.retainedSelect,height:window.retainedHorizon.getBoundingClientRect().height};
    });
    assert.equal(current.sameCard,true);assert.equal(current.sameSelect,true);
    assert.ok(Math.abs(current.height-originalNodes.height)<2,'scenario must not jump when expiry confirmation changes');
    assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');assert.doesNotMatch(await card.innerText(),/EM REVALIDAÇÃO|CENÁRIO ATIVO/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  }
  // Analyst-only CALL/PUT changes must not change scenario card height.
  const stableAnalystHeight=await card.evaluate(el=>el.getBoundingClientRect().height);
  for(const subSide of ['CALL','PUT','CALL']){
    const t=Date.now();
    const sub={independent:true,qualification:{allowed:true},
      signal:{side:subSide,state:'ENTRADA',actionable:true,activeUntil:t+3500}};
    await update({...data,operationalSignal:{...operational,entryAnalyst:sub}});
    assert.match(await analyst.innerText(),new RegExp('Subanalista:\\s*'+subSide));
    const h=await card.evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(Math.abs(h-stableAnalystHeight)<2,'subanalyst CALL/PUT must not jump the scenario card');
  }
  await update(data);
  assert.match(await analyst.innerText(),/Subanalista:\s*CALL/,'last confirmed side must survive immediate next observing frame');
  await page.clock.runFor(2600);
  assert.match(await analyst.innerText(),/Subanalista:\s*CALL/,'confirmed CALL must remain readable during the first 3 seconds');
  await page.clock.runFor(600);
  assert.match(await analyst.innerText(),/Subanalista:\s*OBSERVANDO ENTRADA/,'after 3 seconds the display hold must expire without new trade');
  // The test harness resets virtual browser time on the next payload (backwards).
  // Isolate subsequent scenarios from the completed three-second hold.
  await page.evaluate(()=>{window.__sentinelSubanalystHold=null;clearTimeout(window.__sentinelSubanalystClearTimer);window.__sentinelSubanalystClearTimer=null});
  await update({...data,operationalSignal:{...entered,activeUntil:Date.now()+3000,actionable:false}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');
  assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  // The execution forecast can qualify independently while the longer scenario
  // remains opposite. The rendered side, metrics and permission must all use 30s.
  for(const side of ['CALL','PUT']){
    const call=side==='CALL',independentNow=Date.now();
    const p30={...plan,horizonSeconds:30,rawBias:side,displayBias:side,callProbability:call?82:18,putProbability:call?18:82};
    const p60={...plan,horizonSeconds:60,rawBias:call?'PUT':'CALL',displayBias:call?'PUT':'CALL',callProbability:call?20:80,putProbability:call?80:20};
    await update({...data,entryPlanner:{horizons:{'30':p30,'60':p60}},operationalSignal:{...operational,scenario:{side:call?'PUT':'CALL',createdAt:independentNow,deadline:independentNow+60000,closed:false},side,state:'ENTRADA',entryDecisionHorizonSeconds:30,entryAt:independentNow,activeUntil:independentNow+3500,ready:true,actionable:true}});
    assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO '+(call?'PUT':'CALL'));
    assert.match(await card.innerText(),/ANÁLISE DA ENTRADA 30s/);
    assert.match(await analyst.innerText(),/Subanalista:\s*OBSERVANDO ENTRADA/);
    assert.match(await card.innerText(),/80%/);
    await card.screenshot({path:'sentinel-test-output/scenario-independent-'+side.toLowerCase()+'.png'});
  }
  // An independently confirmed local entry must survive an opposite, unqualified expiry forecast.
  const localNow=Date.now(),oppositeExpiry={...plan,horizonSeconds:30,rawBias:'PUT',displayBias:'PUT',directionReady:false,confidence:45,callProbability:20,putProbability:80};
  await update({...data,entryPlanner:{horizons:{'30':oppositeExpiry,'60':{...plan,rawBias:'PUT',displayBias:'PUT',callProbability:20,putProbability:80}}},operationalSignal:{...operational,side:'CALL',scenario:{side:'PUT',createdAt:localNow,deadline:localNow+60000},entryAnalyst:{independent:true,qualification:{allowed:true},signal:{side:'CALL',state:'ENTRADA',actionable:true,activeUntil:localNow+3500}},state:'ENTRADA',entryDecisionHorizonSeconds:30,entryAt:localNow,activeUntil:localNow+3500,ready:true,actionable:true}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO PUT');
  assert.match(await analyst.innerText(),/Subanalista:\s*CALL/);
  await page.clock.runFor(4000);
  assert.doesNotMatch(await card.innerText(),/ENTRADA DISPONÍVEL|ENTRAR AGORA/,'expired local opportunity stops its authorization without another worker payload');
  assert.doesNotMatch(await card.innerText(),/FECHA EM/,'a stale feed still suspends the displayed countdown');
  assert.match(await analyst.innerText(),/Subanalista:\s*OBSERVANDO ENTRADA/);
  const expiredEntryAt=Date.now()-4000;
  await update({...data,entryPlanner:{horizons:{'30':oppositeExpiry,'60':{...plan,rawBias:'PUT',displayBias:'PUT',callProbability:20,putProbability:80}}},operationalSignal:{...operational,side:'CALL',scenario:{side:'PUT',createdAt:localNow,deadline:localNow+60000},entryAnalyst:{independent:true,qualification:{allowed:true},signal:{side:'CALL',state:'ENTRADA',actionable:true,activeUntil:expiredEntryAt+3500}},state:'ENTRADA',entryDecisionHorizonSeconds:30,entryAt:expiredEntryAt,activeUntil:expiredEntryAt+3500,ready:true,actionable:true}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO PUT');
  assert.match(await card.innerText(),/FECHA EM/,'fresh market data keeps the main forecast open after the local entry expires');
  assert.doesNotMatch(await card.innerText(),/ENTRADA DISPONÍVEL|ENTRAR AGORA/);
  // Isolate the completed hold before the test harness moves virtual clock backward.
  // Local entries without a qualified main forecast own only their entry clock.
  for(const side of ['CALL','PUT','CALL']){
    const at=Date.now();
    await update({...data,operationalSignal:{...operational,side,scenario:null,entryAt:at,entryDecisionHorizonSeconds:30,state:'ENTRADA',ready:true,actionable:true,activeUntil:at+3500,entryAnalyst:{independent:true,qualification:{allowed:true},signal:{side,state:'ENTRADA',actionable:true,entryAt:at,activeUntil:at+3500}}}});
    assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'AGUARDE UM CENÁRIO');
    assert.doesNotMatch(await card.innerText(),/FECHA EM/);
    assert.match(await card.innerText(),/ENTRADA DISPONÍVEL/);
    assert.match(await analyst.innerText(),new RegExp('Subanalista:\\s*'+side));
  }
  await page.evaluate(()=>{window.__sentinelSubanalystHold=null;clearTimeout(window.__sentinelSubanalystClearTimer);window.__sentinelSubanalystClearTimer=null});
  await update(data);
  const lowerLayout=await page.evaluate(()=>{
    const root=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
    const cards=[...root.querySelectorAll('[data-sentinel-summary]:not([data-sentinel-summary="average-total"]),[data-sentinel-card="quick-confluence"],[data-sentinel-card="entry-status"],[data-sentinel-card="reversal"],[data-sentinel-card^="strategy-"]')];
    return cards.map(card=>({overflow:card.scrollWidth>card.clientWidth,minFont:Math.min(...[...card.querySelectorAll('*')].filter(el=>el.childNodes.length&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>parseFloat(getComputedStyle(el).fontSize)))}));
  });
  assert.equal(lowerLayout.length,9);assert.ok(lowerLayout.every(card=>!card.overflow&&card.minFont>=9.5),JSON.stringify(lowerLayout));
  await update({...data,operationalSignal:{...operational,state:'INVALIDADO',reason:'Cenário invalidado pelo preço; entrada bloqueada.'}});
  assert.match(await card.innerText(),/CENÁRIO CANCELADO/);assert.doesNotMatch(await card.innerText(),/PREVISÃO CALL|ENTRAR AGORA/);
  await update({...data,operationalSignal:{...operational,state:'JANELA ENCERRADA'}});
  assert.match(await card.innerText(),/JANELA ENCERRADA/);assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  await update({...data,operationalSignal:{...operational,state:'AGUARDAR PRAZO',sideSupported:false}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'CENÁRIO CALL');assert.match(await analyst.innerText(),/Subanalista:\s*OBSERVANDO ENTRADA/);assert.match(await card.innerText(),/ANÁLISE EM ANDAMENTO · AGUARDE O SINAL DE ENTRADA/);assert.match(await card.innerText(),/FECHA EM/);assert.doesNotMatch(await card.innerText(),/ENTRAR AGORA/);
  await update({...data,operationalSignal:{...operational,asset:'OTHER'}});
  assert.equal(await card.locator('[data-sentinel-scenario-action]').innerText(),'AGUARDE UM CENÁRIO');
  await update({...data,analysisStale:true});
  assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  await update({...data,entryPlanner:{horizons:{'60':{...plan,confidence:72}}}});
  assert.match(await card.innerText(),/MODELO 72 pts/);
  await mkdir('sentinel-test-output',{recursive:true});
  await card.screenshot({path:'sentinel-test-output/scenario-open.png'});
  const dimensions=await card.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,children:[...el.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,text:x.textContent.slice(0,90),right:x.getBoundingClientRect().right}))}));
  console.log('SCENARIO_LAYOUT',JSON.stringify(dimensions));
  assert.equal(dimensions.scrollWidth<=dimensions.clientWidth,true,'scenario must fit its card');
  const status=card.locator('span').filter({hasText:/FECHA EM/}).first();
  assert.equal(await status.evaluate(el=>getComputedStyle(el).fontSize),'15px');
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
  await page.clock.runFor(4000); // No new worker payload: the browser clock must expire freshness itself.
  assert.doesNotMatch(await card.innerText(),/JANELA ABERTA|FECHA EM|ENTRAR AGORA/);
  assert.deepEqual(errors,[]);
  console.log('SENTINEL COMPACT SUBANALYST OVERLAY: own call-put status, timing and fixed layout PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}

