import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const at=Date.parse('2026-10-14T13:41:03-03:00');
test('startup never opens IQ Option or Exnova without an explicit Corretora click',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const tray=readFileSync(new URL('../sentinel-trading-lab/agent/worker/tray-host.ps1',import.meta.url),'utf8');
 const install=readFileSync(new URL('../sentinel-trading-lab/public/downloads/install-agent-v88.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/bootstrapSavedBrokers\(/);
 assert.match(worker,/p\.action==='login'&&method==='POST'/);
 assert.match(tray,/Broker%20Connection/);
 const launcher=readFileSync(new URL('../sentinel-trading-lab/agent-launcher.go',import.meta.url),'utf8');
 assert.match(launcher,/"-OpenSiteAfterInstall"/);
 assert.match(install,/console\?tab=Broker%20Connection/);
 assert.doesNotMatch(install,/Start-Process\s+['\"]https:\/\/sentinel-trading-lab\.vercel\.app/);
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/iqoption/);
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/exnova/);
});
