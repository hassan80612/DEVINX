import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {AuthForm} from './AuthForm';

export const dynamic='force-dynamic';

function safePath(value:string|string[]|undefined){
  const candidate=Array.isArray(value)?value[0]:value;
  return candidate&&candidate.startsWith('/')&&!candidate.startsWith('//')?candidate:'';
}

export default async function EntrarPage({searchParams}:{searchParams:Promise<{next?:string|string[];erro?:string|string[]}>}){
  const params=await searchParams;
  const supabase=await createServerSupabaseClient();
  const{data}=await supabase.auth.getClaims();
  if(data?.claims)redirect('/painel');

  const initialError=(Array.isArray(params.erro)?params.erro[0]:params.erro)==='link-invalido'
    ?'Esse link de recuperação é inválido ou expirou. Solicite um novo.'
    :'';

  return <AuthForm nextPath={safePath(params.next)} initialError={initialError}/>;
}
