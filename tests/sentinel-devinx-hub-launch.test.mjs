import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Sentinel product jump is the FIRST navigable product on devinx.com.br',()=>{
 const s=read('src/components/HomeHub.tsx');
 assert.ok(s.indexOf('href="#sentinel"')<s.indexOf('href="#financeiro"'));
 assert.ok(s.indexOf('<section id="sentinel"')<s.indexOf('id="financeiro"'));
 assert.match(s,/id="sentinel"/);
 assert.match(s,/sentinelFeaturesTitle/);
 assert.match(s,/SENTINEL_FEATURES/);
 assert.match(s,/href="\/sentinel"/);
});
test('Portal card supports all DevinX locales and routes independently',()=>{
 const s=read('src/components/HomeHub.tsx');
 for(const locale of ['"pt-BR"', 'en:', 'es:', 'fr:', 'de:', 'ar:'])
  assert.ok(s.includes(locale));
 const route=read('src/app/sentinel/page.tsx');
 assert.match(route,/sentinel\.devinx\.com\.br/);
 assert.match(route,/sentinel-trading-lab\.vercel\.app/);
 assert.match(route,/params\?\.next==='login'/);
 const css=read('src/components/HomeHub.module.css');
 assert.match(css,/\.sentinelProduct/);
 assert.match(css,/\.sentinelJump/);
});
