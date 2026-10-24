// Broker housekeeping is independent of the quote→analysis→click path.
// A healthy passive websocket already provides balance and market updates;
// avoid competing chart DOM work in its busy rendering thread.
export function brokerMaintenanceCadenceMs({state,now=Date.now()}={}){
 const age=now-Number(state?.lastQuoteAt||0);
 const live=state?.activeId!=null&&Number(state.lastQuoteAt)>0&&
   age>=0&&age<=2500&&state?.candles?.length>=50&&
   Number.isFinite(Number(state?.quote))&&Number(state.quote)>0&&
   state?.balance!=null;
 return live?8000:2500;
}
