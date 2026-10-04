import http from 'node:http';
import {spawn} from 'node:child_process';
import {writeFile,mkdir,rm,appendFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const VERSION='9.1.0';
const HOST='127.0.0.1';
const PORT=Number(process.env.SENTINEL_MANAGER_PORT||8788);
const WORKER_PORT=Number(process.env.SENTINEL_WORKER_PORT||8787);
const ROOT=resolve(process.cwd());
const WORKER=resolve(ROOT,'worker/index.mjs');
const PID_DIR=resolve(ROOT,'worker/data');
const MANAGER_PID=resolve(PID_DIR,'manager.pid');
const WORKER_PID=resolve(PID_DIR,'worker.pid');
const EXIT_MARKER=resolve(PID_DIR,'agent.exit');
const MANAGER_LOG=resolve(PID_DIR,'manager.log');
const DEFAULT_ALLOWED_ORIGINS=['https://sentinel-trading-lab.vercel.app','https://sentinel-trading-lab-iguassu-shop.vercel.app'];
const EXTRA=(process.env.SENTINEL_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
const ALLOWED=new Set([...DEFAULT_ALLOWED_ORIGINS,...EXTRA]);

let worker=null;
let exiting=false;
let restartTimer=null;
let lastExit=null;
let lastStart=null;
let workerEnabled=true;

function allowedOrigin(origin=''){
  if(origin===''||origin==='http://localhost:3000'||origin==='http://127.0.0.1:3000')return true;
  if(ALLOWED.has(origin))return true;
  return false;
}
function cors(req){const origin=String(req.headers.origin||'');const h={'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'600','cache-control':'no-store','vary':'Origin'};if(allowedOrigin(origin))h['access-control-allow-origin']=origin||'*';if(req.headers['access-control-request-private-network']==='true')h['access-control-allow-private-network']='true';return h}
function json(req,res,code,data){res.writeHead(code,{'content-type':'application/json; charset=utf-8',...cors(req)});res.end(JSON.stringify(data))}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function healthWorker(){try{const r=await fetch(`http://${HOST}:${WORKER_PORT}/health`,{cache:'no-store',signal:AbortSignal.timeout(900)});if(!r.ok)return false;const j=await r.json().catch(()=>null);return !!j?.ok}catch{return false}}
async function savePid(file,pid){await mkdir(dirname(file),{recursive:true});await writeFile(file,String(pid),'utf8').catch(()=>{})}
async function removePid(file){await rm(file,{force:true}).catch(()=>{})}
async function logLine(message){await mkdir(PID_DIR,{recursive:true}).catch(()=>{});await appendFile(MANAGER_LOG,`${new Date().toISOString()} ${message}\n`,'utf8').catch(()=>{})}

function spawnWorker(){
  if(exiting||!workerEnabled)return;
  if(worker&&!worker.killed)return;
  const env={...process.env,SENTINEL_WORKER_HOST:HOST,SENTINEL_WORKER_PORT:String(WORKER_PORT),SENTINEL_ALLOWED_ORIGINS:[...ALLOWED].join(',')};
  worker=spawn(process.execPath,[WORKER],{cwd:ROOT,env,windowsHide:true,stdio:['ignore','ignore','ignore']});
  lastStart=Date.now();
  savePid(WORKER_PID,worker.pid);
  worker.on('error',(e)=>{lastExit={code:null,signal:'spawn_error',error:String(e?.message||e),at:Date.now()};logLine(`worker_error ${String(e?.message||e)}`);worker=null;removePid(WORKER_PID);if(!exiting){clearTimeout(restartTimer);restartTimer=setTimeout(spawnWorker,1200)}});
  worker.on('exit',(code,signal)=>{
    lastExit={code,signal,at:Date.now()};logLine(`worker_exit code=${code} signal=${signal}`);worker=null;removePid(WORKER_PID);
    if(!exiting){clearTimeout(restartTimer);restartTimer=setTimeout(spawnWorker,1200)}
  });
}
async function stopWorker(){
  clearTimeout(restartTimer);
  const p=worker;worker=null;
  if(p&&!p.killed){try{p.kill('SIGTERM')}catch{};for(let i=0;i<20;i++){if(p.exitCode!=null)break;await sleep(100)};if(p.exitCode==null){try{p.kill('SIGKILL')}catch{}}}
  await removePid(WORKER_PID);
}
async function restartWorker(){workerEnabled=true;await stopWorker();await sleep(250);spawnWorker();for(let i=0;i<30;i++){if(await healthWorker())return true;await sleep(250)}return false}
async function pauseWorker(){workerEnabled=false;await stopWorker();return true}
async function startWorker(){workerEnabled=true;if(!(await healthWorker()))spawnWorker();for(let i=0;i<30;i++){if(await healthWorker())return true;await sleep(250)}return false}

await removePid(EXIT_MARKER);
await savePid(MANAGER_PID,process.pid);
spawnWorker();

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS'){res.writeHead(204,cors(req));return res.end()}
    const origin=String(req.headers.origin||'');if(origin&&!allowedOrigin(origin))return json(req,res,403,{ok:false,error:'origin_not_allowed'});
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/health'&&req.method==='GET'){
      const workerHealthy=await healthWorker();
      return json(req,res,200,{ok:true,status:workerEnabled?'running':'paused',version:VERSION,workerEnabled,workerHealthy,workerPid:worker?.pid||null,managerPid:process.pid,lastStart,lastExit});
    }
    if(url.pathname==='/start'&&req.method==='POST'){
      const workerHealthy=await startWorker();
      return json(req,res,workerHealthy?200:503,{ok:workerHealthy,status:workerHealthy?'running':'worker_failed_to_start',version:VERSION,workerEnabled,workerHealthy});
    }
    if(url.pathname==='/stop'&&req.method==='POST'){
      await pauseWorker();
      return json(req,res,200,{ok:true,status:'paused',version:VERSION,workerEnabled:false,workerHealthy:false});
    }
    if(url.pathname==='/restart'&&req.method==='POST'){
      const workerHealthy=await restartWorker();
      return json(req,res,workerHealthy?200:503,{ok:workerHealthy,status:workerHealthy?'running':'worker_failed_to_start',version:VERSION,workerHealthy});
    }
    if(url.pathname==='/exit'&&req.method==='POST'){
      await mkdir(PID_DIR,{recursive:true}).catch(()=>{});
      await writeFile(EXIT_MARKER,String(Date.now()),'utf8').catch(()=>{});
      json(req,res,200,{ok:true,status:'stopping'});exiting=true;setTimeout(async()=>{await stopWorker();server.close(async()=>{await removePid(MANAGER_PID);process.exit(0)})},100);return;
    }
    return json(req,res,404,{ok:false,error:'not_found'});
  }catch(e){return json(req,res,500,{ok:false,error:String(e?.message||e)})}
});
server.on('error',async e=>{if(e?.code==='EADDRINUSE'){await removePid(MANAGER_PID);process.exit(0)}console.error(e)});
server.listen(PORT,HOST);

async function shutdown(){if(exiting)return;exiting=true;await stopWorker();server.close(async()=>{await removePid(MANAGER_PID);process.exit(0)})}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);process.on('uncaughtException',(e)=>{logLine(`manager_uncaught ${String(e?.stack||e)}`)});process.on('unhandledRejection',(e)=>{logLine(`manager_rejection ${String(e?.stack||e)}`)});
