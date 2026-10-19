// Isolated state-machine repair: do not refresh an old structural event's
// confirmation timestamp at every subsequent quote or consume it twice.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
export async function sequenceConsumptionRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-sequence-consumption-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
 const sequence=join(root,'observed-level-sequence.mjs');let s=readFileSync(sequence,'utf8');
 s=s.replace('let initial=0,brokenAt=null,reclaimedAt=null,retestAt=null,breakExtreme=null;', 'const emitted=new Set();\n  const emit=e=>{const key=[e.kind,e.brokenAt,e.reclaimedAt,e.retestAt,e.pivotPrice].join(\'|\');if(!emitted.has(key)){emitted.add(key);events.push(e);}};\n  let initial=0,brokenAt=null,reclaimedAt=null,retestAt=null,breakExtreme=null;');
 s=s.replace("events.push({kind:'failed-breakout-structure-change'", "emit({kind:'failed-breakout-structure-change'").replace("events.push({kind:'break-retest-continuation'", "emit({kind:'break-retest-continuation'");
 s=s.replace("reason:event.kind,priceStructure};", "reason:event.kind,setupKey:sequence.structureChange?[event.kind,event.side,event.level.level,event.brokenAt,event.reclaimedAt,event.retestAt,event.pivotPrice,event.confirmedAt].join('|'):null,priceStructure};");
 writeFileSync(sequence,s);
 const engine=join(root,'now-opportunity-engine.mjs');s=readFileSync(engine,'utf8');
 s=s.replace('const ready=canRelease&&candidate?.ready===true', "const consumed=old?.consumedSetups||[];\n const alreadyConsumed=!!candidate?.setupKey&&consumed.includes(candidate.setupKey);\n const ready=!alreadyConsumed&&canRelease&&candidate?.ready===true");
 s=s.replace("phase:'fired',reason:'present-confirmed',side:candidate.side,", "phase:'fired',reason:'present-confirmed',side:candidate.side,\n   consumedSetups:candidate.setupKey?[...consumed,candidate.setupKey].slice(-64):consumed,");
 s=s.replace("phase:'scanning',reason:!fresh?'waiting-fresh-quote':candidate?.reason||'scanning-now',", "phase:'scanning',consumedSetups:consumed,reason:!fresh?'waiting-fresh-quote':alreadyConsumed?'awaiting-new-structural-setup':candidate?.reason||'scanning-now',");
 writeFileSync(engine,s);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(root,'runtime.mjs')));
 const {advanceNowOpportunity}=await import(pathToFileURL(engine));
 const {observedLevelSequence}=await import(pathToFileURL(sequence));
 return {DemoTradingRuntime,advanceNowOpportunity,observedLevelSequence,root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
