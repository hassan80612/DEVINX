import {NextResponse} from 'next/server';
import {getLaserControlMasterSession} from '@/features/laser-control/server/master';

export const dynamic='force-dynamic';

export async function POST(){
  const session=await getLaserControlMasterSession();
  if(!session)return NextResponse.json({error:'not_found'},{status:404});

  return NextResponse.json({
    claimed:false,
    reason:'laser_pairing_storage_not_ready',
    message:'Pairing claim is intentionally disabled until the correct DevinX database is verified.'
  },{
    status:503,
    headers:{'Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive'}
  });
}
