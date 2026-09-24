'use client';

import {useEffect} from 'react';

const SYNC_KEY='devinx-integration-sync-v1';
const SYNC_INTERVAL_MS=24*60*60*1000;

export function IntegrationBootstrap({enabled}:{enabled:boolean}){
  useEffect(()=>{
    if(!enabled)return;
    try{
      const last=Number(localStorage.getItem(SYNC_KEY)||0);
      if(Number.isFinite(last)&&Date.now()-last<SYNC_INTERVAL_MS)return;
    }catch{}

    let active=true;
    fetch('/api/admin/sync-integrations',{method:'POST'})
      .then(response=>{
        if(!active||!response.ok)return;
        try{localStorage.setItem(SYNC_KEY,String(Date.now()))}catch{}
      })
      .catch(()=>{});

    return()=>{active=false};
  },[enabled]);
  return null;
}
