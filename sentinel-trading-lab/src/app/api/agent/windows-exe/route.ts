import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const runtime='nodejs';
export const dynamic='force-dynamic';

// The Go installer is built anew on every release deployment. Its digest
// MUST come from that very build, not from a stale committed EXE.
const downloadDirectory=join(process.cwd(),'public','downloads');
const executablePath=join(downloadDirectory,'Sentinel-Agent-Windows.exe');
const manifestPath=join(downloadDirectory,'sentinel-windows-exe-integrity.json');
type InstallerManifest={format:string,version:string,build:string,size:number,sha256:string};

async function getVerifiedExecutable(){
 const [data,rawManifest]=await Promise.all([readFile(executablePath),readFile(manifestPath,'utf8')]);
 const info=JSON.parse(rawManifest) as InstallerManifest;
 const digest=createHash('sha256').update(data).digest('hex');
 if(info.format!=='sentinel-windows-exe-integrity-v1'||
    info.version!=='13.9.34'||
    info.build!=='13.9.34-verified-candle-context-and-covered-bootstrap'||
    info.size!==data.length||
    data.subarray(0,2).toString('ascii')!=='MZ'||
    info.sha256!==digest){
  throw new Error('sentinel_windows_exe_build_manifest_mismatch');
 }
 return {data,info};
}
function baseHeaders(length:number,sha256:string){
 return new Headers({
  'Content-Type':'application/octet-stream',
  'Content-Disposition':'attachment; filename="sentinel-agent-windows.exe"',
  'Content-Length':String(length),
  'Accept-Ranges':'bytes',
  'Cache-Control':'private, no-store, no-transform',
  'X-Content-Type-Options':'nosniff',
  'ETag':'"'+sha256+'"'
 });
}
async function handle(req:Request,head=false):Promise<Response>{
 try{
  const {data,info}=await getVerifiedExecutable();
  const total=data.length;
  if(new URL(req.url).searchParams.get('check')==='1'){
   return Response.json({ok:true,release:info.version,build:info.build,bytes:total,sha256:info.sha256},
    {headers:{'Cache-Control':'no-store'}});
  }
  const headers=baseHeaders(total,info.sha256);
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
