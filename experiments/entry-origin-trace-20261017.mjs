// Research-only tracing of unchanged 13.9.36 decisions in temporary source.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function entryOriginTrace(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-entry-origin-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const engine=join(path,'now-opportunity-engine.mjs'),source=readFileSync(engine,'utf8');
 const needle='return {...located,engineId,qualityPolicy,';
 if(source.split(needle).length!==2)throw Error('Unexpected engine source');
 writeFileSync(engine,source.replace(needle,`return {...located,researchTrace:{
 original:{side:original.side,ready:original.ready,reason:original.reason},
 narrow:{side:forecast?.side,ready:forecast?.ready,reason:forecast?.reason},
 selected:{side:decision.side,ready:decision.ready,reason:decision.reason},
 historical:{side:historical.side,ready:historical.ready,reason:historical.reason},
 candleRoute:{side:candleLocated.side,ready:candleLocated.ready,reason:candleLocated.reason},
 final:{side:located.side,ready:located.ready,reason:located.reason}
 },engineId,qualityPolicy,`));
 const runtime=join(path,'runtime.mjs'),before=readFileSync(runtime,'utf8'),marker='const duration=brokerDurationGuard({snap,settings,now});';
 if(before.split(marker).length!==2)throw Error('Unexpected runtime source');
 writeFileSync(runtime,before.replace(marker,'this.researchObservation=observation;\n      '+marker));
 const {DemoTradingRuntime}=await import(pathToFileURL(runtime));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
