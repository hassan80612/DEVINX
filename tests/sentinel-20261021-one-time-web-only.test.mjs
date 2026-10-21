import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
test('lifetime prices are BRL 549 and USD 100 with unchanged Kiwify links',()=>{
 const c=source('src/lib/commercial.ts');
 assert.match(c,/amount:549,currency:'BRL',billing:'one_time'/);
 assert.match(c,/amount:100,currency:'USD',billing:'one_time'/);
 assert.match(c,/pay\.kiwify\.com\.br\/SQku9Rd/);
 assert.match(c,/pay\.kiwify\.com\/VNHYsjX/);
 assert.doesNotMatch(c,/cadenceDays:30|\/ 30 days|\/ 30 dias/);
});
test('public buying pages and customer license panel no longer advertise any 30-day entitlement',()=>{
 for(const path of ['src/app/page.tsx','src/app/planos/page.tsx','src/app/planos/LocalizedPlans.tsx',
   'src/app/termos/page.tsx','src/app/console/page.tsx']){
  const c=source(path);
  assert.doesNotMatch(c,/30 dias|30 days|30-day access|prepaid-30d|R\$ 55(?![0-9])|US\$ 10(?![0-9])/i,path);
 }
});
test('customer paid console never forces renewal and Bot usage is linked',()=>{
 const c=source('src/app/console/page.tsx');
 assert.match(c,/key:'Membership',label:'Licença'/);
 assert.doesNotMatch(c,/grant30|Liberar 30 dias|setDays\(/);
 assert.match(c,/!active&&<a href=/);
 assert.match(c,/!access&&<a className=/);
 assert.match(source('src/components/BotControl.tsx'),/href="\/como-usar-bot"/);
 assert.match(source('src/app/page.tsx'),/href="\/como-usar-bot"/);
 assert.match(source('src/middleware.ts'),/p==='\/como-usar-bot'/);
 const guide=source('src/app/como-usar-bot/page.tsx');
 assert.match(guide,/Parar bot/);
 assert.match(guide,/Stop bot/);
 assert.match(guide,/IQ Option/);
 assert.match(guide,/Exnova/);
});
test('database grant uses existing paid orders, never creates free access for email alone',()=>{
 const sql=source('migrations/20261021_sentinel_one_time_paid_access.sql');
 assert.match(sql,/sentinel_app\.kiwify_prepaid_orders/);
 assert.match(sql,/o\.state='paid'/);
 assert.match(sql,/v_paid_count>0/);
 assert.match(sql,/agent_enabled=true/);
 assert.match(sql,/a\.status='active'/);
 assert.match(sql,/access_expires_at=null/);
 assert.match(sql,/create or replace function sentinel_app\.agent_access_active/);
});
