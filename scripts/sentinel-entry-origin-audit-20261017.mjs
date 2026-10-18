import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryOriginTrace} from '../experiments/entry-origin-trace-20261017.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const traced=await entryOriginTrace(),realNow=Date.now,results=[];
const files=['development-08-utc','validation-14-utc','reserved-19-utc','second-validation-10-utc','second-validation-16-utc','second-validation-21-utc'];
const spec={productionCommit:'a6e810400ecf1d909293d80818aa6282f5e81569',
 purpose:'Trace unchanged actual entry decisions; classify causal short-window flow and final decision origins. No rule tuning or entry modification.',
 flowDefinition:'Sign of actual log-return over each of 5/10/20 seconds; classify aligned/opposed only when all are nonzero and agree. Historical quote at/before each target must be within 2500ms.',
 caveats:['Already inspected windows from one external Forex trading day, not live broker/OTC results.','Quote-only video has no native candle history.','The user screenshots do not supply the actual pre-entry quote stream; this does not reconstruct their entries.']};
try{
 const data=[];
 for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));data.push({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',name:file}});
 }
 for(const name of files)data.push(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url))));
 for(const d of data){
  const captured=[];
  class Audited extends traced.DemoTradingRuntime{
   _signalValidationGate(input){
    const out=super._signalValidationGate(input),entry=out.analysis.vnext.futureEntryAnchor;
    if(entry?.entryReadyNow){
     const {snap}=input,rows=snap.quoteHistory,side=entry.side,sign=side==='CALL'?1:-1;
     const moves=[5,10,20].map(seconds=>{const target=snap.quoteTs-seconds*1000;let p;
      for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target&&(rows[i].receivedAt??rows[i].ts)<=input.now){p=rows[i];break;}
      return p&&target-p.ts<=2500?Math.log(snap.price/p.price):null;});
     const flow=moves.every(x=>x!==null&&sign*x>0)?'aligned':moves.every(x=>x!==null&&sign*x<0)?'opposed':'mixed-or-unavailable';
     const trace=this.researchObservation.researchTrace;
     captured.push({at:entry.entryAt,side,moves,flow,trace});
    }
    return out;
   }
  }
  const replay=simulate(d,{Runtime:[Released,Audited],selectors:[null,null]});
  if(!replay.sameEntries)throw Error('Tracing altered entry lifecycle');
  const scored=captured.map((e,i)=>{const outcome=replay.entries[1][i];if(outcome.at!==e.at)throw Error('Trace mismatch');return {...e,result:outcome.result};});
  const by=key=>Object.fromEntries([...new Set(scored.map(key))].map(k=>[k,metrics(scored.filter(e=>key(e)===k))]));
  results.push({name:d.metadata.name??d.metadata.file,sameEntries:replay.sameEntries,baseline:replay.metrics[0],
   byFlow:by(e=>e.flow),byOrigin:by(e=>e.trace.final.reason),
   byProjectionChange:by(e=>e.trace.original.ready&&e.trace.selected.ready&&e.trace.original.side!==e.trace.selected.side?
    e.side===e.trace.selected.side?'changed-base-and-retained':'changed-base-not-retained':'not-changed-or-unavailable'),entries:scored});
 }
}finally{Date.now=realNow;traced.cleanup();}
const report={spec,results};
writeFileSync(new URL('../reports/sentinel-entry-origin-audit-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:results.map(({entries,...r})=>r)}));
