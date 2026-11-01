import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\\0'.replace('\\0','\0')).update(s).digest('hex');
// Exact 216 Git blob hashes: fail if anything outside the authorized button changes.
const FILES={
 'sentinel-trading-lab/agent/src/core/runtime.mjs':'264d58db1782bd203512a388289c493df2c40d8f',
 'sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs':'2ea7af14e969b684665ccbc8804f7afde31ce316',
 'sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs':'4beaac679a3912842a4d6a28e93c6481e3cc7f1e',
 'sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs':'be2aa95874922b94564400979aad4dedd1d61485',
 'sentinel-trading-lab/agent/worker/broker-ui-executor.mjs':'94eb4277dcd870376102f0cd7b05653b3e592e30',
 'sentinel-trading-lab/agent/worker/broker-trade-stake.mjs':'49854273542e6c2c6e76fbb506309dae92d6cfb0'
};
test('218: every analytic decision, price, expiry and broker click module byte-identical to 216',()=>{
 for(const [path,sha] of Object.entries(FILES))assert.equal(blob(get(path)),sha,path);
});
test('218: original 216 SignalExecutor code unchanged after removing only account/Invest additions',()=>{
 let s=get('sentinel-trading-lab/agent/worker/signal-executor.mjs')
  .replace('this.accountInvestSyncPending=false;','')
  .replace("  if(this.accountInvestSyncPending)throw Error('Sincronização de conta/Invest em andamento.');\n",'')
  .replace(',brokerMode:c.brokerMode??null','')
  .replace(',brokerMode:context.brokerMode??null','')
  .replace(/ \/\/ 218 BEGIN USER INVEST\/ACCOUNT RESYNCHRONIZATION\.[\s\S]*? \/\/ 218 END USER INVEST\/ACCOUNT RESYNCHRONIZATION\.\n/,'')
  .replace('  if(this.accountInvestSyncPending)return;\n','')
  .replace('  if(this.accountInvestSyncPending)return;\n','');
 assert.equal(blob(s),'314f146d33ac60186dcd4c7f3bb69b33a9738d74');
});
test('218: worker preserves all original 216 commands, including native expiry',()=>{
 let s=get('sentinel-trading-lab/agent/worker/index.mjs')
  .replace('brokerMode:st?.mode||null,','')
  .replace(/ \/\/ 218 BEGIN USER INVEST\/ACCOUNT BUTTON \(no CALL\/PUT\)\.[\s\S]*? \/\/ 218 END USER INVEST\/ACCOUNT BUTTON\.\n/,'');
 assert.equal(blob(s),'a376e187ae5d8456ca7500439317727fc9afb861');
});
test('218: remote executor dispatch changes only one explicitly authorized command',()=>{
 const s=get('sentinel-trading-lab/agent/worker/executor-remote.mjs')
  .replace(",'/executor/sync-invest':'executor-sync-invest'",'');
 assert.equal(blob(s),'f8b2c9934420b6312b5ea7223e09d8c6058d99aa');
});
test('218: bot card changes only with one new button and its callback',()=>{
 const s=get('sentinel-trading-lab/src/components/BotControl.tsx')
  .replace("if(action!=='stop'&&action!=='invest')","if(action!=='stop')")
  .replace(/   if\(action==='invest'\)\{[\s\S]*?\n   \}\n   else if\(action==='start'\)/,"   if(action==='start')")
  .split('\n').filter(line=>!line.includes("run('invest')")).join('\n');
 assert.equal(blob(s),'2ad942a59ee1955b00c426c1a89acd2282530d5e');
});
