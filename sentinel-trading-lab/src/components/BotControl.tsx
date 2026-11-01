'use client';
import {useEffect,useRef,useState} from 'react';
import {useSentinelLocale} from './SentinelLocale';

const fields=[['stopLoss','Stop Loss · saldo mínimo','0.01'],['stopWin','Stop Win · saldo-alvo','0.01'],['martingaleLevels','Níveis de martingale (0 = desligado)','1'],['martingaleMultiplier','Multiplicador de cliques (2 ou 3)','1'],['martingaleEnabled','Ativar martingale','1'],['maxConsecutiveLosses','Máximo de sequências perdedoras (0 = sem limite)','1']] as const;
export function BotControl({s,act,online}:{s:any,act:(path:string,body?:any)=>Promise<any>,online:boolean}){
 const {t}=useSentinelLocale();
 const bot=s?.autoExecutor;
 const available=bot?.availableBalance??bot?.brokerBalance?.amount??null;
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
 const mode=String(bot?.config?.directionMode||'automatic');
 const changeDirection=async(value:string)=>{
  if(!online||bot?.arming)return;
  try{await act('executor/config',{patch:{directionMode:value}});setMessage(t('Modo alterado'));}
  catch(error){setMessage(error instanceof Error?error.message:String(error));}
 };
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
   if(action==='resync'){
    const result=await act('executor/reset-account');
    if(request===generation.current&&result!==false&&result!==null)
     setMessage(t('Conta sincronizada. Confira DEMO/REAL e ligue o bot novamente.'));
   }
   else if(action==='start'){const result=await act('executor/start',{context:{provider:bot.provider,asset:s.liveBroker?.symbol||s.settings?.asset,durationMs:Number(s.settings?.orderDurationMs)}});if(result===false||result===null)setMessage(t('Não foi possível ligar o bot. Confira o aviso do Agent no PC.'));}
   else if(action==='stop')await act('executor/stop');
   else setMessage(t('Configuração do bot aplicada'));
  }catch(error){
   if(request===generation.current)setMessage(error instanceof Error?error.message:String(error||t('Não foi possível ligar o bot.')));
  }finally{if(request===generation.current){setPending('');lock.current=false;}}
 };
 return <section className="card botControl" aria-label={t('Bot automático')}>
  <div className="split"><h3><span className="botOrb" data-active={bot?.enabled||bot?.arming?'1':'0'} aria-hidden="true"><svg width="25" height="25" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 4v4M7 17H4m24 0h-3"/><rect x="7" y="8" width="18" height="17" rx="5"/><circle cx="12" cy="15" r="1.3"/><circle cx="20" cy="15" r="1.3"/><path d="M12 21h8"/></svg></span>{t('Bot automático')} · <a href="/como-usar-bot" style={{fontSize:13,textDecoration:"underline"}}>{t('Como usar')}</a></h3><b aria-live="polite">{!bot?'—':bot.arming?t('Ativando…'):bot.enabled?'ON':'OFF'}</b></div>
  {!bot?<p className="muted">{t('Atualize o Agent no PC para controlar o bot pelo celular.')}</p>:<>
   <p className="muted">{bot.provider==='iq_option'?'IQ Option':bot.provider==='exnova'?'Exnova':'—'} · {s.liveBroker?.symbol||s.settings?.asset} · {Number(s.settings?.orderDurationMs||0)/1000}s</p>
   {!current&&<p role="status">{t('Atualize o Agent no PC para usar martingale por cliques.')}</p>}
   {!tripleReady&&current&&<p role="status">{t('Atualize o Agent para configurar martingale triplo; esta versão aceita apenas o multiplicador anterior.')}</p>}
   <div className="botControlActions">
    <button className="primary" disabled={!online||!current||!!pending||bot.arming||bot.enabled||s.state!=='running'} onClick={()=>void run('start')}>{pending==='start'?t('Ativando…'):t('Ligar bot')}</button>
    <button className="kill" disabled={!online||pending==='stop'} onClick={()=>void run('stop')}>{pending==='stop'?t('Parando…'):t('Parar bot')}</button>
    <button className="secondary" disabled={!online||!!pending||bot.arming||!current||bot.executing||!!bot.pending} onClick={()=>void run('resync')}>{pending==='resync'?t('Sincronizando…'):t('Sincronizar conta')}</button>
    <button className="secondary" disabled={!online||!!pending||bot.arming||!current} onClick={()=>void run('save')}>{t('Salvar limites')}</button>
   </div>
   <div className="botSummary">
    <strong>{t('Saldo disponível')}: {available!=null?Number(available).toFixed(2):'—'}</strong>
    <b data-sentinel-executor-wl>WIN: {Number(bot.sessionWins??0)} / LOSS: {Number(bot.sessionLosses??0)}</b>
   </div>
   <p className="muted">{t('Resultado da sessão')}: {Number(bot.netPnl||0).toFixed(2)} · {t(available==null?'Stops aguardam saldo':Number(bot.config?.stopLoss)>0||Number(bot.config?.stopWin)>0?'Stops ativos':'Stops desativados')}</p>
   <details className="botSettings"><summary>{t('Configurações do bot')}</summary>
   <div className="botControlFields">
     <label>{t('Modo do bot')}<select aria-label={t('Modo do bot')} value={mode}
       disabled={!!pending||bot.arming||!current}
       onChange={e=>void changeDirection(e.target.value)}>
       <option value="automatic">{t('Automático')}</option>
       <option value="call">{t('Somente CALL')}</option>
       <option value="put">{t('Somente PUT')}</option>
     </select></label>
     {mode!=='automatic'&&<small className="muted">{t('Segue o tempo escolhido no analista.')}</small>}
   </div>
   <div className="botControlFields">{fields.map(([key,label,step])=><label key={key}>{t(label)}<input aria-label={t(label)} type={key==='martingaleEnabled'?'checkbox':'number'} checked={key==='martingaleEnabled'?draft[key]==='1':undefined} max={key==='martingaleLevels'?3:key==='martingaleMultiplier'?3:key==='maxConsecutiveLosses'?50:undefined} min={key==='martingaleMultiplier'?2:0} step={step} inputMode="decimal" value={draft[key]??''} disabled={!!pending||bot.arming||!current||(key==='martingaleMultiplier'&&!tripleReady)} onChange={e=>{dirty.current.add(key);setDraft(v=>({...v,[key]:key==='martingaleEnabled'?(e.target.checked?'1':'0'):e.target.value}));setMessage('');}}/></label>)}</div>
   <p className="muted">{t('0 desativa o stop. Informe o saldo em que o bot deve parar. Exemplo: banca 100, Stop Loss 50, Stop Win 150.')}</p>
   <p className="muted">{t('Sequências perdedoras confirmadas')}: {Number(bot.consecutiveLossBatches||0)} · {t('O limite por sequência é opcional e só conta resultados confirmados pela corretora.')}</p>
   <p className="muted">{t('Próxima entrada')}: {Number(bot.nextClicks??1)} {t('clique(s)')} × {Number(bot.config?.amount??0).toFixed(2)} · {t('Limite de perda restante')}: {bot.lossLimitRemaining==null?'—':Number(bot.lossLimitRemaining).toFixed(2)}</p>
   <small className="muted">{t('Progressão de cliques definida pelo multiplicador: 2× = 1→2→4→8 ou 3× = 1→3→9→27. Sinais ignorados não alteram o nível; somente a sequência encerrada pela corretora.')}</small>
   </details>
   <p role="status">{message||t(bot.message||'Desligado')}{bot.pending?' · '+bot.pending.side+' · '+t('Entrada em andamento'):''}</p>
   <small className="muted">{t('O valor por clique é lido diretamente da corretora ao iniciar e a cada entrada. Ajuste a duração na corretora conforme o analista. Parar impede novas entradas, mas não cancela ordens já abertas.')}</small>
   {!online&&<p role="status">{t('Agent do PC offline. Abra o Agent para enviar comandos.')}</p>}
  </>}
 </section>;
}

