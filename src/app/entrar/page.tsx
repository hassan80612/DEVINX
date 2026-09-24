import '../hub.css';
import '../theme.css';
import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {AuthForm} from './AuthForm';
import {TrialActivation} from '@/components/TrialActivation';
import {AccessGateCard} from '@/components/AccessGateCard';

export const dynamic='force-dynamic';

function safePath(value:string|string[]|undefined){
  const candidate=Array.isArray(value)?value[0]:value;
  return candidate&&candidate.startsWith('/')&&!candidate.startsWith('//')?candidate:'';
}

function first(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value}

export default async function EntrarPage({searchParams}:{searchParams:Promise<{next?:string|string[];erro?:string|string[];trial?:string|string[];acesso?:string|string[]}>}){
  const params=await searchParams;
  const trial=first(params.trial);
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();

  if(data?.claims){
    if(trial==='claim')return <TrialActivation/>;
    const{data:accessData}=await supabase.rpc('get_devinx_access_status');
    const access=Array.isArray(accessData)?accessData[0]:accessData;
    if(access?.allowed)redirect('/painel');
    return <AccessGateCard/>;
  }

  const initialError=first(params.erro)==='link-invalido'
    ?'Esse link de recuperação é inválido ou expirou. Solicite um novo.'
    :'';

  return <AuthForm nextPath={safePath(params.next)} initialError={initialError} initialTrial={trial==='1'}/>;
}
