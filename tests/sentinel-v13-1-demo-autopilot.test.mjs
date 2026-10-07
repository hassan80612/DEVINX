import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {engineCycle} from '../sentinel-trading-lab/agent/src/core/engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

function candles(now=Date.now()){
  const base=Math.floor(now/1000)-80*60;
  return Array.from({length:80},(_,i)=>{
    const p=1.08+i*.00005;
    return {from:base+i*60,to:base+(i+1)*60,open:p,high:p+.0002,low:p-.0002,close:p+.00008,volume:100+i}
  })
}
function settings(demoAutopilot){
  return{
    mode:'demo',asset:'EUR/USD',strategy:'trend',demoAutopilot,orderDurationMs:60000,orderProposalTtlMs:60000,
    schedule:{enabled:true,timezone:'UTC',days:['sun','mon','tue','wed','thu','fri','sat'],dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1000,startAt:null,endAt:null},
    risk:{minConfidence:55,maxFeedLatencyMs:5000,maxDecisionLatencyMs:5000,maxExecutionLatencyMs:5000,stakeMode:'fixed',fixedStake:10,stakePct:1,maxStake:50,maxTradesPerDay:20,maxTradesPerHour:10,maxConsecutiveLosses:3,maxDailyLoss:1000,dailyProfitTarget:0,maxDrawdownPct:50,cooldownSeconds:0,lossCooldownSeconds:0}
  }
}
function state(now=Date.now()){
  return{killSwitch:false,botFrozen:false,brokerConnected:true,engineHealthy:true,executionError:false,feedLatencyMs:0,feedStale:false,tradesToday:0,tradesLastHour:0,consecutiveLosses:0,dailyPnl:0,drawdownPct:0,cooldownUntil:null,now}
}

test('V13.1 DEMO autopilot never clicks until explicitly armed',async()=>{
  // Fixed midday UTC keeps this safety test independent from the wall clock at 23:59.
  const now=Date.parse('2026-10-06T12:00:00Z'),cs=candles(now),last=cs.at(-1).close;
  const feed={snapshot:()=>({candles:cs,quoteHistory:[],quoteTs:now,price:last})};
  let calls=0;
  const broker={getBalance:async()=>10000,placeOrder:async proposal=>{calls++;return{id:'demo-test',...proposal,external:true}}};
  const signalGate=async({analysis})=>({allowed:true,analysis:{...analysis,side:'BUY',confidence:90}});

  const disarmed=await engineCycle({feed,broker,settings:settings(false),state:state(now),signalGate,now});
  assert.equal(disarmed.action,'DEMO_READY');
  assert.equal(calls,0,'disarmed DEMO must not click the broker');

  const armed=await engineCycle({feed,broker,settings:settings(true),state:state(now),signalGate,now:now+10});
  assert.equal(armed.action,'DEMO_ORDER');
  assert.equal(calls,1,'armed DEMO should submit exactly one order');
});

test('V13.1 arming a fresh DEMO session resets only session counters',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.trades=Array.from({length:7},(_,i)=>({id:String(i),openedAt:new Date().toISOString(),closedAt:new Date().toISOString(),won:i%2===0,pnl:i%2===0?8.2:-10}));
  rt.state.consecutiveLosses=2;
  rt.settings.demoAutopilot=false;
  rt.patchSettings({demoAutopilot:true,risk:{maxTradesPerSession:10,maxConsecutiveLosses:3}},'test');
  assert.equal(rt.settings.demoAutopilot,true);
  assert.equal(rt.state.sessionTradeStartCount,7);
  assert.equal(rt.state.consecutiveLosses,0);
  assert.ok(Number(rt.state.sessionStartedAt)>0);
});

test('V13.1 DEMO session cap disarms and stops before another market click',async()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.mode='demo';
  rt.settings.demoAutopilot=true;
  rt.settings.risk.maxTradesPerSession=10;
  rt.stateName='running';
  rt.state.sessionTradeStartCount=0;
  rt.trades=Array.from({length:10},(_,i)=>({id:String(i),openedAt:new Date().toISOString(),closedAt:new Date().toISOString(),won:true,pnl:8.2}));
  await rt.tick(Date.now());
  assert.equal(rt.stateName,'stopped');
  assert.equal(rt.settings.demoAutopilot,false);
  assert.ok((rt.lastResult?.reasons||[]).includes('limite da sessão de operações'));
});

test('V13.1 worker binds automation to the broker account and disarms on REAL',async()=>{
  const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
  const broker=await readFile(new URL('../sentinel-trading-lab/agent/worker/adapters/browser-broker.mjs',import.meta.url),'utf8');
  assert.ok(worker.includes("runtime.setMode(brokerMode,'broker')"));
  assert.ok(worker.includes("brokerMode==='real'&&runtime.settings.demoAutopilot===true"));
  assert.ok(worker.includes("runtime.patchSettings({demoAutopilot:false},'system')"));
  assert.ok(broker.includes("if(this.accountMode!=='demo')throw new Error('demo_account_required')"));
  assert.ok(broker.includes("throw new Error('real_execution_requires_human_confirmation')"));
});

test('V13.1 web console uses broker mode as truth while hiding DEMO wording from users',async()=>{
  const ui=await readFile(new URL('../sentinel-trading-lab/src/app/page.tsx',import.meta.url),'utf8');
  assert.ok(ui.includes('ARMAR PILOTO'));
  assert.ok(!ui.includes('ARMAR PILOTO DEMO'));
  assert.ok(!ui.includes('DEMO PRONTA'));
  assert.ok(!ui.includes('DEMO DETECTADA'));
  assert.ok(ui.includes('SOMENTE ANALISAR'));
  assert.ok(ui.includes('DESARMAR E PARAR'));
  assert.ok(ui.includes("brokerMode==='REAL'"));
  assert.ok(ui.includes('O Sentinel nunca converte a conta REAL em automática.'));
  assert.ok(!ui.includes("onClick={()=>mode('demo')}"));
  assert.ok(!ui.includes("onClick={()=>mode('real')}"));
});


test('V13.1 DEMO settlement treats an exact tie as draw, not as a consecutive loss',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  const now=Date.now();
  rt.settings.mode='demo';
  rt.settings.demoAutopilot=true;
  rt.setExternalMarket({provider:'iq_option',source:'IQ OPTION LIVE',balance:10000,quote:1.085,candles:Array.from({length:50},(_,i)=>({open:1,high:1.1,low:.9,close:1.085,from:i,to:i+1})),quoteHistory:[],brokerMode:'demo',feedValidated:true,executionReady:true,symbol:'EUR/USD',quoteTs:now});
  rt.pending=[{orderId:'tie',side:'BUY',referencePrice:1.085,amount:10,asset:'EUR/USD',openedAt:new Date(now-60000).toISOString(),external:true,provider:'iq_option',settleAt:now}];
  rt.state.consecutiveLosses=2;
  rt._settleDue(now);
  assert.equal(rt.pending.length,0);
  assert.equal(rt.trades[0].won,null);
  assert.equal(rt.trades[0].status,'draw');
  assert.equal(rt.trades[0].pnl,0);
  assert.equal(rt.state.consecutiveLosses,2,'draw must not increment the loss streak');
});

test('V13.1 runtime keeps only one external DEMO order open at a time',async()=>{
  const runtime=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
  assert.ok(runtime.includes("pendingExternalDemo=this.pending.some"));
  assert.ok(runtime.includes("demoAutopilot:this.settings.demoAutopilot===true&&canUseExternalDemo&&!pendingExternalDemo"));
  assert.ok(runtime.includes('Operação DEMO anterior ainda aberta — nenhuma entrada sobreposta será enviada.'));
});


test('V13.1 web console normalizes partial Agent state instead of crashing the client',async()=>{
  const ui=await readFile(new URL('../sentinel-trading-lab/src/app/page.tsx',import.meta.url),'utf8');
  assert.ok(ui.includes('function normalizeStatus'));
  assert.ok(ui.includes("schedule:{timezone:'America/Sao_Paulo'"));
  assert.ok(ui.includes('const data=normalizeStatus(localResult.value)'));
  assert.ok(ui.includes("normalizeStatus(await cloudFetch('status'))"));
  assert.ok(ui.includes("schedule=s.settings?.schedule||{}"));
});

test('V13.1 Agent manager records worker stderr before automatic restart',async()=>{
  const manager=await readFile(new URL('../sentinel-trading-lab/agent/worker/agent-manager.mjs',import.meta.url),'utf8');
  assert.ok(manager.includes("const WORKER_LOG=resolve(PID_DIR,'worker.log')"));
  assert.ok(manager.includes("stdio:['ignore','pipe','pipe']"));
  assert.ok(manager.includes("worker.stderr?.on('data'"));
  assert.ok(manager.includes('lastExit'));
});
