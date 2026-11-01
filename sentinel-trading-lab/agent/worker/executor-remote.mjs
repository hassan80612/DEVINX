// Display only: no account IDs, order IDs, history or broker credentials.
export const EXECUTOR_CONFIG_KEYS=['amount','initialBalance','payoutPercent','intervalMs','stopAfterMinutes','stopLoss','martingaleLevels','martingaleEnabled','maxConsecutiveLosses','martingaleMultiplier','directionMode','stopWin'];
export function packExecutor(s){
 if(!s)return null;
 return [s.enabled?1:0,s.arming?1:0,s.executing?1:0,
  EXECUTOR_CONFIG_KEYS.map(k=>s.config?.[k]??0),String(s.message||'').slice(0,180),
  s.startedAt,s.deadlineAt,s.netPnl,s.calculatedBalance,s.availableBalance,
  s.balanceSource==='broker-received-balance'?1:0,
  s.brokerBalance?[s.brokerBalance.amount,s.brokerBalance.receivedAt]:null,
  s.riskNetPnl,s.executed,s.closed,
  s.pending?[s.pending.side,s.pending.state,s.pending.exitAt,s.pending.entryPrice]:null,
  s.provider||null,s.updatedAt,
  [s.capabilities?.brokerExecution||0,s.martingaleLevel||0,s.nextAmount??null,s.lossLimitRemaining??null,s.initialBalance??null,s.durationMs??null,s.nextClicks??1,s.consecutiveLossBatches??0,s.sessionWins??0,s.sessionLosses??0,s.unresolvedDetail?.waitingResult??0,s.unresolvedDetail?.waitingId??0,s.unresolvedDetail?.uncertainAttempts??0]];
}
export function unpackExecutor(a){
 if(!Array.isArray(a)||![18,19].includes(a.length)||!Array.isArray(a[3]))return null;
 return {enabled:a[0]===1,arming:a[1]===1,executing:a[2]===1,
  config:Object.fromEntries(EXECUTOR_CONFIG_KEYS.map((k,i)=>[k,a[3][i]])),message:a[4],
  startedAt:a[5],deadlineAt:a[6],netPnl:a[7],calculatedBalance:a[8],availableBalance:a[9],
  balanceSource:a[10]===1?'broker-received-balance':Number(a[18]?.[0])>=3?'unavailable':'user-configured-local-calculation',
  brokerBalance:a[11]?{amount:a[11][0],receivedAt:a[11][1]}:null,
  riskNetPnl:a[12],executed:a[13],closed:a[14],
  pending:a[15]?{side:a[15][0],state:a[15][1],exitAt:a[15][2],entryPrice:a[15][3]}:null,
  provider:a[16],updatedAt:a[17],
  ...(a[18]?{capabilities:{brokerExecution:a[18][0]},martingaleLevel:a[18][1],nextAmount:a[18][2],lossLimitRemaining:a[18][3],initialBalance:a[18][4],durationMs:a[18][5],nextClicks:a[18][6]??1,consecutiveLossBatches:a[18][7]??0,sessionWins:a[18][8]??0,sessionLosses:a[18][9]??0,unresolvedDetail:{waitingResult:a[18][10]??0,waitingId:a[18][11]??0,uncertainAttempts:a[18][12]??0}}:{})};
}
export async function dispatchExecutor(path,payload,run,context){
 const action={'/executor/start':'executor-start','/executor/stop':'executor-stop','/executor/config':'executor-config','/executor/reset-account':'executor-reset-account'}[path];
 if(!action)throw Error('Comando do bot inválido.');
 if(action==='executor-start'){
  const c=context(),expected=payload.context;
  if(!expected||expected.provider!==c.provider||expected.asset!==c.asset||Number(expected.durationMs)!==c.durationMs)
   throw Error('Ativo, corretora ou prazo mudou. Atualize o painel antes de ligar.');
 }
 return run(action,action==='executor-config'?{patch:payload.patch}:{});
}

