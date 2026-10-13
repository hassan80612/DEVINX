import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sentinelText,translations} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const read=path=>readFileSync(path,'utf8');
const pc=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
const mobile=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
const website=read('sentinel-trading-lab/src/app/console/page.tsx');
test('real native language selector has visible background, foreground and option colors in both themes',()=>{
 assert.match(pc,/select\{color-scheme:dark\}/);
 assert.match(pc,/select option\{background-color:#10232c;color:#f7fbff\}/);
 assert.match(pc,/\[data-theme="light"\] select\{color-scheme:light\}/);
 assert.match(pc,/\[data-theme="light"\] select option\{background-color:#fff;color:#111318\}/);
 assert.match(pc,/data-sentinel-ui-language aria-label="Language \/ Idioma"/);
 assert.match(pc,/background:\$\{fieldBg\};border:1px solid \$\{panelBorder\}/);
 assert.match(pc,/color:\$\{fieldInk\}/);
});
test('every literal translated PC label is in the single source catalog and loaded in payload',()=>{
 const keys=[...pc.matchAll(/\btr\('([^']+)'\)/g)].map(m=>m[1]);
 assert.ok(keys.length>65);
 const block=pc.match(/const PC_UI_KEYS=(\[[\s\S]*?\]);\s*const PC_UI_EN=/);
 assert.ok(block,'static compact PC dictionary required');
 const selected=JSON.parse(block[1]);
 for(const key of [...keys,...selected])assert.equal(typeof translations.en[key],'string',key);
 for(const key of keys)assert.ok(selected.includes(key),'missing from PC UI payload: '+key);
 assert.equal(sentinelText('pt','TOTAL MERCADO'),'TOTAL MERCADO');
 assert.equal(sentinelText('en','TOTAL MERCADO'),'MARKET TOTAL');
});
test('translations affect UI only, never the core trade decision or candle clock',()=>{
 const web=read('sentinel-trading-lab/src/lib/pc-authoritative-window.mjs');
 assert.doesNotMatch(web,/sentinelText|translations|locale/);
 assert.match(pc,/const tr=k=>uiLang==='en'\?\(d\.uiTranslations\?\.\[k\]\|\|k\):k/);
 assert.match(mobile,/const direction=t\(view\.label\);/);
 assert.match(website,/<LanguageSwitcher(?:\s|\/>)/);
 const essential=['JANELA ABERTA · AGUARDE','ATÉ ENTRADA CALCULADA','PRONTIDÃO DE ENTRADA','TOTAL ESTRATÉGIAS','ENTRADA FUTURA','CENÁRIO FUTURO POR PRAZO'];
 for(const key of essential)assert.notEqual(sentinelText('en',key),key,key);
});
