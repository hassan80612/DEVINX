import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:{pairingCode?:string;displayName?:string};
  try{body=await request.json()}catch{return NextResponse.json({claimed:false,reason:'invalid_json'},{status:400})}

  const pairingCode=String(body.pairingCode||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  const displayName=String(body.displayName||'PC Windows').trim().slice(0,80)||'PC Windows';
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(pairingCode)){
    return NextResponse.json({claimed:false,reason:'invalid_code'},{status:400});
  }

  const access=await getLaserControlAccess();
  if(!access.authenticated)return NextResponse.json({claimed:false,reason:'unauthorized'},{status:401});
  if(!access.isAdmin&&!access.ownerAccess)return NextResponse.json({claimed:false,reason:'owner_access_required'},{status:403});

  // The database is the authority for PC capacity. It serializes pairing against
  // the entitlement row, swaps the old PC automatically when the base limit is 1,
  // and allows purchased extra slots without client-side revocation races.
  const result=await invokeLaserMasterFunction('laser-master-pairing-claim',{pairingCode,displayName});
  const payload=(result.data&&typeof result.data==='object')
    ?result.data as Record<string,unknown>
    :{claimed:false,reason:'invalid_response'};

  return NextResponse.json(payload,{
    status:result.status,
    headers:{'Cache-Control':'no-store, max-age=0'}
  });
}
