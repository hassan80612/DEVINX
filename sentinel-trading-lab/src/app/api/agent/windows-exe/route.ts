import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// Verify the exact executable retained in the approved 13.9.34 release.
// The SHA is Git's blob hash (content length + all original bytes).
const expectedGitBlobSha='224ed93a1c3e3c71a1fc8327e0ca869cbd6679dc';
const executablePath=join(process.cwd(),'public','downloads','Sentinel-Agent-Windows.exe');

async function getVerifiedExecutable(){
 const data=await readFile(executablePath);
 const digest=createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
 if(digest!==expectedGitBlobSha)throw new Error('sentinel_windows_exe_integrity_mismatch');
 return data;
}
function baseHeaders(length:number){
 return new Headers({
  'Content-Type':'application/octet-stream',
  'Content-Disposition':'attachment; filename="sentinel-agent-windows.exe"',
  'Content-Length':String(length),
  'Accept-Ranges':'bytes',
  'Cache-Control':'private, no-store, no-transform',
  'X-Content-Type-Options':'nosniff',
  'ETag':'"'+expectedGitBlobSha+'"'
 });
}
async function handle(req:Request,head=false):Promise<Response>{
 try{
  const data=await getVerifiedExecutable();
  const total=data.length;
  if(new URL(req.url).searchParams.get('check')==='1'){
   return Response.json({ok:true,release:'13.9.34',bytes:total,gitBlobSha:expectedGitBlobSha},
    {headers:{'Cache-Control':'no-store'}});
  }
  const headers=baseHeaders(total);
  const range=req.headers.get('range');
  if(range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
   if(!m||(!m[1]&&!m[2])){
    headers.set('Content-Range','bytes */'+total);headers.set('Content-Length','0');
    return new Response(null,{status:416,headers});
   }
   let start:number,end:number;
   if(!m[1]){
    const count=Number(m[2]);
    if(!Number.isSafeInteger(count)||count<=0){
     headers.set('Content-Range','bytes */'+total);headers.set('Content-Length','0');
     return new Response(null,{status:416,headers});
    }
    start=Math.max(0,total-count);end=total-1;
   }else{
    start=Number(m[1]);end=m[2]?Number(m[2]):total-1;
   }
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=total||end<start){
    headers.set('Content-Range','bytes */'+total);headers.set('Content-Length','0');
    return new Response(null,{status:416,headers});
   }
   end=Math.min(end,total-1);
   headers.set('Content-Range','bytes '+start+'-'+end+'/'+total);
   headers.set('Content-Length',String(end-start+1));
   return new Response(head?null:new Uint8Array(data.subarray(start,end+1)),{status:206,headers});
  }
  return new Response(head?null:new Uint8Array(data),{status:200,headers});
 }catch(e){
  console.error('Sentinel EXE delivery failed:',e instanceof Error?e.message:'unknown');
  return Response.json({ok:false,error:'exe_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
export async function GET(req:Request){return handle(req);}
export async function HEAD(req:Request){return handle(req,true);}
