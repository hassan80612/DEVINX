'use client';
import {useEffect,useRef,useState} from 'react';
import {useSentinelLocale} from './SentinelLocale';

const fields=[['amount','Valor por clique (igual à corretora)','0.01'],['stopLoss','Perda máxima na sessão (moeda da conta)','0.01'],['martingaleLevels','Níveis de martingale (0 = desligado)','1'],['martingaleMultiplier','Multiplicador de cliques (2 ou 3)','1'],['martingaleEnabled','Ativar martingale','1'],['maxConsecutiveLosses','Máximo de sequências perdedoras (0 = sem limite)','1']] as const;
export function BotControl({s,act,online}:{s:any,act:(path:string,body?:any)=>Promise<any>,online:boolean}){
 const {t}=useSentinelLocale();
 const bot=s?.autoExecutor;
 const current=Number(bot?.capabilities?.brokerExecution)>=4;
 const tripleReady=Number(bot?.capabilities?.brokerExecution)>=5;
 const [draft,setDraft]=useState<Record<string,string>>({});
 const dirty=useRef(new Set<string>());
 const [pending,setPending]=useState('');
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const generation=useRef(0);
 const configKey=JSON.stringify(bot?.config||{});
 useEffect(()=>{
  const config=JSON.parse(configKey);
  setDraft(old=>Object.fromEntries(fields.map(([key])=>[key,dirty.current.has(key)?old[key]??'':String(key==='martingaleEnabled'?config[key]?1:0:config[key]??0)])));
 },[configKey]);
 const run=async(action:string)=>{
  if(lock.current&&action!=='stop')return;const request=++generation.current;lock.current=true;setPending(action);setMessage('');
  try{
   if(action!=='stop'){
    const patch:Record<string,number|boolean>={};
    for(const [key] of fields)if(dirty.current.has(key)){
     const n=Number(draft[key]);if(draft[key]===''||!Number.isFinite(n)||n<0||
      key==='martingaleLevels'&&(!Number.isInteger(n)||n>3)||
      key==='martingaleMultiplier'&&(!Number.isInteger(n)||![2,3].includes(n))||
      key==='maxConsecutiveLosses'&&(!Number.isInteger(n)||n>50)){
      setMessage(t('Martingale: máximo de 3 níveis.'));return;
     }
     patch[key]=key==='martingaleEnabled'?n===1:n;
    }
    if(Object.keys(patch).length){if(!await act('executor/config',{patch}))return;dirty.current.clear();}
   }
   if(request!==generation.current)return;
   if(action==='start'){const result=await act('executor/start',{context:{provider:bot.provider,asset:s.liveBroker?.symbol||s.settings?.asset,durationMs:Number(s.settings?.orderDurationMs)}});if(result===false||result===null)setMessage(t('Não foi possível ligar o bot. Confira o aviso do Agent no PC.'));}
   else if(action==='stop')await act('executor/stop');
   else setMessage(t('Configuração do bot aplicada'));
  }catch(error){
   if(request===generation.current)setMessage(error instanceof Error?error.message:String(error||t('Não foi possível ligar o bot.')));
  }finally{if(request===generation.current){setPending('');lock.current=false;}}
 };
 return <section className="card botControl" aria-label={t('Bot automático')}>
  <div className="split"><h3>{t('Bot automático')} · <a href="/como-usar-bot" style={{fontSize:13,textDecoration:"underline"}}>{t('Como usar')}</a></h3><b aria-live="polite">{!bot?'—':bot.arming?t('Ativando…'):bot.enabled?'ON':'OFF'}</b></div>
  {!bot?<p className="muted">{t('Atualize o Agent no PC para controlar o bot pelo celular.')}</p>:<>
   <p className="muted">{bot.provider==='iq_option'?'IQ Option':bot.provider==='exnova'?'Exnova':'—'} · {s.liveBroker?.symbol||s.settings?.asset} · {Number(s.settings?.orderDurationMs||0)/1000}s</p>
   {!current&&<p role="status">{t('Atualize o Agent no PC para usar martingale por cliques.')}</p>}
   {!tripleReady&&current&&<p role="status">{t('Atualize o Agent para configurar martingale triplo; esta versão aceita apenas o multiplicador anterior.')}</p>}
   <div className="botControlFields">{fields.map(([key,label,step])=><label key={key}>{t(label)}<input aria-label={t(label)} type={key==='martingaleEnabled'?'checkbox':'number'} checked={key==='martingaleEnabled'?draft[key]==='1':undefined} max={key==='martingaleLevels'?3:key==='martingaleMultiplier'?3:key==='maxConsecutiveLosses'?50:undefined} min={key==='martingaleMultiplier'?2:0} step={step} inputMode="decimal" value={draft[key]??''} disabled={!!pending||bot.arming||!current||(key==='martingaleMultiplier'&&!tripleReady)} onChange={e=>{dirty.current.add(key);setDraft(v=>({...v,[key]:key==='martingaleEnabled'?(e.target.checked?'1':'0'):e.target.value}));setMessage('');}}/></label>)}</div>
   <p className="muted">{t('0 = sem limite')} · {t('Limite de perda na moeda da conta.')}</p>
   {bot.brokerBalance&&(!(Number(bot.config?.stopLoss)>0)||Number(bot.config.stopLoss)>=Number(bot.brokerBalance.amount))&&<p role="status">{t('Atenção: o limite de perda não protege esta banca contra perdas elevadas.')}</p>}
   <p className="muted">{t('Sequências perdedoras confirmadas')}: {Number(bot.consecutiveLossBatches||0)} · {t('O limite por sequência é opcional e só conta resultados confirmados pela corretora.')}</p>
   <p className="muted">{t('Próxima entrada')}: {Number(bot.nextClicks??1)} {t('clique(s)')} × {Number(bot.config?.amount??0).toFixed(2)} · {t('Limite de perda restante')}: {bot.lossLimitRemaining==null?'—':Number(bot.lossLimitRemaining).toFixed(2)}</p>
   <small className="muted">{t('Progressão de cliques definida pelo multiplicador: 2× = 1→2→4→8 ou 3× = 1→3→9→27. Sinais ignorados não alteram o nível; somente a sequência encerrada pela corretora.')}</small>
   <div className="botControlActions">
    <button className="primary" disabled={!online||!current||!!pending||bot.arming||bot.enabled||s.state!=='running'} onClick={()=>void run('start')}>{pending==='start'?t('Ativando…'):t('Ligar bot')}</button>
    <button className="kill" disabled={!online||pending==='stop'} onClick={()=>void run('stop')}>{pending==='stop'?t('Parando…'):t('Parar bot')}</button>
    <button className="secondary" disabled={!online||!!pending||bot.arming||!current} onClick={()=>void run('save')}>{t('Salvar limites')}</button>
   </div>
   <p role="status">{message||t(bot.message||'Desligado')}{bot.pending?' · '+bot.pending.side+' · '+t('Entrada em andamento'):''}</p>
   <p className="muted">{t(bot.brokerBalance?'Saldo recebido':'Saldo indisponível')}: {bot.brokerBalance?Number(bot.brokerBalance.amount).toFixed(2):'—'} · {t('Resultado da sessão')}: {Number(bot.riskNetPnl||0).toFixed(2)}</p>
   <small className="muted">{t('Ajuste manualmente valor e duração na corretora. O bot só clica CALL/PUT. Cada clique abre uma operação com o mesmo valor. Parar zera a sessão do bot e impede novos cliques, mas não cancela ordens que a corretora já abriu.')}</small>
   {!online&&<p role="status">{t('Agent do PC offline. Abra o Agent para enviar comandos.')}</p>}
  </>}
 </section>;
}

