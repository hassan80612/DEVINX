// Research only: compare available room to observed 30s movement scale.
// This is a spatial gate, not a timer, a target forecast or a win probability.
export function qualifyRejectionRoom({candidate,map,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs=30000}={}){
 if(!candidate?.ready||durationMs!==30000||
  !['historical-level-rejection','multiscale-candle-rejection'].includes(candidate.reason))return candidate;
 const ts=Number(quoteAt),spot=Number(price),sign=candidate.side==='CALL'?1:candidate.side==='PUT'?-1:0;
 if(!(sign&&spot>0&&ts<=now&&now-ts<=1450&&map?.asOf<=now&&map.tolerance>0))return candidate;
 const rows=quoteHistory.filter(q=>q.ts<=ts&&(q.receivedAt??q.ts)<=now&&q.ts>=ts-180000&&q.price>0).sort((a,b)=>a.ts-b.ts);
 const at=time=>{const q=rows.findLast(q=>q.ts<=time);return q&&time-q.ts<=1500?q.price:null;};
 const moves=[];
 for(let end=ts;end-30000>=ts-180000;end-=30000){
  const a=at(end-30000),b=at(end);
  if(a&&b)moves.push(Math.abs(Math.log(b/a)));
 }
 if(moves.length<3)return candidate;
 moves.sort((a,b)=>a-b);
 const typicalMove=spot*Math.expm1(moves[Math.floor(moves.length/2)]);
 const ahead=map.levels.filter(z=>(z.confirmedPivots>0||z.independentRejections>=2)&&
  sign*(z.level-spot)>0).sort((a,b)=>sign*(a.level-b.level));
 const wall=ahead[0];if(!wall)return candidate;
 const room=sign*(wall.level-spot);
 if(room>typicalMove+map.tolerance)return candidate;
 return {...candidate,ready:false,side:null,reason:'rejection-room-before-opposing-level',
  researchRoom:{room,typicalMove,opposingLevel:wall.level,completedMoves:moves.length}};
}
