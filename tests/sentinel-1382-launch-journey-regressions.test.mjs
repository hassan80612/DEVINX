import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const src=p=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const T=Date.parse('2026-10-14T20:00:00Z');
const settings={asset:'EUR/USD',forecastMode:'continuous',engine:'automatic',orderDurationMs:30000};
function candidate(at,issuedAt=T,side='PUT'){return{engineId:'automatic',asset:settings.asset,
 delaySeconds:30,holdingSeconds:30,side,issuedAt,entryAt:at,exitAt:at+30000,
 projectedEntryPrice:1.110,projectedExitPrice:side==='PUT'?1.109:1.111}}
test('previous window prediction cannot authorize a fresh window, even with fresh quotes',()=>{
 const open=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T+4000)});
 assert.equal(open.phase,'open');
 const next=evolveOpportunity({settings,previous:open,now:T+30100,quoteAt:T+30100,
  candidate:candidate(T+33000,T+29500)});
 assert.equal(next.phase,'scanning');
 assert.equal(next.side,null);
 assert.equal(next.windowStartedAt,T+30000);
 const fresh=evolveOpportunity({settings,previous:next,now:T+30800,quoteAt:T+30800,
  candidate:candidate(T+34000,T+30800)});
 assert.equal(fresh.phase,'open');assert.equal(fresh.windowStartedAt,T+30000);
});
test('mobile signed packet carries window epoch and checks that epoch before showing a CALL/PUT',()=>{
 const bridge=src('agent/worker/live-bridge.mjs');
 const model=src('src/lib/live-card-model.ts');
 assert.match(bridge,/Number\(e\.windowStartedAt\)\|\|0/);
 assert.match(model,/windowStartedAt:Number\(v\[11\]\)\|\|0/);
 assert.match(model,/anchorWindowCurrent/);
 assert.match(model,/Number\(entryAnchor\?\.windowStartedAt\|\|entryAnchor\?\.openedAt\|\|0\)/);
});
test('paused-by-license session can resume without changing manual stop semantics',()=>{
 const worker=src('agent/worker/index.mjs');
 assert.match(worker,/let suspendedByAccessLease=false/);
 assert.match(worker,/await runtime\.pause\('system-session-inactive'\)/);
 assert.match(worker,/await runtime\.start\('session-restored'\)/);
 assert.match(worker,/suspendedByAccessLease=false;return runtime\.stop/);
 assert.doesNotMatch(worker,/runtime\.stop\('system','agent_access_unverified'\)/);
});
test('account card is not flattened by desktop display:contents CSS',()=>{
 const css=src('src/app/globals.css'),ui=src('src/app/console/page.tsx');
 assert.match(css,/\.sentinelPcOnly\{display:block\}/);
 assert.match(css,/\.sentinelAccountAgentCard\{display:block;grid-column:1\/-1/);
 assert.match(ui,/sentinelAccountAgentCard/);
 assert.match(ui,/sentinelAgentBody/);
 assert.match(ui,/sentinelBrokerPartner/);
});
test('one-page sales home has a direct buy CTA and no redundant links to DevinX or plans page',()=>{
 const page=src('src/app/page.tsx');
 assert.match(page,/SOFTWARE PROFISSIONAL DE ANÁLISE DE MERCADO/);
 assert.match(page,/Comprar acesso de 30 dias/);
 assert.match(page,/IQ Option/);assert.match(page,/Exnova/);
 assert.match(page,/\/comprar\?market=BR/);
 assert.match(page,/\/comprar\?market=INTL/);
 assert.doesNotMatch(page,/href="#recursos"|href="#precos"|href="#como-funciona"/);
 assert.doesNotMatch(page,/href="https:\/\/devinx\.com\.br"/);
 assert.doesNotMatch(page,/\/planos\?market=/);
});
test('checkout never forces a separate plan page and users keep matching registration email',()=>{
 const buy=src('src/app/comprar/route.ts');
 const login=src('src/app/login/page.tsx');
 const middleware=src('src/middleware.ts');
 const migration=src('db/migrations/20261014_checkout_before_registration.sql');
 assert.match(buy,/p_session_token:token/);
 assert.match(buy,/\/api\/checkout\?market=/);
 assert.match(buy,/u\.searchParams\.set\('mode','register'\)/);
 assert.match(login,/window\.location\.href=afterPurchase\?/);
 assert.match(login,/Use exatamente este mesmo e-mail no pagamento/);
 assert.match(middleware,/p==='\/comprar'/);
 assert.match(migration,/refresh_kiwify_prepaid_access\(v_email\)/);
});
