import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {FinanceHub} from '@/components/FinanceHub';

export const dynamic='force-dynamic';

export default async function PainelPage(){
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();
  const userId=data?.claims?.sub;
  if(!userId)redirect('/entrar');

  const[{data:accessData,error:accessError},{data:profile,error:profileError}]=await Promise.all([
    supabase.rpc('get_devinx_access_status'),
    supabase.from('profiles').select('onboarded_at,locale,currency_code,timezone').eq('id',userId).maybeSingle()
  ]);

  const access=Array.isArray(accessData)?accessData[0]:accessData;
  if(accessError||!access?.allowed)redirect('/entrar?acesso=expirado');
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
