export const Role=Object.freeze({USER:'user',MASTER:'master'});
export function can(role,action){const master=new Set(['view_any_user','freeze_user','unfreeze_user','stop_any_bot','revoke_broker_session','view_incidents','view_audit','kill_any_bot']);const user=new Set(['view_self','edit_self','start_own_bot','stop_own_bot','view_own_trades','edit_own_risk']);if(role===Role.MASTER)return master.has(action)||user.has(action);return user.has(action)}
export function assertCan(role,action){if(!can(role,action))throw new Error('forbidden')}
