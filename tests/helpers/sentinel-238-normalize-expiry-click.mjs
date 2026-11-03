// Sentinel 238, narrowly audited native-expiry read-at-click change only.
// Undo ONLY this exact reviewed block before the historic 201/232 SHA gate.
// Any future changes to broker execution remain visible to the SHA guard.
const updatedImport="import {inspectNativeExpiryBeforeClick,observeNativeExpiryForClick,verifyBrokerExpiryForOrder} from './broker-native-expiry-keeper.mjs';";
const oldImport="import {observeNativeExpiryForClick,verifyBrokerExpiryForOrder} from './broker-native-expiry-keeper.mjs';";
const updatedBlock="   // The broker can silently reset to 30s AFTER the last idle report.\n   // Re-read the actual expiry field on the click-owning frame NOW, then\n   // merge it with the already available cross-frame observations. This\n   // read never clicks/changes the picker or adds a waiting timer.\n   let directNativeExpiry=null,nativeExpiry=null;\n   try{directNativeExpiry=await c.frame.evaluate(inspectNativeExpiryBeforeClick,\n    {requiredDurationMs:Number(order.durationMs)})}catch{}\n   try{nativeExpiry=await c.frame.evaluate(observeNativeExpiryForClick,\n    {provider,requiredDurationMs:Number(order.durationMs)})}catch{}\n   // A fresh known native duration outranks a possibly stale 5s status.\n   // Unknown never overwrites a known direct reading, and a known 30s\n   // cannot pass as a 1m/5m order merely because another frame said 1m.\n   if(Number(directNativeExpiry?.currentMs)>0)\n    nativeExpiry={...(nativeExpiry||{}),currentMs:Number(directNativeExpiry.currentMs),\n      observedAt:directNativeExpiry.observedAt,\n      preferredMs:directNativeExpiry.preferredMs??nativeExpiry?.preferredMs??null,\n      discoveryReason:directNativeExpiry.reason??nativeExpiry?.discoveryReason??null,\n      measuredOnClickFrame:true};\n";
const oldBlock="   let nativeExpiry=null;\n   try{nativeExpiry=await c.frame.evaluate(observeNativeExpiryForClick,\n    {provider,requiredDurationMs:Number(order.durationMs)})}catch{}\n";
export function normalize238BrokerClick(source){
 let s=String(source);
 if(s.indexOf(updatedImport)<0||s.indexOf(updatedBlock)<0||
    s.indexOf(updatedImport)!==s.lastIndexOf(updatedImport)||
    s.indexOf(updatedBlock)!==s.lastIndexOf(updatedBlock))
  throw Error('238 click-time expiry change does not exactly match the reviewed patch');
 s=s.replace(updatedImport,oldImport).replace(updatedBlock,oldBlock);
 return s;
}
