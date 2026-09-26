import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(){
  const result=await invokeLaserMasterFunction('laser-master-devices',{});
  return NextResponse.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
}
