'use client';
import {useEffect,useRef,useState} from 'react';
import {useSentinelLocale} from './SentinelLocale';

const fields=[['amount','Valor por entrada','0.01'],['intervalMs','Intervalo entre entradas (segundos)','1'],['stopAfterMinutes','Parar em (min)','1'],['stopLoss','Perda máxima na sessão (moeda da conta)','0.01'],['martingaleLevels','Níveis de martingale (0 = desligado)','1'],['martingaleEnabled','Ativar martingale','1']] as const;
export function BotControl({s,act,online}:{s:any,act:(path:string,body?:any)=>Promise<any>,online:boolean}){
 const {t}=useSentinelLocale();
 const bot=s?.autoExecutor;
 const current=Number(bot?.capabilities?.brokerExecution)>=2;
 const [draft,setDraft]=useState<Record<string,string>>({});
 const dirty=useRef(new Set<string>());
 const [pending,setPending]=useState('');
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const generation=useRef(0);
 const configKey=JSON.stringify(bot?.config||{});
 useEffect(()=>{
  const config=JSON.parse(configKey);
  setDraft(old=>Object.fromEntries(fields.map(([key])=>[key,dirty.current.has(key)?old[key]??'':String(key==='martingaleEnabled'?config[key]?1:0:key==='intervalMs'?Number(config[key]||30000)/1000:config[key]??0)])));
 },[configKey]);
 const run=async(action:string)=>{
  if(lock.current&&action!=='stop')return;const request=++generation.current;lock.current=true;setPending(action);setMessage('');
  try{
   if(action!=='stop'){
    const patch:Record<string,number|boolean>={};
    for(const [key] of fields)if(dirty.current.has(key)){
     const n=Number(draft[key]);if(draft[key]===''||!Number.isFinite(n)||n<0){setMessage(t('Preencha os valores do bot.'));return;}
     patch[key]=key==='martingaleEnabled'?n===1:key==='intervalMs'?n*1000:n;
    }
    if(Object.keys(patch).length){if(!await act('executor/config',{patch}))return;dirty.current.clear();}
   }
   if(request!==generation.current)return;
   if(action==='start')await act('executor/start',{context:{provider:bot.provider,asset:s.liveBroker?.symbol||s.settings?.asset,durationMs:Number(s.settings?.orderDurationMs)}});
   else if(action==='stop')await act('executor/stop');
   else setMessage(t('Configuração do bot aplicada'));
  }finally{if(request===generation.current){setPending('');lock.current=false;}}
 };
 return <section className="card botControl" aria-label={t('Bot automático')}>
  <div className="split"><h3>{t('Bot automático')}</h3><b aria-live="polite">{!bot?'—':bot.arming?t('Ativando…'):bot.enabled?'ON':'OFF'}</b></div>
  {!bot?<p className="muted">{t('Atualize o Agent no PC para controlar o bot pelo celular.')}</p>:<>
   <p className="muted">{bot.provider==='iq_option'?'IQ Option':bot.provider==='exnova'?'Exnova':'—'} · {s.liveBroker?.symbol||s.settings?.asset} · {Number(s.settings?.orderDurationMs||0)/1000}s</p>
   {!current&&<p role="status">{t('Atualize o Agent no PC para usar expiração automática e martingale.')}</p>}
   <div className="botControlFields">{fields.map(([key,label,step])=><label key={key}>{t(label)}<input aria-label={t(label)} type={key==='martingaleEnabled'?'checkbox':'number'} checked={key==='martingaleEnabled'?draft[key]==='1':undefined} min="0" step={step} inputMode="decimal" value={draft[key]??''} disabled={!!pending||bot.arming||!current} onChange={e=>{dirty.current.add(key);setDraft(v=>({...v,[key]:key==='martingaleEnabled'?(e.target.checked?'1':'0'):e.target.value}));setMessage('');}}/></label>)}</div>
   <p className="muted">{t('0 = sem limite')} · {t('O tempo conta desde o início da sessão. Limite de perda na moeda da conta.')}</p>
   <p className="muted">{t('Próxima entrada')}: {Number(bot.nextAmount??bot.config?.amount??0).toFixed(2)} · {t('Limite de perda restante')}: {bot.lossLimitRemaining==null?'—':Number(bot.lossLimitRemaining).toFixed(2)}</p>
   <small className="muted">{t('Valor dobra após perda confirmada. Ganho ou último nível concluído volta ao valor base. Empate mantém o nível.')}</small>
   <div className="botControlActions">
    <button className="primary" disabled={!online||!current||!!pending||bot.arming||bot.enabled||!!bot.pending||bot.executing||s.state!=='running'} onClick={()=>void run('start')}>{pending==='start'?t('Ativando…'):t('Ligar bot')}</button>
    <button className="kill" disabled={!online||pending==='stop'} onClick={()=>void run('stop')}>{pending==='stop'?t('Parando…'):t('Parar bot')}</button>
    <button className="secondary" disabled={!online||!!pending||bot.arming||!current} onClick={()=>void run('save')}>{t('Salvar limites')}</button>
   </div>
   <p role="status">{message||t(bot.message||'Desligado')}{bot.pending?' · '+bot.pending.side+' · '+t('Entrada em andamento'):''}</p>
   <p className="muted">{t(bot.brokerBalance?'Saldo recebido':'Saldo indisponível')}: {bot.brokerBalance?Number(bot.brokerBalance.amount).toFixed(2):'—'} · {t('Resultado da sessão')}: {Number(bot.riskNetPnl||0).toFixed(2)}</p>
   <small className="muted">{t('O bot aplica valor e expiração do analista na corretora. Martingale aumenta o valor, não a assertividade, e não garante recuperar perdas. Parar impede novas entradas.')}</small>
   {!online&&<p role="status">{t('Agent do PC offline. Abra o Agent para enviar comandos.')}</p>}
  </>}
 </section>;
}

