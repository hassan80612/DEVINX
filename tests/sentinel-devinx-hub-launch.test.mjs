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

test('DevinX Sentinel card shows the new prices in all six available locales',()=>{ 
 const s=read('src/components/HomeHub.tsx');
 assert.ok(s.includes("intl?'US$ 60':'R$ 289'"));
 assert.doesNotMatch(s,/intl\?'US\$ 35':'R\$ 170'/);
 for(const cycle of ['30 dias de acesso · renovação manual',
  '30 days of access · renew manually','30 días de acceso · renovación manual',
  '30 jours d’accès · renouvellement manuel','30 Tage Zugang · manuell verlängern',
  'وصول لمدة 30 يوماً · تجديد يدوي'])assert.ok(s.includes(cycle),cycle);
 assert.ok(s.includes('https://trading.devinx.com.br/api/checkout?market='),
  'keeps the approved Kiwify handoff on the Sentinel site');
});
