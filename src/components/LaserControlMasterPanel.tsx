'use client';

import {FormEvent,useCallback,useEffect,useState} from 'react';
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

  const loadDevices=useCallback(async()=>{
    setDevicesPending(true);
    try{
      const response=await fetch('/api/laser-control/master/devices',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok)throw new Error('devices');
      setDevices(Array.isArray(data?.devices)?data.devices:[]);
    }catch{
      setPairingNotice('Não foi possível carregar os PCs vinculados.');
    }finally{
      setDevicesPending(false);
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
    return()=>{active=false};
  },[loadDevices]);

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
    return Date.now()-Date.parse(device.last_seen_at)<90_000;
  };

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
        {devices.map(device=><article className={styles.deviceCard} key={device.device_id}>
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

      <div className={styles.testGuide}>
        <small>COMO TESTAR</small>
        <ol>
          <li><b>1.</b><span>Abra o LightBurn.</span></li>
          <li><b>2.</b><span>Dê dois cliques no DevinX Laser Agent.</span></li>
          <li><b>3.</b><span>O Agent abre o DevinX no navegador. Clique em “Vincular este PC”.</span></li>
          <li><b>4.</b><span>Depois disso, o Agent envia o estado do LightBurn automaticamente. O modo manual fica só para suporte.</span></li>
        </ol>
        <p>Nesta versão de teste não existe Start, Stop, Pause ou Frame remoto. O objetivo é validar pareamento e monitoramento antes de liberar qualquer comando físico.</p>
      </div>

      <div className={styles.flow}>
        <span>CELULAR</span><i>→</i><span>DEVINX</span><i>→</i><span>AGENT</span><i>→</i><span>LIGHTBURN</span>
      </div>

      <div className={styles.rules}>
        <b>Travas desta fase</b>
        <p>Pareamento e telemetria estão ativos somente para desenvolvimento master. Checkout e todos os comandos físicos do laser continuam desligados.</p>
      </div>
    </>}
  </section>;
}
