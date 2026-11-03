// Normalize ONLY the audited Sentinel 228 readout-only recovery and initial
// expiry receipt reconciliation before old SHA-frozen runtime/worker checks.
// Throws on missing markers: historical decision/expiry logic must not drift.
export function normalize228RuntimeReadout(text){
 const importLine="import {unifiedMarketEvidence227} from './unified-market-evidence-227.mjs';\n";
 const begin="      // Visual interpretation of long- and short-term evidence is separate";
 const end="      const phaseLabels={";
 const added="            candidate:eligible,observation,quoteAt:snap.quoteTs,now,\n            indicatorEvidence:readoutIndicators,\n            historicalCandlesVerified:snap.historicalCandlesVerified}),";
 const original="            candidate:eligible,observation,quoteAt:snap.quoteTs,now}),";
 const start=text.indexOf(begin),finish=text.indexOf(end,start);
 if(!text.includes(importLine)||start<0||finish<=start||!text.includes(added))
  throw Error('sentinel_228_runtime_readout_normalization_mismatch');
 const without=text.slice(0,start)+text.slice(finish);
 return without.replace(importLine,'').replace(added,original);
}
export function normalize228WorkerExpiryResume(text){
 const addedImport="import {lastTrustedExpiryForResume} from './native-expiry-resume-228.mjs';\n";
 const startLabel=" nativeExpirySeedAttempted.add(provider);";
 const endLabel="\n}\nfunction syncRuntimeMarket";
 const start=text.indexOf(startLabel),finish=text.indexOf(endLabel,start);
 if(!text.includes(addedImport)||start<0||finish<=start||
  !text.slice(start,finish).includes('restore-last-trusted-native-expiry'))
  throw Error('sentinel_228_worker_expiry_normalization_mismatch');
 const original=` nativeExpirySeedAttempted.add(provider);
 void (async()=>{
  await driver.nativeExpiryPreferenceReady;
  if(driver.nativeExpiryPreferences.has(provider))return;
  await driver.setNativeExpiryPreference(provider,savedRuntimeExpirySeed,{preserveExisting:true});
 })().catch(e=>console.error('native_expiry_seed_error',String(e?.message||e)));`;
 return (text.slice(0,start)+original+text.slice(finish)).replace(addedImport,'');
}

// A single globally imposed 14s startup threshold was removed in 230.
// Continue checking all prior runtime bytes, expiry gates and 228 recovery.
export function normalize230StartupHistory(text){
 const start="    // Sentinel 230: remove the GLOBAL 15-tick/14-second startup wait.";
 const end="const ready=verified&&historyReady";
 const old="const historyReady=this.settings.engine?quotes.length>=15&&quoteSpan>=14000:this.externalMarket.candles?.length>=50;";
 const a=text.indexOf(start),b=text.indexOf(end,a);
 if(a<0||b<=a)throw Error('sentinel_230_history_normalization_mismatch');
 return text.slice(0,a)+old+text.slice(b);
}
