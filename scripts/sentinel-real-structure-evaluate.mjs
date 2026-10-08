import {readFile,writeFile} from 'node:fs/promises';
import {scenarioInvalidation} from '../sentinel-trading-lab/agent/src/core/scenario-invalidation.mjs';
const events=(await readFile(process.argv[2]||'/tmp/sentinel-real-events.jsonl','utf8')).trim().split('\n').map(JSON.parse).sort((a,b)=>a.ts-b.ts);
const audit=JSON.parse(await readFile(process.argv[3]||'/tmp/sentinel-real-audit.json','utf8'));
const originals=audit.scenarios.filter(s=>s.cohort==='new-policy'&&s.observedOrigin);
const quotes=[],seen=new Set(),states=new Map(originals.map(s=>[s.id,{...s,legacyClosedAt:null,structuralClosedAt:null}]));
for(const e of events){
 if(e.type==='market')for(const q of e.quotes||[]){if(q.ts<=e.ts&&!seen.has(q.ts)){seen.add(q.ts);quotes.push({ts:Number(q.ts),price:Number(q.price)});}}
 if(e.type!=='analysis')continue;
 const prior=quotes.filter(q=>q.ts<=e.ts).sort((a,b)=>a.ts-b.ts),q=prior.at(-1);if(!q||e.ts-q.ts>2500)continue;
 for(const s of states.values()){
  if(e.ts<s.at||e.ts>=s.at+s.durationMs)continue;
  const price=Number(e.operational?.price??q.price);
  const broken=s.side==='CALL'?price<=s.invalidation:price>=s.invalidation;
  if(broken&&s.legacyClosedAt==null)s.legacyClosedAt=e.ts;
  if(s.structuralClosedAt==null){const check=scenarioInvalidation({side:s.side,invalidation:s.invalidation,createdAt:s.at,deadline:s.at+s.durationMs},{price,quoteTs:q.ts,quoteHistory:prior.slice(-900)},e.ts);if(check.broken){s.structuralClosedAt=e.ts;s.evidence=check.evidence;}}
 }
}
const rows=[...states.values()].map(s=>({id:s.id,side:s.side,at:s.at,originalDirectionWon:s.won,recordedCanceled:s.closedStatus==='INVALIDADO',recordedClosedAt:s.closedAt,legacyClosedAt:s.legacyClosedAt,structuralClosedAt:s.structuralClosedAt,evidence:s.evidence??null}));
const canceled=rows.filter(s=>s.recordedCanceled),saved=canceled.filter(s=>s.structuralClosedAt==null);
const output={method:'Isolated invalidation replay at original scenario origins and frozen levels, using only quotes received by each recorded analysis frame. No reconstruction of full learning state or new signal selection.',summary:{originalScenarios:rows.length,recordedCanceled:canceled.length,legacyReproduced:canceled.filter(s=>s.recordedClosedAt===s.legacyClosedAt).length,structuralCanceled:rows.filter(s=>s.structuralClosedAt!=null).length,preservedOriginalWinners:saved.filter(s=>s.originalDirectionWon===true).length,retainedOriginalLosers:saved.filter(s=>s.originalDirectionWon===false).length,preservedUnknown:saved.filter(s=>s.originalDirectionWon===null).length},rows,limitations:['Previously inspected one-asset session; this is not an unseen holdout.','Original direction and original expiry outcome remain fixed. This is not a measured change in trade win rate.','Historical candles lost to interval collisions cannot be reconstructed faithfully; feed repair needs new collected data.','The three totals were not present in the uploaded journal; no historical superiority comparison can be established.']};
await writeFile('/tmp/sentinel-real-structure-study.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output.summary,null,2));
