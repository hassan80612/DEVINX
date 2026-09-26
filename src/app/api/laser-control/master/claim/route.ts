import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{pairingCode?:string;displayName?:string};
  try{body=await request.json()}catch{return NextResponse.json({claimed:false,reason:'invalid_json'},{status:400})}

  const pairingCode=String(body.pairingCode||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  const displayName=String(body.displayName||'PC Windows').trim().slice(0,80)||'PC Windows';
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(pairingCode)){
    return NextResponse.json({claimed:false,reason:'invalid_code'},{status:400});
  }

  const result=await invokeLaserMasterFunction('laser-master-pairing-claim',{pairingCode,displayName});
  return NextResponse.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
}
