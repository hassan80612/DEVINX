import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(p)=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');

test('An Agent requires BOTH a paid license and an authenticated recently open browser session',()=>{
 const sql=src('db/migrations/20261014_agent_live_browser_session.sql');
 assert.match(sql,/last_presence_at>=now\(\)-interval '60 seconds'/);
 assert.match(sql,/sentinel_app\.agent_access_active\(v\.account_id\) AND sentinel_app\.agent_web_session_active\(v\.account_id\)/);
 assert.equal([...sql.matchAll(/sentinel_app\.agent_web_session_active\(v\.account_id\)/g)].length,3);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.sentinel_web_presence/);
 assert.match(sql,/s\.token_hash=v_hash AND s\.expires_at>now\(\)/);
 const inactive=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.sentinel_agent_poll'));
 assert.match(inactive,/if not v_access then/);
 assert.doesNotMatch(inactive,/insert into sentinel_app\.commands\([\s\S]*?control\/kill/);
 assert.match(inactive,/'command',null/);
});
test('Browser pays its own lease; logout revokes cookie and live session',()=>{
 const pulse=src('src/components/ActiveBrowserSession.tsx');
 const page=src('src/app/console/page.tsx');
 const route=src('src/app/api/auth/presence/route.ts');
 const logout=src('src/app/api/auth/logout/route.ts');
 assert.match(page,/<ActiveBrowserSession\/>/);
 assert.match(pulse,/window\.setInterval\(\(\)=>\{void ping\(\)\},12000\)/);
 assert.match(pulse,/clearInterval\(interval\)/);
 assert.match(route,/sentinel_web_presence/);
 assert.match(route,/SESSION_COOKIE/);
 assert.match(logout,/sentinel_auth_logout/);
 assert.match(src('agent/worker/index.mjs'),/ACCESS_LEASE_GRACE_MS=65000/);
});
test('Paid and logged-in local PC is paired without asking for manual SNTL code',()=>{
 const ui=src('src/app/console/page.tsx');
 assert.match(ui,/source!=='local'\|\|!agentAccess/);
 assert.match(ui,/autoLinkedDevice\.current\.add\(key\)/);
 assert.match(ui,/fetch\('\/api\/devices\/claim'/);
 assert.match(ui,/JSON\.stringify\(\{code,replaceExisting\}\)/);
 assert.doesNotMatch(ui,/className="pairInline"/);
 assert.doesNotMatch(ui,/placeholder="SNTL-XXXX-XXXX"/);
 assert.doesNotMatch(ui,/<T>Vincular PC<\/T>/);
});
test('Broker page contains only explicit selected broker launch controls and compact PC card',()=>{
 const ui=src('src/app/console/page.tsx');
 const start=ui.indexOf('function Broker('),end=ui.indexOf('function Trades(',start);
 const broker=ui.slice(start,end);
 assert.match(broker,/Abrir IQ Option/);
 assert.match(broker,/Abrir Exnova/);
 assert.match(broker,/Conexão do PC/);
 assert.doesNotMatch(broker,/ID ativo|Última candle|Protocolo|checklist|Sugestão de ativo/);
});
test('Localized Kiwify renewal goes directly to a trusted checkout; marketing is transparent',()=>{
 const checkout=src('src/app/api/checkout/route.ts');
 const ui=src('src/app/console/page.tsx');
 const home=src('src/app/page.tsx');
 const middleware=src('src/middleware.ts');
 assert.match(checkout,/sentinelCheckoutUrl\(market\)/);
 assert.match(ui,/api\/checkout\?market=/);
 assert.match(middleware,/p==='\/api\/checkout'/);
 assert.match(middleware,/p==='\/termos'/);
 assert.match(middleware,/p==='\/privacidade'/);
 assert.match(home,/Não garante assertividade nem ganhos/);
 assert.match(home,/href="\/termos"/);
 assert.match(home,/href="\/privacidade"/);
 assert.doesNotMatch(home,/90%|80%|assertividade elevada/);
});

test('Passive observer preserves historical responses and coalesces selected live frames',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const start=src.indexOf("ws.on('framereceived',event=>{");
 const end=src.indexOf("});",start);
 const block=src.slice(start,end);
 assert.ok(start>=0);
 assert.match(block,/frame\?\.name==='candles'/);
 assert.match(block,/pendingPassiveFrame=frame/);
 assert.match(block,/Number\(aid\)!==Number\(st\.activeId\)/);
 assert.match(block,/this\.ingest\(provider,frame,'page-in'\)/);
 assert.match(src,/readBrokerTimingFromText\(raw/);
 assert.match(src,/await s\.page\.evaluate\(\(d\)=>/);
});

test('US$50 offer forces English on Sentinel plan page independently from prior browser language',()=>{
 const plans=readFileSync(new URL('../sentinel-trading-lab/src/app/planos/LocalizedPlans.tsx',import.meta.url),'utf8');
 const commercial=readFileSync(new URL('../sentinel-trading-lab/src/lib/commercial.ts',import.meta.url),'utf8');
 assert.match(plans,/chosen==='intl'\|\|chosen==='international'/);
 assert.match(plans,/setLanguage\(usd\?'en':'pt'\)/);
 assert.match(plans,/const international=market\?market==='INTL':language==='en'/);
 assert.match(plans,/international\?'US\$ 50':'R\$ 280'/);
 assert.match(commercial,/url\.searchParams\.set\('region','intl'\)/);
 assert.doesNotMatch(commercial,/url\.searchParams\.set\('intl','1'\)/);
 // Native text belongs to the third-party Kiwify page, not the Sentinel.
 assert.doesNotMatch(commercial,/url\.searchParams\.set\('lang','en'\)/);
});
