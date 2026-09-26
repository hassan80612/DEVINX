'use client';

import {useEffect,useState} from 'react';
import styles from './LaserControlMasterPanel.module.css';

type Status={
  product:string;
  protocolVersion:number;
  remoteCommandsEnabled:boolean;
  storageConnected:boolean;
  pairingEnabled:boolean;
  reason:string;
  plans:Array<{
    id:string;pcs:number;machines:number;mobileDevices:number;activeOperators:number;
    monthlyMinor:{BRL:number;USD:number};checkoutConfigured:boolean;
  }>;
};

export function LaserControlMasterPanel(){
  const[status,setStatus]=useState<Status|null>(null);
  const[error,setError]=useState(false);

  useEffect(()=>{
    let active=true;
    fetch('/api/laser-control/master/status',{cache:'no-store',credentials:'same-origin'})
      .then(async response=>{
        if(!response.ok)throw new Error('status');
        return response.json() as Promise<Status>;
      })
      .then(data=>{if(active)setStatus(data)})
      .catch(()=>{if(active)setError(true)});
    return()=>{active=false};
  },[]);

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
          <strong>{status.storageConnected?'CONECTADO':'NÃO APLICADO'}</strong>
          <span>{status.reason==='devinx_supabase_not_verified'?'Aguardando confirmar o Supabase correto':'Camada de persistência'}</span>
        </article>
        <article>
          <small>PAREAMENTO</small>
          <strong>{status.pairingEnabled?'ATIVO':'VALIDAÇÃO LOCAL'}</strong>
          <span>Código assinado de 5 minutos</span>
        </article>
      </div>

      <div className={styles.flow}>
        <span>CELULAR</span><i>→</i><span>DEVINX</span><i>→</i><span>AGENT</span><i>→</i><span>LIGHTBURN</span>
      </div>

      <div className={styles.rules}>
        <b>Travas desta fase</b>
        <p>Sem persistência de dispositivo, sem checkout, sem Start remoto e sem qualquer acesso genérico ao Windows.</p>
      </div>
    </>}
  </section>;
}
