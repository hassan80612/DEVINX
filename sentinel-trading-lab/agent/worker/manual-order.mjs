// Manual orders are explicit user actions. No timers or additional Supabase calls.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,'');
function reject(code){const error=new Error(code);error.status=409;throw error}
export function validateManualOrder(payload,{provider,deviceId,live,now=Date.now()}={}){
  if(!payload||payload.confirmed!==true||!UUID.test(String(payload.requestId||'')))reject('manual_confirmation_required');
  const issued=Number(payload.issuedAt),expires=Number(payload.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now+1000||issued<now-10000||expires<=now||expires>issued+10000)reject('manual_command_expired');
  if(!deviceId||String(payload.deviceId)!==String(deviceId))reject('manual_device_mismatch');
  if(!['CALL','PUT'].includes(payload.side))reject('manual_invalid_side');
  const amount=Number(payload.amount);
  if(typeof payload.amount!=='number'||!Number.isFinite(amount)||amount<=0||amount>1_000_000||Math.abs(Math.round(amount*100)-amount*100)>1e-7)reject('manual_invalid_amount');
  const c=payload.context||{};
  if(c.provider!==provider||!['demo','real'].includes(c.mode))reject('manual_broker_context_mismatch');
  if(!live||!['demo','real'].includes(String(live.mode||'')))reject('manual_account_not_verified');
  if(live.mode!==c.mode||!live.accountId||String(live.accountId)!==String(c.accountId))reject('manual_account_changed');
  if(live.activeId==null||String(live.activeId)!==String(c.activeId)||!c.asset||key(live.symbol)!==key(c.asset)||key(live.uiSymbol)!==key(c.asset))reject('manual_asset_changed');
  // Broker expiration is manually configured by the user, not inferred from the DOM.
  // Each order must explicitly confirm one of the supported expiration durations.
  const expirySeconds=Number(c.expirationSeconds);
  if(c.expirationMode!=='manual-confirmed'||c.manualBrokerExpiryConfirmed!==true||
     ![30,60,120,300,600,900].includes(expirySeconds))
    reject('manual_broker_expiration_confirmation_required');
  const ui=live.executionUi||{};
  if(!ui.buy||!ui.sell||!ui.amount||ui.assetMatch!==true)reject('manual_controls_unverified');
  if(!live.assetValidated||!live.candleAssetMatch)reject('manual_asset_unverified');
  return {requestId:payload.requestId,provider,side:payload.side,amount,asset:String(c.asset),mode:String(c.mode),issuedAt:issued,expiresAt:expires};
}
