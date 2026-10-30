// User preference, shared by every strategy. It filters a qualified proposal;
// it never chooses the direction or changes an already issued operation.
export const ENTRY_FAMILIES=Object.freeze(['automatic','continuation','reversal']);
export function normalizeEntryFamily(value){return ENTRY_FAMILIES.includes(value)?value:'automatic';}
const reversals=new Set(['closed-range-extreme-reversal-confirmed','confirmed-level-structure-reversal',
 'confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection','multiscale-candle-rejection']);
const continuations=new Set(['closed-structure-and-live-impulse','historical-level-breakout',
 'break-retest-continuation','rejection-followthrough-clear-room','historical-trend-and-live-forecast',
 'observed-multi-interval-trend-correction','locally-verified-opposite-direction','causal-expiry-analogue']);
export function entryFamilyOf(candidate){
 if(reversals.has(candidate?.reason))return 'reversal';
 if(continuations.has(candidate?.reason))return 'continuation';
 return null;
}
export function reviewEntryFamily(candidate,selection='automatic'){
 const family=normalizeEntryFamily(selection);
 if(candidate?.ready!==true||family==='automatic'||entryFamilyOf(candidate)===family)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'entry-family-not-selected',observedEntryFamily:entryFamilyOf(candidate),selectedEntryFamily:family};
}
export function reactionLevel(candidate){
 const p=candidate?.priceStructure,reason=candidate?.reason;
 const proof=['confirmed-level-structure-reversal','confirmed-fast-level-reversal'].includes(reason)?p?.confirmedReversal:
  ['failed-breakout-structure-change','break-retest-continuation','rejection-followthrough-clear-room'].includes(reason)?
   p?.observedSequence?.structureChange??p?.observedSequence?.continuation:p?.reaction;
 const value=Number(proof?.level?.level??proof?.zone?.level);
 return value>0?value:null;
}

export function supportsEntryFamilies(version){
 const parts=String(version||'').split('.').map(Number);
 return parts.length===3&&parts.every(Number.isFinite)&&(parts[0]>13||parts[0]===13&&(parts[1]>9||parts[1]===9&&parts[2]>=182));
}
