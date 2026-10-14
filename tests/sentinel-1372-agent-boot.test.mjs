import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

const agent=resolve(new URL('../sentinel-trading-lab/agent',import.meta.url).pathname);
const installer=resolve(new URL('../sentinel-trading-lab/public/downloads/install-agent-v88.ps1',import.meta.url).pathname);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise((res,rej)=>{
 const srv=createServer();srv.on('error',rej);
 srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;srv.close(()=>res(port))});
});

test('13.7.2 installer starts and verifies the manager BEFORE starting tray or watchdog',()=>{
 const ps=readFileSync(installer,'utf8');
 const start=ps.indexOf('$managerProcess = Start-Process');
 const verify=ps.indexOf('$managerHealth.workerHealthy');
 const tray=ps.indexOf("Start-Process -FilePath 'powershell.exe' -ArgumentList",start);
 assert.ok(start>=0&&verify>start&&tray>verify);
 assert.match(ps,/manager-start-stderr\.log/);
 assert.match(ps,/worker\.log/);
});
test('actual agent worker boots under its manager, validates release/build/pid then exits cleanly',
 {timeout:45000},async()=>{
 const managerPort=await freePort(),workerPort=await freePort();
 const env={...process.env,
  SENTINEL_MANAGER_PORT:String(managerPort),
  SENTINEL_WORKER_PORT:String(workerPort),
  SENTINEL_WORKER_HOST:'127.0.0.1',
  SENTINEL_SUPABASE_URL:'http://127.0.0.1:1',
  SENTINEL_MARKET_JOURNAL:'0',
  SENTINEL_STATE_FILE:'worker/data/smoke-state.json',
  SENTINEL_SESSION_VAULT_FILE:'worker/data/smoke-vault.json.enc',
  SENTINEL_LOCAL_SECRET_FILE:'worker/data/smoke-agent.secret'};
 let output='';
 const manager=spawn(process.execPath,['worker/agent-manager.mjs'],{
  cwd:agent,env,stdio:['ignore','pipe','pipe']
 });
 manager.stderr.on('data',s=>{output+=String(s).slice(-1500)});
 manager.stdout.on('data',s=>{output+=String(s).slice(-1500)});
 const expected=JSON.parse(readFileSync(resolve(agent,'release.json'),'utf8'));
 let ok=false,latest=null;
 try{
  const until=Date.now()+30000;
  while(Date.now()<until&&!manager.exitCode&&!manager.signalCode){
   try{
    const r=await fetch('http://127.0.0.1:'+managerPort+'/health',{signal:AbortSignal.timeout(1000)});
    latest=await r.json();
    if(latest.workerHealthy&&latest.version===expected.version&&
       latest.build===expected.build&&latest.workerPid>0){ok=true;break}
   }catch{}
   await sleep(300);
  }
  let workerLog='';
  try{workerLog=readFileSync(resolve(agent,'worker/data/worker.log'),'utf8').slice(-4500)}catch{}
  assert.equal(ok,true,'Manager did not launch a healthy version-matched child: '+JSON.stringify(latest)+' '+output+' WORKER LOG: '+workerLog);
  const worker=await fetch('http://127.0.0.1:'+workerPort+'/health',{signal:AbortSignal.timeout(1000)}).then(r=>r.json());
  assert.equal(worker.pid,latest.workerPid);
  assert.equal(worker.version,expected.version);
 }finally{
  try{await fetch('http://127.0.0.1:'+managerPort+'/exit',{
    method:'POST',signal:AbortSignal.timeout(1200)})}catch{}
  await sleep(400);
  if(manager.exitCode===null)manager.kill('SIGTERM');
 }
});
