import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readBrokerTimingFromText} from '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const load=p=>fs.readFileSync(p,'utf8');
const driver=load('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
const runtime=load('sentinel-trading-lab/agent/src/core/runtime.mjs');
const worker=load('sentinel-trading-lab/agent/worker/index.mjs');
const card=load('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
const homepage=load('sentinel-trading-lab/src/app/page.tsx');
const plan=load('sentinel-trading-lab/src/app/planos/LocalizedPlans.tsx');

const anchor=Date.UTC(2026,9,13,21,35,58);
test('Exnova Digital selected expiration, purchase countdown and open position stay separate',()=>{
 const text='USD/BRL Digital\nHORA DE COMPRA\n00:32\nExpiração\n18:37\nTempo de expiração\n00:07\nNova opção\nHORA ATUAL: 13 OUTUBRO, 18:35:58 (UTC-3)';
 const data=readBrokerTimingFromText(text,{nowMs:anchor,instrumentKind:'digital'});
 assert.equal(data.purchaseWindow.closesAt,anchor+32000);
 assert.equal(data.selectedExpiration.expiresAt,anchor+62000);
 assert.equal(data.selectedExpiration.durationMs,null);
 assert.equal(data.openPosition.verified,false);
});
test('IQ Option purchase cutoff is read-only and stays valid without broker wall-clock',()=>{
 const data=readBrokerTimingFromText('TIME TO PURCHASE\n00:08\nNEW OPTION',{nowMs:anchor,instrumentKind:'digital'});
 assert.equal(data.purchaseWindow.remainingMs,8000);
 assert.equal(data.selectedExpiration.kind,'unknown');
});
test('broker midnight rollover and Blitz duration never invent an opened position',()=>{
 const midnight=readBrokerTimingFromText('Expiração\n00:01\nHORA ATUAL: 23:59:45',{nowMs:anchor,instrumentKind:'digital'});
 assert.equal(midnight.selectedExpiration.expiresAt,anchor+75000);
 const blitz=readBrokerTimingFromText('Expiração\n30 s',{nowMs:anchor,instrumentKind:'blitz'});
 assert.equal(blitz.selectedExpiration.durationMs,30000);
 assert.equal(blitz.openPosition.expiresAt,null);
});
test('clock mode is display-only: cannot reset prediction, broker or windows',()=>{
 assert.match(runtime,/clockMode:'current'/);
 assert.match(runtime,/invalid_clock_mode/);
 const settings=worker.slice(worker.indexOf("if(key==='clockMode')"),worker.indexOf("if(key==='forecastMode')"));
 assert.match(settings,/runtime\.patchSettings\(\{clockMode:/);
 assert.doesNotMatch(settings,/requestImmediateEvaluation|\.tick\(|orderDurationMs|futureEntryAnchor/);
 assert.match(driver,/lastBrokerTimeScanAt/);
 assert.match(driver,/s\.pendingBrokerTimeScan/);
 assert.match(driver,/brokerTiming=observed/);
 assert.match(driver,/clockMode==='broker'/);
 assert.match(card,/brokerVerified/);
 assert.match(card,/data-testid="clock-mode-selector"/);
});
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
test('clock sync never places orders or auto-clicks native New Option',()=>{
 const observer=load('sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs');
 assert.doesNotMatch(observer,/\.click\(|placeOrder|window\.open|setInterval/);
 assert.match(driver,/readBrokerTimingFromText/);
 assert.match(driver,/clockMode==='broker'/);
});
