import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const appRequire=createRequire(new URL('../sentinel-trading-lab/package.json',import.meta.url));
const ts=appRequire('typescript');
const {NextRequest,NextResponse}=appRequire('next/server');
function load(path,response){
 const js=ts.transpileModule(readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,URL,AbortSignal,fetch:async()=>response.clone(),atob,
  require:name=>name==='next/server'?{NextResponse}:name.includes('_shared')?
   {rpc:async()=>response.clone()}:{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'test',SESSION_COOKIE:'session'}});
 return exports;
}
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const request=path=>new NextRequest('https://sentinel.test'+path,{headers:{cookie:'session=test-session'}});
test('temporary upstream failures cannot send a valid browser to login or serve a login page as EXE',async()=>{
 for(const response of [reply(503,{error:'overloaded'}),reply(429,{error:'rate_limited'}),new Response('gateway broken',{status:502})]){
  const {middleware}=load('src/middleware.ts',response);
  const result=await middleware(request('/downloads/Sentinel-Agent-Windows.exe'));
  assert.equal(result.status,503);assert.equal(result.headers.get('location'),null);
 }
 const ok=load('src/middleware.ts',reply(200,{ok:true,account:{role:'client',accessActive:true}}));
 assert.equal((await ok.middleware(request('/downloads/Sentinel-Agent-Windows.exe'))).headers.get('x-middleware-next'),'1');
 const denied=load('src/middleware.ts',reply(200,{ok:true,account:{role:'client',accessActive:false}}));
 assert.match((await denied.middleware(request('/downloads/Sentinel-Agent-Windows.exe'))).headers.get('location'),/\/planos$/);
});
test('presence only logs out for an invalid session; temporary server errors remain retryable',async()=>{
 for(const response of [reply(500,{error:'database_unavailable'}),reply(429,{error:'rate_limited'}),new Response('bad json',{status:200})]){
  const {POST}=load('src/app/api/auth/presence/route.ts',response);
  assert.equal((await POST(request('/api/auth/presence'))).status,503);
 }
 const revoked=load('src/app/api/auth/presence/route.ts',reply(200,{ok:false,error:'unauthorized'}));
 assert.equal((await revoked.POST(request('/api/auth/presence'))).status,401);
 const ok=load('src/app/api/auth/presence/route.ts',reply(200,{ok:true}));
 assert.equal((await ok.POST(request('/api/auth/presence'))).status,200);
});
