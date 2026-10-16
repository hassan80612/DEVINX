// Read-only comparison of the published 13.9.23 policies, no candidates.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
export function comparePublishedDurations(rows,{startAfterMs=0}={}){
 return Object.fromEntries([5000,10000,15000,30000].map(durationMs=>{
  let state=null,streak=0;
  const r={durationMs,signals:0,wins:0,losses:0,ties:0,unknown:0,exactExpiryQuotes:0,delayedExpiryQuotes:0,maxLossStreak:0,entries:[]};
  for(let i=0;i<rows.length;i++){
   const q=rows[i],input={quoteHistory:rows.slice(0,i+1),quoteAt:q.ts,now:q.ts,price:q.price,
    engineId:'automatic',qualityPolicy:'adaptive-market-v17',durationMs};
   const choice=analyzeNowOpportunity(input),next=advanceNowOpportunity({previous:state,candidate:choice,
    now:q.ts,quoteAt:q.ts,asset:'SAME-VIDEO',engineId:'automatic',durationMs});
   if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt&&q.ts>=rows[0].ts+startAfterMs){
    const exit=rows.find(x=>x.ts>=next.exitAt&&x.ts<=next.exitAt+1000);
    const outcome=!exit?'unknown':exit.price===next.entryPrice?'ties':(exit.price>next.entryPrice?'CALL':'PUT')===next.side?'wins':'losses';
    r.signals++;r[outcome]++;streak=outcome==='losses'?streak+1:0;r.maxLossStreak=Math.max(streak,r.maxLossStreak);
    if(exit)r[exit.ts===next.exitAt?'exactExpiryQuotes':'delayedExpiryQuotes']++;
    r.entries.push({at:next.entryAt,side:next.side,entry:next.entryPrice,exit:exit?.price??null,
     exitObservedAt:exit?.ts??null,outcome,reason:choice.reason});
   }
   state=next;
  }
  r.rateExcludingTies=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
  r.favourableIncludingTies=r.wins+r.losses+r.ties?100*r.wins/(r.wins+r.losses+r.ties):null;
  return [durationMs,r];
 }));
}
export function durationStudy(){
 return {version:'13.9.23',publishedCommit:'a574f282eebef6e0aeaca988cf5bc1c7d7d3db4e',
  scope:'Reconstruction of one user video; not current live session or independent validation.',
  fixtures:Object.fromEntries(['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json'].map(file=>{
   const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))).quoteHistory;
   return [file,{quotes:rows.length,full:comparePublishedDurations(rows),after180s:comparePublishedDurations(rows,{startAfterMs:180000})}];
  }))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(durationStudy(),null,2));
