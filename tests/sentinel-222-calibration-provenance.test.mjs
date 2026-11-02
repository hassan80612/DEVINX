import test from 'node:test';
import assert from 'node:assert/strict';
import {ContinuousExpiryCalibration} from '../sentinel-trading-lab/agent/src/core/continuous-expiry-calibration.mjs';

for(const expiryMs of [30000,60000,300000]){
 test('222: no invented calibrated probability until independent holdout supports '+expiryMs,()=>{
  const model=new ContinuousExpiryCalibration();
  const ctx='exnova|EURUSD-OTC|automatic|'+expiryMs;
  const raw={pCall:.60,pPut:.40};
  const empty=model.observe({context:ctx,now:10000,expiryMs,estimate:raw,marketValid:false});
  assert.equal(empty.qualified,false);
  assert.equal(empty.pCall,null);
  // 24 fit observations followed by 12 independent later outcomes.
  const settled=Array.from({length:36},(_,i)=>({
   at:(i+1)*expiryMs,dueAt:(i+2)*expiryMs,pCall:.60,
   actualCall:true,reasonClass:'continuation',estimateSide:'CALL',finalSide:'CALL'}));
  model.contexts.set(ctx,{pending:null,settled,expiryMs});
  const report=model.observe({context:ctx,now:1000000,expiryMs,estimate:raw,marketValid:false});
  assert.equal(report.calibrated,true);
  assert.equal(report.qualified,true);
  assert.ok(report.pCall>.6&&report.pCall<1);
  assert.equal(report.pPut,1-report.pCall);
  assert.ok(report.adjustedHoldoutBrier<report.rawHoldoutBrier);
  const other=model.observe({context:'iq_option|OTHER|automatic|'+expiryMs,now:1000000,expiryMs,estimate:raw,marketValid:false});
  assert.equal(other.qualified,false,'do not leak training between brokers/assets');
 });
}
test('222: no claim of calibration when adjustment fails the independent holdout',()=>{
 const model=new ContinuousExpiryCalibration(),ctx='exnova|EURUSD|automatic|60000';
 const settled=Array.from({length:36},(_,i)=>({
  at:i*60000,dueAt:(i+1)*60000,pCall:.6,actualCall:i<24,
  reasonClass:'directional',estimateSide:'CALL'}));
 model.contexts.set(ctx,{pending:null,settled,expiryMs:60000});
 const report=model.observe({context:ctx,now:3000000,expiryMs:60000,estimate:{pCall:.6,pPut:.4},marketValid:false});
 assert.equal(report.calibrated,false);
 assert.equal(report.qualified,false);
 assert.equal(report.pCall,null);
});
