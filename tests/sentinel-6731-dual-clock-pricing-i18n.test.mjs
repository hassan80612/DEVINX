import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const load=p=>fs.readFileSync(p,'utf8');
const driver=load('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
const runtime=load('sentinel-trading-lab/agent/src/core/runtime.mjs');
const worker=load('sentinel-trading-lab/agent/worker/index.mjs');
const card=load('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
const homepage=load('sentinel-trading-lab/src/app/page.tsx');
const plan=load('sentinel-trading-lab/src/app/planos/LocalizedPlans.tsx');

const anchor=Date.UTC(2026,9,13,21,35,58);
test('PC locale comes from the site and no duplicate language selector remains',()=>{
 assert.doesNotMatch(driver,/data-sentinel-ui-language/);
 assert.match(driver,/const PC_UI_EN=Object\.freeze\(Object\.fromEntries/);
 assert.match(driver,/tr\(scheduledDecision\)/);
 assert.match(driver,/decision\.textContent=tr\(/);
 for(const key of ['JANELA ABERTA · AGUARDE','COTAÇÃO AO VIVO','FORÇA ATUAL','TOTAL MERCADO','Saldo lido','Ativos lidos']){
   assert.notEqual(sentinelText('en',key),key,key);
 }
 assert.equal(sentinelText('en','155 ativos detectados'),'155 assets detected');
});
test('language chooses exactly one visible price and route in landing and checkout',()=>{
 assert.match(homepage,/intl\?'US\$ 50':'R\$ 280'/);
 assert.match(plan,/international\?'US\$ 50':'R\$ 280'/);
 assert.match(plan,/data-currency=\{international\?'USD':'BRL'\}/);
 assert.doesNotMatch(plan,/plansMarketChooser/);
 const pricing=load('sentinel-trading-lab/src/lib/commercial.ts');
 assert.match(pricing,/url\.searchParams\.set\('intl','1'\)/);
});
