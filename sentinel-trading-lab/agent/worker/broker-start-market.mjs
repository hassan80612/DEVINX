// An attached broker may need its history before its first price event.
// Selection does NOT authorize trading: the runtime validates live quotes separately.
export function chooseConnectedBrokerForReading({preferred,brokers,peek,liveStatus}={}){
 const names=[...new Set([preferred,...Object.keys(brokers||{})].filter(Boolean))];
 let firstConnected=null;
 for(const k of names){
  if(brokers?.[k]?.connected!==true)continue;
  const p=peek?.(k);
  if(p?.updatedAt&&p.open===false)continue;
  const m=liveStatus?.(k);
  if(!m)continue;
  const candidate={k,m};
  if(k===preferred)return candidate;
  if(m.balance!=null||m.quote!=null||m.candles?.length)return candidate;
  firstConnected??=candidate;
 }
 return firstConnected;
}
