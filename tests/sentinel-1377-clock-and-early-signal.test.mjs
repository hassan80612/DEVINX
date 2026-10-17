import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {entryOffsets,planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
const T=Date.parse('2026-10-14T13:40:00-03:00');
const read=x=>readFileSync(new URL('../sentinel-trading-lab/'+x,import.meta.url),'utf8');
test('interactive launchers delegate one post-install page opening to their shared installer',()=>{
 const go=read('agent-launcher.go');
 const install=read('public/downloads/install-agent-v88.ps1');
 const updater=read('agent/worker/install-agent-update.ps1');
 assert.equal(install,updater);
 assert.match(go,/"-OpenSiteAfterInstall"/);
 assert.doesNotMatch(go,/rundll32\.exe/);
 assert.match(install,/\$OpenSiteAfterInstall -and \$env:SENTINEL_INSTALL_TEST -ne '1' -and \$env:CI -ne 'true'/);
 assert.equal((install.match(/Start-Process -FilePath \$consoleUrl/g)||[]).length,1);
 assert.match(install,/\$consoleUrl = \$site \+ '\/console\?tab=Broker%20Connection'/);
 const autoUpdate=read('agent/worker/auto-update.ps1');
 assert.doesNotMatch(autoUpdate,/-OpenSiteAfterInstall/);
 assert.doesNotMatch(install,/Start-Process\s+['"]https:\/\/sentinel-trading-lab\.vercel\.app/);
 assert.doesNotMatch(updater,/Start-Process\s+['"]https:\/\/sentinel-trading-lab\.vercel\.app/);
});
test('Continuous prefers earliest comparably STRONG qualified entry; not a fixed 6-candle wait',()=>{
 const offsets=entryOffsets(30);
 const settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',orderDurationMs:30000};
 const early=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:1.101,
   selectionStrength:seconds===offsets.at(-1)?1.04:1.02})});
 assert.equal(early.entryOffsetSeconds,offsets[0]);
 const clearlyBetterLate=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:1.101,
   selectionStrength:seconds===offsets.at(-1)?1.8:1.0})});
 assert.equal(clearlyBetterLate.entryOffsetSeconds,offsets.at(-1),
   'cannot sacrifice materially better future setup for early signal');
 const conflicting=planEntryWindow({now:T,windowSeconds:30,holdingSeconds:30,
  engineId:'automatic',asset:settings.asset,
  evaluateLead:seconds=>({side:seconds===offsets[0]?'PUT':'CALL',
   projectedEntryPrice:1.1,projectedExitPrice:seconds===offsets[0]?1.099:1.101,
   selectionStrength:seconds===offsets[0]?1.04:1.05})});
 assert.equal(conflicting.side,'CALL','do not replace strongest side with earlier OPPOSITE side');
});
