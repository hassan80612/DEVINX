import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executorMonitorReadout,executorMonitor} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {patchExecutorReadouts} from '../sentinel-trading-lab/agent/worker/executor-readouts.mjs';
import {patchMarketTotals} from '../sentinel-trading-lab/agent/worker/market-totals-readout.mjs';
const root=new URL('../sentinel-trading-lab/agent/worker/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const state={provider:'exnova',enabled:true,arming:false,executing:false,message:'Ligado · analisando',
 sessionWins:7,sessionLosses:2,netPnl:14.34,availableBalance:55.90,
 brokerBalance:{amount:55.90,receivedAt:1800000000000,revision:3},
 unresolvedDetail:{waitingResult:0,waitingId:0,uncertainAttempts:0},
 riskNetPnl:14.34,consecutiveLossBatches:0,
 config:{martingaleEnabled:false,martingaleLevels:2,stopLoss:0,stopWin:3000,amount:1.50}};
test('monitor receipt has same values as full card in both ACTIVE and ANALYZING phases',()=>{
 for(const variant of [{}, {executing:true,message:'Operação em andamento',sessionWins:6},
   {message:'Novo resultado confirmado',sessionWins:7,sessionLosses:2,unresolvedDetail:{waitingResult:1}}]){
  const s={...state,...variant},receipt=executorMonitorReadout(s,'pt'),html=executorMonitor(s,'pt');
  assert.ok(receipt);
  for(const [key,value] of [['winLoss',receipt.winLoss],['balance',receipt.balance],['session',receipt.session],
    ['brokerBalance',receipt.brokerBalance],['message',receipt.message],
    ['martingale',receipt.martingale],['stopTargets',receipt.stopTargets]]){
    assert.ok(html.includes(value),key+': '+value);
  }
  assert.equal(receipt.wins,s.sessionWins);
  assert.equal(receipt.losses,s.sessionLosses);
 }
});
test('card repaint only changes existing text nodes and bot-state attribute, never HTML parser',()=>{
 const nodes=new Map();
 const element=()=>({textContent:'',attrs:{},getAttribute(k){return this.attrs[k]??null},setAttribute(k,v){this.attrs[k]=v},disabled:false,children:[]});
 for(const id of ['wl','broker-balance','risk','balance','session','message','state','stop-targets','mg-readout','robot']){
  nodes.set('[data-sentinel-executor-'+id+']',element());
 }
 nodes.set('[data-sentinel-mg-readout]',element());
 nodes.set('[data-sentinel-stop-targets]',element());
 nodes.set('[data-sentinel-robot]',element());
 nodes.set('[data-sentinel-executor-action="start"]',element());
 nodes.set('[data-sentinel-executor-action="map"]',element());
 const clock=element();clock.children=[element(),element()];nodes.set('[data-sentinel-executor-clock-wl]',clock);
 const root={querySelector:selector=>nodes.get(selector)||null};
 const originalDocument=globalThis.document,originalWindow=globalThis.window;
 globalThis.window={};
 globalThis.document={getElementById:id=>id==='sentinel-trading-overlay-host'?{shadowRoot:root}:null,
   createElement:()=>{throw Error('heavy HTML parser forbidden')}};
 try{
  const one=executorMonitorReadout(state,'pt');
  patchExecutorReadouts({revision:100,readout:one});
  assert.equal(nodes.get('[data-sentinel-executor-wl]').textContent,'WIN: 7 / LOSS: 2');
  const two=executorMonitorReadout({...state,sessionWins:8,message:'Ligado · analisando'},'pt');
  patchExecutorReadouts({revision:101,readout:two});
  assert.equal(clock.children[0].textContent,'WIN: 8');
  assert.equal(nodes.get('[data-sentinel-executor-state]').textContent,'BOT LIGADO · ANALISANDO');
  patchExecutorReadouts({revision:99,readout:one});
  assert.equal(clock.children[0].textContent,'WIN: 8');
 }finally{globalThis.document=originalDocument;globalThis.window=originalWindow;}
});
test('three market totals and three summary totals reserve stable geometry, without freezing live values',()=>{
 const css=read('premium-overlay-controls.mjs');
 assert.match(css,/\.sentinel-monitor-results\{display:grid/);
 assert.match(css,/\[data-sentinel-vnext-cards\]>\[data-sentinel-summary\]\{height:116px/);
 for(const id of ['market-total','strategy-total','operational-total'])
  assert.ok(css.includes('[data-sentinel-summary="'+id+'"]:not([data-collapsed="1"])'),id);
 assert.match(read('market-totals-readout.mjs'),/set\(call,'CALL '/);
 assert.match(read('market-totals-readout.mjs'),/set\(put,'PUT '/);
 assert.match(read('latest-overlay-scheduler.mjs'),/isCriticalBusy/);
});
test('driver uses small receipt instead of regenerate monitor HTML on every WIN/LOSS result',()=>{
 const source=read('local-playwright-driver.mjs');
 assert.match(source,/page\.evaluate\(patchExecutorReadouts,\{revision,readout:executorMonitorReadout\(state,language\)/);
 assert.doesNotMatch(source,/page\.evaluate\(patchExecutorReadouts,\{revision,wins/);
});
