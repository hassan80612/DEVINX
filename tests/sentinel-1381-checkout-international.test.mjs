import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
test('International checkout uses Kiwify officially supported region=intl rather than undocumented intl=1',()=>{
 const code=read('src/lib/commercial.ts');
 assert.match(code,/url\.searchParams\.set\('region','intl'\)/);
 assert.match(code,/url\.searchParams\.delete\('intl'\)/);
 assert.doesNotMatch(code,/url\.searchParams\.set\('lang'/);
 assert.match(code,/KIWIFY_CHECKOUT_URL/);
 assert.match(code,/host\.endsWith\('\.kiwify\.com'\)/);
});
test('USD international price and English landing are not silently converted into BRL',()=>{
 const plans=read('src/lib/commercial.ts');
 assert.match(plans,/INTL:\{name:'Sentinel Trading Lab',amount:50,currency:'USD'/);
 assert.match(plans,/BR:\{name:'Sentinel Trading Lab',amount:280,currency:'BRL'/);
 const ui=read('src/app/planos/LocalizedPlans.tsx');
 assert.match(ui,/language==='en'/);
 assert.match(ui,/international\?intlCheckout:brCheckout/);
 const checkout=read('src/app/api/checkout/route.ts');
 assert.match(checkout,/sentinelCheckoutUrl\(market\)/);
});
