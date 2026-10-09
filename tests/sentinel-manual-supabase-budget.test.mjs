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
const make=()=>({confirmed:true,requestId,deviceId,side:'CALL',amount:2,issuedAt:now,expiresAt:now+9000,context:{provider:'iq_option',mode:'demo',accountId:'900',activeId:'12',asset:'EUR/USD OTC',expirationRaw:'01:00'}});
test('manual order requires exact broker context',()=>{
  assert.equal(validateManualOrder(make(),{provider:'iq_option',deviceId,live,now}).side,'CALL');
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,mode:'real'}},{provider:'iq_option',deviceId,live,now}),/manual_account_changed/);
  assert.throws(()=>validateManualOrder({...make(),context:{...make().context,activeId:'13'}},{provider:'iq_option',deviceId,live,now}),/manual_asset_changed/);
  assert.throws(()=>validateManualOrder({...make(),expiresAt:now-1},{provider:'iq_option',deviceId,live,now}),/manual_command_expired/);
  assert.throws(()=>validateManualOrder({...make(),amount:1.111},{provider:'iq_option',deviceId,live,now}),/manual_invalid_amount/);
  assert.throws(()=>validateManualOrder({...make(),confirmed:false},{provider:'iq_option',deviceId,live,now}),/manual_confirmation_required/);
});
