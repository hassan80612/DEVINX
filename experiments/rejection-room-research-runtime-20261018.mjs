import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function rejectionRoomResearchRuntime(){
 const dir=mkdtempSync(join(tmpdir(),'sentinel-rejection-room-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),dir,{recursive:true});
 writeFileSync(join(dir,'rejection-room-20261018.mjs'),readFileSync(new URL('./rejection-room-20261018.mjs',import.meta.url)));
 const file=join(dir,'now-opportunity-engine.mjs'),source=readFileSync(file,'utf8'),marker='delete located.pendingForecast;';
 if(source.split(marker).length!==2)throw Error('Unexpected engine');
 writeFileSync(file,"import {qualifyRejectionRoom} from './rejection-room-20261018.mjs';\n"+source
  .replace('const located=applyObservedLevelSequence(','let located=applyObservedLevelSequence(')
  .replace(marker,`located=qualifyRejectionRoom({candidate:located,map:structure.candleLevelMap,...input});\n  ${marker}`));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(dir,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
