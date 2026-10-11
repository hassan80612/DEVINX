import fs from 'node:fs';
import path from 'node:path';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';

const directory=process.argv[2];
if(!directory)throw Error('Required: directory of original archived 1s CSV market bars');
const HORIZONS=[5,10,30,60,120,300];
const stats=()=>({opportunities:0,baseSignals:0,newSignals:0,baseWins:0,newWins:0,
 comparable:0,baseComparableWins:0,newComparableWins:0,
 rescued:0,harmed:0,draws:0,reversals:0,baseReversalWins:0,newReversalWins:0});
const side=(a,b)=>b>a?'CALL':b<a?'PUT':'DRAW';
function record(s,b,n,truth,turn){
 s.opportunities++;if(truth==='DRAW')s.draws++;
 const bp=['CALL','PUT'].includes(b),np=['CALL','PUT'].includes(n);
 if(bp){s.baseSignals++;if(b===truth)s.baseWins++}
 if(np){s.newSignals++;if(n===truth)s.newWins++}
 if(bp&&np){s.comparable++;if(b===truth)s.baseComparableWins++;
  if(n===truth)s.newComparableWins++;
  if(b!==truth&&n===truth)s.rescued++;if(b===truth&&n!==truth)s.harmed++;}
 if(turn){s.reversals++;if(b===truth)s.baseReversalWins++;if(n===truth)s.newReversalWins++;}
}
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
const summary=s=>({...s,
 baselineAccuracyPct:pct(s.baseWins,s.baseSignals),candidateAccuracyPct:pct(s.newWins,s.newSignals),
 baselineCoveragePct:pct(s.baseSignals,s.opportunities),candidateCoveragePct:pct(s.newSignals,s.opportunities),
 pairedBaselinePct:pct(s.baseComparableWins,s.comparable),pairedCandidatePct:pct(s.newComparableWins,s.comparable),
 baselineReversalPct:pct(s.baseReversalWins,s.reversals),candidateReversalPct:pct(s.newReversalWins,s.reversals)});
const total=stats(),byH=Object.fromEntries(HORIZONS.map(h=>[h,stats()]));
const byFile={},sources=[];
for(const file of fs.readdirSync(directory).filter(x=>x.endsWith('.csv')).sort()){
 const raw=fs.readFileSync(path.join(directory,file),'utf8').trim().split(/\r?\n/);
 const rows=raw.map(line=>{
  const fields=line.split(','),timestamp=Number(fields[0]),price=Number(fields[4]);
  // Binance bar timestamp is OPEN time; its close is observable one second later.
  const ms=timestamp>1e15?timestamp/1000:timestamp;
  return {ts:ms+1000,price};
 });
 if(rows.length<80000||rows.some((r,i)=>!(r.price>0)||!Number.isFinite(r.ts)||
   (i>0&&r.ts-rows[i-1].ts!==1000)))throw Error('Invalid or incomplete 1s archive: '+file);
 const bucket=byFile[file]=stats();
 sources.push({file,quotes:rows.length,firstCloseAt:rows[0].ts,lastCloseAt:rows.at(-1).ts});
 for(let i=3600;i+600<rows.length;i+=1800){
  // Both motors receive the same production-sized 2400-point window.
  const history=rows.slice(i-2399,i+1),now=rows[i].ts;
  for(const h of HORIZONS){
   const b=futureEntrySchedule({settings:{engine:'automatic',asset:file.split('-')[0]},
    snap:{quoteHistory:history,quoteTs:now,provider:'archived-binance-spot'},now,delays:[h]})[0];
   const n=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
    entryDelaySeconds:h,holdingSeconds:h});
   if(b.entryAt!==n.entryAt||b.exitAt!==n.exitAt)throw Error('Interval mismatch');
   const truth=side(rows[i+h].price,rows[i+2*h].price);
   const prior=side(rows[i-30].price,rows[i].price);
   const turn=truth!=='DRAW'&&prior!=='DRAW'&&truth!==prior;
   for(const s of [total,byH[h],bucket])record(s,b.side,n.side,truth,turn);
  }
 }
}
const report={baselineVersion:'13.4.67.1',baselineCommit:'431bd6ffc276015a6581e0d6ba7a56c244de72e9',
 candidate:'adaptive-direct-trajectory-v1',source:'REAL archived Binance spot 1s closes, NOT IQ Option/Xnova',
 target:'forecast at T using past: direction price(T+H)->price(T+2H)',
 quoteAvailability:'one-second bar close timestamp shifted from bar open by 1000ms',
 independentlySelectedIssueSpacingSeconds:1800,productionHistoryPoints:2400,
 modelParametersFrozenBeforeArchiveEvaluation:true,brokerExecutionWinRate:false,
 correlatedHorizons:true,missingOutcomesCountAsWins:false,
 drawsAreReportedSeparatelyAndNotWins:true,sources,total:summary(total),
 byHorizon:Object.fromEntries(Object.entries(byH).map(([k,v])=>[k,summary(v)])),
 byFile:Object.fromEntries(Object.entries(byFile).map(([k,v])=>[k,summary(v)]))};
console.log('SENTINEL_ADAPTIVE_REAL_COMPARISON='+JSON.stringify(report));
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
