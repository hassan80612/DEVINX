// Isolate each released decision component. No parameter search or timers.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const ABLATIONS=['no-wide-selector','no-cycle-projection','no-analogue-override','closed-structure-base','no-candle-override'];
export async function componentAblationRuntime(mode){
 if(!ABLATIONS.includes(mode))throw Error('Unknown ablation');
 const dir=mkdtempSync(join(tmpdir(),'sentinel-component-ablation-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),dir,{recursive:true});
 const file=join(dir,'now-opportunity-engine.mjs');let source=readFileSync(file,'utf8');
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Unexpected source: '+from);source=source.replace(from,to);};
 if(['no-cycle-projection','closed-structure-base'].includes(mode))replace(
  'const forecast=Number(durationMs)===30000?\n   thirtySecondCycleForecast({...input,projectionTargetAt}):null;', 'const forecast=null;');
 if(['no-wide-selector','no-cycle-projection','closed-structure-base'].includes(mode))replace(
  'const decision=Number(durationMs)===30000&&expiryDirectionSelector?\n   expiryDirectionSelector.observe({context:expiryDirectionContext,quoteHistory,quoteAt,price,now,baseline,projectionTargetAt}):baseline;', 'const decision=baseline;');
 if(['no-analogue-override','closed-structure-base'].includes(mode))replace(
  'const learning=Number(durationMs)===30000?causalPatternDirection(input):null;', 'const learning=null;');
 if(mode==='no-candle-override')replace(
  'const candleLocated=applyCandleLevelRoute({candidate:historical,map:structure.candleLevelMap,...input});','const candleLocated=historical;');
 writeFileSync(file,source);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(dir,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
