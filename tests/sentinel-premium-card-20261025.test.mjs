import test from 'node:test';
import assert from 'node:assert/strict';
import {executorPanel,executorActions} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
test('compact card preserves every editable bot setting and exposes only one start/stop outside collapsed settings',()=>{
 const state={provider:'exnova',config:{stopLoss:37.25,stopWin:123.45,martingaleEnabled:true,martingaleLevels:3,martingaleMultiplier:3},availableBalance:72.99,sessionWins:2,sessionLosses:3};
 const html=executorPanel(state),actions=executorActions(state);
 for(const key of ['directionMode','stopLoss','stopWin','martingaleEnabled','maxConsecutiveLosses'])assert.equal((html.match(new RegExp('data-sentinel-executor-setting="'+key+'"','g'))||[]).length,1,key);
 assert.match(html,/value="37\.25"/);assert.match(html,/value="123\.45"/);
 assert.ok(html.includes('1 clique(s) → 2 clique(s)'));assert.doesNotMatch(html,/data-sentinel-executor-setting=\"martingaleLevels\"|data-sentinel-executor-setting=\"martingaleMultiplier\"/);
 assert.match(html,/Disponível: 72\.99/);assert.match(html,/WIN: 2 \/ LOSS: 3/);
 assert.doesNotMatch(html,/<details[^>]*\sopen[\s>]/);
 assert.doesNotMatch(html,/executor-action="(?:start|stop)"/);
 for(const action of ['start','stop'])assert.equal((actions.match(new RegExp('executor-action="'+action+'"','g'))||[]).length,1);
 assert.match(executorActions({...state,enabled:true}),/executor-action="start" disabled/);
});
