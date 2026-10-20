// Explicit experimental contrarian signal mode, applied only at the public
// decision boundary. The underlying market model, evidence and broker
// settlements stay untouched; every PC, phone and bot consumer sees the SAME
// reversed CALL/PUT. Do not apply the inversion again downstream.
const inverseWord=word=>{
 const upper=word.toUpperCase();
 const reversed=({CALL:'PUT',PUT:'CALL',BUY:'SELL',SELL:'BUY'})[upper];
 if(!reversed)return word;
 if(word===word.toLowerCase())return reversed.toLowerCase();
 if(word[0]===word[0].toUpperCase()&&word.slice(1)===word.slice(1).toLowerCase())
  return reversed[0]+reversed.slice(1).toLowerCase();
 return reversed;
};
export function invertSignalDirection(value){
 if(typeof value!=='string')return value;
 return value.replace(/\b(?:CALL|PUT|BUY|SELL)\b/gi,inverseWord);
}
function pairKey(key){
 // Only directional pairs (e.g. callPct/putPct or signalCallPct/
 // signalPutPct) may exchange displayed numeric probabilities.
 return key.replace(/Call|Put|^call(?=[A-Z]|$)|^put(?=[A-Z]|$)/g,
  w=>w==='Call'?'Put':w==='Put'?'Call':w==='call'?'put':'call');
}
export function invertPublishedSignal(value){
 if(typeof value==='string')return invertSignalDirection(value);
 if(value==null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(invertPublishedSignal);
 if(Object.getPrototypeOf(value)!==Object.prototype)return value;
 const out={};
 for(const [key,raw] of Object.entries(value)){
  // The old model's directional market evidence is deliberately unchanged;
  // the published values reflect the opposite trade WITHOUT re-calibrating.
  const opposite=pairKey(key);
  const swapped=opposite!==key&&Object.prototype.hasOwnProperty.call(value,opposite);
  out[key]=invertPublishedSignal(swapped?value[opposite]:raw);
 }
 if(value.source==='observed-broker-quotes-not-trade-settlements'&&
  typeof value.correct==='number'&&typeof value.failed==='number'){
  out.correct=value.failed;out.failed=value.correct;
  out.source='inverted-signal-observed-broker-quotes-not-trade-settlements';
 }
 return out;
}
