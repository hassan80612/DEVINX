import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldRecoverBrokerHistory as recover} from '../sentinel-trading-lab/agent/worker/broker-history-recovery-budget.mjs';
const base={activeId:42,symbol:'EUR/USD OTC',candleCount:22,now:200000,lastRequest:{activeId:42,symbol:'EUR/USD OTC',at:195000},stale:true,streamingHealthy:false};
test('incomplete same-asset history does not re-query every 2.5 seconds',()=>{
 assert.equal(recover(base),false);
 assert.equal(recover({...base,now:197500}),false);
 assert.equal(recover({...base,now:206999}),false);
 assert.equal(recover({...base,now:207000}),true);
});
test('genuine selected-asset switch can recover immediately',()=>{
 assert.equal(recover({...base,activeId:99}),true);
 assert.equal(recover({...base,symbol:'GBP/USD OTC'}),true);
 assert.equal(recover({...base,lastRequest:null}),true);
});
test('healthy history never triggers background recovery',()=>{
 assert.equal(recover({...base,candleCount:200,stale:false,streamingHealthy:true}),false);
});
test('genuine stale but complete history still has 12 second budget',()=>{
 const ready={...base,candleCount:100,stale:true,streamingHealthy:false};
 assert.equal(recover(ready),false);
 assert.equal(recover({...ready,now:207001}),true);
});
test('clock rollback does not indefinitely stall the market',()=>{
 assert.equal(recover({...base,now:194000}),true);
});
test('only passive broker driver changes; analyst, bot and browser selection remain independent',()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const src=readFileSync(new URL('agent/worker/local-playwright-driver.mjs',root),'utf8');
 assert.match(src,/shouldRecoverBrokerHistory\(\{/);
 assert.doesNotMatch(src,/if\(st\.mode==='demo'\)await this\.recoverMarket\(provider\)/);
 assert.match(src,/st\.quote==null&&st\.symbol&&!fast&&st\.activeId==null/);
 const p=JSON.parse(readFileSync(new URL('agent/release.json',root),'utf8'));
 assert.equal(p.version,'13.9.146');
});
