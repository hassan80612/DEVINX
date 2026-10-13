import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sentinelLanguage,sentinelText,translations} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
import {marketingMessages} from '../sentinel-trading-lab/agent/src/core/marketing-messages.mjs';
const read=p=>readFileSync(p,'utf8');
const base='7cd0e7315fd7b6a59ad82142ffc8db7491c902ca';
test('original 67.26 entry-now clock and labels are byte-for-byte preserved',()=>{
 const path='sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
 assert.equal(read(path),execFileSync('git',['show',base+':'+path],{encoding:'utf8'}));
 const mobile=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 assert.doesNotMatch(mobile,/plannedEntryAt=\{plannedAt\}/);
 assert.match(mobile,/pcAuthoritativeWindow\(\{windowStartedAt,windowEndsAt,phase,side,entryTriggeredAt,quoteAt/);
});
test('translation is deterministic and never modifies CALL/PUT model data',()=>{
 assert.equal(sentinelLanguage('en'),'en');
 assert.equal(sentinelLanguage('fr'),'pt');
 assert.equal(sentinelText('pt','ENTRADA DAQUI A'),'ENTRADA DAQUI A');
 assert.equal(sentinelText('en','ENTRADA DAQUI A'),'ENTRY IN');
 assert.equal(sentinelText('en','CALL'),'CALL');
 assert.equal(sentinelText('en','PUT'),'PUT');
 assert.ok(Object.keys(translations.en).length>=250);
});
test('marketing Home uses semantic PT/EN keys, while plans and login translate all visible literals',()=>{
 const home=read('sentinel-trading-lab/src/app/page.tsx');
 const ids=[...home.matchAll(/<Msg id="([^"]+)"\/>/g)].map(m=>m[1]);
 assert.ok(ids.length>=50,'Home must use semantic message keys');
 for(const id of ids)assert.ok(marketingMessages[id]?.en&&marketingMessages[id]?.pt,id);
 for(const path of ['sentinel-trading-lab/src/app/planos/page.tsx','sentinel-trading-lab/src/app/login/page.tsx']){
   const phrases=[...read(path).matchAll(/<T>([^<>]+)<\/T>/g)].map(m=>m[1].trim());
   assert.ok(phrases.length>=10,path);
   for(const phrase of phrases){
     if(['S','SENTINEL','TRADING LAB','Trading Lab','ANALYST','01','02','03','04','US$ 50','↑ CALL','↓ PUT'].includes(phrase))continue;
     assert.ok(translations.en[phrase],path+': '+phrase);
   }
 }
});
test('mobile and PC use shared translations with independent browser-only selectors',()=>{
 const mobile=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 const provider=read('sentinel-trading-lab/src/components/SentinelLocale.tsx');
 const pc=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 const header=read('sentinel-trading-lab/src/app/console/page.tsx');
 assert.match(mobile,/const \{t\}=useSentinelLocale\(\)/);
 assert.match(provider,/localStorage\.setItem\(KEY,language\)/);
 assert.match(header,/<LanguageSwitcher(?:\s|\/>)/);
 assert.match(pc,/data-sentinel-ui-language/);
 assert.match(pc,/translations\.en\[k\]/);
 assert.match(pc,/payload\.uiTranslations=PC_UI_EN/);
 assert.doesNotMatch(pc,/run\(\{action:'setting',key:'uiLanguage'/);
});
