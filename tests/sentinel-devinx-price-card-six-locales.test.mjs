import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('DevinX Sentinel card displays BRL 289 or USD 60 consistently with locale',()=>{
 const c=src('src/components/HomeHub.tsx');
 assert.match(c,/activeLocale==="pt-BR"\?"R\$ 289":"US\$ 60"/);
 assert.match(c,/data-testid="devinx-sentinel-price"/);
 assert.match(c,/data-currency=\{activeLocale==="pt-BR"\?"BRL":"USD"\}/);
 assert.equal((c.match(/sentinelPriceCycle:/g)||[]).length,6);
 for(const locale of ['"pt-BR"','en:','es:','fr:','de:','ar:']){
  assert.ok(c.includes(locale),'preserve locale '+locale);
 }
 const css=src('src/components/HomeHub.module.css');
 assert.match(css,/\.sentinelPrice\{/);
});
test('Sentinel commercial data and membership are free of old advertised prices',()=>{
 const c=src('sentinel-trading-lab/src/lib/commercial.ts');
 assert.match(c,/amount:289,currency:'BRL'/);
 assert.match(c,/amount:60,currency:'USD'/);
 const panel=src('sentinel-trading-lab/src/app/console/page.tsx');
 assert.match(panel,/const localizedPrice=intl\?SENTINEL_PLANS\.INTL\.priceDisplay:SENTINEL_PLANS\.BR\.priceDisplay/);
 assert.doesNotMatch(panel,/R\$ 549|US\$ 100/);
});
