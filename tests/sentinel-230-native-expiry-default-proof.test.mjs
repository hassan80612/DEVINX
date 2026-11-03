import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {trustedExpiryChoice230,proveExplicitNativeDefault230} from
 '../sentinel-trading-lab/agent/worker/native-expiry-choice-proof-230.mjs';
const t=Date.now();
test('230: unselected browser 30s after refresh is NEVER a new manual selection',()=>{
 for(const choice of [
  {value:30000,selectedAt:0,explicitDefault:false},
  {value:30000,selectedAt:t,explicitDefault:false},
  {value:30000,selectedAt:0,explicitDefault:true},
  {value:30000,selectedAt:0,explicitDefault:false,source:'agent'},
 ])assert.equal(trustedExpiryChoice230(choice),false,JSON.stringify(choice));
 assert.equal(proveExplicitNativeDefault230({value:30000,source:'agent',selectedAt:0}),false);
 assert.equal(proveExplicitNativeDefault230({value:30000,source:'agent',selectedAt:t}),true);
 assert.equal(proveExplicitNativeDefault230({value:30000,source:'manual'}),true);
});
test('230: deliberate 30s remains available; 1m and 5m valid regardless display refresh',()=>{
 for(const value of [60000,300000])assert.equal(trustedExpiryChoice230({value,selectedAt:0}),true);
 assert.equal(trustedExpiryChoice230({value:30000,selectedAt:t,explicitDefault:true}),true);
 assert.equal(trustedExpiryChoice230({value:30000,selectedAt:t,explicitDefault:false}),false);
});
test('230: keeper and Node reconciliation both enforce honest user-choice proof',()=>{
 const base=new URL('../sentinel-trading-lab/agent/worker/',import.meta.url);
 const keeper=readFileSync(new URL('broker-native-expiry-keeper.mjs',base),'utf8');
 const driver=readFileSync(new URL('local-playwright-driver.mjs',base),'utf8');
 assert.match(keeper,/source==='agent'&&at>0/);
 assert.match(driver,/choices.filter\(trustedExpiryChoice230\)/);
 assert.match(driver,/const best=trustedChoices\[0\]/);
});
