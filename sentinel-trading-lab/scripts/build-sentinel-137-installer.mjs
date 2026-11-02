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

if(release.version==='13.9.223'){
 // This is the exact Windows-tested release built by the isolated 223
 // GitHub workflow. Next.js/Vercel MUST NOT silently produce another EXE.
 const manifest=JSON.parse(readFileSync(join(dl,'agent-update.json'),'utf8'));
 const sha=JSON.parse(readFileSync(join(dl,'sentinel-223-sha256.json'),'utf8'));
 if(manifest.version!==release.version||manifest.build!==release.build)
  throw Error('sentinel_223_manifest_version_mismatch');
 const verify=(file,expected)=>createHash('sha256').update(readFileSync(join(dl,file))).digest('hex')===expected;
 const exeNames=['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe','Sentinel-Agent-13.9.223.exe'];
 for(const filename of exeNames)
  if(!verify(filename,sha.exe))throw Error('sentinel_223_windows_tested_exe_mismatch:'+filename);
 if(!verify('agent_payload_v88.zip',manifest.zipSha256)||
  !verify('agent_payload_v88.zip',sha.payload))
  throw Error('sentinel_223_verified_payload_mismatch');
 for(const file of ['Sentinel-Agent-13.9.223-EXE.zip','Sentinel-Agent-13.9.223-Alternativo.zip'])
  if(!verify(file,sha[file]))throw Error('sentinel_223_installer_archive_mismatch:'+file);
 console.log('Sentinel 223: exact verified Windows EXE, payload and offline archives preserved.');
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
