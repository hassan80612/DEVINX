// Research-only A/B: compare the precise 13.9.58 released source at the
// SAME broker quote timestamps. Never use later prices to make decisions.
// This is one old video extraction, NOT verified live profitability.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {analyzeNowOpportunity as candidateAnalyze,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection as CandidateSelector} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const core=join(root,'sentinel-trading-lab/agent/src/core');
const base='8b2ccd0374014b977c1ed240a0828359c30684fe';
const dir=mkdtempSync(join(tmpdir(),'sentinel-ablation-'));
function prior(name){
 const raw=execFileSync('git',['show',base+':sentinel-trading-lab/agent/src/core/'+name],{cwd:root,encoding:'utf8'});
 // All imported helpers are unchanged from 13.9.58: only the decision
 // engine and the adaptive selector are the A/B variables in this replay.
 const relative=/from '\.\/([^']+)'/g;
 const migrated=raw.replace(relative,(_whole,name)=>"from '"+pathToFileURL(join(core,name)).href+"'");
 const out=join(dir,name);writeFileSync(out,migrated);
 return out;
}
const classify=(entries)=>{
 let wins=0,losses=0,ties=0,unknown=0;
 for(const e of entries){
  if(e.outcome==='win')wins++;
  else if(e.outcome==='loss')losses++;
  else if(e.outcome==='tie')ties++;
  else unknown++;
 }
 return{entries:entries.length,wins,losses,ties,unknown,
  winRate: wins+losses>0?+(wins/(wins+losses)*100).toFixed(1):null};
};
function run(rows,analyze,Selector,withSelector){
 const selector=withSelector?new Selector():null,records=[];let previous=null;
 for(let i=0;i<rows.length;i++){
  const q=rows[i];
  const args={quoteHistory:rows.slice(0,i+1),now:q.ts,quoteAt:q.ts,price:q.price,
   durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
  if(selector){args.expiryDirectionSelector=selector;args.expiryDirectionContext='iq_option|EUR/GBP OTC|30000';}
  const candidate=analyze(args);
  const next=advanceNowOpportunity({previous,candidate,now:q.ts,quoteAt:q.ts,
   asset:'EUR/GBP OTC',provider:'iq_option',engineId:'automatic',durationMs:30000});
  if(next?.phase==='fired'&&next.entryTriggeredAt!==previous?.entryTriggeredAt){
   const due=Number(next.exitAt),exit=rows.find(x=>x.ts>=due&&x.ts<=due+1000);
   const outcome=!exit?'unknown':exit.price===next.entryPrice?'tie':
    ((exit.price>next.entryPrice?'CALL':'PUT')===next.side?'win':'loss');
   records.push({at:next.entryTriggeredAt,side:next.side,outcome,reason:candidate.reason});
  }
  previous=next;
 }
 return{summary:classify(records),entries:records,calibrations:selector?.completed??null};
}
try{
 const publishedEngine=await import(pathToFileURL(prior('now-opportunity-engine.mjs')).href);
 const publishedSelector=await import(pathToFileURL(prior('completed-expiry-direction.mjs')).href);
 for(const label of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const rows=JSON.parse(readFileSync(join(root,'tests/fixtures',label),'utf8')).quoteHistory;
  const cases={
   released:run(rows,publishedEngine.analyzeNowOpportunity,publishedSelector.CompletedExpiryDirection,true),
   baselineWithoutSelector:run(rows,publishedEngine.analyzeNowOpportunity,publishedSelector.CompletedExpiryDirection,false),
   candidateEngineLegacySelector:run(rows,candidateAnalyze,publishedSelector.CompletedExpiryDirection,true),
   releasedEngineNewSelector:run(rows,publishedEngine.analyzeNowOpportunity,CandidateSelector,true),
   candidateWithNewSelector:run(rows,candidateAnalyze,CandidateSelector,true),
   candidateWithoutSelector:run(rows,candidateAnalyze,CandidateSelector,false)
  };
  for(const [name,value] of Object.entries(cases))
   console.log('AB_COMPARE '+JSON.stringify({dataset:label,name,...value.summary,calibrations:value.calibrations}));
 }
}finally{rmSync(dir,{recursive:true,force:true});}
