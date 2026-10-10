import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rankByChosenStrategies} from '../sentinel-trading-lab/agent/src/core/strategy-entry-ranking.mjs';
const CALL={side:'CALL',allowed:true,score:78,kind:'continuation'};
const PUT={side:'PUT',allowed:true,score:78,kind:'reversal'};
function pref(callPct,evidence=100){
 return {horizons:{'30':{activeCount:2,evidence,callPct,putPct:100-callPct,side:callPct>=50?'CALL':'PUT'}}};
}
test('chosen trend strategies prefer CALL on an otherwise equal technical setup',()=>{
 const q=rankByChosenStrategies([CALL,PUT],pref(90),30);
 assert.equal(q[0].score,q[1].score);
 assert.ok(q[0].rankingScore>q[1].rankingScore);
 assert.equal(q[0].chosenStrategyBias,'CALL');
 assert.equal(q[0].allowed,true);assert.equal(q[1].allowed,true);
});
test('chosen reversal strategies prefer PUT without borrowing the subanalyst direction',()=>{
 const q=rankByChosenStrategies([CALL,PUT],pref(14),30);
 assert.ok(q[1].rankingScore>q[0].rankingScore);
 assert.equal(q[1].chosenStrategyBias,'PUT');
 assert.equal(q[0].allowed,true);
});
test('strong local evidence can beat a conflicting selected strategy without an artificial lock',()=>{
 const q=rankByChosenStrategies([{...CALL,score:92},{...PUT,score:66}],pref(15),30);
 assert.ok(q[0].rankingScore>q[1].rankingScore);
});
test('paused/absent strategies do not alter the entry ranking',()=>{
 const q=rankByChosenStrategies([CALL,PUT],{horizons:{'30':{activeCount:0,evidence:100,callPct:99,putPct:1}}},30);
 assert.deepEqual(q.map(x=>x.rankingScore),[78,78]);
 assert.deepEqual(q.map(x=>x.chosenStrategyBias),['NEUTRO','NEUTRO']);
});
test('live market evidence is not overwritten by a strategy forecast',()=>{
 const c={...CALL,allowed:false,blockedBy:'feed',score:10};
 const q=rankByChosenStrategies([c],pref(99),30);
 assert.equal(q[0].allowed,false);
 assert.equal(q[0].blockedBy,'feed');
 assert.equal(q[0].score,10);
});
test('main motor contains no direct dependent veto from the subanalyst or old path guard',async()=>{
 const source=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(source,/rankByChosenStrategies\(/);
 assert.doesNotMatch(source,/reconcileEntryWithConfirmedReversal\(/);
 assert.doesNotMatch(source,/baselineCandidates\.filter\(c=>!guardEnabled/);
 assert.match(source,/this\.entryCandidates=candidates/);
 assert.match(source,/this\._confirmPriceTrigger/);
});
