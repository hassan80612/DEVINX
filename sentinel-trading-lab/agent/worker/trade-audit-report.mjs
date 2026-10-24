// Offline report: reads only the local market-history journal; no browser,
// broker, Supabase or Vercel calls. No changes to the decision engine.
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {summarizeTradeAudit} from './trade-audit.mjs';

export async function auditReportFromJournals(paths,{minSamples=20}={}){
 const events=[];
 for(const path of paths){
  const reader=createInterface({input:createReadStream(path),crlfDelay:Infinity});
  for await (const line of reader){
   if(!line.trim())continue;
   const event=JSON.parse(line);
   if(['trade_decision','broker_accepted','broker_settlement'].includes(event.type))
    events.push(event);
  }
 }
 return summarizeTradeAudit(events,{minSamples});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=process.argv.slice(2);
 if(!paths.length){
  console.error('Usage: node worker/trade-audit-report.mjs worker/data/market-history/*.jsonl');
  process.exitCode=1;
 }else console.log(JSON.stringify(await auditReportFromJournals(paths),null,2));
}
