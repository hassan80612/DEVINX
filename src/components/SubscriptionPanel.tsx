'use client';

import {useEffect,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {SubscriptionPlans} from './SubscriptionPlans';

type SubscriptionDetails={
  status:string;
  source:string;
  plan_name:string|null;
  amount_minor:number|null;
  currency_code:string|null;
  expires_at:string|null;
  subscription_status:string|null;
  canceled_at:string|null;
  last_event_at:string|null;
  checkout_url:string|null;
};

function checkoutForLocale(url:string,locale:string){
  if(locale==='pt-BR'||/([?&])region=intl(?:&|$)/.test(url))return url;
  return url+(url.includes('?')?'&':'?')+'region=intl';
}

export function SubscriptionPanel({isAdmin=false}:{isAdmin?:boolean}){
  const{t,locale,date}=useI18n();
  const[data,setData]=useState<SubscriptionDetails|null>(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    const s=createClient();
    const{data,error}=await s.rpc('get_devinx_subscription_details');
    if(!error){
      const row=Array.isArray(data)?data[0]:data;
      setData((row||null) as SubscriptionDetails|null);
    }
    setLoading(false);
  })()},[]);

  if(loading)return <section className="subscriptionCard compact"><span className="loader"/></section>;
  if(isAdmin)return <section className="subscriptionCard active"><div><small>{t('subscription.label')}</small><h3>{t('subscription.masterAccess')}</h3><p>{t('subscription.masterHelp')}</p></div><span className="subscriptionState">{t('common.active')}</span></section>;

  const active=data?.status==='active';
  const manual=data?.source==='manual';
  const checkout=data?.checkout_url?checkoutForLocale(data.checkout_url,locale):null;
  const amount=data?.amount_minor!=null
    ?new Intl.NumberFormat(locale,{style:'currency',currency:data.currency_code||'BRL'}).format(Number(data.amount_minor)/100)
    :t('subscription.price');

  return <section className={'subscriptionCard '+(active?'active':'inactive')}>
    <div className="subscriptionTop">
      <div><small>{t('subscription.label')}</small><h3>{active?(manual?t('subscription.manualActive'):t('subscription.active')):t('subscription.inactive')}</h3></div>
      <span className={'subscriptionState '+(active?'ok':'warn')}>{active?t('common.active'):t('common.blocked')}</span>
    </div>
    <div className="subscriptionFacts">
      {!manual&&<span><b>{t('subscription.plan')}:</b> {data?.plan_name||t('subscription.monthly')}</span>}
      {!manual&&<span><b>{t('subscription.value')}:</b> {amount}{data?.amount_minor==null?' / '+t('subscription.month'):''}</span>}
      {data?.expires_at&&<span><b>{t('subscription.renewal')}:</b> {date(data.expires_at,{day:'2-digit',month:'long',year:'numeric'})}</span>}
      {manual&&data?.expires_at&&<span><b>{t('subscription.validUntil')}:</b> {date(data.expires_at,{day:'2-digit',month:'long',year:'numeric'})}</span>}
      {manual&&!data?.expires_at&&<span><b>{t('subscription.access')}:</b> {t('subscription.noExpiry')}</span>}
      {!manual&&active&&!data?.expires_at&&<span><b>{t('subscription.renewal')}:</b> {t('subscription.managedByKiwify')}</span>}
      {data?.subscription_status&&<span><b>{t('subscription.status')}:</b> {data.subscription_status}</span>}
    </div>
    {!active&&<SubscriptionPlans variant="compact"/>}
    {active&&!manual&&checkout&&<a className="secondary subscriptionCta" href={checkout}>{t('subscription.checkout')}</a>}
  </section>;
}
