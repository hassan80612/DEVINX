import assert from 'node:assert/strict';
import {SignalExecutor} from '../../sentinel-trading-lab/agent/worker/signal-executor.mjs';
export const T=1800000000000;
export function setup(provider='iq_option'){
 let now=T,revision=1,serial=0;const calls=[];
 const c={state:'running',licensed:true,provider,asset:'EUR/USD OTC',activeId:76,durationMs:30000,engine:'automatic',analysis:{},brokerBalance:{provider,accountId:'10',amount:100,receivedAt:now,revision}};
 const balance=(amount,accountId='10')=>c.brokerBalance={provider,accountId,amount,receivedAt:now,revision:++revision};
 const driver={prepare:async()=>{},execute:async(p,o)=>{assert.ok(o.isValid());o.captureEntry();o.clicked=true;calls.push({...o});return{accepted:true,orderId:String(++serial),accountId:'10'};}};
 const bot=new SignalExecutor({driver,context:()=>c,clock:()=>now});bot.configure({amount:1});
 const fire=(side='CALL',engine=c.engine)=>{c.analysis={vnext:{futureEntryAnchor:{context:[provider,'EURUSDOTC',engine,c.durationMs].join('|'),engineId:engine,phase:'fired',side,entryTriggeredAt:now,holdingSeconds:c.durationMs/1000,exitAt:now+c.durationMs,entryPrice:1}}};bot.pulse();return bot.inflight;};
 const close=(netPnl)=>{const p=bot.pending;assert.ok(p);now=Math.max(now,p.exitAt);balance(bot.initialBalance+bot.net+netPnl);return bot.settle({provider,accountId:'10',orderId:p.orderId,netPnl,source:'broker'});};
 return{bot,c,calls,driver,fire,close,balance,advance:ms=>now+=ms,now:()=>now};
}
