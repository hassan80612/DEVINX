import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sentinelMarket,sentinelCheckoutUrl,SENTINEL_PLANS} from '../sentinel-trading-lab/src/lib/commercial.ts';

test('Brazil remains BRL and never leaks intl parameter into BR checkout',()=>{
  assert.equal(SENTINEL_PLANS.BR.amount,280);
  assert.equal(SENTINEL_PLANS.BR.currency,'BRL');
  assert.equal(sentinelMarket('br','US','1'),'BR'); // explicit buyer market wins
  const url=new URL(sentinelCheckoutUrl('BR'));
  assert.equal(url.origin,'https://pay.kiwify.com.br');
  assert.equal(url.pathname,'/SQku9Rd');
  assert.equal(url.searchParams.has('intl'),false);
});

test('International links always preserve intl=1 and select USD, regardless of browser language',()=>{
  assert.equal(SENTINEL_PLANS.INTL.amount,50);
  assert.equal(SENTINEL_PLANS.INTL.currency,'USD');
  assert.equal(sentinelMarket(undefined,'BR','1'),'INTL');
  assert.equal(sentinelMarket('intl','BR'),'INTL');
  assert.equal(sentinelMarket(undefined,'US'),'INTL');
  const url=new URL(sentinelCheckoutUrl('INTL'));
  assert.equal(url.pathname,'/VNHYsjX');
  assert.equal(url.searchParams.get('intl'),'1');
});

test('Both the market chooser and URL query support explicit international flag',()=>{
 const plans=fs.readFileSync('sentinel-trading-lab/src/app/planos/page.tsx','utf8');
 assert.match(plans,/href="\/planos\?market=intl&intl=1"/);
 assert.match(plans,/sentinelMarket\(params\?\.market,hdr\.get\('x-vercel-ip-country'\),params\?\.intl\)/);
 assert.match(plans,/sentinelCheckoutUrl\(market\)/);
});

test('Second Brazilian Kiwify product requires allowlisted ID and HMAC verification',()=>{
 const hook=fs.readFileSync('sentinel-trading-lab/src/app/api/webhooks/kiwify/route.ts','utf8');
 assert.match(hook,/process\.env\.SENTINEL_KIWIFY_BR_PRODUCT_ID/);
 assert.match(hook,/if\(!isApprovedSentinelProduct\(productId\)\)/);
 assert.match(hook,/verifyKiwifySignature\(raw,signature,secret\)/);
 assert.match(hook,/sentinel_kiwify_paid_verified/);
});
