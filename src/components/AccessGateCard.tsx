'use client';

import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';
import {SubscriptionPlans} from './SubscriptionPlans';
import {BrandLogo} from './BrandLogo';
import {LanguageMenu} from './LanguageMenu';

export function AccessGateCard({trialReason}:{trialReason?:string}){
  const{t}=useI18n();
  async function signOut(){await createClient().auth.signOut();location.href='/entrar'}

  const trialMessage=trialReason==='device_already_used'
    ?t('trial.deviceUsed')
    :trialReason==='not_new_user'
      ?t('trial.notEligible')
      :trialReason==='trial_disabled'
        ?t('trial.disabled')
        :'';

  return <main className="financeApp">
    <header className="financeHeader">
      <a className="brand" href="/"><BrandLogo/></a>
      <div className="financeHeaderTools"><LanguageMenu/></div>
    </header>
    <section className="paywallCard">
      <span className="goldPill">DEVINX</span>
      <h1>{t('access.expiredTitle')}</h1>
      <p>{trialMessage||t('access.expiredDesc')}</p>
      <SubscriptionPlans/>
      <button className="secondary" type="button" onClick={signOut}>{t('access.signOut')}</button>
    </section>
  </main>;
}
