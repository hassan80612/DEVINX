'use client';
import {useState} from 'react';

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
  return <section className="card span12 manualRemoteCard" style={{padding:18,marginBottom:14}}>
    <div className="split">
      <div><div className="eyebrow">OPERAÇÃO MANUAL PELO CELULAR</div><h3>CALL / PUT com confirmação</h3>
        <p className="muted">Seu PC executa apenas o clique que você confirmar. A expiração é a da própria corretora, nunca o prazo de previsão do Sentinel.</p>
      </div>
      <strong>{mode==='real'?'CONTA REAL':mode==='demo'?'CONTA DEMO':'CONTA NÃO VALIDADA'}</strong>
    </div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>
      <div><small>Corretora / ativo</small><div><b>{provider||'—'} · {asset||'—'}</b></div></div>
      <div><small>Vencimento da corretora</small><div><b>{expiry||'Não detectado'}</b></div></div>
    </div>
    <label style={{display:'block',maxWidth:200,marginBottom:12}}>
      <span>Valor da operação</span>
      <input aria-label="Valor da ordem manual" type="text" inputMode="decimal"
        value={amount} onChange={e=>setAmount(e.target.value)} disabled={sending}
        style={{width:'100%',padding:10}}/>
    </label>
    <div className="actions" style={{display:'flex',gap:10,flexWrap:'wrap'}}>
      <button type="button" className="primary" disabled={!ready||sending} onClick={()=>order('CALL')}>CALL / ACIMA</button>
      <button type="button" className="secondary" disabled={!ready||sending} onClick={()=>order('PUT')}>PUT / ABAIXO</button>
    </div>
    {!ready&&<p className="muted">Os botões ficam bloqueados até o Agent confirmar o PC online, a conta, o ativo, o vencimento e os controles da corretora.</p>}
    {message&&<p role="status" style={{fontWeight:700,marginTop:12}}>{message}</p>}
  </section>;
}
