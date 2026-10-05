import {BrokerAdapterContract} from './contract.mjs';

const READ_STEPS=['session','account_mode','balance','assets','active_id','quote','candles'];
const ALL_STEPS=[...READ_STEPS];
function initialChecklist(){return Object.fromEntries(ALL_STEPS.map(k=>[k,{ok:false,checkedAt:null,message:'pendente'}]))}
function safeNumber(v){const n=Number(v);if(!Number.isFinite(n))throw new Error('invalid_numeric_response');return n}

export class BrowserBrokerAdapter extends BrokerAdapterContract{
  constructor({provider,driver=null}={}){super();this.provider=provider;this.driver=driver;this.sessionRef=null;this.connected=false;this.validated=false;this.accountMode='unknown';this.lastCheckedAt=null;this.lastError=null;this.checklist=initialChecklist()}
  attachSessionRef(ref){this.sessionRef=ref||null;this.connected=false;this.validated=false;this.lastError=null;this.checklist=initialChecklist();if(ref)this._step('session',true,'sessão local pronta');return this.status()}
  _recalc(){this.validated=READ_STEPS.every(k=>this.checklist[k]?.ok===true)}
  _step(name,ok,message){this.checklist[name]={ok:!!ok,checkedAt:new Date().toISOString(),message:String(message||'')};this.lastCheckedAt=new Date().toISOString();this._recalc();return this.checklist[name]}
  status(){const md=this.driver?.liveStatus?.(this.provider)||null;return{provider:this.provider,connected:this.connected,validated:this.validated,readOnlyValidated:this.validated,accountMode:this.accountMode,hasSession:!!this.sessionRef,driverAttached:!!this.driver?.available,lastCheckedAt:this.lastCheckedAt,lastError:this.lastError,checklist:this.checklist,executionReady:!!md?.executionReady}}
  refreshFromLive(){const md=this.driver?.liveStatus?.(this.provider)||{};if(!this.connected)return this.status();const mode=String(md.mode||'').toLowerCase();if(['demo','real'].includes(mode)){this.accountMode=mode;this._step('account_mode',true,`conta ${mode.toUpperCase()} ativa`)}else this._step('account_mode',false,'modo da conta ainda não detectado');this._step('balance',md.balance!=null,md.balance!=null?`saldo ${this.accountMode==='real'?'REAL':this.accountMode==='demo'?'DEMO':''} lido`.trim():'saldo ainda não recebido');const assets=Array.isArray(md.assets)?md.assets:[];this._step('assets',assets.length>0,assets.length?`${assets.length} ativos detectados`:'ativos ainda não detectados');const activeOk=!!md.symbol&&md.activeId!=null;this._step('active_id',activeOk,activeOk?`${md.symbol} / ID ${md.activeId}`:'ID do ativo ainda não detectado');this._step('quote',md.quote!=null,md.quote!=null?`cotação recebida para ${md.symbol||'ativo atual'}`:'cotação ainda não recebida');const candleOk=Array.isArray(md.candles)&&md.candles.length>=50&&md.candleFresh!==false;this._step('candles',candleOk,candleOk?`${md.candles.length} candles atuais recebidos`:md.candles?.length>=50?'candles recebidos, aguardando atualização em tempo real':`${md.candles?.length||0} candles recebidos; mínimo 50`);if(this.validated)this.lastError=null;else if(this.lastError==='account_mode_not_detected'&&['demo','real'].includes(mode)){const pending=READ_STEPS.find(k=>this.checklist[k]?.ok!==true);this.lastError=pending?`${pending}_pending`:null}return this.status()}
  async health(){return this.status()}
  async disconnect(){if(this.driver?.available&&this.connected){await this.driver.call(this.provider,'disconnect',{body:{sessionRef:this.sessionRef}}).catch(()=>{})}this.connected=false;this.validated=false;return this.status()}
  async connect(){
    if(!this.sessionRef){this.lastError='session_ref_missing';return this.status()}
    if(!this.driver?.available){this.lastError='browser_driver_not_configured';return this.status()}
    try{
      await this.driver.call(this.provider,'connect',{body:{sessionRef:this.sessionRef,accountMode:'auto'}});
      this.connected=true;this._step('session',true,'sessão conectada ao navegador local');
      await this.validateReadOnly({soft:true});
    }catch(e){this.lastError=String(e?.message||e)}
    return this.status()
  }
  async validateReadOnly({soft=false}={}){
    if(!this.connected)throw new Error('broker_not_connected');
    const failures=[];
    try{const account=await this.driver.call(this.provider,'account',{method:'GET'});const mode=String(account?.mode||'').toLowerCase();this.accountMode=mode||'unknown';const ok=['demo','real'].includes(mode);this._step('account_mode',ok,ok?`conta ${mode.toUpperCase()} ativa`:`modo recebido: ${mode||'desconhecido'}`);if(!ok)failures.push('account_mode_not_detected')}catch(e){this._step('account_mode',false,String(e?.message||e));failures.push(String(e?.message||e))}
    try{const bal=await this.driver.call(this.provider,'balance',{method:'GET'});safeNumber(bal?.balance??bal);this._step('balance',true,`saldo ${this.accountMode==='real'?'REAL':this.accountMode==='demo'?'DEMO':''} lido`.trim())}catch(e){this._step('balance',false,String(e?.message||e));failures.push(String(e?.message||e))}
    let assets=[];try{assets=await this.driver.call(this.provider,'assets',{method:'GET'});if(!Array.isArray(assets)||!assets.length)throw new Error('asset_list_empty');this._step('assets',true,`${assets.length} ativos detectados`)}catch(e){this._step('assets',false,String(e?.message||e));failures.push(String(e?.message||e))}
    let market={};try{market=await this.driver.call(this.provider,'market-snapshot',{method:'GET'})||{}}catch{}
    const symbol=String(market?.symbol||assets?.[0]?.symbol||assets?.[0]||'');
    const activeOk=!!symbol&&market?.activeId!=null;this._step('active_id',activeOk,activeOk?`${symbol} / ID ${market.activeId}`:'ID do ativo ainda não detectado');if(!activeOk)failures.push('active_id_not_detected');
    try{if(!symbol)throw new Error('active_symbol_not_detected');const quote=await this.driver.call(this.provider,`quote?symbol=${encodeURIComponent(symbol)}`,{method:'GET'});safeNumber(quote?.price??quote);this._step('quote',true,`cotação recebida para ${symbol}`)}catch(e){this._step('quote',false,String(e?.message||e));failures.push(String(e?.message||e))}
    try{const candles=await this.driver.call(this.provider,`candles?symbol=${encodeURIComponent(symbol)}&limit=50`,{method:'GET'});if(!Array.isArray(candles)||candles.length<50)throw new Error('candles_insufficient');this._step('candles',true,`${candles.length} candles recebidos`)}catch(e){this._step('candles',false,String(e?.message||e));failures.push(String(e?.message||e))}
    this.lastError=failures.length?failures[0]:null;
    this.refreshFromLive();
    if(failures.length&&!soft&&!this.validated)throw new Error(failures[0]);
    return this.status()
  }
  async validateDemoOrder(){const md=this.driver?.liveStatus?.(this.provider)||{};if(this.accountMode!=='demo')throw new Error('demo_account_required');if(!md.executionReady)throw new Error('demo_order_controls_not_detected');return{ok:true,provider:this.provider,mode:this.accountMode}}
  async getAccountMode(){return this.accountMode}
  async getBalance(){const r=await this.driver.call(this.provider,'balance',{method:'GET'});return safeNumber(r?.balance??r)}
  async getQuote(asset){return this.driver.call(this.provider,`quote?symbol=${encodeURIComponent(asset)}`,{method:'GET'})}
  async listAssets(){return this.driver.call(this.provider,'assets',{method:'GET'})}
  async placeDemoOrder(order){if(!this.connected)throw new Error('broker_not_connected');if(this.accountMode!=='demo')throw new Error('demo_account_required');return this.driver.call(this.provider,'orders/demo',{method:'POST',body:order})}
  async placeOrder(order){if(this.accountMode==='demo')return this.placeDemoOrder(order);throw new Error('real_execution_requires_human_confirmation')}
  async prepareRealOrder(order){return{...order,provider:this.provider,status:'prepared',requiresHumanConfirmation:true}}
  async confirmRealOrder(){throw new Error('real_execution_requires_human_confirmation_and_separate_validated_flow')}
}
