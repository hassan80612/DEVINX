// Recover the selected broker instrument even when its tab predates Agent attachment.
// Never select or navigate to a different instrument. START does not await this.
export async function recoverAlreadyOpenMarket({driver,provider}={}){
 if(!driver||!provider)return false;
 const snapshot=()=>driver.liveStatus?.(provider)||{};
 const identified=m=>Number.isInteger(Number(m.activeId))&&Number(m.activeId)>0&&
  Boolean(m.uiSymbol||m.validatedSymbol||m.symbol)&&m.assetValidated!==false;
 const initial=snapshot();
 // Never disturb a healthy market with an unnecessary request or DOM traversal.
 if(identified(initial)&&initial.quoteFeedValidated===true&&initial.candleFresh===true)return true;
 try{await driver.syncVisibleAsset?.(provider)}catch{}
 let live=snapshot();
 // A recognized tab label is NOT equivalent to a broker instrument ID.
 if(!identified(live)){
  try{await driver.domSnapshot?.(provider)}catch{}
  try{await driver.requestBaseData?.(provider)}catch{}
  try{await driver.syncVisibleAsset?.(provider)}catch{}
  live=snapshot();
 }
 if(!identified(live))return false;
 if(live.quoteFeedValidated===true&&live.candleFresh===true)return true;
 try{await driver.requestMarketData?.(provider,{force:true})}catch{}
 const after=snapshot();
 return identified(after)&&after.quoteFeedValidated===true&&after.candleFresh===true;
}
