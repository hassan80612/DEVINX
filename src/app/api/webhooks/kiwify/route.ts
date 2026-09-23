import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';
import {
  DEVINX_KIWIFY_INTERNATIONAL_PRODUCT_ID,
  DEVINX_KIWIFY_PRODUCT_ID
} from '@/lib/subscription-plans';

export const runtime='nodejs';

function safeHexEqual(a:string,b:string){
  try{
    const left=Buffer.from(a.trim().toLowerCase(),'hex');
    const right=Buffer.from(b.trim().toLowerCase(),'hex');
    return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);
  }catch{return false}
}

function signatureMatches(secret:string,signature:string,raw:string,payload:any){
  const expectedJson=createHmac('sha1',secret).update(JSON.stringify(payload)).digest('hex');
  const expectedRaw=createHmac('sha1',secret).update(raw).digest('hex');
  return !!signature&&(safeHexEqual(signature,expectedJson)||safeHexEqual(signature,expectedRaw));
}

export async function POST(request:NextRequest){
  const raw=await request.text();
  let payload:any;
  try{payload=JSON.parse(raw)}catch{return NextResponse.json({ok:false,error:'invalid_json'},{status:400})}

  const productId=payload?.Product?.product_id||payload?.product_id||payload?.product?.product_id||payload?.product?.id||payload?.order?.product_id||'';
  const eventType=String(payload?.webhook_event_type||payload?.event_type||payload?.event||'');
  const isBrazil=productId===DEVINX_KIWIFY_PRODUCT_ID;
  const isInternational=productId===DEVINX_KIWIFY_INTERNATIONAL_PRODUCT_ID;

  const brazilSecret=process.env.KIWIFY_WEBHOOK_TOKEN||'';
  const internationalSecret=process.env.KIWIFY_WEBHOOK_TOKEN_INTL||'';
  if(!brazilSecret&&!internationalSecret){
    return NextResponse.json({ok:false,error:'integration_not_configured'},{status:503});
  }

  const signature=(
    request.headers.get('x-kiwify-signature')||
    request.nextUrl.searchParams.get('signature')||
    ''
  ).trim();

  let secret='';
  if(isBrazil){
    secret=brazilSecret;
  }else if(isInternational){
    secret=internationalSecret;
  }else if(brazilSecret&&signatureMatches(brazilSecret,signature,raw,payload)){
    secret=brazilSecret;
  }else if(internationalSecret&&signatureMatches(internationalSecret,signature,raw,payload)){
    secret=internationalSecret;
  }

  if(!secret)return NextResponse.json({ok:false,error:'integration_not_configured'},{status:503});
  if(!signatureMatches(secret,signature,raw,payload)){
    return NextResponse.json({ok:false,error:'invalid_signature'},{status:401});
  }

  const tokenHash=createHash('sha256').update(secret).digest('hex');

  const supabase=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
  );

  if(!isBrazil&&!isInternational){
    await supabase.rpc('record_kiwify_webhook_attempt',{
      p_token_hash:tokenHash,p_outcome:'ignored',p_event_type:eventType,p_product_id:productId,p_note:'product_id_mismatch'
    });
    return NextResponse.json({ok:true,ignored:'product'});
  }

  const rpcName=isInternational?'process_kiwify_international_purchase':'process_kiwify_webhook';
  const{data,error}=await supabase.rpc(rpcName,{p_payload:payload,p_token_hash:tokenHash});
  if(error){
    await supabase.rpc('record_kiwify_webhook_attempt',{
      p_token_hash:tokenHash,p_outcome:'error',p_event_type:eventType,p_product_id:productId,p_note:error.code||'processing_failed'
    });
    console.error('kiwify webhook processing failed',error.code);
    return NextResponse.json({ok:false,error:'processing_failed'},{status:500});
  }

  await supabase.rpc('record_kiwify_webhook_attempt',{
    p_token_hash:tokenHash,p_outcome:'accepted',p_event_type:eventType,p_product_id:productId,
    p_note:isInternational?'international_prepaid':null
  });
  return NextResponse.json(data||{ok:true});
}
