import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {BrowserBrokerAdapter} from '../sentinel-trading-lab/agent/worker/adapters/browser-broker.mjs';
import {readBrokerDomControls} from '../sentinel-trading-lab/agent/worker/broker-dom-controls.mjs';

test('native DOM recognition excludes every control inside the Sentinel host',async()=>{
  const root={nodeName:'#document',children:[{nodeType:1,nodeName:'DIV',backendNodeId:1,attributes:['id','sentinel-trading-overlay-host'],shadowRoots:[{nodeName:'#document-fragment',children:[{nodeType:1,nodeName:'BUTTON',backendNodeId:2,children:[{nodeValue:'CALL'}]},{nodeType:1,nodeName:'INPUT',backendNodeId:3,attributes:['name','amount']}]}]}]};
  const cdp={send:async(method)=>{assert.equal(method,'DOM.getDocument');return{root}}};
  const result=await readBrokerDomControls(cdp);assert.equal(result.buy,false);assert.equal(result.sell,false);assert.equal(result.amount,false);
});
test('direction recognition uses each accessibility button name, not its parent panel text',async()=>{
  const nodes=[{nodeId:'root',role:{value:'group'},name:{value:'ACIMA ABAIXO'}},{nodeId:'up',parentId:'root',backendDOMNodeId:2,role:{value:'button'},name:{value:'ACIMA'}},{nodeId:'down',parentId:'root',backendDOMNodeId:3,role:{value:'button'},name:{value:'ABAIXO'}}];
  const cdp={send:async method=>method==='Accessibility.getFullAXTree'?{nodes}:{},detach:async()=>{}};
  const d=new LocalPlaywrightDriver();d.session=async()=>({page:{},context:{newCDPSession:async()=>cdp}});
  const result=await d._axExecutionUi('iq_option');assert.equal(result.buy,true);assert.equal(result.sell,true);assert.equal(result.ax.buyBackendId,2);assert.equal(result.ax.sellBackendId,3);
});

test('connecting a validated live feed does not reread six broker pages',async()=>{
  let calls=0;const live={feedValidated:true,mode:'demo',balance:100,assets:['TEST'],symbol:'TEST',activeId:1,quote:1,candles:Array.from({length:60},()=>({})),candleFresh:true};
  const broker=new BrowserBrokerAdapter({provider:'iq_option',driver:{available:true,liveStatus:()=>live,call:async()=>{calls++;throw Error('unnecessary page read')}}});
  broker.connected=true;broker._step('session',true,'connected');await broker.validateReadOnly();
  assert.equal(calls,0);assert.equal(broker.validated,true);
});
test('opening a restored traderoom preserves the document without forced reload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sentinel-opening-'));let reloads=0,navigations=0;
  try{
    const page={url:()=> 'https://iqoption.com/traderoom',reload:async()=>{reloads++},goto:async()=>{navigations++},bringToFront:async()=>{}};
    const context={pages:()=>[page],browser:()=>({}),once:()=>{}};
    const d=new LocalPlaywrightDriver({dataDir:dir});d.browserPath=async()=>'/test/browser';d.engine=async()=>({launchPersistentContext:async()=>context});d.installBridge=async()=>{};d.attachNetwork=()=>{};d.sessionInfo=async()=>({open:true,sessionPresent:true});
    await d.launchNormal('iq_option',{manual:true});assert.equal(reloads,0);assert.equal(navigations,0);
  }finally{await rm(dir,{recursive:true,force:true})}
});
