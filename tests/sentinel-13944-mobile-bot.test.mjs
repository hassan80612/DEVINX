import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {packExecutor,unpackExecutor,dispatchExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {dashboardTransportState} from '../sentinel-trading-lab/agent/worker/remote-status.mjs';
import {analystWireV1} from '../sentinel-trading-lab/src/lib/analyst-wire-v1.mjs';
const T=1800000000000;
for(const provider of ['iq_option','exnova'])test(provider+': phone config/start/stop uses same executor and preserves an open entry',async()=>{
 let now=T;const calls=[];
 const c={provider,asset:'EUR/GBP OTC',durationMs:30000,licensed:true,state:'running',engine:'trend',analysis:{},brokerBalance:{provider,accountId:'10',amount:20,receivedAt:T,revision:1}};
 const executor=new SignalExecutor({clock:()=>now,context:()=>c,driver:{prepare:async()=>{},execute:async(p,o)=>{assert.ok(o.isValid());calls.push(o.side);o.captureEntry();o.clicked=true;return{accepted:true,orderId:'fixture-1'};}}});
 const run=async(action,payload)=>{if(action==='executor-config')return executor.configure(payload.patch);if(action==='executor-stop')return executor.stop();if(action==='executor-start')return executor.start();throw Error('unsupported');};
 const cmd=(p,payload={})=>dispatchExecutor('/executor/'+p,payload,run,()=>c);
 await cmd('config',{patch:{initialBalance:20,amount:1,payoutPercent:86,stopLoss:5}});
 await assert.rejects(cmd('start',{context:{...c,provider:'other'}}),/mudou/);assert.equal(executor.enabled,false);
 await cmd('start',{context:c});assert.ok(executor.enabled);
 c.analysis={vnext:{futureEntryAnchor:{phase:'fired',side:'PUT',context:provider+'|EURGBPOTC|trend|30000',entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000,entryPrice:1}}};
 executor.pulse();await executor.inflight;assert.deepEqual(calls,['PUT']);
 await cmd('config',{patch:{stopAfterMinutes:3,amount:2}});assert.equal(executor.pending.amount,1);
 await cmd('stop');assert.equal(executor.enabled,false);assert.ok(executor.pending);
 await cmd('config',{patch:{stopAfterMinutes:0,stopLoss:8}});assert.equal(executor.config.stopLoss,8);
 await cmd('start',{context:c});assert.equal(executor.enabled,true);assert.ok(executor.pending);assert.equal(executor.pending.orderId,'fixture-1');
 c.analysis.vnext.futureEntryAnchor.entryTriggeredAt=++now;executor.pulse();await executor.inflight;assert.deepEqual(calls,['PUT']);
 await assert.rejects(cmd('map'),/inválido/);
});
test('remote bot status is bounded, signs every value, and survives the saturated-frame fallback',()=>{
 const status={enabled:true,arming:false,executing:false,config:{amount:1,initialBalance:20,payoutPercent:86,intervalMs:30000,stopAfterMinutes:0,stopLoss:5},message:'Ligado',netPnl:-2,calculatedBalance:18,availableBalance:17,balanceSource:'broker-received-balance',brokerBalance:{amount:17,receivedAt:T,accountId:'private-account'},riskNetPnl:-2,executed:4,closed:3,pending:{side:'PUT',state:'accepted',exitAt:T+30000,entryPrice:1,orderId:'private-order'},provider:'exnova',updatedAt:T,history:Array(200).fill({secret:'never'})};
 const bot=packExecutor(status),remote=unpackExecutor(bot);
 assert.equal(remote.pending.side,'PUT');assert.equal(remote.config.stopLoss,5);assert.equal(remote.enabled,true);assert.equal(JSON.stringify(bot).includes('private'),false);assert.equal(JSON.stringify(bot).includes('secret'),false);
 const frame=analystSnapshot({bot,agentVersion:'13.9.44',state:'running',settings:{engine:'trend',orderDurationMs:30000},lastResult:{asset:'EUR/GBP OTC',analysis:{vnext:{engineId:'trend',expirySeconds:30,computedStatus:'x'.repeat(6000),futureEntryRows:Array(500).fill({side:'CALL',holdingSeconds:30}),receipt:{side:'CALL'},opportunityWindow:{phase:'open',windowStartedAt:T,windowEndsAt:T+30000}}}}},{symbol:'EUR/GBP OTC',lastQuoteAt:T,quote:1});
 const fit=fitAnalystFrame(frame);assert.ok(fit);assert.ok(Buffer.byteLength(JSON.stringify(fit))<=2920);assert.deepEqual(fit.bot,bot);
 const key='fixture-key',mac=x=>createHmac('sha256',key).update(analystWireV1(x)).digest('hex');
 const signed=mac(fit);const reordered=Object.fromEntries(Object.entries(fit).reverse());assert.equal(mac(reordered),signed);reordered.bot=structuredClone(bot);reordered.bot[0]=0;assert.notEqual(mac(reordered),signed);
 assert.deepEqual(dashboardTransportState({autoExecutor:remote}).autoExecutor,remote);
});

