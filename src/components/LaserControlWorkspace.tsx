'use client';

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {createClient} from '@/lib/supabase/client';
import styles from './LaserControlWorkspace.module.css';

type LaserDevice={
  device_id:string;
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
};

type RemoteSession={
  sessionId:string;
  topic:string;
  frameToken:string;
  controlToken:string;
  inputToken:string|null;
  remoteInputEnabled:boolean;
  revision:number;
  expiresAt:string;
};

type LaserCommand='frame'|'start'|'pause'|'stop';
type OrientationMode='auto'|'landscape'|'portrait';

export function LaserControlWorkspace(){
  const[devices,setDevices]=useState<LaserDevice[]>([]);
  const[selectedDeviceId,setSelectedDeviceId]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[notice,setNotice]=useState('');
  const[tab,setTab]=useState<'live'|'control'|'agent'>('live');

  const[session,setSession]=useState<RemoteSession|null>(null);
  const[realtimeStatus,setRealtimeStatus]=useState<'idle'|'connecting'|'live'|'error'>('idle');
  const[frameSrc,setFrameSrc]=useState('');
  const[frameSize,setFrameSize]=useState('');
  const[frameLatency,setFrameLatency]=useState<number|null>(null);
  const[frameAt,setFrameAt]=useState<number|null>(null);
  const[zoom,setZoom]=useState(1);
  const[zoomOrigin,setZoomOrigin]=useState({x:.5,y:.5});
  const[orientation,setOrientation]=useState<OrientationMode>('auto');
  const[fullscreen,setFullscreen]=useState(false);
  const[inputReady,setInputReady]=useState(false);
  const[inputPending,setInputPending]=useState(false);
  const[commandPending,setCommandPending]=useState<LaserCommand|null>(null);
  const[commandNotice,setCommandNotice]=useState('');
  const[pairingCode,setPairingCode]=useState('');
  const[deviceName,setDeviceName]=useState('PC Oficina');
  const[pairingPending,setPairingPending]=useState(false);

  const channelRef=useRef<any>(null);
  const previewSurfaceRef=useRef<HTMLDivElement|null>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const sessionRef=useRef<RemoteSession|null>(null);
  const lastFrameSeqRef=useRef(0);
  const lastPointerMoveRef=useRef(0);
  const touchPointsRef=useRef(new Map<number,{x:number;y:number}>());
  const touchGestureRef=useRef<{
    pinching:boolean;
    startDistance:number;
    startZoom:number;
    singlePointerId:number|null;
    startClientX:number;
    startClientY:number;
    startPoint:{x:number;y:number}|null;
    remoteDown:boolean;
    moved:boolean;
    rightClickSent:boolean;
    longPressTimer:number|undefined;
  }>({
    pinching:false,startDistance:0,startZoom:1,singlePointerId:null,
    startClientX:0,startClientY:0,startPoint:null,
    remoteDown:false,moved:false,rightClickSent:false,longPressTimer:undefined
  });
  const lastTapRef=useRef<{at:number;clientX:number;clientY:number}|null>(null);

  const loadDevices=useCallback(async(quiet=false)=>{
    if(!quiet)setLoading(true);
    try{
      const response=await fetch('/api/laser-control/master/devices',{
        method:'POST',credentials:'same-origin',cache:'no-store'
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
      if(!quiet)setNotice('Não foi possível carregar os PCs vinculados.');
    }finally{
      if(!quiet)setLoading(false);
    }
  },[]);

  useEffect(()=>{
    void loadDevices();
    const timer=window.setInterval(()=>void loadDevices(true),2_000);
    return()=>window.clearInterval(timer);
  },[loadDevices]);

  const selectedDevice=useMemo(
    ()=>devices.find(device=>device.device_id===selectedDeviceId)??null,
    [devices,selectedDeviceId]
  );

  const online=(device:LaserDevice)=>{
    if(!device.last_seen_at)return false;
    return Date.now()-Date.parse(device.last_seen_at)<25_000;
  };

  const postSession=useCallback(async(payload:Record<string,unknown>)=>{
    const response=await fetch('/api/laser-control/master/remote-session',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      cache:'no-store'
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(String(data?.error||'session')),{data});
    return data;
  },[]);

  useEffect(()=>{
    if(!selectedDeviceId)return;
    let active=true;
    let renewTimer:number|undefined;

    async function open(){
      try{
        setRealtimeStatus('connecting');
        const data=await postSession({action:'open',deviceId:selectedDeviceId});
        if(!active)return;
        const next=data as RemoteSession;
        sessionRef.current=next;
        setSession(next);
        setRealtimeStatus('connecting');
        setInputReady(false);
      }catch{
        if(active)setRealtimeStatus('error');
      }
    }

    async function renew(){
      try{
        const data=await postSession({action:'renew',deviceId:selectedDeviceId});
        if(!active)return;
        const current=sessionRef.current;
        const next={...current,...data} as RemoteSession;
        sessionRef.current=next;
        setSession(next);
      }catch{}
    }

    void open();
    renewTimer=window.setInterval(()=>void renew(),15_000);

    return()=>{
      active=false;
      if(renewTimer)window.clearInterval(renewTimer);
      const current=sessionRef.current;
      sessionRef.current=null;
      if(current){
        void fetch('/api/laser-control/master/remote-session',{
          method:'POST',credentials:'same-origin',keepalive:true,
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'close',sessionId:current.sessionId})
        }).catch(()=>undefined);
      }
      setSession(null);
      setFrameSrc('');
      resetZoom();
      setInputReady(false);
      setRealtimeStatus('idle');
    };
  },[selectedDeviceId,postSession]);

  useEffect(()=>{
    if(!session?.topic)return;
    const supabase=createClient();
    lastFrameSeqRef.current=0;
    setRealtimeStatus('connecting');

    const channel=supabase.channel(session.topic,{
      config:{broadcast:{ack:false,self:false}}
    });

    channel
      .on('broadcast',{event:'frame'},({payload}:any)=>{
        if(payload?.token!==session.frameToken)return;
        const seq=Number(payload?.seq||0);
        if(seq<=lastFrameSeqRef.current)return;
        const jpeg=String(payload?.jpeg||'');
        if(!jpeg)return;
        lastFrameSeqRef.current=seq;
        const capturedAt=Number(payload?.capturedAt||Date.now());
        setFrameSrc('data:image/jpeg;base64,'+jpeg);
        setFrameSize(`${Number(payload?.width||0)} × ${Number(payload?.height||0)}`);
        setFrameAt(Date.now());
        setFrameLatency(Math.max(0,Date.now()-capturedAt));
        setRealtimeStatus('live');
      })
      .on('broadcast',{event:'agent_state'},({payload}:any)=>{
        if(payload?.token!==session.frameToken)return;
        if(payload?.state==='control-ready')setInputReady(true);
        if(payload?.state==='preview-ready'){
          setInputReady(false);
          setRealtimeStatus(current=>current==='live'?'live':'connecting');
        }
      })
      .subscribe((status:string)=>{
        if(status==='SUBSCRIBED')setRealtimeStatus(current=>current==='live'?'live':'connecting');
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setRealtimeStatus('error');
      });

    channelRef.current=channel;
    return()=>{
      if(channelRef.current===channel)channelRef.current=null;
      void supabase.removeChannel(channel);
    };
  },[session?.topic,session?.frameToken]);

  useEffect(()=>{
    const handle=()=>{
      const isFull=Boolean(document.fullscreenElement);
      setFullscreen(isFull);
      if(!isFull&&sessionRef.current?.remoteInputEnabled){
        void disableRemoteInput();
      }
    };
    document.addEventListener('fullscreenchange',handle);
    return()=>document.removeEventListener('fullscreenchange',handle);
  });

  async function enterFullscreen(){
    try{
      await previewSurfaceRef.current?.requestFullscreen();
      previewSurfaceRef.current?.focus();
    }catch{
      setNotice('O navegador não permitiu tela cheia.');
    }
  }

  async function exitFullscreen(){
    try{if(document.fullscreenElement)await document.exitFullscreen()}catch{}
  }

  async function setOrientationMode(mode:OrientationMode){
    setOrientation(mode);
    try{
      const screenOrientation=(screen.orientation as any);
      if(mode==='auto'){
        if(typeof screenOrientation?.unlock==='function')screenOrientation.unlock();
        return;
      }
      if(typeof screenOrientation?.lock==='function')
        await screenOrientation.lock(mode);
    }catch{
      setNotice('Seu navegador não permitiu travar a orientação. Você ainda pode girar o aparelho normalmente.');
    }
  }

  async function enableRemoteInput(){
    const current=sessionRef.current;
    if(!current||!fullscreen)return;
    setInputPending(true);
    setInputReady(false);
    try{
      const data=await postSession({action:'input',sessionId:current.sessionId,enabled:true});
      const next={...current,...data,remoteInputEnabled:Boolean(data?.enabled)} as RemoteSession;
      sessionRef.current=next;
      setSession(next);
      setNotice('Controle remoto ativando…');
    }catch{
      setNotice('Não foi possível ativar o controle remoto.');
    }finally{
      setInputPending(false);
    }
  }

  async function disableRemoteInput(){
    const current=sessionRef.current;
    if(!current)return;
    setInputPending(true);
    try{
      const data=await postSession({action:'input',sessionId:current.sessionId,enabled:false});
      const next={...current,...data,inputToken:null,remoteInputEnabled:false} as RemoteSession;
      sessionRef.current=next;
      setSession(next);
      setInputReady(false);
      setNotice('Controle remoto bloqueado.');
    }catch{
      setInputReady(false);
    }finally{
      setInputPending(false);
    }
  }

  function sendRemoteInput(payload:Record<string,unknown>){
    const current=sessionRef.current;
    if(!fullscreen||!inputReady||!current?.inputToken||!channelRef.current)return;
    void channelRef.current.send({
      type:'broadcast',
      event:'remote_input',
      payload:{token:current.inputToken,...payload}
    });
  }

  function pointerCoordinatesFromClient(clientX:number,clientY:number){
    const image=imageRef.current;
    if(!image)return null;
    const rect=image.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return null;
    const x=(clientX-rect.left)/rect.width;
    const y=(clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return null;
    return{x,y};
  }

  function pointerCoordinates(event:{clientX:number;clientY:number}){
    return pointerCoordinatesFromClient(event.clientX,event.clientY);
  }

  function clearLongPress(){
    const gesture=touchGestureRef.current;
    if(gesture.longPressTimer!==undefined){
      window.clearTimeout(gesture.longPressTimer);
      gesture.longPressTimer=undefined;
    }
  }

  function resetTouchGesture(){
    clearLongPress();
    touchPointsRef.current.clear();
    const gesture=touchGestureRef.current;
    gesture.pinching=false;
    gesture.startDistance=0;
    gesture.startZoom=zoom;
    gesture.singlePointerId=null;
    gesture.startPoint=null;
    gesture.remoteDown=false;
    gesture.moved=false;
    gesture.rightClickSent=false;
  }

  function resetZoom(){
    setZoom(1);
    setZoomOrigin({x:.5,y:.5});
  }

  function handlePointer(
    event:ReactPointerEvent<HTMLImageElement>,
    type:'pointerdown'|'pointerup'|'pointermove'|'pointercancel'
  ){
    if(!fullscreen)return;

    if(event.pointerType!=='touch'){
      if(!inputReady)return;
      const point=pointerCoordinates(event);
      if(!point)return;
      if(type==='pointermove'){
        const now=performance.now();
        if(now-lastPointerMoveRef.current<33)return;
        lastPointerMoveRef.current=now;
      }
      if(type==='pointercancel')return;
      event.preventDefault();
      if(type==='pointerdown'){
        event.currentTarget.setPointerCapture?.(event.pointerId);
        previewSurfaceRef.current?.focus();
      }
      sendRemoteInput({type,...point,button:event.button});
      return;
    }

    event.preventDefault();
    const touches=touchPointsRef.current;
    const gesture=touchGestureRef.current;

    if(type==='pointerdown'){
      event.currentTarget.setPointerCapture?.(event.pointerId);
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY});

      if(touches.size===1){
        const point=pointerCoordinates(event);
        gesture.pinching=false;
        gesture.singlePointerId=event.pointerId;
        gesture.startClientX=event.clientX;
        gesture.startClientY=event.clientY;
        gesture.startPoint=point;
        gesture.remoteDown=false;
        gesture.moved=false;
        gesture.rightClickSent=false;
        clearLongPress();

        if(inputReady&&point){
          gesture.longPressTimer=window.setTimeout(()=>{
            const current=touchGestureRef.current;
            if(current.pinching||current.moved||current.singlePointerId!==event.pointerId||!current.startPoint)return;
            sendRemoteInput({type:'pointerdown',...current.startPoint,button:2});
            sendRemoteInput({type:'pointerup',...current.startPoint,button:2});
            current.rightClickSent=true;
          },560);
        }
      }else if(touches.size===2){
        clearLongPress();
        const values=[...touches.values()];
        const dx=values[0].x-values[1].x;
        const dy=values[0].y-values[1].y;
        gesture.pinching=true;
        gesture.startDistance=Math.max(1,Math.hypot(dx,dy));
        gesture.startZoom=zoom;
        gesture.remoteDown=false;

        const midX=(values[0].x+values[1].x)/2;
        const midY=(values[0].y+values[1].y)/2;
        const point=pointerCoordinatesFromClient(midX,midY);
        if(point)setZoomOrigin(point);
      }
      return;
    }

    if(type==='pointermove'){
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY});

      if(gesture.pinching&&touches.size>=2){
        const values=[...touches.values()];
        const dx=values[0].x-values[1].x;
        const dy=values[0].y-values[1].y;
        const distance=Math.max(1,Math.hypot(dx,dy));
        const next=Math.min(4,Math.max(1,gesture.startZoom*(distance/gesture.startDistance)));
        setZoom(Math.round(next*100)/100);
        return;
      }

      if(gesture.singlePointerId===event.pointerId&&!gesture.rightClickSent){
        const moved=Math.hypot(
          event.clientX-gesture.startClientX,
          event.clientY-gesture.startClientY
        )>8;
        if(moved){
          gesture.moved=true;
          clearLongPress();
        }

        if(inputReady&&gesture.moved){
          const point=pointerCoordinates(event);
          if(!point)return;
          if(!gesture.remoteDown&&gesture.startPoint){
            sendRemoteInput({type:'pointerdown',...gesture.startPoint,button:0});
            gesture.remoteDown=true;
          }
          const now=performance.now();
          if(now-lastPointerMoveRef.current>=33){
            lastPointerMoveRef.current=now;
            sendRemoteInput({type:'pointermove',...point,button:0});
          }
        }
      }
      return;
    }

    const wasPinching=gesture.pinching;
    touches.delete(event.pointerId);

    if(type==='pointercancel'){
      if(gesture.remoteDown&&gesture.startPoint&&inputReady)
        sendRemoteInput({type:'pointerup',...gesture.startPoint,button:0});
      resetTouchGesture();
      return;
    }

    if(wasPinching){
      clearLongPress();
      if(touches.size<2)gesture.pinching=false;
      if(touches.size===0)resetTouchGesture();
      return;
    }

    if(gesture.singlePointerId!==event.pointerId)return;
    clearLongPress();

    if(gesture.rightClickSent){
      resetTouchGesture();
      return;
    }

    const point=pointerCoordinates(event);
    if(inputReady&&point){
      if(gesture.remoteDown){
        sendRemoteInput({type:'pointerup',...point,button:0});
      }else if(!gesture.moved){
        const now=Date.now();
        const last=lastTapRef.current;
        const isDouble=Boolean(last
          &&now-last.at<330
          &&Math.hypot(event.clientX-last.clientX,event.clientY-last.clientY)<28);

        if(isDouble){
          sendRemoteInput({type:'doubleclick',...point,button:0});
          lastTapRef.current=null;
        }else{
          sendRemoteInput({type:'pointerdown',...point,button:0});
          sendRemoteInput({type:'pointerup',...point,button:0});
          lastTapRef.current={at:now,clientX:event.clientX,clientY:event.clientY};
        }
      }
    }

    resetTouchGesture();
  }

  function handleWheel(event:ReactWheelEvent<HTMLImageElement>){
    if(!fullscreen||!inputReady)return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const x=(event.clientX-rect.left)/rect.width;
    const y=(event.clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return;
    event.preventDefault();
    sendRemoteInput({type:'wheel',x,y,deltaY:event.deltaY});
  }

  function handleKey(event:ReactKeyboardEvent<HTMLDivElement>,type:'keydown'|'keyup'){
    if(!fullscreen||!inputReady)return;
    if(['F5','F11','F12'].includes(event.code))return;
    event.preventDefault();
    sendRemoteInput({
      type,key:event.key,code:event.code,
      ctrl:event.ctrlKey,shift:event.shiftKey,alt:event.altKey,meta:event.metaKey
    });
  }

  async function sendCommand(command:LaserCommand){
    const current=sessionRef.current;
    if(!selectedDevice||!current||commandPending)return;

    if(command==='start'){
      if(!window.confirm('Iniciar a gravação agora? Confirme somente com a máquina pronta e supervisionada.'))return;
    }

    setCommandPending(command);
    setCommandNotice('Enviando…');

    try{
      const response=await fetch('/api/laser-control/master/command',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'send',
          deviceId:selectedDevice.device_id,
          sessionId:current.sessionId,
          command,
          idempotencyKey:crypto.randomUUID()
        }),
        cache:'no-store'
      });
      const data=await response.json();

      if(!response.ok){
        const labels:Record<string,string>={
          remote_session_not_found:'A sessão remota expirou. Reconectando…',
          machine_not_connected:'A máquina não está conectada.',
          machine_not_idle:'A máquina precisa estar parada para esse comando.',
          not_running:'Não há gravação em andamento para pausar.'
        };
        setCommandNotice(labels[String(data?.error)]||'O comando foi bloqueado.');
        return;
      }

      const commandId=String(data?.commandId||'');
      if(!commandId){
        setCommandNotice('Comando sem confirmação.');
        return;
      }

      for(let i=0;i<35;i++){
        await new Promise(resolve=>window.setTimeout(resolve,100));
        const check=await fetch('/api/laser-control/master/command',{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'status',commandId}),
          cache:'no-store'
        });
        const result=await check.json();
        if(!check.ok)continue;

        if(result?.status==='acknowledged'){
          setCommandNotice(
            command==='start'?'Iniciar executado.'
            :command==='pause'?'Pausar executado.'
            :command==='stop'?'Parar executado.'
            :'Frame seleção executado.'
          );
          await loadDevices(true);
          return;
        }
        if(result?.status==='rejected'||result?.status==='expired'){
          setCommandNotice('Não executado: '+String(result?.rejectionReason||result?.status));
          await loadDevices(true);
          return;
        }
      }

      setCommandNotice('O comando foi enviado, mas a confirmação não chegou a tempo.');
    }catch{
      setCommandNotice('Falha de comunicação.');
    }finally{
      setCommandPending(null);
    }
  }

  async function claimPairing(event:FormEvent){
    event.preventDefault();
    const code=pairingCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length!==8){setNotice('Digite o código de 8 caracteres.');return}

    setPairingPending(true);
    try{
      const response=await fetch('/api/laser-control/master/claim',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pairingCode:code,displayName:deviceName.trim()||'PC Oficina'})
      });
      const data=await response.json();
      if(!response.ok||!data?.claimed){
        setNotice(data?.reason==='not_found_or_expired'?'Código expirado ou não encontrado.':'Não foi possível vincular o PC.');
        return;
      }
      setPairingCode('');
      setNotice('PC vinculado.');
      await loadDevices();
    }catch{
      setNotice('Falha ao vincular o PC.');
    }finally{
      setPairingPending(false);
    }
  }

  const canStart=Boolean(selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true&&selectedDevice.machine_connected===true
    &&selectedDevice.job_state==='idle');
  const canFrame=canStart;
  const canPause=Boolean(selectedDevice&&online(selectedDevice)
    &&selectedDevice.machine_connected===true
    &&['running','busy'].includes(selectedDevice.job_state||''));
  const canStop=Boolean(selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true&&selectedDevice.machine_connected===true);

  return <section className={styles.shell}>
    <div className={styles.top}>
      <div>
        <small>DEVINX LASER CONTROL</small>
        <h2>LightBurn remoto</h2>
        <p>Imagem ao vivo e controles passam por sessão temporária. Nenhum quadro é salvo continuamente no banco.</p>
      </div>
      <div className={styles.liveBadge} data-live={realtimeStatus==='live'}>
        <i></i>{realtimeStatus==='live'?'AO VIVO':realtimeStatus==='connecting'?'CONECTANDO':realtimeStatus==='error'?'SEM CANAL':'AGUARDANDO'}
      </div>
    </div>

    <div className={styles.deviceStrip}>
      {loading&&<span>Carregando PCs…</span>}
      {!loading&&devices.length===0&&<span>Nenhum PC vinculado.</span>}
      {devices.map(device=><button
        key={device.device_id}
        type="button"
        className={selectedDeviceId===device.device_id?styles.selectedDevice:''}
        onClick={()=>setSelectedDeviceId(device.device_id)}
      >
        <i data-online={online(device)}></i>
        <span><b>{device.display_name}</b><small>Agent {device.agent_version||'—'} · {online(device)?'online':'offline'}</small></span>
      </button>)}
    </div>

    {selectedDevice&&<div className={styles.workspace}>
      <div className={styles.summary}>
        <span><small>LightBurn</small><b>{selectedDevice.lightburn_online===true?'Conectado':selectedDevice.lightburn_online===false?'Fechado':'—'}</b></span>
        <span><small>Máquina</small><b>{selectedDevice.machine_connected===true?(selectedDevice.machine_name||'Conectada'):selectedDevice.machine_connected===false?'Desconectada':'—'}</b></span>
        <span><small>Job</small><b>{selectedDevice.job_state||'—'}</b></span>
        <span><small>Progresso</small><b>{selectedDevice.progress_permille==null?'—':(selectedDevice.progress_permille/10).toFixed(1)+'%'}</b></span>
      </div>

      <div className={styles.tabs}>
        <button className={tab==='live'?styles.activeTab:''} onClick={()=>setTab('live')}>Ao vivo</button>
        <button className={tab==='control'?styles.activeTab:''} onClick={()=>setTab('control')}>Controle</button>
        <button className={tab==='agent'?styles.activeTab:''} onClick={()=>setTab('agent')}>Agent & guia</button>
      </div>

      {tab==='live'&&<div className={styles.livePane}>
        <div className={styles.liveToolbar}>
          <div className={styles.zoom}>
            <button onClick={()=>setZoom(value=>Math.max(.75,Math.round((value-.25)*100)/100))}>−</button>
            <button onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button onClick={()=>setZoom(value=>Math.min(3,Math.round((value+.25)*100)/100))}>＋</button>
          </div>
          <div className={styles.orientation}>
            <button className={orientation==='auto'?styles.on:''} onClick={()=>void setOrientationMode('auto')}>Auto</button>
            <button className={orientation==='landscape'?styles.on:''} onClick={()=>void setOrientationMode('landscape')}>Horizontal</button>
            <button className={orientation==='portrait'?styles.on:''} onClick={()=>void setOrientationMode('portrait')}>Vertical</button>
          </div>
          <button className={styles.fullscreenButton} onClick={()=>void enterFullscreen()}>Tela cheia</button>
        </div>

        <div
          ref={previewSurfaceRef}
          className={[styles.previewSurface,fullscreen&&inputReady?styles.remoteControlSurface:''].filter(Boolean).join(' ')}
          tabIndex={0}
          onKeyDown={event=>handleKey(event,'keydown')}
          onKeyUp={event=>handleKey(event,'keyup')}
        >
          <div className={styles.fullscreenControls}>
            {fullscreen&&<>
              <div className={styles.zoom}>
                <button onClick={()=>setZoom(value=>Math.max(.75,value-.25))}>−</button>
                <button onClick={resetZoom}>{Math.round(zoom*100)}%</button>
                <button onClick={()=>setZoom(value=>Math.min(3,value+.25))}>＋</button>
              </div>
              <div className={styles.orientation}>
                <button className={orientation==='auto'?styles.on:''} onClick={()=>void setOrientationMode('auto')}>Auto</button>
                <button className={orientation==='landscape'?styles.on:''} onClick={()=>void setOrientationMode('landscape')}>↔</button>
                <button className={orientation==='portrait'?styles.on:''} onClick={()=>void setOrientationMode('portrait')}>↕</button>
              </div>
              <button
                className={inputReady?styles.controlOn:styles.controlOff}
                disabled={inputPending}
                onClick={()=>void (session?.remoteInputEnabled?disableRemoteInput():enableRemoteInput())}
              >{inputPending?'Ativando…':inputReady?'Controle: LIGADO':'Habilitar controle'}</button>
              <button onClick={()=>void exitFullscreen()}>Fechar</button>
            </>}
          </div>

          {frameSrc?<img
            ref={imageRef}
            src={frameSrc}
            alt="Janela ao vivo do LightBurn"
            style={fullscreen
              ?{
                transform:`scale(${zoom})`,
                transformOrigin:`${zoomOrigin.x*100}% ${zoomOrigin.y*100}%`
              }
              :{
                transform:`scale(${zoom})`,
                transformOrigin:'center center'
              }}
            className={inputReady&&fullscreen?styles.remoteImageActive:styles.remoteImage}
            onPointerDown={event=>handlePointer(event,'pointerdown')}
            onPointerUp={event=>handlePointer(event,'pointerup')}
            onPointerMove={event=>handlePointer(event,'pointermove')}
            onPointerCancel={event=>handlePointer(event,'pointercancel')}
            onContextMenu={event=>event.preventDefault()}
            onDoubleClick={event=>{
              if(!fullscreen||!inputReady)return;
              const point=pointerCoordinates(event);
              if(point)sendRemoteInput({type:'doubleclick',...point,button:0});
            }}
            onWheel={handleWheel}
            draggable={false}
          />:<div className={styles.previewEmpty}>
            <b>{selectedDevice.lightburn_online===false?'Abra o LightBurn no PC da máquina':'Conectando à tela do LightBurn…'}</b>
            <span>O primeiro quadro aparece assim que o Agent entra na sessão Realtime.</span>
          </div>}
        </div>

        <div className={styles.frameInfo}>
          <span>{frameSize||'—'}</span>
          <span>{frameLatency==null?'latência —':`latência ~${frameLatency} ms`}</span>
          <span>{frameAt?new Date(frameAt).toLocaleTimeString('pt-BR'):'—'}</span>
        </div>

        <div className={styles.controlHint}>
          <b>Controle por toque/mouse</b>
          <span>Em tela cheia: 1 toque clica, toque duplo abre/ativa, segurar faz clique direito, arrastar move no LightBurn e a pinça com 2 dedos amplia exatamente a área sob seus dedos.</span>
        </div>
      </div>}

      {tab==='control'&&<div className={styles.controlPane}>
        <div className={styles.commandGrid}>
          <button disabled={!canFrame||commandPending!==null} onClick={()=>void sendCommand('frame')}>
            <i>▣</i><b>Frame seleção</b><small>{canFrame?'Pronto':'Aguardando máquina parada'}</small>
          </button>
          <button disabled={!canStart||commandPending!==null} onClick={()=>void sendCommand('start')}>
            <i>▶</i><b>Iniciar</b><small>{canStart?'Pronto':'Aguardando máquina parada'}</small>
          </button>
          <button disabled={!canPause||commandPending!==null} onClick={()=>void sendCommand('pause')}>
            <i>Ⅱ</i><b>Pausar</b><small>{canPause?'Pronto':'Sem job em andamento'}</small>
          </button>
          <button className={styles.stop} disabled={!canStop||commandPending!==null} onClick={()=>void sendCommand('stop')}>
            <i>■</i><b>Parar</b><small>{canStop?'Pronto':'Máquina indisponível'}</small>
          </button>
        </div>
        {commandNotice&&<div className={styles.commandNotice}>{commandNotice}</div>}
        <div className={styles.controlDetail}>
          <b>Resposta rápida + confirmação</b>
          <p>O pedido é registrado, enviado pelo canal Realtime e confirmado pelo Agent. Se o canal cair, a fila curta continua servindo como fallback sem executar o mesmo comando duas vezes.</p>
        </div>
      </div>}

      {tab==='agent'&&<div className={styles.guide}>
        <div className={styles.downloadCard}>
          <div><small>WINDOWS 10/11 · 64 BITS</small><h3>DevinX Laser Agent 1.0.4</h3><p>Instala no usuário do Windows, inicia sozinho e pode ser removido pela própria bandeja.</p></div>
          <a href="https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.4/DevinX-Laser-Agent-1.0.4.zip" download>Baixar Agent</a>
        </div>

        <div className={styles.guideSteps}>
          <article><b>1. Baixe e extraia</b><p>Baixe o ZIP, clique com o botão direito e escolha Extrair tudo. Não execute o EXE de dentro do ZIP.</p></article>
          <article><b>2. Abra o Agent</b><p>Dê dois cliques em DevinXLaserAgent.exe. Na primeira execução ele copia os arquivos para a pasta local do usuário e passa a iniciar com o Windows.</p></article>
          <article><b>3. Vincule o PC</b><p>O navegador abre a página de vínculo do DevinX. Confirme o PC uma única vez. O vínculo fica salvo.</p></article>
          <article><b>4. Abra o LightBurn</b><p>Use o LightBurn normalmente no PC da máquina. O Agent detecta quando ele abre, fecha ou muda de estado.</p></article>
          <article><b>5. Controle à distância</b><p>No Laser Control escolha o PC. Em Ao vivo você vê a janela, usa zoom/orientação e, em tela cheia, pode habilitar toque/mouse/teclado. A aba Controle tem os botões dedicados.</p></article>
          <article><b>6. Para remover</b><p>No Windows, clique no ícone do DevinX Laser Agent perto do relógio e escolha Desinstalar DevinX Laser Agent. Ele remove inicialização automática, vínculo e arquivos locais.</p></article>
        </div>

        <details>
          <summary>Windows mostrou aviso de segurança?</summary>
          <p>Enquanto o Agent for distribuído fora da Microsoft Store e sem certificado pago, o Windows pode mostrar Editor desconhecido/SmartScreen. O DevinX não exige administrador. Para evitar custo de certificado, a distribuição assinada pela Microsoft Store fica como etapa de publicação, sem alterar o funcionamento do Agent.</p>
        </details>
        <details>
          <summary>Agent não apareceu perto do relógio</summary>
          <p>Abra a seta de ícones ocultos da barra do Windows. Se ele não estiver ali, execute DevinXLaserAgent.exe novamente. Um segundo clique não cria outro Agent: apenas abre o Laser Control.</p>
        </details>
        <details>
          <summary>Imagem não aparece</summary>
          <p>Confirme que o LightBurn está aberto e visível no PC da máquina. O Agent transmite somente a janela do LightBurn e encerra a transmissão quando a sessão remota fecha.</p>
        </details>

        <details className={styles.manualPair}>
          <summary>Vínculo manual de suporte</summary>
          <form onSubmit={claimPairing}>
            <label>Nome do PC<input value={deviceName} onChange={event=>setDeviceName(event.target.value)} maxLength={80}/></label>
            <label>Código<input value={pairingCode} onChange={event=>setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))} maxLength={8} placeholder="ABCD2345"/></label>
            <button disabled={pairingPending}>{pairingPending?'Vinculando…':'Vincular'}</button>
          </form>
        </details>
      </div>}
    </div>}

    {notice&&<div className={styles.notice}>{notice}</div>}
  </section>;
}
