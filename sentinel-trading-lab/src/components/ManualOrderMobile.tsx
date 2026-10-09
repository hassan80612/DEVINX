'use client';
import {useEffect,useState} from 'react';

type Direction='CALL'|'PUT';
const n=(v:unknown)=>String(v??'').trim();
const numeric=(v:string)=>Number(v.replace(',','.'));

export default function ManualOrderMobile({s}:{s:any}){
  const [amount,setAmount]=useState('2');
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');
  const live=s?.liveBroker||{};
  const remote=s?.remote||{};
  const provider=n(s?.activeProvider);
  const mode=n(live.mode).toLowerCase();
  const asset=n(live.uiSymbol||live.symbol);
  const expiry=n(live.expirationRaw);
  const money=numeric(amount);
  // This is a local on-screen comparison, not trade accounting. It never
  // triggers additional requests to Supabase or the broker.
  const brokerBalance=live.balance!=null&&Number.isFinite(Number(live.balance))
    ?Number(live.balance)
    :s?.balanceSource==='broker'&&s?.balance!=null&&Number.isFinite(Number(s.balance))
      ?Number(s.balance):null;
  const accountKey=[provider,mode,n(live.accountId)].join(':');
  const [balanceBase,setBalanceBase]=useState<{key:string,value:number}|null>(null);
  useEffect(()=>{
    if(brokerBalance===null||!accountKey||!n(live.accountId))return;
    setBalanceBase(old=>old?.key===accountKey?old:{key:accountKey,value:brokerBalance});
  },[accountKey,brokerBalance,live.accountId]);
  const balanceChange=brokerBalance!==null&&balanceBase?.key===accountKey
    ?brokerBalance-balanceBase.value:null;
  const moneyText=(v:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
  const freshness=remote.heartbeatAt?Date.now()-new Date(remote.heartbeatAt).getTime():Infinity;
  const ready=remote.online===true&&freshness<15000&&
    ['iq_option','exnova'].includes(provider)&&['demo','real'].includes(mode)&&
    !!remote.deviceId&&!!live.accountId&&live.activeId!=null&&!!asset&&
    !!expiry&&!!live.assetValidated&&!!live.candleAssetMatch&&
    !!live.executionUi?.buy&&!!live.executionUi?.sell&&!!live.executionUi?.amount&&
    live.executionUi?.assetMatch===true&&
    Number.isFinite(money)&&money>0&&money<=1000000&&Math.abs(Math.round(money*100)-money*100)<1e-7;
  async function order(side:Direction){
    if(sending||!ready)return;
    const context={provider,mode,accountId:n(live.accountId),activeId:n(live.activeId),asset,expirationRaw:expiry};
    const brokerName=provider==='iq_option'?'IQ Option':'Exnova';
    const confirmed=window.confirm(
      'CONFIRMAR OPERAÇÃO MANUAL\n\n'+
      'Corretora: '+brokerName+'\nConta: '+(mode==='real'?'REAL — envolve dinheiro':'DEMO')+
      '\nAtivo: '+asset+'\nDireção: '+side+'\nValor: '+money.toFixed(2)+
      '\nVencimento mostrado pela corretora: '+expiry+
      '\n\nEssa confirmação autoriza UM ÚNICO clique na corretora aberta no PC. Continuar?'
    );
    if(!confirmed)return;
    const issuedAt=Date.now();
    const payload={
      confirmed:true,requestId:crypto.randomUUID(),deviceId:String(remote.deviceId),
      side,amount:money,issuedAt,expiresAt:issuedAt+9000,context
    };
    setSending(true);setMessage('Aguardando confirmação do Agent. Não repita o comando.');
    try{
      const response=await fetch('/api/runtime/brokers/'+provider+'/manual-order',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(payload),cache:'no-store'
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok||json.ok!==true)throw new Error(String(json.error||'manual_order_failed'));
      const status=String(json.command?.result?.manualOrder||'');
      setMessage(status==='click_dispatched_broker_confirmation_pending'
        ?'Clique '+side+' enviado uma vez. Confira na própria corretora se a ordem foi aceita.'
        :'Comando confirmado pelo Agent. Verifique a corretora antes de qualquer nova ordem.');
    }catch(error){
      const e=String((error as Error)?.message||error);
      setMessage(e==='manual_result_unknown_verify_broker'
        ?'RESULTADO INCERTO: confira o histórico da corretora antes de tentar novamente.'
        :'Ordem não confirmada ('+e+'). Confira a corretora antes de repetir.');
    }finally{setSending(false)}
  }
  const reason=!remote.online||freshness>=15000?'Agent offline ou comunicação desatualizada':!['demo','real'].includes(mode)?'Conta da corretora não confirmada':!asset||!live.assetValidated||!live.candleAssetMatch?'Ativo ainda não validado':!expiry?'Vencimento da corretora não detectado no PC':!live.executionUi?.buy||!live.executionUi?.sell||!live.executionUi?.amount||live.executionUi?.assetMatch!==true?'Controles da corretora ainda não reconhecidos':!Number.isFinite(money)||money<=0||money>1000000?'Informe um valor válido':'Aguardando confirmação do PC';
  return <section className="card span12 manualRemoteCard" aria-label="Operação manual pelo celular">
    <div className="manualRemoteHead">
      <div><small>OPERAÇÃO MANUAL</small><h3>CALL / PUT</h3></div>
      <strong className={mode==='real'?'manualModeReal':'manualModeDemo'}>{mode==='real'?'CONTA REAL':mode==='demo'?'CONTA DEMO':'CONTA NÃO VALIDADA'}</strong>
    </div>
    <div className="manualRemoteMeta">
      <span><small>Ativo</small><b>{asset||'—'}</b></span>
      <span><small>Expiração</small><b>{expiry||'Não detectada'}</b></span>
    </div>
    <div className="manualBalanceRow">
      <div><small>Saldo atual da corretora</small><b>{brokerBalance===null?'Aguardando saldo':moneyText(brokerBalance)}</b></div>
      <div><small>Variação desde que abriu a tela</small>
        <b className={balanceChange===null?'':balanceChange>0?'manualBalanceUp':balanceChange<0?'manualBalanceDown':''}>
          {balanceChange===null?'—':(balanceChange>0?'+':'')+moneyText(balanceChange)}
        </b></div>
    </div>
    <div className="manualTradeRow">
      <label className="manualStake"><small>Valor</small><input aria-label="Valor da ordem manual" type="text" inputMode="decimal" value={amount}
        onChange={e=>setAmount(e.target.value)} disabled={sending}/></label>
      <button type="button" className="manualCall" disabled={!ready||sending} onClick={()=>order('CALL')}>CALL <span>↑</span></button>
      <button type="button" className="manualPut" disabled={!ready||sending} onClick={()=>order('PUT')}>PUT <span>↓</span></button>
    </div>
    {!ready&&<p className="manualBlockReason" role="status">{reason}. Os botões ficam bloqueados até a confirmação do Agent.</p>}
    {message&&<p className="manualBlockReason" role="status">{message}</p>}
  </section>;
}
