import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

export async function POST(){
  return NextResponse.json({
    accepted:false,
    reason:'laser_pairing_storage_not_ready',
    remoteCommandsEnabled:false
  },{
    status:503,
    headers:{
      'Cache-Control':'no-store, max-age=0',
      'Retry-After':'3600',
      'X-Robots-Tag':'noindex, nofollow, noarchive'
    }
  });
}
