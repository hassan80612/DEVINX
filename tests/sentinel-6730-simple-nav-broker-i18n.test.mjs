import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sentinelText,translations} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const consoleUi=read('sentinel-trading-lab/src/app/console/page.tsx');
const driver=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
test('authenticated analyst opens on Mercado and never renders duplicated Início/legacy Market',()=>{
 assert.match(consoleUi,/const\[tab,setTab\]=useState\('Market Analysis'\)/);
 assert.doesNotMatch(consoleUi,/key:'Dashboard'/);
 assert.doesNotMatch(consoleUi,/function Dashboard\(/);
 assert.doesNotMatch(consoleUi,/function Market\(/);
 assert.doesNotMatch(consoleUi,/const groups=\[/);
 assert.match(consoleUi,/visibleTabs\.map\(x=><button/);
 assert.match(consoleUi,/\['Market Analysis','Mercado','⌁'\]/);
});
test('theme control describes Claro and Escuro in both languages',()=>{
 assert.doesNotMatch(consoleUi,/Petróleo/);
 assert.match(consoleUi,/theme==='light'\?t\('Escuro'\):t\('Claro'\)/);
 assert.equal(sentinelText('en','Escuro'),'Dark');
 assert.equal(sentinelText('en','Claro'),'Light');
});
test('Broker and Strategies use centralized bilingual labels and visible status',()=>{
 assert.match(consoleUi,/function Broker\([^\n]+\{const \{t\}=useSentinelLocale\(\)/);
 assert.match(consoleUi,/function Strategies\([^\n]+\{\s*const \{t\}=useSentinelLocale\(\)/);
 assert.match(consoleUi,/\{t\(title\)\}<\/option>/);
 assert.match(consoleUi,/\{t\(active\[2\]\)\}/);
 assert.match(consoleUi,/\{t\(busy\?'Processando…'/);
 assert.match(consoleUi,/const status=b\.validated\?t\('LEITURA'\)/);
 const keys=['Navegação','PAINEL SENTINEL','Alternar tema','Escuro','Claro','Estratégia responsável','Selecionar estratégia','Saldo lido','Fonte do saldo','Ativos lidos','Última candle','Cotação','Candles','Feed validado','Sessão detectada e conectada.','Abrir / conectar corretora','Trazer corretora para frente','Conta REAL','Novo computador detectado'];
 for(const key of keys){
   assert.ok(translations.en[key],key);
   if(!['Candles','Agent'].includes(key))assert.notEqual(sentinelText('en',key),key,key);
 }
});
test('never change a single market decision, window, clock or live bridge to fix navigation',()=>{
 const paths=[
  'sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs',
  'sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs',
  'sentinel-trading-lab/agent/src/core/entry-window-planner.mjs',
  'sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',
  'sentinel-trading-lab/src/lib/pc-authoritative-window.mjs'
 ];
 const baseline='95dbbfed94fe3bb5d02ec790d5106aed090d916b';
 for(const path of paths)assert.equal(read(path),execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'}),path);
});
test('passive broker asset-click bridge does not open duplicate tabs',()=>{
 const bridge=driver.slice(driver.indexOf('async installBridge('),driver.indexOf('ingest(provider,'));
 assert.match(bridge,/document\.addEventListener\('click',/);
 assert.match(bridge,/__sentinelAssetChanged/);
 assert.doesNotMatch(bridge,/\.click\(/);
 assert.doesNotMatch(bridge,/window\.open\(/);
});
