import '../hub.css';
import '../theme.css';
import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {FinanceHub} from '@/components/FinanceHub';
import {AccessUnavailableCard} from '@/components/AccessUnavailableCard';

export const dynamic='force-dynamic';

export default async function PainelPage(){
  const supabase=await createServerSupabaseClient();
  const{data,error:authError}=await supabase.auth.getClaims();
  const userId=data?.claims?.sub;
  if(!userId){
    if(authError&&(authError.status===402||(authError.status??0)>=500||/exceed_egress_quota|project is restricted/i.test(authError.message||'')))return <AccessUnavailableCard/>;
    redirect('/entrar');
  }

  await supabase.rpc('register_devinx_product',{p_product:'financeiro'});

  const[{data:accessData,error:accessError},{data:profile,error:profileError}]=await Promise.all([
    supabase.rpc('get_devinx_access_status'),
    supabase.from('profiles').select('onboarded_at,locale,currency_code,timezone').eq('id',userId).maybeSingle()
  ]);

  const access=Array.isArray(accessData)?accessData[0]:accessData;
  if(accessError||!access){
    console.error('DEVINX_ACCESS_CHECK_UNAVAILABLE',{code:accessError?.code??'empty_response'});
    return <AccessUnavailableCard/>;
  }
  if(!access.allowed)redirect('/entrar?acesso=expirado');
  if(profileError)throw profileError;
  if(!profile?.onboarded_at)redirect('/onboarding');

  return <FinanceHub
    initialAccess={access}
    initialProfile={{
      locale:profile.locale||null,
      currency_code:profile.currency_code||null,
      timezone:profile.timezone||null
    }}
  />;
}
