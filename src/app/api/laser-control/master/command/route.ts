import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{
    action?:string;
    deviceId?:string;
    sessionId?:string;
    command?:string;
    commandId?:string;
    idempotencyKey?:string;
  };
  try{body=await request.json()}catch{
    return NextResponse.json({error:'invalid_json'},{status:400});
  }

  let payload:Record<string,unknown>;
  if(body.action==='send'){
    const deviceId=String(body.deviceId||'');
    const sessionId=String(body.sessionId||'');
    const command=String(body.command||'');
    const idempotencyKey=String(body.idempotencyKey||'');
    if(!/^[0-9a-f-]{36}$/i.test(deviceId)
      ||!/^[0-9a-f-]{36}$/i.test(sessionId)
      ||!/^[0-9a-f-]{36}$/i.test(idempotencyKey)
      ||!['start','pause','stop','frame'].includes(command))
      return NextResponse.json({error:'invalid_command'},{status:400});
    payload={action:'send',deviceId,sessionId,command,idempotencyKey};
  }else if(body.action==='status'){
    const commandId=String(body.commandId||'');
    if(!/^[0-9a-f-]{36}$/i.test(commandId))
      return NextResponse.json({error:'invalid_command_id'},{status:400});
    payload={action:'status',commandId};
  }else{
    return NextResponse.json({error:'invalid_action'},{status:400});
  }

  const result=await invokeLaserMasterFunction('laser-master-command',payload);
  return NextResponse.json(result.data,{
    status:result.status,
    headers:{'Cache-Control':'no-store, max-age=0'}
  });
}
