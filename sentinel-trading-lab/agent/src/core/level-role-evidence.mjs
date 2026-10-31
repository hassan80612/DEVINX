// CALL rejection needs support evidence; PUT rejection needs resistance.
// Generic legacy fixtures stay compatible, but a known zero is never filled
// with confirmations observed on the opposite side of the same price zone.
export function levelRoleEvidence(level,side){
 const role=side==='CALL'?'support':'resistance';
 const known=['supportPivots','resistancePivots','supportRejections','resistanceRejections']
  .some(key=>Object.hasOwn(level||{},key));
 const pivots=Number(known?level?.[role+'Pivots']:(level?.confirmedPivots??level?.pivots))||0;
 const rejections=Number(known?level?.[role+'Rejections']:level?.independentRejections)||0;
 return {role,known,pivots,rejections,confirmed:pivots>0||rejections>=2};
}
// A resistance can become support (and vice versa), but only a received
// crossing, retest, and departure establishes that change before entry.
export function observedRoleRetest({quoteHistory=[],quoteAt,now=quoteAt,price,side,zone,tolerance}={}){
 const sign=side==='CALL'?1:side==='PUT'?-1:0,t=Number(quoteAt),spot=Number(price),tol=Number(tolerance);
 if(!sign||!(t>0&&now>=t&&now-t<=2500&&spot>0&&tol>0))return false;
 const outer=side==='CALL'?Number(zone?.high):Number(zone?.low);
 const inner=side==='CALL'?Number(zone?.low):Number(zone?.high);
 if(!(outer>0&&inner>0&&sign*(spot-outer)>tol))return false;
 let beforeAt=null,brokenAt=null,retestAt=null,last=null;
 for(const q of quoteHistory){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(!(ts>=t-180000&&ts<=t&&received<=now&&p>0))continue;
  if(last&&ts<last.ts)return false;
  if(last&&ts-last.ts>2500){beforeAt=null;brokenAt=null;retestAt=null;}
  if(sign*(p-inner)<-tol){beforeAt=ts;brokenAt=null;retestAt=null;}
  else if(beforeAt!=null&&brokenAt==null&&ts>beforeAt&&sign*(p-outer)>tol)brokenAt=ts;
  else if(brokenAt!=null&&retestAt==null&&ts>brokenAt&&sign*(p-outer)<=tol&&sign*(p-inner)>=-tol)retestAt=ts;
  last={ts,price:p};
 }
 return retestAt!=null&&last?.ts===t&&last.price===spot&&t>retestAt;
}
// Short strategy evidence cannot turn a confirmed opposing historical zone
// into the support/resistance it needs merely by renaming the same bounce.
export function specialistLevelRoleRisk({candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side))return null;
 const spot=Number(price),t=Number(quoteAt),tol=Number(structure?.tolerance),map=structure?.candleLevelMap;
 if(!(spot>0&&t>0&&now>=t&&now-t<=1450&&tol>0&&map?.asOf<=now))return null;
 for(const zone of map.levels||[]){
  const same=levelRoleEvidence(zone,candidate.side),opposed=levelRoleEvidence(zone,candidate.side==='CALL'?'PUT':'CALL');
  if(!same.known||same.confirmed||opposed.pivots<1||opposed.rejections<2)continue;
  if(!(spot>=zone.low-tol&&spot<=zone.high+tol))continue;
  if(observedRoleRetest({quoteHistory,quoteAt,now,price,side:candidate.side,zone,tolerance:tol}))continue;
  return {kind:'unsupported-role-at-confirmed-opposing-level',level:zone.level,neededRole:same.role};
 }
 return null;
}
