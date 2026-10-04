import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';

const pagePath='src/app/page.tsx';
let src=readFileSync(pagePath,'utf8');

// Keep the visible Agent release in sync with the EXE published by CI.
src=src
  .replaceAll('V8.6.0','V8.7.0')
  .replaceAll('V8.6','V8.7')
  .replaceAll('Agent 8.6','Agent 8.7')
  .replaceAll('Agent v8.6','Agent v8.7');


const oldContent="const content=useMemo(()=>s?<Panel name={tab} s={s} act={act} busy={busy} agent={agent} agentCommand={agentCommand} account={account} pairCode={pairCode} setPairCode={setPairCode} claimPair={claimPair}/>:<Loading/> ,[tab,s,busy,agent,account,pairCode]);";
const newContent="const content=useMemo(()=>tab==='Master Console'?<Master s={s} act={act} busy={busy}/>:s?<Panel name={tab} s={s} act={act} busy={busy} agent={agent} agentCommand={agentCommand} account={account} pairCode={pairCode} setPairCode={setPairCode} claimPair={claimPair}/>:<OfflinePanel/>,[tab,s,busy,agent,account,pairCode,isMaster]);";
if(!src.includes(oldContent)) throw new Error('Sentinel patch: content anchor not found');
src=src.replace(oldContent,newContent);

const oldNoPc="setErr(m==='pc_nao_vinculado'?'Nenhum PC vinculado a esta conta. Instale o Agent e informe o código SNTL abaixo.':m)";
const newNoPc="setErr(m==='pc_nao_vinculado'?'':m)";
if(src.includes(oldNoPc))src=src.replace(oldNoPc,newNoPc);

const loadingAnchor="function Loading(){return <div className=\"grid\"><section className=\"card span12\"><div className=\"skeleton h32\"/><div className=\"skeleton h90\"/></section></div>}\nfunction Panel";
const loadingReplacement="function Loading(){return <div className=\"grid\"><section className=\"card span12\"><div className=\"skeleton h32\"/><div className=\"skeleton h90\"/></section></div>}\nfunction OfflinePanel(){return <div className=\"grid\"><section className=\"card span12\"><div className=\"eyebrow\">SENTINEL PRONTO</div><h3>Aguardando o PC vinculado</h3><p className=\"muted\">Sua conta está funcionando. Instale ou abra o Agent no PC, use o código SNTL para vincular e o painel começará a receber saldo, mercado e estado do bot automaticamente.</p><div className=\"metrics\"><Metric label=\"Site\" value=\"ONLINE\"/><Metric label=\"Conta\" value=\"ATIVA\"/><Metric label=\"Agent\" value=\"AGUARDANDO\"/><Metric label=\"Bot\" value=\"OFFLINE\"/></div></section></div>}\nfunction Panel";
if(!src.includes(loadingAnchor))throw new Error('Sentinel patch: loading anchor not found');
src=src.replace(loadingAnchor,loadingReplacement);

const start=src.indexOf("function Master({s,act,busy}");
const end=src.indexOf("function Settings(",start);
if(start<0||end<0) throw new Error('Sentinel patch: master anchors not found');

const masterBlock=String.raw`
function Master({s,act,busy}:{s:Status|null,act:any,busy:boolean}){
  const[data,setData]=useState<any>(null);
  const[adminBusy,setAdminBusy]=useState(false);
  const[msg,setMsg]=useState('');
  const load=useCallback(async()=>{try{const r=await fetch('/api/master',{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'master_failed');setData(j.data);setMsg('')}catch(e:any){setMsg(String(e?.message||e))}},[]);
  useEffect(()=>{load();const id=setInterval(load,5000);return()=>clearInterval(id)},[load]);
  const admin=async(payload:any)=>{setAdminBusy(true);setMsg('');try{const r=await fetch('/api/master',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'master_action_failed');await load()}catch(e:any){setMsg(String(e?.message||e))}finally{setAdminBusy(false)}};
  const accounts=data?.accounts||[];
  const devices=accounts.flatMap((a:any)=>a.devices||[]);
  const online=devices.filter((d:any)=>d.online).length;
  return <div className="grid">
    <section className="card span12">
      <div className="split"><div><div className="eyebrow">MASTER PRIVADA</div><h3>Central administrativa Sentinel</h3><p className="muted">Acesso exclusivo da conta Master. Usuários comuns nunca recebem esta aba nem os endpoints administrativos.</p></div><div className="actions"><Pill tone="good">MASTER ACTIVE</Pill><button className="secondary" disabled={adminBusy} onClick={load}>Atualizar</button></div></div>
      <div className="metrics">
        <Metric label="Contas" value={String(accounts.length)}/>
        <Metric label="PCs" value={String(devices.length)}/>
        <Metric label="PCs online" value={String(online)}/>
        <Metric label="Runtime atual" value={String(s?.state||'SEM PC').toUpperCase()}/>
      </div>
      {msg&&<div className="alert"><b>Master:</b> {msg}</div>}
    </section>
    {accounts.map((a:any)=><MasterAccount key={a.id} a={a} admin={admin} busy={adminBusy}/>)}
    {!accounts.length&&<section className="card span12"><Empty text="Carregando contas da Master..."/></section>}
    <section className="card span12">
      <div className="split"><div><h3>Auditoria Master</h3><p className="muted">As ações administrativas ficam registradas. Senhas, tokens e credenciais da corretora não são exibidos.</p></div><Pill>{String(data?.audit?.length||0)} eventos</Pill></div>
      <div className="timeline">{(data?.audit||[]).map((x:any)=><div className="event" key={x.id}><time>{tm(x.createdAt)}</time><div><b>{String(x.action).replaceAll('_',' ')}</b><span>{x.targetDeviceId?'PC '+String(x.targetDeviceId).slice(0,8):x.targetAccountId?'Conta '+String(x.targetAccountId).slice(0,8):'Sistema'}</span></div></div>)}</div>
    </section>
  </div>
}

function MasterAccount({a,admin,busy}:{a:any,admin:any,busy:boolean}){
  const[plan,setPlan]=useState(String(a.plan||'development'));
  const[max,setMax]=useState(String(a.maxDevices||1));
  useEffect(()=>{setPlan(String(a.plan||'development'));setMax(String(a.maxDevices||1))},[a.plan,a.maxDevices]);
  const cmd=(d:any,command:string)=>admin({action:'device_command',accountId:a.id,deviceId:d.id,value:{command}});
  return <section className="card span12">
    <div className="split"><div><div className="eyebrow">{a.role==='master'?'SUA CONTA MASTER':'CONTA CLIENTE'}</div><h3>{a.email}</h3><p className="muted">Criada em {new Date(a.createdAt).toLocaleString('pt-BR')} · {a.sessionCount||0} sessão(ões) ativa(s)</p></div><div className="actions"><Pill tone={a.status==='active'?'good':'bad'}>{String(a.status).toUpperCase()}</Pill><Pill>{String(a.role).toUpperCase()}</Pill></div></div>
    <div className="formgrid three">
      <label className="field"><span>Plano</span><input value={plan} onChange={e=>setPlan(e.target.value)}/></label>
      <label className="field"><span>Limite de PCs</span><input type="number" min="1" max="50" value={max} onChange={e=>setMax(e.target.value)}/></label>
      <div className="field"><span>Administração</span><div className="actions"><button className="secondary" disabled={busy} onClick={()=>admin({action:'set_plan',accountId:a.id,value:{plan}})}>Salvar plano</button><button className="secondary" disabled={busy} onClick={()=>admin({action:'set_max_devices',accountId:a.id,value:{maxDevices:Number(max)}})}>Salvar PCs</button></div></div>
    </div>
    <div className="actions topgap">
      {a.role!=='master'&&<button className={a.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>admin({action:'set_status',accountId:a.id,value:{status:a.status==='active'?'suspended':'active'}})}>{a.status==='active'?'Suspender conta':'Reativar conta'}</button>}
      <button className="secondary" disabled={busy} onClick={()=>window.confirm('Encerrar as outras sessões desta conta?')&&admin({action:'revoke_sessions',accountId:a.id,value:{}})}>Encerrar sessões</button>
    </div>
    <div className="topgap">{(a.devices||[]).map((d:any)=><div className="card" key={d.id}>
      <div className="split"><div><b>{d.displayName||'PC Sentinel'}</b><div className="muted">{d.agentVersion||'—'} · {d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString('pt-BR'):'nunca visto'}</div></div><div><Pill tone={d.online?'good':'neutral'}>{d.online?'ONLINE':'OFFLINE'}</Pill> <Pill tone={d.status==='active'?'good':'bad'}>{String(d.status).toUpperCase()}</Pill></div></div>
      <div className="stack topgap"><Row k="Bot" v={String(d.state?.state||'—').toUpperCase()}/><Row k="Modo" v={String(d.state?.mode||'—').toUpperCase()}/><Row k="Heartbeat" v={d.heartbeatAt?new Date(d.heartbeatAt).toLocaleTimeString('pt-BR'):'—'}/></div>
      <div className="actions topgap">
        <button className="primary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>window.confirm('Iniciar o bot neste PC?')&&cmd(d,'control/start')}>Iniciar</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/pause')}>Pausar</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/stop')}>Parar</button>
        <button className="kill" disabled={busy||!d.online||d.status!=='active'} onClick={()=>window.confirm('Ativar KILL SWITCH neste PC?')&&cmd(d,'control/kill')}>Kill Switch</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/freeze')}>Freeze</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/unfreeze')}>Unfreeze</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/reset-kill')}>Liberar Kill</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/clear-error')}>Limpar erro</button>
        <button className={d.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>window.confirm(d.status==='active'?'Revogar este PC?':'Reativar este PC?')&&admin({action:d.status==='active'?'revoke_device':'restore_device',accountId:a.id,deviceId:d.id,value:{}})}>{d.status==='active'?'Revogar PC':'Reativar PC'}</button>
      </div>
    </div>)}{!(a.devices||[]).length&&<Empty text="Nenhum PC vinculado a esta conta"/>}</div>
  </section>
}

`;

src=src.slice(0,start)+masterBlock+src.slice(end);
writeFileSync(pagePath,src);

const apiPath='src/app/api/master';
mkdirSync(apiPath,{recursive:true});
writeFileSync(apiPath+'/route.ts',String.raw`
import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../lib/supabase-config';

export const dynamic='force-dynamic';
const headers={'content-type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'authorization':'Bearer '+SUPABASE_PUBLISHABLE_KEY};

async function rpc(name:string,body:any){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body||{}),cache:'no-store'});
  const j=await r.json().catch(()=>({ok:false,error:'remote_http_'+r.status}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||('remote_http_'+r.status));
  return j;
}

export async function GET(req:NextRequest){
  try{
    const token=req.cookies.get(SESSION_COOKIE)?.value||'';
    if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
    const j=await rpc('sentinel_master_overview',{p_session_token:token});
    return NextResponse.json({ok:true,data:j},{headers:{'cache-control':'no-store'}});
  }catch(e:any){
    const m=String(e?.message||e);
    return NextResponse.json({ok:false,error:m},{status:m==='forbidden'?403:400,headers:{'cache-control':'no-store'}});
  }
}

export async function POST(req:NextRequest){
  try{
    const token=req.cookies.get(SESSION_COOKIE)?.value||'';
    if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
    const b=await req.json().catch(()=>({}));
    const j=await rpc('sentinel_master_action',{
      p_session_token:token,
      p_action:String(b.action||''),
      p_account_id:b.accountId||null,
      p_device_id:b.deviceId||null,
      p_value:b.value||{}
    });
    return NextResponse.json({ok:true,data:j},{headers:{'cache-control':'no-store'}});
  }catch(e:any){
    const m=String(e?.message||e);
    return NextResponse.json({ok:false,error:m},{status:m==='forbidden'?403:400,headers:{'cache-control':'no-store'}});
  }
}
`);


const middlewareCandidates=['middleware.ts','src/middleware.ts'];
for (const mwPath of middlewareCandidates) {
  try {
    let mw=readFileSync(mwPath,'utf8');
    if (!mw.includes("pathname.startsWith('/downloads/')")) {
      const match=mw.match(/export\s+(?:async\s+)?function\s+middleware\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{/);
      if (match) {
        const reqName=match[1];
        mw=mw.replace(match[0],match[0]+"\n  if ("+reqName+".nextUrl.pathname.startsWith('/downloads/')) return NextResponse.next();");
        writeFileSync(mwPath,mw);
        console.log('Sentinel downloads route bypassed from auth middleware:',mwPath);
      }
    }
  } catch {}
}

console.log('Sentinel Master private ops patch applied');
