import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
test('Sentinel displays exactly R$289 for BR and US$60 internationally',()=>{
 const c=source('src/lib/commercial.ts');
 assert.match(c,/BR:\{[^\n]*amount:289,currency:'BRL'[^\n]*priceDisplay:'R\\$ 289'/);
 assert.match(c,/INTL:\{[^\n]*amount:60,currency:'USD'[^\n]*priceDisplay:'US\\$ 60'/);
 assert.doesNotMatch(c,/priceDisplay:'(?:R\\$ 170|US\\$ 35)'/);
});
test('Landing page, localized plans and membership use the SAME commercial source',()=>{
 const home=source('src/app/page.tsx'),plans=source('src/app/planos/LocalizedPlans.tsx');
 const consolePage=source('src/app/console/page.tsx');
 assert.match(home,/price:SENTINEL_PLANS\.INTL\.priceDisplay/);
 assert.match(home,/price:SENTINEL_PLANS\.BR\.priceDisplay/);
 assert.match(plans,/SENTINEL_PLANS\.INTL\.priceDisplay:SENTINEL_PLANS\.BR\.priceDisplay/);
 assert.match(consolePage,/const localizedPrice=intl\?SENTINEL_PLANS\.INTL\.priceDisplay:SENTINEL_PLANS\.BR\.priceDisplay/);
 assert.doesNotMatch(consolePage,/R\\$ 549|US\\$ 100/);
});
test('Pricing change does not replace real checkout URL or claim auto-renewal',()=>{
 const commercial=source('src/lib/commercial.ts'),checkout=source('src/app/api/checkout/route.ts');
 assert.match(commercial,/https:\/\/pay\.kiwify\.com\.br\/SQku9Rd/);
 assert.match(commercial,/https:\/\/pay\.kiwify\.com\/VNHYsjX/);
 assert.match(commercial,/billing:'prepaid_30_days'/);
 assert.match(checkout,/sentinelCheckoutUrl\(market\)/);
});
