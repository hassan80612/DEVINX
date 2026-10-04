
import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../lib/supabase-config';

export const dynamic='force-dynamic';
const headers={'content-type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'authorization':'Bearer '+SUPABASE_PUBLISHABLE_KEY};

async function rpc(name:string,body:any){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body||{}),cache:'no-store'});
  const j=await r.json().catch(()=>({ok:false,error:'remote_http_'+r.status}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||('remote_http_'+r.status));
  return j;
}

export async function GET(req:NextRequest){
  try{
    const token=req.cookies.get(SESSION_COOKIE)?.value||'';
    if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
    const j=await rpc('sentinel_master_overview',{p_session_token:token});
    return NextResponse.json({ok:true,data:j},{headers:{'cache-control':'no-store'}});
  }catch(e:any){
    const m=String(e?.message||e);
    return NextResponse.json({ok:false,error:m},{status:m==='forbidden'?403:400,headers:{'cache-control':'no-store'}});
  }
}

export async function POST(req:NextRequest){
  try{
    const token=req.cookies.get(SESSION_COOKIE)?.value||'';
    if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
    const b=await req.json().catch(()=>({}));
    const j=await rpc('sentinel_master_action',{
      p_session_token:token,
      p_action:String(b.action||''),
      p_account_id:b.accountId||null,
      p_device_id:b.deviceId||null,
      p_value:b.value||{}
    });
    return NextResponse.json({ok:true,data:j},{headers:{'cache-control':'no-store'}});
  }catch(e:any){
    const m=String(e?.message||e);
    return NextResponse.json({ok:false,error:m},{status:m==='forbidden'?403:400,headers:{'cache-control':'no-store'}});
  }
}
