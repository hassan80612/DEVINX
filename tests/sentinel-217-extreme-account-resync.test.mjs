import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateExtremeBoundary,reviewExtremeBoundarySide} from '../sentinel-trading-lab/agent/src/core/extreme-boundary-review.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {entryFamilyOf} from '../sentinel-trading-lab/agent/src/core/entry-family.mjs';
import {readFileSync} from 'node:fs';
const NOW=1800000000000;
function extremeFixture(){
 const quoteHistory=Array.from({length:61},(_,i)=>({
  ts:NOW-60000+i*1000,receivedAt:NOW-60000+i*1000,
  price:1.1+i*.000011+(Math.floor(i/5)%2===0?-.00004:.00004)+(i===60?.00017:0)
 }));
 const price=quoteHistory.at(-1).price;
 const candidate={ready:true,side:'CALL',observedAt:NOW,entryPrice:price,reason:'closed-structure-and-live-impulse'};
 return{candidate,quoteHistory,quoteAt:NOW,now:NOW,price,asset:'EUR/USD OTC',
  durationMs:60000,entryFamily:'automatic',levels:{resistance:{level:price+.00007,touches:5}}};
}
test('217 narrow exhaustion detector: real quote evidence and original candidate immutable',()=>{
 const base=extremeFixture(),snapshot=JSON.stringify(base);
 const evidence=evaluateExtremeBoundary(base);
 assert.equal(evidence.proposeOpposite,true);
 assert.equal(evidence.hypotheticalSide,'PUT');
 const voted=reviewExtremeBoundarySide(base);
 assert.equal(voted.side,'PUT');assert.equal(voted.originalSide,'CALL');
 assert.equal(entryFamilyOf(voted),'reversal');
 assert.equal(JSON.stringify(base),snapshot);
});
test('217 preservation: 30s, 5m, other assets, manual strategies and stale/future quotes',()=>{
 const base=extremeFixture();
 for(const patch of [{durationMs:30000},{durationMs:300000},{asset:'EUR/GBP OTC'},
   {entryFamily:'continuation'},{entryFamily:'reversal'},{quoteAt:NOW-1000},
   {candidate:{...base.candidate,observedAt:NOW-1000}},
   {levels:{resistance:{level:base.price+.00007,touches:1}}}]){
  const args={...base,...patch};
  assert.equal(reviewExtremeBoundarySide(args).side,'CALL');
 }
 const future={...base,quoteHistory:[...base.quoteHistory,
  {ts:NOW+1000,receivedAt:NOW,price:9},
  {ts:NOW-1000,receivedAt:NOW+5000,price:9}]};
 assert.equal(reviewExtremeBoundarySide(future).side,'PUT');
});
test('217 account reset: new confirmed DEMO account, bot OFF and limits unchanged',()=>{
 let context={provider:'iq_option',brokerMode:'demo',durationMs:60000,
  brokerBalance:{provider:'iq_option',accountId:'new-demo',amount:1000,revision:2,receivedAt:NOW,source:'protocol'}};
 const bot=new SignalExecutor({driver:{},context:()=>context,clock:()=>NOW});
 bot.enabled=true;bot.session={provider:'iq_option',accountId:'old-real',asset:'EUR/USD OTC',durationMs:60000,engine:'automatic'};
 bot.config.stopLoss=500;bot.config.stopWin=1500;
 const s=bot.resetForAccountSwitch();
 assert.equal(s.enabled,false);assert.equal(s.brokerBalance.accountId,'new-demo');
 assert.equal(s.config.stopLoss,500);assert.equal(s.config.stopWin,1500);
 assert.equal(bot.session,null);assert.match(s.message,/ligue o bot/);
});
test('217 account reset: never clear unresolved order, stale balance or REAL without rearm',()=>{
 let context={provider:'iq_option',brokerMode:'real',durationMs:60000,
  brokerBalance:{provider:'iq_option',accountId:'real',amount:100,revision:5,receivedAt:NOW,source:'protocol'}};
 const bot=new SignalExecutor({driver:{},context:()=>context,clock:()=>NOW});
 bot.enabled=true;bot.pending={orders:[],id:'still-pending'};
 assert.throws(()=>bot.resetForAccountSwitch(),/pendente/);
 assert.equal(bot.enabled,true);assert.notEqual(bot.pending,null);
 bot.pending=null;context={...context,brokerBalance:{...context.brokerBalance,receivedAt:NOW-40000}};
 assert.throws(()=>bot.resetForAccountSwitch(),/não confirmada/);
 assert.equal(bot.enabled,true);
 context={...context,brokerBalance:{...context.brokerBalance,receivedAt:NOW}};
 bot.unresolvedBatches.set('unknown',{orders:[{clicked:true,settled:false,amount:10}]});
 assert.throws(()=>bot.resetForAccountSwitch(),/pendente/);
 bot.unresolvedBatches.clear();
 const s=bot.resetForAccountSwitch();
 assert.equal(s.enabled,false);assert.match(s.message,/REAL/);
});
test('217 route and card limited to Sentinel module',()=>{
 const index=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../sentinel-trading-lab/src/components/BotControl.tsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(index,/action==='executor-reset-account'/);
 assert.match(ui,/Sincronizar conta/);
 assert.match(ui,/executor\/reset-account/);
 assert.match(runtime,/reviewExtremeBoundarySide/);
});
