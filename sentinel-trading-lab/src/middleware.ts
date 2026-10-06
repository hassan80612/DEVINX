import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from './lib/supabase-config';

type AuthInfo={ok:boolean,role?:string,accessActive?:boolean};

async function authInfo(token:string):Promise<AuthInfo>{
  if(!token)return{ok:false};
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/sentinel_auth_me`,{
      method:'POST',
      headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},
      body:JSON.stringify({p_session_token:token}),
      cache:'no-store'
    });
    if(!r.ok)return{ok:false};
    const j=await r.json().catch(()=>null),a=j?.account;
    if(!j?.ok||!a)return{ok:false};
    return{ok:true,role:String(a.role||''),accessActive:a.accessActive===true}
  }catch{return{ok:false}}
}

export async function middleware(req:NextRequest){
  const p=req.nextUrl.pathname;
  if(p==='/favicon.ico'||p.startsWith('/_next/'))return NextResponse.next();
  if(p==='/login'||p.startsWith('/api/auth/'))return NextResponse.next();

  const token=req.cookies.get(SESSION_COOKIE)?.value||'';
  const auth=await authInfo(token);

  // V13.1: arquivos do Agent deixam de ser downloads públicos. Mesmo com a URL direta,
  // somente Master ou conta com acesso ativo recebe o instalador/payload.
  if(p.startsWith('/downloads/')){
    if(!auth.ok){
      const url=req.nextUrl.clone();url.pathname='/login';url.searchParams.set('next',p);return NextResponse.redirect(url)
    }
    if(auth.role!=='master'&&auth.accessActive!==true)return NextResponse.json({ok:false,error:'agent_access_required'},{status:403});
    return NextResponse.next()
  }

  if(auth.ok)return NextResponse.next();

  if(p.startsWith('/api/'))return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const url=req.nextUrl.clone();
  url.pathname='/login';
  url.searchParams.set('next',p);
  return NextResponse.redirect(url);
}

export const config={matcher:['/((?!_next/static|_next/image).*)']};
