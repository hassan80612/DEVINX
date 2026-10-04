import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

function keyFromSecret(secret){
  if(!secret||String(secret).length<24)throw new Error('BROKER_SESSION_ENCRYPTION_KEY must be at least 24 characters');
  return createHash('sha256').update(String(secret),'utf8').digest();
}

export class EncryptedSessionVault{
  constructor({secret,file='worker/data/broker-sessions.json.enc'}={}){
    this.key=keyFromSecret(secret);this.file=resolve(file);this.rows={};
  }
  async load(){
    try{const envelope=JSON.parse(await readFile(this.file,'utf8'));this.rows=this._decrypt(envelope)||{};}
    catch(e){if(e?.code!=='ENOENT')throw e;this.rows={};}
    return this;
  }
  _encrypt(value){
    const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',this.key,iv);const plain=Buffer.from(JSON.stringify(value),'utf8');
    const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);const tag=cipher.getAuthTag();
    return{v:1,alg:'A256GCM',iv:iv.toString('base64'),tag:tag.toString('base64'),data:encrypted.toString('base64')};
  }
  _decrypt(envelope){
    if(!envelope||envelope.v!==1||envelope.alg!=='A256GCM')throw new Error('invalid_session_vault_format');
    const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const plain=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);return JSON.parse(plain.toString('utf8'));
  }
  async _save(){
    await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp`;await writeFile(tmp,JSON.stringify(this._encrypt(this.rows)));await rename(tmp,this.file);
  }
  async put(provider,sessionRef){
    if(!['iq_option','exnova'].includes(provider))throw new Error('unsupported_broker');
    if(typeof sessionRef!=='string'||sessionRef.length<8||sessionRef.length>4096)throw new Error('invalid_session_ref');
    this.rows[provider]={sessionRef,updatedAt:new Date().toISOString()};await this._save();return{provider,stored:true,updatedAt:this.rows[provider].updatedAt};
  }
  get(provider){return this.rows[provider]?.sessionRef||null}
  async remove(provider){delete this.rows[provider];await this._save();return{provider,stored:false}}
  status(provider){return{provider,hasSession:!!this.rows[provider]?.sessionRef,updatedAt:this.rows[provider]?.updatedAt||null}}
}
