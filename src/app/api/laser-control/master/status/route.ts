import {NextResponse} from 'next/server';
import {getLaserControlMasterSession} from '@/features/laser-control/server/master';
import {LASER_CONTROL_CONFIG,LASER_PLANS} from '@/features/laser-control/config';
import {LASER_REMOTE_COMMANDS_ENABLED,LASER_AGENT_PROTOCOL_VERSION} from '@/features/laser-control/protocol';

export const dynamic='force-dynamic';

export async function GET(){
  const session=await getLaserControlMasterSession();
  if(!session)return NextResponse.json({error:'not_found'},{status:404});

  return NextResponse.json({
    product:LASER_CONTROL_CONFIG.productName,
    protocolVersion:LASER_AGENT_PROTOCOL_VERSION,
    remoteCommandsEnabled:LASER_REMOTE_COMMANDS_ENABLED,
    storageConnected:true,
    pairingEnabled:true,
    reason:'remote_commands_disabled',
    plans:LASER_PLANS.map(({checkoutUrl,...plan})=>({...plan,checkoutConfigured:Boolean(checkoutUrl.BRL||checkoutUrl.USD)}))
  },{
    headers:{
      'Cache-Control':'no-store, max-age=0',
      'X-Robots-Tag':'noindex, nofollow, noarchive'
    }
  });
}
