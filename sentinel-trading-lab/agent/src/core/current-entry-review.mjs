// Constant-size review of decisions already computed and quotes already
// received. No second model run, broker read, extra tick or waiting period.
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
const asset=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const side=x=>x==='CALL'||x==='PUT';
const matches=(review,context)=>!!context&&review?.source==='current-final-entry-v1'&&
 review.provider===context.provider&&asset(review.asset)===asset(context.asset)&&
 review.engine===context.engine&&review.durationMs===Number(context.durationMs);
export function currentEntryReview({candidate,provider,asset,engine,durationMs,quoteAt,price,now}={}){
 const proof=candidate?.priceStructure?.confirmedReversal;
 const invalidation=proof?.kind==='confirmed-fast-level-reversal'?proof.invalidation:
  proof?.kind==='confirmed-level-structure-reversal'?proof.turnPrice:null;
 const sign=candidate?.side==='CALL'?1:-1;
 return Object.freeze({source:'current-final-entry-v1',provider,asset,engine,
  durationMs:Number(durationMs),evaluatedAt:Number(now),quoteAt:Number(quoteAt),price:Number(price),
  ready:candidate?.ready===true,side:side(candidate?.side)?candidate.side:null,
  // A boundary belongs only to the actual confirmed final direction.
  invalidation:proof?.side===candidate?.side&&positive(invalidation)&&
   sign*(Number(price)-Number(invalidation))>0?Number(invalidation):null});
}
export function captureEntryReview({signal,review,context}={}){
 if(!matches(review,context)||review.ready!==true||review.side!==signal?.side||
  review.evaluatedAt!==Number(signal?.at)||!positive(review.quoteAt)||
  review.quoteAt>review.evaluatedAt||!positive(review.price))return null;
 return Object.freeze({...review});
}
export function currentEntryRejection({issued,context,now}={}){
 if(!matches(issued,context)||issued.ready!==true||!side(issued.side)||
  !positive(issued.evaluatedAt)||issued.evaluatedAt>now)return null;
 const fresh=at=>positive(at)&&at>=issued.quoteAt&&at<=now&&now-at<=2500;
 // The existing structural invalidation price is authoritative even if a
 // newer feed quote arrived while the native controls were being resolved.
 if(positive(issued.invalidation)&&positive(context.quote)&&fresh(Number(context.quoteAt))&&
  (issued.side==='CALL'?Number(context.quote)<=issued.invalidation:Number(context.quote)>=issued.invalidation))
  return 'reversal-invalidated-before-entry';
 const latest=context.entryReview;
 // Neutral/unfinished/old reviews do not invent another readiness gate.
 if(matches(latest,context)&&latest.ready===true&&side(latest.side)&&latest.side!==issued.side&&
  latest.evaluatedAt>issued.evaluatedAt&&latest.evaluatedAt<=now&&
  latest.quoteAt<=latest.evaluatedAt&&fresh(latest.quoteAt))
  return 'confirmed-opposite-before-entry';
 return null;
}
