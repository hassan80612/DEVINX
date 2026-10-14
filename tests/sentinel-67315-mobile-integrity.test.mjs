import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {acceptSignedPcFrame,keepNewerVerifiedQuote} from '../sentinel-trading-lab/src/lib/signed-pc-window-order.mjs';

const topic='realtime:sentinel-'+'a'.repeat(48);
const key='b'.repeat(64);
const mac=value=>createHmac('sha256',Buffer.from(key,'hex')).update(value).digest('hex');

test('signed viewer can bootstrap a legitimate 45-second phone/PC clock skew',()=>{
 const now=1800000000000,bridge=new SignedLiveBridge(topic,key,{clock:()=>now,WebSocketClass:null});
 const at=now-45000;
 assert.equal(bridge.verifyViewer({at,sig:mac(topic+'|'+at)}),true);
 assert.equal(bridge.verifyViewer({at,sig:'f'.repeat(64)}),false);
 assert.equal(bridge.verifyViewer({at:now-125000,sig:mac(topic+'|'+(now-125000))}),false);
});

function sample(now=1800000000000){
 const asset='EUR/USD OTC';
 return {
  v:1,at:now,seq:0,agentVersion:'13.4.67.15',state:'running',
  killSwitch:false,masterFrozen:false,lastEvalMs:now-100,
  settings:{asset,engine:'automatic',orderDurationMs:30000},
  liveBroker:{symbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:now-100,quote:1.15},
  feed:{price:1.15,quoteTs:now-100},
  lastResult:{asset,analysis:{vnext:{
   engineId:'automatic',expirySeconds:30,
   receipt:{asset,side:'PUT'},
   ea:[30,'PUT',1.15,1.14,now-10000,30,now,now+30000,1,'fired',now-100],
   ow:['fired',now-20000,now+10000,now-100,'confirmed']
  }}}
 };
}

test('one-shot fired transition bypasses routine mobile rate limit without generating its own signal',()=>{
 const now=1800000000000,frames=[];
 const bridge=new SignedLiveBridge(topic,key,{clock:()=>now,WebSocketClass:null});
 bridge.joined=true;bridge.verifiedViewerAt=now;
 bridge.socket={readyState:1,send:x=>frames.push(JSON.parse(x))};
 bridge.lastSentAt=now-100;
 bridge.lastOpportunityKey=JSON.stringify(['open',now-20000,now+10000,'PUT',0]);
 bridge.lastSignalKey='already-sent';
 assert.equal(bridge.publish(sample(now)),true);
 assert.equal(frames.length,1);
 assert.equal(frames[0].payload.event,'analyst');
 assert.equal(frames[0].payload.payload.lastResult.analysis.vnext.ow[0],'fired');
 const signed=frames[0].payload.payload;
 const unsigned={...signed};delete unsigned.sig;
 assert.equal(mac(JSON.stringify(unsigned)),signed.sig);
 assert.equal(bridge.publish(sample(now)),false,'duplicate event cannot be rearmed');
});

test('size-reduced signed frame still carries runtime safety state and evaluation time',()=>{
 const v=sample();v.killSwitch=true;v.masterFrozen=true;
 v.lastResult.analysis.vnext.computedStatus='x'.repeat(7000);
 v.lastResult.analysis.vnext.cards=[{id:'x'.repeat(7000)}];
 const reduced=fitAnalystFrame(v);
 assert.ok(reduced,'critical packet must fit');
 assert.equal(reduced.killSwitch,true);
 assert.equal(reduced.masterFrozen,true);
 assert.equal(reduced.lastEvalMs,v.lastEvalMs);
 assert.equal(reduced.lastResult.analysis.vnext.ow[0],'fired');
});

test('reject stale direction but retain authenticated newer broker quote of same asset',()=>{
 const a=sample(),b=structuredClone(a);
 a.lastResult.analysis.vnext.ow=['fired',1800000000000-20000,1800000000000+10000,0,'confirmed'];
 b.lastResult.analysis.vnext.ow=['scanning',1800000000000-20000,1800000000000+10000,0,'scanning'];
 b.liveBroker.lastQuoteAt+=400;b.liveBroker.quote=1.16;
 b.feed={price:1.16,quoteTs:b.liveBroker.lastQuoteAt};
 b.at+=500;b.lastEvalMs=a.lastEvalMs-100;
 assert.equal(acceptSignedPcFrame(a,b),false);
 const merged=keepNewerVerifiedQuote(a,b,{now:b.at});
 assert.equal(merged.liveBroker.quote,1.16);
 assert.equal(merged.lastResult.analysis.vnext.ow[0],'fired');
 assert.equal(merged.lastEvalMs,a.lastEvalMs);
 const opposite=structuredClone(b);opposite.liveBroker.symbol='GBP/USD OTC';
 assert.strictEqual(keepNewerVerifiedQuote(a,opposite),a);
});
