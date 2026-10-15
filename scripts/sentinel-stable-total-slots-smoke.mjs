import assert from 'node:assert/strict';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.setContent('<html><body style="background:#18282a">Broker fixture</body></html>');
 const driver=new LocalPlaywrightDriver(),session={page,background:false,lastBrokerTimeScanAt:Date.now()};
 driver.session=async()=>session;
 const st=driver.state('exnova');
 Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76});
 const cards=[
  {id:'market-now',label:'TOTAL MERCADO AGORA',side:'CALL',callPct:70,putPct:30,hint:'8s'},
  {id:'prior-structure',label:'TOTAL ESTRUTURA ANTERIOR',side:'PUT',callPct:42,putPct:58,hint:'60s'},
  {id:'total-of-totals',label:'ESTRUTURA ANTERIOR + MERCADO AGORA',side:'CALL',callPct:56,putPct:44,hint:'Média'}
 ];
 const base={asset:'EUR/USD OTC',validatedAsset:'EUR/USD OTC',assetValidated:true,
  analysisAgeMs:0,liveAgeMs:0,state:'running',agentVersion:'13.9.19',price:1.1,
  engine:'automatic',durationMs:30000,clockMode:'current',uiLanguage:'pt',
  vnext:{mode:'now',engineId:'automatic',expirySeconds:30,
   cards,opportunityWindow:{phase:'scanning',windowStartedAt:null,windowEndsAt:0},
   nowObservation:{side:null,provisionalSide:null,observedAt:Date.now(),evaluatedAt:Date.now()}}};
 const marker=()=>page.evaluate(()=>{
  const shadow=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
  const parent=shadow?.querySelector('[data-sentinel-vnext-cards]');
  return {length:parent?.children?.length||0,
   ids:[...parent?.children||[]].map(el=>el.getAttribute('data-sentinel-summary')),
   text:parent?.innerText||'',height:parent?.getBoundingClientRect().height||0};
 });
 const publish=async payload=>{
  session.lastBrokerTimeScanAt=Date.now();
  const input=structuredClone(payload);
  if(input.vnext?.nowObservation){
   input.vnext.nowObservation.observedAt=Date.now();
   input.vnext.nowObservation.evaluatedAt=Date.now();
  }
  assert.equal(await driver.updateOverlay('exnova',input),true);
 };
 await publish(base);
 const initial=await marker();
 assert.deepEqual(initial.ids,['market-now','prior-structure','total-of-totals']);
 assert.match(initial.text,/CALL 70%/);
 await page.evaluate(()=>{
  const shadow=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
  window.__sentinelExistingTotals=[...shadow.querySelectorAll('[data-sentinel-vnext-cards] > div')];
 });
 // A cycle boundary temporarily returns no vnext. The cards must NEVER be removed
 // and must not continue showing the previous CALL/PUT percentages.
 const missing=structuredClone(base);missing.vnext=null;
 await publish(missing);
 const empty=await marker();
 assert.deepEqual(empty.ids,initial.ids);
 assert.match(empty.text,/AGUARDAR/);
 assert.doesNotMatch(empty.text,/CALL 70%|PUT 58%/);
 assert.ok(empty.height>0,'three empty readings must occupy their normal positions');
 const sameNodes=()=>page.evaluate(()=>{
  const shadow=document.getElementById('sentinel-trading-overlay-host').shadowRoot;
  const next=[...shadow.querySelectorAll('[data-sentinel-vnext-cards] > div')];
  return next.length===3&&next.every((el,i)=>el===window.__sentinelExistingTotals[i]);
 });
 assert.equal(await sameNodes(),true,'DOM reading nodes must survive cycle boundary');
 const next=structuredClone(base);
 next.vnext.cards=cards.map(c=>({...c,side:'PUT',callPct:28,putPct:72}));
 await publish(next);
 const refreshed=await marker();
 assert.deepEqual(refreshed.ids,initial.ids);
 assert.match(refreshed.text,/PUT 72%/);
 assert.equal(await sameNodes(),true,'new live values must update same existing nodes');
 assert.deepEqual(errors,[]);
 console.log('PASS: PC totals survive live -> empty -> live cycles without stale data, remounts or timing hooks.');
}finally{await browser.close()}
