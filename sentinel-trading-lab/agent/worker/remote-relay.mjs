import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const SUPABASE_URL=process.env.SENTINEL_SUPABASE_URL||'https://vwczyqvptziyseagettp.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ubJ_fSkmRa68XPdrV_8Q5A_dcYTRWWj';
function persistentIdentityFile(){
  if(process.platform==='win32'&&process.env.LOCALAPPDATA)return resolve(process.env.LOCALAPPDATA,'SentinelTradingLabIdentity','remote-device.json');
  return resolve('worker/data/remote-device.json');
}
const LEGACY_IDENTITY_FILE=resolve('worker/data/remote-device.json');

async function seedPersistentIdentity(target){
  if(resolve(target)===LEGACY_IDENTITY_FILE)return;
  try{await readFile(target,'utf8');return}catch(e){if(e?.code!=='ENOENT')return}
  try{
    const legacy=await readFile(LEGACY_IDENTITY_FILE,'utf8');
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,legacy,{encoding:'utf8',mode:0o600});
    await chmod(target,0o600).catch(()=>{});
  }catch{}
}

const ANON_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Y3p5cXZwdHppeXNlYWdldHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Njc0OTQsImV4cCI6MjEwMzI0MzQ5NH0.TneHtLeLgAZHzdfBTAIBr1fQawTYppKdoYzbcbPW0jE';

function dpapiProtect(text){
  if(process.platform!=='win32')return {format:'plain-dev',value:text};
  const input=Buffer.from(String(text),'utf8').toString('base64');
  const script=[
    "Add-Type -AssemblyName System.Security",
    "$b=[Convert]::FromBase64String($env:SENTINEL_DPAPI_INPUT)",
    "$e=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::LocalMachine)",
    "[Convert]::ToBase64String($e)"
  ].join(';');
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
    encoding:'utf8',
    windowsHide:true,
    env:{...process.env,SENTINEL_DPAPI_INPUT:input},
    timeout:5000
  }).trim();
  if(!out)throw new Error('dpapi_protect_failed');
  return {format:'dpapi-local-machine-v1',value:out};
}

function dpapiUnprotect(record){
  if(record?.format==='plain-dev')return String(record.value||'');
  if(process.platform!=='win32')throw new Error('dpapi_windows_required');
  const scope=record?.format==='dpapi-local-machine-v1'?'LocalMachine':
    record?.format==='dpapi-current-user-v1'?'CurrentUser':null;
  if(!scope||!record?.value)throw new Error('dpapi_record_invalid');
  const script=[
    "Add-Type -AssemblyName System.Security",
    "$b=[Convert]::FromBase64String($env:SENTINEL_DPAPI_INPUT)",
    `$d=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::${scope})`,
    "[Text.Encoding]::UTF8.GetString($d)"
  ].join(';');
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
    encoding:'utf8',
    windowsHide:true,
    env:{...process.env,SENTINEL_DPAPI_INPUT:String(record.value)},
    timeout:5000
  }).trim();
  if(!out)throw new Error('dpapi_unprotect_failed');
  return out;
}

async function writeIdentity(file,identity){
  await mkdir(dirname(file),{recursive:true});
  const protectedToken=dpapiProtect(identity.deviceToken);
  const stored={format:'sentinel-device-v2',installId:identity.installId,deviceToken:protectedToken};
  await writeFile(file,JSON.stringify(stored,null,2),{encoding:'utf8',mode:0o600});
  await chmod(file,0o600).catch(()=>{});
}

async function loadOrCreateIdentity(file){
  try{
    const stored=JSON.parse(await readFile(file,'utf8'));
    if(stored?.format==='sentinel-device-v2'&&stored?.installId&&stored?.deviceToken){
      try{
        const token=dpapiUnprotect(stored.deviceToken);
        if(token){
          const identity={installId:String(stored.installId),deviceToken:token};
          if(stored.deviceToken?.format!=='dpapi-local-machine-v1')await writeIdentity(file,identity);
          return identity;
        }
      }catch{
        // Copied/moved identity cannot be decrypted on another Windows profile/PC.
        const fresh={installId:randomUUID(),deviceToken:randomBytes(32).toString('base64url')};
        await writeIdentity(file,fresh);
        return fresh;
      }
    }
    if(stored?.installId&&stored?.deviceToken&&typeof stored.deviceToken==='string'){
      const migrated={installId:String(stored.installId),deviceToken:String(stored.deviceToken)};
      await writeIdentity(file,migrated);
      return migrated;
    }
  }catch(e){
    if(e?.code!=='ENOENT')throw e;
  }
  const fresh={installId:randomUUID(),deviceToken:randomBytes(32).toString('base64url')};
  await writeIdentity(file,fresh);
  return fresh;
}

export class SentinelRemoteRelay{
  constructor({file=null,version='11.6.0'}={}){this.file=resolve(file||persistentIdentityFile());this.version=version;this.identity=null;this.info={paired:false,pairingCode:null,deviceId:null,accessActive:false,accessReason:'unpaired',lastContactAt:null,lastError:null};}
  async init(){
    await seedPersistentIdentity(this.file);
    this.identity=await loadOrCreateIdentity(this.file);
    return this.register();
  }
  async rpc(name,args){
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json','apikey':PUBLISHABLE_KEY,'authorization':`Bearer ${ANON_JWT}`},body:JSON.stringify(args),cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>({ok:false,error:`rpc_${r.status}`}));if(!r.ok||j?.ok===false)throw new Error(j?.error||`rpc_${r.status}`);this.info.lastContactAt=Date.now();this.info.lastError=null;return j;
  }
  _apply(j={}){
    if('paired' in j)this.info.paired=!!j.paired;
    if('accessActive' in j)this.info.accessActive=!!j.accessActive;
    if('accessReason' in j)this.info.accessReason=j.accessReason||null;
    if(j.deviceId)this.info.deviceId=j.deviceId;
    if('pairingCode' in j)this.info.pairingCode=j.pairingCode||null;
    return j;
  }
  async register(){try{const j=await this.rpc('sentinel_agent_register',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_display_name:process.env.COMPUTERNAME||'PC Sentinel',p_agent_version:this.version});return this._apply(j)}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async heartbeat(state){try{const j=await this.rpc('sentinel_agent_heartbeat',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_state:state||{},p_agent_version:this.version});return this._apply(j)}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async poll(){try{const j=await this.rpc('sentinel_agent_poll',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken});return this._apply(j)}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async ack(commandId,ok,result={}){try{const j=await this.rpc('sentinel_agent_ack',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_command_id:commandId,p_ok:!!ok,p_result:result||{}});return this._apply(j)}catch(e){this.info.lastError=String(e?.message||e);return null}}
}
