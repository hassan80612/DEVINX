import {createHmac,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../../../../lib/supabase-config';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const PRODUCT_ID='c05e1f00-c469-11f1-8fdf-3f2670dd515f';
const MAX_BYTES=128_000;
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});

function safeSignature(signature:string,expected:string){
  if(!/^[0-9a-f]{40}$/i.test(signature))return false;
  const a=Buffer.from(signature,'hex'),b=Buffer.from(expected,'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function verifyKiwifySignature(raw:string,signature:string,secret:string){
  if(!secret||!signature)return false;
  const rawHmac=createHmac('sha1',secret).update(raw).digest('hex');
  if(safeSignature(signature,rawHmac))return true;
  // Kiwify can re-serialize event JSON prior to calculating SHA1.
  try{
    const normalized=JSON.stringify(JSON.parse(raw));
    return safeSignature(signature,createHmac('sha1',secret).update(normalized).digest('hex'));
  }catch{return false}
}
function paymentKind(payload:any):'paid'|'reversed'|null{
  const event=String(payload?.webhook_event_type||payload?.event_type||'').trim().toLowerCase();
  const status=String(payload?.order_status||payload?.status||'').trim().toLowerCase();
  if(['order_refunded','order_chargeback','order_chargedback','order_disputed','order_reversed'].includes(event)||
     ['refunded','chargeback','chargedback'].includes(status))return 'reversed';
  if(['order_approved','order_paid'].includes(event)&&['paid','approved'].includes(status))return 'paid';
  return null;
}
function toApprovedDate(value:any):string|null{
  if(typeof value!=='string'||!value.trim())return null;
  const s=value.trim();
  // Documented legacy Kiwify approved_date has Brazilian local time, no offset.
  const iso=/^\d{4}-\d\d-\d\d \d\d:\d\d(?::\d\d)?$/.test(s)?s.replace(' ','T')+'-03:00':s;
  const d=new Date(iso);
  if(!Number.isFinite(d.getTime()))return null;
  if(d.getTime()>Date.now()+3600_000||d.getTime()<Date.now()-365*86400_000)return null;
  return d.toISOString();
}
export async function POST(req:NextRequest){
  const secret=process.env.SENTINEL_KIWIFY_WEBHOOK_SECRET||'';
  const internalToken=process.env.SENTINEL_KIWIFY_DATABASE_TOKEN||'';
  if(!secret||!internalToken)return reply({ok:false,error:'webhook_not_configured'},503);
  const declared=Number(req.headers.get('content-length')||0);
  if(declared>MAX_BYTES)return reply({ok:false,error:'payload_too_large'},413);
  const raw=await req.text();
  if(raw.length>MAX_BYTES)return reply({ok:false,error:'payload_too_large'},413);
  const signature=(req.headers.get('x-kiwify-signature')||req.nextUrl.searchParams.get('signature')||'').trim();
  if(!verifyKiwifySignature(raw,signature,secret))return reply({ok:false,error:'invalid_signature'},401);
  let payload:any;try{payload=JSON.parse(raw)}catch{return reply({ok:false,error:'invalid_json'},400)}
  const productId=String(payload?.Product?.product_id||payload?.product?.product_id||payload?.product_id||'');
  if(productId!==PRODUCT_ID)return reply({ok:true,ignored:'other_product'});
  const kind=paymentKind(payload);
  if(!kind)return reply({ok:true,ignored:'unhandled_event'});
  const orderId=String(payload?.order_id||'').trim();
  const email=String(payload?.Customer?.email||payload?.customer?.email||'').trim().toLowerCase();
  if(orderId.length<6||orderId.length>180||email.length>254||!/^\S+@\S+\.\S+$/.test(email))
    return reply({ok:false,error:'missing_order_identity'},400);
  const date=toApprovedDate(payload?.approved_date)||new Date().toISOString();
  const body={
    p_order_id:orderId,p_product_id:productId,p_email:email,
    p_kind:kind,p_paid_at:kind==='paid'?date:null,
    p_event_at:new Date().toISOString(),p_internal_token:internalToken
  };
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/sentinel_kiwify_paid_verified',{
      method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    const result=await r.json().catch(()=>({ok:false}));
    if(!r.ok||result?.ok!==true){
      console.error('sentinel_kiwify_rpc_failed',r.status);
      return reply({ok:false,error:'payment_processing_failed'},503);
    }
    return reply({ok:true,processed:result.orderProcessed===true,duplicate:result.duplicate===true,accountLinked:result.accountLinked===true});
  }catch{
    return reply({ok:false,error:'payment_processing_temporarily_unavailable'},503);
  }
}
