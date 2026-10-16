import {replay} from './base-direction-study.mjs';
import {generated} from './diagnostic-markets.mjs';
const groups={},seeds=[811,823,827,839,871,883,907,919];
for(const kind of ['up','down','turn','reverse-turn','range','irregular','random-walk']){
 const group={};
 for(const seed of seeds){
  const results=replay(generated(kind,seed));
  for(const [name,result] of Object.entries(results)){
   group[name]??={signals:0,wins:0,losses:0,ties:0,unknown:0,highestSingleQuoteMs:0};
   for(const key of ['signals','wins','losses','ties','unknown'])group[name][key]+=result[key];
   group[name].highestSingleQuoteMs=Math.max(group[name].highestSingleQuoteMs,result.latencyMs.max);
  }
 }
 for(const r of Object.values(group))r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
 groups[kind]=group;
}
console.log(JSON.stringify({source:'generated diagnostic paths, NOT measured market performance',seeds,groups},null,2));
