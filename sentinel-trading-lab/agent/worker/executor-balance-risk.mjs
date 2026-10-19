// Consume already received account events only. No requests, polling or OCR.
export function validBrokerBalance(value){
 if(!value||!['iq_option','exnova'].includes(value.provider)||value.accountId==null||typeof value.amount!=='number'||!Number.isFinite(value.amount)||value.amount<0||!(value.receivedAt>0)||!(value.revision>0))return null;
 return{provider:value.provider,accountId:String(value.accountId),amount:value.amount,receivedAt:Number(value.receivedAt),revision:Number(value.revision),source:String(value.source||'protocol')};
}
export class ExecutorBalanceRisk{
 constructor(){this.current=null;this.session=null;this.trade=null;this.last=null;}
 observe(value){
  this.current=validBrokerBalance(value);
  if(this.current&&this.session&&this.current.provider===this.session.provider&&this.current.accountId===this.session.accountId)this.last=this.current;
 }
 begin(provider){
  const value=this.current?.provider===provider?this.current:null;
  this.session=value?{provider,accountId:value.accountId,initial:value.amount}:null;this.last=value;this.trade=null;return value;
 }
 capture(order){
  const s=this.session,b=this.last;if(!s||!b||order.provider!==s.provider)return;
  this.trade={amount:order.amount,exitAt:order.exitAt,before:b.amount,beforeRevision:b.revision};
 }
 close(netPnl,now){
  if(this.trade)this.trade={...this.trade,settled:true,netPnl,closedAt:now,closeRevision:this.last?.revision};
 }
 view(now){
  const s=this.session,b=this.last;
  const changed=!!(s&&this.current&&(this.current.provider!==s.provider||this.current.accountId!==s.accountId));
  if(!s||!b)return{source:this.current?'broker':'unavailable',current:this.current,initial:this.current?.amount??null,net:this.current?0:null,available:this.current?.amount??null,reconciling:false,accountChanged:changed};
  let effective=b.amount,reserved=0,reconciling=false;
  if(this.trade){
   const t=this.trade;
   if(!t.settled){
    // Keep the stake reserved until the identified order closes. An expired
    // quote or a pre-expiry debit does not prove that the operation lost.
    if(b.revision>t.beforeRevision&&b.amount<=t.before-t.amount+0.000001)reserved=t.amount;
    effective+=reserved;reconciling=now>=t.exitAt;
   }else{
    const expected=t.before+t.netPnl;
    if(Math.abs(b.amount-expected)<0.000001||b.revision>t.closeRevision)this.trade=null;
    else{effective=expected;reconciling=now<t.closedAt+15000;}
   }
  }
  return{source:'broker',current:this.current,initial:s.initial,net:effective-s.initial,available:b.amount,reserved,reconciling,accountChanged:changed};
 }
}
