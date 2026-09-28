import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';

const LASER_PRODUCT_ID='a7e51ae0-bb55-11f1-8e93-792b23e3fb86';

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

function productId(payload:any){
  return String(
    payload?.Product?.product_id||
    payload?.product_id||
    payload?.product?.product_id||
    payload?.product?.id||
    payload?.order?.product_id||
    ''
  );
}

export async function GET(){
  return NextResponse.json({
    ok:true,
    product:'DevinX Laser Control',
    productId:LASER_PRODUCT_ID,
    webhook:'ready_for_configuration'
  },{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:NextRequest){
  const raw=await request.text();
  let payload:any;
  try{payload=JSON.parse(raw)}
  catch{return NextResponse.json({ok:false,error:'invalid_json'},{status:400})}

  if(productId(payload)!==LASER_PRODUCT_ID)
    return NextResponse.json({ok:true,ignored:'product'});

  const secret=process.env.KIWIFY_LASER_WEBHOOK_TOKEN||'';
  if(!secret)
    return NextResponse.json({ok:false,error:'laser_webhook_not_configured'},{status:503});

  const signature=(
    request.headers.get('x-kiwify-signature')||
    request.nextUrl.searchParams.get('signature')||
    ''
  ).trim();

  if(!signatureMatches(secret,signature,raw,payload))
    return NextResponse.json({ok:false,error:'invalid_signature'},{status:401});

  const supabase=createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
  );
  const tokenHash=createHash('sha256').update(secret).digest('hex');
  const{data,error}=await supabase.rpc('process_kiwify_laser_webhook',{
    p_payload:payload,p_token_hash:tokenHash
  });
  if(error){
    console.error('kiwify laser webhook processing failed',error.code);
    return NextResponse.json({ok:false,error:'processing_failed'},{status:500});
  }

  return NextResponse.json(data||{ok:true,accepted:true});
}
