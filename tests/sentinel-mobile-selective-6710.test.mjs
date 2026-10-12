import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {qualifyStrategyInterval,selectiveEvidence} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
const now=1800000000000;
const quotes=(n,step=.00001)=>Array.from({length:n},(_,i)=>({ts:now-(n-1-i)*1000,price:Math.exp(i*step)}));
const forecast={engineId:'support_resistance',side:'CALL',holdingSeconds:30,delaySeconds:30,
  projectedEntryPrice:1,projectedExitPrice:1.01,issuedAt:now,entryAt:now+30000,exitAt:now+60000};
test('before the 13-minute long model is available, 3 completed candles can qualify a coherent selected forecast',()=>{
 const history=quotes(300),evidence=selectiveEvidence({quoteHistory:history,asOf:now});
 assert.equal(evidence.earlyTrend,true);
 assert.equal(evidence.earlyDirection,'CALL');
 const call=qualifyStrategyInterval({forecast,quoteHistory:history,asOf:now});
 assert.equal(call.side,'CALL');assert.equal(call.qualification.evidence,'three-completed-bars');
 const put=qualifyStrategyInterval({forecast:{...forecast,side:'PUT'},quoteHistory:history,asOf:now});
 assert.equal(put.side,null);
});
test('a forming candle alone, stale quote, or interrupted history cannot trigger the fast evidence',()=>{
 const history=quotes(300);
 const incomplete=history.slice(-70);
 assert.equal(qualifyStrategyInterval({forecast,quoteHistory:incomplete,asOf:now}).side,null);
 const old=history.map(q=>({...q,ts:q.ts-5000}));
 const stale=qualifyStrategyInterval({forecast,quoteHistory:old,asOf:now});
 assert.equal(stale.side,null);assert.equal(stale.qualification.status,'waiting-quote');
 const missing=history.filter(q=>!(q.ts>now-91000&&q.ts<now-80000));
 assert.equal(qualifyStrategyInterval({forecast,quoteHistory:missing,asOf:now}).side,null);
});
test('future-entry scheduler only qualifies forecasts from the selected strategy and verified history',()=>{
 const src=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 assert.match(src,/autonomousSelectiveEntry\(/);
 assert.doesNotMatch(src,/continuous.map\(forecast=>qualifyStrategyInterval\(\{/);
});
test('mobile accepts newer evaluations without rolling its last broker price backward',()=>{
 const source=fs.readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 const start=source.indexOf('setS((previous:Status|null)=>{',source.indexOf('return watchSignedLiveAnalyst'));
 assert.ok(start>0);
 const body=source.slice(start+'setS((previous:Status|null)=>{'.length,source.indexOf('\n      });',start));
 const receive=new Function('previous','payload','topic','liveFrameAt','reconcileSettings',body);
 const previous={liveTopic:'test',lastEvalMs:now,liveBroker:{lastQuoteAt:now+1000,quote:103},
   feed:{price:103},lastResult:{analysis:{vnext:{ea:[15,'CALL',101,102,now-6000,15]}}}};
 const payload={at:now+500,lastEvalMs:now+500,liveBroker:{lastQuoteAt:now,quote:102},
   lastResult:{analysis:{vnext:{ea:[15,'PUT',102,101,now,15]}}}};
 const out=receive(previous,payload,'test',{current:0},x=>x);
 assert.equal(out.lastResult.analysis.vnext.ea[4],now);
 assert.equal(out.liveBroker.quote,103);assert.equal(out.feed.price,103);
 assert.equal(receive(previous,{...payload,lastEvalMs:now-1},'test',{current:0},x=>x),previous);
});
class Socket{
 constructor(){this.events={};this.sent=[];this.readyState=1}
 addEventListener(t,fn){(this.events[t]??=[]).push(fn)}
 emit(t,data={}){for(const cb of this.events[t]||[])cb(data)}
 send(msg){this.sent.push(JSON.parse(msg))}
 close(){this.readyState=3;this.emit('close')}
 message(x){this.emit('message',{data:JSON.stringify(x)})}
}
test('PC sends signed urgent forecast transitions and refreshes viewer immediately',()=>{
 const topic='realtime:sentinel-'+'a'.repeat(48);let at=now,viewer=0;
 const b=new SignedLiveBridge(topic,'b'.repeat(64),{clock:()=>at,WebSocketClass:Socket,onViewer:()=>viewer++});
 try{
  b.start();const s=b.socket;s.emit('open');const join=s.sent[0];
  s.message({topic,event:'phx_reply',ref:join.ref,payload:{status:'ok'}});
  s.message({topic,event:'broadcast',payload:{event:'viewer',payload:{at,sig:b.mac(topic+'|'+at)}}});
  assert.equal(viewer,1);
  const frame={v:1,at,seq:0,state:'running',settings:{forecastMode:'continuous',engine:'support_resistance',orderDurationMs:15000},
    lastEvalMs:at,liveBroker:{symbol:'EUR/GBP OTC',quote:1,lastQuoteAt:at},lastResult:{asset:'EUR/GBP OTC',analysis:{}}};
  assert.equal(b.publish(frame),true);
  at+=600;
  const next={...frame,at,lastEvalMs:at,liveBroker:{...frame.liveBroker,lastQuoteAt:at},
    lastResult:{asset:'EUR/GBP OTC',analysis:{vnext:{ea:[15,'CALL',1,1.1,at,15]}}}};
  assert.equal(b.publish(next,{urgent:true}),true);
  assert.equal(s.sent.at(-1).payload.payload.lastResult.analysis.vnext.ea[4],at);
  assert.ok(s.sent.at(-1).payload.payload.sig);
 }finally{b.close()}
});
