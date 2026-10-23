import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');
test('Prepaid BR 170 and international 35 without changing Kiwify URLs',()=>{
 const c=source('src/lib/commercial.ts');
 assert.match(c,/amount:170,currency:'BRL',billing:'prepaid_30_days'/);
 assert.match(c,/amount:35,currency:'USD',billing:'prepaid_30_days'/);
 assert.ok(c.includes('pay.kiwify.com.br/SQku9Rd'));
 assert.ok(c.includes('pay.kiwify.com/VNHYsjX'));
});
test('Customer-facing copy states 30 days for each confirmed purchase',()=>{
 assert.ok(source('src/app/page.tsx').includes('30 dias por compra'));
 assert.ok(source('src/app/termos/page.tsx').includes('30 dias de acesso'));
 assert.ok(source('src/app/console/page.tsx').includes('Cada compra aprovada libera 30 dias'));
});
test('Customer license and bot links remain available',()=>{
 assert.ok(source('src/app/console/page.tsx').includes("key:'Membership',label:'Licença'"));
 assert.ok(source('src/components/BotControl.tsx').includes('href="/como-usar-bot"'));
});
test('Approval activates limited, expiring license',()=>{
 const sql=source('migrations/20261023_sentinel_restore_30d_access.sql');
 assert.ok(sql.includes("o.state='paid'"));
 assert.ok(sql.includes("interval '30 days'"));
 assert.ok(sql.includes("a.access_expires_at>now()"));
});
