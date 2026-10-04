const DAY=['sun','mon','tue','wed','thu','fri','sat'];
const DAY_MAP={Sun:'sun',Mon:'mon',Tue:'tue',Wed:'wed',Thu:'thu',Fri:'fri',Sat:'sat'};

function localParts(date,timeZone='UTC'){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  const obj=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return{day:DAY_MAP[obj.weekday]||'sun',minutes:Number(obj.hour)*60+Number(obj.minute),second:Number(obj.second)};
}
function hmToMinutes(value,fallback){
  if(!value)return fallback;
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(value));
  if(!m)return fallback;
  return Math.min(1439,Math.max(0,Number(m[1])*60+Number(m[2])));
}

export function scheduleGate(config,now=new Date()){
  if(!config?.enabled)return{allowed:false,reason:'agenda desativada'};
  const ts=now.getTime();
  if(config.startAt&&ts<new Date(config.startAt).getTime())return{allowed:false,reason:'antes do início'};
  if(config.endAt&&ts>=new Date(config.endAt).getTime())return{allowed:false,reason:'horário final atingido'};
  const tz=config.timezone||'UTC';
  const local=localParts(now,tz);
  const days=config.days?.length?config.days:DAY;
  if(!days.includes(local.day))return{allowed:false,reason:'dia não permitido'};
  const start=hmToMinutes(config.dailyStart,0),end=hmToMinutes(config.dailyEnd,1440);
  if(start<=end){
    if(local.minutes<start)return{allowed:false,reason:'antes do horário diário'};
    if(local.minutes>=end)return{allowed:false,reason:'horário diário encerrado'};
  }else{
    const inOvernight=local.minutes>=start||local.minutes<end;
    if(!inOvernight)return{allowed:false,reason:'fora da janela diária'};
  }
  return{allowed:true,reason:'dentro da janela',timezone:tz,localDay:local.day};
}

export function nextEvaluation(lastEvalMs,intervalMs,nowMs=Date.now()){
  const base=Number(lastEvalMs||0),interval=Math.max(1000,Number(intervalMs||60000));
  return Math.max(nowMs,base+interval);
}
