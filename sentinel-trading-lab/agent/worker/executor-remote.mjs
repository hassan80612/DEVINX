// Display only: no account IDs, order IDs, history or broker credentials.
export const EXECUTOR_CONFIG_KEYS=['amount','initialBalance','payoutPercent','intervalMs','stopAfterMinutes','stopLoss'];
export function packExecutor(s){
 if(!s)return null;
 return [s.enabled?1:0,s.arming?1:0,s.executing?1:0,
  EXECUTOR_CONFIG_KEYS.map(k=>s.config?.[k]??0),String(s.message||'').slice(0,180),
  s.startedAt,s.deadlineAt,s.netPnl,s.calculatedBalance,s.availableBalance,
  s.balanceSource==='broker-received-balance'?1:0,
  s.brokerBalance?[s.brokerBalance.amount,s.brokerBalance.receivedAt]:null,
  s.riskNetPnl,s.executed,s.closed,
  s.pending?[s.pending.side,s.pending.state,s.pending.exitAt,s.pending.entryPrice]:null,
  s.provider||null,s.updatedAt];
}
export function unpackExecutor(a){
 if(!Array.isArray(a)||a.length!==18||!Array.isArray(a[3]))return null;
 return {enabled:a[0]===1,arming:a[1]===1,executing:a[2]===1,
  config:Object.fromEntries(EXECUTOR_CONFIG_KEYS.map((k,i)=>[k,a[3][i]])),message:a[4],
  startedAt:a[5],deadlineAt:a[6],netPnl:a[7],calculatedBalance:a[8],availableBalance:a[9],
  balanceSource:a[10]===1?'broker-received-balance':'user-configured-local-calculation',
  brokerBalance:a[11]?{amount:a[11][0],receivedAt:a[11][1]}:null,
  riskNetPnl:a[12],executed:a[13],closed:a[14],
  pending:a[15]?{side:a[15][0],state:a[15][1],exitAt:a[15][2],entryPrice:a[15][3]}:null,
  provider:a[16],updatedAt:a[17]};
}
export async function dispatchExecutor(path,payload,run,context){
 const action={'/executor/start':'executor-start','/executor/stop':'executor-stop','/executor/config':'executor-config'}[path];
 if(!action)throw Error('Comando do bot inválido.');
 if(action==='executor-start'){
  const c=context(),expected=payload.context;
  if(!expected||expected.provider!==c.provider||expected.asset!==c.asset||Number(expected.durationMs)!==c.durationMs)
   throw Error('Ativo, corretora ou prazo mudou. Atualize o painel antes de ligar.');
 }
 return run(action,action==='executor-config'?{patch:payload.patch}:{});
}
