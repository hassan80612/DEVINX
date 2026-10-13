import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const page=read('sentinel-trading-lab/src/app/console/page.tsx');
const driver=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
const adapter=read('sentinel-trading-lab/agent/worker/adapters/browser-broker.mjs');
const base='f6dc255bfdf77c1d0e3e57ed47d2c285009655a7';

test('all broker messages shown in the reported English screenshot are localized',()=>{
 const examples=new Map([
  ['modo da conta ainda não detectado','Account mode not detected'],
  ['saldo ainda não recebido','Balance not received'],
  ['ativos ainda não detectados','Assets not detected'],
  ['ID do ativo ainda não detectado','Active asset ID not detected'],
  ['cotação ainda não recebida','Quote not received'],
  ['0 candles recebidos; mínimo 50','0 candles received; minimum 50'],
  ['143 ativos detectados','143 assets detected'],
  ['155 ativos detectados','155 assets detected'],
  ['sessão conectada ao navegador local','Session connected to the local browser'],
  ['sessão local pronta','Local session ready'],
  ['50 candles atuais recebidos','50 current candles received'],
  ['saldo REAL lido','REAL balance read'],
  ['saldo DEMO lido','DEMO balance read'],
  ['conta REAL ativa','REAL account active'],
  ['cotação recebida para USD/BRL OTC','Quote received for USD/BRL OTC']
 ]);
 for(const [original,english] of examples){
   assert.equal(sentinelText('en',original),english,original);
   assert.equal(sentinelText('pt',original),original);
 }
});
test('broker renders only translated checklist messages, not raw adapter text',()=>{
 assert.match(page,/<em>\{t\(v\.message\)\}<\/em>/);
 assert.match(page,/<b>\{t\(k\.replaceAll\('_',' '\)\)\}<\/b>/);
 assert.match(adapter,/this\._step\('account_mode'/);
});
test('the site is the only language selector and changing it never calls the general analyst settings action',()=>{
 assert.match(page,/<LanguageSwitcher\/>/);
 assert.doesNotMatch(page,/<LanguageSwitcher onLanguageChange=/);
 assert.doesNotMatch(driver,/data-sentinel-ui-language/);
 assert.match(driver,/uiLang=String\(d\.uiLanguage/);
 assert.match(driver,/const tr=k=>/);
});
test('language sync retries only failed commands, does not block market updates, and survives reconnect',()=>{
 const start=page.indexOf('// Language belongs to the SITE');
 const end=page.indexOf('const agentCommand=async',start);
 assert.ok(start>0&&end>start);
 const sync=page.slice(start,end);
 assert.match(sync,/if\(!s\|\|!agent\.worker\|\|s\.settings\?\.uiLanguage===language\)return/);
 assert.match(sync,/localFetch\('settings','PATCH'/);
 assert.match(sync,/cloudFetch\('settings','PATCH'/);
 assert.match(sync,/if\(!disposed&&attempts<4\)retryTimer=setTimeout/);
 assert.match(sync,/return\(\)=>\{disposed=true/);
 assert.doesNotMatch(sync,/act\(|requestImmediateEvaluation|nextEvalMs|windowEndsAt|setBusy|runtime\.tick|orderDurationMs/);
});
test('market forecast and PC timing remains byte-for-byte intact',()=>{
 for(const file of [
  'sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs',
  'sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs',
  'sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',
  'sentinel-trading-lab/src/components/LiveScenarioCard.tsx',
  'sentinel-trading-lab/agent/worker/index.mjs',
  'sentinel-trading-lab/agent/worker/adapters/browser-broker.mjs'
 ])assert.equal(read(file),execFileSync('git',['show',base+':'+file],{encoding:'utf8'}),file);
});
