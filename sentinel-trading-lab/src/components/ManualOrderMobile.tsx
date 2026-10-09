'use client';
import {useEffect,useState} from 'react';

type Direction='CALL'|'PUT';
type EntryReference={asset:string;mode:string;side:Direction;price:number;at:number;clickedAt:number;result:'aguardando'|'enviado'|'incerto'};
const finite=(v:unknown):number|null=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const formatPrice=(value:number|null)=>value===null?'—':value.toLocaleString('en-US',{minimumFractionDigits:value>=100?2:value>=10?4:value>=1?5:6,maximumFractionDigits:value>=100?3:value>=10?5:value>=1?6:7});
const n=(v:unknown)=>String(v??'').trim();
const numeric=(v:string)=>Number(v.replace(',','.'));

export default function ManualOrderMobile({s,act}:{s:any,act:(path:string,body?:any)=>Promise<any>}){
  const [amount,setAmount]=useState('2');
  const [sending,setSending]=useState(false);
  const [switching,setSwitching]=useState(false);
  const [checkingControls,setCheckingControls]=useState(false);
  const [switchMessage,setSwitchMessage]=useState('');
  const [message,setMessage]=useState('');
  const [entryReference,setEntryReference]=useState<EntryReference|null>(null);
  const live=s?.liveBroker||{};
  const remote=s?.remote||{};
  const provider=n(s?.activeProvider);
  const mode=n(live.mode).toLowerCase();
  const asset=n(live.uiSymbol||live.symbol);
  const expirySeconds=Math.round(Number(s?.settings?.orderDurationMs||60000)/1000);
  const expiryAllowed=[30,60,120,300,600,900].includes(expirySeconds);
  const expiryLabel=expirySeconds<60?expirySeconds+'s':expirySeconds/60+' min';
  const expiry=n(live.expirationRaw);
  const money=numeric(amount);
  // Display existing remote snapshot only. Never subscribe, poll or store ticks.
  const data=s?.lastResult?.analysis||{};
  const operational=data.operationalSignal||{};
  const alert=operational.subanalyst?.alert||null;
  const quoteAt=Number(live.lastQuoteAt||s?.feed?.quoteTs||0);
  const quoteAge=quoteAt>0?Date.now()-quoteAt:Infinity;
  const quoteFresh=remote.online===true&&quoteAge>=-2000&&quoteAge<=8000&&
    live.assetValidated===true&&live.candleAssetMatch===true;
  const quote=quoteFresh?finite(live.quote??s?.feed?.price):null;
  const priceSamples=Array.isArray(live.quoteHistory)?live.quoteHistory:[];
  const previousSample=priceSamples.slice(0,-1).reverse().find((row:any)=>{
    const p=finite(row?.price);
    return quote!==null&&p!==null&&p!==quote&&Number(row?.ts||0)>quoteAt-12000;
  });
  const previousQuote=finite(previousSample?.price);
  const direction=quote===null||previousQuote===null?'':quote>previousQuote?'up':quote<previousQuote?'down':'';
  const analysisAsset=String(s?.lastResult?.asset||data.asset||'').toUpperCase().replace(/\s+/g,'');
  const assetMatches=analysisAsset===asset.toUpperCase().replace(/\s+/g,'');
  const signalFresh=quoteFresh&&assetMatches&&Number(s?.lastEvalMs||0)>Date.now()-10000;
  const trigger=signalFresh?finite(operational.trigger):null;
  const reversalTrigger=signalFresh&&alert?.active!==false?finite(alert?.trigger):null;
  const entryAt=signalFresh?finite(operational.entryAt):null;
  const displayEntry=entryReference?.asset===asset&&entryReference?.mode===mode?entryReference:null;
  const priceMovement=displayEntry&&quote!==null?quote-displayEntry.price:null;
  const priceDelta=priceMovement===null?'—':(priceMovement>0?'+':priceMovement<0?'−':'')+formatPrice(Math.abs(priceMovement));
  const priceMoveDirection=priceMovement===null?'':priceMovement>0?'up':priceMovement<0?'down':'flat';
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
  const ready=!switching&&remote.online===true&&freshness<15000&&
    ['iq_option','exnova'].includes(provider)&&['demo','real'].includes(mode)&&
    !!remote.deviceId&&!!live.accountId&&live.activeId!=null&&!!asset&&
    expiryAllowed&&!!live.assetValidated&&!!live.candleAssetMatch&&
    !!live.executionUi?.buy&&!!live.executionUi?.sell&&!!live.executionUi?.amount&&
    live.executionUi?.assetMatch===true&&
    Number.isFinite(money)&&money>0&&money<=1000000&&Math.abs(Math.round(money*100)-money*100)<1e-7;
  async function switchAccount(target:'demo'|'real'){
    if(switching||sending||!remote.online||!['iq_option','exnova'].includes(provider)||mode===target)return;
    const question=target==='real'
      ?'Trocar para CONTA REAL na corretora do PC? Operações nessa conta usam dinheiro real. O Sentinel não fará operações automaticamente.'
      :'Trocar para CONTA DEMO na corretora do PC?';
    if(!window.confirm(question))return;
    setSwitching(true);setSwitchMessage('Solicitando troca na corretora. Aguarde confirmação da conta.');
    try{
      const ok=await act('mode',{mode:target,provider,brokerSwitch:true});
      setSwitchMessage(ok?'Conta alterada no PC. Confira o saldo e o tipo de conta antes de operar.':'Troca não confirmada: confira o seletor de contas na corretora do PC.');
    }catch{setSwitchMessage('Troca não confirmada no PC. Não opere até verificar a conta.')}
    finally{setSwitching(false)}
  }
  async function order(side:Direction){
    if(sending||!ready)return;
    // Freeze the last verified PC quote at the instant of the user's tap.
    const pressedAt=Date.now();
    const observedQuote=quote!==null&&pressedAt-quoteAt>=-2000&&pressedAt-quoteAt<=8000?quote:null;
    const context={provider,mode,accountId:n(live.accountId),activeId:n(live.activeId),asset,expirationMode:'manual-confirmed',expirationSeconds:expirySeconds,manualBrokerExpiryConfirmed:true};
    const brokerName=provider==='iq_option'?'IQ Option':'Exnova';
    const confirmed=window.confirm(
      'CONFIRMAR OPERAÇÃO MANUAL\n\n'+
      'Corretora: '+brokerName+'\nConta: '+(mode==='real'?'REAL — envolve dinheiro':'DEMO')+
      '\nAtivo: '+asset+'\nDireção: '+side+'\nValor: '+money.toFixed(2)+
      '\nExpiração escolhida manualmente: '+expiryLabel+' (confirme que corresponde à corretora no PC)'+
      '\n\nEssa confirmação autoriza UM ÚNICO clique na corretora aberta no PC. Continuar?'
    );
    if(!confirmed)return;
    const reference=observedQuote===null?null:{asset,mode,side,price:observedQuote,at:quoteAt,clickedAt:pressedAt,result:'aguardando' as const};
    if(reference)setEntryReference(reference);
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
      const verifiedAmount=finite(json.command?.result?.verifiedAmount);
      const amountNote=verifiedAmount===null?'':' Valor conferido no campo da corretora: '+verifiedAmount.toFixed(2)+'.';
      if(reference)setEntryReference({...reference,result:'enviado'});
      setMessage(status==='click_dispatched_broker_confirmation_pending'
        ?'Clique '+side+' enviado uma vez.'+amountNote+' Confira na própria corretora se a ordem foi aceita.'
        :'Comando confirmado pelo Agent. Verifique a corretora antes de qualquer nova ordem.');
    }catch(error){
      if(reference)setEntryReference({...reference,result:'incerto'});
      const e=String((error as Error)?.message||error);
      setMessage(e==='manual_result_unknown_verify_broker'
        ?'RESULTADO INCERTO: confira o histórico da corretora antes de tentar novamente.'
        :'Ordem não confirmada ('+e+'). Confira a corretora antes de repetir.');
    }finally{setSending(false)}
  }
  const controls=live.executionUi||{};
  async function refreshControls(){
    if(checkingControls||!remote.online||!['iq_option','exnova'].includes(provider))return;
    setCheckingControls(true);
    setMessage('Verificando CALL, PUT e campo de valor na corretora do PC…');
    try{
      const ok=await act('brokers/'+provider+'/scan-controls');
      setMessage(ok?'Leitura dos controles atualizada no PC.':'Falha na verificação. Confira a janela da corretora no PC.');
    }catch{setMessage('Não foi possível verificar os controles no PC.')}
    finally{setCheckingControls(false)}
  }
  const missingControls=[!controls.buy&&'CALL',!controls.sell&&'PUT',!controls.amount&&'Valor',controls.assetMatch!==true&&'Ativo'].filter(Boolean);
  const reason=!remote.online||freshness>=15000?'Agent offline ou comunicação desatualizada':!['demo','real'].includes(mode)?'Conta da corretora não confirmada':!asset||!live.assetValidated||!live.candleAssetMatch?'Ativo ainda não validado':!expiryAllowed?'Escolha uma expiração válida em Ajustar cenário':missingControls.length?'O Agent não reconheceu: '+missingControls.join(', '):!Number.isFinite(money)||money<=0||money>1000000?'Informe um valor válido':'Aguardando confirmação do PC';
  return <section className="card span12 manualRemoteCard" aria-label="Operação manual pelo celular">
    <div className="manualRemoteHead">
      <div><small>OPERAÇÃO MANUAL</small><h3>CALL / PUT</h3></div>
      <strong className={mode==='real'?'manualModeReal':'manualModeDemo'}>{mode==='real'?'CONTA REAL':mode==='demo'?'CONTA DEMO':'CONTA NÃO VALIDADA'}</strong>
    </div>
    <div className="manualAccountSwitch" aria-label="Selecionar conta na corretora">
      <button type="button" className={mode==='demo'?'selected':''} disabled={switching||sending||!remote.online||mode==='demo'} onClick={()=>switchAccount('demo')}>DEMO</button>
      <button type="button" className={mode==='real'?'selected real':''} disabled={switching||sending||!remote.online||mode==='real'} onClick={()=>switchAccount('real')}>REAL</button>
      <small>Conta confirmada pela corretora: {mode==='real'?'REAL':mode==='demo'?'DEMO':'não verificada'}</small>
    </div>
    {switchMessage&&<p className="manualBlockReason" role="status">{switchMessage}</p>}
    <div className="manualRemoteMeta">
      <span><small>Ativo</small><b>{asset||'—'}</b></span>
      <span><small>Expiração manual</small><b>{expiryLabel} · não verificada no PC</b></span>
    </div>
    <div className="manualPricePanel" aria-label="Cotação e gatilho em tempo real">
      <div className="manualPriceCurrent">
        <small>COTAÇÃO {quote===null?'· AGUARDANDO DADO ATUAL':'· '+Math.max(0,Math.floor(quoteAge/1000))+'s ATRÁS'}</small>
        <div className="manualPriceValue"><b>{formatPrice(quote)}</b>
          <strong className={direction==='up'?'manualPriceUp':direction==='down'?'manualPriceDown':''}>
            {direction==='up'?'▲ SUBINDO':direction==='down'?'▼ DESCENDO':'— SEM MOVIMENTO CONFIRMADO'}
          </strong></div>
      </div>
      <div className="manualPriceMarkers">
        <span><small>Gatilho cenário</small><b>{formatPrice(trigger)}</b></span>
        <span><small>Gatilho reversão</small><b>{formatPrice(reversalTrigger)}</b></span>
      </div>
      {displayEntry&&<div className="manualEntryReference">
        <small>PREÇO CONGELADO · {displayEntry.side} · toque às {new Date(displayEntry.clickedAt).toLocaleTimeString('pt-BR')}</small>
        <b>{formatPrice(displayEntry.price)}</b>
        <div className="manualEntryDelta">
          <span><small>Agora</small><b>{formatPrice(quote)}</b></span>
          <span><small>Variação desde o toque</small><b className={priceMoveDirection==='up'?'manualPriceUp':priceMoveDirection==='down'?'manualPriceDown':''}>{priceMoveDirection==='up'?'▲ ':priceMoveDirection==='down'?'▼ ':''}{priceDelta}</b></span>
        </div>
        <small>Referência: última cotação recebida do PC às {new Date(displayEntry.at).toLocaleTimeString('pt-BR')}. Não é preço executado confirmado.</small>
        <small>{displayEntry.result==='enviado'?'Clique enviado pelo Agent; confira o registro da ordem na corretora.':displayEntry.result==='incerto'?'Resultado incerto: confira a corretora antes de repetir.':'Aguardando resposta do Agent.'}</small>
      </div>}
      {entryAt!==null&&<small className="manualSignalTime">Gatilho temporal do cenário: {new Date(entryAt).toLocaleTimeString('pt-BR')}</small>}
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
    {!ready&&<p className="manualBlockReason" role="status">{reason}. Verifique a tela de operação da corretora no PC.</p>}
    {!ready&&remote.online&&<div className="manualControlDiagnostics"><p className="manualControlStatus" aria-label="Diagnóstico dos controles">CALL: {controls.buy?'detectado':'não detectado'} · PUT: {controls.sell?'detectado':'não detectado'} · Valor: {controls.amount?'detectado':'não detectado'}</p><button type="button" className="secondary" disabled={checkingControls||sending||switching} onClick={refreshControls}>{checkingControls?'Verificando no PC…':'Verificar controles no PC'}</button></div>}
    {message&&<p className="manualBlockReason" role="status">{message}</p>}
  </section>;
}
