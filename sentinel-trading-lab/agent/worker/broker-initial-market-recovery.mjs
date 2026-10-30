// START recovery: single-flight, retryable, and never switches a broker tab.
// No hidden chart clicks, broker expiry writes, fabricated ID or stale quotes.
export async function recoverAlreadyOpenMarket({driver,provider,force=false}={}){
 if(!driver||!provider)return false;
 const snapshot=()=>driver.liveStatus?.(provider)||{};
 const identified=m=>Number.isInteger(Number(m.activeId))&&Number(m.activeId)>0&&
   Boolean(m.uiSymbol||m.validatedSymbol||m.symbol)&&m.assetValidated!==false;
 const first=snapshot();
 if(identified(first)&&first.quoteFeedValidated===true&&first.candleFresh===true)return true;
 const st=driver.state?.(provider)||null,now=Date.now();
 if(st?.initialMarketRecoveryPromise)return st.initialMarketRecoveryPromise;
 const minGap=force?2000:10000;
 if(st?.lastInitialMarketRecoveryAt&&now-st.lastInitialMarketRecoveryAt<minGap)return false;
 if(st)st.lastInitialMarketRecoveryAt=now;
 const operation=(async()=>{
  try{await driver.syncVisibleAsset?.(provider,{deferMarketFetch:true})}catch{}
  let live=snapshot();
  if(!identified(live)){
   // One explicit catalog attempt. The visual instrument may have existed
   // before Agent attached to the broker's sockets.
   try{await driver.requestBaseData?.(provider)}catch{}
   try{await driver.syncVisibleAsset?.(provider,{deferMarketFetch:true})}catch{}
   live=snapshot();
  }
  if(!identified(live))return false;
  if(live.quoteFeedValidated===true&&live.candleFresh===true)return true;
  try{await driver.requestMarketData?.(provider,{force:true})}catch{}
  const after=snapshot();
  return identified(after)&&after.quoteFeedValidated===true&&after.candleFresh===true;
 })();
 if(st)st.initialMarketRecoveryPromise=operation;
 try{return await operation}finally{if(st?.initialMarketRecoveryPromise===operation)st.initialMarketRecoveryPromise=null;}
}
