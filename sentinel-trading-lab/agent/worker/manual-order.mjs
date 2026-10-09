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
  if(typeof payload.amount!=='number'||!Number.isFinite(amount)||amount<=0||amount>1_000_000||Math.round(amount*100)!==amount*100)reject('manual_invalid_amount');
  const c=payload.context||{};
  if(c.provider!==provider||!['demo','real'].includes(c.mode))reject('manual_broker_context_mismatch');
  if(!live||!['demo','real'].includes(String(live.mode||'')))reject('manual_account_not_verified');
  if(live.mode!==c.mode||!live.accountId||String(live.accountId)!==String(c.accountId))reject('manual_account_changed');
  if(live.activeId==null||String(live.activeId)!==String(c.activeId)||!c.asset||key(live.symbol)!==key(c.asset)||key(live.uiSymbol)!==key(c.asset))reject('manual_asset_changed');
  if(!c.expirationRaw||String(live.expirationRaw)!==String(c.expirationRaw)||!live.expirationUpdatedAt||now-Number(live.expirationUpdatedAt)>15000)reject('manual_expiration_changed');
  const ui=live.executionUi||{};
  if(!ui.buy||!ui.sell||!ui.amount||ui.assetMatch!==true)reject('manual_controls_unverified');
  if(!live.assetValidated||!live.candleAssetMatch)reject('manual_asset_unverified');
  return {requestId:payload.requestId,provider,side:payload.side,amount,asset:String(c.asset),mode:String(c.mode),issuedAt:issued,expiresAt:expires};
}
