import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/HomeHub.tsx',import.meta.url),'utf8');
test('published DevinX Sentinel analyst and bot offer shows BRL 289 and USD 60 in every language',()=>{
 assert.match(source,/\{intl\?'US\$ 60':'R\$ 289'\}/);
 assert.doesNotMatch(source,/\{intl\?'US\$ 35':'R\$ 170'\}/);
 for(const key of ['"pt-BR":','en:','es:','fr:','de:','ar:']){
  assert.ok(source.includes(key),key+' retained');
 }
 assert.equal((source.match(/sentinelCycle:/g)||[]).length,6);
});
test('checkout routing stays on the original Sentinel checkout with separate currencies',()=>{
 assert.match(source,/https:\/\/trading\.devinx\.com\.br\/api\/checkout\?market=/);
 assert.match(source,/intl\?"INTL":"BR"/);
});
