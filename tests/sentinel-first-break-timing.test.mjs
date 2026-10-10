import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';

const time=Date.UTC(2026,9,10,12,0,12);
function scenario(side='CALL',broken=true,strong=false){
  const isCall=side==='CALL',dir=isCall?1:-1;
  const prior=[100,100.01,100.02,100.025].map((value,i)=>({ts:time-6500+i*900,price:100+dir*(value-100)}));
  const current=[100.005,100.015,broken?100.03:100.019,broken?100.034:100.018].map((value,i)=>({ts:time-1200+i*400,price:100+dir*(value-100)}));
  const quotes=[...prior,...current],latest=quotes.at(-1);
  return {
    snap:{quoteTs:latest.ts,price:latest.price,quoteHistory:quotes},
    analysis:{
      metrics:{
        micro:{ready:true,delta2:dir*.02,delta5:dir*.03,delta15:dir*.04,p5:dir*(strong?4:1),p15:dir*(strong?4:1),
          expected5:.025,expected30:.06},
        shortModel:{ready:true,callScore:isCall?82:20,putScore:isCall?20:82,
          structureReadyCall:isCall,structureReadyPut:!isCall,
          flowReadyCall:isCall,flowReadyPut:!isCall,
          callRoomOk:true,putRoomOk:true,
          callSetup:false,putSetup:false,readyCall:false,readyPut:false,
          accelUp:false,accelDown:false}},
      entryPlanner:{horizons:{'30':{rawBias:'NEUTRO',expectedMove:.06}}}
    }
  }
}
test('CALL starts at a genuine previous-range break without waiting for a slow continuation forecast',()=>{
 const {snap,analysis}=scenario('CALL',true);
 const [call]=entryOpportunities({analysis,snap,now:time,minPoints:74,durationMs:30000});
 assert.equal(call.allowed,true,call.reason);
 assert.equal(call.kind,'continuation');
 assert.ok(call.plan.callTrigger<snap.price);
 assert.equal(call.plan.entryTiming.sourceBarAt,Math.floor(time/5000)*5000-5000);
});
test('PUT mirrors early confirmed range break',()=>{
 const {snap,analysis}=scenario('PUT',true);
 const put=entryOpportunities({analysis,snap,now:time,minPoints:74,durationMs:30000})[1];
 assert.equal(put.allowed,true,put.reason);
 assert.ok(put.plan.putTrigger>snap.price);
});
test('no unbroken range, no invented breakout and no late-only momentum cap',()=>{
 const quiet=scenario('CALL',false);
 const blocked=entryOpportunities({...quiet,now:time,minPoints:74,durationMs:30000})[0];
 assert.equal(blocked.allowed,false,blocked.reason);
 const continued=scenario('CALL',true,true);
 const valid=entryOpportunities({...continued,now:time,minPoints:74,durationMs:30000})[0];
 assert.equal(valid.allowed,true,'a strong but structurally supported move can continue');
});
test('outdated quotes never activate a breakout',()=>{
 const fixture=scenario('CALL',true);
 const candidate=entryOpportunities({...fixture,now:time+4000,minPoints:74,durationMs:30000})[0];
 assert.equal(candidate.allowed,false);
 assert.equal(candidate.blockedBy,'feed');
});
test('product navigation separates onboarding from Market and keeps price public',async()=>{
 const page=await readFile(new URL('../sentinel-trading-lab/src/app/page.tsx',import.meta.url),'utf8');
 const consolePage=await readFile(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 const plans=await readFile(new URL('../sentinel-trading-lab/src/app/planos/page.tsx',import.meta.url),'utf8');
 assert.ok(page.includes('/planos'));
 assert.ok(plans.includes('US$ 50'));
 assert.ok(consolePage.includes("label:'Início'"));
 assert.ok(consolePage.includes("label:'Mercado'"));
 assert.ok(consolePage.includes("tab==='Market Analysis')&&<LiveScenarioCard"));
 assert.equal(consolePage.includes("tab==='Dashboard'||tab==='Market Analysis'"),false);
});
