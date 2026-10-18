import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Research-only module tree. Never modifies the shipped source or broker.
export async function actualEntryReferenceRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-actual-entry-'));
 try {
  cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
  const file=join(root,'thirty-second-expiry-direction.mjs'),source=readFileSync(file,'utf8');
  const old='selected.predict(horizonMs/1000)-selected.predict(0)';
  if(source.split(old).length!==2)throw Error('Unexpected expiry model source');
  writeFileSync(file,source.replace(old,'selected.predict(horizonMs/1000)'));
  const runtime=await import(pathToFileURL(join(root,'runtime.mjs')));
  const forecast=await import(pathToFileURL(file));
  return {...runtime,...forecast,cleanup:()=>rmSync(root,{recursive:true,force:true})};
 }catch(e){rmSync(root,{recursive:true,force:true});throw e;}
}
