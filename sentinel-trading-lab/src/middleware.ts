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
  if(p==='/'||p==='/planos'||p==='/favicon.ico'||p.startsWith('/_next/'))return NextResponse.next();
  if(p==='/login'||p.startsWith('/api/auth/')||p==='/api/webhooks/kiwify')return NextResponse.next();

  const token=req.cookies.get(SESSION_COOKIE)?.value||'';
  const auth=await authInfo(token);

  // Having an account is not a license. Clients must have a verified
  // Kiwify payment before entering the console, pairing, streaming or even
  // downloading static EXE/ZIP assets. The database owns the expiry clock.
  if(auth.ok&&(auth.role==='master'||auth.accessActive===true))return NextResponse.next();
  if(auth.ok){
    if(p.startsWith('/api/'))return NextResponse.json({ok:false,error:'subscription_inactive'},{status:403,headers:{'cache-control':'no-store'}});
    return NextResponse.redirect(new URL('/planos',req.url));
  }
  if(p.startsWith('/api/'))return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const url=req.nextUrl.clone();
  url.pathname='/login';
  url.searchParams.set('next',req.nextUrl.pathname+req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config={matcher:['/((?!_next/static|_next/image).*)']};
