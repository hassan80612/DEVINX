import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const T=1800000000000;
const settings={engine:'automatic',asset:'EUR/USD',forecastMode:'continuous',orderDurationMs:30000};
const candidate=(issuedAt,entryAt,side='CALL')=>({
 engineId:'automatic',asset:'EUR/USD',issuedAt,entryAt,exitAt:entryAt+30000,
 delaySeconds:30,holdingSeconds:30,side,
 projectedEntryPrice:1.10,projectedExitPrice:side==='CALL'?1.101:1.099
});

test('a forecast from the PREVIOUS 30s window cannot open another window, even if entryAt is still future',()=>{
 const initial=evolveOpportunity({settings,now:T,quoteAt:T,candidate:candidate(T,T+29000)});
 assert.equal(initial.phase,'open');
 const boundary=T+30000;
 const stale=evolveOpportunity({settings,previous:initial,now:boundary+300,
   quoteAt:boundary-500,candidate:candidate(boundary-500,boundary+6000)});
 assert.equal(stale.phase,'scanning');
 assert.equal(stale.windowStartedAt,boundary);
 assert.equal(stale.side,null);
 assert.equal(stale.windowEndsAt,T+60000);
 const fresh=evolveOpportunity({settings,previous:stale,now:boundary+900,
   quoteAt:boundary+900,candidate:candidate(boundary+900,boundary+2500)});
 assert.equal(fresh.phase,'open');
 assert.equal(fresh.side,'CALL');
 assert.equal(fresh.windowStartedAt,boundary);
 assert.equal(fresh.windowEndsAt,T+60000);
 const flip=evolveOpportunity({settings,previous:fresh,now:boundary+1200,
   quoteAt:boundary+1200,candidate:candidate(boundary+1200,boundary+3300,'PUT')});
 assert.equal(flip.side,'CALL');
 assert.equal(flip.windowStartedAt,boundary);
});
test('even a newer issuedAt cannot certify an old quote as a new-window signal',()=>{
 const original=evolveOpportunity({settings,now:T,quoteAt:T,candidate:null});
 const newCycle=evolveOpportunity({settings,previous:original,
   now:T+30500,quoteAt:T+29500,candidate:candidate(T+30500,T+32000)});
 assert.equal(newCycle.phase,'scanning');
});
test('PC overlay never uses a cached analysis from the previous fixed cycle',()=>{
 const src=read('sentinel-trading-lab/agent/worker/index.mjs');
 assert.match(src,/cycleEndsAt>0&&now>=cycleEndsAt/);
 assert.match(src,/overlayCache\.delete\(key\)/);
 assert.match(src,/expiredOpportunityFrame=cycleDeadline>0&&Date\.now\(\)>=cycleDeadline/);
 assert.match(src,/scenario\.closed,expiredOpportunityFrame/);
});
test('Phone countdown and forecast refuse a delayed frame from a completed previous cycle',()=>{
 const src=read('sentinel-trading-lab/src/lib/live-card-model.ts');
 assert.match(src,/const endedPreviousCycle=cycleEndAt>0&&now>=cycleEndAt/);
 for(const field of ['vnextReceipt','vnextTargetAnchor','vnextFutureEntryAnchor','vnextFutureEntryRows','vnextHorizons'])
  assert.match(src,new RegExp('const '+field+'=!endedPreviousCycle&&matchingMarket&&'));
});
test('Browser entitlement pause is temporary, and manual stops are never auto-resumed',()=>{
 const worker=read('sentinel-trading-lab/agent/worker/index.mjs');
 assert.match(worker,/suspendedForAccess=true/);
 assert.match(worker,/await runtime\.pause\('system-access-lost'\)/);
 assert.match(worker,/await runtime\.start\('system-access-restored'\)/);
 assert.match(worker,/suspendedForAccess&&runtime\.stateName==='paused'/);
 assert.match(worker,/runtime\.vnextHorizonMatrix=null/);
 assert.doesNotMatch(worker,/runtime\.stop\('system','agent_access_unverified'\)/);
 assert.doesNotMatch(worker,/runtime\.stop\('system','agent_license_check_unavailable'\)/);
});
test('One-page professional storefront has a single purchase action, prominently names supported brokers',()=>{
 const home=read('sentinel-trading-lab/src/app/page.tsx');
 const css=read('sentinel-trading-lab/src/app/launch-home.module.css');
 const hub=read('src/components/HomeHub.tsx');
 assert.match(home,/SOFTWARE PROFISSIONAL DE ANÁLISE DE MERCADO/);
 assert.match(home,/Comprar acesso por 30 dias/);
 assert.match(home,/\/api\/checkout\?market=/);
 assert.match(home,/IQ <span>OPTION<\/span>/);
 assert.match(home,/>EXNOVA</);
 assert.match(home,/login\?mode=register/);
 assert.doesNotMatch(home,/<nav\b|href="#recursos"|href="#precos"|href="#como-funciona"/);
 assert.match(css,/\.hero\{display:grid/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(hub,/styles\.sentinelBrokerBrands/);
 assert.match(hub,/Seu analista técnico profissional de mercado/);
});
test('Account screenshot regression: the PC control card is a full real grid cell, not display:contents',()=>{
 const ui=read('sentinel-trading-lab/src/app/console/page.tsx');
 const css=read('sentinel-trading-lab/src/app/globals.css');
 assert.match(ui,/className="card span12 accountAgentCard"/);
 assert.match(ui,/className="accountAgentActions"/);
 assert.match(css,/\.accountAgentCard\{grid-column:1\/-1!important;display:flex!important/);
 assert.match(css,/\.accountAgentActions button\{white-space:nowrap/);
});
test('Prepaid Kiwify purchase before sign-up grants access only through verified paid orders for exactly same account email',()=>{
 const sql=read('sentinel-trading-lab/db/migrations/20261014_prepaid_registration_email_activation.sql');
 const webhook=read('sentinel-trading-lab/src/app/api/webhooks/kiwify/route.ts');
 assert.match(sql,/AFTER INSERT ON sentinel_app\.accounts/);
 assert.match(sql,/o\.customer_email=lower\(trim\(NEW\.email\)\) AND o\.state='paid'/);
 assert.match(sql,/sentinel_app\.refresh_kiwify_prepaid_access\(NEW\.email\)/);
 assert.match(webhook,/sentinel_kiwify_paid_verified/);
 assert.match(sql,/REVOKE ALL ON FUNCTION sentinel_app\.activate_prepaid_after_registration/);
});
