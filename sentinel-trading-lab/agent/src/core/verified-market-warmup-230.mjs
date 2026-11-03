// Sentinel 230: distinguish a broker's VERIFIED historical candles from the
// observed current quote trail. A complete same-asset candle history already
// supplies long-range structure; do not force a second 14s warmup for EVERY
// recent refresh or benign disconnect. Entry gates still validate their own
// real-time evidence; this function only starts running the analyst cycle.
export function marketWarmup230({broker={},quoteHistory=[],now=Date.now()}={}){
 const quotes=Array.isArray(quoteHistory)?quoteHistory:[];
 const last=quotes.at(-1),first=quotes[0];
 const end=Number(last?.ts),start=Number(first?.ts),quoteAt=Number(broker?.quoteTs||broker?.lastQuoteAt),
  price=Number(broker?.quote),lastPrice=Number(last?.price),at=Number(now);
 const age=at-quoteAt;
 const validLive=broker.quoteFeedValidated===true&&broker.assetValidated===true&&
  !broker.screenCandidateSymbol&&Number.isFinite(price)&&price>0&&
  Number.isFinite(lastPrice)&&lastPrice>0&&Number.isFinite(end)&&
  Number.isFinite(quoteAt)&&quoteAt>0&&age>=-300&&age<=2500&&
  Math.abs(end-quoteAt)<=2000;
 // Preserve legacy 15/14s path only for VALID quotes, not stale/other assets.
 const span=end-start;
 const full=validLive&&quotes.length>=15&&Number.isFinite(span)&&span>=14000;
 if(full)return {ready:true,path:'full-14s',quoteCount:quotes.length,spanMs:span};
 // Accelerate only if correct broker delivered VERIFIED CLOSED SAME-ASSET
 // candles. Never treat demo/generated candles or a forming quote as history.
 const historical=broker.historicalCandlesVerified===true&&
  Array.isArray(broker.candles)&&broker.candles.length>=50;
 if(!validLive||!historical||quotes.length<6)return {
  ready:false,path:!validLive?'live-quote-unverified':!historical?'closed-candles-unverified':'collecting-real-ticks',
  quoteCount:quotes.length,spanMs:Number.isFinite(span)?span:0};
 const recent=quotes.slice(-6);
 if(recent.some((q,i)=>{
  const t=Number(q?.ts),p=Number(q?.price);
  return !Number.isFinite(t)||!Number.isFinite(p)||p<=0||
    (i>0&&(t<=Number(recent[i-1].ts)||t-Number(recent[i-1].ts)>2200));
 }))return {ready:false,path:'short-quote-sequence-incomplete',quoteCount:quotes.length,spanMs:span};
 const recentSpan=end-Number(recent[0].ts);
 if(recentSpan<4000)return {ready:false,path:'collecting-recent-ticks',quoteCount:quotes.length,spanMs:recentSpan};
 // No forward-looking market evidence or fabricated quote. The source gate
 // is verified, and strict entry approval has its own independent guards.
 return {ready:true,path:'verified-history-plus-real-ticks',quoteCount:quotes.length,spanMs:recentSpan};
}
