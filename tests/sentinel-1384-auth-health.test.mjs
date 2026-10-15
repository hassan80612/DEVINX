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
   {rpc:async()=>{if(response instanceof Error)throw response;return response.clone()},clearSession:res=>res.cookies.set('session','',{maxAge:0})}:{SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'test',SESSION_COOKIE:'session'}});
 return exports;
}
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const request=path=>new NextRequest('https://sentinel.test'+path,{headers:{cookie:'session=test-session'}});
test('logout only clears the browser cookie after server-side revocation succeeds',async()=>{
 for(const response of [reply(503,{error:'unavailable'}),reply(200,{ok:false}),new Response('bad gateway',{status:502}),new Error('offline')]){
  const {POST}=load('src/app/api/auth/logout/route.ts',response);
  const result=await POST(request('/api/auth/logout'));
  assert.equal(result.status,503);
  assert.equal(result.headers.get('set-cookie'),null);
 }
 const {POST}=load('src/app/api/auth/logout/route.ts',reply(200,{ok:true}));
 const result=await POST(request('/api/auth/logout'));
 assert.equal(result.status,200);
 assert.match(result.headers.get('set-cookie'),/Max-Age=0/i);
 const anonymous=await POST(new NextRequest('https://sentinel.test/api/auth/logout'));
 assert.equal(anonymous.status,200);
});
test('Windows installer is never a login HTML page; update ZIP remains paid and fails closed',async()=>{
 for(const response of [reply(503,{error:'overloaded'}),reply(429,{error:'rate_limited'}),new Response('gateway broken',{status:502})]){
  const {middleware}=load('src/middleware.ts',response);
  for(const path of ['/downloads/Sentinel-Agent-Windows.exe','/downloads/Sentinel-Agent-13.9.5.exe']){
   const result=await middleware(request(path));
   assert.equal(result.headers.get('x-middleware-next'),'1',path);
   assert.equal(result.headers.get('location'),null);
  }
  const zip=await middleware(request('/downloads/agent_payload_v88.zip'));
  assert.equal(zip.status,503,'paid self-update ZIP must fail closed during auth outages');
  assert.equal(zip.headers.get('location'),null);
 }
 const ok=load('src/middleware.ts',reply(200,{ok:true,account:{role:'client',accessActive:true}}));
 assert.equal((await ok.middleware(request('/downloads/agent_payload_v88.zip'))).headers.get('x-middleware-next'),'1');
 const denied=load('src/middleware.ts',reply(200,{ok:true,account:{role:'client',accessActive:false}}));
 assert.match((await denied.middleware(request('/downloads/agent_payload_v88.zip'))).headers.get('location'),/\/planos$/);
 for(const route of ['/painel','/api/runtime/status']){
  const result=await denied.middleware(request(route));
  assert.notEqual(result.headers.get('x-middleware-next'),'1');
 }
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
test('account refresh preserves a valid login through server failures and malformed responses',async()=>{
 for(const response of [reply(503,{error:'overloaded'}),reply(429,{error:'rate_limited'}),new Response('bad gateway',{status:502}),reply(200,{})]){
  const {GET}=load('src/app/api/auth/me/route.ts',response);
  const result=await GET(request('/api/auth/me'));
  assert.equal(result.status,503);
  assert.equal(result.headers.get('location'),null);
 }
 const denied=load('src/app/api/auth/me/route.ts',reply(200,{ok:false,error:'unauthorized'}));
 assert.equal((await denied.GET(request('/api/auth/me'))).status,401);
 const ok=load('src/app/api/auth/me/route.ts',reply(200,{ok:true,account:{role:'master',accessActive:true}}));
 assert.equal((await ok.GET(request('/api/auth/me'))).status,200);
});
