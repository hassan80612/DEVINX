import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function terminalConflictRuntime({terminal=false}={}){
 const path=mkdtempSync(join(tmpdir(),'sentinel-final-conflict-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 cpSync(new URL('./terminal-conflict-policy-20261018.mjs',import.meta.url),join(path,'terminal-conflict-policy-20261018.mjs'));
 const file=join(path,'now-opportunity-engine.mjs');let source=readFileSync(file,'utf8');
 const marker='delete located.pendingForecast;';if(source.split(marker).length!==2)throw Error('Unexpected analyst source');
 source="import {terminalConflictPolicy,conflictReasons} from './terminal-conflict-policy-20261018.mjs';\n"+source.replace('const located=applyObservedLevelSequence(','let located=applyObservedLevelSequence(').replace(marker,`
  const rawFinal=located;
  const describe=x=>({ready:x?.ready===true,side:x?.side??null,reason:x?.reason??null});
  const researchTrace={original:describe(original),narrow:describe(forecast),selected:describe(decision),expiryForecast:describe(selectedForecast),historical:describe(historical),candle:describe(candleLocated),final:describe(rawFinal),
   rejectedForConflict:historical.ready===false&&conflictReasons.has(historical.reason),
   conflictReactivated:historical.ready===false&&conflictReasons.has(historical.reason)&&rawFinal.ready===true,
   candleDiscardsProjection:candleLocated.priceStructure?.candleRoute?.discardedProjection?.side??null,
   finalOpposesForecast:rawFinal.ready===true&&selectedForecast?.ready===true&&rawFinal.side!==selectedForecast.side,
   sequenceKind:rawFinal.priceStructure?.observedSequence?.structureChange?.kind??rawFinal.priceStructure?.observedSequence?.continuation?.kind??null};
  ${terminal?'located=terminalConflictPolicy({historical,final:located,durationMs});':''}
  located={...located,researchTrace};
  ${marker}`);
 writeFileSync(file,source);
 const runtime=join(path,'runtime.mjs');let before=readFileSync(runtime,'utf8');const needle='const duration=brokerDurationGuard({snap,settings,now});';if(before.split(needle).length!==2)throw Error('Unexpected runtime');writeFileSync(runtime,before.replace(needle,'this.researchObservation=observation;\n      '+needle));
 const {DemoTradingRuntime}=await import(pathToFileURL(runtime));return{DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
