import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const chunks=Array.from({length:17},(_,i)=>`app-bundle.b64.${String(i).padStart(2,'0')}`);

if(!existsSync('src/app/page.tsx')){
  const b64=chunks.map(file=>readFileSync(file,'utf8')).join('');
  writeFileSync('app-bundle.tar.gz',Buffer.from(b64,'base64'));
  execFileSync('tar',['-xzf','app-bundle.tar.gz'],{stdio:'inherit'});
}

mkdirSync('public/downloads',{recursive:true});
execFileSync(
  'go',
  ['build','-trimpath','-ldflags=-s -w','-o','public/downloads/Sentinel-Agent-Windows.exe','agent-launcher.go'],
  {stdio:'inherit',env:{...process.env,GOOS:'windows',GOARCH:'amd64'}}
);
