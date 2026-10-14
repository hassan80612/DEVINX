'use client';
import {useEffect} from 'react';

// Presence describes an OPEN authenticated browser tab, not a login cookie
// with a 30-day lifetime. Once every tab closes, these pulses stop and the
// paid Windows Agent fails closed after 60 seconds. No polling of quotes.
export function ActiveBrowserSession(){
 useEffect(()=>{
  let mounted=true;
  let inFlight=false;
  const ping=async()=>{
   if(!mounted||inFlight)return;
   inFlight=true;
   try{
    const response=await fetch('/api/auth/presence',{method:'POST',
      cache:'no-store',credentials:'same-origin',keepalive:true});
    if(response.status===401){
     mounted=false;
     window.location.replace('/login');
    }
   }catch{}finally{inFlight=false}
  };
  void ping();
  const interval=window.setInterval(()=>{void ping()},12000);
  const foreground=()=>{void ping()};
  window.addEventListener('focus',foreground);
  document.addEventListener('visibilitychange',foreground);
  // No logout or network action on unload: another open browser tab with
  // the same authenticated session must continue to work.
  return()=>{mounted=false;clearInterval(interval);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground)};
 },[]);
 return null;
}
