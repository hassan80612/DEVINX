import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';

const PRODUCT_ID='42a1cde0-b411-11f1-b998-436a8b692e83';

function safeHexEqual(a:string,b:string){
  try{
    const left=Buffer.from(a.trim().toLowerCase(),'hex');
    const right=Buffer.from(b.trim().toLowerCase(),'hex');
    return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);
  }catch{return false}
}

export async function POST(request:NextRequest){
  const secret=process.env.KIWIFY_WEBHOOK_TOKEN;
  if(!secret)return NextResponse.json({ok:false,error:'integration_not_configured'},{status:503});

  const raw=await request.text();
  let payload:any;
  try{payload=JSON.parse(raw)}catch{return NextResponse.json({ok:false,error:'invalid_json'},{status:400})}

  const signature=(
    request.headers.get('x-kiwify-signature')||
    request.nextUrl.searchParams.get('signature')||
    ''
  ).trim();
  const expectedJson=createHmac('sha1',secret).update(JSON.stringify(payload)).digest('hex');
  const expectedRaw=createHmac('sha1',secret).update(raw).digest('hex');
  if(!signature||(!safeHexEqual(signature,expectedJson)&&!safeHexEqual(signature,expectedRaw))){
    return NextResponse.json({ok:false,error:'invalid_signature'},{status:401});
  }

  const productId=payload?.Product?.product_id||payload?.product_id||'';
  if(productId!==PRODUCT_ID)return NextResponse.json({ok:true,ignored:'product'});

  const supabase=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
  );

  const tokenHash=createHash('sha256').update(secret).digest('hex');
  const{data,error}=await supabase.rpc('process_kiwify_webhook',{p_payload:payload,p_token_hash:tokenHash});
  if(error){
    console.error('kiwify webhook processing failed',error.code);
    return NextResponse.json({ok:false,error:'processing_failed'},{status:500});
  }
  return NextResponse.json(data||{ok:true});
}
