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
import {useI18n} from '@/i18n/provider';

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
  connection_mode:'owned'|'mentor'|null;
  access_expires_at:string|null;
  mentor_session_id:string|null;
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

type LightBurnControlField={
  key:string;
  label:string;
  kind:'number'|'toggle';
  value:string|null;
  checked:boolean|null;
  writable:boolean;
};
type LightBurnControlLayer={
  id:string;
  label:string;
  selected:boolean;
};
type LightBurnControlSnapshot={
  windowTitle:string|null;
  layers:LightBurnControlLayer[];
  fields:LightBurnControlField[];
};

export function LaserControlWorkspace(){
  const{t}=useI18n();
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
  const[framingEngaged,setFramingEngaged]=useState(false);
  const[pairingCode,setPairingCode]=useState('');
  const[deviceName,setDeviceName]=useState('PC Oficina');
  const[pairingPending,setPairingPending]=useState(false);
  const[mentorCode,setMentorCode]=useState('');
  const[mentorPending,setMentorPending]=useState(false);
  const[mentorClosingId,setMentorClosingId]=useState<string|null>(null);
  const[toolPending,setToolPending]=useState<string|null>(null);
  const[controlDrawerOpen,setControlDrawerOpen]=useState(false);
  const[controlSnapshot,setControlSnapshot]=useState<LightBurnControlSnapshot|null>(null);
  const[controlDrafts,setControlDrafts]=useState<Record<string,string>>({});
  const[controlPending,setControlPending]=useState<string|null>(null);
  const[controlError,setControlError]=useState('');
  const[activeDialogTool,setActiveDialogTool]=useState<string|null>(null);
  const[mobileEditOpen,setMobileEditOpen]=useState(false);
  const[mobileEditValue,setMobileEditValue]=useState('');

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
  const fullscreenAutoInputRef=useRef(false);
  const mobileKeyboardRef=useRef<HTMLInputElement|null>(null);
  const inputReadyRef=useRef(false);
  const controlPendingRef=useRef<string|null>(null);

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
      if(!quiet)setNotice(t('laser.loadFail'));
    }finally{
      if(!quiet)setLoading(false);
    }
  },[t]);

  useEffect(()=>{
    void loadDevices();
    const timer=window.setInterval(()=>void loadDevices(true),2_000);
    return()=>window.clearInterval(timer);
  },[loadDevices]);

  useEffect(()=>{
    inputReadyRef.current=inputReady;
  },[inputReady]);

  const selectedDevice=useMemo(
    ()=>devices.find(device=>device.device_id===selectedDeviceId)??null,
    [devices,selectedDeviceId]
  );
  const ownedDevices=useMemo(()=>devices.filter(device=>device.connection_mode!=='mentor'),[devices]);
  const mentorDevices=useMemo(()=>devices.filter(device=>device.connection_mode==='mentor'),[devices]);

  useEffect(()=>{
    if(!selectedDevice){
      setFramingEngaged(false);
      return;
    }
    if(selectedDevice.job_state==='framing')setFramingEngaged(true);
    else if(selectedDevice.job_state==='idle')setFramingEngaged(false);
  },[selectedDeviceId,selectedDevice?.job_state]);

  const online=(device:LaserDevice)=>{
    if(!device.last_seen_at)return false;
    return Date.now()-Date.parse(device.last_seen_at)<25_000;
  };

  const supportsAdvancedControls=(version:string|null)=>{
    const match=/^1\.0\.(\d+)/.exec(version||'');
    return Boolean(match&&Number(match[1])>=17);
  };
  const advancedControlsReady=Boolean(selectedDevice&&supportsAdvancedControls(selectedDevice.agent_version));

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
        inputReadyRef.current=false;
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
      setControlSnapshot(null);
      setControlDrafts({});
      setControlPending(null);
      setControlError('');
      resetZoom();
      inputReadyRef.current=false;
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
        const receivedAt=Date.now();
        setFrameAt(receivedAt);
        setFrameLatency(Math.max(0,receivedAt-capturedAt));
        setRealtimeStatus('live');
      })
      .on('broadcast',{event:'agent_state'},({payload}:any)=>{
        if(payload?.token!==session.frameToken)return;
        if(payload?.state==='control-ready'){
          inputReadyRef.current=true;
          setInputReady(true);
        }
        if(payload?.state==='preview-ready'){
          inputReadyRef.current=false;
          setInputReady(false);
          setRealtimeStatus(current=>current==='live'?'live':'connecting');
        }
      })
      .on('broadcast',{event:'control_result'},({payload}:any)=>{
        if(payload?.token!==session.frameToken)return;
        const requestId=String(payload?.requestId||'');
        if(controlPendingRef.current===requestId)controlPendingRef.current=null;
        setControlPending(current=>current===requestId?null:current);

        if(!payload?.ok){
          const reason=String(payload?.reason||'');
          setControlError(
            /selected_layer_not_found|layer_not_found/.test(reason)
              ?t('laser.paramsNoLayer')
              :/field_not_found/.test(reason)
                ?t('laser.paramsNotFound')
                :t('laser.paramsReadFail')
          );
          return;
        }

        const raw=payload?.snapshot;
        if(!raw)return;
        const rawLayers=Array.isArray(raw?.layers)?raw.layers:Array.isArray(raw?.Layers)?raw.Layers:[];
        const rawFields=Array.isArray(raw?.fields)?raw.fields:Array.isArray(raw?.Fields)?raw.Fields:[];
        const snapshot:LightBurnControlSnapshot={
          windowTitle:String(raw?.windowTitle??raw?.WindowTitle??'')||null,
          layers:rawLayers.map((layer:any)=>({
            id:String(layer?.id??layer?.Id??''),
            label:String(layer?.label??layer?.Label??layer?.id??layer?.Id??''),
            selected:Boolean(layer?.selected??layer?.Selected)
          })).filter((layer:LightBurnControlLayer)=>layer.id),
          fields:rawFields.map((field:any)=>({
            key:String(field?.key??field?.Key??''),
            label:String(field?.label??field?.Label??field?.key??field?.Key??''),
            kind:String(field?.kind??field?.Kind)==='toggle'?'toggle':'number',
            value:field?.value??field?.Value??null,
            checked:field?.checked??field?.Checked??null,
            writable:Boolean(field?.writable??field?.Writable)
          })).filter((field:LightBurnControlField)=>field.key)
        };

        setControlError('');
        setControlSnapshot(snapshot);
        const nextDrafts:Record<string,string>={};
        for(const field of snapshot.fields)
          if(field.kind==='number')nextDrafts[field.key]=field.value??'';
        setControlDrafts(nextDrafts);
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
  },[session?.topic,session?.frameToken,t]);

  useEffect(()=>{
    const handle=()=>{
      const isFull=Boolean(document.fullscreenElement);
      setFullscreen(isFull);
      if(!isFull&&fullscreenAutoInputRef.current&&sessionRef.current?.remoteInputEnabled){
        fullscreenAutoInputRef.current=false;
        void disableRemoteInput();
      }
    };
    document.addEventListener('fullscreenchange',handle);
    return()=>document.removeEventListener('fullscreenchange',handle);
  },[]);

  async function enterFullscreen(){
    try{
      await previewSurfaceRef.current?.requestFullscreen();
      setFullscreen(true);
      previewSurfaceRef.current?.focus();

      const screenOrientation=(screen.orientation as any);
      if(orientation==='auto'){
        if(typeof screenOrientation?.unlock==='function')screenOrientation.unlock();
      }else if(typeof screenOrientation?.lock==='function'){
        try{await screenOrientation.lock(orientation)}catch{}
      }

      if(!inputReady){
        fullscreenAutoInputRef.current=true;
        await enableRemoteInput();
      }
    }catch{
      setNotice(t('laser.fullscreenDenied'));
    }
  }

  async function exitFullscreen(){
    try{
      if(fullscreenAutoInputRef.current&&sessionRef.current?.remoteInputEnabled){
        fullscreenAutoInputRef.current=false;
        await disableRemoteInput();
      }
      if(document.fullscreenElement)await document.exitFullscreen();
    }catch{}
  }

  async function setOrientationMode(mode:OrientationMode){
    setOrientation(mode);
    try{
      const screenOrientation=(screen.orientation as any);
      if(mode==='auto'){
        if(typeof screenOrientation?.unlock==='function')screenOrientation.unlock();
        return;
      }
      if(!document.fullscreenElement)return;
      if(typeof screenOrientation?.lock==='function')
        await screenOrientation.lock(mode);
    }catch{
      setNotice(t('laser.orientationDenied'));
    }
  }

  async function refreshRemoteSession(){
    if(!selectedDeviceId)return null;
    try{
      const data=await postSession({action:'renew',deviceId:selectedDeviceId});
      const current=sessionRef.current;
      const next={...current,...data} as RemoteSession;
      sessionRef.current=next;
      setSession(next);
      return next;
    }catch{
      return null;
    }
  }

  async function enableRemoteInput(){
    let current=sessionRef.current;
    if(!current)current=await refreshRemoteSession();
    if(!current){
      setNotice(t('laser.sessionExpired'));
      return;
    }
    setInputPending(true);
    inputReadyRef.current=false;
    setInputReady(false);
    try{
      const data=await postSession({action:'input',sessionId:current.sessionId,enabled:true});
      const next={...current,...data,remoteInputEnabled:Boolean(data?.enabled)} as RemoteSession;
      sessionRef.current=next;
      setSession(next);
      setNotice(t('laser.remoteActivating'));
    }catch{
      setNotice(t('laser.inputFailed'));
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
      inputReadyRef.current=false;
      setInputReady(false);
      setNotice(t('laser.inputBlocked'));
    }catch{
      inputReadyRef.current=false;
      setInputReady(false);
    }finally{
      setInputPending(false);
    }
  }

  function sendRemoteInput(payload:Record<string,unknown>){
    const current=sessionRef.current;
    if(!inputReadyRef.current||!current?.inputToken||!channelRef.current)return;
    void channelRef.current.send({
      type:'broadcast',
      event:'remote_input',
      payload:{token:current.inputToken,...payload}
    });
  }

  function sendRemoteKey(
    key:string,code:string,
    modifiers:{ctrl?:boolean;shift?:boolean;alt?:boolean;meta?:boolean}={}
  ){
    const payload={
      key,code,
      ctrl:Boolean(modifiers.ctrl),shift:Boolean(modifiers.shift),
      alt:Boolean(modifiers.alt),meta:Boolean(modifiers.meta)
    };
    sendRemoteInput({type:'keydown',...payload});
    window.setTimeout(()=>sendRemoteInput({type:'keyup',...payload}),45);
  }

  function openMobileKeyboard(){
    if(!inputReadyRef.current)return;
    setMobileEditValue('');
    setMobileEditOpen(true);
    const input=mobileKeyboardRef.current;
    if(input){
      input.value='';
      input.focus({preventScroll:true});
      input.select();
    }
  }

  function closeMobileKeyboard(){
    setMobileEditOpen(false);
    mobileKeyboardRef.current?.blur();
  }

  function sendMobileEdit(){
    const value=mobileEditValue;
    if(!value)return;
    sendRemoteKey('a','KeyA',{ctrl:true});
    window.setTimeout(()=>{
      sendRemoteInput({type:'text',key:value});
      window.setTimeout(()=>sendRemoteKey('Enter','Enter'),55);
    },70);
    closeMobileKeyboard();
  }

  function closeActiveDialog(){
    sendRemoteKey('Escape','Escape');
    setActiveDialogTool(null);
    window.setTimeout(()=>refreshParameters(),300);
  }

  function confirmActiveDialog(){
    sendRemoteKey('Enter','Enter');
    setActiveDialogTool(null);
    window.setTimeout(()=>refreshParameters(),300);
  }

  function sendControlRequest(
    action:'inspect'|'set'|'select_layer'|'open_layer'|'dialog_confirm'|'dialog_cancel'|'dialog_close',
    extra:Record<string,unknown>={}
  ){
    if(!advancedControlsReady){
      setControlError(t('laser.paramsAgentUpdate'));
      return;
    }
    const current=sessionRef.current;
    if(!inputReadyRef.current||!current?.inputToken||!channelRef.current){
      setControlError(t('laser.paramsNeedControl'));
      return;
    }
    const requestId=crypto.randomUUID();
    controlPendingRef.current=requestId;
    setControlPending(requestId);
    setControlError('');
    void channelRef.current.send({
      type:'broadcast',
      event:'control_request',
      payload:{token:current.inputToken,requestId,action,...extra}
    });
    window.setTimeout(()=>{
      if(controlPendingRef.current!==requestId)return;
      controlPendingRef.current=null;
      setControlPending(current=>current===requestId?null:current);
      setControlError(t('laser.paramsTimeout'));
    },4_500);
  }

  function refreshParameters(){
    sendControlRequest('inspect');
  }

  function setNumericParameter(field:LightBurnControlField){
    const value=(controlDrafts[field.key]??'').trim();
    if(!value)return;
    sendControlRequest('set',{field:field.key,value});
  }

  function setToggleParameter(field:LightBurnControlField,checked:boolean){
    sendControlRequest('set',{field:field.key,toggle:checked});
  }

  function selectLayer(layerId:string){
    sendControlRequest('select_layer',{layer:layerId});
  }

  function openLayerEditor(layerId?:string){
    sendControlRequest('open_layer',layerId?{layer:layerId}:{});
  }

  function confirmDialog(){
    sendControlRequest('dialog_confirm');
  }

  function cancelDialog(){
    sendControlRequest('dialog_cancel');
  }

  function closeDialog(){
    sendControlRequest('dialog_close');
  }

  async function ensureInputReady(){
    if(inputReadyRef.current)return true;
    if(inputPending)return false;
    await enableRemoteInput();
    for(let i=0;i<45;i++){
      if(inputReadyRef.current)return true;
      await new Promise(resolve=>window.setTimeout(resolve,100));
    }
    return false;
  }

  async function runShortcut(
    id:string,
    shortcut:{key:string;code:string;ctrl?:boolean;shift?:boolean;alt?:boolean}
  ){
    if(toolPending)return;
    setToolPending(id);
    try{
      if(!await ensureInputReady()){
        setNotice(t('laser.quickNeedControl'));
        return;
      }
      const payload={
        key:shortcut.key,
        code:shortcut.code,
        ctrl:Boolean(shortcut.ctrl),
        shift:Boolean(shortcut.shift),
        alt:Boolean(shortcut.alt),
        meta:false
      };
      sendRemoteInput({type:'keydown',...payload});
      await new Promise(resolve=>window.setTimeout(resolve,80));
      sendRemoteInput({type:'keyup',...payload});
      setNotice(t('laser.quickSent'));
      if(['preview','import','trace','adjust-image','rotary'].includes(id)){
        setActiveDialogTool(id);
      }
      if(['trace','adjust-image','rotary'].includes(id)){
        await new Promise(resolve=>window.setTimeout(resolve,650));
        refreshParameters();
      }
    }finally{
      setToolPending(null);
    }
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
    if(event.pointerType==='touch'&&!document.fullscreenElement)return;

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

        sendRemoteInput({type:'pointerdown',...point,button:0});
        sendRemoteInput({type:'pointerup',...point,button:0});
        if(isDouble){
          lastTapRef.current=null;
          openMobileKeyboard();
        }else{
          lastTapRef.current={at:now,clientX:event.clientX,clientY:event.clientY};
        }
      }
    }

    resetTouchGesture();
  }

  function handleWheel(event:ReactWheelEvent<HTMLImageElement>){
    if(!inputReady)return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const x=(event.clientX-rect.left)/rect.width;
    const y=(event.clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return;
    event.preventDefault();
    sendRemoteInput({type:'wheel',x,y,deltaY:event.deltaY});
  }

  function handleKey(event:ReactKeyboardEvent<HTMLDivElement>,type:'keydown'|'keyup'){
    if(!inputReady)return;
    if(['F5','F11','F12'].includes(event.code))return;
    event.preventDefault();
    sendRemoteInput({
      type,key:event.key,code:event.code,
      ctrl:event.ctrlKey,shift:event.shiftKey,alt:event.altKey,meta:event.metaKey
    });
  }

  async function sendCommand(command:LaserCommand){
    if(!selectedDevice||commandPending)return;

    if(command==='start'){
      if(!window.confirm('Iniciar a gravação agora? Confirme somente com a máquina pronta e supervisionada.'))return;
    }

    setCommandPending(command);
    setCommandNotice(t('laser.sent'));
    const pendingGuard=window.setTimeout(()=>{
      setCommandPending(null);
      void loadDevices(true);
    },12_000);

    try{
      const current=await refreshRemoteSession();
      if(!current){
        setCommandNotice(t('laser.sessionExpired'));
        return;
      }

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
          remote_session_not_found:t('laser.sessionExpired'),
          machine_not_connected:t('laser.unavailable'),
          machine_not_idle:t('laser.waitIdle'),
          not_running:t('laser.noJob')
        };
        setCommandNotice(labels[String(data?.error)]||t('laser.commandBlocked'));
        return;
      }

      const commandId=String(data?.commandId||'');
      if(!commandId){
        setCommandNotice('Comando sem confirmação.');
        return;
      }

      for(let i=0;i<100;i++){
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
          if(command==='frame')setFramingEngaged(value=>!value);
          if(command==='start'||command==='stop')setFramingEngaged(false);
          setCommandNotice(
            command==='start'?t('laser.startDone')
            :command==='pause'?t('laser.pauseDone')
            :command==='stop'?t('laser.stopDone')
            :t('laser.frameDone')
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

      setCommandNotice(t('laser.commandNoConfirm'));
    }catch{
      setCommandNotice(t('laser.commandFail'));
    }finally{
      window.clearTimeout(pendingGuard);
      setCommandPending(null);
      void loadDevices(true);
    }
  }

  function openControlDrawer(){
    setTab('control');
    setControlDrawerOpen(true);
    if(!inputReady&&!inputPending)void enableRemoteInput();
  }

  function closeControlDrawer(){
    setControlDrawerOpen(false);
    setTab('live');
  }

  async function claimPairing(event:FormEvent){
    event.preventDefault();
    const code=pairingCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length!==8){setNotice(t('laser.invalidCode'));return}

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
      setNotice(t('laser.pcLinked'));
      await loadDevices();
    }catch{
      setNotice('Falha ao vincular o PC.');
    }finally{
      setPairingPending(false);
    }
  }

  async function claimMentor(event:FormEvent){
    event.preventDefault();
    const code=mentorCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length!==8){setNotice(t('laser.invalidCode'));return}
    setMentorPending(true);
    try{
      const response=await fetch('/api/laser-control/mentor',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'claim',code}),
        cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok||!data?.claimed){
        const reason=String(data?.reason||'');
        setNotice(
          reason==='mentor_entitlement_required'?t('laser.mentorNoAccess')
          :reason==='concurrent_limit'?t('laser.mentorLimit')
          :t('laser.mentorExpired')
        );
        return;
      }
      setMentorCode('');
      setNotice(t('laser.mentorConnected'));
      await loadDevices();
      if(data?.deviceId)setSelectedDeviceId(String(data.deviceId));
    }catch{
      setNotice(t('laser.commandFail'));
    }finally{
      setMentorPending(false);
    }
  }

  async function closeMentor(sessionId:string){
    if(!sessionId||mentorClosingId)return;
    setMentorClosingId(sessionId);
    try{
      const response=await fetch('/api/laser-control/mentor',{
        method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'close',sessionId}),
        cache:'no-store'
      });
      if(response.ok){
        if(selectedDevice?.mentor_session_id===sessionId)setSelectedDeviceId(null);
        await loadDevices();
      }
    }finally{
      setMentorClosingId(null);
    }
  }

  const canOperate=Boolean(selectedDevice&&online(selectedDevice)
    &&selectedDevice.lightburn_online===true);
  const canStart=canOperate;
  const canFrame=canOperate;
  const canPause=canOperate;
  const canStop=canOperate;

  function deviceCard(device:LaserDevice){
    const mentor=device.connection_mode==='mentor';
    return <div key={device.device_id} className={styles.deviceCard} data-selected={selectedDeviceId===device.device_id} data-mode={mentor?'mentor':'owned'}>
      <button className={styles.deviceSelect} type="button" onClick={()=>setSelectedDeviceId(device.device_id)}>
        <i data-online={online(device)}></i>
        <span>
          <b>{device.display_name}</b>
          <small>Agent {device.agent_version||'—'} · {online(device)?'online':'offline'}</small>
          {mentor&&<em>{t('laser.mentorActive')}</em>}
        </span>
      </button>
      {mentor&&device.mentor_session_id&&<button
        className={styles.mentorEnd}
        type="button"
        disabled={mentorClosingId===device.mentor_session_id}
        onClick={()=>void closeMentor(device.mentor_session_id!)}
      >{mentorClosingId===device.mentor_session_id?t('laser.mentorClosing'):t('laser.mentorClose')}</button>}
    </div>
  }

  return <section className={styles.shell}>
    <div className={styles.top}>
      <div>
        <small>{t('laser.eyebrow')}</small>
        <h2>{t('laser.title')}</h2>
        <p>{t('laser.desc')}</p>
      </div>
      <div className={styles.liveBadge} data-live={realtimeStatus==='live'}>
        <i></i>{
          realtimeStatus==='live'?t('laser.live')
          :realtimeStatus==='connecting'?t('laser.connecting')
          :realtimeStatus==='error'?t('laser.error')
          :t('laser.waiting')
        }
      </div>
    </div>

    <aside className={styles.deviceStrip}>
      <form className={styles.mentorConnect} onSubmit={claimMentor}>
        <span>{t('laser.mentoring')}</span>
        <b>{t('laser.mentorTitle')}</b>
        <p>{t('laser.mentorDesc')}</p>
        <div>
          <input
            value={mentorCode}
            onChange={event=>setMentorCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            placeholder="ABCD2345"
            aria-label={t('laser.mentorCode')}
          />
          <button disabled={mentorPending||mentorCode.length!==8}>
            {mentorPending?t('laser.mentorConnecting'):t('laser.mentorConnect')}
          </button>
        </div>
      </form>

      <div className={styles.deviceGroup}>
        <div className={styles.groupTitle}><span>{t('laser.mine')}</span><small>{ownedDevices.length}</small></div>
        {loading&&<span className={styles.emptyDevice}>…</span>}
        {!loading&&ownedDevices.length===0&&<span className={styles.emptyDevice}>{t('laser.noPc')}</span>}
        {ownedDevices.map(deviceCard)}
      </div>

      <div className={styles.deviceGroup}>
        <div className={styles.groupTitle}><span>{t('laser.mentoring')}</span><small>{mentorDevices.length}</small></div>
        {!loading&&mentorDevices.length===0&&<span className={styles.emptyDevice}>{t('laser.noMentor')}</span>}
        {mentorDevices.map(deviceCard)}
      </div>
    </aside>

    {selectedDevice?<div className={styles.workspace}>
      <div className={styles.summary}>
        <span><small>{t('laser.lightburn')}</small><b>{selectedDevice.lightburn_online===true?t('laser.connected'):selectedDevice.lightburn_online===false?t('laser.closed'):'—'}</b></span>
        <span><small>{t('laser.machine')}</small><b>{selectedDevice.machine_connected===true?(selectedDevice.machine_name||t('laser.connected')):selectedDevice.machine_connected===false?t('laser.disconnected'):'—'}</b></span>
        <span><small>{t('laser.job')}</small><b>{selectedDevice.job_state||'—'}</b></span>
        <span><small>{t('laser.progress')}</small><b>{selectedDevice.progress_permille==null?'—':(selectedDevice.progress_permille/10).toFixed(1)+'%'}</b></span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Laser Control">
        <button
          type="button"
          role="tab"
          aria-selected={tab==='live'}
          className={tab==='live'?styles.activeTab:''}
          onClick={()=>{setTab('live');setControlDrawerOpen(false)}}
        ><span className={styles.tabIcon}>◉</span><span>{t('laser.tabLive')}</span></button>
        <button
          type="button"
          role="tab"
          aria-selected={tab==='control'}
          className={tab==='control'?styles.activeTab:''}
          onClick={openControlDrawer}
        ><span className={styles.tabIcon}>⌘</span><span>{t('laser.tabControl')}</span></button>
        <button
          type="button"
          role="tab"
          aria-selected={tab==='agent'}
          className={tab==='agent'?styles.activeTab:''}
          onClick={()=>setTab('agent')}
        ><span className={styles.tabIcon}>⚙</span><span>{t('laser.tabAgent')}</span></button>
      </div>

      {tab!=='agent'&&<div className={styles.livePane}>
        <div className={styles.liveToolbar}>
          <div className={styles.zoom}>
            <button onClick={()=>setZoom(value=>Math.max(.75,Math.round((value-.25)*100)/100))}>−</button>
            <button title={t('laser.zoomReset')} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button onClick={()=>setZoom(value=>Math.min(3,Math.round((value+.25)*100)/100))}>＋</button>
          </div>
          <div className={styles.orientation}>
            <button className={orientation==='auto'?styles.on:''} onClick={()=>void setOrientationMode('auto')}>{t('laser.auto')}</button>
            <button className={orientation==='landscape'?styles.on:''} onClick={()=>void setOrientationMode('landscape')}>{t('laser.landscape')}</button>
            <button className={orientation==='portrait'?styles.on:''} onClick={()=>void setOrientationMode('portrait')}>{t('laser.portrait')}</button>
          </div>
          <button
            className={inputReady?styles.controlOn:styles.controlOff}
            disabled={inputPending||Boolean(session?.remoteInputEnabled&&!inputReady)}
            onClick={()=>{
              fullscreenAutoInputRef.current=false;
              void (inputReady?disableRemoteInput():enableRemoteInput());
            }}
          >{
            inputPending?t('laser.remoteActivating')
            :inputReady?t('laser.remoteOn')
            :session?.remoteInputEnabled?t('laser.remoteConnecting')
            :t('laser.remoteOff')
          }</button>
          <button className={styles.fullscreenButton} onClick={()=>void enterFullscreen()}>{t('laser.fullscreen')}</button>
        </div>

        <div
          ref={previewSurfaceRef}
          className={[styles.previewSurface,inputReady?styles.remoteControlSurface:''].filter(Boolean).join(' ')}
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
                <button className={orientation==='auto'?styles.on:''} onClick={()=>void setOrientationMode('auto')}>{t('laser.auto')}</button>
                <button className={orientation==='landscape'?styles.on:''} onClick={()=>void setOrientationMode('landscape')}>{t('laser.landscape')}</button>
                <button className={orientation==='portrait'?styles.on:''} onClick={()=>void setOrientationMode('portrait')}>{t('laser.portrait')}</button>
              </div>
              <button
                className={inputReady?styles.controlOn:styles.controlOff}
                disabled={inputPending||Boolean(session?.remoteInputEnabled&&!inputReady)}
                onClick={()=>{
                  fullscreenAutoInputRef.current=false;
                  void (inputReady?disableRemoteInput():enableRemoteInput());
                }}
              >{inputReady?t('laser.remoteOn'):t('laser.remoteOff')}</button>
              {activeDialogTool&&<>
                <button className={styles.dialogOk} onClick={confirmActiveDialog}>OK</button>
                <button className={styles.dialogClose} onClick={closeActiveDialog}>ESC</button>
              </>}
              <button onClick={()=>void exitFullscreen()}>{t('laser.fullscreenClose')}</button>
            </>}
          </div>

          {frameSrc?<img
            ref={imageRef}
            src={frameSrc}
            alt="LightBurn"
            style={fullscreen
              ?{transform:`scale(${zoom})`,transformOrigin:`${zoomOrigin.x*100}% ${zoomOrigin.y*100}%`}
              :{transform:`scale(${zoom})`,transformOrigin:'center center'}}
            className={inputReady?styles.remoteImageActive:styles.remoteImage}
            onPointerDown={event=>handlePointer(event,'pointerdown')}
            onPointerUp={event=>handlePointer(event,'pointerup')}
            onPointerMove={event=>handlePointer(event,'pointermove')}
            onPointerCancel={event=>handlePointer(event,'pointercancel')}
            onContextMenu={event=>event.preventDefault()}
            onWheel={handleWheel}
            draggable={false}
          />:<div className={styles.previewEmpty}>
            <b>{selectedDevice.lightburn_online===false?t('laser.previewOpen'):t('laser.previewWaiting')}</b>
            <span>{t('laser.previewHelp')}</span>
          </div>}
          <div className={mobileEditOpen?styles.mobileKeyboard:styles.mobileKeyboardHidden}>
            <input
              ref={mobileKeyboardRef}
              type="text"
              inputMode="text"
              enterKeyHint="done"
              value={mobileEditValue}
              onChange={event=>setMobileEditValue(event.target.value)}
              onKeyDown={event=>{
                if(event.key==='Enter'){
                  event.preventDefault();
                  sendMobileEdit();
                }
              }}
              aria-label="Digitar no LightBurn"
              placeholder="Digite valor ou texto"
            />
            <button type="button" onClick={sendMobileEdit} disabled={!mobileEditValue}>Enviar</button>
            <button type="button" onClick={closeMobileKeyboard}>Cancelar</button>
          </div>
        </div>

        <div className={styles.frameInfo}>
          <span>{frameSize||'—'}</span>
          <span>{frameLatency==null?'—':`${t('laser.latency')} ~${frameLatency} ms`}</span>
          <span>{frameAt?new Date(frameAt).toLocaleTimeString():'—'}</span>
        </div>

        <section className={styles.controlDrawer}>
          <button
            type="button"
            className={styles.drawerToggle}
            aria-expanded={controlDrawerOpen}
            onClick={()=>controlDrawerOpen?closeControlDrawer():openControlDrawer()}
          >
            <span><i>⌘</i><b>{t('laser.controlsTitle')}</b><small>{t('laser.controlsHelp')}</small></span>
            <strong>{controlDrawerOpen?t('laser.controlsCollapse'):t('laser.controlsExpand')}</strong>
          </button>

          {controlDrawerOpen&&<div className={styles.controlDrawerBody}>

        <div className={styles.commandGrid}>
          <button disabled={!canFrame||commandPending!==null} onClick={()=>void sendCommand('frame')}>
            <i>▣</i><b>{t('laser.frame')}</b><small>{canFrame?((framingEngaged||selectedDevice?.job_state==='framing')?t('laser.frameClose'):t('laser.frameOpen')):t('laser.waitIdle')}</small>
          </button>
          <button disabled={!canStart||commandPending!==null} onClick={()=>void sendCommand('start')}>
            <i>▶</i><b>{t('laser.start')}</b><small>{canStart?t('laser.ready'):t('laser.waitIdle')}</small>
          </button>
          <button disabled={!canPause||commandPending!==null} onClick={()=>void sendCommand('pause')}>
            <i>Ⅱ</i><b>{t('laser.pause')}</b><small>{canPause?t('laser.ready'):t('laser.noJob')}</small>
          </button>
          <button className={styles.stop} disabled={!canStop||commandPending!==null} onClick={()=>void sendCommand('stop')}>
            <i>■</i><b>{t('laser.stop')}</b><small>{canStop?t('laser.ready'):t('laser.unavailable')}</small>
          </button>
        </div>
        {commandNotice&&<div className={styles.commandNotice}>{commandNotice}</div>}


        <section className={styles.parameterDock}>
          <div className={styles.parameterHead}>
            <div>
              <small>LIGHTBURN · CUTS / LAYERS</small>
              <h3>{t('laser.paramsTitle')}</h3>
              <p>{t('laser.paramsHelp')}</p>
            </div>
            <div className={styles.parameterActions}>
              <button type="button" disabled={!advancedControlsReady||!inputReady||Boolean(controlPending)} onClick={refreshParameters}>
                {controlPending?t('laser.paramsReading'):t('laser.paramsRefresh')}
              </button>
              <button
                type="button"
                disabled={!advancedControlsReady||!inputReady||Boolean(controlPending)}
                onClick={()=>openLayerEditor(controlSnapshot?.layers?.find(layer=>layer.selected)?.id)}
              >{t('laser.paramsOpenLayer')}</button>
              {(activeDialogTool||(controlSnapshot?.windowTitle&&controlSnapshot.windowTitle!=='LightBurn'))&&<>
                <button type="button" onClick={confirmActiveDialog}>OK / Enter</button>
                <button type="button" onClick={closeActiveDialog}>Fechar / Esc</button>
              </>}
            </div>
          </div>

          {!advancedControlsReady?<div className={styles.parameterGate}>
            <b>{t('laser.paramsAgentUpdate')}</b>
            <a href="https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.20/DevinX-Laser-Agent-1.0.20.zip">{t('laser.download')}</a>
          </div>:!inputReady&&<div className={styles.parameterGate}>
            <b>{t('laser.paramsNeedControl')}</b>
            <button
              type="button"
              disabled={inputPending}
              onClick={()=>{fullscreenAutoInputRef.current=false;void enableRemoteInput()}}
            >{inputPending?t('laser.remoteActivating'):t('laser.remoteOff')}</button>
          </div>}

          {advancedControlsReady&&inputReady&&controlSnapshot&&<>
            <div className={styles.layerBar}>
              <label>
                <span>{t('laser.paramsLayer')}</span>
                <select
                  value={controlSnapshot.layers.find(layer=>layer.selected)?.id??''}
                  onChange={event=>selectLayer(event.target.value)}
                  disabled={Boolean(controlPending)||controlSnapshot.layers.length===0}
                >
                  {controlSnapshot.layers.length===0&&<option value="">{t('laser.paramsNoLayer')}</option>}
                  {controlSnapshot.layers.map(layer=><option key={layer.id} value={layer.id}>{layer.label}</option>)}
                </select>
              </label>
              <small>{controlSnapshot.windowTitle||'LightBurn'}</small>
            </div>

            {controlSnapshot.fields.length>0?<div className={styles.parameterGrid}>
              {controlSnapshot.fields.map(field=><div className={styles.parameterField} key={field.key}>
                <label>{field.label}</label>
                {field.kind==='toggle'?<button
                  type="button"
                  className={field.checked?styles.toggleOn:styles.toggleOff}
                  disabled={!field.writable||Boolean(controlPending)}
                  onClick={()=>setToggleParameter(field,!Boolean(field.checked))}
                ><i></i><span>{field.checked?t('laser.paramsOn'):t('laser.paramsOff')}</span></button>:<div className={styles.numberEditor}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={controlDrafts[field.key]??field.value??''}
                    disabled={!field.writable||Boolean(controlPending)}
                    onChange={event=>setControlDrafts(current=>({...current,[field.key]:event.target.value}))}
                    onKeyDown={event=>{
                      if(event.key==='Enter'){
                        event.preventDefault();
                        setNumericParameter(field);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!field.writable||Boolean(controlPending)}
                    onClick={()=>setNumericParameter(field)}
                  >{t('laser.paramsApply')}</button>
                </div>}
              </div>)}
            </div>:<div className={styles.parameterEmpty}>
              <b>{t('laser.paramsNotFound')}</b>
              <span>{t('laser.paramsNotFoundHelp')}</span>
            </div>}
          </>}

          {advancedControlsReady&&inputReady&&!controlSnapshot&&!controlPending&&<div className={styles.parameterEmpty}>
            <b>{t('laser.paramsReady')}</b>
            <span>{t('laser.paramsReadyHelp')}</span>
          </div>}
          {controlError&&<div className={styles.parameterError}>{controlError}</div>}
        </section>


            <details className={styles.extraTools}>
              <summary>{t('laser.extraTools')}</summary>
        <section className={styles.quickSection}>
          <div className={styles.sectionHeading}>
            <div><small>LIGHTBURN</small><h3>{t('laser.quickTools')}</h3></div>
            <p>{t('laser.quickHelp')}</p>
          </div>

          <div className={styles.quickGroups}>
            <article className={styles.quickGroup}>
              <header><b>{t('laser.projectTools')}</b><span>{t('laser.projectToolsHint')}</span></header>
              <div className={styles.quickGrid}>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('select',{key:'a',code:'KeyA',ctrl:true})}><i>⌁</i><span>{t('laser.selectAll')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('save',{key:'s',code:'KeyS',ctrl:true})}><i>▣</i><span>{t('laser.saveProject')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('preview',{key:'p',code:'KeyP',alt:true})}><i>◉</i><span>{t('laser.previewProject')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('import',{key:'i',code:'KeyI',ctrl:true})}><i>↥</i><span>{t('laser.importPc')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('undo',{key:'z',code:'KeyZ',ctrl:true})}><i>↶</i><span>{t('laser.undo')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('redo',{key:'z',code:'KeyZ',ctrl:true,shift:true})}><i>↷</i><span>{t('laser.redo')}</span></button>
              </div>
            </article>

            <article className={styles.quickGroup}>
              <header><b>{t('laser.transformTools')}</b><span>{t('laser.transformToolsHint')}</span></header>
              <div className={styles.quickGrid}>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('flip-h',{key:'h',code:'KeyH',ctrl:true,shift:true})}><i>↔</i><span>{t('laser.flipH')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('flip-v',{key:'v',code:'KeyV',ctrl:true,shift:true})}><i>↕</i><span>{t('laser.flipV')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('center',{key:'p',code:'KeyP'})}><i>⊙</i><span>{t('laser.centerPage')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('left',{key:'ArrowLeft',code:'ArrowLeft'})}><i>←</i><span>{t('laser.moveLeft')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('right',{key:'ArrowRight',code:'ArrowRight'})}><i>→</i><span>{t('laser.moveRight')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('up',{key:'ArrowUp',code:'ArrowUp'})}><i>↑</i><span>{t('laser.moveUp')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('down',{key:'ArrowDown',code:'ArrowDown'})}><i>↓</i><span>{t('laser.moveDown')}</span></button>
              </div>
            </article>

            <article className={styles.quickGroup}>
              <header><b>{t('laser.imageTools')}</b><span>{t('laser.imageToolsHint')}</span></header>
              <div className={styles.quickGrid}>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('trace',{key:'t',code:'KeyT',alt:true})}><i>⌇</i><span>{t('laser.traceImage')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('adjust-image',{key:'i',code:'KeyI',alt:true})}><i>◐</i><span>{t('laser.adjustImage')}</span></button>
                <button disabled={toolPending!==null} onClick={()=>void runShortcut('rotary',{key:'r',code:'KeyR',ctrl:true,shift:true})}><i>⟳</i><span>{t('laser.rotarySetup')}</span></button>
              </div>
            </article>
          </div>
        </section>


            </details>
        <div className={styles.controlDetail}>
          <b>SAFE CONTROL</b>
          <p>{t('laser.commandSafety')}</p>
        </div>

        <div className={styles.controlHint}>
          <b>{t('laser.inputTitle')}</b>
          <span>{t('laser.inputHint')}</span>
        </div>

          </div>}
        </section>
      </div>}

      {tab==='agent'&&<div className={styles.guide}>
        <div className={styles.downloadCard}>
          <div><small>WINDOWS 10/11 · 64 BITS</small><h3>{t('laser.agentTitle')}</h3><p>{t('laser.agentDesc')}</p></div>
          <a href="https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.20/DevinX-Laser-Agent-1.0.20.zip" download>{t('laser.download')}</a>
        </div>

        <div className={styles.agentModes}>
          <article><i>∞</i><div><b>{t('laser.permanentTitle')}</b><p>{t('laser.permanentDesc')}</p></div></article>
          <article><i>⌁</i><div><b>{t('laser.temporaryTitle')}</b><p>{t('laser.temporaryDesc')}</p></div></article>
        </div>
        <div className={styles.licenseNote}>{t('laser.agentSafety')}</div>

        <div className={styles.guideSteps}>
          <article><b>{t('laser.guide1t')}</b><p>{t('laser.guide1d')}</p></article>
          <article><b>{t('laser.guide2t')}</b><p>{t('laser.guide2d')}</p></article>
          <article><b>{t('laser.guide3t')}</b><p>{t('laser.guide3d')}</p></article>
          <article><b>{t('laser.guide4t')}</b><p>{t('laser.guide4d')}</p></article>
          <article><b>{t('laser.guide5t')}</b><p>{t('laser.guide5d')}</p></article>
          <article><b>{t('laser.guide6t')}</b><p>{t('laser.guide6d')}</p></article>
        </div>

        <details className={styles.manualPair}>
          <summary>{t('laser.permanentTitle')} · {t('laser.pair')}</summary>
          <form onSubmit={claimPairing}>
            <label>{t('laser.pairName')}<input value={deviceName} onChange={event=>setDeviceName(event.target.value)} maxLength={80}/></label>
            <label>{t('laser.pairCode')}<input value={pairingCode} onChange={event=>setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))} maxLength={8} placeholder="ABCD2345"/></label>
            <button disabled={pairingPending}>{pairingPending?t('laser.pairing'):t('laser.pair')}</button>
          </form>
        </details>
      </div>}
    </div>:<div className={styles.workspaceEmpty}>
      <div><small>{t('laser.eyebrow')}</small><b>{t('laser.previewWaiting')}</b><span>{t('laser.noPc')}</span></div>
    </div>}

    {notice&&<div className={styles.notice}>{notice}</div>}
  </section>;
}
