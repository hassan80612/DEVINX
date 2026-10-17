import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function candleSourceResearchRuntime(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-candle-source-research-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'runtime.mjs'),before=readFileSync(file,'utf8');
 const needle='candles:snap.historicalCandlesVerified===false?[]:(snap.candles||[]),structureCache:this.structureCache,';
 const integrated=before.includes('candles:structuralCandleInput(snap),structureCache:this.structureCache,');
 if(!integrated&&before.split(needle).length!==2)throw Error('Unexpected runtime source; review integration');
 writeFileSync(join(path,'candle-source-context.mjs'),readFileSync(new URL('./verified-candle-source-20261017.mjs',import.meta.url)));
 writeFileSync(file,integrated?before:"import {structuralCandleInput} from './candle-source-context.mjs';\n"+before.replace(needle,'candles:structuralCandleInput(snap),structureCache:this.structureCache,'));
 const {DemoTradingRuntime}=await import(pathToFileURL(file));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
