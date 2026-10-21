import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LatestOverlayScheduler} from '../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs';
const START=1820000000000;
function fixture(){
 let now=START,id=0;
 const calls=[];
 const c={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',
   activeId:76,engine:'automatic',durationMs:60000,analysis:{},quote:1.1234,quoteAt:START,
   brokerBalance:{provider:'exnova',accountId:'demo',amount:400,receivedAt:START,revision:1}};
 const driver={prepare:async()=>({ready:true}),execute:async(_,order)=>{
   assert.equal(order.isValid(),true);
   order.captureEntry?.();order.clicked=true;
   calls.push({side:order.side,at:now,amount:order.amount,durationMs:order.durationMs,id:String(++id)});
   return{accepted:true,orderId:String(id)};
 }};
 const bot=new SignalExecutor({clock:()=>now,context:()=>c,driver});
 bot.configure({amount:1,stopLoss:0,martingaleEnabled:false});
 const setTime=ms=>{now=START+ms;c.quoteAt=now;c.brokerBalance.receivedAt=now;};
 return{bot,c,calls,setTime};
}
for(const [mode,expected] of [['call','CALL'],['put','PUT']]){
 test('scheduled '+mode+' ignores analyst direction and issues one '+expected+' each five seconds',async()=>{
  const x=fixture();x.c.durationMs=5000;x.bot.configure({directionMode:mode});
  await x.bot.start();
  for(const ms of [0,5000,10000,15000,20000]){
   x.setTime(ms);
   x.c.analysis={vnext:{futureEntryAnchor:{side:expected==='CALL'?'PUT':'CALL',phase:'fired',
     context:'exnova|EURUSDOTC|automatic|60000',entryTriggeredAt:START+ms,
     holdingSeconds:60,exitAt:START+ms+60000}}};
   x.bot.pulse();await x.bot.inflight;
  }
  assert.equal(x.calls.length,5);
  assert.deepEqual(x.calls.map(v=>v.side),Array(5).fill(expected));
  assert.deepEqual(x.calls.map(v=>v.at),[0,5000,10000,15000,20000].map(x=>x+START));
  assert.ok(x.calls.every(v=>v.durationMs===5000));
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.unresolvedBatches.size,5,'all 5 simultaneous live orders are still identified and tracked');
  assert.equal(x.bot.enabled,true);
 });
}
test('fixed-direction scheduler skips stale quotes and does not catch up with duplicate clicks',async()=>{
 const x=fixture();x.c.durationMs=5000;x.bot.configure({directionMode:'call'});await x.bot.start();
 x.bot.pulse();await x.bot.inflight;assert.equal(x.calls.length,1);
 x.setTime(30000);x.c.quoteAt=START; x.bot.pulse();assert.equal(x.calls.length,1);
 x.setTime(35000); x.bot.pulse();await x.bot.inflight;assert.equal(x.calls.length,2);
 assert.equal(x.calls[1].at,START+35000);
});
test('Automatic ignores cadence and remains dependent on its actual final signal',async()=>{
 const x=fixture();await x.bot.start();
 for(const ms of [0,5000,10000]){x.setTime(ms);x.bot.pulse();}
 assert.equal(x.calls.length,0);
 x.setTime(15000);const t=START+15000;
 x.c.analysis={vnext:{futureEntryAnchor:{context:'exnova|EURUSDOTC|automatic|60000',
  phase:'fired',side:'PUT',entryTriggeredAt:t,holdingSeconds:60,exitAt:t+60000}}};
 x.bot.pulse();await x.bot.inflight;
 assert.equal(x.calls.length,1);assert.equal(x.calls[0].side,'PUT');
});
test('switch CALL and PUT live without stopping and without dropping tracked open broker orders',async()=>{
 const x=fixture();x.c.durationMs=5000;await x.bot.start();
 x.bot.configure({directionMode:'call'});
 x.bot.pulse();await x.bot.inflight;
 assert.equal(x.calls.length,1);assert.equal(x.calls[0].side,'CALL');
 x.bot.configure({directionMode:'put'});
 assert.equal(x.bot.enabled,true);
 assert.equal(x.bot.unresolvedBatches.size,1);
 x.setTime(5000);x.bot.pulse();await x.bot.inflight;
 assert.equal(x.calls.length,2);assert.equal(x.calls[1].side,'PUT');
 x.bot.configure({directionMode:'automatic'});
 assert.equal(x.bot.enabled,true);
 assert.equal(x.bot.unresolvedBatches.size,2);
 x.setTime(10000);x.bot.pulse();assert.equal(x.calls.length,2);
});
test('new controls preserve old status length and decode optional string direction',()=>{
 const x=fixture();x.c.durationMs=10000;x.bot.configure({directionMode:'call'});
 const packed=packExecutor(x.bot.status()),decoded=unpackExecutor(packed);
 assert.equal(packed.length,19);
 assert.equal(decoded.config.directionMode,'call');
 assert.equal(decoded.config.directionMode,'call');
 const oldPack=structuredClone(packed);oldPack[3].pop();
 assert.equal(unpackExecutor(oldPack).config.directionMode,undefined);
 const html=executorPanel(x.bot.status(),'pt');
 assert.match(html,/Somente CALL/);assert.match(html,/Somente PUT/);
 assert.doesNotMatch(html,/data-sentinel-executor-setting="intervalMs"/);
});
test('2m 5m are accepted without entering the 30s probability override',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 for(const ms of [120000,300000]){rt.patchSettings({orderDurationMs:ms},'test');assert.equal(rt.settings.orderDurationMs,ms);}
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/5000,10000,15000,30000,60000,120000,300000/);
 const ui=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/<label[^\n]*>EXPIRAÇÃO <select data-sentinel-setting="duration"/);
});

test('fixed CALL and PUT both follow broker-confirmed 1/2/4/8 martingale',async()=>{
 for(const mode of ['call','put']){
  const x=fixture();x.c.durationMs=5000;
  x.bot.configure({directionMode:mode,martingaleEnabled:true,martingaleMultiplier:2,martingaleLevels:3});
  await x.bot.start();
  for(const [i,n] of [1,2,4,8].entries()){
   x.setTime(i*5000);
   const old=x.calls.length;x.bot.pulse();await x.bot.inflight;
   const batch=x.calls.slice(old);assert.equal(batch.length,n);
   assert.ok(batch.every(o=>o.side===(mode==='call'?'CALL':'PUT')));
   for(const trade of batch)x.bot.settle({provider:'exnova',orderId:trade.id,netPnl:-1,source:'broker'});
  }
  assert.equal(x.bot.enabled,true);assert.equal(x.bot.nextClicks(),1);
 }
});
test('slow control lookup cancels an expired signal before any click',async()=>{
 const x=fixture();x.c.durationMs=30000;await x.bot.start();x.setTime(1000);
 x.c.analysis={vnext:{futureEntryAnchor:{context:'exnova|EURUSDOTC|automatic|30000',phase:'fired',side:'CALL',entryTriggeredAt:START+1000,holdingSeconds:30,exitAt:START+31000}}};
 x.bot.driver.execute=async(_,order)=>{x.setTime(2200);assert.equal(order.isValid(),false);throw Object.assign(Error('late'),{beforeClick:true})};
 x.bot.pulse();await x.bot.inflight;
 assert.equal(x.calls.length,0);assert.equal(x.bot.enabled,true);
});
test('overlay reconciling is deferred while the broker click runs',async()=>{
 let busy=true,renders=0;
 const scheduler=new LatestOverlayScheduler(async()=>{renders++},{minIntervalMs:0,slowCooldownMs:0,isCriticalBusy:()=>busy});
 scheduler.publish('exnova',{side:'CALL'},{urgent:true});
 await new Promise(ok=>setTimeout(ok,90));assert.equal(renders,0);
 busy=false;await new Promise(ok=>setTimeout(ok,310));assert.equal(renders,1);
});
