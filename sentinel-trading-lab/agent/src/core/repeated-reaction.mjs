// A quote-derived rejection is an independent price event, not a candle colour.
// Hysteresis separates returns to a region from repeated samples of one touch.
export function repeatedReaction({quoteHistory=[],now=Date.now(),expected2=0,expectedMove=0,oppositeSupport=null,oppositeResistance=null}={}){
  const unique=new Map();
  for(const q of quoteHistory){const ts=Number(q?.ts),price=Number(q?.price);if(Number.isFinite(ts)&&Number.isFinite(price)&&price>0&&ts<=now&&now-ts<=90000)unique.set(ts,{ts,price})}
  const points=[...unique.values()].sort((a,b)=>a.ts-b.ts),last=points.at(-1);
  if(points.length<12||!last||now-last.ts>1500||last.ts-points[0].ts<12000)return null;
  const changes=points.slice(1).map((p,i)=>Math.abs(p.price-points[i].price)).filter(x=>x>0).sort((a,b)=>a-b);
  if(changes.length<6)return null;
  const noise=changes[Math.floor(changes.length/2)],prices=points.map(p=>p.price),span=Math.max(...prices)-Math.min(...prices);
  const tolerance=Math.max(last.price*.000002,Math.min(noise*1.25,span*.08));
  const excursion=Math.max(tolerance*2,Number(expected2)*.30,last.price*.000004);
  const highs=[],lows=[];let mode=0,high=points[0],low=points[0],segmentStart=points[0].ts;
  for(let i=1;i<points.length;i++){
    const p=points[i];
    if(p.ts-points[i-1].ts>3000){mode=0;high=low=p;segmentStart=p.ts;highs.length=lows.length=0;continue}
    if(mode>=0){
      if(p.price>=high.price)high=p;
      if(high.price-p.price>=excursion&&high.ts>segmentStart){highs.push({...high,confirmedAt:p.ts});mode=-1;low=p}
    }
    if(mode<=0){
      if(p.price<=low.price)low=p;
      if(p.price-low.price>=excursion&&low.ts>segmentStart){lows.push({...low,confirmedAt:p.ts});mode=1;high=p}
    }
  }
  if(last.ts-segmentStart<12000)return null;
  const candidates=[];
  for(const [side,pivots] of [['PUT',highs],['CALL',lows]]){
    const pivot=pivots.at(-1);if(!pivot||now-pivot.confirmedAt>10000)continue;
    const tests=pivots.filter(p=>Math.abs(p.price-pivot.price)<=tolerance&&pivot.ts-p.ts<=60000);
    if(tests.length<2||tests.at(-1).ts-tests[0].ts<3000)continue;
    const call=side==='CALL',region=tests.reduce((n,p)=>n+p.price,0)/tests.length;
    // The swing between independent tests is the structure that must break.
    // A small retreat from the second touch alone is not a confirmed reversal.
    const previous=tests.at(-2),between=points.filter(p=>p.ts>previous.ts&&p.ts<pivot.ts);
    if(!between.length)continue;
    const neckline=call?Math.max(...between.map(p=>p.price)):Math.min(...between.map(p=>p.price));
    const prominence=call?neckline-Math.max(previous.price,pivot.price):Math.min(previous.price,pivot.price)-neckline;
    if(prominence<excursion*2)continue;
    const level=call?neckline+tolerance:neckline-tolerance;
    const breakout=points.find(p=>p.ts>pivot.ts&&(call?p.price>=level:p.price<=level));
    const confirmedAt=breakout?.ts||0;
    const invalidation=call?Math.min(...tests.map(p=>p.price))-tolerance:Math.max(...tests.map(p=>p.price))+tolerance;
    const flow=points.slice(-3),advancing=flow.length>=3&&(call?flow.at(-1).price>flow.at(-2).price&&flow.at(-1).price>flow[0].price:flow.at(-1).price<flow.at(-2).price&&flow.at(-1).price<flow[0].price);
    const distance=call?last.price-level:level-last.price,maxDistance=Math.max(excursion*.75,noise*2);
    const barrier=Number(call?oppositeResistance:oppositeSupport),barrierKnown=(call?oppositeResistance:oppositeSupport)!=null&&Number.isFinite(barrier);
    const room=barrierKnown?(call?barrier-last.price:last.price-barrier):null;
    const minRoom=Math.max(excursion,Number(expectedMove)*.25);
    const roomOk=barrierKnown&&room>=minRoom;
    const held=flow.filter(p=>confirmedAt&&p.ts>=confirmedAt&&(call?p.price>=level:p.price<=level));
    const qualified=confirmedAt>0&&now-confirmedAt<=10000&&advancing&&held.length>=2&&distance>=0&&distance<=maxDistance&&roomOk&&(call?last.price>invalidation:last.price<invalidation);
    candidates.push({id:side+'|'+pivot.ts,side,tests:tests.length,region,neckline,prominence,tolerance,excursion,trigger:level,invalidation,confirmedAt,touchAt:pivot.ts,expiresAt:confirmedAt?confirmedAt+10000:0,maxDistance,distance,room,minRoom,roomOk,advancing,quoteConfirmations:held.length,qualified});
  }
  return candidates.sort((a,b)=>Number(b.qualified)-Number(a.qualified)||b.confirmedAt-a.confirmedAt)[0]||null;
}
