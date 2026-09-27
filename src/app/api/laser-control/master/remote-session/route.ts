import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{action?:string;deviceId?:string;sessionId?:string;enabled?:boolean};
  try{body=await request.json()}catch{
    return NextResponse.json({error:'invalid_json'},{status:400});
  }

  const action=String(body.action||'');
  let payload:Record<string,unknown>;

  if(action==='open'||action==='renew'){
    const deviceId=String(body.deviceId||'');
    if(!/^[0-9a-f-]{36}$/i.test(deviceId))
      return NextResponse.json({error:'invalid_device'},{status:400});
    payload={action,deviceId};
  }else if(action==='input'||action==='close'){
    const sessionId=String(body.sessionId||'');
    if(!/^[0-9a-f-]{36}$/i.test(sessionId))
      return NextResponse.json({error:'invalid_session'},{status:400});
    payload=action==='input'
      ?{action,sessionId,enabled:body.enabled===true}
      :{action,sessionId};
  }else{
    return NextResponse.json({error:'invalid_action'},{status:400});
  }

  const result=await invokeLaserMasterFunction('laser-master-remote-session',payload);
  return NextResponse.json(result.data,{
    status:result.status,
    headers:{'Cache-Control':'no-store, max-age=0'}
  });
}
