import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {finalRegimeArbiter,observedRegime} from '../experiments/final-regime-arbiter-20261019.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const read=p=>{const u=new URL('../'+p,import.meta.url);return JSON.parse(existsSync(u)?readFileSync(u):gunzipSync(readFileSync(new URL('../'+p+'.gz',import.meta.url))));};
const source=read('reports/sentinel-final-conflict-audit-20261018-known.json'),results=[];
for(const row of source.results){
 const data=read('tests/fixtures/external/dukascopy-eurusd-'+row.name+'.json');
 const entries=row.entries[0],kept=[],diagnostics=[];
 for(const e of entries){
  const quotes=data.quotes.filter(q=>q.ts<=e.at&&(q.receivedAt??q.ts)<=e.at&&q.ts>=e.at-90000);
  const q=quotes.at(-1),selected=e.trace?.selected??null;
  const decision=finalRegimeArbiter({candidate:{ready:true,side:e.side,reason:e.reason},projection:selected,
   quoteHistory:quotes,now:e.at,quoteAt:q?.ts,durationMs:30000});
  diagnostics.push({at:e.at,regime:decision.finalArbitration.regime,admitted:decision.ready,reason:decision.reason,originalResult:e.result});
  if(decision.ready)kept.push(e);
 }
 results.push({name:row.name,sourceSha256:row.sourceSha256,baseline:metrics(entries),candidate:metrics(kept),diagnostics});
}
const total=(kind)=>{
 const t={win:0,loss:0,tie:0,missing:0,completed:0,maxLossStreak:0};
 for(const row of results){for(const k of ['win','loss','tie','missing','completed'])t[k]+=row[kind][k];t.maxLossStreak=Math.max(t.maxLossStreak,row[kind].maxLossStreak);}
 return {...t,winRate:t.completed?t.win/t.completed:null,netAt86Percent:t.win*.86-t.loss};
};
const baseline=total('baseline'),candidate=total('candidate'),coverage=candidate.completed/baseline.completed;
const summary={baseline,candidate,coverage,passed:candidate.winRate>baseline.winRate&&candidate.netAt86Percent>0&&coverage>=.25&&candidate.maxLossStreak<=baseline.maxLossStreak};
const report={method:'Frozen admission rule on original entry timestamps; preliminary rejection screen, not a replay of shifted entry lifecycle. A pass requires a full causal runtime replay before acceptance.',spec:read('reports/sentinel-final-regime-spec-20261019.json'),summary,results};
writeFileSync(new URL('../reports/sentinel-final-regime-screen-20261019.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
// Native telemetry remains private. Its observer receipt times are not Agent
// input receipt times; incomplete history must remain unavailable.
if(process.argv[2]&&process.argv[3]){
 const native=JSON.parse(readFileSync(process.argv[2],'utf8'));
 const rows=native.entries.map(e=>{
  const now=e.triggeredAt,history=native.quotes.filter(q=>q.ts<=now&&q.receivedAt<=now),q=history.at(-1);
  return {side:e.side,result:e.result,reason:e.entryReasonConfirmed?e.entryReason:null,
   regime:observedRegime({quoteHistory:history,now,quoteAt:q?.ts})};
 });
 writeFileSync(process.argv[3],JSON.stringify({method:'Classification only of the original signed entries with observer-visible, past-only quotes; no counterfactual native win rate, and no approximation of missing Agent history.',entries:rows,limitations:['Only four original entries.','Observer receipt timestamps differ from Agent receipt timestamps.','No exact Agent historical candles or selected projection trace.','No release acceptance is possible from this sample.']},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({nativeClassifications:rows.map(r=>({regime:r.regime.kind,result:r.result}))}));
}
