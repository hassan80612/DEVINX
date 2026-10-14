import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
function access({age=0,active=true,state='running'}={}){
 const now=Date.now(),relay={info:{paired:true,accessActive:active,lastContactAt:now-age}};
 const runtime={stateName:state,pauses:0,starts:0,async pause(){this.pauses++;this.stateName='paused'},async start(){this.starts++;this.stateName='running'},requestImmediateEvaluation(){}};
 const context={remoteRelay:relay,runtime,Date:{now:()=>now}};
 vm.createContext(context);
 vm.runInContext(code.slice(code.indexOf('const ACCESS_LEASE_GRACE_MS='),code.indexOf('async function loadState'))+';globalThis.enforce=enforceAccessLease;',context);
 return {runtime,relay,enforce:context.enforce};
}
test('a brief relay outage keeps an already authorized running analysis alive',async()=>{
 const x=access({age:120000});assert.equal(await x.enforce(),true);assert.equal(x.runtime.stateName,'running');assert.equal(x.runtime.pauses,0);
});
test('confirmed access denial pauses immediately and restores only its own paused run',async()=>{
 const x=access({age:1000,active:false});assert.equal(await x.enforce(),false);assert.equal(x.runtime.stateName,'paused');
 x.relay.info.accessActive=true;assert.equal(await x.enforce(),true);assert.equal(x.runtime.stateName,'running');assert.equal(x.runtime.starts,1);
});
test('expired lease still pauses; a manual stop while offline cannot restart itself',async()=>{
 const x=access({age:181000});assert.equal(await x.enforce(),false);assert.equal(x.runtime.stateName,'paused');
 x.runtime.stateName='stopped';x.relay.info.lastContactAt=Date.now();assert.equal(await x.enforce(),true);assert.equal(x.runtime.stateName,'stopped');assert.equal(x.runtime.starts,0);
});
