import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
for(const file of ['index.mjs','agent-manager.mjs'])test(file+': DevinX HTTPS origins can connect while lookalikes and insecure public origins stay rejected',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/'+file,import.meta.url),'utf8'),start=s.indexOf('const DEFAULT_ALLOWED_ORIGINS='),end=s.indexOf('function cors(',start);
 const c={process:{env:{}}};vm.createContext(c);vm.runInContext(s.slice(start,end)+';globalThis.allow=allowedOrigin;',c);
 for(const url of ['https://trading.devinx.com.br','https://sentinel.devinx.com.br','https://sentinel-trading-lab.vercel.app'])assert.equal(c.allow(url),true);
 for(const url of ['https://trading.devinx.com.br.attacker.test','https://attacker.devinx.com.br','http://trading.devinx.com.br','null'])assert.equal(c.allow(url),false);
});
