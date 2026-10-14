import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../../lib/supabase-config';
export async function GET(req:NextRequest){
  const token=req.cookies.get(SESSION_COOKIE)?.value||'';if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/sentinel_auth_me`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},body:JSON.stringify({p_session_token:token}),cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>null);
    if(r.status===401||r.status===403||j?.error==='unauthorized')return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}});
    if(!r.ok||j?.ok!==true||!j?.account)return NextResponse.json({ok:false,error:'session_check_unavailable'},{status:503,headers:{'cache-control':'no-store','retry-after':'3'}});
    const a=j.account;return NextResponse.json({ok:true,user:{id:a.id,email:a.email},profile:{role:a.role,plan:a.plan,max_devices:a.maxDevices,agent_enabled:a.agentEnabled,access_expires_at:a.accessExpiresAt,access_active:a.accessActive}},{headers:{'cache-control':'no-store'}});
  }catch{return NextResponse.json({ok:false,error:'session_check_unavailable'},{status:503,headers:{'cache-control':'no-store','retry-after':'3'}})}
}
