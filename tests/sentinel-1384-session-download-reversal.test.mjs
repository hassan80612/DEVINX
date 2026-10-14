import test from 'node:test';
import assert from 'node:assert/strict';
import {SentinelRemoteRelay} from '../sentinel-trading-lab/agent/worker/remote-relay.mjs';
import {confirmedStructuralReversal} from '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import config from '../sentinel-trading-lab/next.config.mjs';

const T=1800000000000;
test('a delayed old heartbeat cannot pause authorization already renewed by a newer poll',async()=>{
 const relay=new SentinelRemoteRelay();relay.identity={installId:'test',deviceToken:'test'};
 let finish;
 relay.rpc=async name=>name==='sentinel_agent_heartbeat'?await new Promise(r=>{finish=r}):
  {ok:true,paired:true,accessActive:true,accessReason:'active'};
 const old=relay.heartbeat({});
 await relay.poll();
 finish({ok:true,paired:true,accessActive:false,accessReason:'session_or_subscription_inactive'});
 await old;
 assert.equal(relay.info.accessActive,true);
 assert.equal(relay.info.accessReason,'active');
 relay.rpc=async()=>({ok:true,paired:true,accessActive:false,accessReason:'revoked'});
 await relay.poll();
 assert.equal(relay.info.accessActive,false,'a NEW revocation is enforced immediately');
});
test('an ACK without access data cannot suppress an outstanding revocation',async()=>{
 const relay=new SentinelRemoteRelay();relay.identity={installId:'test',deviceToken:'test'};
 let finish;
 relay.rpc=async name=>name==='sentinel_agent_poll'?await new Promise(r=>{finish=r}):{ok:true};
 const poll=relay.poll();await relay.ack('test',true);
 finish({ok:true,paired:true,accessActive:false,accessReason:'revoked'});
 await poll;assert.equal(relay.info.accessReason,'revoked');
});
test('confirmed reversal uses THIS opening price when previous closed candle is on a different leg',()=>{
 for(const side of ['CALL','PUT']){
  const dir=side==='CALL'?1:-1,reference=1.2+dir*.001;
  const history=[];
  for(let i=-90;i<0;i++)history.push({ts:T+i*1000,price:reference+dir*i*.000001});
  for(let i=0;i<=12;i++)history.push({ts:T+i*1000,price:reference-dir*i*.00002});
  const window={phase:'open',side,openedAt:T,
   guardBaseline:{lastClose:1.2,referencePrice:reference}};
  const args={window,snap:{quoteTs:T+12000,quoteHistory:history},now:T+12000};
  assert.equal(confirmedStructuralReversal(args).invalidated,true,side);
  assert.equal(confirmedStructuralReversal({...args,window:{...window,
   guardBaseline:{lastClose:1.2}}}).invalidated,false,'reproduces old wrong baseline: '+side);
  assert.equal(confirmedStructuralReversal({...args,snap:{...args.snap,quoteTs:T-5000}}).invalidated,false);
 }
});
test('old open site tabs reach current installer; redirects carry no attachment headers',async()=>{
 const rules=await config.redirects(),headers=await config.headers();
 for(const version of ['13.8.0','13.8.1','13.8.2','13.8.3']){
  const path='/downloads/Sentinel-Agent-'+version+'.exe';
  assert.equal(rules.find(r=>r.source===path)?.destination,'/downloads/Sentinel-Agent-Windows.exe');
  assert.equal(headers.some(r=>r.source===path),false);
 }
 const stable=headers.find(r=>r.source==='/downloads/Sentinel-Agent-Windows.exe');
 assert.equal(stable.headers.find(h=>h.key==='Content-Type').value,'application/octet-stream');
 assert.match(stable.headers.find(h=>h.key==='Content-Disposition').value,/attachment/);
});
