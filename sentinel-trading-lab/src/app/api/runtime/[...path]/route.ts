import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../../lib/supabase-config';

export const dynamic='force-dynamic';

const hdr={'content-type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'authorization':`Bearer ${SUPABASE_PUBLISHABLE_KEY}`};

async function rpc(name:string,body:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:hdr,body:JSON.stringify(body),cache:'no-store'});
  const j=await r.json().catch(()=>({ok:false,error:`remote_http_${r.status}`}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||`remote_http_${r.status}`);
  return j;
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function waitForCommand(token:string,commandId:string){
  let last:any=null;
  for(let i=0;i<60;i++){
    await sleep(i===0?180:500);
    last=await rpc('sentinel_command_status',{p_session_token:token,p_command_id:commandId});
    if(['acked','rejected','expired','canceled'].includes(String(last.status)))break;
  }
  return last;
}

async function handle(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
  try{
    const token=req.cookies.get(SESSION_COOKIE)?.value||'';
    if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});

    const {path}=await ctx.params;
    const rel=path.join('/');

    if(rel==='status'||rel==='tick'||rel==='brokers'){
      const j=await rpc('sentinel_remote_status',{p_session_token:token,p_device_id:null});
      return NextResponse.json({ok:true,data:j.data},{headers:{'cache-control':'no-store'}});
    }

    const payload=req.method==='GET'?{}:await req.json().catch(()=>({}));
    const type=rel==='settings'?'settings':rel;
    const queued=await rpc('sentinel_enqueue_command',{
      p_session_token:token,
      p_device_id:null,
      p_command_type:type,
      p_payload:payload||{}
    });

    const commandId=String(queued.commandId||'');
    if(!commandId)throw new Error('command_not_created');

    const ack=await waitForCommand(token,commandId);
    if(!ack||!['acked','rejected','expired','canceled'].includes(String(ack.status))){
      throw new Error('agent_command_timeout');
    }
    if(ack.status!=='acked'){
      throw new Error(String(ack?.result?.error||ack.status||'agent_command_failed'));
    }

    const j=await rpc('sentinel_remote_status',{p_session_token:token,p_device_id:null});
    return NextResponse.json({ok:true,data:j.data,command:{id:commandId,status:ack.status,result:ack.result}},{headers:{'cache-control':'no-store'}});
  }catch(e:any){
    const m=String(e?.message||e);
    return NextResponse.json({ok:false,error:m},{status:m==='unauthorized'?401:409,headers:{'cache-control':'no-store'}});
  }
}

export const GET=handle;
export const POST=handle;
export const PATCH=handle;
export const DELETE=handle;
