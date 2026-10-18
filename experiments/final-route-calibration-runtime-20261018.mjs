import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
export async function finalRouteCalibrationRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-route-calibration-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
 cpSync(new URL('./final-route-calibration-20261018.mjs',import.meta.url),join(root,'final-route-calibration-20261018.mjs'));
 const model=readFileSync(new URL('../reports/sentinel-final-route-model-20261018.json',import.meta.url),'utf8');
 const file=join(root,'now-opportunity-engine.mjs');let s=readFileSync(file,'utf8');const marker='delete located.pendingForecast;';if(s.split(marker).length!==2)throw Error('unexpected engine');
 s="import {applyFinalRouteCalibration} from './final-route-calibration-20261018.mjs';\nconst routeCalibrationModel="+model+";\n"+s.replace('const located=applyObservedLevelSequence(','let located=applyObservedLevelSequence(').replace(marker,'located=applyFinalRouteCalibration({candidate:located,model:routeCalibrationModel,durationMs});\n  '+marker);writeFileSync(file,s);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(root,'runtime.mjs')));return{DemoTradingRuntime,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
