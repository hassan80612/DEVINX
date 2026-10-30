// One-minute rejection admission: a short price bounce is not proof that
// a CLOSED-candle rejection will hold for an entire option expiry.
// Read-only and stateless. No broker reads, timer, collection or side inversion.
const REVIEWED=new Set([
 'multiscale-candle-rejection',
 'closed-range-extreme-reversal-confirmed'
]);
export function reviewOneMinuteRejectionProof({
 candidate,original,durationMs,quoteAt,now=quoteAt,price
}={}){
 if(Number(durationMs)!==60000||candidate?.ready!==true||
  !['CALL','PUT'].includes(candidate.side)||!REVIEWED.has(candidate.reason))
  return candidate;
 const quotedAt=Number(quoteAt),spot=Number(price);
 // The existing shared engine owns currency/timestamp validation.
 if(!(quotedAt>0&&now>=quotedAt&&now-quotedAt<=1950&&spot>0&&
   Number(candidate.observedAt)===quotedAt&&Number(candidate.entryPrice)===spot))
  return candidate;
 const matching=original?.reason===candidate.reason&&original?.side===candidate.side;
 const proof=candidate.priceStructure?.reactionProof||
   (matching?original.priceStructure?.reactionProof:null);
 // Other genuine independent confirmation paths retain authority.
 if(!proof||proof.confirmed!==false||Number(proof.durationMs)!==60000)
  return candidate;
 const validReasons=new Set([
  'not-away-from-confirmed-level','last-move-not-supporting',
  'medium-path-not-supporting','missing-past-horizon'
 ]);
 if(!validReasons.has(proof.reason))return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'one-minute-rejection-not-confirmed-for-expiry',
  entryRisk:{kind:'one-minute-level-rejection-unconfirmed',
   failedProof:proof.reason,durationMs:60000}};
}
