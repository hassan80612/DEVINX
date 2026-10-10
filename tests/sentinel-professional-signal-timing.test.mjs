import test from 'node:test';
import assert from 'node:assert/strict';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {readFile} from 'node:fs/promises';

const now=Date.UTC(2026,9,10,12,0,9);
function mapped(side='CALL',second=true){
 const call=side==='CALL',turn=v=>call?v:200-v;
 const samples=[
 [now-3400,100.05],[now-2900,100.023],[now-2500,100.005],
 [now-2100,100],[now-1600,100.016],
 ...(second?[[now-1300,100.026],[now-800,100.03]]:[[now-800,100.016]])
 ];
 const rows=samples.map(([ts,price])=>({ts,price:turn(price)}));
 const price=rows.at(-1).price;
 const snap={price,quoteTs:now-800,quoteHistory:rows};
 const short={ready:true,
   sr:call?{support:100,resistance:100.5}:{support:99.5,resistance:100},
   range:.12,callScore:80,putScore:80,callRoomOk:true,putRoomOk:true,
   reversalCallConfirmed:false,reversalPutConfirmed:false,
   flowReadyCall:false,flowReadyPut:false,
   structureReadyCall:false,structureReadyPut:false};
 const analysis={metrics:{micro:{delta2:call?-.01:.01,delta5:call?-.03:.03,
   expected5:.08,expected30:.16},shortModel:short},
 entryPlanner:{horizons:{'30':{rawBias:'NEUTRO',expectedMove:.12}}}};
 return{snap,analysis};
}
test('mapped support confirms early CALL after two advancing quotes, not a further neckline break',()=>{
 const {snap,analysis}=mapped('CALL');
 const c=entryOpportunities({analysis,snap,now,minPoints:70,durationMs:30000,entryPolicy:'structural-reversals-v1'})[0];
 assert.equal(c.allowed,true,c.reason);
 assert.equal(c.kind,'reversal');
 assert.equal(c.structuralReaction,true);
 assert.ok(c.plan.callTrigger<snap.price);
});
test('mapped resistance confirms early PUT independently of main forecast',()=>{
 const {snap,analysis}=mapped('PUT');
 const p=entryOpportunities({analysis,snap,now,minPoints:70,durationMs:30000,entryPolicy:'structural-reversals-v1'})[1];
 assert.equal(p.allowed,true,p.reason);
 assert.equal(p.kind,'reversal');
 assert.equal(p.structuralReaction,true);
});
test('one isolated bounce never becomes a confirmed early reversal',()=>{
 const {snap,analysis}=mapped('CALL',false);
 const c=entryOpportunities({analysis,snap,now,minPoints:70,durationMs:30000,entryPolicy:'structural-reversals-v1'})[0];
 assert.equal(c.allowed,false);
});
test('stale feed blocks even structurally valid early reaction',()=>{
 const {snap,analysis}=mapped('CALL');
 const c=entryOpportunities({analysis,snap,now:now+4500,minPoints:70,durationMs:30000,entryPolicy:'structural-reversals-v1'})[0];
 assert.equal(c.allowed,false);assert.equal(c.blockedBy,'feed');
});
test('passive scenario CALL never manufactures actionable CALL without engine entry permission',()=>{
 const op={asset:'EUR/USD OTC',forecastHorizonSeconds:60,durationMs:30000,
   scenario:{side:'CALL',deadline:now+50000,createdAt:now-9000,status:'OPEN',closed:false},
   side:'CALL',state:'JANELA ABERTA',ready:false,actionable:false};
 const view=scenarioViewFromRuntime({operational:op,asset:'EUR/USD OTC',horizonSeconds:60,durationMs:30000,now});
 assert.equal(view.canEnter,false);
});
test('broker and mobile show confirmed entry distinct from passive CALL/PUT scenario guidance',async()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const desktop=await readFile(new URL('agent/worker/local-playwright-driver.mjs',root),'utf8');
 const mobile=await readFile(new URL('src/components/LiveScenarioCard.tsx',root),'utf8');
 assert.match(desktop,/ENTRADA '\+confirmedEntrySide\+' AGORA/);
 assert.match(desktop,/VIÉS '\+formingSide\+' · NÃO É ORDEM/);
 assert.match(mobile,/SOMENTE PREVISÃO · SEM ENTRADA/);
 assert.match(mobile,/ENTRADA '\+mobileDirection\+' AGORA/);
});
