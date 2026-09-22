import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {FinanceHub} from '@/components/FinanceHub';

export const dynamic='force-dynamic';

export default async function PainelPage(){
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();
  const userId=data?.claims?.sub;
  if(!userId)redirect('/entrar');

  const{data:accessData,error:accessError}=await supabase.rpc('get_devinx_access_status');
  const access=Array.isArray(accessData)?accessData[0]:accessData;
  if(accessError||!access?.allowed)redirect('/entrar?acesso=expirado');

  const{data:profile}=await supabase.from('profiles').select('onboarded_at').eq('id',userId).maybeSingle();
  if(!profile?.onboarded_at)redirect('/onboarding');
  return <FinanceHub/>;
}
