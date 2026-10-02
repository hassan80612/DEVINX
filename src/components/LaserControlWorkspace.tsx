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
import {LanguageMenu} from '@/components/LanguageMenu';
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

type PcCapacity={
  max_pcs:number;
  active_pcs:number;
  extra_pcs:number;
  expires_at:string|null;
};

type LaserCommand='frame'|'start'|'pause'|'stop';
type OrientationMode='auto'|'landscape'|'portrait';

const MENTOR_SHARE_LINK='https://devinx.com.br/laser-control/mentoria';
const DEVICE_REFRESH_MS=15_000;
const SESSION_RENEW_MS=20_000;
const DEVICE_REQUEST_MIN_GAP_MS=2_000;

const WORKSPACE_NAV={
  'pt-BR':{home:'Home',guide:'Guia',support:'Suporte',signOut:'Sair',addStudent:'Adicionar +1 aluno',studentNote:'O adicional libera 1 nova conexão de mentoria no ciclo atual. Cada sessão pode durar até 6 horas e expira junto com o plano.',mentorUnlimited:'Alunos ilimitados no Mentor · 1 atendimento ativo por vez · até 6 horas por sessão.',mentorLocked:'MENTORIA',mentorAvailable:'Mentoria disponível no plano Mentor',mentorLockedText:'O Mentor inclui alunos ilimitados. No Control, você pode liberar um aluno avulso quando precisar.',mentorView:'Ver plano Mentor',controlStudentTitle:'Precisa atender um aluno?',controlStudentText:'Seu Control pode liberar 1 aluno avulso sem trocar de plano.',pcTag:'PC ADICIONAL',pcDescription:'Cada compra acrescenta +1 PC ao limite do seu Control ou Mentor somente até o fim do período atual. A renovação do plano não renova este adicional.',addPc:'Adicionar +1 PC',pcSmall:'Pode repetir a compra quantas vezes precisar neste período. O adicional exige um plano principal ativo.'},
  en:{home:'Home',guide:'Guide',support:'Support',signOut:'Sign out',addStudent:'Add +1 student',studentNote:'The add-on unlocks 1 new mentoring connection in the current cycle. Each session can last up to 6 hours and expires with the plan.',mentorUnlimited:'Unlimited students with Mentor · 1 active mentoring session at a time · up to 6 hours per session.',mentorLocked:'MENTORING',mentorAvailable:'Mentoring is included with Mentor',mentorLockedText:'Mentor includes unlimited students. Control can unlock one student when needed.',mentorView:'View Mentor plan',controlStudentTitle:'Need to help a student?',controlStudentText:'Your Control plan can unlock 1 student without switching plans.',pcTag:'EXTRA PC',pcDescription:'Each purchase adds +1 PC to your Control or Mentor limit until the current plan period ends. Renewal does not renew this add-on.',addPc:'Add +1 PC',pcSmall:'Repeat the purchase as needed during this period. An active main plan is required.'},
  es:{home:'Inicio',guide:'Guía',support:'Soporte',signOut:'Salir',addStudent:'Añadir +1 alumno',studentNote:'El adicional libera 1 nueva conexión de mentoría en el ciclo actual. Cada sesión puede durar hasta 6 horas y vence con el plan.',mentorUnlimited:'Alumnos ilimitados con Mentor · 1 sesión activa a la vez · hasta 6 horas por sesión.',mentorLocked:'MENTORÍA',mentorAvailable:'Mentoría incluida con Mentor',mentorLockedText:'Mentor incluye alumnos ilimitados. Control puede liberar un alumno cuando lo necesites.',mentorView:'Ver plan Mentor',controlStudentTitle:'¿Necesitas atender a un alumno?',controlStudentText:'Tu plan Control puede liberar 1 alumno sin cambiar de plan.',pcTag:'PC ADICIONAL',pcDescription:'Cada compra añade +1 PC al límite de Control o Mentor hasta el final del período actual. La renovación no renueva este adicional.',addPc:'Añadir +1 PC',pcSmall:'Puedes repetir la compra durante el período. Requiere un plan principal activo.'},
  fr:{home:'Accueil',guide:'Guide',support:'Support',signOut:'Déconnexion',addStudent:'Ajouter +1 élève',studentNote:'L’option débloque 1 nouvelle connexion de mentorat pendant la période actuelle. Chaque session peut durer jusqu’à 6 heures et expire avec le plan.',mentorUnlimited:'Élèves illimités avec Mentor · 1 session active à la fois · jusqu’à 6 heures par session.',mentorLocked:'MENTORAT',mentorAvailable:'Mentorat inclus avec Mentor',mentorLockedText:'Mentor inclut des élèves illimités. Control peut débloquer un élève selon vos besoins.',mentorView:'Voir le plan Mentor',controlStudentTitle:'Besoin d’aider un élève ?',controlStudentText:'Votre plan Control peut débloquer 1 élève sans changer de plan.',pcTag:'PC SUPPLÉMENTAIRE',pcDescription:'Chaque achat ajoute +1 PC à la limite Control ou Mentor jusqu’à la fin de la période actuelle. Le renouvellement ne renouvelle pas cet ajout.',addPc:'Ajouter +1 PC',pcSmall:'Vous pouvez répéter l’achat pendant la période. Un plan principal actif est requis.'},
  de:{home:'Startseite',guide:'Anleitung',support:'Support',signOut:'Abmelden',addStudent:'+1 Schüler hinzufügen',studentNote:'Das Add-on schaltet 1 neue Mentoring-Verbindung im aktuellen Zeitraum frei. Jede Sitzung kann bis zu 6 Stunden dauern und läuft mit dem Plan ab.',mentorUnlimited:'Unbegrenzte Schüler mit Mentor · 1 aktive Sitzung gleichzeitig · bis zu 6 Stunden pro Sitzung.',mentorLocked:'MENTORING',mentorAvailable:'Mentoring ist im Mentor-Plan enthalten',mentorLockedText:'Mentor umfasst unbegrenzte Schüler. Mit Control können Sie bei Bedarf einen Schüler freischalten.',mentorView:'Mentor-Plan ansehen',controlStudentTitle:'Müssen Sie einen Schüler unterstützen?',controlStudentText:'Ihr Control-Plan kann 1 Schüler freischalten, ohne den Plan zu wechseln.',pcTag:'ZUSÄTZLICHER PC',pcDescription:'Jeder Kauf erhöht das Control- oder Mentor-Limit bis zum Ende des aktuellen Zeitraums um +1 PC. Die Verlängerung erneuert dieses Add-on nicht.',addPc:'+1 PC hinzufügen',pcSmall:'Der Kauf kann in diesem Zeitraum wiederholt werden. Ein aktiver Hauptplan ist erforderlich.'},
  ar:{home:'الرئيسية',guide:'الدليل',support:'الدعم',signOut:'تسجيل الخروج',addStudent:'إضافة طالب +1',studentNote:'تفتح الإضافة اتصال إرشاد جديداً واحداً خلال الدورة الحالية. يمكن أن تستمر كل جلسة حتى 6 ساعات وتنتهي مع الخطة.',mentorUnlimited:'طلاب غير محدودين مع Mentor · جلسة إرشاد نشطة واحدة في الوقت نفسه · حتى 6 ساعات للجلسة.',mentorLocked:'الإرشاد',mentorAvailable:'الإرشاد مشمول في خطة Mentor',mentorLockedText:'تتضمن Mentor طلاباً غير محدودين. ويمكن لـ Control فتح طالب واحد عند الحاجة.',mentorView:'عرض خطة Mentor',controlStudentTitle:'تحتاج إلى مساعدة طالب؟',controlStudentText:'يمكن لخطة Control فتح طالب واحد من دون تغيير الخطة.',pcTag:'كمبيوتر إضافي',pcDescription:'كل عملية شراء تضيف كمبيوتر واحداً إلى حد Control أو Mentor حتى نهاية الفترة الحالية. التجديد لا يجدد هذه الإضافة.',addPc:'إضافة كمبيوتر +1',pcSmall:'يمكن تكرار الشراء خلال الفترة. يلزم وجود خطة رئيسية نشطة.'}
} as const;

const MOBILE_KEY_ROWS=[
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
  ['á','é','í','ó','ú','ã','õ','ç','-','_','.',',','/','@']
] as const;

export function LaserControlWorkspace(){
  const{t,locale}=useI18n();
  const nav=WORKSPACE_NAV[locale];
  const internationalPricing=locale!=='pt-BR';
  const[devices,setDevices]=useState<LaserDevice[]>([]);
  const[selectedDeviceId,setSelectedDeviceId]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[notice,setNotice]=useState('');
  const[tab,setTab]=useState<'live'|'agent'>('live');

  const[session,setSession]=useState<RemoteSession|null>(null);
  const[realtimeStatus,setRealtimeStatus]=useState<'idle'|'connecting'|'live'|'error'>('idle');
  const[frameSrc,setFrameSrc]=useState('');
  const[frameSize,setFrameSize]=useState('');
  const[frameLatency,setFrameLatency]=useState<number|null>(null);
  const[frameAt,setFrameAt]=useState<number|null>(null);
  const[webRtcStream,setWebRtcStream]=useState<MediaStream|null>(null);
  const[webRtcActive,setWebRtcActive]=useState(false);
  const[zoom,setZoom]=useState(1);
  const[pan,setPan]=useState({x:0,y:0});
  const zoomRef=useRef(1);
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
  const[mentorNotice,setMentorNotice]=useState('');
  const[mentorAccess,setMentorAccess]=useState(false);
  const[planId,setPlanId]=useState<string|null>(null);
  const[ownerAccess,setOwnerAccess]=useState(false);
  const[pcCapacity,setPcCapacity]=useState<PcCapacity|null>(null);
  const[mentorClosingId,setMentorClosingId]=useState<string|null>(null);
  const[toolPending,setToolPending]=useState<string|null>(null);
  const[toolPanelOpen,setToolPanelOpen]=useState(false);
  const[controlPending,setControlPending]=useState<string|null>(null);
  const[activeDialogTool,setActiveDialogTool]=useState<string|null>(null);
  const[mobileEditOpen,setMobileEditOpen]=useState(false);
  const[keyboardShift,setKeyboardShift]=useState(false);
  const[rightClickArmed,setRightClickArmed]=useState(false);

  const channelRef=useRef<any>(null);
  const previewSurfaceRef=useRef<HTMLDivElement|null>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const sessionRef=useRef<RemoteSession|null>(null);
  const lastFrameSeqRef=useRef(0);
  const lastPointerMoveRef=useRef(0);
  const touchPointsRef=useRef(new Map<number,{x:number;y:number}>());
  const touchGestureRef=useRef<{
    pinching:boolean;
    lastPinchDistance:number;
    suppressAfterPinch:boolean;
    singlePointerId:number|null;
    startClientX:number;
    startClientY:number;
    startPoint:{x:number;y:number}|null;
    remoteDown:boolean;
    moved:boolean;
    rightClickSent:boolean;
    startPanX:number;
    startPanY:number;
    longPressTimer:number|undefined;
  }>({
    pinching:false,lastPinchDistance:0,suppressAfterPinch:false,singlePointerId:null,
    startClientX:0,startClientY:0,startPoint:null,
    remoteDown:false,moved:false,rightClickSent:false,startPanX:0,startPanY:0,longPressTimer:undefined
  });
  const lastTapRef=useRef<{at:number;clientX:number;clientY:number}|null>(null);
  const inputReadyRef=useRef(false);
  const controlPendingRef=useRef<string|null>(null);
  const pendingInputResultsRef=useRef(new Map<string,(result:{ok:boolean;reason:string|null})=>void>());
  const mobileEditPrepareRef=useRef<Promise<{ok:boolean;reason:string|null}>|null>(null);
  const devicesBusyRef=useRef(false);
  const lastDevicesLoadAtRef=useRef(0);

  async function signOutLaser(){
    const supabase=createClient();
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  useEffect(()=>{
    const supabase=createClient();

    async function loadAccessMeta(){
      const[accessResult,capacityResult]=await Promise.all([
        supabase.rpc('get_laser_access_status'),
        supabase.rpc('get_laser_pc_capacity')
      ]);
      const accessData=accessResult?.data;
      const accessRow=Array.isArray(accessData)?accessData[0]:accessData;
      setMentorAccess(Boolean(accessRow?.mentor_access||accessRow?.is_admin));
      setPlanId(typeof accessRow?.plan_id==='string'?accessRow.plan_id:null);
      setOwnerAccess(Boolean(accessRow?.owner_access||accessRow?.is_admin));

      const capacityData=capacityResult?.data;
      const capacityRow=Array.isArray(capacityData)?capacityData[0]:capacityData;
      setPcCapacity(capacityRow?(capacityRow as PcCapacity):null);

    }

    void loadAccessMeta();
    const onVisible=()=>{
      if(document.visibilityState==='visible')void loadAccessMeta();
    };
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[]);

  const loadDevices=useCallback(async(quiet=false)=>{
    if(document.visibilityState==='hidden')return;
    const now=Date.now();
    if(devicesBusyRef.current||now-lastDevicesLoadAtRef.current<DEVICE_REQUEST_MIN_GAP_MS)return;
    devicesBusyRef.current=true;
    lastDevicesLoadAtRef.current=now;
    if(!quiet)setLoading(true);
    try{
      const response=await fetch('/api/laser-control/master/devices',{
        method:'POST',credentials:'same-origin',cache:'no-store'
      });
      const data=await response.json();
      if(!response.ok)throw new Error('devices');
      const list=(Array.isArray(data?.devices)?data.devices as LaserDevice[]:[])
        .filter(device=>device.device_status==='active');
      setDevices(list);
      setSelectedDeviceId(current=>{
        if(current&&list.some(device=>device.device_id===current))return current;
        return list.find(device=>device.device_status==='active')?.device_id??list[0]?.device_id??null;
      });
    }catch{
      if(!quiet)setNotice(t('laser.loadFail'));
    }finally{
      devicesBusyRef.current=false;
      if(!quiet)setLoading(false);
    }
  },[t]);

  useEffect(()=>{
    void loadDevices();
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible')void loadDevices(true);
    },DEVICE_REFRESH_MS);
    const onVisible=()=>{
      if(document.visibilityState==='visible')void loadDevices(true);
    };
    document.addEventListener('visibilitychange',onVisible);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
    };
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

  const supportsAgentAtLeast=(version:string|null,minPatch:number)=>{
    const match=/^(\d+)\.(\d+)\.(\d+)/.exec(version||'');
    if(!match)return false;
    const major=Number(match[1]);
    const minor=Number(match[2]);
    const patch=Number(match[3]);
    if(major!==1)return major>1;
    if(minor!==0)return minor>0;
    return patch>=minPatch;
  };
  const supportsAgent21=(version:string|null)=>supportsAgentAtLeast(version,21);
  const supportsAgent24=(version:string|null)=>supportsAgentAtLeast(version,24);
  const latestAgentReady=Boolean(selectedDevice&&supportsAgent21(selectedDevice.agent_version));
  const workspaceKeysReady=Boolean(selectedDevice&&supportsAgent24(selectedDevice.agent_version));
  const webRtcAgentReady=Boolean(selectedDevice&&(()=>{
    const match=/^(\d+)\.(\d+)\.(\d+)/.exec(selectedDevice.agent_version||'');
    if(!match)return false;
    const major=Number(match[1]);
    const minor=Number(match[2]);
    return major>1||(major===1&&minor>=1);
  })());

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
    let opening=false;

    async function open(){
      if(!active||opening||document.visibilityState!=='visible')return;
      opening=true;
      try{
        setRealtimeStatus('connecting');
        const data=await postSession({action:'open',deviceId:selectedDeviceId});
        if(!active)return;
        let next=data as RemoteSession;

        // Opening a PC means the operator intends to control it. Enable remote
        // input immediately so the workspace does not require a second click.
        if(!next.remoteInputEnabled){
          try{
            const control=await postSession({
              action:'input',
              sessionId:next.sessionId,
              enabled:true
            });
            if(!active)return;
            next={...next,...control,remoteInputEnabled:Boolean(control?.enabled)} as RemoteSession;
          }catch{
            // Keep the live preview available even if input activation fails.
          }
        }

        sessionRef.current=next;
        setSession(next);
        setRealtimeStatus('connecting');
        inputReadyRef.current=false;
        setInputReady(false);
      }catch{
        if(active)setRealtimeStatus('error');
      }finally{
        opening=false;
      }
    }

    async function renew(){
      if(!active||opening||document.visibilityState!=='visible')return;
      try{
        const data=await postSession({action:'renew',deviceId:selectedDeviceId});
        if(!active)return;
        const current=sessionRef.current;
        const next={...current,...data} as RemoteSession;
        sessionRef.current=next;
        setSession(next);
      }catch{}
    }

    const onVisible=()=>{
      if(document.visibilityState==='visible')void open();
    };

    void open();
    renewTimer=window.setInterval(()=>void renew(),SESSION_RENEW_MS);
    document.addEventListener('visibilitychange',onVisible);

    return()=>{
      active=false;
      if(renewTimer)window.clearInterval(renewTimer);
      document.removeEventListener('visibilitychange',onVisible);
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
      setWebRtcActive(false);
      setWebRtcStream(null);
      setControlPending(null);
      resetZoom();
      inputReadyRef.current=false;
      setInputReady(false);
      setRealtimeStatus('idle');
    };
  },[selectedDeviceId,postSession]);

  useEffect(()=>{
    if(!session?.topic)return;
    const currentSession=session;
    const supabase=createClient();
    lastFrameSeqRef.current=0;
    setRealtimeStatus('connecting');
    setWebRtcActive(false);
    setWebRtcStream(null);

    const channel=supabase.channel(session.topic,{
      config:{broadcast:{ack:false,self:false}}
    });

    let peer:RTCPeerConnection|null=null;
    let peerTimeout:number|undefined;
    let remoteDescriptionReady=false;
    let agentReadyForWebRtc=false;
    let webRtcAttempted=false;
    const pendingAgentIce:RTCIceCandidateInit[]=[];

    const sendWebRtcSignal=(event:string,payload:Record<string,unknown>)=>
      postSession({
        action:'signal',
        sessionId:currentSession.sessionId,
        event,
        payload
      });

    const closePeer=(clearStream=true)=>{
      if(peerTimeout)window.clearTimeout(peerTimeout);
      peerTimeout=undefined;
      try{peer?.close();}catch{}
      peer=null;
      remoteDescriptionReady=false;
      pendingAgentIce.length=0;
      setWebRtcActive(false);
      if(clearStream)setWebRtcStream(null);
    };

    async function startWebRtc(){
      if(!agentReadyForWebRtc||webRtcAttempted||!webRtcAgentReady||typeof RTCPeerConnection==='undefined'||peer)return;
      webRtcAttempted=true;
      try{
        const nextPeer=new RTCPeerConnection({
          iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]
        });
        peer=nextPeer;
        let receivedStream:MediaStream|null=null;
        const videoTransceiver=nextPeer.addTransceiver('video',{direction:'recvonly'});
        const videoCapabilities=RTCRtpReceiver.getCapabilities('video');
        const vp8Codecs=(videoCapabilities?.codecs??[]).filter(
          codec=>codec.mimeType.toLowerCase()==='video/vp8'
        );
        if(vp8Codecs.length&&typeof videoTransceiver.setCodecPreferences==='function')
          videoTransceiver.setCodecPreferences(vp8Codecs);

        nextPeer.ontrack=event=>{
          receivedStream=event.streams[0]??new MediaStream([event.track]);
          setWebRtcStream(receivedStream);
          setWebRtcActive(true);
          setFrameLatency(null);
          setFrameAt(Date.now());
          setRealtimeStatus('live');
        };

        const pendingBrowserIce:Array<Record<string,unknown>>=[];
        let offerSent=false;

        nextPeer.onicecandidate=event=>{
          const candidate=event.candidate;
          if(!candidate)return;
          const json=candidate.toJSON();
          const payload={
            candidate:json.candidate,
            sdpMid:json.sdpMid,
            sdpMLineIndex:json.sdpMLineIndex
          };
          if(!offerSent){
            pendingBrowserIce.push(payload);
            return;
          }
          void sendWebRtcSignal('webrtc_ice',payload).catch(()=>undefined);
        };

        nextPeer.onconnectionstatechange=()=>{
          if(nextPeer.connectionState==='connected'){
            if(peerTimeout)window.clearTimeout(peerTimeout);
            peerTimeout=undefined;
            if(receivedStream)setWebRtcActive(true);
            setRealtimeStatus('live');
            return;
          }
          if(nextPeer.connectionState==='disconnected'){
            setRealtimeStatus('connecting');
            return;
          }
          if(nextPeer.connectionState==='failed'||nextPeer.connectionState==='closed'){
            setWebRtcActive(false);
            setWebRtcStream(null);
          }
        };

        const offer=await nextPeer.createOffer();
        await nextPeer.setLocalDescription(offer);
        await sendWebRtcSignal('webrtc_offer',{
          sdp:nextPeer.localDescription?.sdp||offer.sdp
        });
        offerSent=true;
        for(const candidate of pendingBrowserIce.splice(0)){
          void sendWebRtcSignal('webrtc_ice',candidate).catch(()=>undefined);
        }

        peerTimeout=window.setTimeout(()=>{
          if(peer!==nextPeer||nextPeer.connectionState==='connected')return;
          void sendWebRtcSignal('webrtc_stop',{}).catch(()=>undefined);
          closePeer(true);
        },8_000);
      }catch{closePeer(true);}
    }

    const markAgentReadyForWebRtc=()=>{
      if(agentReadyForWebRtc)return;
      agentReadyForWebRtc=true;
      void startWebRtc();
    };

    channel
      .on('broadcast',{event:'frame'},({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken)return;
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
        markAgentReadyForWebRtc();
      })
      .on('broadcast',{event:'webrtc_answer'},async({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken||payload?.from!=='agent'||!peer)return;
        const sdp=String(payload?.sdp||'');
        if(!sdp)return;
        try{
          await peer.setRemoteDescription({type:'answer',sdp});
          remoteDescriptionReady=true;
          while(pendingAgentIce.length){
            const candidate=pendingAgentIce.shift();
            if(candidate)await peer.addIceCandidate(candidate);
          }
        }catch{closePeer(true);}
      })
      .on('broadcast',{event:'webrtc_ice'},async({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken||payload?.from!=='agent'||!peer)return;
        const candidate=String(payload?.candidate||'');
        if(!candidate)return;
        const init:RTCIceCandidateInit={
          candidate,
          sdpMid:payload?.sdpMid==null?null:String(payload.sdpMid),
          sdpMLineIndex:payload?.sdpMLineIndex==null?null:Number(payload.sdpMLineIndex)
        };
        if(!remoteDescriptionReady){pendingAgentIce.push(init);return;}
        try{await peer.addIceCandidate(init);}catch{}
      })
      .on('broadcast',{event:'webrtc_state'},({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken||payload?.from!=='agent')return;
        if(payload?.state==='connected')setRealtimeStatus('live');
        else if(payload?.state==='fallback')setWebRtcActive(false);
      })
      .on('broadcast',{event:'agent_state'},({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken)return;
        markAgentReadyForWebRtc();
        if(payload?.state==='control-ready'){inputReadyRef.current=true;setInputReady(true);}
        if(payload?.state==='preview-ready'){
          inputReadyRef.current=false;setInputReady(false);
          setRealtimeStatus(current=>current==='live'?'live':'connecting');
        }
      })
      .on('broadcast',{event:'input_result'},({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken)return;
        const requestId=String(payload?.requestId||'');
        const resolve=pendingInputResultsRef.current.get(requestId);
        if(!resolve)return;
        pendingInputResultsRef.current.delete(requestId);
        resolve({ok:payload?.ok===true,reason:String(payload?.reason||'')||null});
      })
      .on('broadcast',{event:'control_result'},({payload}:any)=>{
        if(payload?.token!==currentSession.frameToken)return;
        const requestId=String(payload?.requestId||'');
        if(controlPendingRef.current!==requestId)return;
        controlPendingRef.current=null;
        setControlPending(current=>current===requestId?null:current);
        if(!payload?.ok){
          const reason=String(payload?.reason||'');
          setNotice(/frame_button_not_found/.test(reason)?t('laser.frameGantryMissing'):t('laser.quickFailed'));
          return;
        }
        setNotice(t('laser.frameGantrySent'));
      })
      .subscribe((status:string)=>{
        if(status==='SUBSCRIBED')
          setRealtimeStatus(current=>current==='live'?'live':'connecting');
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setRealtimeStatus('error');
      });

    channelRef.current=channel;
    return()=>{
      if(peerTimeout)window.clearTimeout(peerTimeout);
      try{peer?.close();}catch{}
      peer=null;
      setWebRtcActive(false);
      setWebRtcStream(null);
      for(const resolve of pendingInputResultsRef.current.values())
        resolve({ok:false,reason:'session_closed'});
      pendingInputResultsRef.current.clear();
      if(channelRef.current===channel)channelRef.current=null;
      void supabase.removeChannel(channel);
    };
  },[session?.topic,session?.frameToken,t,webRtcAgentReady,postSession]);

  useEffect(()=>{
    const video=videoRef.current;
    if(!video||!webRtcStream)return;
    video.srcObject=webRtcStream;
    void video.play().catch(()=>undefined);
    return()=>{if(video.srcObject===webRtcStream)video.srcObject=null;};
  },[webRtcStream,webRtcActive]);

  useEffect(()=>{
    const handle=()=>setFullscreen(Boolean(document.fullscreenElement));
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

      if(!inputReady)await enableRemoteInput();
    }catch{
      setNotice(t('laser.fullscreenDenied'));
    }
  }

  async function exitFullscreen(){
    try{
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

  async function sendVerifiedInput(payload:Record<string,unknown>){
    const current=sessionRef.current;
    const channel=channelRef.current;
    if(!inputReadyRef.current||!current?.inputToken||!channel)
      return {ok:false,reason:'input_not_ready'};

    const requestId=crypto.randomUUID();
    let timeout:number|undefined;
    const result=new Promise<{ok:boolean;reason:string|null}>(resolve=>{
      pendingInputResultsRef.current.set(requestId,resolve);
      timeout=window.setTimeout(()=>{
        pendingInputResultsRef.current.delete(requestId);
        resolve({ok:false,reason:'input_timeout'});
      },2_500);
    });
    try{
      const status=await channel.send({
        type:'broadcast',event:'remote_input',
        payload:{token:current.inputToken,requestId,...payload}
      });
      if(status!=='ok'){
        pendingInputResultsRef.current.get(requestId)?.({ok:false,reason:'broadcast_failed'});
        pendingInputResultsRef.current.delete(requestId);
      }
    }catch{
      pendingInputResultsRef.current.get(requestId)?.({ok:false,reason:'broadcast_failed'});
      pendingInputResultsRef.current.delete(requestId);
    }
    try{return await result}
    finally{if(timeout!==undefined)window.clearTimeout(timeout)}
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

  function releaseRemoteModifiers(){
    const base={ctrl:false,shift:false,alt:false,meta:false};
    sendRemoteInput({type:'keyup',key:'Shift',code:'ShiftLeft',...base});
    sendRemoteInput({type:'keyup',key:'Control',code:'ControlLeft',...base});
    sendRemoteInput({type:'keyup',key:'Alt',code:'AltLeft',...base});
  }

  async function openMobileKeyboard(){
    if(!inputReadyRef.current)return;
    if(document.fullscreenElement){
      try{await document.exitFullscreen();}catch{}
      await new Promise(resolve=>window.setTimeout(resolve,120));
    }
    setKeyboardShift(false);
    setMobileEditOpen(true);
    mobileEditPrepareRef.current=sendVerifiedInput({type:'prepare_edit'});
  }

  function closeMobileKeyboard(){
    setMobileEditOpen(false);
    setKeyboardShift(false);
    mobileEditPrepareRef.current=null;
    releaseRemoteModifiers();
  }

  async function waitMobileEditTarget(){
    const pending=mobileEditPrepareRef.current;
    if(!pending)return true;
    const prepared=await pending;
    return prepared.ok;
  }

  async function sendMobileEditKey(
    key:string,code:string,
    modifiers:{shift?:boolean;ctrl?:boolean;alt?:boolean}={}
  ){
    if(!await ensureInputReady())return;
    if(!await waitMobileEditTarget()){
      setNotice(t('laser.editTargetFailed'));
      return;
    }
    const payload={
      key,code,
      ctrl:Boolean(modifiers.ctrl),shift:Boolean(modifiers.shift),
      alt:Boolean(modifiers.alt),meta:false
    };
    const down=await sendVerifiedInput({type:'keydown',...payload});
    if(!down.ok){setNotice(t('laser.quickFailed'));releaseRemoteModifiers();return;}
    const up=await sendVerifiedInput({type:'keyup',...payload});
    if(!up.ok)setNotice(t('laser.quickFailed'));
    releaseRemoteModifiers();
  }

  async function sendKeyboardCharacter(value:string){
    if(/^[a-z]$/i.test(value)){
      const letter=value.toUpperCase();
      await sendMobileEditKey(
        keyboardShift?letter:value.toLowerCase(),
        'Key'+letter,
        {shift:keyboardShift}
      );
      return;
    }
    if(/^[0-9]$/.test(value)){
      await sendMobileEditKey(value,'Digit'+value);
      return;
    }

    if(!await ensureInputReady())return;
    if(!await waitMobileEditTarget()){
      setNotice(t('laser.editTargetFailed'));
      return;
    }
    const result=await sendVerifiedInput({type:'text',key:keyboardShift?value.toUpperCase():value});
    if(!result.ok)setNotice(t('laser.quickFailed'));
    releaseRemoteModifiers();
  }

  async function clearMobileEdit(){
    if(!await ensureInputReady())return;
    if(!await waitMobileEditTarget()){
      setNotice(t('laser.editTargetFailed'));
      return;
    }
    const result=await sendVerifiedInput({type:'replace_text',key:''});
    releaseRemoteModifiers();
    if(!result.ok)setNotice(t('laser.quickFailed'));
  }

  async function recenterLightBurnView(){
    resetZoom();
    if(toolPending)return;
    setToolPending('recenter-view');
    try{
      if(!await ensureInputReady()){
        setNotice(t('laser.quickNeedControl'));
        return;
      }

      const escape={key:'Escape',code:'Escape',ctrl:false,shift:false,alt:false,meta:false};
      await sendVerifiedInput({type:'keydown',...escape});
      await sendVerifiedInput({type:'keyup',...escape});
      await new Promise(resolve=>window.setTimeout(resolve,90));

      const zoomPage={key:'0',code:'Digit0',ctrl:true,shift:false,alt:false,meta:false};
      const down=await sendVerifiedInput({type:'keydown',...zoomPage});
      if(!down.ok){setNotice(t('laser.quickFailed'));return;}
      const up=await sendVerifiedInput({type:'keyup',...zoomPage});
      if(!up.ok){setNotice(t('laser.quickFailed'));return;}

      setNotice(t('laser.viewCentered'));
    }finally{
      setToolPending(null);
    }
  }

  function closeActiveDialog(){
    sendRemoteKey('Escape','Escape');
    setActiveDialogTool(null);
  }

  function confirmActiveDialog(){
    sendRemoteKey('Enter','Enter');
    setActiveDialogTool(null);
  }

  function sendFrameGantryRequest(){
    if(!latestAgentReady){
      setNotice(t('laser.agentUpdateRequired'));
      return;
    }
    const current=sessionRef.current;
    if(!inputReadyRef.current||!current?.inputToken||!channelRef.current){
      setNotice(t('laser.quickNeedControl'));
      return;
    }
    const requestId=crypto.randomUUID();
    controlPendingRef.current=requestId;
    setControlPending(requestId);
    void channelRef.current.send({
      type:'broadcast',
      event:'control_request',
      payload:{token:current.inputToken,requestId,action:'frame_gantry'}
    });
    window.setTimeout(()=>{
      if(controlPendingRef.current!==requestId)return;
      controlPendingRef.current=null;
      setControlPending(current=>current===requestId?null:current);
      setNotice(t('laser.quickFailed'));
    },4_500);
  }

  async function frameGantry(){
    if(!canOperate||!latestAgentReady)return;
    if(!await ensureInputReady()){
      setNotice(t('laser.quickNeedControl'));
      return;
    }
    sendFrameGantryRequest();
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
      const agentSupportsReceipt=latestAgentReady;
      const receiptPromise=agentSupportsReceipt
        ?sendVerifiedInput({type:'keydown',...payload})
        :null;
      if(!agentSupportsReceipt)sendRemoteInput({type:'keydown',...payload});
      await new Promise(resolve=>window.setTimeout(resolve,80));
      sendRemoteInput({type:'keyup',...payload});
      const receipt=receiptPromise?await receiptPromise:null;
      if(receipt&&!receipt.ok){
        setNotice(t('laser.quickFailed'));
        return;
      }
      setNotice(receipt?t('laser.quickSent'):t('laser.quickUnverified'));
      if(['preview','import','trace','adjust-image','rotary'].includes(id)){
        setActiveDialogTool(id);
      }
    }finally{
      setToolPending(null);
    }
  }

  async function runWorkspaceKey(id:string,key:string,code:string){
    if(toolPending)return;
    setToolPending(id);
    try{
      if(!workspaceKeysReady){
        setNotice(t('laser.workspaceAgentUpdate'));
        return;
      }
      if(!await ensureInputReady()){
        setNotice(t('laser.quickNeedControl'));
        return;
      }
      const payload={key,code,ctrl:false,shift:false,alt:false,meta:false};
      const receipt=await sendVerifiedInput({type:'workspacekeydown',...payload});
      if(!receipt.ok){
        setNotice(t('laser.quickFailed'));
        return;
      }
      await new Promise(resolve=>window.setTimeout(resolve,65));
      sendRemoteInput({type:'workspacekeyup',...payload});
      setNotice(t('laser.quickSent'));
    }finally{
      setToolPending(null);
    }
  }

  function pointerCoordinatesFromClient(clientX:number,clientY:number){
    const image=webRtcActive?(videoRef.current??imageRef.current):imageRef.current;
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
    gesture.lastPinchDistance=0;
    gesture.suppressAfterPinch=false;
    gesture.singlePointerId=null;
    gesture.startPoint=null;
    gesture.remoteDown=false;
    gesture.moved=false;
    gesture.rightClickSent=false;
  }

  function clampPan(nextX:number,nextY:number,nextZoom=zoom){
    const image=webRtcActive?(videoRef.current??imageRef.current):imageRef.current;
    const surface=previewSurfaceRef.current;
    if(!image||!surface||nextZoom<=1)return{x:0,y:0};
    const baseWidth=image.offsetWidth||image.getBoundingClientRect().width/nextZoom;
    const baseHeight=image.offsetHeight||image.getBoundingClientRect().height/nextZoom;
    const maxX=Math.max(0,(baseWidth*nextZoom-surface.clientWidth)/2);
    const maxY=Math.max(0,(baseHeight*nextZoom-surface.clientHeight)/2);
    return{x:Math.max(-maxX,Math.min(maxX,nextX)),y:Math.max(-maxY,Math.min(maxY,nextY))};
  }

  function setPreviewZoom(next:number){
    const value=Math.min(4,Math.max(1,Math.round(next*100)/100));
    zoomRef.current=value;
    setZoom(value);
    if(value<=1){
      setPan({x:0,y:0});
    }else{
      setPan(current=>clampPan(current.x,current.y,value));
    }
  }

  function resetZoom(){
    zoomRef.current=1;
    setZoom(1);
    setPan({x:0,y:0});
  }

  function handlePointer(
    event:ReactPointerEvent<HTMLImageElement|HTMLVideoElement>,
    type:'pointerdown'|'pointerup'|'pointermove'|'pointercancel'
  ){
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
        gesture.startPanX=pan.x;
        gesture.startPanY=pan.y;
        clearLongPress();

        if(inputReady&&point&&zoom<=1){
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
        gesture.suppressAfterPinch=true;
        gesture.lastPinchDistance=Math.max(24,Math.hypot(dx,dy));
        gesture.remoteDown=false;
      }
      return;
    }

    if(type==='pointermove'){
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY});

      if(gesture.pinching&&touches.size>=2){
        const values=[...touches.values()];
        const dx=values[0].x-values[1].x;
        const dy=values[0].y-values[1].y;
        const distance=Math.max(24,Math.hypot(dx,dy));
        const previous=Math.max(24,gesture.lastPinchDistance||distance);
        const ratio=Math.max(.9,Math.min(1.1,distance/previous));
        gesture.lastPinchDistance=distance;
        const normalized=Math.min(4,Math.max(1,Math.round(zoomRef.current*ratio*100)/100));
        zoomRef.current=normalized;
        setZoom(normalized);
        if(normalized<=1)setPan({x:0,y:0});
        else setPan(current=>clampPan(current.x,current.y,normalized));
        return;
      }

      if(gesture.suppressAfterPinch)return;

      if(gesture.singlePointerId===event.pointerId&&!gesture.rightClickSent){
        const moved=Math.hypot(
          event.clientX-gesture.startClientX,
          event.clientY-gesture.startClientY
        )>8;
        if(moved){
          gesture.moved=true;
          clearLongPress();
        }

        if(gesture.moved&&zoom>1){
          const next=clampPan(
            gesture.startPanX+(event.clientX-gesture.startClientX),
            gesture.startPanY+(event.clientY-gesture.startClientY)
          );
          setPan(next);
          return;
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

    const wasPinching=gesture.pinching||gesture.suppressAfterPinch;
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

    if(gesture.moved&&zoom>1){
      resetTouchGesture();
      return;
    }

    const point=pointerCoordinates(event);
    if(inputReady&&point){
      if(rightClickArmed&&!gesture.moved){
        sendRemoteInput({type:'click',...point,button:2});
        setRightClickArmed(false);
        lastTapRef.current=null;
        resetTouchGesture();
        return;
      }
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
          sendRemoteInput({type:'click',...point,button:0});
          lastTapRef.current={at:now,clientX:event.clientX,clientY:event.clientY};
        }
      }
    }

    resetTouchGesture();
  }

  function handleWheel(event:ReactWheelEvent<HTMLImageElement|HTMLVideoElement>){
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
    if(event.target!==event.currentTarget){
      const element=event.target as HTMLElement;
      if(element.closest('input,textarea,select,button,[contenteditable="true"]'))return;
    }
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
      if(!window.confirm(t('laser.startConfirm')))return;
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
        setCommandNotice(t('laser.commandNoConfirm'));
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
          setCommandNotice(t('laser.commandBlocked'));
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

  async function editParametersOnScreen(){
    zoomRef.current=2.5;
    setZoom(2.5);
    setPan({x:0,y:0});
    if(!document.fullscreenElement)await enterFullscreen();
    previewSurfaceRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function openToolDialog(
    id:string,
    shortcut:{key:string;code:string;ctrl?:boolean;shift?:boolean;alt?:boolean}
  ){
    await runShortcut(id,shortcut);
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
        setNotice(data?.reason==='not_found_or_expired'?t('laser.pairCodeExpired'):t('laser.pairFail'));
        return;
      }
      setPairingCode('');
      setNotice(t('laser.pcLinked'));
      await loadDevices();
    }catch{
      setNotice(t('laser.pairFail'));
    }finally{
      setPairingPending(false);
    }
  }

  async function copyMentorLink(){
    try{
      await navigator.clipboard.writeText(MENTOR_SHARE_LINK);
      setNotice(t('laser.mentorLinkCopied'));
    }catch{
      setNotice(MENTOR_SHARE_LINK);
    }
  }

  async function claimMentor(event:FormEvent){
    event.preventDefault();
    const code=mentorCode.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    if(code.length!==8){
      const message=t('laser.invalidCode');
      setMentorNotice(message);setNotice(message);return;
    }
    setMentorNotice(t('laser.mentorConnecting'));
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
        const message=
          reason==='mentor_entitlement_required'?t('laser.mentorNoAccess')
          :reason==='concurrent_limit'?t('laser.mentorLimit')
          :reason==='device_already_active'?t('laser.mentorDeviceActive')
          :reason==='rate_limited'?t('laser.mentorRateLimited')
          :reason==='not_found_or_expired'||reason==='invalid_code'?t('laser.mentorExpired')
          :t('laser.mentorServerError');
        setMentorNotice(message);
        setNotice(message);
        return;
      }
      setMentorCode('');
      setMentorNotice(t('laser.mentorConnected'));
      setNotice(t('laser.mentorConnected'));
      await loadDevices();
      if(data?.deviceId)setSelectedDeviceId(String(data.deviceId));
    }catch{
      const message=t('laser.mentorServerError');
      setMentorNotice(message);
      setNotice(message);
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
      <div className={styles.topRight}>
        <nav className={styles.workspaceNav} aria-label="Laser Control">
          <a href="/">{nav.home}</a>
          <a href="/laser-control/guia">{nav.guide}</a>
          <a href="mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support">{nav.support}</a>
          <button type="button" onClick={()=>void signOutLaser()}>{nav.signOut}</button>
          <LanguageMenu/>
        </nav>
        <div className={styles.liveBadge} data-live={realtimeStatus==='live'}>
        <i></i>{
          realtimeStatus==='live'?t('laser.live')
          :realtimeStatus==='connecting'?t('laser.connecting')
          :realtimeStatus==='error'?t('laser.error')
          :t('laser.waiting')
        }
        </div>
      </div>
    </div>

    <aside className={styles.deviceStrip}>
      {mentorAccess?<form className={styles.mentorConnect} onSubmit={claimMentor}>
        <span>{t('laser.mentoring')}</span>
        <b>{t('laser.mentorTitle')}</b>
        <p>{t('laser.mentorDesc')}</p>
        <section className={styles.mentorShare}>
          <strong>{t('laser.mentorShareTitle')}</strong>
          <div className={styles.mentorShareActions}>
            <button type="button" onClick={()=>void copyMentorLink()}>🔗 {t('laser.mentorCopyLink')}</button>
            <a
              href={'https://wa.me/?text='+encodeURIComponent(t('laser.mentorShareMessage')+' '+MENTOR_SHARE_LINK)}
              target="_blank"
              rel="noreferrer"
            >WhatsApp</a>
            <a
              href={'mailto:?subject='+encodeURIComponent(t('laser.mentorShareSubject'))+'&body='+encodeURIComponent(t('laser.mentorShareMessage')+' '+MENTOR_SHARE_LINK)}
            >✉ {t('laser.mentorEmail')}</a>
          </div>
        </section>
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
        {planId==='control'&&<>
          <a className={styles.extraMentorButton} href={internationalPricing?'/api/laser-control/student-addon-checkout?region=intl':'/api/laser-control/student-addon-checkout'} target="_blank" rel="noreferrer">
            {nav.addStudent} · {internationalPricing?'US$ 7.50':'R$ 9,90'}
          </a>
          <small className={styles.extraMentorNote}>{nav.studentNote}</small>
        </>}
        {planId==='mentor'&&<small className={styles.extraMentorNote}>{nav.mentorUnlimited}</small>}
        {mentorNotice&&<div className={styles.mentorInlineNotice} role="status">{mentorNotice}</div>}
      </form>:planId==='control'?<section className={styles.mentorLocked}>
        <span>{nav.mentorLocked}</span>
        <b>{nav.controlStudentTitle}</b>
        <p>{nav.controlStudentText}</p>
        <a href={internationalPricing?'/api/laser-control/student-addon-checkout?region=intl':'/api/laser-control/student-addon-checkout'} target="_blank" rel="noreferrer">
          {nav.addStudent} · {internationalPricing?'US$ 7.50':'R$ 9,90'}
        </a>
        <small className={styles.extraMentorNote}>{nav.studentNote}</small>
      </section>:<section className={styles.mentorLocked}>
        <span>{nav.mentorLocked}</span>
        <b>{nav.mentorAvailable}</b>
        <p>{nav.mentorLockedText}</p>
        <a href="/laser-control/conhecer#planos">{nav.mentorView}</a>
      </section>}

      <div className={styles.deviceGroup}>
        <div className={styles.groupTitle}>
          <span>{t('laser.mine')}</span>
          <small>{ownedDevices.filter(device=>device.device_status==='active').length}/{pcCapacity?.max_pcs??1}</small>
        </div>

        {ownerAccess&&<section className={styles.pcAddon}>
          <span>{nav.pcTag}</span>
          <b>{internationalPricing?'+1 PC · US$ 5':'+1 PC · R$ 12,90'}</b>
          <p>{nav.pcDescription}</p>
          <a href={internationalPricing?'/api/laser-control/pc-addon-checkout?region=intl':'/api/laser-control/pc-addon-checkout'}>
            {nav.addPc}
          </a>
          <small>{nav.pcSmall}</small>
        </section>}

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

      <div className={styles.simpleModeBar}>
        <button type="button" className={tab!=='agent'?styles.simpleModeActive:''} onClick={()=>setTab('live')}>
          ◉ {t('laser.operate')}
        </button>
        <button type="button" className={tab==='agent'?styles.simpleModeActive:''} onClick={()=>setTab('agent')}>
          ⚙ {t('laser.tabAgent')}
        </button>
      </div>

      {tab!=='agent'&&<div className={styles.livePane}>
        <div className={styles.liveToolbar}>
          <div className={styles.zoom}>
            <button type="button" aria-label={t('laser.zoomOut')} onClick={()=>setPreviewZoom(zoom-.25)}>−</button>
            <button type="button" title={t('laser.zoomReset')} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
            <button type="button" aria-label={t('laser.zoomIn')} onClick={()=>setPreviewZoom(zoom+.25)}>＋</button>
          </div>
          <div className={styles.iconActions} aria-label={t('laser.projectTools')}>
            <button type="button" title={t('laser.saveProject')} aria-label={t('laser.saveProject')} disabled={toolPending!==null} onClick={()=>void runShortcut('save',{key:'s',code:'KeyS',ctrl:true})}>▣</button>
            <button type="button" title={t('laser.undo')} aria-label={t('laser.undo')} disabled={toolPending!==null} onClick={()=>void runShortcut('undo',{key:'z',code:'KeyZ',ctrl:true})}>↶</button>
            <button type="button" title={t('laser.redo')} aria-label={t('laser.redo')} disabled={toolPending!==null} onClick={()=>void runShortcut('redo',{key:'z',code:'KeyZ',ctrl:true,shift:true})}>↷</button>
            <button type="button" title={t('laser.recenterView')} aria-label={t('laser.recenterView')} disabled={toolPending!==null} onClick={()=>void recenterLightBurnView()}>⊙</button>
            <button type="button" title={t('laser.importPc')} aria-label={t('laser.importPc')} disabled={toolPending!==null} onClick={()=>void runShortcut('import',{key:'i',code:'KeyI',ctrl:true})}>↥</button>
            <button type="button" title={t('laser.previewProject')} aria-label={t('laser.previewProject')} disabled={toolPending!==null} onClick={()=>void runShortcut('preview',{key:'p',code:'KeyP',alt:true})}>◉</button>
          </div>
          <div className={styles.orientation}>
            <button className={orientation==='auto'?styles.on:''} onClick={()=>void setOrientationMode('auto')}>{t('laser.auto')}</button>
            <button className={orientation==='landscape'?styles.on:''} onClick={()=>void setOrientationMode('landscape')}>{t('laser.landscape')}</button>
            <button className={orientation==='portrait'?styles.on:''} onClick={()=>void setOrientationMode('portrait')}>{t('laser.portrait')}</button>
          </div>
          <button
            className={inputReady?styles.controlOn:styles.controlOff}
            disabled={inputPending}
            onClick={()=>void (inputReady?disableRemoteInput():enableRemoteInput())}
          >{
            inputPending?t('laser.remoteActivating')
            :inputReady?t('laser.remoteOn')
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
                <button type="button" aria-label={t('laser.zoomOut')} onClick={()=>setPreviewZoom(zoom-.25)}>−</button>
                <button type="button" title={t('laser.zoomReset')} onClick={resetZoom}>{Math.round(zoom*100)}%</button>
                <button type="button" aria-label={t('laser.zoomIn')} onClick={()=>setPreviewZoom(zoom+.25)}>＋</button>
              </div>
              <button
                type="button"
                className={styles.on}
                title={orientation==='auto'?t('laser.auto'):orientation==='landscape'?t('laser.landscape'):t('laser.portrait')}
                onClick={()=>void setOrientationMode(
                  orientation==='auto'?'landscape'
                  :orientation==='landscape'?'portrait'
                  :'auto'
                )}
              >{orientation==='auto'?'↻':orientation==='landscape'?'↔':'↕'} {orientation==='auto'?t('laser.auto'):orientation==='landscape'?t('laser.landscape'):t('laser.portrait')}</button>
              <button type="button" onClick={()=>void recenterLightBurnView()} disabled={toolPending!==null} title={t('laser.recenterView')} aria-label={t('laser.recenterView')}>⊙</button>
              <button
                className={inputReady?styles.controlOn:styles.controlOff}
                disabled={inputPending}
                onClick={()=>void (inputReady?disableRemoteInput():enableRemoteInput())}
              >{inputReady?t('laser.remoteOn'):t('laser.remoteOff')}</button>
              <button onClick={openMobileKeyboard} disabled={!inputReady}>⌨</button>
              <button className={rightClickArmed?styles.rightClickActive:''} onClick={()=>setRightClickArmed(value=>!value)} disabled={!inputReady} title={t('laser.rightClick')} aria-label={t('laser.rightClick')}>🖱</button>
              {activeDialogTool&&<>
                <button className={styles.dialogOk} onClick={confirmActiveDialog} disabled={!inputReady}>OK</button>
                <button className={styles.dialogClose} onClick={closeActiveDialog} disabled={!inputReady}>ESC</button>
              </>}
              <button onClick={()=>void exitFullscreen()}>{t('laser.fullscreenClose')}</button>
            </>}
          </div>

          {webRtcActive&&webRtcStream?<video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="LightBurn WebRTC"
            onLoadedMetadata={event=>{
              setFrameSize(`${event.currentTarget.videoWidth} × ${event.currentTarget.videoHeight}`);
              setFrameAt(Date.now());
            }}
            style={{
              transform:`translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`,
              transformOrigin:'center center'
            }}
            className={inputReady?styles.remoteImageActive:styles.remoteImage}
            onPointerDown={event=>handlePointer(event,'pointerdown')}
            onPointerUp={event=>handlePointer(event,'pointerup')}
            onPointerMove={event=>handlePointer(event,'pointermove')}
            onPointerCancel={event=>handlePointer(event,'pointercancel')}
            onContextMenu={event=>event.preventDefault()}
            onWheel={handleWheel}
            draggable={false}
          />:frameSrc?<img
            ref={imageRef}
            src={frameSrc}
            alt="LightBurn"
            style={{
              transform:`translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`,
              transformOrigin:'center center'
            }}
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
        </div>

          <div className={mobileEditOpen?styles.mobileKeyboard:styles.mobileKeyboardHidden} aria-label={t('laser.keyboardAria')}>
            <div className={styles.mobileKeyboardHead}>
              <b>⌨ {t('laser.keyboard')}</b>
              <span>{t('laser.keyboardPlaceholder')}</span>
              <button type="button" onClick={closeMobileKeyboard} aria-label={t('laser.cancel')}>×</button>
            </div>

            <div className={styles.mobileKeyRows}>
              {MOBILE_KEY_ROWS.map((row,rowIndex)=>
                <div className={styles.mobileKeyRow} key={rowIndex}>
                  {row.map(value=>
                    <button
                      type="button"
                      key={value}
                      onClick={()=>void sendKeyboardCharacter(value)}
                    >{keyboardShift?value.toUpperCase():value}</button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.mobileEditTools}>
              <button type="button" className={keyboardShift?styles.keyActive:''} onClick={()=>setKeyboardShift(value=>!value)}>⇧</button>
              <button type="button" onClick={()=>void sendMobileEditKey('Home','Home')} aria-label="Home">↤</button>
              <button type="button" onClick={()=>void sendMobileEditKey('ArrowLeft','ArrowLeft')} aria-label={t('laser.cursorLeft')}>←</button>
              <button type="button" onClick={()=>void sendMobileEditKey('ArrowRight','ArrowRight')} aria-label={t('laser.cursorRight')}>→</button>
              <button type="button" onClick={()=>void sendMobileEditKey('End','End')} aria-label="End">↦</button>
              <button type="button" onClick={()=>void sendMobileEditKey('Backspace','Backspace')} aria-label={t('laser.backspace')}>⌫</button>
              <button type="button" onClick={()=>void sendMobileEditKey('Delete','Delete')}>Del</button>
              <button type="button" onClick={()=>void clearMobileEdit()} aria-label={t('laser.clearText')}>{t('laser.clear')}</button>
            </div>

            <div className={styles.mobileKeyboardBottom}>
              <button type="button" className={styles.spaceKey} onClick={()=>void sendMobileEditKey(' ','Space')}>␠</button>
              <button type="button" onClick={()=>void sendMobileEditKey('Enter','Enter')}>Enter</button>
              <button type="button" onClick={closeMobileKeyboard}>{t('laser.cancel')}</button>
            </div>
          </div>

        <div className={styles.frameInfo}>
          <span>{frameSize||'—'}</span>
          <span>{webRtcActive?'WebRTC P2P':frameLatency==null?'—':`${t('laser.latency')} ~${frameLatency} ms`}</span>
          <span>{frameAt?new Date(frameAt).toLocaleTimeString():'—'}</span>
        </div>

        <div className={styles.liveControlRail}>
          <div className={styles.dPad} aria-label={t('laser.moveSelection')}>
            <button className={styles.dPadUp} type="button" disabled={!workspaceKeysReady||toolPending!==null} onClick={()=>void runWorkspaceKey('move-up','ArrowUp','ArrowUp')}>↑</button>
            <button className={styles.dPadLeft} type="button" disabled={!workspaceKeysReady||toolPending!==null} onClick={()=>void runWorkspaceKey('move-left','ArrowLeft','ArrowLeft')}>←</button>
            <span className={styles.dPadCenterSpacer} aria-hidden="true"/>
            <button className={styles.dPadRight} type="button" disabled={!workspaceKeysReady||toolPending!==null} onClick={()=>void runWorkspaceKey('move-right','ArrowRight','ArrowRight')}>→</button>
            <button className={styles.dPadDown} type="button" disabled={!workspaceKeysReady||toolPending!==null} onClick={()=>void runWorkspaceKey('move-down','ArrowDown','ArrowDown')}>↓</button>
          </div>
          <div className={styles.liveDialogActions}>
            <button type="button" disabled={!inputReady} onClick={openMobileKeyboard}>⌨ {t('laser.keyboard')}</button>
            <button type="button" className={rightClickArmed?styles.rightClickActive:''} disabled={!inputReady} onClick={()=>setRightClickArmed(value=>!value)}>🖱 {t('laser.rightClick')}</button>
            {activeDialogTool&&<>
              <button type="button" className={styles.dialogOk} disabled={!inputReady} onClick={confirmActiveDialog}>{t('laser.okEnter')}</button>
              <button type="button" className={styles.dialogClose} disabled={!inputReady} onClick={closeActiveDialog}>{t('laser.closeEsc')}</button>
            </>}
          </div>
        </div>

        <section className={styles.controlDrawer}>
          <div className={styles.controlDrawerBody}>

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

        <div className={styles.primaryActionBar}>
          <button type="button" disabled={!canOperate||!latestAgentReady||Boolean(controlPending)} onClick={()=>void frameGantry()} title={!latestAgentReady?t('laser.agentUpdateRequired'):undefined}><i>▣</i><span>{t('laser.frameDiode')}</span></button>
          <button type="button" disabled={toolPending!==null} onClick={()=>void openToolDialog('rotary',{key:'r',code:'KeyR',ctrl:true,shift:true})}><i>⟳</i><span>{t('laser.rotarySetup')}</span></button>
          <button type="button" disabled={toolPending!==null} onClick={()=>void openToolDialog('adjust-image',{key:'i',code:'KeyI',alt:true})}><i>◐</i><span>{t('laser.adjustImage')}</span></button>
          <button type="button" disabled={toolPending!==null} onClick={()=>void openToolDialog('trace',{key:'t',code:'KeyT',alt:true})}><i>⌇</i><span>{t('laser.traceImage')}</span></button>
          <button type="button" onClick={()=>setToolPanelOpen(value=>!value)}><i>⋯</i><span>{toolPanelOpen?t('laser.closePanel'):t('laser.more')}</span></button>
        </div>

        {toolPanelOpen&&<div className={styles.contextPanel}>
          <section className={styles.quickSection}>
            <div className={styles.sectionHeading}>
              <div><small>LIGHTBURN</small><h3>{t('laser.moreTools')}</h3></div>
            </div>
            <div className={styles.moreToolsGrid}>
              <button type="button" disabled={toolPending!==null} onClick={()=>void runShortcut('select',{key:'a',code:'KeyA',ctrl:true})}><i>⌁</i><span>{t('laser.selectAll')}</span></button>
              <button type="button" disabled={toolPending!==null} onClick={()=>void runShortcut('flip-h',{key:'h',code:'KeyH',ctrl:true,shift:true})}><i>↔</i><span>{t('laser.flipH')}</span></button>
              <button type="button" disabled={toolPending!==null} onClick={()=>void runShortcut('flip-v',{key:'v',code:'KeyV',ctrl:true,shift:true})}><i>↕</i><span>{t('laser.flipV')}</span></button>
              <button type="button" onClick={()=>void editParametersOnScreen()}><i>⌕</i><span>{t('laser.paramsVisualEdit')}</span></button>
            </div>
          </section>
        </div>}
        <div className={styles.controlDetail}>
          <b>{t('laser.safeControl')}</b>
          <p>{t('laser.commandSafety')}</p>
        </div>

        <div className={styles.controlHint}>
          <b>{t('laser.inputTitle')}</b>
          <span>{t('laser.inputHint')}</span>
        </div>

          </div>
        </section>
      </div>}

      {tab==='agent'&&<div className={styles.guide}>
        <div className={styles.downloadCard}>
          <div><small>WINDOWS 10/11 · 64 BITS</small><h3>{t('laser.agentTitle')}</h3><p>{t('laser.agentDesc')}</p></div>
          <a href="/api/laser-control/agent-download">{t('laser.download')}</a>
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
