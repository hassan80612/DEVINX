// Fixed synthetic engineering diagnostics. Never real-market evidence.
const T=Date.UTC(2026,9,1);
export function generated(kind,seed,length=720){
 let state=seed+1,log=Math.log(1.1);
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 return Array.from({length},(_,i)=>{
  const noise=(random()-.5)*.00010;
  const drift=kind==='up'?.000012:kind==='down'?-.000012:
   kind==='turn'?(i<length/2?.000012:-.000020):
   kind==='reverse-turn'?(i<length/2?-.000012:.000020):0;
  log+=noise+drift;
  const wave=kind==='range'?.0006*Math.sin(i*2*Math.PI/(31+seed%8*7)+seed):
   kind==='irregular'?.0005*Math.sin(i*2*Math.PI/53)+.00018*Math.sin(i*2*Math.PI/19):0;
  return {ts:T+i*1000,receivedAt:T+i*1000,price:Math.exp(log+wave)};
 });
}
