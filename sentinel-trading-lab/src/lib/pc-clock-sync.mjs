// Same Windows-Agent clock for the PC and mobile cards, inferred from a
// verified viewer -> Agent -> viewer round trip on their existing Realtime
// socket. It changes only display timing; never a trading decision.
export function pcClockSample(previous,{viewerAt,pcAt,receivedAt}={}){
 const tx=Number(viewerAt),pc=Number(pcAt),rx=Number(receivedAt),rtt=rx-tx;
 if(![tx,pc,rx].every(x=>Number.isSafeInteger(x)&&x>0)||rtt<0||rtt>5000)return previous??null;
 const offsetMs=(tx+rx)/2-pc;
 if(!Number.isFinite(offsetMs)||Math.abs(offsetMs)>120000)return previous??null;
 // Lowest signed RTT minimizes distortion from Realtime queueing, and a
 // later slow echo cannot add phantom seconds to the countdown.
 if(previous&&Number.isFinite(previous.rttMs)&&rtt>=previous.rttMs)return previous;
 return {offsetMs,rttMs:rtt};
}
export function pcClockNow(localNow,offsetMs){
 return Number(localNow)-(offsetMs!=null&&Number.isFinite(Number(offsetMs))?Number(offsetMs):0);
}
