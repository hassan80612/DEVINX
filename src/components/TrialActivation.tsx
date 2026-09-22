'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {getTrialDeviceHash} from '@/lib/trial-device';
import {useI18n} from '@/i18n/provider';
import {AccessGateCard} from './AccessGateCard';

type ClaimResult={claimed:boolean;allowed:boolean;reason:string;expires_at:string|null};

export function TrialActivation(){
  const{t}=useI18n();
  const[failed,setFailed]=useState('');

  useEffect(()=>{let active=true;(async()=>{
    try{
      const s=createClient();
      const hash=await getTrialDeviceHash();
      const{data,error}=await s.rpc('claim_devinx_trial',{p_device_hash:hash});
      if(!active)return;
      if(error){setFailed('error');return}
      const row=(Array.isArray(data)?data[0]:data) as ClaimResult|null;
      if(row?.allowed){const{data:{user}}=await s.auth.getUser();const{data:profile}=user?await s.from('profiles').select('onboarded_at').eq('id',user.id).maybeSingle():{data:null};location.replace(profile?.onboarded_at?'/painel':'/onboarding');return}
      setFailed(row?.reason||'error');
    }catch{if(active)setFailed('error')}
  })();return()=>{active=false}},[]);

  if(failed)return <AccessGateCard trialReason={failed}/>;
  return <main className="financeApp"><section className="centerState"><span className="loader"/><b>{t('trial.activating')}</b><p>{t('trial.activatingHelp')}</p></section></main>;
}
