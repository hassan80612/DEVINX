import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';

const SUPABASE_URL='https://vwczyqvptziyseagettp.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ubJ_fSkmRa68XPdrV_8Q5A_dcYTRWWj';
const ANON_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Y3p5cXZwdHppeXNlYWdldHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Njc0OTQsImV4cCI6MjEwMzI0MzQ5NH0.TneHtLeLgAZHzdfBTAIBr1fQawTYppKdoYzbcbPW0jE';

export class SentinelRemoteRelay{
  constructor({file='worker/data/remote-device.json',version='8.6.0'}={}){this.file=resolve(file);this.version=version;this.identity=null;this.info={paired:false,pairingCode:null,deviceId:null,lastContactAt:null,lastError:null};}
  async init(){
    try{this.identity=JSON.parse(await readFile(this.file,'utf8'))}catch(e){if(e?.code!=='ENOENT')throw e;await mkdir(dirname(this.file),{recursive:true});this.identity={installId:randomUUID(),deviceToken:randomBytes(32).toString('base64url')};await writeFile(this.file,JSON.stringify(this.identity,null,2),{encoding:'utf8',mode:0o600});await chmod(this.file,0o600).catch(()=>{})}
    return this.register();
  }
  async rpc(name,args){
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json','apikey':PUBLISHABLE_KEY,'authorization':`Bearer ${ANON_JWT}`},body:JSON.stringify(args),cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await r.json().catch(()=>({ok:false,error:`rpc_${r.status}`}));if(!r.ok||j?.ok===false)throw new Error(j?.error||`rpc_${r.status}`);this.info.lastContactAt=Date.now();this.info.lastError=null;return j;
  }
  async register(){try{const j=await this.rpc('sentinel_agent_register',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_display_name:process.env.COMPUTERNAME||'PC Sentinel',p_agent_version:this.version});this.info={...this.info,paired:!!j.paired,pairingCode:j.pairingCode||null,deviceId:j.deviceId||null,lastContactAt:Date.now(),lastError:null};return j}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async heartbeat(state){try{const j=await this.rpc('sentinel_agent_heartbeat',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_state:state||{},p_agent_version:this.version});this.info.paired=!!j.paired;return j}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async poll(){try{return await this.rpc('sentinel_agent_poll',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken})}catch(e){this.info.lastError=String(e?.message||e);return null}}
  async ack(commandId,ok,result={}){try{return await this.rpc('sentinel_agent_ack',{p_install_id:this.identity.installId,p_device_secret:this.identity.deviceToken,p_command_id:commandId,p_ok:!!ok,p_result:result||{}})}catch(e){this.info.lastError=String(e?.message||e);return null}}
}
