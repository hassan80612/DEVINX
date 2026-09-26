import {NextRequest,NextResponse} from 'next/server';
import {getLaserControlMasterSession} from '@/features/laser-control/server/master';
import {verifyLaserPairingProof} from '@/features/laser-control/server/verify-pairing';
import type {LaserPairingProof} from '@/features/laser-control/pairing';

export const dynamic='force-dynamic';

export async function POST(request:NextRequest){
  const session=await getLaserControlMasterSession();
  if(!session)return NextResponse.json({error:'not_found'},{status:404});

  let proof:LaserPairingProof;
  try{proof=await request.json() as LaserPairingProof}
  catch{return NextResponse.json({ok:false,reason:'invalid_json'},{status:400})}

  const result=verifyLaserPairingProof(proof);
  if(!result.ok){
    return NextResponse.json(result,{
      status:400,
      headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}
    });
  }

  return NextResponse.json({
    ...result,
    persisted:false,
    activated:false,
    remoteCommandsEnabled:false,
    message:'Pairing proof is cryptographically valid. Safe foundation does not persist or activate devices.'
  },{
    headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}
  });
}
