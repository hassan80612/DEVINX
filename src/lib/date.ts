function deviceTimeZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo'}catch{return 'America/Sao_Paulo'}
}
function preferredTimeZone(){
  if(typeof window==='undefined')return deviceTimeZone();
  try{
    const saved=localStorage.getItem('devinx_timezone');
    return saved&&saved!=='auto'?saved:deviceTimeZone();
  }catch{return deviceTimeZone()}
}
function zonedDateISO(date:Date,timeZone:string){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const year=parts.find(part=>part.type==='year')?.value;
    const month=parts.find(part=>part.type==='month')?.value;
    const day=parts.find(part=>part.type==='day')?.value;
    if(year&&month&&day)return year+'-'+month+'-'+day;
  }catch{}
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return year+'-'+month+'-'+day;
}

export function localDateISO(date?:Date){
  if(date){
    const year=date.getFullYear();
    const month=String(date.getMonth()+1).padStart(2,'0');
    const day=String(date.getDate()).padStart(2,'0');
    return year+'-'+month+'-'+day;
  }
  return zonedDateISO(new Date(),preferredTimeZone());
}

export function localMonthStartISO(date?:Date){
  if(date)return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-01';
  return localDateISO().slice(0,7)+'-01';
}

export function localMonthEndISO(date?:Date){
  if(date){
    const end=new Date(date.getFullYear(),date.getMonth()+1,0);
    return localDateISO(end);
  }
  const current=localDateISO();
  const year=Number(current.slice(0,4));
  const month=Number(current.slice(5,7));
  const day=new Date(Date.UTC(year,month,0)).getUTCDate();
  return current.slice(0,7)+'-'+String(day).padStart(2,'0');
}

export function localMonthKey(date?:Date){
  if(date)return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
  return localDateISO().slice(0,7);
}
