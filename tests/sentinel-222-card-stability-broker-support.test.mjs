import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
test('222: all three totals retain bounded visual-only values on temporary feed gaps (PC and mobile)',()=>{
 const pc=read('agent/worker/local-playwright-driver.mjs');
 const mobile=read('src/components/LiveScenarioCard.tsx');
 assert.match(pc,/const marketTotalsLive=runtime==='running'&&liveNow/);
 assert.match(pc,/el\.__sentinelMarketTotalsCache/);
 assert.match(pc,/Date\.now\(\)-Number\(el\.__sentinelMarketTotalsCache\.at\)<=30000/);
 assert.match(pc,/marketTotalsHistorical\?'ÚLTIMA LEITURA · '/);
 assert.match(pc,/data-history-only/);
 assert.match(mobile,/const currentMarketCardsReady=m\.fresh/);
 assert.match(mobile,/lastVnextTotals\.current/);
 assert.match(mobile,/now-lastMarketCards\.at<=30000/);
 assert.match(mobile,/ÚLTIMA LEITURA · NÃO OPERAR/);
 assert.match(mobile,/marketCardsHistorical\?'true':'false'/);
});
test('222: unsupported brokers are no longer advertised as functional Agent integrations',()=>{
 const ui=read('src/app/console/page.tsx');
 assert.match(ui,/brokers\/\$\{provider\}\/login/);
 assert.match(ui,/Abrir IQ Option/);
 assert.match(ui,/Abrir Exnova/);
 assert.match(ui,/Outras corretoras exigem integração verificada/);
 assert.doesNotMatch(ui,/otherVisible|openOtherSite|sentinel-other-broker-url/);
});
test('222: data presentation cannot overwrite native expiration or executor',()=>{
 const ui=read('src/components/LiveScenarioCard.tsx');
 const pc=read('agent/worker/local-playwright-driver.mjs');
 assert.doesNotMatch(ui,/lastVnextTotals\.current.*(?:\.send\(|\.pulse\(|\.execute\()/);
 assert.doesNotMatch(pc,/__sentinelMarketTotalsCache\.[^\n]*\b(?:expiry|durationMs|brokerClick)\b/);
});
