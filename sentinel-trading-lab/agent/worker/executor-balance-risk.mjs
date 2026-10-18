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
 view(now){
  const s=this.session,b=this.last;
  const changed=!!(s&&this.current&&(this.current.provider!==s.provider||this.current.accountId!==s.accountId));
  if(!s||!b)return{source:'manual',current:this.current,net:null,reconciling:false,accountChanged:changed};
  let effective=b.amount,reserved=0,reconciling=false;
  if(this.trade){
   const t=this.trade;
   if(now<t.exitAt){
    // A stake debit is reserved money, not a completed trading loss.
    if(b.revision>t.beforeRevision&&b.amount<=t.before-t.amount+0.000001)reserved=t.amount;
    effective+=reserved;
   }else if(!(b.revision>t.beforeRevision&&b.receivedAt>=t.exitAt)&&now<t.exitAt+1000){
    // A win's capital/payout can arrive just after the expiry quote. Reuse
    // the existing worker pulse for at most 1s; install no extra timer.
    effective=t.before;reconciling=true;
   }else this.trade=null;
  }
  return{source:'broker',current:this.current,initial:s.initial,net:effective-s.initial,available:b.amount,reserved,reconciling,accountChanged:changed};
 }
}
