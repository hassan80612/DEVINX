import {NextResponse} from 'next/server';
import {invokeLaserMasterFunction} from '@/features/laser-control/server/invoke-master-function';

export const dynamic='force-dynamic';

export async function POST(request:Request){
  let body:Record<string,unknown>;
  try{body=await request.json()}catch{
    return NextResponse.json({error:'invalid_json'},{status:400});
  }
  const result=await invokeLaserMasterFunction('laser-mentor-session',body);
  return NextResponse.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store, max-age=0'}});
}
