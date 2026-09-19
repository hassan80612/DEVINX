'use client';

import {useEffect} from 'react';

export function IntegrationBootstrap({enabled}:{enabled:boolean}){
  useEffect(()=>{
    if(!enabled)return;
    fetch('/api/admin/sync-integrations',{method:'POST'}).catch(()=>{});
  },[enabled]);
  return null;
}
