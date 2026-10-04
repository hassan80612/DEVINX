const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

export class QuadcodeFeed {
  constructor({domain,onFrame}={}){
    this.domain=domain;
    this.onFrame=typeof onFrame==='function'?onFrame:()=>{};
    this.ws=null;
    this.ssid=null;
    this.connected=false;
    this.authenticated=false;
    this.lastMessageAt=null;
    this.lastError=null;
    this.serverTime=null;
    this.pending=new Map();
  }
  get ready(){return !!(this.ws&&this.ws.readyState===1)}
  status(){
    const ageMs=this.lastMessageAt?Math.max(0,Date.now()-this.lastMessageAt):null;
    return{connected:this.connected,authenticated:this.authenticated,ready:this.ready,lastMessageAt:this.lastMessageAt,messageAgeMs:ageMs,healthy:!!(this.ready&&this.authenticated&&(ageMs==null||ageMs<30000)),lastError:this.lastError,domain:this.domain}
  }
  _rejectPending(reason='websocket_closed'){
    for(const [id,row] of this.pending){clearTimeout(row.timer);row.reject(new Error(reason));this.pending.delete(id)}
  }
  async close(){
    const ws=this.ws;this.ws=null;this.connected=false;this.authenticated=false;
    this._rejectPending();
    try{ws?.close()}catch{}
  }
  _sendRaw(raw){
    if(!this.ready)return false;
    try{this.onFrame(raw,'direct-out');this.ws.send(raw);return true}catch(e){this.lastError=String(e?.message||e);return false}
  }
  send(payload){return this._sendRaw(typeof payload==='string'?payload:JSON.stringify(payload))}
  request(payload,timeoutMs=3500){
    if(!this.ready)return Promise.reject(new Error('websocket_not_ready'));
    const obj=typeof payload==='string'?JSON.parse(payload):{...(payload||{})};
    const id=String(obj.request_id||`sentinel-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    obj.request_id=id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('websocket_request_timeout'))},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      if(!this.send(obj)){clearTimeout(timer);this.pending.delete(id);reject(new Error('websocket_send_failed'))}
    });
  }
  _handleMessage(raw){
    this.lastMessageAt=Date.now();this.onFrame(raw,'direct-in');
    let data=null;try{data=JSON.parse(String(raw))}catch{return}
    const requestId=String(data?.request_id||'');
    if(requestId&&this.pending.has(requestId)){
      const row=this.pending.get(requestId);this.pending.delete(requestId);clearTimeout(row.timer);row.resolve(data);
    }
    const name=String(data?.name||'');
    if(name==='authenticated'&&data?.msg===true)this.authenticated=true;
    if(name==='profile'){this.authenticated=true;this.connected=true}
    if(name==='timeSync'){const t=Number(data?.msg);if(Number.isFinite(t))this.serverTime=t}
    if(name==='heartbeat'){
      const hb=Number(data?.msg?.heartbeatTime??data?.msg);
      if(Number.isFinite(hb))this.send({name:'heartbeat',msg:{msg:{heartbeatTime:hb,userTime:Number(this.serverTime||Date.now())}},request_id:''});
    }
  }
  async connect(ssid){
    if(!ssid)throw new Error('broker_ssid_cookie_not_found');
    if(this.ready&&this.ssid===ssid&&this.authenticated)return this.status();
    await this.close();this.ssid=ssid;this.lastError=null;
    const url=`wss://${this.domain}/echo/websocket`;
    const ws=new WebSocket(url);this.ws=ws;
    ws.addEventListener('message',ev=>this._handleMessage(ev.data));
    ws.addEventListener('close',()=>{this.connected=false;this.authenticated=false;this._rejectPending()});
    ws.addEventListener('error',()=>{this.lastError='websocket_error'});
    let opened=false;
    for(let i=0;i<40;i++){
      if(ws.readyState===1){opened=true;break}
      if(ws.readyState===2||ws.readyState===3)break;
      await sleep(100);
    }
    if(!opened){this.lastError='websocket_open_timeout';throw new Error(this.lastError)}
    this.connected=true;
    this.send({name:'authenticate',msg:{ssid,protocol:3},request_id:''});
    for(let i=0;i<18;i++){if(this.authenticated)break;await sleep(100)}
    if(!this.authenticated){this.send({name:'ssid',msg:ssid,request_id:''});for(let i=0;i<18;i++){if(this.authenticated)break;await sleep(100)}}
    if(!this.authenticated){this.lastError='websocket_auth_timeout';throw new Error(this.lastError)}
    return this.status();
  }
}
