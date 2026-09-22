const STORAGE_KEY='devinx-trial-device-v1';

function randomToken(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function getTrialDeviceHash(){
  let token=window.localStorage.getItem(STORAGE_KEY);
  if(!token){
    token=randomToken();
    window.localStorage.setItem(STORAGE_KEY,token);
  }
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
