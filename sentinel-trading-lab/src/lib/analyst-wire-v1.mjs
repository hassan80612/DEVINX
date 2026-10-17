import {analystWireV1 as currentWire} from '../../agent/src/core/analyst-wire-v1.mjs';

// Verify the original byte order of already-installed Agents during rollout.
// This is signature compatibility only: no legacy timer is interpreted,
// displayed or allowed to drive a signal. Keep every received field signed.
export function analystWireV1(frame){
 const encoded=currentWire(frame);
 const version=String(frame?.agentVersion||'').split('.').map(Number);
 const legacy=version[0]===13&&(version[1]<9||version[1]===9&&version[2]<=30);
 if(!legacy)return encoded;
 const value=JSON.parse(encoded);
 const ordered=(obj,names)=>{
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return obj;
  const keys=[...names,...Object.keys(obj).filter(k=>!names.includes(k)).sort()];
  return Object.fromEntries(keys.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,obj[k]]));
 };
 if(value.settings)value.settings=ordered(value.settings,['forecastMode','clockMode','engine','orderDurationMs']);
 if(value.liveBroker?.brokerTiming)value.liveBroker.brokerTiming=ordered(value.liveBroker.brokerTiming,
  ['capturedAt','purchaseWindow','instrumentKind']);
 return JSON.stringify(value);
}
