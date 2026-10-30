// Recover the already opened broker tab. No click, navigation or expiry changes.
export async function recoverAlreadyOpenMarket({driver,provider}={}){
 if(!driver||!provider)return false;
 const snapshot=()=>driver.liveStatus?.(provider)||{};
 const identified=m=>Number.isInteger(Number(m.activeId))&&Number(m.activeId)>0&&
   Boolean(m.uiSymbol||m.validatedSymbol||m.symbol)&&m.assetValidated!==false;
 const first=snapshot();
 if(identified(first)&&first.quoteFeedValidated===true&&first.candleFresh===true)return true;
 const st=driver.state?.(provider)||null,now=Date.now();
 if(st?.lastInitialMarketRecoveryAt&&now-st.lastInitialMarketRecoveryAt<10000)return false;
 if(st)st.lastInitialMarketRecoveryAt=now;
 try{await driver.syncVisibleAsset?.(provider,{deferMarketFetch:true})}catch{}
 let live=snapshot();
 if(!identified(live)){
  try{await driver.requestBaseData?.(provider)}catch{}
  try{await driver.syncVisibleAsset?.(provider,{deferMarketFetch:true})}catch{}
  live=snapshot();
 }
 if(!identified(live))return false;
 if(live.quoteFeedValidated===true&&live.candleFresh===true)return true;
 try{await driver.requestMarketData?.(provider,{force:true})}catch{}
 const after=snapshot();
 return identified(after)&&after.quoteFeedValidated===true&&after.candleFresh===true;
}
