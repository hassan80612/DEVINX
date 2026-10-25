// Quote-only regression check. This is NOT the Agent/browser profiler and is
// NOT a replay of the user's 23 broker settlements (those contain no tape).
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity as candidate} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const base='36a7dcca579ff5da33b307c34c9467cfd2d16e44';
const relative='sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const oldSource=execFileSync('git',['show',base+':'+relative]);
assert.deepEqual(readFileSync(new URL('../'+relative,import.meta.url)),oldSource,
 'The candidate must preserve the original 107 decision engine');
const baselineFile=new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.investigation-baseline.mjs',import.meta.url);
writeFileSync(baselineFile,oldSource,{flag:'wx'});
try{
 const {analyzeNowOpportunity:baseline}=await import(baselineFile.href);
 const file=new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url);
 const bytes=readFileSync(file),fixture=JSON.parse(bytes),tape=fixture.quoteHistory;
 const durations=[5000,10000,15000,30000,60000,120000,300000];
 const rounds=process.argv.includes('--three-minutes')?900:120;
 const wallStart=performance.now(),cpuStart=process.cpuUsage(),samples=[],verdicts={};
 let comparisons=0;
 for(let cycle=0;cycle<rounds;cycle++){
  const i=40+Math.floor(cycle*(tape.length-41)/Math.max(1,rounds-1));
  const quotes=tape.slice(0,i+1),point=quotes.at(-1),now=point.ts;
  const start=performance.now();
  for(const durationMs of durations){
   const input={quoteHistory:quotes,price:point.price,quoteAt:now,now,durationMs,
    engineId:'automatic',qualityPolicy:'adaptive-market-v17',candles:[]};
   const oldResult=baseline(input),newResult=candidate(input);
   assert.deepEqual(newResult,oldResult);comparisons++;
   const key=durationMs+'|'+String(newResult.reason);
   verdicts[key]=(verdicts[key]||0)+1;
  }
  samples.push(performance.now()-start);
  if(rounds===900){
   const wait=wallStart+(cycle+1)*200-performance.now();
   if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  }
 }
 samples.sort((a,b)=>a-b);
 const cpu=process.cpuUsage(cpuStart);
 console.log(JSON.stringify({base,fixtureSource:fixture.source,fixtureSha256:createHash('sha256').update(bytes).digest('hex'),
  fixtureLimitations:fixture.limitations,scope:'quote-only base-engine A/B; no candles, broker, Windows Agent or click path',
  comparisons,mismatches:0,wallMs:performance.now()-wallStart,
  combinedBaselineCandidatePerCycleMs:{median:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)]},
  cpuMs:{user:cpu.user/1000,system:cpu.system/1000},memory:process.memoryUsage(),verdicts,
  brokerWinLossComparison:{winsPreserved:null,lossesAvoided:null,winsLost:null,newLosses:null,falseBlocks:null,
   reason:'The user audit contains no historical market frames or rejected-candidate outcomes.'}},null,2));
}finally{unlinkSync(baselineFile);}
