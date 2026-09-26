import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{deviceId?:string;action?:string};
  try{body=await request.json()}catch{return NextResponse.json({ok:false,error:'invalid_json'},{status:400})}
  const deviceId=String(body.deviceId||'');
  const action=body.action==='reactivate'?'reactivate':'revoke';
  if(!/^[0-9a-f-]{36}$/i.test(deviceId))return NextResponse.json({ok:false,error:'invalid_device'},{status:400});

  const result=await invokeLaserMasterFunction('laser-master-device-access',{deviceId,action});
  return NextResponse.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
}
