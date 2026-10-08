const finite=v=>v!=null&&Number.isFinite(Number(v));

// Opt-in research policy: a local rebound is distinct from a structural turn.
// The opposing swing must exist before the touch; features never use future
// quotes. No main-forecast direction, elapsed-time lock, or confidence bonus.
export function reversalStructure({side,snap,now,durationMs,reaction,expectedMove,oppositeLevel}){
 const call=side==='CALL',sign=call?1:-1,quoteTs=Number(snap.quoteTs),price=Number(snap.price),touchAt=Number(reaction?.touchAt);
 const history=[...new Map((snap.quoteHistory||[]).filter(q=>finite(q.ts)&&finite(q.price)&&q.price>0&&q.ts<=Math.min(now,quoteTs)&&q.ts>=now-durationMs).map(q=>[Number(q.ts),{ts:Number(q.ts),price:Number(q.price)}])).values()].sort((a,b)=>a.ts-b.ts);
 const prior=history.filter(q=>q.ts<touchAt).filter((q,i,a)=>!i||q.price!==a[i-1].price);
 const steps=prior.slice(1).map((q,i)=>Math.abs(q.price-prior[i].price)).filter(x=>x>0).sort((a,b)=>a-b);
 const noise=steps[Math.floor(steps.length/2)]||0,buffer=Math.max(Math.abs(price)*.000002,noise*.5);
 let swing=null;
 for(let i=1;i<prior.length-1;i++){
  const p=prior[i].price*sign;
  if(p>prior[i-1].price*sign&&p>=prior[i+1].price*sign)swing=prior[i];
 }
 const touch=history.find(q=>q.ts===touchAt);
 // A repeated-rejection neckline is already an independently mapped swing.
 const neckline=reaction?.tests>=2&&finite(reaction.neckline)?Number(reaction.neckline):null;
 const level=neckline??swing?.price??null;
 const contiguous=history.every((q,i)=>!i||q.ts-history[i-1].ts<=2500);
 const enoughHistory=!!touch&&finite(level)&&prior.length>=3&&contiguous;
 const prominence=enoughHistory?(Number(level)-touch.price)*sign:0;
 const breakConfirmed=enoughHistory&&prominence>buffer&&(price-Number(level))*sign>buffer;
 const room=finite(oppositeLevel)?(Number(oppositeLevel)-price)*sign:null;
 const requiredRoom=Math.max(Math.abs(Number(expectedMove)||0),buffer*2);
 const roomConfirmed=room!=null&&room>requiredRoom;
 const blockedBy=quoteTs>now||now-quoteTs>2500?'feed':!enoughHistory?'structure-history':!breakConfirmed?'structure-break':!roomConfirmed?'expiration-room':null;
 return {allowed:blockedBy==null,blockedBy,level,touchAt,prominence,buffer,noise,room,requiredRoom,breakConfirmed,roomConfirmed,policy:'structural-reversals-v1'};
}
