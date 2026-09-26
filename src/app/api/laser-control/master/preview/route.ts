import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{action?:string;deviceId?:string;active?:boolean;knownVersion?:number};
  try{body=await request.json()}catch{
    return NextResponse.json({error:'invalid_json'},{status:400});
  }

  const deviceId=String(body.deviceId||'');
  if(!/^[0-9a-f-]{36}$/i.test(deviceId))
    return NextResponse.json({error:'invalid_device'},{status:400});

  if(body.action!=='session'&&body.action!=='meta')
    return NextResponse.json({error:'invalid_action'},{status:400});

  const payload=body.action==='session'
    ?{action:'session',deviceId,active:body.active===true}
    :{action:'meta',deviceId,knownVersion:Number.isSafeInteger(body.knownVersion)?body.knownVersion:0};

  const result=await invokeLaserMasterFunction('laser-master-preview',payload);
  return NextResponse.json(result.data,{
    status:result.status,
    headers:{'Cache-Control':'no-store, max-age=0'}
  });
}
