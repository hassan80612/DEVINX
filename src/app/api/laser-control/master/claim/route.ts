import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

type DeviceRow={
  device_id?:string;
  device_status?:string;
  connection_mode?:string|null;
};

function activeOwnedDevices(data:unknown){
  const rows=Array.isArray((data as {devices?:unknown[]}|null)?.devices)
    ?(data as {devices:DeviceRow[]}).devices
    :[];
  return rows.filter(device=>
    typeof device.device_id==='string'
    &&device.device_status==='active'
    &&device.connection_mode!=='mentor'
  );
}

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

  // Admin stays unrestricted for support/testing. Paid owner accounts keep one
  // permanent PC active at a time, but can replace it without support contact.
  let before:DeviceRow[]=[];
  if(!access.isAdmin){
    const current=await invokeLaserMasterFunction('laser-master-devices',{});
    if(current.ok)before=activeOwnedDevices(current.data);
  }

  const result=await invokeLaserMasterFunction('laser-master-pairing-claim',{pairingCode,displayName});
  const payload=(result.data&&typeof result.data==='object')
    ?result.data as Record<string,unknown>
    :{claimed:false,reason:'invalid_response'};

  if(!result.ok||payload.claimed!==true||access.isAdmin){
    return NextResponse.json(payload,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
  }

  const afterResult=await invokeLaserMasterFunction('laser-master-devices',{});
  if(!afterResult.ok){
    return NextResponse.json(payload,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
  }

  const after=activeOwnedDevices(afterResult.data);
  const beforeIds=new Set(before.map(device=>device.device_id));
  const returnedDeviceId=typeof payload.deviceId==='string'?payload.deviceId:null;
  const newIds=after.map(device=>device.device_id!).filter(id=>!beforeIds.has(id));

  const activeDeviceId=
    returnedDeviceId&&after.some(device=>device.device_id===returnedDeviceId)
      ?returnedDeviceId
      :newIds.length===1
        ?newIds[0]
        :after.length===1
          ?after[0].device_id!
          :null;

  if(!activeDeviceId){
    return NextResponse.json(
      {...payload,singlePcVerified:false},
      {status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}}
    );
  }

  let revokedCount=0;
  async function revokeOtherPermanentDevices(devices:DeviceRow[]){
    for(const device of devices){
      if(device.device_id===activeDeviceId)continue;
      const revoked=await invokeLaserMasterFunction('laser-master-device-access',{
        deviceId:device.device_id!,
        action:'revoke'
      });
      if(revoked.ok)revokedCount+=1;
    }
  }

  await revokeOtherPermanentDevices(after);

  // Fail closed under rare concurrent pairing: do not report success until the
  // subscriber has exactly one active permanent PC and it is the PC just paired.
  let singlePcVerified=false;
  for(let attempt=0;attempt<3&&!singlePcVerified;attempt++){
    const verify=await invokeLaserMasterFunction('laser-master-devices',{});
    if(!verify.ok)break;
    const active=activeOwnedDevices(verify.data);
    singlePcVerified=active.length===1&&active[0].device_id===activeDeviceId;
    if(singlePcVerified)break;
    await revokeOtherPermanentDevices(active);
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,120));
  }

  if(!singlePcVerified){
    return NextResponse.json(
      {claimed:false,reason:'single_pc_verification_failed',singlePcVerified:false},
      {status:409,headers:{'Cache-Control':'no-store, max-age=0'}}
    );
  }

  return NextResponse.json(
    {...payload,deviceId:activeDeviceId,singlePcVerified:true,replacedPreviousPc:revokedCount>0},
    {status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}}
  );
}
