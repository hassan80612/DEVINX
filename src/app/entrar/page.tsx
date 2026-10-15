import '../hub.css';
import '../theme.css';
import type {Metadata} from 'next';
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

export async function generateMetadata({searchParams}:{searchParams:Promise<{next?:string|string[]}>}):Promise<Metadata>{
  return {
    title:{absolute:'Entrar | DevinX'},
    description:'Entre na sua conta DevinX.',
    alternates:{canonical:'/entrar'},
    robots:{index:false,follow:false}
  };
}

export default async function EntrarPage({searchParams}:{searchParams:Promise<{next?:string|string[];erro?:string|string[];trial?:string|string[];acesso?:string|string[]}>}){
  const params=await searchParams;
  const trial=first(params.trial);
  const nextPath=safePath(params.next);
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();

  if(data?.claims){
    if(trial==='claim')return <TrialActivation/>;
    const{data:accessData,error:accessError}=await supabase.rpc('get_devinx_access_status');
    const access=Array.isArray(accessData)?accessData[0]:accessData;
    // An RPC outage must never masquerade as a blocked plan or billing failure.
    if(accessError||!access)return <main style={{maxWidth:680,margin:'10vh auto',padding:28}}>
      <h1>Não foi possível consultar seu acesso</h1>
      <p>O serviço de autenticação está temporariamente indisponível. Isso não significa que seu plano venceu.</p>
      <a href="/entrar">Tentar novamente</a>
    </main>;
    if(access.allowed)redirect(nextPath||'/painel');
    return <AccessGateCard/>;
  }

  const initialError=first(params.erro)==='link-invalido'
    ?'Esse link de recuperação é inválido ou expirou. Solicite um novo.'
    :'';

  return <AuthForm nextPath={nextPath} initialError={initialError} initialTrial={trial==='1'}/>;
}
