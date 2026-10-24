import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionAudit,acceptedAudit,settlementAudit,summarizeTradeAudit} from '../sentinel-trading-lab/agent/worker/trade-audit.mjs';

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
   operationalSignal:{entryKind:'reversal'}}},mode:'automatic',now:50});
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
