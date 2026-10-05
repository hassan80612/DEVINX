import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from './lib/supabase-config';

async function valid(token:string){
  if(!token)return false;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/sentinel_auth_me`,{
      method:'POST',
      headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},
      body:JSON.stringify({p_session_token:token}),
      cache:'no-store'
    });
    if(!r.ok)return false;
    const j=await r.json().catch(()=>null);
    return !!j?.ok
  }catch{return false}
}

export async function middleware(req:NextRequest){
  const p=req.nextUrl.pathname;
  if(p.startsWith('/downloads/')||p==='/favicon.ico'||p.startsWith('/_next/'))return NextResponse.next();
  if(p==='/login'||p.startsWith('/api/auth/'))return NextResponse.next();

  if(p.startsWith('/api/runtime/')||p==='/api/master'||p.startsWith('/api/devices'))return NextResponse.next();
  const token=req.cookies.get(SESSION_COOKIE)?.value||'';
  if(await valid(token))return NextResponse.next();

  if(p.startsWith('/api/'))return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const url=req.nextUrl.clone();
  url.pathname='/login';
  url.searchParams.set('next',p);
  return NextResponse.redirect(url);
}

export const config={matcher:['/((?!_next/static|_next/image).*)']};

