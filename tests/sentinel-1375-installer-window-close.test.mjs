import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../sentinel-trading-lab/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
test('13.7.5 windows launcher uses direct handles, not background-inherited copy pipes',()=>{
 const src=read('../sentinel-trading-lab/agent-launcher.go');
 assert.match(src,/cmd\.Stdout = os\.Stdout/);
 assert.match(src,/cmd\.Stderr = os\.Stderr/);
 assert.doesNotMatch(src,/io\.MultiWriter\(/);
 assert.doesNotMatch(src,/"io"/);
 assert.match(src,/if err := cmd\.Run\(\); err != nil/);
 assert.match(src,/SENTINEL_INSTALL_VERIFY_ONLY/);
});
test('installer succeeds and terminates; Worker and tray are started independently',()=>{
 const src=read('public/downloads/install-agent-v88.ps1');
 const manager=src.indexOf('$managerProcess = Start-Process');
 const verify=src.indexOf('$managerHealth.workerHealthy');
 const tray=src.indexOf('$trayReady = $th.iconVisible');
 const success=src.indexOf('Write-Host "`nAgent V$expectedVersion pronto."');
 const exit=src.indexOf('  exit 0',success);
 assert.ok(manager>=0&&verify>manager&&tray>verify&&success>tray&&exit>success);
 assert.doesNotMatch(src.slice(success,exit),/Read-Host|Wait-Process|WaitForExit|ReadKey/);
 assert.match(src,/Start-Transcript -Path/);
 assert.match(src,/Stop-Transcript \| Out-Null/);
 assert.match(src,/Invoke-RestMethod[^\n]*'http:\/\/127\.0\.0\.1:8788\/health'/);
});
test('embedded EXE and background updater use the same success and logging path',()=>{
 const launcherInstall=read('public/downloads/install-agent-v88.ps1');
 const updaterInstall=read('agent/worker/install-agent-update.ps1');
 assert.equal(launcherInstall,updaterInstall);
});
