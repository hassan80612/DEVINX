import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateManualOrder} from '../sentinel-trading-lab/agent/worker/manual-order.mjs';
const read=p=>readFileSync(resolve(import.meta.dirname,'..',p),'utf8');
test('remote polling and heartbeat budget are preserved',()=>{
  const worker=read('sentinel-trading-lab/agent/worker/index.mjs');
  assert.match(worker,/setInterval\(remoteLoop,1500\)/);
  assert.match(worker,/runtime\.stateName==='running'\?2500:12000/);
  assert.match(worker,/compactRemoteState\(/);
  const remote=read('sentinel-trading-lab/agent/worker/remote-status.mjs');
  assert.match(remote,/MAX_ANALYSES\s*=\s*6/);
  assert.match(remote,/MAX_CANDLES\s*=\s*40/);
  assert.match(remote,/MAX_QUOTES\s*=\s*40/);
});
const now=Date.now(),deviceId=randomUUID(),requestId=randomUUID();
const live={mode:'demo',accountId:'900',activeId:12,assetValidated:true,candleAssetMatch:true,symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',expirationRaw:'01:00',expirationUpdatedAt:now,executionUi:{buy:true,sell:true,amount:true,assetMatch:true}};
const make=()=>({confirmed:true,requestId,deviceId,side:'CALL',amount:2,issuedAt:now,expiresAt:now+9000,context:{provider:'iq_option',mode:'demo',accountId:'900',activeId:'12',asset:'EUR/USD OTC',expirationMode:'manual-confirmed',expirationSeconds:60,manualBrokerExpiryConfirmed:true}});
test('manual order requires exact broker context',()=>{
  assert.equal(validateManualOrder(make(),{provider:'iq_option',deviceId,live,expectedExpirySeconds:60,now}).side,'CALL');
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,expirationSeconds:120}},{provider:'iq_option',deviceId,live,expectedExpirySeconds:60,now}),/manual_expiration_settings_changed/);
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,manualBrokerExpiryConfirmed:false}},{provider:'iq_option',deviceId,live,expectedExpirySeconds:60,now}),/manual_broker_expiration_confirmation_required/);
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,mode:'real'}},{provider:'iq_option',deviceId,live,now}),/manual_account_changed/);
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,activeId:'13'}},{provider:'iq_option',deviceId,live,now}),/manual_asset_changed/);
  assert.throws(()=>validateManualOrder({...make(),expiresAt:now-1},{provider:'iq_option',deviceId,live,now}),/manual_command_expired/);
  assert.throws(()=>validateManualOrder({...make(),amount:1.111},{provider:'iq_option',deviceId,live,now}),/manual_invalid_amount/);
  assert.throws(()=>validateManualOrder({...make(),confirmed:false},{provider:'iq_option',deviceId,live,now}),/manual_confirmation_required/);
});

import {readBrokerDomControls} from '../sentinel-trading-lab/agent/worker/broker-dom-controls.mjs';
test('IQ Option 2026 right-rail Invest / ACIMA / ABAIXO is detected without native buttons',async()=>{
  let id=1;const geo=new Map();
  const label=(value,box={x:0,y:0,w:1,h:1})=>{
    const key=id++;
    geo.set(key,{...box,visible:true,editable:false,clickable:false,vw:1280,vh:800,value});
    return{nodeType:1,nodeName:'SPAN',backendNodeId:key,attributes:[],children:[{nodeType:3,nodeName:'#text',nodeValue:value,children:[]}]};
  };
  const elem=(name,children,box,attrs=[])=>{
    const key=id++;geo.set(key,{...box,visible:true,editable:false,clickable:false,vw:1280,vh:800,value:''});
    return{nodeType:1,nodeName:name,backendNodeId:key,attributes:attrs,children};
  };
  const invest=elem('DIV',[label('Invest',{x:1090,y:125,w:55,h:18}),label('$10000',{x:1100,y:154,w:82,h:30})],{x:1072,y:110,w:157,h:100});
  const buy=elem('DIV',[label('ACIMA',{x:1103,y:313,w:74,h:24})],{x:1050,y:282,w:185,h:80});
  const sell=elem('DIV',[label('ABAIXO',{x:1100,y:414,w:84,h:24})],{x:1050,y:385,w:185,h:80});
  const overlay=elem('DIV',[label('ACIMA',{x:130,y:120,w:70,h:20})],{x:100,y:85,w:300,h:230},['id','sentinel-trading-overlay-host']);
  const root={nodeType:9,nodeName:'#document',children:[elem('BODY',[invest,buy,sell,overlay],{x:0,y:0,w:1280,h:800})]};
  const calls=[];
  const cdp={async send(method,args){calls.push(method);
    if(method==='DOM.getDocument')return{root};
    if(method==='DOM.resolveNode')return{object:{objectId:String(args.backendNodeId)}};
    if(method==='Runtime.callFunctionOn')return{result:{value:geo.get(Number(args.objectId))}};
    if(method==='Runtime.releaseObject')return{};
    throw Error('unexpected CDP method '+method);
  }};
  const found=await readBrokerDomControls(cdp);
  assert.equal(found.buy,true);
  assert.equal(found.sell,true);
  assert.equal(found.amount,true);
  assert.equal(found.railPair,true);
  assert.equal(found.ax.buyBackendId,buy.backendNodeId);
  assert.equal(found.ax.sellBackendId,sell.backendNodeId);
  assert.equal(found.ax.amountBackendId,invest.children[1].backendNodeId);
  assert.equal(calls.some(x=>/^Input\\.|^Page\\.|^Network\\./.test(x)),false);
});
test('right-rail detection cannot authorize a trade with just one direction',async()=>{
  const root={nodeType:9,children:[{nodeType:1,nodeName:'BODY',backendNodeId:1,attributes:[],children:[
    {nodeType:1,nodeName:'SPAN',backendNodeId:2,attributes:[],children:[{nodeType:3,nodeValue:'ACIMA',children:[]}]}
  ]}]};
  const cdp={async send(method,args){
    if(method==='DOM.getDocument')return{root};
    if(method==='DOM.resolveNode')return{object:{objectId:String(args.backendNodeId)}};
    if(method==='Runtime.callFunctionOn')return{result:{value:{visible:true,x:1180,y:400,w:60,h:26,vw:1280,vh:800,value:'ACIMA',editable:false,clickable:false}}};
    if(method==='Runtime.releaseObject')return{};
    throw Error('unexpected call');
  }};
  const actual=await readBrokerDomControls(cdp);
  assert.equal(actual.buy,false);assert.equal(actual.sell,false);assert.equal(actual.amount,false);
});
