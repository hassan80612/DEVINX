import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DemoTradingRuntime as Base} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {sequenceConsumptionRuntime} from '../experiments/sequence-consumption-runtime-20261019.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const read=p=>{const u=new URL('../'+p,import.meta.url);return JSON.parse(existsSync(u)?readFileSync(u):gunzipSync(readFileSync(new URL('../'+p+'.gz',import.meta.url))));},c=await sequenceConsumptionRuntime(),realNow=Date.now,results=[];
try{
 for(const [set,file] of [['forex','sentinel-final-conflict-audit-20261018-known.json'],['crypto-known','sentinel-accuracy-repair-ab-20261018-crypto.json'],['crypto-screen','sentinel-actual-entry-reference-ab-20261018-validation.json']])for(const old of read('reports/'+file).results){
  const name=old.name,data=read('tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json');
  const r=simulate(data,{Runtime:[Base,c.DemoTradingRuntime],selectors:[null,null]});r.set=set;r.name=name;results.push(r);
 }
}finally{Date.now=realNow;c.cleanup();}
const summary={};for(const set of ['forex','crypto-known','crypto-screen']){
 const rows=results.filter(r=>r.set===set),totals=[0,1].map(i=>({...metrics(rows.flatMap(r=>r.entries[i])),maxLossStreak:Math.max(...rows.map(r=>r.metrics[i].maxLossStreak))}));
 for(const t of totals)t.netAt86Percent=t.win*.86-t.loss;
 const [b,c]=totals;summary[set]={baseline:b,candidate:c,coverage:c.completed/b.completed,passed:c.winRate>b.winRate&&c.netAt86Percent>0&&c.maxLossStreak<=b.maxLossStreak&&c.completed/b.completed>=.5};
}
writeFileSync(new URL('../reports/sentinel-sequence-consumption-ab-20261019.json',import.meta.url),JSON.stringify({summary,results},null,2)+'\n');console.log(JSON.stringify({summary},null,2));
