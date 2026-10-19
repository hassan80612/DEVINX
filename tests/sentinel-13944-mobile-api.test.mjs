// Exercise the actual API handler against a fixture RPC, never a user device.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../sentinel-trading-lab/node_modules/typescript/lib/typescript.js';
const source=readFileSync(new URL('../sentinel-trading-lab/src/app/api/runtime/[...path]/route.ts',import.meta.url),'utf8');
function api({ackAt=20,heartbeatAt=10}={}){
 const calls=[],exports={};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,URL,setTimeout:cb=>{queueMicrotask(cb)},require:name=>name==='next/server'?{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'public-fixture',SESSION_COOKIE:'fixture'},fetch:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  const data=url.endsWith('sentinel_enqueue_command')?{ok:true,commandId:'fixture-command'}:
   url.endsWith('sentinel_command_status')?{ok:true,status:'acked',result:{autoExecutor:{enabled:true,updatedAt:ackAt}}}:
   {ok:true,data:{state:'running',autoExecutor:{enabled:false,updatedAt:heartbeatAt}}};
  return{ok:true,json:async()=>data};
 }});
 const request=(method='POST',token='fixture-session',origin='https://app.invalid')=>({url:'https://app.invalid/api/runtime/executor/start',method,cookies:{get:()=>token?{value:token}:null},headers:{get:k=>k==='origin'?origin:null},json:async()=>({context:{provider:'exnova',asset:'EUR/GBP OTC',durationMs:30000}})});
 return {calls,exports,request,ctx:path=>({params:Promise.resolve({path:path.split('/')})})};
}
test('mobile bot API rejects GET, unknown controls, other origins and absent sessions before enqueue',async()=>{
 const x=api();
 for(const [req,path,status] of [[x.request('GET'),'executor/start',405],[x.request(),'executor/map',404],[x.request('POST','fixture','https://other.invalid'),'executor/stop',403],[x.request('POST',''),'executor/start',401]]){
  assert.equal((await x.exports.POST(req,x.ctx(path))).status,status);
 }
 assert.equal(x.calls.length,0);
});
test('mobile bot ACK updates the UI even when the heartbeat still says OFF',async()=>{
 const x=api();const out=await x.exports.POST(x.request(),x.ctx('executor/start'));
 assert.equal(out.status,200);assert.equal(out.body.data.autoExecutor.enabled,true);
 assert.equal(x.calls[0].body.p_command_type,'executor/start');assert.equal(x.calls[0].body.p_device_id,null);
 assert.equal(x.calls[0].body.p_payload.context.durationMs,30000);
});
test('a newer stopped heartbeat takes precedence over an earlier running ACK',async()=>{
 const x=api({ackAt:10,heartbeatAt:30});const out=await x.exports.POST(x.request(),x.ctx('executor/stop'));
 assert.equal(out.body.data.autoExecutor.enabled,false);assert.equal(out.body.data.autoExecutor.updatedAt,30);
});
