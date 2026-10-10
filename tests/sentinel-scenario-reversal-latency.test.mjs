import test from 'node:test';
import assert from 'node:assert/strict';
import {PersistentReversalMonitor} from '../sentinel-trading-lab/agent/src/core/persistent-reversal.mjs';
import {reviewScenario} from '../sentinel-trading-lab/agent/src/core/scenario-review.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';

const start=1800000000000;
const rows=[
  [1.0101,1.0102,1.0095,1.0091],
  [1.0091,1.0093,1.0084,1.0081],
  [1.0081,1.0085,1.0075,1.0071]
];
function quotes(rows){
  return rows.flatMap((values,i)=>values.map((price,j)=>({
    ts:start+i*5000+[0,1500,3000,4900][j],price
  })));
}
test('early reversal warning uses finished structural bars and two live confirmations but never authorizes entry',()=>{
  const history=quotes(rows),monitor=new PersistentReversalMonitor();
  const ts=start+15400,live=[{ts:ts-300,price:1.00875},{ts:ts-100,price:1.00885}];
  const snap={quoteHistory:[...history,...live],quoteTs:ts-100,price:1.00885};
  const update=monitor.update({snap,now:ts,asset:'EUR/USD',provider:'test'});
  assert.equal(update.active,true);
  assert.equal(update.advisoryOnly,true);
  assert.equal(update.status,'REVERSÃO EM TESTE');
  assert.equal(update.alert.side,'CALL');
  assert.equal(update.alert.testing,true);
  assert.equal(update.alert.evidence.quoteConfirmations,2);
  const gap=monitor.update({snap,now:ts+3000,asset:'EUR/USD',provider:'test'});
  assert.equal(gap.active,false,'stale quotations never keep an early alert alive');
});
test('one quote or an incomplete price bar cannot create a pre-alert',()=>{
  const history=quotes(rows),m=new PersistentReversalMonitor(),ts=start+15400;
  const alone={ts:ts-100,price:1.00885};
  const snap={quoteHistory:[...history,alone],price:alone.price,quoteTs:alone.ts};
  assert.equal(m.update({snap,now:ts,asset:'EUR/USD',provider:'test'}).active,false);
});
test('main scenario raises a provisional own-forecast opposition without closing its existing window',()=>{
  const main={side:'CALL',createdAt:start+15000,deadline:start+75000,invalidation:1.005,review:{state:'OPEN',code:'supported',sourceAt:start+15000}};
  const plan={rawBias:'PUT',putProbability:80,callProbability:20,confidence:80,outlookReady:true,directionReady:true,safety:{blocked:false}};
  const snap={price:1.007,quoteTs:start+15400,quoteHistory:[...quotes(rows),{ts:start+15400,price:1.007}]};
  const result=reviewScenario(main,plan,snap,start+15400,{threshold:70,minPoints:74});
  assert.equal(result.state,'REAVALIANDO');
  assert.equal(result.code,'opposition-live');
  assert.equal(main.closed,undefined);
  assert.equal(main.deadline,start+75000);
  const weak=reviewScenario(main,{...plan,putProbability:51,confidence:50},snap,start+15400,{threshold:70,minPoints:74});
  assert.notEqual(weak.code,'opposition-live','do not present an unqualified flip');
});
test('signed live channel prioritizes transitions but suppresses repeated price churn',()=>{
  let now=1800000000000;const sent=[];
  const bridge=new SignedLiveBridge('realtime:sentinel-'+'a'.repeat(48),'b'.repeat(64),{clock:()=>now});
  bridge.joined=true;bridge.verifiedViewerAt=now;
  bridge.socket={readyState:1,send:raw=>sent.push(JSON.parse(raw))};
  const frame=(state,testing=false)=>({v:1,at:now,lastEvalMs:now,state:'running',
    liveBroker:{symbol:'TEST',lastQuoteAt:now},
    lastResult:{analysis:{operationalSignal:{state,side:'CALL',ready:state==='ENTRADA',
      actionable:state==='ENTRADA',subanalyst:{status:testing?'REVERSÃO EM TESTE':'OBSERVANDO',alert:testing?{side:'PUT',testing:true,trigger:1.1}:null}}}}});
  assert.equal(bridge.publish(frame('OBSERVANDO')),true);
  now+=600;
  assert.equal(bridge.publish(frame('ENTRADA')),true,'qualified entry must bypass standard 1100ms interval');
  now+=600;
  assert.equal(bridge.publish(frame('ENTRADA')),false,'unchanged signal does not spam realtime');
  now+=600;
  assert.equal(bridge.publish(frame('ENTRADA',true)),true,'forming reversal is a material state change');
  assert.equal(sent.length,3);
  bridge.close();
});
