import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const fixture=JSON.parse(readFileSync(new URL('tests/fixtures/sentinel-203-pinned-197-202-files.json',root)));
const sha=path=>{const b=readFileSync(new URL(path,root));return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};
function files(path){return readdirSync(new URL(path,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path+'/'+e.name):[path+'/'+e.name]);}
test('203: all 101 engine source files are EXACTLY the published 197, with no extra filters or freshness changes',()=>{
 assert.equal(Object.keys(fixture.logic).length,101);
 assert.deepEqual(files('sentinel-trading-lab/agent/src').sort(),Object.keys(fixture.logic).sort());
 for(const [path,hash] of Object.entries(fixture.logic))assert.equal(sha(path),hash,path);
});
test('203: all 56 worker files including latest expiry memory, broker controls, stops and execution are unchanged from 202',()=>{
 assert.equal(Object.keys(fixture.worker).length,56);
 assert.deepEqual(files('sentinel-trading-lab/agent/worker').sort(),Object.keys(fixture.worker).sort());
 for(const [path,hash] of Object.entries(fixture.worker))assert.equal(sha(path),hash,path);
});
test('203: runtime configuration is the same as 197, installer and website announce 203 consistently',()=>{
 const json=p=>JSON.parse(readFileSync(new URL(p,root)));
 const release=json('sentinel-trading-lab/agent/release.json');
 assert.deepEqual(release.runtime,fixture.runtimeOptions);
 for(const p of ['sentinel-trading-lab/agent/package.json','sentinel-trading-lab/package.json'])assert.equal(json(p).version,'13.9.203');
 assert.equal(release.version,'13.9.203');assert.equal(release.publicVersion,'13.9.203');
});
