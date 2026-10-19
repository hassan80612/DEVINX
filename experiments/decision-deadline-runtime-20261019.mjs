// Isolated correction of the quote-clock/decision-clock expiry mismatch.
// No broker reads, new gate, wait timer, or change to the held entry window.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
export async function decisionDeadlineRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-decision-deadline-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
 const replace=(file,from,to)=>{
  const p=join(root,file),s=readFileSync(p,'utf8');
  if(s.includes(to)&&!s.includes(from))return;
  if(s.split(from).length!==2)throw Error('Unexpected correction boundary: '+file);
  writeFileSync(p,s.replace(from,to));
 };
 replace('thirty-second-expiry-direction.mjs',
  'const horizonMs=projectionTargetAt==null?30000:Number(projectionTargetAt)-quoteAt;',
  'const horizonMs=(projectionTargetAt==null?Number(now)+durationMs:Number(projectionTargetAt))-quoteAt;');
 replace('completed-expiry-direction.mjs',
  'const key=[ts,spot,projectionTargetAt,quoteHistory.length,quoteHistory[0]?.ts,baseline.side].join(\'|\');',
  'const deadline=projectionTargetAt==null?Number(now)+30000:Number(projectionTargetAt);\n  const key=[ts,spot,deadline,quoteHistory.length,quoteHistory[0]?.ts,baseline.side].join(\'|\');');
 replace('completed-expiry-direction.mjs',
  'projectionTargetAt,periodSearch:\'wide\'',
  'projectionTargetAt:deadline,periodSearch:\'wide\'');
 replace('completed-expiry-direction.mjs',
  'dueAt:projectionTargetAt==null?ts+30000:Number(projectionTargetAt)',
  'dueAt:deadline');
 replace('now-opportunity-engine.mjs',
  'thirtySecondCycleForecast({...input,projectionTargetAt})',
  'thirtySecondCycleForecast({...input,projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)})');
 replace('now-opportunity-engine.mjs',
  'baseline,projectionTargetAt}):baseline;',
  'baseline,projectionTargetAt:projectionTargetAt??Number(now)+Number(durationMs)}):baseline;');
 const engine=await import(pathToFileURL(join(root,'now-opportunity-engine.mjs')));
 const forecast=await import(pathToFileURL(join(root,'thirty-second-expiry-direction.mjs')));
 const selector=await import(pathToFileURL(join(root,'completed-expiry-direction.mjs')));
 return {...engine,...forecast,...selector,root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
