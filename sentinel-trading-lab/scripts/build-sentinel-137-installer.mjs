// Builds the ACTUAL matching Windows installer and signed-update payload from
// exactly the same reviewed Agent source as the web release. Build fails if
// the compiler or payload cannot be verified: never publish a false version.
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync,statSync,readdirSync,lstatSync,chmodSync,utimesSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dl=join(root,'public','downloads');
const agent=join(root,'agent');
const release=JSON.parse(readFileSync(join(agent,'release.json'),'utf8'));
const pkg=JSON.parse(readFileSync(join(agent,'package.json'),'utf8'));
if(release.version!==pkg.version||!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('agent_release_mismatch');
mkdirSync(dl,{recursive:true});

// Sentinel 226 release: the exact Windows-tested EXE and matching Agent ZIP
// are committed by the 226 CI only after the non-installing Windows check.
// Verify both files instead of rebuilding an untested installer at deploy.
// CI build is the only phase permitted to create the initial artifacts.
// 232: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
// Sentinel 234: require exact Windows-tested binaries on Vercel, never rebuild them in a site deploy.
// Sentinel 235: site builds require an identical Windows-tested EXE and matching payload.
// Sentinel 236: refuse unverified direct EXE and ZIP in web-only builds.
if(release.version==='13.9.236'&&process.env.SENTINEL_236_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-236-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_236_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.236.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_236_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_236_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_236_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.236-EXE.zip','Sentinel-Agent-13.9.236-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_236_download_archive_missing:'+name);
 }
 console.log('Sentinel 236: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

if(release.version==='13.9.235'&&process.env.SENTINEL_235_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-235-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_235_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.235.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_235_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_235_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_235_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.235-EXE.zip','Sentinel-Agent-13.9.235-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_235_download_archive_missing:'+name);
 }
 console.log('Sentinel 235: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

if(release.version==='13.9.234'&&process.env.SENTINEL_234_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-234-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_234_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.234.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_234_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_234_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_234_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.234-EXE.zip','Sentinel-Agent-13.9.234-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_234_download_archive_missing:'+name);
 }
 console.log('Sentinel 234: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

if(release.version==='13.9.233'&&process.env.SENTINEL_233_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-233-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_233_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.233.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_233_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_233_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_233_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.233-EXE.zip','Sentinel-Agent-13.9.233-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_233_download_archive_missing:'+name);
 }
 console.log('Sentinel 233: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

if(release.version==='13.9.232'&&process.env.SENTINEL_232_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-232-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_232_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.232.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_232_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_232_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_232_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.232-EXE.zip','Sentinel-Agent-13.9.232-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_232_download_archive_missing:'+name);
 }
 console.log('Sentinel 232: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

// 231: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
if(release.version==='13.9.231'&&process.env.SENTINEL_231_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-231-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_231_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.231.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_231_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_231_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_231_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.231-EXE.zip','Sentinel-Agent-13.9.231-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_231_download_archive_missing:'+name);
 }
 console.log('Sentinel 231: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

// 230: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
if(release.version==='13.9.230'&&process.env.SENTINEL_230_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-230-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_230_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.230.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_230_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_230_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_230_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.230-EXE.zip','Sentinel-Agent-13.9.230-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_230_download_archive_missing:'+name);
 }
 console.log('Sentinel 230: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

// 229: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
if(release.version==='13.9.229'&&process.env.SENTINEL_229_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-229-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_229_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.229.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_229_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_229_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_229_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.229-EXE.zip','Sentinel-Agent-13.9.229-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_229_download_archive_missing:'+name);
 }
 console.log('Sentinel 229: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

// 228: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
if(release.version==='13.9.228'&&process.env.SENTINEL_228_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-228-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_228_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.228.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_228_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_228_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_228_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.228-EXE.zip','Sentinel-Agent-13.9.228-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_228_download_archive_missing:'+name);
 }
 console.log('Sentinel 228: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

// 227: on production builds, never silently replace the Windows-tested EXE.
// The initial EXE compilation happens only inside the isolated release CI.
if(release.version==='13.9.227'&&process.env.SENTINEL_227_BUILD_VERIFIED_ASSETS!=='1'){
 const proof=JSON.parse(readFileSync(join(dl,'sentinel-227-verified.json'),'utf8'));
 if(proof.version!==release.version||proof.build!==release.build||proof.windowsTested!==true)
  throw Error('sentinel_227_release_provenance_mismatch');
 const hash=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.227.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||hash(name)!==proof.exeSha256)
   throw Error('sentinel_227_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||hash('agent_payload_v88.zip')!==proof.zipSha256)
  throw Error('sentinel_227_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_227_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.227-EXE.zip','Sentinel-Agent-13.9.227-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_227_download_archive_missing:'+name);
 }
 console.log('Sentinel 227: exact Windows-tested EXE and verified matching Agent ZIP preserved for site deployment.');
 process.exit(0);
}

if(release.version==='13.9.226'&&process.env.SENTINEL_226_BUILD_VERIFIED_ASSETS!=='1'){
 const proofPath=join(dl,'sentinel-226-verified.json');
 const proof=JSON.parse(readFileSync(proofPath,'utf8'));
 if(proof.version!==release.version||proof.build!==release.build)
  throw Error('sentinel_226_release_provenance_mismatch');
 const fingerprint=name=>createHash('sha256').update(readFileSync(join(dl,name))).digest('hex');
 for(const name of ['Sentinel-Agent-13.9.226.exe','Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  if(statSync(join(dl,name)).size<1000000||fingerprint(name)!==proof.exeSha256)
   throw Error('sentinel_226_windows_tested_exe_mismatch:'+name);
 }
 if(statSync(join(dl,'agent_payload_v88.zip')).size<50000||
    fingerprint('agent_payload_v88.zip')!==proof.zipSha256)
   throw Error('sentinel_226_agent_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||
    manifest.zipSha256!==proof.zipSha256)
  throw Error('sentinel_226_manifest_mismatch');
 for(const name of ['Sentinel-Agent-13.9.226-EXE.zip','Sentinel-Agent-13.9.226-Alternativo.zip']){
  if(statSync(join(dl,name)).size<50000)throw Error('sentinel_226_download_archive_missing:'+name);
 }
 console.log('Sentinel 226: deploy uses exactly the Windows-tested, attested EXE and matching Agent source ZIP.');
 process.exit(0);
}

if(release.version==='13.9.224'){
 // The 224 EXE was built from this reviewed source and EXECUTED on
 // windows-latest. Do not silently replace that tested binary during the
 // Vercel Next.js prebuild with a different, untested Go build.
 const fingerprint=file=>createHash('sha256').update(readFileSync(join(dl,file))).digest('hex');
 const exeHash='ced0105cae8ec5627bb0d01c7baa9c157327c97caf81d87054b0138459b90237';
 const zipHash='59711829fdd1151e6df10efdfa59a99553d1ae1fc008e8d60962997ace6cfbd6';
 const expectedNames=['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe','Sentinel-Agent-13.9.224.exe'];
 for(const name of expectedNames)if(fingerprint(name)!==exeHash)
  throw Error('sentinel_224_windows_tested_exe_missing_or_mismatch:'+name);
 if(fingerprint('agent_payload_v88.zip')!==zipHash)
  throw Error('sentinel_224_windows_tested_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==zipHash)
  throw Error('sentinel_224_windows_tested_manifest_mismatch');
 // The 224 website has two independent public download options. Generate
 // BOTH from the already Windows-tested files. Prior 222 prebuild skipped
 // this step, leaving its ZIP button pointed at a nonexistent archive.
 const exeZip='Sentinel-Agent-13.9.224-EXE.zip';
 const offlineZip='Sentinel-Agent-13.9.224-Alternativo.zip';
 const createZip=(name,files,cwd=dl)=>{
  const result=spawnSync('zip',['-X','-q',join(dl,name),...files],{cwd,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('sentinel_224_zip_failed:'+name+':'+String(result.stderr||result.error?.message));
  if(statSync(join(dl,name)).size<100000)throw Error('sentinel_224_zip_too_small:'+name);
 };
 rmSync(join(dl,exeZip),{force:true});
 createZip(exeZip,['Sentinel-Agent-13.9.224.exe']);
 const stage=join(root,'.sentinel-224-offline-stage');
 rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
 try{
  copyFileSync(join(dl,'agent_payload_v88.zip'),join(stage,'agent_payload_v88.zip'));
  copyFileSync(join(dl,'install-agent-v88.ps1'),join(stage,'install-agent-v88.ps1'));
  const cmd=[
   '@echo off','setlocal','cd /d "%~dp0"',
   'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent-v88.ps1" -LocalPayload "%~dp0agent_payload_v88.zip" -ExpectedVersion "13.9.224" -ExpectedBuild "'+release.build+'" -OpenSiteAfterInstall',
   'if errorlevel 1 (','  echo Falha ao instalar. Consulte %LOCALAPPDATA%\\SentinelTradingLab\\install.log','  pause','  exit /b 1',')','exit /b 0',''
  ].join('\r\n');
  writeFileSync(join(stage,'Instalar-Sentinel.cmd'),cmd);
  writeFileSync(join(stage,'LEIA-ME.txt'),'Sentinel 13.9.224\\r\\nExtraia os quatro arquivos e execute Instalar-Sentinel.cmd no Windows.\\r\\n');
  rmSync(join(dl,offlineZip),{force:true});
  createZip(offlineZip,['Instalar-Sentinel.cmd','LEIA-ME.txt','agent_payload_v88.zip','install-agent-v88.ps1'],stage);
 }finally{rmSync(stage,{recursive:true,force:true});}
 console.log('Sentinel 224: exact Windows-tested EXE preserved; verified direct and offline ZIP archives built.');
 process.exit(0);
}

if(release.version==='13.9.223'){
 // The 223 EXE was built from this reviewed source and EXECUTED on
 // windows-latest. Do not silently replace that tested binary during the
 // Vercel Next.js prebuild with a different, untested Go build.
 const fingerprint=file=>createHash('sha256').update(readFileSync(join(dl,file))).digest('hex');
 const exeHash='841badc763581fa5d91e392250f05c36e225c90d7bce72b833cbc0820450b86f';
 const zipHash='22849980cf3eb7134d3e224e3a8fe012d4ae1cdfa68364bbfc929c1a459c4d38';
 const expectedNames=['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe','Sentinel-Agent-13.9.223.exe'];
 for(const name of expectedNames)if(fingerprint(name)!==exeHash)
  throw Error('sentinel_223_windows_tested_exe_missing_or_mismatch:'+name);
 if(fingerprint('agent_payload_v88.zip')!==zipHash)
  throw Error('sentinel_223_windows_tested_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==zipHash)
  throw Error('sentinel_223_windows_tested_manifest_mismatch');
 // The 223 website has two independent public download options. Generate
 // BOTH from the already Windows-tested files. Prior 222 prebuild skipped
 // this step, leaving its ZIP button pointed at a nonexistent archive.
 const exeZip='Sentinel-Agent-13.9.223-EXE.zip';
 const offlineZip='Sentinel-Agent-13.9.223-Alternativo.zip';
 const createZip=(name,files,cwd=dl)=>{
  const result=spawnSync('zip',['-X','-q',join(dl,name),...files],{cwd,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('sentinel_223_zip_failed:'+name+':'+String(result.stderr||result.error?.message));
  if(statSync(join(dl,name)).size<100000)throw Error('sentinel_223_zip_too_small:'+name);
 };
 rmSync(join(dl,exeZip),{force:true});
 createZip(exeZip,['Sentinel-Agent-13.9.223.exe']);
 const stage=join(root,'.sentinel-223-offline-stage');
 rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
 try{
  copyFileSync(join(dl,'agent_payload_v88.zip'),join(stage,'agent_payload_v88.zip'));
  copyFileSync(join(dl,'install-agent-v88.ps1'),join(stage,'install-agent-v88.ps1'));
  const cmd=[
   '@echo off','setlocal','cd /d "%~dp0"',
   'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent-v88.ps1" -LocalPayload "%~dp0agent_payload_v88.zip" -ExpectedVersion "13.9.223" -ExpectedBuild "'+release.build+'" -OpenSiteAfterInstall',
   'if errorlevel 1 (','  echo Falha ao instalar. Consulte %LOCALAPPDATA%\\SentinelTradingLab\\install.log','  pause','  exit /b 1',')','exit /b 0',''
  ].join('\r\n');
  writeFileSync(join(stage,'Instalar-Sentinel.cmd'),cmd);
  writeFileSync(join(stage,'LEIA-ME.txt'),'Sentinel 13.9.223\\r\\nExtraia os quatro arquivos e execute Instalar-Sentinel.cmd no Windows.\\r\\n');
  rmSync(join(dl,offlineZip),{force:true});
  createZip(offlineZip,['Instalar-Sentinel.cmd','LEIA-ME.txt','agent_payload_v88.zip','install-agent-v88.ps1'],stage);
 }finally{rmSync(stage,{recursive:true,force:true});}
 console.log('Sentinel 223: exact Windows-tested EXE preserved; verified direct and offline ZIP archives built.');
 process.exit(0);
}

if(release.version==='13.9.222'){
 // The 222 EXE was built from this reviewed source and EXECUTED on
 // windows-latest. Do not silently replace that tested binary during the
 // Vercel Next.js prebuild with a different, untested Go build.
 const fingerprint=file=>createHash('sha256').update(readFileSync(join(dl,file))).digest('hex');
 const exeHash='27305fbf487ee8f1884c17d5956eb97fc2cb52675d1b0b38987d1ac059f66041';
 const zipHash='9111064d0c62a11a5735165fc6f3416543c5b0626bf13dc298ecd846bfa4d55f';
 const expectedNames=['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe','Sentinel-Agent-13.9.222.exe'];
 for(const name of expectedNames)if(fingerprint(name)!==exeHash)
  throw Error('sentinel_222_windows_tested_exe_missing_or_mismatch:'+name);
 if(fingerprint('agent_payload_v88.zip')!==zipHash)
  throw Error('sentinel_222_windows_tested_payload_mismatch');
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build||manifest.zipSha256!==zipHash)
  throw Error('sentinel_222_windows_tested_manifest_mismatch');
 // The 222 website has two independent public download options. Generate
 // BOTH from the already Windows-tested files. Prior 222 prebuild skipped
 // this step, leaving its ZIP button pointed at a nonexistent archive.
 const exeZip='Sentinel-Agent-13.9.222-EXE.zip';
 const offlineZip='Sentinel-Agent-13.9.222-Alternativo.zip';
 const createZip=(name,files,cwd=dl)=>{
  const result=spawnSync('zip',['-X','-q',join(dl,name),...files],{cwd,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('sentinel_222_zip_failed:'+name+':'+String(result.stderr||result.error?.message));
  if(statSync(join(dl,name)).size<100000)throw Error('sentinel_222_zip_too_small:'+name);
 };
 rmSync(join(dl,exeZip),{force:true});
 createZip(exeZip,['Sentinel-Agent-13.9.222.exe']);
 const stage=join(root,'.sentinel-222-offline-stage');
 rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
 try{
  copyFileSync(join(dl,'agent_payload_v88.zip'),join(stage,'agent_payload_v88.zip'));
  copyFileSync(join(dl,'install-agent-v88.ps1'),join(stage,'install-agent-v88.ps1'));
  const cmd=[
   '@echo off','setlocal','cd /d "%~dp0"',
   'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent-v88.ps1" -LocalPayload "%~dp0agent_payload_v88.zip" -ExpectedVersion "13.9.222" -ExpectedBuild "'+release.build+'" -OpenSiteAfterInstall',
   'if errorlevel 1 (','  echo Falha ao instalar. Consulte %LOCALAPPDATA%\\SentinelTradingLab\\install.log','  pause','  exit /b 1',')','exit /b 0',''
  ].join('\r\n');
  writeFileSync(join(stage,'Instalar-Sentinel.cmd'),cmd);
  writeFileSync(join(stage,'LEIA-ME.txt'),'Sentinel 13.9.222\\r\\nExtraia os quatro arquivos e execute Instalar-Sentinel.cmd no Windows.\\r\\n');
  rmSync(join(dl,offlineZip),{force:true});
  createZip(offlineZip,['Instalar-Sentinel.cmd','LEIA-ME.txt','agent_payload_v88.zip','install-agent-v88.ps1'],stage);
 }finally{rmSync(stage,{recursive:true,force:true});}
 console.log('Sentinel 222: exact Windows-tested EXE preserved; verified direct and offline ZIP archives built.');
 process.exit(0);
}

const tool=(name,args,options={})=>{
 const result=spawnSync(name,args,{cwd:root,encoding:'utf8',...options});
 if(result.error||result.status!==0)
  throw Error(name+' failed: '+String(result.stderr||result.error?.message||result.stdout).slice(0,600));
 return result.stdout?.trim()||'';
};
// Vercel's Next.js build image has no Go toolchain. Bootstrap a PINNED
// official distribution, check the SHA256 published at go.dev/dl, and do not
// silently fall back to an old bundled executable.
let goBinary='go',goEnv={...process.env};
if(spawnSync('go',['version'],{encoding:'utf8'}).error){
 const archive=join(root,'.go-1.24.9-linux-amd64.tar.gz');
 const directory=join(root,'.go-1.24.9-toolchain');
 const shaExpected='5b7899591c2dd6e9da1809fde4a2fad842c45d3f6b9deb235ba82216e31e34a6';
 console.log('Installing verified Go 1.24.9 toolchain for Windows cross-build');
 tool('curl',['-fsSL','--retry','2','--max-time','120',
  'https://go.dev/dl/go1.24.9.linux-amd64.tar.gz','-o',archive]);
 const shaActual=createHash('sha256').update(readFileSync(archive)).digest('hex');
 if(shaActual!==shaExpected)throw Error('go_toolchain_sha256_mismatch');
 mkdirSync(directory,{recursive:true});
 tool('tar',['-xzf',archive,'-C',directory]);
 rmSync(archive,{force:true});
 goBinary=join(directory,'go','bin','go');
 goEnv={...process.env,GOROOT:join(directory,'go'),
  PATH:join(directory,'go','bin')+':'+process.env.PATH};
}
console.log('Sentinel 13.7 installer: '+tool(goBinary,['version'],{env:goEnv}));
tool('zip',['-v']);
const zip=join(dl,'agent_payload_v88.zip');
rmSync(zip,{force:true});
// ZIP root must contain release.json, package.json, worker/ and source files
// directly. Do not package installed sessions, secrets, logs or node_modules.
// Stable ZIP ordering, permissions and timestamps preserve installer identity
// when only the website changes. Keep actual source bytes, never installed data.
const payloadStage=join(root,'.sentinel-payload-stage'),payloadFiles=[];
const archiveTime=new Date('2026-01-01T00:00:00Z');
rmSync(payloadStage,{recursive:true,force:true});mkdirSync(payloadStage,{recursive:true});
function copyPayload(directory,relative=''){
 for(const name of readdirSync(directory).sort()){
  const rel=relative?relative+'/'+name:name;
  if(name==='node_modules'||rel==='worker/data'||name.startsWith('.env')||/\.(?:log|enc|secret)$/.test(name))continue;
  const source=join(directory,name),info=lstatSync(source);
  if(info.isDirectory())copyPayload(source,rel);
  else if(info.isFile()){
   const target=join(payloadStage,rel);mkdirSync(dirname(target),{recursive:true});
   copyFileSync(source,target);chmodSync(target,0o644);utimesSync(target,archiveTime,archiveTime);payloadFiles.push(rel);
  }
 }
}
try{
 copyPayload(agent);
 tool('zip',['-X','-q',zip,...payloadFiles],{cwd:payloadStage,env:{...process.env,TZ:'UTC'}});
}finally{rmSync(payloadStage,{recursive:true,force:true});}
const manifest=JSON.parse(readFileSync(join(agent,'release.json'),'utf8'));
if(manifest.version!==release.version||manifest.build!==release.build||statSync(zip).size<50000)throw Error('invalid_agent_payload');
const sha=createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(join(dl,'agent-update.json'),JSON.stringify({
 format:'sentinel-agent-update-v1',version:release.version,build:release.build,
 zipSha256:sha
})+'\n');
const exe=join(dl,'Sentinel-Agent-'+release.version+'.exe');
// The launcher embeds the ZIP AND the release identity, so an old EXE cannot
// accidentally install an old engine under the 13.7 version.
const env={...goEnv,GOOS:'windows',GOARCH:'amd64',CGO_ENABLED:'0',GOTOOLCHAIN:'local'};
tool(goBinary,['build','-trimpath','-ldflags=-s -w -buildid=','-o',exe,'agent-launcher.go'],{env});
if(statSync(exe).size<1000000)throw Error('invalid_windows_executable');
for(const alias of ['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe'])
 copyFileSync(exe,join(dl,alias));
// Edge accepts the installer distributed as a ZIP on this user's Windows.
// Store the EXACT SAME 221 EXE in an archive; never alter the launcher or Agent.
const wrappedExeName='Sentinel-Agent-'+release.version+'-EXE.zip';
const wrappedExe=join(dl,wrappedExeName);
rmSync(wrappedExe,{force:true});
tool('zip',['-X','-q',wrappedExe,'Sentinel-Agent-'+release.version+'.exe'],{cwd:dl,env:{...process.env,TZ:'UTC'}});
if(statSync(wrappedExe).size<100000)throw Error('invalid_exe_zip');
// Alternate offline-from-Sentinel installer packaging for Edge / Defender
// browser-download failures. It contains the same checked payload and the
// EXISTING PowerShell installer, with no additional runtime logic or new URL.
const alternative=join(dl,'Sentinel-Agent-'+release.version+'-Alternativo.zip');
const altDir=join(root,'.sentinel-alternative-installer');
rmSync(altDir,{recursive:true,force:true});
mkdirSync(altDir,{recursive:true});
try{
 copyFileSync(join(dl,'install-agent-v88.ps1'),join(altDir,'install-agent-v88.ps1'));
 copyFileSync(zip,join(altDir,'agent_payload_v88.zip'));
 const cmd=[
  '@echo off','setlocal','cd /d "%~dp0"',
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent-v88.ps1" -LocalPayload "%~dp0agent_payload_v88.zip" -ExpectedVersion "'+release.version+'" -ExpectedBuild "'+release.build+'" -OpenSiteAfterInstall',
  'if errorlevel 1 (',
  '  echo O instalador nao concluiu. Consulte %LOCALAPPDATA%\\SentinelTradingLab\\install.log',
  '  pause',
  '  exit /b 1',
  ')',
  'exit /b 0',''
 ].join('\r\n');
 writeFileSync(join(altDir,'Instalar-Sentinel.cmd'),cmd,'ascii');
 writeFileSync(join(altDir,'LEIA-ME.txt'),[
  'Sentinel Trading Lab '+release.version,'',
  '1. Extraia TODOS os arquivos deste ZIP em uma pasta.',
  '2. No Windows, clique duas vezes em Instalar-Sentinel.cmd.',
  '3. O instalador utiliza o pacote local incluido.',
  '4. Se falhar, consulte %LOCALAPPDATA%\\SentinelTradingLab\\install.log.',
  'Nao e necessario executar o EXE bloqueado pelo navegador.',''
 ].join('\r\n'));
 rmSync(alternative,{force:true});
 const alternativeFiles=['Instalar-Sentinel.cmd','LEIA-ME.txt','agent_payload_v88.zip','install-agent-v88.ps1'];
 for(const name of alternativeFiles){const file=join(altDir,name);chmodSync(file,0o644);utimesSync(file,archiveTime,archiveTime);}
 tool('zip',['-X','-q',alternative,...alternativeFiles],{cwd:altDir,env:{...process.env,TZ:'UTC'}});
 if(statSync(alternative).size<50000)throw Error('invalid_alternative_installer_archive');
}finally{rmSync(altDir,{recursive:true,force:true});}
console.log('Sentinel 13.7 installer ready: '+statSync(exe).size+' bytes, ZIP SHA256 '+sha);
