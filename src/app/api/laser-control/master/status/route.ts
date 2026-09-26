import {NextResponse} from 'next/server';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

export async function GET(){
  const access=await getLaserMasterAccess();
  if(!access.authenticated||!access.allowed){
    return NextResponse.json(
      {error:'not_found'},
      {status:404,headers:{'Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive'}}
    );
  }

  return NextResponse.json({
    product:'DevinX Laser Control',
    protocolVersion:1,
    remoteCommandsEnabled:false,
    storageConnected:true,
    pairingEnabled:true,
    reason:'remote_commands_disabled'
  },{
    headers:{
      'Cache-Control':'no-store, max-age=0',
      'X-Robots-Tag':'noindex, nofollow, noarchive'
    }
  });
}
