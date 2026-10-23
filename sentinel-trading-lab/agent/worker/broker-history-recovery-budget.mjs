// Request budget for the BROKER's separate recovery feed. Do not throttle
// first acquisition or a genuine asset/active_id switch. This only suppresses
// repeated identical history work when the same stream remains incomplete.
export function shouldRecoverBrokerHistory({
 activeId,symbol,candleCount=0,stale=false,streamingHealthy=false,
 lastRequest=null,now=Date.now()
}={}){
 const missing=Number(candleCount)<50;
 if(!missing&&!stale&&streamingHealthy)return false;
 if(!lastRequest||!Number.isFinite(Number(lastRequest.at)))return true;
 const sameAsset=activeId!=null&&lastRequest.activeId!=null&&
  String(lastRequest.activeId)===String(activeId)&&
  String(lastRequest.symbol||'')===String(symbol||'');
 if(!sameAsset)return true;
 const elapsed=Number(now)-Number(lastRequest.at);
 // Protect from clock jumps too: an old future timestamp should not suppress
 // recovery forever. 12s includes the provider's two bounded 6s fallbacks.
 return !(elapsed>=0&&elapsed<12000);
}
