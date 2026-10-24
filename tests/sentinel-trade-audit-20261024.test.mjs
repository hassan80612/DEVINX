import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionAudit,acceptedAudit,settlementAudit,summarizeTradeAudit} from '../sentinel-trading-lab/agent/worker/trade-audit.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

test('audit freezes whitelisted evidence without credentials or balance',()=>{
 const context={provider:'iq_option',asset:'EUR/USD',engine:'automatic',quote:1.204,
  quoteAt:12000,brokerBalance:{amount:15,accountId:'sensitive'},
  analysis:{entryPlanner:{regime:{label:'trending'},horizons:{'30':{callProbability:65,
   evidenceFamilies:{momentum:{signal:0.8},reversal:{signal:-0.4}}}}},
   operationalSignal:{entryKind:'continuation',side:'CALL',state:'READY',reason:'trend',
    entryResearch:{qualified:false,probability:0.62,samples:8}}}};
 const signal={id:'signal-1',side:'CALL',durationMs:30000,at:12010,entryPrice:1.203};
 const record=decisionAudit({context,signal,mode:'automatic',martingaleLevel:0,clickCount:1,now:12011});
 assert.equal(record.type,'trade_decision');assert.equal(record.batchId,'signal-1');
 assert.equal(record.structure.evidence.momentum,0.8);
 assert.equal(record.structure.evidence.reversal,-0.4);
 context.analysis.entryPlanner.regime.label='changed';
 assert.equal(record.structure.regime,'trending');
 assert.ok(!JSON.stringify(record).includes('sensitive'));
 assert.ok(!JSON.stringify(record).includes('brokerBalance'));
});

test('only broker-confirmed, deduplicated outcomes enter the diagnostic',()=>{
 const decision=decisionAudit({signal:{id:'key|automatic',side:'PUT',durationMs:30000},
  context:{provider:'exnova',asset:'EUR/USD',analysis:{entryPlanner:{regime:{label:'range'}},
   operationalSignal:{entryKind:'reversal'}}},mode:'automatic',martingaleLevel:0,clickCount:1,now:50});
 const ack=acceptedAudit({provider:'exnova',orderId:'order-1',
  localId:'key|automatic|click-0'},51);
 const win=settlementAudit({provider:'exnova',orderId:'order-1',netPnl:0.8,source:'broker'},52);
 const ignored=settlementAudit({provider:'exnova',orderId:'order-2',netPnl:2,source:'forecast'},53);
 assert.equal(ignored,null);
 const report=summarizeTradeAudit([decision,ack,win,win],{minSamples:1});
 assert.equal(report.matched,1);assert.equal(report.orphanSettlements,0);
 assert.equal(report.byMode[0].key,'automatic');assert.equal(report.byMode[0].winRate,100);
 assert.equal(report.byRegime[0].key,'range');
 assert.equal(report.byEntryKind[0].key,'reversal');
 assert.equal(report.byMode[0].netPnl,0.8);
});

test('unmatched outcomes and independent directions cannot inflate analyst accuracy',()=>{
 const other=settlementAudit({provider:'exnova',orderId:'unmatched',netPnl:-1,source:'broker'},100);
 const decision=decisionAudit({signal:{id:'independent-1',side:'CALL',durationMs:5000,independent:true},
  context:{provider:'exnova',asset:'EUR/USD'},mode:'call',now:101});
 const ack=acceptedAudit({provider:'exnova',orderId:'ok',localId:'independent-1|click-0'},102);
 const outcome=settlementAudit({provider:'exnova',orderId:'ok',netPnl:-1,source:'broker'},103);
 const report=summarizeTradeAudit([other,decision,ack,outcome],{minSamples:20});
 assert.equal(report.matched,1);assert.equal(report.orphanSettlements,1);
 assert.equal(report.byMode[0].key,'call');
 assert.equal(report.byMode[0].winRate,null);
});

test('martingale clicks and fixed CALL do not inflate analyst signal accuracy',()=>{
 const raw={provider:'iq_option',asset:'GBP/USD',analysis:{entryPlanner:{regime:{label:'trend'}},operationalSignal:{entryKind:'continuation'}}};
 const automatic=decisionAudit({context:raw,signal:{id:'auto-1',side:'CALL',durationMs:30000},mode:'automatic',martingaleLevel:0,clickCount:1,now:10});
 const mult=decisionAudit({context:raw,signal:{id:'mg-1',side:'CALL',durationMs:30000},mode:'automatic',martingaleLevel:1,clickCount:2,now:11});
 const manual=decisionAudit({context:raw,signal:{id:'fixed-1',side:'CALL',durationMs:30000,independent:true},mode:'call',martingaleLevel:0,clickCount:1,now:12});
 const accepted=[
  acceptedAudit({provider:'iq_option',orderId:'a',localId:'auto-1|click-0'}),
  acceptedAudit({provider:'iq_option',orderId:'b',localId:'mg-1|click-0'}),
  acceptedAudit({provider:'iq_option',orderId:'c',localId:'fixed-1|click-0'})];
 const results=[
  settlementAudit({provider:'iq_option',orderId:'a',netPnl:0.8,source:'broker'}),
  settlementAudit({provider:'iq_option',orderId:'b',netPnl:-1,source:'broker'}),
  settlementAudit({provider:'iq_option',orderId:'c',netPnl:-1,source:'broker'})];
 const out=summarizeTradeAudit([automatic,mult,manual,...accepted,...results],{minSamples:1});
 assert.equal(out.matched,3);
 assert.equal(out.analystFirstClickSettlements,1);
 assert.equal(out.excludedFromAnalystAccuracy,2);
 assert.equal(out.byRegime[0].winRate,100);
 assert.equal(out.byMode.find(x=>x.key==='automatic').winRate,50);
});

test('real executor records each accepted order and confirmed settlement once',async()=>{
 let now=1800000000000,clicks=0;
 const history=[],context={state:'running',licensed:true,provider:'iq_option',
  accountId:'10',activeId:76,asset:'EUR/USD OTC',mode:'demo',durationMs:30000,engine:'automatic',
  analysis:{},quote:1.203,quoteAt:now};
 const driver={prepare:async()=>({ready:true}),execute:async(provider,order)=>{clicks++;return{accepted:true,orderId:'order-42'};}};
 const bot=new SignalExecutor({driver,context:()=>context,clock:()=>now,onAuditEvent:event=>history.push(event)});
 bot.configure({amount:10});
 await bot.start();
 context.analysis={vnext:{futureEntryAnchor:Object.freeze({
  context:'iq_option|EURUSDOTC|automatic|30000',phase:'fired',side:'CALL',
  entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000})}};
 bot.pulse();
 await bot.inflight;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(clicks,1);
 assert.equal(history.filter(x=>x.type==='trade_decision').length,1);
 assert.equal(history.filter(x=>x.type==='broker_accepted').length,1);
 assert.equal(bot.settle({provider:'iq_option',orderId:'order-42',netPnl:8,source:'broker'}),true);
 assert.equal(bot.settle({provider:'iq_option',orderId:'order-42',netPnl:8,source:'broker'}),false);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(history.filter(x=>x.type==='broker_settlement').length,1);
 const report=summarizeTradeAudit(history,{minSamples:1});
 assert.equal(report.matched,1);
 assert.equal(report.analystFirstClickSettlements,1);
 assert.equal(report.byRegime[0].wins,1);
});

test('broken audit callback cannot block a valid broker click or its confirmed result',async()=>{
 let now=1800000000000,clicks=0;
 const context={state:'running',licensed:true,provider:'iq_option',accountId:'10',
  activeId:76,asset:'EUR/USD OTC',mode:'demo',durationMs:30000,engine:'automatic',
  analysis:{},quote:1.203,quoteAt:now};
 const driver={prepare:async()=>({ready:true}),execute:async()=>{clicks++;return{accepted:true,orderId:'order-43'};}};
 const bot=new SignalExecutor({driver,context:()=>context,clock:()=>now,onAuditEvent:()=>{throw Error('disk full')}});
 bot.configure({amount:10});await bot.start();
 context.analysis={vnext:{futureEntryAnchor:{context:'iq_option|EURUSDOTC|automatic|30000',
  phase:'fired',side:'PUT',entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};
 bot.pulse();await bot.inflight;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(clicks,1);
 assert.equal(bot.settle({provider:'iq_option',orderId:'order-43',netPnl:-10,source:'broker'}),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bot.closed,1);
});

test('fired NOW audit uses exact-tick evidence, never previous AGUARDAR analysis',async()=>{
 const now=1800000000000,history=[],calls=[];
 const context={provider:'iq_option',asset:'FRONT.COFFEE OTC',state:'running',licensed:true,
  accountId:'10',activeId:76,durationMs:60000,engine:'smart_confluence',
  quote:317.312,quoteAt:now-100,
  analysis:{operationalSignal:{side:'AGUARDAR',state:'ANALISANDO',strength:0},
    entryPlanner:{horizons:{}}}};
 const bot=new SignalExecutor({driver:{prepare:async()=>({ready:true}),
  execute:async(_provider,order)=>{calls.push(order);return{accepted:true,orderId:'actual-1'}}},
  context:()=>context,clock:()=>now,onAuditEvent:r=>history.push(r)});
 bot.configure({amount:10});await bot.start();
 const fired={phase:'fired',context:'iq_option|FRONT.COFFEE OTC|smart_confluence|60000',
  engineId:'smart_confluence',side:'CALL',entryTriggeredAt:now,holdingSeconds:60,
  exitAt:now+60000,entryPrice:317.312};
 const proof={source:'now-structural-v1',signalAt:now,snapshotAt:now,quoteAt:now-100,
  finalSide:'CALL',finalReason:'confirmed-level-retest',finalStrength:78,
  rawSide:'CALL',rawReason:'closed-structure-and-live-impulse',
  contextStrategy:'support_resistance',marketShape:'level-turn',
  support:{level:317.2,touches:4},resistance:{level:317.4,touches:3},
  observedImpulse:0.002,probabilityCall:0.64};
 bot.pulse(fired,proof);
 await bot.inflight;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1);
 const d=history.find(e=>e.type==='trade_decision');
 assert.equal(d.structure.provenance,'fired-tick-now');
 assert.equal(d.structure.reason,'confirmed-level-retest');
 assert.equal(d.structure.technicalStrength,78);
 assert.equal(d.structure.marketShape,'level-turn');
 assert.equal(d.structure.support.level,317.2);
 assert.equal(d.structure.resistance.touches,3);
 assert.equal(d.structure.side,'CALL');
 assert.equal(d.probability.estimated,0.64);
 assert.equal(bot.settle({provider:'iq_option',orderId:'actual-1',netPnl:-10,source:'broker'}),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(summarizeTradeAudit(history,{minSamples:1}).matched,1);
});

test('audit ignores mismatched NOW tick metadata without blocking entry',()=>{
 const record=decisionAudit({context:{provider:'iq_option',analysis:{
  operationalSignal:{side:'AGUARDAR',state:'ANALISANDO',strength:0}}},
  signal:{id:'s',side:'PUT',at:123,durationMs:60000,
   auditEvidence:{source:'now-structural-v1',signalAt:122,finalSide:'PUT',
    finalReason:'wrong-signal-reason'}},mode:'automatic',now:123});
 assert.equal(record.structure.provenance,'analysis-snapshot');
 assert.equal(record.structure.reason,null);
});
