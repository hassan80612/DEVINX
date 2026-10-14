// Builds the ACTUAL matching Windows installer and signed-update payload from
// exactly the same reviewed Agent source as the web release. Build fails if
// the compiler or payload cannot be verified: never publish a false version.
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dl=join(root,'public','downloads');
const agent=join(root,'agent');
const release=JSON.parse(readFileSync(join(agent,'release.json'),'utf8'));
const pkg=JSON.parse(readFileSync(join(agent,'package.json'),'utf8'));
if(release.version!==pkg.version||release.version!=='13.7.8')throw Error('agent_release_mismatch');
mkdirSync(dl,{recursive:true});
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
tool('zip',['-qr',zip,'.','-x','node_modules/*','worker/data/*','*.log','*.enc','*.secret','.env*'],{cwd:agent});
const manifest=JSON.parse(readFileSync(join(agent,'release.json'),'utf8'));
if(manifest.version!=='13.7.8'||statSync(zip).size<50000)throw Error('invalid_agent_payload');
const sha=createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(join(dl,'agent-update.json'),JSON.stringify({
 format:'sentinel-agent-update-v1',version:release.version,build:release.build,
 zipSha256:sha
})+'\n');
const exe=join(dl,'Sentinel-Agent-13.7.8.exe');
// The launcher embeds the ZIP AND the release identity, so an old EXE cannot
// accidentally install an old engine under the 13.7 version.
const env={...goEnv,GOOS:'windows',GOARCH:'amd64',CGO_ENABLED:'0',GOTOOLCHAIN:'local'};
tool(goBinary,['build','-trimpath','-ldflags=-s -w -buildid=','-o',exe,'agent-launcher.go'],{env});
if(statSync(exe).size<1000000)throw Error('invalid_windows_executable');
for(const alias of ['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe'])
 copyFileSync(exe,join(dl,alias));
console.log('Sentinel 13.7 installer ready: '+statSync(exe).size+' bytes, ZIP SHA256 '+sha);
