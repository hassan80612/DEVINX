import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{
    action?:string;
    deviceId?:string;
    active?:boolean;
    knownVersion?:number;
    enabled?:boolean;
    x?:number;
    y?:number;
  };
  try{body=await request.json()}catch{
    return NextResponse.json({error:'invalid_json'},{status:400});
  }

  const deviceId=String(body.deviceId||'');
  if(!/^[0-9a-f-]{36}$/i.test(deviceId))
    return NextResponse.json({error:'invalid_device'},{status:400});

  let payload:Record<string,unknown>;
  if(body.action==='session'){
    payload={action:'session',deviceId,active:body.active===true};
  }else if(body.action==='meta'){
    payload={action:'meta',deviceId,knownVersion:Number.isSafeInteger(body.knownVersion)?body.knownVersion:0};
  }else if(body.action==='touch'){
    payload={action:'touch',deviceId,enabled:body.enabled===true};
  }else if(body.action==='tap'){
    const x=Number(body.x);
    const y=Number(body.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)
      return NextResponse.json({error:'invalid_coordinates'},{status:400});
    payload={action:'tap',deviceId,x,y};
  }else{
    return NextResponse.json({error:'invalid_action'},{status:400});
  }

  const result=await invokeLaserMasterFunction('laser-master-preview',payload);
  return NextResponse.json(result.data,{
    status:result.status,
    headers:{'Cache-Control':'no-store, max-age=0'}
  });
}
