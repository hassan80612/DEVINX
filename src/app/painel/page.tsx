import '../hub.css';
import '../theme.css';
import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {FinanceHub} from '@/components/FinanceHub';

export const dynamic='force-dynamic';

export default async function PainelPage(){
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();
  const userId=data?.claims?.sub;
  if(!userId)redirect('/entrar');

  await supabase.rpc('register_devinx_product',{p_product:'financeiro'});

  const[{data:accessData,error:accessError},{data:profile,error:profileError}]=await Promise.all([
    supabase.rpc('get_devinx_access_status'),
    supabase.from('profiles').select('onboarded_at,locale,currency_code,timezone').eq('id',userId).maybeSingle()
  ]);

  const access=Array.isArray(accessData)?accessData[0]:accessData;
  // An unavailable access RPC is a service failure, never a subscription denial.
  // Do not send a paying user back to login as if their access had expired.
  if(accessError||!access){
    return <main style={{maxWidth:680,margin:'10vh auto',padding:28}}>
      <h1>Financeiro temporariamente indisponível</h1>
      <p>Não foi possível verificar seu acesso ao DevinX. Sua assinatura não foi alterada. Aguarde alguns instantes e tente novamente.</p>
      <a href="/painel">Tentar novamente</a>
    </main>;
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
