'use client';

import {FormEvent,useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
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
  const[pairingCode,setPairingCode]=useState('');
  const[deviceName,setDeviceName]=useState('PC Oficina');
  const[pairingPending,setPairingPending]=useState(false);
  const[pairingNotice,setPairingNotice]=useState('');

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
      const{data,error}=await createClient().functions.invoke('laser-master-pairing-claim',{
        body:{pairingCode:code,displayName:deviceName.trim()||'PC Oficina'}
      });
      if(error||!data?.claimed){
        setPairingNotice(data?.reason==='not_found_or_expired'
          ?'Código não encontrado ou expirado. Gere outro no Agent.'
          :'Não foi possível vincular este PC.');
        return;
      }
      setPairingCode('');
      setPairingNotice('PC vinculado com sucesso. Comandos remotos continuam desligados.');
    }catch{
      setPairingNotice('Falha ao comunicar com o serviço de pareamento.');
    }finally{
      setPairingPending(false);
    }
  }

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

      <form className={styles.pairForm} onSubmit={claimPairing}>
        <div>
          <small>VINCULAR PC DE TESTE</small>
          <b>Digite o código exibido pelo Agent</b>
          <span>Esta área só existe para o master durante o desenvolvimento.</span>
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
      {pairingNotice&&<div className={styles.pairNotice}>{pairingNotice}</div>}

      <div className={styles.flow}>
        <span>CELULAR</span><i>→</i><span>DEVINX</span><i>→</i><span>AGENT</span><i>→</i><span>LIGHTBURN</span>
      </div>

      <div className={styles.rules}>
        <b>Travas desta fase</b>
        <p>O pareamento de PC está ativo somente para master. Checkout e todos os comandos físicos do laser continuam desligados.</p>
      </div>
    </>}
  </section>;
}
