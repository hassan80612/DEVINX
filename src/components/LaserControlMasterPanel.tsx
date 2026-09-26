'use client';

import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import styles from './LaserControlMasterPanel.module.css';

type Status={
  product:string;
  protocolVersion:number;
  remoteCommandsEnabled:boolean;
  storageConnected:boolean;
  pairingEnabled:boolean;
  reason:string;
};

type LaserDevice={
  device_id:string;
  owner_user_id:string;
  display_name:string;
  device_status:string;
  agent_version:string|null;
  adapter:string|null;
  last_seen_at:string|null;
  lightburn_online:boolean|null;
  machine_connected:boolean|null;
  machine_name:string|null;
  job_state:string|null;
  progress_permille:number|null;
  project_file:string|null;
  captured_at:string|null;
  remote_control_enabled:boolean;
  local_arm_until:string|null;
  paired_at:string|null;
};

export function LaserControlMasterPanel(){
  const[status,setStatus]=useState<Status|null>(null);
  const[error,setError]=useState(false);
  const[pairingCode,setPairingCode]=useState('');
  const[deviceName,setDeviceName]=useState('PC Oficina');
  const[pairingPending,setPairingPending]=useState(false);
  const[pairingNotice,setPairingNotice]=useState('');
  const[devices,setDevices]=useState<LaserDevice[]>([]);
  const[devicesPending,setDevicesPending]=useState(false);
  const[deviceActionId,setDeviceActionId]=useState<string|null>(null);
  const[selectedDeviceId,setSelectedDeviceId]=useState<string|null>(null);
  const[workspaceTab,setWorkspaceTab]=useState<'preview'|'control'>('preview');
  const[previewUrl,setPreviewUrl]=useState('');
  const[previewMessage,setPreviewMessage]=useState('Abra a visualização para solicitar a imagem.');
  const[previewCapturedAt,setPreviewCapturedAt]=useState<string|null>(null);
  const[previewWidth,setPreviewWidth]=useState<number|null>(null);
  const[previewHeight,setPreviewHeight]=useState<number|null>(null);
  const[previewPending,setPreviewPending]=useState(false);
  const[isFullscreen,setIsFullscreen]=useState(false);
  const[commandPending,setCommandPending]=useState<'frame'|'start'|'pause'|'stop'|null>(null);
  const[commandNotice,setCommandNotice]=useState('');
  const previewSurfaceRef=useRef<HTMLDivElement|null>(null);
  const previewBaseUrlRef=useRef('');
  const previewTimerRef=useRef<number|null>(null);

  const loadDevices=useCallback(async(quiet=false)=>{
    if(!quiet)setDevicesPending(true);
    try{
      const response=await fetch('/api/laser-control/master/devices',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok)throw new Error('devices');
      const list=Array.isArray(data?.devices)?data.devices as LaserDevice[]:[];
      setDevices(list);
      setSelectedDeviceId(current=>{
        if(current&&list.some(device=>device.device_id===current))return current;
        return list.find(device=>device.device_status==='active')?.device_id??list[0]?.device_id??null;
      });
    }catch{
      if(!quiet)setPairingNotice('Não foi possível carregar os PCs vinculados.');
    }finally{
      if(!quiet)setDevicesPending(false);
    }
  },[]);

  useEffect(()=>{
    let active=true;
    fetch('/api/laser-control/master/status',{cache:'no-store',credentials:'same-origin'})
      .then(async response=>{
        if(!response.ok)throw new Error('status');
        return response.json() as Promise<Status>;
      })
      .then(data=>{if(active)setStatus(data)})
      .catch(()=>{if(active)setError(true)});
    void loadDevices();
    const deviceTimer=window.setInterval(()=>void loadDevices(true),3_000);
    return()=>{
      active=false;
      window.clearInterval(deviceTimer);
    };
  },[loadDevices]);

  const selectedDevice=useMemo(
    ()=>devices.find(device=>device.device_id===selectedDeviceId)??null,
    [devices,selectedDeviceId]
  );

  const armed=useMemo(()=>{
    if(!selectedDevice?.remote_control_enabled||!selectedDevice.local_arm_until)return false;
    return Date.parse(selectedDevice.local_arm_until)>Date.now();
  },[selectedDevice]);

  const callPreviewApi=useCallback(async(payload:Record<string,unknown>)=>{
    const response=await fetch('/api/laser-control/master/preview',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      cache:'no-store'
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(String(data?.error||data?.reason||'preview')),{data});
    return data;
  },[]);

  const schedulePreviewFrame=useCallback((ms:number)=>{
    if(previewTimerRef.current!==null)window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current=window.setTimeout(()=>{
      const base=previewBaseUrlRef.current;
      if(!base)return;
      const separator=base.includes('?')?'&':'?';
      setPreviewUrl(base+separator+'frame='+Date.now());
    },ms);
  },[]);

  useEffect(()=>{
    const onFullscreen=()=>setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange',onFullscreen);
    return()=>document.removeEventListener('fullscreenchange',onFullscreen);
  },[]);

  useEffect(()=>{
    if(workspaceTab!=='preview'||!selectedDeviceId)return;

    let mounted=true;
    setPreviewPending(true);
    setPreviewUrl('');
    setPreviewCapturedAt(null);
    setPreviewMessage('Solicitando a janela do LightBurn ao Agent…');
    previewBaseUrlRef.current='';

    const keepSession=async()=>{
      try{
        const data=await callPreviewApi({action:'session',deviceId:selectedDeviceId,active:true});
        if(!mounted)return;
        if(data?.signedUrl){
          previewBaseUrlRef.current=String(data.signedUrl);
          schedulePreviewFrame(0);
        }
      }catch{
        if(mounted){
          setPreviewPending(false);
          setPreviewMessage('Não foi possível ativar a visualização.');
        }
      }
    };

    void keepSession();
    const sessionTimer=window.setInterval(()=>void keepSession(),20_000);

    return()=>{
      mounted=false;
      window.clearInterval(sessionTimer);
      if(previewTimerRef.current!==null){
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current=null;
      }
      previewBaseUrlRef.current='';
      void fetch('/api/laser-control/master/preview',{
        method:'POST',
        credentials:'same-origin',
        keepalive:true,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'session',deviceId:selectedDeviceId,active:false})
      }).catch(()=>undefined);
    };
  },[selectedDeviceId,workspaceTab,callPreviewApi,schedulePreviewFrame]);

  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await previewSurfaceRef.current?.requestFullscreen();
    }catch{
      setPreviewMessage('O navegador não permitiu tela cheia.');
    }
  }

  async function sendCommand(command:'frame'|'start'|'pause'|'stop'){
    if(!selectedDevice||commandPending)return;
    if(!armed){
      setCommandNotice('No PC, abra o ícone do DevinX Agent e escolha “Permitir controles remotos (5 min)”.');
      return;
    }

    if(command==='start'){
      const confirmed=window.confirm('Iniciar a gravação agora? Confirme somente com a máquina supervisionada e pronta.');
      if(!confirmed)return;
    }

    setCommandPending(command);
    setCommandNotice('Enviando comando…');

    try{
      const response=await fetch('/api/laser-control/master/command',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'send',
          deviceId:selectedDevice.device_id,
          command,
          idempotencyKey:crypto.randomUUID()
        }),
        cache:'no-store'
      });
      const data=await response.json();

      if(!response.ok){
        const messages:Record<string,string>={
          remote_control_not_armed:'Os controles não estão liberados no Agent.',
          machine_not_connected:'A máquina não está conectada.',
          machine_not_idle:'A máquina precisa estar parada para esse comando.',
          not_running:'Não há gravação em andamento para pausar.'
        };
        setCommandNotice(messages[String(data?.error)]||'O comando foi bloqueado.');
        return;
      }

      const commandId=String(data?.commandId||'');
      if(!commandId){
        setCommandNotice('O comando não recebeu confirmação do servidor.');
        return;
      }

      for(let attempt=0;attempt<28;attempt++){
        await new Promise(resolve=>window.setTimeout(resolve,250));
        const statusResponse=await fetch('/api/laser-control/master/command',{
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'status',commandId}),
          cache:'no-store'
        });
        const statusData=await statusResponse.json();
        if(!statusResponse.ok)continue;

        if(statusData?.status==='acknowledged'){
          setCommandNotice(
            command==='start'?'Iniciar executado pelo LightBurn.'
            :command==='pause'?'Pausar executado.'
            :command==='stop'?'Parar enviado ao LightBurn.'
            :'Frame seleção executado.'
          );
          await loadDevices(true);
          return;
        }

        if(statusData?.status==='rejected'||statusData?.status==='expired'){
          setCommandNotice('Comando não executado: '+String(statusData?.rejectionReason||statusData?.status));
          await loadDevices(true);
          return;
        }
      }

      setCommandNotice('O Agent recebeu o pedido, mas a confirmação demorou além do esperado.');
    }catch{
      setCommandNotice('Falha de comunicação ao enviar o comando.');
    }finally{
      setCommandPending(null);
    }
  }

  async function claimPairing(event:FormEvent){
    event.preventDefault();
    const code=pairingCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length!==8){
      setPairingNotice('Digite o código de 8 caracteres mostrado pelo Agent.');
      return;
    }

    setPairingPending(true);
    setPairingNotice('');
    try{
      const response=await fetch('/api/laser-control/master/claim',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pairingCode:code,displayName:deviceName.trim()||'PC Oficina'})
      });
      const data=await response.json();
      if(!response.ok||!data?.claimed){
        setPairingNotice(data?.reason==='not_found_or_expired'
          ?'Código não encontrado ou expirado. Gere outro no Agent.'
          :'Não foi possível vincular este PC.');
        return;
      }
      setPairingCode('');
      setPairingNotice('PC vinculado. Comandos remotos continuam desligados.');
      await loadDevices();
    }catch{
      setPairingNotice('Falha ao comunicar com o serviço de pareamento.');
    }finally{
      setPairingPending(false);
    }
  }

  async function changeDeviceAccess(device:LaserDevice){
    const action=device.device_status==='revoked'?'reactivate':'revoke';
    setDeviceActionId(device.device_id);
    setPairingNotice('');
    try{
      const response=await fetch('/api/laser-control/master/device-access',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({deviceId:device.device_id,action})
      });
      const data=await response.json();
      if(!response.ok||!data?.ok){
        setPairingNotice('Não foi possível alterar o acesso deste PC.');
        return;
      }
      setPairingNotice(action==='revoke'
        ?'PC revogado. O Agent perdeu autorização de telemetria e controle futuro.'
        :'PC reativado. Controle remoto continua desligado.');
      await loadDevices();
    }catch{
      setPairingNotice('Falha ao alterar o acesso do PC.');
    }finally{
      setDeviceActionId(null);
    }
  }

  const online=(device:LaserDevice)=>{
    if(!device.last_seen_at)return false;
    return Date.now()-Date.parse(device.last_seen_at)<15_000;
  };

  const canStart=Boolean(armed&&selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true
    &&selectedDevice.machine_connected===true
    &&selectedDevice.job_state==='idle');

  const canPause=Boolean(armed&&selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true
    &&selectedDevice.machine_connected===true
    &&['running','busy'].includes(selectedDevice.job_state||''));

  const canStop=Boolean(armed&&selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true
    &&selectedDevice.machine_connected===true);

  const canFrame=canStart;

  return <section className={styles.panel}>
    <div className={styles.head}>
      <div><small>ÁREA MASTER · DESENVOLVIMENTO</small><h2>Estado interno do Laser Control</h2></div>
      <span className={styles.safe}>SAFE MODE</span>
    </div>

    {error&&<div className={styles.warning}>Não foi possível carregar o diagnóstico interno.</div>}
    {!status&&!error&&<div className={styles.loading}>Carregando diagnóstico…</div>}

    {status&&<>
      <div className={styles.grid}>
        <article>
          <small>PROTOCOLO</small>
          <strong>v{status.protocolVersion}</strong>
          <span>Contrato Agent ↔ DevinX</span>
        </article>
        <article>
          <small>COMANDOS REMOTOS</small>
          <strong>{status.remoteCommandsEnabled?'ATIVOS':'DESLIGADOS'}</strong>
          <span>Trava global de execução</span>
        </article>
        <article>
          <small>BANCO LASER</small>
          <strong>{status.storageConnected?'ISOLADO E ATIVO':'NÃO APLICADO'}</strong>
          <span>Schema privado sem acesso direto do cliente</span>
        </article>
        <article>
          <small>PAREAMENTO</small>
          <strong>{status.pairingEnabled?'MASTER ATIVO':'DESLIGADO'}</strong>
          <span>Código assinado, único e válido por 5 minutos</span>
        </article>
      </div>

      <div className={styles.pairNotice}>
        <b>Conexão simples</b><br/>
        No PC, abra o novo DevinX Laser Agent com dois cliques. Ele abre a confirmação no navegador sozinho.
      </div>

      <details>
      <summary>Modo manual de suporte</summary>
      <form className={styles.pairForm} onSubmit={claimPairing}>
        <div>
          <small>VINCULAR MANUALMENTE</small>
          <b>Use somente se a abertura automática falhar</b>
          <span>O código manual fica como fallback técnico.</span>
        </div>
        <label>
          <span>Nome do PC</span>
          <input value={deviceName} onChange={event=>setDeviceName(event.target.value)} maxLength={80}/>
        </label>
        <label>
          <span>Código</span>
          <input
            value={pairingCode}
            onChange={event=>setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            placeholder="ABCD2345"
          />
        </label>
        <button type="submit" disabled={pairingPending}>{pairingPending?'Vinculando…':'Vincular PC'}</button>
      </form>
      </details>
      {pairingNotice&&<div className={styles.pairNotice}>{pairingNotice}</div>}

      <div className={styles.devicesHead}>
        <div><small>PCS VINCULADOS</small><b>{devices.length} dispositivo{devices.length===1?'':'s'}</b></div>
        <button type="button" onClick={()=>void loadDevices()} disabled={devicesPending}>{devicesPending?'Atualizando…':'Atualizar'}</button>
      </div>

      <div className={styles.devices}>
        {devices.length===0&&<div className={styles.emptyDevice}>Nenhum PC vinculado ainda.</div>}
        {devices.map(device=><article className={[styles.deviceCard,selectedDeviceId===device.device_id?styles.selectedDevice:''].filter(Boolean).join(' ')} key={device.device_id}>
          <div className={styles.deviceTop}>
            <div>
              <span className={online(device)?styles.onlineDot:styles.offlineDot}></span>
              <strong>{device.display_name}</strong>
            </div>
            <small>{online(device)?'ONLINE':'OFFLINE'}</small>
          </div>
          <div className={styles.deviceMeta}>
            <span><b>Agent</b>{device.agent_version||'—'}</span>
            <span><b>Adaptador</b>{device.adapter||'—'}</span>
            <span><b>LightBurn</b>{device.lightburn_online===true?'Conectado':device.lightburn_online===false?'Offline':'—'}</span>
            <span><b>Máquina</b>{device.machine_connected===true?(device.machine_name||'Conectada'):device.machine_connected===false?'Desconectada':'—'}</span>
            <span><b>Job</b>{device.job_state||'—'}</span>
            <span><b>Progresso</b>{device.progress_permille===null?'—':`${(device.progress_permille/10).toFixed(1)}%`}</span>
          </div>
          <div className={styles.deviceFoot}>
            <span>{device.project_file||'Nenhum projeto reportado'}</span>
            <span>{device.last_seen_at?`Último contato: ${new Date(device.last_seen_at).toLocaleString('pt-BR')}`:'Sem heartbeat ainda'}</span>
          </div>
          <div className={styles.deviceActions}>
            <button
              type="button"
              className={styles.openDeviceButton}
              onClick={()=>setSelectedDeviceId(device.device_id)}
            >{selectedDeviceId===device.device_id?'Selecionado':'Abrir painel'}</button>
            <span>Status: <b>{device.device_status}</b></span>
            <button
              type="button"
              className={device.device_status==='revoked'?styles.reactivateButton:styles.revokeButton}
              disabled={deviceActionId===device.device_id}
              onClick={()=>void changeDeviceAccess(device)}
            >
              {deviceActionId===device.device_id
                ?'Aplicando…'
                :device.device_status==='revoked'?'Reativar PC':'Revogar PC'}
            </button>
          </div>
        </article>)}
      </div>

      {selectedDevice&&<section className={styles.workspace}>
        <div className={styles.workspaceHead}>
          <div>
            <small>PAINEL DO PC</small>
            <strong>{selectedDevice.display_name}</strong>
          </div>
          <span className={online(selectedDevice)?styles.workspaceOnline:styles.workspaceOffline}>
            {online(selectedDevice)?'ONLINE':'OFFLINE'}
          </span>
        </div>

        <div className={styles.workspaceTabs}>
          <button
            type="button"
            className={workspaceTab==='preview'?styles.activeWorkspaceTab:''}
            onClick={()=>setWorkspaceTab('preview')}
          >Visualização</button>
          <button
            type="button"
            className={workspaceTab==='control'?styles.activeWorkspaceTab:''}
            onClick={()=>setWorkspaceTab('control')}
          >Controle</button>
        </div>

        {workspaceTab==='preview'&&<div className={styles.previewPane}>
          <div className={styles.previewTitle}>
            <div>
              <small>LIGHTBURN · AO VIVO</small>
              <b>Janela completa do LightBurn</b>
            </div>
            <div className={styles.previewActions}>
              <button type="button" onClick={()=>void toggleFullscreen()}>
                {isFullscreen?'Sair da tela cheia':'Tela cheia'}
              </button>
            </div>
          </div>

          <div ref={previewSurfaceRef} className={[styles.previewSurface,isFullscreen?styles.previewSurfaceFullscreen:''].filter(Boolean).join(' ')}>
            <div className={styles.previewOverlay}>
              <span>AO VIVO</span>
              {isFullscreen&&<button type="button" onClick={()=>void toggleFullscreen()}>Fechar</button>}
            </div>
            <div className={styles.previewFrame}>
              {previewUrl
                ?<img
                    src={previewUrl}
                    alt="Janela remota do LightBurn"
                    onLoad={event=>{
                      setPreviewPending(false);
                      setPreviewMessage('');
                      setPreviewCapturedAt(new Date().toISOString());
                      setPreviewWidth(event.currentTarget.naturalWidth||null);
                      setPreviewHeight(event.currentTarget.naturalHeight||null);
                      schedulePreviewFrame(160);
                    }}
                    onError={()=>{
                      if(!previewCapturedAt)setPreviewMessage('Aguardando o primeiro quadro do Agent…');
                      schedulePreviewFrame(450);
                    }}
                  />
                :<div className={styles.previewEmpty}>
                  <strong>{selectedDevice.lightburn_online===false?'LightBurn está fechado':'Preparando visualização…'}</strong>
                  <span>{previewMessage}</span>
                  {previewPending&&<i>Conectando ao Agent</i>}
                </div>}
            </div>
          </div>

          <div className={styles.previewFoot}>
            <span>{previewWidth&&previewHeight?previewWidth+' × '+previewHeight+'px · atualização contínua':'A imagem é enviada apenas enquanto esta aba está aberta.'}</span>
            <b>{previewCapturedAt?'Último quadro no celular: '+new Date(previewCapturedAt).toLocaleTimeString('pt-BR'):'—'}</b>
          </div>
        </div>}

        {workspaceTab==='control'&&<div className={styles.controlPane}>
          <div className={styles.controlStatus}>
            <article><small>PC</small><strong>{online(selectedDevice)?'Online':'Offline'}</strong></article>
            <article><small>LIGHTBURN</small><strong>{selectedDevice.lightburn_online===true?'Conectado':selectedDevice.lightburn_online===false?'Offline':'—'}</strong></article>
            <article><small>MÁQUINA</small><strong>{selectedDevice.machine_connected===true?'Conectada':selectedDevice.machine_connected===false?'Desconectada':'—'}</strong></article>
            <article><small>JOB</small><strong>{selectedDevice.job_state||'—'}</strong></article>
          </div>

          <div className={armed?styles.controlArmed:styles.controlLocked}>
            <b>{armed?'CONTROLES LIBERADOS':'CONTROLES BLOQUEADOS'}</b>
            <span>{armed&&selectedDevice.local_arm_until
              ?'Liberados até '+new Date(selectedDevice.local_arm_until).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
              :'No PC: ícone do DevinX Agent → “Permitir controles remotos (5 min)”'}</span>
          </div>

          <div className={styles.commandGrid}>
            <button type="button" disabled={!canFrame||commandPending!==null} onClick={()=>void sendCommand('frame')}>
              <span>▣</span><b>Frame seleção</b><small>{commandPending==='frame'?'enviando…':canFrame?'pronto':'bloqueado'}</small>
            </button>
            <button type="button" disabled={!canStart||commandPending!==null} onClick={()=>void sendCommand('start')}>
              <span>▶</span><b>Iniciar</b><small>{commandPending==='start'?'enviando…':canStart?'pronto':'bloqueado'}</small>
            </button>
            <button type="button" disabled={!canPause||commandPending!==null} onClick={()=>void sendCommand('pause')}>
              <span>Ⅱ</span><b>Pausar</b><small>{commandPending==='pause'?'enviando…':canPause?'pronto':'bloqueado'}</small>
            </button>
            <button type="button" disabled={!canStop||commandPending!==null} className={styles.stopCommand} onClick={()=>void sendCommand('stop')}>
              <span>■</span><b>Parar</b><small>{commandPending==='stop'?'enviando…':canStop?'pronto':'bloqueado'}</small>
            </button>
          </div>

          {commandNotice&&<div className={styles.commandNotice}>{commandNotice}</div>}
          <div className={styles.controlWarning}>
            <b>Teste controlado</b>
            <span>Iniciar usa o comando UDP oficial START. Pausar e Parar usam os atalhos documentados do LightBurn. Frame usa “Frame Selection”. A liberação expira automaticamente.</span>
          </div>
        </div>}
      </section>}

      <div className={styles.testGuide}>
        <small>COMO TESTAR</small>
        <ol>
          <li><b>1.</b><span>Abra o LightBurn.</span></li>
          <li><b>2.</b><span>Dê dois cliques no DevinX Laser Agent.</span></li>
          <li><b>3.</b><span>O Agent abre o DevinX no navegador. Clique em “Vincular este PC”.</span></li>
          <li><b>4.</b><span>Depois disso, o Agent envia o estado do LightBurn automaticamente. O modo manual fica só para suporte.</span></li>
        </ol>
        <p>Para testar os controles, abra o ícone do Agent no PC e libere os controles remotos por 5 minutos. A autorização expira sozinha.</p>
      </div>

      <div className={styles.flow}>
        <span>CELULAR</span><i>→</i><span>DEVINX</span><i>→</i><span>AGENT</span><i>→</i><span>LIGHTBURN</span>
      </div>

      <div className={styles.rules}>
        <b>Controle temporário</b>
        <p>Os comandos expiram em segundos e só são aceitos enquanto a autorização local do Agent estiver válida.</p>
      </div>
    </>}
  </section>;
}
