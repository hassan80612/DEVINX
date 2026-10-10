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
  if(p==='/'||p==='/planos'||p==='/favicon.ico'||p==='/downloads/agent-update.json'||p.startsWith('/_next/'))return NextResponse.next();
  // Authenticated installed Agents can fetch signed release packages to
  // update themselves without a browser session. Non-paying users cannot.
  if(p==='/downloads/agent_payload_v88.zip'&&req.headers.has('x-sentinel-agent-install')){
    try{
      const encoded=String(req.headers.get('x-sentinel-agent-install')||'');
      if(encoded.length>1300)throw new Error('identity_size');
      const proof=JSON.parse(atob(encoded));
      const installId=String(proof.installId||''),deviceSecret=String(proof.deviceSecret||'');
      if(installId.length<16||installId.length>128||deviceSecret.length<24||deviceSecret.length>180)throw new Error('identity_invalid');
      const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/sentinel_agent_register',{
        method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY},
        body:JSON.stringify({p_install_id:installId,p_device_secret:deviceSecret,p_display_name:'Sentinel Agent Update',p_agent_version:'auto-update'}),
        signal:AbortSignal.timeout(8000),cache:'no-store'
      });
      const authorized=await response.json().catch(()=>null);
      if(response.ok&&authorized?.ok===true&&authorized?.paired===true&&authorized?.accessActive===true)return NextResponse.next();
    }catch{}
    return NextResponse.json({ok:false,error:'update_requires_paid_access'},{status:403,headers:{'cache-control':'no-store'}});
  }
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
