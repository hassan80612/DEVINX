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
if(release.version!==pkg.version||release.version!=='13.7.0')throw Error('agent_release_mismatch');
mkdirSync(dl,{recursive:true});
const tool=(name,args,options={})=>{
 const result=spawnSync(name,args,{cwd:root,encoding:'utf8',...options});
 if(result.error||result.status!==0)
  throw Error(name+' failed: '+String(result.stderr||result.error?.message||result.stdout).slice(0,600));
 return result.stdout?.trim()||'';
};
console.log('Sentinel 13.7 installer: '+tool('go',['version']));
tool('zip',['-v']);
const zip=join(dl,'agent_payload_v88.zip');
rmSync(zip,{force:true});
// ZIP root must contain release.json, package.json, worker/ and source files
// directly. Do not package installed sessions, secrets, logs or node_modules.
tool('zip',['-qr',zip,'.','-x','node_modules/*','worker/data/*','*.log','*.enc','*.secret','.env*'],{cwd:agent});
const manifest=JSON.parse(readFileSync(join(agent,'release.json'),'utf8'));
if(manifest.version!=='13.7.0'||statSync(zip).size<50000)throw Error('invalid_agent_payload');
const sha=createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(join(dl,'agent-update.json'),JSON.stringify({
 format:'sentinel-agent-update-v1',version:release.version,build:release.build,
 zipSha256:sha
})+'\n');
const exe=join(dl,'Sentinel-Agent-13.7.exe');
// The launcher embeds the ZIP AND the release identity, so an old EXE cannot
// accidentally install an old engine under the 13.7 version.
const env={...process.env,GOOS:'windows',GOARCH:'amd64',CGO_ENABLED:'0',GOTOOLCHAIN:'local'};
tool('go',['build','-trimpath','-ldflags=-s -w -buildid=','-o',exe,'agent-launcher.go'],{env});
if(statSync(exe).size<1000000)throw Error('invalid_windows_executable');
for(const alias of ['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe'])
 copyFileSync(exe,join(dl,alias));
console.log('Sentinel 13.7 installer ready: '+statSync(exe).size+' bytes, ZIP SHA256 '+sha);
