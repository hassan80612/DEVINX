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
  // Invest and Expiração deliberately share a DOM ancestor: the 13.4.34 parser rejected it.
  const invest=elem('DIV',[label('Invest',{x:1090,y:125,w:55,h:18}),label('$10000',{x:1100,y:154,w:82,h:30}),label('Expiração',{x:1090,y:220,w:90,h:18}),label('30 seg',{x:1090,y:244,w:90,h:24})],{x:1072,y:110,w:157,h:160});
  const buy=elem('DIV',[label('ACIMA',{x:1103,y:313,w:74,h:24})],{x:1050,y:282,w:185,h:80});
  const sell=elem('DIV',[label('ABAIXO',{x:1100,y:414,w:84,h:24})],{x:1050,y:385,w:185,h:80});
  const overlay=elem('DIV',[label('ACIMA',{x:130,y:120,w:70,h:20})],{x:100,y:85,w:300,h:230},['id','sentinel-trading-overlay-host']);
  const balance=elem('DIV',[label('$179200',{x:1080,y:54,w:112,h:25})],{x:1000,y:35,w:215,h:48});
  const root={nodeType:9,nodeName:'#document',children:[elem('BODY',[balance,invest,buy,sell,overlay],{x:0,y:0,w:1280,h:800})]};
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
  assert.equal(found.amountValue,'$10000');
  assert.equal(found.amountEditable,false);
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

test('right-rail value editor overrides static Invest display when exposed',async()=>{
  let id=1;const state=new Map();
  const make=(name,text,box,editable=false)=>{
    const key=id++;state.set(key,{visible:true,x:box.x,y:box.y,w:box.w,h:box.h,vw:1280,vh:800,value:text,editable,clickable:editable});
    return{nodeType:1,nodeName:name,backendNodeId:key,attributes:editable?['type','text']:[],children:text?[{nodeType:3,nodeValue:text,children:[]}]:[]};
  };
  const invest=make('SPAN','Invest',{x:1090,y:120,w:50,h:18});
  const old=make('SPAN','$10000',{x:1090,y:152,w:75,h:24});
  const editor=make('INPUT','2',{x:1090,y:154,w:86,h:25},true);
  const buy=make('DIV','ACIMA',{x:1080,y:320,w:130,h:65});
  const sell=make('DIV','ABAIXO',{x:1080,y:420,w:130,h:65});
  const root={nodeType:9,children:[{nodeType:1,nodeName:'BODY',backendNodeId:15,attributes:[],children:[invest,old,editor,buy,sell]}]};
  state.set(15,{visible:true,x:0,y:0,w:1280,h:800,vw:1280,vh:800,value:'',editable:false,clickable:false});
  const cdp={async send(method,args){
    if(method==='DOM.getDocument')return{root};
    if(method==='DOM.resolveNode')return{object:{objectId:String(args.backendNodeId)}};
    if(method==='Runtime.callFunctionOn')return{result:{value:state.get(Number(args.objectId))}};
    if(method==='Runtime.releaseObject')return{};
    throw Error('unexpected CDP operation: '+method);
  }};
  const result=await readBrokerDomControls(cdp);
  assert.equal(result.buy,true);assert.equal(result.sell,true);
  assert.equal(result.amount,true);
  assert.equal(result.amountEditable,true);
  assert.equal(result.amountValue,'2');
  assert.equal(result.ax.amountBackendId,editor.backendNodeId);
});
