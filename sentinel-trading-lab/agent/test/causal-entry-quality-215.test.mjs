import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewCausalEntry215} from '../src/core/causal-entry-quality-215.mjs';
const t=1800000000000;
function tape(spike=false){return Array.from({length:121},(_,i)=>{const ts=t+(i-120)*1000;return {ts,receivedAt:ts,price:1.1+(i-120)*.000001+(spike&&i>115?(i-115)*.00004:0)};});}
function run(reason,rows,durationMs=60000,extra={}){const price=rows.at(-1).price;return reviewCausalEntry215({candidate:{ready:true,side:'CALL',reason,observedAt:t,entryPrice:price,...extra},quoteHistory:rows,quoteAt:t,now:t,price,durationMs,structure:{candleLevelMap:{tolerance:.00003}}});}
test('exceptional exhausted 5s burst blocks one quote, not a duration',()=>assert.equal(run('closed-structure-and-live-impulse',tape(true)).ready,false));
test('ordinary impulse is not rejected',()=>assert.equal(run('closed-structure-and-live-impulse',tape()).ready,true));
test('30s and 5m remain untouched',()=>{for(const ms of [30000,300000])assert.equal(run('closed-structure-and-live-impulse',tape(true),ms).ready,true);});
test('a structural reversal that has not lost its level remains eligible',()=>assert.equal(run('confirmed-level-structure-reversal',tape(),60000,{priceStructure:{confirmedReversal:{level:{level:1.099}}}}).ready,true));
test('an already invalidated structural reversal is blocked',()=>{const rows=Array.from({length:121},(_,i)=>{const ts=t+(i-120)*1000;return {ts,receivedAt:ts,price:1.1003-i*.000003};});assert.equal(run('confirmed-level-structure-reversal',rows,60000,{priceStructure:{confirmedReversal:{level:{level:1.1}}}}).ready,false);});
test('late or unreceived data cannot create a veto',()=>{const rows=tape(true).map((q,i)=>i===120?{...q,receivedAt:t+10000}:q);assert.equal(run('closed-structure-and-live-impulse',rows).ready,true);});
